import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BusinessState } from '../types';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { newId } from '../utils/id';
import { roundMoney } from '../utils/money';

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      products: [],
      sales: [],
      suppliers: [],
      incomeType: null,
      businessSetupComplete: false,
      businessTransactions: [],
      clients: [],
      riderCosts: [],
      incomeStreams: [],
      transfers: [],

      // Existing actions
      addProduct: (product) =>
        set((state) => ({
          products: [
            {
              ...product,
              id: newId(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.products,
          ],
        })),

      updateProduct: (id, updates) =>
        set((state) => ({
          products: state.products.map((product) =>
            product.id === id
              ? { ...product, ...updates, updatedAt: new Date() }
              : product
          ),
        })),

      addSale: (sale) =>
        set((state) => {
          const updatedProducts = state.products.map((product) => {
            const saleItem = sale.items.find((item) => item.productId === product.id);
            if (saleItem) {
              return {
                ...product,
                stock: Math.max(0, product.stock - saleItem.quantity),
                updatedAt: new Date(),
              };
            }
            return product;
          });

          return {
            sales: [
              {
                ...sale,
                id: newId(),
                isSynced: false,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              ...state.sales,
            ],
            products: updatedProducts,
          };
        }),

      addSupplier: (supplier) =>
        set((state) => ({
          suppliers: [
            {
              ...supplier,
              id: newId(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.suppliers,
          ],
        })),

      updateSupplier: (id, updates) =>
        set((state) => ({
          suppliers: state.suppliers.map((supplier) =>
            supplier.id === id
              ? { ...supplier, ...updates, updatedAt: new Date() }
              : supplier
          ),
        })),

      deleteProduct: (id) =>
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        })),

      deleteSupplier: (id) =>
        set((state) => ({
          suppliers: state.suppliers.filter((s) => s.id !== id),
        })),

      // New business mode actions
      setIncomeType: (type) =>
        set({ incomeType: type }),

      completeSetup: () =>
        set({ businessSetupComplete: true }),

      resetSetup: () =>
        set({ businessSetupComplete: false, incomeType: null }),

      addBusinessTransaction: (tx) => {
        const id = newId();
        set((state) => ({
          businessTransactions: [
            { ...tx, id },
            ...state.businessTransactions,
          ],
        }));
        return id;
      },

      updateBusinessTransaction: (id, updates) =>
        set((state) => ({
          businessTransactions: state.businessTransactions.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      deleteBusinessTransaction: (id) =>
        set((state) => ({
          businessTransactions: state.businessTransactions.filter((t) => t.id !== id),
        })),

      addClient: (client) =>
        set((state) => ({
          clients: [
            {
              ...client,
              id: newId(),
              totalPaid: 0,
              paymentHistory: [],
            },
            ...state.clients,
          ],
        })),

      logClientPayment: (clientId, amount, date) =>
        set((state) => ({
          clients: state.clients.map((c) =>
            c.id === clientId
              ? {
                  ...c,
                  totalPaid: roundMoney(c.totalPaid + amount),
                  lastPaid: date,
                  paymentHistory: [
                    { date, amount },
                    ...c.paymentHistory,
                  ],
                }
              : c
          ),
        })),

      addRiderCost: (cost) =>
        set((state) => ({
          riderCosts: [
            { ...cost, id: newId() },
            ...state.riderCosts,
          ],
        })),

      addIncomeStream: (stream) =>
        set((state) => ({
          incomeStreams: [
            { ...stream, id: newId() },
            ...state.incomeStreams,
          ],
        })),

      addTransfer: (transfer) =>
        set((state) => ({
          transfers: [transfer, ...state.transfers],
        })),

      deleteTransfer: (id) =>
        set((state) => ({
          transfers: state.transfers.filter((t) => t.id !== id),
        })),

      getTotalTransferredToPersonal: (month) => {
        const state = get();
        const start = startOfMonth(month);
        const end = endOfMonth(month);
        return roundMoney(state.transfers
          .filter(
            (t) =>
              t.toMode === 'personal' &&
              isWithinInterval(t.date instanceof Date ? t.date : new Date(t.date), { start, end })
          )
          .reduce((sum, t) => sum + t.amount, 0));
      },
    }),
    {
      name: 'business-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        products: state.products.map((p) => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
        })),
        sales: state.sales.map((s) => ({
          ...s,
          date: s.date instanceof Date ? s.date.toISOString() : s.date,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
          updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
        })),
        suppliers: state.suppliers.map((s) => ({
          ...s,
          lastPurchaseDate: s.lastPurchaseDate instanceof Date ? s.lastPurchaseDate.toISOString() : s.lastPurchaseDate,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
          updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
        })),
        incomeType: state.incomeType,
        businessSetupComplete: state.businessSetupComplete,
        businessTransactions: state.businessTransactions.map((t) => ({
          ...t,
          date: t.date instanceof Date ? t.date.toISOString() : t.date,
        })),
        clients: state.clients.map((c) => ({
          ...c,
          lastPaid: c.lastPaid instanceof Date ? c.lastPaid.toISOString() : c.lastPaid,
          paymentHistory: c.paymentHistory.map((p) => ({
            ...p,
            date: p.date instanceof Date ? p.date.toISOString() : p.date,
          })),
        })),
        riderCosts: state.riderCosts.map((r) => ({
          ...r,
          date: r.date instanceof Date ? r.date.toISOString() : r.date,
        })),
        incomeStreams: state.incomeStreams,
        transfers: state.transfers.map((t) => ({
          ...t,
          date: t.date instanceof Date ? t.date.toISOString() : t.date,
        })),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          state.products = state.products.map((p: any) => ({
            ...p,
            createdAt: sd(p.createdAt),
            updatedAt: sd(p.updatedAt),
          }));
          state.sales = state.sales.map((s: any) => ({
            ...s,
            date: sd(s.date),
            createdAt: sd(s.createdAt),
            updatedAt: sd(s.updatedAt),
          }));
          state.suppliers = state.suppliers.map((s: any) => ({
            ...s,
            lastPurchaseDate: s.lastPurchaseDate ? sd(s.lastPurchaseDate) : undefined,
            createdAt: sd(s.createdAt),
            updatedAt: sd(s.updatedAt),
          }));
          state.businessTransactions = (state.businessTransactions || []).map((t: any) => ({
            ...t,
            date: sd(t.date),
          }));
          state.clients = (state.clients || []).map((c: any) => ({
            ...c,
            lastPaid: c.lastPaid ? sd(c.lastPaid) : undefined,
            paymentHistory: (c.paymentHistory || []).map((p: any) => ({
              ...p,
              date: sd(p.date),
            })),
          }));
          state.riderCosts = (state.riderCosts || []).map((r: any) => ({
            ...r,
            date: sd(r.date),
          }));
          state.transfers = (state.transfers || []).map((t: any) => ({
            ...t,
            date: sd(t.date),
          }));
        }
      },
    }
  )
);
