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
