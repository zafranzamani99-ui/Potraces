/**
 * Hook for voice input — HYBRID live speech-to-text.
 *
 * On-device streaming recognition (expo-speech-recognition → Apple SFSpeechRecognizer /
 * Android SpeechRecognizer) drives the LIVE interim caption (`liveTranscript`) as the user
 * speaks. On stop, the persisted recording is sent to Gemini 2.0 Flash for the accurate
 * FINAL transcript (best for Manglish / code-switching). If Gemini is unavailable, offline,
 * or over quota, we fall back to the on-device final transcript so voice still works.
 *
 * Confirmation-first: callers put the returned text into an EDITABLE field — never auto-send.
 * Requires a native build (expo-speech-recognition is a native module; not available in Expo Go).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { AppState } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { File as ExpoFile } from 'expo-file-system';
import { usePremiumStore } from '../store/premiumStore';
import { callGeminiAPI, isGeminiAvailable } from '../services/geminiClient';

export type VoiceErrorKind = 'permission' | 'no-speech' | 'network' | 'quota' | 'generic';
export interface VoiceError {
  kind: VoiceErrorKind;
}

interface UseVoiceInputReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  /** Normalized live amplitude 0..1 for the calm bar. 0 when idle/silent. */
  metering: number;
  /** Live interim caption — the words as the recognizer hears them (best-effort, may revise). */
  liveTranscript: string;
  error: VoiceError | null;
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  /** Discard the in-progress recording — no Gemini call, no quota spend. */
  cancelRecording: () => void;
}

const TRANSCRIBE_PROMPT =
  'Transcribe this audio. The speaker may use Malay, English, or Manglish (mixed). ' +
  'Return ONLY the transcription text, nothing else. If you cannot hear anything, return an empty string.';

// expo-speech-recognition volumechange `value` is roughly -2..10 → 0..1 for the calm bar.
function normalizeMetering(v: number | undefined | null): number {
  if (v == null || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, (v + 2) / 12));
}

function mapErrorKind(code: string | undefined): VoiceErrorKind {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission';
    case 'no-speech':
      return 'no-speech';
    case 'network':
      return 'network';
    default:
      return 'generic';
  }
}

function mimeForUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mp3';
  if (lower.endsWith('.aac') || lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  return 'audio/mp4';
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [metering, setMetering] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);

  const isRecordingRef = useRef(false);
  const startInFlightRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const finalTranscriptRef = useRef<string | null>(null);
  const liveTranscriptRef = useRef('');
  const recordingUriRef = useRef<string | null>(null);
  const stopResolverRef = useRef<(() => void) | null>(null);
  const localeRef = useRef<{ lang: string; onDevice: boolean } | null>(null);
  // True only while THIS hook instance owns an active recognition session.
  // expo-speech-recognition events are a global singleton, so without this gate a
  // second mounted useVoiceInput (e.g. a backgrounded tab) would react to a session
  // it never started.
  const activeRef = useRef(false);
  // True while THIS instance is between stop() and finalize — lets a trailing 'audioend'
  // (recording uri) be captured even after 'end' has cleared activeRef.
  const finalizingRef = useRef(false);

  const resolveStop = useCallback(() => {
    const resolve = stopResolverRef.current;
    stopResolverRef.current = null;
    if (resolve) resolve();
  }, []);

  // ── Recognizer events (gated to THIS instance's own session via activeRef) ──
  useSpeechRecognitionEvent('start', () => {
    if (!activeRef.current) return;
    startInFlightRef.current = false;
    isRecordingRef.current = true;
    setIsRecording(true);
    // A stop/cancel arrived before recognition actually started (quick tap): abort cleanly.
    if (cancelRequestedRef.current) {
      cancelRequestedRef.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current) return;
    const transcript = event?.results?.[0]?.transcript ?? '';
    liveTranscriptRef.current = transcript;
    setLiveTranscript(transcript);
    if (event?.isFinal && transcript.trim()) finalTranscriptRef.current = transcript;
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    if (!activeRef.current) return;
    setMetering(normalizeMetering(event?.value));
  });

  useSpeechRecognitionEvent('audioend', (event) => {
    if (!activeRef.current && !finalizingRef.current) return;
    if (event?.uri) recordingUriRef.current = event.uri;
  });

  useSpeechRecognitionEvent('end', () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    isRecordingRef.current = false;
    setIsRecording(false);
    setMetering(0);
    resolveStop();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    isRecordingRef.current = false;
    startInFlightRef.current = false;
    setIsRecording(false);
    setMetering(0);
    // 'aborted' is our own cancel — not a user-facing error.
    if (event?.error !== 'aborted') setError({ kind: mapErrorKind(event?.error) });
    resolveStop();
  });

  // Resolve the locale once: prefer ms-MY, then en-MY, then any English; on-device if installed.
  const resolveLocale = useCallback(async () => {
    if (localeRef.current) return localeRef.current;
    let lang = 'en-US';
    let onDevice = false;
    try {
      const support = await ExpoSpeechRecognitionModule.getSupportedLocales({
        androidRecognitionServicePackage: 'com.google.android.as',
      });
      const installed = support?.installedLocales ?? [];
      const all = support?.locales ?? [];
      const has = (code: string) => installed.includes(code) || all.includes(code);
      if (has('ms-MY')) lang = 'ms-MY';
      else if (has('en-MY')) lang = 'en-MY';
      else {
        const en = [...installed, ...all].find((l) => l.startsWith('en'));
        lang = en ?? 'en-US';
      }
      onDevice = installed.includes(lang);
    } catch {
      // getSupportedLocales unsupported on this device — let the OS pick, use network recognition.
    }
    localeRef.current = { lang, onDevice };
    return localeRef.current;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    finalTranscriptRef.current = null;
    recordingUriRef.current = null;

    startInFlightRef.current = true;
    cancelRequestedRef.current = false;

    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm?.granted) {
        startInFlightRef.current = false;
        setError({ kind: 'permission' });
        return;
      }
      if (cancelRequestedRef.current) {
        startInFlightRef.current = false;
        cancelRequestedRef.current = false;
        return;
      }

      const { lang, onDevice } = await resolveLocale();
      if (cancelRequestedRef.current) {
        startInFlightRef.current = false;
        cancelRequestedRef.current = false;
        return;
      }

      // Live interim captions on-device; persist the audio for the accurate Gemini final pass.
      activeRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: onDevice,
        recordingOptions: { persist: true },
      });
      // isRecording flips true on the 'start' event.
    } catch (err) {
      if (__DEV__) console.warn('[useVoiceInput] start failed:', err);
      startInFlightRef.current = false;
      setError({ kind: 'generic' });
    }
  }, [resolveLocale]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    // Stop pressed before start finished (quick tap) — abort the in-flight start; nothing to transcribe.
    if (startInFlightRef.current) {
      cancelRequestedRef.current = true;
      return null;
    }
    if (!isRecordingRef.current) return null;

    setIsTranscribing(true);
    setMetering(0);
    finalizingRef.current = true;

    // Stop recognition and wait for 'end'/'error' to flush the final transcript + recording uri.
    await new Promise<void>((resolve) => {
      stopResolverRef.current = resolve;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        stopResolverRef.current = null;
        resolve();
      }
      // Safety: never hang if no terminal event arrives.
      setTimeout(() => {
        if (stopResolverRef.current) {
          stopResolverRef.current = null;
          resolve();
        }
      }, 6000);
    });

    // 'audioend' (carrying the recording uri) can trail 'end' on some platforms — brief grace so the
    // Gemini final pass still gets the recording instead of silently falling back to on-device text.
    if (!recordingUriRef.current) {
      await new Promise<void>((r) => setTimeout(r, 600));
    }

    const onDeviceFinal =
      (finalTranscriptRef.current ?? liveTranscriptRef.current ?? '').trim() || null;

    try {
      const uri = recordingUriRef.current;
      // Hybrid: prefer Gemini's accurate (Manglish) transcript from the persisted recording.
      if (uri && isGeminiAvailable() && usePremiumStore.getState().canUseAI()) {
        const file = new ExpoFile(uri);
        if (file.exists && (file.size ?? 0) > 0) {
          const base64Audio = await file.base64();
          const data = await callGeminiAPI({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: TRANSCRIBE_PROMPT },
                  { inlineData: { mimeType: mimeForUri(uri), data: base64Audio } },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
          });
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            usePremiumStore.getState().incrementAiCalls();
            return text;
          }
        }
      }

      // Fallback: the on-device final (works offline / when AI is unavailable or over quota).
      if (onDeviceFinal) return onDeviceFinal;
      setError({ kind: 'no-speech' });
      return null;
    } catch (err) {
      if (__DEV__) console.warn('[useVoiceInput] finalize failed:', err);
      if (onDeviceFinal) return onDeviceFinal;
      setError({ kind: 'network' });
      return null;
    } finally {
      finalizingRef.current = false;
      setIsTranscribing(false);
      setLiveTranscript('');
      liveTranscriptRef.current = '';
    }
  }, []);

  const cancelRecording = useCallback(() => {
    // If start is still in flight, mark it so the 'start' event aborts cleanly (no hot mic).
    if (startInFlightRef.current) {
      cancelRequestedRef.current = true;
      return;
    }
    if (!isRecordingRef.current) return;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // ignore
    }
    activeRef.current = false;
    isRecordingRef.current = false;
    setIsRecording(false);
    setMetering(0);
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    // Intentionally no transcription and no quota spend.
  }, []);

  // Cleanup on unmount — abort only if actually recording.
  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          // ignore
        }
        activeRef.current = false;
        isRecordingRef.current = false;
      }
    };
  }, []);

  // Silently discard if the app is backgrounded mid-recording (backgrounding isn't an error).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        if (startInFlightRef.current) cancelRequestedRef.current = true;
        if (isRecordingRef.current) {
          try {
            ExpoSpeechRecognitionModule.abort();
          } catch {
            // ignore
          }
          activeRef.current = false;
          isRecordingRef.current = false;
          setIsRecording(false);
          setMetering(0);
          setLiveTranscript('');
          liveTranscriptRef.current = '';
        }
      }
    });
    return () => sub.remove();
  }, []);

  return {
    isRecording,
    isTranscribing,
    metering,
    liveTranscript,
    error,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
  };
}
