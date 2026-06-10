import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersonalState, Transfer } from '../types';
import { useWalletStore } from './walletStore';
import { useTombstoneStore } from './tombstoneStore';
import { newId } from '../utils/id';
import { roundMoney } from '../utils/money';

export const usePersonalStore = create<PersonalState>()(
  persist(
    (set) => ({
      transactions: [],
      subscriptions: [],
      budgets: [],
      goals: [],
      _deletedTransactionIds: [],
      _deletedSubscriptionIds: [],
      _deletedBudgetIds: [],
      _deletedGoalIds: [],

      clearPersonalTombstones: () => set({
        _deletedTransactionIds: [],
        _deletedSubscriptionIds: [],
        _deletedBudgetIds: [],
        _deletedGoalIds: [],
      }),

      addTransaction: (transaction) => {
        if (transaction.amount <= 0) return '';
        const id = newId();
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

      updateTransaction: (id, updates) => {
        const prev = (usePersonalStore.getState() as PersonalState).transactions.find((t) => t.id === id);
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
        }));

        if (!prev) return;
        const newAmount = updates.amount ?? prev.amount;
        const newType = updates.type ?? prev.type;
        const newWalletId = updates.walletId !== undefined ? updates.walletId : prev.walletId;
        const amountChanged = newAmount !== prev.amount;
        const typeChanged = newType !== prev.type;
        const walletChanged = newWalletId !== prev.walletId;
        if (!amountChanged && !typeChanged && !walletChanged) return;

        const wallets = useWalletStore.getState();
        const applyOld = (w: string | undefined | null, amt: number, type: string) => {
          if (!w) return;
          if (type === 'expense') wallets.addToWallet(w, amt);
          else if (type === 'income') wallets.deductFromWallet(w, amt);
        };
        const applyNew = (w: string | undefined | null, amt: number, type: string) => {
          if (!w) return;
          if (type === 'expense') wallets.deductFromWallet(w, amt);
          else if (type === 'income') wallets.addToWallet(w, amt);
        };
        applyOld(prev.walletId, prev.amount, prev.type);
        applyNew(newWalletId, newAmount, newType);
      },

      deleteTransaction: (id) => {
        const prev = (usePersonalStore.getState() as PersonalState).transactions.find((t) => t.id === id);
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
          _deletedTransactionIds: [...(state._deletedTransactionIds ?? []), id],
        }));
        useTombstoneStore.getState().addTombstones([id]);
        if (!prev || !prev.walletId) return;
        const wallets = useWalletStore.getState();
        if (prev.type === 'expense') wallets.addToWallet(prev.walletId, prev.amount);
        else if (prev.type === 'income') wallets.deductFromWallet(prev.walletId, prev.amount);
      },

      addSubscription: (subscription) => {
        if (subscription.amount <= 0) return;
        set((state) => ({
          subscriptions: [
            {
              ...subscription,
              id: newId(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.subscriptions,
          ],
        }));
      },

      addBudget: (budget) => {
        if (budget.allocatedAmount <= 0) return;
        set((state) => ({
          budgets: [
            {
              ...budget,
              id: newId(),
              spentAmount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.budgets,
          ],
        }));
      },

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

      deleteSubscription: (id) => {
        set((state) => ({
          subscriptions: state.subscriptions.filter((sub) => sub.id !== id),
          _deletedSubscriptionIds: [...(state._deletedSubscriptionIds ?? []), id],
        }));
        useTombstoneStore.getState().addTombstones([id]);
      },

      deleteBudget: (id) => {
        set((state) => ({
          budgets: state.budgets.filter((b) => b.id !== id),
          _deletedBudgetIds: [...(state._deletedBudgetIds ?? []), id],
        }));
        useTombstoneStore.getState().addTombstones([id]);
      },

      incrementInstallment: (id) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((sub) =>
            sub.id === id && sub.isInstallment && sub.totalInstallments
              ? {
                  ...sub,
                  completedInstallments: Math.min(
                    (sub.completedInstallments || 0) + 1,
                    sub.totalInstallments
                  ),
                  updatedAt: new Date(),
                }
              : sub
          ),
        })),

      toggleSubscriptionPause: (id) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((sub) =>
            sub.id === id
              ? { ...sub, isPaused: !sub.isPaused, updatedAt: new Date() }
              : sub
          ),
        })),

      markSubscriptionPaid: (id, transactionId?, walletId?, paidAt?) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((sub) => {
            if (sub.id !== id) return sub;
            // When the user actually paid (they can pick a past date); defaults to now.
            const paidOn = paidAt ?? new Date();
            // The cycle this payment settles is the current oldest-unpaid due date,
            // captured BEFORE we advance the pointer. This is what every period view
            // buckets by — so a late payment (paid Jun 2 for the May 25 bill) is filed
            // under May, not June.
            const periodDate = new Date(sub.nextBillingDate);
            let next = new Date(sub.nextBillingDate);
            switch (sub.billingCycle) {
              case 'weekly':    next.setDate(next.getDate() + 7);    break;
              case 'quarterly': next.setMonth(next.getMonth() + 3);  break;
              case 'yearly':    next.setFullYear(next.getFullYear() + 1); break;
              default:          next.setMonth(next.getMonth() + 1);  break;
            }
            const newCompleted = sub.isInstallment
              ? Math.min((sub.completedInstallments || 0) + 1, sub.totalInstallments || 9999)
              : sub.completedInstallments;
            const newOutstanding = sub.outstandingBalance !== undefined
              ? roundMoney(Math.max(sub.outstandingBalance - sub.amount, 0))
              : undefined;
            return {
              ...sub,
              lastPaidAt: paidOn,
              nextBillingDate: next,
              completedInstallments: newCompleted,
              outstandingBalance: newOutstanding,
              paymentHistory: [
                ...(sub.paymentHistory || []),
                { id: `pay-${newId()}`, paidAt: paidOn, periodDate, amount: sub.amount, transactionId, walletId },
              ],
              updatedAt: new Date(),
            };
          }),
        })),

      undoSubscriptionPayment: (subId, paymentId) => {
        let walletRefund: { walletId: string; amount: number } | null = null as { walletId: string; amount: number } | null;
        let transactionToDelete: string | undefined = undefined as string | undefined;

        set((s) => {
          const sub = s.subscriptions.find((item) => item.id === subId);
          if (!sub) return s;
          const payment = (sub.paymentHistory || []).find((p) => p.id === paymentId);
          if (!payment || payment.undoneAt) return s;

          let prev = new Date(sub.nextBillingDate);
          switch (sub.billingCycle) {
            case 'weekly':    prev.setDate(prev.getDate() - 7);    break;
            case 'quarterly': prev.setMonth(prev.getMonth() - 3);  break;
            case 'yearly':    prev.setFullYear(prev.getFullYear() - 1); break;
            default:          prev.setMonth(prev.getMonth() - 1);  break;
          }
          const rolledCompleted = sub.isInstallment
            ? Math.max((sub.completedInstallments || 0) - 1, 0)
            : sub.completedInstallments;
          const rolledOutstanding = sub.outstandingBalance !== undefined
            ? roundMoney(sub.outstandingBalance + payment.amount)
            : undefined;

          if (payment.walletId) {
            walletRefund = { walletId: payment.walletId, amount: payment.amount };
          }
          transactionToDelete = payment.transactionId;

          const activePayments = (sub.paymentHistory || [])
            .filter((p) => p.id !== paymentId && !p.undoneAt)
            .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

          return {
            subscriptions: s.subscriptions.map((item) => {
              if (item.id !== subId) return item;
              return {
                ...item,
                nextBillingDate: prev,
                completedInstallments: rolledCompleted,
                outstandingBalance: rolledOutstanding,
                lastPaidAt: activePayments[0]?.paidAt ?? undefined,
                paymentHistory: (item.paymentHistory || []).map((p) =>
                  p.id === paymentId ? { ...p, undoneAt: new Date() } : p
                ),
                updatedAt: new Date(),
              };
            }),
            transactions: transactionToDelete
              ? s.transactions.filter((t) => t.id !== transactionToDelete)
              : s.transactions,
          };
        });

        if (walletRefund) {
          useWalletStore.getState().addToWallet(walletRefund.walletId, walletRefund.amount);
        }
      },

      addTransferIncome: (transfer) => {
        const walletId = (transfer as Transfer & { walletId?: string }).walletId;
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
              id: newId(),
              currentAmount: 0,
              contributions: [],
              milestones: [
                { percentage: 25, label: 'quarter saved.', reached: false },
                { percentage: 50, label: 'halfway.', reached: false },
                { percentage: 75, label: 'almost there.', reached: false },
                { percentage: 100, label: 'goal reached.', reached: false },
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

      deleteGoal: (id) => {
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
          _deletedGoalIds: [...(state._deletedGoalIds ?? []), id],
        }));
        useTombstoneStore.getState().addTombstones([id]);
      },

      contributeToGoal: (goalId, amount, note, walletId, transactionId) =>
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== goalId) return goal;
            const remaining = roundMoney(goal.targetAmount - goal.currentAmount);
            const actualAmount = remaining > 0 ? Math.min(amount, remaining) : amount;
            const newContribution = {
              id: newId(),
              amount: roundMoney(actualAmount),
              note,
              date: new Date(),
              walletId,
              transactionId,
            };
            const newCurrentAmount = roundMoney(Math.min(goal.currentAmount + actualAmount, goal.targetAmount));
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

      withdrawFromGoal: (goalId, amount, note, walletId, transactionId) =>
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== goalId) return goal;
            const newAmount = roundMoney(Math.max(goal.currentAmount - amount, 0));
            const updatedMilestones = goal.milestones.map((m) => {
              if (m.reached && newAmount < (m.percentage / 100) * goal.targetAmount) {
                return { ...m, reached: false, reachedAt: undefined };
              }
              return m;
            });
            return {
              ...goal,
              currentAmount: newAmount,
              contributions: [
                ...goal.contributions,
                {
                  id: newId(),
                  amount: -amount,
                  note: note || 'withdrawal',
                  date: new Date(),
                  walletId,
                  transactionId,
                },
              ],
              milestones: updatedMilestones,
              updatedAt: new Date(),
            };
          }),
        })),

      removeContribution: (goalId, contributionId) => {
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== goalId) return goal;
            const contrib = goal.contributions.find((c) => c.id === contributionId);
            if (!contrib) return goal;
            const newAmount = roundMoney(Math.max(goal.currentAmount - contrib.amount, 0));
            const updatedMilestones = goal.milestones.map((m) => {
              if (m.reached && newAmount < (m.percentage / 100) * goal.targetAmount) {
                return { ...m, reached: false, reachedAt: undefined };
              }
              return m;
            });
            return {
              ...goal,
              currentAmount: newAmount,
              contributions: goal.contributions.filter((c) => c.id !== contributionId),
              milestones: updatedMilestones,
              updatedAt: new Date(),
            };
          }),
        }));
      },

      archiveGoal: (goalId) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId ? { ...g, isArchived: true, updatedAt: new Date() } : g
          ),
        })),

      unarchiveGoal: (goalId) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId ? { ...g, isArchived: false, updatedAt: new Date() } : g
          ),
        })),

      pauseGoal: (goalId) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId ? { ...g, isPaused: true, updatedAt: new Date() } : g
          ),
        })),

      resumeGoal: (goalId) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId ? { ...g, isPaused: false, updatedAt: new Date() } : g
          ),
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
          playbookLinks: t.playbookLinks || undefined,
        })),
        subscriptions: state.subscriptions.map((s) => ({
          ...s,
          startDate: s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate,
          nextBillingDate: s.nextBillingDate instanceof Date ? s.nextBillingDate.toISOString() : s.nextBillingDate,
          lastPaidAt: s.lastPaidAt instanceof Date ? s.lastPaidAt.toISOString() : s.lastPaidAt,
          paymentHistory: (s.paymentHistory || []).map((p: any) => ({
            ...p,
            paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : p.paidAt,
            periodDate: p.periodDate instanceof Date ? p.periodDate.toISOString() : p.periodDate,
          })),
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
        _deletedTransactionIds: state._deletedTransactionIds ?? [],
        _deletedSubscriptionIds: state._deletedSubscriptionIds ?? [],
        _deletedBudgetIds: state._deletedBudgetIds ?? [],
        _deletedGoalIds: state._deletedGoalIds ?? [],
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          state.transactions = state.transactions.map((t: any) => ({
            ...t,
            date: sd(t.date),
            createdAt: sd(t.createdAt),
            updatedAt: sd(t.updatedAt),
            editLog: (t.editLog ?? []).map((e: any) => ({
              ...e,
              editedAt: sd(e.editedAt),
            })),
            playbookLinks: t.playbookLinks || undefined,
          }));
          state.subscriptions = state.subscriptions.map((s: any) => ({
            ...s,
            startDate: s.startDate ? sd(s.startDate) : sd(s.createdAt),
            nextBillingDate: sd(s.nextBillingDate),
            lastPaidAt: s.lastPaidAt ? sd(s.lastPaidAt) : undefined,
            paymentHistory: (s.paymentHistory || []).map((p: any) => ({
              ...p,
              paidAt: sd(p.paidAt),
              // Older payments predate periodDate — fall back to paidAt so they still
              // load (we can't reconstruct the true cycle for historical data).
              periodDate: p.periodDate ? sd(p.periodDate) : sd(p.paidAt),
            })),
            createdAt: sd(s.createdAt),
            updatedAt: sd(s.updatedAt),
            isInstallment: s.isInstallment ?? false,
            completedInstallments: s.completedInstallments ?? 0,
          }));
          state.budgets = state.budgets.map((b: any) => ({
            ...b,
            startDate: sd(b.startDate),
            endDate: sd(b.endDate),
            createdAt: sd(b.createdAt),
            updatedAt: sd(b.updatedAt),
          }));
          state._deletedTransactionIds = state._deletedTransactionIds ?? [];
          state._deletedSubscriptionIds = state._deletedSubscriptionIds ?? [];
          state._deletedBudgetIds = state._deletedBudgetIds ?? [];
          state._deletedGoalIds = state._deletedGoalIds ?? [];
          state.goals = (state.goals || []).map((g: any) => ({
            ...g,
            deadline: g.deadline ? sd(g.deadline) : undefined,
            isPaused: g.isPaused ?? false,
            isArchived: g.isArchived ?? false,
            walletId: g.walletId || undefined,
            contributions: (g.contributions || []).map((c: any) => ({
              ...c,
              date: sd(c.date),
            })),
            milestones: (g.milestones || []).map((m: any) => ({
              ...m,
              reachedAt: m.reachedAt ? sd(m.reachedAt) : undefined,
            })),
            createdAt: sd(g.createdAt),
            updatedAt: sd(g.updatedAt),
          }));
        }
      },
    }
  )
);