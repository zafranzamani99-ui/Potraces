/**
 * Fiuu OPA signature — locked against the official worked example in
 * "[OPA+MAP] Fiuu Offline Payment API v2.1.18.pdf" §7.1 (Generate Signature,
 * HMAC-SHA256). The same concat feeds qr-create-charge (requests) and
 * qr-payment-webhook (notification verification). If this fails, every Fiuu
 * call 401s.
 *
 * Run: npm run test:fiuusig
 */
import { createHmac } from 'node:crypto';

// Same algorithm as supabase/functions/qr-create-charge/index.ts#fiuuSign
// (Deno/Web Crypto there, node:crypto here — HMAC-SHA256 either way).
function fiuuSign(params: Record<string, string>, secretKey: string): string {
  const concat = Object.keys(params)
    .filter((k) => k !== 'signature' && params[k].trim() !== '')
    .sort()
    .map((k) => params[k].trim())
    .join('');
  return createHmac('sha256', secretKey).update(concat, 'utf8').digest('hex');
}

// ── Worked example straight from the Fiuu doc ──
const SECRET = 'Ziu61T9xY227aazS530Pk8C5424y663r';
const PARAMS: Record<string, string> = {
  applicationCode: '3f2504e04f8911d39a0c0305e82c3301',
  referenceId: 'TRX1708901',
  authorizationCode: '123456789123456789',
  authorizationCodeType: '1',
  channelId: '16',
  currencyCode: 'MYR',
  description: 'Sample',
  amount: '10.00',
  storeId: '17001',
  terminalId: '17001001',
  version: 'v1',
  hashType: 'hmac-sha256',
};
const EXPECTED = 'db0624605d8a8b9c40b3eeb97f906a454195f1b35d1a2f9b75700e1e8cc942ba';

let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
};

const got = fiuuSign(PARAMS, SECRET);
check('doc example (v1, hmac-sha256) matches', got === EXPECTED, `got ${got}`);

// Empty values are dropped BEFORE sorting (a blank param must not shift the concat)
const withBlank = fiuuSign({ ...PARAMS, description: '' }, SECRET);
const withoutDescSorted = fiuuSign((() => { const { description, ...rest } = PARAMS; return rest; })(), SECRET);
check('blank params are excluded from the concat', withBlank === withoutDescSorted);

// signature field itself is never part of the hash input
check('signature param is excluded', fiuuSign({ ...PARAMS, signature: 'whatever' }, SECRET) === EXPECTED);

// Case sensitivity: changed case must change the hash
check('values are case-sensitive', fiuuSign({ ...PARAMS, description: 'sample' }, SECRET) !== EXPECTED);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nfiuu signature OK');
