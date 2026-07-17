/**
 * Wallet balance reconciliation.
 *
 * Addresses CF-02 (non-atomic cross-store mutations) and CF-10 (multi-device
 * sync last-write-wins overwriting balances).
 *
 * Computes what each wallet's balance SHOULD be by replaying every
 * wallet-affecting operation from all stores:
 *   - Transactions (income adds, expense deducts)
 *   - Wallet transfers (subtract from source, add to destination)
 *   - Debt payments with walletId (deduct)
 *   - Goal contributions with walletId (deduct; negative = withdrawal = add)
 *
 * Savings snapshots have NO wallet linkage and are excluded.
 */
import { roundMoney } from './money';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useBusinessStore } from '../store/businessStore';

/**
 * Signed decomposition of what a wallet's computed balance is made of.
 * Invariant: computed === roundMoney(initial + income − spending + transfersNet + otherNet).
 *   initial      = wallet.initialBalance ?? 0
 *   income       = Σ income tx amounts
 *   spending     = Σ expense tx amounts (POSITIVE)
 *   transfersNet = (Σ transfers in) − (Σ transfers out)
 *   otherNet     = signed net of everything else reconcile applies
 *                  (debt payments +dir*(amount+tip), − split outlays, − goal contributions)
 */
export interface WalletBreakdown {
  initial: number;
  income: number;
  spending: number;
  transfersNet: number;
  otherNet: number;
}

export interface ReconcileResult {
  walletId: string;
  walletName: string;
  stored: number;
  computed: number;
  drift: number;
  breakdown: WalletBreakdown;
}

type Wallet = ReturnType<typeof useWalletStore.getState>['wallets'][number];

/**
 * Snapshot of every store the per-wallet computation reads, gathered once so a
 * single-wallet compute and a full sweep replay from identical data.
 */
function loadSharedState() {
  const transfers = useWalletStore.getState().transfers ?? [];
  const transactions = usePersonalStore.getState().transactions;
  const goals = usePersonalStore.getState().goals;
  const debts = useDebtStore.getState().debts;
  const splits = useDebtStore.getState().splits;
  // Live business-tx amounts, so an edited split total is reconciled at its real
  // outlay (mirrors cleanupSplitTransaction's read-the-business-tx behaviour).
  const businessTxById = new Map(
    (useBusinessStore.getState().businessTransactions ?? []).map((t) => [t.id, t]),
  );

  // Ids of the transactions replayed below. A debt payment / goal contribution that
  // links to one of these is already counted (skip it). But a BUSINESS-mode payment
  // links to a business transaction that reconcile does NOT replay — skipping it there
  // would silently ERASE its wallet effect on the next sync. So skip only when the
  // linked tx is actually in this set; otherwise apply the payment/contribution here.
  const txIdSet = new Set(transactions.map((t) => t.id));

  return { transfers, transactions, goals, debts, splits, businessTxById, txIdSet };
}

type SharedState = ReturnType<typeof loadSharedState>;

/**
 * Replay every wallet-affecting operation for ONE wallet, returning both the
 * computed balance and its signed breakdown. The running `computed` math is the
 * source of truth; the breakdown accumulates the same deltas grouped by kind, so
 * `computed === roundMoney(initial + income − spending + transfersNet + otherNet)`.
 */
function computeOne(
  wallet: Wallet,
  shared: SharedState,
): { computed: number; breakdown: WalletBreakdown } {
  const { transfers, transactions, goals, debts, splits, businessTxById, txIdSet } = shared;

  // Start from wallet's initial balance (backfilled for legacy wallets)
  const initial = roundMoney(wallet.initialBalance ?? 0);
  let computed = initial;
  let income = 0;
  let spending = 0;
  let transfersNet = 0;
  let otherNet = 0;

  // ── Transactions: income adds, expense deducts ──
  for (const tx of transactions) {
    if (tx.walletId !== wallet.id) continue;
    if (tx.type === 'income') {
      computed = roundMoney(computed + tx.amount);
      income = roundMoney(income + tx.amount);
    } else if (tx.type === 'expense') {
      computed = roundMoney(computed - tx.amount);
      spending = roundMoney(spending + tx.amount);
    }
  }

  // ── Wallet transfers: subtract from source, add to destination ──
  for (const t of transfers) {
    if (t.fromWalletId === wallet.id) {
      computed = roundMoney(computed - t.amount);
      transfersNet = roundMoney(transfersNet - t.amount);
    }
    if (t.toWalletId === wallet.id) {
      computed = roundMoney(computed + t.amount);
      transfersNet = roundMoney(transfersNet + t.amount);
    }
  }

  // ── Debt payments with walletId: apply the wallet effect ──
  // they_owe = they pay ME (money in, +); i_owe = I pay THEM (money out, −).
  for (const debt of debts) {
    const dir = debt.type === 'they_owe' ? 1 : -1;
    for (const payment of debt.payments) {
      if (payment.walletId !== wallet.id) continue;
      // Skip only when the linked tx is actually replayed above (personal mode);
      // a business-mode payment links to a business tx we don't replay, so it must
      // be counted here or its wallet effect gets erased on reconcile.
      if (payment.linkedTransactionId && txIdSet.has(payment.linkedTransactionId)) continue;
      // Business-mode payments charged the wallet amount+tip at creation, but the
      // stored payment.amount is capped to the debt (tip excluded, kept as tipAmount).
      // The tip lives on a business tx we do NOT replay, so count it here — mirror the
      // delete path — or reconcile shorts the balance and erases the tip's wallet effect.
      const tip = debt.mode !== 'personal' ? (payment.tipAmount ?? 0) : 0;
      const delta = dir * (payment.amount + tip);
      computed = roundMoney(computed + delta);
      otherNet = roundMoney(otherNet + delta);
    }
  }

  // ── Self-paid split expenses backed by a business tx we DON'T replay ──
  // A self-paid split deducts the payer's wallet by the split total at creation
  // (splitCommit). Personal-mode splits create a personalStore expense tx that the
  // transactions loop already replayed (its id is in txIdSet → skip). Business-mode
  // splits link to a business tx we never replay, so — exactly like the business
  // debt payments above — the outlay must be counted here, or autoReconcile silently
  // adds the money back and erases the split expense on the next sync. Non-self-paid
  // splits have no linkedTransactionId (they create an i_owe debt, already counted by
  // the payments loop), so they never enter this branch.
  for (const split of splits) {
    if (split.walletId !== wallet.id) continue;
    if (!split.linkedTransactionId) continue;
    if (txIdSet.has(split.linkedTransactionId)) continue; // personal — already replayed above
    const bizTx = businessTxById.get(split.linkedTransactionId);
    const amt = bizTx ? bizTx.amount : split.totalAmount;
    computed = roundMoney(computed - amt);
    otherNet = roundMoney(otherNet - amt);
  }

  // ── Goal contributions with walletId: deduct (negative = withdrawal = add) ──
  for (const goal of goals) {
    for (const contrib of goal.contributions) {
      if (contrib.walletId !== wallet.id) continue;
      // Skip only when the linked savings tx is actually replayed above; a
      // contribution whose linked tx isn't in the set (business/deleted) must be
      // counted here or its wallet effect gets erased on reconcile.
      if (contrib.transactionId && txIdSet.has(contrib.transactionId)) continue;
      // Positive contribution = money moved out of wallet (deduct)
      // Negative contribution (withdrawal) = money returned to wallet (add)
      computed = roundMoney(computed - contrib.amount);
      otherNet = roundMoney(otherNet - contrib.amount);
    }
  }

  return {
    computed,
    breakdown: { initial, income, spending, transfersNet, otherNet },
  };
}

/**
 * Reconcile all wallet balances against the source-of-truth operations.
 * Returns only wallets where |drift| > 0.005 (half a sen).
 */
export function reconcileWalletBalances(): ReconcileResult[] {
  const wallets = useWalletStore.getState().wallets;
  const shared = loadSharedState();

  const results: ReconcileResult[] = [];

  for (const wallet of wallets) {
    const { computed, breakdown } = computeOne(wallet, shared);
    const drift = roundMoney(wallet.balance - computed);
    if (Math.abs(drift) > 0.005) {
      results.push({
        walletId: wallet.id,
        walletName: wallet.name,
        stored: wallet.balance,
        computed,
        drift,
        breakdown,
      });
    }
  }

  return results;
}

/**
 * Reconcile a SINGLE wallet against the source-of-truth operations.
 * Always returns the wallet's result (even when drift ≈ 0); returns null only
 * when no wallet with the given id exists.
 */
export function computeWalletReconcile(walletId: string): ReconcileResult | null {
  const wallet = useWalletStore.getState().wallets.find((w) => w.id === walletId);
  if (!wallet) return null;

  const shared = loadSharedState();
  const { computed, breakdown } = computeOne(wallet, shared);
  const drift = roundMoney(wallet.balance - computed);

  return {
    walletId: wallet.id,
    walletName: wallet.name,
    stored: wallet.balance,
    computed,
    drift,
    breakdown,
  };
}

/**
 * Run reconciliation and auto-correct any drifted wallet balances.
 * Returns the number of wallets corrected.
 */
export function autoReconcileWallets(): number {
  const drifted = reconcileWalletBalances();
  if (drifted.length === 0) return 0;

  const { wallets } = useWalletStore.getState();
  const corrected: typeof wallets = wallets.map((w) => {
    const fix = drifted.find((d) => d.walletId === w.id);
    if (!fix) return w;
    // Do NOT bump updatedAt: a reconcile-derived balance must not automatically
    // win the next last-write-wins against other devices (that would launder a
    // local glitch — e.g. a duplicated/dropped op — into global corruption).
    // For credit wallets, keep the invariant balance = creditLimit - usedCredit:
    // if we move balance, usedCredit must follow or the two available-credit
    // readouts (usage bar vs "Avail.") disagree.
    if (w.type === 'credit' && w.creditLimit != null) {
      return { ...w, balance: fix.computed, usedCredit: roundMoney(w.creditLimit - fix.computed) };
    }
    return { ...w, balance: fix.computed };
  });

  useWalletStore.setState({ wallets: corrected });

  if (__DEV__) {
    for (const d of drifted) {
      console.log(
        `[reconcile] ${d.walletName}: stored=${d.stored} computed=${d.computed} drift=${d.drift} → corrected`,
      );
    }
  }

  return drifted.length;
}
