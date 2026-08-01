/**
 * Regression tests for the 2026-07-30 stall money fixes (WAVE_TRACKER #6) + the
 * 2026-08-01 self-review follow-ups. Drives the REAL useStallStore.
 *
 *  6b  removeSale must subtract totalCard (deleting a card sale used to leave it inflated).
 *  6c  getSessionEconomics.expectedCash must subtract cash expenses (else false "short").
 *  6d  keptIsApprox flags a session that mixes real costs with uncosted (custom) revenue.
 *  6f  addSale / addCustomSale / collectPreOrder must be NO-OPS while the session is paused
 *      (the guard that, combined with the SellScreen prompt, stops charge-then-drop).
 *
 * Run:  npx tsx scripts/test-stall-money.ts
 */
import { useStallStore } from '../src/store/stallStore';

const D = new Date('2026-07-30T02:00:00.000Z');

let failed = false;
function check(label: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label} — ${detail}`); failed = true; }
}

const PROD = { id: 'p1', name: 'Kopi', price: 5, isActive: true, totalSold: 0, unitCost: 2, createdAt: D, updatedAt: D } as any;

function reset(sessionOverrides: any = {}, extra: any = {}) {
  useStallStore.setState({
    products: [PROD],
    preOrders: [],
    sessions: [{
      id: 's1', startedAt: D, isActive: true,
      sales: [], productsSnapshot: [],
      totalRevenue: 0, totalCash: 0, totalQR: 0, totalCard: 0,
      ...sessionOverrides,
    }],
    activeSessionId: 's1',
    ...extra,
  } as any);
}
const S = () => useStallStore.getState();
const sess = () => S().sessions.find((s) => s.id === 's1')!;

// ─── 6b — removeSale subtracts totalCard ──────────────────────────────────────
console.log('6b — removeSale card totals');
reset();
const cardId = S().addSale({ productId: 'p1', productName: 'Kopi', quantity: 1, unitPrice: 5, total: 5, paymentMethod: 'card' } as any);
check('card sale bumps totalCard to 5', sess().totalCard === 5, `got ${sess().totalCard}`);
check('card sale bumps totalRevenue to 5', sess().totalRevenue === 5, `got ${sess().totalRevenue}`);
S().removeSale(cardId as string);
check('removeSale returns totalCard to 0 (was the bug: stayed 5)', (sess().totalCard || 0) === 0, `got ${sess().totalCard}`);
check('removeSale returns totalRevenue to 0', sess().totalRevenue === 0, `got ${sess().totalRevenue}`);

// ─── 6c — expectedCash subtracts cash expenses ────────────────────────────────
console.log('6c — expected cash minus expenses');
reset({ startingFloat: 50 });
S().addSale({ productId: 'p1', productName: 'Kopi', quantity: 1, unitPrice: 100, total: 100, paymentMethod: 'cash' } as any);
S().addExpense({ label: 'gas', amount: 30 } as any);
const econ6c = S().getSessionEconomics('s1');
check('expectedCash = float 50 + cash 100 − expense 30 = 120 (was the bug: 150)', econ6c.expectedCash === 120, `got ${econ6c.expectedCash}`);

// ─── 6d — keptIsApprox ────────────────────────────────────────────────────────
console.log('6d — keptIsApprox flag');
// A: costed product sale + an uncosted custom sale + an expense → approximate
reset();
S().addSale({ productId: 'p1', productName: 'Kopi', quantity: 1, unitPrice: 5, total: 5, paymentMethod: 'cash' } as any);
S().addCustomSale({ amount: 10, paymentMethod: 'cash', label: 'ayam' } as any); // no cost
S().addExpense({ label: 'x', amount: 1 } as any);
check('mixed costed + custom revenue → keptIsApprox true', S().getSessionEconomics('s1').keptIsApprox === true, 'expected true');
// B: only fully-costed sales + expense → exact
reset();
S().addSale({ productId: 'p1', productName: 'Kopi', quantity: 1, unitPrice: 5, total: 5, paymentMethod: 'cash' } as any);
S().addExpense({ label: 'x', amount: 1 } as any);
check('all sales costed → keptIsApprox false', S().getSessionEconomics('s1').keptIsApprox === false, 'expected false');

// ─── 6f — paused guards are NO-OPS ────────────────────────────────────────────
console.log('6f — paused session blocks recording');
reset({ paused: true });
const pausedSale = S().addSale({ productId: 'p1', productName: 'Kopi', quantity: 1, unitPrice: 5, total: 5, paymentMethod: 'card' } as any);
check('addSale returns undefined while paused', pausedSale === undefined, `got ${pausedSale}`);
check('no sale recorded while paused', sess().sales.length === 0 && sess().totalRevenue === 0, `sales=${sess().sales.length} rev=${sess().totalRevenue}`);
const pausedCustom = S().addCustomSale({ amount: 10, paymentMethod: 'cash', label: 'x' } as any);
check('addCustomSale returns undefined while paused', pausedCustom === undefined, `got ${pausedCustom}`);
check('still no sale recorded', sess().sales.length === 0, `sales=${sess().sales.length}`);
// collectPreOrder while paused must not consume the order or record a ghost sale
useStallStore.setState({ preOrders: [{ id: 'po1', status: 'pending', items: [{ productId: 'p1', name: 'Kopi', unitPrice: 5, quantity: 1 }], createdAt: D } as any] } as any);
const collected = S().collectPreOrder('po1');
check('collectPreOrder returns false while paused', collected === false, `got ${collected}`);
check('pre-order stays pending (no ghost collect)', S().preOrders.find((p) => p.id === 'po1')?.status === 'pending', 'expected pending');

// Positive control: same op succeeds once resumed
reset({ paused: false });
const okSale = S().addSale({ productId: 'p1', productName: 'Kopi', quantity: 1, unitPrice: 5, total: 5, paymentMethod: 'cash' } as any);
check('addSale records normally when NOT paused', typeof okSale === 'string' && sess().totalRevenue === 5, `id=${okSale} rev=${sess().totalRevenue}`);

console.log('');
if (failed) { console.log('FAIL — stall money regression.'); process.exit(1); }
else { console.log('PASS — all stall money assertions hold.'); process.exit(0); }
