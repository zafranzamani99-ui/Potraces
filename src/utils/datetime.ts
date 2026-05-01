/**
 * Malaysia-centric date helpers.
 *
 * Potraces is a Malaysian finance app — all financial records should bucket
 * into the user's local Malaysian day, regardless of device timezone.
 * A user travelling to UTC-5 who logs a midnight expense should still see it
 * on the correct Malaysian calendar day when they return home.
 *
 * Strategy: record the timestamp in wall-clock MYT (UTC+8). For most users
 * this matches device time exactly. For travellers it normalizes correctly.
 */

const MYT_OFFSET_MINUTES = 8 * 60; // UTC+8

/**
 * Return a Date whose local fields (year/month/day/hour) represent the
 * current moment in Kuala Lumpur, regardless of device timezone.
 *
 * Note: the returned Date is still a JS Date — callers that use
 * `.toISOString()` will round-trip through UTC correctly. For display,
 * use the local getters which now reflect MYT wall-clock.
 */
export function nowMYT(): Date {
  const now = new Date();
  // Shift the timestamp so that local getters (getFullYear, getDate, etc.)
  // return MYT wall-clock on the user's device.
  const deviceOffsetMin = now.getTimezoneOffset(); // minutes behind UTC
  const totalOffsetMs = (deviceOffsetMin + MYT_OFFSET_MINUTES) * 60 * 1000;
  return new Date(now.getTime() + totalOffsetMs);
}

/**
 * Normalize an arbitrary Date to MYT wall-clock (same semantics as nowMYT).
 */
export function toMYT(d: Date): Date {
  const deviceOffsetMin = d.getTimezoneOffset();
  const totalOffsetMs = (deviceOffsetMin + MYT_OFFSET_MINUTES) * 60 * 1000;
  return new Date(d.getTime() + totalOffsetMs);
}
