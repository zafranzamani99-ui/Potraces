// ai-proxy — single server-side gateway for ALL AI calls (Gemini + Anthropic).
//
// WHY: the app used to embed EXPO_PUBLIC_GEMINI_API_KEY / EXPO_PUBLIC_ANTHROPIC_API_KEY
// in the client bundle and call the providers directly. Those keys are extractable
// from any installed app → anyone could drain them on our bill, and per-user limits
// were unenforceable. This proxy holds the keys as server secrets and meters every
// call against a per-identity monthly token budget.
//
// CONTRACT (POST JSON):
//   { provider: 'gemini' | 'anthropic',
//     mode: 'generate' | 'stream',          // stream only valid for gemini
//     model: string,                         // must be in ALLOWED_MODELS
//     payload: <provider-native request body> }
// Headers: Authorization: Bearer <user JWT | anon key>, x-device-id: <uuid>
//
// Returns the provider's response VERBATIM (so the client keeps its existing parsing):
//   - generate / anthropic → provider JSON
//   - gemini stream        → the provider SSE stream, piped straight through
//   - over budget          → 403 { error: 'BUDGET_EXCEEDED' }  (client degrades to "AI unavailable")
//
// SECRETS required (supabase secrets set ...): GEMINI_API_KEY, ANTHROPIC_API_KEY.
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// NOTE: this is layer 1 (key hidden + budget). A determined attacker can still call
// the public proxy by rotating device ids; layer 2 (Play Integrity / App Attest
// attestation) is the follow-up to prove calls come from the real app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Only models the app actually uses — stops the proxy being used to call
// arbitrary (expensive) models with our keys.
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
]);

// Per-identity monthly token budget (input + output). Generous enough for a heavy
// legitimate user, low enough to bound abuse. Tier-aware limits come later once a
// server-trusted entitlement (e.g. a RevenueCat webhook) exists.
const MONTHLY_TOKEN_CAP = 1_500_000;

// Secondary cap on call COUNT. Bounds abuse even when token metering under-counts
// (e.g. aborted streams that never report usageMetadata). Every successful upstream
// call increments `calls`, so this holds regardless of token accounting accuracy.
const MONTHLY_CALL_CAP = 3_000;

// Anti-runaway ceilings on a SINGLE call. Deliberately generous — the real cost
// control is MONTHLY_TOKEN_CAP. These only stop one pathological huge-output call.
const MAX_OUTPUT_TOKENS = 4096;
const MAX_THINKING_BUDGET = 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-device-id',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function utcPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Best-effort background work (usage accounting on streams) without killing the
// response. Falls back to fire-and-forget if waitUntil isn't available.
function background(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch(() => {});
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Identity: real user id if signed in, else dev:<device-id> ──────────────
  let identity: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    try {
      const { data: { user } } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
      if (user) identity = user.id;
    } catch { /* anon key in Authorization → not a user token; fall through */ }
  }
  if (!identity) {
    const dev = req.headers.get('x-device-id')?.trim();
    if (!dev) return json({ error: 'Missing identity (x-device-id)' }, 400);
    identity = `dev:${dev}`;
  }

  // ── Parse + validate request ──────────────────────────────────────────────
  let reqBody: { provider?: string; mode?: string; model?: string; payload?: unknown };
  try {
    reqBody = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const { provider, mode = 'generate', model, payload } = reqBody;
  if (provider !== 'gemini' && provider !== 'anthropic') return json({ error: 'Bad provider' }, 400);
  if (!model || !ALLOWED_MODELS.has(model)) return json({ error: 'Model not allowed' }, 400);
  if (!payload || typeof payload !== 'object') return json({ error: 'Missing payload' }, 400);
  if (provider === 'gemini' && model.startsWith('claude')) return json({ error: 'Model/provider mismatch' }, 400);
  if (provider === 'anthropic' && !model.startsWith('claude')) return json({ error: 'Model/provider mismatch' }, 400);

  if ((provider === 'gemini' && !GEMINI_KEY) || (provider === 'anthropic' && !ANTHROPIC_KEY)) {
    return json({ error: 'Provider not configured' }, 503);
  }

  // ── Budget check (pre-call) ───────────────────────────────────────────────
  const period = utcPeriod();
  try {
    const { data: usage } = await admin
      .from('ai_proxy_usage')
      .select('input_tokens, output_tokens, calls')
      .eq('identity', identity)
      .eq('period', period)
      .maybeSingle();
    const used = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
    if (used >= MONTHLY_TOKEN_CAP || (usage?.calls ?? 0) >= MONTHLY_CALL_CAP) {
      return json({ error: 'BUDGET_EXCEEDED' }, 403);
    }
  } catch { /* if the usage read fails, fail open (don't block the user on a DB hiccup) */ }

  const record = (input: number, output: number) =>
    admin.rpc('add_ai_proxy_usage', { p_identity: identity, p_period: period, p_input: input, p_output: output });

  // ── GEMINI ────────────────────────────────────────────────────────────────
  if (provider === 'gemini') {
    const body = clampGemini(payload as Record<string, unknown>);

    if (mode === 'stream') {
      const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!upstream.ok || !upstream.body) {
        // Pass the status through (esp. 429) so the client's cooldown logic works.
        const text = await upstream.text().catch(() => '');
        return new Response(text || JSON.stringify({ error: 'upstream' }), {
          status: upstream.status,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      // Tee: one branch streams to the client, the other is read in the background
      // to extract usageMetadata for accounting. Accounting NEVER affects the stream.
      const [toClient, toMeter] = upstream.body.tee();
      background(meterGeminiStream(toMeter, record));
      return new Response(toClient, {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'text/event-stream' },
      });
    }

    // generate
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_KEY}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    if (upstream.ok) {
      let pin = 0, pout = 0;
      try {
        const u = JSON.parse(text)?.usageMetadata;
        pin = u?.promptTokenCount ?? 0;
        pout = u?.candidatesTokenCount ?? 0;
      } catch { /* token parse failed; still count the call below */ }
      background(record(pin, pout)); // always counts the call (calls += 1)
    }
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── ANTHROPIC ─────────────────────────────────────────────────────────────
  const aBody = clampAnthropic(payload as Record<string, unknown>, model);
  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(aBody),
  });
  const text = await upstream.text();
  if (upstream.ok) {
    let ain = 0, aout = 0;
    try {
      const u = JSON.parse(text)?.usage;
      ain = u?.input_tokens ?? 0;
      aout = u?.output_tokens ?? 0;
    } catch { /* token parse failed; still count the call below */ }
    background(record(ain, aout)); // always counts the call (calls += 1)
  }
  return new Response(text, {
    status: upstream.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});

// Clamp Gemini generationConfig to anti-runaway ceilings; force the requested model
// is already validated. Never relaxes app-provided lower limits.
function clampGemini(payload: Record<string, unknown>): Record<string, unknown> {
  const gc = { ...(payload.generationConfig as Record<string, unknown> | undefined) };
  if (typeof gc.maxOutputTokens !== 'number' || gc.maxOutputTokens > MAX_OUTPUT_TOKENS) {
    gc.maxOutputTokens = MAX_OUTPUT_TOKENS;
  }
  const tc = gc.thinkingConfig as { thinkingBudget?: number } | undefined;
  if (tc && typeof tc.thinkingBudget === 'number' && tc.thinkingBudget > MAX_THINKING_BUDGET) {
    gc.thinkingConfig = { ...tc, thinkingBudget: MAX_THINKING_BUDGET };
  }
  return { ...payload, generationConfig: gc };
}

function clampAnthropic(payload: Record<string, unknown>, model: string): Record<string, unknown> {
  const max = typeof payload.max_tokens === 'number' ? payload.max_tokens : MAX_OUTPUT_TOKENS;
  return { ...payload, model, max_tokens: Math.min(max, MAX_OUTPUT_TOKENS) };
}

// Read a teed Gemini SSE stream to completion and record the final usageMetadata.
async function meterGeminiStream(
  stream: ReadableStream<Uint8Array>,
  record: (i: number, o: number) => unknown,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let lastIn = 0;
  let lastOut = 0;
  try {
    // Always drain to completion — never let a parse error stop reading, or the
    // teed branch backpressures/leaks memory while the client branch streams.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      try {
        buf += decoder.decode(value, { stream: true });
        let idx = buf.indexOf('"usageMetadata"');
        while (idx !== -1) {
          const slice = buf.slice(idx, idx + 400);
          const pin = slice.match(/"promptTokenCount"\s*:\s*(\d+)/);
          const pout = slice.match(/"candidatesTokenCount"\s*:\s*(\d+)/);
          if (pin) lastIn = parseInt(pin[1], 10);
          if (pout) lastOut = parseInt(pout[1], 10);
          idx = buf.indexOf('"usageMetadata"', idx + 1);
        }
        // keep only a tail large enough to hold a usageMetadata block
        if (buf.length > 2000) buf = buf.slice(-2000);
      } catch { /* skip this chunk's parse; keep draining */ }
    }
    // Always record — even a zero-token (aborted) stream counts as one call, so
    // MONTHLY_CALL_CAP bounds abuse that evades token metering.
    await record(lastIn, lastOut);
  } catch {
    try { await reader.cancel(); } catch { /* noop */ }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}
