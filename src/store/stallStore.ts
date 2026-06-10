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
import { newId } from '../utils/id';
import { roundMoney } from '../utils/money';

/** Round to the nearest 5 sen (Malaysian cash rounding). */
const roundTo5 = (n: number) => Math.round(n * 20) / 20;

/** Round a sale total: 5-sen for cash when the setting is on, else 2-dp.
 *  Card charges to the exact sen (Stripe), so only cash is ever 5-sen rounded. */
const roundCash = (amount: number, method: 'cash' | 'qr' | 'card', roundCashTo5: boolean) =>
  method === 'cash' && roundCashTo5 ? roundTo5(amount) : roundMoney(amount);

export const useStallStore = create<StallState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      products: [],
      regularCustomers: [],
      loyalty: { everyN: 0, reward: '' },
      preOrders: [],
      roundCashTo5: false,

      // ─── Session Actions ──────────────────────────────────
      startSession: (name?, productSetup?) => {
        const id = newId();
        const prevActiveId = get().activeSessionId;
        if (prevActiveId) {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === prevActiveId
                ? { ...s, isActive: false, closedAt: new Date() }
                : s
            ),
          }));
        }
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
          totalCard: 0,
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
          sessions: state.sessions.map((s) => {
            if (s.id !== activeId) return s;
            // If closing while paused, fold the final pause span into the accumulator.
            let pausedAccumMs = s.pausedAccumMs || 0;
            if (s.paused && s.lastPausedAt) {
              pausedAccumMs += Math.max(0, Date.now() - new Date(s.lastPausedAt).getTime());
            }
            return {
              ...s,
              isActive: false,
              paused: false,
              lastPausedAt: undefined,
              pausedAccumMs,
              closedAt: new Date(),
              condition,
              note,
            };
          }),
          activeSessionId: null,
        }));
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        if (!activeSessionId) return null;
        return sessions.find((s) => s.id === activeSessionId) || null;
      },

      setSessionDefaultPayment: (method) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId ? { ...s, defaultPayment: method } : s
          ),
        }));
      },

      pauseSession: () => {
        const activeId = get().activeSessionId;
        if (!activeId) return;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId && !s.paused ? { ...s, paused: true, lastPausedAt: new Date() } : s
          ),
        }));
      },

      resumeSession: () => {
        const activeId = get().activeSessionId;
        if (!activeId) return;
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== activeId || !s.paused) return s;
            const from = s.lastPausedAt ? new Date(s.lastPausedAt).getTime() : Date.now();
            const accum = (s.pausedAccumMs || 0) + Math.max(0, Date.now() - from);
            return { ...s, paused: false, lastPausedAt: undefined, pausedAccumMs: accum };
          }),
        }));
      },

      setClearance: (percent) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId ? { ...s, clearancePercent: clamped } : s
          ),
        }));
      },

      setRoundCashTo5: (on) => set(() => ({ roundCashTo5: on })),

      getLastSetup: () => {
        const closed = get().sessions.filter((s) => !s.isActive && s.closedAt);
        if (closed.length === 0) return null;
        const last = closed.reduce((a, b) => {
          const ad = a.closedAt ? new Date(a.closedAt).getTime() : 0;
          const bd = b.closedAt ? new Date(b.closedAt).getTime() : 0;
          return bd > ad ? b : a;
        });
        const activeIds = new Set(get().products.filter((p) => p.isActive).map((p) => p.id));
        const setup = last.productsSnapshot
          .filter((ps) => activeIds.has(ps.productId) && ps.startQty > 0)
          .map((ps) => ({ productId: ps.productId, startQty: ps.startQty }));
        return setup.length > 0 ? setup : null;
      },

      // ─── Optional cashbox layer (Phase 2) ─────────────────
      setStartingFloat: (amount) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId ? { ...s, startingFloat: amount } : s
          ),
        }));
      },

      setCountedCash: (amount) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId ? { ...s, countedCash: amount } : s
          ),
        }));
      },

      addExpense: ({ label, amount }) => {
        const activeId = get().activeSessionId;
        if (!activeId || !amount || amount <= 0) return;
        const expense = {
          id: newId(),
          label: label.trim() || 'cost',
          amount: roundMoney(amount),
          timestamp: new Date(),
        };
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId ? { ...s, expenses: [...(s.expenses || []), expense] } : s
          ),
        }));
      },

      removeExpense: (expenseId) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId
              ? { ...s, expenses: (s.expenses || []).filter((e) => e.id !== expenseId) }
              : s
          ),
        }));
      },

      // ─── Sale Actions ─────────────────────────────────────
      addSale: (sale) => {
        const activeId = get().activeSessionId;
        if (!activeId) return;

        const product = get().products.find((p) => p.id === sale.productId);
        if (!product) {
          console.warn(`[stallStore] addSale: productId ${sale.productId} not found, skipping`);
          return;
        }

        const total = roundCash(sale.total, sale.paymentMethod, get().roundCashTo5);
        const newSale: StallSale = {
          ...sale,
          id: newId(),
          productName: sale.productName || product.name,
          sessionId: activeId,
          total,
          costPerUnit: product.unitCost,
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
              totalRevenue: roundMoney(s.totalRevenue + newSale.total),
              totalCash: sale.paymentMethod === 'cash' ? roundMoney(s.totalCash + newSale.total) : s.totalCash,
              totalQR: sale.paymentMethod === 'qr' ? roundMoney(s.totalQR + newSale.total) : s.totalQR,
              totalCard: sale.paymentMethod === 'card' ? roundMoney((s.totalCard || 0) + newSale.total) : (s.totalCard || 0),
            };
          }),
          // Update product totalSold
          products: state.products.map((p) =>
            p.id === sale.productId
              ? { ...p, totalSold: p.totalSold + sale.quantity, updatedAt: new Date() }
              : p
          ),
        }));

        // Visit recording is owned by the Sell screen (one visit per serving,
        // not per item), so addSale no longer auto-increments visitCount.

        return newSale.id;
      },

      // One-tap sale: 1 unit at the session default payment method.
      quickSale: (productId, regularCustomerId) => {
        const session = get().getActiveSession();
        if (!session) return undefined;
        const product = get().products.find((p) => p.id === productId);
        if (!product) return undefined;

        // Respect stock: don't sell a counted product that's already sold out.
        const snap = session.productsSnapshot.find((ps) => ps.productId === productId);
        if (snap && snap.startQty > 0 && snap.remainingQty <= 0) return undefined;

        const method = session.defaultPayment || 'cash';
        const clearance = session.clearancePercent || 0;
        const unit = clearance > 0 ? roundMoney(product.price * (1 - clearance / 100)) : product.price;
        return get().addSale({
          productId,
          productName: product.name,
          quantity: 1,
          unitPrice: unit,
          total: unit,
          paymentMethod: method,
          regularCustomerId,
        });
      },

      // Off-menu sale: a typed amount, no product, no stock decrement.
      addCustomSale: ({ amount, paymentMethod, label, regularCustomerId, pspTransactionId }) => {
        const activeId = get().activeSessionId;
        if (!activeId || !amount || amount <= 0) return undefined;

        const total = roundCash(amount, paymentMethod, get().roundCashTo5);
        const trimmed = label?.trim();
        const newSale: StallSale = {
          id: newId(),
          sessionId: activeId,
          productId: trimmed ? `custom:${trimmed.toLowerCase()}` : 'custom',
          productName: trimmed || 'custom',
          quantity: 1,
          unitPrice: total,
          total,
          paymentMethod,
          isCustom: true,
          label: trimmed,
          regularCustomerId,
          ...(pspTransactionId ? { pspTransactionId, paymentProvider: 'stripe' as const } : {}),
          timestamp: new Date(),
        };

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeId
              ? {
                  ...s,
                  sales: [...s.sales, newSale],
                  totalRevenue: roundMoney(s.totalRevenue + total),
                  totalCash: paymentMethod === 'cash' ? roundMoney(s.totalCash + total) : s.totalCash,
                  totalQR: paymentMethod === 'qr' ? roundMoney(s.totalQR + total) : s.totalQR,
                  totalCard: paymentMethod === 'card' ? roundMoney((s.totalCard || 0) + total) : (s.totalCard || 0),
                }
              : s
          ),
        }));

        return newSale.id;
      },

      // Edit an existing sale in the active session (quantity and/or payment method).
      updateSale: (saleId, updates) =>
        set((state) => {
          const activeId = state.activeSessionId;
          if (!activeId) return state;
          const session = state.sessions.find((s) => s.id === activeId);
          if (!session) return state;
          const sale = session.sales.find((sl) => sl.id === saleId);
          if (!sale) return state;

          const newQty = updates.quantity != null ? Math.max(1, Math.round(updates.quantity)) : sale.quantity;
          const newMethod = updates.paymentMethod ?? sale.paymentMethod;
          // Preserve per-unit value (keeps any discount applied at checkout). Custom sales keep their total.
          const perUnit = sale.quantity > 0 ? sale.total / sale.quantity : sale.unitPrice;
          const newTotal = sale.isCustom ? sale.total : roundCash(perUnit * newQty, newMethod, state.roundCashTo5);
          const newUnitPrice = sale.isCustom ? sale.unitPrice : roundMoney(perUnit);
          const qtyDelta = newQty - sale.quantity;
          const totalDelta = newTotal - sale.total;

          // Rebuild cash/QR/card splits: remove the old contribution, add the new.
          let totalCash = session.totalCash;
          let totalQR = session.totalQR;
          let totalCard = session.totalCard || 0;
          const apply = (m: 'cash' | 'qr' | 'card', amt: number) => {
            if (m === 'cash') totalCash += amt; else if (m === 'qr') totalQR += amt; else totalCard += amt;
          };
          apply(sale.paymentMethod, -sale.total);
          apply(newMethod, newTotal);

          return {
            sessions: state.sessions.map((s) => {
              if (s.id !== activeId) return s;
              return {
                ...s,
                sales: s.sales.map((sl) =>
                  sl.id === saleId ? { ...sl, quantity: newQty, total: newTotal, unitPrice: newUnitPrice, paymentMethod: newMethod } : sl
                ),
                productsSnapshot: sale.isCustom
                  ? s.productsSnapshot
                  : s.productsSnapshot.map((ps) =>
                      ps.productId === sale.productId
                        ? { ...ps, remainingQty: Math.max(0, ps.remainingQty - qtyDelta) }
                        : ps
                    ),
                totalRevenue: roundMoney(s.totalRevenue + totalDelta),
                totalCash: roundMoney(totalCash),
                totalQR: roundMoney(totalQR),
                totalCard: roundMoney(totalCard),
              };
            }),
            products: sale.isCustom
              ? state.products
              : state.products.map((p) =>
                  p.id === sale.productId
                    ? { ...p, totalSold: Math.max(0, p.totalSold + qtyDelta), updatedAt: new Date() }
                    : p
                ),
          };
        }),

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
                totalRevenue: roundMoney(s.totalRevenue - sale.total),
                totalCash: sale.paymentMethod === 'cash' ? roundMoney(s.totalCash - sale.total) : s.totalCash,
                totalQR: sale.paymentMethod === 'qr' ? roundMoney(s.totalQR - sale.total) : s.totalQR,
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
              id: newId(),
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

      // Add stock back to a product mid-session (clears "sold out").
      restockProduct: (productId, addQty) => {
        const activeId = get().activeSessionId;
        if (!activeId || addQty <= 0) return;
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== activeId) return s;
            let found = false;
            const snap = s.productsSnapshot.map((ps) => {
              if (ps.productId === productId) {
                found = true;
                return { ...ps, startQty: ps.startQty + addQty, remainingQty: ps.remainingQty + addQty };
              }
              return ps;
            });
            if (!found) {
              const product = state.products.find((p) => p.id === productId);
              snap.push({ productId, productName: product?.name || '', startQty: addQty, remainingQty: addQty });
            }
            return { ...s, productsSnapshot: snap };
          }),
        }));
      },

      // ─── Regular Customer Actions ─────────────────────────
      addRegularCustomer: (customer) =>
        set((state) => ({
          regularCustomers: [
            {
              ...customer,
              id: newId(),
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

      setLoyalty: (loyalty) =>
        set(() => ({ loyalty: { everyN: Math.max(0, Math.round(loyalty.everyN)), reward: loyalty.reward.trim() } })),

      // ─── Pre-orders ───────────────────────────────────────
      addPreOrder: (preOrder) =>
        set((state) => ({
          preOrders: [
            { ...preOrder, id: newId(), status: 'pending' as const, createdAt: new Date() },
            ...state.preOrders,
          ],
        })),

      updatePreOrder: (id, updates) =>
        set((state) => ({
          preOrders: state.preOrders.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      deletePreOrder: (id) =>
        set((state) => ({
          preOrders: state.preOrders.filter((p) => p.id !== id),
        })),

      collectPreOrder: (id) => {
        const state = get();
        const activeId = state.activeSessionId;
        if (!activeId) return false;
        const po = state.preOrders.find((p) => p.id === id);
        if (!po || po.status !== 'pending') return false;
        const method = po.paymentMethod || state.getActiveSession()?.defaultPayment || 'cash';

        po.items.forEach((item) => {
          const product = item.productId ? get().products.find((p) => p.id === item.productId) : null;
          const lineTotal = roundMoney(item.unitPrice * item.quantity);
          if (product) {
            get().addSale({
              productId: product.id,
              productName: product.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: lineTotal,
              paymentMethod: method,
              regularCustomerId: po.regularCustomerId,
            });
          } else {
            get().addCustomSale({
              amount: lineTotal,
              paymentMethod: method,
              label: item.name,
              regularCustomerId: po.regularCustomerId,
            });
          }
        });

        if (po.regularCustomerId) get().recordVisit(po.regularCustomerId);

        set((s) => ({
          preOrders: s.preOrders.map((p) =>
            p.id === id
              ? { ...p, status: 'collected' as const, collectedAt: new Date(), collectedSessionId: activeId }
              : p
          ),
        }));
        return true;
      },

      getPreOrderStock: () => {
        const map: Record<string, number> = {};
        get().preOrders
          .filter((p) => p.status === 'pending')
          .forEach((p) => {
            p.items.forEach((item) => {
              if (item.productId) map[item.productId] = (map[item.productId] || 0) + item.quantity;
            });
          });
        return map;
      },

      // ─── Derived Data ─────────────────────────────────────
      getSessionSummary: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) {
          return {
            totalRevenue: 0,
            totalCash: 0,
            totalQR: 0,
            totalCard: 0,
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
        let pausedMs = session.pausedAccumMs || 0;
        if (session.paused && session.lastPausedAt) {
          pausedMs += Math.max(0, end.getTime() - new Date(session.lastPausedAt).getTime());
        }
        const duration = Math.max(0, Math.round((end.getTime() - session.startedAt.getTime() - pausedMs) / 60000));

        return {
          totalRevenue: session.totalRevenue,
          totalCash: session.totalCash,
          totalQR: session.totalQR,
          totalCard: session.totalCard || 0,
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

      getSessionEconomics: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) {
          return {
            revenue: 0, cogs: 0, expensesTotal: 0, spent: 0, kept: 0, hasCosts: false,
            startingFloat: 0, expectedCash: 0, countedCash: null, cashDifference: null, hasCounted: false,
          };
        }
        const cogs = roundMoney(
          session.sales.reduce((sum, s) => sum + (s.costPerUnit ? s.costPerUnit * s.quantity : 0), 0)
        );
        const expensesTotal = roundMoney((session.expenses || []).reduce((sum, e) => sum + e.amount, 0));
        const spent = roundMoney(cogs + expensesTotal);
        const kept = roundMoney(session.totalRevenue - spent);
        const startingFloat = session.startingFloat || 0;
        const expectedCash = roundMoney(startingFloat + session.totalCash);
        const hasCounted = session.countedCash != null;
        const countedCash = hasCounted ? (session.countedCash as number) : null;
        const cashDifference = hasCounted ? roundMoney((session.countedCash as number) - expectedCash) : null;
        return {
          revenue: session.totalRevenue,
          cogs,
          expensesTotal,
          spent,
          kept,
          hasCosts: spent > 0,
          startingFloat,
          expectedCash,
          countedCash,
          cashDifference,
          hasCounted,
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
          lastPausedAt: s.lastPausedAt instanceof Date ? s.lastPausedAt.toISOString() : s.lastPausedAt,
          sales: s.sales.map((sl) => ({
            ...sl,
            timestamp: sl.timestamp instanceof Date ? sl.timestamp.toISOString() : sl.timestamp,
          })),
          expenses: s.expenses
            ? s.expenses.map((e) => ({
                ...e,
                timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
              }))
            : undefined,
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
        loyalty: state.loyalty,
        preOrders: state.preOrders.map((p) => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          collectedAt: p.collectedAt instanceof Date ? p.collectedAt.toISOString() : p.collectedAt,
        })),
        roundCashTo5: state.roundCashTo5,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          state.sessions = state.sessions.map((s: any) => ({
            ...s,
            startedAt: sd(s.startedAt),
            closedAt: s.closedAt ? sd(s.closedAt) : undefined,
            lastPausedAt: s.lastPausedAt ? sd(s.lastPausedAt) : undefined,
            sales: s.sales.map((sl: any) => ({
              ...sl,
              timestamp: sd(sl.timestamp),
            })),
            expenses: s.expenses
              ? s.expenses.map((e: any) => ({ ...e, timestamp: sd(e.timestamp) }))
              : undefined,
          }));
          state.preOrders = (state.preOrders || []).map((p: any) => ({
            ...p,
            createdAt: sd(p.createdAt),
            collectedAt: p.collectedAt ? sd(p.collectedAt) : undefined,
          }));
          state.products = state.products.map((p: any) => ({
            ...p,
            createdAt: sd(p.createdAt),
            updatedAt: sd(p.updatedAt),
          }));
          state.regularCustomers = state.regularCustomers.map((c: any) => ({
            ...c,
            lastVisit: c.lastVisit ? sd(c.lastVisit) : undefined,
            createdAt: sd(c.createdAt),
          }));
        }
      },
    }
  )
);
