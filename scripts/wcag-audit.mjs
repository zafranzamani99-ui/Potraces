// WCAG contrast audit — computes AA/AAA pass/fail for Potraces palettes

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};

const linearize = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const relLum = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrast = (fg, bg) => {
  const L1 = relLum(fg);
  const L2 = relLum(bg);
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
};

// Composite a translucent hex over a solid bg (for pillBg/inputBorder which are rgba)
const compositeRgba = (rgbaStr, bgHex) => {
  // rgba(r,g,b,a) -> blend over bg
  const m = rgbaStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return bgHex;
  const [r, g, b, a] = [+m[1], +m[2], +m[3], +m[4]];
  const { r: br, g: bg_, b: bb } = hexToRgb(bgHex);
  const blend = (fg, bg) => Math.round(fg * a + bg * (1 - a));
  const nr = blend(r, br), ng = blend(g, bg_), nb = blend(b, bb);
  return '#' + [nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('');
};

const badge = (ratio) => {
  const aaN = ratio >= 4.5;
  const aaL = ratio >= 3;
  const aaaN = ratio >= 7;
  const aaaL = ratio >= 4.5;
  const uiC = ratio >= 3;
  let status;
  if (ratio >= 7) status = 'AAA';
  else if (ratio >= 4.5) status = 'AA';
  else if (ratio >= 3) status = 'AA Large / UI only';
  else status = 'FAIL';
  return { ratio: ratio.toFixed(2), status, aaN, aaL, aaaN, aaaL, uiC };
};

// === PALETTES ===
const CALM = {
  background: '#F9F9F7',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
  textMuted: '#6A6A6A',
  accent: '#4F5104',
  positive: '#4F5104',
  neutral: '#B8AFBC',
  border: '#C4C4C4',
  highlight: '#FFF7E6',
  gold: '#DEAB22',
  bronze: '#9A6400',
  deepOlive: '#332D03',
  lavender: '#B8AFBC',
  // composited
  inputBorder: compositeRgba('rgba(26,26,26,0.50)', '#F9F9F7'),
  pillBg: compositeRgba('rgba(26,26,26,0.07)', '#F9F9F7'),
};

const CALM_DARK = {
  background: '#121212',
  surface: '#1E1E1E',
  textPrimary: '#F0EDE8',
  textSecondary: '#A8A8A8',
  textMuted: '#ABABAB',
  accent: '#A4A843',
  positive: '#A4A843',
  neutral: '#8E869A',
  border: '#4A4A4A',
  highlight: '#2A2518',
  gold: '#E8BC3F',
  bronze: '#C9924A',
  deepOlive: '#9A9540',
  lavender: '#8E869A',
  inputBorder: compositeRgba('rgba(240,237,232,0.42)', '#121212'),
  pillBg: compositeRgba('rgba(240,237,232,0.08)', '#121212'),
};

// ─── WCAG-SAFE per-mode semantic tokens (mirrors src/constants/index.ts) ───
// Each token has `{ light, dark }` — audited against the matching mode surface.
const BIZ_SAFE = {
  profit:      { light: '#332D03', dark: '#B9B76A' },
  loss:        { light: '#8A5C00', dark: '#D99441' },
  overdue:     { light: '#8E4A1C', dark: '#D18A4F' },
  unpaid:      { light: '#8B6442', dark: '#D9AE7E' },
  pending:     { light: '#A05A1F', dark: '#E89C5B' },
  success:     { light: '#3F6E84', dark: '#8ABCD2' },
  warning:     { light: '#8E6610', dark: '#E4BB4A' },
  error:       { light: '#7A4F2F', dark: '#C38C63' },
  destructive: { light: '#923B21', dark: '#D98B74' },
  inputError:  { light: '#A04732', dark: '#E59580' },
  delivered:   { light: '#5A6E8B', dark: '#A9B8CE' },
};

const DEBT_TYPES_SAFE = {
  i_owe:    { light: '#923B21', dark: '#D98B74' },
  they_owe: { light: '#4F5104', dark: '#A4A843' },
};

const DEBT_STATUSES_SAFE = {
  pending: { light: '#8E6610', dark: '#E4BB4A' },
  partial: { light: '#8A5C00', dark: '#D99441' },
  settled: { light: '#3F6E84', dark: '#8ABCD2' },
};

const CATEGORY = {
  food: '#9B6A3A', transport: '#5E72E4', shopping: '#8B7000', entertainment: '#A06CD5',
  bills: '#767A0A', health: '#2E7A9A', education: '#8B7355', family: '#7C8DA4',
  subscription: '#7C5CFC', biz: '#B2780A', debt: '#7C8DA4', other: '#6B7596',
};

// === AUDIT PAIRS ===
const fmtRow = (label, fg, bg, note = '', kind = 'text') => {
  const c = contrast(fg, bg);
  const b = badge(c);
  // kind: 'text' | 'ui' | 'border' — gate treats non-text differently
  return { label, fg, bg, ratio: b.ratio, status: b.status, note, kind };
};

const runSection = (title, rows) => {
  console.log('\n=== ' + title + ' ===');
  console.log('─'.repeat(110));
  console.log('Label'.padEnd(50) + 'FG → BG'.padEnd(22) + 'Ratio'.padEnd(8) + 'Status');
  console.log('─'.repeat(110));
  for (const r of rows) {
    const pair = (r.fg + ' → ' + r.bg).padEnd(22);
    const tag = r.status === 'FAIL' ? '❌ FAIL'
      : r.status === 'AA Large / UI only' ? '⚠ AA-large'
      : r.status === 'AA' ? '✓ AA'
      : '✓✓ AAA';
    console.log(r.label.padEnd(50) + pair + (r.ratio + ':1').padEnd(8) + tag + (r.note ? '  — ' + r.note : ''));
  }
};

// --- LIGHT MODE ---
const light = [
  fmtRow('textPrimary on background', CALM.textPrimary, CALM.background, 'body text'),
  fmtRow('textPrimary on surface', CALM.textPrimary, CALM.surface, 'body text on card'),
  fmtRow('textSecondary on background', CALM.textSecondary, CALM.background, 'muted labels'),
  fmtRow('textSecondary on surface', CALM.textSecondary, CALM.surface, 'muted labels on card'),
  fmtRow('textMuted on background', CALM.textMuted, CALM.background, 'hint text'),
  fmtRow('textMuted on surface', CALM.textMuted, CALM.surface, 'hint text on card'),
  fmtRow('accent (olive) on background', CALM.accent, CALM.background, 'primary action text'),
  fmtRow('accent on surface', CALM.accent, CALM.surface, 'primary action on card'),
  fmtRow('bronze on background', CALM.bronze, CALM.background, 'bronze label'),
  fmtRow('bronze on surface', CALM.bronze, CALM.surface),
  fmtRow('dark text on gold badge', '#4A3A00', CALM.gold, 'badge label on gold bg'),
  fmtRow('dark text on neutral badge', '#2A2233', CALM.neutral, 'badge label on neutral/lavender bg'),
  fmtRow('deepOlive on background', CALM.deepOlive, CALM.background),
  fmtRow('deepOlive on surface', CALM.deepOlive, CALM.surface),
  fmtRow('textPrimary on pillBg (composited)', CALM.textPrimary, CALM.pillBg, 'pill label'),
  fmtRow('textPrimary on highlight', CALM.textPrimary, CALM.highlight),
  fmtRow('inputBorder on background (UI)', CALM.inputBorder, CALM.background, 'UI border — 3:1 required', 'ui'),
  fmtRow('accent (barActive) on bar (UI)', CALM.barActive || CALM.accent, '#D4D4D4', 'progress bar — 3:1 required', 'ui'),
];
runSection('LIGHT MODE — Core Text & UI', light);

// --- DARK MODE ---
const dark = [
  fmtRow('textPrimary on background', CALM_DARK.textPrimary, CALM_DARK.background, 'body text'),
  fmtRow('textPrimary on surface', CALM_DARK.textPrimary, CALM_DARK.surface),
  fmtRow('textSecondary on background', CALM_DARK.textSecondary, CALM_DARK.background),
  fmtRow('textSecondary on surface', CALM_DARK.textSecondary, CALM_DARK.surface),
  fmtRow('textMuted on background', CALM_DARK.textMuted, CALM_DARK.background),
  fmtRow('textMuted on surface', CALM_DARK.textMuted, CALM_DARK.surface),
  fmtRow('accent on background', CALM_DARK.accent, CALM_DARK.background),
  fmtRow('accent on surface', CALM_DARK.accent, CALM_DARK.surface),
  fmtRow('bronze on background', CALM_DARK.bronze, CALM_DARK.background),
  fmtRow('bronze on surface', CALM_DARK.bronze, CALM_DARK.surface),
  fmtRow('gold on background', CALM_DARK.gold, CALM_DARK.background),
  fmtRow('gold on surface', CALM_DARK.gold, CALM_DARK.surface),
  fmtRow('neutral on background', CALM_DARK.neutral, CALM_DARK.background),
  fmtRow('neutral on surface', CALM_DARK.neutral, CALM_DARK.surface),
  fmtRow('deepOlive on background', CALM_DARK.deepOlive, CALM_DARK.background),
  fmtRow('deepOlive on surface', CALM_DARK.deepOlive, CALM_DARK.surface),
  fmtRow('textPrimary on pillBg (composited)', CALM_DARK.textPrimary, CALM_DARK.pillBg),
  fmtRow('textPrimary on highlight', CALM_DARK.textPrimary, CALM_DARK.highlight),
  fmtRow('inputBorder on background (UI)', CALM_DARK.inputBorder, CALM_DARK.background, '', 'ui'),
];
runSection('DARK MODE — Core Text & UI', dark);

// --- BIZ_SAFE semantic colors (per-mode tokens on their matching surface) ---
const bizRows = [];
for (const [k, v] of Object.entries(BIZ_SAFE)) {
  bizRows.push(fmtRow(`BIZ_SAFE.${k}.light on surface`, v.light, CALM.surface));
  bizRows.push(fmtRow(`BIZ_SAFE.${k}.light on background`, v.light, CALM.background));
}
runSection('BIZ_SAFE SEMANTIC COLORS — .light on light surfaces', bizRows);

const bizRowsDark = [];
for (const [k, v] of Object.entries(BIZ_SAFE)) {
  bizRowsDark.push(fmtRow(`BIZ_SAFE.${k}.dark on surface`, v.dark, CALM_DARK.surface));
  bizRowsDark.push(fmtRow(`BIZ_SAFE.${k}.dark on background`, v.dark, CALM_DARK.background));
}
runSection('BIZ_SAFE SEMANTIC COLORS — .dark on dark surfaces', bizRowsDark);

// --- DEBT_TYPES_SAFE + DEBT_STATUSES_SAFE (per-mode) ---
const debtRows = [];
for (const [k, v] of Object.entries(DEBT_TYPES_SAFE)) {
  debtRows.push(fmtRow(`DEBT_TYPES_SAFE.${k}.light on surface`, v.light, CALM.surface));
  debtRows.push(fmtRow(`DEBT_TYPES_SAFE.${k}.light on background`, v.light, CALM.background));
}
for (const [k, v] of Object.entries(DEBT_STATUSES_SAFE)) {
  debtRows.push(fmtRow(`DEBT_STATUSES_SAFE.${k}.light on surface`, v.light, CALM.surface));
  debtRows.push(fmtRow(`DEBT_STATUSES_SAFE.${k}.light on background`, v.light, CALM.background));
}
for (const [k, v] of Object.entries(DEBT_TYPES_SAFE)) {
  debtRows.push(fmtRow(`DEBT_TYPES_SAFE.${k}.dark on surface`, v.dark, CALM_DARK.surface));
  debtRows.push(fmtRow(`DEBT_TYPES_SAFE.${k}.dark on background`, v.dark, CALM_DARK.background));
}
for (const [k, v] of Object.entries(DEBT_STATUSES_SAFE)) {
  debtRows.push(fmtRow(`DEBT_STATUSES_SAFE.${k}.dark on surface`, v.dark, CALM_DARK.surface));
  debtRows.push(fmtRow(`DEBT_STATUSES_SAFE.${k}.dark on background`, v.dark, CALM_DARK.background));
}
runSection('DEBT_*_SAFE colors (badges/text, per-mode)', debtRows);

// --- Category colors on light surface ---
const catRows = [];
for (const [k, v] of Object.entries(CATEGORY)) catRows.push(fmtRow(`cat ${k} on light surface`, v, CALM.surface, 'dot/chip', 'ui'));
for (const [k, v] of Object.entries(CATEGORY)) catRows.push(fmtRow(`cat ${k} on dark surface`, v, CALM_DARK.surface, 'dot/chip', 'ui'));
runSection('CATEGORY colors (used for small chips + labels)', catRows);

// --- Colored text on tinted bg (withAlpha 0.1 common pattern) ---
// Simulate: text = color, bg = color @ 10% over surface
const tintedPairs = [
  { name: 'accent on accent@10% light', color: CALM.accent, bg: CALM.surface },
  { name: 'bronze on bronze@10% light', color: CALM.bronze, bg: CALM.surface },
  { name: 'BIZ_SAFE.destructive.light on tint', color: BIZ_SAFE.destructive.light, bg: CALM.surface },
  { name: 'BIZ_SAFE.overdue.light on tint', color: BIZ_SAFE.overdue.light, bg: CALM.surface },
  { name: 'DEBT_TYPES_SAFE.i_owe.light on tint', color: DEBT_TYPES_SAFE.i_owe.light, bg: CALM.surface },
];
const tintedRows = tintedPairs.map(({ name, color, bg }) => {
  // composite the 10% alpha tint over bg
  const { r, g, b } = hexToRgb(color);
  const { r: br, g: bg_, b: bb } = hexToRgb(bg);
  const a = 0.1;
  const cr = Math.round(r * a + br * (1 - a));
  const cg = Math.round(g * a + bg_ * (1 - a));
  const cb = Math.round(b * a + bb * (1 - a));
  const tint = '#' + [cr, cg, cb].map((n) => n.toString(16).padStart(2, '0')).join('');
  return fmtRow(name, color, tint, 'pill/chip badge', 'ui');
});
runSection('TINTED BADGES (color on color@10% over surface — common pattern)', tintedRows);

// Summary
console.log('\n=== SUMMARY ===');
const allRows = [...light, ...dark, ...bizRows, ...bizRowsDark, ...debtRows, ...catRows, ...tintedRows];
const total = allRows.length;
const fail = allRows.filter((r) => r.status === 'FAIL').length;
const aaLargeOnly = allRows.filter((r) => r.status === 'AA Large / UI only').length;
const aa = allRows.filter((r) => r.status === 'AA').length;
const aaa = allRows.filter((r) => r.status === 'AAA').length;
console.log(`Total pairs tested: ${total}`);
console.log(`AAA pass:           ${aaa}`);
console.log(`AA pass (normal):   ${aa}`);
console.log(`AA-large only:      ${aaLargeOnly}  (below 4.5:1 — fails for body text)`);
console.log(`FAIL (< 3:1):       ${fail}  (unusable even for large text / UI)`);

// ─── CI GATE (Phase 8.1) ────────────────────────────────────────────────
// Fail the build if:
//   1. Any 'text' pair is below 4.5:1 (AA-large-only or FAIL).
//   2. Any 'ui' pair is below 3:1 (FAIL).
// UI pairs at AA-large (3:1–4.5:1) are acceptable per WCAG 1.4.11.
const textAaLargeOnly = allRows.filter(
  (r) => r.status === 'AA Large / UI only' && r.kind === 'text',
);
const textFail = allRows.filter(
  (r) => r.status === 'FAIL' && r.kind === 'text',
);
const uiFail = allRows.filter(
  (r) => r.status === 'FAIL' && r.kind === 'ui',
);
const failCount = textFail.length + uiFail.length;
const textAaLargeCount = textAaLargeOnly.length;
const gatePassed = failCount === 0 && textAaLargeCount === 0;

console.log('\n=== GATE ===');
console.log(`FAIL (text <4.5:1 or ui <3:1): ${failCount} (must be 0)`);
console.log(`AA-large-only (text): ${textAaLargeCount} (must be 0)`);
if (textAaLargeCount > 0) {
  console.log('  Offending text pairs:');
  for (const r of textAaLargeOnly) {
    console.log(`    - ${r.label} (${r.fg} → ${r.bg}, ${r.ratio}:1)`);
  }
}
console.log(`Result: ${gatePassed ? 'PASS' : 'FAIL'}`);

if (!gatePassed) {
  process.exit(1);
}
