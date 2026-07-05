/**
 * Unit test for the pure key-formatting logic + hash parity. expo-crypto cannot
 * run under tsx (it pulls react-native), so we import only the native-free
 * format module and assert hash PARITY against Node's crypto — the canonical
 * reference the app's expo-crypto and the Deno function must both match.
 * Run: npx tsx scripts/test-quick-log-key.ts
 */
import { createHash } from 'node:crypto';
import { encodeQuickLogKey, QUICK_LOG_ALPHABET } from '../src/utils/quickLogKeyFormat';

let failures = 0;
const check = (n: string, c: boolean) => { if (!c) { failures++; console.error('FAIL:', n); } else console.log('ok:', n); };

// Format: deterministic for fixed bytes, correct shape + alphabet.
const bytes = new Uint8Array(24).map((_, i) => (i * 7) & 0xff);
const k = encodeQuickLogKey(bytes);
check('QLOG- prefix', k.startsWith('QLOG-'));
check('24-char body', k.slice(5).length === 24);
check('Crockford alphabet only', /^QLOG-[0-9A-HJKMNP-TV-Z]{24}$/.test(k));
check('deterministic', encodeQuickLogKey(bytes) === k);
check('alphabet excludes I/L/O/U', !/[ILOU]/.test(QUICK_LOG_ALPHABET) && QUICK_LOG_ALPHABET.length === 32);

// Hash parity: the canonical SHA-256 hex the app (expo-crypto) and the Deno
// function (Web Crypto) must both produce for "test-vector-123".
const CANON = '44c2602d27ab675ffa3e611b2d2f0ef05fca766d63a55a4886b67740a5f154ff';
check('node sha256 matches canonical', createHash('sha256').update('test-vector-123').digest('hex') === CANON);

if (failures) { console.error(`${failures} failures`); process.exit(1); }
console.log('all passed; canonical hash =', CANON);
