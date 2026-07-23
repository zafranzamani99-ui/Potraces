/**
 * Fixtures + asserts for the payment-screenshot parser.  Run: `npm run test:paymentparse`
 *
 * Each fixture is the OCR ROWS of a payment screen (columns joined left→right, as
 * localReceiptOcr's reconstructRows would emit) + the fields we expect out. The first
 * two are the real screenshots the owner shared; the rest are the edge cases we KNOW are
 * coming (balance distractor, brand→wallet, income, failed, non-payment). Drop real
 * screenshots' OCR text in here as they arrive and tune the parser against them.
 */
import { parsePaymentScreenshot, type ParsedPayment } from '../paymentScreenshotParser';

let pass = 0;
let fail = 0;

function check(name: string, rows: string[], expected: Partial<ParsedPayment> & { dt?: [number, number, number, number, number] }) {
  const got = parsePaymentScreenshot(rows);
  const errs: string[] = [];
  for (const [k, v] of Object.entries(expected)) {
    if (k === 'dt') continue;
    if ((got as any)[k] !== v) errs.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify((got as any)[k])}`);
  }
  if (expected.dt) {
    const d = got.datetime;
    const [Y, M, D, h, m] = expected.dt;
    if (!d || d.getFullYear() !== Y || d.getMonth() !== M || d.getDate() !== D || d.getHours() !== h || d.getMinutes() !== m) {
      errs.push(`datetime: expected ${Y}-${M + 1}-${D} ${h}:${m}, got ${d ? d.toString() : 'null'}`);
    }
  }
  if (errs.length) {
    fail++;
    console.log(`✗ ${name}`);
    errs.forEach((e) => console.log(`    ${e}`));
  } else {
    pass++;
    console.log(`✓ ${name}`);
  }
}

// ── Real screenshots (owner-provided) ──
check('LNTHAIFOOD — merchant Scan & Pay', [
  'Payment successful',
  'RM 57.40',
  'LNTHAIFOOD',
  'Reference ID QR73573013',
  'Date & time 18 May 2026, 11:16 PM',
  'Transaction Type Scan & Pay',
  'Share Receipt',
  'Done',
], {
  isPaymentScreen: true, reason: 'ok', direction: 'out', amount: 57.4, currency: 'MYR',
  payee: 'LNTHAIFOOD', refId: 'QR73573013', method: 'scan_pay', walletHint: null,
  dt: [2026, 4, 18, 23, 16],
});

check('P2P transfer to a person (share sheet obscured the rest)', [
  'Payment successful',
  'RM 13.00',
  'NOOR AZEANA BINTI AZLAN',
], {
  isPaymentScreen: true, reason: 'ok', direction: 'out', amount: 13, payee: 'NOOR AZEANA BINTI AZLAN',
  refId: null, method: null, walletHint: null,
});

// ── Known-incoming edge cases ──
check('Balance distractor + brand → pick payment, not balance; detect wallet', [
  "Touch 'n Go eWallet",
  'Payment successful',
  'RM 25.00',
  'MCDONALDS KLCC',
  'Wallet balance RM 182.50',
], {
  isPaymentScreen: true, amount: 25, payee: 'MCDONALDS KLCC', walletHint: 'tng', direction: 'out',
});

check('Income — DuitNow received from a person', [
  'You received',
  'RM 200.00',
  'from AHMAD BIN ALI',
  'DuitNow',
], {
  isPaymentScreen: true, direction: 'in', amount: 200, payee: 'AHMAD BIN ALI', method: 'duitnow',
});

check('Failed payment — must NOT log', [
  'Payment failed',
  'RM 40.00',
  'Please try again',
], {
  isPaymentScreen: false, reason: 'failed',
});

check('Not a payment screen at all', [
  'Weather today',
  'Sunny 32 degrees',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null,
});

check('Amount with no decimals ("RM 60")', [
  'Payment successful',
  'RM 60',
  'KEDAI RUNCIT ALI',
], {
  isPaymentScreen: true, amount: 60, payee: 'KEDAI RUNCIT ALI',
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
