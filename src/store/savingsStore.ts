import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavingsState } from '../types';

export const useSavingsStore = create<SavingsState>()(
  persist(
    (set) => ({
      accounts: [],

      addAccount: (account) =>
        set((state) => ({
          accounts: [
            {
              ...account,
              id: Date.now().toString(),
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
        })),

      updateAccount: (id, updates) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: new Date() } : a
          ),
        })),

      deleteAccount: (id) =>
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
        })),

      addSnapshot: (accountId, value, note) =>
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
                    },
                  ],
                  updatedAt: new Date(),
                }
              : a
          ),
        })),
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          const validTypes = ['tng_plus', 'robo_crypto', 'esa', 'bank', 'other'];
          state.accounts = state.accounts.map((a: any) => ({
            ...a,
            type: validTypes.includes(a.type) ? a.type : 'other',
            description: a.description || '',
            createdAt: sd(a.createdAt),
            updatedAt: sd(a.updatedAt),
            history: (a.history || []).map((h: any) => ({
              ...h,
              date: sd(h.date),
            })),
          }));
        }
      },
    }
  )
);
