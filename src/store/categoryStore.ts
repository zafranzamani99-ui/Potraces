import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryOption } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';

interface CategoryOverride {
  name?: string;
  icon?: string;
}

interface CategoryState {
  expenseCategoryOverrides: Record<string, CategoryOverride>;
  incomeCategoryOverrides: Record<string, CategoryOverride>;
  customExpenseCategories: CategoryOption[];
  customIncomeCategories: CategoryOption[];

  updateCategoryOverride: (
    type: 'expense' | 'income',
    id: string,
    updates: CategoryOverride
  ) => void;
  addCustomCategory: (
    type: 'expense' | 'income',
    category: Omit<CategoryOption, 'id'>
  ) => void;
  deleteCustomCategory: (type: 'expense' | 'income', id: string) => void;
  getExpenseCategories: () => CategoryOption[];
  getIncomeCategories: () => CategoryOption[];
}

export const useCategoryStore = create<CategoryState>()(
  persist(
    (set, get) => ({
      expenseCategoryOverrides: {},
      incomeCategoryOverrides: {},
      customExpenseCategories: [],
      customIncomeCategories: [],

      updateCategoryOverride: (type, id, updates) =>
        set((state) => {
          const key =
            type === 'expense'
              ? 'expenseCategoryOverrides'
              : 'incomeCategoryOverrides';
          return {
            [key]: {
              ...state[key],
              [id]: { ...state[key][id], ...updates },
            },
          };
        }),

      addCustomCategory: (type, category) =>
        set((state) => {
          const newCat: CategoryOption = {
            ...category,
            id: `custom_${Date.now()}`,
          };
          if (type === 'expense') {
            return {
              customExpenseCategories: [
                ...state.customExpenseCategories,
                newCat,
              ],
            };
          }
          return {
            customIncomeCategories: [
              ...state.customIncomeCategories,
              newCat,
            ],
          };
        }),

      deleteCustomCategory: (type, id) =>
        set((state) => {
          if (type === 'expense') {
            return {
              customExpenseCategories: state.customExpenseCategories.filter(
                (c) => c.id !== id
              ),
            };
          }
          return {
            customIncomeCategories: state.customIncomeCategories.filter(
              (c) => c.id !== id
            ),
          };
        }),

      getExpenseCategories: () => {
        const { expenseCategoryOverrides, customExpenseCategories } = get();
        const defaults = EXPENSE_CATEGORIES.map((cat) => ({
          ...cat,
          ...expenseCategoryOverrides[cat.id],
        }));
        return [...defaults, ...customExpenseCategories];
      },

      getIncomeCategories: () => {
        const { incomeCategoryOverrides, customIncomeCategories } = get();
        const defaults = INCOME_CATEGORIES.map((cat) => ({
          ...cat,
          ...incomeCategoryOverrides[cat.id],
        }));
        return [...defaults, ...customIncomeCategories];
      },
    }),
    {
      name: 'category-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        expenseCategoryOverrides: state.expenseCategoryOverrides,
        incomeCategoryOverrides: state.incomeCategoryOverrides,
        customExpenseCategories: state.customExpenseCategories,
        customIncomeCategories: state.customIncomeCategories,
      }),
    }
  )
);
