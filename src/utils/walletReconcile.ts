/**
 * Wallet balance reconciliation helpers.
 *
 * After the LOGIC-C1/C2 fixes, wallet balances now reconcile on every transaction
 * mutation. But some users may already have drifted balances from before the fix
 * shipped — this utility lets them (or the app silently) recalculate balances
 * from transaction history.
 *
 * The computed balance = sum(income) - sum(expense) for transactions that
 * target this wallet. We do NOT include a starting balance unless provided —
 * if a user enters a new wallet with balance RM100 and no transactions, the
 * stored balance is the source of truth.
 */
import type { Transaction, Wallet } from '../types';

export interface ReconcileResult {
  walletId: string;
  storedBalance: number;
  computedBalance: number;
  diff: number;  // storedBalance - computedBalance
  needsFix: boolean;
}

/**
 * For a single wallet, compute what its balance should be based on all
 * transactions that target it. Returns mismatch info.
 *
 * @param startingBalance  The balance at wallet creation (default 0).
 *                         If you want to treat the current stored balance as the
 *                         baseline, pass it here — but then the function is
 *                         self-referential. Prefer 0 for a fresh computation.
 */
export function reconcileWallet(
  wallet: Wallet,
  transactions: Transaction[],
  startingBalance = 0,
): ReconcileResult {
  let computed = startingBalance;
  for (const tx of transactions) {
    if (tx.walletId !== wallet.id) continue;
    if (tx.type === 'income') computed += tx.amount;
    else if (tx.type === 'expense') computed -= tx.amount;
  }
  const diff = wallet.balance - computed;
  return {
    walletId: wallet.id,
    storedBalance: wallet.balance,
    computedBalance: computed,
    diff,
    needsFix: Math.abs(diff) > 0.01,
  };
}

/**
 * Reconcile every wallet. Returns a list of mismatches.
 * An empty result means everything already agrees.
 */
export function reconcileAll(
  wallets: Wallet[],
  transactions: Transaction[],
): ReconcileResult[] {
  return wallets
    .map((w) => reconcileWallet(w, transactions))
    .filter((r) => r.needsFix);
}
