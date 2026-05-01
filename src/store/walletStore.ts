import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WalletState } from '../types';
import { newId } from '../utils/id';

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      wallets: [],
      transfers: [],
      selectedWalletId: null,
      _deletedWalletIds: [],
      _deletedTransferIds: [],

      clearWalletTombstones: () => set({
        _deletedWalletIds: [],
        _deletedTransferIds: [],
      }),

      addWallet: (wallet) =>
        set((state) => {
          const makingDefault = !!wallet.isDefault;
          const next = {
            ...wallet,
            id: newId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return {
            wallets: [
              next,
              ...(makingDefault
                ? state.wallets.map((w) => (w.isDefault ? { ...w, isDefault: false, updatedAt: new Date() } : w))
                : state.wallets),
            ],
          };
        }),

      updateWallet: (id, updates) =>
        set((state) => {
          const makingDefault = updates.isDefault === true;
          return {
            wallets: state.wallets.map((w) => {
              if (w.id === id) return { ...w, ...updates, updatedAt: new Date() };
              if (makingDefault && w.isDefault) return { ...w, isDefault: false, updatedAt: new Date() };
              return w;
            }),
          };
        }),

      deleteWallet: (id) =>
        set((state) => ({
          wallets: state.wallets.filter((w) => w.id !== id),
          selectedWalletId:
            state.selectedWalletId === id ? null : state.selectedWalletId,
          _deletedWalletIds: [...(state._deletedWalletIds ?? []), id],
        })),

      setSelectedWallet: (id) => set({ selectedWalletId: id }),

      setDefaultWallet: (id) =>
        set((state) => ({
          wallets: state.wallets.map((w) => ({
            ...w,
            isDefault: w.id === id,
            updatedAt: w.id === id ? new Date() : w.updatedAt,
          })),
        })),

      deductFromWallet: (id, amount) =>
        set((state) => ({
          wallets: state.wallets.map((w) => {
            if (w.id !== id) return w;
            if (w.type === 'credit') {
              return {
                ...w,
                balance: w.balance - amount,
                usedCredit: (w.usedCredit || 0) + amount,
                updatedAt: new Date(),
              };
            }
            return { ...w, balance: w.balance - amount, updatedAt: new Date() };
          }),
        })),

      addToWallet: (id, amount) =>
        set((state) => ({
          wallets: state.wallets.map((w) => {
            if (w.id !== id) return w;
            if (w.type === 'credit') {
              return {
                ...w,
                balance: w.balance + amount,
                usedCredit: Math.max(0, (w.usedCredit || 0) - amount),
                updatedAt: new Date(),
              };
            }
            return { ...w, balance: w.balance + amount, updatedAt: new Date() };
          }),
        })),

      setWalletBalance: (id, balance) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id ? { ...w, balance, updatedAt: new Date() } : w
          ),
        })),

      transferBetweenWallets: (fromId, toId, amount, note) =>
        set((state) => {
          const transfer = {
            id: newId(),
            fromWalletId: fromId,
            toWalletId: toId,
            amount,
            note,
            date: new Date(),
            createdAt: new Date(),
          };

          return {
            wallets: state.wallets.map((w) => {
              if (w.id === fromId) {
                // If credit wallet is source, increase usedCredit
                if (w.type === 'credit') {
                  return {
                    ...w,
                    balance: w.balance - amount,
                    usedCredit: (w.usedCredit || 0) + amount,
                    updatedAt: new Date(),
                  };
                }
                return { ...w, balance: w.balance - amount, updatedAt: new Date() };
              }
              if (w.id === toId) {
                return { ...w, balance: w.balance + amount, updatedAt: new Date() };
              }
              return w;
            }),
            transfers: [transfer, ...state.transfers],
          };
        }),

      logActivity: (fromId, toId, amount, kind, note) =>
        set((state) => ({
          transfers: [
            {
              id: newId(),
              fromWalletId: fromId,
              toWalletId: toId,
              amount,
              note,
              date: new Date(),
              createdAt: new Date(),
              kind,
            },
            ...state.transfers,
          ],
        })),

      deleteTransfer: (transferId) =>
        set((state) => {
          const t = state.transfers.find((x) => x.id === transferId);
          if (!t) return state;
          // Rollback: reverse the transfer on both wallets
          const wallets = state.wallets.map((w) => {
            if (w.id === t.fromWalletId) {
              if (w.type === 'credit') {
                return {
                  ...w,
                  balance: w.balance + t.amount,
                  usedCredit: Math.max(0, (w.usedCredit || 0) - t.amount),
                  updatedAt: new Date(),
                };
              }
              return { ...w, balance: w.balance + t.amount, updatedAt: new Date() };
            }
            if (w.id === t.toWalletId) {
              return { ...w, balance: w.balance - t.amount, updatedAt: new Date() };
            }
            return w;
          });
          return {
            wallets,
            transfers: state.transfers.filter((x) => x.id !== transferId),
            _deletedTransferIds: [...(state._deletedTransferIds ?? []), transferId],
          };
        }),

      useCredit: (id, amount) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id && w.type === 'credit'
              ? {
                  ...w,
                  balance: w.balance - amount,
                  usedCredit: (w.usedCredit || 0) + amount,
                  updatedAt: new Date(),
                }
              : w
          ),
        })),

      repayCredit: (id, amount) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id && w.type === 'credit'
              ? {
                  ...w,
                  balance: w.balance + amount,
                  usedCredit: Math.max(0, (w.usedCredit || 0) - amount),
                  updatedAt: new Date(),
                }
              : w
          ),
        })),

      clearAll: () =>
        set({ wallets: [], transfers: [], selectedWalletId: null, _deletedWalletIds: [], _deletedTransferIds: [] }),
    }),
    {
      name: 'wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        wallets: state.wallets.map((w) => ({
          ...w,
          createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : w.createdAt,
          updatedAt: w.updatedAt instanceof Date ? w.updatedAt.toISOString() : w.updatedAt,
        })),
        transfers: state.transfers.map((t) => ({
          ...t,
          date: t.date instanceof Date ? t.date.toISOString() : t.date,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        selectedWalletId: state.selectedWalletId,
        _deletedWalletIds: state._deletedWalletIds ?? [],
        _deletedTransferIds: state._deletedTransferIds ?? [],
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          // Migrate wallets: add type field for old wallets
          state.wallets = state.wallets.map((w: any) => ({
            ...w,
            type: w.type || 'bank',
            createdAt: sd(w.createdAt),
            updatedAt: sd(w.updatedAt),
          }));
          // Collapse multiple defaults: keep only the first default
          let seenDefault = false;
          state.wallets = state.wallets.map((w: any) => {
            if (!w.isDefault) return w;
            if (seenDefault) return { ...w, isDefault: false };
            seenDefault = true;
            return w;
          });
          state._deletedWalletIds = state._deletedWalletIds ?? [];
          state._deletedTransferIds = state._deletedTransferIds ?? [];
          // Migrate transfers array if missing
          if (!state.transfers) {
            state.transfers = [];
          } else {
            state.transfers = state.transfers.map((t: any) => ({
              ...t,
              date: sd(t.date),
              createdAt: sd(t.createdAt),
            }));
          }
        }
      },
    }
  )
);
