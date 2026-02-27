import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StallState,
  StallSession,
  StallSale,
  StallProduct,
  RegularCustomer,
  SessionCondition,
} from '../types';

export const useStallStore = create<StallState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      products: [],
      regularCustomers: [],

      // ─── Session Actions ──────────────────────────────────
      startSession: (name?, productSetup?) => {
        const id = Date.now().toString();
        const products = get().products.filter((p) => p.isActive);
        const snapshot = productSetup
          ? productSetup.map((ps) => {
              const product = products.find((p) => p.id === ps.productId);
              return {
                productId: ps.productId,
                productName: product?.name || '',
                startQty: ps.startQty,
                remainingQty: ps.startQty,
              };
            })
          : products.map((p) => ({
              productId: p.id,
              productName: p.name,
              startQty: 0,
              remainingQty: 0,
            }));

        const session: StallSession = {
          id,
          name,
          startedAt: new Date(),
          isActive: true,
          sales: [],
          productsSnapshot: snapshot,
          totalRevenue: 0,
          totalCash: 0,
          totalQR: 0,
        };

        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: id,
        }));

        return id;
      },

      closeSession: (condition?, note?) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId
              ? { ...s, isActive: false, closedAt: new Date(), condition, note }
              : s
          ),
          activeSessionId: null,
        }));
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        if (!activeSessionId) return null;
        return sessions.find((s) => s.id === activeSessionId) || null;
      },

      // ─── Sale Actions ─────────────────────────────────────
      addSale: (sale) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;

        const newSale: StallSale = {
          ...sale,
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          sessionId: activeId,
          timestamp: new Date(),
        };

        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== activeId) return s;
            const updatedSales = [...s.sales, newSale];
            const updatedSnapshot = s.productsSnapshot.map((ps) =>
              ps.productId === sale.productId
                ? { ...ps, remainingQty: Math.max(0, ps.remainingQty - sale.quantity) }
                : ps
            );
            return {
              ...s,
              sales: updatedSales,
              productsSnapshot: updatedSnapshot,
              totalRevenue: s.totalRevenue + newSale.total,
              totalCash: sale.paymentMethod === 'cash' ? s.totalCash + newSale.total : s.totalCash,
              totalQR: sale.paymentMethod === 'qr' ? s.totalQR + newSale.total : s.totalQR,
            };
          }),
          // Update product totalSold
          products: state.products.map((p) =>
            p.id === sale.productId
              ? { ...p, totalSold: p.totalSold + sale.quantity, updatedAt: new Date() }
              : p
          ),
        }));

        // Record visit if linked to a regular customer
        if (sale.regularCustomerId) {
          get().recordVisit(sale.regularCustomerId);
        }
      },

      removeSale: (saleId) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;

        set((state) => {
          const session = state.sessions.find((s) => s.id === activeId);
          if (!session) return state;

          const sale = session.sales.find((s) => s.id === saleId);
          if (!sale) return state;

          return {
            sessions: state.sessions.map((s) => {
              if (s.id !== activeId) return s;
              const updatedSales = s.sales.filter((sl) => sl.id !== saleId);
              const updatedSnapshot = s.productsSnapshot.map((ps) =>
                ps.productId === sale.productId
                  ? { ...ps, remainingQty: ps.remainingQty + sale.quantity }
                  : ps
              );
              return {
                ...s,
                sales: updatedSales,
                productsSnapshot: updatedSnapshot,
                totalRevenue: s.totalRevenue - sale.total,
                totalCash: sale.paymentMethod === 'cash' ? s.totalCash - sale.total : s.totalCash,
                totalQR: sale.paymentMethod === 'qr' ? s.totalQR - sale.total : s.totalQR,
              };
            }),
            products: state.products.map((p) =>
              p.id === sale.productId
                ? { ...p, totalSold: Math.max(0, p.totalSold - sale.quantity), updatedAt: new Date() }
                : p
            ),
          };
        });
      },

      // ─── Product Actions ──────────────────────────────────
      addProduct: (product) =>
        set((state) => ({
          products: [
            {
              ...product,
              id: Date.now().toString(),
              totalSold: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.products,
          ],
        })),

      updateProduct: (id, updates) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
        })),

      deleteProduct: (id) =>
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        })),

      // ─── Regular Customer Actions ─────────────────────────
      addRegularCustomer: (customer) =>
        set((state) => ({
          regularCustomers: [
            {
              ...customer,
              id: Date.now().toString(),
              visitCount: 0,
              createdAt: new Date(),
            },
            ...state.regularCustomers,
          ],
        })),

      updateRegularCustomer: (id, updates) =>
        set((state) => ({
          regularCustomers: state.regularCustomers.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteRegularCustomer: (id) =>
        set((state) => ({
          regularCustomers: state.regularCustomers.filter((c) => c.id !== id),
        })),

      recordVisit: (customerId) =>
        set((state) => ({
          regularCustomers: state.regularCustomers.map((c) =>
            c.id === customerId
              ? { ...c, visitCount: c.visitCount + 1, lastVisit: new Date() }
              : c
          ),
        })),

      // ─── Derived Data ─────────────────────────────────────
      getSessionSummary: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) {
          return {
            totalRevenue: 0,
            totalCash: 0,
            totalQR: 0,
            saleCount: 0,
            productBreakdown: [],
            avgSaleValue: 0,
            duration: 0,
          };
        }

        const breakdown: Record<string, { productName: string; qtySold: number; revenue: number }> = {};
        session.sales.forEach((sale) => {
          if (!breakdown[sale.productId]) {
            breakdown[sale.productId] = { productName: sale.productName, qtySold: 0, revenue: 0 };
          }
          breakdown[sale.productId].qtySold += sale.quantity;
          breakdown[sale.productId].revenue += sale.total;
        });

        const end = session.closedAt || new Date();
        const duration = Math.round((end.getTime() - session.startedAt.getTime()) / 60000);

        return {
          totalRevenue: session.totalRevenue,
          totalCash: session.totalCash,
          totalQR: session.totalQR,
          saleCount: session.sales.length,
          productBreakdown: Object.values(breakdown).sort((a, b) => b.revenue - a.revenue),
          avgSaleValue: session.sales.length > 0 ? session.totalRevenue / session.sales.length : 0,
          duration,
        };
      },

      getProductPerformance: (productId) => {
        const sessions = get().sessions.filter((s) => !s.isActive);
        let totalSold = 0;
        let totalRevenue = 0;
        let sessionsAppeared = 0;

        sessions.forEach((session) => {
          const productSales = session.sales.filter((s) => s.productId === productId);
          if (productSales.length > 0) {
            sessionsAppeared++;
            productSales.forEach((s) => {
              totalSold += s.quantity;
              totalRevenue += s.total;
            });
          }
        });

        return {
          totalSold,
          totalRevenue,
          sessionsAppeared,
          avgPerSession: sessionsAppeared > 0 ? totalSold / sessionsAppeared : 0,
        };
      },

      getLifetimeStats: () => {
        const sessions = get().sessions.filter((s) => !s.isActive);
        const totalRevenue = sessions.reduce((sum, s) => sum + s.totalRevenue, 0);
        const bestSession = sessions.length > 0
          ? sessions.reduce((best, s) => (s.totalRevenue > best.totalRevenue ? s : best), sessions[0])
          : null;

        return {
          totalSessions: sessions.length,
          totalRevenue,
          avgPerSession: sessions.length > 0 ? totalRevenue / sessions.length : 0,
          bestSession,
        };
      },

      // ─── Transfer Bridge ──────────────────────────────────
      markSessionTransferred: (sessionId, amount) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, transferredToPersonal: true, transferAmount: amount }
              : s
          ),
        })),
    }),
    {
      name: 'stall-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({
          ...s,
          startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
          closedAt: s.closedAt instanceof Date ? s.closedAt.toISOString() : s.closedAt,
          sales: s.sales.map((sl) => ({
            ...sl,
            timestamp: sl.timestamp instanceof Date ? sl.timestamp.toISOString() : sl.timestamp,
          })),
        })),
        activeSessionId: state.activeSessionId,
        products: state.products.map((p) => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
        })),
        regularCustomers: state.regularCustomers.map((c) => ({
          ...c,
          lastVisit: c.lastVisit instanceof Date ? c.lastVisit.toISOString() : c.lastVisit,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
        })),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.sessions = state.sessions.map((s: any) => ({
            ...s,
            startedAt: new Date(s.startedAt),
            closedAt: s.closedAt ? new Date(s.closedAt) : undefined,
            sales: s.sales.map((sl: any) => ({
              ...sl,
              timestamp: new Date(sl.timestamp),
            })),
          }));
          state.products = state.products.map((p: any) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          }));
          state.regularCustomers = state.regularCustomers.map((c: any) => ({
            ...c,
            lastVisit: c.lastVisit ? new Date(c.lastVisit) : undefined,
            createdAt: new Date(c.createdAt),
          }));
        }
      },
    }
  )
);
