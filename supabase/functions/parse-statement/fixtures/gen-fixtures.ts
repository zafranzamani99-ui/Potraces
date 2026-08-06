/**
 * Generates the synthetic bank-statement PDF fixtures for the parse-statement
 * golden test (docs/plans/import-reconciliation-design.md §7).
 *
 * All data is fake (names/accounts/balances invented) so the PDFs are
 * committable. When real anonymized statements replace these, keep the same
 * filenames and delete this generator's output for the replaced file.
 *
 * No npm deps: a minimal PDF writer is hand-rolled below (Catalog/Pages/Page/
 * Font/Contents with correct xref byte offsets). A4 595x842, 9pt Helvetica
 * text segments at absolute x positions. Multi-page supported; the header
 * block repeats on every page (as real e-statements do).
 *
 * Run: npm run gen:statementfixtures
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── Minimal PDF writer ─────────────────────────────────────────────────────

type Seg = { x: number; y: number; text: string };

function escPdf(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function contentStream(segs: Seg[]): string {
  return segs.map((s) => `BT /F1 9 Tf 1 0 0 1 ${s.x} ${s.y} Tm (${escPdf(s.text)}) Tj ET`).join('\n') + '\n';
}

function buildPdf(pages: Seg[][]): Buffer {
  // Object numbering: 1=Catalog, 2=Pages, 3=Font, then per page i:
  // page = 4+2i, contents = 5+2i.
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${4 + 2 * i} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((segs, i) => {
    const stream = contentStream(segs);
    objects[4 + 2 * i] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`;
    objects[5 + 2 * i] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`;
  });

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n`;
  out += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ─── Statement model ────────────────────────────────────────────────────────

type Txn = {
  date: string; // DD/MM/YYYY as printed
  desc: string;
  ref?: string; // reference / cheque column value ('-' when the column exists)
  amount: number; // signed: + deposit/credit, - withdrawal/debit
};

type StatementDef = {
  file: string;
  titleLines: string[]; // header block, repeated on every page
  columns: string[]; // header labels, left-to-right
  colX: number[]; // x position per column
  // indexes into columns for the money cells
  outCol: number; // withdrawal/debit/money-out
  inCol: number; // deposit/credit/money-in
  balCol: number; // running balance
  openingLabel: string;
  closingLabel: string | null; // null → no closing row
  opening: number;
  txns: Txn[];
  rowsPerPage: number; // forces pagination; header re-renders per page
};

const PAGE_TOP = 800;
const LH = 14;

function fmt(n: number): string {
  const neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  return `${neg ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d}`;
}

function renderStatement(def: StatementDef): Seg[][] {
  // Build printable rows: opening, txns (running balance), closing.
  type Row = string[]; // cell text per column
  const rows: Row[] = [];
  const blank = def.columns.map(() => '');
  const openingRow = [...blank];
  openingRow[0] = def.openingLabel;
  openingRow[def.balCol] = fmt(def.opening);
  rows.push(openingRow);

  let bal = def.opening;
  for (const t of def.txns) {
    bal = Math.round((bal + t.amount) * 100) / 100;
    const r = [...blank];
    r[0] = t.date;
    r[1] = t.desc;
    if (def.colX.length > 5) r[2] = t.ref ?? '-'; // reference/cheque column when present
    if (t.amount < 0) r[def.outCol] = fmt(-t.amount);
    else r[def.inCol] = fmt(t.amount);
    r[def.balCol] = fmt(bal);
    rows.push(r);
  }
  if (def.closingLabel) {
    const closingRow = [...blank];
    closingRow[0] = def.closingLabel;
    closingRow[def.balCol] = fmt(bal);
    rows.push(closingRow);
  }

  // Paginate, re-rendering the header block on each page.
  const pages: Seg[][] = [];
  for (let start = 0; start < rows.length; start += def.rowsPerPage) {
    const segs: Seg[] = [];
    def.titleLines.forEach((line, i) => segs.push({ x: 40, y: PAGE_TOP - i * LH, text: line }));
    const headerY = PAGE_TOP - (def.titleLines.length + 1) * LH;
    def.columns.forEach((c, i) => segs.push({ x: def.colX[i], y: headerY, text: c }));
    const firstRowY = headerY - LH;
    rows.slice(start, start + def.rowsPerPage).forEach((r, ri) => {
      r.forEach((cell, ci) => {
        if (cell) segs.push({ x: def.colX[ci], y: firstRowY - ri * LH, text: cell });
      });
    });
    pages.push(segs);
  }
  return pages;
}

// ─── Fixtures: all MYR, June 2026, DD/MM/YYYY display ───────────────────────

const D = (day: number) => `${String(day).padStart(2, '0')}/06/2026`;

const maybank: StatementDef = {
  file: 'maybank-savings.pdf',
  titleLines: [
    'MALAYAN BANKING BERHAD - MAYBANK2U STATEMENT',
    'Savings Account Statement',
    'Account Holder: AHMAD FAIZ BIN ABDULLAH',
    'Account No: 1234-5678-9012',
    'Statement Period: 01/06/2026 - 30/06/2026',
  ],
  columns: ['Date', 'Description', 'Reference', 'Withdrawal(RM)', 'Deposit(RM)', 'Balance(RM)'],
  colX: [40, 95, 335, 405, 480, 535],
  outCol: 3,
  inCol: 4,
  balCol: 5,
  openingLabel: 'OPENING BALANCE',
  closingLabel: 'CLOSING BALANCE',
  opening: 3250.0,
  rowsPerPage: 7, // forces a 2nd page so the repeated-header path is exercised
  txns: [
    { date: D(2), desc: 'SALARY - ABC SDN BHD', ref: 'PAYROLL0626', amount: 4500.0 },
    { date: D(3), desc: 'DUITNOW QR PAYMENT-TO MAMAK RESTORAN', ref: 'DNQR882134', amount: -12.5 },
    { date: D(5), desc: 'MYDEBIT POS - GIANT HYPERMARKET', ref: 'POS554012', amount: -145.9 },
    { date: D(7), desc: 'PETRONAS SETAPAK', ref: 'POS556781', amount: -60.0 },
    { date: D(10), desc: 'TNB BILL PAYMENT', ref: 'BILL221045', amount: -210.35 },
    { date: D(12), desc: 'DUITNOW TRANSFER-TO TNG EWALLET', ref: 'DN991205', amount: -100.0 },
    { date: D(15), desc: 'DUITNOW TRANSFER-TO SITI AMINAH', ref: 'DN991847', amount: -50.0 },
    { date: D(18), desc: 'AMAZON WEB SERVICES USD 12.34 CONV RATE 4.7123', ref: 'INTL77031', amount: -58.15 },
    { date: D(20), desc: 'SHOPEE MY', ref: 'ECOM66120', amount: -89.9 },
    { date: D(25), desc: 'GRAB RIDES', ref: 'GRAB88102', amount: -18.0 },
  ],
};

const cimb: StatementDef = {
  file: 'cimb-savings.pdf',
  titleLines: [
    'CIMB BANK BERHAD - e-Statement',
    'Savings Account',
    'Account Holder: NUR AISYAH BINTI RAHIM',
    'Account No: 8601234567',
    'Statement Period: 01/06/2026 - 30/06/2026',
  ],
  columns: ['Date', 'Description', 'Withdrawals(RM)', 'Deposits(RM)', 'Balance(RM)'],
  colX: [40, 95, 390, 470, 535],
  outCol: 2,
  inCol: 3,
  balCol: 4,
  openingLabel: 'BALANCE B/F',
  closingLabel: null,
  opening: 2100.0,
  rowsPerPage: 50,
  txns: [
    { date: D(1), desc: 'PAYROLL - XYZ ENTERPRISE', amount: 3800.0 },
    { date: D(2), desc: 'INSTANT TRANSFER - TOUCH N GO EWALLET', amount: -200.0 },
    { date: D(4), desc: 'DUITNOW QR - KEDAI KOPI PAK MAT', amount: -8.5 },
    { date: D(6), desc: 'AEON BANDARAYA', amount: -132.4 },
    { date: D(9), desc: 'SHELL FUEL', amount: -80.0 },
    { date: D(13), desc: 'ASTRO MONTHLY', amount: -99.0 },
    { date: D(16), desc: 'GRABPAY TOP-UP', amount: -150.0 },
    { date: D(19), desc: 'UNIFI BILL', amount: -149.0 },
    { date: D(22), desc: 'WATSONS', amount: -67.8 },
    { date: D(27), desc: 'KFC', amount: -32.5 },
  ],
};

const bankislam: StatementDef = {
  file: 'bankislam-savings.pdf',
  titleLines: [
    'BANK ISLAM MALAYSIA BERHAD',
    'Savings Account-i Statement',
    'Account Holder: MOHD HAFIZ BIN OSMAN',
    'Account No: 1203-4567-8901-23',
    'Statement Period: 01/06/2026 - 30/06/2026',
  ],
  columns: ['Date', 'Description', 'Debit(RM)', 'Credit(RM)', 'Balance(RM)'],
  colX: [40, 95, 390, 470, 535],
  outCol: 2,
  inCol: 3,
  balCol: 4,
  openingLabel: 'OPENING BALANCE',
  closingLabel: null,
  opening: 1750.0,
  rowsPerPage: 50,
  txns: [
    { date: D(3), desc: 'GAJI - MAJLIS DAERAH', amount: 3200.0 },
    { date: D(4), desc: 'BAYARAN POS - SPEEDMART', amount: -45.6 },
    { date: D(8), desc: 'DUITNOW - NASI KANDAR PELITA', amount: -15.0 },
    { date: D(11), desc: 'MYDIN', amount: -178.25 },
    { date: D(14), desc: 'TNG EWALLET TOP UP', amount: -100.0 },
    { date: D(17), desc: 'AIR SELANGOR', amount: -45.0 },
    { date: D(21), desc: 'MCDONALDS', amount: -28.9 },
    { date: D(24), desc: 'FUND TRANSFER TO MOHD HAFIZ BIN OSMAN MAYBANK 1234', amount: -500.0 },
    { date: D(28), desc: 'PETRON', amount: -70.0 },
  ],
};

const hongleong: StatementDef = {
  file: 'hongleong-savings.pdf',
  titleLines: [
    'HONG LEONG BANK BERHAD',
    'Savings Account Statement',
    'Account Holder: TAN MEI LING',
    'Account No: 123-456-78901',
    'Statement Period: 01/06/2026 - 30/06/2026',
  ],
  columns: ['Date', 'Description', 'Cheque No', 'Withdrawal(RM)', 'Deposit(RM)', 'Balance(RM)'],
  colX: [40, 95, 330, 405, 478, 535],
  outCol: 3,
  inCol: 4,
  balCol: 5,
  openingLabel: 'BALANCE BROUGHT FORWARD',
  closingLabel: 'CLOSING BALANCE',
  opening: 4020.0,
  rowsPerPage: 50,
  txns: [
    { date: D(1), desc: 'SALARY CREDIT', ref: '-', amount: 5200.0 },
    { date: D(3), desc: 'DUITNOW QR - OLD TOWN WHITE COFFEE', ref: '-', amount: -19.8 },
    { date: D(5), desc: 'LOTUSS', ref: '-', amount: -210.45 },
    { date: D(9), desc: 'BOOST TOPUP', ref: '-', amount: -80.0 },
    { date: D(12), desc: 'MAXIS BILL', ref: '-', amount: -129.0 },
    { date: D(15), desc: 'SINGAPORE AIRLINES SGD 210.00 RATE 3.5120', ref: '-', amount: -737.52 },
    { date: D(18), desc: 'DUITNOW - LIM AH KOW', ref: '-', amount: -120.0 },
    { date: D(23), desc: 'WATSONS', ref: '-', amount: -55.3 },
    { date: D(26), desc: 'GRAB PAY TOP-UP', ref: '-', amount: -100.0 },
  ],
};

const tng: StatementDef = {
  file: 'tng-ewallet.pdf',
  titleLines: [
    "TOUCH 'N GO EWALLET STATEMENT",
    'eWallet Account Statement',
    'Account Holder: AHMAD FAIZ BIN ABDULLAH',
    'Wallet ID: +6012-3456789',
    'Statement Period: 01/06/2026 - 30/06/2026',
  ],
  columns: ['Date', 'Description', 'Money Out(RM)', 'Money In(RM)', 'Balance(RM)'],
  colX: [40, 95, 390, 470, 535],
  outCol: 2,
  inCol: 3,
  balCol: 4,
  openingLabel: 'OPENING BALANCE',
  closingLabel: null,
  opening: 65.0,
  rowsPerPage: 50,
  txns: [
    { date: D(1), desc: 'QR PAY - RESTORAN ALI MAMAK', amount: -9.5 },
    { date: D(3), desc: 'RELOAD VIA DUITNOW (FROM MAYBANK)', amount: 100.0 },
    { date: D(6), desc: 'QR PAY - KK SUPER MART', amount: -22.3 },
    { date: D(10), desc: 'TOLL - PLUS HIGHWAY', amount: -15.2 },
    { date: D(12), desc: 'QR PAY - STARBUCKS', amount: -18.0 },
    { date: D(15), desc: 'PARKING - KLCC', amount: -6.0 },
    { date: D(20), desc: 'QR PAY - MYNEWS', amount: -12.4 },
    { date: D(25), desc: 'RELOAD VIA FPX (FROM CIMB)', amount: 200.0 },
  ],
};

// ─── Main ───────────────────────────────────────────────────────────────────

const outDir = __dirname;
for (const def of [maybank, cimb, bankislam, hongleong, tng]) {
  const pages = renderStatement(def);
  const pdf = buildPdf(pages);
  const out = path.join(outDir, def.file);
  fs.writeFileSync(out, pdf);
  const closing = def.txns.reduce((b, t) => Math.round((b + t.amount) * 100) / 100, def.opening);
  console.log(
    `✓ ${def.file}  ${pdf.length} bytes, ${pages.length} page(s), ` +
      `${def.txns.length} txns, closing balance ${fmt(closing)}`,
  );
}
