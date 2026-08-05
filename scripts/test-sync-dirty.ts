/**
 * Dirty-tracking guard (incremental-sync Stage 1 — see docs/INCREMENTAL_SYNC_PLAN.md).
 *
 * The per-store _dirty*Ids sets are DORMANT (nothing consumes them yet), but they are the
 * foundation Stage 2 relies on: once push becomes dirty-only, a mutator that FORGETS to mark
 * a row dirty means that edit never syncs — the #1 risk. This locks the guarantees:
 *   • every add/edit marks the row dirty
 *   • clear*Dirty empties the sets
 *   • a bulk setState (exactly how sync applies cloud data) NEVER marks dirty (no false churn)
 *   • a delete never leaves a LIVE dirty id (wallet/transfer deletes scrub; others rely on it)
 *   • wallet deletion's cross-store side-effects (debt payment rewrite) ARE marked dirty
 *
 * Run: npx tsx scripts/test-sync-dirty.ts
 */
import { usePersonalStore } from '../src/store/personalStore';
import { useWalletStore } from '../src/store/walletStore';
import { useDebtStore } from '../src/store/debtStore';
import { planPushRows, planDirtyClear } from '../src/services/personalSyncDirty';

const D = new Date('2026-06-20T08:00:00.000Z');
const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name} — ${detail}`); console.log(`  ✗ ${name} — ${detail}`); }
}
const has = (arr: string[] | undefined, id: string) => (arr ?? []).includes(id);
const mkWallet = (id: string, bal: number) => ({
  id, name: id, type: 'cash', balance: bal, initialBalance: bal,
  icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D,
} as any);

// ── personalStore: transactions ──────────────────────────────────────────────
usePersonalStore.setState({ transactions: [], subscriptions: [], budgets: [], goals: [] } as any);
usePersonalStore.getState().clearPersonalDirty?.();

const txId = usePersonalStore.getState().addTransaction({
  amount: 10, category: 'other', description: 't', date: D, type: 'expense', mode: 'personal', inputMethod: 'manual',
} as any);
check('addTransaction marks the new tx dirty', has(usePersonalStore.getState()._dirtyTransactionIds, txId));

usePersonalStore.getState().clearPersonalDirty?.();
check('clearPersonalDirty empties the transaction dirty set',
  (usePersonalStore.getState()._dirtyTransactionIds ?? []).length === 0);

usePersonalStore.getState().updateTransaction(txId, { amount: 20 });
check('updateTransaction marks the edited tx dirty', has(usePersonalStore.getState()._dirtyTransactionIds, txId));

// Sync applies cloud data via a bulk setState — it must NOT mark those rows dirty (no false churn).
usePersonalStore.getState().clearPersonalDirty?.();
usePersonalStore.setState({
  transactions: [
    { id: 'cloud-1', amount: 5, category: 'other', description: 'c', date: D, type: 'expense', mode: 'personal', createdAt: D, updatedAt: D } as any,
    ...usePersonalStore.getState().transactions,
  ],
});
check('bulk setState (how sync applies cloud rows) does NOT mark dirty',
  (usePersonalStore.getState()._dirtyTransactionIds ?? []).length === 0);

// Deleting a (currently-clean) tx must not leave a live dirty id for it.
usePersonalStore.getState().deleteTransaction(txId);
check('deleteTransaction leaves no live dirty id for the deleted tx',
  !has(usePersonalStore.getState()._dirtyTransactionIds, txId));

// ── walletStore: delete scrub + cross-store debt side-effect ──────────────────
usePersonalStore.setState({ transactions: [], subscriptions: [], budgets: [], goals: [] } as any);
useWalletStore.setState({
  wallets: [mkWallet('W', 0)], transfers: [],
  _dirtyWalletIds: ['W'], _deletedWalletIds: [], selectedWalletId: null,
} as any);
useDebtStore.setState({
  debts: [{ id: 'D1', payments: [{ walletId: 'W', amount: 5 }], updatedAt: D } as any],
  splits: [], contacts: [], _dirtyDebtIds: [], _deletedDebtIds: [],
} as any);

useWalletStore.getState().deleteWallet('W');
check('deleteWallet scrubs the deleted wallet out of the dirty set',
  !has(useWalletStore.getState()._dirtyWalletIds, 'W'));
check('deleteWallet tombstones the deleted wallet',
  has(useWalletStore.getState()._deletedWalletIds, 'W'));
check('deleteWallet marks the side-effected debt dirty (cross-store edit must push)',
  has(useDebtStore.getState()._dirtyDebtIds, 'D1'));

// ── walletStore: transfer delete scrub ────────────────────────────────────────
useWalletStore.setState({
  wallets: [mkWallet('W1', 100), mkWallet('W2', 0)],
  transfers: [{ id: 'T1', fromWalletId: 'W1', toWalletId: 'W2', amount: 10, kind: 'transfer', date: D, createdAt: D } as any],
  _dirtyTransferIds: ['T1'], _deletedTransferIds: [], selectedWalletId: null,
} as any);
useWalletStore.getState().deleteTransfer('T1');
check('deleteTransfer scrubs the deleted transfer out of the dirty set',
  !has(useWalletStore.getState()._dirtyTransferIds, 'T1'));
check('deleteTransfer tombstones the deleted transfer',
  has(useWalletStore.getState()._deletedTransferIds, 'T1'));

// ── Stage 2 pure rules: planPushRows / planDirtyClear (personalSyncDirty) ────
const rowsX = [
  { id: 'a', updatedAt: 1 },
  { id: 'b', updatedAt: 2 },
  { id: 'c', updatedAt: 3 },
];
check('full push returns all live rows minus deleted',
  JSON.stringify(planPushRows(rowsX, { incremental: false, dirtyIds: [], deletedIds: ['c'] }).map((r) => r.id)) === '["a","b"]');
check('incremental push returns dirty minus deleted (ghost-row guard)',
  JSON.stringify(planPushRows(rowsX, { incremental: true, dirtyIds: ['b', 'c'], deletedIds: ['c'] }).map((r) => r.id)) === '["b"]');
check('incremental push with empty dirty pushes nothing',
  planPushRows(rowsX, { incremental: true, dirtyIds: [] }).length === 0);

const PT1 = new Date('2026-06-01T00:00:00Z');
const PT2 = new Date('2026-06-02T00:00:00Z');
const liveAfterPush = [
  { id: 'a', updatedAt: PT1 }, // pushed, unchanged
  { id: 'b', updatedAt: PT2 }, // pushed, edited mid-push (stamp moved)
  { id: 'c', updatedAt: PT1 }, // not pushed, still live
  // 'd' — dirty id whose row vanished mid-push
];
const cleared = planDirtyClear(
  ['a', 'b', 'c', 'd'],
  liveAfterPush,
  [
    { id: 'a', updatedAt: PT1 },
    { id: 'b', updatedAt: PT1 },
  ],
);
check('cleanly-pushed row clears dirty', !cleared.includes('a'));
check('row edited mid-push keeps dirty (race-safe clear)', cleared.includes('b'));
check('live row marked dirty mid-push (not pushed) keeps dirty', cleared.includes('c'));
check('dirty id whose row vanished is dropped', !cleared.includes('d'));

// ── Stage 2 load-bearing fixes: demote LWW + contact-rename propagation ──────
useWalletStore.setState({
  wallets: [
    { ...mkWallet('WA', 0), isDefault: true, updatedAt: D },
    { ...mkWallet('WB', 0), isDefault: false, updatedAt: D },
  ],
  transfers: [], _dirtyWalletIds: [], _deletedWalletIds: [], selectedWalletId: null,
} as any);
useWalletStore.getState().setDefaultWallet('WB');
const waAfter = useWalletStore.getState().wallets.find((x) => x.id === 'WA')!;
const wbAfter = useWalletStore.getState().wallets.find((x) => x.id === 'WB')!;
check('setDefaultWallet promotes the new default', wbAfter.isDefault === true);
check('setDefaultWallet demotes the old default', waAfter.isDefault === false);
check('setDefaultWallet bumps BOTH updatedAt stamps (a stale demote loses LWW)',
  waAfter.updatedAt > D && wbAfter.updatedAt > D);
check('setDefaultWallet marks both wallets dirty',
  has(useWalletStore.getState()._dirtyWalletIds, 'WA') && has(useWalletStore.getState()._dirtyWalletIds, 'WB'));

useDebtStore.setState({
  debts: [{ id: 'DC1', contact: { id: 'C1', name: 'Ali' }, payments: [], updatedAt: D } as any],
  splits: [{ id: 'SP1', participants: [{ contact: { id: 'C1', name: 'Ali' } }], updatedAt: D } as any],
  contacts: [{ id: 'C1', name: 'Ali' } as any],
  _dirtyDebtIds: [], _dirtySplitIds: [], _deletedContactIds: [],
} as any);
useDebtStore.getState().deleteContact('C1');
const dc1 = useDebtStore.getState().debts.find((x) => x.id === 'DC1')!;
const sp1 = useDebtStore.getState().splits.find((x) => x.id === 'SP1')!;
check('deleteContact renames the contact inside debts/splits',
  (dc1.contact as any).name === '(deleted)' && (sp1.participants[0].contact as any).name === '(deleted)');
check('deleteContact bumps the renamed debt updatedAt + marks it dirty (rename propagates)',
  dc1.updatedAt > D && has(useDebtStore.getState()._dirtyDebtIds, 'DC1'));
check('deleteContact bumps the renamed split updatedAt + marks it dirty',
  sp1.updatedAt > D && has(useDebtStore.getState()._dirtySplitIds, 'SP1'));
check('deleteContact tombstones the contact', has(useDebtStore.getState()._deletedContactIds, 'C1'));

// ── result ───────────────────────────────────────────────────────────────────
if (failures.length) {
  console.log(`\nsync-dirty FAILED — ${failures.length} failing:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nsync-dirty OK (${passed} checks)`);
// Exit before zustand-persist's async AsyncStorage write fires (web fallback throws
// `window is not defined` under tsx/node) — same convention as test-transaction-wallet-invariant.
process.exit(0);
