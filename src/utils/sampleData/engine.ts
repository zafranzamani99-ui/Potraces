// ─── Sample-data engine ────────────────────────────────────────────────
// Applies a persona to the real personal stores. Correctness-critical, and
// deliberately free of settingsStore (which pulls in react-native) so
// scripts/test-sample-data.ts can exercise this against the real stores + the
// real reconcileWalletBalances(). The thin native wrapper lives in ./index.
//
// Why finalize() matters: seeded wallet balances are the persona's FINAL
// balances, and `addTransaction` never adjusts a wallet balance (only
// edit/delete do). Wallet reconciliation (src/utils/walletReconcile.ts) replays
//   balance = initialBalance + Σtxn ± transfers (± walletId'd debt/goal ops)
// and auto-runs after every personal sync. If our seed left any drift, that
// reconcile would rewrite every seeded balance (and, for credit wallets, clobber
// the seeded usedCredit). So finalize() sets each wallet's initialBalance to
// exactly `final − flow`, mirroring reconcile → zero drift → reconcile no-ops.
import { useWalletStore } from '../../store/walletStore';
import { usePersonalStore } from '../../store/personalStore';
import { useDebtStore } from '../../store/debtStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useNotesStore } from '../../store/notesStore';
import { useReceiptStore } from '../../store/receiptStore';
import { useBudgetProfileStore } from '../../store/budgetProfileStore';
import { usePendingPaymentsStore } from '../../store/pendingPaymentsStore';
import { roundMoney } from '../money';

import { DEFAULT_SAMPLE_BRACKET, type Persona, type SampleBracket, type SeedContext } from './core';
import { teen } from './personas/teen';
import { student } from './personas/student';
import { professional } from './personas/professional';
import { family } from './personas/family';

export const PERSONAS: Record<SampleBracket, Persona> = { teen, student, professional, family };

/**
 * Is this personal account otherwise empty? Only then is it safe to arm the
 * "exploring with sample data" banner (whose "clear & start fresh" empties ALL
 * personal data), and only then may a seeded wallet claim `isDefault`.
 *
 * Includes the budget profile and the Quick-Log inbox: a user can set up Echo's
 * budget planner (take-home, must-pays) before ever adding a wallet. Treating
 * that account as "empty" would arm a one-tap wipe of real, UNSYNCED data.
 */
export function isPersonalAccountEmpty(): boolean {
  return (
    useWalletStore.getState().wallets.length === 0 &&
    usePersonalStore.getState().transactions.length === 0 &&
    usePersonalStore.getState().subscriptions.length === 0 &&
    usePersonalStore.getState().budgets.length === 0 &&
    usePersonalStore.getState().goals.length === 0 &&
    useDebtStore.getState().debts.length === 0 &&
    useDebtStore.getState().splits.length === 0 &&
    useSavingsStore.getState().accounts.length === 0 &&
    useNotesStore.getState().pages.length === 0 &&
    useReceiptStore.getState().receipts.length === 0 &&
    useBudgetProfileStore.getState().takeHome === null &&
    useBudgetProfileStore.getState().commitments.length === 0 &&
    usePendingPaymentsStore.getState().pending.length === 0
  );
}

/**
 * Seed `bracket` into the real stores. Returns whether the account was empty
 * beforehand (the caller decides what to do with that — see ./index).
 *
 * Appending onto a NON-empty account (Settings → Load Demo Data) never steals
 * the user's default wallet: `isDefault` is dropped for every seeded wallet,
 * because walletStore.addWallet un-defaults all existing wallets when a new
 * default arrives, which would silently redirect the user's quick-logs.
 */
export function seedPersona(bracket: SampleBracket = DEFAULT_SAMPLE_BRACKET): { wasEmpty: boolean } {
  const persona = PERSONAS[bracket] ?? PERSONAS[DEFAULT_SAMPLE_BRACKET];
  const wasEmpty = isPersonalAccountEmpty();

  const walletStore = useWalletStore.getState();
  const personalStore = usePersonalStore.getState();
  const debtStore = useDebtStore.getState();
  const savingsStore = useSavingsStore.getState();
  const notesStore = useNotesStore.getState();
  const receiptStore = useReceiptStore.getState();

  const refToId = new Map<string, string>();
  const seededWalletIds: string[] = [];
  const declaredFinal = new Map<string, number>();

  const resolve = (ref: string): string => {
    const id = refToId.get(ref);
    if (!id && __DEV__) console.warn(`[sampleData] unknown wallet ref "${ref}"`);
    return id ?? '';
  };

  const ctx: SeedContext = {
    wallet: ({ ref, ...w }) => {
      // Never hijack a real user's default wallet when appending demo data.
      walletStore.addWallet(wasEmpty ? w : { ...w, isDefault: false });
      // addWallet prepends the new wallet at index 0.
      const id = useWalletStore.getState().wallets[0].id;
      refToId.set(ref, id);
      seededWalletIds.push(id);
      declaredFinal.set(id, w.balance);
    },
    tx: ({ wallet, ...t }) => {
      personalStore.addTransaction({ ...t, walletId: resolve(wallet) });
    },
    transfer: (fromRef, toRef, amount, note) => {
      // transferBetweenWallets moves balances immediately; finalize() resets each
      // seeded wallet back to its declared final, so that mutation is harmless.
      // Source must be non-credit (a credit source also bumps usedCredit, which
      // finalize would not reset) — personas only transfer bank/ewallet/cash.
      walletStore.transferBetweenWallets(resolve(fromRef), resolve(toRef), amount, note);
    },
    sub: (s) => personalStore.addSubscription(s),
    budget: (b) => personalStore.addBudget(b),
    goal: (g, contributions = []) => {
      personalStore.addGoal(g);
      const goal = usePersonalStore.getState().goals.find((x) => x.name === g.name);
      if (goal) contributions.forEach((c) => personalStore.contributeToGoal(goal.id, c.amount, c.note));
    },
    debt: (d, payments = []) => {
      const id = debtStore.addDebt(d);
      payments.forEach((p) => debtStore.addPayment(id, p));
    },
    split: (s) => debtStore.addSplit(s),
    savings: (a, snapshots = []) => {
      savingsStore.addAccount(a);
      const acc = useSavingsStore.getState().accounts.find((x) => x.name === a.name);
      if (acc) snapshots.forEach((s) => savingsStore.addSnapshot(acc.id, s.value, s.note, s.source));
    },
    note: (mode, content) => {
      const pageId = notesStore.createPage(mode);
      notesStore.updatePageContent(pageId, content);
    },
    receipt: ({ wallet, ...r }) => {
      receiptStore.addReceipt({ ...r, walletId: resolve(wallet) });
    },
  };

  persona.seed(ctx);
  finalize(seededWalletIds, declaredFinal);

  return { wasEmpty };
}

// Re-snapshot each seeded wallet's initialBalance so wallet reconciliation
// computes back exactly the declared final balance (zero drift). `flow` mirrors
// reconcile: transactions on the wallet + wallet transfers. Personas keep debt
// payments and goal contributions wallet-less, so those reconcile terms are 0;
// if a persona ever adds a walletId to one, extend this to match reconcile.
function finalize(seededWalletIds: string[], declaredFinal: Map<string, number>): void {
  const txns = usePersonalStore.getState().transactions;
  const transfers = useWalletStore.getState().transfers ?? [];
  const walletStore = useWalletStore.getState();

  for (const id of seededWalletIds) {
    const final = declaredFinal.get(id) ?? 0;
    let flow = 0;
    for (const t of txns) {
      if (t.walletId !== id) continue;
      if (t.type === 'income') flow += t.amount;
      else if (t.type === 'expense') flow -= t.amount;
    }
    for (const tf of transfers) {
      if (tf.fromWalletId === id) flow -= tf.amount;
      if (tf.toWalletId === id) flow += tf.amount;
    }
    walletStore.updateWallet(id, { balance: final, initialBalance: roundMoney(final - flow) });
  }
}
