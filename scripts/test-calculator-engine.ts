/**
 * Pure-logic tests for the calculator engine. No RN imports, so tsx runs it.
 * Run: npm run test:calcengine
 */
import {
  initialCalc, inputDigit, inputDot, setOp, equals, percent,
  toggleSign, backspace, clearAll, result, didCompute,
} from '../src/utils/calculatorEngine';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { cond ? passed++ : failures.push(name); };

// digits build the display
let s = initialCalc;
s = inputDigit(s, '2');
check('first digit replaces 0', s.display === '2');
s = inputDigit(s, '5'); s = inputDigit(s, '0');
check('digits append', s.display === '250');

// sequential (no precedence): 2 + 3 × 4 = 20
s = initialCalc;
s = inputDigit(s, '2'); s = setOp(s, '+');
s = inputDigit(s, '3'); s = setOp(s, '×');
check('folds pending op on next op', s.display === '5');
s = inputDigit(s, '4'); s = equals(s);
check('sequential eval 2+3×4=20', result(s) === 20);

// division: 1240 ÷ 4 = 310
s = initialCalc;
['1', '2', '4', '0'].forEach((d) => { s = inputDigit(s, d); });
s = setOp(s, '÷'); s = inputDigit(s, '4'); s = equals(s);
check('1240÷4=310', result(s) === 310);
check('expression recorded', s.expression === '1240 ÷ 4');

// decimals rounded to money precision: 0.1 + 0.2 = 0.3
s = initialCalc;
s = inputDigit(s, '0'); s = inputDot(s); s = inputDigit(s, '1');
s = setOp(s, '+');
s = inputDigit(s, '0'); s = inputDot(s); s = inputDigit(s, '2');
s = equals(s);
check('0.1+0.2=0.3 (money-rounded)', result(s) === 0.3);

// percent contextual: 200 + 10 % = 220
s = initialCalc;
['2', '0', '0'].forEach((d) => { s = inputDigit(s, d); });
s = setOp(s, '+'); s = inputDigit(s, '1'); s = inputDigit(s, '0');
s = percent(s);
check('10% of 200 = 20', result(s) === 20);
s = equals(s);
check('200 + 10% = 220', result(s) === 220);

// percent standalone: 50 % = 0.5
s = initialCalc; s = inputDigit(s, '5'); s = inputDigit(s, '0'); s = percent(s);
check('50% standalone = 0.5', result(s) === 0.5);

// sign toggle
s = inputDigit(initialCalc, '5'); s = toggleSign(s);
check('toggle sign 5→-5', s.display === '-5');
s = toggleSign(s);
check('toggle back -5→5', s.display === '5');

// backspace
s = initialCalc; ['1', '2', '3'].forEach((d) => { s = inputDigit(s, d); });
s = backspace(s);
check('backspace 123→12', s.display === '12');

// divide by zero → Error, recovers on digit
s = initialCalc; s = inputDigit(s, '5'); s = setOp(s, '÷');
s = inputDigit(s, '0'); s = equals(s);
check('÷0 → error', s.error === true && s.display === 'Error');
check('÷0 result() === 0', result(s) === 0);
s = inputDigit(s, '7');
check('digit recovers from error', s.error === false && s.display === '7');

// repeated equals: 2 + 3 = = → 8
s = initialCalc; s = inputDigit(s, '2'); s = setOp(s, '+'); s = inputDigit(s, '3');
s = equals(s);
check('2+3=5', result(s) === 5);
s = equals(s);
check('repeat = adds 3 again → 8', result(s) === 8);

// clearAll resets
check('clearAll → 0', clearAll().display === '0');

// didCompute flags real computations
let before = initialCalc; before = inputDigit(before, '2'); before = setOp(before, '+'); before = inputDigit(before, '3');
check('didCompute true when pending op', didCompute(before) === true);
check('didCompute false on bare initial', didCompute(initialCalc) === false);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`calculator-engine OK (${passed} checks)`);
