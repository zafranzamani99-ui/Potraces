import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePersonalStore } from './personalStore';
import { newId } from '../utils/id';

// ─── Import batch store ──────────────────────────────────────────────────────
// One record per statement/CSV import so a bulk import can be UNDONE as a unit
// (toast action on the import screens). undoBatch reuses personalStore's
// deleteTransaction per row — deletion already reverses wallet deltas and frees
// dedupe keys, so undo reuses proven logic instead of duplicating it.
// Only the last MAX_BATCHES are kept (pruned oldest-first on write).

export interface ImportBatch {
  id: string;
  createdAt: number;
  source: 'statement' | 'csv';
  walletId?: string;
  filename?: string;
  txIds: string[];
}

interface ImportBatchState {
  batches: ImportBatch[];
  /** Record a freshly-imported batch. Mints the id; returns it for undo closures. */
  recordBatch: (batch: Omit<ImportBatch, 'id' | 'createdAt'>) => string;
  /** Delete every transaction the batch created, then drop the record. */
  undoBatch: (id: string) => void;
}

const MAX_BATCHES = 20;

export const useImportBatchStore = create<ImportBatchState>()(
  persist(
    (set, get) => ({
      batches: [],

      recordBatch: (batch) => {
        const id = newId();
        set((state) => ({
          batches: [{ ...batch, id, createdAt: Date.now() }, ...state.batches].slice(0, MAX_BATCHES),
        }));
        return id;
      },

      undoBatch: (id) => {
        const batch = get().batches.find((b) => b.id === id);
        if (!batch) return;
        const personal = usePersonalStore.getState();
        for (const txId of batch.txIds) personal.deleteTransaction(txId);
        set((state) => ({ batches: state.batches.filter((b) => b.id !== id) }));
      },
    }),
    {
      name: 'import-batch-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
