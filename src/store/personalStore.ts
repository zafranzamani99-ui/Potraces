import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersonalState } from '../types';
import { useWalletStore } from './walletStore';

export const usePersonalStore = create<PersonalState>()(
  persist(
    (set) => ({
      transactions: [],
      subscriptions: [],
      budgets: [],
      goals: [],

      addTransaction: (transaction) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
        set((state) => ({
          transactions: [
            {
              ...transaction,
              id,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.transactions,
          ],
        }));
        return id;
      },

      updateTransaction: (id, updates) =>
        set((state) => ({
          transactions: state.transactions.map((t) => {
            if (t.id !== id) return t;
            const amountChanged = updates.amount !== undefined && updates.amount !== t.amount;
            const categoryChanged = updates.category !== undefined && updates.category !== t.category;
            const descriptionChanged = updates.description !== undefined && updates.description !== t.description;
            const typeChanged = updates.type !== undefined && updates.type !== t.type;
            const walletChanged = updates.walletId !== undefined && updates.walletId !== t.walletId;
            const financiallyChanged = amountChanged || categoryChanged || descriptionChanged || typeChanged || walletChanged;
            const editEntry: import('../types').TransactionEdit | null = financiallyChanged ? {
              editedAt: new Date(),
              previousAmount: amountChanged ? t.amount : undefined,
              previousCategory: categoryChanged ? t.category : undefined,
              previousDescription: descriptionChanged ? t.description : undefined,
              previousType: typeChanged ? t.type : undefined,
              previousWalletId: walletChanged ? (t.walletId ?? null) : undefined,
            } : null;
            return {
              ...t,
              ...updates,
              updatedAt: new Date(),
              editLog: editEntry ? [...(t.editLog ?? []), editEntry] : t.editLog,
            };
          }),
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
              id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
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
              id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
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

      addTransferIncome: (transfer) => {
        const walletId = (transfer as any).walletId as string | undefined;
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
              ...(walletId ? { walletId } : {}),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.transactions,
          ],
        }));
        if (walletId) {
          useWalletStore.getState().addToWallet(walletId, transfer.amount);
        }
      },

      addGoal: (goal) =>
        set((state) => ({
          goals: [
            {
              ...goal,
              id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
              currentAmount: 0,
              contributions: [],
              milestones: [
                { percentage: 25, label: 'Quarter way!', reached: false },
                { percentage: 50, label: 'Halfway there!', reached: false },
                { percentage: 75, label: 'Almost!', reached: false },
                { percentage: 100, label: 'Goal reached!', reached: false },
              ],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.goals,
          ],
        })),

      updateGoal: (id, updates) =>
        set((state) => ({
          goals: state.goals.map((goal) =>
            goal.id === id
              ? { ...goal, ...updates, updatedAt: new Date() }
              : goal
          ),
        })),

      deleteGoal: (id) =>
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
        })),

      contributeToGoal: (goalId, amount, note) =>
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== goalId) return goal;
            const newContribution = {
              id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
              amount,
              note,
              date: new Date(),
            };
            const newCurrentAmount = Math.min(goal.currentAmount + amount, goal.targetAmount);
            const updatedMilestones = goal.milestones.map((m) => {
              if (!m.reached && newCurrentAmount >= (m.percentage / 100) * goal.targetAmount) {
                return { ...m, reached: true, reachedAt: new Date() };
              }
              return m;
            });
            return {
              ...goal,
              currentAmount: newCurrentAmount,
              contributions: [...goal.contributions, newContribution],
              milestones: updatedMilestones,
              updatedAt: new Date(),
            };
          }),
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
          editLog: (t.editLog ?? []).map((e) => ({
            ...e,
            editedAt: e.editedAt instanceof Date ? e.editedAt.toISOString() : e.editedAt,
          })),
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
        goals: state.goals.map((g) => ({
          ...g,
          deadline: g.deadline instanceof Date ? g.deadline.toISOString() : g.deadline,
          contributions: g.contributions.map((c) => ({
            ...c,
            date: c.date instanceof Date ? c.date.toISOString() : c.date,
          })),
          milestones: g.milestones.map((m) => ({
            ...m,
            reachedAt: m.reachedAt instanceof Date ? m.reachedAt.toISOString() : m.reachedAt,
          })),
          createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt,
          updatedAt: g.updatedAt instanceof Date ? g.updatedAt.toISOString() : g.updatedAt,
        })),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.transactions = state.transactions.map((t: any) => ({
            ...t,
            date: new Date(t.date),
            createdAt: new Date(t.createdAt),
            updatedAt: new Date(t.updatedAt),
            editLog: (t.editLog ?? []).map((e: any) => ({
              ...e,
              editedAt: new Date(e.editedAt),
            })),
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
          state.goals = (state.goals || []).map((g: any) => ({
            ...g,
            deadline: g.deadline ? new Date(g.deadline) : undefined,
            contributions: (g.contributions || []).map((c: any) => ({
              ...c,
              date: new Date(c.date),
            })),
            milestones: (g.milestones || []).map((m: any) => ({
              ...m,
              reachedAt: m.reachedAt ? new Date(m.reachedAt) : undefined,
            })),
            createdAt: new Date(g.createdAt),
            updatedAt: new Date(g.updatedAt),
          }));
        }
      },
    }
  )
);