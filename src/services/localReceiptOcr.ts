import type { Text as MLKitText } from '@infinitered/react-native-mlkit-text-recognition';
import { ExtractedReceipt, ReceiptItem, SellerReceiptResult } from '../types';

/**
 * On-device receipt OCR fallback — used when Gemini can't be reached (offline,
 * proxy down, cooldown). Reads the receipt with ML Kit text recognition and
 * parses it with heuristics tuned for Malaysian thermal receipts (RM amounts,
 * jumlah/tunai keywords, Malay month names).
 *
 * Results are deliberately conservative: whatever the heuristics can't read is
 * left blank for the user to fill in on the review screen. Callers can tell a
 * local result apart from a Gemini one via isLocalScanResult().
 */

// ─── Lazy native-module access ──────────────────────────────
// The lib calls requireNativeModule() at import time, which THROWS if the
// native module wasn't compiled into this build. Same guard pattern as
// OcrDebugHarness: defer the require and swallow the throw — never a
// top-level import. Cache the probe so repeated availability checks don't
// re-evaluate a throwing module factory.
type RecognizeTextFn = (imagePath: string) => Promise<MLKitText>;

let _recognizeText: RecognizeTextFn | null | undefined;

function getRecognizeText(): RecognizeTextFn | null {
  if (_recognizeText === undefined) {
    try {
      _recognizeText = require('@infinitered/react-native-mlkit-text-recognition').recognizeText ?? null;
    } catch {
      _recognizeText = null;
    }
  }
  return _recognizeText ?? null;
}

/** True when the ML Kit text-recognition native module is in this build. */
export function isLocalOcrAvailable(): boolean {
  return getRecognizeText() !== null;
}

// ─── Local-result marker ────────────────────────────────────
// The shared result types have no "source" field and we must not invent one,
// so local results are tracked out-of-band. WeakSet keys on the exact object
// the scan resolved with — no shape change, no leak, backward-compatible.
const localResults = new WeakSet<object>();

/** True when this scan result came from the on-device OCR fallback. */
export function isLocalScanResult(result: unknown): boolean {
  return typeof result === 'object' && result !== null && localResults.has(result);
}

// ─── Row reconstruction ─────────────────────────────────────
// ML Kit returns blocks per COLUMN on receipts (names left, prices right), so
// "line ends with an amount" is false on the raw text. Rebuild visual rows by
// sorting every OCR line by vertical center and merging lines whose centers
// sit within ~60% of a line height, then joining each row left→right.

interface OcrLine {
  text: string;
  left: number;
  center: number;
  height: number;
}

function reconstructRows(ocr: MLKitText): string[] {
  const lines: OcrLine[] = [];
  for (const block of ocr.blocks) {
    for (const line of block.lines) {
      const text = line.text.trim();
      if (!text) continue;
      lines.push({
        text,
        left: line.frame.left,
        center: (line.frame.top + line.frame.bottom) / 2,
        height: Math.max(1, line.frame.bottom - line.frame.top),
      });
    }
  }
  lines.sort((a, b) => a.center - b.center);

  const rows: OcrLine[][] = [];
  for (const line of lines) {
    const row = rows[rows.length - 1];
    if (row) {
      const anchor = row[0];
      const tolerance = Math.min(anchor.height, line.height) * 0.6;
      if (Math.abs(line.center - anchor.center) <= tolerance) {
        row.push(line);
        continue;
      }
    }
    rows.push([line]);
  }

  return rows.map((row) =>
    row
      .sort((a, b) => a.left - b.left)
      .map((l) => l.text)
      .join(' ')
  );
}

// ─── Amount parsing ─────────────────────────────────────────
// RM-format amounts: optional RM prefix, optional thousand commas, always two
// decimals. The plain \d+\.\d{2} alternative catches OCR reads that drop the
// comma grouping ("1234.56") which the strict 1-3-digit form would truncate.
const AMOUNT_RE = /(?:RM\s*)?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/gi;
// Row ends with an amount (line total is the rightmost column); tolerate a
// short trailing tax-code flag ("8.49 SR", "8.49 T*") that thermal receipts add.
const TRAILING_AMOUNT_RE = /(?:RM\s*)?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*[A-Za-z*]{0,2}$/i;

const MAX_AMOUNT = 1_000_000; // keep in sync with receiptScanner's MAX_RECEIPT_AMOUNT

function toAmount(raw: string): number {
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? n : 0;
}

function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(AMOUNT_RE)) {
    const n = toAmount(match[1]);
    if (n > 0) out.push(n);
  }
  return out;
}

// ─── Keyword sets ───────────────────────────────────────────
const TOTAL_RE = /\b(?:total|jumlah|amount\s*due|net)\b/i;
// A "total" line that is actually a tender/change/count line — never the grand total.
const NOT_TOTAL_RE = /\b(?:tunai|cash|change|baki|tender|item|items|qty|quantity|point|pts|saving|savings|jimat)\b/i;
const SUBTOTAL_RE = /\bsub\s*-?\s*(?:total|jumlah)\b/i;
const TAX_RE = /\b(?:sst|gst|tax|cukai|service\s*(?:charge|tax)|svc)\b/i;
// Summary / payment / metadata rows that must never become items.
const NON_ITEM_RE = /\b(?:sub\s*-?\s*total|total|jumlah|amount\s*due|net|sst|gst|tax|cukai|service\s*(?:charge|tax)|svc|rounding|round\s*adj|discount|diskaun|rebate|voucher|change|baki|tunai|cash|credit|debit|visa|master(?:card)?|card|tender|payment|bayaran|balance|duitnow|\bqr\b|tng|touch\s*'?n'?\s*go|grab(?:pay)?|boost|shopee\s*pay|point|pts|member)\b/i;

const DATE_RES = [
  /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/, // dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy
  /\b\d{4}-\d{1,2}-\d{1,2}\b/, // yyyy-mm-dd
  /\b\d{1,2}\s+(?:jan|feb|mac|mar|apr|mei|may|jun|jul|ogos?|aug|sep|okt|oct|nov|dis|dec)[a-z]*\s+\d{2,4}\b/i, // dd MMM yyyy (incl. Malay months)
  /\b(?:jan|feb|mac|mar|apr|mei|may|jun|jul|ogos?|aug|sep|okt|oct|nov|dis|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/i, // MMM dd, yyyy (US/Stripe invoices; 4-digit year so "May 2026" ≠ the 20th)
];

// Priority-ordered payment-method detection → the same method strings the
// Gemini prompt uses. Specific wallets first so "debit" / generic "card"
// don't shadow them.
const PAYMENT_METHOD_RULES: [RegExp, string][] = [
  [/duitnow/i, 'duitnow_qr'],
  [/\btng\b|touch\s*'?n'?\s*go/i, 'tng'],
  [/grab\s*pay|\bgrab\b/i, 'grabpay'],
  [/boost/i, 'boost'],
  [/shopee\s*pay|shopee/i, 'shopee_pay'],
  [/\bmae\b/i, 'mae'],
  [/bigpay/i, 'bigpay'],
  [/\bfpx\b/i, 'fpx'],
  [/debit/i, 'debit_card'],
  [/visa|master(?:card)?|credit/i, 'credit_card'],
  [/tunai|\bcash\b/i, 'cash'],
  [/\bqr\b/i, 'duitnow_qr'],
  [/e-?wallet|\bcard\b/i, 'other'],
];

// ─── Field heuristics ───────────────────────────────────────

function findDate(rows: string[]): string | undefined {
  for (const row of rows) {
    for (const re of DATE_RES) {
      const match = row.match(re);
      if (match) return match[0];
    }
  }
  return undefined;
}

function todayString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}

function isDateOrNumberRow(row: string): boolean {
  if (DATE_RES.some((re) => re.test(row))) return true;
  if (/^[\d\s\W]*$/.test(row)) return true; // digits/punctuation only
  return /\b(?:receipt|resit|invoice|inv|bill|tax\s*invoice|no\.?\s*[:#]|#|tel|fax|reg(?:istration)?\s*no|gst\s*(?:id|no)|sst\s*(?:id|no))\b/i.test(row);
}

function findVendor(rows: string[]): string | undefined {
  for (const row of rows) {
    if (!isDateOrNumberRow(row) && /[A-Za-z]{3,}/.test(row)) {
      return row;
    }
  }
  return undefined;
}

function findPaymentMethod(rows: string[]): string | undefined {
  const text = rows.join('\n');
  for (const [re, method] of PAYMENT_METHOD_RULES) {
    if (re.test(text)) return method;
  }
  return undefined;
}

function findKeywordAmount(rows: string[], keywordRe: RegExp): number | undefined {
  for (const row of rows) {
    if (!keywordRe.test(row)) continue;
    const amounts = amountsIn(row);
    if (amounts.length > 0) return amounts[amounts.length - 1];
  }
  return undefined;
}

function findTotal(rows: string[], items: ReceiptItem[], tax?: number): number {
  // 0. A FOREIGN-currency receipt that states the MYR settlement ("Charged RM844.67
  //    using 1 USD = 4.2446 MYR" — Stripe/subscription invoices): the RM figure is what
  //    actually left the bank, so it beats the foreign "Total $199.00" lines below.
  for (const row of rows) {
    if (!/\bcharged\b/i.test(row)) continue;
    const m = row.match(/RM\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/i);
    if (m) {
      const n = toAmount(m[1]);
      if (n > 0) return n;
    }
  }

  // 1. Largest amount on a total-keyword line (grand total ≥ subtotal, so the
  //    max across matching lines is the grand total even though "subtotal"
  //    also matches /total/).
  let best = 0;
  for (const row of rows) {
    if (!TOTAL_RE.test(row) || NOT_TOTAL_RE.test(row)) continue;
    for (const n of amountsIn(row)) {
      if (n > best) best = n;
    }
  }
  if (best > 0) return best;

  // 2. Largest RM-format amount in the bottom third of the receipt — but not
  //    from tender/change rows, which sit there too and exceed the total.
  const bottom = rows.slice(Math.floor((rows.length * 2) / 3));
  for (const row of bottom) {
    if (/\b(?:change|baki|tender)\b/i.test(row)) continue;
    for (const n of amountsIn(row)) {
      if (n > best) best = n;
    }
  }
  if (best > 0) return best;

  // 3. No total line read at all — mirror the Gemini prompt: sum items + tax.
  const itemSum = items.reduce((sum, i) => sum + i.amount, 0);
  if (itemSum > 0) return Number((itemSum + (tax || 0)).toFixed(2));
  return 0;
}

/**
 * Item rows: lines that end with an amount and aren't summary/payment rows.
 * Handles the two-line layout (name on one row, qty/prices on the next) by
 * carrying the previous name-only row forward when the amount row itself has
 * no readable name.
 */
function findItems(rows: string[]): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  let pendingName: string | null = null;

  for (const row of rows) {
    if (NON_ITEM_RE.test(row)) {
      pendingName = null;
      continue;
    }
    const match = row.match(TRAILING_AMOUNT_RE);
    if (!match) {
      // Name-only candidate for a two-line item — remember it.
      pendingName = /[A-Za-z]{2,}/.test(row) && !isDateOrNumberRow(row) ? row : null;
      continue;
    }
    const amount = toAmount(match[1]);
    if (amount <= 0) {
      pendingName = null;
      continue;
    }
    // Strip the trailing amount + any qty/unit-price run ("2 x ... 3.00 6.00")
    // so only the product name remains.
    let name = row.slice(0, match.index).trim();
    name = name.replace(/(?:\s*[@xX*]?\s*(?:RM\s*)?\d[\d.,]*)+\s*$/, '').trim();
    if (!/[A-Za-z]{2,}/.test(name)) {
      name = pendingName ?? '';
    }
    pendingName = null;
    if (name) items.push({ name, amount });
  }

  return items;
}

function findInvoiceNumber(rows: string[]): string | undefined {
  // "Invoice No: A-88123", "RESIT #12345", "Bill Number INV/2026/07" — keyword,
  // optional "no/number" filler word, punctuation gap, then the reference.
  const re = /\b(?:inv(?:oice)?|resit|receipt|bill|ref)\b(?:\s*(?:no|num|number)\b)?\.?[^A-Za-z0-9]{0,12}([A-Za-z0-9][A-Za-z0-9\/-]{3,})/i;
  for (const row of rows) {
    const match = row.match(re);
    if (match && !DATE_RES[0].test(match[1])) return match[1];
  }
  return undefined;
}

// ─── Shared OCR pass ────────────────────────────────────────

interface ParsedReceiptText {
  rows: string[];
  rawText: string;
}

async function runOcr(imagePath: string): Promise<ParsedReceiptText> {
  const recognizeText = getRecognizeText();
  if (!recognizeText) {
    throw new Error('On-device OCR is not available in this build.');
  }
  const ocr = await recognizeText(imagePath);
  const rows = reconstructRows(ocr);
  return { rows, rawText: rows.join('\n') };
}

/**
 * OCR an image to its reconstructed text ROWS (the input `parsePaymentScreenshot`
 * expects). Thin public wrapper over the shared `runOcr` so Share-to-Log reuses
 * the exact same ML Kit read + row reconstruction the receipt paths use. Guard
 * with `isLocalOcrAvailable()` first — throws when the native module is absent.
 */
export async function recognizeRows(imagePath: string): Promise<string[]> {
  return (await runOcr(imagePath)).rows;
}

export interface ReceiptDetection {
  vendor?: string;
  total: number;
  itemCount: number;
}

/**
 * Decide whether already-OCR'd rows are a STORE RECEIPT — vs a payment-confirmation
 * screen, a transaction-history list, or an in-app screen. Reuses the same heuristics
 * the local receipt scanner uses; free, offline, and does NOT re-OCR (it takes the rows
 * `recognizeRows` already produced). Shared by the iOS share extension and the app so
 * both agree on "is this a receipt".
 *
 * A receipt requires ALL of: a real grand-TOTAL line (TOTAL/JUMLAH/AMOUNT DUE, not a
 * change/tender line), a resolvable total > 0, at least TWO priced line items, and a
 * vendor name at the top. The grand-TOTAL-line requirement is the discriminator — a
 * payment screen or a transaction list has no "TOTAL RM x" line, so it returns null.
 */
export function extractReceiptFromRows(rows: string[]): ReceiptDetection | null {
  // The grand-total line is what separates a receipt from a payment screen / history list.
  const hasTotalLine = rows.some((row) => TOTAL_RE.test(row) && !NOT_TOTAL_RE.test(row));
  if (!hasTotalLine) return null;

  const items = findItems(rows);
  if (items.length < 2) return null; // a receipt has an itemised list, not a single price

  const vendor = findVendor(rows);
  if (!vendor) return null; // a shop name at the top

  const total = findTotal(rows, items, findKeywordAmount(rows, TAX_RE));
  if (!(total > 0)) return null;

  return { vendor, total, itemCount: items.length };
}

// ─── Entry points ───────────────────────────────────────────

/**
 * Personal-scan fallback: same result shape as receiptScanner's Gemini path.
 * Fields the heuristics can't read stay undefined (the review screen lets the
 * user fill them in); items may be empty. Never counts against the scan quota.
 */
export async function scanReceiptLocal(imagePath: string): Promise<ExtractedReceipt> {
  const { rows, rawText } = await runOcr(imagePath);

  const items = findItems(rows);
  const subtotal = findKeywordAmount(rows, SUBTOTAL_RE);
  const tax = findKeywordAmount(rows, TAX_RE);
  const total = findTotal(rows, items, tax);

  const result: ExtractedReceipt = {
    vendor: findVendor(rows),
    items,
    subtotal,
    tax,
    total,
    date: findDate(rows) ?? todayString(),
    rawText,
    paymentMethod: findPaymentMethod(rows),
    // No category guessing locally — the screen defaults to other/none and the
    // user picks. (The shared type has no confidence flag; the WeakSet marker
    // above is how callers detect a local scan.)
  };
  localResults.add(result);
  return result;
}

/** Seller-scan fallback: same result shape as the seller Gemini path. */
export async function scanSellerReceiptLocal(imagePath: string): Promise<SellerReceiptResult> {
  const { rows, rawText } = await runOcr(imagePath);

  const items = findItems(rows);
  const total = findTotal(rows, items, findKeywordAmount(rows, TAX_RE));

  const result: SellerReceiptResult = {
    vendor: findVendor(rows),
    items,
    total,
    date: findDate(rows) ?? todayString(),
    invoiceNumber: findInvoiceNumber(rows),
    // suggestedCategory omitted — the caller validates against its own list
    // and falls back to its default category.
    rawText,
  };
  localResults.add(result);
  return result;
}
