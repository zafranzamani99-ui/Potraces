import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryOption } from '../types';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  BUSINESS_EXPENSE_CATEGORIES,
  BUSINESS_INCOME_CATEGORIES,
  INVESTMENT_CATEGORIES,
} from '../constants';

type CategoryType = 'expense' | 'income' | 'investment';

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
  // Investment
  investmentCategoryOverrides: Record<string, CategoryOverride>;
  customInvestmentCategories: CategoryOption[];
  // Order
  expenseCategoryOrder: string[];
  incomeCategoryOrder: string[];
  businessExpenseCategoryOrder: string[];
  businessIncomeCategoryOrder: string[];
  investmentCategoryOrder: string[];

  updateCategoryOverride: (
    type: CategoryType,
    id: string,
    updates: CategoryOverride,
    mode?: 'personal' | 'business'
  ) => void;
  addCustomCategory: (
    type: CategoryType,
    category: Omit<CategoryOption, 'id'>,
    mode?: 'personal' | 'business'
  ) => void;
  deleteCustomCategory: (
    type: CategoryType,
    id: string,
    mode?: 'personal' | 'business'
  ) => void;
  setCategoryOrder: (
    type: CategoryType,
    order: string[],
    mode?: 'personal' | 'business'
  ) => void;
  getExpenseCategories: (mode?: 'personal' | 'business') => CategoryOption[];
  getIncomeCategories: (mode?: 'personal' | 'business') => CategoryOption[];
  getInvestmentCategories: () => CategoryOption[];
}

function resolveKey(
  type: CategoryType,
  mode: 'personal' | 'business',
  prefix: 'overrides' | 'custom' | 'order'
): string {
  if (type === 'investment') {
    if (prefix === 'overrides') return 'investmentCategoryOverrides';
    if (prefix === 'custom') return 'customInvestmentCategories';
    return 'investmentCategoryOrder';
  }
  if (mode === 'business') {
    if (prefix === 'overrides') return type === 'expense' ? 'businessExpenseCategoryOverrides' : 'businessIncomeCategoryOverrides';
    if (prefix === 'custom') return type === 'expense' ? 'customBusinessExpenseCategories' : 'customBusinessIncomeCategories';
    return type === 'expense' ? 'businessExpenseCategoryOrder' : 'businessIncomeCategoryOrder';
  }
  if (prefix === 'overrides') return type === 'expense' ? 'expenseCategoryOverrides' : 'incomeCategoryOverrides';
  if (prefix === 'custom') return type === 'expense' ? 'customExpenseCategories' : 'customIncomeCategories';
  return type === 'expense' ? 'expenseCategoryOrder' : 'incomeCategoryOrder';
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
      investmentCategoryOverrides: {},
      customInvestmentCategories: [],
      expenseCategoryOrder: [],
      incomeCategoryOrder: [],
      businessExpenseCategoryOrder: [],
      businessIncomeCategoryOrder: [],
      investmentCategoryOrder: [],

      updateCategoryOverride: (type, id, updates, mode = 'personal') =>
        set((state) => {
          const key = resolveKey(type, mode, 'overrides') as keyof Pick<CategoryState,
            'expenseCategoryOverrides' | 'incomeCategoryOverrides' |
            'businessExpenseCategoryOverrides' | 'businessIncomeCategoryOverrides' |
            'investmentCategoryOverrides'>;
          return {
            [key]: {
              ...(state[key] as Record<string, CategoryOverride>),
              [id]: { ...(state[key] as Record<string, CategoryOverride>)[id], ...updates },
            },
          };
        }),

      addCustomCategory: (type, category, mode = 'personal') =>
        set((state) => {
          const newCat: CategoryOption = {
            ...category,
            id: `custom_${Date.now()}`,
          };
          const key = resolveKey(type, mode, 'custom') as keyof Pick<CategoryState,
            'customExpenseCategories' | 'customIncomeCategories' |
            'customBusinessExpenseCategories' | 'customBusinessIncomeCategories' |
            'customInvestmentCategories'>;
          return {
            [key]: [...(state[key] as CategoryOption[]), newCat],
          };
        }),

      deleteCustomCategory: (type, id, mode = 'personal') =>
        set((state) => {
          const key = resolveKey(type, mode, 'custom') as keyof Pick<CategoryState,
            'customExpenseCategories' | 'customIncomeCategories' |
            'customBusinessExpenseCategories' | 'customBusinessIncomeCategories' |
            'customInvestmentCategories'>;
          return {
            [key]: (state[key] as CategoryOption[]).filter((c) => c.id !== id),
          };
        }),

      setCategoryOrder: (type, order, mode = 'personal') =>
        set(() => {
          const key = resolveKey(type, mode, 'order');
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

      getInvestmentCategories: () => {
        const state = get();
        const defaults = INVESTMENT_CATEGORIES.map((cat) => ({
          ...cat,
          ...state.investmentCategoryOverrides[cat.id],
        }));
        const cats = [...defaults, ...state.customInvestmentCategories];
        const order = state.investmentCategoryOrder;
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
        investmentCategoryOverrides: state.investmentCategoryOverrides,
        customInvestmentCategories: state.customInvestmentCategories,
        expenseCategoryOrder: state.expenseCategoryOrder,
        incomeCategoryOrder: state.incomeCategoryOrder,
        businessExpenseCategoryOrder: state.businessExpenseCategoryOrder,
        businessIncomeCategoryOrder: state.businessIncomeCategoryOrder,
        investmentCategoryOrder: state.investmentCategoryOrder,
      }),
    }
  )
);
