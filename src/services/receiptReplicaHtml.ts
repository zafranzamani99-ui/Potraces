/**
 * Thermal-receipt REPLICA builder for PHOTO receipts (camera/gallery/shared
 * image). Instead of the Potraces-designed card, this renders the SavedReceipt
 * data as a Malaysian thermal guest-check: monospace black ink on near-white
 * paper, dashed separators, torn bottom edge, decorative barcode.
 *
 * This module is PURE (no expo/react-native imports) so it is testable with
 * tsx and so the small layout helpers can be shared with ReceiptReplicaView —
 * the RN twin that must look identical when captured by ViewShot.
 */
import { format as formatDate } from 'date-fns';
import type { SavedReceipt } from '../types';

/** Paper width of the RN replica in px (the HTML twin uses 300pt, same ratio). */
export const REPLICA_WIDTH = 320;
export const REPLICA_PAPER = '#FDFDFB';
export const REPLICA_INK = '#111111';

/** Thermal printers separate sections with spaced dashes, not ruled lines. */
export const REPLICA_DASH = '- '.repeat(20).slice(0, -1);

/** HTML-escape a string for safe interpolation into the template body. */
function esc(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Bare guest-check amount, no currency symbol: `37.10` / `1,234.50`. */
export function formatBareMoney(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Amount with currency, used only for the big TOTAL line: `RM 37.10`. */
export function formatReplicaMoney(n: number, currency: string): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${currency} ${formatBareMoney(Math.abs(n))}`;
}

/** Guest-check date stamp: `08/05/2026`. */
export function formatReplicaDate(d: unknown): string {
  return d instanceof Date ? formatDate(d, 'dd/MM/yyyy') : '';
}

/** Printed "RECEIPT #" — last 8 chars of the id, uppercased. */
export function receiptShortId(id: string): string {
  return String(id).slice(-8).toUpperCase();
}

/**
 * Deterministic barcode bar widths (2–5px) seeded from the receipt id:
 * djb2 hash → LCG. Same id → same bars on every device, in RN and in HTML.
 */
export function barcodeBarWidths(id: string, count = 40): number[] {
  const s = String(id);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  let state = h || 1;
  const widths: number[] = [];
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    widths.push(2 + (state % 4));
  }
  return widths;
}

/**
 * Serrated "torn paper" edge as an SVG path: a row of triangles across the
 * width, filled BELOW the teeth so it reads as the receipt's bottom edge when
 * placed after the paper. Shared by the RN Svg and the HTML inline SVG.
 */
export function buildTearPath(width: number, height: number): string {
  const tooth = 8;
  const top = 2;
  const bottom = height - 2;
  let d = `M0,${bottom}`;
  for (let x = 0; x < width; x += tooth) {
    d += ` L${x + tooth / 2},${top} L${Math.min(x + tooth, width)},${bottom}`;
  }
  d += ` L${width},${height} L0,${height} Z`;
  return d;
}

/** Narrow thermal column — item names truncate with an ellipsis. */
export function truncateItemName(name: string, max = 22): string {
  const s = String(name ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Address lines: comma/newline-separated segments, one per line. */
function locationLines(location?: string): string[] {
  if (!location) return [];
  return location.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

/** Decorative barcode as an inline SVG (~40 rects, 2px gaps, 40px tall). */
function buildBarcodeSvg(id: string): string {
  const bars = barcodeBarWidths(id);
  const GAP = 2;
  const totalW = bars.reduce((a, b) => a + b, 0) + GAP * (bars.length - 1);
  let x = 0;
  const rects = bars
    .map((w) => {
      const rx = x;
      x += w + GAP;
      return `<rect x="${rx}" y="0" width="${w}" height="40" fill="${REPLICA_INK}"/>`;
    })
    .join('');
  return `<svg class="barcode" width="${totalW}" height="40" viewBox="0 0 ${totalW} 40" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

/**
 * Full single-page HTML document for expo-print.
 * NOTE: ReceiptItem carries only { name, amount } — no qty/unit price — so the
 * QTY column prints `1` and PRICE mirrors the line amount.
 */
export function buildReceiptReplicaHtml(r: SavedReceipt, currency = 'RM'): string {
  const vendor = esc((r.vendor ?? r.title ?? '').toUpperCase());
  const locLines = locationLines(r.location).map((l) => esc(l.toUpperCase()));
  const shortId = receiptShortId(r.id);
  const dateStr = formatReplicaDate(r.date);
  const tearPath = buildTearPath(REPLICA_WIDTH, 14);

  const itemRows = (r.items ?? [])
    .map(
      (it) => `
      <tr>
        <td class="l">${esc(truncateItemName(it.name))}</td>
        <td class="r">${formatBareMoney(it.amount)}</td>
        <td class="r">1</td>
        <td class="r">${formatBareMoney(it.amount)}</td>
      </tr>`
    )
    .join('');

  const itemsSection = itemRows
    ? `
    <div class="pad">
      <table class="items">
        <thead><tr><th class="l">DESCRIPTION</th><th class="r">PRICE</th><th class="r">QTY</th><th class="r">TOTAL</th></tr></thead>
        <tbody>
          <tr><td colspan="4" class="dashcell"><div class="dash">${REPLICA_DASH}</div></td></tr>
          ${itemRows}
        </tbody>
      </table>
    </div>
    <div class="pad dash">${REPLICA_DASH}</div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt — ${vendor}</title>
<style>
  @page { margin: 16mm auto; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #fff;
    font-family: 'Courier New', Courier, monospace;
    color: ${REPLICA_INK};
    font-size: 9.5pt;
    -webkit-font-smoothing: antialiased;
  }
  .receipt-wrap { width: 300pt; margin: 0 auto; }
  .paper {
    background: ${REPLICA_PAPER};
    box-shadow: 0 2pt 8pt rgba(0,0,0,0.16);
    padding-top: 20pt;
  }
  .pad { padding-left: 16pt; padding-right: 16pt; }
  .hdr { text-align: center; padding-bottom: 8pt; }
  .vendor { font-size: 13pt; font-weight: 700; letter-spacing: 0.5pt; line-height: 1.3; }
  .loc { font-size: 8.5pt; line-height: 1.5; margin-top: 3pt; }
  .dash { text-align: center; white-space: nowrap; overflow: hidden; font-size: 9pt; line-height: 1.7; }
  .dashcell { padding: 0; }
  .meta { overflow: hidden; padding: 3pt 0; font-size: 9pt; }
  .meta .ml { float: left; }
  .meta .mr { float: right; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th { font-size: 8pt; font-weight: 700; padding: 2pt 0; }
  table.items td { font-size: 9pt; padding: 2.5pt 0; vertical-align: top; }
  .l { text-align: left; }
  .r { text-align: right; white-space: nowrap; }
  .trow { overflow: hidden; padding: 2pt 0; }
  .trow .tl { float: left; }
  .trow .tv { float: right; }
  .trow.sub { font-size: 8.5pt; }
  .trow.grand { font-size: 13pt; font-weight: 700; padding: 5pt 0 2pt; }
  .footer { text-align: center; padding: 8pt 0 12pt; }
  .barcode { display: block; margin: 2pt auto 0; }
  .barcode-id { font-size: 8.5pt; letter-spacing: 3pt; margin-top: 4pt; }
  .tagline { font-size: 8pt; letter-spacing: 1pt; margin-top: 8pt; }
</style></head>
<body>
  <div class="receipt-wrap">
    <div class="paper">
      <div class="pad hdr">
        <div class="vendor">${vendor}</div>
        ${locLines.length ? `<div class="loc">${locLines.join('<br/>')}</div>` : ''}
      </div>

      <div class="pad dash">${REPLICA_DASH}</div>

      <div class="pad meta"><span class="ml">${esc(dateStr)}</span><span class="mr">RECEIPT # ${shortId}</span></div>

      <div class="pad dash">${REPLICA_DASH}</div>
      ${itemsSection}

      <div class="pad">
        ${r.subtotal != null ? `<div class="trow sub"><span class="tl">SUBTOTAL</span><span class="tv">${formatBareMoney(r.subtotal)}</span></div>` : ''}
        ${r.tax != null ? `<div class="trow sub"><span class="tl">TAX</span><span class="tv">${formatBareMoney(r.tax)}</span></div>` : ''}
        <div class="trow grand"><span class="tl">TOTAL AMOUNT</span><span class="tv">${formatReplicaMoney(r.total, currency)}</span></div>
      </div>

      <div class="pad dash">${REPLICA_DASH}</div>

      <div class="pad footer">
        ${buildBarcodeSvg(r.id)}
        <div class="barcode-id">${shortId}</div>
        <div class="tagline">TRACKED WITH POTRACES</div>
      </div>
    </div>
    <svg viewBox="0 0 ${REPLICA_WIDTH} 14" preserveAspectRatio="none" style="width:100%;height:10pt;display:block;" xmlns="http://www.w3.org/2000/svg"><path d="${tearPath}" fill="${REPLICA_PAPER}"/></svg>
  </div>
</body></html>`;
}
