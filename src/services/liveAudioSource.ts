// liveAudioSource.ts — live 16kHz mono PCM16 capture, handed chunk-by-chunk to the live STT stream.
//
// Backed by @dr.pogodin/react-native-audio — a PLAIN React Native TurboModule that uses RN core's
// com.facebook.react.bridge.Promise (NOT expo-modules-core), so it is structurally immune to the SDK 54
// Promise.reject signature change that broke @siteed/audio-studio. New-Arch native (ships codegenConfig).
//
// Dormant-safe: the require is dynamic + try/catch, so on a build WITHOUT the native module linked (today's
// app, before the rebuild) the TurboModule getEnforcing throws → caught → null → isLiveAudioAvailable()
// false → the streaming path is never taken. (Also gated behind settingsStore `malayLiveStreaming`, off.)
//
// API (verified against the installed @dr.pogodin/react-native-audio@1.18.2 .d.ts):
//   new InputAudioStream(AUDIO_SOURCES.VOICE_RECOGNITION, 16000, CHANNEL_CONFIGS.MONO, AUDIO_FORMATS.PCM_16BIT,
//     samplingSize /* samples-per-channel per chunk; 1920 @16k = 120ms */, stopInBackground=false)
//   stream.addChunkListener((chunk: Buffer) => chunk.toString('base64'))  // base64 PCM16 → WS, zero decode
//   stream.addErrorListener((e) => …); await stream.start() /* Promise<boolean> */; await stream.stop()/destroy()

import { Platform } from 'react-native';

type Chunk = (base64Pcm: string) => void;

const SAMPLE_RATE = 16000;

// Dynamic require so a build without the linked native module never crashes (getEnforcing throws → caught).
function requireModule(): any {
  try {
    return require('@dr.pogodin/react-native-audio');
  } catch {
    return null;
  }
}

const mod: any = requireModule();

/** True only on a dev build that bundled + linked the native capture module (Android). Gates the whole path. */
export function isLiveAudioAvailable(): boolean {
  return Platform.OS === 'android' && !!mod && typeof mod.InputAudioStream === 'function';
}

export interface LiveAudioSource {
  stop: () => Promise<void>;
}

/**
 * Start 16kHz mono PCM16 capture; `onChunk` receives each base64-encoded PCM frame (~intervalMs apart) to
 * forward straight to the live STT socket. Returns null when the native module is absent (caller degrades).
 */
export async function startLiveAudio(onChunk: Chunk, intervalMs = 120): Promise<LiveAudioSource | null> {
  if (!isLiveAudioAvailable()) return null;
  const { InputAudioStream, AUDIO_SOURCES, CHANNEL_CONFIGS, AUDIO_FORMATS } = mod;
  const samplingSize = Math.max(160, Math.round((SAMPLE_RATE * intervalMs) / 1000)); // samples/channel per chunk

  let stream: any = null;
  try {
    stream = new InputAudioStream(
      AUDIO_SOURCES.VOICE_RECOGNITION, // mic profile tuned for speech (AGC, no music processing) — ideal for STT
      SAMPLE_RATE,
      CHANNEL_CONFIGS.MONO,
      AUDIO_FORMATS.PCM_16BIT,
      samplingSize,
      false, // we own start/stop via the hook — don't let it auto stop/resume on background
    );
    stream.addChunkListener((chunk: { length?: number; toString: (enc: string) => string }) => {
      if (chunk?.length) onChunk(chunk.toString('base64')); // base64 PCM16 → straight to the WS (no decode)
    });
    // Errors surface by the stream going quiet; the hook's stop-watchdog + degrade handle recovery.
    stream.addErrorListener(() => {});
    const ok = await stream.start();
    if (!ok) {
      try { await stream.destroy(); } catch { /* ignore */ }
      return null;
    }
  } catch {
    if (stream) {
      try { await stream.destroy(); } catch { /* ignore */ }
    }
    return null;
  }

  const s = stream;
  return {
    stop: async () => {
      try { await s.stop(); } catch { /* ignore */ }
      try { await s.destroy(); } catch { /* already stopped */ }
    },
  };
}
