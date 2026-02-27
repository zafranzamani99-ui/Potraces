import { useCategoryStore } from '../store/categoryStore';
import { useAppStore } from '../store/appStore';
import { CategoryOption } from '../types';

export function useCategories(
  type: 'expense' | 'income',
  modeOverride?: 'personal' | 'business'
): CategoryOption[] {
  const currentMode = useAppStore((s) => s.mode);
  const mode = modeOverride ?? currentMode;

  const getExpense = useCategoryStore((s) => s.getExpenseCategories);
  const getIncome = useCategoryStore((s) => s.getIncomeCategories);

  // Subscribe to the underlying data so we re-render on changes
  useCategoryStore((s) => {
    if (mode === 'business') {
      return type === 'expense'
        ? [s.businessExpenseCategoryOverrides, s.customBusinessExpenseCategories]
        : [s.businessIncomeCategoryOverrides, s.customBusinessIncomeCategories];
    }
    return type === 'expense'
      ? [s.expenseCategoryOverrides, s.customExpenseCategories]
      : [s.incomeCategoryOverrides, s.customIncomeCategories];
  });

  return type === 'expense' ? getExpense(mode) : getIncome(mode);
}
