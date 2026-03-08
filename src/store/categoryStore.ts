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

// ─── Module-level caches for getter memoization ──────────────
let _expenseCategoriesCache: { key: string; result: CategoryOption[] } | null = null;
let _incomeCategoriesCache: { key: string; result: CategoryOption[] } | null = null;
let _investmentCategoriesCache: { key: string; result: CategoryOption[] } | null = null;

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
        const overrides = mode === 'business' ? state.businessExpenseCategoryOverrides : state.expenseCategoryOverrides;
        const custom = mode === 'business' ? state.customBusinessExpenseCategories : state.customExpenseCategories;
        const order = mode === 'business' ? state.businessExpenseCategoryOrder : state.expenseCategoryOrder;

        const cacheKey = mode + '|' + custom.length + '|' + custom.map(c => c.id).join(',') + '|' + order.join(',') + '|' + JSON.stringify(overrides);
        if (_expenseCategoriesCache && _expenseCategoriesCache.key === cacheKey) {
          return _expenseCategoriesCache.result;
        }

        const defaults = (mode === 'business' ? BUSINESS_EXPENSE_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => ({
          ...cat,
          ...overrides[cat.id],
        }));
        const cats = [...defaults, ...custom];
        if (order.length > 0) {
          const orderMap = new Map(order.map((id, i) => [id, i]));
          cats.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
        }
        _expenseCategoriesCache = { key: cacheKey, result: cats };
        return cats;
      },

      getIncomeCategories: (mode = 'personal') => {
        const state = get();
        const overrides = mode === 'business' ? state.businessIncomeCategoryOverrides : state.incomeCategoryOverrides;
        const custom = mode === 'business' ? state.customBusinessIncomeCategories : state.customIncomeCategories;
        const order = mode === 'business' ? state.businessIncomeCategoryOrder : state.incomeCategoryOrder;

        const cacheKey = mode + '|' + custom.length + '|' + custom.map(c => c.id).join(',') + '|' + order.join(',') + '|' + JSON.stringify(overrides);
        if (_incomeCategoriesCache && _incomeCategoriesCache.key === cacheKey) {
          return _incomeCategoriesCache.result;
        }

        const defaults = (mode === 'business' ? BUSINESS_INCOME_CATEGORIES : INCOME_CATEGORIES).map((cat) => ({
          ...cat,
          ...overrides[cat.id],
        }));
        const cats = [...defaults, ...custom];
        if (order.length > 0) {
          const orderMap = new Map(order.map((id, i) => [id, i]));
          cats.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
        }
        _incomeCategoriesCache = { key: cacheKey, result: cats };
        return cats;
      },

      getInvestmentCategories: () => {
        const state = get();
        const overrides = state.investmentCategoryOverrides;
        const custom = state.customInvestmentCategories;
        const order = state.investmentCategoryOrder;

        const cacheKey = custom.length + '|' + custom.map(c => c.id).join(',') + '|' + order.join(',') + '|' + JSON.stringify(overrides);
        if (_investmentCategoriesCache && _investmentCategoriesCache.key === cacheKey) {
          return _investmentCategoriesCache.result;
        }

        const defaults = INVESTMENT_CATEGORIES.map((cat) => ({
          ...cat,
          ...overrides[cat.id],
        }));
        const cats = [...defaults, ...custom];
        if (order.length > 0) {
          const orderMap = new Map(order.map((id, i) => [id, i]));
          cats.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
        }
        _investmentCategoriesCache = { key: cacheKey, result: cats };
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
