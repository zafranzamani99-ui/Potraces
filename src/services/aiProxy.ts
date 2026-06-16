// Client transport for the `ai-proxy` Edge Function.
//
// All AI calls (Gemini + Anthropic) go through the proxy so the provider API keys
// live ONLY on the server. Nothing here ever sees a provider key.
//
// Auth: send the user's access token if signed in (so the server meters by uid),
// else the Supabase anon key (server falls back to the x-device-id identity). The
// `apikey` header is required by the Supabase gateway regardless.

import { supabase } from './supabase';
import { getDeviceId } from '../utils/deviceId';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const AI_PROXY_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ai-proxy` : '';

export type AiProvider = 'gemini' | 'anthropic';
export type AiMode = 'generate' | 'stream';

export interface AiProxyRequest {
  provider: AiProvider;
  mode: AiMode;
  model: string;
  payload: unknown;
}

/** True when the proxy can be reached (Supabase env present). */
export function isAiProxyConfigured(): boolean {
  return !!AI_PROXY_URL && !!ANON_KEY;
}

/** Build the headers for a proxy call: user JWT if available, else anon key. */
export async function aiProxyHeaders(): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  let bearer = ANON_KEY;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) bearer = session.access_token;
  } catch {
    /* no session → anon */
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
    apikey: ANON_KEY,
    'x-device-id': deviceId,
  };
}

/**
 * POST a request to the proxy and return the raw Response so the caller keeps full
 * control of status handling (429 cooldowns, 403 budget, etc.). Uses the global
 * fetch (non-streaming). For streaming, build the request with AI_PROXY_URL +
 * aiProxyHeaders() and the caller's streaming fetch (see geminiClient).
 */
export async function aiProxyFetch(body: AiProxyRequest, signal?: AbortSignal): Promise<Response> {
  const headers = await aiProxyHeaders();
  return fetch(AI_PROXY_URL, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(body),
  });
}
