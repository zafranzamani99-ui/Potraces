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
  // In-app screen (hits NOT_PAYMENT_SCREEN_RE) → tagged not_payment_screen so Share-to-Log
  // does NOT try the receipt detector on it.
  isPaymentScreen: false, reason: 'not_payment_screen', amount: null,
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
  // In-app screen (Commitments/upcoming/overdue/this month) → not_payment_screen.
  isPaymentScreen: false, reason: 'not_payment_screen', amount: null,
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

// Maybank transaction HISTORY list: many dated merchant rows, each with a signed amount and a
// per-row DuitNow/QR reference token (QR82531374, 205564207Q). The ref tokens would otherwise
// satisfy the single-payment "hard signal" — must be rejected by list SHAPE (owner hit this:
// it logged the top row "RM 20.15 · LUMPUR").
check('Maybank transaction history list — not a payment (ref tokens must NOT rescue it)', [
  'Transactions',
  'Transaction History',
  'Yesterday',
  'HAMEEDIYAH NASI K *KUALA LUMPUR, -RM 20.15',
  'FRIEND FRIES *KUALA LUMPUR, -RM 15.80',
  'DUITNOW QR- MUHAMMAD MOHSIN BIN* RM 100.00',
  'ANNUAL FEES FOR BANKARD CHARGES -RM 8.00',
  '22 Jul 2026',
  'MAE QR WAN ARIFF NABIL BIN*205564207Q RM 13.00',
  'DUITNOW QR G MARD ENTERPRISE *QR82531374 -RM 30.00',
  'DUITNOW QR- MUHAMMAD BIN ABDULL* RM 13.00',
  '7-ELEVEN MALAYSIA S*Petaling Jaya, -RM 5.40',
  '21 Jul 2026',
  'DUITNOW QR AG ARTISAN MAXIM LE*QR80279762 -RM 10.99',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null,
});

// Adversarial history lists that defeated the first list-guard (unsigned + same-day/cropped +
// per-row BARE DuitNow/QR ref tokens). The bare-ref-token count + labeled-ref strongSignal now
// reject them. All must be reason:'not_payment', amount:null.
check('Maybank list — unsigned, all Today, header cropped (bare QR refs)', [
  'Today', 'Ahmad Bin Ismail', 'DuitNow Transfer', 'RM 20.15', '205564207Q',
  'Kedai Runcit Aman', 'DuitNow QR', 'RM 12.80', 'QR118820345',
  'Grab Malaysia', 'DuitNow Transfer', 'RM 8.50', 'QR990033112',
], { isPaymentScreen: false, reason: 'not_payment', amount: null });

check('GXBank Activity — unsigned, per-row refs', [
  'Activity', 'All', 'Sarah Lee', 'DuitNow', 'RM 45.00', 'GXQR20260724A1',
  'Speedmart 99', 'Purchase', 'RM 9.90', 'GXQR20260724B2',
  'Mak Cik Kiah', 'DuitNow', 'RM 30.00', 'GXQR20260724C3',
], { isPaymentScreen: false, reason: 'not_payment', amount: null });

check('Boost history — unsigned, "Payment to X" rows, refs', [
  'Boost', 'Payment to Mydin Mall', 'RM 62.30', 'BST240724X1',
  'Cashback Earned', 'RM 1.20', 'Payment to Petronas', 'RM 40.00', 'BST240724X2',
  'Payment to 7 Eleven', 'RM 5.50', 'BST240724X3',
], { isPaymentScreen: false, reason: 'not_payment', amount: null });

check('TnG scrolled — dates embedded in long rows, bare refs', [
  '24 Jul 2026 10:15  Nasi Lemak Antarabangsa', 'RM 8.50', 'DuitNow QR TNG20260724A',
  '24 Jul 2026 09:40  Grab Ride', 'RM 14.30', 'DuitNow QR TNG20260724B',
  '24 Jul 2026 08:12  Starbucks Coffee', 'RM 19.90', 'DuitNow QR TNG20260724C',
], { isPaymentScreen: false, reason: 'not_payment', amount: null });

check('Maybank 2-item cropped snippet — signed, 2 bare refs (below multi-amount threshold)', [
  'Today', 'DuitNow Transfer to Ali', '- RM 20.15', '205564207Q',
  'DuitNow Received from Siti', '+ RM 150.00', '118820345K',
], { isPaymentScreen: false, reason: 'not_payment', amount: null });

// FALSE-NEGATIVE guard: a genuine single DuitNow transfer (ONE amount, a LABEL-anchored ref)
// must STILL log — the tightened strongSignal + ≥2-amount gate must not reject it.
check('DuitNow transfer success — labeled ref, one amount → logs', [
  'Transfer successful',
  'RM 250.00',
  'to SITI NURHALIZA',
  'Reference No DN20260724ABC123',
  'DuitNow',
], {
  isPaymentScreen: true, reason: 'ok', direction: 'out', amount: 250, refId: 'DN20260724ABC123',
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

// Maybank DuitNow Transfer RECEIPT (a share-receipt of a SUCCESSFUL transfer — a real payment,
// NOT a store receipt). Two-line label/value layout: the payee must be the beneficiary NAME
// ("MOHD FIRDAUS BIN ABIDIN"), never the label word "name" nor the "Recipient reference" note
// ("mohsin"). Owner hit this — it logged payee "name".
check('Maybank DuitNow transfer receipt → logs, payee = beneficiary name (not "name"/"mohsin")', [
  'Maybank',
  'DuitNow Transfer',
  'Successful',
  'Reference ID',
  '173610497M',
  '22 May 2026, 01:21 AM',
  'Beneficiary name',
  'MOHD FIRDAUS BIN ABIDIN',
  'Beneficiary account number',
  '1275 0184 731',
  'Receiving bank',
  'HONG LEONG BANK',
  'Recipient reference',
  'mohsin',
  'Amount',
  'RM 200.00',
  'Note: This receipt is computer generated and no signature is required.',
  'Malayan Banking Berhad (Co. Reg. : 196001000142)',
], {
  isPaymentScreen: true, reason: 'ok', direction: 'out', amount: 200,
  payee: 'MOHD FIRDAUS BIN ABIDIN', refId: '173610497M', walletHint: 'maybank',
  dt: [2026, 4, 22, 1, 21],
});

// OCR garbles the light-grey receipt timestamp (colon→dot/space/gone, 0→"O") — the tolerant
// time reader must still recover the EXACT time. Owner hit "01:21 AM" logging as 12:00 am.
check('Garbled OCR timestamp "01.21 AM" (colon→dot) → exact time recovered', [
  'Maybank', 'DuitNow Transfer', 'Successful',
  'Reference ID', '173610497M',
  '22 May 2026, 01.21 AM',
  'Beneficiary name', 'MOHD FIRDAUS BIN ABIDIN',
  'Amount', 'RM 200.00',
], {
  isPaymentScreen: true, amount: 200, payee: 'MOHD FIRDAUS BIN ABIDIN', dt: [2026, 4, 22, 1, 21],
});

check('Garbled OCR timestamp "0121AM" (no colon, no space) → exact time recovered', [
  'Maybank', 'DuitNow Transfer', 'Successful',
  '22 May 2026 0121AM',
  'Beneficiary name', 'SITI', 'Reference ID', '173610497M', 'Amount', 'RM 200.00',
], {
  isPaymentScreen: true, amount: 200, dt: [2026, 4, 22, 1, 21],
});

// A screen with a single PRICE but no payment context — our own Sell/POS screen, a menu, a
// product card — must be a CONFIDENT not-a-payment (uncertain:false → no AI, no "needs a closer
// look"). Owner hit this sharing the business Sell screen (Kopi O Ais RM 1.80).
check('Own Sell/POS screen (one price, no payment context) → not_payment, NOT uncertain', [
  '4:41',
  'Sell',
  'quick', 'cart', '0',
  'qr', '+ customer',
  'all', 'Other',
  'Kopi O Ais',
  'RM 1.80',
  'options',
  'Home', 'History', 'Sell', 'Regulars', 'Manage',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null, uncertain: false,
});

check('Single product card (price + Add to cart) → not_payment, NOT uncertain', [
  'Nasi Lemak Special',
  'RM 12.90',
  'Add to cart',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null, uncertain: false,
});

// BUT a genuinely half-recognized money-movement screen (a payment HINT + amount, no status
// word) must STILL go to the AI (uncertain:true) — proves the tightening didn't over-reach.
check('Half-recognized transfer (Funds Transfer + amount, no status) → uncertain (AI-worthy)', [
  'Funds Transfer',
  'RM 45.00',
  'Beneficiary Siti Aminah',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null, uncertain: true,
});

// A store RECEIPT is rejected by the payment rules (multi-amount), but it is NOT an in-app
// screen — so its reason must stay `not_payment` (receipt-eligible), never `not_payment_screen`.
// Share-to-Log then runs the receipt detector on it (see receiptDetect.test.ts).
check('Store receipt — not_payment (receipt-eligible), not an app screen', [
  'NASI KANDAR KUBAH',
  'Jalan Macalister, Penang',
  'Nasi Putih 2.00',
  'Ayam Goreng 8.50',
  'Sotong Goreng 12.00',
  'Sayur Campur 4.60',
  'Sub Total 27.10',
  'SST 6% 1.63',
  'TOTAL AMOUNT 37.10',
  'CASH 50.00',
  'CHANGE 12.90',
], {
  isPaymentScreen: false, reason: 'not_payment', amount: null,
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
