# Calculator Quick Action + Split Hand-off — Design

**Date:** 2026-07-09
**Status:** Approved (user: "build that first later we will tweaks")

## Goal

Replace the **Budgets** quick-action chip on the personal dashboard with a **Calculator** — a genuinely best-in-class *basic* calculator (no scientific math) with a persistent history — that can optionally hand a computed amount off into the Splits feature, so users can settle "who owes what" without the full 6-step receipt wizard when it's overkill.

## Context (current state)

- **Quick actions** are an array config in `src/components/common/QuickActions.tsx` (`getQuickActions`, lines 25–36), rendered as two independent horizontal-scroll rows (`actions.slice(0,5)` / `slice(5,10)`). Current order:
  - Row 1: `wallets · savings · debts(Splits) · bills · budgets`
  - Row 2: `reports · goals · receipts · chat · pulse`
  - Labels come from `t.dashboard[key]`; navigation goes through `Dashboard.handleQuickAction` → `navigation.getParent()?.navigate(screen)` for stack screens.
- **Budget** is also a bottom tab (`BudgetPlanning`) in `src/navigation/PersonalNavigator.tsx`, so removing its chip does **not** hide the feature.
- **Splits** live in `src/screens/shared/DebtTracking.tsx` (~6500 lines). A split is created via `debtStore.addSplit(...)` which **only** stores the `SplitExpense` row; the debt + transaction + wallet-deduction orchestration is an ~80-line **inline block** in `DebtTracking.tsx` (≈ lines 2272–2353). The screen already reads route params (`receiptData`, `highlightId`) via `useEffect` and can auto-open its split form.
- **Money model:** floats rounded to 2 dp via `roundMoney` (`src/utils/money.ts`); display via `formatAmount`/`formatRM` (`src/utils/formatters.ts`); currency `RM`, locale `en-MY`.
- **Design system:** neumorphic `NeuSurface`/`NeuButton` + `useCalm()` light/dark tokens; custom `BottomSheet`/`FloatingModal`; an existing numpad pattern in `QuickAddExpense` (keys `7 8 9 ÷ … . 0 ⌫`, 42px `fontWeight:200` tabular-nums amount display, `lightTap()` haptics).
- **Testing:** no jest. Pure logic is tested with self-running `tsx` scripts under `scripts/` and registered as `npm run test:*`. `npm run typecheck` (tsc --noEmit) is the automated completeness gate. Pure/native split convention: keep native-module-free logic in its own module so it is `tsx`-loadable.

## Global Constraints

- Currency `RM`, locale `en-MY`; all persisted/derived money runs through `roundMoney` before storage, displayed via `formatAmount`.
- Follow the neumorphic design system + `useCalm()` tokens (light **and** dark); no new color literals.
- All interactive elements: `accessibilityLabel` + `lightTap()` haptic, ≥44px tap targets.
- No new heavyweight dependencies. Reuse `NeuSurface`, `BottomSheet`, existing numpad idiom.
- Pure calculator + split math must be `tsx`-testable (no React/native imports in the engine module).
- `npm run typecheck` must stay at 0 errors; no **new** eslint errors introduced.
- i18n: every user-facing string added to both `src/i18n/en.ts` and `src/i18n/ms.ts`.

## Components & Data Flow

### A. Quick-actions layout change
`src/components/common/QuickActions.tsx` — new array order:
```
Row 1:  wallets  savings  debts  bills  reports
Row 2:  calculator  goals  receipts  chat  pulse
```
- Remove `budgets`.
- Add `{ key: 'calculator', icon: 'i/calculator', screen: 'Calculator', color: C.accent }` as index 5 (first of row 2).
- `reports` moves to index 4 (end of row 1).
- Add `dashboard.calculator` label to `en.ts` ("Calculator") and `ms.ts` ("Kalkulator").
- Register `Calculator` stack screen in `src/navigation/RootNavigator.tsx` with `makeBackHeader(C, mode, 'Calculator')`.
- Add `'Calculator'` to the stack-navigation whitelist in `Dashboard.handleQuickAction`.

### B. Calculator engine (pure) — `src/utils/calculatorEngine.ts`
A pure state reducer, zero React/native imports (tsx-testable). Models a **physical basic calculator**: left-to-right sequential evaluation, no operator precedence, no parentheses.

State:
```ts
export type CalcOp = '+' | '-' | '×' | '÷';
export interface CalcState {
  display: string;          // what's shown, e.g. "1240" / "1240.5" / "0"
  accumulator: number | null; // running result of the pending op chain
  pendingOp: CalcOp | null; // operator awaiting its right operand
  overwrite: boolean;       // next digit replaces display (post-op / post-equals)
  lastOp: { op: CalcOp; operand: number } | null; // for repeated "=" 
  expression: string;       // human-readable trail, e.g. "1240 ÷ 4"
  error: boolean;           // e.g. divide-by-zero
}
export const initialCalc: CalcState;
```
Actions (pure functions returning new state):
- `inputDigit(s, d: string)` — `'0'..'9'`; respects `overwrite`; caps length (max 12 significant digits).
- `inputDot(s)` — single decimal point only.
- `setOp(s, op)` — folds any pending op (sequential eval), sets new `pendingOp`, updates `expression`.
- `equals(s)` — evaluates pending op (or repeats `lastOp`), moves result to `display`, records `lastOp`, sets `overwrite`.
- `percent(s)` — contextual: with a pending `+`/`-` and accumulator A and display D → `D% = A * D/100`; otherwise `D% = D/100`.
- `toggleSign(s)`, `backspace(s)`, `clearAll(s)`.
- Division by zero → `error:true`, display `"Error"`; any digit/`clearAll` recovers.
- All arithmetic results pass through `roundMoney` before becoming `display` (2-dp money precision), and are additionally clamped/trimmed for display.

`result(s): number` — parses current `display` to a number (0 on error).

### C. History store (persisted) — `src/store/calculatorStore.ts`
Zustand + `persist` (AsyncStorage), analogous to existing stores. This store is native-bound (AsyncStorage) and therefore **not** a tsx-tested unit — it generates ids/timestamps internally. Only the pure engine (§B) and share math (§F) are tsx-tested.
```ts
export interface CalcHistoryEntry { id: string; expression: string; result: number; at: string; }
interface CalcStore {
  history: CalcHistoryEntry[];         // newest first, capped at 50
  addEntry: (expression: string, result: number) => void; // builds {id, at}, prepends, trims to 50
  clearHistory: () => void;
  removeEntry: (id: string) => void;
}
```
- `addEntry` is called on `equals`, only when a real computation happened (not a bare "=" repeat with nothing pending). It creates the entry `{ id: <store-generated>, at: new Date().toISOString(), expression, result }` and prepends it, capping the list at 50.
- Uses the same id generation the other stores use (`debtStore`'s id pattern); no purity constraint since the store is already native-bound.

### D. Calculator screen — `src/screens/personal/Calculator.tsx`
Thin view over the engine + store.
- Large amount display (reuse QuickAddExpense's 42px/`fontWeight:200`/tabular-nums style); shows `state.expression` as a secondary line above.
- `NeuSurface` keypad grid: `AC ⌫ % ÷` / `7 8 9 ×` / `4 5 6 −` / `1 2 3 +` / `+/− 0 . =` (final layout tuned in implementation; equals is the accent CTA).
- **History**: a toggle (clock icon) opens a `BottomSheet` listing entries (`expression = result`, relative time); tap an entry → loads its `result` into the display (`overwrite:true`); "Clear history" footer.
- **"Use in a split →"** button (below the pad), disabled when `result(state) <= 0` or `error`. Opens a chooser (small action sheet / `FloatingModal`): **Quick split** | **Detailed split**.
  - Detailed → `navigation.navigate('DebtTracking', { prefillSplitAmount: result })`.
  - Quick → opens `QuickSplitSheet` with `total = result`.
- Screen imports the engine + store; keeps no money logic of its own beyond formatting.

### E. Detailed-split hand-off — `src/screens/shared/DebtTracking.tsx`
- Extend `DebtTrackingParams` with `prefillSplitAmount?: number`.
- Add a `useEffect(() => {...}, [route.params?.prefillSplitAmount])` mirroring the existing `receiptData` effect: `setActiveTab('splits')`, `setSplitAmount(amount.toFixed(2))`, `setSplitMethod('equal')`, `setSplitModalVisible(true)`. (Targets the existing split **form** modal — the full-featured manual path — not the receipt wizard.)
- No new split UI; reuses everything.

### F. Shared split-commit — `src/services/splitCommit.ts`
Extract the current inline orchestration (`DebtTracking.tsx` ≈ 2272–2353) into one reusable function so both the wizard save **and** Quick split use a single money path.
```ts
export interface CommitSplitInput {
  description: string;
  totalAmount: number;                 // already user-confirmed
  splitMethod: SplitMethod;            // 'equal' | 'custom' | 'item_based'
  participants: SplitParticipant[];    // amounts PRE-COMPUTED by caller
  items: SplitItem[];                  // [] unless item_based
  paidBy?: Contact;                    // undefined => draft, no debts/tx
  walletId?: string;                   // only meaningful when self is payer
  dueDate?: Date;
  mode: AppMode;                       // from useAppStore
}
export function commitSplit(input: CommitSplitInput): string; // returns splitId
```
Behavior (identical to today, centralized):
1. `addSplit({...})` → `splitId`.
2. If `paidBy?.id === '__self__'`: create the expense transaction (`personalStore.addTransaction` / `businessStore.addBusinessTransaction`), `updateSplit(splitId, { linkedTransactionId, walletId })`, deduct wallet (`useCredit` for credit type else `deductFromWallet`), and `addDebt(type:'they_owe')` per other participant with `amount > 0`.
3. Else if another payer: single `addDebt(type:'i_owe')` for self's share (if any).
4. Else (no payer): draft only.

Implementation reads stores via `getState()` (matches `aiProxy`/`referrals` service patterns). `DebtTracking`'s existing save path is refactored to call `commitSplit(...)` (behavior-preserving). The equal-division participant math (`perPerson`/`remainder`) is factored into a pure helper `computeEqualShares(total, contacts, payerId): SplitParticipant[]` in `src/utils/splitShares.ts` (tsx-testable), reused by both DebtTracking's `equal` branch and Quick split.

### G. Quick-split sheet — `src/components/split/QuickSplitSheet.tsx`
A `BottomSheet` opened from the calculator.
- **Total**: pre-filled from the calculator (editable numeric field).
- **Who's in**: "Me" chip always present + "＋ Add person" → appends editable name chip (default "Person N"); a "Recent" row offers one-tap re-pick of recent split contacts (derived from `debtStore` splits/debts). Each added chip removable.
- **Who paid**: segmented "Me" (default) / pick one of the added people.
- If payer is Me: optional wallet picker (reuse existing wallet list); if omitted, no deduction (debts only).
- Live preview: "Each pays RM x" via `computeEqualShares`.
- **Save** → builds `SplitParticipant[]` via `computeEqualShares`, calls `commitSplit({ splitMethod:'equal', paidBy, ... })`, toasts "Split created", closes, returns to calculator.
- Contacts are lightweight `Contact` objects: `{ id: <generated>, name, isFromPhone:false }`; "Me" is the shared `__self__` pseudo-contact used elsewhere.

## Error Handling / Edge Cases

- Divide by zero → engine `error` state, display "Error"; recover on next digit or `AC`; "Use in a split" disabled while errored.
- Display overflow: cap significant digits (≈12) — further digits ignored (no crash).
- Quick split with only "Me" and no others → nothing to split; Save disabled (needs ≥2 participants) with hint.
- Quick split with total ≤ 0 → Save disabled.
- Equal-division rounding remainder (± sen) assigned to the payer (matches existing `computeEqualShares` behavior).
- Detailed hand-off with a stale param on remount: guard the `useEffect` so it only fires on a fresh non-null `prefillSplitAmount` (same shape as the existing `receiptData` guard), and clear local intent after opening.
- `commitSplit` refactor must be **behavior-preserving** for the existing wizard — verified by the equal-shares test + a targeted read-through diff.

## Testing Strategy

- `scripts/test-calculator-engine.ts` (`npm run test:calcengine`): sequential eval (`2 + 3 × 4 = 20`), decimals, `%` contextual + standalone, sign toggle, backspace, divide-by-zero + recovery, repeated `=`, `roundMoney` precision, digit cap.
- `scripts/test-split-shares.ts` (`npm run test:splitshares`): `computeEqualShares` — even split, remainder-to-payer, single participant, 3-way with sen remainder, payer not in list fallback.
- `npm run typecheck` at 0 errors after every task (routing/refactor completeness gate).
- Manual device matrix (documented, not automated): layout renders; calculator math; history persists across restart; tap-history reload; Quick split creates split + debts + (optional) wallet deduction; Detailed hand-off pre-fills the split form; existing wizard save still works unchanged.

## Out of Scope (future tweaks)

- Business-mode calculator entry (this ships on the personal dashboard only; `commitSplit` already supports `mode:'business'` for later).
- Scientific/advanced math, memory keys (M+/M-), unit/currency conversion.
- Editing a Quick split after save (uses existing split edit path).
- Importing phone contacts inside Quick split (name chips + recent only for now).
