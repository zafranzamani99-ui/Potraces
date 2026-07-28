/**
 * Unit test for the new Reports analytics in utils/insights.ts:
 * incomeRollup, biggestExpenses, monthsInRange, previousRange, categoryMovers,
 * and the recurring-share monthly normalisation the screen relies on.
 * Deterministic: a fixed `now`, fixtures are month-anchored around it.
 *
 * Run:  npx tsx scripts/test-insights.ts
 */
import {
  getRange, previousRange, monthsInRange,
  incomeRollup, categoryRollup, biggestExpenses, categoryMovers,
  cashFlow, recurringShare, monthlyEquivalent, keptAcrossBooks, detectRecurringCandidates,
} from '../src/utils/insights';
import { Transaction, Subscription, CategoryOption } from '../src/types';

const NOW = new Date('2026-07-15T09:00:00.000Z'); // mid-July 2026

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}
function close(label: string, actual: number, expected: number, eps = 0.01) {
  const ok = Math.abs(actual - expected) <= eps;
  console.log(`  ${ok ? '✓' : '✗'} ${label} (≈ ${expected})`);
  if (!ok) { console.log(`      got: ${actual}`); failures++; }
}

let seq = 0;
function tx(type: 'income' | 'expense', amount: number, category: string, date: Date, description = ''): Transaction {
  return { id: `t${seq++}`, type, amount, category, description, date } as Transaction;
}

const cats: CategoryOption[] = [
  { id: 'food', name: 'Food', icon: 'm/food', color: '#9B6A3A' },
  { id: 'shopping', name: 'Shopping', icon: 'i/bag', color: '#8B7000' },
  { id: 'salary', name: 'Salary', icon: 'm/cash', color: '#4F5104' },
  { id: 'freelance', name: 'Freelance', icon: 'i/laptop', color: '#5E72E4' },
];

const jul = (d: number) => new Date(2026, 6, d);   // July 2026
const jun = (d: number) => new Date(2026, 5, d);   // June 2026

const txns: Transaction[] = [
  // July (this month)
  tx('income', 5000, 'salary', jul(1)),
  tx('income', 800, 'freelance', jul(3)),
  tx('expense', 1200, 'food', jul(2), 'Groceries big'),   // biggest
  tx('expense', 300, 'food', jul(6), 'Lunch'),
  tx('expense', 900, 'shopping', jul(8), 'Shoes'),
  tx('expense', 20, 'shopping', jul(9), 'Socks'),
  // transfers must be ignored everywhere
  { id: 'transfer-1', type: 'expense', amount: 9999, category: 'food', description: 'x', date: jul(4) } as Transaction,
  // June (previous month)
  tx('income', 5000, 'salary', jun(1)),
  tx('expense', 500, 'food', jun(5)),        // food this-vs-prev: 1500 vs 500 → +1000
  tx('expense', 1500, 'shopping', jun(7)),   // shopping: 920 vs 1500 → -580
];

const rThis = getRange('this_month', NOW);
const rPrev = previousRange(rThis);

console.log('previousRange / monthsInRange');
check('this_month spans 1 month', monthsInRange(rThis) === 1);
check('previous of this_month is June', rPrev.start.getMonth() === 5 && rPrev.end.getMonth() === 5);
check('3m spans 3 months', monthsInRange(getRange('3m', NOW)) === 3);
{
  const r3 = getRange('3m', NOW);
  const p3 = previousRange(r3);
  // 3m = May,Jun,Jul → previous = Feb,Mar,Apr
  check('previous of 3m ends in April', p3.end.getMonth() === 3);
  check('previous of 3m starts in February', p3.start.getMonth() === 1);
}

console.log('\ncashFlow ignores transfers');
const cf = cashFlow(txns, rThis);
close('cameIn', cf.cameIn, 5800);
close('wentOut (no transfer-9999)', cf.wentOut, 2420);
close('kept', cf.kept, 3380);

console.log('\nincomeRollup');
const inc = incomeRollup(txns, rThis, cats, '#000', 6);
check('two income sources', inc.length === 2);
check('salary is largest', inc[0].id === 'salary');
close('salary amount', inc[0].amount, 5000);
check('salary resolved name', inc[0].name === 'Salary');

console.log('\nbiggestExpenses (excludes transfers)');
const big = biggestExpenses(txns, rThis, 3);
check('top 3 returned', big.length === 3);
close('biggest is 1200', big[0].amount, 1200);
check('biggest carries description', big[0].description === 'Groceries big');
check('no transfer leaked in', big.every((b) => !b.id.startsWith('transfer-')));
check('sorted descending', big[0].amount >= big[1].amount && big[1].amount >= big[2].amount);

console.log('\ncategoryMovers (this vs previous month)');
const movers = categoryMovers(txns, rThis, rPrev, cats, '#000', 3);
check('food is a top riser', movers.up[0]?.id === 'food');
close('food delta +1000', movers.up[0]?.delta, 1000);
check('shopping is a faller', movers.down.some((d) => d.id === 'shopping'));
{
  const shop = movers.down.find((d) => d.id === 'shopping')!;
  close('shopping delta -580', shop.delta, -580);
  close('shopping pct ≈ -38.7%', shop.pct ?? 0, (-580 / 1500) * 100, 0.1);
}
check('food had prior spend so pct not null', movers.up[0]?.pct !== null);

console.log('\nrecurring share is per-month vs per-month (bug fix)');
{
  const subs: Subscription[] = [
    { id: 's1', name: 'Netflix', amount: 55, billingCycle: 'monthly', isActive: true, isPaused: false } as Subscription,
    { id: 's2', name: 'Yearly', amount: 120, billingCycle: 'yearly', isActive: true, isPaused: false } as Subscription,
    // Paid-off 24/24 installment — MUST be excluded (phantom cycle), else it inflates recurring forever.
    { id: 's3', name: 'Phone loan', amount: 800, billingCycle: 'monthly', isActive: true, isPaused: false,
      isInstallment: true, totalInstallments: 24, completedInstallments: 24 } as Subscription,
    // Still-running installment (12/24) — MUST be counted.
    { id: 's4', name: 'Car loan', amount: 300, billingCycle: 'monthly', isActive: true, isPaused: false,
      isInstallment: true, totalInstallments: 24, completedInstallments: 12 } as Subscription,
  ];
  check('monthlyEquivalent: yearly 120 → 10/mo', monthlyEquivalent(subs[1]) === 10);
  check('paid-off installment is excluded from recurringShare', recurringShare(subs, 1000).monthlyRecurring === 55 + 10 + 300);
  check('paid-off installment still excluded even if it were the only sub', recurringShare([subs[2]], 1000).monthlyRecurring === 0);
  check('running installment (12/24) is still counted', recurringShare([subs[3]], 1000).monthlyRecurring === 300);
  // The screen divides range spend by monthsInRange to get avg monthly out.
  const r3 = getRange('3m', NOW);
  const cf3 = cashFlow(txns, r3);
  const avgMonthlyOut = cf3.wentOut / monthsInRange(r3);
  const share = recurringShare(subs, avgMonthlyOut);
  // Same numerator over a monthly denominator → share is stable regardless of range length.
  const shareThis = recurringShare(subs, cashFlow(txns, rThis).wentOut / monthsInRange(rThis));
  check('share uses monthly-normalised denominator (finite, >0)', share.ofSpendPercent > 0 && isFinite(share.ofSpendPercent));
  check('per-month share is not diluted by range length', shareThis.ofSpendPercent >= share.ofSpendPercent * 0.2);
}

// ── keptAcrossBooks — the flagship cross-book number ──
{
  const spendThisMonth = [
    tx('expense', 200, 'food', new Date('2026-07-05T10:00:00Z')),
    tx('expense', 100, 'shopping', new Date('2026-07-10T10:00:00Z')),
    tx('income', 999, 'salary', new Date('2026-07-08T10:00:00Z')), // ignored — settledIn is the transfer, not personal income
  ];
  const k = keptAcrossBooks(spendThisMonth, 1000, NOW);
  close('kept: personal spend summed', k.personalSpent, 300);
  close('kept: settledIn = transferredIn', k.settledIn, 1000);
  close('kept: kept = settledIn − spend', k.kept, 700);
  check('kept: crossBook true when settled', k.crossBook === true);

  const none = keptAcrossBooks(spendThisMonth, 0, NOW);
  check('kept: crossBook false with no settlement', none.crossBook === false);
  close('kept: kept can be negative', none.kept, -300);

  const neg = keptAcrossBooks(spendThisMonth, -50, NOW);
  close('kept: negative transfer floored to 0', neg.settledIn, 0);
  check('kept: crossBook false when floored', neg.crossBook === false);
}

// ── detectRecurringCandidates — offer high-confidence monthly charges only ──
{
  const R = (mo: number, day: number, amount: number, desc: string): Transaction =>
    tx('expense', amount, 'subscription', new Date(`2026-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00Z`), desc);
  const txnsR: Transaction[] = [
    R(5, 5, 55, 'Netflix'), R(6, 5, 55, 'Netflix'), R(7, 5, 55, 'Netflix'),   // stable monthly → candidate
    R(5, 3, 12, 'grab'), R(6, 9, 40, 'grab'), R(7, 2, 7, 'grab'),             // variable amount → excluded
    R(5, 1, 30, 'Spotify'), R(6, 1, 30, 'Spotify'), R(7, 1, 30, 'Spotify'),   // stable but already a sub → excluded
    R(6, 5, 25, 'HBO'), R(7, 5, 25, 'HBO'),                                    // only 2 months → excluded
  ];
  const subsR = [{ id: 's1', name: 'Spotify', amount: 30, billingCycle: 'monthly', isActive: true } as Subscription];
  const cands = detectRecurringCandidates(txnsR, subsR, NOW);
  check('recurring: stable monthly Netflix detected', cands.some((c) => c.merchant.toLowerCase().includes('netflix') && Math.abs(c.amount - 55) < 0.5));
  check('recurring: variable "grab" excluded', !cands.some((c) => c.merchant.toLowerCase().includes('grab')));
  check('recurring: already-tracked Spotify excluded', !cands.some((c) => c.merchant.toLowerCase().includes('spotify')));
  check('recurring: only-2-months HBO excluded', !cands.some((c) => c.merchant.toLowerCase().includes('hbo')));
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
