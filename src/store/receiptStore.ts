import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReceiptState, ReceiptDraft, TaxCategorySummary } from '../types';
import { useTombstoneStore } from './tombstoneStore';
import { MYTAX_CATEGORIES } from '../constants/taxCategories';
import { newId } from '../utils/id';
import { roundMoney } from '../utils/money';
// NOTE: expo-file-system + ../utils/receiptImage are lazy-require'd inside
// deleteReceipt (native modules) so this store stays tsx-test-loadable — same
// reason personalStore is require'd below, not imported at top.

export const useReceiptStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      receipts: [],
      draft: null,
      _deletedReceiptIds: [],
      _dirtyReceiptIds: [],

      clearReceiptTombstones: () => set({ _deletedReceiptIds: [] }),

      clearReceiptDirty: () => set({ _dirtyReceiptIds: [] }),

      addReceipt: (receipt) => {
        const id = newId();
        set((state) => ({
          receipts: [
            {
              ...receipt,
              id,
              total: Number.isFinite(receipt.total) ? receipt.total : 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.receipts,
          ],
          _dirtyReceiptIds: [...(state._dirtyReceiptIds ?? []), id],
        }));
        return id;
      },

      updateReceipt: (id, updates) =>
        set((state) => {
          const existing = state.receipts.find((r) => r.id === id);
          // No-op guard: if nothing actually changes, don't bump updatedAt or
          // create a new state object — re-tapping the same category shouldn't
          // burn an LWW timestamp or churn the sync engine.
          if (
            existing &&
            (Object.keys(updates) as (keyof typeof updates)[]).every(
              (k) => existing[k] === updates[k]
            )
          ) {
            return state;
          }
          return {
            receipts: state.receipts.map((r) =>
              r.id === id ? { ...r, ...updates, updatedAt: new Date() } : r
            ),
            _dirtyReceiptIds: [...(state._dirtyReceiptIds ?? []), id],
          };
        }),

      deleteReceipt: (id) => {
        const receipt = get().receipts.find((r) => r.id === id);
        set((state) => ({
          receipts: state.receipts.filter((r) => r.id !== id),
          _deletedReceiptIds: [...(state._deletedReceiptIds ?? []), id],
        }));
        // Best-effort cleanup of the local image file so deleting a receipt
        // doesn't leak storage. Only touch local file:// paths — never a
        // remote/http uri (those live in Storage, cleaned up by sync). Native
        // modules are require'd lazily so this store stays tsx-test-loadable.
        if (receipt?.imageUri) {
          try {
            const { resolveReceiptImageUri } = require('../utils/receiptImage');
            const FileSystem = require('expo-file-system/legacy');
            const abs = resolveReceiptImageUri(receipt.imageUri);
            if (abs && (abs.startsWith('file://') || abs.startsWith('/'))) {
              FileSystem.deleteAsync(abs, { idempotent: true }).catch(() => {});
            }
          } catch {
            // best-effort
          }
        }
        useTombstoneStore.getState().addTombstones([id]);
        // Also remove the transaction this receipt created, so deleting a saved
        // receipt doesn't leave an orphan expense behind. deleteTransaction
        // reverses the wallet balance, so the money trail stays consistent.
        if (receipt?.transactionId) {
          const { usePersonalStore } = require('./personalStore');
          usePersonalStore.getState().deleteTransaction(receipt.transactionId);
        }
      },

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
          const totalSpent = catReceipts.reduce(
            (sum, r) => roundMoney(sum + r.total),
            0
          );
          summaries.push({
            categoryId: cat.id,
            categoryName: cat.name,
            totalSpent,
            limit: cat.limit,
            receiptCount: catReceipts.length,
            remaining: cat.limit !== null ? Math.max(roundMoney(cat.limit - totalSpent), 0) : null,
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
        _deletedReceiptIds: state._deletedReceiptIds ?? [],
        _dirtyReceiptIds: state._dirtyReceiptIds ?? [],
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
          state._deletedReceiptIds = state._deletedReceiptIds ?? [];
          state._dirtyReceiptIds = state._dirtyReceiptIds ?? [];
        }
      },
    }
  )
);
