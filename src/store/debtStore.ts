import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DebtState, DebtStatus, DebtEdit } from '../types';
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
        let groupId = (debt as any).groupId as string | undefined;
        if (!groupId) {
          const contactKey = debt.contact.id || debt.contact.name;
          const existing = (useDebtStore.getState() as DebtState).debts.find(
            (d) => d.status !== 'settled' && !d.isArchived &&
              (d.contact.id || d.contact.name) === contactKey && d.groupId
          );
          groupId = existing?.groupId || newId();
        }
        set((state) => ({
          debts: [
            {
              ...debt,
              id,
              groupId,
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

            const edits: DebtEdit[] = [];
            if (updates.totalAmount !== undefined && updates.totalAmount !== debt.totalAmount) {
              edits.push({ editedAt: new Date(), field: 'totalAmount', previousValue: debt.totalAmount, newValue: updates.totalAmount });
            }
            if (updates.description !== undefined && updates.description !== debt.description) {
              edits.push({ editedAt: new Date(), field: 'description', previousValue: debt.description, newValue: updates.description });
            }
            if (updates.contact !== undefined && (updates.contact.id !== debt.contact.id || updates.contact.name !== debt.contact.name)) {
              edits.push({ editedAt: new Date(), field: 'contact', previousValue: debt.contact.name, newValue: updates.contact.name });
            }

            const updated = {
              ...debt,
              ...updates,
              updatedAt: new Date(),
              editLog: edits.length > 0 ? [...(debt.editLog ?? []), ...edits] : debt.editLog,
            };

            // Recalculate paidAmount + status from actual payments when totalAmount changes
            if (updates.totalAmount !== undefined) {
              const newTotal = updates.totalAmount;
              const rawPaid = updated.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
              const paidAmount = Math.min(newTotal, rawPaid);
              updated.paidAmount = paidAmount;

              if (paidAmount >= newTotal) {
                updated.status = 'settled';
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

      archiveDebt: (id) =>
        set((state) => ({
          debts: state.debts.map((d) =>
            d.id === id ? { ...d, isArchived: true, archivedAt: new Date(), updatedAt: new Date() } : d
          ),
        })),

      unarchiveDebt: (id) =>
        set((state) => ({
          debts: state.debts.map((d) =>
            d.id === id ? { ...d, isArchived: false, archivedAt: undefined, updatedAt: new Date() } : d
          ),
        })),

      addPayment: (debtId, payment) => {
        if (!payment.amount || payment.amount <= 0) return null;
        const debt = (useDebtStore.getState() as DebtState).debts.find((d) => d.id === debtId);
        if (!debt) return null;
        if (debt.status === 'settled') return null;

        const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
        if (remaining <= 0) return null;

        const paymentId = newId();
        set((state) => ({
          debts: state.debts.map((d) => {
            if (d.id !== debtId) return d;

            const newPayment = {
              ...payment,
              amount: payment.amount,
              id: paymentId,
              createdAt: new Date(),
            };

            const newPaidAmount = Math.min(d.totalAmount, d.paidAmount + payment.amount);
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
            const rawPaidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
            const newPaidAmount = Math.min(debt.totalAmount, rawPaidAmount);
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

            const newPayments = debt.payments.map((p) => {
              if (p.id !== paymentId) return p;
              const amountChanged = updates.amount !== undefined && updates.amount !== p.amount;
              const noteChanged = updates.note !== undefined && updates.note !== p.note;
              const editEntry = (amountChanged || noteChanged)
                ? { editedAt: new Date(), previousAmount: p.amount, previousNote: p.note }
                : null;
              return {
                ...p,
                ...updates,
                editLog: editEntry
                  ? [...(p.editLog ?? []), editEntry]
                  : p.editLog,
              };
            });
            const rawPaidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
            const newPaidAmount = Math.min(debt.totalAmount, rawPaidAmount);
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

      archiveSplit: (id) =>
        set((state) => ({
          splits: state.splits.map((s) =>
            s.id === id ? { ...s, isArchived: true, archivedAt: new Date(), updatedAt: new Date() } : s
          ),
        })),

      unarchiveSplit: (id) =>
        set((state) => ({
          splits: state.splits.map((s) =>
            s.id === id ? { ...s, isArchived: false, archivedAt: undefined, updatedAt: new Date() } : s
          ),
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
          archivedAt: d.archivedAt instanceof Date ? d.archivedAt.toISOString() : d.archivedAt,
          createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
          updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
          editLog: (d.editLog || []).map((e) => ({
            ...e,
            editedAt: e.editedAt instanceof Date ? e.editedAt.toISOString() : e.editedAt,
          })),
          payments: d.payments.map((p) => ({
            ...p,
            date: p.date instanceof Date ? p.date.toISOString() : p.date,
            createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          })),
        })),
        splits: state.splits.map((s) => ({
          ...s,
          archivedAt: (s as any).archivedAt instanceof Date ? (s as any).archivedAt.toISOString() : (s as any).archivedAt,
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
          // Migrate legacy debts without groupId
          const groupIdMap = new Map<string, string>();
          state.debts = state.debts.map((d: any) => {
            let groupId = d.groupId;
            if (!groupId) {
              const contactKey = d.contact?.id || d.contact?.name || d.id;
              if (!groupIdMap.has(contactKey)) groupIdMap.set(contactKey, newId());
              groupId = groupIdMap.get(contactKey)!;
            }
            return {
              ...d,
              groupId,
              dueDate: d.dueDate ? sd(d.dueDate) : undefined,
              archivedAt: d.archivedAt ? sd(d.archivedAt) : undefined,
              createdAt: sd(d.createdAt),
              updatedAt: sd(d.updatedAt),
              editLog: (d.editLog || []).map((e: any) => ({
                ...e,
                editedAt: sd(e.editedAt),
              })),
              payments: (d.payments || []).map((p: any) => ({
                ...p,
                date: sd(p.date),
                createdAt: sd(p.createdAt),
                editLog: (p.editLog || []).map((e: any) => ({
                  ...e,
                  editedAt: sd(e.editedAt),
                })),
              })),
            };
          });
          state.splits = state.splits.map((s: any) => ({
            ...s,
            archivedAt: s.archivedAt ? sd(s.archivedAt) : undefined,
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
