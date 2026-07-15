/**
 * Regression test for advanceBillingDate (Bills audit — month-end drift).
 *
 * WHY: the store used native setMonth(+1), which OVERFLOWS month-ends (Jan 31 → Mar 3),
 * while the screen/form compute the initial nextBillingDate with date-fns, which CLAMPS
 * (Jan 31 → Feb 28). The two silently disagreed for 29/30/31-day bills. advanceBillingDate
 * now clamps, so both agree.
 *
 * Run:  npx tsx scripts/test-billing-advance.ts
 */
import { advanceBillingDate } from '../src/utils/billing';

const D = (s: string) => new Date(s + 'T08:00:00.000Z');
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let failed = false;
function check(label: string, got: string, want: string) {
  if (got === want) console.log(`  ✓ ${label} → ${got}`);
  else { console.log(`  ✗ ${label} — got ${got}, want ${want}`); failed = true; }
}

console.log('Month-end clamping (must match date-fns addMonths, NOT native overflow):');
check('Jan 31 +1mo clamps to Feb 28', key(advanceBillingDate(D('2026-01-31'), 'monthly')), '2026-02-28');
check('Jan 31 2028 +1mo clamps to Feb 29 (leap)', key(advanceBillingDate(D('2028-01-31'), 'monthly')), '2028-02-29');
check('Feb 29 2028 +1yr clamps to Feb 28 2029', key(advanceBillingDate(D('2028-02-29'), 'yearly')), '2029-02-28');
check('Dec 31 +1mo → Jan 31 (no clamp needed)', key(advanceBillingDate(D('2026-12-31'), 'monthly')), '2027-01-31');
check('Nov 30 quarterly +3mo → Feb 28', key(advanceBillingDate(D('2026-11-30'), 'quarterly')), '2027-02-28');

console.log('Normal (non month-end) cases unchanged:');
check('monthly Jun 15 → Jul 15', key(advanceBillingDate(D('2026-06-15'), 'monthly')), '2026-07-15');
check('weekly Jun 15 → Jun 22', key(advanceBillingDate(D('2026-06-15'), 'weekly')), '2026-06-22');
check('quarterly Jan 15 → Apr 15', key(advanceBillingDate(D('2026-01-15'), 'quarterly')), '2026-04-15');
check('yearly Mar 10 → next Mar 10', key(advanceBillingDate(D('2026-03-10'), 'yearly')), '2027-03-10');

console.log('Time-of-day preserved:');
{
  const r = advanceBillingDate(new Date('2026-06-15T13:45:00.000Z'), 'monthly');
  // getHours/Minutes are local; just assert the advance kept a non-midnight time component consistent with input.
  const same = r.getMinutes() === new Date('2026-06-15T13:45:00.000Z').getMinutes();
  if (same) console.log('  ✓ minutes preserved'); else { console.log('  ✗ minutes not preserved'); failed = true; }
}

console.log(failed ? '\nFAIL' : '\nPASS — advanceBillingDate clamps month-ends and leaves normal dates intact.');
process.exit(failed ? 1 : 0);
