import { BusinessTransaction, FreelancerClient } from '../types';
import { differenceInDays, endOfMonth } from 'date-fns';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/**
 * Produce a single calm insight about the freelancer's month.
 * First match wins. Returns null when silence is better.
 */
export function explainFreelancerMonth(
  currentMonthPayments: BusinessTransaction[],
  previousMonthsPayments: BusinessTransaction[], // last 6 months
  clients: FreelancerClient[],
  getClientAverageGap: (clientId: string) => number | null,
  getClientLastPayment: (clientId: string) => BusinessTransaction | null
): string | null {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = endOfMonth(now).getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  const incomePayments = currentMonthPayments.filter((t) => t.type === 'income');
  const currentTotal = incomePayments.reduce((s, t) => s + t.amount, 0);

  // 6-month average
  const allPrev = previousMonthsPayments.filter((t) => t.type === 'income');
  let monthTotals: Record<string, number> = {};
  for (const t of allPrev) {
    const d = toDate(t.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthTotals[key] = (monthTotals[key] || 0) + t.amount;
  }
  const monthValues = Object.values(monthTotals);
  const sixMonthAvg =
    monthValues.length > 0
      ? monthValues.reduce((a, b) => a + b, 0) / monthValues.length
      : 0;

  // 1. Single client concentration
  if (incomePayments.length > 0) {
    const clientIds = new Set(incomePayments.map((t) => t.clientId).filter(Boolean));
    if (clientIds.size === 1) {
      return 'all income came from one client this month — worth keeping others warm.';
    }
  }

  // 2. Nothing yet, past mid-month
  if (incomePayments.length === 0 && dayOfMonth > 15) {
    // Find client with shortest average gap
    const activeClients = clients.filter((c) => {
      const lp = getClientLastPayment(c.id);
      return lp !== null;
    });
    if (activeClients.length > 0) {
      let shortestGap = Infinity;
      let shortestClient: FreelancerClient | null = null;
      for (const c of activeClients) {
        const avg = getClientAverageGap(c.id);
        if (avg !== null && avg < shortestGap) {
          shortestGap = avg;
          shortestClient = c;
        }
      }
      if (shortestClient) {
        return `nothing's come in yet — ${shortestClient.name} usually pays around now.`;
      }
    }
  }

  // 3. Already above average
  if (sixMonthAvg > 0 && currentTotal > sixMonthAvg) {
    return `already above your usual month — and there's still ${daysLeft} days left.`;
  }

  // 4. New client this month
  const newClientPayment = incomePayments.find((t) => {
    if (!t.clientId) return false;
    // Check if this client has any payments before this month
    const prevFromClient = allPrev.filter((p) => p.clientId === t.clientId);
    return prevFromClient.length === 0;
  });
  if (newClientPayment && newClientPayment.clientId) {
    const client = clients.find((c) => c.id === newClientPayment.clientId);
    if (client) {
      return `a new client paid this month — ${client.name}.`;
    }
  }

  // 5. Gap alert — active client past average gap × 1.5
  for (const client of clients) {
    const avgGap = getClientAverageGap(client.id);
    const lastPayment = getClientLastPayment(client.id);
    if (avgGap !== null && lastPayment) {
      const daysSince = differenceInDays(now, toDate(lastPayment.date));
      if (daysSince > avgGap * 1.5) {
        return `it's been longer than usual since ${client.name} paid.`;
      }
    }
  }

  // 6. Income dip — return null. Silence for dips.
  // 7. Default — null
  return null;
}
