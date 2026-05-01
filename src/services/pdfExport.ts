/**
 * PDF exports for Potraces.
 *
 * Templates are strings of HTML that expo-print renders to PDF, writes to
 * cache, and hands off to the system share sheet.
 *
 * Why HTML rather than react-pdf or similar: expo-print is battle-tested,
 * requires no native linking beyond what Expo already bundles, and HTML/CSS
 * give us fine print control without adding a new renderer dependency.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format as formatDate } from 'date-fns';
import type { Transaction, Wallet, SavedReceipt } from '../types';

/** HTML-escape a string for safe interpolation into template bodies. */
function esc(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(n: number, currency = 'RM'): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${currency} ${abs.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BASE_CSS = `
  @page { margin: 28mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font: 12pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #2c2c28;
    margin: 0;
  }
  h1 { font-size: 22pt; margin: 0 0 4pt; color: #4F5104; letter-spacing: -0.3pt; }
  h2 { font-size: 14pt; margin: 16pt 0 8pt; color: #2c2c28; border-bottom: 1px solid #E8E6E0; padding-bottom: 4pt; }
  .meta { color: #6b6b66; font-size: 10pt; margin: 0 0 16pt; }
  .summary { display: table; width: 100%; margin: 12pt 0 18pt; border-collapse: collapse; }
  .summary-row { display: table-row; }
  .summary-cell {
    display: table-cell;
    width: 33%;
    padding: 10pt 12pt;
    background: #F9F9F7;
    border: 1px solid #E8E6E0;
    text-align: center;
  }
  .summary-cell + .summary-cell { border-left: none; }
  .summary-label { color: #6b6b66; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 3pt; }
  .summary-value { font-size: 16pt; font-weight: 600; color: #2c2c28; }
  .positive { color: #4F5104; }
  .negative { color: #8B4513; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14pt; }
  th { text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #6b6b66; padding: 6pt 8pt; border-bottom: 1px solid #E8E6E0; }
  td { padding: 6pt 8pt; border-bottom: 1px solid #F0EEE8; font-size: 10.5pt; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  .footer { margin-top: 24pt; padding-top: 12pt; border-top: 1px solid #E8E6E0; color: #6b6b66; font-size: 9pt; }
`;

// ── Monthly Statement ─────────────────────────────────────────

export interface MonthlyStatementInput {
  /** Inclusive start */
  start: Date;
  /** Exclusive end */
  end: Date;
  userName?: string;
  currency?: string;
  transactions: Transaction[];
  wallets: Wallet[];
}

function groupByCategory(txs: Transaction[]): Record<string, { total: number; count: number }> {
  const out: Record<string, { total: number; count: number }> = {};
  for (const t of txs) {
    const key = t.category || 'uncategorized';
    if (!out[key]) out[key] = { total: 0, count: 0 };
    out[key].total += t.amount;
    out[key].count += 1;
  }
  return out;
}

function buildMonthlyHtml(input: MonthlyStatementInput): string {
  const { start, end, userName = '', currency = 'RM' } = input;
  const period = `${formatDate(start, 'd MMM yyyy')} – ${formatDate(new Date(end.getTime() - 1), 'd MMM yyyy')}`;
  const generatedAt = formatDate(new Date(), 'd MMM yyyy, HH:mm');

  const inRange = input.transactions.filter((t) => {
    const d = t.date instanceof Date ? t.date : new Date(t.date as any);
    return d >= start && d < end;
  });
  const income = inRange.filter((t) => t.type === 'income');
  const expense = inRange.filter((t) => t.type === 'expense');
  const incomeTotal = income.reduce((s, t) => s + t.amount, 0);
  const expenseTotal = expense.reduce((s, t) => s + t.amount, 0);
  const kept = incomeTotal - expenseTotal;

  const byCat = groupByCategory(expense);
  const catRows = Object.entries(byCat)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, v]) => `
      <tr>
        <td>${esc(cat)}</td>
        <td class="num">${v.count}</td>
        <td class="num">${money(v.total, currency)}</td>
      </tr>
    `).join('');

  const walletRows = input.wallets.map((w) => `
    <tr>
      <td>${esc(w.name)}</td>
      <td>${esc(w.type)}</td>
      <td class="num">${money(w.balance, currency)}</td>
    </tr>
  `).join('');

  const txRows = inRange
    .slice()
    .sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0))
    .slice(0, 500) // cap for sanity
    .map((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date as any);
      return `
        <tr>
          <td>${formatDate(d, 'd MMM')}</td>
          <td>${esc(t.category ?? '')}</td>
          <td>${esc(t.description ?? '')}</td>
          <td class="num ${t.type === 'income' ? 'positive' : 'negative'}">
            ${t.type === 'income' ? '+' : '-'}${money(t.amount, currency)}
          </td>
        </tr>
      `;
    }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Statement</title><style>${BASE_CSS}</style></head>
<body>
  <h1>Monthly Statement</h1>
  <div class="meta">
    ${userName ? `<div>${esc(userName)}</div>` : ''}
    <div>${esc(period)}</div>
    <div>Generated ${esc(generatedAt)} · Potraces</div>
  </div>

  <div class="summary">
    <div class="summary-row">
      <div class="summary-cell">
        <div class="summary-label">Came in</div>
        <div class="summary-value positive">${money(incomeTotal, currency)}</div>
      </div>
      <div class="summary-cell">
        <div class="summary-label">Went out</div>
        <div class="summary-value">${money(expenseTotal, currency)}</div>
      </div>
      <div class="summary-cell">
        <div class="summary-label">Kept</div>
        <div class="summary-value ${kept >= 0 ? 'positive' : 'negative'}">${money(kept, currency)}</div>
      </div>
    </div>
  </div>

  <h2>Spending by category</h2>
  ${catRows ? `
    <table>
      <thead><tr><th>Category</th><th class="num">#</th><th class="num">Total</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>
  ` : '<p style="color:#6b6b66">No expenses recorded for this period.</p>'}

  <h2>Wallet balances <span style="font-size:9pt; color:#6b6b66; font-weight:normal">(as of now)</span></h2>
  ${walletRows ? `
    <table>
      <thead><tr><th>Wallet</th><th>Type</th><th class="num">Balance</th></tr></thead>
      <tbody>${walletRows}</tbody>
    </table>
  ` : '<p style="color:#6b6b66">No wallets.</p>'}

  <h2>Transactions</h2>
  ${txRows ? `
    <table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>${txRows}</tbody>
    </table>
    ${inRange.length > 500 ? `<div style="color:#6b6b66; font-size:9pt">(Showing first 500 of ${inRange.length}. Export CSV for a complete record.)</div>` : ''}
  ` : '<p style="color:#6b6b66">No transactions in this period.</p>'}

  <div class="footer">
    Generated by Potraces — <a href="https://potraces.vercel.app">potraces.vercel.app</a>
  </div>
</body></html>`;
}

export async function exportMonthlyStatement(input: MonthlyStatementInput): Promise<void> {
  const html = buildMonthlyHtml(input);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Monthly Statement' });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}

// ── LHDN Tax Year Summary ─────────────────────────────────────

export interface TaxYearInput {
  year: number;
  userName?: string;
  currency?: string;
  receipts: SavedReceipt[];
  /** Map of id → display name for MyTax categories */
  categoryNames: Record<string, string>;
}

function buildTaxHtml(input: TaxYearInput): string {
  const { year, userName = '', currency = 'RM' } = input;
  const generatedAt = formatDate(new Date(), 'd MMM yyyy, HH:mm');

  const forYear = input.receipts.filter((r) => r.year === year && r.myTaxCategory && r.myTaxCategory !== 'none');

  // Group by myTaxCategory
  const groups: Record<string, { name: string; receipts: SavedReceipt[]; total: number }> = {};
  for (const r of forYear) {
    const id = r.myTaxCategory || 'uncategorized';
    if (!groups[id]) groups[id] = { name: input.categoryNames[id] ?? id, receipts: [], total: 0 };
    groups[id].receipts.push(r);
    groups[id].total += r.total;
  }

  const grandTotal = Object.values(groups).reduce((s, g) => s + g.total, 0);

  const sections = Object.entries(groups)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([catId, g]) => {
      const rows = g.receipts
        .sort((a, b) => (a.date instanceof Date ? a.date.getTime() : 0) - (b.date instanceof Date ? b.date.getTime() : 0))
        .map((r) => `
          <tr>
            <td>${formatDate(r.date instanceof Date ? r.date : new Date(r.date as any), 'd MMM yyyy')}</td>
            <td>${esc(r.vendor ?? r.title ?? '')}</td>
            <td>${esc(r.paymentMethod ?? '')}</td>
            <td class="num">${money(r.total, currency)}</td>
          </tr>
        `).join('');
      return `
        <h2>${esc(g.name)} <span style="font-size:10pt; color:#6b6b66; font-weight:normal">· ${g.receipts.length} receipt${g.receipts.length === 1 ? '' : 's'} · ${money(g.total, currency)}</span></h2>
        <table>
          <thead><tr><th>Date</th><th>Vendor</th><th>Payment</th><th class="num">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tax Year ${year}</title><style>${BASE_CSS}</style></head>
<body>
  <h1>Tax Year ${esc(year)} — Summary</h1>
  <div class="meta">
    ${userName ? `<div>${esc(userName)}</div>` : ''}
    <div>Grouped by LHDN e-Filing category</div>
    <div>Generated ${esc(generatedAt)} · Potraces</div>
  </div>

  <div class="summary">
    <div class="summary-row">
      <div class="summary-cell" style="width:100%">
        <div class="summary-label">Total tax-tagged expenses</div>
        <div class="summary-value">${money(grandTotal, currency)}</div>
      </div>
    </div>
  </div>

  ${sections || '<p style="color:#6b6b66">No tax-tagged receipts for this year. Tag receipts with a LHDN category in the receipt scanner first.</p>'}

  <div class="footer">
    This document is for your personal reference. Always verify figures against original receipts before submitting to LHDN.
  </div>
</body></html>`;
}

// ── Single Receipt ────────────────────────────────────────────

export interface SingleReceiptInput {
  receipt: SavedReceipt;
  currency?: string;
  categoryNames?: Record<string, string>;
}

function buildSingleReceiptHtml(input: SingleReceiptInput): string {
  const { receipt: r, currency = 'RM', categoryNames = {} } = input;
  const taxName = r.myTaxCategory && r.myTaxCategory !== 'none'
    ? (categoryNames[r.myTaxCategory] ?? r.myTaxCategory)
    : null;
  const itemsRows = (r.items ?? []).map((it) => `
    <tr>
      <td>${esc(it.name)}</td>
      <td class="num">${money(it.amount, currency)}</td>
    </tr>
  `).join('');
  const dateStr = r.date instanceof Date ? formatDate(r.date, 'd MMM yyyy') : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title><style>${BASE_CSS}
  .kv { margin: 6pt 0; }
  .kv-label { display: inline-block; width: 110pt; color: #6b6b66; font-size: 10pt; }
  .kv-value { font-weight: 500; }
  .total-row td { font-weight: 600; border-top: 1.5pt solid #2c2c28; padding-top: 8pt; }
</style></head>
<body>
  <h1>Receipt</h1>
  <div class="meta">Generated ${esc(formatDate(new Date(), 'd MMM yyyy, HH:mm'))} · Potraces</div>

  <div class="kv"><span class="kv-label">Date</span><span class="kv-value">${esc(dateStr)}</span></div>
  <div class="kv"><span class="kv-label">Vendor</span><span class="kv-value">${esc(r.vendor ?? r.title ?? '')}</span></div>
  ${r.location ? `<div class="kv"><span class="kv-label">Location</span><span class="kv-value">${esc(r.location)}</span></div>` : ''}
  ${r.paymentMethod ? `<div class="kv"><span class="kv-label">Payment</span><span class="kv-value">${esc(r.paymentMethod)}</span></div>` : ''}
  ${r.category ? `<div class="kv"><span class="kv-label">Category</span><span class="kv-value">${esc(r.category)}</span></div>` : ''}
  ${taxName ? `<div class="kv"><span class="kv-label">Tax Category</span><span class="kv-value">${esc(taxName)}</span></div>` : ''}

  ${itemsRows ? `
    <h2>Items</h2>
    <table>
      <thead><tr><th>Item</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${itemsRows}
        ${r.subtotal != null ? `<tr><td>Subtotal</td><td class="num">${money(r.subtotal, currency)}</td></tr>` : ''}
        ${r.tax != null ? `<tr><td>Tax</td><td class="num">${money(r.tax, currency)}</td></tr>` : ''}
        <tr class="total-row"><td>Total</td><td class="num">${money(r.total, currency)}</td></tr>
      </tbody>
    </table>
  ` : `
    <h2>Total</h2>
    <div class="kv"><span class="kv-label">Amount</span><span class="kv-value">${money(r.total, currency)}</span></div>
  `}

  ${r.imageUri ? `<h2>Receipt Image</h2><img src="${esc(r.imageUri)}" style="max-width:100%; border:1pt solid #E8E6E0; border-radius:4pt" />` : ''}

  <div class="footer">
    Issued as a personal copy by Potraces. Retain original for official claims.
  </div>
</body></html>`;
}

export async function exportSingleReceiptPdf(input: SingleReceiptInput): Promise<void> {
  const html = buildSingleReceiptHtml(input);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Receipt' });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}

export async function exportTaxYearPdf(input: TaxYearInput): Promise<void> {
  const html = buildTaxHtml(input);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Tax Year ${input.year}` });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}
