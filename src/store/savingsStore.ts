import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavingsState, SavingsSortBy, SnapshotType } from '../types';

export const useSavingsStore = create<SavingsState>()(
  persist(
    (set, get) => ({
      accounts: [],
      sortBy: 'manual' as SavingsSortBy,
      accountOrder: [] as string[],
      lastOpenedValue: null,

      addAccount: (account) =>
        set((state) => {
          const id = Date.now().toString();
          return {
            accounts: [
              {
                ...account,
                id,
                history: [
                  {
                    id: `${Date.now()}-init`,
                    value: account.currentValue,
                    note: 'Initial value',
                    date: new Date(),
                  },
                ],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              ...state.accounts,
            ],
            accountOrder: [id, ...state.accountOrder],
          };
        }),

      updateAccount: (id, updates) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: new Date() } : a
          ),
        })),

      deleteAccount: (id) =>
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
          accountOrder: state.accountOrder.filter((oid) => oid !== id),
        })),

      addSnapshot: (accountId, value, note, snapshotType) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === accountId
              ? {
                  ...a,
                  currentValue: value,
                  history: [
                    ...a.history,
                    {
                      id: Date.now().toString(),
                      value,
                      note,
                      date: new Date(),
                      snapshotType: snapshotType || 'manual',
                    },
                  ],
                  updatedAt: new Date(),
                }
              : a
          ),
        })),

      setSortBy: (sort) => set({ sortBy: sort }),

      reorderAccounts: (orderedIds) => set({ accountOrder: orderedIds }),

      setTarget: (accountId, target) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === accountId
              ? { ...a, target: target ?? undefined, updatedAt: new Date() }
              : a
          ),
        })),

      recordOpen: () => {
        const total = get().accounts.reduce((s, a) => s + a.currentValue, 0);
        set({ lastOpenedValue: total });
      },
    }),
    {
      name: 'savings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accounts: state.accounts.map((a) => ({
          ...a,
          createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
          updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
          history: a.history.map((h) => ({
            ...h,
            date: h.date instanceof Date ? h.date.toISOString() : h.date,
          })),
        })),
        sortBy: state.sortBy,
        accountOrder: state.accountOrder,
        lastOpenedValue: state.lastOpenedValue,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          const validTypes = ['tng_plus', 'robo_crypto', 'esa', 'bank', 'asb', 'tabung_haji', 'stocks', 'gold', 'other'];
          state.accounts = state.accounts.map((a: any) => ({
            ...a,
            type: validTypes.includes(a.type) || a.type?.startsWith('custom_') ? a.type : 'other',
            description: a.description || '',
            target: typeof a.target === 'number' ? a.target : undefined,
            goalName: a.goalName || undefined,
            annualRate: typeof a.annualRate === 'number' ? a.annualRate : undefined,
            createdAt: sd(a.createdAt),
            updatedAt: sd(a.updatedAt),
            history: (a.history || []).map((h: any) => ({
              ...h,
              date: sd(h.date),
              snapshotType: h.snapshotType || 'manual',
            })),
          }));
          if (!state.sortBy) state.sortBy = 'manual';
          if (!state.accountOrder) state.accountOrder = [];
          if (state.lastOpenedValue === undefined) state.lastOpenedValue = null;
        }
      },
    }
  )
);
