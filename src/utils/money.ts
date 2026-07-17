/**
 * Round a monetary amount to 2 decimal places (sen precision).
 *
 * Order/cost totals are derived from unitPrice * quantity and user input, which
 * can introduce sub-sen floating-point values. Rounding at the WRITE sites keeps
 * stored amounts clean, so the many downstream sums (Dashboard, season stats,
 * insights, exports) all round to the same displayed value instead of drifting
 * apart by a sen between screens (HIGH-4).
 */
export const roundMoney = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Cap a goal contribution to the room left before the target. A full or
 * over-target goal absorbs NOTHING (`actualAmount === 0`).
 *
 * This is the invariant that prevents money leaks: `currentAmount` never exceeds
 * `targetAmount`, and callers must debit a wallet / record a contribution by AT
 * MOST `actualAmount` — so `sum(contributions) === currentAmount` always holds
 * and a wallet can never lose money the goal didn't absorb.
 */
export function applyGoalContribution(
  currentAmount: number,
  targetAmount: number,
  amount: number,
): { actualAmount: number; newCurrentAmount: number } {
  const remaining = roundMoney(targetAmount - currentAmount);
  const actualAmount = roundMoney(Math.min(amount, Math.max(0, remaining)));
  const newCurrentAmount =
    actualAmount <= 0
      ? roundMoney(currentAmount)
      : roundMoney(Math.min(currentAmount + actualAmount, targetAmount));
  return { actualAmount, newCurrentAmount };
}

/** Cap a goal withdrawal to what's actually saved (floor at 0). */
export function applyGoalWithdrawal(
  currentAmount: number,
  amount: number,
): { actualAmount: number; newCurrentAmount: number } {
  const actualAmount = roundMoney(Math.max(0, Math.min(amount, currentAmount)));
  const newCurrentAmount = roundMoney(Math.max(0, currentAmount - actualAmount));
  return { actualAmount, newCurrentAmount };
}
