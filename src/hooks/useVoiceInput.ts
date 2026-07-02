/**
 * useVoiceInput — live, accurate, continuous speech-to-text for Echo.
 *
 * Built on expo-speech-recognition (Apple SFSpeechRecognizer / Android Google STT). Words appear
 * live as you speak (`liveTranscript`); the final transcript is delivered via `onResult` exactly
 * once, after the session ends. The transcript lands in an EDITABLE field — confirmation-first,
 * never auto-sent.
 *
 * Design (final — validated against the library + on-device-only device behaviour):
 *  - ACCURATE: `contextualStrings` biases the recognizer toward the user's real vocabulary; locale is
 *    resolved against what the device actually has INSTALLED (never a hardcoded `ms-MY` that has no
 *    model — that was the cause of the permanent "no-speech" loop on phones without a network recognizer).
 *  - RELIABLE: a two-config self-heal. The PRIMARY attempt is permissive (network recognition where
 *    available). If it engages but produces nothing — the failure mode on on-device-only phones
 *    (e.g. Xiaomi/HyperOS with only `com.google.android.as`) — we retry ONCE on a FALLBACK config that
 *    pins the on-device service, forces on-device recognition, uses an installed locale, drops biasing
 *    and prefers offline. Once a device proves it needs the fallback, later sessions start there
 *    directly (no primary delay). A genuine "voice isn't set up on this phone" case surfaces as a
 *    distinct, actionable `'setup'` error instead of a misleading "didn't catch that".
 *  - COMPLETE: iOS holds one continuous session; Android's recognizer is single-utterance, so we
 *    AUTO-RESTART it on `end` and ACCUMULATE finalized utterances — long dictation isn't cut off.
 *  - ROBUST: a per-session token + commit-once guard make delivery exactly-once across restarts,
 *    self-heal, background, unmount, double-tap, and iOS interruptions.
 *
 * Requires a native build (expo-speech-recognition is a native module; not in Expo Go).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform, AppState } from 'react-native';
import { deleteAsync } from 'expo-file-system/legacy';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  RecognizerIntentEnableLanguageSwitch,
  type ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';
// Live streaming STT provider = Gemini Live (free; reuses the app's existing Gemini key via an ephemeral
// token). The client is provider-agnostic behind openLiveStream/LiveStream — swapping providers is a
// one-line import change (sonioxStream.ts is kept as an alternative implementation of the same contract).
import { openGeminiLiveStream as openLiveStream, type LiveStream } from '../services/geminiLiveStream';
import { isLiveAudioAvailable, startLiveAudio, type LiveAudioSource } from '../services/liveAudioSource';
import { isSttTokenConfigured } from '../services/sttToken';

// 'quota' is unused by on-device recognition but kept so consumers that branch on it
// (e.g. NoteEditor's paywall check) still type-check.
// 'setup' = the recognizer never engaged even after the on-device fallback → config/device, not the user.
export type VoiceErrorKind =
  | 'permission'
  | 'no-speech'
  | 'network'
  | 'unavailable'
  | 'setup'
  | 'quota'
  | 'generic';

export interface VoiceError {
  kind: VoiceErrorKind;
}

export interface UseVoiceInputOptions {
  /** Final transcript, delivered once on session end (manual stop OR auto-end). */
  onResult?: (text: string) => void;
  /** Recognition locale preference. Resolved against installed/supported locales (never forced). */
  lang?: string;
  /**
   * Biasing vocabulary (≤100 short names) the recognizer prefers — merchants, wallets, categories,
   * money words. Best-effort: never gate UX on it. Sent ONLY on the on-device fallback config (where
   * Android honors biasing); deliberately dropped on the permissive primary so the user's financial
   * vocabulary never leaves the device to a network recognizer.
   */
  contextualStrings?: string[];
  /**
   * Bump this (e.g. after the user installs the Malay voice model) to make the hook re-probe installed
   * locales on the next session — so a freshly-installed model is used without an app restart.
   */
  localesEpoch?: number;
  /**
   * Injected server transcription (MoneyChat → aiService.transcribeAudio). Reads the persisted clip at
   * `uri` and returns the transcript, or null. Its PRESENCE is what enables audio capture — if omitted,
   * NO audio is ever written (other consumers stay unaffected).
   */
  transcribeAudio?: (uri: string, mimeType: string, onPartial?: (text: string) => void) => Promise<string | null>;
  /** Live partial-transcript sink — fills the editable composer word-by-word as the server streams. */
  onPartial?: (text: string) => void;
  /** Route this session through server transcription (e.g. app language = Malay AND ms-MY not installed). */
  preferServer?: boolean;
  /**
   * Route this session through TRUE streaming STT (Soniox: words appear as you speak). Highest priority,
   * but only engaged when the native capture module is present AND the stt-token endpoint is configured;
   * otherwise the hook silently falls through to `preferServer` / on-device. If the socket fails to open
   * mid-session it degrades to the server (clip→Gemini) path — never a dead mic.
   */
  preferStreaming?: boolean;
}

interface UseVoiceInputReturn {
  isRecording: boolean;
  /** True while the server is transcribing the captured clip (server / rescue path only). */
  isTranscribing: boolean;
  /** This session is using server transcription (drives the listening UX). */
  serverMode: boolean;
  /** This session is using true streaming STT — the live caption is ACCURATE as you speak. */
  streaming: boolean;
  /** Normalized live amplitude 0..1 for the calm meter. 0 when idle/silent. */
  metering: number;
  /** Live caption — the words as the recognizer hears them (interim, may revise). */
  liveTranscript: string;
  error: VoiceError | null;
  startRecording: () => Promise<void>;
  /** Stop early; the final transcript still delivers via onResult. */
  stopAndTranscribe: () => void;
  /** Discard — no result delivered. */
  cancelRecording: () => void;
}

const isAndroid = Platform.OS === 'android';
const SERVER_AUDIO_MIME = 'audio/wav'; // expo-speech-recognition persists WAV on both platforms
const MAX_EMPTY_RESTARTS = 3; // consecutive silent restarts before we give up (battery/loop guard)
const RESTART_DELAY_MS = 180; // let the native recognizer tear down before re-start() (avoid ERROR_RECOGNIZER_BUSY)
const STREAM_FLUSH_TIMEOUT_MS = 5000; // after a manual stop, give Soniox this long (re-armed on each final) to flush
const ON_DEVICE_PKG = 'com.google.android.as'; // Android System Intelligence (on-device recognition)
const LOCALE_PROBE_TIMEOUT_MS = 2000; // getSupportedLocales has been observed to HANG — must race a timeout
const VOICE_DEBUG = __DEV__; // logs capability/error diagnostics to Metro on dev builds

// Errors that retrying / self-heal cannot fix — stop immediately instead of spinning.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'bad-grammar']);

// One-shot, per app run: try to install the Malay model for future sessions (non-blocking).
let modelDownloadTriggered = false;

const EN_INSTALLED = (lc: string[]) =>
  ['en-my', 'en-sg', 'en-gb', 'en-us'].some((e) => lc.includes(e)) || lc.some((l) => l.startsWith('en'));

/** Manglish code-switch needs BOTH ms-MY and an en-* model installed AND Android 14+ (API 34) — else
 *  the recognizer reports a switch failure. Gated so it stays inert until ms-MY actually lands. */
function manglishSwitchReady(installed: string[]): boolean {
  if (!isAndroid || (Platform.Version as number) < 34) return false;
  const lc = installed.map((l) => l.toLowerCase());
  return lc.includes('ms-my') && EN_INSTALLED(lc);
}

function mapErrorKind(code: string | undefined): VoiceErrorKind {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission';
    case 'no-speech':
    case 'speech-timeout':
      return 'no-speech';
    case 'network':
      return 'network';
    case 'language-not-supported':
    case 'language-unavailable':
      return 'unavailable';
    default:
      return 'generic';
  }
}

/** Race a promise against a hard timeout — getSupportedLocales can hang on some devices. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((res) => setTimeout(() => res(null), ms)),
  ]);
}

/** On-device (AS) installed locales — the authoritative "this model is actually downloaded" list. */
async function probeInstalledLocales(): Promise<string[]> {
  const res = await withTimeout(
    ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: ON_DEVICE_PKG }),
    LOCALE_PROBE_TIMEOUT_MS,
  );
  return res?.installedLocales ?? [];
}

/** Best INSTALLED locale for the on-device fallback. undefined → omit lang (recognizer's own default). */
function pickFallbackLocale(installed: string[]): string | undefined {
  if (!installed.length) return undefined;
  const lc = installed.map((l) => l.toLowerCase());
  if (lc.includes('ms-my')) return installed[lc.indexOf('ms-my')];
  for (const cand of ['en-my', 'en-sg', 'en-gb', 'en-us']) {
    const idx = lc.indexOf(cand);
    if (idx !== -1) return installed[idx];
  }
  const anyEn = lc.findIndex((l) => l.startsWith('en'));
  if (anyEn !== -1) return installed[anyEn];
  return installed[0];
}

/**
 * Resolve the PRIMARY lang.
 *  - iOS: probe `locales`, fall ms-MY → en-MY/SG/GB/US, else en-US (never undefined — iOS needs a lang).
 *  - Android: prefer an INSTALLED locale, else a SUPPORTED one, else undefined (omit → recognizer default).
 *    NEVER force `ms-MY` back — a locale with no on-device model is what caused the permanent no-speech.
 */
async function resolvePrimaryLang(preferred: string): Promise<string | undefined> {
  const probe = await withTimeout(ExpoSpeechRecognitionModule.getSupportedLocales({}), LOCALE_PROBE_TIMEOUT_MS);
  const locales = probe?.locales ?? [];
  const installed = probe?.installedLocales ?? [];
  const order = [preferred, 'ms-MY', 'en-MY', 'en-SG', 'en-GB', 'en-US'];
  const findIn = (pool: string[]) => order.find((l) => pool.some((s) => s.toLowerCase() === l.toLowerCase()));

  if (Platform.OS === 'ios') return findIn(locales) ?? 'en-US';
  return findIn(installed) ?? findIn(locales) ?? undefined;
}

/**
 * Non-blocking: install the Malay model for next time. Never awaited (can open a dialog / hang). When
 * the model actually lands (`download_success`), `onInstalled` lets the hook invalidate its locale
 * caches so the NEXT tap picks up ms-MY — without an app restart.
 */
function maybeTriggerModelDownload(installed: string[] | null, onInstalled?: () => void) {
  if (!isAndroid || modelDownloadTriggered) return;
  if (installed && installed.some((l) => l.toLowerCase() === 'ms-my')) return; // already have it
  modelDownloadTriggered = true;
  try {
    void ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: 'ms-MY' })
      .then((r) => {
        if (r?.status === 'download_success') onInstalled?.();
        else modelDownloadTriggered = false; // canceled/no-op → let a later session retry the install
      })
      .catch(() => {
        modelDownloadTriggered = false; // failed → let a later session retry
      });
  } catch {
    modelDownloadTriggered = false;
  }
}

/** One-shot capability dump on dev builds — reveals the exact device profile if voice still fails. */
async function logVoiceDiag(tag: string) {
  if (!VOICE_DEBUG) return;
  const M = ExpoSpeechRecognitionModule;
  let sync: Record<string, unknown> = {};
  try {
    sync = {
      services: M.getSpeechRecognitionServices?.(),
      defaultService: M.getDefaultRecognitionService?.(),
      supportsOnDevice: M.supportsOnDeviceRecognition?.(),
      recognitionAvailable: M.isRecognitionAvailable?.(),
    };
  } catch (e) {
    sync = { syncError: String(e) };
  }
  const def = await withTimeout(M.getSupportedLocales({}), LOCALE_PROBE_TIMEOUT_MS);
  const onDevice = await withTimeout(
    M.getSupportedLocales({ androidRecognitionServicePackage: ON_DEVICE_PKG }),
    LOCALE_PROBE_TIMEOUT_MS,
  );
  // eslint-disable-next-line no-console
  console.log(`[voice-diag ${tag}]`, JSON.stringify({ ...sync, defaultLocales: def, onDeviceLocales: onDevice }, null, 2));
}

export function useVoiceInput(opts?: UseVoiceInputOptions): UseVoiceInputReturn {
  // ── Render state ──────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false); // server transcription in flight
  const [serverMode, setServerMode] = useState(false); // mirrors serverModeRef so the UI re-renders
  const [streaming, setStreaming] = useState(false); // mirrors streamingRef (true streaming STT session)
  const [liveTranscript, setLiveTranscript] = useState('');
  const [metering, setMetering] = useState(0);
  const [error, setError] = useState<VoiceError | null>(null);

  // ── Control refs (native callbacks read current values — no stale closures) ─
  const onResultRef = useRef(opts?.onResult);
  onResultRef.current = opts?.onResult;
  const contextualStringsRef = useRef(opts?.contextualStrings);
  contextualStringsRef.current = opts?.contextualStrings;
  const transcribeAudioRef = useRef(opts?.transcribeAudio);
  transcribeAudioRef.current = opts?.transcribeAudio;
  const onPartialRef = useRef(opts?.onPartial);
  onPartialRef.current = opts?.onPartial;
  const preferServerRef = useRef(opts?.preferServer);
  preferServerRef.current = opts?.preferServer;
  const preferStreamingRef = useRef(opts?.preferStreaming);
  preferStreamingRef.current = opts?.preferStreaming;
  const serverModeRef = useRef(false); // decided per session in startRecording
  const capturedAudioUriRef = useRef<string | null>(null); // persisted clip uri (server path)
  // Streaming (Soniox) session state
  const streamingRef = useRef(false); // this session runs the Soniox stream (not the SR module)
  const streamRef = useRef<LiveStream | null>(null); // the open Soniox socket wrapper
  const audioSourceRef = useRef<LiveAudioSource | null>(null); // the live PCM capture handle
  const streamFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // flush-timeout guard

  // resolvedLangRef: wrapper null = "not probed yet"; { lang: undefined } = "probed, omit lang".
  const resolvedLangRef = useRef<{ lang: string | undefined } | null>(null);
  const installedLocalesRef = useRef<string[] | null>(null); // on-device installed locales (probed once)
  const committedTextRef = useRef(''); // sum of finalized utterances (Android accumulation)
  const interimRef = useRef(''); // current volatile partial
  const cancelledRef = useRef(false); // user discarded → deliver nothing
  const manualStopRef = useRef(false); // user stopped / backgrounded → true end (no restart)
  const hasCommittedRef = useRef(false); // commit-once guard
  const restartCountRef = useRef(0); // consecutive EMPTY restarts (loop cap)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(0); // bumped per startRecording; late events from old sessions are ignored
  const phaseRef = useRef<'idle' | 'starting' | 'recognizing'>('idle');
  const mountedRef = useRef(true);

  // Self-heal / signal-tracking refs
  const configRef = useRef<'primary' | 'fallback'>('primary');
  const usedFallbackRef = useRef(false); // fallback fires at most once per startRecording
  const stickyFallbackRef = useRef(false); // once a device needs fallback, start there next time
  const sawAnyResultRef = useRef(false); // any result (interim or final) with text this attempt
  const sawSpeechStartRef = useRef(false); // 'speechstart' fired this attempt
  const sawAudibleVolumeRef = useRef(false); // a volumechange with value > 0 this attempt
  const sawNomatchRef = useRef(false); // 'nomatch' fired this attempt
  const sawAnySignalEverRef = useRef(false); // OR'd across BOTH attempts → drives final error kind
  const fatalErrorRef = useRef(false); // a non-retryable error occurred → stop, don't retry
  const lastErrorKindRef = useRef<VoiceErrorKind | null>(null); // surfaced once at true end (not mid-retry)
  const localesEpochRef = useRef(opts?.localesEpoch);
  localesEpochRef.current = opts?.localesEpoch;
  const lastAppliedEpochRef = useRef(opts?.localesEpoch); // detect a model-install epoch bump → re-probe
  const pendingReprobeRef = useRef(false); // a model installed mid-session → re-probe at the NEXT start (not mid-session)

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const clearStreamFinishTimer = () => {
    if (streamFinishTimerRef.current) {
      clearTimeout(streamFinishTimerRef.current);
      streamFinishTimerRef.current = null;
    }
  };

  // Tear down the live capture + Soniox socket. abort=true → hard close (no finals); false → flush finals
  // (onClosed then delivers). Idempotent; safe to call when nothing is streaming.
  const teardownStream = (abort: boolean) => {
    clearStreamFinishTimer();
    const src = audioSourceRef.current;
    audioSourceRef.current = null;
    if (src) void src.stop();
    const s = streamRef.current;
    if (s) {
      if (abort) {
        s.abort();
        streamRef.current = null;
      } else {
        s.finish();
      }
    }
  };

  // Watchdog: the streaming socket stalled after a manual stop (no finals arriving) → hard-finalize so the
  // listening UI never hangs. Re-armed on each new final (in onText) so a slow flush isn't cut off early.
  const fireStreamFlush = () => {
    streamFinishTimerRef.current = null;
    if (!streamingRef.current) return;
    streamRef.current?.abort();
    streamRef.current = null;
    streamingRef.current = false;
    setStreaming(false);
    phaseRef.current = 'idle';
    setIsRecording(false);
    setMetering(0);
    commitOnce();
    finalizeSession();
  };

  // Per-attempt signal probes — reset on every (re)start so producedNothing reflects THIS attempt only.
  const resetPerAttemptProbes = () => {
    sawNomatchRef.current = false;
    sawSpeechStartRef.current = false;
    sawAudibleVolumeRef.current = false;
  };

  // Drop cached locale resolution so the next session re-probes installed locales (and re-resolves lang).
  const invalidateLocaleCaches = () => {
    installedLocalesRef.current = null;
    resolvedLangRef.current = null;
    stickyFallbackRef.current = false;
  };

  // iOS partials/finals are CUMULATIVE for the single session → never concatenate (would duplicate).
  // Android restarts per utterance → accumulate finalized text + the current interim.
  const composeLive = () => {
    if (isAndroid) {
      const c = committedTextRef.current.trim();
      const i = interimRef.current.trim();
      return c && i ? `${c} ${i}` : c || i;
    }
    return interimRef.current.trim() || committedTextRef.current.trim();
  };

  const finalizeSession = () => {
    committedTextRef.current = '';
    interimRef.current = '';
    setLiveTranscript('');
  };

  // Delete a captured clip from disk and drop the ref. The hook owns the clip on every terminal path
  // EXCEPT a successful server transcription (aiService.transcribeAudio deletes it in its finally, then
  // nulls our ref). Idempotent + fire-and-forget so it never throws into a native callback.
  const discardCapturedClip = () => {
    const uri = capturedAudioUriRef.current;
    capturedAudioUriRef.current = null;
    if (uri) deleteAsync(uri, { idempotent: true }).catch(() => {});
  };

  const commitOnce = () => {
    if (hasCommittedRef.current) return; // double-commit guard
    hasCommittedRef.current = true;
    if (cancelledRef.current) return; // discarded → nothing
    const text = composeLive().trim();
    if (text) {
      onResultRef.current?.(text);
      return;
    }
    // No text — pick the most honest error (only set here, at the true end → no mid-retry flicker).
    const hard = lastErrorKindRef.current;
    if (hard && hard !== 'no-speech') {
      setError({ kind: hard }); // network / unavailable / permission / generic
    } else if (isAndroid && usedFallbackRef.current && sawAnySignalEverRef.current && !sawAnyResultRef.current) {
      // The mic HEARD audio (sawAnySignalEver) and we already tried the on-device fallback, yet got no
      // transcript → a genuine model/setup problem, not "you were silent". Drop the cached probes +
      // stickiness so the next tap re-reads installed locales and gives the primary recognizer a fresh
      // chance — e.g. right after the user installs the voice model — without needing an app restart.
      setError({ kind: 'setup' });
      installedLocalesRef.current = null;
      resolvedLangRef.current = null;
      stickyFallbackRef.current = false;
    } else {
      setError({ kind: 'no-speech' }); // mic engaged but heard nothing, or the user was silent
    }
  };

  // Transcribe the captured clip on the server, then deliver via the SAME exactly-once path. Used by
  // server mode and the on-device rescue. Re-checks staleness AFTER the await (cancel/unmount/new session).
  const deliverViaServer = async (session: number) => {
    const uri = capturedAudioUriRef.current;
    const fn = transcribeAudioRef.current;
    if (!uri || !fn) {
      commitOnce();
      finalizeSession();
      return;
    }
    setIsTranscribing(true);
    let text: string | null = null;
    try {
      // Pass onPartial → the transcript streams word-by-word into the composer (a live "types in" reveal).
      text = await fn(uri, SERVER_AUDIO_MIME, onPartialRef.current);
    } catch {
      lastErrorKindRef.current = 'network';
    }
    capturedAudioUriRef.current = null; // aiService deletes the file; just drop our ref
    // Superseded / cancelled / unmounted during the await → drop silently, deliver nothing.
    if (session !== sessionIdRef.current || cancelledRef.current || !mountedRef.current) {
      if (mountedRef.current) setIsTranscribing(false);
      return;
    }
    if (text && text.trim()) {
      committedTextRef.current = text.trim(); // funnel through the exactly-once commit path
    } else if (!lastErrorKindRef.current) {
      lastErrorKindRef.current = 'no-speech';
    }
    setIsTranscribing(false);
    commitOnce();
    finalizeSession();
  };

  // Built fresh each (re)start so every restart is byte-identical PER CONFIG.
  const buildStartOptions = useCallback((): ExpoSpeechRecognitionOptions => {
    // ── SERVER (Malay fallback): capture ONE contiguous clip + suppress the live caption (nothing to
    //    re-write), single segment (no per-utterance restart fragmenting the clip). The on-device
    //    recognizer's own text is discarded; the clip goes to the server for accurate Malay. ──
    if (serverModeRef.current) {
      return {
        ...(resolvedLangRef.current?.lang ? { lang: resolvedLangRef.current.lang } : {}),
        interimResults: false, // the English on-device interim is wrong-language garbage for Malay — don't show it
        continuous: true, // one segment — don't let scheduleRestart fragment the clip
        addsPunctuation: false,
        recordingOptions: { persist: true }, // emits audioend.uri (the clip we transcribe)
        volumeChangeEventOptions: { enabled: true, intervalMillis: 300 }, // keep the calm meter alive
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
          EXTRA_MASK_OFFENSIVE_WORDS: false,
        },
      };
    }

    // ── FALLBACK (Android self-heal): pin on-device service, force on-device, installed locale, WITH
    //    biasing (on-device is the one place Android honors it), no risky silence extras, prefer offline. ──
    if (isAndroid && configRef.current === 'fallback') {
      const installed = installedLocalesRef.current ?? [];
      const switchOn = manglishSwitchReady(installed);
      // With Manglish switching live, start in Malay (en code-switches handled by the switch); else the
      // best installed locale (ms-MY first when present — the lever for accurate Malay).
      const fbLang = switchOn ? 'ms-MY' : pickFallbackLocale(installed);
      return {
        ...(fbLang ? { lang: fbLang } : {}), // omit → recognizer uses its own default installed model
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: true,
        androidRecognitionServicePackage: ON_DEVICE_PKG,
        addsPunctuation: false,
        contextualStrings: contextualStringsRef.current, // on-device is the one place Android biasing works
        volumeChangeEventOptions: { enabled: true, intervalMillis: 300 },
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
          EXTRA_PREFER_OFFLINE: true,
          EXTRA_MASK_OFFENSIVE_WORDS: false, // never star-out a mis-flagged Malay word
          ...(switchOn
            ? {
                EXTRA_ENABLE_LANGUAGE_SWITCH: RecognizerIntentEnableLanguageSwitch.LANGUAGE_SWITCH_BALANCED,
                EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES: ['ms-MY', 'en-US'],
                EXTRA_ENABLE_LANGUAGE_DETECTION: true,
                EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES: ['ms-MY', 'en-US'],
              }
            : {}),
        },
      };
    }

    // ── PRIMARY: permissive (lets normal devices use their network recognizer). The risky
    //    EXTRA_SPEECH_INPUT_* extras are REMOVED; lang is omitted when no installed/supported match. ──
    const primaryLang = resolvedLangRef.current?.lang; // string | undefined — NEVER hardcoded ms-MY
    return {
      ...(primaryLang ? { lang: primaryLang } : {}),
      interimResults: true,
      continuous: Platform.OS === 'ios', // iOS holds the session; Android restarts per utterance
      addsPunctuation: false,
      iosTaskHint: 'dictation',
      // NOTE: no contextualStrings here. The permissive primary may use a NETWORK recognizer, and
      // biasing only takes effect on-device anyway — so we keep the user's merchant/wallet names off the
      // network and only bias the on-device fallback (above).
      volumeChangeEventOptions: { enabled: true, intervalMillis: 300 },
      androidIntentOptions: {
        EXTRA_LANGUAGE_MODEL: 'free_form',
        EXTRA_ENABLE_BIASING_DEVICE_CONTEXT: true, // inert on most recognizers; harmless
        EXTRA_MASK_OFFENSIVE_WORDS: false, // never star-out a mis-flagged Malay word
      },
    };
  }, []);

  // Run a TRUE streaming STT session (Soniox): open the socket, then pump live mic PCM into it. The live
  // caption is ACCURATE as you speak (committed + interim). openLiveStream resolves only once the socket
  // is genuinely OPEN (else null), so any open failure degrades to the clip→Gemini path — never a dead mic.
  // After open, onClosed is the single finalizer, guaranteed to fire on every termination (sonioxStream
  // force-closes on any error). Permission is already granted by the caller.
  const startSonioxSession = async (session: number) => {
    setStreaming(true);
    phaseRef.current = 'recognizing';
    setIsRecording(true);

    const superseded = () => session !== sessionIdRef.current; // a newer session now owns the UI/refs
    const aborted = () => cancelledRef.current || manualStopRef.current || !mountedRef.current;

    // Finalize THIS session cleanly (commit what we have, drop to idle). Used when we stop/abort before the
    // socket's own onClosed can deliver. Identity-guarded so it never clobbers a newer session's refs.
    const finalizeHere = (s: LiveStream | null, src: LiveAudioSource | null) => {
      if (src) void src.stop();
      if (audioSourceRef.current === src) audioSourceRef.current = null;
      if (s) s.abort();
      if (streamRef.current === s) streamRef.current = null;
      streamingRef.current = false;
      setStreaming(false);
      clearStreamFinishTimer();
      phaseRef.current = 'idle';
      setIsRecording(false);
      setMetering(0);
      commitOnce();
      finalizeSession();
    };

    // Degrade to server (clip→Gemini, accurate Malay) when a transcriber is available, else FORCE on-device
    // (never the network primary — that would send audio to a network recognizer with no clip path). Only
    // valid before audio capture begins; refuses to touch a superseded session.
    const degrade = (s: LiveStream | null) => {
      if (s) s.abort();
      if (streamRef.current === s) streamRef.current = null;
      streamingRef.current = false;
      setStreaming(false);
      committedTextRef.current = ''; // defense-in-depth: never leak streaming text into the SR fallback
      interimRef.current = '';
      setLiveTranscript('');
      if (superseded()) return; // newer session owns its own lifecycle — don't commit/start anything
      if (aborted()) {
        phaseRef.current = 'idle';
        setIsRecording(false);
        commitOnce();
        finalizeSession();
        return;
      }
      const canServer = !!transcribeAudioRef.current;
      if (VOICE_DEBUG) {
        // eslint-disable-next-line no-console
        console.log('[voice-diag degrade]', { to: canServer ? 'server-clip→Gemini' : 'on-device-fallback' });
      }
      serverModeRef.current = canServer;
      setServerMode(canServer);
      if (!canServer) configRef.current = 'fallback'; // no clip path → on-device only, never network primary
      try {
        ExpoSpeechRecognitionModule.start(buildStartOptions());
      } catch {
        phaseRef.current = 'idle';
        setIsRecording(false);
        lastErrorKindRef.current = lastErrorKindRef.current ?? 'setup';
        commitOnce();
        finalizeSession();
      }
    };

    let stream: LiveStream | null = null;
    try {
      stream = await openLiveStream({
        onText: (committed, interim) => {
          if (superseded() || !streamingRef.current) return;
          committedTextRef.current = committed;
          interimRef.current = interim;
          const live = (committed + (committed && interim ? ' ' : '') + interim).trim();
          setLiveTranscript(live);
          onPartialRef.current?.(live); // word-by-word into the editable composer (never auto-sent)
          if (committed || interim) {
            sawAnyResultRef.current = true;
            sawAnySignalEverRef.current = true;
          }
          // Flushing after a manual stop → re-arm the watchdog on each new final so a slow flush isn't cut.
          if (manualStopRef.current && streamFinishTimerRef.current) {
            clearStreamFinishTimer();
            streamFinishTimerRef.current = setTimeout(fireStreamFlush, STREAM_FLUSH_TIMEOUT_MS);
          }
        },
        // Quick-capture is usually one utterance — keep accumulating across <end> markers (confirmation-first).
        onUtteranceEnd: undefined,
        onError: (kind) => {
          if (superseded()) return;
          // Record the kind; sonioxStream force-closes on any error, so onClosed does the actual finalize.
          lastErrorKindRef.current = kind === 'auth' ? 'setup' : 'network';
        },
        onClosed: () => {
          // Only the legitimate finalizer runs: bail if superseded, already torn down, or unmounted.
          if (superseded() || !streamingRef.current || !mountedRef.current) return;
          clearStreamFinishTimer();
          void audioSourceRef.current?.stop();
          audioSourceRef.current = null;
          if (streamRef.current === stream) streamRef.current = null;
          streamingRef.current = false;
          setStreaming(false);
          phaseRef.current = 'idle';
          setIsRecording(false);
          setMetering(0);
          commitOnce();
          finalizeSession();
        },
      });
    } catch {
      stream = null;
    }

    // Open failed (token / handshake / timeout) → degrade to the accurate clip→Gemini path.
    if (!stream) {
      degrade(null);
      return;
    }
    // Superseded during the open await → a newer session owns the UI; just drop this socket.
    if (superseded()) {
      stream.abort();
      return;
    }
    // Stopped / cancelled / unmounted during the open await → finalize now (no audio was sent, so the
    // socket's own onClosed may never arrive on its own).
    if (aborted()) {
      finalizeHere(stream, null);
      return;
    }
    streamRef.current = stream;

    // Start the mic; each base64 PCM16 chunk → the socket as a text frame. Capture failure → degrade.
    const src = await startLiveAudio((b64) => streamRef.current?.pushAudioBase64(b64), 120);
    if (superseded()) {
      if (src) void src.stop();
      stream.abort();
      if (streamRef.current === stream) streamRef.current = null;
      return;
    }
    if (aborted()) {
      finalizeHere(stream, src);
      return;
    }
    if (!src) {
      degrade(stream);
      return;
    }
    audioSourceRef.current = src;
  };

  // The SINGLE start() site for restarts (continuous AND self-heal) — guards against double-start.
  const scheduleRestart = () => {
    restartCountRef.current += 1;
    const session = sessionIdRef.current;
    clearRestartTimer();
    phaseRef.current = 'starting';
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (session !== sessionIdRef.current) return; // superseded by a newer session
      if (cancelledRef.current || manualStopRef.current || !mountedRef.current) {
        phaseRef.current = 'idle';
        setIsRecording(false);
        commitOnce();
        finalizeSession();
        return;
      }
      try {
        ExpoSpeechRecognitionModule.start(buildStartOptions());
      } catch {
        phaseRef.current = 'idle';
        setIsRecording(false);
        commitOnce();
        finalizeSession();
      }
    }, RESTART_DELAY_MS);
  };

  // ── Native events ───────────────────────────────────────────────────────────
  useSpeechRecognitionEvent('start', () => {
    phaseRef.current = 'recognizing';
    setIsRecording(true);
  });

  useSpeechRecognitionEvent('speechstart', () => {
    sawSpeechStartRef.current = true;
    sawAnySignalEverRef.current = true;
  });

  useSpeechRecognitionEvent('nomatch', () => {
    sawNomatchRef.current = true;
  });

  // Persisted clip uri — only emitted when recordingOptions.persist is set (server mode). If the session
  // was already cancelled / unmounted, delete the just-written clip immediately instead of keeping it.
  useSpeechRecognitionEvent('audioend', (event) => {
    if (!event?.uri) return;
    if (cancelledRef.current || !mountedRef.current) {
      deleteAsync(event.uri, { idempotent: true }).catch(() => {});
      return;
    }
    capturedAudioUriRef.current = event.uri;
  });

  useSpeechRecognitionEvent('result', (event) => {
    const seg = event?.results?.[0]?.transcript ?? '';
    if (serverModeRef.current) {
      // Server mode: the on-device recognizer's text is the WRONG language (English model on Malay
      // speech = "saya"→"say you"). Never display it — Gemini transcribes the clip accurately on stop.
      if (seg.trim()) sawAnySignalEverRef.current = true;
      return;
    }
    if (event?.isFinal) {
      const s = seg.trim();
      if (s) {
        if (isAndroid) {
          committedTextRef.current = committedTextRef.current ? `${committedTextRef.current} ${s}` : s;
        } else {
          committedTextRef.current = s; // iOS final is cumulative for the session
        }
        restartCountRef.current = 0; // real speech → reset the loop guard
        sawAnyResultRef.current = true;
        sawAnySignalEverRef.current = true;
        lastErrorKindRef.current = null; // a real result supersedes any earlier transient error
        // Evidence-based stickiness: a FALLBACK success proves this device needs on-device → start there
        // next time; a PRIMARY success proves it doesn't → recover. So a one-off silent tap never
        // permanently degrades a healthy device.
        if (isAndroid) stickyFallbackRef.current = configRef.current === 'fallback';
      }
      interimRef.current = '';
    } else {
      if (seg.trim()) {
        sawAnyResultRef.current = true; // recognizer is producing output → not "produced nothing"
        sawAnySignalEverRef.current = true;
      }
      interimRef.current = seg; // volatile partial for the live caption
    }
    setLiveTranscript(composeLive());
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    const v = event?.value ?? -2; // library emits -2..10; -2 is the silence floor
    setMetering(Math.max(0, Math.min(1, (v + 2) / 12)));
    if (v > 0) {
      sawAudibleVolumeRef.current = true; // the mic actually captured audible audio
      sawAnySignalEverRef.current = true;
    }
  });

  // 'end' is ALWAYS the last event (fires after errors too) — the ONLY restart/self-heal/commit point.
  useSpeechRecognitionEvent('end', () => {
    setMetering(0);

    // The PRIMARY attempt yielded no text. We can't tell "broken locale/model" from "user was silent"
    // on the first try, so we retry ONCE on the on-device fallback (cheap + bounded). This guarantees a
    // device that needs on-device gets fixed even if primary fails before any audio. The retry is
    // harmless on a healthy device — and crucially, stickiness is set only on a FALLBACK SUCCESS (in the
    // result handler), so a silent tap never permanently degrades a good device.
    const producedNothing =
      !sawAnyResultRef.current &&
      (sawNomatchRef.current ||
        sawSpeechStartRef.current ||
        sawAudibleVolumeRef.current ||
        configRef.current === 'primary');

    // (1) SELF-HEAL → switch to the on-device fallback and retry ONCE. Gated so it can't loop.
    // (Never in server mode — that's a single captured segment going to the server, not on-device retries.)
    const canSelfHeal =
      isAndroid &&
      !serverModeRef.current &&
      !cancelledRef.current &&
      !manualStopRef.current &&
      !fatalErrorRef.current &&
      mountedRef.current &&
      !usedFallbackRef.current &&
      producedNothing;

    if (canSelfHeal) {
      usedFallbackRef.current = true;
      configRef.current = 'fallback'; // stickiness is set later, only if the fallback actually succeeds
      restartCountRef.current = 0; // fresh budget for the fallback config
      interimRef.current = '';
      resetPerAttemptProbes(); // keep sawAnySignalEverRef (OR'd across attempts)
      // Install the Malay model for accurate Malay capture. When it lands, re-probe at the NEXT session
      // start (deferred, not mid-session — keeps this session's fallback restarts byte-identical) so the
      // next tap uses ms-MY without an app restart.
      maybeTriggerModelDownload(installedLocalesRef.current, () => {
        pendingReprobeRef.current = true;
      });
      scheduleRestart();
      return;
    }

    // (2) Normal Android continuous restart (recognizer is producing words, or within budget).
    const shouldRestart =
      isAndroid &&
      !serverModeRef.current &&
      !cancelledRef.current &&
      !manualStopRef.current &&
      !fatalErrorRef.current &&
      mountedRef.current &&
      restartCountRef.current < MAX_EMPTY_RESTARTS;

    if (shouldRestart) {
      interimRef.current = '';
      resetPerAttemptProbes();
      scheduleRestart();
      return;
    }

    // (3) True end → commit once, finalize.
    if (VOICE_DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[voice-diag verdict]', {
        config: configRef.current,
        usedFallback: usedFallbackRef.current,
        sawSignal: sawAnySignalEverRef.current,
        committed: composeLive().trim().length > 0,
        lastError: lastErrorKindRef.current,
      });
    }
    phaseRef.current = 'idle';
    setIsRecording(false);

    // Server mode → transcribe the captured clip on the server (delivers via commitOnce, exactly-once).
    if (serverModeRef.current && !cancelledRef.current && capturedAudioUriRef.current && transcribeAudioRef.current) {
      void deliverViaServer(sessionIdRef.current);
      return;
    }

    // Server mode but NO clip persisted (abort/OEM quirk) = a capture/setup failure, NOT silence —
    // map to 'setup' so we don't mislead with "didn't catch that" and we offer the cloud path.
    if (serverModeRef.current && !cancelledRef.current && !capturedAudioUriRef.current && !lastErrorKindRef.current) {
      lastErrorKindRef.current = 'setup';
    }

    discardCapturedClip(); // safety: delete any captured clip not handed to the server (no orphan on disk)
    commitOnce();
    finalizeSession();
  });

  useSpeechRecognitionEvent('error', (event) => {
    const e = event?.error;
    if (VOICE_DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[voice-diag error]', { error: e, message: event?.message, code: (event as { code?: number })?.code });
    }
    if (e === 'aborted' || cancelledRef.current) return; // our own abort()
    // Silence-class errors during the Android retry/self-heal loop are expected — 'end' drives the retry.
    if (isAndroid && !manualStopRef.current && (e === 'no-speech' || e === 'speech-timeout')) return;
    if (e && FATAL_ERRORS.has(e)) fatalErrorRef.current = true; // don't retry the unfixable
    // Record the kind; commitOnce surfaces it once at the true end (a later success clears it).
    lastErrorKindRef.current = mapErrorKind(e);
  });

  // ── Public methods ──────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    // New session — reset EVERYTHING here (never at 'end', so a late 'end' can't bleed in).
    setError(null);
    committedTextRef.current = '';
    interimRef.current = '';
    cancelledRef.current = false;
    manualStopRef.current = false;
    hasCommittedRef.current = false;
    restartCountRef.current = 0;
    clearRestartTimer();
    setLiveTranscript('');
    sessionIdRef.current += 1;
    phaseRef.current = 'starting';

    // A model install (epoch bump from the Settings/Echo download) or a deferred mid-session install →
    // re-probe installed locales this session so a freshly-installed model is used without an app
    // restart. Must run BEFORE startFallback is derived from stickyFallbackRef (invalidate clears it).
    if (pendingReprobeRef.current || localesEpochRef.current !== lastAppliedEpochRef.current) {
      pendingReprobeRef.current = false;
      lastAppliedEpochRef.current = localesEpochRef.current;
      invalidateLocaleCaches();
    }

    // Self-heal / signal resets. A device that already proved it needs on-device starts in fallback.
    const startFallback = isAndroid && stickyFallbackRef.current;
    configRef.current = startFallback ? 'fallback' : 'primary';
    usedFallbackRef.current = startFallback;
    sawAnyResultRef.current = false;
    sawAnySignalEverRef.current = false;
    fatalErrorRef.current = false;
    lastErrorKindRef.current = null;
    resetPerAttemptProbes();

    // Decide this session's path: streaming (true live words) > server (clip→Gemini) > on-device.
    discardCapturedClip(); // purge any leftover clip from a prior session
    setIsTranscribing(false);
    if (streamRef.current || audioSourceRef.current) teardownStream(true); // abort any lingering stream
    clearStreamFinishTimer();
    const useStreaming =
      isAndroid &&
      !!preferStreamingRef.current &&
      !!transcribeAudioRef.current && // guarantees degrade() always has the clip→Gemini fallback
      isLiveAudioAvailable() &&
      isSttTokenConfigured();
    streamingRef.current = useStreaming;
    setStreaming(useStreaming);
    const useServer = !useStreaming && isAndroid && !!preferServerRef.current && !!transcribeAudioRef.current;
    serverModeRef.current = useServer; // refs drive the native handlers/options
    setServerMode(useServer); // state drives the UI (a ref alone never re-renders)
    if (VOICE_DEBUG) {
      // Which path THIS tap takes + why — the single most useful line when "voice didn't work".
      // eslint-disable-next-line no-console
      console.log('[voice-diag path]', {
        useStreaming,
        useServer,
        preferStreaming: !!preferStreamingRef.current,
        preferServer: !!preferServerRef.current,
        hasTranscribe: !!transcribeAudioRef.current,
        liveAudioAvailable: isLiveAudioAvailable(),
        sttConfigured: isSttTokenConfigured(),
      });
    }

    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm?.granted) {
        phaseRef.current = 'idle';
        setError({ kind: 'permission' });
        return;
      }
      // STREAMING path: run Soniox directly — no SR module, no locale probe, no availability gate.
      if (useStreaming) {
        if (cancelledRef.current || manualStopRef.current || !mountedRef.current) {
          phaseRef.current = 'idle';
          setIsRecording(false);
          setStreaming(false);
          streamingRef.current = false;
          hasCommittedRef.current = true; // block any late delivery
          finalizeSession();
          return;
        }
        await startSonioxSession(sessionIdRef.current);
        return;
      }
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        phaseRef.current = 'idle';
        setError({ kind: 'unavailable' });
        return;
      }
      if (VOICE_DEBUG) void logVoiceDiag('start'); // fire-and-forget; never awaited
      if (isAndroid && installedLocalesRef.current === null) {
        installedLocalesRef.current = await probeInstalledLocales(); // 2s-guarded
      }
      if (resolvedLangRef.current === null) {
        resolvedLangRef.current = { lang: await resolvePrimaryLang(opts?.lang ?? 'ms-MY') };
      }
      // The user may have cancelled / stopped / unmounted during the async permission + probe gap
      // (e.g. a quick press-in/press-out tap). Don't start a recognizer after the press was released —
      // that would leak the mic. Nothing was captured, so finalize silently (no delivery, no error).
      if (cancelledRef.current || manualStopRef.current || !mountedRef.current) {
        phaseRef.current = 'idle';
        setIsRecording(false);
        hasCommittedRef.current = true; // block any late delivery
        finalizeSession();
        return;
      }
      ExpoSpeechRecognitionModule.start(buildStartOptions());
    } catch (err) {
      phaseRef.current = 'idle';
      if (__DEV__) console.warn('[useVoiceInput] start failed:', err);
      setError({ kind: 'generic' });
    }
  }, [opts?.lang, buildStartOptions]);

  const stopAndTranscribe = useCallback(() => {
    manualStopRef.current = true; // first manual stop = true end → commit, no restart
    if (streamingRef.current) {
      // Flush finals: stop the mic, send the end frame; onClosed delivers via commitOnce. The watchdog
      // (re-armed on each arriving final) hard-finalizes if the socket stalls, so the UI never hangs.
      const src = audioSourceRef.current;
      audioSourceRef.current = null;
      if (src) void src.stop();
      streamRef.current?.finish();
      clearStreamFinishTimer();
      streamFinishTimerRef.current = setTimeout(fireStreamFlush, STREAM_FLUSH_TIMEOUT_MS);
      return;
    }
    if (restartTimerRef.current !== null) {
      // Stopped DURING the Android restart gap — no live session will emit 'end'. Finalize here.
      clearRestartTimer();
      phaseRef.current = 'idle';
      setIsRecording(false);
      setMetering(0);
      commitOnce();
      finalizeSession();
      return;
    }
    try {
      if (serverModeRef.current) {
        // Server mode: ALWAYS stop() so the persisted clip is flushed (abort() drops it with a null uri).
        ExpoSpeechRecognitionModule.stop();
      } else if (phaseRef.current === 'starting') {
        ExpoSpeechRecognitionModule.abort(); // on-device: stop() while 'starting' can leak the mic
      } else if (phaseRef.current === 'recognizing') {
        ExpoSpeechRecognitionModule.stop();
      }
    } catch {
      // not running — nothing to stop
    }
  }, []);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    manualStopRef.current = true;
    clearRestartTimer();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // ignore
    }
    phaseRef.current = 'idle';
    setIsRecording(false);
    setMetering(0);
    setLiveTranscript('');
    committedTextRef.current = '';
    interimRef.current = '';
    teardownStream(true); // stop mic + hard-close the socket; never deliver a cancelled streaming session
    streamingRef.current = false;
    setStreaming(false);
    discardCapturedClip(); // delete any captured clip — never transcribe or keep a cancelled session
    setIsTranscribing(false);
    // hasCommittedRef stays false; the trailing 'end' (if any) short-circuits on cancelledRef.
  }, []);

  // ── Lifecycle guards ──────────────────────────────────────────────────────
  // Background → stop the mic (privacy + battery). Cover both an active session AND the Android
  // restart gap (a pending restart timer would otherwise re-open the mic in the background). Skip the
  // permission-sheet 'starting' phase (no pending timer) so we don't kill a legitimate start. What was
  // heard so far is preserved to the composer — never auto-sent (confirmation-first).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') return;
      // Streaming: stop the mic + socket on background (privacy/battery + no foreground-service). Keep the
      // words heard so far in the composer — never auto-send (confirmation-first).
      if (streamingRef.current) {
        manualStopRef.current = true;
        teardownStream(true);
        streamingRef.current = false;
        setStreaming(false);
        phaseRef.current = 'idle';
        setIsRecording(false);
        setMetering(0);
        commitOnce();
        finalizeSession();
        return;
      }
      const inRestartGap = restartTimerRef.current !== null;
      if (phaseRef.current !== 'recognizing' && !inRestartGap) return;
      manualStopRef.current = true;
      if (serverModeRef.current) cancelledRef.current = true; // never upload a half clip after the user leaves
      clearRestartTimer();
      if (inRestartGap) {
        // No live session will emit 'end' — finalize here.
        phaseRef.current = 'idle';
        setIsRecording(false);
        setMetering(0);
        commitOnce();
        finalizeSession();
      } else {
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch {
          // ignore
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Unmount → hard abort, no delivery.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      manualStopRef.current = true;
      teardownStream(true); // stop mic + abort socket; never deliver after unmount
      discardCapturedClip(); // delete any captured clip; never transcribe after unmount
      clearRestartTimer();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    isRecording,
    isTranscribing,
    serverMode,
    streaming,
    metering,
    liveTranscript,
    error,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
  };
}
