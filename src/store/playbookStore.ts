import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays } from 'date-fns';
import { Playbook, PlaybookAllocation, PlaybookLineItem, Transaction } from '../types';
import { usePremiumStore } from './premiumStore';
import { usePersonalStore } from './personalStore';
import { cleanupOrphanedLinks } from '../utils/playbookStats';
import { FREE_TIER } from '../constants/premium';

export interface EchoMemoryEntry {
  date: string;           // ISO date
  playbookName: string;
  sourceAmount: number;
  planSummary: string;    // 2-3 sentence summary of the plan
  keyAdvice: string[];    // top pieces of advice given
  chatHighlights: string[]; // key user questions/concerns from chat
}

interface PlaybookStoreState {
  playbooks: Playbook[];
  echoMemory: EchoMemoryEntry[];

  // Echo memory
  saveEchoSession: (entry: Omit<EchoMemoryEntry, 'date'>) => void;

  // CRUD
  createPlaybook: (data: {
    name: string;
    sourceAmount: number;
    sourceTransactionId?: string;
    allocations?: PlaybookAllocation[];
    startDate?: Date;
  }) => string | null;
  updatePlaybook: (id: string, updates: Partial<Pick<Playbook, 'name' | 'allocations' | 'suggestedEndDate'>>) => void;
  deletePlaybook: (id: string) => void;

  // Lifecycle
  closePlaybook: (id: string) => boolean;
  reopenPlaybook: (id: string) => boolean;

  // Expense linking
  linkExpense: (playbookId: string, transactionId: string) => void;
  // Atomic, single-owner attribution: adds txId to target playbook's membership
  // (guard: target must be active && !closed) and strips it from ALL other playbooks.
  setExpenseLink: (playbookId: string, transactionId: string, amount: number) => void;
  unlinkAllFromTransaction: (transactionId: string) => void;

  // Notebook (line items)
  addLineItem: (playbookId: string, item: Omit<PlaybookLineItem, 'id' | 'sortOrder'>) => void;
  updateLineItem: (playbookId: string, itemId: string, updates: Partial<PlaybookLineItem>) => void;
  removeLineItem: (playbookId: string, itemId: string) => void;
  toggleLineItemPaid: (playbookId: string, itemId: string) => void;
  updateNotebookNote: (playbookId: string, note: string) => void;

  // Obligations
  toggleObligationCovered: (playbookId: string, obligationId: string) => void;

  // Queries
  getActivePlaybooks: () => Playbook[];
  canCreatePlaybook: () => boolean;
}

export const usePlaybookStore = create<PlaybookStoreState>()(
  persist(
    (set, get) => ({
      playbooks: [],
      echoMemory: [],

      saveEchoSession: (entry) => {
        const { echoMemory } = get();
        const newEntry: EchoMemoryEntry = { ...entry, date: new Date().toISOString() };
        // Keep max 6 entries (6 months of history)
        const updated = [newEntry, ...echoMemory].slice(0, 6);
        set({ echoMemory: updated });
      },

      createPlaybook: (data) => {
        if (!data.sourceAmount || data.sourceAmount <= 0) return null;
        const { playbooks } = get();
        const activeCount = playbooks.filter((p) => p.isActive && !p.isClosed).length;
        if (activeCount >= FREE_TIER.maxActivePlaybooks) return null;

        const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
        const startDate = data.startDate || new Date();

        const newPlaybook: Playbook = {
          id,
          name: data.name,
          sourceAmount: data.sourceAmount,
          sourceTransactionId: data.sourceTransactionId,
          allocations: data.allocations || [],
          linkedExpenseIds: [],
          startDate,
          suggestedEndDate: addDays(startDate, 30),
          isActive: true,
          isClosed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set({ playbooks: [newPlaybook, ...playbooks] });
        return id;
      },

      updatePlaybook: (id, updates) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
        })),

      deletePlaybook: (id) => {
        set((state) => ({
          playbooks: state.playbooks.filter((p) => p.id !== id),
        }));
        // After removal, strip orphaned playbookLinks entries from transactions.
        // Money-safe: only mutates playbookLinks, never amount/type/wallet, so
        // updateTransaction performs no wallet reconciliation.
        const remaining = get().playbooks;
        const existingPlaybookIds = new Set(remaining.map((p) => p.id));
        const { transactions, updateTransaction } = usePersonalStore.getState();
        const updates = cleanupOrphanedLinks(transactions, existingPlaybookIds);
        for (const u of updates) {
          updateTransaction(u.id, { playbookLinks: u.playbookLinks });
        }
      },

      closePlaybook: (id) => {
        const { playbooks } = get();
        const tier = usePremiumStore.getState().tier;
        const closedCount = playbooks.filter((p) => p.isClosed).length;
        if (tier === 'free' && closedCount >= FREE_TIER.maxSavedPlaybooks) return false;

        set((state) => ({
          playbooks: state.playbooks.map((p) =>
            p.id === id
              ? { ...p, isActive: false, isClosed: true, endDate: new Date(), updatedAt: new Date() }
              : p
          ),
        }));
        return true;
      },

      reopenPlaybook: (id) => {
        const { playbooks } = get();
        const activeCount = playbooks.filter((p) => p.isActive && !p.isClosed).length;
        if (activeCount >= FREE_TIER.maxActivePlaybooks) return false;

        set((state) => ({
          playbooks: state.playbooks.map((p) =>
            p.id === id
              ? { ...p, isActive: true, isClosed: false, endDate: undefined, updatedAt: new Date() }
              : p
          ),
        }));
        return true;
      },

      linkExpense: (playbookId, transactionId) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) => {
            if (p.id !== playbookId || !p.isActive || p.isClosed) return p;
            if (p.linkedExpenseIds.includes(transactionId)) return p;
            return {
              ...p,
              linkedExpenseIds: [...p.linkedExpenseIds, transactionId],
              updatedAt: new Date(),
            };
          }),
        })),

      setExpenseLink: (playbookId, transactionId) => {
        // Guard: target must exist, be active and not closed.
        const target = get().playbooks.find((p) => p.id === playbookId);
        if (!target || !target.isActive || target.isClosed) return;
        set((state) => ({
          playbooks: state.playbooks.map((p) => {
            if (p.id === playbookId) {
              if (p.linkedExpenseIds.includes(transactionId)) return p;
              return {
                ...p,
                linkedExpenseIds: [...p.linkedExpenseIds, transactionId],
                updatedAt: new Date(),
              };
            }
            // Single-owner: strip txId from every OTHER playbook.
            if (p.linkedExpenseIds.includes(transactionId)) {
              return {
                ...p,
                linkedExpenseIds: p.linkedExpenseIds.filter((id) => id !== transactionId),
                updatedAt: new Date(),
              };
            }
            return p;
          }),
        }));
      },

      unlinkAllFromTransaction: (transactionId) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) =>
            p.linkedExpenseIds.includes(transactionId)
              ? {
                  ...p,
                  linkedExpenseIds: p.linkedExpenseIds.filter((id) => id !== transactionId),
                  updatedAt: new Date(),
                }
              : p
          ),
        })),

      addLineItem: (playbookId, item) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) => {
            if (p.id !== playbookId) return p;
            const items = p.lineItems || [];
            const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
            return {
              ...p,
              lineItems: [...items, { ...item, id, sortOrder: items.length }],
              updatedAt: new Date(),
            };
          }),
        })),

      updateLineItem: (playbookId, itemId, updates) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) => {
            if (p.id !== playbookId) return p;
            return {
              ...p,
              lineItems: (p.lineItems || []).map((li) =>
                li.id === itemId ? { ...li, ...updates } : li
              ),
              updatedAt: new Date(),
            };
          }),
        })),

      removeLineItem: (playbookId, itemId) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) => {
            if (p.id !== playbookId) return p;
            return {
              ...p,
              lineItems: (p.lineItems || []).filter((li) => li.id !== itemId),
              updatedAt: new Date(),
            };
          }),
        })),

      toggleLineItemPaid: (playbookId, itemId) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) => {
            if (p.id !== playbookId) return p;
            return {
              ...p,
              lineItems: (p.lineItems || []).map((li) =>
                li.id === itemId ? { ...li, isPaid: !li.isPaid } : li
              ),
              updatedAt: new Date(),
            };
          }),
        })),

      updateNotebookNote: (playbookId, note) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) =>
            p.id === playbookId ? { ...p, notebookNote: note, updatedAt: new Date() } : p
          ),
        })),

      toggleObligationCovered: (playbookId, obligationId) =>
        set((state) => ({
          playbooks: state.playbooks.map((p) => {
            if (p.id !== playbookId) return p;
            const ids = p.coveredObligationIds || [];
            const next = ids.includes(obligationId)
              ? ids.filter((id) => id !== obligationId)
              : [...ids, obligationId];
            return { ...p, coveredObligationIds: next, updatedAt: new Date() };
          }),
        })),

      getActivePlaybooks: () => get().playbooks.filter((p) => p.isActive && !p.isClosed),
      canCreatePlaybook: () => get().playbooks.filter((p) => p.isActive && !p.isClosed).length < FREE_TIER.maxActivePlaybooks,
    }),
    {
      name: 'playbook-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        echoMemory: state.echoMemory || [],
        playbooks: state.playbooks.map((p) => ({
          ...p,
          startDate: p.startDate instanceof Date ? p.startDate.toISOString() : p.startDate,
          suggestedEndDate: p.suggestedEndDate instanceof Date ? p.suggestedEndDate.toISOString() : p.suggestedEndDate,
          endDate: p.endDate instanceof Date ? p.endDate.toISOString() : p.endDate,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
        })),
      }) as any,
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.echoMemory = Array.isArray(state.echoMemory) ? state.echoMemory : [];
          const sd = (v: any) => {
            if (!v) return new Date();
            const d = v instanceof Date ? v : new Date(v);
            return isNaN(d.getTime()) ? new Date() : d;
          };
          state.playbooks = (state.playbooks || []).map((p: any) => ({
            ...p,
            allocations: p.allocations || [],
            linkedExpenseIds: p.linkedExpenseIds || [],
            lineItems: (p.lineItems || []).map((li: any) => ({
              ...li,
              isPaid: li.isPaid ?? false,
              sortOrder: li.sortOrder ?? 0,
              plannedAmount: li.plannedAmount ?? 0,
              category: li.category || undefined,
              linkedObligationIds: Array.isArray(li.linkedObligationIds) ? li.linkedObligationIds : undefined,
            })),
            notebookNote: p.notebookNote ?? '',
            coveredObligationIds: p.coveredObligationIds || [],
            isActive: p.isActive ?? false,
            isClosed: p.isClosed ?? false,
            startDate: sd(p.startDate),
            suggestedEndDate: sd(p.suggestedEndDate),
            endDate: p.endDate ? sd(p.endDate) : undefined,
            createdAt: sd(p.createdAt),
            updatedAt: sd(p.updatedAt),
          }));
          // Auto-migrate: convert allocations to category-linked line items
          state.playbooks = state.playbooks.map((p: any) => {
            const allocs = (p.allocations || []).filter((a: any) => a.allocatedAmount > 0);
            const hasLinkedItems = (p.lineItems || []).some((li: any) => li.category);
            if (allocs.length > 0 && !hasLinkedItems && p.isActive && !p.isClosed) {
              const existing = p.lineItems || [];
              const migrated = allocs.map((a: any, idx: number) => ({
                id: `migrated-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                label: a.category,
                plannedAmount: a.allocatedAmount,
                isPaid: false,
                sortOrder: existing.length + idx,
                category: a.category,
              }));
              // Clear allocations on this playbook to kill the double-count source —
              // stats now read lineItems only.
              return { ...p, allocations: [], lineItems: [...existing, ...migrated] };
            }
            return p;
          });
        }
      },
    }
  )
);
