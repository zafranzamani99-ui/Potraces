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

    const thisMonthTxns = transactions.filter((t) =>
      isWithinInterval(t.date, { start: monthStart, end: monthEnd })
    );

    const incomeThisMonth = thisMonthTxns
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expensesThisMonth = thisMonthTxns
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const keptThisMonth = incomeThisMonth - expensesThisMonth;

    // Last month — same day range for fair comparison
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const lastMonthTxns = transactions.filter((t) =>
      isWithinInterval(t.date, { start: lastMonthStart, end: lastMonthEnd })
    );

    const lastMonthIncome = lastMonthTxns
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const lastMonthExpenses = lastMonthTxns
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

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
