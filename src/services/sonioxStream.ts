// sonioxStream.ts — RAW WebSocket client for Soniox real-time STT. NO SDK dependency (React Native has
// WebSocket built in), so this file is always active and never affects the build.
//
// Contract (verified against soniox.com/docs, 2026-06):
//  - Connect to wss://stt-rt.soniox.com/transcribe-websocket (unauthenticated socket).
//  - FIRST message = one JSON text frame carrying the temp api_key + config (model stt-rt-v5, raw PCM16
//    16k mono, language_hints ['ms','en'] for Manglish code-switch).
//  - Then stream audio. We send each PCM chunk as a base64 TEXT frame — NOT binary: RN's
//    WebSocket.send(ArrayBuffer) is broken (facebook/react-native#26488) and Soniox accepts base64 text.
//    The capture layer (@siteed/expo-audio-studio) already emits base64, so this is a zero-decode passthrough.
//  - End of audio = one empty frame (''). Server flushes finals, sends { finished:true }, then closes.
//  - Each server message: { tokens:[{text,is_final,language,...}], ... }. Assembly: append is_final tokens
//    to `committed` (sent once, never change); rebuild `interim` from the non-final tokens each message.
//    Filter the marker tokens '<end>' (utterance pause) and '<fin>' (manual flush) out of visible text.
//  - Errors arrive as { error_type, error_code, error_message } then close — branch on the stable error_type.

import { fetchSttToken } from './sttToken';

const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';
const END_MARKERS = new Set(['<end>', '<fin>']);

export type SonioxErrorKind = 'auth' | 'network' | 'server';

export interface SonioxCallbacks {
  /** Live caption sink: committed (final-so-far) + interim (volatile). Display = committed + interim. */
  onText: (committed: string, interim: string) => void;
  /** Fired on an '<end>' marker (natural utterance pause). Quick-capture keeps accumulating — no auto-commit. */
  onUtteranceEnd?: (committed: string) => void;
  onError: (kind: SonioxErrorKind, detail?: string) => void;
  /** Socket fully closed (after finish() flush, server close, or abort). Always the last callback. */
  onClosed?: () => void;
}

export interface SonioxStream {
  /** Forward one base64-encoded PCM16 chunk (from the capture layer) as a TEXT frame. */
  pushAudioBase64: (b64: string) => void;
  /** Signal end-of-audio (empty frame) so the server flushes finals, then closes. */
  finish: () => void;
  /** Hard close now — no finals delivered. */
  abort: () => void;
}

interface SonioxToken {
  text: string;
  is_final?: boolean;
  language?: string;
  confidence?: number;
}
interface SonioxMessage {
  tokens?: SonioxToken[];
  finished?: boolean;
  error_type?: string;
  error_code?: number;
  error_message?: string;
}

/**
 * Open a Soniox streaming session. Mints a short-lived temp key via the stt-token edge function (the real
 * Soniox key never reaches the device). Returns null if no token / socket can't be created — the caller
 * then degrades to the Stage-1 clip→Gemini path (never a dead mic).
 */
const OPEN_TIMEOUT_MS = 8000; // socket must open within this, else degrade

export async function openSonioxStream(cb: SonioxCallbacks): Promise<SonioxStream | null> {
  const tok = await fetchSttToken('soniox');
  if (!tok?.token) {
    cb.onError('auth', 'no token');
    return null;
  }

  let ws: WebSocket;
  try {
    ws = new WebSocket(SONIOX_WS_URL);
  } catch {
    cb.onError('network', 'socket create failed');
    return null;
  }

  // Resolve the promise ONLY once the socket is genuinely open (or null on any open failure/timeout) so
  // the caller's `if (!stream) degrade()` covers every open-time failure. After open, `onClosed` is the
  // single finalizer and is GUARANTEED to fire on every termination (we force-close on any error rather
  // than waiting on the server), so the hook can never hang with a live mic and a dead socket.
  return await new Promise<SonioxStream | null>((resolve) => {
    let committed = '';
    let closedByUs = false;
    let resolvedOpen = false;

    // Detach all handlers so a force-closed socket can never fire a late onclose/onerror into the caller
    // after we've already resolved(null). Makes openSonioxStream strictly single-signal in isolation —
    // its correctness no longer depends on the caller's streamingRef guard + event-loop ordering.
    const detach = () => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
    };

    const openTimer = setTimeout(() => {
      if (resolvedOpen) return;
      resolvedOpen = true;
      closedByUs = true;
      detach();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(null); // never opened → caller degrades to the clip→Gemini path
    }, OPEN_TIMEOUT_MS);

    const handle: SonioxStream = {
      pushAudioBase64: (b64: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(b64); // base64 TEXT frame
          } catch {
            /* dropped chunk — the next one (or finish) recovers */
          }
        }
      },
      finish: () => {
        closedByUs = true; // suppress a spurious onerror on the clean close; onClosed still finalizes
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(''); // empty frame = end-of-audio
          } catch {
            /* ignore */
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
      try {
        ws.send(
          JSON.stringify({
            api_key: tok.token,
            model: 'stt-rt-v5',
            audio_format: 'pcm_s16le',
            sample_rate: 16000,
            num_channels: 1,
            language_hints: ['ms', 'en'], // bias toward Manglish; does NOT restrict — code-switch stays automatic
            enable_language_identification: true,
            enable_endpoint_detection: true,
          }),
        );
      } catch {
        /* config send failed — onerror/onclose will follow and finalize */
      }
      if (!resolvedOpen) {
        resolvedOpen = true;
        clearTimeout(openTimer);
        resolve(handle);
      }
    };

    ws.onmessage = (ev) => {
      let msg: SonioxMessage;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.error_type) {
        cb.onError('server', msg.error_type); // stable string — never branch on error_message
        closedByUs = true;
        try {
          ws.close(); // force the close → onClosed finalizes (don't wait on the server to close)
        } catch {
          /* ignore */
        }
        return;
      }
      if (msg.finished) {
        cb.onText(committed.trim(), '');
        return; // onclose follows
      }
      let interim = '';
      let sawEnd = false;
      for (const t of msg.tokens ?? []) {
        if (!t?.text) continue;
        if (END_MARKERS.has(t.text)) {
          if (t.text === '<end>') sawEnd = true;
          continue; // never show marker tokens
        }
        if (t.is_final) committed += t.text;
        else interim += t.text;
      }
      cb.onText(committed.trim(), interim.trim());
      if (sawEnd) cb.onUtteranceEnd?.(committed.trim());
    };

    ws.onerror = () => {
      if (!resolvedOpen) {
        // Handshake failed before open → degrade (return null); never a terminal error here.
        resolvedOpen = true;
        clearTimeout(openTimer);
        closedByUs = true;
        detach(); // the scheduled onclose must not reach cb.onClosed after we resolve(null)
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
        resolvedOpen = true;
        clearTimeout(openTimer);
        resolve(null); // closed before ever opening → degrade
        return;
      }
      cb.onClosed?.();
    };
  });
}
