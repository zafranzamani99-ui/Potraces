# MASTER EXECUTION PROMPT — Savings Tracker + Goals Screen Upgrade

> **Context**: You are working on Potraces, a React Native + Expo + TypeScript + Zustand personal finance app for Malaysian young adults. You have two blueprint documents (SAVINGS_TRACKER_BLUEPRINT.md and GOALS_BLUEPRINT.md) that describe the full upgrade spec. This prompt tells you HOW to implement them correctly — all the logic, edge cases, AI wiring, and flow.

> **CRITICAL**: Read both blueprint .md files FIRST before writing any code. They contain the full spec. This prompt is the execution guide — it tells you what order, what pitfalls to avoid, and what edge cases to handle.

---

## EXECUTION ORDER (do exactly this sequence)

### STEP 1: Types first (`src/types/index.ts`)

**Savings changes:**
- Add `target?: number` to `SavingsAccount` interface
- Add `sortBy: 'manual' | 'value' | 'return' | 'updated'` and `accountOrder: string[]` to `SavingsState`
- Add `setSortBy`, `reorderAccounts`, `setTarget` method signatures to `SavingsState`

**Goals changes:**
- Add `isPaused?: boolean`, `isArchived?: boolean`, `walletId?: string` to `Goal` interface
- Add `withdrawFromGoal`, `removeContribution`, `archiveGoal`, `unarchiveGoal`, `pauseGoal`, `resumeGoal` method signatures to PersonalState (find the PersonalState interface — it's in the same file)

**Edge case**: Do NOT change the existing field types or remove anything. Only ADD new optional fields. Existing data must still deserialize correctly.

---

### STEP 2: Fix savingsStore rehydration bug (`src/store/savingsStore.ts`)

**THE BUG**: Line ~83 has `const validTypes = ['tng_plus', 'robo_crypto', 'esa', 'bank', 'other'];` — this is MISSING `'asb'`, `'tabung_haji'`, `'stocks'`, `'gold'` which are all valid types from `INVESTMENT_CATEGORIES` in constants. Any account saved with those types gets forcibly reset to `'other'` on app restart, losing the type info.

**FIX**: Change the validTypes line to:
```typescript
const validTypes = ['tng_plus', 'robo_crypto', 'esa', 'bank', 'asb', 'tabung_haji', 'stocks', 'gold', 'other'];
```

AND make it more resilient — also accept any type that starts with `'custom_'` (for user-added custom categories from categoryStore):
```typescript
type: (validTypes.includes(a.type) || (a.type && a.type.startsWith('custom_'))) ? a.type : 'other',
```

**Also add**: new state fields `sortBy: 'manual'` (default) and `accountOrder: []` to initial state, plus the new methods (`setSortBy`, `reorderAccounts`, `setTarget`). Make sure `partialize` and `onRehydrateStorage` handle the new fields (sortBy and accountOrder are simple strings/arrays, no date conversion needed; target is a number, no conversion needed).

---

### STEP 3: Add new Goal methods to personalStore (`src/store/personalStore.ts`)

Add these methods inside the store's `set` callback area, after `contributeToGoal`:

**withdrawFromGoal(goalId, amount, note?)**:
- Find the goal by ID
- Subtract amount from currentAmount (floor at 0: `Math.max(goal.currentAmount - amount, 0)`)
- Add a contribution entry with NEGATIVE amount: `{ amount: -amount, note, date: new Date() }`
- Un-reach milestones that are no longer met: if `newCurrentAmount < (m.percentage / 100) * goal.targetAmount`, set `m.reached = false` and `m.reachedAt = undefined`
- Set `updatedAt: new Date()`

**removeContribution(goalId, contributionId)**:
- Find the goal and the specific contribution
- If the contribution amount is positive (a deposit), subtract it from currentAmount
- If the contribution amount is negative (a withdrawal), ADD its absolute value back
- Formula: `newAmount = Math.max(goal.currentAmount - contribution.amount, 0)` — this works for both cases because subtracting a negative number adds
- Remove the contribution from the array
- Recalculate milestones
- EDGE CASE: if the contribution being removed was the one that pushed past a milestone, un-reach that milestone

**archiveGoal / unarchiveGoal / pauseGoal / resumeGoal**: Simple — just set the boolean flag and updatedAt.

**CRITICAL**: Update the `partialize` section to include `isPaused`, `isArchived`, `walletId` in the goal serialization. These are simple primitives so no date conversion needed — they'll serialize/deserialize fine as-is. But make sure `onRehydrateStorage` defaults them:
```typescript
isPaused: g.isPaused ?? false,
isArchived: g.isArchived ?? false,
walletId: g.walletId || undefined,
```

---

### STEP 4: Create Sparkline component (`src/components/common/Sparkline.tsx`)

NEW FILE. Uses `react-native-svg` (already installed v15.12.1):

```typescript
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { CALM } from '../../constants';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  negativeColor?: string;
  showLastDot?: boolean;
  strokeWidth?: number;
}
```

**Logic:**
- If `data.length < 2`, return null (need at least 2 points)
- Calculate min/max of data, add 10% padding to range
- Map each value to X/Y coordinates: X evenly spaced across width, Y scaled to height (inverted — higher value = lower Y)
- Build a polyline points string: `"x1,y1 x2,y2 x3,y3..."`
- Color: if `data[data.length-1] >= data[0]`, use `color` (default CALM.accent); else use `negativeColor` (default CALM.neutral)
- If `showLastDot`, render a Circle at the last point
- Fill: `"none"`, stroke: the computed color, strokeWidth: prop or 2
- EDGE CASE: if all values are the same (flat line), add tiny padding to avoid divide-by-zero in Y scaling

---

### STEP 5: Wire up MoneyChat AI integration (THE MOST IMPORTANT STEP)

This is where both blueprints converge. Three files need changes:

#### 5A: `src/services/moneyChat.ts` — Add savings context

At the top, add import:
```typescript
import { useSavingsStore } from '../store/savingsStore';
```

Inside `buildFinancialContext()`, AFTER the existing `goalLines` section and BEFORE the `subLines` section, add the savings/investment block. See SAVINGS_TRACKER_BLUEPRINT.md section 5.1 for the exact code.

**EDGE CASES to handle:**
- Accounts with 0 history entries — use `'never'` for last update
- Accounts with 0 initialInvestment — return percentage should be 0, not NaN/Infinity
- Date objects that might be strings (from rehydration) — always wrap in `new Date()` before `format()`

Also enhance the goals section per GOALS_BLUEPRINT.md section 5.5 — add last contributed date, monthly contributions.

#### 5B: `src/services/chatActions.ts` — Add 4 new action types

Add these imports at the top:
```typescript
import { useSavingsStore } from '../store/savingsStore';
import { format } from 'date-fns';
```

Add to `ChatActionType` union:
```typescript
| 'update_savings'
| 'add_savings_account'
| 'create_goal'
| 'withdraw_goal'
```

Add to `ChatAction` interface:
```typescript
accountName?: string;
accountType?: string;
initialInvestment?: number;
goalTarget?: number;
goalDeadline?: string;
goalIcon?: string;
goalColor?: string;
```

Add 4 executor cases inside the `switch` statement. For each one:

**`update_savings`:**
- Get savingsStore via `useSavingsStore.getState()`
- Fuzzy match accountName against accounts (toLowerCase includes both directions)
- If no match: return failure with list of available account names
- Call `addSnapshot(account.id, action.amount, note)`
- Return success with new return percentage
- EDGE CASE: if action.amount is 0 or negative, return error

**`add_savings_account`:**
- Check if accounts.length >= 5 (free tier cap)
- Validate amount > 0
- Call `addAccount({ name, type: accountType || 'other', initialInvestment: amount, currentValue: amount })`
- EDGE CASE: if accountType is provided but not a valid type string, default to 'other'

**`create_goal`:**
- Check if goals.length >= 10
- Validate target > 0
- Parse goalDeadline if provided (validate it's a valid date)
- Call `addGoal({ name, targetAmount, deadline, category: 'general', icon: goalIcon || 'target', color: goalColor || '#4F5104' })`
- EDGE CASE: if deadline is in the past, still allow it (user might be backfilling)

**`withdraw_goal`:**
- Fuzzy match goalName against goals
- If no match: return failure with list of available goal names
- Check if amount > goal.currentAmount: return error
- Call `withdrawFromGoal(goal.id, action.amount, note)`
- EDGE CASE: withdrawing from a completed goal should work (un-completes it)

**Update ACTION_PROMPT string** — add all 4 new actions with descriptions, rules, and examples. Place them at the end of the existing AVAILABLE ACTIONS list as items 14-17. Include Manglish examples:
- "TNG+ sekarang RM 5200" → update_savings
- "baru open ASB, letak RM 5000" → add_savings_account
- "nak simpan untuk laptop, target RM 5000 by december" → create_goal
- "ambil RM 500 dari emergency fund" → withdraw_goal

#### 5C: `src/screens/personal/MoneyChat.tsx` — Add icons + labels

Add to `ACTION_ICONS`:
```typescript
update_savings: 'trending-up',
add_savings_account: 'plus-circle',
create_goal: 'flag',
withdraw_goal: 'minus-circle',
```

Add to `ACTION_LABELS`:
```typescript
update_savings: 'Update Savings',
add_savings_account: 'New Account',
create_goal: 'New Goal',
withdraw_goal: 'Withdraw',
```

**NOTE**: Do NOT add these to `SWITCHABLE_TYPES` — those are only for the type-switcher in the action edit modal (expense/income/debt/sub). The new actions are not switchable.

---

### STEP 6: Goals screen UI improvements (`src/screens/personal/Goals.tsx`)

**6A: Fix GOAL_COLORS** — Replace `'#E74C3C'` with `'#C1694F'` (warm terracotta, already used in the app for debt indicators).

**6B: Replace deadline TextInput with CalendarPicker:**
- Import `CalendarPicker` from `../../components/common/CalendarPicker`
- Add state: `const [showCalendar, setShowCalendar] = useState(false)` and `const [deadlineDate, setDeadlineDate] = useState<Date | null>(null)`
- Replace the deadline TextInput with:
  - A toggle button "Set deadline" / "Change deadline" that shows/hides the CalendarPicker
  - The CalendarPicker component with `minimumDate={new Date()}`
  - A "Clear deadline" button when deadline is set
- When editing, initialize deadlineDate from the goal's existing deadline
- In handleSaveGoal, use deadlineDate directly instead of parsing the text string
- EDGE CASE: when clearing deadline, set deadlineDate to null AND goalDeadline to ''

**6C: Add quick-contribute buttons to goal cards:**
- Define `const QUICK_AMOUNTS = [10, 50, 100, 500];`
- Render them as a horizontal row of pill buttons below the actions separator
- On tap: open the Contribute modal with amount pre-filled
- Style: `withAlpha(goal.color, 0.08)` background, goal.color text, RADIUS.full
- "Custom" button at the end: opens contribute modal with empty amount

**6D: Add contribution history modal:**
- New state: `const [historyModalVisible, setHistoryModalVisible] = useState(false)` and `const [historyGoal, setHistoryGoal] = useState<Goal | null>(null)`
- Add a "History" or "View all" link below the sparkline/contribution count
- Modal: bottom sheet, shows contributions grouped by month, each with date + amount + note + undo button
- Undo button calls `removeContribution(goal.id, contribution.id)` — needs the store method from Step 3
- EDGE CASE: negative contributions (withdrawals) should show with "-" prefix and CALM.neutral color
- EDGE CASE: empty contributions array — show "No contributions yet"

**6E: Add Sparkline to goal cards:**
- Import Sparkline from `../../components/common/Sparkline`
- For each goal card, extract contribution amounts: `goal.contributions.map(c => c.amount).filter(a => a > 0)` (exclude withdrawals from sparkline)
- Only show sparkline if 2+ positive contributions exist
- Show "X contributions · last: Y days ago" text below

**6F: Add pace indicator to goal cards:**
- Only show when deadline exists AND goal is not completed AND not paused
- Calculate: `remaining = targetAmount - currentAmount`, `daysLeft = differenceInCalendarDays(deadline, new Date())`
- If daysLeft > 0: show `~RM ${Math.ceil(remaining / daysLeft)}/day` and `~RM ${Math.ceil(remaining / (daysLeft / 30))}/month`
- If daysLeft <= 0 and not completed: show "deadline passed" calmly
- Style: CALM.textSecondary, TYPOGRAPHY.size.xs, inside a subtle CALM.background rounded box

**6G: Add filter pills:**
- State: `const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')`
- Render horizontal row above goal cards
- Filter enrichedGoals based on selection:
  - 'active': `!isCompleted && !isArchived`
  - 'completed': `isCompleted && !isArchived`
  - 'all': `!isArchived`
- Style: active pill uses CALM.accent bg with white text; inactive uses CALM.pillBg

**6H: Add wallet picker to Contribute modal:**
- Import `WalletPicker` from `../../components/common/WalletPicker`
- Import `useWalletStore`
- Add optional wallet selection below the amount input
- When user selects a wallet AND confirms contribution: deduct from wallet using `useWalletStore.getState().deductFromWallet(walletId, amount)`
- EDGE CASE: if selected wallet balance < contribution amount, show warning but still allow (user might have external money)
- EDGE CASE: if no wallets exist, don't show the picker at all

---

### STEP 7: Savings Tracker screen UI improvements (`src/screens/personal/SavingsTracker.tsx`)

**7A: Add Sparkline to account cards:**
- Import Sparkline component
- Data: `account.history.map(h => h.value)` (last 8 values)
- Show below the value section, above last updated row
- Only render if history.length >= 2

**7B: Add portfolio sparkline to hero card:**
- Aggregate: for each unique date across all accounts, sum values
- This is complex — simplify by using the last N snapshots of ALL accounts combined, sorted by date
- Alternatively: just show overall portfolio change direction with a simple trend indicator ("3/5 accounts ↗")

**7C: Add stale update indicator:**
- If last snapshot date > 7 days ago: show CALM.gold dot next to timestamp
- If > 30 days: change text to "hasn't been updated in a while"

**7D: Add "This month" contribution line to hero:**
- Sum value increases from snapshots created in current month (comparing each snapshot value to the previous one)
- EDGE CASE: first snapshot has no "previous" — skip it or use initialInvestment as baseline

**7E: Add sort pills (optional — lower priority than other changes):**
- Same pattern as Goals filter pills

---

### STEP 8: Verify and test edge cases

After all changes, mentally trace these scenarios:

**Scenario 1: Fresh app, no data**
- Both screens should show EmptyState correctly
- MoneyChat should include "(no accounts)" and "(none)" for savings/goals in context

**Scenario 2: AI says "update my TNG+ to RM 5200" via MoneyChat**
- parseActions extracts the action block
- User sees a pending chip with "TNG+" and RM 5200
- User taps chip → ActionEditModal opens (but new action types are NOT in SWITCHABLE_TYPES, so the type picker should gracefully show the action type label even if it's not switchable)
- User confirms → executeAction calls `useSavingsStore.getState().addSnapshot()`
- Toast confirms → chat shows "Updated TNG GO+ to RM 5200.00 (+12.5% overall)"

**IMPORTANT EDGE CASE FOR SCENARIO 2**: The ActionEditModal in MoneyChat.tsx uses SWITCHABLE_TYPES to render the type picker. New action types (update_savings, create_goal, etc.) are NOT in SWITCHABLE_TYPES. Make sure the modal doesn't crash when encountering an unknown type. The existing code already has a fallback: `SWITCHABLE_TYPES.find((t) => t.key === actionType)?.icon || 'circle'` — this should work. BUT the type picker dropdown might show nothing useful. Since these are specialized actions, the user shouldn't be switching types. Consider hiding the type picker when the action type is not in SWITCHABLE_TYPES, or just showing the label read-only.

**Scenario 3: AI says "create goal for raya, target RM 2000"**
- Action block parsed with create_goal
- executeAction calls `usePersonalStore.getState().addGoal()`
- The new goal should appear in the Goals screen with default icon (target) and color (#4F5104)
- MoneyChat financial context should include this goal on next message

**Scenario 4: User withdraws from a goal that was at exactly 100%**
- Goal was completed (100% milestone reached)
- Withdrawal brings currentAmount below targetAmount
- The 100% milestone should un-reach: `reached: false, reachedAt: undefined`
- The goal card should show the updated (lower) percentage
- The observation text should change from "goal reached." to the appropriate level

**Scenario 5: Remove a contribution that was the ONLY contribution**
- After removal: currentAmount should be 0, contributions array empty
- All milestones should be un-reached
- Sparkline should not render (< 2 data points)
- "No contributions yet" should show in history modal

**Scenario 6: Savings account type "asb" persists correctly**
- User adds ASB account → type = 'asb'
- App closes and reopens
- Rehydration should preserve type as 'asb' (NOT reset to 'other')
- Icon and color should match ASB from INVESTMENT_CATEGORIES

**Scenario 7: MoneyChat handles multiple actions in one message**
- User: "baru open ASB letak RM 5000, and simpan RM 200 for japan trip"
- AI should generate TWO action blocks: add_savings_account + add_goal_contribution
- Both should appear as pending chips
- User can confirm them independently

**Scenario 8: Wallet deduction on goal contribution**
- User selects Maybank wallet in contribute modal
- Contributes RM 500
- Goal's currentAmount increases by 500
- Maybank wallet balance decreases by 500
- EDGE CASE: if deductFromWallet fails (e.g., wallet not found), the contribution should still succeed (wallet is optional)

---

## CRITICAL RULES (DO NOT VIOLATE)

1. **Never break existing functionality.** All current features must still work after your changes. The add/edit/delete flows for both screens must remain intact.

2. **Date handling.** Every Date field must be handled in partialize (→ toISOString) and onRehydrateStorage (→ new Date()). Missing this causes crashes on app restart.

3. **Imports.** When you add `import { useSavingsStore } from '../store/savingsStore'` to moneyChat.ts and chatActions.ts, these are Zustand stores accessed via `.getState()` — they work outside React components. Do NOT use the hook form (`useSavingsStore()`) in service files.

4. **CALM design system.** No red (#E74C3C, #FF0000, etc). No green as success (#00FF00, #4CAF50). Positive = CALM.positive (#4F5104 olive). Negative = CALM.neutral (#B8AFBC lavender). All numbers use fontVariant: ['tabular-nums'].

5. **No gradient on cards.** Cards use `borderWidth: 1, borderColor: CALM.border`. Shadows ONLY on modals and FABs.

6. **ACTION_PROMPT is a template literal string.** When adding new actions to it, maintain the exact formatting pattern of the existing actions. Don't accidentally break the string.

7. **Test parseActions with your new action blocks.** The regex is `\[ACTION\]([\s\S]*?)\[\/ACTION\]` — make sure your example JSON in ACTION_PROMPT doesn't contain `[/ACTION]` inside the JSON (it won't, but be aware).

8. **MoneyChat pending chips.** New action types need entries in ACTION_ICONS and ACTION_LABELS, otherwise the pending chips show fallback icon (circle) and raw type string. Both are ugly — always add proper icons/labels.

9. **Sparkline component.** Handle edge cases: empty array, single value, all same values, negative values in goal contributions (withdrawals — filter them out for the sparkline display).

10. **CalendarPicker** in Goals: the component expects `value: Date` (required), `minimumDate?: Date`, `onChange: (date: Date) => void`. When there's no deadline set, you need a default date for the picker (use `new Date()` i.e. today). When the user clears the deadline, hide the calendar and set deadlineDate to null.

---

## FILE CHANGE SUMMARY

| Order | File | What to do |
|-------|------|-----------|
| 1 | `src/types/index.ts` | Add fields to SavingsAccount, SavingsState, Goal, PersonalState |
| 2 | `src/store/savingsStore.ts` | Fix rehydration bug, add sortBy/accountOrder/setTarget, persist new fields |
| 3 | `src/store/personalStore.ts` | Add withdrawFromGoal, removeContribution, archive/pause methods, persist new Goal fields |
| 4 | `src/components/common/Sparkline.tsx` | NEW FILE — SVG sparkline component |
| 5 | `src/services/moneyChat.ts` | Import savingsStore, add savings context, enhance goals context |
| 6 | `src/services/chatActions.ts` | Import savingsStore + format, add 4 action types + executors + prompt text |
| 7 | `src/screens/personal/MoneyChat.tsx` | Add ACTION_ICONS + ACTION_LABELS for 4 new types |
| 8 | `src/screens/personal/Goals.tsx` | CalendarPicker, quick-contribute, sparkline, pace, filters, history modal, fix colors |
| 9 | `src/screens/personal/SavingsTracker.tsx` | Sparkline, stale indicator, monthly contribution, enhanced hero |

Work through files 1-9 in order. Each file should compile without errors before moving to the next.
