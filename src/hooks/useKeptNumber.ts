/**
 * Hook that calculates the "Kept Number" — how much the user kept this month.
 * Kept = income - expenses for the current month.
 * Also provides comparison with last month's kept at the same point in time.
 */

import { useMemo } from 'react';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { usePersonalStore } from '../store/personalStore';

interface KeptSummary {
  keptThisMonth: number;
  keptLastMonth: number;
  incomeThisMonth: number;
  expensesThisMonth: number;
  trend: 'up' | 'down' | 'same';
  trendPercent: number;
}

export function useKeptNumber(): KeptSummary {
  const transactions = usePersonalStore((s) => s.transactions);

  return useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Single pass over all transactions
    let incomeThisMonth = 0, expensesThisMonth = 0;
    let lastMonthIncome = 0, lastMonthExpenses = 0;

    for (const t of transactions) {
      if (isWithinInterval(t.date, { start: monthStart, end: monthEnd })) {
        if (t.type === 'income') incomeThisMonth += t.amount;
        else if (t.type === 'expense') expensesThisMonth += t.amount;
      } else if (isWithinInterval(t.date, { start: lastMonthStart, end: lastMonthEnd })) {
        if (t.type === 'income') lastMonthIncome += t.amount;
        else if (t.type === 'expense') lastMonthExpenses += t.amount;
      }
    }

    const keptThisMonth = incomeThisMonth - expensesThisMonth;
    const keptLastMonth = lastMonthIncome - lastMonthExpenses;

    const diff = keptThisMonth - keptLastMonth;
    const trend: 'up' | 'down' | 'same' =
      Math.abs(diff) < 1 ? 'same' : diff > 0 ? 'up' : 'down';

    const trendPercent =
      keptLastMonth !== 0
        ? Math.round(Math.abs(diff / keptLastMonth) * 100)
        : 0;

    return {
      keptThisMonth,
      keptLastMonth,
      incomeThisMonth,
      expensesThisMonth,
      trend,
      trendPercent,
    };
  }, [transactions]);
}
