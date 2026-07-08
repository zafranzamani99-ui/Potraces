/**
 * Locale-tolerant money parser for free-text amounts (Shortcut number pads,
 * deep links). Malay/European keyboards emit comma decimals — naive
 * strip-non-digits turns "12,5" into 125 (a 10× overcharge). Rules:
 *   - both "." and "," present → the LAST one typed is the decimal separator
 *   - only "," → decimal if followed by 1–2 trailing digits, else thousands
 *   - bounds: 0 < amount ≤ 1,000,000 (fat-finger/abuse guard)
 * Returns the amount rounded to 2dp, or null when unparseable/out of bounds.
 * NOTE: mirrored in supabase/functions/quick-log/index.ts (Deno) — keep in sync.
 */
export function parseAmountLoose(raw: unknown): number | null {
  let s = String(raw ?? '').trim().replace(/\s+/g, '');
  if (!s || s.startsWith('-')) return null; // never coerce a negative to positive
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Mixed separators: later one is the decimal point, the other is grouping.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(/,/g, '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // Comma-only: decimal when it looks like cents, grouping otherwise.
    s = /,\d{1,2}$/.test(s) ? s.replace(/,/g, '.') : s.replace(/,/g, '');
  }
  s = s.replace(/[^0-9.]/g, '');
  // Multiple dots (e.g. "1.234.56" after cleanup): keep the last as decimal.
  const parts = s.split('.');
  if (parts.length > 2) s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  if (!(rounded > 0) || rounded > 1_000_000) return null;
  return rounded;
}
