import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersonalState, Transfer } from '../types';
import { useWalletStore } from './walletStore';
import { useTombstoneStore } from './tombstoneStore';
import { removeSharedEntry } from '../utils/sharedPaymentDedupe';
import { usePaymentDedupeStore } from './paymentDedupeStore';
import { newId } from '../utils/id';
import { roundMoney, applyGoalContribution } from '../utils/money';
import { advanceBillingDate } from '../utils/billing';

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

      // WALLET-BALANCE INVARIANT: a transaction with a walletId moves that wallet exactly
      // once. addTransaction does NOT apply the delta — the CALLER pairs an
      // addToWallet/deductFromWallet with each add (income→add, expense→deduct), because
      // some callers set balances another way (sampleData seeds via initialBalance and must
      // NOT get an auto-delta). updateTransaction/deleteTransaction below DO move the wallet
      // (reverse old, apply new). reconcileWalletBalances() is the source of truth and
      // self-heals drift on sync. Locked by scripts/test-transaction-wallet-invariant.ts.
      addTransaction: (transaction) => {
        if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) return '';
        const id = newId();
        // Round to 2dp so the stored value matches the numeric(14,2) cloud column
        // AND the 2dp the app renders everywhere — a >2dp amount (e.g. a split
        // divided three ways) would otherwise drift by a fraction of a cent between
        // device and Supabase. Matches addSubscription/addBudget/addAccount, which
        // already roundMoney; addTransaction was the lone writer that didn't.
        const amount = roundMoney(transaction.amount);
        set((state) => ({
          transactions: [
            {
              ...transaction,
              amount,
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
        // Free any Share-to-Log dedupe key this txn holds, so re-sharing the same payment
        // screenshot logs it fresh again (no-op for non-share txns / off iOS). ONE app-group
        // read-modify-write removes the entry by KEY (via the local store's key↔txId map, robust
        // even when the app-group txId link is stale/null) AND by txId — a single write avoids the
        // self-race that re-added the key and lands faster before a fast re-share reads it.
        const key = usePaymentDedupeStore.getState().removeByTxId(id);
        void removeSharedEntry(key, id);
        if (!prev || !prev.walletId) return;
        const wallets = useWalletStore.getState();
        if (prev.type === 'expense') wallets.addToWallet(prev.walletId, prev.amount);
        else if (prev.type === 'income') wallets.deductFromWallet(prev.walletId, prev.amount);
      },

      addSubscription: (subscription) => {
        // Reject non-finite (NaN/Infinity) amounts too — the chat/LLM creation path
        // forwards action.amount unchecked, and `NaN <= 0` is false, so a bare
        // `<= 0` guard would let a "RM NaN" bill through. Round at the write site.
        if (!Number.isFinite(subscription.amount) || subscription.amount <= 0) return;
        set((state) => ({
          subscriptions: [
            {
              ...subscription,
              amount: roundMoney(subscription.amount),
              ...(subscription.outstandingBalance !== undefined
                ? { outstandingBalance: roundMoney(subscription.outstandingBalance) }
                : {}),
              id: newId(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.subscriptions,
          ],
        }));
      },

      addBudget: (budget) => {
        // Reject non-finite (NaN/Infinity) or non-positive allocations — the chat/LLM
        // creation path forwards allocatedAmount unchecked, and an Infinity/NaN would
        // persist then crash BudgetPlanning's toFixed. Round at the write site.
        if (!Number.isFinite(budget.allocatedAmount) || budget.allocatedAmount <= 0) return;
        // Belt-and-braces upsert: if a budget for this category already exists, merge
        // the new allocation into it instead of creating a duplicate.
        const existing = (usePersonalStore.getState() as PersonalState).budgets.find(
          (b) => b.category.toLowerCase() === budget.category.toLowerCase()
        );
        if (existing) {
          set((state) => ({
            budgets: state.budgets.map((b) =>
              b.id === existing.id
                ? { ...b, allocatedAmount: roundMoney(budget.allocatedAmount), updatedAt: new Date() }
                : b
            ),
          }));
          return;
        }
        set((state) => ({
          budgets: [
            {
              ...budget,
              allocatedAmount: roundMoney(budget.allocatedAmount),
              id: newId(),
              spentAmount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.budgets,
          ],
        }));
      },

      updateBudget: (id, updates) => {
        // Sanitize a money write: the chat/LLM path can forward allocatedAmount as a
        // raw string or Infinity, which later crashes BudgetPlanning's toFixed. Coerce
        // + validate, and DROP an invalid allocation change rather than persist it
        // (mirrors updateSubscription's round-at-write-site).
        const safe: typeof updates = { ...updates };
        if (safe.allocatedAmount !== undefined) {
          const n = Number(safe.allocatedAmount);
          if (Number.isFinite(n) && n > 0) safe.allocatedAmount = roundMoney(n);
          else delete safe.allocatedAmount;
        }
        set((state) => ({
          budgets: state.budgets.map((budget) =>
            budget.id === id
              ? { ...budget, ...safe, updatedAt: new Date() }
              : budget
          ),
        }));
      },

      updateSubscription: (id, updates) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((subscription) =>
            subscription.id === id
              ? {
                  ...subscription,
                  ...updates,
                  // Round money at the write site (sub-sen inputs otherwise drift
                  // into wallet debits / outstanding math).
                  ...(updates.amount !== undefined ? { amount: roundMoney(updates.amount) } : {}),
                  ...(updates.outstandingBalance !== undefined && updates.outstandingBalance !== null
                    ? { outstandingBalance: roundMoney(updates.outstandingBalance) }
                    : {}),
                  updatedAt: new Date(),
                }
              : subscription
          ),
        })),

      deleteSubscription: (id) => {
        set((state) => ({
          subscriptions: state.subscriptions.filter((sub) => sub.id !== id),
          _deletedSubscriptionIds: [...(state._deletedSubscriptionIds ?? []), id],
        }));
        useTombstoneStore.getState().addTombstones([id]);
        // Clear the back-link from any shared subscription that pointed at this
        // commitment — a dangling subscriptionId routes the shared-sub owner to a
        // deleted bill and blocks them from marking themselves paid. (lazy require:
        // matches the cross-store pattern in walletStore to avoid an import cycle.)
        try {
          const { useDebtStore } = require('./debtStore');
          const ds = useDebtStore.getState();
          ds.sharedSubscriptions
            .filter((s: any) => s.subscriptionId === id)
            .forEach((s: any) => ds.updateSharedSubscription(s.id, { subscriptionId: undefined }));
        } catch {}
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
            const dayKey = (d: Date | string) => {
              const x = new Date(d);
              return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
            };
            const advance = (d: Date) => advanceBillingDate(d, sub.billingCycle);
            // Advance to the next due cycle, SKIPPING any cycle already settled by an
            // active payment (can happen after an out-of-order undo leaves a paid cycle
            // ahead of the pointer) — so nextBillingDate never lands on a paid cycle.
            const paidKeys = new Set(
              (sub.paymentHistory || []).filter((p) => !p.undoneAt).map((p) => dayKey(p.periodDate ?? p.paidAt)),
            );
            let next = advance(periodDate);
            let guard = 0;
            while (paidKeys.has(dayKey(next)) && guard++ < 600) next = advance(next);

            const newCompleted = sub.isInstallment
              ? Math.min((sub.completedInstallments || 0) + 1, sub.totalInstallments || 9999)
              : sub.completedInstallments;
            // Only an installment plan draws down an outstanding balance. Gating on
            // isInstallment stops a bill whose installment flag was later turned off
            // (leaving a stale outstandingBalance) from silently eating it down.
            const newOutstanding = sub.isInstallment && sub.outstandingBalance !== undefined
              ? roundMoney(Math.max(sub.outstandingBalance - sub.amount, 0))
              : sub.outstandingBalance;
            // Exact amount taken off outstandingBalance (clamps at 0), so undo restores
            // precisely instead of always adding back the full sub.amount.
            const appliedToOutstanding = sub.isInstallment && sub.outstandingBalance !== undefined && newOutstanding !== undefined
              ? roundMoney(sub.outstandingBalance - newOutstanding)
              : undefined;
            return {
              ...sub,
              lastPaidAt: paidOn,
              nextBillingDate: next,
              completedInstallments: newCompleted,
              outstandingBalance: newOutstanding,
              paymentHistory: [
                ...(sub.paymentHistory || []),
                { id: `pay-${newId()}`, paidAt: paidOn, periodDate, amount: sub.amount, transactionId, walletId, appliedToOutstanding },
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

          if (payment.walletId) {
            walletRefund = { walletId: payment.walletId, amount: payment.amount };
          }
          transactionToDelete = payment.transactionId;

          // Mark this payment undone, then RE-DERIVE the schedule from the resulting
          // active set — so undoing ANY payment (not just the latest) is correct, and an
          // out-of-order undo re-exposes exactly that cycle instead of blindly rolling
          // the pointer back one step.
          const newHistory = (sub.paymentHistory || []).map((p) =>
            p.id === paymentId ? { ...p, undoneAt: new Date() } : p
          );
          const active = newHistory.filter((p) => !p.undoneAt);

          const dayKey = (d: Date | string) => {
            const x = new Date(d);
            return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
          };
          const advanceCycle = (d: Date) => advanceBillingDate(d, sub.billingCycle);

          const clearedKeys = new Set(active.map((p) => dayKey(p.periodDate ?? p.paidAt)));
          // Every cycle ever billed (has a payment record), ascending.
          const billedPeriods = newHistory
            .map((p) => new Date(p.periodDate ?? p.paidAt))
            .sort((a, b) => a.getTime() - b.getTime());
          // Oldest billed cycle that's no longer cleared = the new oldest-unpaid. If all
          // billed cycles are still cleared, next due is one cycle past the latest.
          const firstUnpaid = billedPeriods.find((pd) => !clearedKeys.has(dayKey(pd)));
          const latestBilled = billedPeriods[billedPeriods.length - 1] ?? new Date(sub.nextBillingDate);
          const newNext = firstUnpaid ?? advanceCycle(latestBilled);

          const newCompleted = sub.isInstallment
            ? Math.min(active.length, sub.totalInstallments ?? active.length)
            : sub.completedInstallments;
          const rolledOutstanding = sub.outstandingBalance !== undefined
            ? roundMoney(sub.outstandingBalance + ((payment as any).appliedToOutstanding ?? payment.amount))
            : undefined;
          const lastPaidAt = [...active]
            .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0]?.paidAt ?? undefined;

          return {
            subscriptions: s.subscriptions.map((item) => {
              if (item.id !== subId) return item;
              return {
                ...item,
                nextBillingDate: newNext,
                completedInstallments: newCompleted,
                outstandingBalance: rolledOutstanding,
                lastPaidAt,
                paymentHistory: newHistory,
                updatedAt: new Date(),
              };
            }),
            transactions: transactionToDelete
              ? s.transactions.filter((t) => t.id !== transactionToDelete)
              : s.transactions,
            // Tombstone the deleted tx exactly like deleteTransaction — otherwise the
            // server row survives, re-syncs back, and autoReconcile re-deducts it,
            // silently reversing the wallet refund below (and doubling on other devices).
            _deletedTransactionIds: transactionToDelete
              ? [...(s._deletedTransactionIds ?? []), transactionToDelete]
              : s._deletedTransactionIds,
          };
        });

        if (transactionToDelete) {
          useTombstoneStore.getState().addTombstones([transactionToDelete]);
        }
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
        // Refund any wallet-funded contributions/withdrawals back to their wallets
        // and remove the linked transactions, so deleting a goal doesn't strand
        // real money or leave orphaned, permanently-locked 'savings' transactions.
        // deleteTransaction reverses the wallet delta per tx; contribute (expense)
        // and withdraw (income) txs net out correctly.
        const goal = usePersonalStore.getState().goals.find((g) => g.id === id);
        const linkedTxIds = (goal?.contributions ?? [])
          .map((c) => c.transactionId)
          .filter((tid): tid is string => !!tid);
        linkedTxIds.forEach((tid) => usePersonalStore.getState().deleteTransaction(tid));
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
          _deletedGoalIds: [...(state._deletedGoalIds ?? []), id],
        }));
        useTombstoneStore.getState().addTombstones([id]);
      },

      contributeToGoal: (goalId, amount, note, walletId, transactionId) => {
        if (!Number.isFinite(amount) || amount <= 0) return;
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== goalId) return goal;
            // Cap to the room left (pure, unit-tested). A full/over-target goal
            // absorbs nothing — no phantom contribution, no wallet leak. Callers
            // pre-cap their wallet debit to this same actualAmount.
            const { actualAmount, newCurrentAmount } = applyGoalContribution(goal.currentAmount, goal.targetAmount, amount);
            if (actualAmount <= 0) return goal;
            const newContribution = {
              id: newId(),
              amount: actualAmount,
              note,
              date: new Date(),
              walletId,
              transactionId,
            };
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
        }));
      },

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
            undoneAt: p.undoneAt instanceof Date ? p.undoneAt.toISOString() : p.undoneAt,
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
              // Rehydrate undoneAt to a real Date (was left a string) so any
              // date comparison on it is safe, not just truthiness checks.
              undoneAt: p.undoneAt ? sd(p.undoneAt) : undefined,
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