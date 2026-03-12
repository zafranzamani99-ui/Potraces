import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CategoryPattern {
  keyword: string;
  category: string;
  count: number;
}

interface PersonAlias {
  raw: string;
  preferred: string;
  count: number;
}

interface WalletPreference {
  keyword: string;
  wallet: string;
  count: number;
}

interface TypeCorrection {
  keyword: string;
  toType: string;
  count: number;
}

const MAX_PATTERNS = 100;

function upsert<T extends { count: number }>(
  arr: T[],
  match: (item: T) => boolean,
  create: () => T
): T[] {
  const idx = arr.findIndex(match);
  if (idx >= 0) {
    const updated = [...arr];
    updated[idx] = { ...updated[idx], count: updated[idx].count + 1 };
    return updated;
  }
  const next = [...arr, create()];
  // Cap at MAX_PATTERNS — evict lowest count
  if (next.length > MAX_PATTERNS) {
    next.sort((a, b) => b.count - a.count);
    return next.slice(0, MAX_PATTERNS);
  }
  return next;
}

interface LearningState {
  categoryPatterns: CategoryPattern[];
  personAliases: PersonAlias[];
  walletPreferences: WalletPreference[];
  typeCorrections: TypeCorrection[];
  skippedKeywords: Record<string, number>;

  learnCategory: (keyword: string, category: string) => void;
  learnPersonAlias: (raw: string, preferred: string) => void;
  learnWallet: (keyword: string, wallet: string) => void;
  learnTypeCorrection: (keyword: string, toType: string) => void;
  learnSkip: (keyword: string) => void;

  getSuggestedCategory: (text: string) => string | null;
  getSuggestedPerson: (raw: string) => string | null;
  getSuggestedWallet: (text: string) => string | null;
  getPromptHints: () => string;
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      categoryPatterns: [],
      personAliases: [],
      walletPreferences: [],
      typeCorrections: [],
      skippedKeywords: {},

      learnCategory: (keyword, category) => {
        const kw = keyword.toLowerCase().trim();
        if (!kw || !category) return;
        set((s) => ({
          categoryPatterns: upsert(
            s.categoryPatterns,
            (p) => p.keyword === kw && p.category === category,
            () => ({ keyword: kw, category, count: 1 })
          ),
        }));
      },

      learnPersonAlias: (raw, preferred) => {
        const r = raw.toLowerCase().trim();
        const p = preferred.trim();
        if (!r || !p || r === p.toLowerCase()) return;
        set((s) => ({
          personAliases: upsert(
            s.personAliases,
            (a) => a.raw === r,
            () => ({ raw: r, preferred: p, count: 1 })
          ),
        }));
      },

      learnWallet: (keyword, wallet) => {
        const kw = keyword.toLowerCase().trim();
        if (!kw || !wallet) return;
        set((s) => ({
          walletPreferences: upsert(
            s.walletPreferences,
            (p) => p.keyword === kw,
            () => ({ keyword: kw, wallet, count: 1 })
          ),
        }));
      },

      learnTypeCorrection: (keyword, toType) => {
        const kw = keyword.toLowerCase().trim();
        if (!kw || !toType) return;
        set((s) => ({
          typeCorrections: upsert(
            s.typeCorrections,
            (t) => t.keyword === kw && t.toType === toType,
            () => ({ keyword: kw, toType, count: 1 })
          ),
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
        }));
      },

      getSuggestedCategory: (text) => {
        const lower = text.toLowerCase();
        const { categoryPatterns } = get();
        // Find highest-count pattern that matches
        let best: CategoryPattern | null = null;
        for (const p of categoryPatterns) {
          if (p.count >= 2 && lower.includes(p.keyword)) {
            if (!best || p.count > best.count) best = p;
          }
        }
        return best?.category || null;
      },

      getSuggestedPerson: (raw) => {
        const r = raw.toLowerCase().trim();
        const alias = get().personAliases.find((a) => a.raw === r);
        return alias ? alias.preferred : null;
      },

      getSuggestedWallet: (text) => {
        const lower = text.toLowerCase();
        const { walletPreferences } = get();
        let best: WalletPreference | null = null;
        for (const p of walletPreferences) {
          if (p.count >= 2 && lower.includes(p.keyword)) {
            if (!best || p.count > best.count) best = p;
          }
        }
        return best?.wallet || null;
      },

      getPromptHints: () => {
        const { categoryPatterns, personAliases, typeCorrections } = get();
        const hints: string[] = [];

        // Category patterns (count >= 2)
        const cats = categoryPatterns.filter((p) => p.count >= 2);
        for (const p of cats.slice(0, 10)) {
          hints.push(`"${p.keyword}" → category "${p.category}"`);
        }

        // Person aliases
        for (const a of personAliases.slice(0, 10)) {
          hints.push(`"${a.raw}" is a person, preferred name: "${a.preferred}"`);
        }

        // Type corrections (count >= 2)
        const types = typeCorrections.filter((t) => t.count >= 2);
        for (const t of types.slice(0, 10)) {
          hints.push(`"${t.keyword}" should be intent "${t.toType}"`);
        }

        if (hints.length === 0) return '';
        return `\nUSER PREFERENCES (learned from corrections):\n${hints.map((h) => `- ${h}`).join('\n')}`;
      },
    }),
    {
      name: 'learning-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        categoryPatterns: state.categoryPatterns,
        personAliases: state.personAliases,
        walletPreferences: state.walletPreferences,
        typeCorrections: state.typeCorrections,
        skippedKeywords: state.skippedKeywords,
      }),
    }
  )
);
