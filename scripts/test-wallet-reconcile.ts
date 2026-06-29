/**
 * Regression test for REL-01 — wallet balance double-count corruption.
 *
 * WHY: reconcileWalletBalances() replays the transactions ledger AND the
 * debt-payments / goal-contributions ledgers. In personal mode a wallet-linked
 * debt payment and a wallet-linked goal contribution ALREADY move the wallet via
 * a LINKED personal transaction (income/expense with the same walletId). That
 * transaction is replayed by the transactions loop, so deducting it a SECOND time
 * in the debt/goal loops understates the wallet. This is reachable from
 * "Recalculate from transactions" and on every personal sync (autoReconcileWallets).
 *
 * This test seeds the REAL stores with ONE wallet, ONE wallet-linked debt payment
 * carrying its linked transaction, and ONE wallet-linked goal contribution carrying
 * its linked savings transaction, then asserts the REAL reconcileWalletBalances()
 * computes the single-count balance (initial - one debt - one goal), NOT the
 * double-counted balance. It FAILS on the old logic, PASSES after the fix.
 *
 * Run:  npx tsx scripts/test-wallet-reconcile.ts
 */
import { reconcileWalletBalances } from '../src/utils/walletReconcile';
import { useWalletStore } from '../src/store/walletStore';
import { usePersonalStore } from '../src/store/personalStore';
import { useDebtStore } from '../src/store/debtStore';

const D = new Date('2026-06-20T08:00:00.000Z');

const INITIAL = 1000;
const DEBT_PAYMENT = 100; // expense expense linked tx → moves wallet once
const GOAL_CONTRIB = 50; // savings expense linked tx → moves wallet once

// Single-count truth: the linked transactions are the ONLY thing that should
// move the wallet. Initial - debt payment - goal contribution.
const EXPECTED = INITIAL - DEBT_PAYMENT - GOAL_CONTRIB; // 850
// What the old double-count logic produced (debt + goal loops deduct again).
const BUGGY = EXPECTED - DEBT_PAYMENT - GOAL_CONTRIB; // 700

const WALLET_ID = 'w-test';

// Intentionally-wrong stored balance forces reconcile to always RETURN this
// wallet (drift > 0.005), so we can read .computed regardless of pass/fail.
const SENTINEL_STORED = -99999;

// ─── Seed the REAL stores ──────────────────────────────────────────────────────
useWalletStore.setState({
  wallets: [
    {
      id: WALLET_ID,
      name: 'Test Wallet',
      type: 'cash',
      balance: SENTINEL_STORED,
      initialBalance: INITIAL,
      icon: 'home',
      color: '#4F5104',
      createdAt: D,
      updatedAt: D,
    } as any,
  ],
  transfers: [],
});

usePersonalStore.setState({
  // The two linked transactions that ACTUALLY move the wallet (replayed once each).
  transactions: [
    {
      id: 'tx-debt',
      amount: DEBT_PAYMENT,
      category: 'other',
      description: 'Debt Payment',
      date: D,
      type: 'expense',
      mode: 'personal',
      walletId: WALLET_ID,
      inputMethod: 'manual',
      linkedPaymentId: 'pay1',
      linkedDebtId: 'd1',
      createdAt: D,
      updatedAt: D,
    } as any,
    {
      id: 'tx-goal',
      amount: GOAL_CONTRIB,
      category: 'savings',
      description: 'Goal',
      date: D,
      type: 'expense',
      mode: 'personal',
      walletId: WALLET_ID,
      inputMethod: 'manual',
      linkedGoalId: 'g1',
      createdAt: D,
      updatedAt: D,
    } as any,
  ],
  goals: [
    {
      id: 'g1',
      name: 'Umrah',
      targetAmount: 20000,
      currentAmount: GOAL_CONTRIB,
      icon: 'f/target',
      milestones: [],
      // Wallet-linked contribution WITH its linked savings transaction.
      contributions: [
        {
          id: 'c1',
          amount: GOAL_CONTRIB,
          note: 'first',
          date: D,
          walletId: WALLET_ID,
          transactionId: 'tx-goal',
        },
      ],
      createdAt: D,
      updatedAt: D,
    } as any,
  ],
} as any);

useDebtStore.setState({
  debts: [
    {
      id: 'd1',
      contact: { id: 'ct1', name: 'Ali', isFromPhone: false },
      type: 'i_owe',
      totalAmount: 300,
      paidAmount: DEBT_PAYMENT,
      status: 'partial',
      // Wallet-linked payment WITH its linked personal transaction.
      payments: [
        {
          id: 'pay1',
          amount: DEBT_PAYMENT,
          date: D,
          walletId: WALLET_ID,
          linkedTransactionId: 'tx-debt',
          createdAt: D,
        },
      ],
      mode: 'personal',
      createdAt: D,
      updatedAt: D,
    } as any,
  ],
} as any);

// ─── Run the REAL reconcile ──────────────────────────────────────────────────────
const results = reconcileWalletBalances();
const row = results.find((r) => r.walletId === WALLET_ID);

let failed = false;
function check(label: string, cond: boolean, detail: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label} — ${detail}`);
    failed = true;
  }
}

check(
  'reconcile returned the seeded wallet',
  !!row,
  'wallet not in results (sentinel stored balance should always drift)',
);

if (row) {
  check(
    `computed balance is single-count (${EXPECTED}), not double-count (${BUGGY})`,
    Math.abs(row.computed - EXPECTED) < 0.005,
    `got computed=${row.computed} (buggy value would be ${BUGGY})`,
  );
}

console.log('');
if (failed) {
  console.log('FAIL — wallet reconcile double-counts wallet-linked debt/goal ledger entries.');
  process.exit(1);
} else {
  console.log(`PASS — reconcile single-counts linked entries (balance=${EXPECTED}).`);
  process.exit(0);
}
