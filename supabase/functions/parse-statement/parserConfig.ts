// Shared parser configuration for the parse-statement edge function AND the
// offline golden test (scripts/test-statement-parser.ts). Pure module — NO
// Deno/Node/npm imports — so both the Deno runtime and tsx can load it.
//
// Gemini model churn has broken statement parsing twice in production
// (2.0-flash retired, then 2.5-flash gated). The fixtures under ./fixtures/
// are the only ground truth for bank layouts, so this prompt + model +
// normalization must stay byte-identical between the function and the test.

export const STATEMENT_MODEL = 'gemini-3.5-flash';

export const STATEMENT_GENERATION_CONFIG = {
  temperature: 0.1,
  responseMimeType: 'application/json',
};

export const EXTRACTION_PROMPT = `You are a Malaysian bank statement parser. Extract every transaction from this PDF statement.

Return ONLY valid JSON in this exact shape, no markdown fences, no prose:
{
  "currency": "MYR",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "amount": <positive number>,
      "type": "income" | "expense",
      "description": "<merchant or transfer counterparty, cleaned>",
      "raw": "<original statement line, trimmed>",
      "suggested_category": "<one of: food, transport, groceries, bills, shopping, entertainment, health, transfer, salary, other>",
      "is_transfer": <true ONLY when the row is a transfer between the user's OWN accounts (including own e-wallet top-ups); otherwise omit the field or use false>,
      "account": "<last 4 digits of the account this row belongs to — set ONLY when the statement has more than one account; otherwise omit the field or use null>",
      "originalAmount": <positive number in the foreign currency — set ONLY when the row prints a foreign-currency original amount; otherwise omit the field or use null>,
      "originalCurrency": "<3-letter ISO code, e.g. USD — set only together with originalAmount>"
    }
  ]
}

Rules:
- Skip balance lines, opening/closing balance rows, and running-total rows. Only real transactions.
- amount is always POSITIVE. Use "type": "expense" for debits/withdrawals; "income" for credits/deposits.
- For transfers between own accounts, type is still "expense" or "income" depending on which side the statement shows — but ALSO set "is_transfer": true so the app can avoid double-counting when both accounts' statements are imported. Treat a row as an own-account transfer ONLY when it is clearly the holder moving their own money: the beneficiary/sender name matches this statement's account holder, the line says "TRANSFER TO/FROM OWN ACCOUNT" (or the bank's own-account transfer wording), or an instant-transfer reference (IBG/DuitNow/GIRO/FPX) whose counterparty is the holder's own name or own account number.
- Also set "is_transfer": true for top-ups/reloads of the holder's own e-wallets or self-funded accounts: DuitNow/IBG/card transfers whose descriptor is an e-wallet top-up or reload — e.g. "TNG EWALLET", "TOUCH N GO", "GRABPAY", "GRAB PAY", "BOOST", "SHOPEEPAY", "MAE", "BIGPAY", "SETEL", "ALIPAY" top-up/reload lines — and for transfers to the holder's own accounts at OTHER banks. These double-count when the user also imports the wallet's or other account's statement.
- Payments to OTHER people or to merchants — even via DuitNow/IBG/instant transfer — are NOT own-account transfers: leave "is_transfer" out (or false). When unsure, use false.
- Multi-account statements: when the PDF contains MORE THAN ONE account (combined statements with several account numbers), set "account" on each row to the last 4 digits of the account that row belongs to (string). For a single-account statement, omit the field or use null. Never invent digits — output only what the PDF shows.
- Foreign currency rows: when a row shows a foreign-currency original amount alongside the MYR settled amount (e.g. "USD 12.34" or a conversion-rate line), set "originalAmount" (positive number, in the foreign unit) and "originalCurrency" (3-letter ISO code, e.g. "USD"). "amount" stays the MYR settled figure. Omit both for plain MYR rows. Never estimate a foreign amount that is not printed.
- description: clean up merchant names — strip POS IDs, transaction refs, dates embedded in the string.
- If you cannot parse a date, skip that row.
- Common MY banks: Maybank, CIMB, Public Bank, RHB, HL Bank, AmBank, Bank Islam, Bank Rakyat.
- If the PDF is clearly not a bank statement, return { "currency": "MYR", "transactions": [] }.`;

// Normalize the raw model JSON into the transaction array the app consumes.
// Returns [] when the model didn't produce a transactions array.
//
// is_transfer is normalized to a strict boolean (model may emit "true"/omit
// it). Optional field — old clients ignore it, new clients skip flagged rows
// so importing both sides of an own-account transfer can't double-book.
// account / originalAmount / originalCurrency are newer optional fields with
// the same compatibility story: passed through when valid, null when not.
export function normalizeTransactions(parsed: any): any[] {
  const transactions = Array.isArray(parsed?.transactions) ? parsed.transactions : [];

  for (const t of transactions) {
    if (t && typeof t === 'object') {
      t.is_transfer = t.is_transfer === true || t.is_transfer === 'true';

      // Multi-account statements: last-4 of the row's account. Short string
      // only (banks mask as "**1234" etc. — allow up to 8 chars), else null.
      const acct = typeof t.account === 'string' ? t.account.trim() : '';
      t.account = acct.length > 0 && acct.length <= 8 ? acct : null;

      // FX rows: original foreign units must be a positive finite number
      // (accept numeric strings — Gemini sometimes quotes them), else null.
      const oa = typeof t.originalAmount === 'string' ? Number(t.originalAmount) : t.originalAmount;
      t.originalAmount = typeof oa === 'number' && Number.isFinite(oa) && oa > 0 ? oa : null;

      // FX currency: 3-letter alpha ISO code, stored uppercase, else null.
      const oc = typeof t.originalCurrency === 'string' ? t.originalCurrency.trim() : '';
      t.originalCurrency = /^[A-Za-z]{3}$/.test(oc) ? oc.toUpperCase() : null;
    }
  }

  return transactions;
}
