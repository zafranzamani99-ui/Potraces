import { Transaction } from '../types';

/**
 * Returns a single passive observation about the current month's spending.
 * Checks conditions in order, returns first match. No predictions, no advice.
 */
export function explainMonth(
  current: Transaction[],
  previous: Transaction[]
): string {
  // 1. Empty
  if (current.length === 0) {
    return 'No transactions this month.';
  }

  const currentExpenses = current.filter((t) => t.type === 'expense');
  const previousExpenses = previous.filter((t) => t.type === 'expense');

  const totalCurrent = currentExpenses.reduce((sum, t) => sum + t.amount, 0);
  const totalPrevious = previousExpenses.reduce((sum, t) => sum + t.amount, 0);

  // 2. Spent > 30% more than last month
  if (totalPrevious > 0 && totalCurrent > totalPrevious * 1.3) {
    return 'You spent more than last month.';
  }

  // 3. One category > 40% of total
  if (totalCurrent > 0) {
    const byCategory: Record<string, number> = {};
    for (const t of currentExpenses) {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    }
    for (const [category, amount] of Object.entries(byCategory)) {
      if (amount / totalCurrent > 0.4) {
        return `Most of your money went to ${category}.`;
      }
    }
  }

  // 4. Weekend spending > weekday
  let weekendTotal = 0;
  let weekdayTotal = 0;
  for (const t of currentExpenses) {
    const date = t.date instanceof Date ? t.date : new Date(t.date);
    const day = date.getDay();
    if (day === 0 || day === 6) {
      weekendTotal += t.amount;
    } else {
      weekdayTotal += t.amount;
    }
  }
  if (weekendTotal > weekdayTotal) {
    return 'You tend to spend more on weekends.';
  }

  // 5. >50% transactions are tiny (< RM 20)
  const tinyCount = currentExpenses.filter((t) => t.amount < 20).length;
  if (currentExpenses.length > 0 && tinyCount / currentExpenses.length > 0.5) {
    return 'Mostly small purchases this month.';
  }

  // 6. Slow month — income lower than previous
  const currentIncome = current
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const previousIncome = previous
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  if (previousIncome > 0 && currentIncome < previousIncome * 0.8 && currentIncome > 0) {
    return "This was a tighter month. Looking at your history, quieter months happen \u2014 and they pass.";
  }

  // 7. Fallback
  return 'A fairly typical month.';
}
