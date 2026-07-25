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
export type ParseReason = 'ok' | 'no_amount' | 'failed' | 'not_payment' | 'not_payment_screen';

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
  /**
   * The local reader isn't sure this ISN'T a payment — the screen has a price but wasn't a
   * confident payment nor a confident reject (list/summary/receipt). True ⇒ "worth asking
   * the AI" (a possibly-complicated payment the rules didn't recognize). False for a clear
   * payment, a clear reject, a failed screen, or a screen with no amount at all.
   */
  uncertain: boolean;
}

// ── Amount ──────────────────────────────────────────────────
const MAX_AMOUNT = 1_000_000; // in sync with localReceiptOcr's cap
// Currency-prefixed (decimals optional: "RM 60") OR a bare 2-decimal number ("182.50").
// A bare integer ("32 degrees") is intentionally NOT an amount. No lookbehind — Hermes-safe.
const AMOUNT_RE =
  /(RM|MYR|SGD|USD|S\$|US\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|\b(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\b/gi;

// Rows whose amount is NOT the payment: wallet balance, fee, reward, points, cashback —
// and PROMO figures ("up to RM400", "had belanja RM400" spending-limit ads), which are
// never the payment amount even when they're the only other number on screen.
const NOT_PAYMENT_AMOUNT_RE =
  /\b(balance|baki|available|remaining|reward|ganjaran|cashback|pulangan|fee|charge|caj|point|mata|\bpts\b|saving|jimat|limit|up\s*to|sehingga|had\s*belanja)\b/i;
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

// A row that is a date and/or time — its date/time numbers are NEVER a money amount (a
// dot-garbled time "01.21 AM" would otherwise read as RM 1.21). But the row can ALSO hold
// a real amount next to the date ("Thank you! Payment of RM300.03 on 24/07/2026"), so
// collectAmounts strips the date/time text and collects from what's LEFT, not blanket-
// excludes the row.
function isDateOrTimeRow(row: string): boolean {
  if (DMY_TEXT_RE.test(row) || DMY_NUM_RE.test(row) || MDY_TEXT_RE.test(row)) return true;
  return /\d\s*[:.;'\s]?\s*\d{2}\s*[ap]\.?\s?m(?![a-z])/i.test(row); // "01.21 AM" / "0121AM"
}

// Remove the date/time substrings isDateOrTimeRow detects, leaving any real amount behind.
function stripDateTime(row: string): string {
  return row
    .replace(DMY_TEXT_RE, ' ')
    .replace(DMY_NUM_RE, ' ')
    .replace(MDY_TEXT_RE, ' ')
    .replace(/\d\s*[:.;'\s]?\s*\d{2}\s*[ap]\.?\s?m(?![a-z])\.?/i, ' ')
    .replace(/\b[012]?\d:[0-5]\d(?::[0-5]\d)?\b/, ' ');
}

function collectAmounts(rows: string[]): AmountHit[] {
  const hits: AmountHit[] = [];
  rows.forEach((row, rowIndex) => {
    const isDt = isDateOrTimeRow(row);
    const scan = isDt ? stripDateTime(row) : row;
    const excluded = NOT_PAYMENT_AMOUNT_RE.test(row) || (isDt && scan.match(AMOUNT_RE) == null);
    const labelled = AMOUNT_LABEL_RE.test(row);
    for (const m of scan.matchAll(AMOUNT_RE)) {
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
// STRONG success phrases only (excludes bare "paid"/"payment", which litter list screens).
// Used as one of the "hard payment signals" that lets a multi-amount screen still count.
const SUCCESS_PHRASE_RE =
  /\b(payment\s*successful|transfer\s*successful|transaction\s*successful|berjaya|payment\s*complete|paid\s*successfully|sent\s*successfully|\bsuccessful\b)\b/i;
const FAIL_RE = /\b(failed|unsuccessful|gagal|declined|rejected|cancelled|canceled|tidak\s*berjaya)\b/i;
const INCOMING_RE = /\b(received|you\s*received|diterima|credited|money\s*in|incoming|masuk)\b/i;
const OUTGOING_RE = /\b(paid|sent|payment|bayar|scan\s*&?\s*pay|transfer\s*to|kepada|debited)\b/i;
// A hint that a screen is a MONEY-MOVEMENT screen the local rules only half-recognized — enough
// to spend one AI look. A bare PRICE is NOT one: a menu, a POS/Sell screen, a product page all
// have a price, and none should be "uncertain" (that wasted an AI call and showed "needs a
// closer look"). Deliberately excludes bare "qr"/"payment", which litter non-payment app UI.
const PAYMENT_HINT_RE =
  /\b(duitnow|scan\s*&?\s*pay|funds?\s*transfer|transfer\s*(?:to|from)|transferred|paid\s*to|sent\s*to|remittance|telah\s*dibayar)\b/i;

// Summary / list screens — debt & split trackers, "you owe / owed to you / unpaid",
// spend breakdowns — contain amounts and a stray "paid"/"payment" word but are NOT a
// single payment confirmation. Matching this rejects the screen outright, so e.g. a
// "You owe RM650 · 100.00 paid" debts screen never logs a phantom RM100 payment.
const NOT_PAYMENT_SCREEN_RE =
  /\b(you\s*owe|owed\s*to\s*you|you'?re\s*owed|unpaid|\bsplits?\b|\bdebts?\b|installments?|across\s*\d+\s*splits?|commitments?|upcoming|overdue|this\s*month)\b/i;

// Transaction HISTORY / statement lists (bank & e-wallet apps — Maybank, TnG, CIMB…): a
// "history"/"statement" header, OR several date-group headers, OR many signed ledger rows.
// These lists carry per-row DuitNow/QR reference tokens that would otherwise satisfy the
// single-payment "hard signal", so they must be rejected by SHAPE before that check — a real
// single payment has ONE amount, ONE date, and no "history" header.
const HISTORY_HEADER_RE =
  /\b(transaction\s*history|\bhistory\b|e-?statement|\bstatement\b|penyata|transaction\s*list|activity\s*log|\bactivity\b|aktiviti|mutasi|riwayat)\b/i;
// A row that is JUST a date-group header: "Yesterday" / "Today" / a bare date with no label.
const DATE_HEADER_WORD_RE = /^(yesterday|today|semalam|hari\s*ini|this\s*week|last\s*week)$/i;
// A ledger row: a signed RM amount ("-RM 20.15" / "+RM50"). Several ⇒ a list, not one payment.
const LEDGER_ROW_RE = /(?:^|\s)[-+]\s*(?:RM|MYR)\s*\d/i;

// ── Payee ───────────────────────────────────────────────────
// Rows that are labels/metadata, never a payee. Includes the generic screen words a
// bill-pay confirmation shows instead of a merchant name ("Bill Payment", "Bill Paid",
// "Bills") — those are the payment TYPE, not who was paid — and Gmail/mail UI junk
// ("Based on this email Correct?", "ADAPTIS Notification", "Reply o Forward", "to me")
// that litters emailed payment confirmations. Navigation/button rows ("Back to Home",
// "Back to Bills") are UI, never a payee either.
const LABEL_ROW_RE =
  /\b(reference|ref\s*no|rujukan|transaction|date|time|tarikh|masa|type|jenis|status|successful|berjaya|receipt|resit|share|done|balance|baki|amount|jumlah|method|kaedah|wallet|bank|payment|paid|bills?|failed|gagal|try\s*again|e-?mail|inbox|reply|forward|correct|notification|to\s+me|(?:back|return|go)\s+to)\b/i;
// "to NAME" / "from NAME" / "kepada NAME" — the payee is captured directly.
const TO_FROM_RE = /\b(?:to|kepada|from|daripada|dari)\s+([A-Za-z][A-Za-z'@.\- ]{2,})$/i;
// …but NOT a navigation/button row — "Back to Bills" is a button, "Bills" is not a payee.
const NAV_TO_RE = /^(?:back|return|go|continue|proceed)\s+to\b/i;
// A bank spend-notification captured in the screenshot names the merchant: "You've just
// spent RM 292.65 at ATOME* MONTHLYBILL with your Maybank Debit Card". Capture between
// "at"/"di" and " with/via/using" (or EOL); statement-style "* " separators collapse.
const AT_MERCHANT_RE =
  /\b(?:at|di)\s+([A-Z0-9][A-Za-z0-9*'&.,\- ]{2,}?)(?=\s+(?:with|via|using|on)\b|\s*$)/i;
// Bill-pay EMAIL confirmations name the merchant as "CelcomDigi bill" or in the subject
// "CelcomDigi - Payment details". The merchant is the part BEFORE "bill"/the dash.
const BILL_PAYEE_RE = /^([A-Za-z0-9][A-Za-z0-9&.'\- ]{2,}?)\s+bills?\b/i;
const SUBJECT_PAYEE_RE = /^([A-Za-z0-9][A-Za-z0-9&.' ]{2,}?)\s*[-–—]\s*payment\s*(?:details|receipt|confirmation)\b/i;
// Label that introduces the payee VALUE: "Merchant  Acme Sdn Bhd", "Payee: Ali", and the
// two-line transfer-receipt form "Beneficiary name\nMOHD FIRDAUS BIN ABIDIN". It absorbs a
// trailing "name"/"account holder" so "Beneficiary name" is the LABEL (and doesn't capture the
// word "name"), and excludes "Recipient reference" (a free-text note, not the payee). The value
// is captured inline when present, else taken from the next namey row.
const PAYEE_LABEL_RE =
  /\b(?:merchant|payee|beneficiary|penerima|recipient(?!\s+reference)|paid\s*to|pay\s*to)(?:\s+(?:name|account\s*holder))?\b\s*[:\-]?\s*(.*)$/i;
// Label-continuation / metadata words that must never be returned as the payee value.
const LABEL_WORD_RE = /^(?:name|reference|account|number|no|bank|holder|details|id|type)\b/i;

function extractPayee(rows: string[], amountRowIndex: number): string | null {
  // Pass order matters: an explicit LABEL ("Beneficiary name") is the strongest payee
  // signal and must beat a WEAK capture from a truncated bank-notification row
  // ("You've transferred RM 585.00 to MOHD" — the name continues on the next row, which
  // isn't part of the capture). Previously the first matching ROW won, so "MOHD" beat
  // "MOHD FIRDAUS BIN ABIDIN" just by sitting higher on screen.
  //
  // 1) explicit label → value: "Merchant: NAME", "Beneficiary name\nNAME" (two-line).
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const mm = row.match(PAYEE_LABEL_RE);
    if (mm) {
      const inline = tidy(mm[1] ?? '');
      if (inline && isNameyRow(inline) && !LABEL_WORD_RE.test(inline)) return inline;
      // Label row with no usable inline value (two-line layout) → the value is the NEXT
      // namey row (e.g. "Beneficiary name" then "MOHD FIRDAUS BIN ABIDIN").
      for (let j = i + 1; j < rows.length; j++) {
        const v = rows[j].trim();
        if (!v) continue;
        if (isNameyRow(v) && !LABEL_WORD_RE.test(v)) return tidy(v);
        break; // the next non-empty row is another label/metadata → this label has no value
      }
    }
  }
  // 2) bill-email patterns: "CelcomDigi bill" / subject "CelcomDigi - Payment details".
  for (const row of rows) {
    const bill = row.match(BILL_PAYEE_RE) ?? row.match(SUBJECT_PAYEE_RE);
    if (bill) {
      const v = tidy(bill[1]);
      if (v && isNameyRow(v) && !LABEL_WORD_RE.test(v)) return v;
    }
  }
  // 3) bank spend-notification "… at MERCHANT with your Maybank …".
  for (const row of rows) {
    const at = row.match(AT_MERCHANT_RE);
    if (at) {
      const merchant = tidy(at[1].replace(/\*\s*/g, ' '));
      if (merchant && isNameyRow(merchant) && !LABEL_WORD_RE.test(merchant)) return merchant;
    }
  }
  // 4) "to NAME" / "from NAME" — WEAKEST (notification rows truncate the name).
  for (const row of rows) {
    const m = row.match(TO_FROM_RE);
    if (m && !NAV_TO_RE.test(row)) {
      const v = tidy(m[1]);
      // "Add Email to Contact Email" → "Contact Email" is UI junk, not a payee.
      if (v && isNameyRow(v) && !LABEL_WORD_RE.test(v)) return v;
    }
  }
  // 5) first "namey" row after the amount (merchant like LNTHAIFOOD, or a person)
  for (let i = amountRowIndex + 1; i < rows.length; i++) {
    const row = rows[i].trim();
    if (isNameyRow(row)) return tidy(row);
  }
  // 6) fallback: a namey row anywhere (some layouts put payee above the amount)
  for (const row of rows) {
    if (isNameyRow(row.trim())) return tidy(row);
  }
  return null;
}

function isNameyRow(row: string): boolean {
  if (!row || LABEL_ROW_RE.test(row)) return false;
  if (/\d{1,2}:\d{2}/.test(row)) return false; // a name never contains a timestamp
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

// LABEL-anchored ref only ("Reference No: X", "Ref: X"). A single payment shows its ref this
// way; a history list's per-row DuitNow/QR tokens are BARE (no label). Used as the hard
// "single-payment" signal so a bare list token can't rescue a multi-amount list.
function extractLabeledRefId(rows: string[]): string | null {
  for (const row of rows) {
    const lbl = row.match(REF_LABEL_RE);
    if (lbl) {
      const rest = row.slice(lbl.index! + lbl[0].length);
      const t = rest.match(REF_TOKEN_RE);
      if (t && countDigits(t[1]) >= 4) return t[1];
    }
  }
  return null;
}

function extractRefId(rows: string[]): string | null {
  const labeled = extractLabeledRefId(rows);
  if (labeled) return labeled;
  // no label — a standalone id-looking token (used for dedupe, NOT as a payment signal)
  for (const row of rows) {
    for (const m of row.matchAll(/\b([A-Z0-9]{8,})\b/g)) {
      if (countDigits(m[1]) >= 4 && /[A-Z]/.test(m[1])) return m[1];
    }
  }
  return null;
}

// Count DISTINCT bare (unlabeled) id-looking tokens — one per row in a history list (each
// transaction's DuitNow/QR reference). ≥2 of these ⇒ a multi-transaction list, not a single
// payment (whose ONE ref is label-anchored, so it's skipped here).
function countBareRefTokens(rows: string[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    if (REF_LABEL_RE.test(row)) continue; // a labeled ref belongs to a single payment
    for (const m of row.matchAll(/\b([A-Z0-9]{8,})\b/g)) {
      if (countDigits(m[1]) >= 4 && /[A-Z]/.test(m[1])) seen.add(m[1]);
    }
  }
  return seen.size;
}

function countDigits(s: string): number {
  return (s.match(/\d/g) || []).length;
}

// ── Date / time ─────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, mac: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6,
  aug: 7, ogo: 7, ogos: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, dis: 11,
};
const DMY_TEXT_RE = /\b(\d{1,2})\s*([A-Za-z]{3,4})[a-z]*\s+(\d{2,4})\b/; // 18 May 2026 / OCR-merged "24Jul 2026"
const DMY_NUM_RE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/; // 18/05/2026 (MY = d/m/y)
// A date with NO year — "24 Jul" on a success screen. The year is assumed (see
// extractDateTime): the current year, rolled back one when that lands in the future.
const DM_YEARLESS_RE = /\b(\d{1,2})\s*([A-Za-z]{3,4})[a-z]*\b/;
// Month-first (US/Stripe invoices): "July 25, 2026" / "July 25th, 2026". Year is 4-digit —
// a 2-digit tail would let a period label like "May 2026" misread as the 20th.
const MDY_TEXT_RE = /\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/;

// ── Time (OCR-tolerant) ─────────────────────────────────────
// A receipt timestamp ("01:21 AM") is often light-grey text the OCR GARBLES: the colon becomes
// a dot/space or vanishes, a leading 0 reads as "O", a 1 as "l"/"I". We recover the EXACT time
// from these forms — but ONLY right before an am/pm marker (so a stray number is never misread
// as a time). A clean 24h "HH:MM" is the fallback for timestamps with no am/pm ("12:57:47").
// am/pm marker — matched by position (not \b) so it works even when glued to the time
// ("01:21AM"); a letter directly before it means it's inside a word ("Amount"), so we reject.
const AMPM_G = /([ap])\s*\.?\s*m(?![a-z])\.?/gi;
// Letter→digit confusions the OCR makes inside a numeric timestamp (applied only to the few
// chars right before am/pm, so it never corrupts real words elsewhere on the row).
function deOcrDigits(s: string): string {
  return s
    .replace(/[Oo]/g, '0')
    .replace(/[lIi|!]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2');
}

function extractTime(rows: string[]): { h: number; min: number; ambiguous: boolean } | null {
  // 1) am/pm-anchored — recovers the garbled grey timestamp.
  for (const row of rows) {
    for (const ap of row.matchAll(AMPM_G)) {
      const idx = ap.index!;
      // am/pm right after a letter is part of a word ("Amount"/"Sample"), not a real marker.
      if (idx > 0 && /[A-Za-z]/.test(row[idx - 1])) continue;
      const tail = deOcrDigits(row.slice(Math.max(0, idx - 8), idx));
      const m = tail.match(/(\d{1,2})\s*[:.;'\s]?\s*(\d{2})\s*$/);
      if (!m) continue;
      let h = +m[1];
      const min = +m[2];
      if (h >= 1 && h <= 12 && min < 60) {
        const which = ap[1].toLowerCase();
        if (which === 'p' && h < 12) h += 12;
        if (which === 'a' && h === 12) h = 0;
        return { h, min, ambiguous: false };
      }
    }
  }
  // 2) clean 24h "HH:MM" anywhere (no am/pm), e.g. a details screen "12:57:47". The hour
  // must be TWO digits — a one-digit "5:54" in flowing text is too likely to be the
  // status-bar clock with its am/pm cropped away (handled below, not here).
  for (const row of rows) {
    const t = row.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
    if (t) return { h: +t[1], min: +t[2], ambiguous: false };
  }
  // 3) the phone's STATUS-BAR clock ≈ when the screenshot (and the payment) happened. OCR
  // joins the whole bar into one row of icon-garbage — "5:54 A l5G 33)" — so the clock
  // must be at the row START with no real word after it ("5:54 meeting" is content, not
  // the status bar). 12h-AMBIGUOUS (no am/pm) → resolved against the share moment in
  // extractDateTime: the reading that "just happened" (closest to now, not future) wins.
  for (const row of rows) {
    const t = row.trim().match(/^(\d{1,2}):([0-5]\d)\s*(.*)$/);
    if (t && +t[1] >= 1 && +t[1] <= 12 && !/[a-z]{3,}/.test(t[3])) {
      return { h: +t[1], min: +t[2], ambiguous: true };
    }
  }
  return null;
}

// A bare status-bar clock is 12h-ambiguous ("5:54" = 5:54 AM or 5:54 PM?). Pick the
// reading that best fits "just happened": closest to now without being in the future
// (2-min slack for a screenshot shared seconds later); if both are in the future, the
// nearer one. Shared at ~5:54pm → 17; shared at 2am → the PM 8h back beats the AM 20h back.
function resolveAmPm(h12: number, min: number, y: number, mo: number, d: number): number {
  const now = Date.now();
  const SLACK = 2 * 60_000;
  const amH = h12 % 12, pmH = (h12 % 12) + 12;
  const am = new Date(y, mo, d, amH, min).getTime();
  const pm = new Date(y, mo, d, pmH, min).getTime();
  const amOk = am <= now + SLACK, pmOk = pm <= now + SLACK;
  if (amOk !== pmOk) return pmOk ? pmH : amH;
  return Math.abs(now - pm) <= Math.abs(now - am) ? pmH : amH;
}

function extractDateTime(rows: string[]): Date | null {
  let y: number | null = null, mo: number | null = null, d: number | null = null;
  for (const row of rows) {
    const t = row.match(DMY_TEXT_RE);
    if (t) {
      // Validate the month word — with the OCR-merged optional space ("24Jul"), a
      // non-month word can match the shape; don't break on it, keep scanning.
      const m = MONTHS[t[2].toLowerCase().slice(0, 3)] ?? MONTHS[t[2].toLowerCase()];
      if (m != null) { d = +t[1]; mo = m; y = norm2Year(+t[3]); break; }
    }
    const n = row.match(DMY_NUM_RE);
    if (n) { d = +n[1]; mo = +n[2] - 1; y = norm2Year(+n[3]); break; }
    // Month-first "July 25, 2026" (US/Stripe invoices) — month word validated the same way.
    const mdy = row.match(MDY_TEXT_RE);
    if (mdy) {
      const m = MONTHS[mdy[1].toLowerCase().slice(0, 3)] ?? MONTHS[mdy[1].toLowerCase()];
      if (m != null) { d = +mdy[2]; mo = m; y = norm2Year(+mdy[3]); break; }
    }
    // Yearless "24 Jul": only if the month word is real (else "5 commitments" would match).
    const yl = row.match(DM_YEARLESS_RE);
    if (yl) {
      const m = MONTHS[yl[2].toLowerCase().slice(0, 3)] ?? MONTHS[yl[2].toLowerCase()];
      if (m != null) { d = +yl[1]; mo = m; y = null; break; }
    }
  }
  if (mo == null || d == null || isNaN(mo)) return null;
  const time = extractTime(rows);
  if (y == null) {
    // No year on screen → current year; if that's more than ~2 days in the FUTURE, the
    // payment was last year (e.g. "28 Dec" seen in early Jan).
    const now = new Date();
    y = now.getFullYear();
    if (new Date(y, mo, d).getTime() - now.getTime() > 2 * 86_400_000) y -= 1;
  }
  const dt = new Date(
    y, mo, d,
    time ? (time.ambiguous ? resolveAmPm(time.h, time.min, y, mo, d) : time.h) : 0,
    time?.min ?? 0, 0, 0,
  );
  return isNaN(dt.getTime()) ? null : dt;
}

function norm2Year(y: number): number {
  return y < 100 ? 2000 + y : y;
}

// True when a row is ONLY a date-group header (a history-list separator), not a labelled
// "Date & time <x>" line on a payment screen. Kept short so a full "Date/Time 14/06/2026
// 12:57:47" details-screen line does NOT count as a header.
function isDateHeaderRow(row: string): boolean {
  const r = row.trim();
  if (DATE_HEADER_WORD_RE.test(r)) return true;
  return r.length <= 18 && (DMY_TEXT_RE.test(r) || DMY_NUM_RE.test(r));
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
  [/\bmae\b|maybank|malayan\s*banking/i, 'maybank'],
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
    walletHint: null, confidence: 0, uncertain: false,
  };

  // Guards FIRST — a list / summary / pricing screen (debts, bills, subscriptions, a
  // paywall) is never a single payment, even if a stray "paid"/"failed"/"cancel" word
  // happens to appear on it. These must beat the failed-payment check below. Tagged
  // `not_payment_screen` (distinct from the plain `not_payment` rejects below) so the
  // Share-to-Log caller knows this is an in-app screen and must NOT try the receipt
  // detector on it — only genuine not-a-payment screenshots are receipt-eligible.
  if (NOT_PAYMENT_SCREEN_RE.test(joined)) return { ...empty, reason: 'not_payment_screen' };

  const distinctAmounts = new Set(hits.filter((h) => !h.excluded).map((h) => h.value)).size;

  // Transaction HISTORY / statement list → reject by SHAPE, before the hard-signal check below.
  // A bank/e-wallet history list has many dated merchant rows, each with an amount and a per-row
  // DuitNow/QR reference token; that BARE token would otherwise satisfy the single-payment
  // signal and let the list log its top row (e.g. a Maybank list logging RM 20.15). A real
  // single payment has exactly ONE non-excluded amount, ONE date, and its ref is LABEL-anchored
  // — so the list shape (a header word, ≥2 date headers, ≥3 signed ledger rows, or ≥2 bare
  // per-row ref tokens) is a confident reject. Gated on ≥2 distinct amounts: a single payment
  // has exactly one (balance/fee are excluded from `hits`), so it can NEVER trip this.
  const dateHeaderCount = rows.filter(isDateHeaderRow).length;
  const ledgerRowCount = rows.filter((r) => LEDGER_ROW_RE.test(r)).length;
  const bareRefTokens = countBareRefTokens(rows);
  if (
    distinctAmounts >= 2 &&
    (HISTORY_HEADER_RE.test(joined) ||
      dateHeaderCount >= 2 ||
      ledgerRowCount >= 3 ||
      bareRefTokens >= 2)
  ) {
    return { ...empty, reason: 'not_payment' };
  }

  // Multi-amount guard: a real payment confirmation shows ONE hero amount (balances/fees
  // are already excluded from `hits`). Several distinct amounts ⇒ a list/summary/pricing
  // screen UNLESS it carries a hard payment signal — an explicit "successful" phrase or a
  // LABEL-anchored reference id. A METHOD word (DuitNow / Scan & Pay) and a BARE token both
  // litter history lists, so neither counts — only a labeled ref, which single-payment
  // details screens have and list rows don't.
  const refId = extractRefId(rows);
  const method = extractMethod(rows);
  const labeledRefId = extractLabeledRefId(rows);
  const strongSignal = SUCCESS_PHRASE_RE.test(joined) || !!labeledRefId;
  if (distinctAmounts >= 3 && !strongSignal) return empty;

  // A failed/declined SINGLE payment: never log a wrong success.
  if (failed && !success) return { ...empty, reason: 'failed' };

  // Looks like a payment (status word, or an amount + a paid/received verb)?
  const looksLikePayment = success || (!!picked && (outgoing || incoming));
  // Didn't look like a payment. A PRICE ALONE is NOT payment-uncertain — a menu, a POS/Sell
  // screen, a product page all have one. Only ask the AI when there's an actual payment HINT
  // the rules couldn't fully resolve (a transfer/DuitNow word or a LABEL-anchored ref);
  // otherwise it's a confident not-a-payment (no AI, no "needs a closer look" card).
  const paymentHint = PAYMENT_HINT_RE.test(joined) || !!labeledRefId;
  if (!looksLikePayment) return { ...empty, uncertain: !!picked && paymentHint };
  // A payment signal but no readable amount → also AI-worthy.
  if (!picked) return { ...empty, isPaymentScreen: false, reason: 'no_amount', uncertain: true };

  const direction: PaymentDirection = incoming ? 'in' : 'out';
  const payee = extractPayee(rows, picked.rowIndex);
  const datetime = extractDateTime(rows);
  const walletHint = extractWalletHint(rows);
  const currency = detectCurrency(rows, picked);
  // refId + method were computed above for the multi-amount guard.

  // Confidence: amount is the backbone; each extra field corroborates.
  let confidence = 0.45;
  if (success) confidence += 0.2;
  if (payee) confidence += 0.15;
  if (refId) confidence += 0.1;
  if (datetime) confidence += 0.1;
  confidence = Math.min(1, confidence);

  return {
    isPaymentScreen: true, reason: 'ok', direction, amount: picked.value,
    currency, payee, refId, datetime, method, walletHint, confidence, uncertain: false,
  };
}
