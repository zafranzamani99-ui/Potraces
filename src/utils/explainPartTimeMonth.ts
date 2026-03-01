import { BusinessTransaction, PartTimeJobDetails } from '../types';

/**
 * Produce a single calm insight about the part-timer's month.
 * First match wins. Returns a string or null.
 */
export function explainPartTimeMonth(
  currentMonth: { main: number; side: number; transactions: BusinessTransaction[] },
  previousMonths: Array<{ main: number; side: number }>, // last 6 months
  jobDetails: PartTimeJobDetails
): string | null {
  const { main, side, transactions } = currentMonth;
  const total = main + side;

  // Zero total — silence
  if (total === 0 && transactions.length === 0) return null;

  // Not enough history for average-based conditions
  const hasEnoughHistory = previousMonths.length >= 2;

  // Calculate averages from previous months (only months with data)
  let avgMain = 0;
  let avgSide = 0;
  let avgSidePercentage = 0;

  if (hasEnoughHistory) {
    const monthsWithData = previousMonths.filter((m) => m.main + m.side > 0);
    if (monthsWithData.length > 0) {
      avgMain = monthsWithData.reduce((s, m) => s + m.main, 0) / monthsWithData.length;
      avgSide = monthsWithData.reduce((s, m) => s + m.side, 0) / monthsWithData.length;
      const percentages = monthsWithData.map((m) => {
        const t = m.main + m.side;
        return t > 0 ? (m.side / t) * 100 : 0;
      });
      avgSidePercentage = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    }
  }

  const sidePercentage = total > 0 ? (side / total) * 100 : 0;

  // 1. Side exceeds main
  if (side > 0 && main > 0 && side > main) {
    return 'side income was actually higher than your main job this month.';
  }

  // 2. Side share unusually high (15+ percentage points above average)
  if (hasEnoughHistory && side > 0 && sidePercentage > avgSidePercentage + 15) {
    return `side income made up ${Math.round(sidePercentage)}% this month — more than usual.`;
  }

  // 3. Main job missing + pay day passed
  if (jobDetails.payDay && jobDetails.expectedMonthlyPay && main === 0) {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const effectivePayDay = Math.min(jobDetails.payDay, daysInMonth);

    if (dayOfMonth > effectivePayDay) {
      const daysPast = dayOfMonth - effectivePayDay;
      return `main job hasn't come in yet — pay day was ${daysPast} days ago.`;
    }
  }

  // 4. Consistent month (both within 10% of respective averages)
  if (hasEnoughHistory && avgMain > 0 && avgSide > 0 && main > 0 && side > 0) {
    const mainDiff = Math.abs(main - avgMain) / avgMain;
    const sideDiff = Math.abs(side - avgSide) / avgSide;
    if (mainDiff <= 0.1 && sideDiff <= 0.1) {
      return 'steady month — both streams about the same as usual.';
    }
  }

  // 5. Side income dip — silence (anxiety rule)
  if (hasEnoughHistory && avgSide > 0 && side < avgSide * 0.5) {
    return null;
  }

  // 6. First side income this month
  const sideTransactions = transactions.filter((t) => t.incomeStream === 'side' && t.type === 'income');
  if (sideTransactions.length === 1) {
    const t = sideTransactions[0];
    const label = t.note || 'side work';
    return `first side income came in — RM${t.amount.toLocaleString()} from ${label}.`;
  }

  // 7. Default — silence
  return null;
}
