// ─── Sample-data engine ────────────────────────────────────────────────
// One shared, correctness-critical engine that seeds a persona into the
// personal stores. Personas (teen / student / professional / family) only
// DECLARE their data through the typed `SeedContext` helpers below — the
// empty-account guard, wallet-id resolution, transfer handling, and the
// reconcile-safe `initialBalance` back-out all live here, written once, so no
// persona can drift a balance or corrupt a wallet.
//
// Why the back-out matters: seeded wallet balances are the persona's FINAL
// balances, and `addTransaction` never adjusts a wallet balance (only
// edit/delete do). Wallet reconciliation (src/utils/walletReconcile.ts) replays
//   balance = initialBalance + Σtxn ± transfers (± walletId'd debt/goal ops)
// and auto-runs after every personal sync. If our seed left any drift, that
// reconcile would rewrite every seeded balance (and, for credit wallets, clobber
// the seeded usedCredit). So `finalize()` sets each wallet's initialBalance to
// exactly `final − flow`, mirroring reconcile → zero drift → reconcile no-ops.
import { useWalletStore } from '../../store/walletStore';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useDebtStore } from '../../store/debtStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useNotesStore } from '../../store/notesStore';
import { useReceiptStore } from '../../store/receiptStore';
import { roundMoney } from '../money';

import { teen } from './personas/teen';
import { student } from './personas/student';
import { professional } from './personas/professional';
import { family } from './personas/family';

export type SampleBracket = 'teen' | 'student' | 'professional' | 'family';

// ─── Input types derived from the real store actions ───────────────────
// Deriving via Parameters<> means persona data can never silently drift from
// the store contracts — a shape change in a store surfaces as a type error here.
type WalletInput  = Parameters<ReturnType<typeof useWalletStore.getState>['addWallet']>[0];
type TxStoreInput = Parameters<ReturnType<typeof usePersonalStore.getState>['addTransaction']>[0];
type SubInput     = Parameters<ReturnType<typeof usePersonalStore.getState>['addSubscription']>[0];
type BudgetInput  = Parameters<ReturnType<typeof usePersonalStore.getState>['addBudget']>[0];
type GoalInput    = Parameters<ReturnType<typeof usePersonalStore.getState>['addGoal']>[0];
type DebtInput    = Parameters<ReturnType<typeof useDebtStore.getState>['addDebt']>[0];
type PaymentInput = Parameters<ReturnType<typeof useDebtStore.getState>['addPayment']>[1];
type SplitInput   = Parameters<ReturnType<typeof useDebtStore.getState>['addSplit']>[0];
type SavingsInput = Parameters<ReturnType<typeof useSavingsStore.getState>['addAccount']>[0];
type SnapshotSrc  = Parameters<ReturnType<typeof useSavingsStore.getState>['addSnapshot']>[3];
type ReceiptInput = Parameters<ReturnType<typeof useReceiptStore.getState>['addReceipt']>[0];

// Persona-facing seed shapes: anything that points at a wallet references it by
// a local `ref` string (real ids don't exist until add time).
export type WalletSeed   = WalletInput & { ref: string };
export type TxSeed       = Omit<TxStoreInput, 'walletId'> & { wallet: string };
export type ReceiptSeed  = Omit<ReceiptInput, 'walletId'> & { wallet: string };
export type ContribSeed  = { amount: number; note: string };
export type SnapshotSeed = { value: number; note: string; source: SnapshotSrc };

export interface SeedContext {
  /** Declare a wallet. `balance` is its FINAL (current) balance. */
  wallet(seed: WalletSeed): void;
  /** Declare a transaction. `wallet` is a wallet ref; never touches balances. */
  tx(seed: TxSeed): void;
  /** Move money between two NON-credit wallets and record it as a transfer. */
  transfer(fromRef: string, toRef: string, amount: number, note: string): void;
  sub(seed: SubInput): void;
  budget(seed: BudgetInput): void;
  goal(seed: GoalInput, contributions?: ContribSeed[]): void;
  debt(seed: DebtInput, payments?: PaymentInput[]): void;
  split(seed: SplitInput): void;
  savings(seed: SavingsInput, snapshots?: SnapshotSeed[]): void;
  note(mode: 'personal' | 'business', content: string): void;
  receipt(seed: ReceiptSeed): void;
}

export interface Persona {
  id: SampleBracket;
  seed: (c: SeedContext) => void;
}

// ─── Shared date helpers (deterministic relative to "now") ─────────────
export const daysAgo = (n: number, hour = 12): Date => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

export const startOfMonth = (): Date => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfMonth = (): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};

// ─── Persona registry + picker metadata ────────────────────────────────
const PERSONAS: Record<SampleBracket, Persona> = { teen, student, professional, family };

// Order + icons for the onboarding / Settings profile picker. Labels + blurbs
// are localized (t.sampleData.profiles[id]); age ranges are numeric (no i18n).
export interface SampleProfileMeta {
  id: SampleBracket;
  icon: string; // Feather glyph
  age: string;
}
export const SAMPLE_PROFILES: SampleProfileMeta[] = [
  { id: 'teen', icon: 'smile', age: '13–18' },
  { id: 'student', icon: 'book-open', age: '19–24' },
  { id: 'professional', icon: 'briefcase', age: '25–29' },
  { id: 'family', icon: 'home', age: '30+' },
];

export const DEFAULT_SAMPLE_BRACKET: SampleBracket = 'professional';

// ─── The engine ────────────────────────────────────────────────────────
export function loadSampleData(bracket: SampleBracket = DEFAULT_SAMPLE_BRACKET): void {
  const persona = PERSONAS[bracket] ?? PERSONAS[DEFAULT_SAMPLE_BRACKET];

  const walletStore = useWalletStore.getState();
  const personalStore = usePersonalStore.getState();
  const debtStore = useDebtStore.getState();
  const savingsStore = useSavingsStore.getState();
  const notesStore = useNotesStore.getState();
  const receiptStore = useReceiptStore.getState();

  // Was this an otherwise-empty personal account before we seeded? Only then is
  // it safe to arm the "exploring with sample data" banner (whose "clear & start
  // fresh" empties ALL personal data). If a real user appends the sample set on
  // top of their own data (Settings → Load Sample Data appends, never clears),
  // we must NOT arm that one-tap wipe. Every persona creates wallets +
  // transactions, so any pre-existing personal row means this is a real account.
  const wasEmptyPersonalAccount =
    walletStore.wallets.length === 0 &&
    personalStore.transactions.length === 0 &&
    personalStore.subscriptions.length === 0 &&
    personalStore.budgets.length === 0 &&
    personalStore.goals.length === 0 &&
    debtStore.debts.length === 0 &&
    debtStore.splits.length === 0 &&
    savingsStore.accounts.length === 0 &&
    notesStore.pages.length === 0 &&
    receiptStore.receipts.length === 0;

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
      walletStore.addWallet(w);
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

  // Arm the explore banner (see wasEmptyPersonalAccount). Cleared by clearSampleData
  // and by the sign-in guard before it reaches a real cloud account.
  if (wasEmptyPersonalAccount) {
    useSettingsStore.getState().setSampleDataLoaded(true);
  }
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
