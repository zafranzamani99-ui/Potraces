import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CategoryPattern,
  PersonAlias,
  WalletPreference,
  TypeCorrection,
  TRUST_COUNT,
  MIN_KEYWORD_LENGTH,
  MAX_PATTERNS,
  normalizeKeyword,
  upsert,
  applyLearnCategory,
  applyLearnWallet,
  applyLearnPersonAlias,
  suggestFrom,
  migrateLearningV0toV1,
  LearningBlob,
  EchoMemory,
  MemoryKind,
  applyAddMemory,
  renderMemoryHints,
} from './learningPure';

// Re-export so existing imports from the store keep working, and the Notebook
// screen can share the trust threshold.
export { TRUST_COUNT, normalizeKeyword, MEMORY_KINDS, inferMemoryKind } from './learningPure';
export type { CategoryPattern, PersonAlias, WalletPreference, TypeCorrection, EchoMemory, MemoryKind } from './learningPure';

interface LearningState {
  categoryPatterns: CategoryPattern[];
  personAliases: PersonAlias[];
  walletPreferences: WalletPreference[];
  typeCorrections: TypeCorrection[];
  skippedKeywords: Record<string, number>;
  /** Durable facts Echo remembers about the owner (goals, bills, worries…). */
  memories: EchoMemory[];
  /**
   * Epoch ms of the last USER edit on this device (null = never edited here).
   * LWW key for cloud sync — bumped by every learn/forget setter, NOT by
   * applySyncedLearning.
   */
  updatedAt: number | null;

  /** startCount ≥ TRUST_COUNT = instantly trusted (manual add in Echo's Notebook). */
  learnCategory: (keyword: string, category: string, startCount?: number) => void;
  learnPersonAlias: (raw: string, preferred: string) => void;
  learnWallet: (keyword: string, wallet: string, startCount?: number) => void;
  learnTypeCorrection: (keyword: string, toType: string) => void;
  learnSkip: (keyword: string) => void;

  /** Notebook screen edits — each forget* normalizes its input like learn* does. */
  forgetCategory: (keyword: string, category: string) => void;
  forgetWallet: (keyword: string) => void;
  forgetPersonAlias: (raw: string) => void;
  forgetTypeCorrection: (keyword: string, toType: string) => void;
  forgetSkipped: (keyword: string) => void;
  resetNotebook: () => void;

  /** Echo's memory of you. `cap` = the tier's storage ceiling (caller reads the tier). */
  addMemory: (input: { kind: MemoryKind; text: string; source: 'you' | 'echo' }, cap: number) => void;
  editMemory: (id: string, text: string) => void;
  forgetMemory: (id: string) => void;
  setMemoryPinned: (id: string, pinned: boolean) => void;
  resetMemories: () => void;
  /** The "WHAT ECHO REMEMBERS ABOUT YOU" prompt block (pinned-first, capped). */
  getMemoryHints: () => string;

  getSuggestedCategory: (text: string) => string | null;
  getSuggestedPerson: (raw: string) => string | null;
  getSuggestedWallet: (text: string) => string | null;
  /** Provenance variants ("sebab you ajar"): the winning rule's keyword + count
   *  ride along, so a chip can state WHY it auto-filled ("your rule · 4×"). */
  getCategorySuggestion: (text: string) => { category: string; keyword: string; count: number } | null;
  getWalletSuggestion: (text: string) => { wallet: string; keyword: string; count: number } | null;
  getPromptHints: () => string;
  /** Sync push: the persisted learning blob (the fields in partialize). */
  getSyncData: () => Partial<LearningState>;
  /** Sync pull: adopt a pulled remote blob verbatim (carries the REMOTE edit time). */
  applySyncedLearning: (data: Partial<LearningState>, updatedAt: number) => void;
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      categoryPatterns: [],
      personAliases: [],
      walletPreferences: [],
      typeCorrections: [],
      skippedKeywords: {},
      memories: [],
      updatedAt: null,

      learnCategory: (keyword, category, startCount = 1) =>
        set((s) => ({
          categoryPatterns: applyLearnCategory(s.categoryPatterns, keyword, category, startCount),
          updatedAt: Date.now(),
        })),

      learnPersonAlias: (raw, preferred) =>
        set((s) => ({
          personAliases: applyLearnPersonAlias(s.personAliases, raw, preferred),
          updatedAt: Date.now(),
        })),

      learnWallet: (keyword, wallet, startCount = 1) =>
        set((s) => ({
          walletPreferences: applyLearnWallet(s.walletPreferences, keyword, wallet, startCount),
          updatedAt: Date.now(),
        })),

      learnTypeCorrection: (keyword, toType) => {
        const kw = normalizeKeyword(keyword, true);
        if (kw.length < MIN_KEYWORD_LENGTH || !toType) return;
        set((s) => ({
          typeCorrections: upsert(
            s.typeCorrections,
            (t) => t.keyword === kw && t.toType === toType,
            () => ({ keyword: kw, toType, count: 1 })
          ),
          updatedAt: Date.now(),
        }));
      },

      learnSkip: (keyword) => {
        const kw = keyword.toLowerCase().trim();
        if (!kw) return;
        set((s) => ({
          skippedKeywords: {
            ...s.skippedKeywords,
            [kw]: (s.skippedKeywords[kw] || 0) + 1,
          },
          updatedAt: Date.now(),
        }));
      },

      forgetCategory: (keyword, category) => {
        const kw = normalizeKeyword(keyword, true);
        set((s) => ({
          categoryPatterns: s.categoryPatterns.filter(
            (p) => !(p.keyword === kw && p.category === category)
          ),
          updatedAt: Date.now(),
        }));
      },

      forgetWallet: (keyword) => {
        const kw = normalizeKeyword(keyword, true);
        set((s) => ({
          walletPreferences: s.walletPreferences.filter((p) => p.keyword !== kw),
          updatedAt: Date.now(),
        }));
      },

      forgetPersonAlias: (raw) => {
        const r = raw.toLowerCase().trim();
        set((s) => ({
          personAliases: s.personAliases.filter((a) => a.raw !== r),
          updatedAt: Date.now(),
        }));
      },

      // Same key transform as learnTypeCorrection (normalizeKeyword) so a row's
      // stored keyword matches. Idempotent — re-normalizing a normalized key is a no-op.
      forgetTypeCorrection: (keyword, toType) => {
        const kw = normalizeKeyword(keyword, true);
        set((s) => ({
          typeCorrections: s.typeCorrections.filter(
            (t) => !(t.keyword === kw && t.toType === toType)
          ),
          updatedAt: Date.now(),
        }));
      },

      // skippedKeywords uses the raw lowercase key (learnSkip's transform).
      forgetSkipped: (keyword) => {
        const kw = keyword.toLowerCase().trim();
        set((s) => {
          const { [kw]: _removed, ...rest } = s.skippedKeywords;
          return { skippedKeywords: rest, updatedAt: Date.now() };
        });
      },

      resetNotebook: () =>
        set({
          categoryPatterns: [],
          personAliases: [],
          walletPreferences: [],
          typeCorrections: [],
          skippedKeywords: {},
          updatedAt: Date.now(),
        }),

      addMemory: (input, cap) =>
        set((s) => ({
          memories: applyAddMemory(
            s.memories,
            { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, kind: input.kind, text: input.text, source: input.source, now: Date.now() },
            cap,
          ),
          updatedAt: Date.now(),
        })),
      editMemory: (id, text) =>
        set((s) => ({
          memories: s.memories.map((m) => (m.id === id ? { ...m, text: text.trim(), updatedAt: Date.now() } : m)),
          updatedAt: Date.now(),
        })),
      forgetMemory: (id) =>
        set((s) => ({ memories: s.memories.filter((m) => m.id !== id), updatedAt: Date.now() })),
      setMemoryPinned: (id, pinned) =>
        set((s) => ({
          memories: s.memories.map((m) => (m.id === id ? { ...m, pinned, updatedAt: Date.now() } : m)),
          updatedAt: Date.now(),
        })),
      resetMemories: () => set({ memories: [], updatedAt: Date.now() }),
      getMemoryHints: () => renderMemoryHints(get().memories),

      getSuggestedCategory: (text) => suggestFrom(get().categoryPatterns, text)?.category || null,

      getCategorySuggestion: (text) => suggestFrom(get().categoryPatterns, text),

      getSuggestedPerson: (raw) => {
        const r = raw.toLowerCase().trim();
        const alias = get().personAliases.find((a) => a.raw === r);
        return alias ? alias.preferred : null;
      },

      getSuggestedWallet: (text) => suggestFrom(get().walletPreferences, text)?.wallet || null,

      getWalletSuggestion: (text) => suggestFrom(get().walletPreferences, text),

      getPromptHints: () => {
        const { categoryPatterns, personAliases, walletPreferences, typeCorrections } = get();
        const hints: string[] = [];

        // Category patterns (trusted)
        const cats = categoryPatterns.filter((p) => p.count >= TRUST_COUNT);
        for (const p of cats.slice(0, 10)) {
          hints.push(`"${p.keyword}" → category "${p.category}"`);
        }

        // Person aliases
        for (const a of personAliases.slice(0, 10)) {
          hints.push(`"${a.raw}" is a person, preferred name: "${a.preferred}"`);
        }

        // Wallet preferences (trusted)
        const wallets = walletPreferences.filter((w) => w.count >= TRUST_COUNT);
        for (const w of wallets.slice(0, 5)) {
          hints.push(`"${w.keyword}" → wallet "${w.wallet}"`);
        }

        // Type corrections (trusted)
        const types = typeCorrections.filter((t) => t.count >= TRUST_COUNT);
        for (const t of types.slice(0, 10)) {
          hints.push(`"${t.keyword}" should be intent "${t.toType}"`);
        }

        if (hints.length === 0) return '';
        return `\nUSER PREFERENCES (learned from corrections):\n${hints.map((h) => `- ${h}`).join('\n')}`;
      },

      getSyncData: () => {
        const s = get();
        return {
          categoryPatterns: s.categoryPatterns,
          personAliases: s.personAliases,
          walletPreferences: s.walletPreferences,
          typeCorrections: s.typeCorrections,
          skippedKeywords: s.skippedKeywords,
          memories: s.memories,
        };
      },
      applySyncedLearning: (data, updatedAt) => set({ ...data, updatedAt }),
    }),
    {
      name: 'learning-storage',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted: any, version: number) =>
        version === 0 ? migrateLearningV0toV1(persisted as LearningBlob) : persisted,
      partialize: (state) => ({
        categoryPatterns: state.categoryPatterns,
        personAliases: state.personAliases,
        walletPreferences: state.walletPreferences,
        typeCorrections: state.typeCorrections,
        skippedKeywords: state.skippedKeywords,
        memories: state.memories,
        updatedAt: state.updatedAt,
      }),
    }
  )
);

// MAX_PATTERNS lives in learningPure; re-exported here for any external cap checks.
export { MAX_PATTERNS };
