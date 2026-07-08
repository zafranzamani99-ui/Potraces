// ─── Expression-based calculator engine ──────────────────────────────────────
// A "best-in-class basic" calculator: the user builds a full expression string
// (digits, + − × ÷, parentheses, %, decimals) and sees a LIVE running result.
// Proper operator precedence (× ÷ before + −) and brackets — but no scientific
// math (no powers, roots, trig, logs). Pure module: zero React/native imports,
// so it is tsx-testable. The screen is a thin view over this.

export type CalcOp = '+' | '-' | '×' | '÷';

export interface CalcState {
  /** Raw expression WITHOUT thousands separators, e.g. "5553+321" or "(12+3)×4". */
  expr: string;
  /** True right after `=`: the next digit starts fresh; the next operator continues from the result. */
  justEvaluated: boolean;
}

export const initialCalc: CalcState = { expr: '', justEvaluated: false };

const OPS = new Set(['+', '-', '×', '÷']);
const isOpChar = (c: string) => OPS.has(c);
const ERROR = 'Error';

export function isError(s: CalcState): boolean {
  return s.expr === ERROR;
}

/** Trailing run of the current number being typed (digits + dot). */
const currentNumberSegment = (expr: string): string => {
  const m = expr.match(/[0-9.]*$/);
  return m ? m[0] : '';
};

// ─── Input builders (pure) ───────────────────────────────────────────────────

export function inputDigit(s: CalcState, d: string): CalcState {
  if (isError(s) || s.justEvaluated) return { expr: d, justEvaluated: false };
  const seg = currentNumberSegment(s.expr);
  if (seg === '0') {
    if (d === '0') return s; // collapse leading zeros
    return { expr: s.expr.slice(0, -1) + d, justEvaluated: false };
  }
  return { expr: s.expr + d, justEvaluated: false };
}

export function inputDoubleZero(s: CalcState): CalcState {
  if (isError(s) || s.justEvaluated) return { expr: '0', justEvaluated: false };
  const seg = currentNumberSegment(s.expr);
  if (seg === '0') return s;         // "0" + "00" stays "0"
  if (seg === '') return { expr: s.expr + '0', justEvaluated: false }; // start of a number → single 0
  return { expr: s.expr + '00', justEvaluated: false };
}

export function inputDot(s: CalcState): CalcState {
  if (isError(s) || s.justEvaluated) return { expr: '0.', justEvaluated: false };
  const seg = currentNumberSegment(s.expr);
  if (seg.includes('.')) return s;
  if (seg === '') return { expr: s.expr + '0.', justEvaluated: false };
  return { expr: s.expr + '.', justEvaluated: false };
}

export function inputOp(s: CalcState, op: CalcOp): CalcState {
  if (isError(s)) return { expr: op === '-' ? '-' : '', justEvaluated: false };
  // After "=", continue operating on the result.
  const expr = s.justEvaluated ? s.expr : s.expr;
  if (expr === '') return op === '-' ? { expr: '-', justEvaluated: false } : s;
  const last = expr.slice(-1);
  if (isOpChar(last)) {
    // Replace a trailing operator with the new one.
    return { expr: expr.slice(0, -1) + op, justEvaluated: false };
  }
  if (last === '(') {
    // Only a leading minus is valid right after "(".
    return op === '-' ? { expr: expr + op, justEvaluated: false } : s;
  }
  return { expr: expr + op, justEvaluated: false };
}

/** Smart bracket: inserts ")" when it closes an open group after a value, else "(". */
export function inputBracket(s: CalcState): CalcState {
  if (isError(s)) return { expr: '(', justEvaluated: false };
  const expr = s.expr;
  const opens = (expr.match(/\(/g) || []).length;
  const closes = (expr.match(/\)/g) || []).length;
  const last = expr.slice(-1);
  const valueEnd = last !== '' && /[0-9.)%]/.test(last);
  if (opens > closes && valueEnd) {
    return { expr: expr + ')', justEvaluated: false };
  }
  // Opening: implicit multiply when it follows a value, e.g. "5(" → "5×(".
  return { expr: expr + (valueEnd ? '×(' : '('), justEvaluated: false };
}

export function inputPercent(s: CalcState): CalcState {
  if (isError(s) || s.expr === '') return s;
  const last = s.expr.slice(-1);
  if (/[0-9.)%]/.test(last)) return { expr: s.expr + '%', justEvaluated: false };
  return s;
}

export function backspace(s: CalcState): CalcState {
  if (isError(s)) return { ...initialCalc };
  return { expr: s.expr.slice(0, -1), justEvaluated: false };
}

export function clearAll(): CalcState {
  return { ...initialCalc };
}

/**
 * Insert a numeric value (e.g. a tapped history result) into the current
 * expression. On a fresh/just-evaluated/empty state it becomes the start;
 * right after a value it inserts an implicit "×"; after an operator or "(" it
 * simply appends. `valueStr` is a plain number string (no separators).
 */
export function insertValue(s: CalcState, valueStr: string): CalcState {
  if (isError(s) || s.justEvaluated || s.expr === '') {
    return { expr: valueStr, justEvaluated: false };
  }
  const last = s.expr.slice(-1);
  if (/[0-9.)%]/.test(last)) {
    return { expr: s.expr + '×' + valueStr, justEvaluated: false };
  }
  return { expr: s.expr + valueStr, justEvaluated: false };
}

/**
 * Evaluate on "=". On success the expression is replaced by the plain result
 * string (so the user can keep operating on it). A math failure (e.g. ÷0)
 * becomes the `Error` state; an incomplete expression is a no-op.
 */
export function equals(s: CalcState): CalcState {
  if (isError(s) || s.expr === '') return s;
  const r = evaluate(s.expr);
  if (r === null) return s;                 // incomplete / parse error → no-op
  if (!isFinite(r)) return { expr: ERROR, justEvaluated: true };
  return { expr: numberToPlainString(r), justEvaluated: true };
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

type Tok =
  | { type: 'num'; value: number }
  | { type: 'op'; op: CalcOp }
  | { type: 'lp' }
  | { type: 'rp' }
  | { type: 'pct' };

function tokenize(expr: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      if ((num.match(/\./g) || []).length > 1) throw new Error('bad number');
      const val = parseFloat(num);
      if (!isFinite(val)) throw new Error('bad number'); // e.g. a lone "."
      tokens.push({ type: 'num', value: val });
      continue;
    }
    if (c === '+' || c === '-' || c === '×' || c === '÷') { tokens.push({ type: 'op', op: c }); i++; continue; }
    if (c === '(') { tokens.push({ type: 'lp' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rp' }); i++; continue; }
    if (c === '%') { tokens.push({ type: 'pct' }); i++; continue; }
    throw new Error('bad char');
  }
  return tokens;
}

/**
 * Evaluate a raw expression string. Returns the numeric value, or `null` when the
 * expression is incomplete or malformed. Division by zero yields `Infinity`
 * (a number) so callers can render it as "Error".
 *
 * Percent is contextual, matching what users expect from a phone calculator:
 *  - additive:      `200 + 10%`  → 200 + (200 × 10/100) = 220
 *  - multiplicative:`200 × 10%`  → 200 × (10/100)       = 20
 *  - standalone:    `50%`        → 0.5
 */
export function evaluate(expr: string): number | null {
  if (!expr) return null;
  let tokens: Tok[];
  try { tokens = tokenize(expr); } catch { return null; }
  if (tokens.length === 0) return null;

  let pos = 0;
  let failed = false;
  const peek = (): Tok | undefined => tokens[pos];
  const eat = (): Tok => tokens[pos++];
  const fail = (): number => { failed = true; return 0; };

  const parsePrimary = (): number => {
    const t = peek();
    if (!t) return fail();
    if (t.type === 'lp') {
      eat();
      const v = parseAdd();
      const close = peek();
      if (!close || close.type !== 'rp') return fail();
      eat();
      return v;
    }
    if (t.type === 'num') { eat(); return t.value; }
    return fail();
  };

  const parseUnary = (): number => {
    const t = peek();
    if (t && t.type === 'op' && t.op === '-') { eat(); return -parseUnary(); }
    if (t && t.type === 'op' && t.op === '+') { eat(); return parseUnary(); }
    return parsePrimary();
  };

  const parseOperand = (): { value: number; percent: boolean } => {
    const v = parseUnary();
    const t = peek();
    if (t && t.type === 'pct') { eat(); return { value: v, percent: true }; }
    return { value: v, percent: false };
  };

  const parseTerm = (): { value: number; barePercent: boolean; raw: number } => {
    const first = parseOperand();
    let acc = first.percent ? first.value / 100 : first.value;
    let sawMulDiv = false;
    for (;;) {
      const t = peek();
      if (!t || t.type !== 'op' || (t.op !== '×' && t.op !== '÷')) break;
      sawMulDiv = true;
      eat();
      const r = parseOperand();
      const rv = r.percent ? r.value / 100 : r.value;
      acc = (t as { op: CalcOp }).op === '×' ? acc * rv : acc / rv;
    }
    return { value: acc, barePercent: first.percent && !sawMulDiv, raw: first.value };
  };

  function parseAdd(): number {
    const left = parseTerm();
    let leftVal = left.value;
    for (;;) {
      const t = peek();
      if (!t || t.type !== 'op' || (t.op !== '+' && t.op !== '-')) break;
      eat();
      const r = parseTerm();
      const rv = r.barePercent ? (leftVal * r.raw) / 100 : r.value;
      leftVal = (t as { op: CalcOp }).op === '+' ? leftVal + rv : leftVal - rv;
    }
    return leftVal;
  }

  const result = parseAdd();
  if (failed || pos !== tokens.length) return null;
  return result;
}

/** Live result for the current expression, or null when incomplete/invalid. */
export function liveResult(s: CalcState): number | null {
  if (isError(s)) return null;
  return evaluate(s.expr);
}

/** Numeric value for hand-off (0 when nothing valid). */
export function result(s: CalcState): number {
  const r = liveResult(s);
  return r != null && isFinite(r) ? r : 0;
}

/** True when the expression contains an actual operation (worth logging to history). */
export function hasOperation(expr: string): boolean {
  return /[+\-×÷%()]/.test(expr);
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const addThousands = (intDigits: string): string =>
  intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Plain result string (no separators) used as the next `expr` after "=". */
export function numberToPlainString(n: number): string {
  if (!isFinite(n)) return ERROR;
  return String(parseFloat(n.toFixed(10))); // strip binary-float noise (0.1+0.2 → 0.3)
}

/** Format a number for display: thousands separators, float-noise trimmed. */
export function formatNumber(n: number): string {
  if (!isFinite(n)) return ERROR;
  const cleaned = parseFloat(n.toFixed(10));
  const neg = cleaned < 0;
  const [ip, dp] = String(Math.abs(cleaned)).split('.');
  return (neg ? '-' : '') + addThousands(ip) + (dp ? '.' + dp : '');
}

export type DisplaySegment = { text: string; kind: 'num' | 'op' | 'paren' | 'pct' };

/** Break a raw expression into styled segments (numbers get separators; operators
 *  are spaced and can be tinted). Used to render the live expression line. */
export function displaySegments(expr: string): DisplaySegment[] {
  const out: DisplaySegment[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      const dotIdx = num.indexOf('.');
      const ip = dotIdx >= 0 ? num.slice(0, dotIdx) : num;
      const rest = dotIdx >= 0 ? num.slice(dotIdx) : '';
      out.push({ text: addThousands(ip) + rest, kind: 'num' });
      continue;
    }
    if (isOpChar(c)) {
      out.push({ text: c === '-' ? '−' : c, kind: 'op' });
    } else if (c === '(' || c === ')') {
      out.push({ text: c, kind: 'paren' });
    } else if (c === '%') {
      out.push({ text: c, kind: 'pct' });
    }
    i++;
  }
  return out;
}

/** Plain one-line rendering of an expression (for history), e.g. "5,553 + 321". */
export function formatExpressionString(expr: string): string {
  return displaySegments(expr)
    .map((s) => (s.kind === 'op' ? ` ${s.text} ` : s.text))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
