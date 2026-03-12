/**
 * Shared Gemini API client with model fallback + rate-limit handling.
 *
 * Model chain: gemini-2.5-flash → gemini-2.5-flash-lite
 * Free tier: ~20 RPM per model. Google tells us exact retry time in the body.
 * On 429 → skip to fallback model immediately (no retry wait on same model).
 */

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Model fallback chain — current free tier models
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// Per-model rate limit tracking
const modelBlocked: Record<string, number> = {}; // model → unblock timestamp
let allModelsExhausted = false;

export function isGeminiAvailable(): boolean {
  if (!GEMINI_KEY) return false;
  if (allModelsExhausted) {
    // Auto-reset if any model's block has expired
    const now = Date.now();
    if (MODELS.some((m) => !modelBlocked[m] || now >= modelBlocked[m])) {
      allModelsExhausted = false;
    } else {
      return false;
    }
  }
  return MODELS.some((m) => !modelBlocked[m] || Date.now() >= modelBlocked[m]);
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

interface GeminiRequestBody {
  contents: any[];
  system_instruction?: { parts: { text: string }[] };
  generationConfig?: Record<string, any>;
}

function getUrl(model: string): string {
  return `${API_BASE}/${model}:generateContent?key=${GEMINI_KEY}`;
}

async function doFetch(
  model: string,
  body: GeminiRequestBody,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(getUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
}

/**
 * Read 429 response body and extract retry-after seconds.
 * Google includes "Please retry in Xs" in the error message.
 */
async function parse429(model: string, response: Response): Promise<number> {
  try {
    const body = await response.clone().json();
    const msg: string = body?.error?.message || '';
    console.warn(`[Gemini] ${model} 429: ${msg.slice(0, 200)}`);

    // Parse "Please retry in 52.518570186s"
    const match = msg.match(/retry in ([\d.]+)s/i);
    if (match) {
      return Math.ceil(parseFloat(match[1])) * 1000;
    }
  } catch {
    console.warn(`[Gemini] ${model} 429 (no readable body)`);
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
  console.warn(`[Gemini] ${model} blocked for ${Math.ceil(durationMs / 1000)}s`);

  // Check if ALL models are now blocked
  const now = Date.now();
  if (MODELS.every((m) => modelBlocked[m] && now < modelBlocked[m])) {
    allModelsExhausted = true;
    // Find soonest unblock
    const soonest = Math.min(...MODELS.map((m) => modelBlocked[m] || 0)) - now;
    console.warn(`[Gemini] All models exhausted — next available in ${Math.ceil(soonest / 1000)}s`);
  }
}

export async function callGeminiAPI(
  body: GeminiRequestBody,
  timeoutMs = 15_000
): Promise<any | null> {
  if (!isGeminiAvailable()) return null;

  const available = getAvailableModels();
  if (available.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (const model of available) {
      const response = await doFetch(model, body, controller.signal);

      // On 429 → block this model for Google's specified time, try next immediately
      if (response.status === 429) {
        const retryMs = await parse429(model, response);
        blockModel(model, retryMs);
        continue; // try next model — don't waste time retrying same model
      }

      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[Gemini] ${model} error: ${response.status}`);
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
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === 'AbortError') {
      console.warn('[Gemini] Request timed out');
    } else {
      console.warn('[Gemini] Request failed:', err);
    }
    return null;
  }
}
