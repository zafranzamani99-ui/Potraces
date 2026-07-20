// ─── TIER LIMITS (pure) ──────────────────────────────────────────────────
// Single source of truth for what each subscription tier allows.
//
// PURE module: type-only import, NO asset require()s — so scripts/test-tier-limits.ts
// can run it under tsx. (constants/premium.ts can't be imported by a test: it require()s
// ~39 logo PNGs.) premium.ts re-exports everything here, so existing
// `import { FREE_TIER } from '../constants/premium'` sites keep working unchanged.
//
// Numbers mirror docs/MONETIZATION_AND_PRICING.md (FEATURE-GATING LOCKED 2026-07-18).
// Principle: COUNT features (wallets/budgets/savings/goals/subs) go unlimited at Pro+ —
// cheap to give. COST-METERED features (scans, AI) stay CAPPED even at Premium — each
// costs real compute; that ceiling protects margin.

import type { PremiumTier } from '../types';

export interface TierLimits {
  // Count caps (Infinity = unlimited)
  maxWallets: number;
  maxWalletsPerType: number;
  maxBudgets: number;
  maxSavingsAccounts: number;
  maxGoals: number;
  maxSharedSubs: number;
  maxActivePlaybooks: number;
  maxSavedPlaybooks: number;
  /** Collectz session CREATIONS per calendar week. Joining someone's session
   *  is always free — only organizing is capped. */
  maxCollectzSessionsPerWeek: number;
  // Metered per month — stay finite even on Premium (see principle above)
  maxScansPerMonth: number;
  maxAiCallsPerMonth: number;
  // Capabilities
  exportData: boolean;
  googleDocsSync: boolean;
  cloudBackup: boolean;
  askEchoPerScreen: boolean;
  photoCategoryIcons: boolean;
}

export const TIER_LIMITS: Record<PremiumTier, TierLimits> = {
  free: {
    maxWallets: 7, maxWalletsPerType: 2,
    maxBudgets: 5, maxSavingsAccounts: 3, maxGoals: 3, maxSharedSubs: 3,
    maxActivePlaybooks: 2, maxSavedPlaybooks: 5,
    maxCollectzSessionsPerWeek: 2,
    maxScansPerMonth: 15, maxAiCallsPerMonth: 30,
    exportData: true, googleDocsSync: false,
    cloudBackup: false, askEchoPerScreen: false, photoCategoryIcons: false,
  },
  basic: {
    maxWallets: 13, maxWalletsPerType: 4,
    maxBudgets: 10, maxSavingsAccounts: 6, maxGoals: 6, maxSharedSubs: 6,
    maxActivePlaybooks: 2, maxSavedPlaybooks: Infinity,
    maxCollectzSessionsPerWeek: Infinity,
    maxScansPerMonth: 75, maxAiCallsPerMonth: 300,
    exportData: true, googleDocsSync: false,
    cloudBackup: true, askEchoPerScreen: true, photoCategoryIcons: true,
  },
  pro: {
    maxWallets: Infinity, maxWalletsPerType: Infinity,
    maxBudgets: Infinity, maxSavingsAccounts: Infinity, maxGoals: Infinity, maxSharedSubs: Infinity,
    maxActivePlaybooks: 2, maxSavedPlaybooks: Infinity,
    maxCollectzSessionsPerWeek: Infinity,
    maxScansPerMonth: 150, maxAiCallsPerMonth: 800,
    exportData: true, googleDocsSync: true,
    cloudBackup: true, askEchoPerScreen: true, photoCategoryIcons: true,
  },
  premium: {
    maxWallets: Infinity, maxWalletsPerType: Infinity,
    maxBudgets: Infinity, maxSavingsAccounts: Infinity, maxGoals: Infinity, maxSharedSubs: Infinity,
    maxActivePlaybooks: 2, maxSavedPlaybooks: Infinity,
    maxCollectzSessionsPerWeek: Infinity,
    maxScansPerMonth: 300, maxAiCallsPerMonth: 1500,
    exportData: true, googleDocsSync: true,
    cloudBackup: true, askEchoPerScreen: true, photoCategoryIcons: true,
  },
};

// Ordered rank for "tier ≥ X" gates (a feature opens at a minimum tier).
export const TIER_RANK: Record<PremiumTier, number> = { free: 0, basic: 1, pro: 2, premium: 3 };

export function tierAtLeast(tier: PremiumTier, min: PremiumTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

type CountKey =
  | 'maxWallets' | 'maxWalletsPerType' | 'maxBudgets' | 'maxSavingsAccounts'
  | 'maxGoals' | 'maxSharedSubs' | 'maxActivePlaybooks' | 'maxSavedPlaybooks'
  | 'maxScansPerMonth' | 'maxAiCallsPerMonth' | 'maxCollectzSessionsPerWeek';

export function limitFor(tier: PremiumTier, key: CountKey): number {
  return TIER_LIMITS[tier][key];
}

/**
 * True if a user on `tier` may create one more of `key` (currentCount = what they have now).
 * Naturally GRANDFATHERS: an existing over-cap count (e.g. a legacy free user with 5 savings
 * when the free cap is now 3) simply returns false — it blocks the NEXT create and never
 * deletes what's already there.
 */
export function canCreate(tier: PremiumTier, key: CountKey, currentCount: number): boolean {
  return currentCount < TIER_LIMITS[tier][key];
}

/** Remaining allowance for a metered/count resource (Infinity stays Infinity). */
export function remainingOf(tier: PremiumTier, key: CountKey, used: number): number {
  const limit = TIER_LIMITS[tier][key];
  return limit === Infinity ? Infinity : Math.max(0, limit - used);
}

// Back-compat aliases — existing display sites read these directly.
export const FREE_TIER = TIER_LIMITS.free;
export const PREMIUM_TIER = TIER_LIMITS.premium;
