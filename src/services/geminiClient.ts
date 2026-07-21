/**
 * Shared Gemini API client with model fallback + rate-limit handling.
 *
 * Model chain: gemini-3.1-flash-lite → gemini-3.5-flash
 * (Google retired the 2.5 models for new billing accounts on 2026-07-17; the
 * lite-first order keeps cost at/below the old 2.5-flash pricing, with the
 * pricier 3.5-flash only as a rate-limit escape hatch. The ai-proxy also
 * remaps old 2.5 names from shipped builds onto 3.1-flash-lite server-side.)
 * Google tells us exact retry time in the 429 body.
 * On 429 → skip to fallback model immediately (no retry wait on same model).
 */

// react-native-sse uses XMLHttpRequest under the hood — no native module
// required, so it works in both debug AND release/TestFlight builds. (RN's
// built-in fetch does NOT support ReadableStream; expo/fetch is broken in
// release builds.)
import EventSource from 'react-native-sse';
import { AI_PROXY_URL, aiProxyHeaders, aiProxyFetch, isAiProxyConfigured } from './aiProxy';

// Model fallback chain — cheap current-gen model first, premium as escape hatch.
// The provider API key lives ONLY on the server (ai-proxy Edge Function); the
// client never holds it.
const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

// Per-model rate limit tracking
const modelBlocked: Record<string, number> = {}; // model → unblock timestamp
let allModelsExhausted = false;

const MAX_BLOCK_MS = 120_000; // Cap blocks at 2 minutes — free tier resets fast

export function isGeminiAvailable(): boolean {
  if (!isAiProxyConfigured()) return false;
  const now = Date.now();
  // Auto-clear stale blocks (cap at MAX_BLOCK_MS)
  for (const m of MODELS) {
    if (modelBlocked[m] && modelBlocked[m] - now > MAX_BLOCK_MS) {
      modelBlocked[m] = now + MAX_BLOCK_MS;
    }
  }
  if (allModelsExhausted) {
    if (MODELS.some((m) => !modelBlocked[m] || now >= modelBlocked[m])) {
      allModelsExhausted = false;
    } else {
      return false;
    }
  }
  return MODELS.some((m) => !modelBlocked[m] || now >= modelBlocked[m]);
}

export function isDailyQuotaExhausted(): boolean {
  return allModelsExhausted;
}

export function resetDailyQuota(): void {
  allModelsExhausted = false;
  for (const m of MODELS) delete modelBlocked[m];
}

export function getCooldownSecondsLeft(): number {
  const now = Date.now();
  // Find soonest unblocking model
  let soonest = Infinity;
  for (const m of MODELS) {
    const until = modelBlocked[m] || 0;
    if (until <= now) return 0; // at least one model is ready
    soonest = Math.min(soonest, until - now);
  }
  return soonest === Infinity ? 0 : Math.ceil(soonest / 1000);
}

// ─── Gemini API Types ────────────────────────────────────

/** A single part within a Gemini content message. */
export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/** A single turn in the Gemini conversation. */
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Generation configuration sent to the Gemini API. */
export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  topP?: number;
  topK?: number;
  thinkingConfig?: { thinkingBudget: number };
}

/** A single candidate returned by Gemini. */
export interface GeminiCandidate {
  content: { parts: GeminiPart[] };
  finishReason?: string;
}

/** Top-level response shape from Gemini generateContent. */
export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

/** Request body sent to the Gemini generateContent endpoint. */
interface GeminiRequestBody {
  contents: GeminiContent[];
  system_instruction?: { parts: { text: string }[] };
  generationConfig?: GeminiGenerationConfig;
}

async function doFetch(
  model: string,
  body: GeminiRequestBody,
  signal?: AbortSignal,
  source?: string
): Promise<Response> {
  // Routed through the server proxy, which injects the Gemini key + meters usage.
  return aiProxyFetch({ provider: 'gemini', mode: 'generate', model, payload: body, ...(source ? { source } : {}) }, signal);
}

/**
 * Read 429 response body and extract retry-after seconds.
 * Google includes "Please retry in Xs" in the error message.
 */
async function parse429(model: string, response: Response): Promise<number> {
  try {
    const body = await response.clone().json();
    const msg: string = body?.error?.message || '';
    if (__DEV__) console.warn(`[Gemini] ${model} 429: ${msg.slice(0, 200)}`);

    // Parse "Please retry in 52.518570186s"
    const match = msg.match(/retry in ([\d.]+)s/i);
    if (match) {
      return Math.ceil(parseFloat(match[1])) * 1000;
    }
  } catch {
    if (__DEV__) console.warn(`[Gemini] ${model} 429 (no readable body)`);
  }

  // Fallback: check Retry-After header
  const header = response.headers.get('retry-after');
  if (header) {
    const secs = parseInt(header, 10);
    if (!isNaN(secs)) return secs * 1000;
  }

  return 60_000; // default 60s if we can't parse
}

function getAvailableModels(): string[] {
  const now = Date.now();
  return MODELS.filter((m) => !modelBlocked[m] || now >= modelBlocked[m]);
}

function blockModel(model: string, durationMs: number) {
  modelBlocked[model] = Date.now() + durationMs;
  if (__DEV__) console.warn(`[Gemini] ${model} blocked for ${Math.ceil(durationMs / 1000)}s`);

  // Check if ALL models are now blocked
  const now = Date.now();
  if (MODELS.every((m) => modelBlocked[m] && now < modelBlocked[m])) {
    allModelsExhausted = true;
    // Find soonest unblock
    const soonest = Math.min(...MODELS.map((m) => modelBlocked[m] || 0)) - now;
    if (__DEV__) console.warn(`[Gemini] All models exhausted — next available in ${Math.ceil(soonest / 1000)}s`);
  }
}

/**
 * @param body       Gemini request body
 * @param timeoutMs  Request timeout (default 15s)
 * @param noFallback If true, only try the primary model — skip fallback.
 *                   Use for vision/image requests where both models share
 *                   the same rate limit quota, so fallback just wastes a call.
 * @param source Feature tag logged by the proxy for usage attribution (e.g. 'receipt-scan').
 */
export async function callGeminiAPI(
  body: GeminiRequestBody,
  timeoutMs = 15_000,
  noFallback = false,
  preferModel?: string,
  source?: string
): Promise<GeminiResponse | null> {
  if (!isGeminiAvailable()) return null;

  let available = getAvailableModels();
  if (available.length === 0) return null;

  // Honor a caller's preferred model (e.g. the tier "smarter AI" upsell) by trying
  // it first, then the rest of the chain as the rate-limit fallback.
  if (preferModel && available.includes(preferModel)) {
    available = [preferModel, ...available.filter((m) => m !== preferModel)];
  }

  // For noFallback (vision), only try the first available model
  const modelsToTry = noFallback ? [available[0]] : available;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (const model of modelsToTry) {
      const response = await doFetch(model, body, controller.signal, source);

      // On 429 → block this model for Google's specified time, try next immediately
      if (response.status === 429) {
        const retryMs = await parse429(model, response);
        blockModel(model, retryMs);
        continue; // try next model — don't waste time retrying same model
      }

      clearTimeout(timeout);

      if (!response.ok) {
        if (__DEV__) console.warn(`[Gemini] ${model} error: ${response.status}`);
        continue;
      }

      // Success — clear any stale blocks
      delete modelBlocked[model];
      allModelsExhausted = false;
      return await response.json();
    }

    // All models failed
    clearTimeout(timeout);
    return null;
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      if (__DEV__) console.warn('[Gemini] Request timed out');
    } else {
      if (__DEV__) console.warn('[Gemini] Request failed:', err);
    }
    return null;
  }
}

// ─── Streaming (SSE) ─────────────────────────────────────

/** Minimal shape of a Gemini SSE chunk's JSON payload. */
interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * Stream text from Gemini via Server-Sent Events.
 *
 * Yields the CUMULATIVE text-so-far each time a new delta arrives (not the
 * delta alone), so a consumer can replace its displayed text wholesale:
 *
 *   for await (const textSoFar of streamGeminiText(body)) { setText(textSoFar); }
 *
 * Vision shares one rate-limit quota across both models, so this mirrors the
 * `noFallback` behavior in callGeminiAPI — it only tries the first available
 * model, no fallback loop. Uses `fetch` from `expo/fetch` because RN's built-in
 * global fetch does not support reading a streaming `response.body`.
 *
 * @param body       Gemini request body
 * @param timeoutMs  Overall request timeout (default 30s) — aborts the reader.
 * @param source Feature tag logged by the proxy for usage attribution (e.g. 'receipt-scan').
 * @param preferModel Try this model when it's available (tier routing — mirrors
 *                    callGeminiAPI). Streaming has no fallback loop, so this is
 *                    simply which single model gets the attempt.
 * @throws Error if AI is unavailable, busy, unreachable, or returns no text.
 */
export async function* streamGeminiText(
  body: GeminiRequestBody,
  timeoutMs = 30_000,
  source?: string,
  preferModel?: string
): AsyncGenerator<string, void, unknown> {
  if (!isGeminiAvailable()) {
    throw new Error('AI is not available right now.');
  }

  // Vision shares one quota — pick first available model, no fallback loop.
  // A preferred (tier-routed) model wins when it isn't rate-limited.
  const available = getAvailableModels();
  const model = preferModel && available.includes(preferModel) ? preferModel : available[0];
  if (!model) {
    throw new Error('AI is busy — try again shortly.');
  }

  const headers = await aiProxyHeaders();

  // Use a promise queue to bridge the event-based EventSource API into an
  // async generator. Each 'message' event pushes a value; 'error'/'close'
  // push a sentinel that ends the generator.
  const queue: Array<{ type: 'data' | 'error' | 'close'; value?: string; error?: Error }> = [];
  let resolveWait: (() => void) | null = null;

  const push = (item: { type: 'data' | 'error' | 'close'; value?: string; error?: Error }) => {
    queue.push(item);
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  };

  const es = new EventSource(AI_PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider: 'gemini', mode: 'stream', model, payload: body, ...(source ? { source } : {}) }),
    pollingInterval: 0, // disable auto-reconnect — we handle errors manually
  });

  let accumulated = '';
  let yieldedAny = false;

  es.addEventListener('message', (event) => {
    if (!event.data) return;
    // The ai-proxy streams Gemini SSE verbatim: each line is `data: {json}`.
    // react-native-sse already strips the `data: ` prefix and gives us the
    // raw payload, so we just need to parse it.
    try {
      const obj = JSON.parse(event.data) as GeminiStreamChunk;
      const delta = obj?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (delta) {
        accumulated += delta;
        yieldedAny = true;
        push({ type: 'data', value: accumulated });
      }
    } catch {
      // Partial/incomplete JSON — skip; the next event should complete it.
    }
  });

  es.addEventListener('error', (event) => {
    if (event.type === 'error') {
      push({ type: 'error', error: new Error(event.message || 'Could not reach AI. Please try again.') });
    } else if (event.type === 'exception') {
      push({ type: 'error', error: new Error(event.message || 'Could not reach AI. Please try again.') });
    }
  });

  es.addEventListener('close', () => {
    push({ type: 'close' });
  });

  // Timeout guard: close the stream if it takes too long.
  const timeout = setTimeout(() => {
    es.close();
    push({ type: 'error', error: new Error('Request timed out.') });
  }, timeoutMs);

  try {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => { resolveWait = resolve; });
      }
      const item = queue.shift()!;
      if (item.type === 'data') {
        yield item.value!;
      } else if (item.type === 'error') {
        throw item.error!;
      } else {
        // close
        break;
      }
    }
  } finally {
    clearTimeout(timeout);
    es.removeAllEventListeners();
    es.close();
  }

  if (!yieldedAny) {
    throw new Error('No response from AI. Please try a clearer photo.');
  }
}
