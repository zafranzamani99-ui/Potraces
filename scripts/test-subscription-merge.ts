/**
 * Regression test for the multi-device subscription merge (Bills audit — CRITICAL).
 *
 * WHY: subscriptions were merged with whole-row last-write-wins, unlike debts/goals/
 * savings which union their money-bearing child arrays. A concurrent edit on device B
 * could silently DROP a payment device A recorded — the expense transaction (a separate
 * row) survived, so the wallet stayed deducted while the bill showed unpaid, and the
 * double-pay guard (which reads paymentHistory) then let it be charged a SECOND time.
 * mergeSubscription now unions paymentHistory (undo is terminal) and re-derives the
 * schedule from the merged set.
 *
 * Run:  npx tsx scripts/test-subscription-merge.ts
 */
import { mergeSubscription, mergePaymentHistory } from '../src/services/personalSyncMappers';
import type { Subscription } from '../src/types';

const D = (s: string) => new Date(s.includes('T') ? s : s + 'T08:00:00.000Z');
const dayKey = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

let failed = false;
function check(label: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label} — ${detail}`); failed = true; }
}

const baseSub = (over: Partial<Subscription>): Subscription => ({
  id: 'sub1', name: 'Netflix', amount: 55, category: 'other', billingCycle: 'monthly',
  startDate: D('2026-05-01'), nextBillingDate: D('2026-06-01'),
  isActive: true, reminderDays: 3, isPaused: false, isInstallment: false,
  paymentHistory: [], createdAt: D('2026-05-01'), updatedAt: D('2026-05-01'),
  ...over,
} as Subscription);

const pay = (id: string, period: string, over: any = {}) =>
  ({ id, paidAt: D(period), periodDate: D(period), amount: 55, transactionId: `tx-${id}`, walletId: 'W', ...over });

// ── Scenario 1 — the double-charge bug: A marks paid, B edits note concurrently ──
console.log('Scenario 1 — concurrent mark-paid (A) + note edit (B) must NOT lose the payment:');
{
  // Local (device A): marked the Jun cycle paid → p2 added, pointer advanced to Jul.
  const local = baseSub({
    paymentHistory: [pay('p1', '2026-05-01'), pay('p2', '2026-06-01')],
    nextBillingDate: D('2026-07-01'),
    lastPaidAt: D('2026-06-01'),
    updatedAt: D('2026-06-01T10:00:00Z'),
  });
  // Remote (device B): only edited the note LATER (newer updatedAt), still has just p1,
  // pointer still at Jun. Whole-row LWW would pick this and drop p2.
  const remote = baseSub({
    note: 'family plan',
    paymentHistory: [pay('p1', '2026-05-01')],
    nextBillingDate: D('2026-06-01'),
    lastPaidAt: D('2026-05-01'),
    updatedAt: D('2026-06-01T11:00:00Z'), // newer than local
  });
  const merged = mergeSubscription(local, remote);
  const activeIds = (merged.paymentHistory ?? []).filter((p: any) => !p.undoneAt).map((p: any) => p.id).sort();
  check('p2 survives the merge (not dropped by LWW)', activeIds.join(',') === 'p1,p2', `got ${activeIds}`);
  check("B's newer scalar edit still wins (note kept)", merged.note === 'family plan');
  check('pointer re-derived past the paid Jun cycle → Jul', dayKey(new Date(merged.nextBillingDate)) === dayKey(D('2026-07-01')), String(merged.nextBillingDate));
  // The guard reads paymentHistory for the current cycle — with p2 present, a re-pay is blocked.
  const cycle = new Date(merged.nextBillingDate);
  const alreadyPaid = (merged.paymentHistory ?? []).some((p: any) => !p.undoneAt && dayKey(new Date(p.periodDate)) === dayKey(D('2026-06-01')));
  check('double-pay guard would see Jun as paid (no second charge)', alreadyPaid && dayKey(cycle) !== dayKey(D('2026-06-01')));
}

// ── Scenario 2 — undo is terminal: if either side undid a payment, it stays undone ──
console.log('Scenario 2 — undo on one device wins over a stale active copy:');
{
  const local = baseSub({
    paymentHistory: [pay('p1', '2026-05-01'), pay('p2', '2026-06-01', { undoneAt: D('2026-06-10') })],
    nextBillingDate: D('2026-06-01'),
    updatedAt: D('2026-06-10T09:00:00Z'),
  });
  const remote = baseSub({
    paymentHistory: [pay('p1', '2026-05-01'), pay('p2', '2026-06-01')], // stale: still active
    nextBillingDate: D('2026-07-01'),
    updatedAt: D('2026-06-11T09:00:00Z'), // newer, but must not resurrect p2
  });
  const merged = mergeSubscription(local, remote);
  const p2 = (merged.paymentHistory ?? []).find((p: any) => p.id === 'p2');
  check('p2 stays undone (undo is monotonic)', !!p2?.undoneAt);
  check('pointer re-exposes the now-unpaid Jun cycle', dayKey(new Date(merged.nextBillingDate)) === dayKey(D('2026-06-01')), String(merged.nextBillingDate));
}

// ── Scenario 3 — clean sync (identical histories) is a no-op on the schedule ──
console.log('Scenario 3 — non-conflicting identical rows merge without drift:');
{
  const sub = baseSub({
    paymentHistory: [pay('p1', '2026-05-01')],
    nextBillingDate: D('2026-06-01'),
    lastPaidAt: D('2026-05-01'),
    updatedAt: D('2026-05-02T09:00:00Z'),
  });
  const merged = mergeSubscription(sub, { ...sub });
  check('paymentHistory length unchanged', (merged.paymentHistory ?? []).length === 1);
  check('nextBillingDate unchanged', dayKey(new Date(merged.nextBillingDate)) === dayKey(D('2026-06-01')));
}

// ── Scenario 4 — installment completedInstallments re-derived from active count ──
console.log('Scenario 4 — installment count derives from surviving payments:');
{
  const local = baseSub({
    isInstallment: true, totalInstallments: 12, completedInstallments: 3,
    paymentHistory: [pay('p1', '2026-05-01'), pay('p2', '2026-06-01'), pay('p3', '2026-07-01')],
    nextBillingDate: D('2026-08-01'),
    updatedAt: D('2026-07-01T09:00:00Z'),
  });
  const remote = baseSub({
    isInstallment: true, totalInstallments: 12, completedInstallments: 1, // stale
    paymentHistory: [pay('p1', '2026-05-01')],
    nextBillingDate: D('2026-06-01'),
    updatedAt: D('2026-07-02T09:00:00Z'), // newer scalar
  });
  const merged = mergeSubscription(local, remote);
  check('completedInstallments = 3 active payments (not stale 1)', merged.completedInstallments === 3, String(merged.completedInstallments));
}

// ── mergePaymentHistory unit checks ──
console.log('Unit — mergePaymentHistory:');
{
  const a = [pay('p1', '2026-05-01')];
  const b = [pay('p1', '2026-05-01'), pay('p2', '2026-06-01')];
  check('union by id keeps both', mergePaymentHistory(a, b).length === 2);
  const undoneLocal = [pay('p1', '2026-05-01', { undoneAt: D('2026-05-10') })];
  const activeRemote = [pay('p1', '2026-05-01')];
  check('undoneAt from either side sticks', !!mergePaymentHistory(undoneLocal, activeRemote)[0].undoneAt);
}

console.log(failed ? '\nFAIL' : '\nPASS — subscription merge unions payments, keeps undo terminal, re-derives schedule, no double-charge.');
process.exit(failed ? 1 : 0);
