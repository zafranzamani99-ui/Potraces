import { useMemo } from 'react';
import { useSellerStore } from '../store/sellerStore';
import { Season } from '../types';
import { startOfDay, differenceInDays, format } from 'date-fns';

export interface DayEntry {
  date: string;
  income: number;
  costs: number;
  orderCount: number;
  cumulativeIncome: number;
  cumulativeCosts: number;
  cumulativeKept: number;
}

export interface SeasonInsights {
  dayNumber: number;
  kept: number;
  income: number;
  costs: number;
  totalOrders: number;
  unpaidCount: number;
  unpaidAmount: number;
  targetPct: number | null;
  breakEvenDay: number | null;
  bestDay: { date: Date; amount: number; dayNumber: number } | null;
  dailySeries: DayEntry[];
  todaysCameIn: number;
  todaysOrderCount: number;
  vsAverage: number | null;
  topProducts: { name: string; revenue: number; quantity: number }[];
}

export function useSeasonInsights(season: Season | null): SeasonInsights | null {
  const orders = useSellerStore((s) => s.orders);
  const ingredientCosts = useSellerStore((s) => s.ingredientCosts);

  return useMemo(() => {
    if (!season) return null;

    const seasonOrders = orders.filter((o) => o.seasonId === season.id);
    const seasonCosts = ingredientCosts.filter((c) => c.seasonId === season.id);
    const paidOrders = seasonOrders.filter((o) => o.isPaid);

    const start = startOfDay(season.startDate instanceof Date ? season.startDate : new Date(season.startDate));
    const dayNumber = Math.max(1, differenceInDays(new Date(), start) + 1);

    const income = paidOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalCosts = seasonCosts.reduce((s, c) => s + c.amount, 0);
    const kept = income - totalCosts;
    const unpaid = seasonOrders.filter((o) => !o.isPaid);
    const targetPct = season.revenueTarget && season.revenueTarget > 0
      ? (income / season.revenueTarget) * 100
      : null;

    const dayMap = new Map<string, { income: number; costs: number; orderCount: number }>();
    for (const o of paidOrders) {
      const d = format(o.date instanceof Date ? o.date : new Date(o.date), 'yyyy-MM-dd');
      const entry = dayMap.get(d) || { income: 0, costs: 0, orderCount: 0 };
      entry.income += o.totalAmount;
      entry.orderCount++;
      dayMap.set(d, entry);
    }
    for (const c of seasonCosts) {
      const d = format(c.date instanceof Date ? c.date : new Date(c.date), 'yyyy-MM-dd');
      const entry = dayMap.get(d) || { income: 0, costs: 0, orderCount: 0 };
      entry.costs += c.amount;
      dayMap.set(d, entry);
    }

    const allDates = [...dayMap.keys()].sort();
    let cumIncome = 0;
    let cumCosts = 0;
    const dailySeries: DayEntry[] = allDates.map((date) => {
      const e = dayMap.get(date)!;
      cumIncome += e.income;
      cumCosts += e.costs;
      return {
        date,
        income: e.income,
        costs: e.costs,
        orderCount: e.orderCount,
        cumulativeIncome: cumIncome,
        cumulativeCosts: cumCosts,
        cumulativeKept: cumIncome - cumCosts,
      };
    });

    let breakEvenDay: number | null = null;
    if (totalCosts > 0) {
      for (const entry of dailySeries) {
        if (entry.cumulativeCosts > 0 && entry.cumulativeIncome >= entry.cumulativeCosts) {
          breakEvenDay = differenceInDays(new Date(entry.date), start) + 1;
          break;
        }
      }
    }

    let bestDay: SeasonInsights['bestDay'] = null;
    for (const entry of dailySeries) {
      if (entry.income > 0 && (!bestDay || entry.income > bestDay.amount)) {
        const d = new Date(entry.date);
        bestDay = { date: d, amount: entry.income, dayNumber: differenceInDays(d, start) + 1 };
      }
    }

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const todayEntry = dayMap.get(todayKey);
    const todaysCameIn = todayEntry?.income || 0;
    const todaysOrderCount = todayEntry?.orderCount || 0;

    const daysWithIncome = dailySeries.filter((d) => d.income > 0).length;
    const avgDailyIncome = daysWithIncome > 0 ? income / daysWithIncome : 0;
    const vsAverage = avgDailyIncome > 0 && todaysCameIn > 0
      ? ((todaysCameIn - avgDailyIncome) / avgDailyIncome) * 100
      : null;

    const prodMap = new Map<string, { name: string; revenue: number; quantity: number }>();
    for (const o of paidOrders) {
      for (const item of o.items) {
        const key = item.productId || item.productName;
        const entry = prodMap.get(key) || { name: item.productName, revenue: 0, quantity: 0 };
        entry.revenue += item.unitPrice * item.quantity;
        entry.quantity += item.quantity;
        prodMap.set(key, entry);
      }
    }
    const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
      dayNumber,
      kept,
      income,
      costs: totalCosts,
      totalOrders: seasonOrders.length,
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s, o) => s + o.totalAmount, 0),
      targetPct,
      breakEvenDay,
      bestDay,
      dailySeries,
      todaysCameIn,
      todaysOrderCount,
      vsAverage,
      topProducts,
    };
  }, [season, orders, ingredientCosts]);
}
