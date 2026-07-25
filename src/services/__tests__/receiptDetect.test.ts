/**
 * Fixtures + asserts for `extractReceiptFromRows` — the Share-to-Log receipt DETECTOR.
 * Run: `npm run test:receiptdetect`
 *
 * A shared screenshot is a RECEIPT only when the OCR rows carry a real grand-TOTAL line
 * plus an itemised list plus a vendor. This is what routes a store receipt to the review
 * screen while keeping payment confirmations, transaction-history lists, and app screens
 * out. `extractReceiptFromRows` is pure (operates on already-OCR'd rows), so it's testable
 * here with no native ML Kit.
 */
import { extractReceiptFromRows } from '../localReceiptOcr';

let pass = 0;
let fail = 0;

function expectReceipt(name: string, rows: string[], total: number, vendor?: string) {
  const got = extractReceiptFromRows(rows);
  if (!got) {
    fail++;
    console.log(`✗ ${name}\n    expected a receipt, got null`);
    return;
  }
  if (Math.abs(got.total - total) > 0.005) {
    fail++;
    console.log(`✗ ${name}\n    total: expected ${total}, got ${got.total}`);
    return;
  }
  if (got.itemCount < 2) {
    fail++;
    console.log(`✗ ${name}\n    itemCount: expected >= 2, got ${got.itemCount}`);
    return;
  }
  if (vendor !== undefined && got.vendor !== vendor) {
    fail++;
    console.log(`✗ ${name}\n    vendor: expected ${JSON.stringify(vendor)}, got ${JSON.stringify(got.vendor)}`);
    return;
  }
  pass++;
  console.log(`✓ ${name} (RM ${got.total} · ${got.vendor ?? '?'} · ${got.itemCount} items)`);
}

function expectNotReceipt(name: string, rows: string[]) {
  const got = extractReceiptFromRows(rows);
  if (got) {
    fail++;
    console.log(`✗ ${name}\n    expected null, got ${JSON.stringify(got)}`);
    return;
  }
  pass++;
  console.log(`✓ ${name}`);
}

// ── Receipts (must detect) ──
expectReceipt('Nasi Kandar guest check — TOTAL + items + vendor', [
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
], 37.10);

expectReceipt('Grocery receipt — JUMLAH (Malay total)', [
  'KEDAI RUNCIT SEJAHTERA',
  'No 12 Jalan Besar',
  'Beras 5kg 22.90',
  'Minyak Masak 2L 15.50',
  'Gula 1kg 3.20',
  'Telur Gred A 9.80',
  'JUMLAH 51.40',
  'TUNAI 60.00',
  'BAKI 8.60',
  'Terima Kasih',
], 51.40);

// FOREIGN-currency invoice (owner's real Kimi/Moonshot PDF, "example receipt/Receipt-2581-7948.pdf"):
// the sticker price is $199.00 USD but the Visa was "Charged RM844.67 using 1 USD = 4.2446 MYR".
// The MYR settlement is what left the bank → it must be the total, not the $199. And the vendor
// must be MOONSHOT AI, not the month-first "Date paid July 25, 2026" row (US date format).
expectReceipt('Moonshot/Kimi USD invoice — MYR "Charged" settlement wins, US date is not the vendor', [
  'Receipt',
  'Invoice number CX18BCHY-0003',
  'Receipt number 2581-7948',
  'Date paid July 25, 2026',
  'MOONSHOT AI PTE. LTD.',
  '91 BENCOOLEN STREET',
  '#12-03, SUNSHINE PLAZA',
  'SINGAPORE 189652',
  'Singapore',
  'membership@moonshot.ai',
  'SG GST 202326494K',
  'Bill to',
  'Muhammad Zafran bin Zamani',
  '65, Regat Taman Tasek',
  'Taman Tasek Manikavasagam',
  '31400 Ipoh',
  'Perak',
  'Malaysia',
  'zafranzamani99@gmail.com',
  '$199.00 paid on July 25, 2026',
  'Description Qty Unit price Amount',
  'Kimi 1 $199.00 $199.00',
  'Jul 25-Aug 25, 2026',
  'Subtotal $199.00',
  'Total $199.00',
  'Amount paid $199.00',
  'Payment history',
  'Payment method Date Amount paid Receipt number',
  'Visa - 6128 July 25, 2026 $199.00 2581-7948',
  'Charged RM844.67 using 1 USD = 4.2446 MYR',
  'Page 1 of 1',
], 844.67, 'MOONSHOT AI PTE. LTD.');

// ── Not receipts (must return null) ──
expectNotReceipt('Payment confirmation (LNTHAIFOOD) — no grand-total line', [
  'Payment successful',
  'RM 57.40',
  'LNTHAIFOOD',
  'Reference ID QR73573013',
  'Date & time 18 May 2026, 11:16 PM',
  'Transaction Type Scan & Pay',
  'Share Receipt',
  'Done',
]);

expectNotReceipt('Wallet transaction history list — no grand-total line', [
  'History',
  '25 Jul 25 - 24 Jul 26',
  '17 Jun, 22:15',
  'Transfer to HAIDI BIN AZIZ',
  '-RM22.00',
  'Washupptech Sdn Bhd',
  '-RM20.00',
  '7-ELEVEN MALAYSIA SDN BHD',
  '-RM17.50',
]);

expectNotReceipt('Commitments list — "total" but no itemised receipt + no vendor', [
  'Commitments',
  'JULY 2026',
  'RM 294.70',
  'UPCOMING (5) RM 294.70',
  'Spotify Premium',
  'RM 14.90',
  'Netflix Standard',
  'RM 75.90',
]);

expectNotReceipt('Single price, no items — not a receipt', [
  'Payment successful',
  'RM 60.00',
  'KEDAI RUNCIT ALI',
]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
