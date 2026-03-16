import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { usePersonalStore } from '../store/personalStore';
import { useCategories } from './useCategories';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  differenceInDays,
  startOfDay,
  isWithinInterval,
} from 'date-fns';

export interface FinancialInsights {
  // Spending
  monthlySpent: number;
  monthlyIncome: number;
  cashFlow: number; // income - expenses
  savingsRate: number; // (income - expenses) / income * 100

  // Velocity
  spendingVelocity: number; // percentage of last month's total, pro-rated to current day
  daysInMonth: number;
  dayOfMonth: number;

  // Categories
  topCategory: { name: string; amount: number; color: string } | null;

  // Streaks
  noSpendStreak: number; // consecutive days without expense, counting back from today
  noSpendDaysThisMonth: number; // total days without spending this month

  // Upcoming
  upcomingBills: { name: string; amount: number; daysUntil: number }[];
  upcomingBillsTotal: number;

  // Goals
  totalGoalProgress: number; // percentage across all goals
  activeGoals: number;

  // Wellness (0-100, computed from multiple factors)
  wellnessScore: number;
}

export function useFinancialInsights(): FinancialInsights {
  const { transactions, subscriptions, budgets, goals } = usePersonalStore(
    (s) => ({ transactions: s.transactions, subscriptions: s.subscriptions, budgets: s.budgets, goals: s.goals }),
    shallow
  );
  const expenseCategories = useCategories('expense', 'personal');

  return useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const daysInMonth = differenceInDays(monthEnd, monthStart) + 1;
    const dayOfMonth = differenceInDays(today, monthStart) + 1;

    // ── Monthly transactions ──────────────────────────────────
    const monthlyTransactions = transactions.filter((t) =>
      isWithinInterval(t.date, { start: monthStart, end: monthEnd })
    );

    const monthlyExpenses = monthlyTransactions.filter((t) => t.type === 'expense');
    const monthlySpent = monthlyExpenses.reduce((sum, t) => sum + t.amount, 0);
    const monthlyIncome = monthlyTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const cashFlow = monthlyIncome - monthlySpent;
    const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlySpent) / monthlyIncome) * 100 : 0;

    // ── Spending velocity ─────────────────────────────────────
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const lastMonthSpent = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          isWithinInterval(t.date, { start: lastMonthStart, end: lastMonthEnd })
      )
      .reduce((sum, t) => sum + t.amount, 0);

    // Pro-rate: what percentage of last month's total have we spent at this point in the month?
    const expectedAtThisPoint = lastMonthSpent > 0 ? (dayOfMonth / daysInMonth) * lastMonthSpent : 0;
    const spendingVelocity = expectedAtThisPoint > 0 ? (monthlySpent / expectedAtThisPoint) * 100 : 0;

    // ── Top category ──────────────────────────────────────────
    const categoryTotals: Record<string, number> = {};
    for (const t of monthlyExpenses) {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    }

    let topCategory: FinancialInsights['topCategory'] = null;
    let topAmount = 0;
    for (const [catId, amount] of Object.entries(categoryTotals)) {
      if (amount > topAmount) {
        topAmount = amount;
        const catDef = expenseCategories.find((c) => c.id === catId);
        topCategory = {
          name: catDef?.name || catId,
          amount,
          color: catDef?.color || '#9CA3B4',
        };
      }
    }

    // ── No-spend streak ───────────────────────────────────────
    const expenseDatesSet = new Set<string>();
    for (const t of transactions) {
      if (t.type === 'expense') {
        expenseDatesSet.add(startOfDay(t.date).toISOString());
      }
    }

    let noSpendStreak = 0;
    let checkDay = startOfDay(now);
    // Count consecutive days backwards from today with no expenses
    while (true) {
      if (expenseDatesSet.has(checkDay.toISOString())) {
        break;
      }
      noSpendStreak++;
      checkDay = new Date(checkDay.getTime() - 86400000); // subtract 1 day
    }

    // No-spend days this month
    let noSpendDaysThisMonth = 0;
    for (let d = 0; d < dayOfMonth; d++) {
      const dayCheck = new Date(monthStart.getTime() + d * 86400000);
      if (!expenseDatesSet.has(startOfDay(dayCheck).toISOString())) {
        noSpendDaysThisMonth++;
      }
    }

    // ── Upcoming bills ────────────────────────────────────────
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
    const upcomingBills = subscriptions
      .filter(
        (s) =>
          s.isActive &&
          s.nextBillingDate >= today &&
          s.nextBillingDate <= sevenDaysFromNow
      )
      .map((s) => ({
        name: s.name,
        amount: s.amount,
        daysUntil: differenceInDays(startOfDay(s.nextBillingDate), today),
      }))
      .sort((a, b) => a.daysUntil - b.daysUntil);

    const upcomingBillsTotal = upcomingBills.reduce((sum, b) => sum + b.amount, 0);

    // ── Goals ─────────────────────────────────────────────────
    const activeGoals = goals.length;
    const totalGoalProgress =
      goals.length > 0
        ? goals.reduce((sum, g) => {
            const progress = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
            return sum + Math.min(progress, 100);
          }, 0) / goals.length
        : 0;

    // ── Wellness score ────────────────────────────────────────
    // Weighted: budget adherence 30%, savings rate 30%, no-spend days 20%, goal progress 20%

    // Budget adherence: avg of (1 - overspend ratio) across budgets, clamped 0-100
    let budgetAdherence = 100;
    if (budgets.length > 0) {
      const adherenceScores = budgets.map((b) => {
        if (b.allocatedAmount <= 0) return 100;
        const ratio = b.spentAmount / b.allocatedAmount;
        // Under budget = 100, at budget = 50, over budget = 0
        return Math.max(0, Math.min(100, (1 - (ratio - 0.5)) * 100));
      });
      budgetAdherence = adherenceScores.reduce((a, b) => a + b, 0) / adherenceScores.length;
    }

    // Savings rate score: map savingsRate to 0-100 (30% savings = 100 score)
    const savingsScore = Math.max(0, Math.min(100, (savingsRate / 30) * 100));

    // No-spend days score: ratio of no-spend days to days elapsed this month
    const noSpendScore = dayOfMonth > 0 ? (noSpendDaysThisMonth / dayOfMonth) * 100 : 0;

    // Goal progress score (already 0-100)
    const goalScore = totalGoalProgress;

    const wellnessScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          budgetAdherence * 0.3 + savingsScore * 0.3 + noSpendScore * 0.2 + goalScore * 0.2
        )
      )
    );

    return {
      monthlySpent,
      monthlyIncome,
      cashFlow,
      savingsRate,
      spendingVelocity,
      daysInMonth,
      dayOfMonth,
      topCategory,
      noSpendStreak,
      noSpendDaysThisMonth,
      upcomingBills,
      upcomingBillsTotal,
      totalGoalProgress,
      activeGoals,
      wellnessScore,
    };
  }, [transactions, subscriptions, budgets, goals, expenseCategories]);
}
