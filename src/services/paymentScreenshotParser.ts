/**
 * Payment-screenshot parser — the LOCAL (offline / AI-limit) brain for Share-to-Log.
 *
 * Input: OCR text ROWS, each row = one visual line with columns already joined
 * left→right (i.e. the output of localReceiptOcr's `reconstructRows`). Pure &
 * synchronous, so it unit-tests without ML Kit. The OCR step (image → rows) and the
 * logging step (→ logQuickExpense) live elsewhere; this file only turns text into a
 * structured `ParsedPayment`.
 *
 * Payment-success screens differ from receipts: ONE hero amount (not line items), a
 * payee, a ref id, a datetime, a method — and often a DISTRACTING wallet balance / fee /
 * cashback that must NOT be mistaken for the amount. See docs/SHARE_TO_LOG_PLAN.md.
 *
 * Decisions locked (2026-07-23): silent-log when confident; read wallet off the screen
 * (else default wallet); local + Echo both; iOS + Android. This is the LOCAL half.
 */

export type PaymentDirection = 'out' | 'in';

/** Why a screen is or isn't loggable — lets the pipeline craft the right notification. */
export type ParseReason = 'ok' | 'no_amount' | 'failed' | 'not_payment';

export interface ParsedPayment {
  /** True only for a loggable, SUCCESSFUL payment with an amount. Failed/undetected → false. */
  isPaymentScreen: boolean;
  reason: ParseReason;
  /** 'out' = expense (you paid), 'in' = income (you received). Null when not a payment. */
  direction: PaymentDirection | null;
  amount: number | null;
  currency: string; // 'MYR' default
  payee: string | null; // merchant or person (P2P)
  refId: string | null;
  datetime: Date | null;
  method: string | null; // 'scan_pay' | 'duitnow' | 'transfer' | 'qr'
  walletHint: string | null; // paying app/wallet → feed to resolveWallet (null → default wallet)
  confidence: number; // 0..1
}

// ── Amount ──────────────────────────────────────────────────
const MAX_AMOUNT = 1_000_000; // in sync with localReceiptOcr's cap
// Currency-prefixed (decimals optional: "RM 60") OR a bare 2-decimal number ("182.50").
// A bare integer ("32 degrees") is intentionally NOT an amount. No lookbehind — Hermes-safe.
const AMOUNT_RE =
  /(RM|MYR|SGD|USD|S\$|US\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|\b(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\b/gi;

// Rows whose amount is NOT the payment: wallet balance, fee, reward, points, cashback.
const NOT_PAYMENT_AMOUNT_RE =
  /\b(balance|baki|available|remaining|reward|ganjaran|cashback|pulangan|fee|charge|caj|point|mata|\bpts\b|saving|jimat)\b/i;
// Rows that explicitly label the payment amount → strong signal.
const AMOUNT_LABEL_RE = /\b(amount|jumlah|you\s*paid|you\s*sent|paid|total|transfer\s*amount|bayaran?)\b/i;

function normalizeCurrency(sym: string): string {
  const s = sym.toUpperCase();
  if (s === 'RM' || s === 'MYR') return 'MYR';
  if (s === 'SGD' || s === 'S$') return 'SGD';
  if (s === 'USD' || s === 'US$') return 'USD';
  return 'MYR';
}

function toAmount(raw: string): number {
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? Math.round(n * 100) / 100 : 0;
}

interface AmountHit {
  value: number;
  currency: string | null;
  rowIndex: number;
  labelled: boolean;
  excluded: boolean;
}

function collectAmounts(rows: string[]): AmountHit[] {
  const hits: AmountHit[] = [];
  rows.forEach((row, rowIndex) => {
    const excluded = NOT_PAYMENT_AMOUNT_RE.test(row);
    const labelled = AMOUNT_LABEL_RE.test(row);
    for (const m of row.matchAll(AMOUNT_RE)) {
      const currency = m[1] ? normalizeCurrency(m[1]) : null;
      const value = toAmount(m[2] ?? m[3] ?? '');
      if (value > 0) hits.push({ value, currency, rowIndex, labelled, excluded });
    }
  });
  return hits;
}

/**
 * Pick THE payment amount. ponytail: heuristic with a known ceiling —
 *   1) an amount on an "amount/you paid/total" labelled row (largest such), else
 *   2) the top-most non-excluded amount (balance/fee/reward rows already dropped).
 * Upgrade path: when Echo is available it overrides a low-confidence pick; and real
 * multi-amount fixtures (TnG showing balance) will tune NOT_PAYMENT_AMOUNT_RE.
 */
function pickAmount(hits: AmountHit[]): AmountHit | null {
  const usable = hits.filter((h) => !h.excluded);
  if (usable.length === 0) return null;
  const labelled = usable.filter((h) => h.labelled);
  if (labelled.length) return labelled.reduce((a, b) => (b.value > a.value ? b : a));
  return usable.reduce((a, b) => (b.rowIndex < a.rowIndex ? b : a)); // top-most
}

// ── Status / direction ──────────────────────────────────────
const SUCCESS_RE =
  /\b(payment\s*successful|transfer\s*successful|transaction\s*successful|successful|berjaya|payment\s*complete|success)\b|\bpaid\b|duitnow/i;
const FAIL_RE = /\b(failed|unsuccessful|gagal|declined|rejected|cancelled|canceled|tidak\s*berjaya)\b/i;
const INCOMING_RE = /\b(received|you\s*received|diterima|credited|money\s*in|incoming|masuk)\b/i;
const OUTGOING_RE = /\b(paid|sent|payment|bayar|scan\s*&?\s*pay|transfer\s*to|kepada|debited)\b/i;

// ── Payee ───────────────────────────────────────────────────
// Rows that are labels/metadata, never a payee.
const LABEL_ROW_RE =
  /\b(reference|ref\s*no|rujukan|transaction|date|time|tarikh|masa|type|jenis|status|successful|berjaya|receipt|resit|share|done|balance|baki|amount|jumlah|method|kaedah|wallet|bank|payment|failed|gagal|try\s*again)\b/i;
// "to NAME" / "from NAME" / "kepada NAME" — the payee is captured directly.
const TO_FROM_RE = /\b(?:to|kepada|from|daripada|dari)\s+([A-Za-z][A-Za-z'@.\- ]{2,})$/i;

function extractPayee(rows: string[], amountRowIndex: number): string | null {
  // 1) explicit "to/from NAME"
  for (const row of rows) {
    const m = row.match(TO_FROM_RE);
    if (m) return tidy(m[1]);
  }
  // 2) first "namey" row after the amount (merchant like LNTHAIFOOD, or a person)
  for (let i = amountRowIndex + 1; i < rows.length; i++) {
    const row = rows[i].trim();
    if (isNameyRow(row)) return tidy(row);
  }
  // 3) fallback: a namey row anywhere (some layouts put payee above the amount)
  for (const row of rows) {
    if (isNameyRow(row.trim())) return tidy(row);
  }
  return null;
}

function isNameyRow(row: string): boolean {
  if (!row || LABEL_ROW_RE.test(row)) return false;
  const letters = (row.match(/[A-Za-z]/g) || []).length;
  if (letters < 3) return false;
  if (/\d/.test(row.replace(/[A-Za-z]/g, '')) && letters < row.length / 2) return false; // mostly digits
  return true;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ── Reference id ────────────────────────────────────────────
const REF_LABEL_RE = /\b(reference(?:\s*(?:id|no|number))?|ref(?:\s*(?:no|id))?|transaction\s*(?:id|no|ref)|no\.?\s*rujukan|rujukan|resit\s*no)\b[:.\s]*/i;
const REF_TOKEN_RE = /\b([A-Z0-9]{8,})\b/; // ≥8 alnum with ≥4 digits, not a date/amount

function extractRefId(rows: string[]): string | null {
  for (const row of rows) {
    const lbl = row.match(REF_LABEL_RE);
    if (lbl) {
      const rest = row.slice(lbl.index! + lbl[0].length);
      const t = rest.match(REF_TOKEN_RE);
      if (t && countDigits(t[1]) >= 4) return t[1];
    }
  }
  // no label — a standalone id-looking token
  for (const row of rows) {
    for (const m of row.matchAll(/\b([A-Z0-9]{8,})\b/g)) {
      if (countDigits(m[1]) >= 4 && /[A-Z]/.test(m[1])) return m[1];
    }
  }
  return null;
}

function countDigits(s: string): number {
  return (s.match(/\d/g) || []).length;
}

// ── Date / time ─────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, mac: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6,
  aug: 7, ogo: 7, ogos: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, dis: 11,
};
const DMY_TEXT_RE = /\b(\d{1,2})\s+([A-Za-z]{3,4})[a-z]*\s+(\d{2,4})\b/; // 18 May 2026
const DMY_NUM_RE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/; // 18/05/2026 (MY = d/m/y)
const TIME_RE = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i;

function extractDateTime(rows: string[]): Date | null {
  let y: number | null = null, mo: number | null = null, d: number | null = null;
  for (const row of rows) {
    const t = row.match(DMY_TEXT_RE);
    if (t) {
      d = +t[1]; mo = MONTHS[t[2].toLowerCase().slice(0, 3)] ?? MONTHS[t[2].toLowerCase()]; y = norm2Year(+t[3]);
      break;
    }
    const n = row.match(DMY_NUM_RE);
    if (n) { d = +n[1]; mo = +n[2] - 1; y = norm2Year(+n[3]); break; }
  }
  if (y == null || mo == null || d == null || isNaN(mo)) return null;
  let h = 0, min = 0;
  for (const row of rows) {
    const tm = row.match(TIME_RE);
    if (tm) {
      h = +tm[1]; min = +tm[2];
      const ap = tm[3]?.toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      break;
    }
  }
  const dt = new Date(y, mo, d, h, min, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

function norm2Year(y: number): number {
  return y < 100 ? 2000 + y : y;
}

// ── Method + wallet hint ────────────────────────────────────
const METHOD_RULES: [RegExp, string][] = [
  [/scan\s*&?\s*pay/i, 'scan_pay'],
  [/duitnow/i, 'duitnow'],
  [/transfer/i, 'transfer'],
  [/\bqr\b/i, 'qr'],
];
function extractMethod(rows: string[]): string | null {
  const joined = rows.join(' ');
  for (const [re, m] of METHOD_RULES) if (re.test(joined)) return m;
  return null;
}

// Paying app/wallet from brand text. Ordered: specific wallets before generic banks.
// Returns a token/name for resolveWallet (which maps to a wallet or falls back to default).
const WALLET_BRANDS: [RegExp, string][] = [
  [/touch\s*'?n'?\s*go|tng\s*ewallet|\btng\b/i, 'tng'],
  [/\bmae\b|maybank/i, 'maybank'],
  [/gx\s*bank|gxbank/i, 'gxbank'],
  [/boost/i, 'boost'],
  [/grab\s*pay|\bgrab\b/i, 'grabpay'],
  [/shopee\s*pay|shopee/i, 'shopee_pay'],
  [/setel/i, 'setel'],
  [/bigpay/i, 'bigpay'],
  [/\bcimb\b/i, 'cimb'],
  [/public\s*bank/i, 'public_bank'],
  [/\brhb\b/i, 'rhb'],
  [/hong\s*leong/i, 'hong_leong'],
  [/\bbsn\b/i, 'bsn'],
  [/\bocbc\b/i, 'ocbc_my'],
  [/\buob\b/i, 'uob_my'],
];
function extractWalletHint(rows: string[]): string | null {
  const joined = rows.join(' ');
  for (const [re, token] of WALLET_BRANDS) if (re.test(joined)) return token;
  return null;
}

// ── Currency ────────────────────────────────────────────────
function detectCurrency(rows: string[], picked: AmountHit | null): string {
  if (picked?.currency) return picked.currency;
  const joined = rows.join(' ');
  if (/\bSGD\b|S\$/i.test(joined)) return 'SGD';
  if (/\bUSD\b|US\$/i.test(joined)) return 'USD';
  return 'MYR';
}

// ── Orchestrator ────────────────────────────────────────────
export function parsePaymentScreenshot(rawRows: string[]): ParsedPayment {
  const rows = rawRows.map((r) => (r ?? '').toString()).filter((r) => r.trim().length > 0);
  const joined = rows.join(' \n ');

  const hits = collectAmounts(rows);
  const picked = pickAmount(hits);
  const failed = FAIL_RE.test(joined);
  const success = SUCCESS_RE.test(joined);
  const incoming = INCOMING_RE.test(joined);
  const outgoing = OUTGOING_RE.test(joined);

  const empty: ParsedPayment = {
    isPaymentScreen: false, reason: 'not_payment', direction: null, amount: null,
    currency: 'MYR', payee: null, refId: null, datetime: null, method: null,
    walletHint: null, confidence: 0,
  };

  // A failed/declined screen: never log a wrong success.
  if (failed && !success) return { ...empty, reason: 'failed' };

  // Looks like a payment (status word, or an amount + a paid/received verb)?
  const looksLikePayment = success || (!!picked && (outgoing || incoming));
  if (!looksLikePayment) return empty;
  if (!picked) return { ...empty, isPaymentScreen: false, reason: 'no_amount' };

  const direction: PaymentDirection = incoming ? 'in' : 'out';
  const payee = extractPayee(rows, picked.rowIndex);
  const refId = extractRefId(rows);
  const datetime = extractDateTime(rows);
  const method = extractMethod(rows);
  const walletHint = extractWalletHint(rows);
  const currency = detectCurrency(rows, picked);

  // Confidence: amount is the backbone; each extra field corroborates.
  let confidence = 0.45;
  if (success) confidence += 0.2;
  if (payee) confidence += 0.15;
  if (refId) confidence += 0.1;
  if (datetime) confidence += 0.1;
  confidence = Math.min(1, confidence);

  return {
    isPaymentScreen: true, reason: 'ok', direction, amount: picked.value,
    currency, payee, refId, datetime, method, walletHint, confidence,
  };
}
