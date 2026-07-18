// ─── BILLING (RevenueCat wrapper) ────────────────────────────────────────
// The native surface for in-app subscriptions. Pure mapping lives in ./billingMap.
//
// DORMANT until configured: `isBillingConfigured()` is false while the API keys are
// empty, and every entry point below returns early in that state — so the paywall keeps
// its local-unlock fallback and nothing touches the (possibly un-built) native module.
//
// TO GO LIVE:
//   1. Create a RevenueCat project; add the iOS + Android apps; copy the PUBLIC SDK keys.
//   2. Set EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY (app config / EAS secrets).
//   3. Create the 5 products (see billingMap PACKAGE_ID) in App Store Connect + Play
//      Console, add them to a RevenueCat offering, and create the 3 entitlements.
//   4. Rebuild the native app (react-native-purchases is installed but needs a build).
//   5. Call initBilling() once on launch (see App bootstrap).

import { Platform } from 'react-native';
import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { usePremiumStore } from '../store/premiumStore';
import { packageIdFor, tierForEntitlements, PaidTier, BillingPeriod } from './billingMap';

// PUBLIC (publishable) SDK keys — safe to ship in the bundle. Billing stays OFF until set.
const RC_KEYS = {
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '',
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '',
};

let configured = false;

/** True once real API keys exist for this platform. Gates every native call below. */
export function isBillingConfigured(): boolean {
  return !!(Platform.OS === 'ios' ? RC_KEYS.ios : RC_KEYS.android);
}

/** Configure the SDK + keep the store tier in lock-step with the live entitlement
 *  (renewals, expiry, refunds, cross-device). Safe no-op until keys are set. */
export async function initBilling(): Promise<void> {
  if (configured || !isBillingConfigured()) return;
  const apiKey = Platform.OS === 'ios' ? RC_KEYS.ios : RC_KEYS.android;
  Purchases.configure({ apiKey });
  configured = true;
  Purchases.addCustomerInfoUpdateListener(syncFromCustomerInfo);
  try {
    syncFromCustomerInfo(await Purchases.getCustomerInfo());
  } catch {
    // offline / not signed in — the listener will catch up later
  }
}

function syncFromCustomerInfo(info: CustomerInfo): void {
  const activeIds = Object.keys(info.entitlements.active);
  usePremiumStore.getState().setTier(tierForEntitlements(activeIds));
}

async function findPackage(tier: PaidTier, billing: BillingPeriod): Promise<PurchasesPackage | null> {
  const id = packageIdFor(tier, billing);
  if (!id) return null;
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];
  return pkgs.find((p) => p.identifier === id || p.product.identifier === id) ?? null;
}

/**
 * Purchase the selected tier. Resolves true when an entitlement is now active (tier synced
 * to the store). Returns false when billing isn't configured (caller does the local unlock).
 * Throws the RevenueCat error on real failures — the caller must swallow `userCancelled`.
 */
export async function purchaseTier(tier: PaidTier, billing: BillingPeriod): Promise<boolean> {
  if (!isBillingConfigured()) return false;
  const pkg = await findPackage(tier, billing);
  if (!pkg) throw new Error(`No RevenueCat package for ${tier}/${billing}`);
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  syncFromCustomerInfo(customerInfo);
  return Object.keys(customerInfo.entitlements.active).length > 0;
}

/** Restore prior purchases (App Store requirement). True when something was restored. */
export async function restorePurchases(): Promise<boolean> {
  if (!isBillingConfigured()) return false;
  const info = await Purchases.restorePurchases();
  syncFromCustomerInfo(info);
  return Object.keys(info.entitlements.active).length > 0;
}
