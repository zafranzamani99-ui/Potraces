/**
 * Pure-logic tests for the expression-based calculator engine.
 * No RN imports, so tsx runs it. Run: npm run test:calcengine
 */
import {
  initialCalc, inputDigit, inputDoubleZero, inputDot, inputOp, inputBracket,
  inputPercent, backspace, clearAll, equals, evaluate, result, liveResult,
  isError, hasOperation, formatNumber, numberToPlainString, formatExpressionString,
  insertValue,
} from '../src/utils/calculatorEngine';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { cond ? passed++ : failures.push(name); };

// ── evaluation: precedence + brackets ────────────────────────────────────────
check('precedence 2+3×4 = 14', evaluate('2+3×4') === 14);
check('brackets (2+3)×4 = 20', evaluate('(2+3)×4') === 20);
check('division 1240÷4 = 310', evaluate('1240÷4') === 310);
check('nested ((1+2)×(3+4)) = 21', evaluate('(1+2)×(3+4)') === 21);
check('subtraction 10-3-2 = 5 (left assoc)', evaluate('10-3-2') === 5);
check('div assoc 100÷10÷2 = 5', evaluate('100÷10÷2') === 5);

// ── decimals (float-noise trimmed on display) ────────────────────────────────
check('0.1+0.2 formats to 0.3', formatNumber(evaluate('0.1+0.2')!) === '0.3');
check('leading-dot .5+.5 = 1', evaluate('.5+.5') === 1);

// ── percent (contextual) ─────────────────────────────────────────────────────
check('200+10% = 220', evaluate('200+10%') === 220);
check('200-10% = 180', evaluate('200-10%') === 180);
check('200×10% = 20', evaluate('200×10%') === 20);
check('50% standalone = 0.5', evaluate('50%') === 0.5);

// ── unary minus ──────────────────────────────────────────────────────────────
check('-5+3 = -2', evaluate('-5+3') === -2);
check('3+-2 = 1', evaluate('3+-2') === 1);
check('(-5)×2 = -10', evaluate('(-5)×2') === -10);

// ── incomplete / invalid → null ──────────────────────────────────────────────
check('trailing op → null', evaluate('5+') === null);
check('open paren → null', evaluate('(') === null);
check('lone dot → null', evaluate('.') === null);
check('unbalanced → null', evaluate('5×(2+3') === null);
check('empty → null', evaluate('') === null);

// ── divide by zero → Infinity → "Error" ──────────────────────────────────────
check('÷0 → Infinity', evaluate('5÷0') === Infinity);
check('÷0 formats to Error', formatNumber(evaluate('5÷0')!) === 'Error');

// ── input builders ───────────────────────────────────────────────────────────
let s = initialCalc;
s = inputDigit(s, '5'); s = inputDigit(s, '5'); s = inputDigit(s, '3');
check('digits build expr', s.expr === '553');
s = inputOp(s, '+');
s = inputDigit(s, '3'); s = inputDigit(s, '2'); s = inputDigit(s, '1');
check('expr with op', s.expr === '553+321');
check('live result 874', liveResult(s) === 874);
check('result() 874', result(s) === 874);

// equals → result becomes expr, continue operating
s = equals(s);
check('equals → 874', s.expr === '874' && s.justEvaluated === true);
let s2 = inputDigit(s, '2');
check('digit after = starts fresh', s2.expr === '2');
let s3 = inputOp(s, '+');
check('op after = continues from result', s3.expr === '874+');

// operator replacement
let r = inputOp(inputOp({ expr: '5', justEvaluated: false }, '+'), '×');
check('operator replace 5+ → 5×', r.expr === '5×');

// smart bracket
check('bracket on empty → (', inputBracket(initialCalc).expr === '(');
check('bracket after value → ×(', inputBracket({ expr: '5', justEvaluated: false }).expr === '5×(');
check('bracket closes open group', inputBracket({ expr: '(5+3', justEvaluated: false }).expr === '(5+3)');

// double zero
check('00 after 5 → 500', inputDoubleZero({ expr: '5', justEvaluated: false }).expr === '500');
check('00 on empty → 0', inputDoubleZero(initialCalc).expr === '0');
check('00 after 0 stays 0', inputDoubleZero({ expr: '0', justEvaluated: false }).expr === '0');

// dot guard
check('single dot only', inputDot({ expr: '5.5', justEvaluated: false }).expr === '5.5');
check('dot on empty → 0.', inputDot(initialCalc).expr === '0.');

// percent input guard
check('% after digit ok', inputPercent({ expr: '50', justEvaluated: false }).expr === '50%');
check('% after op ignored', inputPercent({ expr: '5+', justEvaluated: false }).expr === '5+');

// backspace + clear + error recovery
check('backspace 12 → 1', backspace({ expr: '12', justEvaluated: false }).expr === '1');
check('clearAll → empty', clearAll().expr === '');
let err = equals({ expr: '5÷0', justEvaluated: false });
check('÷0 equals → Error state', isError(err) === true);
check('digit recovers from Error', inputDigit(err, '7').expr === '7');

// formatting helpers
check('formatNumber 5874 → 5,874', formatNumber(5874) === '5,874');
check('formatNumber 1234567 → 1,234,567', formatNumber(1234567) === '1,234,567');
check('numberToPlainString has no commas', numberToPlainString(5874) === '5874');
check('formatExpressionString spaces ops', formatExpressionString('5553+321') === '5,553 + 321');
check('hasOperation true for 5+3', hasOperation('5+3') === true);
check('hasOperation false for 553', hasOperation('553') === false);

// insertValue (history tap-to-insert)
check('insert on empty → sets value', insertValue(initialCalc, '874').expr === '874');
check('insert after operator appends', insertValue({ expr: '5+', justEvaluated: false }, '3').expr === '5+3');
check('insert after value → implicit ×', insertValue({ expr: '5', justEvaluated: false }, '3').expr === '5×3');
check('insert after = starts fresh', insertValue({ expr: '8', justEvaluated: true }, '3').expr === '3');
check('insert after ( appends', insertValue({ expr: '(', justEvaluated: false }, '3').expr === '(3');

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`calculator-engine OK (${passed} checks)`);
