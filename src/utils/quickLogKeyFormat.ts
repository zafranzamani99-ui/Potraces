/** Pure, native-free key formatting so it is unit-testable under tsx. */
export const QUICK_LOG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I/L/O/U)

/** Map random bytes → "QLOG-" + Crockford base32 body (one char per byte). */
export function encodeQuickLogKey(bytes: Uint8Array): string {
  let body = '';
  for (const b of bytes) body += QUICK_LOG_ALPHABET[b % QUICK_LOG_ALPHABET.length];
  return `QLOG-${body}`;
}
