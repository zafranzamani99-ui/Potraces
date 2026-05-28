import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './supabase';

export interface ParsedTransaction {
  date: string;              // YYYY-MM-DD
  amount: number;            // positive
  type: 'income' | 'expense';
  description: string;
  raw?: string;
  suggested_category?: string;
}

export interface StatementParseResult {
  currency: string;
  transactions: ParsedTransaction[];
  remaining: number;
}

export interface StatementParseError {
  error: string;
  message?: string;
  remaining?: number;
}

/** Open system picker. Returns { base64, filename } or null if cancelled. */
export async function pickStatementPdf(): Promise<{ base64: string; filename: string; sizeBytes: number } | null> {
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
  return { base64, filename: asset.name ?? 'statement.pdf', sizeBytes: size };
}

/** Call the parse-statement edge function with the picked PDF. */
export async function parseStatement(
  pdfBase64: string,
  filename: string,
): Promise<StatementParseResult | StatementParseError> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { error: 'not_authenticated', message: 'Sign in to import statements.' };
  }

  const invokePromise = supabase.functions.invoke<StatementParseResult | StatementParseError>(
    'parse-statement',
    { body: { pdfBase64, filename } },
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
