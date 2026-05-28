import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CRMState } from '../types';
import { newId } from '../utils/id';
import { roundMoney } from '../utils/money';

export const useCRMStore = create<CRMState>()(
  persist(
    (set, get) => ({
      customers: [],
      orders: [],

      addCustomer: (customer) =>
        set((state) => ({
          customers: [
            {
              ...customer,
              id: newId(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.customers,
          ],
        })),

      updateCustomer: (id, updates) =>
        set((state) => ({
          customers: state.customers.map((customer) =>
            customer.id === id
              ? { ...customer, ...updates, updatedAt: new Date() }
              : customer
          ),
        })),

      deleteCustomer: (id) =>
        set((state) => ({
          customers: state.customers.filter((c) => c.id !== id),
          orders: state.orders.filter((o) => o.customerId !== id),
        })),

      addOrder: (order) =>
        set((state) => ({
          orders: [
            {
              ...order,
              id: newId(),
              paidAmount: 0,
              paymentStatus: 'unpaid' as const,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.orders,
          ],
        })),

      updateOrder: (id, updates) =>
        set((state) => ({
          orders: state.orders.map((order) =>
            order.id === id
              ? { ...order, ...updates, updatedAt: new Date() }
              : order
          ),
        })),

      deleteOrder: (id) =>
        set((state) => ({
          orders: state.orders.filter((o) => o.id !== id),
        })),

      addOrderPayment: (orderId, amount) =>
        set((state) => ({
          orders: state.orders.map((order) => {
            if (order.id !== orderId) return order;

            const newPaidAmount = roundMoney(Math.min(order.totalAmount, order.paidAmount + amount));
            let newPaymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
            if (newPaidAmount >= order.totalAmount) {
              newPaymentStatus = 'paid';
            } else if (newPaidAmount > 0) {
              newPaymentStatus = 'partial';
            }

            return {
              ...order,
              paidAmount: newPaidAmount,
              paymentStatus: newPaymentStatus,
              updatedAt: new Date(),
            };
          }),
        })),

      getCustomerStats: (customerId) => {
        const { orders } = get();
        const customerOrders = orders.filter((o) => o.customerId === customerId);
        const completedOrders = customerOrders.filter((o) => o.status !== 'cancelled');

        return {
          totalSpent: roundMoney(completedOrders.reduce((sum, o) => sum + o.paidAmount, 0)),
          orderCount: customerOrders.length,
          outstanding: roundMoney(completedOrders.reduce((sum, o) => sum + (o.totalAmount - o.paidAmount), 0)),
        };
      },
    }),
    {
      name: 'crm-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        customers: state.customers.map((c) => ({
          ...c,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
          updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
        })),
        orders: state.orders.map((o) => ({
          ...o,
          date: o.date instanceof Date ? o.date.toISOString() : o.date,
          createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
          updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
        })),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const sd = (v: any) => { if (!v) return new Date(); const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
          state.customers = state.customers.map((c: any) => ({
            ...c,
            createdAt: sd(c.createdAt),
            updatedAt: sd(c.updatedAt),
          }));
          state.orders = state.orders.map((o: any) => ({
            ...o,
            date: sd(o.date),
            createdAt: sd(o.createdAt),
            updatedAt: sd(o.updatedAt),
          }));
        }
      },
    }
  )
);
