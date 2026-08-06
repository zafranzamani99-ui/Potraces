import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// share-reward-submit — records a Share & Earn Pro submission.
//
// Spec: AUGUST.md "Earn Pro hub + Share & Earn Pro reward". The user posts
// about the app WITH a screenshot on Instagram / 小红书 (RED) / Reddit /
// Facebook / X / Threads, pastes the post URL here, and the team reviews it
// by hand in the admin Rewards tab (admin_review_share_reward → grant_premium).
//
// Auth: JWT required (gateway default verify_jwt=true — no config.toml
// entry). The caller's identity still comes from getUser() below, never from
// the request body.
//
// Body: { platform: 'instagram'|'red'|'reddit'|'facebook'|'x'|'threads',
//         post_url: string, screenshot_path?: string }
//   screenshot_path must live under "<caller-uid>/" in share-reward-proofs
//   (the client uploads it there first; storage RLS enforces the prefix).
//
// Returns 200 { ok: true, id } or { ok: false, reason }:
//   invalid_platform | invalid_url | wrong_platform | already_submitted |
//   account_too_new | year_cap_reached | server_error
//
// Abuse controls here: platform URL validation, account-age gate
// (share_reward_min_account_age_days), rolling-year cap early-out
// (share_reward_cap_per_year — RE-CHECKED atomically at approval), and the
// url_key unique index (dedupe by post URL; the same post can only ever be
// submitted — and therefore granted — once, across ALL accounts).
//
// Platform host rules are duplicated from src/utils/shareRewardRules.ts
// (Deno functions can't import app code) — keep the two in sync.
//
// Setup (operator): supabase functions deploy share-reward-submit
// (no extra secrets — reuses the standard SUPABASE_* edge-function env vars.)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Platform = keyof typeof PLATFORM_HOSTS;
const PLATFORM_HOSTS = {
  instagram: ['instagram.com', 'instagr.am'],
  red: ['xiaohongshu.com', 'xhslink.com'],
  reddit: ['reddit.com', 'redd.it'],
  facebook: ['facebook.com', 'fb.watch', 'fb.com'],
  x: ['x.com', 'twitter.com'],
  threads: ['threads.net'],
} as const;

/** Mirror of validatePostUrl() in src/utils/shareRewardRules.ts. */
function validatePostUrl(platform: Platform, raw: unknown): { ok: true; urlKey: string } | { ok: false; reason: string } {
  const input = String(raw ?? '').trim();
  if (!input || input.length > 2048) return { ok: false, reason: 'invalid_url' };
  let u: URL;
  try {
    // Prepend https only when there is NO scheme — any other explicit scheme
    // (ftp:, javascript:, …) must parse as-is so the protocol check rejects it.
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'invalid_url' };
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, reason: 'invalid_url' };
  if (!PLATFORM_HOSTS[platform].some((a) => host === a || host.endsWith('.' + a))) {
    return { ok: false, reason: 'wrong_platform' };
  }
  const path = u.pathname.replace(/\/+$/, '');
  if (!path) return { ok: false, reason: 'invalid_url' };
  return { ok: true, urlKey: host.replace(/^www\./, '') + path };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, reason: 'auth_required' }, 401);

  let payload: { platform?: unknown; post_url?: unknown; screenshot_path?: unknown } = {};
  try { payload = await req.json(); } catch { /* empty body → fails validation below */ }

  const platform = String(payload?.platform ?? '') as Platform;
  if (!(platform in PLATFORM_HOSTS)) return json({ ok: false, reason: 'invalid_platform' }, 400);

  const verdict = validatePostUrl(platform, payload?.post_url);
  if (!verdict.ok) return json({ ok: false, reason: verdict.reason }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve the caller's identity from their JWT.
  let userId: string;
  let createdAt: string | undefined;
  try {
    const { data: { user }, error } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (error || !user) return json({ ok: false, reason: 'auth_required' }, 401);
    userId = user.id;
    createdAt = user.created_at;
  } catch {
    return json({ ok: false, reason: 'auth_required' }, 401);
  }

  // Account-age gate — stops fresh-account farming.
  const { data: minAgeCfg } = await admin.from('app_config').select('value').eq('key', 'share_reward_min_account_age_days').maybeSingle();
  const minAgeDays = Math.max(parseInt(minAgeCfg?.value ?? '7', 10) || 7, 0);
  if (!createdAt || Date.now() - new Date(createdAt).getTime() < minAgeDays * 86400000) {
    return json({ ok: false, reason: 'account_too_new' }, 403);
  }

  // Rolling-year cap early-out (the authoritative check runs at approval).
  const { data: capCfg } = await admin.from('app_config').select('value').eq('key', 'share_reward_cap_per_year').maybeSingle();
  const cap = Math.max(parseInt(capCfg?.value ?? '12', 10) || 12, 0);
  if (cap > 0) {
    const since = new Date(Date.now() - 365 * 86400000).toISOString();
    const { count } = await admin
      .from('entitlement_grants')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'share_reward')
      .gt('granted_at', since);
    if ((count ?? 0) >= cap) return json({ ok: false, reason: 'year_cap_reached' }, 429);
  }

  // Proof screenshot: must be an object the caller uploaded under their own
  // prefix (storage RLS already enforced that at upload time).
  let screenshotPath: string | null = null;
  const rawPath = String(payload?.screenshot_path ?? '').trim();
  if (rawPath && rawPath.length <= 512 && rawPath.startsWith(`${userId}/`)) {
    screenshotPath = rawPath;
  }

  const postUrl = String(payload?.post_url ?? '').trim().slice(0, 2048);
  const { data: inserted, error } = await admin
    .from('share_reward_submissions')
    .insert({
      user_id: userId,
      platform,
      post_url: postUrl,
      url_key: verdict.urlKey,
      screenshot_path: screenshotPath,
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = url_key unique violation → this post was already submitted
    // (by anyone — one grant per post, across all accounts).
    if ((error as { code?: string }).code === '23505') {
      return json({ ok: false, reason: 'already_submitted' }, 409);
    }
    return json({ ok: false, reason: 'server_error' }, 500);
  }

  return json({ ok: true, id: inserted?.id ?? null });
});
