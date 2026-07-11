/**
 * Invariant guard for the wallet-balance model (recon item #4).
 *
 * The wallet-balance invariant is enforced by convention across many call sites:
 * `addTransaction` does NOT move the wallet (callers pair addToWallet/deductFromWallet
 * with each add; some callers — e.g. sampleData — instead set balances via
 * initialBalance and must NOT get an auto-delta), while `updateTransaction` and
 * `deleteTransaction` DO move the wallet (applyOld/applyNew reversal). A bug in that
 * store-owned edit/delete delta logic is invisible until the next sync-time reconcile
 * self-heals it — exactly the "masked money bug" the audit flagged as untested.
 *
 * This locks it: drive add(+caller delta) → amount edit → type flip → wallet reassign
 * → delete through the REAL stores and assert reconcileWalletBalances() reports ZERO
 * drift after every step (live wallet.balance == recomputed-from-ledger). Any regression
 * that makes the store's edit/delete delta disagree with reconcile fails here instead of
 * silently corrupting a balance in production.
 *
 * Run: npx tsx scripts/test-transaction-wallet-invariant.ts
 */
import { reconcileWalletBalances } from '../src/utils/walletReconcile';
import { useWalletStore } from '../src/store/walletStore';
import { usePersonalStore } from '../src/store/personalStore';
import { useDebtStore } from '../src/store/debtStore';

const D = new Date('2026-06-20T08:00:00.000Z');
const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name} — ${detail}`); console.log(`  ✗ ${name} — ${detail}`); }
}

const A = 'inv-A';
const B = 'inv-B';
const mkWallet = (id: string, bal: number) => ({
  id, name: id, type: 'cash', balance: bal, initialBalance: bal,
  icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D,
} as any);

function reset(aBal: number, bBal: number) {
  useWalletStore.setState({ wallets: [mkWallet(A, aBal), mkWallet(B, bBal)], transfers: [] });
  usePersonalStore.setState({ transactions: [], goals: [], _deletedTransactionIds: [] } as any);
  useDebtStore.setState({ debts: [] } as any);
}

// reconcile only returns DRIFTED wallets, so "neither A nor B present" ⇔ live == reconciled.
function noDrift(label: string) {
  const drifted = reconcileWalletBalances().filter((r) => r.walletId === A || r.walletId === B);
  check(label, drifted.length === 0,
    drifted.map((d) => `${d.walletId}: live ${d.stored} vs ledger ${d.computed}`).join('; '));
}

const wallets = () => useWalletStore.getState();
const balOf = (id: string) => wallets().wallets.find((w) => w.id === id)!.balance;

// Mirror a real caller: record the transaction, then apply its one wallet delta.
function addTx(amount: number, type: 'income' | 'expense', walletId: string): string {
  const id = usePersonalStore.getState().addTransaction({
    amount, category: 'other', description: 't', date: D, type, mode: 'personal', walletId, inputMethod: 'manual',
  } as any);
  if (type === 'expense') wallets().deductFromWallet(walletId, amount);
  else wallets().addToWallet(walletId, amount);
  return id;
}
const update = (id: string, u: any) => usePersonalStore.getState().updateTransaction(id, u);
const del = (id: string) => usePersonalStore.getState().deleteTransaction(id);

// ── Scenario 1: add → amount edit → type flip → delete (single wallet) ──
reset(100, 200);
noDrift('start: no txns, no drift');
const id1 = addTx(30, 'expense', A);
noDrift('after add expense 30 to A (A→70)');
check('live A = 70', balOf(A) === 70, `got ${balOf(A)}`);
update(id1, { amount: 50 });
noDrift('after edit amount 30→50 (A→50)');
check('live A = 50', balOf(A) === 50, `got ${balOf(A)}`);
update(id1, { type: 'income' });
noDrift('after flip expense→income (A→150)');
check('live A = 150', balOf(A) === 150, `got ${balOf(A)}`);
del(id1);
noDrift('after delete (A→100)');
check('live A back to 100', balOf(A) === 100, `got ${balOf(A)}`);

// ── Scenario 2: wallet reassignment A → B ──
reset(100, 200);
const id2 = addTx(40, 'expense', A);
noDrift('after add expense 40 to A (A→60)');
update(id2, { walletId: B });
noDrift('after reassign A→B (A→100, B→160)');
check('live A restored to 100', balOf(A) === 100, `got ${balOf(A)}`);
check('live B debited to 160', balOf(B) === 160, `got ${balOf(B)}`);
del(id2);
noDrift('after delete on B (B→200)');
check('live B back to 200', balOf(B) === 200, `got ${balOf(B)}`);

// ── Scenario 3: income add → amount edit → delete ──
reset(100, 200);
const id3 = addTx(25, 'income', A);
noDrift('after add income 25 to A (A→125)');
update(id3, { amount: 60 });
noDrift('after edit income 25→60 (A→160)');
check('live A = 160', balOf(A) === 160, `got ${balOf(A)}`);
del(id3);
noDrift('after delete income (A→100)');
check('live A back to 100', balOf(A) === 100, `got ${balOf(A)}`);

if (failures.length) { console.error('\nFAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`\ntransaction-wallet-invariant OK (${passed} checks)`);
// Exit before zustand-persist's async AsyncStorage write fires (web fallback throws
// `window is not defined` under tsx/node) — same convention as test-wallet-reconcile.
process.exit(0);
