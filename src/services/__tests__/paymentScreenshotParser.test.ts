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

// Debt/split SUMMARY screen (Potraces' own Debts & Splits, or any tracker): has amounts
// and a stray "paid"/"owe" word but is NOT a single payment → must not log a phantom.
check('Debts & Splits summary — not a payment', [
  'Debts & Splits',
  'You Owe',
  'RM 650.00',
  '100.00 paid',
  'Owed to You',
  'RM 60.00',
  'collected',
  "you're owed back",
  'RM 316.00',
  'across 2 splits',
  'Trip Penang — Airbnb + tol + petrol',
  'RM 480.00',
  'RM 240.00 left · 2 unpaid',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null,
});

// Bills / Commitments / Subscriptions list: a "paid" word + a total + many line-item
// amounts, but not a single payment → must not log a phantom (multi-amount guard).
check('Commitments/subscriptions list — not a payment', [
  'Commitments',
  'JULY 2026',
  'RM 294.70',
  '5 commitments this month',
  '0/5 paid',
  'bills 4  payments 2  subscriptions 5',
  'all  upcoming 5  overdue',
  'search commitments...',
  'UPCOMING (5)  RM 294.70',
  'Spotify Premium',
  'RM 14.90',
  'monthly Aug 2',
  'ChatGPT Plus',
  'RM 89.00',
  'Netflix Standard',
  'RM 75.90',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null,
});

// A generic list of amounts with NO summary keyword still fails the multi-amount guard.
check('Bare multi-amount list (no keywords) — not a payment', [
  'RM 14.90', 'RM 89.00', 'RM 75.90', 'RM 99.00', 'paid',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null,
});

// Subscription pricing / paywall page: many prices, and even a stray fail-ish word
// ("cancelled") must NOT make it read as a failed payment — the multi-amount guard wins.
check('Paywall pricing page — not a payment (guard beats the fail check)', [
  'Potraces Premium',
  'BASIC  PRO  PREMIUM',
  'RM 14  RM 25',
  'RM7.99/mo  RM10/mo  RM16.67/mo',
  'RM120/yr  RM200/yr',
  'cancelled anytime · restore purchase',
  '300 chats/mo',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null,
});

// TnG transaction HISTORY list: many amounts + "DuitNow"/"Payment"/"Received" words, but no
// single "Successful" status or reference id → must NOT log (only a details screen should).
check('Wallet transaction history list — not a payment', [
  'History',
  '25 Jul 25 - 24 Jul 26',
  'Send to email',
  'JUNE 26',
  '17 Jun, 22:15',
  'Transfer to HAIDI BIN AZIZ',
  '-RM22.00',
  'Transfer to Wallet',
  '14 Jun, 12:57',
  'Washupptech Sdn Bhd',
  '-RM20.00',
  'Payment',
  'Receive from MUHAMMAD ZAFRAN BIN ZAMAN',
  '+RM50.00',
  'DuitNow Received',
  '7-ELEVEN MALAYSIA SDN BHD',
  '-RM17.50',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null,
});

// The single transaction DETAILS screen (one amount + "Successful" + a wallet ref) DOES log,
// and the payee is the merchant value, not the "Merchant" label.
check('Transaction details screen — logs the one payment', [
  'Details',
  '-RM20.00',
  'Transaction Type  Payment',
  'Merchant  Washupptech Sdn Bhd',
  'Payment Method  eWallet Balance',
  'Date/Time  14/06/2026 12:57:47',
  'Wallet Ref  2026061410110000010000TNGOW3MY171133003574749',
  'Status  Successful',
  'Transaction No.  26061404574231041',
], {
  isPaymentScreen: true, reason: 'ok', amount: 20, direction: 'out', payee: 'Washupptech Sdn Bhd',
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
