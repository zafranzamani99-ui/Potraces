import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * report-content — the public "Report" button for user-generated content
 * (Apple 1.2). Anyone who can SEE objectionable content can flag it — including
 * signed-out visitors on the public Collectz join page (web + app) — so this
 * function takes no auth, validates hard, and flood-caps per reporter.
 *
 *   { context, targetId, reason, reporterToken? }
 *
 *   context       — surface tag, e.g. 'collectz-join' / 'collectz-member'
 *                   (lowercase slug, <= 40 chars).
 *   targetId      — opaque id of the reported thing (participant id, share
 *                   code, …), <= 80 chars.
 *   reason        — preset tag or short free text, <= 280 chars.
 *   reporterToken — optional stable device token from public clients; only
 *                   used as the flood-cap key when there's no session or ip.
 *
 * Signed-in callers (the app sends its session JWT automatically) are charged
 * to their user id; everyone else to their ip. The row lands in
 * content_reports (service role) for the team to review + act on.
 *
 * Public function (verify_jwt=false). Secrets (Deno env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-provided by the runtime.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// Report bodies are tiny; reject anything bloated before parsing.
const MAX_BODY_BYTES = 4 * 1024;
const MAX_CONTEXT_LEN = 40;
const MAX_TARGET_LEN = 80;
const MAX_REASON_LEN = 280;
const MAX_TOKEN_LEN = 64;
// Flood cap: one reporter (user / ip / device token) may file this many
// reports per window — enough for a real pile of abuse, useless for spam.
const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 10 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const declaredLen = parseInt(req.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    return json({ error: 'Request too large.' }, 413);
  }
  let body: { context?: unknown; targetId?: unknown; reason?: unknown; reporterToken?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'Request too large.' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const context = String(body.context ?? '').trim();
  const targetId = String(body.targetId ?? '').trim();
  const reason = String(body.reason ?? '').trim();
  const reporterToken = String(body.reporterToken ?? '').trim();
  if (!context || context.length > MAX_CONTEXT_LEN || !/^[a-z0-9-]+$/.test(context)) {
    return json({ error: 'context_invalid' }, 400);
  }
  if (!targetId || targetId.length > MAX_TARGET_LEN) return json({ error: 'target_invalid' }, 400);
  if (!reason || reason.length > MAX_REASON_LEN) return json({ error: 'reason_invalid' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Optional auth — a signed-in reporter is charged to their account; the
  // public join page reports anonymously.
  let userId: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    userId = data?.user?.id ?? null;
  }

  // Flood cap: user id wins, then the client-supplied device token, then ip.
  const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const capKey = userId ?? (reporterToken ? `t:${reporterToken.slice(0, MAX_TOKEN_LEN)}` : null) ?? (ip ? `ip:${ip}` : null);
  if (capKey) {
    const since = new Date(Date.now() - REPORT_WINDOW_MS).toISOString();
    // reporter_id is uuid — matching a token/ip key against it would 400, so
    // only a signed-in reporter is counted on both columns.
    let q = admin
      .from('content_reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);
    q = userId ? q.or(`reporter_id.eq.${userId},reporter_key.eq.${userId}`) : q.eq('reporter_key', capKey);
    const { count } = await q;
    if ((count ?? 0) >= REPORT_LIMIT) return json({ error: 'rate_limited' }, 429);
  }

  const { error } = await admin.from('content_reports').insert({
    reporter_id: userId,
    context,
    target_id: targetId,
    reason,
    reporter_key: capKey,
  });
  if (error) return json({ error: 'report_failed' }, 500);

  return json({ ok: true });
});
