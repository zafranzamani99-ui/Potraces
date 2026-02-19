/**
 * Accessibility Utilities
 * Helpers for improving app accessibility
 */

/**
 * Ensures minimum touch target size of 48pt
 * @param size Current size in pts
 * @returns Size adjusted to meet minimum 48pt
 */
export const ensureMinimumTouchTarget = (size: number): number => {
  const MINIMUM_TOUCH_TARGET = 48;
  return Math.max(size, MINIMUM_TOUCH_TARGET);
};

/**
 * Format currency for screen readers
 * @param amount Numeric amount
 * @param currency Currency symbol
 * @returns Formatted string optimized for screen readers
 */
export const formatCurrencyForScreenReader = (
  amount: number,
  currency: string
): string => {
  const formattedAmount = amount.toFixed(2);
  return `${currency} ${formattedAmount}`;
};

/**
 * Format date for screen readers
 * @param date Date object
 * @returns Human-readable date string
 */
export const formatDateForScreenReader = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Intl.DateTimeFormat('en-US', options).format(date);
};

/**
 * Format percentage for screen readers
 * @param value Percentage value (0-100)
 * @returns Formatted string like "75 percent"
 */
export const formatPercentageForScreenReader = (value: number): string => {
  return `${Math.round(value)} percent`;
};

/**
 * Create accessible label for transaction
 * @param type Transaction type
 * @param amount Amount
 * @param currency Currency symbol
 * @param category Category name
 * @param date Date of transaction
 * @returns Complete accessibility label
 */
export const createTransactionAccessibilityLabel = (
  type: 'expense' | 'income',
  amount: number,
  currency: string,
  category: string,
  date: Date
): string => {
  const typeLabel = type === 'expense' ? 'Expense' : 'Income';
  const amountLabel = formatCurrencyForScreenReader(amount, currency);
  const dateLabel = formatDateForScreenReader(date);
  return `${typeLabel}: ${amountLabel} for ${category} on ${dateLabel}`;
};

/**
 * Announce message to screen reader
 * @param message Message to announce
 * @param assertive Whether to interrupt current announcement
 */
export const announceForAccessibility = (
  message: string,
  assertive: boolean = false
): void => {
  if (typeof (global as any).AccessibilityInfo !== 'undefined') {
    (global as any).AccessibilityInfo.announceForAccessibility(message);
  }
};
