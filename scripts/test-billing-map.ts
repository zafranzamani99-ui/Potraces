/**
 * Billing map: (tier, billing) → package id, and active entitlements → store tier.
 * Pure module (type-only import) → tsx. Run: npm run test:billingmap
 */
import { packageIdFor, tierForEntitlements, PACKAGE_ID, ENTITLEMENT_ID } from '../src/services/billingMap';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

// ── package ids ──
check('basic monthly has a package', packageIdFor('basic', 'monthly') === 'potraces_basic_monthly');
check('basic yearly is null (monthly-only)', packageIdFor('basic', 'yearly') === null);
check('pro monthly + yearly both sold', !!packageIdFor('pro', 'monthly') && !!packageIdFor('pro', 'yearly'));
check('premium yearly maps', packageIdFor('premium', 'yearly') === 'potraces_premium_yearly');
check('all package ids are unique', new Set(Object.values(PACKAGE_ID).flatMap((m) => Object.values(m))).size === 5);

// ── entitlements → tier (highest wins; free when none) ──
check('no entitlements → free', tierForEntitlements([]) === 'free');
check('basic entitlement → basic', tierForEntitlements([ENTITLEMENT_ID.basic]) === 'basic');
check('pro entitlement → pro', tierForEntitlements([ENTITLEMENT_ID.pro]) === 'pro');
check('premium entitlement → premium', tierForEntitlements([ENTITLEMENT_ID.premium]) === 'premium');
check('overlapping basic+premium → premium (highest wins, never downgrades)',
  tierForEntitlements([ENTITLEMENT_ID.basic, ENTITLEMENT_ID.premium]) === 'premium');
check('basic+pro → pro', tierForEntitlements([ENTITLEMENT_ID.basic, ENTITLEMENT_ID.pro]) === 'pro');
check('unknown entitlement id → free', tierForEntitlements(['legacy_lifetime_xyz']) === 'free');

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`billing-map OK (${passed} checks)`);
process.exit(0);
