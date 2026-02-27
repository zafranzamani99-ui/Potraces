import { BusinessTransaction, IncomeType, RiderCost } from '../types';

/**
 * Returns a single passive observation about the current business month.
 * Checks conditions in order, returns first match. No advice, no "you should".
 */
export function explainBusinessMonth(
  transactions: BusinessTransaction[],
  previous: BusinessTransaction[],
  incomeType: IncomeType,
  riderCosts?: RiderCost[]
): string | null {
  if (transactions.length === 0) return null;

  const currentIncome = transactions.filter((t) => t.type === 'income');
  const previousIncome = previous.filter((t) => t.type === 'income');
  const currentCosts = transactions.filter((t) => t.type === 'cost');

  const netCurrent =
    currentIncome.reduce((s, t) => s + t.amount, 0) -
    currentCosts.reduce((s, t) => s + t.amount, 0) -
    (riderCosts || []).reduce((s, r) => s + r.amount, 0);

  const previousCosts = previous.filter((t) => t.type === 'cost');
  const netPrevious =
    previousIncome.reduce((s, t) => s + t.amount, 0) -
    previousCosts.reduce((s, t) => s + t.amount, 0);

  // Shared conditions
  if (netPrevious > 0 && netCurrent < netPrevious * 0.7) {
    return "Slower than last month. That happens.";
  }

  if (netPrevious > 0 && netCurrent > netPrevious * 1.3) {
    return "Stronger month than usual.";
  }

  if (currentIncome.length >= 3) {
    return "Income came in parts this month \u2014 that's normal for this kind of work.";
  }

  // Freelance specific
  if (incomeType === 'freelance') {
    const clientIds = new Set(currentIncome.filter((t) => t.clientId).map((t) => t.clientId));
    if (clientIds.size === 1) {
      return "All income came from one client this month. Worth keeping others warm.";
    }

    // Check for 3+ week gap with no income
    const sorted = [...currentIncome].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime();
      if (gap > 21 * 24 * 60 * 60 * 1000) {
        return "There was a quiet stretch mid-month. Common in freelance work.";
      }
    }
  }

  // Rider specific
  if (incomeType === 'rider' && riderCosts) {
    const grossIncome = currentIncome.reduce((s, t) => s + t.amount, 0);
    const totalCosts = riderCosts.reduce((s, r) => s + r.amount, 0);

    if (grossIncome > 0 && totalCosts / grossIncome > 0.3) {
      const costByType: Record<string, number> = {};
      for (const c of riderCosts) {
        costByType[c.type] = (costByType[c.type] || 0) + c.amount;
      }
      const topCost = Object.entries(costByType).sort((a, b) => b[1] - a[1])[0];
      return `Costs took a bigger cut this month \u2014 mostly ${topCost?.[0] || 'expenses'}.`;
    }

    // Best earning day was weekend
    const byDay: Record<number, number> = {};
    for (const t of currentIncome) {
      const d = new Date(t.date).getDay();
      byDay[d] = (byDay[d] || 0) + t.amount;
    }
    const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    if (bestDay && (Number(bestDay[0]) === 0 || Number(bestDay[0]) === 6)) {
      return "Weekends were your strongest days this month.";
    }
  }

  // Part-time specific
  if (incomeType === 'parttime') {
    const mainStream = currentIncome.filter((t) => !t.streamId || t.streamId === 'main');
    const sideStream = currentIncome.filter((t) => t.streamId && t.streamId !== 'main');
    const mainTotal = mainStream.reduce((s, t) => s + t.amount, 0);
    const sideTotal = sideStream.reduce((s, t) => s + t.amount, 0);
    if (sideTotal > mainTotal && sideTotal > 0) {
      return "Side income was actually higher than your main job this month.";
    }
  }

  // Slow month normalization — final safety net
  const prevNetPositive = netPrevious > 0;
  if (prevNetPositive && netCurrent < netPrevious * 0.8 && netCurrent > 0) {
    return "Slower month than usual. That's part of how this kind of work goes.";
  }

  return null;
}
