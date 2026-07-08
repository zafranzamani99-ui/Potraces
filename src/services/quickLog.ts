/**
 * quickLog — log a personal transaction headlessly from a deep link / Apple
 * Shortcut. Powers the "Shortcut collects amount + category + date → Potraces
 * logs it" flow (potraces://add?amount=35.50&category=entertainment&date=...).
 *
 * Mirrors what QuickAddExpense does on save (resolve wallet, addTransaction,
 * adjust wallet) but without any UI, so a Shortcut's native prompts can drive it.
 * Always reversible via undoQuickExpense (delete reverses the wallet).
 */
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useCategoryStore } from '../store/categoryStore';
import { nowMYT } from '../utils/datetime';
import { CALM } from '../constants';
import type { CategoryOption, WalletType } from '../types';

export interface QuickLogParams {
  amount: number;
  type: 'expense' | 'income';
  category?: string; // id or display name passed by the Shortcut
  wallet?: string;   // payment method — wallet id or name (TNG, Maybank, Cash…)
  date?: Date;
  note?: string;
}

export interface QuickLogResult {
  txId: string;
  walletId?: string;
  walletName?: string;
  amount: number;
  type: 'expense' | 'income';
  categoryName: string;
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Best-effort match of a free-text category to a real personal category. */
function resolveCategory(raw: string | undefined, type: 'expense' | 'income'): CategoryOption | null {
  const cats =
    type === 'income'
      ? useCategoryStore.getState().getIncomeCategories('personal')
      : useCategoryStore.getState().getExpenseCategories('personal');
  if (cats.length === 0) return null;
  if (!raw) return cats.find((c) => c.id === 'other') ?? cats[0];
  const n = normalize(raw);
  return (
    cats.find((c) => normalize(c.id) === n) ||
    cats.find((c) => normalize(c.name) === n) ||
    cats.find((c) => normalize(c.name).includes(n) || n.includes(normalize(c.name))) ||
    cats.find((c) => c.id === 'other') ||
    cats[0]
  );
}

/**
 * Resolves the payment method to a real wallet. Matches `raw` (the Shortcut's
 * chosen wallet — "TNG", "Maybank", "Cash"…) by id or name; falls back to the
 * default wallet, creating a Cash wallet only if the user has none.
 * deductFromWallet/addToWallet handle credit wallets correctly, so a credit
 * card / BNPL passed here behaves as expected (uses/repays credit).
 */
/**
 * Payment-method aliases: the shared Shortcut offers generic labels (Cash /
 * TNG / Card / Bank) but users name their wallets anything ("Touch 'n Go",
 * "Maybank Savings"). Each alias lists name tokens to look for, and a wallet
 * TYPE to fall back to — so "TNG" finds the user's e-wallet even when no name
 * matches, instead of silently landing on the default (usually Bank).
 */
const WALLET_ALIASES: Record<string, { tokens: string[]; type?: WalletType }> = {
  tng: { tokens: ['tng', 'touchngo', 'touch'], type: 'ewallet' },
  ewallet: { tokens: ['tng', 'touchngo', 'grab', 'boost', 'shopee'], type: 'ewallet' },
  cash: { tokens: ['cash', 'tunai'], type: 'cash' },
  card: { tokens: ['card', 'credit', 'kad'], type: 'credit' },
  creditcard: { tokens: ['card', 'credit', 'kad'], type: 'credit' },
  bank: { tokens: ['bank'], type: 'bank' },
};

function resolveWallet(raw?: string): { id: string; name: string } | undefined {
  const ws = useWalletStore.getState();
  const wallets = ws.wallets;
  const n = raw ? normalize(raw) : '';
  if (wallets.length > 0 && n) {
    const match =
      wallets.find((w) => normalize(w.id) === n) ||
      wallets.find((w) => normalize(w.name) === n) ||
      wallets.find((w) => normalize(w.name).includes(n) || n.includes(normalize(w.name)));
    if (match) return { id: match.id, name: match.name };
    // Alias layer: match by known name tokens, then by wallet type.
    const alias = WALLET_ALIASES[n];
    if (alias) {
      const byToken = wallets.find((w) => alias.tokens.some((t) => normalize(w.name).includes(t)));
      if (byToken) return { id: byToken.id, name: byToken.name };
      if (alias.type) {
        const byType = wallets.find((w) => w.type === alias.type);
        if (byType) return { id: byType.id, name: byType.name };
      }
    }
  }
  // Explicitly chose Cash but no cash-like wallet exists → create one rather
  // than silently charging the default (usually a bank) wallet.
  if (n === 'cash') {
    ws.addWallet({
      name: 'Cash',
      type: 'cash',
      balance: 0,
      icon: 'dollar-sign',
      color: CALM.accent,
      isDefault: wallets.length === 0,
    });
    const created = useWalletStore.getState().wallets.find((w) => normalize(w.name) === 'cash');
    if (created) return { id: created.id, name: created.name };
  }
  let existing = wallets.find((w) => w.isDefault) ?? wallets[0];
  if (!existing) {
    ws.addWallet({
      name: 'Cash',
      type: 'cash',
      balance: 0,
      icon: 'dollar-sign',
      color: CALM.accent,
      isDefault: true,
    });
    existing = useWalletStore.getState().wallets[0];
  }
  return existing ? { id: existing.id, name: existing.name } : undefined;
}

/**
 * Logs a personal transaction. Returns the result (for the Undo toast) or null
 * if the amount is invalid.
 */
export function logQuickExpense(params: QuickLogParams): QuickLogResult | null {
  const amount = Math.round((params.amount + Number.EPSILON) * 100) / 100;
  if (!(amount > 0)) return null;

  const type = params.type === 'income' ? 'income' : 'expense';
  const cat = resolveCategory(params.category, type);
  const categoryId = cat?.id ?? 'other';
  const categoryName = cat?.name ?? (params.category || (type === 'income' ? 'Income' : 'Other'));
  const wallet = resolveWallet(params.wallet);
  const walletId = wallet?.id;
  const date = params.date ?? nowMYT();

  const txId = usePersonalStore.getState().addTransaction({
    amount,
    category: categoryId,
    description: params.note?.trim() || categoryName,
    date,
    type,
    mode: 'personal',
    walletId,
    inputMethod: 'manual',
  });
  if (!txId) return null;

  // addTransaction does NOT touch wallets — the caller must (same as QuickAddExpense).
  if (walletId) {
    if (type === 'expense') useWalletStore.getState().deductFromWallet(walletId, amount);
    else useWalletStore.getState().addToWallet(walletId, amount);
  }

  return { txId, walletId, walletName: wallet?.name, amount, type, categoryName };
}

/** Reverses a quick-logged transaction. deleteTransaction also reverses the wallet. */
export function undoQuickExpense(result: QuickLogResult): void {
  usePersonalStore.getState().deleteTransaction(result.txId);
}
