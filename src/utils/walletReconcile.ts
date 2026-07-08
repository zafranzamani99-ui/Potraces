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

export interface ReconcileResult {
  walletId: string;
  walletName: string;
  stored: number;
  computed: number;
  drift: number;
}

/**
 * Reconcile all wallet balances against the source-of-truth operations.
 * Returns only wallets where |drift| > 0.005 (half a sen).
 */
export function reconcileWalletBalances(): ReconcileResult[] {
  const wallets = useWalletStore.getState().wallets;
  const transfers = useWalletStore.getState().transfers ?? [];
  const transactions = usePersonalStore.getState().transactions;
  const goals = usePersonalStore.getState().goals;
  const debts = useDebtStore.getState().debts;

  const results: ReconcileResult[] = [];

  // Ids of the transactions replayed below. A debt payment / goal contribution that
  // links to one of these is already counted (skip it). But a BUSINESS-mode payment
  // links to a business transaction that reconcile does NOT replay — skipping it there
  // would silently ERASE its wallet effect on the next sync. So skip only when the
  // linked tx is actually in this set; otherwise apply the payment/contribution here.
  const txIdSet = new Set(transactions.map((t) => t.id));

  for (const wallet of wallets) {
    // Start from wallet's initial balance (backfilled for legacy wallets)
    let computed = roundMoney(wallet.initialBalance ?? 0);

    // ── Transactions: income adds, expense deducts ──
    for (const tx of transactions) {
      if (tx.walletId !== wallet.id) continue;
      if (tx.type === 'income') {
        computed = roundMoney(computed + tx.amount);
      } else if (tx.type === 'expense') {
        computed = roundMoney(computed - tx.amount);
      }
    }

    // ── Wallet transfers: subtract from source, add to destination ──
    for (const t of transfers) {
      if (t.fromWalletId === wallet.id) {
        computed = roundMoney(computed - t.amount);
      }
      if (t.toWalletId === wallet.id) {
        computed = roundMoney(computed + t.amount);
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
        computed = roundMoney(computed + dir * payment.amount);
      }
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
      }
    }

    const drift = roundMoney(wallet.balance - computed);
    if (Math.abs(drift) > 0.005) {
      results.push({
        walletId: wallet.id,
        walletName: wallet.name,
        stored: wallet.balance,
        computed,
        drift,
      });
    }
  }

  return results;
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
