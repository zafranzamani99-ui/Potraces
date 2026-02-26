import { useCategoryStore } from '../store/categoryStore';
import { CategoryOption } from '../types';

export function useCategories(type: 'expense' | 'income'): CategoryOption[] {
  const getExpense = useCategoryStore((s) => s.getExpenseCategories);
  const getIncome = useCategoryStore((s) => s.getIncomeCategories);

  // Subscribe to the underlying data so we re-render on changes
  useCategoryStore((s) =>
    type === 'expense'
      ? [s.expenseCategoryOverrides, s.customExpenseCategories]
      : [s.incomeCategoryOverrides, s.customIncomeCategories]
  );

  return type === 'expense' ? getExpense() : getIncome();
}
