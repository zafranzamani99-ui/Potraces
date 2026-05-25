import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SellerState, OrderStatus, SellerOrder, SellerOrderItem, SellerPaymentMethod, RecurringFrequency, DepositEntry, SellerCostCategory } from '../types';
import { DEFAULT_COST_CATEGORIES } from '../constants';
import { newId } from '../utils/id';
import { usePersonalStore } from './personalStore';
import { useBusinessStore } from './businessStore';

/**
 * Reconcile the personal-mode income created when paid orders were transferred
 * to personal. That income is a single lump-sum transaction (id `transfer-<id>`)
 * covering every order in the batch. When a transferred order is edited or
 * removed, adjust the income by `delta` (negative shrinks it). If it nets to
 * zero — the last order of the batch was removed — delete the income and the
 * business-side transfer record. Wallet conservation holds: transfer income is
 * wallet-less, and personalStore.update/deleteTransaction handle wallet deltas.
 */
function reconcileTransferIncome(transferId: string, delta: number, removeIfEmpty: boolean): void {
  if (!transferId || delta === 0) return;
  const personal = usePersonalStore.getState();
  const txId = `transfer-${transferId}`;
  const tx = personal.transactions.find((t) => t.id === txId);
  if (!tx) return;
  const newAmount = tx.amount + delta;
  if (removeIfEmpty && newAmount <= 0.005) {
    personal.deleteTransaction(txId);
    useBusinessStore.getState().deleteTransfer(transferId);
  } else {
    personal.updateTransaction(txId, { amount: Math.max(0, newAmount) });
  }
}

const UNCATEGORIZED_COST_CATEGORY: SellerCostCategory = {
  id: 'costcat_uncategorized',
  name: 'Uncategorized',
  nameBm: 'Tiada kategori',
  icon: 'help-circle',
  color: '#6B7596',
  isDefault: false,
  sortOrder: 999,
};

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

// Module-level caches for derived selectors (avoids new arrays every call).
// Keyed on the source array's identity, not its length: an in-place edit
// (e.g. marking an order paid, changing a cost amount) keeps length the same
// but produces a new array via immer, so identity is the correct invalidator.
let _seasonOrdersCache: { seasonId: string; ref: any[]; val: any[] } = { seasonId: '', ref: [], val: [] };
let _seasonCostsCache: { seasonId: string; ref: any[]; val: any[] } = { seasonId: '', ref: [], val: [] };
let _seasonStatsCache: { seasonId: string; ordersRef: any[]; costsRef: any[]; val: any } = { seasonId: '', ordersRef: [], costsRef: [], val: null };

// Reset the module-level derived caches. The store state is cleared on sign-out
// but these module vars survive, so without this a freshly signed-in user could
// briefly read the previous user's cached season stats.
export function clearSellerCaches(): void {
  _seasonOrdersCache = { seasonId: '', ref: [], val: [] };
  _seasonCostsCache = { seasonId: '', ref: [], val: [] };
  _seasonStatsCache = { seasonId: '', ordersRef: [], costsRef: [], val: null };
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
      productCategories: [],
      costTemplates: [],
      recurringCosts: [],
      productOrder: [],
      stockAdjustments: [],
      costCategories: DEFAULT_COST_CATEGORIES,
      costCategoriesSeeded: true,
      seenOnlineOrderIds: [],
      skippedOnboardingSteps: [],
      _deletedProductIds: [],
      _deletedOrderIds: [],
      _deletedSeasonIds: [],
      _deletedCustomerIds: [],
      _deletedCostIds: [],
      _deletedCostCategoryIds: [],

      // ─── Products ───────────────────────────────────────
      addProduct: (product) =>
        set((state) => {
          const now = Date.now();
          const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
          return {
            products: [
              {
                ...product,
                id,
                totalSold: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              ...state.products,
            ],
          };
        }),

      updateProduct: (id, updates) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
        })),

      deleteProduct: (id) =>
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
          _deletedProductIds: [...state._deletedProductIds, id],
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
                id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
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
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            // Only wipe deposits when explicitly resetting payments (undo paid), not when reverting due to item changes
            const { _resetPayments, ...rest } = updates as Partial<SellerOrder> & { _resetPayments?: boolean };
            const extra = _resetPayments ? { deposits: [] as DepositEntry[], paidAmount: 0 } : {};
            return { ...o, ...rest, ...extra, updatedAt: new Date() };
          }),
        })),

      updateDeposit: (id, index, amount, method, note) =>
        set((state) => ({
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            const deposits = (o.deposits || []).map((d, i) => i === index ? { ...d, amount, method, note } : d);
            // C3: Cap paidAmount at totalAmount
            const newPaidAmount = Math.min(deposits.reduce((s, d) => s + d.amount, 0), o.totalAmount);
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

      markOrderPaid: (id, paymentMethod, note) =>
        set((state) => ({
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            const remaining = o.totalAmount - (o.paidAmount || 0);
            const entry = { amount: remaining > 0 ? remaining : o.totalAmount, method: paymentMethod, date: new Date(), ...(note ? { note } : {}) };
            return { ...o, isPaid: true, paidAmount: o.totalAmount, paymentMethod, paidAt: new Date(), deposits: [...(o.deposits || []), entry], updatedAt: new Date() };
          }),
        })),

      markOrdersPaid: (ids, paymentMethod, note) =>
        set((state) => ({
          orders: state.orders.map((o) => {
            if (!ids.includes(o.id)) return o;
            const remaining = o.totalAmount - (o.paidAmount || 0);
            const depositEntry = remaining > 0
              ? [{ id: Date.now().toString() + Math.random().toString(36).slice(2, 6), amount: remaining, method: paymentMethod, date: new Date(), ...(note ? { note } : {}) }]
              : [];
            return { ...o, isPaid: true, paidAmount: o.totalAmount, paymentMethod, paidAt: new Date(), deposits: [...(o.deposits || []), ...depositEntry], updatedAt: new Date() };
          }),
        })),

      updateOrdersStatus: (ids, status) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            ids.includes(o.id) ? { ...o, status, updatedAt: new Date() } : o
          ),
        })),

      deleteOrder: (id) => {
        const order = get().orders.find((o) => o.id === id);
        set((state) => {
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
            _deletedOrderIds: [...state._deletedOrderIds, id],
          };
        });
        // Reverse this order's share of any transferred-to-personal income.
        if (order?.transferredToPersonal && order.transferId) {
          reconcileTransferIncome(order.transferId, -order.totalAmount, true);
        }
      },

      deleteOrders: (ids) => {
        const toDelete = get().orders.filter((o) => ids.includes(o.id));
        set((state) => {
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
            _deletedOrderIds: [...state._deletedOrderIds, ...ids],
          };
        });
        // Reverse transferred-to-personal income, summed per transfer batch.
        const byTransfer = new Map<string, number>();
        for (const o of toDelete) {
          if (o.transferredToPersonal && o.transferId) {
            byTransfer.set(o.transferId, (byTransfer.get(o.transferId) || 0) + o.totalAmount);
          }
        }
        for (const [tid, amt] of byTransfer) reconcileTransferIncome(tid, -amt, true);
      },

      updateOrderItems: (id, newItems) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return;
        const oldTotal = order.totalAmount;
        const newTotal = newItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        set((state) => {
          const oldItems = order.items;
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
        });
        // Keep transferred-to-personal income in step with the new order total.
        if (order.transferredToPersonal && order.transferId) {
          reconcileTransferIncome(order.transferId, newTotal - oldTotal, false);
        }
      },

      recordPayment: (id, amount, paymentMethod, note) =>
        set((state) => ({
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            if (amount <= 0) return o;
            // Cap at the order total so paidAmount can't exceed what's owed
            // (mirrors updateDeposit). Prevents "Paid RM80 / RM50" states.
            const newPaidAmount = Math.min(o.totalAmount, (o.paidAmount || 0) + amount);
            const fullyPaid = newPaidAmount >= o.totalAmount;
            const entry = { amount, method: paymentMethod, date: new Date(), ...(note ? { note } : {}) };
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
        set((state) => {
          // Only one active season at a time. getActiveSeason() returns the
          // first match, so a second active season would be invisible and
          // silently split new orders. Auto-end any currently active season
          // when starting a new active one.
          const others = season.isActive
            ? state.seasons.map((s) =>
                s.isActive ? { ...s, isActive: false, endDate: s.endDate ?? new Date() } : s
              )
            : state.seasons;
          return {
            seasons: [
              {
                ...season,
                id: newId(),
                createdAt: new Date(),
              },
              ...others,
            ],
          };
        }),

      endSeason: (id) =>
        set((state) => ({
          seasons: state.seasons.map((s) =>
            s.id === id ? { ...s, isActive: false, endDate: new Date() } : s
          ),
        })),

      deleteSeason: (id) => {
        const seasonOrders = get().orders.filter((o) => o.seasonId === id);
        set((state) => {
          const deletedOrderIds = seasonOrders.map((o) => o.id);
          // Reverse product totalSold + stock for every order in this season
          // (same as deleteOrders — otherwise products keep phantom sales).
          const adjustments = new Map<string, number>();
          for (const order of seasonOrders) {
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
            seasons: state.seasons.filter((s) => s.id !== id),
            orders: state.orders.filter((o) => o.seasonId !== id),
            ingredientCosts: state.ingredientCosts.filter((c) => c.seasonId !== id),
            products: updatedProducts,
            _deletedSeasonIds: [...state._deletedSeasonIds, id],
            _deletedOrderIds: [...state._deletedOrderIds, ...deletedOrderIds],
          };
        });
        // Reverse any transferred-to-personal income, summed per transfer batch,
        // so deleting a season can't strand phantom personal income.
        const byTransfer = new Map<string, number>();
        for (const o of seasonOrders) {
          if (o.transferredToPersonal && o.transferId) {
            byTransfer.set(o.transferId, (byTransfer.get(o.transferId) || 0) + o.totalAmount);
          }
        }
        for (const [tid, amt] of byTransfer) reconcileTransferIncome(tid, -amt, true);
      },

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
            // Receipt images belong to the original cost's storage path
            // ({userId}/{originalId}.jpg). A clone with a new id must not
            // reference them, or deleting either cost orphans/misdeletes the file.
            receiptUrl: undefined,
            receiptLocalUri: undefined,
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
          _deletedCostIds: [...state._deletedCostIds, id],
        })),

      markCostSynced: (id, personalTransactionId) =>
        set((state) => ({
          ingredientCosts: state.ingredientCosts.map((c) =>
            c.id === id
              ? { ...c, syncedToPersonal: true, personalTransactionId }
              : c
          ),
        })),

      // ─── Cost Categories ───────────────────────────────
      addCostCategory: (cat) =>
        set((state) => {
          const id = `costcat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const maxOrder = state.costCategories.reduce((m, c) => Math.max(m, c.sortOrder), -1);
          return {
            costCategories: [
              ...state.costCategories,
              { ...cat, id, isDefault: false, sortOrder: maxOrder + 1 },
            ],
          };
        }),

      updateCostCategory: (id, updates) =>
        set((state) => ({
          costCategories: state.costCategories.map((c) =>
            c.id === id ? { ...c, ...updates, id: c.id } : c
          ),
        })),

      deleteCostCategory: (id) =>
        set((state) => {
          const target = state.costCategories.find((c) => c.id === id);
          if (!target || target.isProtected) return {};
          const sink = 'costcat_other';
          return {
            costCategories: state.costCategories.filter((c) => c.id !== id),
            _deletedCostCategoryIds: [...state._deletedCostCategoryIds, id],
            // Reassign anything pointing at the deleted category to the protected "Other" sink
            ingredientCosts: state.ingredientCosts.map((c) =>
              c.category === id ? { ...c, category: sink } : c
            ),
            costTemplates: state.costTemplates.map((t) =>
              t.category === id ? { ...t, category: sink } : t
            ),
            recurringCosts: state.recurringCosts.map((r) =>
              r.category === id ? { ...r, category: sink } : r
            ),
          };
        }),

      reorderCostCategories: (ids) =>
        set((state) => {
          const byId = new Map(state.costCategories.map((c) => [c.id, c]));
          const reordered = ids
            .map((cid, i) => {
              const c = byId.get(cid);
              return c ? { ...c, sortOrder: i } : null;
            })
            .filter((c): c is SellerCostCategory => c !== null);
          // Append any categories missing from `ids` (safety)
          const seen = new Set(ids);
          const leftover = state.costCategories.filter((c) => !seen.has(c.id));
          return { costCategories: [...reordered, ...leftover] };
        }),

      getCostCategory: (id) => {
        if (!id) return UNCATEGORIZED_COST_CATEGORY;
        return get().costCategories.find((c) => c.id === id) ?? UNCATEGORIZED_COST_CATEGORY;
      },

      // ─── Stock Adjustments ─────────────────────────────────
      addStockAdjustment: (adj) => {
        const id = Date.now().toString();
        set((state) => {
          const product = state.products.find((p) => p.id === adj.productId);
          const currentStock = product?.stockQuantity ?? 0;
          const actualDelta = adj.delta < 0 ? Math.max(adj.delta, -currentStock) : adj.delta;
          const newStock = currentStock + actualDelta;
          return {
            stockAdjustments: [{ ...adj, delta: actualDelta, id }, ...state.stockAdjustments],
            products: state.products.map((p) =>
              p.id === adj.productId
                ? { ...p, stockQuantity: newStock, updatedAt: new Date() }
                : p
            ),
          };
        });
      },

      // ─── Order Link Orders ───────────────────────────────
      addOrderLinkOrder: (row: Record<string, unknown>) =>
        set((state) => {
          // Deduplicate by supabaseId
          if (state.orders.some((o) => o.supabaseId === (row.id as string))) return state;

          const linkItems = (row.items as SellerOrderItem[]) || [];
          // Recompute the total from line items rather than trusting the
          // client-sent total_amount (which the public order page computes in
          // JS and a malicious caller could tamper with). Fall back to the sent
          // total only if the items carry no usable prices.
          const itemsTotal = linkItems.reduce((s, i) => s + (i.unitPrice || 0) * (i.quantity || 0), 0);
          const sentTotal = parseFloat(String(row.total_amount)) || 0;

          const newOrder = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            supabaseId: row.id as string,
            orderNumber: (row.order_number as string | null) ?? generateOrderCode(state.orders),
            items: linkItems,
            customerName: (row.customer_name as string | null) ?? undefined,
            customerPhone: (row.customer_phone as string | null) ?? undefined,
            customerAddress: (row.customer_address as string | null) ?? undefined,
            totalAmount: itemsTotal > 0 ? itemsTotal : sentTotal,
            status: ((row.status as string) || 'pending') as OrderStatus,
            isPaid: Boolean(row.is_paid),
            paidAmount: row.paid_amount != null ? parseFloat(String(row.paid_amount)) : undefined,
            paymentMethod: (row.payment_method as SellerPaymentMethod | null) ?? undefined,
            paidAt: row.paid_at ? new Date(row.paid_at as string) : undefined,
            note: (row.note as string | null) ?? undefined,
            deposits: Array.isArray(row.deposits)
              ? (row.deposits as DepositEntry[]).map((d) => ({
                  ...d,
                  date: d.date instanceof Date ? d.date : new Date(String(d.date)),
                }))
              : [],
            date: row.created_at ? new Date(row.created_at as string) : new Date(),
            deliveryDate: row.delivery_date ? new Date(row.delivery_date as string) : undefined,
            seasonId: undefined,
            source: 'order_link' as const,
            createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
            updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
          };

          // Mirror addOrder: an online sale must also move product totalSold and
          // stock, or stock reads too high (overselling) and totalSold understates.
          // Safe from double-count — the supabaseId dedup above runs first, and the
          // main pull only fetches source='app' orders.
          const updatedProducts = state.products.map((p) => {
            const item = newOrder.items.find((i) => i.productId === p.id);
            if (!item) return p;
            const updates: any = { ...p, totalSold: p.totalSold + item.quantity, updatedAt: new Date() };
            if (p.trackStock && p.stockQuantity != null) {
              updates.stockQuantity = Math.max(0, p.stockQuantity - item.quantity);
            }
            return updates;
          });

          return { orders: [newOrder, ...state.orders], products: updatedProducts };
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

      skipOnboardingStep: (step: string) =>
        set((state) => ({
          skippedOnboardingSteps: state.skippedOnboardingSteps.includes(step)
            ? state.skippedOnboardingSteps
            : [...state.skippedOnboardingSteps, step],
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
          _deletedCustomerIds: [...state._deletedCustomerIds, id],
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

      // ─── Product Categories ─────────────────────────────
      addProductCategory: (cat: string) =>
        set((state) => {
          const normalized = cat.trim().toLowerCase();
          if (!normalized || state.productCategories.includes(normalized)) return state;
          return { productCategories: [...state.productCategories, normalized] };
        }),
      deleteProductCategory: (cat: string) =>
        set((state) => ({
          productCategories: state.productCategories.filter((c: string) => c !== cat),
        })),
      renameProductCategory: (oldName: string, newName: string) =>
        set((state) => {
          const normalized = newName.trim().toLowerCase();
          if (!normalized || normalized === oldName) return state;
          return {
            productCategories: state.productCategories.map((c: string) => (c === oldName ? normalized : c)),
            products: state.products.map((p: any) => p.category === oldName ? { ...p, category: normalized, updatedAt: new Date() } : p),
          };
        }),

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
              category: recurring.category,
            },
            ...state.ingredientCosts,
          ],
          recurringCosts: state.recurringCosts.map((r) =>
            r.id === id ? { ...r, nextDue } : r
          ),
        }));
        return costId;
      },

      // ─── Derived Data (cached) ──────────────────────────
      getSeasonOrders: (seasonId) => {
        const orders = get().orders;
        if (_seasonOrdersCache.seasonId === seasonId && _seasonOrdersCache.ref === orders) return _seasonOrdersCache.val;
        const result = orders.filter((o) => o.seasonId === seasonId);
        _seasonOrdersCache = { seasonId, ref: orders, val: result };
        return result;
      },

      getSeasonCosts: (seasonId) => {
        const costs = get().ingredientCosts;
        if (_seasonCostsCache.seasonId === seasonId && _seasonCostsCache.ref === costs) return _seasonCostsCache.val;
        const result = costs.filter((c) => c.seasonId === seasonId);
        _seasonCostsCache = { seasonId, ref: costs, val: result };
        return result;
      },

      getSeasonStats: (seasonId) => {
        const state = get();
        if (_seasonStatsCache.seasonId === seasonId && _seasonStatsCache.ordersRef === state.orders && _seasonStatsCache.costsRef === state.ingredientCosts) return _seasonStatsCache.val;
        const orders = state.orders.filter((o) => o.seasonId === seasonId);
        const costs = state.ingredientCosts.filter((c) => c.seasonId === seasonId);
        const totalIncome = orders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
        const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
        const unpaid = orders.filter((o) => !o.isPaid);

        const result = {
          totalOrders: orders.length,
          totalIncome,
          totalCosts,
          kept: totalIncome - totalCosts,
          unpaidCount: unpaid.length,
          unpaidAmount: unpaid.reduce((s, o) => s + o.totalAmount, 0),
        };
        _seasonStatsCache = { seasonId, ordersRef: state.orders, costsRef: state.ingredientCosts, val: result };
        return result;
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
        productCategories: state.productCategories,
        costTemplates: state.costTemplates,
        recurringCosts: state.recurringCosts.map((r) => ({
          ...r,
          nextDue: r.nextDue instanceof Date ? r.nextDue.toISOString() : r.nextDue,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        })),
        productOrder: state.productOrder,
        stockAdjustments: (state.stockAdjustments || []).map((a) => ({
          ...a,
          date: a.date instanceof Date ? a.date.toISOString() : a.date,
        })),
        costCategories: state.costCategories,
        costCategoriesSeeded: state.costCategoriesSeeded,
        seenOnlineOrderIds: state.seenOnlineOrderIds,
        skippedOnboardingSteps: state.skippedOnboardingSteps,
        _deletedProductIds: state._deletedProductIds,
        _deletedOrderIds: state._deletedOrderIds,
        _deletedSeasonIds: state._deletedSeasonIds,
        _deletedCustomerIds: state._deletedCustomerIds,
        _deletedCostIds: state._deletedCostIds,
        _deletedCostCategoryIds: state._deletedCostCategoryIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          const seenProductIds = new Set<string>();
          state.products = state.products.map((p: any) => {
            let id = p.id;
            if (seenProductIds.has(id)) id = id + '-' + Math.random().toString(36).slice(2, 6);
            seenProductIds.add(id);
            return {
              ...p,
              id,
              createdAt: sd(p.createdAt),
              updatedAt: sd(p.updatedAt),
            };
          });
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
                date: sd(o.date),
                deliveryDate: o.deliveryDate ? sd(o.deliveryDate) : undefined,
                paidAt: o.paidAt ? sd(o.paidAt) : undefined,
                status: o.status === 'paid' ? 'delivered' : o.status,
                createdAt: sd(o.createdAt),
                updatedAt: sd(o.updatedAt),
                deposits: Array.isArray(o.deposits)
                  ? o.deposits.map((d: any) => ({
                      ...d,
                      date: sd(d.date),
                    }))
                  : [],
              };
            });
          state.seasons = state.seasons.map((s: any) => ({
            ...s,
            startDate: sd(s.startDate),
            endDate: s.endDate ? sd(s.endDate) : undefined,
            createdAt: sd(s.createdAt),
          }));
          state.ingredientCosts = state.ingredientCosts.map((c: any) => ({
            ...c,
            date: sd(c.date),
          }));
          state.sellerCustomers = (state.sellerCustomers || []).map((c: any) => ({
            ...c,
            createdAt: sd(c.createdAt),
          }));
          state.customUnits = state.customUnits || [];
          state.hiddenUnits = state.hiddenUnits || [];
          state.unitOrder = state.unitOrder || [];
          state.productCategories = state.productCategories || [];
          state.costTemplates = state.costTemplates || [];
          state.recurringCosts = (state.recurringCosts || []).map((r: any) => ({
            ...r,
            nextDue: sd(r.nextDue),
            createdAt: sd(r.createdAt),
          }));
          state.productOrder = state.productOrder || [];
          state.stockAdjustments = (state.stockAdjustments || []).map((a: any) => ({
            ...a,
            date: sd(a.date),
          }));
          state.seenOnlineOrderIds = state.seenOnlineOrderIds || [];
          state.skippedOnboardingSteps = state.skippedOnboardingSteps || [];
          state._deletedProductIds = state._deletedProductIds || [];
          state._deletedOrderIds = state._deletedOrderIds || [];
          state._deletedSeasonIds = state._deletedSeasonIds || [];
          state._deletedCustomerIds = state._deletedCustomerIds || [];
          state._deletedCostIds = state._deletedCostIds || [];
          state._deletedCostCategoryIds = state._deletedCostCategoryIds || [];
          // Seed default cost categories once. The seeded flag prevents re-seeding
          // a default the user later deleted (sync re-seed protection lives in sellerSync).
          state.costCategories = state.costCategories || [];
          if (!state.costCategoriesSeeded && state.costCategories.length === 0) {
            state.costCategories = DEFAULT_COST_CATEGORIES;
            state.costCategoriesSeeded = true;
          }
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
