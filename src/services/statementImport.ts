import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { supabasePersonal as supabase } from './supabase'; // personal client (statement import)
import { isAiOptedIn } from './aiOptIn';

export interface ParsedTransaction {
  date: string;              // YYYY-MM-DD
  amount: number;            // positive (MYR settled figure on FX rows)
  type: 'income' | 'expense';
  description: string;
  raw?: string;
  suggested_category?: string;
  /** True when the AI flagged this row as a transfer between the user's OWN
   *  accounts. Optional — older parse-statement deploys never set it. */
  is_transfer?: boolean;
  /** Last-4 of the account this row belongs to, sent only for multi-account
   *  statements. Optional by design, both directions compatible: older deployed
   *  functions never send it, older clients ignore it. */
  account?: string | null;
  /** Foreign-currency original units for FX rows (amount stays the MYR settled
   *  figure). Optional by design — older deployed functions never send it. */
  originalAmount?: number | null;
  /** 3-letter ISO currency of originalAmount (e.g. "USD"). Optional by design —
   *  older deployed functions never send it. */
  originalCurrency?: string | null;
}

export interface StatementParseResult {
  currency: string;
  transactions: ParsedTransaction[];
  remaining: number;
  /** Own-account transfer rows dropped by parseStatement() below. Optional —
   *  present (possibly 0) on any result that went through the client filter. */
  transfersSkipped?: number;
}

export interface StatementParseError {
  error: string;
  message?: string;
  remaining?: number;
}

/** Open system picker. Returns { base64, filename, sizeBytes, uri } or null if
 *  cancelled. `uri` is the picker's cache-directory copy — the caller MUST pass it
 *  to cleanupStatementFile() once the whole parse sequence is done (statements are
 *  sensitive; don't leave them on disk). */
export async function pickStatementPdf(): Promise<{ base64: string; filename: string; sizeBytes: number; uri: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const uri = asset.uri;
  const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
  const size = (info as any).size ?? 0;
  if (size > 10 * 1024 * 1024) {
    throw new Error('PDF is too large (max 10 MB). Split the statement and try again.');
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, filename: asset.name ?? 'statement.pdf', sizeBytes: size, uri };
}

/** Best-effort delete of the picker's cache-directory copy. Safe on an already-
 *  deleted file; failures are swallowed (a leftover cache file is harmless). */
export async function cleanupStatementFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // best-effort
  }
}

/** True when the statement's currency clearly differs from the app currency.
 *  'RM' (display symbol) and 'MYR' (ISO code) are the same currency. A missing
 *  statement/app currency → false: never block on ambiguity. */
export function isCurrencyMismatch(statementCurrency?: string, appCurrency?: string): boolean {
  const canon = (v?: string): string => {
    const s = (v ?? '').trim().toUpperCase();
    return s === 'RM' ? 'MYR' : s;
  };
  const statement = canon(statementCurrency);
  if (!statement) return false;
  const app = canon(appCurrency);
  if (!app) return false;
  return statement !== app;
}

/** Call the parse-statement edge function with the picked PDF. */
export async function parseStatement(
  pdfBase64: string,
  filename: string,
  password?: string,
): Promise<StatementParseResult | StatementParseError> {
  // AI opt-out backstop — statement pages must not leave the device. The
  // screen gates with a consent prompt first; this catches every other path.
  if (!isAiOptedIn()) {
    return { error: 'ai_off', message: 'AI features are turned off.' };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { error: 'not_authenticated', message: 'Sign in to import statements.' };
  }

  const invokePromise = supabase.functions.invoke<StatementParseResult | StatementParseError>(
    'parse-statement',
    { body: { pdfBase64, filename, ...(password ? { password } : {}) } },
  );

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Statement processing timed out (60s). Try a smaller PDF.')), 60_000),
  );

  let data: StatementParseResult | StatementParseError | null;
  let error: any;
  try {
    const result = await Promise.race([invokePromise, timeoutPromise]);
    data = (result as any).data ?? null;
    error = (result as any).error ?? null;
  } catch (e: any) {
    return { error: 'timeout', message: e.message };
  }

  if (error) {
    // Try to read the actual response body — supabase-js wraps non-2xx into
    // FunctionsHttpError with `.context` holding the raw Response.
    const ctx = (error as any).context;
    if (ctx && typeof ctx.text === 'function') {
      try {
        const text = await ctx.text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            if (parsed?.error) {
              return {
                error: parsed.error,
                message: parsed.message ?? parsed.detail ?? text.slice(0, 300),
              };
            }
          } catch {
            return { error: 'network', message: text.slice(0, 300) };
          }
        }
      } catch {
        // fall through
      }
    }
    return { error: 'network', message: error.message };
  }
  if (data && !isParseError(data as any) && Array.isArray((data as StatementParseResult).transactions)) {
    const result = data as StatementParseResult;
    // Drop own-account transfer legs BEFORE the validity filter. Booked as real
    // income/expense they double-count the moment the user imports both accounts'
    // statements (each leg lands once as expense, once as income). An imported
    // txn can never satisfy isTransfer() — that convention is the `transfer-` id
    // prefix (src/utils/insights.ts) and addTransaction always mints its own id —
    // so skipping the rows here is the only representation report math already
    // excludes. The count is surfaced on the result for callers to show.
    const beforeTransferFilter = result.transactions.length;
    result.transactions = result.transactions.filter((t) => t.is_transfer !== true);
    result.transfersSkipped = beforeTransferFilter - result.transactions.length;
    result.transactions = result.transactions.filter((t) => {
      if (!t.amount || !isFinite(t.amount) || t.amount <= 0 || t.amount > 1_000_000) return false;
      if (t.date && isNaN(new Date(t.date).getTime())) return false;
      return true;
    });
  }
  return data as StatementParseResult | StatementParseError;
}

/** True if the payload is an error shape (discriminator on `error` property). */
export function isParseError(r: StatementParseResult | StatementParseError): r is StatementParseError {
  return typeof (r as StatementParseError).error === 'string';
}
