import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReceiptState, ReceiptDraft, TaxCategorySummary } from '../types';
import { MYTAX_CATEGORIES } from '../constants/taxCategories';

export const useReceiptStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      receipts: [],
      draft: null,

      addReceipt: (receipt) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
        set((state) => ({
          receipts: [
            {
              ...receipt,
              id,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.receipts,
          ],
        }));
        return id;
      },

      updateReceipt: (id, updates) =>
        set((state) => ({
          receipts: state.receipts.map((r) =>
            r.id === id ? { ...r, ...updates, updatedAt: new Date() } : r
          ),
        })),

      deleteReceipt: (id) =>
        set((state) => ({
          receipts: state.receipts.filter((r) => r.id !== id),
        })),

      getReceiptsByYear: (year) =>
        get().receipts.filter((r) => r.year === year),

      getReceiptsByTaxCategory: (year, categoryId) =>
        get().receipts.filter((r) => r.year === year && r.myTaxCategory === categoryId),

      getTaxSummary: (year) => {
        const receipts = get().receipts.filter((r) => r.year === year);
        const summaries: TaxCategorySummary[] = [];

        for (const cat of MYTAX_CATEGORIES) {
          if (cat.id === 'none') continue;
          const catReceipts = receipts.filter((r) => r.myTaxCategory === cat.id);
          if (catReceipts.length === 0) continue;
          const totalSpent = catReceipts.reduce((sum, r) => sum + r.total, 0);
          summaries.push({
            categoryId: cat.id,
            categoryName: cat.name,
            totalSpent,
            limit: cat.limit,
            receiptCount: catReceipts.length,
            remaining: cat.limit !== null ? Math.max(cat.limit - totalSpent, 0) : null,
          });
        }

        return summaries;
      },

      saveDraft: (draft) =>
        set({ draft: { ...draft, savedAt: new Date() } }),

      clearDraft: () => set({ draft: null }),
    }),
    {
      name: 'receipt-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        receipts: state.receipts.map((r) => ({
          ...r,
          date: r.date instanceof Date ? r.date.toISOString() : r.date,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        })),
        draft: state.draft ? {
          ...state.draft,
          date: state.draft.date instanceof Date ? state.draft.date.toISOString() : state.draft.date,
          savedAt: state.draft.savedAt instanceof Date ? state.draft.savedAt.toISOString() : state.draft.savedAt,
        } : null,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => {
            if (!v) return new Date();
            const d = v instanceof Date ? v : new Date(v);
            return isNaN(d.getTime()) ? new Date() : d;
          };
          state.receipts = (state.receipts || []).map((r: any) => ({
            ...r,
            date: sd(r.date),
            createdAt: sd(r.createdAt),
            updatedAt: sd(r.updatedAt),
          }));
          if (state.draft) {
            state.draft.date = sd(state.draft.date);
            state.draft.savedAt = sd(state.draft.savedAt);
          }
        }
      },
    }
  )
);
