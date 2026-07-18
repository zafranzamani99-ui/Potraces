// ─── BILLING MAP (pure) ──────────────────────────────────────────────────
// The mapping between the paywall's (tier, billing) selection, the store PRODUCT
// identifiers, and the RevenueCat ENTITLEMENT identifiers. Kept pure (type-only import,
// no react-native-purchases) so scripts/test-billing-map.ts can run it under tsx — the
// native wrapper (billing.ts) imports this.
//
// TO SHIP: create these product ids in App Store Connect + Play Console, add them to a
// RevenueCat "default" offering as packages with these identifiers, and create the three
// entitlements below. Keep the strings in sync with the dashboard.

import type { PremiumTier } from '../types';

export type PaidTier = 'basic' | 'pro' | 'premium';
export type BillingPeriod = 'monthly' | 'yearly';

// RevenueCat package identifiers within the current offering. Basic is monthly-only
// (matches the paywall — no yearly Basic), so it has no `yearly` entry.
export const PACKAGE_ID: Record<PaidTier, Partial<Record<BillingPeriod, string>>> = {
  basic: { monthly: 'potraces_basic_monthly' },
  pro: { monthly: 'potraces_pro_monthly', yearly: 'potraces_pro_yearly' },
  premium: { monthly: 'potraces_premium_monthly', yearly: 'potraces_premium_yearly' },
};

/** The package id for a (tier, billing) pair, or null if that combo isn't sold. */
export function packageIdFor(tier: PaidTier, billing: BillingPeriod): string | null {
  return PACKAGE_ID[tier][billing] ?? null;
}

// RevenueCat entitlement identifiers — one per paid tier.
export const ENTITLEMENT_ID: Record<PaidTier, string> = {
  basic: 'basic',
  pro: 'pro',
  premium: 'premium',
};

const RANK: Record<PremiumTier, number> = { free: 0, basic: 1, pro: 2, premium: 3 };

/**
 * Resolve the store tier from the ACTIVE entitlement identifiers RevenueCat reports for a
 * customer. Picks the HIGHEST tier they're entitled to (so overlapping/legacy entitlements
 * never downgrade a Premium user); 'free' when none are active.
 */
export function tierForEntitlements(activeIds: string[]): PremiumTier {
  let best: PremiumTier = 'free';
  (Object.entries(ENTITLEMENT_ID) as [PaidTier, string][]).forEach(([tier, ent]) => {
    if (activeIds.includes(ent) && RANK[tier] > RANK[best]) best = tier;
  });
  return best;
}
