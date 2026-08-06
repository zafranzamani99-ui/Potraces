import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// get-entitlements — the SERVER source of truth for a signed-in user's paid tier.
//
// Why this exists: pre-launch the app decided the tier ON-DEVICE (a persisted
// local flag can be flipped to get Pro free). From here the server answers
// authoritatively from the grant ledger (redeem / referral / collectz /
// admin / beta_promise rows in entitlement_grants), and the client reconciles
// server-wins (src/services/entitlementPolicy.ts). The response shape is built
// to merge a RevenueCat receipt-verification result later WITHOUT any client
// change (see the SEAM below).
//
// Auth: REQUIRED. The gateway enforces JWT (verify_jwt defaults to true — no
// config.toml entry, same as stt-token / parse-statement); we re-verify inside
// to get the caller's id. Signed-out users get 401 — the client never calls
// this without a session.
//
// Deploy (operator):
//   supabase db push                              -- applies 20260806120000_entitlement_state_fn.sql
//   supabase functions deploy get-entitlements
//
// Failure discipline: this function ONLY returns an entitlement on a
// definitive DB answer. Any transient error is a 5xx — NEVER a fabricated
// 'free', which would wrongly strip a paying user whose client trusts us.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Mirrors TIER_RANK (src/constants/tiers.ts) — duplicated deliberately: Deno
// can't import the RN source tree, and the rank table is stable.
const TIER_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, premium: 3 };
const TIERS = new Set(Object.keys(TIER_RANK));

type EntitlementSource = 'grant' | 'purchase' | 'none';

interface Candidate {
  tier: string;                 // 'basic' | 'pro' | 'premium' (a PAID candidate — 'free' is not a candidate)
  source: Exclude<EntitlementSource, 'none'>;
  expiresAt: string | null;     // ISO; null = no expiry (e.g. lifetime purchase)
}

/** Highest rank wins; a tie goes to the candidate that expires later
 *  (null expiry = never = latest). Deterministic merge for grant + future
 *  purchase sources. */
function pickWinner(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (!best) { best = c; continue; }
    const r = (TIER_RANK[c.tier] ?? 0) - (TIER_RANK[best.tier] ?? 0);
    if (r > 0) { best = c; continue; }
    if (r === 0) {
      const a = c.expiresAt ? Date.parse(c.expiresAt) : Infinity;
      const b = best.expiresAt ? Date.parse(best.expiresAt) : Infinity;
      if (a > b) best = c;
    }
  }
  return best;
}

// ─── REVENUECAT SEAM (NOT BUILT — keys don't exist yet) ─────────────────────
// When receipt verification lands, implement this to return the caller's
// ACTIVE store entitlement as a Candidate:
//   {
//     tier: mapRcEntitlementToTier(rcEntitlementId),   // 'basic'|'pro'|'premium'
//     source: 'purchase',
//     expiresAt: rcEntitlement.expires_date,           // null for lifetime
//   }
// Suggested wiring: RevenueCat webhook → server writes an 'iap' row into
// entitlement_grants (source='iap' already exists in the ledger's CHECK), so
// purchases ride the SAME grant path above and this function barely changes;
// or verify receipts here directly against RC's REST API using a secret key
// (supabase secrets set RC_SECRET_KEY=...). Either way pickWinner() below
// already merges grant + purchase correctly and the response shape — and the
// client merge — stay unchanged.
// ─────────────────────────────────────────────────────────────────────────────
// deno-lint-ignore no-unused-vars
async function fetchPurchaseCandidate(userId: string): Promise<Candidate | null> {
  return null; // pre-RevenueCat: grants are the only paid source
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'auth_required' }, 401);

    // Verify the caller's JWT and identify the user. The service key is used
    // only to construct the client; getUser validates the USER token.
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'auth_required' }, 401);

    // Server-side truth: read-only snapshot of the grant ledger + launch gate.
    // entitlement_state() is service-role-only (revoked from anon/authenticated),
    // side-effect-free, and mirrors my_entitlement()'s tier queries.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: state, error: stateErr } = await admin.rpc('entitlement_state', { p_uid: user.id });
    if (stateErr || !state?.ok) {
      console.error('[get-entitlements] entitlement_state failed:', stateErr?.message);
      return json({ error: 'entitlement_unavailable' }, 500); // transient — client fails OPEN
    }

    const candidates: Candidate[] = [];
    const grantTier = typeof state.tier === 'string' ? state.tier : 'free';
    if (grantTier !== 'free' && TIERS.has(grantTier)) {
      candidates.push({
        tier: grantTier,
        source: 'grant',
        expiresAt: typeof state.premium_until === 'string' ? state.premium_until : null,
      });
    }
    const purchase = await fetchPurchaseCandidate(user.id); // RC seam — always null pre-RC
    if (purchase && TIERS.has(purchase.tier)) candidates.push(purchase);

    const winner = pickWinner(candidates);

    // Response contract (consumed by src/services/entitlements.ts +
    // entitlementPolicy.ts — keep in sync):
    //   tier      'free' | 'basic' | 'pro' | 'premium'
    //   source    'grant' | 'purchase' | 'none'
    //   expiresAt ISO string | null (null when tier is 'free', or a no-expiry purchase)
    //   gateOn    launch gate — the client enforces server-wins only when true
    //   serverTime for diagnostics / clock-skew checks
    return json({
      ok: true,
      tier: winner?.tier ?? 'free',
      source: winner?.source ?? 'none',
      expiresAt: winner?.expiresAt ?? null,
      gateOn: state.gate_on === true,
      serverTime: typeof state.server_time === 'string' ? state.server_time : new Date().toISOString(),
    });
  } catch (e) {
    console.error('[get-entitlements] unhandled:', (e as Error).message);
    return json({ error: 'entitlement_unavailable' }, 500); // transient — client fails OPEN
  }
});
