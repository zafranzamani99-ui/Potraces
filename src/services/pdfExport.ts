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
  walletName?: string;
  hideWallet?: boolean;
}

function buildSingleReceiptHtml(input: SingleReceiptInput): string {
  const { receipt: r, currency = 'RM', categoryNames = {}, walletName, hideWallet } = input;
  const taxName = r.myTaxCategory && r.myTaxCategory !== 'none'
    ? (categoryNames[r.myTaxCategory] ?? r.myTaxCategory)
    : null;
  const dateStr = r.date instanceof Date ? formatDate(r.date, 'd MMM yyyy') : '';
  const savedStr = r.createdAt instanceof Date ? formatDate(r.createdAt, 'd MMM yyyy, h:mm a') : '';

  const itemsHtml = (r.items ?? []).map((it, i) => `
    <tr>
      <td class="item-num">${i + 1}</td>
      <td class="item-name">${esc(it.name)}</td>
      <td class="num">${money(it.amount, currency)}</td>
    </tr>
  `).join('');

  const metaRows = [
    r.category ? `<div class="detail-row"><span class="detail-label">Category</span><span class="detail-value">${esc(r.category)}</span></div>` : '',
    taxName ? `<div class="detail-row"><span class="detail-label">Tax relief</span><span class="detail-value accent">${esc(taxName)}</span></div>` : '',
    (!hideWallet && walletName) ? `<div class="detail-row"><span class="detail-label">Paid from</span><span class="detail-value">${esc(walletName)}</span></div>` : '',
    r.location ? `<div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${esc(r.location)}</span></div>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt — ${esc(r.title)}</title>
<style>
  @page { margin: 16mm auto; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #222;
    background: #fff;
    -webkit-font-smoothing: antialiased;
  }
  .receipt-wrap {
    width: 300pt;
    margin: 20pt auto;
  }
  .page {
    background: #F9F6F0;
    position: relative;
    border-radius: 2pt;
    overflow: hidden;
    box-shadow:
      0 1pt 6pt rgba(0,0,0,0.08),
      inset 0 0 40pt 8pt rgba(180, 160, 120, 0.06);
  }
  /* Layer 1 (::before): Crumpled paper wrinkles — feTurbulence + feDiffuseLighting
     creates 3D surface bumps that look like real paper wrinkles/crumples.
     Low baseFrequency (0.04) = large soft undulations, not fine grain.
     surfaceScale=1.5 = subtle but visible surface relief.
     feDistantLight azimuth=45 elevation=55 = warm upper-left lighting. */
  .page::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 300 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='w' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.03' numOctaves='5' seed='2' stitchTiles='stitch' result='noise'/%3E%3CfeDiffuseLighting in='noise' lighting-color='%23F9F6F0' surfaceScale='1.5' result='lit'%3E%3CfeDistantLight azimuth='45' elevation='55'/%3E%3C/feDiffuseLighting%3E%3CfeComposite in='lit' in2='lit' operator='arithmetic' k1='0' k2='1' k3='0' k4='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E");
    background-size: 300pt 600pt;
    background-repeat: repeat;
    opacity: 0.14;
    pointer-events: none;
    mix-blend-mode: multiply;
    border-radius: 2pt;
    z-index: 2;
  }

  /* Layer 2 (::after): Subtle diagonal crease/fold lines + edge aging vignette.
     Multiple gradients at different angles simulate random fold creases
     that catch/reflect light slightly differently than the surrounding paper.
     Each crease is a shadow line + highlight line (paper folds catch light on one side). */
  .page::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background:
      /* Edge aging vignette — warm darkening at edges */
      radial-gradient(ellipse at center, transparent 55%, rgba(180,160,120,0.07) 100%),
      /* Diagonal crease 1: top-left toward bottom-right, broad fold */
      linear-gradient(132deg,
        transparent 0%, transparent 28%,
        rgba(0,0,0,0.02) 29%, rgba(255,255,255,0.018) 31%,
        transparent 32%, transparent 100%
      ),
      /* Diagonal crease 2: opposite angle, lower on page */
      linear-gradient(218deg,
        transparent 0%, transparent 62%,
        rgba(0,0,0,0.016) 63%, rgba(255,255,255,0.014) 64.5%,
        transparent 66%, transparent 100%
      ),
      /* Diagonal crease 3: subtle short fold near top-right */
      linear-gradient(156deg,
        transparent 0%, transparent 14%,
        rgba(0,0,0,0.013) 15%, rgba(255,255,255,0.01) 16.5%,
        transparent 17.5%, transparent 100%
      ),
      /* Diagonal crease 4: very faint, near center */
      linear-gradient(195deg,
        transparent 0%, transparent 44%,
        rgba(0,0,0,0.01) 45%, rgba(255,255,255,0.008) 46%,
        transparent 47%, transparent 100%
      ),
      /* Fine paper fiber grain — fractalNoise at high frequency, very low opacity
         (feColorMatrix reduces alpha to ~0.04 inside the SVG itself) */
      url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch' result='t'/%3E%3CfeColorMatrix in='t' type='saturate' values='0' result='bw'/%3E%3CfeComponentTransfer in='bw'%3E%3CfeFuncA type='linear' slope='0.06'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 200pt 200pt;
    background-repeat: no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, repeat;
    pointer-events: none;
    mix-blend-mode: multiply;
    border-radius: 2pt;
    z-index: 1;
  }
  /* torn edge rendered as inline SVG in the HTML body */

  /* ── Brand (removed — shown in footer instead) ── */

  /* ── Hero ── */
  .hero {
    padding: 28pt 24pt 20pt;
  }
  .hero-vendor {
    font-size: 15pt;
    font-weight: 700;
    color: #222;
    letter-spacing: -0.3pt;
    margin-bottom: 16pt;
  }
  .hero-amount {
    font-size: 32pt;
    font-weight: 700;
    color: #222;
    letter-spacing: -0.5pt;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .hero-currency {
    font-size: 16pt;
    font-weight: 500;
    color: #6A6A6A;
  }
  .hero-date {
    font-size: 10pt;
    color: #6A6A6A;
    margin-top: 6pt;
  }

  .divider { height: 1pt; background: #E6E2DA; margin: 0 24pt; }

  /* ── Details ── */
  .details { padding: 16pt 24pt; }
  .detail-row { overflow: hidden; padding: 3pt 0; }
  .detail-label {
    float: left;
    font-size: 9pt;
    color: #555;
    width: 56pt;
  }
  .detail-value {
    margin-left: 56pt;
    font-size: 10pt;
    font-weight: 500;
    color: #222;
  }
  .detail-value.accent { color: #4F5104; font-weight: 600; }

  /* ── Items ── */
  .items-section { padding: 16pt 24pt 10pt; }
  .section-label {
    font-size: 10pt;
    font-weight: 600;
    color: #444;
    margin-bottom: 10pt;
    letter-spacing: 0.3pt;
  }
  .items-table { width: 100%; border-collapse: collapse; }
  .items-table td {
    padding: 5pt 0;
    font-size: 9.5pt;
    vertical-align: top;
    border-bottom: 1pt solid #F2F0EC;
  }
  .items-table tr:last-child td { border-bottom: none; }
  .item-num { color: #666; width: 20pt; font-size: 8.5pt; }
  .item-name { color: #222; }
  .num { text-align: right; white-space: nowrap; font-weight: 600; color: #222; font-variant-numeric: tabular-nums; }

  /* ── Totals ── */
  .totals { padding: 0 24pt 18pt; }
  .totals-row { overflow: hidden; padding: 3pt 0; font-size: 9.5pt; }
  .totals-row .t-label { float: left; }
  .totals-row .t-value { float: right; font-weight: 500; font-variant-numeric: tabular-nums; }
  .totals-row.sub { color: #999; }
  .totals-row.grand {
    font-size: 13pt;
    font-weight: 700;
    border-top: 1.5pt solid #222;
    margin-top: 6pt;
    padding-top: 8pt;
    color: #222;
  }
  .totals-row.grand .t-value { font-weight: 700; }

  /* ── Footer ── */
  .footer {
    padding: 14pt 24pt;
    text-align: center;
    font-size: 8.5pt;
    color: #666;
    letter-spacing: 0.3pt;
    line-height: 1.8;
    border-top: 1pt solid #E6E2DA;
  }
</style></head>
<body>
  <div class="receipt-wrap">
  <div class="page">
    <div class="hero">
      <div class="hero-vendor">${esc(r.vendor ?? r.title ?? '')}</div>
      <div class="hero-amount"><span class="hero-currency">${esc(currency)}</span> ${r.total.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="hero-date">${esc(dateStr)}</div>
    </div>

    <div class="divider"></div>

    ${metaRows ? `<div class="details">${metaRows}</div><div class="divider"></div>` : ''}

    ${itemsHtml ? `
      <div class="items-section">
        <div class="section-label">Items · ${r.items.length}</div>
        <table class="items-table">
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>

      <div class="totals">
        ${r.subtotal != null ? `<div class="totals-row sub"><span class="t-label">Subtotal</span><span class="t-value">${money(r.subtotal, currency)}</span></div>` : ''}
        ${r.tax != null ? `<div class="totals-row sub"><span class="t-label">Tax</span><span class="t-value">${money(r.tax, currency)}</span></div>` : ''}
        <div class="totals-row grand"><span class="t-label">Total</span><span class="t-value">${money(r.total, currency)}</span></div>
      </div>
    ` : ''}

    <div class="footer">
      tracked with potraces${savedStr ? ` · saved ${esc(savedStr)}` : ''}<br/>
      keep original receipt for official claims
    </div>
  </div>
  <svg viewBox="0 0 360 16" preserveAspectRatio="none" style="width:300pt;height:12pt;display:block;margin:0 auto;" xmlns="http://www.w3.org/2000/svg"><rect width="360" height="16" fill="#F9F6F0"/><path d="M0,6 Q6,0 12,9 Q18,14 24,4 Q30,1 36,10 Q42,15 48,5 Q54,0 60,8 Q66,13 72,3 Q78,0 84,10 Q90,16 96,4 Q102,1 108,9 Q114,14 120,3 Q126,0 132,8 Q138,12 144,5 Q150,0 156,10 Q162,15 168,4 Q174,1 180,9 Q186,14 192,3 Q198,0 204,8 Q210,13 216,5 Q222,0 228,10 Q234,16 240,4 Q246,1 252,8 Q258,13 264,5 Q270,0 276,9 Q282,16 288,4 Q294,0 300,7 Q306,14 312,5 Q318,1 324,9 Q330,14 336,4 Q342,0 348,8 Q354,13 360,6 L360,16 L0,16 Z" fill="#fff"/></svg>
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
