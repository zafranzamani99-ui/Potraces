import { Transaction } from '../types';

/**
 * Pure function that enriches a transaction with contextual metadata.
 * No side effects, no API calls.
 */
export function enrichTransaction(
  tx: Transaction,
  recentTransactions: Transaction[]
): Transaction {
  const date = tx.date instanceof Date ? tx.date : new Date(tx.date);
  const hour = date.getHours();
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday

  // timeContext: morning < 12, afternoon 12-18, night > 18
  const timeContext: Transaction['timeContext'] =
    hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'night';

  // dayContext: Sat (6) / Sun (0) = weekend
  const dayContext: Transaction['dayContext'] =
    day === 0 || day === 6 ? 'weekend' : 'weekday';

  // sizeContext: < 20 tiny, 20-100 medium, > 100 heavy
  const sizeContext: Transaction['sizeContext'] =
    tx.amount < 20 ? 'tiny' : tx.amount <= 100 ? 'medium' : 'heavy';

  // frequencyContext: 3+ transactions within 48 hours = clustered
  const txTime = date.getTime();
  const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
  const within48h = recentTransactions.filter((r) => {
    const rDate = r.date instanceof Date ? r.date : new Date(r.date);
    return Math.abs(rDate.getTime() - txTime) <= FORTY_EIGHT_HOURS;
  });
  const frequencyContext: Transaction['frequencyContext'] =
    within48h.length >= 3 ? 'clustered' : 'isolated';

  // emotionalFlag: true if (night + weekend + tiny) OR (3+ txns within 4h same day)
  const isNightWeekendTiny =
    timeContext === 'night' && dayContext === 'weekend' && sizeContext === 'tiny';

  const FOUR_HOURS = 4 * 60 * 60 * 1000;
  const sameDayWithin4h = recentTransactions.filter((r) => {
    const rDate = r.date instanceof Date ? r.date : new Date(r.date);
    return (
      rDate.toDateString() === date.toDateString() &&
      Math.abs(rDate.getTime() - txTime) <= FOUR_HOURS
    );
  });
  const threeWithin4h = sameDayWithin4h.length >= 3;

  const emotionalFlag = isNightWeekendTiny || threeWithin4h;

  return {
    ...tx,
    timeContext,
    dayContext,
    sizeContext,
    frequencyContext,
    emotionalFlag,
  };
}
