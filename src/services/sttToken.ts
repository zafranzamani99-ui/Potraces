// Fetches a short-lived streaming-STT token from our `stt-token` edge function so the app can open a
// WebSocket DIRECTLY to the speech provider (Soniox / Deepgram) for live Malay transcription. The real
// provider key never touches the bundle — only this 60s single-use token does. Reuses the same auth
// headers as the AI proxy (user JWT when signed in, else anon + device id).

import { aiProxyHeaders } from './aiProxy';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const STT_TOKEN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/stt-token` : '';
// RN fetch has NO default timeout. Without this, a stalled token mint hangs openLiveStream forever —
// before it can log or degrade — leaving a dead mic. Bound it so a hang becomes a clean null → degrade.
const STT_TOKEN_TIMEOUT_MS = 8000;

export type SttProvider = 'soniox' | 'deepgram' | 'gemini';

export interface SttToken {
  provider: SttProvider;
  token: string;
  expires_in: number;
}

/** True when the streaming-STT token endpoint can be reached. */
export function isSttTokenConfigured(): boolean {
  return !!STT_TOKEN_URL;
}

/** Mint a short-lived streaming-STT token. Returns null if unconfigured / unauthorized / provider error
 *  / timeout. NEVER hangs — a bounded fetch so the caller (openLiveStream) can degrade instead of stalling. */
export async function fetchSttToken(provider: SttProvider = 'soniox'): Promise<SttToken | null> {
  if (!STT_TOKEN_URL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STT_TOKEN_TIMEOUT_MS);
  try {
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[stt-tok] enter');
    const headers = await aiProxyHeaders();
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[stt-tok] headers ready');
    const res = await fetch(STT_TOKEN_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider }),
      signal: controller.signal,
    });
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[stt-tok] http', res.status);
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    return d?.token ? { provider: d.provider ?? provider, token: d.token, expires_in: d.expires_in ?? 60 } : null;
  } catch {
    return null; // includes the AbortController timeout
  } finally {
    clearTimeout(timeout);
  }
}
