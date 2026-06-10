/**
 * Playbook attribution — the ONLY sanctioned mutators for linking an expense
 * transaction to a playbook. Every entry point (QuickAdd, chat, EditTransactionSheet,
 * unassign) routes through these so behavior stays identical and single-owner.
 *
 * Model: membership lives on `playbook.linkedExpenseIds`; the per-playbook drain
 * amount lives on `Transaction.playbookLinks: [{ playbookId, amount }]`. A playbook
 * is the SINGLE owner of an expense — selecting a new playbook strips the link from
 * all others. Amounts are always rounded to 2dp at the write site.
 */

import { usePlaybookStore } from '../store/playbookStore';
import { usePersonalStore } from '../store/personalStore';
import { roundMoney } from './money';

/**
 * Explicitly attribute an expense to a playbook (opt-in only — never auto-called by date).
 * Writes membership (single-owner enforced) + the drain amount on the transaction.
 */
export function attributeExpenseToPlaybook(
  playbookId: string,
  transactionId: string,
  amount: number,
): void {
  usePlaybookStore.getState().setExpenseLink(playbookId, transactionId, amount);
  const rounded = roundMoney(amount);
  usePersonalStore.getState().updateTransaction(transactionId, {
    playbookLinks: rounded > 0 ? [{ playbookId, amount: rounded }] : undefined,
  });
}

/** Remove all playbook attribution from a transaction (membership + drain amount). */
export function clearExpenseAttribution(transactionId: string): void {
  usePlaybookStore.getState().unlinkAllFromTransaction(transactionId);
  usePersonalStore.getState().updateTransaction(transactionId, { playbookLinks: undefined });
}

/**
 * Keep the playbook drain amount in sync after a transaction amount edit.
 * No membership change — only rewrites each existing playbookLinks entry's amount.
 */
export function syncLinkAmount(transactionId: string, newAmount: number): void {
  const tx = usePersonalStore.getState().transactions.find((t) => t.id === transactionId);
  if (!tx || !tx.playbookLinks?.length) return;
  const rounded = roundMoney(newAmount);
  usePersonalStore.getState().updateTransaction(transactionId, {
    playbookLinks: tx.playbookLinks.map((l) => ({ ...l, amount: rounded })),
  });
}
