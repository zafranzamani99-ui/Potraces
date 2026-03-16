import { shallow } from 'zustand/shallow';
import { useCategoryStore } from '../store/categoryStore';
import { useAppStore } from '../store/appStore';
import { CategoryOption } from '../types';

export function useCategories(
  type: 'expense' | 'income' | 'investment',
  modeOverride?: 'personal' | 'business'
): CategoryOption[] {
  const currentMode = useAppStore((s) => s.mode);
  const mode = modeOverride ?? currentMode;

  const getExpense = useCategoryStore((s) => s.getExpenseCategories);
  const getIncome = useCategoryStore((s) => s.getIncomeCategories);
  const getInvestment = useCategoryStore((s) => s.getInvestmentCategories);

  // Subscribe to the underlying data so we re-render on changes
  useCategoryStore((s) => {
    if (type === 'investment') {
      return [s.investmentCategoryOverrides, s.customInvestmentCategories, s.investmentCategoryOrder];
    }
    if (mode === 'business') {
      return type === 'expense'
        ? [s.businessExpenseCategoryOverrides, s.customBusinessExpenseCategories]
        : [s.businessIncomeCategoryOverrides, s.customBusinessIncomeCategories];
    }
    return type === 'expense'
      ? [s.expenseCategoryOverrides, s.customExpenseCategories]
      : [s.incomeCategoryOverrides, s.customIncomeCategories];
  }, shallow);

  if (type === 'investment') return getInvestment();
  return type === 'expense' ? getExpense(mode) : getIncome(mode);
}
