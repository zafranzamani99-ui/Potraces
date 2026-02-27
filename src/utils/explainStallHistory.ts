import { StallSession } from '../types';

/**
 * Rule-based insight generator for stall history patterns.
 * Looks across multiple sessions for trends.
 * Returns a calm, observational sentence — never advice or judgement.
 */
export const explainStallHistory = (sessions: StallSession[]): string | null => {
  const closed = sessions.filter((s) => !s.isActive && s.closedAt);
  if (closed.length < 2) return null;

  // Sort by date, newest first
  const sorted = [...closed].sort(
    (a, b) => (b.closedAt?.getTime() || 0) - (a.closedAt?.getTime() || 0)
  );

  const totalRevenue = sorted.reduce((sum, s) => sum + s.totalRevenue, 0);
  const avgRevenue = totalRevenue / sorted.length;

  // Compare last session to average
  const lastSession = sorted[0];
  const lastRevenue = lastSession.totalRevenue;

  // Trend: last 3 vs previous 3
  if (sorted.length >= 6) {
    const recent3 = sorted.slice(0, 3);
    const prev3 = sorted.slice(3, 6);
    const recentAvg = recent3.reduce((s, ss) => s + ss.totalRevenue, 0) / 3;
    const prevAvg = prev3.reduce((s, ss) => s + ss.totalRevenue, 0) / 3;

    if (recentAvg > prevAvg * 1.2) {
      return 'recent sessions are trending up.';
    }
    if (recentAvg < prevAvg * 0.8) {
      return 'recent sessions have been quieter than usual.';
    }
  }

  // Best day pattern
  if (sorted.length >= 5) {
    const dayTotals: Record<number, { count: number; total: number }> = {};
    sorted.forEach((s) => {
      const day = s.startedAt.getDay();
      if (!dayTotals[day]) dayTotals[day] = { count: 0, total: 0 };
      dayTotals[day].count++;
      dayTotals[day].total += s.totalRevenue;
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const bestDay = Object.entries(dayTotals)
      .filter(([, v]) => v.count >= 2)
      .sort(([, a], [, b]) => b.total / b.count - a.total / a.count)[0];

    if (bestDay) {
      const dayAvg = bestDay[1].total / bestDay[1].count;
      if (dayAvg > avgRevenue * 1.3) {
        return `${dayNames[Number(bestDay[0])]}s tend to be your strongest.`;
      }
    }
  }

  // Rainy day pattern
  const rainySessions = sorted.filter((s) => s.condition === 'rainy');
  if (rainySessions.length >= 2) {
    const rainyAvg = rainySessions.reduce((sum, s) => sum + s.totalRevenue, 0) / rainySessions.length;
    if (rainyAvg < avgRevenue * 0.7) {
      return 'rainy days bring in less — that\'s normal.';
    }
  }

  // Top product across sessions
  const productTotals: Record<string, { name: string; total: number }> = {};
  sorted.forEach((s) => {
    s.sales.forEach((sale) => {
      if (!productTotals[sale.productId]) {
        productTotals[sale.productId] = { name: sale.productName, total: 0 };
      }
      productTotals[sale.productId].total += sale.total;
    });
  });

  const topProduct = Object.values(productTotals).sort((a, b) => b.total - a.total)[0];
  if (topProduct && Object.keys(productTotals).length > 1) {
    const ratio = topProduct.total / totalRevenue;
    if (ratio > 0.5) {
      return `${topProduct.name} makes up more than half your revenue.`;
    }
  }

  // Last session comparison
  if (lastRevenue > avgRevenue * 1.3) {
    return 'last session was above your usual.';
  }
  if (lastRevenue < avgRevenue * 0.7 && sorted.length >= 3) {
    return 'last session was quieter than average.';
  }

  // Lifetime milestone
  if (sorted.length === 10) {
    return '10 sessions in — you\'re building a rhythm.';
  }
  if (sorted.length === 50) {
    return '50 sessions. that\'s real consistency.';
  }

  return `${sorted.length} sessions, RM${avgRevenue.toFixed(0)} average.`;
};
