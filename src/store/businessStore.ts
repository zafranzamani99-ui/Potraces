import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BusinessState } from '../types';

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set) => ({
      products: [],
      sales: [],
      suppliers: [],

      addProduct: (product) =>
        set((state) => ({
          products: [
            {
              ...product,
              id: Date.now().toString(),
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
                stock: product.stock - saleItem.quantity,
                updatedAt: new Date(),
              };
            }
            return product;
          });

          return {
            sales: [
              {
                ...sale,
                id: Date.now().toString(),
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
              id: Date.now().toString(),
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.products = state.products.map((p: any) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          }));
          state.sales = state.sales.map((s: any) => ({
            ...s,
            date: new Date(s.date),
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          }));
          state.suppliers = state.suppliers.map((s: any) => ({
            ...s,
            lastPurchaseDate: s.lastPurchaseDate ? new Date(s.lastPurchaseDate) : undefined,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          }));
        }
      },
    }
  )
);