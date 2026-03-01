import { BusinessTransaction, OnTheRoadDetails } from '../types';

export function explainOnTheRoadMonth(
  currentMonth: {
    earned: number;
    costs: number;
    net: number;
    transactions: BusinessTransaction[];
  },
  previousMonths: Array<{ earned: number; costs: number; net: number }>,
  roadDetails: OnTheRoadDetails
): string | null {
  const { earned, costs, net } = currentMonth;

  // Zero earnings — stay silent
  if (earned === 0 && costs === 0) return null;

  // Need at least 2 months with data for average-based conditions
  const monthsWithData = previousMonths.filter((m) => m.earned + m.costs > 0);
  const hasEnoughHistory = monthsWithData.length >= 2;

  const avgNet = hasEnoughHistory
    ? monthsWithData.reduce((s, m) => s + m.net, 0) / monthsWithData.length
    : 0;

  const avgCostPercentage = hasEnoughHistory
    ? monthsWithData
        .filter((m) => m.earned > 0)
        .map((m) => (m.costs / m.earned) * 100)
        .reduce((a, b, _, arr) => a + b / arr.length, 0)
    : 0;

  const currentCostPercentage = earned > 0 ? (costs / earned) * 100 : 0;

  // Find highest cost category
  const costTxns = currentMonth.transactions.filter((t) => t.roadTransactionType === 'cost');
  const categoryTotals: Record<string, number> = {};
  for (const t of costTxns) {
    const key = t.costCategory === 'other' && t.costCategoryOther
      ? t.costCategoryOther
      : t.costCategory || 'other';
    categoryTotals[key] = (categoryTotals[key] || 0) + t.amount;
  }
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const highestCategory = sortedCategories.length > 0 ? sortedCategories[0][0] : null;

  // 1. Costs took a bigger cut
  if (hasEnoughHistory && earned > 0 && currentCostPercentage - avgCostPercentage >= 10 && highestCategory) {
    return `costs took a bigger cut this month — mostly ${highestCategory}.`;
  }

  // 2. Net above average
  if (hasEnoughHistory && avgNet > 0 && net > avgNet) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate();
    if (daysLeft > 0) {
      return `already kept more than your usual month — and there's still ${daysLeft} days left.`;
    }
  }

  // 3. Single category dominates
  if (costs > 0 && sortedCategories.length > 0) {
    const topAmount = sortedCategories[0][1];
    if (topAmount / costs >= 0.6) {
      return `${sortedCategories[0][0]} was most of your costs this month.`;
    }
  }

  // 4. Low cost month
  if (hasEnoughHistory && earned > 0 && avgCostPercentage - currentCostPercentage >= 10) {
    return `costs were lighter this month — more of what came in stayed.`;
  }

  // 5. Net earnings dip — silence (anxiety rule)
  if (hasEnoughHistory && net < avgNet) {
    return null;
  }

  // 6. Consistent month
  if (hasEnoughHistory && avgNet > 0 && Math.abs(net - avgNet) / avgNet <= 0.1) {
    return `about the same as your usual month.`;
  }

  // 7. Default — silence
  return null;
}
