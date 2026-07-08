/**
 * Regression test for undoSubscriptionPayment out-of-order undo (audit #7).
 *
 * WHY: undo used to blindly roll nextBillingDate back ONE cycle — only correct for the
 * latest payment. It now re-derives the schedule from the remaining active payments'
 * periodDates, so undoing an OLDER/middle payment re-exposes exactly that cycle (a gap),
 * and completedInstallments is recomputed from the active count. The linked expense is
 * still refunded once and tombstoned.
 *
 * Run:  npx tsx scripts/test-undo-payment.ts
 */
import { usePersonalStore } from '../src/store/personalStore';
import { useWalletStore } from '../src/store/walletStore';

const D = (s: string) => new Date(s + 'T08:00:00.000Z');
const dayKey = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

let failed = false;
function check(label: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label} — ${detail}`); failed = true; }
}

function seed() {
  useWalletStore.setState({
    wallets: [{ id: 'W', name: 'Cash', type: 'cash', balance: 1000, initialBalance: 1000, icon: 'home', color: '#000', createdAt: D('2026-01-01'), updatedAt: D('2026-01-01') } as any],
    transfers: [],
  });
  const mkPay = (id: string, period: string, tx: string) => ({ id, paidAt: D(period), periodDate: D(period), amount: 100, transactionId: tx, walletId: 'W' });
  usePersonalStore.setState({
    subscriptions: [{
      id: 'sub1', name: 'Test', amount: 100, category: 'other', billingCycle: 'monthly',
      startDate: D('2026-07-01'), nextBillingDate: D('2026-10-01'),
      isActive: true, reminderDays: 3, isPaused: false,
      isInstallment: true, totalInstallments: 12, completedInstallments: 3,
      paymentHistory: [mkPay('p1', '2026-07-01', 'tx1'), mkPay('p2', '2026-08-01', 'tx2'), mkPay('p3', '2026-09-01', 'tx3')],
      createdAt: D('2026-07-01'), updatedAt: D('2026-07-01'),
    } as any],
    transactions: [
      { id: 'tx1', amount: 100, type: 'expense', category: 'other', description: 'Test', date: D('2026-07-01'), mode: 'personal', walletId: 'W', inputMethod: 'manual', createdAt: D('2026-07-01'), updatedAt: D('2026-07-01') } as any,
      { id: 'tx2', amount: 100, type: 'expense', category: 'other', description: 'Test', date: D('2026-08-01'), mode: 'personal', walletId: 'W', inputMethod: 'manual', createdAt: D('2026-08-01'), updatedAt: D('2026-08-01') } as any,
      { id: 'tx3', amount: 100, type: 'expense', category: 'other', description: 'Test', date: D('2026-09-01'), mode: 'personal', walletId: 'W', inputMethod: 'manual', createdAt: D('2026-09-01'), updatedAt: D('2026-09-01') } as any,
    ],
  } as any);
}

// ── Scenario 1: undo the MIDDLE payment (Aug / p2) — re-exposes the Aug gap ──
console.log('Scenario 1 — undo middle payment (Aug):');
seed();
usePersonalStore.getState().undoSubscriptionPayment('sub1', 'p2');
let sub = usePersonalStore.getState().subscriptions.find((s) => s.id === 'sub1') as any;
check('nextBillingDate re-exposes the undone Aug cycle', dayKey(new Date(sub.nextBillingDate)) === dayKey(D('2026-08-01')), `got ${new Date(sub.nextBillingDate).toISOString()}`);
check('p2 marked undone', !!sub.paymentHistory.find((p: any) => p.id === 'p2')?.undoneAt);
check('active payments = 2 (p1, p3)', sub.paymentHistory.filter((p: any) => !p.undoneAt).length === 2);
check('completedInstallments recomputed to 2', sub.completedInstallments === 2, `got ${sub.completedInstallments}`);
check('wallet refunded once (1000→1100)', useWalletStore.getState().wallets.find((w) => w.id === 'W')?.balance === 1100, `got ${useWalletStore.getState().wallets.find((w) => w.id === 'W')?.balance}`);
check('linked tx2 removed', !usePersonalStore.getState().transactions.find((t) => t.id === 'tx2'));
check('tx2 tombstoned in _deletedTransactionIds', ((usePersonalStore.getState() as any)._deletedTransactionIds || []).includes('tx2'));

// ── Scenario 2: undo the LATEST payment (Sep / p3) — behaves like the old one-cycle rollback ──
console.log('Scenario 2 — undo latest payment (Sep):');
seed();
usePersonalStore.getState().undoSubscriptionPayment('sub1', 'p3');
sub = usePersonalStore.getState().subscriptions.find((s) => s.id === 'sub1') as any;
check('nextBillingDate rolls back to Sep (latest cycle)', dayKey(new Date(sub.nextBillingDate)) === dayKey(D('2026-09-01')), `got ${new Date(sub.nextBillingDate).toISOString()}`);
check('completedInstallments = 2', sub.completedInstallments === 2, `got ${sub.completedInstallments}`);

// ── Scenario 3: undo ALL — back to the first cycle (Jul) ──
console.log('Scenario 3 — undo all three, oldest-unpaid = Jul:');
seed();
usePersonalStore.getState().undoSubscriptionPayment('sub1', 'p3');
usePersonalStore.getState().undoSubscriptionPayment('sub1', 'p2');
usePersonalStore.getState().undoSubscriptionPayment('sub1', 'p1');
sub = usePersonalStore.getState().subscriptions.find((s) => s.id === 'sub1') as any;
check('nextBillingDate = Jul (first cycle)', dayKey(new Date(sub.nextBillingDate)) === dayKey(D('2026-07-01')), `got ${new Date(sub.nextBillingDate).toISOString()}`);
check('completedInstallments = 0', sub.completedInstallments === 0, `got ${sub.completedInstallments}`);

// ── Scenario 4: undo a MIDDLE payment then re-pay it — pointer must SKIP the still-paid
//    later cycle (Sep) so it never parks on an already-paid cycle (audit #1/#2 hardening). ──
console.log('Scenario 4 — undo Aug then re-pay Aug, pointer skips still-paid Sep:');
seed();
usePersonalStore.getState().undoSubscriptionPayment('sub1', 'p2'); // undo Aug → nextBilling=Aug, Sep still active
usePersonalStore.getState().markSubscriptionPaid('sub1', 'tx-re', 'W'); // re-pay Aug
sub = usePersonalStore.getState().subscriptions.find((s) => s.id === 'sub1') as any;
check('nextBillingDate skips paid Sep → Oct', dayKey(new Date(sub.nextBillingDate)) === dayKey(D('2026-10-01')), `got ${new Date(sub.nextBillingDate).toISOString()}`);
check('Aug + Sep both active again (3 active incl re-pay: p1,p3,new)', sub.paymentHistory.filter((p: any) => !p.undoneAt).length === 3);

console.log('');
if (failed) { console.log('FAIL — out-of-order undo does not re-derive the schedule correctly.'); process.exit(1); }
else { console.log('PASS — undo re-derives the schedule for any payment (latest, middle, all, re-pay-skips-paid).'); process.exit(0); }
