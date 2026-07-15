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
import { useBusinessStore } from '../src/store/businessStore';

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

// ── Business-mode debt payments (the erase bug) ──
// A business-mode payment links to a BUSINESS transaction that reconcile does NOT
// replay. The payment must therefore be counted by the debt loop (with direction),
// or its wallet effect gets silently erased on the next sync.
const WALLET_BIZ_IOWE = 'w-biz-iowe';
const BIZ_IOWE_INITIAL = 5000;
const BIZ_IOWE_PAY = 1200; // i_owe → money OUT
const BIZ_IOWE_EXPECTED = BIZ_IOWE_INITIAL - BIZ_IOWE_PAY; // 3800

const WALLET_BIZ_THEYOWE = 'w-biz-theyowe';
const BIZ_THEYOWE_INITIAL = 2000;
const BIZ_THEYOWE_PAY = 500; // they_owe → money IN
const BIZ_THEYOWE_EXPECTED = BIZ_THEYOWE_INITIAL + BIZ_THEYOWE_PAY; // 2500

// ── Business-mode payments WITH a tip (the silently-erased-tip bug) ──
// processPayment charges the wallet amount+tip at creation, but addPayment stores
// payment.amount = min(amount, remaining) (tip excluded) and keeps payment.tipAmount
// separately. The tip's wallet effect lives on a business tx we don't replay, so
// reconcile must add payment.tipAmount here or it shorts the balance by the tip.
const WALLET_BIZ_TIP_THEYOWE = 'w-biz-tip-theyowe';
const BIZ_TIP_THEYOWE_INITIAL = 3000;
const BIZ_TIP_THEYOWE_PAY = 800; // capped debt amount → money IN
const BIZ_TIP_THEYOWE_TIP = 120; // overpayment tip, also credited to wallet
const BIZ_TIP_THEYOWE_EXPECTED = BIZ_TIP_THEYOWE_INITIAL + BIZ_TIP_THEYOWE_PAY + BIZ_TIP_THEYOWE_TIP; // 3920

const WALLET_BIZ_TIP_IOWE = 'w-biz-tip-iowe';
const BIZ_TIP_IOWE_INITIAL = 6000;
const BIZ_TIP_IOWE_PAY = 900; // capped debt amount → money OUT
const BIZ_TIP_IOWE_TIP = 75; // overpayment tip, also debited from wallet
const BIZ_TIP_IOWE_EXPECTED = BIZ_TIP_IOWE_INITIAL - BIZ_TIP_IOWE_PAY - BIZ_TIP_IOWE_TIP; // 5025

// ── Personal-mode payment WITH a tip: linked tx IS replayed, so the payment is
// SKIPPED by the debt loop — the tip must NOT be counted here (personal wallets are
// moved solely by the linked transaction). Regression guard against double-counting.
const WALLET_PERSONAL_TIP = 'w-personal-tip';
const PERSONAL_TIP_INITIAL = 1500;
const PERSONAL_TIP_PAY = 200; // moved once by linked tx tx-personal-tip
const PERSONAL_TIP_EXPECTED = PERSONAL_TIP_INITIAL - PERSONAL_TIP_PAY; // 1300

// ── Self-paid SPLIT expenses (the reconcile-erases-business-split bug) ──
// A self-paid split deducts the payer's wallet by the bill total at creation. A
// business-mode split links to a business tx reconcile does NOT replay, so the
// outlay must be counted from the split record (using the LIVE business-tx amount,
// so an edited total reconciles at its real value) — else autoReconcile adds the
// money back and erases the expense. A personal-mode split links to a personal tx
// that the transactions loop already replays, so it must be SKIPPED (no double-count).
const WALLET_BIZ_SPLIT = 'w-biz-split';
const BIZ_SPLIT_INITIAL = 4000;
const BIZ_SPLIT_TX_AMOUNT = 950; // live business-tx amount (split.totalAmount below is stale)
const BIZ_SPLIT_STALE_TOTAL = 900;
const BIZ_SPLIT_EXPECTED = BIZ_SPLIT_INITIAL - BIZ_SPLIT_TX_AMOUNT; // 3050

const WALLET_PERSONAL_SPLIT = 'w-personal-split';
const PERSONAL_SPLIT_INITIAL = 2000;
const PERSONAL_SPLIT_AMOUNT = 300; // moved once by linked personal tx tx-personal-split
const PERSONAL_SPLIT_EXPECTED = PERSONAL_SPLIT_INITIAL - PERSONAL_SPLIT_AMOUNT; // 1700

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
    { id: WALLET_BIZ_IOWE, name: 'Biz IOwe', type: 'bank', balance: SENTINEL_STORED, initialBalance: BIZ_IOWE_INITIAL, icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D } as any,
    { id: WALLET_BIZ_THEYOWE, name: 'Biz TheyOwe', type: 'bank', balance: SENTINEL_STORED, initialBalance: BIZ_THEYOWE_INITIAL, icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D } as any,
    { id: WALLET_BIZ_TIP_THEYOWE, name: 'Biz Tip TheyOwe', type: 'bank', balance: SENTINEL_STORED, initialBalance: BIZ_TIP_THEYOWE_INITIAL, icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D } as any,
    { id: WALLET_BIZ_TIP_IOWE, name: 'Biz Tip IOwe', type: 'bank', balance: SENTINEL_STORED, initialBalance: BIZ_TIP_IOWE_INITIAL, icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D } as any,
    { id: WALLET_PERSONAL_TIP, name: 'Personal Tip', type: 'cash', balance: SENTINEL_STORED, initialBalance: PERSONAL_TIP_INITIAL, icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D } as any,
    { id: WALLET_BIZ_SPLIT, name: 'Biz Split', type: 'bank', balance: SENTINEL_STORED, initialBalance: BIZ_SPLIT_INITIAL, icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D } as any,
    { id: WALLET_PERSONAL_SPLIT, name: 'Personal Split', type: 'cash', balance: SENTINEL_STORED, initialBalance: PERSONAL_SPLIT_INITIAL, icon: 'home', color: '#4F5104', createdAt: D, updatedAt: D } as any,
  ],
  transfers: [],
});

// Business-mode split expense lives on a business transaction reconcile doesn't replay.
useBusinessStore.setState({
  businessTransactions: [
    { id: 'biz-split-tx', date: D, amount: BIZ_SPLIT_TX_AMOUNT, type: 'cost', category: 'split_expense', note: 'dinner', inputMethod: 'manual', createdAt: D, updatedAt: D } as any,
  ],
} as any);

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
    // Linked personal tx for the personal-mode tipped payment (moves the wallet once).
    {
      id: 'tx-personal-tip',
      amount: PERSONAL_TIP_PAY,
      category: 'other',
      description: 'Personal Debt Payment',
      date: D,
      type: 'expense',
      mode: 'personal',
      walletId: WALLET_PERSONAL_TIP,
      inputMethod: 'manual',
      linkedPaymentId: 'pay-personal-tip',
      linkedDebtId: 'd-personal-tip',
      createdAt: D,
      updatedAt: D,
    } as any,
    // Linked personal tx for the personal-mode self-paid split (moves the wallet once);
    // the split below references it, so reconcile must SKIP the split (no double-count).
    {
      id: 'tx-personal-split',
      amount: PERSONAL_SPLIT_AMOUNT,
      category: 'split_expense',
      description: 'lunch',
      date: D,
      type: 'expense',
      mode: 'personal',
      walletId: WALLET_PERSONAL_SPLIT,
      inputMethod: 'manual',
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
    // Business-mode i_owe: payment linked to a BUSINESS tx (id NOT in personal transactions).
    {
      id: 'd-biz-iowe', contact: { id: 'ct2', name: 'Supplier', isFromPhone: false },
      type: 'i_owe', totalAmount: 5000, paidAmount: BIZ_IOWE_PAY, status: 'partial',
      payments: [{ id: 'p-biz-1', amount: BIZ_IOWE_PAY, date: D, walletId: WALLET_BIZ_IOWE, linkedTransactionId: 'biz-tx-1', createdAt: D }],
      mode: 'business', createdAt: D, updatedAt: D,
    } as any,
    // Business-mode they_owe: payment (money IN) linked to a BUSINESS tx.
    {
      id: 'd-biz-theyowe', contact: { id: 'ct3', name: 'Client', isFromPhone: false },
      type: 'they_owe', totalAmount: 2000, paidAmount: BIZ_THEYOWE_PAY, status: 'partial',
      payments: [{ id: 'p-biz-2', amount: BIZ_THEYOWE_PAY, date: D, walletId: WALLET_BIZ_THEYOWE, linkedTransactionId: 'biz-tx-2', createdAt: D }],
      mode: 'business', createdAt: D, updatedAt: D,
    } as any,
    // Business they_owe WITH tip: wallet was credited amount+tip; tip is on a business tx.
    {
      id: 'd-biz-tip-theyowe', contact: { id: 'ct4', name: 'Client B', isFromPhone: false },
      type: 'they_owe', totalAmount: 800, paidAmount: BIZ_TIP_THEYOWE_PAY, status: 'paid',
      payments: [{ id: 'p-biz-tip-2', amount: BIZ_TIP_THEYOWE_PAY, tipAmount: BIZ_TIP_THEYOWE_TIP, date: D, walletId: WALLET_BIZ_TIP_THEYOWE, linkedTransactionId: 'biz-tx-tip-2', createdAt: D }],
      mode: 'business', createdAt: D, updatedAt: D,
    } as any,
    // Business i_owe WITH tip: wallet was debited amount+tip; tip is on a business tx.
    {
      id: 'd-biz-tip-iowe', contact: { id: 'ct5', name: 'Supplier B', isFromPhone: false },
      type: 'i_owe', totalAmount: 900, paidAmount: BIZ_TIP_IOWE_PAY, status: 'paid',
      payments: [{ id: 'p-biz-tip-1', amount: BIZ_TIP_IOWE_PAY, tipAmount: BIZ_TIP_IOWE_TIP, date: D, walletId: WALLET_BIZ_TIP_IOWE, linkedTransactionId: 'biz-tx-tip-1', createdAt: D }],
      mode: 'business', createdAt: D, updatedAt: D,
    } as any,
    // Personal i_owe WITH tip: linked tx IS replayed → payment SKIPPED; tip must NOT count.
    {
      id: 'd-personal-tip', contact: { id: 'ct6', name: 'Friend', isFromPhone: false },
      type: 'i_owe', totalAmount: 200, paidAmount: PERSONAL_TIP_PAY, status: 'paid',
      payments: [{ id: 'pay-personal-tip', amount: PERSONAL_TIP_PAY, tipAmount: 40, date: D, walletId: WALLET_PERSONAL_TIP, linkedTransactionId: 'tx-personal-tip', createdAt: D }],
      mode: 'personal', createdAt: D, updatedAt: D,
    } as any,
  ],
  splits: [
    // Business-mode self-paid split: business tx NOT replayed → reconcile counts the
    // outlay from here, using the LIVE business-tx amount (950), not the stale total (900).
    {
      id: 's-biz', description: 'dinner', totalAmount: BIZ_SPLIT_STALE_TOTAL, splitMethod: 'equal',
      participants: [], items: [], paidBy: { id: '__self__', name: 'me', isFromPhone: false },
      linkedTransactionId: 'biz-split-tx', walletId: WALLET_BIZ_SPLIT, mode: 'business', createdAt: D, updatedAt: D,
    } as any,
    // Personal-mode self-paid split: links to tx-personal-split (already replayed) → SKIPPED.
    {
      id: 's-personal', description: 'lunch', totalAmount: PERSONAL_SPLIT_AMOUNT, splitMethod: 'equal',
      participants: [], items: [], paidBy: { id: '__self__', name: 'me', isFromPhone: false },
      linkedTransactionId: 'tx-personal-split', walletId: WALLET_PERSONAL_SPLIT, mode: 'personal', createdAt: D, updatedAt: D,
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

const rowBizIOwe = results.find((r) => r.walletId === WALLET_BIZ_IOWE);
check(
  `business i_owe payment is COUNTED, not erased (${BIZ_IOWE_EXPECTED})`,
  !!rowBizIOwe && Math.abs(rowBizIOwe.computed - BIZ_IOWE_EXPECTED) < 0.005,
  `got computed=${rowBizIOwe?.computed} (erase bug would give ${BIZ_IOWE_INITIAL})`,
);

const rowBizTheyOwe = results.find((r) => r.walletId === WALLET_BIZ_THEYOWE);
check(
  `business they_owe payment ADDS to wallet (${BIZ_THEYOWE_EXPECTED})`,
  !!rowBizTheyOwe && Math.abs(rowBizTheyOwe.computed - BIZ_THEYOWE_EXPECTED) < 0.005,
  `got computed=${rowBizTheyOwe?.computed} (wrong-direction bug would give ${BIZ_THEYOWE_INITIAL - BIZ_THEYOWE_PAY})`,
);

const rowBizTipTheyOwe = results.find((r) => r.walletId === WALLET_BIZ_TIP_THEYOWE);
check(
  `business they_owe TIP is credited, not erased (${BIZ_TIP_THEYOWE_EXPECTED})`,
  !!rowBizTipTheyOwe && Math.abs(rowBizTipTheyOwe.computed - BIZ_TIP_THEYOWE_EXPECTED) < 0.005,
  `got computed=${rowBizTipTheyOwe?.computed} (erased-tip bug would give ${BIZ_TIP_THEYOWE_INITIAL + BIZ_TIP_THEYOWE_PAY})`,
);

const rowBizTipIOwe = results.find((r) => r.walletId === WALLET_BIZ_TIP_IOWE);
check(
  `business i_owe TIP is debited, not erased (${BIZ_TIP_IOWE_EXPECTED})`,
  !!rowBizTipIOwe && Math.abs(rowBizTipIOwe.computed - BIZ_TIP_IOWE_EXPECTED) < 0.005,
  `got computed=${rowBizTipIOwe?.computed} (erased-tip bug would give ${BIZ_TIP_IOWE_INITIAL - BIZ_TIP_IOWE_PAY})`,
);

const rowPersonalTip = results.find((r) => r.walletId === WALLET_PERSONAL_TIP);
check(
  `personal payment with linked tx is SKIPPED, tip NOT counted (${PERSONAL_TIP_EXPECTED})`,
  !!rowPersonalTip && Math.abs(rowPersonalTip.computed - PERSONAL_TIP_EXPECTED) < 0.005,
  `got computed=${rowPersonalTip?.computed} (double-count/tip-count bug would differ)`,
);

const rowBizSplit = results.find((r) => r.walletId === WALLET_BIZ_SPLIT);
check(
  `business self-paid split is COUNTED at live tx amount, not erased (${BIZ_SPLIT_EXPECTED})`,
  !!rowBizSplit && Math.abs(rowBizSplit.computed - BIZ_SPLIT_EXPECTED) < 0.005,
  `got computed=${rowBizSplit?.computed} (erase bug → ${BIZ_SPLIT_INITIAL}; stale-total bug → ${BIZ_SPLIT_INITIAL - BIZ_SPLIT_STALE_TOTAL})`,
);

const rowPersonalSplit = results.find((r) => r.walletId === WALLET_PERSONAL_SPLIT);
check(
  `personal split with linked tx is SKIPPED, not double-counted (${PERSONAL_SPLIT_EXPECTED})`,
  !!rowPersonalSplit && Math.abs(rowPersonalSplit.computed - PERSONAL_SPLIT_EXPECTED) < 0.005,
  `got computed=${rowPersonalSplit?.computed} (double-count bug → ${PERSONAL_SPLIT_INITIAL - 2 * PERSONAL_SPLIT_AMOUNT})`,
);

console.log('');
if (failed) {
  console.log('FAIL — wallet reconcile double-counts wallet-linked debt/goal ledger entries.');
  process.exit(1);
} else {
  console.log(`PASS — reconcile single-counts linked entries (balance=${EXPECTED}).`);
  process.exit(0);
}
