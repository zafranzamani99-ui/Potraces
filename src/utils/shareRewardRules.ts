// ─── SHARE & EARN PRO — pure reward/abuse rules ─────────────────────────────
// Single source of truth for the Share & Earn Pro engine (AUGUST.md, decided
// 2026-07-29). Pure module: no RN/Supabase imports, so the tsx test and any
// surface can use it. The edge function `share-reward-submit` re-implements
// the SAME platform host rules inline (Deno can't import app code) — keep the
// two in sync. Covered by scripts/test-sharereward.ts.
//
// Locked decisions (owner + build open calls):
//  - Tiers: 30+ likes → 1 month Pro · 100+ likes → 1 year Pro · viral → forever.
//    There is NO automatic like→tier mapping on the server: a human reviews
//    every post and picks the tier ("forever" is a judgement call for clearly
//    viral posts, not a fixed like count). tierForLikes() is only a UI hint.
//  - "Forever" = 3650 days (~10 years). The entitlement ledger enforces
//    days <= 3700 for EVERY source (table CHECK + grant_premium guard), so
//    this is the largest round figure that fits without relaxing a global
//    invariant shared by redeem/referral grants.
//  - Year cap: 12 share grants / rolling 365d — mirrors the referral number
//    but is an INDEPENDENT counter (source='share_reward' grants only), so a
//    user can earn both referral and share rewards in the same year.
//  - Account-age gate: account must be ≥7 days old to submit (same vintage as
//    the referral qualify gate) — stops fresh-account farming.

export type SharePlatform = 'instagram' | 'red' | 'reddit' | 'facebook' | 'x' | 'threads';

export const SHARE_PLATFORMS: SharePlatform[] = ['instagram', 'red', 'reddit', 'facebook', 'x', 'threads'];

/** Accepted hosts per platform (exact match or any subdomain). */
export const PLATFORM_HOSTS: Record<SharePlatform, string[]> = {
  instagram: ['instagram.com', 'instagr.am'],
  red: ['xiaohongshu.com', 'xhslink.com'],
  reddit: ['reddit.com', 'redd.it'],
  facebook: ['facebook.com', 'fb.watch', 'fb.com'],
  x: ['x.com', 'twitter.com'],
  threads: ['threads.net'],
};

export type ShareRewardTier = 'month' | 'year' | 'forever';

/** Grant length per tier (days). Mirrored by app_config share_reward_*_days. */
export const SHARE_REWARD_DAYS: Record<ShareRewardTier, number> = {
  month: 30,
  year: 365,
  forever: 3650, // ledger hard max is 3700 — see header note
};

/** Max share-reward grants per user per rolling 365 days (independent of the
 *  referral cap — separate counter by design). */
export const SHARE_REWARD_CAP_PER_YEAR = 12;

/** Minimum account age before a user may submit (days). */
export const SHARE_MIN_ACCOUNT_AGE_DAYS = 7;

/** Like thresholds for the two fixed tiers (review hint; "forever" has none). */
export const LIKE_TIER_MONTH = 30;
export const LIKE_TIER_YEAR = 100;

/** UI hint only — the reviewer's tier pick is authoritative. */
export function tierForLikes(likes: number): ShareRewardTier | null {
  if (!Number.isFinite(likes) || likes < LIKE_TIER_MONTH) return null;
  return likes >= LIKE_TIER_YEAR ? 'year' : 'month';
}

export function capReached(grantsLast365: number, cap: number = SHARE_REWARD_CAP_PER_YEAR): boolean {
  return cap > 0 && grantsLast365 >= cap;
}

export function accountOldEnough(
  createdAt: Date,
  now: Date = new Date(),
  minDays: number = SHARE_MIN_ACCOUNT_AGE_DAYS,
): boolean {
  return now.getTime() - createdAt.getTime() >= minDays * 24 * 60 * 60 * 1000;
}

// ── Post-URL validation + normalization ─────────────────────────────────────

export type PostUrlVerdict =
  | { ok: true; urlKey: string }
  | { ok: false; reason: 'invalid_url' | 'wrong_platform' };

const hostMatches = (host: string, allowed: string): boolean =>
  host === allowed || host.endsWith('.' + allowed);

/** Validate a pasted post URL for a platform and reduce it to a canonical
 *  dedupe key: lowercase host + path (no protocol/query/hash/trailing slash).
 *  Rejects non-https URLs, bare homepages (a post must have a path), and URLs
 *  whose host doesn't belong to the chosen platform. */
export function validatePostUrl(platform: SharePlatform, raw: string): PostUrlVerdict {
  const input = (raw ?? '').trim();
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
  if (!PLATFORM_HOSTS[platform].some((allowed) => hostMatches(host, allowed))) {
    return { ok: false, reason: 'wrong_platform' };
  }
  const path = u.pathname.replace(/\/+$/, '');
  if (!path) return { ok: false, reason: 'invalid_url' }; // bare homepage ≠ a post
  // Dedupe key: 'www.' is canonicalized away (www.instagram.com/p/X and
  // instagram.com/p/X are the same post); other subdomains are kept.
  return { ok: true, urlKey: host.replace(/^www\./, '') + path };
}
