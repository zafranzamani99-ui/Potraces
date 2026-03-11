/** Safely parse any value into a valid Date. Returns fallback if invalid. */
export function safeDate(val: any, fallback?: Date): Date {
  if (!val) return fallback ?? new Date();
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d.getTime()) ? (fallback ?? new Date()) : d;
}
