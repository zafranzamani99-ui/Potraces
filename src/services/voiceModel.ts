/**
 * voiceModel — await-aware on-device Malay (ms-MY) speech-model prep for Android.
 *
 * The voice hook fires-and-forgets an `androidTriggerOfflineModelDownload` when it self-heals, but it
 * can't surface progress or know when the model lands. This service is the UI-facing layer: it lets
 * Settings / Echo offer an explicit "download the Malay voice" control and report readiness, so a
 * Malaysian user can deliberately install the model that makes Malay capture accurate.
 *
 * iOS (SFSpeechRecognizer) handles ms-MY without a download step → everything here no-ops to 'ready'.
 */

import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

const ON_DEVICE_PKG = 'com.google.android.as'; // Android System Intelligence (on-device recognition)
const PROBE_TIMEOUT_MS = 2000; // getSupportedLocales can hang — always race a timeout

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

export type MalayVoiceState = 'ready' | 'absent' | 'preparing' | 'unavailable';

/** Authoritative readiness check — re-probes the on-device installed locales for ms-MY. */
export async function getMalayVoiceState(): Promise<MalayVoiceState> {
  if (Platform.OS !== 'android') return 'ready'; // iOS needs no download
  try {
    if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition?.() === false) return 'unavailable';
    const res = await withTimeout(
      ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: ON_DEVICE_PKG }),
      PROBE_TIMEOUT_MS,
    );
    const installed = res?.installedLocales ?? [];
    return installed.some((l) => l.toLowerCase() === 'ms-my') ? 'ready' : 'absent';
  } catch {
    return 'absent'; // probe threw — keep the in-app download path open rather than mislabel as unavailable
  }
}

/**
 * AWAIT the OS download of the ms-MY model.
 *  - 'ready'         — Android 14+: downloaded and confirmed installed.
 *  - 'opened_dialog' — Android 13: an OS dialog opened; completion isn't observable here.
 *  - 'failed'        — canceled / unsupported / error.
 */
export async function prepareMalayVoice(): Promise<'ready' | 'opened_dialog' | 'failed'> {
  if (Platform.OS !== 'android') return 'ready';
  if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition?.() === false) return 'failed';
  try {
    const { status } = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: 'ms-MY' });
    if (status === 'download_success') return 'ready'; // OS confirmed the install — trust it (re-probe can hang)
    if (status === 'opened_dialog') return 'opened_dialog';
    return 'failed'; // download_canceled
  } catch {
    return 'failed';
  }
}
