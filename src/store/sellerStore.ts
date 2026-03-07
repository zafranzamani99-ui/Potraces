import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SellerState, OrderStatus, SellerOrder, SellerOrderItem, SellerPaymentMethod, RecurringFrequency } from '../types';

// Generate a unique 5-char order code: 2 random uppercase letters + 3 random digits
function generateOrderCode(existingOrders: SellerOrder[]): string {
  const existing = new Set(existingOrders.map((o) => o.orderNumber).filter(Boolean));
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // exclude I, L, O (ambiguous)
  const digits = '0123456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = letters[Math.floor(Math.random() * letters.length)];
    const b = letters[Math.floor(Math.random() * letters.length)];
    const d1 = digits[Math.floor(Math.random() * digits.length)];
    const d2 = digits[Math.floor(Math.random() * digits.length)];
    const d3 = digits[Math.floor(Math.random() * digits.length)];
    const code = `${a}${b}${d1}${d2}${d3}`;
    if (!existing.has(code)) return code;
  }
  // Fallback: timestamp-based (virtually impossible to reach)
  return `ZZ${Date.now().toString().slice(-3)}`;
}

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
      costTemplates: [],
      recurringCosts: [],
      productOrder: [],
      seenOnlineOrderIds: [],

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
              const updates: any = {
                ...p,
                totalSold: p.totalSold + orderItem.quantity,
                updatedAt: new Date(),
              };
              if (p.trackStock && p.stockQuantity != null) {
                updates.stockQuantity = Math.max(0, p.stockQuantity - orderItem.quantity);
              }
              return updates;
            }
            return p;
          });

          return {
            orders: [
              {
                ...order,
                id: Date.now().toString(),
                orderNumber: generateOrderCode(state.orders),
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
            o.id === id ? { ...o, status, updatedAt: new Date() } : o
          ),
        })),

      updateOrder: (id, updates) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === id ? { ...o, ...updates, updatedAt: new Date() } : o
          ),
        })),

      updateDeposit: (id, index, amount, method) =>
        set((state) => ({
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            const deposits = (o.deposits || []).map((d, i) => i === index ? { ...d, amount, method } : d);
            const newPaidAmount = deposits.reduce((s, d) => s + d.amount, 0);
            const fullyPaid = newPaidAmount >= o.totalAmount;
            return { ...o, deposits, paidAmount: newPaidAmount, isPaid: fullyPaid, paymentMethod: method, paidAt: fullyPaid ? (o.paidAt || new Date()) : undefined, updatedAt: new Date() };
          }),
        })),

      removeDeposit: (id, index) =>
        set((state) => ({
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            const deposits = (o.deposits || []).filter((_, i) => i !== index);
            const newPaidAmount = deposits.reduce((s, d) => s + d.amount, 0);
            const fullyPaid = newPaidAmount >= o.totalAmount;
            return { ...o, deposits, paidAmount: newPaidAmount, isPaid: fullyPaid, paymentMethod: deposits.length > 0 ? deposits[deposits.length - 1].method : undefined, paidAt: fullyPaid ? o.paidAt : undefined, updatedAt: new Date() };
          }),
        })),

      markOrderPaid: (id, paymentMethod) =>
        set((state) => ({
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            const remaining = o.totalAmount - (o.paidAmount || 0);
            const entry = { amount: remaining > 0 ? remaining : o.totalAmount, method: paymentMethod, date: new Date() };
            return { ...o, isPaid: true, paidAmount: o.totalAmount, paymentMethod, paidAt: new Date(), deposits: [...(o.deposits || []), entry], updatedAt: new Date() };
          }),
        })),

      markOrdersPaid: (ids, paymentMethod) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            ids.includes(o.id) ? { ...o, isPaid: true, paidAmount: o.totalAmount, paymentMethod, paidAt: new Date(), updatedAt: new Date() } : o
          ),
        })),

      updateOrdersStatus: (ids, status) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            ids.includes(o.id) ? { ...o, status, updatedAt: new Date() } : o
          ),
        })),

      deleteOrder: (id) =>
        set((state) => {
          const order = state.orders.find((o) => o.id === id);
          const updatedProducts = order
            ? state.products.map((p) => {
                const item = order.items.find((i) => i.productId === p.id);
                if (item) {
                  const updates: any = { ...p, totalSold: Math.max(0, p.totalSold - item.quantity), updatedAt: new Date() };
                  if (p.trackStock && p.stockQuantity != null) {
                    updates.stockQuantity = p.stockQuantity + item.quantity;
                  }
                  return updates;
                }
                return p;
              })
            : state.products;
          return {
            orders: state.orders.filter((o) => o.id !== id),
            products: updatedProducts,
          };
        }),

      deleteOrders: (ids) =>
        set((state) => {
          const toDelete = state.orders.filter((o) => ids.includes(o.id));
          // Aggregate quantity adjustments per product
          const adjustments = new Map<string, number>();
          for (const order of toDelete) {
            for (const item of order.items) {
              adjustments.set(item.productId, (adjustments.get(item.productId) || 0) + item.quantity);
            }
          }
          const updatedProducts = adjustments.size > 0
            ? state.products.map((p) => {
                const qty = adjustments.get(p.id);
                if (qty) {
                  const updates: any = { ...p, totalSold: Math.max(0, p.totalSold - qty), updatedAt: new Date() };
                  if (p.trackStock && p.stockQuantity != null) {
                    updates.stockQuantity = p.stockQuantity + qty;
                  }
                  return updates;
                }
                return p;
              })
            : state.products;
          return {
            orders: state.orders.filter((o) => !ids.includes(o.id)),
            products: updatedProducts,
          };
        }),

      updateOrderItems: (id, newItems) =>
        set((state) => {
          const order = state.orders.find((o) => o.id === id);
          if (!order) return state;
          const oldItems = order.items;
          const newTotal = newItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
          // Build per-product quantity diffs
          const diffs = new Map<string, number>();
          for (const item of oldItems) diffs.set(item.productId, -(item.quantity));
          for (const item of newItems) diffs.set(item.productId, (diffs.get(item.productId) || 0) + item.quantity);

          const updatedProducts = state.products.map((p) => {
            const diff = diffs.get(p.id);
            if (diff) {
              const updates: any = { ...p, totalSold: Math.max(0, p.totalSold + diff), updatedAt: new Date() };
              if (p.trackStock && p.stockQuantity != null) {
                updates.stockQuantity = Math.max(0, p.stockQuantity - diff);
              }
              return updates;
            }
            return p;
          });

          return {
            orders: state.orders.map((o) =>
              o.id === id
                ? { ...o, items: newItems, totalAmount: newTotal, updatedAt: new Date() }
                : o
            ),
            products: updatedProducts,
          };
        }),

      recordPayment: (id, amount, paymentMethod) =>
        set((state) => ({
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            const newPaidAmount = (o.paidAmount || 0) + amount;
            const fullyPaid = newPaidAmount >= o.totalAmount;
            const entry = { amount, method: paymentMethod, date: new Date() };
            return {
              ...o,
              paidAmount: newPaidAmount,
              isPaid: fullyPaid,
              paymentMethod,
              paidAt: fullyPaid ? new Date() : o.paidAt,
              deposits: [...(o.deposits || []), entry],
              updatedAt: new Date(),
            };
          }),
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

      deleteSeason: (id) =>
        set((state) => ({
          seasons: state.seasons.filter((s) => s.id !== id),
          orders: state.orders.filter((o) => o.seasonId !== id),
          ingredientCosts: state.ingredientCosts.filter((c) => c.seasonId !== id),
        })),

      getActiveSeason: () => {
        const state = get();
        return state.seasons.find((s) => s.isActive) || null;
      },

      updateSeasonName: (seasonId, name) =>
        set((state) => ({
          seasons: state.seasons.map((s) =>
            s.id === seasonId ? { ...s, name } : s
          ),
        })),

      updateSeasonBudget: (seasonId, budget) =>
        set((state) => ({
          seasons: state.seasons.map((s) =>
            s.id === seasonId ? { ...s, costBudget: budget } : s
          ),
        })),

      updateSeasonTarget: (seasonId, target) =>
        set((state) => ({
          seasons: state.seasons.map((s) =>
            s.id === seasonId ? { ...s, revenueTarget: target } : s
          ),
        })),

      useSeasonTemplate: (newSeasonId, templateSeasonId) => {
        const state = get();
        const template = state.seasons.find((s) => s.id === templateSeasonId);
        if (!template) return;

        // Copy costBudget + revenueTarget from template season
        if (template.costBudget || template.revenueTarget) {
          set((st) => ({
            seasons: st.seasons.map((s) =>
              s.id === newSeasonId
                ? { ...s, costBudget: template.costBudget, revenueTarget: template.revenueTarget }
                : s
            ),
          }));
        }

        // Copy ingredient costs from template season as new entries in new season
        const templateCosts = state.ingredientCosts.filter((c) => c.seasonId === templateSeasonId);
        if (templateCosts.length > 0) {
          const now = new Date();
          const newCosts = templateCosts.map((c) => ({
            ...c,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            date: now,
            seasonId: newSeasonId,
            syncedToPersonal: false,
            personalTransactionId: undefined,
          }));
          set((st) => ({
            ingredientCosts: [...newCosts, ...st.ingredientCosts],
          }));
        }

        // Update product prices to match last-used price in template season's orders
        const templateOrders = state.orders.filter((o) => o.seasonId === templateSeasonId);
        const lastPriceMap = new Map<string, number>();
        // Orders stored newest-first, so first match = most recent price
        for (const order of templateOrders) {
          for (const item of order.items) {
            if (!lastPriceMap.has(item.productId)) {
              lastPriceMap.set(item.productId, item.unitPrice);
            }
          }
        }
        if (lastPriceMap.size > 0) {
          set((st) => ({
            products: st.products.map((p) => {
              const price = lastPriceMap.get(p.id);
              return price != null ? { ...p, pricePerUnit: price, updatedAt: new Date() } : p;
            }),
          }));
        }
      },

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

      // ─── Order Link Orders ───────────────────────────────
      addOrderLinkOrder: (row: Record<string, unknown>) =>
        set((state) => {
          // Deduplicate by supabaseId
          if (state.orders.some((o) => o.supabaseId === (row.id as string))) return state;

          const newOrder = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            supabaseId: row.id as string,
            orderNumber: (row.order_number as string | null) ?? undefined,
            items: (row.items as any[]) || [],
            customerName: (row.customer_name as string | null) ?? undefined,
            customerPhone: (row.customer_phone as string | null) ?? undefined,
            customerAddress: (row.customer_address as string | null) ?? undefined,
            totalAmount: parseFloat(String(row.total_amount)) || 0,
            status: ((row.status as string) || 'pending') as any,
            isPaid: Boolean(row.is_paid),
            paidAmount: row.paid_amount != null ? parseFloat(String(row.paid_amount)) : undefined,
            paymentMethod: (row.payment_method as any) ?? undefined,
            paidAt: row.paid_at ? new Date(row.paid_at as string) : undefined,
            note: (row.note as string | null) ?? undefined,
            date: row.created_at ? new Date(row.created_at as string) : new Date(),
            deliveryDate: row.delivery_date ? new Date(row.delivery_date as string) : undefined,
            seasonId: undefined,
            source: 'order_link' as const,
            createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
            updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
          };

          return { orders: [newOrder, ...state.orders] };
        }),

      // ─── Seen Online Orders ──────────────────────────────
      markOrdersSeen: (ids: string[]) =>
        set((state) => {
          const next = new Set(state.seenOnlineOrderIds);
          for (const id of ids) next.add(id);
          const onlineIds = new Set(
            state.orders.filter((o) => o.source === 'order_link').map((o) => o.id),
          );
          const pruned = [...next].filter((id) => onlineIds.has(id)).slice(-200);
          return { seenOnlineOrderIds: pruned };
        }),

      markAllOnlineSeen: () =>
        set((state) => ({
          seenOnlineOrderIds: state.orders
            .filter((o) => o.source === 'order_link')
            .map((o) => o.id)
            .slice(-200),
        })),

      markOrderUnseen: (id: string) =>
        set((state) => ({
          seenOnlineOrderIds: state.seenOnlineOrderIds.filter((i) => i !== id),
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

      // ─── Product Ordering ──────────────────────────────
      setProductOrder: (ids) => set({ productOrder: ids }),

      // ─── Cost Templates ────────────────────────────────
      addCostTemplate: (template) =>
        set((state) => ({
          costTemplates: [
            { ...template, id: Date.now().toString() },
            ...state.costTemplates,
          ],
        })),

      updateCostTemplate: (id, updates) =>
        set((state) => ({
          costTemplates: state.costTemplates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      deleteCostTemplate: (id) =>
        set((state) => ({
          costTemplates: state.costTemplates.filter((t) => t.id !== id),
        })),

      // ─── Recurring Costs ────────────────────────────────
      addRecurringCost: (cost) =>
        set((state) => ({
          recurringCosts: [
            { ...cost, id: Date.now().toString(), createdAt: new Date() },
            ...state.recurringCosts,
          ],
        })),

      updateRecurringCost: (id, updates) =>
        set((state) => ({
          recurringCosts: state.recurringCosts.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        })),

      deleteRecurringCost: (id) =>
        set((state) => ({
          recurringCosts: state.recurringCosts.filter((r) => r.id !== id),
        })),

      applyRecurringCost: (id, seasonId) => {
        const state = get();
        const recurring = state.recurringCosts.find((r) => r.id === id);
        if (!recurring) return '';

        // Compute next due
        const now = new Date();
        let nextDue = new Date(recurring.nextDue);
        while (nextDue <= now) {
          if (recurring.frequency === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
          else if (recurring.frequency === 'biweekly') nextDue.setDate(nextDue.getDate() + 14);
          else nextDue.setMonth(nextDue.getMonth() + 1);
        }

        // Create ingredient cost
        const costId = Date.now().toString();
        set((state) => ({
          ingredientCosts: [
            {
              id: costId,
              description: recurring.description,
              amount: recurring.amount,
              date: new Date(),
              seasonId: seasonId ?? recurring.seasonId,
              syncedToPersonal: false,
            },
            ...state.ingredientCosts,
          ],
          recurringCosts: state.recurringCosts.map((r) =>
            r.id === id ? { ...r, nextDue } : r
          ),
        }));
        return costId;
      },

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
          paidAt: o.paidAt instanceof Date ? o.paidAt.toISOString() : o.paidAt,
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
        costTemplates: state.costTemplates,
        productOrder: state.productOrder,
        seenOnlineOrderIds: state.seenOnlineOrderIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.products = state.products.map((p: any) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          }));
          // Deduplicate orders by id (fix for old Date.now() collisions)
          const seenIds = new Set<string>();
          state.orders = state.orders
            .map((o: any) => {
              let id = o.id;
              if (seenIds.has(id)) id = id + Math.random().toString(36).slice(2, 6);
              seenIds.add(id);
              return {
                ...o,
                id,
                date: new Date(o.date),
                deliveryDate: o.deliveryDate ? new Date(o.deliveryDate) : undefined,
                paidAt: o.paidAt ? new Date(o.paidAt) : undefined,
                status: o.status === 'paid' ? 'delivered' : o.status,
                createdAt: new Date(o.createdAt),
                updatedAt: new Date(o.updatedAt),
              };
            });
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
          state.costTemplates = state.costTemplates || [];
          state.productOrder = state.productOrder || [];
          state.seenOnlineOrderIds = state.seenOnlineOrderIds || [];
          // Backfill paidAmount for existing orders
          state.orders = state.orders.map((o: any) => ({
            ...o,
            paidAmount: o.paidAmount != null ? o.paidAmount : (o.isPaid ? o.totalAmount : 0),
          }));

          // Backfill order codes for existing orders without one
          const needsCodes = state.orders.some((o: any) => !o.orderNumber);
          if (needsCodes) {
            const usedCodes = new Set(state.orders.map((o: any) => o.orderNumber).filter(Boolean));
            state.orders = state.orders.map((o: any) => {
              if (o.orderNumber) return o;
              let code: string;
              const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
              const digits = '0123456789';
              do {
                const a = letters[Math.floor(Math.random() * letters.length)];
                const b = letters[Math.floor(Math.random() * letters.length)];
                const d1 = digits[Math.floor(Math.random() * digits.length)];
                const d2 = digits[Math.floor(Math.random() * digits.length)];
                const d3 = digits[Math.floor(Math.random() * digits.length)];
                code = `${a}${b}${d1}${d2}${d3}`;
              } while (usedCodes.has(code));
              usedCodes.add(code);
              return { ...o, orderNumber: code };
            });
          }
        }
      },
    }
  )
);
