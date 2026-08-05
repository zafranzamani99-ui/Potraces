/**
 * Tests for the import batch store (Phase 0 of import reconciliation):
 * record a batch, undo deletes its transactions AND reverses the wallet delta
 * (via personalStore.deleteTransaction), and the store keeps only the last 20.
 *
 * Uses the real zustand stores in node, the same way test-undo-payment.ts does.
 * Run: npm run test:importbatch
 */
import './test-storage-shim'; // MUST be first — AsyncStorage fallback for Node (see file)
import { useImportBatchStore } from '../src/store/importBatchStore';
import { usePersonalStore } from '../src/store/personalStore';
import { useWalletStore } from '../src/store/walletStore';

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}

// ── Seed: one wallet (balance 1000), empty stores ────────────────────────────
useWalletStore.setState({
  wallets: [{ id: 'W', name: 'Cash', type: 'cash', balance: 1000, initialBalance: 1000, icon: 'home', color: '#000', createdAt: new Date(), updatedAt: new Date() } as any],
  transfers: [],
});
usePersonalStore.setState({ transactions: [], _deletedTransactionIds: [], _dirtyTransactionIds: [] } as any);
useImportBatchStore.setState({ batches: [] });

// ── Mimic an import: bulk add, caller applies the net wallet delta once ──────
const toAdd = [
  { amount: 100, category: 'other', description: 'SALARY', date: new Date('2026-07-01'), type: 'income' as const, mode: 'personal' as const, inputMethod: 'statement-import' as const, walletId: 'W' },
  { amount: 30, category: 'food', description: 'LUNCH', date: new Date('2026-07-02'), type: 'expense' as const, mode: 'personal' as const, inputMethod: 'statement-import' as const, walletId: 'W' },
];
const txIds = usePersonalStore.getState().addTransactions(toAdd);
check('addTransactions returns one id per row', txIds.length === 2 && txIds.every(Boolean));
useWalletStore.getState().addToWallet('W', 100 - 30);
check('wallet moved by net delta', useWalletStore.getState().wallets.find((w) => w.id === 'W')?.balance === 1070);

// ── recordBatch ──────────────────────────────────────────────────────────────
const batchId = useImportBatchStore.getState().recordBatch({ source: 'statement', walletId: 'W', filename: 'stmt.pdf', txIds });
const stored = useImportBatchStore.getState().batches.find((b) => b.id === batchId);
check('batch recorded with id + fields', !!stored && stored.source === 'statement' && stored.walletId === 'W' && stored.filename === 'stmt.pdf');
check('batch keeps the tx ids', (stored?.txIds ?? []).join() === txIds.join());

// ── undoBatch: transactions gone, wallet delta reversed, record dropped ──────
useImportBatchStore.getState().undoBatch(batchId);
check('undo removes the imported transactions', usePersonalStore.getState().transactions.filter((t) => txIds.includes(t.id)).length === 0);
check('undo reverses the wallet delta', useWalletStore.getState().wallets.find((w) => w.id === 'W')?.balance === 1000);
check('undo drops the batch record', !useImportBatchStore.getState().batches.some((b) => b.id === batchId));

// unknown id → no-op, must not throw
useImportBatchStore.getState().undoBatch('no-such-batch');
check('undo of unknown id is a no-op', useImportBatchStore.getState().batches.length === 0);

// ── Pruning: record 25 batches → only the newest 20 kept ─────────────────────
useImportBatchStore.setState({ batches: [] });
const firstId = useImportBatchStore.getState().recordBatch({ source: 'csv', txIds: [] });
for (let i = 0; i < 24; i++) useImportBatchStore.getState().recordBatch({ source: 'csv', txIds: [] });
const kept = useImportBatchStore.getState().batches;
check('keeps only the last 20 batches', kept.length === 20);
check('oldest batch pruned', !kept.some((b) => b.id === firstId));

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`import-batch-store OK (${passed} checks)`);
