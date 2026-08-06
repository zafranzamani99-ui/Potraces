// ─── ENTITLEMENT POLICY (pure) ─────────────────────────────────────────────
// The merge rules behind server-side entitlement enforcement: given the local
// (on-device) tier and the last server entitlement snapshot, decide the
// EFFECTIVE tier every gate reads (premiumStore.tier).
//
// Pure module: type-only imports, no RN/AsyncStorage — so
// scripts/test-entitlement-merge.ts can run it under tsx.
//
// THE LOCK, and the failure modes we chose (read before touching):
//
//  1. SIGNED-IN + GATE ON + definitive server answer → the server tier wins in
//     BOTH directions. Upgrades (a grant/purchase raises a free device) and
//     downgrades: a tampered/flipped localTier can NOT beat a server 'free'.
//     This supersedes the old highestRank(local, server) contract from
//     docs/plans/premium-grants-and-rewards.md — highestRank let a local flip
//     keep a paid tier the server never granted, which is exactly the hole
//     this module closes.
//
//  2. NETWORK/SERVER FAILURE → fail OPEN on the CACHED snapshot:
//       - a LIVE paid snapshot keeps its tier until its own expiresAt;
//       - a cached 'free' stays enforced indefinitely while offline. That is
//         safe, never strips a paying user: acquiring an entitlement REQUIRES
//         reaching the server (redeem/purchase), and that same call refreshes
//         the snapshot — a cached 'free' therefore can't outlive a real payment.
//
//  3. CACHED PAID SNAPSHOT PAST expiresAt, still unreachable → honored for
//     EXPIRED_SNAPSHOT_GRACE_MS past expiry (a renewal made on another device
//     or an admin grant has that window to reach this device), then 'free'.
//     Chosen direction: past grace the entitlement is genuinely over, and
//     holding it forever would hand Pro to any expired grant that goes
//     offline. A wrongly-cut user self-heals on the next successful fetch.
//
//  4. GATE OFF (open beta) or NEVER VERIFIED (no snapshot) → localTier,
//     bit-for-bit the pre-enforcement behavior — the dev/beta free-unlock
//     keeps working, and a signed-in user we've never reached the server for
//     fails open. Accepted gap: an offline-forever freeloader keeps a flipped
//     local tier until the first successful fetch (deliberate — availability
//     for paying users beats perfect offline lockdown).
//
//  5. SIGNED-OUT → the snapshot is cleared (resetServerEntitlement on
//     SIGNED_OUT and on launch-while-signed-out), so signed-out/anonymous
//     behavior is today's local behavior, unchanged.
//
//  KNOWN SEAM (post-RevenueCat): until receipt verification lands, a REAL
//  store purchase only sets localTier — server-wins would HIDE it. Do NOT
//  flip premium_gate_on with billing live until the get-entitlements RC seam
//  returns source:'purchase' (then purchases ride this same path untouched).

import type { EntitlementSource, PremiumTier } from '../types';

export type { EntitlementSource };

/** The persisted server answer. Dates may be ISO strings after rehydrate. */
export interface ServerEntitlementSnapshot {
  tier: PremiumTier;
  source: EntitlementSource;
  /** Server-computed entitlement end (premium_until); null = none / no expiry. */
  expiresAt: Date | string | null;
  /** Server launch gate: enforcement applies only when true. */
  gateOn: boolean;
  /** When the server last DEFINITIVELY answered (null = never verified). */
  fetchedAt: Date | string | null;
}

/** Grace honored past an expired cached paid tier while unreachable (rule 3).
 *  Generous on purpose: a flaky connection must never strip a paying user. */
export const EXPIRED_SNAPSHOT_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const TIERS: readonly PremiumTier[] = ['free', 'basic', 'pro', 'premium'];
const SOURCES: readonly EntitlementSource[] = ['grant', 'purchase', 'none'];

const asTier = (v: unknown): PremiumTier | null =>
  typeof v === 'string' && (TIERS as readonly string[]).includes(v) ? (v as PremiumTier) : null;

const asSource = (v: unknown): EntitlementSource | null =>
  typeof v === 'string' && (SOURCES as readonly string[]).includes(v) ? (v as EntitlementSource) : null;

const validDate = (v: Date | string | null | undefined): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * The EFFECTIVE tier — server-wins merge (rules above). `snap` is null/cleared
 * for signed-out or never-verified users → localTier, unchanged from today.
 */
export function resolveEffectiveTier(
  localTier: PremiumTier,
  snap: ServerEntitlementSnapshot | null,
  now: Date,
): PremiumTier {
  // Rule 4/5: beta (gate off), signed-out, or never verified → local rules.
  if (!snap || snap.gateOn !== true) return localTier;
  if (validDate(snap.fetchedAt) == null) return localTier;

  // THE LOCK (rule 1): a definitive 'free' beats any local tier.
  if (snap.tier === 'free' || snap.source === 'none') return 'free';

  // Paid server tier. Missing/unparseable expiry: honor it (the server said
  // paid — fail open; covers the future no-expiry/lifetime purchase case).
  const exp = validDate(snap.expiresAt);
  if (exp == null) return snap.tier;

  // Rule 2: live entitlement (its own expiry is the only clock that matters).
  if (exp.getTime() > now.getTime()) return snap.tier;

  // Rule 3: expired but unverifiable while offline → grace, then genuinely over.
  if (now.getTime() - exp.getTime() < EXPIRED_SNAPSHOT_GRACE_MS) return snap.tier;
  return 'free';
}

// ── Server-payload validation ──────────────────────────────────────────────

export interface ServerEntitlementPayload {
  tier: PremiumTier;
  source: EntitlementSource;
  expiresAt: Date | null;
  gateOn: boolean;
  /** Client receive time — presence in the snapshot marks "server answered". */
  fetchedAt: Date;
}

/** Validate + normalize a get-entitlements response (or the equivalent fields
 *  of the my_entitlement RPC). Returns null on ANY malformed input — the
 *  caller then treats the fetch as transient and fails open on the cached
 *  snapshot (a mutant payload must never reconcile the store). Normalizes the
 *  two 'none' representations: tier 'free' ⇔ source 'none', expiry dropped. */
export function parseServerEntitlement(raw: unknown, receivedAt: Date): ServerEntitlementPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.ok !== true) return null;

  let tier = asTier(r.tier);
  if (!tier) return null;
  let source = asSource(r.source);
  if (!source) {
    // Tolerate a missing source (the my_entitlement RPC predates the field):
    // derive it — grants are the only paid source pre-RevenueCat.
    source = tier === 'free' ? 'none' : 'grant';
  }
  // Normalize contradictions both ways: 'free' is always source 'none' with no
  // expiry; a 'none' source is always tier 'free'.
  if (tier === 'free' || source === 'none') {
    tier = 'free';
    source = 'none';
  }

  let expiresAt: Date | null = null;
  if (tier !== 'free') {
    const rawExp = r.expiresAt ?? r.premium_until ?? r.premiumUntil ?? null;
    if (rawExp != null) {
      expiresAt = validDate(rawExp as Date | string);
      if (!expiresAt) return null; // garbage expiry on a paid tier → reject the payload
    }
  }

  return { tier, source, expiresAt, gateOn: r.gateOn === true || r.gate_on === true, fetchedAt: receivedAt };
}
