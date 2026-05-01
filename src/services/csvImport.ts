import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  filename: string;
}

/** RFC-4180-ish CSV parser. Handles quoted fields, doubled quotes, embedded
 *  commas/newlines. No external dep.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') {
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  // final cell
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  return { headers, rows: rows.slice(1) };
}

export async function pickCsv(): Promise<CsvParseResult | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const text = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const { headers, rows } = parseCsv(text);
  return { headers, rows, filename: asset.name ?? 'import.csv' };
}

// ─── Date parsing (multiple formats MY banks use) ───────────────────────────
const DATE_FORMATS: RegExp[] = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})/,          // 2025-01-15
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,        // 15/01/2025 or 01/15/2025 — ambiguous
  /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/,   // 15-Jan-2025
  /^(\d{1,2}) ([A-Za-z]{3}) (\d{2,4})/,   // 15 Jan 2025
];

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseDateCell(cell: string): Date | null {
  const t = (cell ?? '').trim();
  if (!t) return null;

  // ISO
  let m = t.match(DATE_FORMATS[0]);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // dd/mm/yyyy (prefer MY locale)
  m = t.match(DATE_FORMATS[1]);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month > 12) {
      // treat as mm/dd/yyyy
      const d = new Date(year, day - 1, month);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }
  // dd-Mon-yyyy
  m = t.match(DATE_FORMATS[2]) ?? t.match(DATE_FORMATS[3]);
  if (m) {
    const day = Number(m[1]);
    const mon = MONTHS[m[2].toLowerCase()];
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    if (mon == null) return null;
    const d = new Date(year, mon, day);
    return isNaN(d.getTime()) ? null : d;
  }
  // fallback
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Amount parsing (handles "1,234.56", "(1,234.56)", "RM 123", "-123") ─
export function parseAmountCell(cell: string): { amount: number; isNegative: boolean } | null {
  if (!cell) return null;
  let t = cell.trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  // strip currency markers
  t = t.replace(/[A-Za-z]+\s*/g, '');
  // strip thousands separators, keep decimal point
  t = t.replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  if (isNaN(n)) return null;
  return { amount: Math.abs(n), isNegative: neg || n < 0 };
}
