// Collectz screens — shared display helpers (dates, money, template fill).
// Kept tiny and pure so every Collectz screen formats values the same way.

/** "20 Jul 2026" — same shape as the service's announcement date. */
export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
}

/** "9:30 PM". */
export function fmtTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** "20 Jul 2026, 9:30 PM" (null-safe parts). */
export function fmtDateTime(iso: string | null | undefined): string | null {
  const parts = [fmtDate(iso), fmtTime(iso)].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** "RM 45.00". */
export function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Fill `{key}` placeholders in an i18n template. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(String(vars[k])), template);
}
