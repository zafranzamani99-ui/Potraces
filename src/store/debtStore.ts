import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DebtState, DebtStatus } from '../types';

export const useDebtStore = create<DebtState>()(
  persist(
    (set) => ({
      debts: [],
      splits: [],
      contacts: [],

      addDebt: (debt) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
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
        })),

      addPayment: (debtId, payment) =>
        set((state) => ({
          debts: state.debts.map((debt) => {
            if (debt.id !== debtId) return debt;

            const newPayment = {
              ...payment,
              id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
              createdAt: new Date(),
            };

            const newPaidAmount = debt.paidAmount + payment.amount;
            let newStatus: DebtStatus = 'pending';
            if (newPaidAmount >= debt.totalAmount) {
              newStatus = 'settled';
            } else if (newPaidAmount > 0) {
              newStatus = 'partial';
            }

            return {
              ...debt,
              payments: [...debt.payments, newPayment],
              paidAmount: newPaidAmount,
              status: newStatus,
              updatedAt: new Date(),
            };
          }),
        })),

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

      addSplit: (split) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
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
              id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
            },
            ...state.contacts,
          ],
        })),

      deleteContact: (id) =>
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.debts = state.debts.map((d: any) => ({
            ...d,
            dueDate: d.dueDate ? new Date(d.dueDate) : undefined,
            createdAt: new Date(d.createdAt),
            updatedAt: new Date(d.updatedAt),
            payments: d.payments.map((p: any) => ({
              ...p,
              date: new Date(p.date),
              createdAt: new Date(p.createdAt),
            })),
          }));
          state.splits = state.splits.map((s: any) => ({
            ...s,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          }));
        }
      },
    }
  )
);
