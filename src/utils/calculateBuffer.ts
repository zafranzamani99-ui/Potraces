import { Transaction } from '../types';
import { subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

export function calculateBuffer(
  currentSavings: number,
  transactions: Transaction[],
  months: number = 3
): { months: number; label: string } {
  const now = new Date();
  let totalSpend = 0;
  let activeMonths = 0;

  for (let i = 1; i <= months; i++) {
    const ms = startOfMonth(subMonths(now, i));
    const me = endOfMonth(subMonths(now, i));
    const monthExpenses = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          isWithinInterval(t.date instanceof Date ? t.date : new Date(t.date), { start: ms, end: me })
      )
      .reduce((sum, t) => sum + t.amount, 0);
    if (monthExpenses > 0) activeMonths++;
    totalSpend += monthExpenses;
  }

  if (activeMonths === 0 || totalSpend === 0) {
    return { months: 0, label: '' };
  }

  const avgMonthlySpend = totalSpend / activeMonths;
  const bufferMonths = Math.round((currentSavings / avgMonthlySpend) * 10) / 10;

  let label: string;
  if (bufferMonths < 1) {
    label = 'less than a month covered';
  } else if (bufferMonths <= 3) {
    label = `${bufferMonths} months covered`;
  } else {
    label = 'more than 3 months covered';
  }

  return { months: bufferMonths, label };
}
