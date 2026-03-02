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
      customUnits: [],
      hiddenUnits: [],
      unitOrder: [],

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

      markOrdersTransferred: (ids, transferId) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            ids.includes(o.id)
              ? { ...o, transferredToPersonal: true, transferId, updatedAt: new Date() }
              : o
          ),
        })),

      unmarkOrdersTransferred: (transferId) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.transferId === transferId
              ? { ...o, transferredToPersonal: false, transferId: undefined, updatedAt: new Date() }
              : o
          ),
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

      updateSeasonBudget: (seasonId, budget) =>
        set((state) => ({
          seasons: state.seasons.map((s) =>
            s.id === seasonId ? { ...s, costBudget: budget } : s
          ),
        })),

      // ─── Ingredient Costs ──────────────────────────────
      addIngredientCost: (cost) => {
        const id = Date.now().toString();
        set((state) => ({
          ingredientCosts: [
            { ...cost, id },
            ...state.ingredientCosts,
          ],
        }));
        return id;
      },

      updateIngredientCost: (id, updates) =>
        set((state) => ({
          ingredientCosts: state.ingredientCosts.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteIngredientCost: (id) =>
        set((state) => ({
          ingredientCosts: state.ingredientCosts.filter((c) => c.id !== id),
        })),

      markCostSynced: (id, personalTransactionId) =>
        set((state) => ({
          ingredientCosts: state.ingredientCosts.map((c) =>
            c.id === id
              ? { ...c, syncedToPersonal: true, personalTransactionId }
              : c
          ),
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

      // ─── Custom Units ─────────────────────────────────
      addCustomUnit: (unit) =>
        set((state) => {
          const normalized = unit.trim().toLowerCase();
          if (!normalized || state.customUnits.includes(normalized)) return state;
          return { customUnits: [...state.customUnits, normalized] };
        }),

      deleteCustomUnit: (unit) =>
        set((state) => ({
          customUnits: state.customUnits.filter((u) => u !== unit),
          unitOrder: state.unitOrder.filter((u) => u !== unit),
        })),

      renameCustomUnit: (oldName, newName) =>
        set((state) => {
          const normalized = newName.trim().toLowerCase();
          if (!normalized || normalized === oldName) return state;
          return {
            customUnits: state.customUnits.map((u) => (u === oldName ? normalized : u)),
            unitOrder: state.unitOrder.map((u) => (u === oldName ? normalized : u)),
          };
        }),

      hideUnit: (unit) =>
        set((state) => ({
          hiddenUnits: state.hiddenUnits.includes(unit)
            ? state.hiddenUnits
            : [...state.hiddenUnits, unit],
          unitOrder: state.unitOrder.filter((u) => u !== unit),
        })),
      unhideUnit: (unit) =>
        set((state) => ({
          hiddenUnits: state.hiddenUnits.filter((u) => u !== unit),
        })),

      setUnitOrder: (order) => set({ unitOrder: order }),

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
        customUnits: state.customUnits,
        hiddenUnits: state.hiddenUnits,
        unitOrder: state.unitOrder,
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
          state.customUnits = state.customUnits || [];
          state.hiddenUnits = state.hiddenUnits || [];
          state.unitOrder = state.unitOrder || [];
        }
      },
    }
  )
);
