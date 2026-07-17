/**
 * billing — pure billing-cycle date math for recurring commitments.
 *
 * Kept dependency-free (only the Date built-in) so it can be shared by the store,
 * the sync merge, and unit tests alike, and so every advance of a billing date
 * uses the SAME clamping rule. Native setMonth(+1) overflows month-ends (Jan 31 →
 * Mar 3); the screen/form compute the initial nextBillingDate with date-fns, which
 * CLAMPS (Jan 31 → Feb 28) — so the store advance must clamp identically or the two
 * silently disagree for 29/30/31-day bills.
 */

export type BillingCycleLike = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | string;

/** Add `n` months, clamping the day to the target month's last day (date-fns semantics). */
export const addMonthsClamped = (d: Date, n: number): Date => {
  const day = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
};

/** Advance a billing date by exactly one cycle. */
export const advanceBillingDate = (d: Date, cycle: BillingCycleLike): Date => {
  switch (cycle) {
    case 'weekly':    { const r = new Date(d); r.setDate(r.getDate() + 7); return r; }
    case 'quarterly': return addMonthsClamped(d, 3);
    case 'yearly':    return addMonthsClamped(d, 12);
    default:          return addMonthsClamped(d, 1);
  }
};
