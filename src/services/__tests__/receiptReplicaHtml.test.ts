/**
 * Asserts for `buildReceiptReplicaHtml` — the thermal-receipt REPLICA PDF
 * template used for PHOTO receipts (imageUri set, no archived PDF).
 * Run: `npm run test:receiptreplica`
 *
 * The builder is pure string generation (no expo-print at import time), so the
 * HTML can be checked here without a device: vendor header, itemised rows,
 * TOTAL AMOUNT, the deterministic barcode block, and the Potraces tagline.
 */
import { buildReceiptReplicaHtml, receiptShortId } from '../receiptReplicaHtml';
import type { SavedReceipt } from '../../types';

let pass = 0;
let fail = 0;

function expectContains(name: string, html: string, needle: string) {
  if (!html.includes(needle)) {
    fail++;
    console.log(`✗ ${name}\n    expected HTML to contain ${JSON.stringify(needle)}`);
    return;
  }
  pass++;
  console.log(`✓ ${name}`);
}

// Nasi Kandar Kubah-style guest check (the owner's photographed receipt).
const receipt: SavedReceipt = {
  id: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
  title: 'Nasi Kandar Kubah',
  vendor: 'NASI KANDAR KUBAH',
  items: [
    { name: 'Nasi Putih', amount: 2.0 },
    { name: 'Ayam Goreng', amount: 8.5 },
    { name: 'Sotong Goreng', amount: 12.0 },
  ],
  subtotal: 22.5,
  tax: 1.35,
  total: 37.1,
  date: new Date(2026, 4, 8),
  category: 'Food & Dining',
  myTaxCategory: 'none',
  location: 'Jalan Macalister, George Town, Penang',
  verified: true,
  year: 2026,
  createdAt: new Date(2026, 4, 8),
  updatedAt: new Date(2026, 4, 8),
};

const html = buildReceiptReplicaHtml(receipt, 'RM');

expectContains('vendor name in the header', html, 'NASI KANDAR KUBAH');
expectContains('item 1 — Nasi Putih', html, 'Nasi Putih');
expectContains('item 2 — Ayam Goreng', html, 'Ayam Goreng');
expectContains('item 3 — Sotong Goreng', html, 'Sotong Goreng');
expectContains('grand total amount', html, '37.10');
expectContains('TOTAL AMOUNT label', html, 'TOTAL AMOUNT');
expectContains('Potraces tagline', html, 'TRACKED WITH POTRACES');
expectContains('barcode element', html, 'class="barcode"');
expectContains('receipt short code', html, receiptShortId(receipt.id));
expectContains('RECEIPT # label', html, 'RECEIPT #');

// Short code must be the last 8 chars of the id, uppercased.
if (receiptShortId(receipt.id) !== '567890AB') {
  fail++;
  console.log(`✗ receiptShortId\n    expected '567890AB', got ${JSON.stringify(receiptShortId(receipt.id))}`);
} else {
  pass++;
  console.log('✓ receiptShortId is last-8 uppercase');
}

// Location segments render on their own lines, in caps.
expectContains('location segment (caps)', html, 'JALAN MACALISTER');

// Thermal monospace stack + torn edge must be present.
expectContains('monospace font stack', html, "'Courier New', Courier, monospace");
expectContains('torn edge svg', html, '<svg viewBox="0 0 320 14"');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
