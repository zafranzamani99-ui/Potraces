/**
 * Shared money formatting for Echo cards — one source of truth used by both the
 * pure builders (sublines/details) and the renderer (hero/rows/total) so a
 * card's inline text and its right-aligned amounts always match.
 */
export function formatMoney(currency: string, n: number, decimals = 2): string {
  const sign = n < 0 ? '- ' : '';
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${currency} ${abs}`;
}

// Theme-neutral semantic tints for card icons/rows. Deliberately muted so they
// read on both the light and dark (Onyx) card surface. The accent (olive) stays
// the app's; these are only the +in / −out / caution hints.
export const CARD_COLORS = {
  in: '#5FA37E',    // money in / positive
  out: '#CE8A78',   // money out
  warn: '#D98A6B',  // overdue / caution
  muted: '#9A9A9A',
} as const;
