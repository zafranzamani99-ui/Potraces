/**
 * Tier limit table + gate helpers. Pure module (type-only import) so tsx can run it.
 * Mirrors docs/MONETIZATION_AND_PRICING.md (FEATURE-GATING LOCKED 2026-07-18).
 * Run: npm run test:tierlimits
 */
import {
  TIER_LIMITS,
  TIER_RANK,
  tierAtLeast,
  canCreate,
  remainingOf,
  FREE_TIER,
  PREMIUM_TIER,
} from '../src/constants/tiers';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

// ── Rank ordering ──
check('rank: free < basic < pro < premium',
  TIER_RANK.free < TIER_RANK.basic && TIER_RANK.basic < TIER_RANK.pro && TIER_RANK.pro < TIER_RANK.premium);
check('tierAtLeast: pro ≥ basic', tierAtLeast('pro', 'basic') === true);
check('tierAtLeast: basic ≥ pro is false', tierAtLeast('basic', 'pro') === false);
check('tierAtLeast: premium ≥ premium', tierAtLeast('premium', 'premium') === true);
check('tierAtLeast: free ≥ free', tierAtLeast('free', 'free') === true);

// ── Locked numbers (spot-check the doc) ──
check('free Echo = 30/mo', FREE_TIER.maxAiCallsPerMonth === 30);
check('free budgets = 5; savings/goals/subs = 3', FREE_TIER.maxBudgets === 5 && FREE_TIER.maxSavingsAccounts === 3 && FREE_TIER.maxGoals === 3 && FREE_TIER.maxSharedSubs === 3);
check('free wallets = 7, scans = 15', FREE_TIER.maxWallets === 7 && FREE_TIER.maxScansPerMonth === 15);
check('basic Echo 300 (10×), scans 75 (5×)', TIER_LIMITS.basic.maxAiCallsPerMonth === 300 && TIER_LIMITS.basic.maxScansPerMonth === 75);
check('basic wallets 13, budgets 10, savings/goals/subs 6', TIER_LIMITS.basic.maxWallets === 13 && TIER_LIMITS.basic.maxBudgets === 10 && TIER_LIMITS.basic.maxSavingsAccounts === 6);
check('basic wallets-per-type = 4 (free = 2)', TIER_LIMITS.basic.maxWalletsPerType === 4 && FREE_TIER.maxWalletsPerType === 2);
check('pro Echo 800, scans 150 (10×)', TIER_LIMITS.pro.maxAiCallsPerMonth === 800 && TIER_LIMITS.pro.maxScansPerMonth === 150);
check('premium Echo 1500, scans 300 (20×)', PREMIUM_TIER.maxAiCallsPerMonth === 1500 && PREMIUM_TIER.maxScansPerMonth === 300);
check('pro+ counts unlimited', TIER_LIMITS.pro.maxWallets === Infinity && TIER_LIMITS.premium.maxBudgets === Infinity && TIER_LIMITS.pro.maxGoals === Infinity);
check('metered stays CAPPED even on premium (not Infinity)', PREMIUM_TIER.maxScansPerMonth !== Infinity && PREMIUM_TIER.maxAiCallsPerMonth !== Infinity);

// ── Capability flags ──
check('cloud backup: free NO, basic YES', FREE_TIER.cloudBackup === false && TIER_LIMITS.basic.cloudBackup === true);
check('ask-Echo: free NO, basic YES', FREE_TIER.askEchoPerScreen === false && TIER_LIMITS.basic.askEchoPerScreen === true);
check('photo icons: free NO, basic YES', FREE_TIER.photoCategoryIcons === false && TIER_LIMITS.basic.photoCategoryIcons === true);
check('export data free (safety valve)', FREE_TIER.exportData === true);
check('google docs sync: basic NO, pro YES', TIER_LIMITS.basic.googleDocsSync === false && TIER_LIMITS.pro.googleDocsSync === true);

// ── canCreate at the boundary ──
check('free budgets: 4 ok, 5 blocked', canCreate('free', 'maxBudgets', 4) === true && canCreate('free', 'maxBudgets', 5) === false);
check('basic wallets-per-type: 3 ok, 4 blocked', canCreate('basic', 'maxWalletsPerType', 3) === true && canCreate('basic', 'maxWalletsPerType', 4) === false);
check('basic budgets: 9 ok, 10 blocked', canCreate('basic', 'maxBudgets', 9) === true && canCreate('basic', 'maxBudgets', 10) === false);
check('pro budgets: 999 still ok (unlimited)', canCreate('pro', 'maxBudgets', 999) === true);
check('premium scans capped: 299 ok, 300 blocked', canCreate('premium', 'maxScansPerMonth', 299) === true && canCreate('premium', 'maxScansPerMonth', 300) === false);

// ── Grandfather: an over-cap legacy count just blocks the next create (no throw) ──
check('grandfather: free user with 5 savings (cap 3) is blocked from a 6th, not crashed',
  canCreate('free', 'maxSavingsAccounts', 5) === false);

// ── remainingOf ──
check('remaining: free AI after 30 used = 0', remainingOf('free', 'maxAiCallsPerMonth', 30) === 0);
check('remaining: free AI after 10 used = 20', remainingOf('free', 'maxAiCallsPerMonth', 10) === 20);
check('remaining: premium scans after 100 used = 200', remainingOf('premium', 'maxScansPerMonth', 100) === 200);
check('remaining: pro wallets = Infinity (unlimited)', remainingOf('pro', 'maxWallets', 50) === Infinity);
check('remaining: never negative when over cap', remainingOf('free', 'maxSavingsAccounts', 9) === 0);

// ── Back-compat aliases ──
check('FREE_TIER === TIER_LIMITS.free', FREE_TIER === TIER_LIMITS.free);
check('PREMIUM_TIER === TIER_LIMITS.premium', PREMIUM_TIER === TIER_LIMITS.premium);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`tier-limits OK (${passed} checks)`);
process.exit(0);
