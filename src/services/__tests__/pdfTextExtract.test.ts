/**
 * Fixtures + asserts for `extractPdfTextRows` — the Share-to-Log PDF text extractor.
 * Run: `npm run test:pdfextract`
 *
 * Reads the owner's real Kimi/Moonshot Stripe invoice ("example receipt/Receipt-2581-7948.pdf"),
 * extracts text rows IN PLAIN JS (no native PDF libs), and checks the rows feed the existing
 * receipt detector end-to-end: vendor MOONSHOT AI, MYR settlement total RM 844.67.
 */
import * as fs from 'fs';
import * as path from 'path';
import { extractPdfTextRows, base64ToBytes } from '../pdfTextExtract';
import { extractReceiptFromRows } from '../localReceiptOcr';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.log(`✗ ${name}${detail ? `\n    ${detail}` : ''}`);
  }
}

const pdfPath = path.join(__dirname, '..', '..', '..', 'example receipt', 'Receipt-2581-7948.pdf');
const buf = fs.readFileSync(pdfPath);
const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
const rows = extractPdfTextRows(bytes);

console.log(`extracted ${rows.length} rows:`);
for (const r of rows.slice(0, 40)) console.log(`  | ${r}`);
if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`);
console.log('');

check('extracts some rows', rows.length >= 10, `got ${rows.length}`);
check(
  "row contains 'MOONSHOT AI PTE. LTD.'",
  rows.some((r) => r.includes('MOONSHOT AI PTE. LTD.')),
  rows.find((r) => r.includes('MOONSHOT')),
);
check(
  "row contains 'Charged RM844.67'",
  rows.some((r) => r.includes('Charged RM844.67')),
  rows.find((r) => r.includes('Charged')),
);
check(
  "row contains '$199.00'",
  rows.some((r) => r.includes('$199.00')),
  rows.find((r) => r.includes('199')),
);

// End-to-end: the extracted rows must drive the existing receipt detector to the
// MYR settlement total (what actually left the bank), with the right vendor.
const receipt = extractReceiptFromRows(rows);
check('extractReceiptFromRows finds a receipt', receipt !== null);
if (receipt) {
  check('vendor is MOONSHOT AI PTE. LTD.', receipt.vendor === 'MOONSHOT AI PTE. LTD.', `got ${JSON.stringify(receipt.vendor)}`);
  check('total is 844.67 (MYR settlement)', Math.abs(receipt.total - 844.67) <= 0.005, `got ${receipt.total}`);
  check('itemCount >= 2', receipt.itemCount >= 2, `got ${receipt.itemCount}`);
}

// base64ToBytes sanity (used by logPdfFromShare to decode the staged file).
const b64 = buf.toString('base64');
const round = base64ToBytes(b64);
check(
  'base64ToBytes round-trips the file',
  round.length === bytes.length && round[0] === 0x25 && round[1] === 0x50 && round[round.length - 1] === bytes[bytes.length - 1],
  `got ${round.length} bytes`,
);

// Garbage in → [] out, never a throw.
check('garbage returns []', extractPdfTextRows(new Uint8Array([1, 2, 3])).length === 0);
check('non-pdf text returns []', extractPdfTextRows(new Uint8Array(Buffer.from('hello world, not a pdf'))).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
