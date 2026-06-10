/**
 * Unit tests for emvQr. The repo has no jest harness, so this is a self-running
 * script: it executes its assertions on import/run and exits non-zero on any
 * failure. Run it with:
 *
 *   npx tsc src/services/emvQr.ts src/services/__tests__/emvQr.test.ts \
 *     --outDir <tmp> --module commonjs --target es2019 --moduleResolution node --skipLibCheck
 *   node <tmp>/__tests__/emvQr.test.js
 *
 * (If a jest/vitest harness is added later, wrap the `check(...)` calls in it/expect.)
 */
import { crc16ccitt, parseTlv, validateDuitNowStatic, embedAmount } from '../emvQr';

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed++;
  else failures.push(name);
}
function eq(name: string, got: unknown, want: unknown): void {
  check(`${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, got === want);
}

// TLV builder helper (mirrors the on-wire encoding) for constructing fixtures.
const pad2 = (n: number) => String(n).padStart(2, '0');
const tlv = (id: string, val: string) => id + pad2(val.length) + val;

// ── 1. CRC-16/CCITT-FALSE authoritative check value ───────────────────────────
// "123456789" → 0x29B1 is the published check value for this CRC variant.
eq('crc16ccitt("123456789")', crc16ccitt('123456789'), '29B1');
eq('crc16ccitt("") init', crc16ccitt(''), 'FFFF');

// ── 2. Build a spec-valid static DuitNow payload fixture ──────────────────────
const merchantAccount = tlv('26', tlv('00', 'A000000615') + tlv('01', 'MBBEMYKL1234567'));
const bodyNoCrc =
  '000201' + // 00: Payload Format Indicator = "01"
  '010211' + // 01: Point of Initiation = "11" (static / reusable)
  merchantAccount + // 26: merchant account template
  tlv('52', '0000') + // 52: MCC
  tlv('53', '458') + // 53: currency = MYR
  tlv('58', 'MY') + // 58: country
  tlv('59', 'PAK MAT STALL') + // 59: merchant name
  tlv('60', 'KOTA BHARU'); // 60: city
const withCrcTag = bodyNoCrc + '6304';
const PAYLOAD = withCrcTag + crc16ccitt(withCrcTag);

// ── 3. parseTlv round-trip is byte-identical ──────────────────────────────────
eq('parse→join byte-identity', parseTlv(PAYLOAD).map((n) => n.raw).join(''), PAYLOAD);
check(
  'template 26 parsed one level deep',
  (parseTlv(PAYLOAD).find((n) => n.id === '26')?.children?.length ?? 0) === 2,
);

// ── 4. validateDuitNowStatic accepts the fixture & extracts name/city ─────────
const v = validateDuitNowStatic(PAYLOAD);
check('valid fixture', v.valid === true);
eq('merchant name', v.merchantName, 'PAK MAT STALL');
eq('city', v.city, 'KOTA BHARU');

// ── 5. validateDuitNowStatic rejects tampering ────────────────────────────────
eq(
  'reject bad CRC',
  validateDuitNowStatic(PAYLOAD.slice(0, -1) + (PAYLOAD.slice(-1) === 'A' ? 'B' : 'A')).reason,
  'crc',
);
eq('reject non-EMV prefix', validateDuitNowStatic('hello world').reason, 'format');
const wrongCurrencyBody =
  '000201010211' + merchantAccount + tlv('53', '702') + tlv('58', 'MY') + tlv('59', 'X') + tlv('60', 'Y') + '6304';
eq(
  'reject wrong currency',
  validateDuitNowStatic(wrongCurrencyBody + crc16ccitt(wrongCurrencyBody)).reason,
  'currency',
);

// ── 6. embedAmount: tag 54 set, CRC valid, other tags byte-identical ──────────
const amounted = embedAmount(PAYLOAD, 1250);
check('amounted re-validates', validateDuitNowStatic(amounted).valid === true);
eq('tag 54 value', parseTlv(amounted).find((n) => n.id === '54')?.value, '12.50');
eq('tag 54 length byte', parseTlv(amounted).find((n) => n.id === '54')?.length, 5);
// tag 54 sits immediately after tag 53 (currency)
const ids = parseTlv(amounted).map((n) => n.id);
eq('54 follows 53', ids[ids.indexOf('53') + 1], '54');
// every non-amount, non-CRC tag is unchanged vs the original
const stripAmtCrc = (p: string) =>
  parseTlv(p).filter((n) => n.id !== '54' && n.id !== '63').map((n) => n.raw).join('');
eq('other tags byte-identical', stripAmtCrc(amounted), stripAmtCrc(PAYLOAD));

// ── 7. embedAmount replaces an existing tag 54, stays idempotent ──────────────
eq('replace existing 54', parseTlv(embedAmount(amounted, 700)).find((n) => n.id === '54')?.value, '7.00');
eq('idempotent', embedAmount(amounted, 1250), amounted);

// ── 8. amount formatting (RM, two decimals, no separators) ────────────────────
const amt = (cents: number) => parseTlv(embedAmount(PAYLOAD, cents)).find((n) => n.id === '54')?.value;
eq('0.50', amt(50), '0.50');
eq('7', amt(700), '7.00');
eq('123.45', amt(12345), '123.45');
eq('1000', amt(100000), '1000.00');

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length) {
  // eslint-disable-next-line no-console
  console.error(`emvQr tests: ${failures.length} FAILED of ${passed + failures.length}`);
  failures.forEach((f) => console.error('  ✗ ' + f));
  const g = globalThis as { process?: { exit?: (code: number) => void } };
  g.process?.exit?.(1);
} else {
  // eslint-disable-next-line no-console
  console.log(`emvQr tests: all ${passed} checks passed`);
}
