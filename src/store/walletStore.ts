import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WalletState } from '../types';

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      wallets: [],
      transfers: [],
      selectedWalletId: null,

      addWallet: (wallet) =>
        set((state) => ({
          wallets: [
            {
              ...wallet,
              id: Date.now().toString(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.wallets,
          ],
        })),

      updateWallet: (id, updates) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: new Date() } : w
          ),
        })),

      deleteWallet: (id) =>
        set((state) => ({
          wallets: state.wallets.filter((w) => w.id !== id),
          selectedWalletId:
            state.selectedWalletId === id ? null : state.selectedWalletId,
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
          wallets: state.wallets.map((w) =>
            w.id === id
              ? { ...w, balance: w.balance - amount, updatedAt: new Date() }
              : w
          ),
        })),

      addToWallet: (id, amount) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id
              ? { ...w, balance: w.balance + amount, updatedAt: new Date() }
              : w
          ),
        })),

      transferBetweenWallets: (fromId, toId, amount, note) =>
        set((state) => {
          const transfer = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migrate wallets: add type field for old wallets
          state.wallets = state.wallets.map((w: any) => ({
            ...w,
            type: w.type || 'bank',
            createdAt: new Date(w.createdAt),
            updatedAt: new Date(w.updatedAt),
          }));
          // Migrate transfers array if missing
          if (!state.transfers) {
            state.transfers = [];
          } else {
            state.transfers = state.transfers.map((t: any) => ({
              ...t,
              date: new Date(t.date),
              createdAt: new Date(t.createdAt),
            }));
          }
        }
      },
    }
  )
);
