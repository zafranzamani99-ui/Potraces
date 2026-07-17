/**
 * Regression tests for goal contribution/withdrawal money math (pure).
 * Guards the money-leak fix: contributing to a full/over-target goal must NOT
 * debit more than the room left, and currentAmount must always equal the sum of
 * applied contributions (never exceed the target).
 *
 * Run:  npx tsx scripts/test-goal-math.ts   (or: npm run test:goalmath)
 */
import { applyGoalContribution, applyGoalWithdrawal } from '../src/utils/money';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

console.log('applyGoalContribution');

// Normal contribution under target.
{
  const { actualAmount, newCurrentAmount } = applyGoalContribution(100, 1000, 200);
  check('under target → full amount applied (200)', actualAmount === 200);
  check('under target → currentAmount advances (300)', newCurrentAmount === 300);
}

// THE LEAK: contribution that overshoots the target is capped to the room left.
{
  const { actualAmount, newCurrentAmount } = applyGoalContribution(900, 1000, 500);
  check('overshoot → applied capped to room (100, not 500)', actualAmount === 100);
  check('overshoot → currentAmount stops at target (1000)', newCurrentAmount === 1000);
}

// THE LEAK: contributing to an already-full goal absorbs NOTHING.
{
  const { actualAmount, newCurrentAmount } = applyGoalContribution(1000, 1000, 200);
  check('full goal → nothing applied (0)', actualAmount === 0);
  check('full goal → currentAmount unchanged (1000)', newCurrentAmount === 1000);
}

// Over-target goal (defensive) — remaining is negative, still absorbs nothing.
{
  const { actualAmount, newCurrentAmount } = applyGoalContribution(1100, 1000, 50);
  check('over-target → nothing applied (0)', actualAmount === 0);
  check('over-target → currentAmount unchanged (1100)', newCurrentAmount === 1100);
}

// Float precision — lands exactly on target, no drift.
{
  const { actualAmount, newCurrentAmount } = applyGoalContribution(33.33, 100, 66.67);
  check('float → applied 66.67', actualAmount === 66.67);
  check('float → lands on 100 (no drift)', newCurrentAmount === 100);
}

// Invariant: across a sequence, currentAmount === sum(actualAmounts) and never
// exceeds target — even when the last deposit overshoots.
{
  const target = 1000;
  let current = 0;
  let sumApplied = 0;
  for (const amt of [300, 400, 500 /* overshoots by 200 */, 250 /* full → 0 */]) {
    const { actualAmount, newCurrentAmount } = applyGoalContribution(current, target, amt);
    sumApplied += actualAmount;
    current = newCurrentAmount;
  }
  check('invariant: currentAmount === sum(applied) (1000)', current === 1000 && sumApplied === 1000);
  check('invariant: never exceeds target', current <= target);
}

console.log('applyGoalWithdrawal');

// Normal withdrawal.
{
  const { actualAmount, newCurrentAmount } = applyGoalWithdrawal(500, 200);
  check('under balance → 200 out, 300 left', actualAmount === 200 && newCurrentAmount === 300);
}

// Withdraw more than saved → capped to balance, floors at 0.
{
  const { actualAmount, newCurrentAmount } = applyGoalWithdrawal(500, 600);
  check('over balance → capped to 500, floors at 0', actualAmount === 500 && newCurrentAmount === 0);
}

// Nothing saved → nothing out.
{
  const { actualAmount, newCurrentAmount } = applyGoalWithdrawal(0, 100);
  check('empty goal → nothing withdrawn (0/0)', actualAmount === 0 && newCurrentAmount === 0);
}

if (failures) {
  console.error(`\nFAIL — ${failures} goal-math assertion(s) failed`);
  process.exit(1);
}
console.log('\n✓ all goal-math assertions passed');
