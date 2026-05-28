import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WalletState } from '../types';
import { useTombstoneStore } from './tombstoneStore';
import { newId } from '../utils/id';
import { roundMoney } from '../utils/money';

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
            initialBalance: wallet.balance,
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

      deleteWallet: (id) => {
        set((state) => ({
          wallets: state.wallets.filter((w) => w.id !== id),
          selectedWalletId:
            state.selectedWalletId === id ? null : state.selectedWalletId,
          _deletedWalletIds: [...(state._deletedWalletIds ?? []), id],
        }));
        useTombstoneStore.getState().addTombstones([id]);
        const { usePersonalStore } = require('./personalStore');
        const { useDebtStore } = require('./debtStore');
        const personal = usePersonalStore.getState();
        personal.transactions.forEach((t: any) => {
          if (t.walletId === id) {
            personal.updateTransaction(t.id, { walletId: undefined });
          }
        });
        const debtState = useDebtStore.getState();
        debtState.debts.forEach((d: any) => {
          const hasWalletPayment = d.payments.some((p: any) => p.walletId === id);
          if (hasWalletPayment) {
            const newPayments = d.payments.map((p: any) =>
              p.walletId === id ? { ...p, walletId: undefined } : p
            );
            useDebtStore.setState((s: any) => ({
              debts: s.debts.map((debt: any) =>
                debt.id === d.id ? { ...debt, payments: newPayments, updatedAt: new Date() } : debt
              ),
            }));
          }
        });
      },

      setSelectedWallet: (id) => set({ selectedWalletId: id }),

      setDefaultWallet: (id) =>
        set((state) => ({
          wallets: state.wallets.map((w) => ({
            ...w,
            isDefault: w.id === id,
            updatedAt: w.id === id ? new Date() : w.updatedAt,
          })),
        })),

      deductFromWallet: (id, amount) => {
        if (!amount || !isFinite(amount) || amount <= 0) return;
        set((state) => ({
          wallets: state.wallets.map((w) => {
            if (w.id !== id) return w;
            if (w.type === 'credit') {
              return {
                ...w,
                balance: roundMoney(w.balance - amount),
                usedCredit: roundMoney((w.usedCredit || 0) + amount),
                updatedAt: new Date(),
              };
            }
            if (w.balance - amount < 0) {
              console.warn(`[walletStore] deductFromWallet: ${w.name} would go negative (${w.balance} - ${amount})`);
            }
            return { ...w, balance: roundMoney(w.balance - amount), updatedAt: new Date() };
          }),
        }));
      },

      addToWallet: (id, amount) => {
        if (!amount || !isFinite(amount) || amount <= 0) return;
        set((state) => ({
          wallets: state.wallets.map((w) => {
            if (w.id !== id) return w;
            if (w.type === 'credit') {
              return {
                ...w,
                balance: roundMoney(w.balance + amount),
                usedCredit: roundMoney(Math.max(0, (w.usedCredit || 0) - amount)),
                updatedAt: new Date(),
              };
            }
            return { ...w, balance: roundMoney(w.balance + amount), updatedAt: new Date() };
          }),
        }));
      },

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
                if (w.type === 'credit') {
                  return {
                    ...w,
                    balance: roundMoney(w.balance - amount),
                    usedCredit: roundMoney((w.usedCredit || 0) + amount),
                    updatedAt: new Date(),
                  };
                }
                return { ...w, balance: roundMoney(w.balance - amount), updatedAt: new Date() };
              }
              if (w.id === toId) {
                return { ...w, balance: roundMoney(w.balance + amount), updatedAt: new Date() };
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

      deleteTransfer: (transferId) => {
        set((state) => {
          const t = state.transfers.find((x) => x.id === transferId);
          if (!t) return state;
          // Rollback: reverse the transfer on both wallets
          const wallets = state.wallets.map((w) => {
            if (w.id === t.fromWalletId) {
              if (w.type === 'credit') {
                return {
                  ...w,
                  balance: roundMoney(w.balance + t.amount),
                  usedCredit: roundMoney(Math.max(0, (w.usedCredit || 0) - t.amount)),
                  updatedAt: new Date(),
                };
              }
              return { ...w, balance: roundMoney(w.balance + t.amount), updatedAt: new Date() };
            }
            if (w.id === t.toWalletId) {
              return { ...w, balance: roundMoney(w.balance - t.amount), updatedAt: new Date() };
            }
            return w;
          });
          return {
            wallets,
            transfers: state.transfers.filter((x) => x.id !== transferId),
            _deletedTransferIds: [...(state._deletedTransferIds ?? []), transferId],
          };
        });
        useTombstoneStore.getState().addTombstones([transferId]);
      },

      useCredit: (id, amount) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id && w.type === 'credit'
              ? {
                  ...w,
                  balance: roundMoney(w.balance - amount),
                  usedCredit: roundMoney((w.usedCredit || 0) + amount),
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
                  balance: roundMoney(w.balance + amount),
                  usedCredit: roundMoney(Math.max(0, (w.usedCredit || 0) - amount)),
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
          // Migrate wallets: add type field for old wallets, backfill initialBalance
          state.wallets = state.wallets.map((w: any) => ({
            ...w,
            type: w.type || 'bank',
            initialBalance: w.initialBalance ?? w.balance,
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
