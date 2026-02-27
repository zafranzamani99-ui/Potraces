import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersonalState } from '../types';

export const usePersonalStore = create<PersonalState>()(
  persist(
    (set) => ({
      transactions: [],
      subscriptions: [],
      budgets: [],

      addTransaction: (transaction) =>
        set((state) => ({
          transactions: [
            {
              ...transaction,
              id: Date.now().toString(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.transactions,
          ],
        })),

      updateTransaction: (id, updates) =>
        set((state) => ({
          transactions: state.transactions.map((transaction) =>
            transaction.id === id
              ? { ...transaction, ...updates, updatedAt: new Date() }
              : transaction
          ),
        })),

      deleteTransaction: (id) =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        })),

      addSubscription: (subscription) =>
        set((state) => ({
          subscriptions: [
            {
              ...subscription,
              id: Date.now().toString(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.subscriptions,
          ],
        })),

      addBudget: (budget) =>
        set((state) => ({
          budgets: [
            {
              ...budget,
              id: Date.now().toString(),
              spentAmount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.budgets,
          ],
        })),

      updateBudget: (id, updates) =>
        set((state) => ({
          budgets: state.budgets.map((budget) =>
            budget.id === id
              ? { ...budget, ...updates, updatedAt: new Date() }
              : budget
          ),
        })),

      updateSubscription: (id, updates) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((subscription) =>
            subscription.id === id
              ? { ...subscription, ...updates, updatedAt: new Date() }
              : subscription
          ),
        })),

      deleteSubscription: (id) =>
        set((state) => ({
          subscriptions: state.subscriptions.filter((sub) => sub.id !== id),
        })),

      deleteBudget: (id) =>
        set((state) => ({
          budgets: state.budgets.filter((b) => b.id !== id),
        })),

      addTransferIncome: (transfer) =>
        set((state) => ({
          transactions: [
            {
              id: `transfer-${transfer.id}`,
              amount: transfer.amount,
              category: 'from business',
              description: transfer.note || 'Transfer from business',
              date: transfer.date instanceof Date ? transfer.date : new Date(transfer.date),
              type: 'income' as const,
              mode: 'personal' as const,
              inputMethod: 'manual' as const,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.transactions,
          ],
        })),
    }),
    {
      name: 'personal-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        transactions: state.transactions.map((t) => ({
          ...t,
          date: t.date instanceof Date ? t.date.toISOString() : t.date,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
          updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
        })),
        subscriptions: state.subscriptions.map((s) => ({
          ...s,
          startDate: s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate,
          nextBillingDate: s.nextBillingDate instanceof Date ? s.nextBillingDate.toISOString() : s.nextBillingDate,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
          updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
        })),
        budgets: state.budgets.map((b) => ({
          ...b,
          startDate: b.startDate instanceof Date ? b.startDate.toISOString() : b.startDate,
          endDate: b.endDate instanceof Date ? b.endDate.toISOString() : b.endDate,
          createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
          updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt,
        })),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.transactions = state.transactions.map((t: any) => ({
            ...t,
            date: new Date(t.date),
            createdAt: new Date(t.createdAt),
            updatedAt: new Date(t.updatedAt),
          }));
          state.subscriptions = state.subscriptions.map((s: any) => ({
            ...s,
            startDate: s.startDate ? new Date(s.startDate) : new Date(s.createdAt),
            nextBillingDate: new Date(s.nextBillingDate),
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
            isInstallment: s.isInstallment ?? false,
            completedInstallments: s.completedInstallments ?? 0,
          }));
          state.budgets = state.budgets.map((b: any) => ({
            ...b,
            startDate: new Date(b.startDate),
            endDate: new Date(b.endDate),
            createdAt: new Date(b.createdAt),
            updatedAt: new Date(b.updatedAt),
          }));
        }
      },
    }
  )
);