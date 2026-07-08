import { roundMoney } from './money';

export type CalcOp = '+' | '-' | '×' | '÷';

export interface CalcState {
  display: string;                 // shown value, e.g. "0" / "1240" / "1240.5" / "Error"
  accumulator: number | null;      // running result of the pending op chain
  pendingOp: CalcOp | null;        // operator awaiting its right operand
  overwrite: boolean;              // next digit replaces the display
  lastOp: { op: CalcOp; operand: number } | null; // for repeated "="
  expression: string;              // human trail, e.g. "1240 ÷ 4"
  error: boolean;                  // divide-by-zero
}

export const initialCalc: CalcState = {
  display: '0',
  accumulator: null,
  pendingOp: null,
  overwrite: true,
  lastOp: null,
  expression: '',
  error: false,
};

const MAX_DIGITS = 12;
const digitCount = (s: string): number => s.replace(/[^0-9]/g, '').length;

/** Display formatting: 2-dp money precision, no "-0". */
export const formatCalc = (n: number): string => {
  const r = roundMoney(n);
  return String(Object.is(r, -0) ? 0 : r);
};

const toNum = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const applyOp = (a: number, op: CalcOp, b: number): { value: number; error: boolean } => {
  switch (op) {
    case '+': return { value: roundMoney(a + b), error: false };
    case '-': return { value: roundMoney(a - b), error: false };
    case '×': return { value: roundMoney(a * b), error: false };
    case '÷': return b === 0 ? { value: 0, error: true } : { value: roundMoney(a / b), error: false };
  }
};

const errored = (expression: string): CalcState => ({
  ...initialCalc, display: 'Error', overwrite: true, error: true, expression,
});

export function inputDigit(s: CalcState, d: string): CalcState {
  const base = s.error ? initialCalc : s;
  const cur = base.overwrite || base.display === '0' ? '' : base.display;
  let next = cur + d;
  if (next === '') next = '0';
  if (digitCount(next) > MAX_DIGITS) return base;
  return { ...base, display: next, overwrite: false, error: false };
}

export function inputDot(s: CalcState): CalcState {
  const base = s.error ? initialCalc : s;
  if (base.overwrite) return { ...base, display: '0.', overwrite: false };
  if (base.display.includes('.')) return base;
  return { ...base, display: base.display + '.', overwrite: false };
}

export function setOp(s: CalcState, op: CalcOp): CalcState {
  if (s.error) return s;
  if (s.pendingOp !== null && s.overwrite) {
    // operator pressed right after another operator → swap it
    return { ...s, pendingOp: op, expression: `${formatCalc(s.accumulator ?? 0)} ${op}` };
  }
  let acc: number;
  if (s.pendingOp !== null && s.accumulator !== null) {
    const res = applyOp(s.accumulator, s.pendingOp, toNum(s.display));
    if (res.error) return errored(`${formatCalc(s.accumulator)} ${s.pendingOp} ${formatCalc(toNum(s.display))}`);
    acc = res.value;
  } else {
    acc = toNum(s.display);
  }
  return {
    ...s,
    accumulator: acc,
    display: formatCalc(acc),
    pendingOp: op,
    overwrite: true,
    lastOp: null,
    expression: `${formatCalc(acc)} ${op}`,
    error: false,
  };
}

export function equals(s: CalcState): CalcState {
  if (s.error) return s;
  if (s.pendingOp !== null && s.accumulator !== null) {
    const operand = s.overwrite ? s.accumulator : toNum(s.display);
    const expr = `${formatCalc(s.accumulator)} ${s.pendingOp} ${formatCalc(operand)}`;
    const res = applyOp(s.accumulator, s.pendingOp, operand);
    if (res.error) return errored(expr);
    return {
      ...s,
      display: formatCalc(res.value),
      accumulator: null,
      pendingOp: null,
      overwrite: true,
      lastOp: { op: s.pendingOp, operand },
      expression: expr,
      error: false,
    };
  }
  if (s.lastOp !== null) {
    const cur = toNum(s.display);
    const expr = `${formatCalc(cur)} ${s.lastOp.op} ${formatCalc(s.lastOp.operand)}`;
    const res = applyOp(cur, s.lastOp.op, s.lastOp.operand);
    if (res.error) return errored(expr);
    return { ...s, display: formatCalc(res.value), overwrite: true, expression: expr, error: false };
  }
  return s;
}

export function percent(s: CalcState): CalcState {
  if (s.error) return s;
  const d = toNum(s.display);
  const pct = (s.pendingOp === '+' || s.pendingOp === '-') && s.accumulator !== null
    ? roundMoney((s.accumulator * d) / 100)
    : roundMoney(d / 100);
  return { ...s, display: formatCalc(pct), overwrite: false };
}

export function toggleSign(s: CalcState): CalcState {
  if (s.error || s.display === '0') return s;
  const display = s.display.startsWith('-') ? s.display.slice(1) : '-' + s.display;
  return { ...s, display };
}

export function backspace(s: CalcState): CalcState {
  if (s.error) return { ...initialCalc };
  if (s.overwrite) return s;
  let display = s.display.length > 1 ? s.display.slice(0, -1) : '0';
  if (display === '-' || display === '') display = '0';
  return { ...s, display };
}

export function clearAll(): CalcState {
  return { ...initialCalc };
}

export function result(s: CalcState): number {
  return s.error ? 0 : toNum(s.display);
}

/** True when the state about to receive equals() would produce a real computation. */
export function didCompute(before: CalcState): boolean {
  return (before.pendingOp !== null && before.accumulator !== null) || before.lastOp !== null;
}
