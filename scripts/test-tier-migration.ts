/**
 * Grandfather + tier-value migration contract.
 *
 * When free caps drop (budgets 5→3, savings 5→3, + NEW goals/subs caps of 3) a legacy
 * user may already be OVER the new cap. The contract: they KEEP everything they have and
 * are only blocked from creating MORE — there is no delete, ever. Also: legacy persisted
 * tier values ('free' | 'premium') must stay valid keys so store rehydration can't crash
 * on them (the new 'basic'/'pro' are additive).
 *
 * Pure module (type-only import) → runs under tsx. Run: npm run test:tiermigration
 */
import { TIER_LIMITS, TIER_RANK, canCreate, remainingOf } from '../src/constants/tiers';
import type { PremiumTier } from '../src/types';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

// ── Rehydration safety: legacy + new tier values are all valid keys ──
for (const legacy of ['free', 'premium'] as const) {
  check(`legacy persisted tier '${legacy}' still has limits + rank`,
    !!TIER_LIMITS[legacy] && typeof TIER_RANK[legacy] === 'number');
}
for (const added of ['basic', 'pro'] as const) {
  check(`new tier '${added}' present`, !!TIER_LIMITS[added] && typeof TIER_RANK[added] === 'number');
}

// ── Grandfather across every count resource × tier ──
const COUNT_KEYS = ['maxWallets', 'maxBudgets', 'maxSavingsAccounts', 'maxGoals', 'maxSharedSubs'] as const;
const TIERS: PremiumTier[] = ['free', 'basic', 'pro', 'premium'];

for (const tier of TIERS) {
  for (const key of COUNT_KEYS) {
    const cap = TIER_LIMITS[tier][key];
    if (cap === Infinity) {
      check(`${tier}.${key} unlimited → always allows`, canCreate(tier, key, 9999) === true);
      check(`${tier}.${key} unlimited → remaining Infinity`, remainingOf(tier, key, 9999) === Infinity);
    } else {
      check(`${tier}.${key} below cap (${cap - 1}) allows`, canCreate(tier, key, cap - 1) === true);
      check(`${tier}.${key} at cap (${cap}) blocks create`, canCreate(tier, key, cap) === false);
      // Legacy migration: already OVER the (now-lowered) cap → still blocked, never negative, never throws.
      check(`${tier}.${key} over cap (${cap + 3}) blocks create`, canCreate(tier, key, cap + 3) === false);
      check(`${tier}.${key} over cap → remaining clamps to 0`, remainingOf(tier, key, cap + 3) === 0);
    }
  }
}

// ── Concrete scenario: an old FREE user built 5 savings accounts under the OLD cap (5);
//    the new free cap is 3. They keep all 5; the 6th is blocked; no negatives. (Free budgets
//    stayed at 5, so that isn't a lowered-cap case.) ──
check('legacy free 5 savings (new cap 3) → keeps 5, 6th blocked', canCreate('free', 'maxSavingsAccounts', 5) === false);
check('legacy free 5 savings → remaining 0, not -2', remainingOf('free', 'maxSavingsAccounts', 5) === 0);
check('free budgets: 4 ok, 5 blocked (cap 5)', canCreate('free', 'maxBudgets', 4) === true && canCreate('free', 'maxBudgets', 5) === false);
check('legacy free 0 goals (new cap 3) → can still create', canCreate('free', 'maxGoals', 0) === true);

// ── Upgrading lifts the cap without touching data: the SAME over-old-cap count is now allowed. ──
check('free user with 5 budgets → upgrading to Basic (cap 10) unblocks creation', canCreate('basic', 'maxBudgets', 5) === true);
check('free user with 5 savings → upgrading to Pro (∞) unblocks creation', canCreate('pro', 'maxSavingsAccounts', 5) === true);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`tier-migration OK (${passed} checks)`);
process.exit(0);
