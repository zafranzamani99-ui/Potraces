/**
 * Pure logic for the Google Sheets transaction sync (see sheetsSync.ts).
 *
 * No RN/expo/fetch imports — everything here is plain data in, plain data out,
 * so it runs under `npx tsx` (scripts/test-sheets-dedupe.ts).
 *
 * Sheet layout (one tab, "Transactions"):
 *   A1:I1  ID | Date | Type | Amount | Currency | Category | Wallet | Vendor | Notes
 *   K1     schema-version marker (potraces-schema-v1)
 *
 * Column semantics mirror the CSV export (exportService.ts transactions rows):
 * the personal Transaction model has ONE free-text field, `description` — for
 * receipt scans it holds the vendor/title (ReceiptScanner), for manual entries
 * it is the user-facing label — so it maps to the Vendor column. Notes carries
 * `rawInput` (the original typed/spoken input for AI-parsed entries), which is
 * the only other free-text field on the model; empty for manual/photo entries.
 */
export const SHEETS_SCHEMA_VERSION = 'potraces-schema-v1';
export const SHEET_TAB = 'Transactions';
export const SHEET_HEADER = [
  'ID', 'Date', 'Type', 'Amount', 'Currency', 'Category', 'Wallet', 'Vendor', 'Notes',
];
/** Sheets values.append practical batch ceiling — one call, many rows. */
export const SHEETS_APPEND_CHUNK = 500;

/**
 * Minimal structural view of a personal Transaction for row mapping. Rehydrated
 * transactions may carry ISO-string dates, hence `Date | string`.
 */
export interface SheetTxInput {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category?: string | null;
  description?: string | null;
  date: Date | string;
  walletId?: string | null;
  rawInput?: string | null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local-time YYYY-MM-DD (no UTC shift). Unparseable input degrades to the raw
 *  string (or '' for a bad Date) rather than crashing a whole sync batch. */
function normalizeSheetDate(raw: Date | string): string {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return typeof raw === 'string' ? raw : '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Map one transaction to the 9-column sheet row (A..I, matching SHEET_HEADER).
 * Amount is always the positive 2-decimal string — the Type column carries the
 * income/expense sign. `walletName` is resolved by the caller (pure module has
 * no store access); a missing wallet yields an empty Wallet cell.
 */
export function transactionToSheetRow(
  tx: SheetTxInput,
  opts: { currency: string; walletName?: string },
): string[] {
  const amount = Number.isFinite(tx.amount) ? Math.abs(tx.amount) : 0;
  return [
    tx.id,
    normalizeSheetDate(tx.date),
    tx.type,
    amount.toFixed(2),
    opts.currency,
    tx.category ?? '',
    opts.walletName ?? '',
    tx.description ?? '',
    tx.rawInput ?? '',
  ];
}

/**
 * IDs present in NEITHER the remote sheet nor the locally-confirmed synced set,
 * in the caller's input order. Both known sets are trusted equally: remote IDs
 * are ground truth read back from the sheet, localSyncedIds covers the window
 * where an append succeeded but the next read-back hasn't happened yet.
 */
export function filterUnsyncedTransactionIds(
  allIds: string[],
  remoteIds: string[],
  localSyncedIds: string[],
): string[] {
  const known = new Set<string>([...remoteIds, ...localSyncedIds]);
  return allIds.filter((id) => !known.has(id));
}

/** Split into fixed-size chunks (last chunk may be short). Size < 1 → []. */
export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size < 1 || items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
