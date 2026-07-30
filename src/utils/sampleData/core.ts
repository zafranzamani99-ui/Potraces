// ─── Sample-data core: types, helpers, picker metadata ─────────────────
// Deliberately free of runtime store/native imports (the store imports below are
// `import type`, erased at compile time). Personas import from HERE, never from
// ./index — index pulls in settingsStore, which transitively imports react-native
// and cannot be loaded by the tsx test runner. Keeping this module pure is what
// lets scripts/test-sample-data.ts exercise the real seeding + reconcile math.
import type { useWalletStore } from '../../store/walletStore';
import type { usePersonalStore } from '../../store/personalStore';
import type { useDebtStore } from '../../store/debtStore';
import type { useSavingsStore } from '../../store/savingsStore';
import type { useReceiptStore } from '../../store/receiptStore';
import type { MemoryKind } from '../../store/learningStore';

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
export type BudgetProfileSeed = { takeHome: number; commitments: { label: string; monthly: number }[] };
export type MemorySeed = { kind: MemoryKind; text: string; source: 'you' | 'echo'; pinned?: boolean };

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
  /** Seed Echo's "echo plan" budget planner: take-home pay + locked monthly must-pays. */
  budgetProfile(seed: BudgetProfileSeed): void;

  // ─── Echo's notebook (learningStore) — the shortcuts Echo picked up from
  // corrections + the durable facts it remembers. Appends/upserts, never clobbers.
  /** Teach a keyword→category shortcut. `category` is a real expense category id. `count` (default TRUST_COUNT) is the confidence: ≥2 lands in "knows you", 1 in "still learning". */
  learnCategory(keyword: string, category: string, count?: number): void;
  /** Teach which wallet a keyword is usually paid from. `wallet` = the wallet's display name. */
  learnWallet(keyword: string, wallet: string, count?: number): void;
  /** Teach a person alias: what you type (`raw`) → who they are (`preferred`). `count` repeats build confidence. */
  learnPerson(raw: string, preferred: string, count?: number): void;
  /** Teach that a keyword is really a given entry type (e.g. `toType` 'income'). `count` repeats build confidence. */
  learnType(keyword: string, toType: string, count?: number): void;
  /** Record that Echo learned to skip a keyword (never a spend), over `times` corrections. */
  learnSkip(keyword: string, times?: number): void;
  /** Add a durable fact to "what echo remembers about you". */
  memory(seed: MemorySeed): void;
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

// ─── Picker metadata ───────────────────────────────────────────────────
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
