/**
 * CSV export for personal finance data.
 *
 * Emits RFC-4180-compliant CSV (quoted fields, CRLF line endings, BOM for Excel),
 * writes to app cache directory, and hands off to the system share sheet.
 *
 * All dates emitted as ISO 8601 (preserves timezone) plus a pre-formatted
 * local date column for non-technical users.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Transaction, Wallet, Subscription, SavedReceipt } from '../types';
import { format as formatDate } from 'date-fns';

type CsvRow = Record<string, string | number | null | undefined>;

/** Escape a single CSV cell per RFC 4180. */
function csvCell(val: unknown): string {
  if (val == null) return '';
  let s = String(val);
  // Neutralize CSV formula injection (Excel "=" / "+" / "-" / "@")
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvCell(r[h])).join(','));
  }
  // UTF-8 BOM so Excel opens UTF-8 text correctly.
  return '\uFEFF' + lines.join('\r\n');
}

async function writeAndShare(filename: string, csv: string): Promise<void> {
  const dir = `${FileSystem.cacheDirectory}exports/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const uri = dir + filename;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export' });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}

// ── Transactions ──────────────────────────────────────────────

export async function exportTransactionsCsv(
  transactions: Transaction[],
  filenameHint = 'transactions',
): Promise<void> {
  const rows: CsvRow[] = transactions.map((t) => ({
    id: t.id,
    date_iso: t.date instanceof Date ? t.date.toISOString() : String(t.date ?? ''),
    date_local: t.date instanceof Date ? formatDate(t.date, 'yyyy-MM-dd HH:mm') : '',
    type: t.type,
    amount: t.amount.toFixed(2),
    category: t.category ?? '',
    description: t.description ?? '',
    wallet_id: t.walletId ?? '',
    mode: t.mode ?? '',
    input_method: t.inputMethod ?? '',
    receipt_url: t.receiptUrl ?? '',
    linked_debt_id: t.linkedDebtId ?? '',
    linked_payment_id: t.linkedPaymentId ?? '',
  }));
  const stamp = formatDate(new Date(), 'yyyyMMdd_HHmmss');
  await writeAndShare(`${filenameHint}_${stamp}.csv`, rowsToCsv(rows));
}

// ── Wallets ───────────────────────────────────────────────────

export async function exportWalletsCsv(wallets: Wallet[]): Promise<void> {
  const rows: CsvRow[] = wallets.map((w) => ({
    id: w.id,
    name: w.name,
    type: w.type,
    balance: w.balance.toFixed(2),
    credit_limit: w.creditLimit ?? '',
    used_credit: w.usedCredit ?? '',
    is_default: w.isDefault ? 'yes' : 'no',
    created_at: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt ?? ''),
  }));
  const stamp = formatDate(new Date(), 'yyyyMMdd_HHmmss');
  await writeAndShare(`wallets_${stamp}.csv`, rowsToCsv(rows));
}

// ── Subscriptions ─────────────────────────────────────────────

export async function exportSubscriptionsCsv(subs: Subscription[]): Promise<void> {
  const rows: CsvRow[] = subs.map((s) => ({
    id: s.id,
    name: s.name,
    amount: s.amount.toFixed(2),
    billing_cycle: s.billingCycle,
    category: s.category ?? '',
    next_billing_date: s.nextBillingDate instanceof Date ? s.nextBillingDate.toISOString() : String(s.nextBillingDate ?? ''),
    is_installment: s.isInstallment ? 'yes' : 'no',
    total_installments: s.totalInstallments ?? '',
    completed_installments: s.completedInstallments ?? '',
    is_paused: s.isPaused ? 'yes' : 'no',
  }));
  const stamp = formatDate(new Date(), 'yyyyMMdd_HHmmss');
  await writeAndShare(`subscriptions_${stamp}.csv`, rowsToCsv(rows));
}

// ── Receipts (metadata, not images) ───────────────────────────

export async function exportReceiptsCsv(receipts: SavedReceipt[]): Promise<void> {
  const rows: CsvRow[] = receipts.map((r) => ({
    id: r.id,
    date_iso: r.date instanceof Date ? r.date.toISOString() : String(r.date ?? ''),
    title: r.title,
    vendor: r.vendor ?? '',
    total: r.total.toFixed(2),
    category: r.category ?? '',
    mytax_category: r.myTaxCategory ?? '',
    payment_method: r.paymentMethod ?? '',
    location: r.location ?? '',
    wallet_id: r.walletId ?? '',
    transaction_id: r.transactionId ?? '',
    item_count: r.items?.length ?? 0,
    items_json: r.items ? JSON.stringify(r.items) : '',
  }));
  const stamp = formatDate(new Date(), 'yyyyMMdd_HHmmss');
  await writeAndShare(`receipts_${stamp}.csv`, rowsToCsv(rows));
}

// ── Filter helpers ────────────────────────────────────────────

export function filterByDateRange<T extends { date?: Date | string }>(
  items: T[],
  start: Date,
  end: Date,
): T[] {
  const s = start.getTime();
  const e = end.getTime();
  return items.filter((t) => {
    const d = t.date instanceof Date ? t.date : t.date ? new Date(t.date) : null;
    if (!d || isNaN(d.getTime())) return false;
    const ms = d.getTime();
    return ms >= s && ms <= e;
  });
}
