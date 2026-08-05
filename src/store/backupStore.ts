import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cloud-backup bookkeeping — which remote objects exist for our local data.
 *
 * Lives SEPARATE from SavedReceipt / Transaction records on purpose: remote
 * IDs are a sync concern, not part of the receipt data model, so personalSync
 * mappers and receipt logic stay untouched.
 *
 * All values are plain JSON (no Dates) so persist needs no custom
 * partialize/rehydrate handling.
 */

export interface ReceiptRemoteEntry {
  driveFileId?: string;
  icloudPath?: string;
  /** epoch ms of the last confirmed remote write. */
  backedUpAt?: number;
}

interface BackupState {
  /** App-created Drive folder "Potraces" (null until provisioned). */
  driveFolderId: string | null;
  /** App-created Drive folder "Potraces/Receipts". */
  receiptsFolderId: string | null;
  /** App-created "Potraces Transactions" spreadsheet. */
  spreadsheetId: string | null;
  /** receipt id → its remote copies. */
  receiptRemote: Record<string, ReceiptRemoteEntry>;
  /** Transaction ids CONFIRMED appended to the spreadsheet (set only on HTTP 200). */
  syncedSheetIds: string[];

  setDriveFolderIds: (rootId: string, receiptsId: string) => void;
  setSpreadsheetId: (id: string | null) => void;
  markReceiptRemote: (receiptId: string, patch: ReceiptRemoteEntry) => void;
  clearReceiptRemote: (receiptId: string) => void;
  addSyncedSheetIds: (ids: string[]) => void;
  resetSyncedSheetIds: () => void;
  /** Google disconnect: forget Drive/Sheets provisioning + Drive remote IDs.
   *  iCloud entries survive — different provider, still valid. */
  resetGoogleBackup: () => void;
}

export const useBackupStore = create<BackupState>()(
  persist(
    (set) => ({
      driveFolderId: null,
      receiptsFolderId: null,
      spreadsheetId: null,
      receiptRemote: {},
      syncedSheetIds: [],

      setDriveFolderIds: (rootId, receiptsId) =>
        set({ driveFolderId: rootId, receiptsFolderId: receiptsId }),

      setSpreadsheetId: (id) => set({ spreadsheetId: id }),

      markReceiptRemote: (receiptId, patch) =>
        set((state) => ({
          receiptRemote: {
            ...state.receiptRemote,
            [receiptId]: { ...state.receiptRemote[receiptId], ...patch },
          },
        })),

      clearReceiptRemote: (receiptId) =>
        set((state) => {
          if (!(receiptId in state.receiptRemote)) return state;
          const next = { ...state.receiptRemote };
          delete next[receiptId];
          return { receiptRemote: next };
        }),

      addSyncedSheetIds: (ids) =>
        set((state) => {
          if (ids.length === 0) return state;
          const known = new Set(state.syncedSheetIds);
          const fresh = ids.filter((id) => !known.has(id));
          return fresh.length === 0
            ? state
            : { syncedSheetIds: [...state.syncedSheetIds, ...fresh] };
        }),

      resetSyncedSheetIds: () => set({ syncedSheetIds: [] }),

      resetGoogleBackup: () =>
        set((state) => {
          const receiptRemote: Record<string, ReceiptRemoteEntry> = {};
          for (const [id, entry] of Object.entries(state.receiptRemote)) {
            const { driveFileId: _drop, ...rest } = entry;
            if (rest.icloudPath) receiptRemote[id] = rest;
          }
          return {
            driveFolderId: null,
            receiptsFolderId: null,
            spreadsheetId: null,
            receiptRemote,
            syncedSheetIds: [],
          };
        }),
    }),
    {
      name: 'backup-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // Late-added fields: guarantee shape for users upgrading from older
        // persisted snapshots (same convention as settingsStore migrations).
        if (state) {
          state.receiptRemote = state.receiptRemote ?? {};
          state.syncedSheetIds = state.syncedSheetIds ?? [];
          state.driveFolderId = state.driveFolderId ?? null;
          state.receiptsFolderId = state.receiptsFolderId ?? null;
          state.spreadsheetId = state.spreadsheetId ?? null;
        }
      },
    }
  )
);
