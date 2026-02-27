import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryOption } from '../types';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  BUSINESS_EXPENSE_CATEGORIES,
  BUSINESS_INCOME_CATEGORIES,
} from '../constants';

interface CategoryOverride {
  name?: string;
  icon?: string;
}

interface CategoryState {
  // Personal
  expenseCategoryOverrides: Record<string, CategoryOverride>;
  incomeCategoryOverrides: Record<string, CategoryOverride>;
  customExpenseCategories: CategoryOption[];
  customIncomeCategories: CategoryOption[];
  // Business
  businessExpenseCategoryOverrides: Record<string, CategoryOverride>;
  businessIncomeCategoryOverrides: Record<string, CategoryOverride>;
  customBusinessExpenseCategories: CategoryOption[];
  customBusinessIncomeCategories: CategoryOption[];
  // Order
  expenseCategoryOrder: string[];
  incomeCategoryOrder: string[];
  businessExpenseCategoryOrder: string[];
  businessIncomeCategoryOrder: string[];

  updateCategoryOverride: (
    type: 'expense' | 'income',
    id: string,
    updates: CategoryOverride,
    mode?: 'personal' | 'business'
  ) => void;
  addCustomCategory: (
    type: 'expense' | 'income',
    category: Omit<CategoryOption, 'id'>,
    mode?: 'personal' | 'business'
  ) => void;
  deleteCustomCategory: (
    type: 'expense' | 'income',
    id: string,
    mode?: 'personal' | 'business'
  ) => void;
  setCategoryOrder: (
    type: 'expense' | 'income',
    order: string[],
    mode?: 'personal' | 'business'
  ) => void;
  getExpenseCategories: (mode?: 'personal' | 'business') => CategoryOption[];
  getIncomeCategories: (mode?: 'personal' | 'business') => CategoryOption[];
}

export const useCategoryStore = create<CategoryState>()(
  persist(
    (set, get) => ({
      expenseCategoryOverrides: {},
      incomeCategoryOverrides: {},
      customExpenseCategories: [],
      customIncomeCategories: [],
      businessExpenseCategoryOverrides: {},
      businessIncomeCategoryOverrides: {},
      customBusinessExpenseCategories: [],
      customBusinessIncomeCategories: [],
      expenseCategoryOrder: [],
      incomeCategoryOrder: [],
      businessExpenseCategoryOrder: [],
      businessIncomeCategoryOrder: [],

      updateCategoryOverride: (type, id, updates, mode = 'personal') =>
        set((state) => {
          const key =
            mode === 'business'
              ? type === 'expense'
                ? 'businessExpenseCategoryOverrides'
                : 'businessIncomeCategoryOverrides'
              : type === 'expense'
                ? 'expenseCategoryOverrides'
                : 'incomeCategoryOverrides';
          return {
            [key]: {
              ...state[key],
              [id]: { ...state[key][id], ...updates },
            },
          };
        }),

      addCustomCategory: (type, category, mode = 'personal') =>
        set((state) => {
          const newCat: CategoryOption = {
            ...category,
            id: `custom_${Date.now()}`,
          };
          const key =
            mode === 'business'
              ? type === 'expense'
                ? 'customBusinessExpenseCategories'
                : 'customBusinessIncomeCategories'
              : type === 'expense'
                ? 'customExpenseCategories'
                : 'customIncomeCategories';
          return {
            [key]: [...state[key], newCat],
          };
        }),

      deleteCustomCategory: (type, id, mode = 'personal') =>
        set((state) => {
          const key =
            mode === 'business'
              ? type === 'expense'
                ? 'customBusinessExpenseCategories'
                : 'customBusinessIncomeCategories'
              : type === 'expense'
                ? 'customExpenseCategories'
                : 'customIncomeCategories';
          return {
            [key]: state[key].filter((c) => c.id !== id),
          };
        }),

      setCategoryOrder: (type, order, mode = 'personal') =>
        set(() => {
          const key =
            mode === 'business'
              ? type === 'expense'
                ? 'businessExpenseCategoryOrder'
                : 'businessIncomeCategoryOrder'
              : type === 'expense'
                ? 'expenseCategoryOrder'
                : 'incomeCategoryOrder';
          return { [key]: order };
        }),

      getExpenseCategories: (mode = 'personal') => {
        const state = get();
        let cats: CategoryOption[];
        let order: string[];
        if (mode === 'business') {
          const defaults = BUSINESS_EXPENSE_CATEGORIES.map((cat) => ({
            ...cat,
            ...state.businessExpenseCategoryOverrides[cat.id],
          }));
          cats = [...defaults, ...state.customBusinessExpenseCategories];
          order = state.businessExpenseCategoryOrder;
        } else {
          const defaults = EXPENSE_CATEGORIES.map((cat) => ({
            ...cat,
            ...state.expenseCategoryOverrides[cat.id],
          }));
          cats = [...defaults, ...state.customExpenseCategories];
          order = state.expenseCategoryOrder;
        }
        if (order.length > 0) {
          const orderMap = new Map(order.map((id, i) => [id, i]));
          cats.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
        }
        return cats;
      },

      getIncomeCategories: (mode = 'personal') => {
        const state = get();
        let cats: CategoryOption[];
        let order: string[];
        if (mode === 'business') {
          const defaults = BUSINESS_INCOME_CATEGORIES.map((cat) => ({
            ...cat,
            ...state.businessIncomeCategoryOverrides[cat.id],
          }));
          cats = [...defaults, ...state.customBusinessIncomeCategories];
          order = state.businessIncomeCategoryOrder;
        } else {
          const defaults = INCOME_CATEGORIES.map((cat) => ({
            ...cat,
            ...state.incomeCategoryOverrides[cat.id],
          }));
          cats = [...defaults, ...state.customIncomeCategories];
          order = state.incomeCategoryOrder;
        }
        if (order.length > 0) {
          const orderMap = new Map(order.map((id, i) => [id, i]));
          cats.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
        }
        return cats;
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
        businessExpenseCategoryOverrides: state.businessExpenseCategoryOverrides,
        businessIncomeCategoryOverrides: state.businessIncomeCategoryOverrides,
        customBusinessExpenseCategories: state.customBusinessExpenseCategories,
        customBusinessIncomeCategories: state.customBusinessIncomeCategories,
        expenseCategoryOrder: state.expenseCategoryOrder,
        incomeCategoryOrder: state.incomeCategoryOrder,
        businessExpenseCategoryOrder: state.businessExpenseCategoryOrder,
        businessIncomeCategoryOrder: state.businessIncomeCategoryOrder,
      }),
    }
  )
);
