import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WalletState } from '../types';

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      wallets: [],
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
        selectedWalletId: state.selectedWalletId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.wallets = state.wallets.map((w: any) => ({
            ...w,
            createdAt: new Date(w.createdAt),
            updatedAt: new Date(w.updatedAt),
          }));
        }
      },
    }
  )
);
