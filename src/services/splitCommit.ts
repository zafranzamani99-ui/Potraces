import { useDebtStore } from '../store/debtStore';
import { usePersonalStore } from '../store/personalStore';
import { useBusinessStore } from '../store/businessStore';
import { useWalletStore } from '../store/walletStore';
import type { AppMode, Contact, SplitItem, SplitMethod, SplitParticipant } from '../types';

const SELF_ID = '__self__';

export interface CommitSplitInput {
  description: string;
  totalAmount: number;
  splitMethod: SplitMethod;
  participants: SplitParticipant[]; // amounts PRE-COMPUTED by the caller
  items: SplitItem[];               // [] unless item_based
  paidBy?: Contact;                 // undefined => draft (no debts/tx)
  walletId?: string;                // only meaningful when self is the payer
  category?: string;                // expense category when self paid (falls back to 'split_expense')
  dueDate?: Date;
  mode: AppMode;
}

/**
 * Persist a split and its financial side effects — the single money path shared
 * by the DebtTracking wizard and the Calculator's Quick Split. Behaviour mirrors
 * the original inline block in DebtTracking exactly:
 *  - I paid   → expense transaction + wallet deduction + one `they_owe` debt per other participant.
 *  - They paid → one `i_owe` debt for my share.
 *  - No payer → draft split only.
 */
export function commitSplit(input: CommitSplitInput): string {
  const { description, totalAmount, splitMethod, participants, items, paidBy, walletId, category, dueDate, mode } = input;

  const { addSplit, updateSplit, addDebt } = useDebtStore.getState();

  const splitId = addSplit({
    description,
    totalAmount,
    splitMethod,
    participants,
    items,
    paidBy,
    category: category || undefined,
    dueDate: dueDate ? dueDate.toISOString() : undefined,
    mode,
  } as any);

  const payer = paidBy ?? null;

  if (payer?.id === SELF_ID) {
    let txId: string | undefined;
    if (mode === 'personal') {
      txId = usePersonalStore.getState().addTransaction({
        amount: totalAmount,
        category: category || 'split_expense',
        description,
        date: new Date(),
        type: 'expense',
        mode,
        walletId: walletId || undefined,
        inputMethod: 'manual',
      } as any);
    } else {
      txId = useBusinessStore.getState().addBusinessTransaction({
        date: new Date(),
        amount: totalAmount,
        type: 'cost',
        category: category || 'split_expense',
        note: description,
        inputMethod: 'manual',
      } as any);
    }

    if (txId || walletId) {
      updateSplit(splitId, { linkedTransactionId: txId, walletId: walletId || undefined });
    }

    if (walletId) {
      const wallet = useWalletStore.getState().wallets.find((w) => w.id === walletId);
      if (wallet?.type === 'credit') {
        useWalletStore.getState().useCredit(walletId, totalAmount);
      } else {
        useWalletStore.getState().deductFromWallet(walletId, totalAmount);
      }
    }

    participants
      .filter((p) => p.contact.id !== SELF_ID && p.amount > 0)
      .forEach((p) => {
        addDebt({
          contact: p.contact,
          type: 'they_owe',
          totalAmount: p.amount,
          description,
          splitId,
          mode,
          dueDate: dueDate || undefined,
        } as any);
      });
  } else if (payer && payer.id !== SELF_ID) {
    const mine = participants.find((p) => p.contact.id === SELF_ID);
    if (mine && mine.amount > 0) {
      addDebt({
        contact: payer,
        type: 'i_owe',
        totalAmount: mine.amount,
        description,
        splitId,
        mode,
        dueDate: dueDate || undefined,
      } as any);
    }
  }

  return splitId;
}
