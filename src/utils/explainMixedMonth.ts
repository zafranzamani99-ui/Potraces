import { BusinessTransaction, MixedModeDetails } from '../types';

export function explainMixedMonth(
  currentMonth: {
    total: number;
    byStream: Record<string, number>;
    costs: number;
    transactions: BusinessTransaction[];
  },
  previousMonths: Array<{ total: number; byStream: Record<string, number>; costs: number }>,
  mixedDetails: MixedModeDetails
): string | null {
  const { total, byStream } = currentMonth;

  // Zero total — stay silent
  if (total === 0) return null;

  const streams = Object.entries(byStream).filter(([_, amt]) => amt > 0);
  const streamCount = streams.length;
  const multipleStreams = mixedDetails.streams.length > 1;

  // Need at least 2 months with data for average-based conditions
  const monthsWithData = previousMonths.filter((m) => m.total > 0);
  const hasEnoughHistory = monthsWithData.length >= 2;

  const avgTotal = hasEnoughHistory
    ? monthsWithData.reduce((s, m) => s + m.total, 0) / monthsWithData.length
    : 0;

  // Average stream count across previous months
  const avgStreamCount = hasEnoughHistory
    ? monthsWithData.reduce((s, m) => s + Object.keys(m.byStream).filter((k) => m.byStream[k] > 0).length, 0) / monthsWithData.length
    : 0;

  // Most consistent stream: appears in the most months
  const streamMonthCounts: Record<string, number> = {};
  const streamTotals: Record<string, number> = {};
  for (const m of previousMonths) {
    for (const [s, amt] of Object.entries(m.byStream)) {
      if (amt > 0) {
        streamMonthCounts[s] = (streamMonthCounts[s] || 0) + 1;
        streamTotals[s] = (streamTotals[s] || 0) + amt;
      }
    }
  }
  const mostConsistentStream = Object.entries(streamMonthCounts)
    .sort((a, b) => b[1] - a[1] || (streamTotals[b[0]] || 0) - (streamTotals[a[0]] || 0))
    [0]?.[0] || null;

  // Top earner this month
  const topStream = streams.sort((a, b) => b[1] - a[1])[0];

  // 1. Single stream dominance (only meaningful with multiple streams defined)
  if (multipleStreams && topStream && total > 0 && topStream[1] / total >= 0.7) {
    return `most of what came in was from ${topStream[0]} this month.`;
  }

  // 2. New stream appeared — check ALL previous months
  if (multipleStreams) {
    const allPreviousStreams = new Set<string>();
    for (const m of previousMonths) {
      for (const [s, amt] of Object.entries(m.byStream)) {
        if (amt > 0) allPreviousStreams.add(s);
      }
    }
    for (const [stream] of streams) {
      if (!allPreviousStreams.has(stream) && stream !== 'untagged') {
        return `first time earning from ${stream} — that's a new source.`;
      }
    }
  }

  // 3. More streams than usual (only meaningful with multiple streams)
  if (multipleStreams && hasEnoughHistory && streamCount >= avgStreamCount + 2) {
    return `income came from ${streamCount} sources this month — more than usual.`;
  }

  // 4. Top earner shifted (only meaningful with multiple streams)
  if (multipleStreams && hasEnoughHistory && topStream && mostConsistentStream && topStream[0] !== mostConsistentStream) {
    return `${topStream[0]} brought in the most this month — usually it's ${mostConsistentStream}.`;
  }

  // 5. Total above average
  if (hasEnoughHistory && avgTotal > 0 && total > avgTotal) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate();
    if (daysLeft > 0) {
      return `already above your usual month — and there's still ${daysLeft} days left.`;
    }
  }

  // 6. Total dip — silence (anxiety rule)
  if (hasEnoughHistory && total < avgTotal) {
    return null;
  }

  // 7. Steady month
  if (hasEnoughHistory && avgTotal > 0 && Math.abs(total - avgTotal) / avgTotal <= 0.1) {
    return `about the same as your usual month.`;
  }

  // 8. Default
  return null;
}
