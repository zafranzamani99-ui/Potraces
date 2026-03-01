import { formatDistanceToNow, format, differenceInDays, differenceInMonths } from 'date-fns';

/**
 * Format amount as RM with no decimals: "RM 1,234"
 */
export function formatRM(amount: number, currency = 'RM'): string {
  return `${currency} ${Math.round(Math.abs(amount)).toLocaleString()}`;
}

/**
 * Format amount with sign: "+RM 1,234" or "\u2212RM 1,234"
 */
export function formatRMSigned(amount: number, currency = 'RM'): string {
  if (amount >= 0) {
    return `+${currency} ${Math.round(amount).toLocaleString()}`;
  }
  return `\u2212${currency} ${Math.round(Math.abs(amount)).toLocaleString()}`;
}

/**
 * Format date as relative: "today", "yesterday", "3 days ago", "Feb 12"
 */
export function formatRelativeDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffDays = differenceInDays(now, d);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return formatDistanceToNow(d, { addSuffix: true });
  return format(d, 'MMM dd');
}

/**
 * Format gap in human-readable form: "12 days", "about 2 months"
 */
export function formatGap(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.round(days / 30);
  if (months === 1) return 'about a month';
  return `about ${months} months`;
}

/**
 * Format percentage safely: "43%". Handles 0, NaN, Infinity.
 */
export function formatPercentage(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '0%';
  return `${Math.round(value)}%`;
}
