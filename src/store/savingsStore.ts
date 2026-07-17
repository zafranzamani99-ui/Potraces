import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavingsState, SavingsSortBy } from '../types';
import { useTombstoneStore } from './tombstoneStore';
import { newId } from '../utils/id';
import { roundMoney } from '../utils/money';
import { VALID_TYPE_IDS } from '../screens/personal/savings/investmentTypes';
import { nextBasis } from '../screens/personal/savings/savingsMath';

export const useSavingsStore = create<SavingsState>()(
  persist(
    (set, get) => ({
      accounts: [],
      sortBy: 'manual' as SavingsSortBy,
      accountOrder: [] as string[],
      lastOpenedValue: null,
      _deletedSavingsIds: [],

      clearSavingsTombstones: () => set({ _deletedSavingsIds: [] }),

      addAccount: (account) =>
        set((state) => {
          const id = newId();
          const cur = roundMoney(Number.isFinite(account.currentValue) ? account.currentValue : 0);
          const init = roundMoney(Number.isFinite(account.initialInvestment) ? account.initialInvestment : 0);
          return {
            accounts: [
              {
                ...account,
                id,
                currentValue: cur,
                initialInvestment: init,
                history: [
                  {
                    id: newId(),
                    value: cur,
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
            // Shift the "since last check" baseline by the new account's value so
            // adding an account never registers as a value gain.
            lastOpenedValue: state.lastOpenedValue != null ? roundMoney(state.lastOpenedValue + cur) : state.lastOpenedValue,
          };
        }),

      updateAccount: (id, updates) =>
        set((state) => {
          // Round money fields so the edit path matches addAccount/addSnapshot
          // and the app-wide roundMoney write-site convention (utils/money.ts).
          const u: Partial<typeof updates> = { ...updates };
          if (typeof u.currentValue === 'number') u.currentValue = roundMoney(u.currentValue);
          if (typeof u.initialInvestment === 'number') u.initialInvestment = roundMoney(u.initialInvestment);
          if (typeof u.target === 'number') u.target = roundMoney(u.target);
          return {
            accounts: state.accounts.map((a) =>
              a.id === id ? { ...a, ...u, updatedAt: new Date() } : a
            ),
          };
        }),

      deleteAccount: (id) => {
        set((state) => {
          const survivors = state.accounts.filter((a) => a.id !== id);
          return {
            accounts: survivors,
            accountOrder: state.accountOrder.filter((oid) => oid !== id),
            _deletedSavingsIds: [...(state._deletedSavingsIds ?? []), id],
            // Deleting is a structural change — re-baseline "since last check" to the
            // surviving total so it reads 0, not a phantom delta. (Subtracting only
            // the deleted account's CURRENT value would leak its in-session change
            // into the pill, since the baseline captured its value at the last open.)
            lastOpenedValue: state.lastOpenedValue != null ? roundMoney(survivors.reduce((s, a) => s + a.currentValue, 0)) : state.lastOpenedValue,
          };
        });
        useTombstoneStore.getState().addTombstones([id]);
      },

      addSnapshot: (accountId, value, note, snapshotType) => {
        if (!Number.isFinite(value)) return; // reject Infinity/NaN before it poisons the portfolio
        const v = roundMoney(value);
        const st = snapshotType || 'manual';
        set((state) => ({
          accounts: state.accounts.map((a) => {
            if (a.id !== accountId) return a;
            // Capital moves adjust the cost basis (deposit adds what was put in;
            // withdrawal removes basis proportionally to the value taken out);
            // dividend/manual are pure revaluations. The signed basis change is stored
            // on the snapshot so a multi-device merge can re-derive the basis by
            // replaying moves in date order (see savingsMath.replayCapitalMoves).
            const newBasis = nextBasis(a.initialInvestment, a.currentValue, v, st);
            const delta = roundMoney(newBasis - a.initialInvestment);
            return {
              ...a,
              currentValue: v,
              initialInvestment: newBasis,
              history: [
                ...a.history,
                { id: newId(), value: v, note, date: new Date(), snapshotType: st, ...(delta !== 0 ? { capitalDelta: delta } : {}) },
              ],
              updatedAt: new Date(),
            };
          }),
        }));
      },

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
        const total = roundMoney(get().accounts.reduce((s, a) => s + a.currentValue, 0));
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
        _deletedSavingsIds: state._deletedSavingsIds ?? [],
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          const validTypes = VALID_TYPE_IDS;
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
          state._deletedSavingsIds = state._deletedSavingsIds ?? [];
        }
      },
    }
  )
);
