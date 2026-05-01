import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DebtState, DebtStatus } from '../types';
import { newId } from '../utils/id';

export const useDebtStore = create<DebtState>()(
  persist(
    (set) => ({
      debts: [],
      splits: [],
      contacts: [],
      _deletedDebtIds: [],
      _deletedSplitIds: [],
      _deletedContactIds: [],

      clearDebtTombstones: () => set({
        _deletedDebtIds: [],
        _deletedSplitIds: [],
        _deletedContactIds: [],
      }),

      addDebt: (debt) => {
        const id = newId();
        set((state) => ({
          debts: [
            {
              ...debt,
              id,
              paidAmount: 0,
              status: 'pending' as DebtStatus,
              payments: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.debts,
          ],
        }));
        return id;
      },

      updateDebt: (id, updates) =>
        set((state) => ({
          debts: state.debts.map((debt) => {
            if (debt.id !== id) return debt;

            const updated = { ...debt, ...updates, updatedAt: new Date() };

            // Recalculate status when totalAmount changes
            if (updates.totalAmount !== undefined) {
              const paidAmount = updated.paidAmount;
              const newTotal = updates.totalAmount;

              if (paidAmount >= newTotal) {
                updated.status = 'settled';
                // Cap paidAmount to totalAmount to prevent exceeding
                updated.paidAmount = Math.min(paidAmount, newTotal);
              } else if (paidAmount > 0) {
                updated.status = 'partial';
              } else {
                updated.status = 'pending';
              }
            }

            return updated;
          }),
        })),

      deleteDebt: (id) =>
        set((state) => ({
          debts: state.debts.filter((d) => d.id !== id),
          _deletedDebtIds: [...(state._deletedDebtIds ?? []), id],
        })),

      addPayment: (debtId, payment) => {
        const debt = (useDebtStore.getState() as DebtState).debts.find((d) => d.id === debtId);
        if (!debt) return null;
        if (debt.status === 'settled') return null;

        const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
        const cappedAmount = Math.min(payment.amount, remaining);
        if (cappedAmount <= 0) return null;

        const paymentId = newId();
        set((state) => ({
          debts: state.debts.map((d) => {
            if (d.id !== debtId) return d;

            const newPayment = {
              ...payment,
              amount: cappedAmount,
              id: paymentId,
              createdAt: new Date(),
            };

            const newPaidAmount = d.paidAmount + cappedAmount;
            let newStatus: DebtStatus = 'pending';
            if (newPaidAmount >= d.totalAmount) newStatus = 'settled';
            else if (newPaidAmount > 0) newStatus = 'partial';

            return {
              ...d,
              payments: [...d.payments, newPayment],
              paidAmount: newPaidAmount,
              status: newStatus,
              updatedAt: new Date(),
            };
          }),
        }));
        return paymentId;
      },

      deletePayment: (debtId, paymentId) =>
        set((state) => ({
          debts: state.debts.map((debt) => {
            if (debt.id !== debtId) return debt;

            const payment = debt.payments.find((p) => p.id === paymentId);
            if (!payment) return debt;

            const newPayments = debt.payments.filter((p) => p.id !== paymentId);
            const newPaidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
            let newStatus: DebtStatus = 'pending';
            if (newPaidAmount >= debt.totalAmount) {
              newStatus = 'settled';
            } else if (newPaidAmount > 0) {
              newStatus = 'partial';
            }

            return {
              ...debt,
              payments: newPayments,
              paidAmount: newPaidAmount,
              status: newStatus,
              updatedAt: new Date(),
            };
          }),
        })),

      updatePayment: (debtId, paymentId, updates) =>
        set((state) => ({
          debts: state.debts.map((debt) => {
            if (debt.id !== debtId) return debt;

            const existing = debt.payments.find((p) => p.id === paymentId);
            if (!existing) return debt;

            let cappedAmount = updates.amount;
            if (cappedAmount !== undefined) {
              const sumOfOthers = debt.payments.reduce(
                (sum, p) => p.id === paymentId ? sum : sum + p.amount,
                0,
              );
              const maxAllowed = Math.max(0, debt.totalAmount - sumOfOthers);
              cappedAmount = Math.max(0, Math.min(cappedAmount, maxAllowed));
            }

            const newPayments = debt.payments.map((p) => {
              if (p.id !== paymentId) return p;
              const effectiveUpdates = cappedAmount !== undefined
                ? { ...updates, amount: cappedAmount }
                : updates;
              const amountChanged = effectiveUpdates.amount !== undefined && effectiveUpdates.amount !== p.amount;
              const noteChanged = effectiveUpdates.note !== undefined && effectiveUpdates.note !== p.note;
              const editEntry = (amountChanged || noteChanged)
                ? { editedAt: new Date(), previousAmount: p.amount, previousNote: p.note }
                : null;
              return {
                ...p,
                ...effectiveUpdates,
                editLog: editEntry
                  ? [...(p.editLog ?? []), editEntry]
                  : p.editLog,
              };
            });
            const newPaidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
            let newStatus: DebtStatus = 'pending';
            if (newPaidAmount >= debt.totalAmount) {
              newStatus = 'settled';
            } else if (newPaidAmount > 0) {
              newStatus = 'partial';
            }

            return {
              ...debt,
              payments: newPayments,
              paidAmount: newPaidAmount,
              status: newStatus,
              updatedAt: new Date(),
            };
          }),
        })),

      addSplit: (split) => {
        const id = newId();
        set((state) => ({
          splits: [
            {
              ...split,
              id,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.splits,
          ],
        }));
        return id;
      },

      updateSplit: (id, updates) =>
        set((state) => ({
          splits: state.splits.map((split) =>
            split.id === id
              ? { ...split, ...updates, updatedAt: new Date() }
              : split
          ),
        })),

      deleteSplit: (id) =>
        set((state) => ({
          splits: state.splits.filter((s) => s.id !== id),
          _deletedSplitIds: [...(state._deletedSplitIds ?? []), id],
        })),

      markSplitParticipantPaid: (splitId, contactId) =>
        set((state) => ({
          splits: state.splits.map((split) => {
            if (split.id !== splitId) return split;
            return {
              ...split,
              participants: split.participants.map((p) =>
                p.contact.id === contactId ? { ...p, isPaid: true } : p
              ),
              updatedAt: new Date(),
            };
          }),
        })),

      unmarkSplitParticipantPaid: (splitId, contactId) =>
        set((state) => ({
          splits: state.splits.map((split) => {
            if (split.id !== splitId) return split;
            return {
              ...split,
              participants: split.participants.map((p) =>
                p.contact.id === contactId ? { ...p, isPaid: false } : p
              ),
              updatedAt: new Date(),
            };
          }),
        })),

      addContact: (contact) =>
        set((state) => ({
          contacts: [
            {
              ...contact,
              id: newId(),
            },
            ...state.contacts,
          ],
        })),

      deleteContact: (id) =>
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
          _deletedContactIds: [...(state._deletedContactIds ?? []), id],
          debts: state.debts.map((d) =>
            d.contact?.id === id ? { ...d, contact: { ...d.contact, name: '(deleted)' } } : d
          ),
          splits: state.splits.map((s) => ({
            ...s,
            participants: s.participants.map((p) =>
              p.contact.id === id ? { ...p, contact: { ...p.contact, name: '(deleted)' } } : p
            ),
          })),
        })),
    }),
    {
      name: 'debt-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        debts: state.debts.map((d) => ({
          ...d,
          dueDate: d.dueDate instanceof Date ? d.dueDate.toISOString() : d.dueDate,
          createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
          updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
          payments: d.payments.map((p) => ({
            ...p,
            date: p.date instanceof Date ? p.date.toISOString() : p.date,
            createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          })),
        })),
        splits: state.splits.map((s) => ({
          ...s,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
          updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
        })),
        contacts: state.contacts,
        _deletedDebtIds: state._deletedDebtIds ?? [],
        _deletedSplitIds: state._deletedSplitIds ?? [],
        _deletedContactIds: state._deletedContactIds ?? [],
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          state.debts = state.debts.map((d: any) => ({
            ...d,
            dueDate: d.dueDate ? sd(d.dueDate) : undefined,
            createdAt: sd(d.createdAt),
            updatedAt: sd(d.updatedAt),
            payments: (d.payments || []).map((p: any) => ({
              ...p,
              date: sd(p.date),
              createdAt: sd(p.createdAt),
              editLog: (p.editLog || []).map((e: any) => ({
                ...e,
                editedAt: sd(e.editedAt),
              })),
            })),
          }));
          state.splits = state.splits.map((s: any) => ({
            ...s,
            createdAt: sd(s.createdAt),
            updatedAt: sd(s.updatedAt),
          }));
          state._deletedDebtIds = state._deletedDebtIds ?? [];
          state._deletedSplitIds = state._deletedSplitIds ?? [];
          state._deletedContactIds = state._deletedContactIds ?? [];
        }
      },
    }
  )
);
