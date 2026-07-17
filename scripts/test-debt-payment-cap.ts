/**
 * Regression test for the business-mode tip double-count via updatePayment.
 *
 * WHY: addPayment caps a payment's stored `amount` to the debt's remaining and lets
 * the caller keep any overpayment as `tipAmount` separately. Business-mode
 * walletReconcile counts `amount + tipAmount`. updatePayment did NOT apply the same
 * cap, so editing (or consolidating) a payment into an overpayment stored the tip in
 * BOTH `amount` and `tipAmount` — reconcile then double-counted it and inflated the
 * wallet by the tip on every sync. This asserts updatePayment now caps `amount` to the
 * debt's remaining capacity (excluding this payment), keeping the tip out of `amount`.
 *
 * Run:  npx tsx scripts/test-debt-payment-cap.ts
 */
import { useDebtStore } from '../src/store/debtStore';

const D = new Date('2026-06-20T08:00:00.000Z');
let failed = false;
function check(label: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label} — ${detail}`); failed = true; }
}

const contact = { id: 'c1', name: 'Ali', isFromPhone: false };

// ── addPayment already caps: amount over remaining is capped, tip kept separate ──
useDebtStore.setState({ debts: [], splits: [] } as any);
useDebtStore.setState({
  debts: [{
    id: 'd1', contact, type: 'they_owe', totalAmount: 100, paidAmount: 0, status: 'pending',
    payments: [], mode: 'business', createdAt: D, updatedAt: D,
  } as any],
} as any);
const payId = useDebtStore.getState().addPayment('d1', { amount: 120, tipAmount: 20, date: D } as any);
{
  const d = useDebtStore.getState().debts.find((x) => x.id === 'd1')!;
  const p = d.payments.find((x) => x.id === payId)!;
  check('addPayment caps stored amount to remaining (100)', Math.abs(p.amount - 100) < 0.005, `amount=${p.amount}`);
  check('addPayment keeps tip separate (20)', Math.abs((p.tipAmount ?? 0) - 20) < 0.005, `tip=${p.tipAmount}`);
  check('addPayment reconcile-value amount+tip = wallet charge (120)', Math.abs(p.amount + (p.tipAmount ?? 0) - 120) < 0.005, `sum=${p.amount + (p.tipAmount ?? 0)}`);
}

// ── updatePayment: editing a partial payment INTO an overpayment must cap too ──
useDebtStore.setState({ debts: [], splits: [] } as any);
useDebtStore.setState({
  debts: [{
    id: 'd2', contact, type: 'they_owe', totalAmount: 100, paidAmount: 50, status: 'partial',
    payments: [{ id: 'p2', amount: 50, date: D, createdAt: D } as any], mode: 'business', createdAt: D, updatedAt: D,
  } as any],
} as any);
// Overpay this single payment to 120 (debt total 100) with a 20 tip.
useDebtStore.getState().updatePayment('d2', 'p2', { amount: 120, tipAmount: 20 } as any);
{
  const d = useDebtStore.getState().debts.find((x) => x.id === 'd2')!;
  const p = d.payments.find((x) => x.id === 'p2')!;
  check('updatePayment caps stored amount to remaining (100)', Math.abs(p.amount - 100) < 0.005, `amount=${p.amount} (bug leaves 120)`);
  check('updatePayment keeps tip separate (20)', Math.abs((p.tipAmount ?? 0) - 20) < 0.005, `tip=${p.tipAmount}`);
  check('updatePayment reconcile-value amount+tip = wallet charge (120)', Math.abs(p.amount + (p.tipAmount ?? 0) - 120) < 0.005, `sum=${p.amount + (p.tipAmount ?? 0)} (bug gives 140 → wallet drifts +20)`);
  check('paidAmount does not exceed total', d.paidAmount <= 100 + 0.005, `paidAmount=${d.paidAmount}`);
}

// ── updatePayment cap accounts for OTHER payments on the debt ──
useDebtStore.setState({ debts: [], splits: [] } as any);
useDebtStore.setState({
  debts: [{
    id: 'd3', contact, type: 'i_owe', totalAmount: 100, paidAmount: 30, status: 'partial',
    payments: [
      { id: 'p3a', amount: 30, date: D, createdAt: D } as any,
      { id: 'p3b', amount: 0, date: D, createdAt: D } as any,
    ], mode: 'business', createdAt: D, updatedAt: D,
  } as any],
} as any);
// Editing p3b up to 200 must cap to remaining capacity = 100 - 30 (other payment) = 70.
useDebtStore.getState().updatePayment('d3', 'p3b', { amount: 200, tipAmount: 130 } as any);
{
  const d = useDebtStore.getState().debts.find((x) => x.id === 'd3')!;
  const p = d.payments.find((x) => x.id === 'p3b')!;
  check('updatePayment caps to capacity net of other payments (70)', Math.abs(p.amount - 70) < 0.005, `amount=${p.amount}`);
}

console.log('');
if (failed) { console.log('FAIL — updatePayment does not cap amount; business-mode tip double-counts.'); process.exit(1); }
else { console.log('PASS — payment amount is capped to remaining; tip stays out of amount.'); process.exit(0); }
