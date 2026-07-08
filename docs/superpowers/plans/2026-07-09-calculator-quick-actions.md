# Calculator Quick Action + Split Hand-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the personal dashboard's Budgets quick-action chip with a best-in-class basic Calculator (with persistent history) that can optionally hand a computed amount into the Splits feature via a fast "Quick split" or the existing "Detailed split" form.

**Architecture:** A pure calculator reducer (`calculatorEngine.ts`) drives a thin `Calculator` screen; a persisted `calculatorStore` holds history. A shared `commitSplit` service centralizes the money-critical split→debt/transaction/wallet orchestration (extracted from DebtTracking) so both the existing wizard and the new `QuickSplitSheet` use one code path. A pure `computeEqualShares` helper backs Quick split's equal division. Quick actions are reordered and a `Calculator` route is registered.

**Tech Stack:** React Native / Expo (~54), TypeScript, zustand (+persist over AsyncStorage), react-native-gesture-handler/reanimated (existing BottomSheet), tsx test scripts (no jest).

## Global Constraints

- Currency `RM`, locale `en-MY`; all persisted/derived money runs through `roundMoney` (`src/utils/money.ts`) before storage; display via `formatAmount` (`src/utils/formatters.ts`).
- Follow the neumorphic design system + `useCalm()` tokens (light **and** dark); no new color literals — use `C.*`.
- All interactive elements: `accessibilityLabel` + `lightTap()` (`src/services/haptics.ts`); tap targets ≥44px.
- No new dependencies. Reuse `NeuSurface` (`src/components/common/neu`), `BottomSheet` (`src/components/common/BottomSheet`), existing numpad idiom from `QuickAddExpense`.
- Pure calculator + share math must be `tsx`-testable (no React/native imports in `calculatorEngine.ts` / `splitShares.ts`).
- `npm run typecheck` must stay at 0 errors; introduce no **new** eslint errors (remove imports that become unused).
- Every user-facing string added to BOTH `src/i18n/en.ts` and `src/i18n/ms.ts` (identical key shape).
- Self participant id is the string `'__self__'` (used across the split code).

---

### Task 1: Pure calculator engine

**Files:**
- Create: `src/utils/calculatorEngine.ts`
- Create: `scripts/test-calculator-engine.ts`
- Modify: `package.json` (add `test:calcengine` script)

**Interfaces:**
- Produces: `CalcState`, `initialCalc: CalcState`, and pure transitions `inputDigit(s,d)`, `inputDot(s)`, `setOp(s,op)`, `equals(s)`, `percent(s)`, `toggleSign(s)`, `backspace(s)`, `clearAll()`, plus `result(s): number`, `didCompute(before: CalcState): boolean`, `formatCalc(n: number): string`. `CalcOp = '+' | '-' | '×' | '÷'`.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-calculator-engine.ts`:
```ts
/**
 * Pure-logic tests for the calculator engine. No RN imports, so tsx runs it.
 * Run: npm run test:calcengine
 */
import {
  initialCalc, inputDigit, inputDot, setOp, equals, percent,
  toggleSign, backspace, clearAll, result, didCompute, CalcState,
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
['1','2','4','0'].forEach(d => { s = inputDigit(s, d); });
s = setOp(s, '÷'); s = inputDigit(s, '4'); s = equals(s);
check('1240÷4=310', result(s) === 310);
check('expression recorded', s.expression === '1240 ÷ 4');

// decimals rounded to money precision: 0.1 + 0.2 = 0.3
s = initialCalc;
s = inputDot(inputDigit(s, '0')); s = inputDigit(s, '1'); s = setOp(s, '+');
s = inputDot(inputDigit(initialCalc, '0')); // fresh right operand
let right = inputDigit(inputDot(inputDigit(initialCalc, '0')), '2');
// build 0.1 + 0.2 explicitly
s = initialCalc;
s = inputDigit(s, '0'); s = inputDot(s); s = inputDigit(s, '1');
s = setOp(s, '+');
s = inputDigit(s, '0'); s = inputDot(s); s = inputDigit(s, '2');
s = equals(s);
check('0.1+0.2=0.3 (money-rounded)', result(s) === 0.3);

// percent contextual: 200 + 10 % = 220
s = initialCalc;
['2','0','0'].forEach(d => { s = inputDigit(s, d); });
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
s = initialCalc; ['1','2','3'].forEach(d => { s = inputDigit(s, d); });
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
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"` (after `"test:deleteflow"`):
```json
    "test:calcengine": "tsx scripts/test-calculator-engine.ts"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:calcengine`
Expected: FAIL — cannot find module `../src/utils/calculatorEngine`.

- [ ] **Step 4: Implement the engine**

Create `src/utils/calculatorEngine.ts`:
```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:calcengine`
Expected: PASS — `calculator-engine OK (N checks)`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/utils/calculatorEngine.ts scripts/test-calculator-engine.ts package.json
git commit -m "feat(calculator): pure calculator engine + tests"
```

---

### Task 2: Pure equal-shares helper

**Files:**
- Create: `src/utils/splitShares.ts`
- Create: `scripts/test-split-shares.ts`
- Modify: `package.json` (add `test:splitshares` script)

**Interfaces:**
- Consumes: `Contact`, `SplitParticipant` (type-only, from `../types`).
- Produces: `computeEqualShares(total: number, contacts: Contact[], payerId: string | null): SplitParticipant[]`. Each participant `{ contact, amount, isPaid }`; the payer (or first contact if payer absent) absorbs the rounding remainder; `isPaid` is true only for the exact `payerId`.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-split-shares.ts`:
```ts
/**
 * Pure-logic tests for equal-split shares. No RN imports, so tsx runs it.
 * Run: npm run test:splitshares
 */
import { computeEqualShares } from '../src/utils/splitShares';
import type { Contact } from '../src/types';

const c = (id: string): Contact => ({ id, name: id, isFromPhone: false });
const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { cond ? passed++ : failures.push(name); };
const sum = (ps: { amount: number }[]) => Math.round(ps.reduce((a, p) => a + p.amount, 0) * 100) / 100;

// even 4-way of 100
let r = computeEqualShares(100, [c('me'), c('a'), c('b'), c('d')], 'me');
check('4-way even → 25 each', r.every(p => p.amount === 25));
check('4-way total preserved', sum(r) === 100);
check('payer flagged isPaid', r.find(p => p.contact.id === 'me')!.isPaid === true);
check('non-payer not isPaid', r.find(p => p.contact.id === 'a')!.isPaid === false);

// 3-way of 100 → remainder to payer
r = computeEqualShares(100, [c('me'), c('a'), c('b')], 'me');
check('3-way total preserved', sum(r) === 100);
check('payer absorbs remainder (33.34)', r.find(p => p.contact.id === 'me')!.amount === 33.34);
check('others get 33.33', r.filter(p => p.contact.id !== 'me').every(p => p.amount === 33.33));

// single participant
r = computeEqualShares(50, [c('me')], 'me');
check('single participant gets all', r.length === 1 && r[0].amount === 50 && r[0].isPaid === true);

// payer not in contacts → remainder to first, nobody isPaid
r = computeEqualShares(90, [c('a'), c('b'), c('d')], 'ghost');
check('payer absent → total preserved', sum(r) === 90);
check('payer absent → none isPaid', r.every(p => p.isPaid === false));

// null payer → remainder to first contact, none isPaid
r = computeEqualShares(10, [c('a'), c('b'), c('d')], null);
check('null payer → total preserved', sum(r) === 10);
check('null payer → none isPaid', r.every(p => p.isPaid === false));

// empty contacts → empty
check('empty contacts → []', computeEqualShares(100, [], 'me').length === 0);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`split-shares OK (${passed} checks)`);
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, after `"test:calcengine"`:
```json
    "test:splitshares": "tsx scripts/test-split-shares.ts"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:splitshares`
Expected: FAIL — cannot find module `../src/utils/splitShares`.

- [ ] **Step 4: Implement the helper**

Create `src/utils/splitShares.ts`:
```ts
import type { Contact, SplitParticipant } from '../types';

/**
 * Split `total` equally across `contacts`. Mirrors the exact per-person math used
 * by the DebtTracking wizard's `equal` branch: floor to the sen, then hand the
 * leftover remainder to the payer (or the first contact when the payer is not in
 * the list). `isPaid` is true only for the exact `payerId`.
 */
export function computeEqualShares(
  total: number,
  contacts: Contact[],
  payerId: string | null,
): SplitParticipant[] {
  const count = contacts.length;
  if (count === 0) return [];
  const perPerson = Math.floor((total / count) * 100) / 100;
  const remainder = Math.round((total - perPerson * count) * 100) / 100;
  const remainderTargetId =
    payerId && contacts.some((c) => c.id === payerId) ? payerId : contacts[0].id;
  return contacts.map((c) => ({
    contact: c,
    amount: Math.round((perPerson + (c.id === remainderTargetId ? remainder : 0)) * 100) / 100,
    isPaid: payerId != null && c.id === payerId,
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:splitshares`
Expected: PASS — `split-shares OK (N checks)`.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` (expect 0 errors), then:
```bash
git add src/utils/splitShares.ts scripts/test-split-shares.ts package.json
git commit -m "feat(split): pure equal-shares helper + tests"
```

---

### Task 3: Calculator history store

**Files:**
- Create: `src/store/calculatorStore.ts`

**Interfaces:**
- Consumes: `newId` (`src/utils/id.ts`).
- Produces: `useCalculatorStore` with `history: CalcHistoryEntry[]`, `addEntry(expression: string, result: number): void`, `clearHistory(): void`, `removeEntry(id: string): void`. `CalcHistoryEntry = { id: string; expression: string; result: number; at: string }`. History is newest-first, capped at 50.

- [ ] **Step 1: Implement the store**

Create `src/store/calculatorStore.ts` (mirrors the persist pattern in `src/store/debtStore.ts`):
```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { newId } from '../utils/id';

export interface CalcHistoryEntry {
  id: string;
  expression: string;
  result: number;
  at: string; // ISO timestamp
}

interface CalculatorState {
  history: CalcHistoryEntry[];
  addEntry: (expression: string, result: number) => void;
  clearHistory: () => void;
  removeEntry: (id: string) => void;
}

const MAX_HISTORY = 50;

export const useCalculatorStore = create<CalculatorState>()(
  persist(
    (set) => ({
      history: [],
      addEntry: (expression, result) =>
        set((state) => ({
          history: [
            { id: newId(), expression, result, at: new Date().toISOString() },
            ...state.history,
          ].slice(0, MAX_HISTORY),
        })),
      clearHistory: () => set({ history: [] }),
      removeEntry: (id) =>
        set((state) => ({ history: state.history.filter((h) => h.id !== id) })),
    }),
    {
      name: 'calculator-history',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/store/calculatorStore.ts
git commit -m "feat(calculator): persisted history store"
```

---

### Task 4: Shared split-commit service (extract from DebtTracking)

**Files:**
- Create: `src/services/splitCommit.ts`
- Modify: `src/screens/shared/DebtTracking.tsx` (replace the inline split-save orchestration block with a `commitSplit(...)` call)

**Interfaces:**
- Consumes: `useDebtStore` (`addSplit`, `updateSplit`, `addDebt`), `usePersonalStore.addTransaction`, `useBusinessStore.addBusinessTransaction`, `useWalletStore` (`wallets`, `deductFromWallet`, `useCredit`); types `AppMode`, `Contact`, `SplitItem`, `SplitMethod`, `SplitParticipant`.
- Produces: `commitSplit(input: CommitSplitInput): string` (returns the new `splitId`). `CommitSplitInput = { description, totalAmount, splitMethod, participants, items, paidBy?, walletId?, dueDate?, mode }`.

> **Note (behavior-preserving refactor):** This extracts the money orchestration ONLY. Leave DebtTracking's participant-computation code (the `splitMethod` branches and the `isPaid` marking) exactly as-is — do not swap its inline equal math for `computeEqualShares` in this task (that stays as a documented duplicate; `computeEqualShares` is used by Quick split in Task 5). The extracted block must behave identically to today.

- [ ] **Step 1: Create the service**

Create `src/services/splitCommit.ts`:
```ts
import { useDebtStore } from '../store/debtStore';
import { usePersonalStore } from '../store/personalStore';
import { useBusinessStore } from '../store/businessStore';
import { useWalletStore } from '../store/walletStore';
import type { AppMode, Contact, SplitItem, SplitMethod, SplitParticipant } from '../types';

const SELF_ID = '__self__';

export interface CommitSplitInput {
  description: string;
  totalAmount: number;
  splitMethod: SplitMethod;
  participants: SplitParticipant[]; // amounts PRE-COMPUTED by the caller
  items: SplitItem[];               // [] unless item_based
  paidBy?: Contact;                 // undefined => draft (no debts/tx)
  walletId?: string;                // only meaningful when self is the payer
  dueDate?: Date;
  mode: AppMode;
}

/**
 * Persist a split and its financial side effects — the single money path shared
 * by the DebtTracking wizard and the Calculator's Quick Split. Behaviour mirrors
 * the original inline block in DebtTracking exactly:
 *  - I paid  → expense transaction + wallet deduction + one `they_owe` debt per other participant.
 *  - They paid → one `i_owe` debt for my share.
 *  - No payer → draft split only.
 */
export function commitSplit(input: CommitSplitInput): string {
  const { description, totalAmount, splitMethod, participants, items, paidBy, walletId, dueDate, mode } = input;

  const { addSplit, updateSplit, addDebt } = useDebtStore.getState();

  const splitId = addSplit({
    description,
    totalAmount,
    splitMethod,
    participants,
    items,
    paidBy,
    dueDate: dueDate ? dueDate.toISOString() : undefined,
    mode,
  } as any);

  const payer = paidBy ?? null;

  if (payer?.id === SELF_ID) {
    let txId: string | undefined;
    if (mode === 'personal') {
      txId = usePersonalStore.getState().addTransaction({
        amount: totalAmount,
        category: 'split_expense',
        description,
        date: new Date(),
        type: 'expense',
        mode,
        walletId: walletId || undefined,
        inputMethod: 'manual',
      } as any);
    } else {
      txId = useBusinessStore.getState().addBusinessTransaction({
        date: new Date(),
        amount: totalAmount,
        type: 'cost',
        category: 'split_expense',
        note: description,
        inputMethod: 'manual',
      } as any);
    }

    if (txId || walletId) {
      updateSplit(splitId, { linkedTransactionId: txId, walletId: walletId || undefined });
    }

    if (walletId) {
      const wallet = useWalletStore.getState().wallets.find((w) => w.id === walletId);
      if (wallet?.type === 'credit') {
        useWalletStore.getState().useCredit(walletId, totalAmount);
      } else {
        useWalletStore.getState().deductFromWallet(walletId, totalAmount);
      }
    }

    participants
      .filter((p) => p.contact.id !== SELF_ID && p.amount > 0)
      .forEach((p) => {
        addDebt({
          contact: p.contact,
          type: 'they_owe',
          totalAmount: p.amount,
          description,
          splitId,
          mode,
          dueDate: dueDate || undefined,
        } as any);
      });
  } else if (payer && payer.id !== SELF_ID) {
    const mine = participants.find((p) => p.contact.id === SELF_ID);
    if (mine && mine.amount > 0) {
      addDebt({
        contact: payer,
        type: 'i_owe',
        totalAmount: mine.amount,
        description,
        splitId,
        mode,
        dueDate: dueDate || undefined,
      } as any);
    }
  }

  return splitId;
}
```

- [ ] **Step 2: Locate the inline orchestration block in DebtTracking**

Open `src/screens/shared/DebtTracking.tsx`. Find the split-save block that begins with `const splitId = addSplit({` and ends just before `showToast('Split created!', 'success');` (≈ lines 2272–2352). Read the entire block and confirm it matches the logic reproduced in `commitSplit` (addSplit → self-paid branch with transaction/wallet/they_owe debts → else-paid i_owe branch). Note the exact local variable names it uses for: total (`total`), method (`splitMethod`), participants (`participants`), payer (`splitPaidBy[0]`), wallet (`splitWalletId`), due date (`splitDueDateObj`), description (`splitDescription.trim()`), and `mode`.

- [ ] **Step 3: Replace the block with a commitSplit call**

Replace everything from `const splitId = addSplit({` through the line immediately BEFORE `showToast('Split created!', 'success');` with:
```ts
      const splitId = commitSplit({
        description: splitDescription.trim(),
        totalAmount: total,
        splitMethod,
        participants,
        items: splitMethod === 'item_based' ? splitItems : [],
        paidBy: splitPaidBy.length > 0 ? splitPaidBy[0] : undefined,
        walletId: splitWalletId || undefined,
        dueDate: splitDueDateObj || undefined,
        mode,
      });
```
Keep the following `showToast('Split created!', 'success');` and any code after it (navigation/reset) unchanged. `splitId` remains in scope for any later use (e.g. logging); if `splitId` becomes unused after removal, prefix it `void splitId;` is NOT needed — leave the assignment (it documents intent) unless eslint flags it, in which case drop `const splitId = ` and call `commitSplit({...});` directly.

- [ ] **Step 4: Add the import + remove now-unused store actions**

At the top of `DebtTracking.tsx`, add:
```ts
import { commitSplit } from '../../services/splitCommit';
```
Then run typecheck/lint (next step). If any store actions previously destructured for the removed block (e.g. `addSplit`, `updateSplit`, `addTransaction`, `addBusinessTransaction`, `deductFromWallet`, `useCredit`) are now unused ELSEWHERE in the file, remove them from their `useX((s) => s.action)` selectors / destructures to avoid new eslint `no-unused-vars` errors. Do NOT remove any still used elsewhere (e.g. `addDebt` is likely used by the debt tab).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Verify no regression via existing pure test + read-through**

Run: `npm run test:splitshares` (expect PASS). Re-read the replaced region and the `commitSplit` body side by side; confirm the self-paid/others-paid/draft branches and the wallet credit-vs-deduct choice match the original exactly.

- [ ] **Step 7: Commit**

```bash
git add src/services/splitCommit.ts src/screens/shared/DebtTracking.tsx
git commit -m "refactor(split): extract shared commitSplit money path from DebtTracking"
```

---

### Task 5: Quick-split sheet

**Files:**
- Create: `src/components/split/QuickSplitSheet.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/ms.ts` (add `quickSplit` namespace)

**Interfaces:**
- Consumes: `commitSplit` (Task 4), `computeEqualShares` (Task 2), `BottomSheet`, `NeuSurface`, `useCalm`, `lightTap`, `formatAmount`, `newId`, `useWalletStore`, `useAppStore`, `useT`.
- Produces: `QuickSplitSheet` (default export) — props `{ visible: boolean; total: number; onClose: () => void; onCreated?: (splitId: string) => void }`.

- [ ] **Step 1: Add i18n strings**

In `src/i18n/en.ts`, add a sibling namespace (place near other feature namespaces):
```ts
  quickSplit: {
    title: 'Quick split',
    total: 'Total',
    description: 'What for? (optional)',
    whosIn: "Who's in",
    me: 'Me',
    addPerson: 'Add person',
    person: 'Person', // used as "Person 1", "Person 2"
    recent: 'Recent',
    whoPaid: 'Who paid?',
    wallet: 'Pay from (optional)',
    noWallet: 'No wallet',
    eachPays: 'Each pays',
    save: 'Save split',
    needTwo: 'Add at least one other person',
    created: 'Split created',
  },
```
In `src/i18n/ms.ts`, add the same keys with Malay values:
```ts
  quickSplit: {
    title: 'Split pantas',
    total: 'Jumlah',
    description: 'Untuk apa? (pilihan)',
    whosIn: 'Siapa terlibat',
    me: 'Saya',
    addPerson: 'Tambah orang',
    person: 'Orang',
    recent: 'Terkini',
    whoPaid: 'Siapa bayar?',
    wallet: 'Bayar dari (pilihan)',
    noWallet: 'Tiada dompet',
    eachPays: 'Setiap orang bayar',
    save: 'Simpan split',
    needTwo: 'Tambah sekurang-kurangnya seorang lagi',
    created: 'Split dicipta',
  },
```

- [ ] **Step 2: Implement the sheet**

Create `src/components/split/QuickSplitSheet.tsx`:
```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../common/BottomSheet';
import { NeuSurface } from '../common/neu';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { formatAmount } from '../../utils/formatters';
import { newId } from '../../utils/id';
import { roundMoney } from '../../utils/money';
import { computeEqualShares } from '../../utils/splitShares';
import { commitSplit } from '../../services/splitCommit';
import { useWalletStore } from '../../store/walletStore';
import { useAppStore } from '../../store/appStore';
import type { CALM } from '../../constants';
import type { Contact } from '../../types';

interface Props {
  visible: boolean;
  total: number;
  onClose: () => void;
  onCreated?: (splitId: string) => void;
}

const SELF_ID = '__self__';

const QuickSplitSheet: React.FC<Props> = ({ visible, total, onClose, onCreated }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const wallets = useWalletStore((s) => s.wallets);

  const self: Contact = { id: SELF_ID, name: t.quickSplit.me, isFromPhone: false };
  const [others, setOthers] = useState<Contact[]>([]);
  const [payerId, setPayerId] = useState<string>(SELF_ID);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const contacts = useMemo(() => [self, ...others], [self, others]);
  const shares = useMemo(
    () => computeEqualShares(roundMoney(total), contacts, payerId),
    [total, contacts, payerId]
  );
  const each = shares.length ? shares[0].amount : 0;
  const canSave = total > 0 && others.length >= 1;

  const addPerson = () => {
    lightTap();
    setOthers((prev) => [
      ...prev,
      { id: newId(), name: `${t.quickSplit.person} ${prev.length + 1}`, isFromPhone: false },
    ]);
  };
  const renamePerson = (id: string, name: string) =>
    setOthers((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  const removePerson = (id: string) => {
    setOthers((prev) => prev.filter((c) => c.id !== id));
    if (payerId === id) setPayerId(SELF_ID);
  };

  const save = () => {
    if (!canSave) return;
    lightTap();
    const payer = contacts.find((c) => c.id === payerId) ?? self;
    const participants = computeEqualShares(roundMoney(total), contacts, payer.id);
    const splitId = commitSplit({
      description: description.trim() || t.quickSplit.title,
      totalAmount: roundMoney(total),
      splitMethod: 'equal',
      participants,
      items: [],
      paidBy: payer,
      walletId: payer.id === SELF_ID ? walletId || undefined : undefined,
      mode: useAppStore.getState().mode,
    });
    onCreated?.(splitId);
    // reset for next time
    setOthers([]); setPayerId(SELF_ID); setWalletId(null); setDescription('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} header={<Text style={styles.title}>{t.quickSplit.title}</Text>}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Total */}
        <Text style={styles.label}>{t.quickSplit.total}</Text>
        <Text style={styles.total}>{formatAmount(roundMoney(total))}</Text>

        {/* Description */}
        <Text style={styles.label}>{t.quickSplit.description}</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder={t.quickSplit.title}
          placeholderTextColor={C.textMuted}
        />

        {/* Who's in */}
        <Text style={styles.label}>{t.quickSplit.whosIn}</Text>
        <View style={styles.chipsWrap}>
          <View style={styles.meChip}><Text style={styles.meChipText}>{t.quickSplit.me}</Text></View>
          {others.map((p) => (
            <View key={p.id} style={styles.personChip}>
              <TextInput
                style={styles.personInput}
                value={p.name}
                onChangeText={(v) => renamePerson(p.id, v)}
              />
              <Pressable onPress={() => removePerson(p.id)} accessibilityLabel={`remove ${p.name}`} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={C.textMuted} />
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.addChip} onPress={addPerson} accessibilityLabel={t.quickSplit.addPerson}>
            <Ionicons name="add" size={18} color={C.accent} />
            <Text style={styles.addChipText}>{t.quickSplit.addPerson}</Text>
          </Pressable>
        </View>

        {/* Who paid */}
        <Text style={styles.label}>{t.quickSplit.whoPaid}</Text>
        <View style={styles.chipsWrap}>
          {contacts.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => { lightTap(); setPayerId(c.id); }}
              accessibilityLabel={`${t.quickSplit.whoPaid} ${c.name}`}
            >
              <NeuSurface pressed={payerId === c.id} style={styles.payerChip}>
                <Text style={[styles.payerText, payerId === c.id && { color: C.accent }]}>{c.name}</Text>
              </NeuSurface>
            </Pressable>
          ))}
        </View>

        {/* Wallet (only when I paid) */}
        {payerId === SELF_ID && wallets.length > 0 && (
          <>
            <Text style={styles.label}>{t.quickSplit.wallet}</Text>
            <View style={styles.chipsWrap}>
              <Pressable onPress={() => { lightTap(); setWalletId(null); }}>
                <NeuSurface pressed={walletId === null} style={styles.payerChip}>
                  <Text style={styles.payerText}>{t.quickSplit.noWallet}</Text>
                </NeuSurface>
              </Pressable>
              {wallets.map((w) => (
                <Pressable key={w.id} onPress={() => { lightTap(); setWalletId(w.id); }}>
                  <NeuSurface pressed={walletId === w.id} style={styles.payerChip}>
                    <Text style={[styles.payerText, walletId === w.id && { color: C.accent }]}>{w.name}</Text>
                  </NeuSurface>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Preview + Save */}
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>{t.quickSplit.eachPays}</Text>
          <Text style={styles.previewValue}>{formatAmount(each)}</Text>
        </View>
        <Pressable
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!canSave}
          accessibilityLabel={t.quickSplit.save}
        >
          <Text style={styles.saveText}>{canSave ? t.quickSplit.save : t.quickSplit.needTwo}</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600', color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  body: { padding: 20, gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: C.textMuted, marginTop: 12 },
  total: { fontSize: 34, fontWeight: '200', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  input: {
    borderWidth: 1, borderColor: C.inputBorder, borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 10, color: C.textPrimary, fontSize: 15,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  meChip: { backgroundColor: C.accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  meChipText: { color: C.onAccent, fontWeight: '600', fontSize: 13 },
  personChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.pillBg,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  personInput: { color: C.textPrimary, fontSize: 13, minWidth: 60, paddingVertical: 2 },
  addChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.accent,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  addChipText: { color: C.accent, fontWeight: '600', fontSize: 13 },
  payerChip: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  payerText: { color: C.textPrimary, fontSize: 13, fontWeight: '500' },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  previewLabel: { fontSize: 14, color: C.textSecondary },
  previewValue: { fontSize: 20, fontWeight: '600', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  saveBtn: {
    marginTop: 16, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: C.onAccent, fontWeight: '700', fontSize: 15 },
});

export default QuickSplitSheet;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (If `BottomSheet`/`NeuSurface` are named vs default exports differ from these imports, fix the import to match the file — check `src/components/common/BottomSheet.tsx` and `src/components/common/neu.tsx` export style.)

- [ ] **Step 4: Commit**

```bash
git add src/components/split/QuickSplitSheet.tsx src/i18n/en.ts src/i18n/ms.ts
git commit -m "feat(split): quick-split bottom sheet"
```

---

### Task 6: Calculator screen

**Files:**
- Create: `src/screens/personal/Calculator.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/ms.ts` (add `calc` namespace)

**Interfaces:**
- Consumes: calculator engine (Task 1), `useCalculatorStore` (Task 3), `QuickSplitSheet` (Task 5), `BottomSheet`, `NeuSurface`, `useCalm`, `lightTap`, `formatAmount`, `useT`, `useNavigation`.
- Produces: `Calculator` screen (default export) — registered as route `Calculator` in Task 8.

- [ ] **Step 1: Add i18n strings**

In `src/i18n/en.ts` add:
```ts
  calc: {
    history: 'History',
    clearHistory: 'Clear history',
    noHistory: 'No calculations yet',
    useInSplit: 'Use in a split',
    quickSplit: 'Quick split',
    detailedSplit: 'Detailed split',
  },
```
And add `calculator: 'Calculator'` inside the existing `dashboard: { ... }` object.

In `src/i18n/ms.ts` add:
```ts
  calc: {
    history: 'Sejarah',
    clearHistory: 'Padam sejarah',
    noHistory: 'Tiada pengiraan lagi',
    useInSplit: 'Guna dalam split',
    quickSplit: 'Split pantas',
    detailedSplit: 'Split terperinci',
  },
```
And add `calculator: 'Kalkulator'` inside the existing `dashboard: { ... }` object.

- [ ] **Step 2: Implement the screen**

Create `src/screens/personal/Calculator.tsx`:
```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { NeuSurface } from '../../components/common/neu';
import BottomSheet from '../../components/common/BottomSheet';
import QuickSplitSheet from '../../components/split/QuickSplitSheet';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { formatAmount } from '../../utils/formatters';
import { useCalculatorStore } from '../../store/calculatorStore';
import {
  initialCalc, inputDigit, inputDot, setOp, equals, percent, toggleSign,
  backspace, clearAll, result, didCompute, formatCalc, CalcState, CalcOp,
} from '../../utils/calculatorEngine';
import type { CALM } from '../../constants';

type Key =
  | { t: 'digit'; v: string } | { t: 'dot' } | { t: 'op'; v: CalcOp }
  | { t: 'eq' } | { t: 'ac' } | { t: 'back' } | { t: 'pct' } | { t: 'sign' };

const KEYS: Key[][] = [
  [{ t: 'ac' }, { t: 'sign' }, { t: 'pct' }, { t: 'op', v: '÷' }],
  [{ t: 'digit', v: '7' }, { t: 'digit', v: '8' }, { t: 'digit', v: '9' }, { t: 'op', v: '×' }],
  [{ t: 'digit', v: '4' }, { t: 'digit', v: '5' }, { t: 'digit', v: '6' }, { t: 'op', v: '-' }],
  [{ t: 'digit', v: '1' }, { t: 'digit', v: '2' }, { t: 'digit', v: '3' }, { t: 'op', v: '+' }],
  [{ t: 'digit', v: '0' }, { t: 'dot' }, { t: 'back' }, { t: 'eq' }],
];

const Calculator: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const history = useCalculatorStore((s) => s.history);
  const addEntry = useCalculatorStore((s) => s.addEntry);
  const clearHistory = useCalculatorStore((s) => s.clearHistory);

  const [state, setState] = useState<CalcState>(initialCalc);
  const [showHistory, setShowHistory] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [showQuick, setShowQuick] = useState(false);

  const value = result(state);
  const canSplit = !state.error && value > 0;

  const press = (k: Key) => {
    lightTap();
    // Equals is handled outside the functional updater: it has a side effect
    // (addEntry) and must not run inside setState (StrictMode double-invokes
    // updaters, which would log history twice). Reading `state` from the closure
    // is safe here — key presses are discrete committed events.
    if (k.t === 'eq') {
      const next = equals(state);
      if (didCompute(state) && !next.error) addEntry(next.expression, result(next));
      setState(next);
      return;
    }
    setState((s) => {
      switch (k.t) {
        case 'digit': return inputDigit(s, k.v);
        case 'dot': return inputDot(s);
        case 'op': return setOp(s, k.v);
        case 'pct': return percent(s);
        case 'sign': return toggleSign(s);
        case 'back': return backspace(s);
        case 'ac': return clearAll();
        default: return s;
      }
    });
  };

  const label = (k: Key): string => {
    switch (k.t) {
      case 'digit': return k.v;
      case 'dot': return '.';
      case 'op': return k.v;
      case 'eq': return '=';
      case 'ac': return 'AC';
      case 'pct': return '%';
      case 'sign': return '±';
      case 'back': return '⌫';
    }
  };

  const isAccent = (k: Key) => k.t === 'op' || k.t === 'eq';

  return (
    <View style={styles.root}>
      {/* Display */}
      <View style={styles.displayWrap}>
        <Pressable style={styles.historyBtn} onPress={() => { lightTap(); setShowHistory(true); }} accessibilityLabel={t.calc.history}>
          <Ionicons name="time-outline" size={22} color={C.textMuted} />
        </Pressable>
        <Text style={styles.expression} numberOfLines={1}>{state.expression}</Text>
        <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="text">
          {state.display}
        </Text>
      </View>

      {/* Keypad */}
      <View style={styles.pad}>
        {KEYS.map((row, i) => (
          <View key={i} style={styles.padRow}>
            {row.map((k, j) => (
              <Pressable key={j} onPress={() => press(k)} style={styles.keyWrap} accessibilityLabel={label(k)}>
                <NeuSurface style={styles.key}>
                  <Text style={[styles.keyText, isAccent(k) && { color: C.accent }]}>{label(k)}</Text>
                </NeuSurface>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {/* Use in a split */}
      <Pressable
        style={[styles.splitBtn, !canSplit && styles.splitBtnDisabled]}
        disabled={!canSplit}
        onPress={() => { lightTap(); setShowChooser(true); }}
        accessibilityLabel={t.calc.useInSplit}
      >
        <Ionicons name="people-outline" size={18} color={C.onAccent} />
        <Text style={styles.splitText}>{t.calc.useInSplit}</Text>
      </Pressable>

      {/* History sheet */}
      <BottomSheet visible={showHistory} onClose={() => setShowHistory(false)} header={<Text style={styles.sheetTitle}>{t.calc.history}</Text>}>
        <ScrollView contentContainerStyle={styles.historyBody}>
          {history.length === 0 ? (
            <Text style={styles.empty}>{t.calc.noHistory}</Text>
          ) : (
            history.map((h) => (
              <Pressable
                key={h.id}
                style={styles.historyRow}
                onPress={() => { lightTap(); setState({ ...initialCalc, display: formatCalc(h.result), overwrite: true }); setShowHistory(false); }}
              >
                <Text style={styles.historyExpr} numberOfLines={1}>{h.expression}</Text>
                <Text style={styles.historyResult}>{formatAmount(h.result)}</Text>
              </Pressable>
            ))
          )}
          {history.length > 0 && (
            <Pressable style={styles.clearBtn} onPress={() => { lightTap(); clearHistory(); }}>
              <Text style={styles.clearText}>{t.calc.clearHistory}</Text>
            </Pressable>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Split chooser */}
      <BottomSheet visible={showChooser} onClose={() => setShowChooser(false)} header={<Text style={styles.sheetTitle}>{t.calc.useInSplit}</Text>}>
        <View style={styles.chooserBody}>
          <Pressable
            style={styles.chooserBtn}
            onPress={() => { lightTap(); setShowChooser(false); setShowQuick(true); }}
          >
            <Ionicons name="flash-outline" size={20} color={C.accent} />
            <Text style={styles.chooserText}>{t.calc.quickSplit}</Text>
          </Pressable>
          <Pressable
            style={styles.chooserBtn}
            onPress={() => {
              lightTap(); setShowChooser(false);
              navigation.navigate('DebtTracking', { prefillSplitAmount: value });
            }}
          >
            <Ionicons name="list-outline" size={20} color={C.textSecondary} />
            <Text style={styles.chooserText}>{t.calc.detailedSplit}</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Quick split */}
      <QuickSplitSheet visible={showQuick} total={value} onClose={() => setShowQuick(false)} />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background, paddingHorizontal: 16, paddingBottom: 24 },
  displayWrap: { flex: 1, justifyContent: 'flex-end', paddingVertical: 24 },
  historyBtn: { position: 'absolute', top: 12, right: 4, padding: 8 },
  expression: { fontSize: 16, color: C.textMuted, textAlign: 'right', fontVariant: ['tabular-nums'] },
  display: { fontSize: 56, fontWeight: '200', color: C.textPrimary, textAlign: 'right', fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
  pad: { gap: 10 },
  padRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  keyWrap: { flex: 1, aspectRatio: 1.15 },
  key: { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontWeight: '400', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  splitBtn: {
    marginTop: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15,
  },
  splitBtnDisabled: { opacity: 0.4 },
  splitText: { color: C.onAccent, fontWeight: '700', fontSize: 15 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  historyBody: { padding: 16, gap: 4 },
  empty: { textAlign: 'center', color: C.textMuted, paddingVertical: 30 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  historyExpr: { color: C.textSecondary, fontSize: 14, flex: 1, fontVariant: ['tabular-nums'] },
  historyResult: { color: C.textPrimary, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clearBtn: { alignItems: 'center', paddingVertical: 16 },
  clearText: { color: C.textMuted, fontSize: 14 },
  chooserBody: { padding: 16, gap: 12 },
  chooserBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: C.pillBg },
  chooserText: { fontSize: 16, fontWeight: '500', color: C.textPrimary },
});

export default Calculator;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (Confirm `NeuSurface` accepts `style` and optional `pressed`; confirm `BottomSheet` default export + `visible/onClose/header/children` props by opening the files.)

- [ ] **Step 4: Commit**

```bash
git add src/screens/personal/Calculator.tsx src/i18n/en.ts src/i18n/ms.ts
git commit -m "feat(calculator): calculator screen with history + split hand-off"
```

---

### Task 7: Detailed-split hand-off param in DebtTracking

**Files:**
- Modify: `src/screens/shared/DebtTracking.tsx` (extend params type + add a `useEffect` that opens the split form pre-filled)

**Interfaces:**
- Consumes: route param `prefillSplitAmount?: number` (sent by the Calculator screen in Task 6).
- Produces: on receiving `prefillSplitAmount`, switches to the splits tab and opens the manual split form with the amount pre-filled and method `equal`.

- [ ] **Step 1: Extend the params type**

In `DebtTracking.tsx`, find `type DebtTrackingParams = { DebtTracking: { receiptData?: {...}; highlightId?: string } | undefined; };` (≈ line 144). Add `prefillSplitAmount?: number` to the object:
```ts
type DebtTrackingParams = {
  DebtTracking: {
    receiptData?: { vendor: string; total: number; items: { name: string; amount: number }[] };
    highlightId?: string;
    prefillSplitAmount?: number;
  } | undefined;
};
```

- [ ] **Step 2: Add the prefill effect**

Near the existing `useEffect` that reads `route.params?.receiptData` (≈ line 1030), add a sibling effect. It mirrors that pattern (open the split form modal), using the state setters already present in the file (`setActiveTab`, `setSplitAmount`, `setSplitMethod`, `setSplitModalVisible`):
```ts
useEffect(() => {
  const amt = route.params?.prefillSplitAmount;
  if (amt != null && amt > 0) {
    setActiveTab('splits');
    setSplitAmount(amt.toFixed(2));
    setSplitMethod('equal');
    setSplitModalVisible(true);
  }
}, [route.params?.prefillSplitAmount]);
```
(If any of these setter names differ, match the exact names used by the `receiptData` effect — that effect already calls `setActiveTab`, `setSplitAmount`, `setSplitMethod`, `setSplitModalVisible`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/shared/DebtTracking.tsx
git commit -m "feat(split): accept prefillSplitAmount to open split form from Calculator"
```

---

### Task 8: Wire Calculator into quick actions + navigation

**Files:**
- Modify: `src/components/common/QuickActions.tsx` (reorder array)
- Modify: `src/navigation/RootNavigator.tsx` (register `Calculator` route)
- Modify: `src/screens/personal/Dashboard.tsx` (whitelist `Calculator` in `handleQuickAction`)

**Interfaces:**
- Consumes: `Calculator` screen (Task 6), `dashboard.calculator` label (added in Task 6).
- Produces: a tappable Calculator chip (row 2, first position) that navigates to the `Calculator` route.

- [ ] **Step 1: Reorder the quick-actions array**

In `src/components/common/QuickActions.tsx`, replace the `getQuickActions` array (lines 25–36) so `budgets` is removed, `reports` moves to the end of row 1, and `calculator` is the first item of row 2:
```ts
const getQuickActions = (C: typeof CALM) => [
  { key: 'wallets' as const, icon: 'i/wallet', screen: 'WalletManagement', color: C.accent },
  { key: 'savings' as const, icon: 'm/piggy-bank', screen: 'SavingsTracker', color: C.gold },
  { key: 'debts' as const, icon: 'm/hand-coin', screen: 'DebtTracking', color: C.bronze },
  { key: 'bills' as const, icon: 'i/repeat', screen: 'SubscriptionList', color: C.accent },
  { key: 'reports' as const, icon: 'i/stats-chart', screen: 'PersonalReports', color: C.deepOlive },
  { key: 'calculator' as const, icon: 'i/calculator', screen: 'Calculator', color: C.accent },
  { key: 'goals' as const, icon: 'm/target', screen: 'Goals', color: C.gold },
  { key: 'receipts' as const, icon: 'i/receipt', screen: 'ReceiptHistory', color: C.deepOlive },
  { key: 'chat' as const, icon: 'i/flash', screen: 'MoneyChat', color: C.gold },
  { key: 'pulse' as const, icon: 'i/pulse', screen: 'FinancialPulse', color: C.accent },
];
```
(The label renders via `t.dashboard[action.key]`, so `t.dashboard.calculator` — added in Task 6 — is required. `i/calculator` is the Ionicons `calculator` glyph.)

- [ ] **Step 2: Register the Calculator route**

In `src/navigation/RootNavigator.tsx`: add the import near the other personal screen imports:
```ts
import Calculator from '../screens/personal/Calculator';
```
Add a `Stack.Screen` next to the other personal stack screens (e.g. right after the `PersonalReports` screen), matching the existing header pattern:
```tsx
<Stack.Screen
  name="Calculator"
  component={Calculator}
  options={makeBackHeader(C, mode, 'Calculator')}
/>
```

- [ ] **Step 3: Whitelist Calculator in the dashboard handler**

In `src/screens/personal/Dashboard.tsx`, find `handleQuickAction` (the `useCallback` whose condition lists `screen === 'PersonalReports' || screen === 'SubscriptionList' || ...`). Add `|| screen === 'Calculator'` to that disjunction so it routes through `navigation.getParent()?.navigate(screen)`:
```ts
const handleQuickAction = useCallback((screen: string) => {
  if (screen === 'PersonalReports' || screen === 'SubscriptionList' || screen === 'DebtTracking' || screen === 'WalletManagement' || screen === 'SavingsTracker' || screen === 'MoneyChat' || screen === 'Goals' || screen === 'FinancialPulse' || screen === 'ReceiptHistory' || screen === 'Calculator') {
    navigation.getParent()?.navigate(screen);
  } else {
    navigation.navigate(screen);
  }
}, [navigation]);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/QuickActions.tsx src/navigation/RootNavigator.tsx src/screens/personal/Dashboard.tsx
git commit -m "feat(calculator): swap Budgets chip for Calculator + register route"
```

---

## Final verification (after all tasks)

- [ ] `npm run typecheck` → 0 errors.
- [ ] `npm run test:calcengine && npm run test:splitshares` → both PASS.
- [ ] Manual device matrix (documented, not automated):
  1. Personal dashboard: row 1 ends with Reports; row 2 starts with **Calculator**; no Budgets chip; Budget still reachable via its bottom tab.
  2. Tap Calculator → screen opens; `2 + 3 × 4 =` shows `20`; `1240 ÷ 4 =` shows `310`; `÷ 0 =` shows `Error`, next digit recovers.
  3. Do a calc, open History (clock icon) → entry present; tap it → result loads into display; kill & relaunch app → history persists.
  4. Compute an amount → "Use in a split" → **Quick split**: add 3 people, keep payer = Me, Save → returns to calculator; open Splits (from dashboard) → the split exists with 3 `they_owe` debts of equal share; if a wallet was picked, its balance dropped by the total.
  5. Compute an amount → "Use in a split" → **Detailed split**: DebtTracking opens on the splits tab with the amount pre-filled in the split form.
  6. Create a split the **old** way (existing wizard) → still saves correctly (commitSplit refactor regression check).
