import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SellerState, OrderStatus } from '../types';

export const useSellerStore = create<SellerState>()(
  persist(
    (set, get) => ({
      products: [],
      orders: [],
      seasons: [],
      ingredientCosts: [],
      sellerCustomers: [],

      // ─── Products ───────────────────────────────────────
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

      // ─── Orders ─────────────────────────────────────────
      addOrder: (order) =>
        set((state) => {
          const updatedProducts = state.products.map((p) => {
            const orderItem = order.items.find((i) => i.productId === p.id);
            if (orderItem) {
              return {
                ...p,
                totalSold: p.totalSold + orderItem.quantity,
                updatedAt: new Date(),
              };
            }
            return p;
          });

          return {
            orders: [
              {
                ...order,
                id: Date.now().toString(),
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              ...state.orders,
            ],
            products: updatedProducts,
          };
        }),

      updateOrderStatus: (id, status) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === id ? { ...o, status, isPaid: status === 'paid', updatedAt: new Date() } : o
          ),
        })),

      updateOrder: (id, updates) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === id ? { ...o, ...updates, updatedAt: new Date() } : o
          ),
        })),

      markOrderPaid: (id) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === id ? { ...o, isPaid: true, status: 'paid' as OrderStatus, updatedAt: new Date() } : o
          ),
        })),

      markOrdersPaid: (ids) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            ids.includes(o.id) ? { ...o, isPaid: true, status: 'paid' as OrderStatus, updatedAt: new Date() } : o
          ),
        })),

      deleteOrder: (id) =>
        set((state) => ({
          orders: state.orders.filter((o) => o.id !== id),
        })),

      // ─── Seasons ────────────────────────────────────────
      addSeason: (season) =>
        set((state) => ({
          seasons: [
            {
              ...season,
              id: Date.now().toString(),
              createdAt: new Date(),
            },
            ...state.seasons,
          ],
        })),

      endSeason: (id) =>
        set((state) => ({
          seasons: state.seasons.map((s) =>
            s.id === id ? { ...s, isActive: false, endDate: new Date() } : s
          ),
        })),

      getActiveSeason: () => {
        const state = get();
        return state.seasons.find((s) => s.isActive) || null;
      },

      // ─── Ingredient Costs ──────────────────────────────
      addIngredientCost: (cost) =>
        set((state) => ({
          ingredientCosts: [
            { ...cost, id: Date.now().toString() },
            ...state.ingredientCosts,
          ],
        })),

      deleteIngredientCost: (id) =>
        set((state) => ({
          ingredientCosts: state.ingredientCosts.filter((c) => c.id !== id),
        })),

      // ─── Seller Customers ────────────────────────────────
      addSellerCustomer: (customer) =>
        set((state) => ({
          sellerCustomers: [
            { ...customer, id: Date.now().toString(), createdAt: new Date() },
            ...state.sellerCustomers,
          ],
        })),

      updateSellerCustomer: (id, updates) =>
        set((state) => ({
          sellerCustomers: state.sellerCustomers.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteSellerCustomer: (id) =>
        set((state) => ({
          sellerCustomers: state.sellerCustomers.filter((c) => c.id !== id),
        })),

      // ─── Derived Data ──────────────────────────────────
      getSeasonOrders: (seasonId) => {
        return get().orders.filter((o) => o.seasonId === seasonId);
      },

      getSeasonCosts: (seasonId) => {
        return get().ingredientCosts.filter((c) => c.seasonId === seasonId);
      },

      getSeasonStats: (seasonId) => {
        const state = get();
        const orders = state.orders.filter((o) => o.seasonId === seasonId);
        const costs = state.ingredientCosts.filter((c) => c.seasonId === seasonId);
        const totalIncome = orders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
        const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
        const unpaid = orders.filter((o) => !o.isPaid);

        return {
          totalOrders: orders.length,
          totalIncome,
          totalCosts,
          kept: totalIncome - totalCosts,
          unpaidCount: unpaid.length,
          unpaidAmount: unpaid.reduce((s, o) => s + o.totalAmount, 0),
        };
      },
    }),
    {
      name: 'seller-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        products: state.products.map((p) => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
        })),
        orders: state.orders.map((o) => ({
          ...o,
          date: o.date instanceof Date ? o.date.toISOString() : o.date,
          deliveryDate: o.deliveryDate instanceof Date ? o.deliveryDate.toISOString() : o.deliveryDate,
          createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
          updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
        })),
        seasons: state.seasons.map((s) => ({
          ...s,
          startDate: s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate,
          endDate: s.endDate instanceof Date ? s.endDate.toISOString() : s.endDate,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
        })),
        ingredientCosts: state.ingredientCosts.map((c) => ({
          ...c,
          date: c.date instanceof Date ? c.date.toISOString() : c.date,
        })),
        sellerCustomers: state.sellerCustomers.map((c) => ({
          ...c,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
        })),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.products = state.products.map((p: any) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          }));
          state.orders = state.orders.map((o: any) => ({
            ...o,
            date: new Date(o.date),
            deliveryDate: o.deliveryDate ? new Date(o.deliveryDate) : undefined,
            createdAt: new Date(o.createdAt),
            updatedAt: new Date(o.updatedAt),
          }));
          state.seasons = state.seasons.map((s: any) => ({
            ...s,
            startDate: new Date(s.startDate),
            endDate: s.endDate ? new Date(s.endDate) : undefined,
            createdAt: new Date(s.createdAt),
          }));
          state.ingredientCosts = state.ingredientCosts.map((c: any) => ({
            ...c,
            date: new Date(c.date),
          }));
          state.sellerCustomers = (state.sellerCustomers || []).map((c: any) => ({
            ...c,
            createdAt: new Date(c.createdAt),
          }));
        }
      },
    }
  )
);
