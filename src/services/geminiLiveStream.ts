// geminiLiveStream.ts — RAW WebSocket client for Google Gemini Live API (BidiGenerateContent), used as the
// FREE live Malay STT. It reuses the user's EXISTING Gemini key: the stt-token edge fn mints a short-lived
// ephemeral token (the real key never ships in the bundle). Same provider-agnostic contract as the Soniox
// client, so it drops straight into the voice hook's streaming mode. No SDK — RN's built-in WebSocket only.
//
// Protocol (Gemini Live v1alpha, half-cascade gemini-live-2.5-flash for input transcription):
//  - Connect wss://…/BidiGenerateContentConstrained?access_token=<ephemeral token>.
//  - Send the SETUP frame (model + responseModalities:[TEXT] + inputAudioTranscription:{} + a Malay-biased
//    systemInstruction so it writes Malay, not Indonesian). WAIT for { setupComplete } — only THEN resolve
//    the handle (so the caller starts the mic exactly when the server is ready).
//  - Stream each base64 PCM16 16k mono chunk as { realtimeInput:{ audio:{ data, mimeType:'audio/pcm;rate=16000' }}}.
//    (base64 passthrough from @siteed — zero decode. JSON TEXT frames dodge RN's broken binary send.)
//  - The live transcript of the USER's speech arrives at serverContent.inputTranscription.text (append-style)
//    → accumulate into `committed`; interim stays empty.
//  - Stop: send { realtimeInput:{ audioStreamEnd:true }} (NOT a close) so the server flushes the final
//    transcription; finalize promptly on the following turnComplete/generationComplete, watchdog as backstop.
//  - Any error → force-close so onClosed (the single finalizer) always fires; the hook then degrades.
//
// NOTE (preview API): the Live models + ephemeral-token endpoint are preview and can change with ~2 weeks
// notice. Field names below match the current docs; if Google shifts them, the hook degrades to the trusted
// Stage-1 clip→Gemini path (never a dead mic). A per-input language hint to further fight Indonesian drift
// can be added once its exact field is confirmed — the systemInstruction is the lever used here.

import { fetchSttToken } from './sttToken';

const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
const GEMINI_LIVE_MODEL = 'models/gemini-live-2.5-flash';
const OPEN_TIMEOUT_MS = 10000; // connect + setup handshake
const LIVE_DEBUG = __DEV__; // dev-only [live-diag …] logs — pinpoint where the live socket fails

const TRANSCRIBE_INSTRUCTION =
  'You are a speech-to-text transcriber for a MALAYSIAN user. Transcribe the audio VERBATIM in the ' +
  'language(s) actually spoken — Malay and/or English (Manglish), keeping each word in its spoken language. ' +
  'Use MALAY spelling (saya, awak, tak, nak, duit, ringgit) — NEVER Indonesian (kamu, nggak, uang). Keep ' +
  'digits and "RM" as spoken. Output ONLY the spoken words — do not answer, translate, summarize, or add anything.';

export type LiveErrorKind = 'auth' | 'network' | 'server';

export interface LiveStreamCallbacks {
  /** Live caption sink: committed (final-so-far) + interim (volatile; empty for Gemini append transcription). */
  onText: (committed: string, interim: string) => void;
  /** Fired on a turn boundary. Quick-capture keeps accumulating (no auto-commit). */
  onUtteranceEnd?: (committed: string) => void;
  onError: (kind: LiveErrorKind, detail?: string) => void;
  /** Socket fully closed — always the last callback. */
  onClosed?: () => void;
}

export interface LiveStream {
  /** Forward one base64-encoded PCM16 chunk to the socket. */
  pushAudioBase64: (b64: string) => void;
  /** Signal end-of-audio so the server flushes finals; finalize follows on turn-complete / close. */
  finish: () => void;
  /** Hard close now — no finals. */
  abort: () => void;
}

/**
 * Open a Gemini Live streaming session. Resolves the handle ONLY after setupComplete (or null on any open
 * failure / timeout), so the caller's `if (!stream) degrade()` covers every open-time failure and the mic
 * starts only when the server is ready. Returns null if no token / socket can't be created.
 */
export async function openGeminiLiveStream(cb: LiveStreamCallbacks): Promise<LiveStream | null> {
  const tok = await fetchSttToken('gemini');
  // eslint-disable-next-line no-console
  if (LIVE_DEBUG) console.log('[live-diag] token', tok?.token ? 'minted' : 'NULL (stt-token failed)');
  if (!tok?.token) {
    cb.onError('auth', 'no token');
    return null;
  }

  let ws: WebSocket;
  try {
    ws = new WebSocket(`${GEMINI_LIVE_URL}?access_token=${encodeURIComponent(tok.token)}`);
  } catch {
    cb.onError('network', 'socket create failed');
    return null;
  }

  return await new Promise<LiveStream | null>((resolve) => {
    let committed = '';
    let closedByUs = false;
    let resolvedOpen = false; // resolves on setupComplete, not just the raw socket open
    let finishing = false; // finish() sent audioStreamEnd → close on the next turn boundary

    const detach = () => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
    };

    const openTimer = setTimeout(() => {
      if (resolvedOpen) return;
      // eslint-disable-next-line no-console
      if (LIVE_DEBUG) console.log('[live-diag] open TIMEOUT — no setupComplete in 10s → degrade');
      resolvedOpen = true;
      closedByUs = true;
      detach();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(null); // never reached setupComplete → caller degrades to the clip→Gemini path
    }, OPEN_TIMEOUT_MS);

    const handle: LiveStream = {
      pushAudioBase64: (b64: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } }));
          } catch {
            /* dropped chunk — the next one (or finish) recovers */
          }
        }
      },
      finish: () => {
        finishing = true;
        closedByUs = true; // suppress a spurious onerror on the clean close; onClosed still finalizes
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
          } catch {
            /* ignore — the hook watchdog finalizes if no flush arrives */
          }
        }
      },
      abort: () => {
        closedByUs = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      },
    };

    ws.onopen = () => {
      // Send setup; do NOT resolve yet — wait for setupComplete so the mic starts only when ready.
      try {
        ws.send(
          JSON.stringify({
            setup: {
              model: GEMINI_LIVE_MODEL,
              generationConfig: { responseModalities: ['TEXT'] },
              inputAudioTranscription: {}, // turns on live ASR of the USER's mic (the transcript we read)
              systemInstruction: { parts: [{ text: TRANSCRIBE_INSTRUCTION }] },
            },
          }),
        );
      } catch {
        /* config send failed — onerror/onclose will follow and finalize */
      }
    };

    ws.onmessage = (ev) => {
      // Gemini Live frames are JSON text. (We requested TEXT-only, so no binary audio-out blobs to handle.)
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.setupComplete) {
        // eslint-disable-next-line no-console
        if (LIVE_DEBUG) console.log('[live-diag] setupComplete — socket ready, mic starting');
        if (!resolvedOpen) {
          resolvedOpen = true;
          clearTimeout(openTimer);
          resolve(handle);
        }
        return;
      }

      if (msg.error) {
        // eslint-disable-next-line no-console
        if (LIVE_DEBUG) console.log('[live-diag] server error', String(msg.error?.message ?? msg.error));
        cb.onError('server', String(msg.error?.message ?? msg.error));
        closedByUs = true;
        try {
          ws.close(); // force onClosed → the hook finalizes
        } catch {
          /* ignore */
        }
        return;
      }

      const sc = msg.serverContent;
      if (sc) {
        const t = sc.inputTranscription?.text;
        if (t) {
          // eslint-disable-next-line no-console
          if (LIVE_DEBUG && !committed) console.log('[live-diag] first transcription frame received');
          // Gemini sends inputTranscription as INCREMENTAL pieces → append. A/B CHECK on the dev build: if
          // captions duplicate/repeat, Gemini is sending CUMULATIVE text instead → change to `committed = t`.
          committed += t;
          cb.onText(committed.trim(), '');
        }
        if (sc.turnComplete || sc.generationComplete) {
          cb.onUtteranceEnd?.(committed.trim());
          // After we've signalled end-of-audio, the turn boundary means the flush is done → close promptly
          // (the watchdog is only the backstop). Mid-dictation boundaries (not finishing) are kept open.
          if (finishing) {
            closedByUs = true;
            try {
              ws.close();
            } catch {
              /* ignore */
            }
          }
        }
      }
    };

    ws.onerror = () => {
      if (!resolvedOpen) {
        // eslint-disable-next-line no-console
        if (LIVE_DEBUG) console.log('[live-diag] socket error BEFORE setupComplete (token/handshake) → degrade');
        // Failed before setupComplete → degrade (return null); never a terminal error here.
        resolvedOpen = true;
        clearTimeout(openTimer);
        closedByUs = true;
        detach();
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(null);
        return;
      }
      if (!closedByUs) {
        cb.onError('network');
        closedByUs = true;
        try {
          ws.close(); // force onClosed → the hook finalizes even on a half-open transport error
        } catch {
          /* ignore */
        }
      }
    };

    ws.onclose = () => {
      if (!resolvedOpen) {
        // eslint-disable-next-line no-console
        if (LIVE_DEBUG) console.log('[live-diag] socket CLOSED before setupComplete (rejected token?) → degrade');
        resolvedOpen = true;
        clearTimeout(openTimer);
        resolve(null); // closed before setupComplete → degrade
        return;
      }
      cb.onClosed?.();
    };
  });
}
