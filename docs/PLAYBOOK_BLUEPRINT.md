# PLAYBOOK — Salary Envelope Tracker

> **Concept**: A discipline layer inside Budget Planning that lets users track where every ringgit from a specific income source goes.
> **Location**: Lives inside `BudgetPlanning.tsx` as a togglable mode — "Regular Budget" vs "Playbook"
> **For**: Claude Code execution — attach this alongside the other blueprints

---

## THE CONCEPT IN ONE PARAGRAPH

A Playbook is an income envelope. When salary/income arrives, the user creates a Playbook for it: "March Salary — RM 3,200". From that moment, every expense auto-links to active Playbooks. If multiple Playbooks are active (salary + freelance), the app asks "drain from which?" when adding an expense. Optionally, the user sets category budgets within the Playbook (RM 500 food, RM 400 transport). At month end, the app nudges to close the Playbook, showing a complete waterfall of where the money went. It's a discipline tool — not always-on, only when the user wants tighter control.

---

## LIMITS & TIERS

| | Free Tier | Premium |
|---|-----------|---------|
| Active playbooks at once | 2 max | 2 max |
| Saved (ended) playbooks | 5 max | Unlimited |

- **Active tab**: Max 2 running at the same time. If user tries to create a 3rd, show: "You have 2 active playbooks. Close one before starting a new one."
- **Past tab**: Closed/ended playbooks live here. Free tier keeps max 5. When a 6th is closed, prompt: "You've reached the free limit of 5 saved playbooks. Delete one or upgrade to keep unlimited history." The user picks which old one to delete, or upgrades.
- Active playbooks do NOT count toward the 5 past limit.

**Premium constants** — add to `src/constants/premium.ts`:
```typescript
// In FREE_TIER, add:
maxActivePlaybooks: 2,
maxSavedPlaybooks: 5,

// In PREMIUM_TIER, add:
maxActivePlaybooks: 2,       // same — 2 active is enough
maxSavedPlaybooks: Infinity,
```

The `canCreatePlaybook()` method checks:
```typescript
canCreatePlaybook: () => {
  const active = playbooks.filter(p => p.isActive && !p.isClosed);
  return active.length < 2; // always max 2 active, free or premium
}
```

The `canClosePlaybook()` method checks:
```typescript
canClosePlaybook: () => {
  const tier = usePremiumStore.getState().tier;
  if (tier === 'premium') return true;
  const closed = playbooks.filter(p => p.isClosed);
  return closed.length < 5;
}
```

---

## CORE DATA MODEL

### New Type: `Playbook`

```typescript
interface PlaybookAllocation {
  category: string;       // expense category ID (food, transport, etc.)
  allocatedAmount: number;
  spentAmount: number;    // computed from linked transactions
}

interface Playbook {
  id: string;
  name: string;                    // "March Salary", "Freelance Gig #4"
  sourceAmount: number;            // total income that started this playbook
  sourceTransactionId?: string;    // link to the income transaction that triggered it
  allocations: PlaybookAllocation[]; // optional per-category budgets
  linkedExpenseIds: string[];      // transaction IDs that drain from this playbook
  startDate: Date;
  endDate?: Date;                  // when user closes it, or auto-suggest date
  suggestedEndDate?: Date;         // auto-calculated: ~1 month from start
  isActive: boolean;               // true = accepting new expenses
  isClosed: boolean;               // true = user closed it, read-only
  createdAt: Date;
  updatedAt: Date;
}
```

### Key relationships:
- `Playbook.sourceTransactionId` → links to a `Transaction` with `type: 'income'`
- `Playbook.linkedExpenseIds` → array of `Transaction.id` values (expenses)
- `PlaybookAllocation.category` → matches expense category IDs from EXPENSE_CATEGORIES
- Multiple Playbooks can be active simultaneously
- One expense can be linked to multiple Playbooks (split across sources)

### New field on Transaction:

```typescript
// Add to Transaction interface in types/index.ts:
playbookLinks?: {
  playbookId: string;
  amount: number;       // how much of this expense drains from this playbook
}[];
```

This handles the split case: if user spends RM 100 and drains RM 60 from salary playbook + RM 40 from freelance playbook, the transaction has:
```typescript
playbookLinks: [
  { playbookId: 'salary-march', amount: 60 },
  { playbookId: 'freelance-4', amount: 40 },
]
```

---

## STORE: `playbookStore.ts` (NEW FILE)

```typescript
interface PlaybookState {
  playbooks: Playbook[];

  // CRUD
  createPlaybook: (playbook: Omit<Playbook, 'id' | 'linkedExpenseIds' | 'isActive' | 'isClosed' | 'createdAt' | 'updatedAt'>) => string | null; // returns null if limit reached
  updatePlaybook: (id: string, updates: Partial<Playbook>) => void;
  deletePlaybook: (id: string) => void;

  // Lifecycle
  closePlaybook: (id: string) => boolean; // returns false if past-tab limit reached
  reopenPlaybook: (id: string) => void;

  // Allocations
  setAllocations: (playbookId: string, allocations: PlaybookAllocation[]) => void;

  // Expense linking
  linkExpense: (playbookId: string, transactionId: string, amount: number) => void;
  unlinkExpense: (playbookId: string, transactionId: string) => void;

  // Queries
  getActivePlaybooks: () => Playbook[];
  getClosedPlaybooks: () => Playbook[];
  getPlaybookStats: (playbookId: string) => PlaybookStats;
  canCreatePlaybook: () => boolean;   // checks active count < 2
  canClosePlaybook: () => boolean;    // checks closed count < 5 (free) or unlimited (premium)
}

interface PlaybookStats {
  totalIncome: number;
  totalSpent: number;
  remaining: number;
  percentSpent: number;
  categoryBreakdown: { category: string; spent: number; allocated?: number }[];
  linkedTransactionCount: number;
  daysActive: number;
  dailyBurnRate: number;
  projectedEndDate?: Date; // when money runs out at current pace
}
```

Persist with Zustand + AsyncStorage, same pattern as other stores.

---

## USER FLOW

### Flow 1: Income arrives → Create Playbook

**Trigger**: When user adds an income transaction (via ExpenseEntry, MoneyChat, or Notes), the app detects it and shows a gentle suggestion.

**Where to show**: After the income is confirmed, show a toast or inline card:

```
┌─────────────────────────────────────────┐
│ 💡 RM 3,200 salary came in.             │
│    Track where it goes?                 │
│                                         │
│    [Create Playbook]    [Not now]       │
└─────────────────────────────────────────┘
```

**Implementation**: In `ExpenseEntry.tsx` `handleSubmit`, after adding an income transaction, check if user has the playbook feature enabled (could be a setting or just always show for income > threshold like RM 500). Show a modal/card asking to create a playbook.

**Also in MoneyChat**: When `add_income` action is confirmed and amount > RM 500, the AI response can mention: "Want me to start a playbook to track where this goes?"

**Create flow**:
1. User taps "Create Playbook"
2. Bottom sheet modal opens:
   - Name: pre-filled with "March Salary" or the income description
   - Amount: pre-filled from the income transaction
   - End date: auto-suggested ~30 days from now, editable
   - Category allocations: optional — "Set spending limits?" expandable section
3. User confirms → Playbook created, linked to the income transaction

### Flow 2: Expense added → Link to Playbook

**Trigger**: When ANY expense is added (ExpenseEntry, MoneyChat, QuickAddExpense, chatActions), check if there are active Playbooks.

**Logic**:
```
if (activePlaybooks.length === 0) → do nothing, normal expense
if (activePlaybooks.length === 1) → auto-link to that playbook (full amount)
if (activePlaybooks.length > 1) → ask user which playbook(s) to drain from
```

**The "which playbook?" prompt** (for multiple active playbooks):

```
┌─────────────────────────────────────────┐
│ Where does this RM 15 come from?        │
│                                         │
│ ○ March Salary (RM 1,840 left)          │
│ ○ Freelance Gig (RM 600 left)          │
│ ○ Split between both                    │
│ ○ Don't link to any playbook            │
│                                         │
│                         [Confirm]       │
└─────────────────────────────────────────┘
```

If "Split between both": show amount inputs for each playbook.

**Where to hook this in**:
- `ExpenseEntry.tsx` → after `handleSubmit` adds the expense, check active playbooks
- `chatActions.ts` → in `add_expense` executor, after recording the transaction
- `QuickAddExpense.tsx` → same pattern

**IMPORTANT**: The linking prompt should be non-blocking. If user dismisses it, the expense is still recorded — it just won't be linked to any playbook. The playbook is a discipline OVERLAY, not a gate.

### Flow 3: View Playbook inside Budget Planning

**Budget Planning gets a mode toggle** at the top:

```
[Regular Budget] [Playbook]
```

**Regular Budget** = current behavior (category-based budgets)
**Playbook** = shows active and closed playbooks

**Playbook view** has two tabs:

```
[Active (1)]  [Past (3)]
```

**Active tab** — shows running playbooks (max 2):

```
┌─────────────────────────────────────────┐
│ March Salary                     Active │
│ RM 3,200.00                             │
│                                         │
│ ┌─ Waterfall ────────────────────────┐  │
│ │ RM 3,200 came in                   │  │
│ │   └ RM 890 → Food (28%)           │  │
│ │   └ RM 400 → Transport (13%)      │  │
│ │   └ RM 200 → Shopping (6%)        │  │
│ │   └ RM 150 → Entertainment (5%)   │  │
│ │   └ RM 120 → Bills (4%)           │  │
│ │   ────────────────────────         │  │
│ │   RM 1,440 remaining (45%)        │  │
│ └────────────────────────────────────┘  │
│                                         │
│ 18 transactions · 21 days active        │
│ Burning ~RM 84/day                      │
│ At this pace: runs out in 17 days       │
│                                         │
│ ── Category Allocations (optional) ──   │
│ Food:      RM 490/500 ████████████░ 98% │
│ Transport: RM 310/400 ████████░░░░  78% │
│ Shopping:  RM 200 (no limit set)        │
│                                         │
│ [View All Transactions] [Close Playbook]│
└─────────────────────────────────────────┘
```

**Waterfall**: The hero feature. Shows the income at top, then each category that drained from it, sorted by amount descending. The "remaining" shows unspent money. This is the "where did my salary go?" answer.

**Burn rate**: Calculate daily spend rate and project when the money runs out.

**Category allocations**: If user set them, show progress bars. If not, just show the raw amounts per category.

**"View All Transactions"**: Opens a modal listing all transactions linked to this playbook, sorted by date.

**"Close Playbook"**: Marks it as closed. Shows a summary card. Closed playbooks move to the **Past tab**. If Past tab already has 5 playbooks (free tier), prompt user to delete one or upgrade before closing.

**Past tab** — shows ended playbooks (max 5 free):

```
┌─────────────────────────────────────────┐
│ February Salary              Ended      │
│ RM 3,200.00 → RM 3,040 spent (95%)     │
│ Closed on Feb 28 · 28 days · 42 txns   │
│                                         │
│ [View Summary]              [Delete]    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Jan Freelance Gig            Ended      │
│ RM 800.00 → RM 650 spent (81%)         │
│ Closed on Jan 20 · 15 days · 12 txns   │
│                                         │
│ [View Summary]              [Delete]    │
└─────────────────────────────────────────┘

3/5 saved playbooks (free tier)
```

- Tapping "View Summary" opens a read-only detail modal showing the full waterfall, category breakdown, and linked transactions
- "Delete" removes the playbook permanently (transactions stay, just the playbook envelope is gone)
- Shows counter: "3/5 saved playbooks (free tier)"

### Flow 4: Auto-nudge to close

When `suggestedEndDate` passes and the playbook is still active, show a gentle nudge:

```
┌─────────────────────────────────────────┐
│ 📅 "March Salary" has been open 32 days │
│    Ready to close and see the summary?  │
│                                         │
│    [Close & Review]    [Keep Open]      │
└─────────────────────────────────────────┘
```

Show this at the top of Budget Planning screen when there's a stale playbook.

### Flow 5: MoneyChat integration

**Context**: Add active playbooks to `buildFinancialContext()`:

```typescript
// In moneyChat.ts buildFinancialContext():
const playbookStore = usePlaybookStore.getState();
const activePlaybooks = playbookStore.getActivePlaybooks();

if (activePlaybooks.length > 0) {
  const pbLines = activePlaybooks.map((pb) => {
    const stats = playbookStore.getPlaybookStats(pb.id);
    return `  ${pb.name}: RM ${pb.sourceAmount.toFixed(2)} → spent RM ${stats.totalSpent.toFixed(2)}, RM ${stats.remaining.toFixed(2)} remaining (${stats.percentSpent.toFixed(0)}%), burning ~RM ${stats.dailyBurnRate.toFixed(0)}/day`;
  }).join('\n');
  ctx += `\n\nActive Playbooks (salary tracking):\n${pbLines}`;
}
```

**System prompt addition**:
```
Playbook awareness — when user has active playbooks:
- Reference the playbook when discussing spending: "From your March Salary, RM 890 went to food so far"
- When user asks "macam mana gaji aku?" or "where did my salary go?": Show the playbook waterfall
- When creating expenses via chat: If playbooks are active, mention which one the expense will be linked to
- If a playbook is running low: "Your March Salary has RM 340 left with 8 days to go — about RM 42/day"
- Never say "you're running out" — just show the numbers calmly
```

**Chat action**: Could add `create_playbook` action, but for v1, the playbook creation is better done through the UI (it needs the allocation setup). The AI can suggest it: "Want to create a playbook for this RM 3,200?"

---

## UI INTEGRATION POINTS

### Budget Planning Screen (`BudgetPlanning.tsx`)

Add a **segment toggle** at the very top, above the hero card:

```typescript
const [viewMode, setViewMode] = useState<'budget' | 'playbook'>('budget');
```

```
┌─────────────────────────────────────────┐
│  [  Regular Budget  ] [ Playbook 📓 ]   │
└─────────────────────────────────────────┘
```

- When 'budget' is selected: show existing budget UI (unchanged)
- When 'playbook' is selected: show playbook list with create button

Style: same segment control pattern used elsewhere in the app. Active uses CALM.accent bg.

### ExpenseEntry Screen (`ExpenseEntry.tsx`)

After `handleSubmit` successfully adds an **expense** transaction:

```typescript
// After addTransaction and wallet deduction:
const activePlaybooks = usePlaybookStore.getState().getActivePlaybooks();

if (activePlaybooks.length === 1) {
  // Auto-link to single active playbook
  usePlaybookStore.getState().linkExpense(activePlaybooks[0].id, txId, parsedAmount);
  // Also set playbookLinks on the transaction
} else if (activePlaybooks.length > 1) {
  // Show playbook picker modal
  setPlaybookPickerVisible(true);
  setPendingTxId(txId);
  setPendingAmount(parsedAmount);
}
```

After `handleSubmit` successfully adds an **income** transaction with amount > RM 500:
```typescript
// Show "Create Playbook?" suggestion
setPlaybookSuggestionVisible(true);
setPendingIncomeId(txId);
setPendingIncomeAmount(parsedAmount);
setPendingIncomeDescription(description);
```

### ChatActions (`chatActions.ts`)

In the `add_expense` and `add_income` executors, add playbook awareness:

For `add_expense`:
```typescript
// After recording the transaction:
const activePlaybooks = usePlaybookStore.getState().getActivePlaybooks();
if (activePlaybooks.length === 1) {
  usePlaybookStore.getState().linkExpense(activePlaybooks[0].id, txId, action.amount);
  // Include in result message
  resultMessage += ` (linked to ${activePlaybooks[0].name})`;
} else if (activePlaybooks.length > 1) {
  resultMessage += ` (${activePlaybooks.length} playbooks active — link it in the app)`;
}
```

For `add_income`:
```typescript
// After recording the income, if amount >= 500:
if (action.amount >= 500) {
  resultMessage += `\n\nWant to track where this goes? Say "create playbook for ${action.description}" or do it in Budget Planning.`;
}
```

### QuickAddExpense (`QuickAddExpense.tsx`)

Same pattern as ExpenseEntry — after adding expense, check active playbooks and auto-link or prompt.

---

## PLAYBOOK STATS COMPUTATION

The `getPlaybookStats` method computes everything from linked transactions:

```typescript
getPlaybookStats: (playbookId: string): PlaybookStats => {
  const pb = playbooks.find(p => p.id === playbookId);
  if (!pb) return defaultStats;

  const transactions = usePersonalStore.getState().transactions;

  // Get all linked expenses
  const linkedExpenses = transactions.filter(t =>
    t.playbookLinks?.some(link => link.playbookId === playbookId)
  );

  // Total spent from this playbook
  const totalSpent = linkedExpenses.reduce((sum, t) => {
    const link = t.playbookLinks!.find(l => l.playbookId === playbookId)!;
    return sum + link.amount;
  }, 0);

  const remaining = pb.sourceAmount - totalSpent;
  const percentSpent = pb.sourceAmount > 0 ? (totalSpent / pb.sourceAmount) * 100 : 0;

  // Category breakdown
  const catMap: Record<string, number> = {};
  for (const t of linkedExpenses) {
    const link = t.playbookLinks!.find(l => l.playbookId === playbookId)!;
    catMap[t.category] = (catMap[t.category] || 0) + link.amount;
  }

  const categoryBreakdown = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, spent]) => {
      const alloc = pb.allocations.find(a => a.category === category);
      return { category, spent, allocated: alloc?.allocatedAmount };
    });

  // Burn rate
  const now = new Date();
  const startDate = pb.startDate instanceof Date ? pb.startDate : new Date(pb.startDate);
  const daysActive = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / 86400000));
  const dailyBurnRate = totalSpent / daysActive;

  // Projection
  const projectedEndDate = dailyBurnRate > 0
    ? new Date(now.getTime() + (remaining / dailyBurnRate) * 86400000)
    : undefined;

  return {
    totalIncome: pb.sourceAmount,
    totalSpent,
    remaining,
    percentSpent,
    categoryBreakdown,
    linkedTransactionCount: linkedExpenses.length,
    daysActive,
    dailyBurnRate,
    projectedEndDate,
  };
}
```

---

## EDGE CASES

1. **Expense added without any active playbook** → Normal expense, no linking. Playbook is opt-in.

2. **User deletes a transaction that's linked to a playbook** → The playbook's stats will auto-recalculate (since stats are computed from live transaction data, not stored). But `linkedExpenseIds` array needs cleanup — either lazy (recalc on read) or eager (listen for deletions).

3. **User deletes a playbook** → Transactions keep their `playbookLinks` data (harmless orphan references). Could clean up but not critical.

4. **Income transaction deleted after playbook created** → Playbook still exists with the original amount. The sourceTransactionId becomes orphaned. Show a note: "Source transaction was removed" but don't delete the playbook.

5. **Splitting expense across playbooks** → User says "RM 60 from salary, RM 40 from freelance". Transaction gets two entries in `playbookLinks`. Both playbooks' stats reflect their portion.

6. **Playbook has allocations but expense doesn't match any** → Category shows under "Other" or "Unallocated" in the waterfall.

7. **All money spent (remaining = 0)** → Show calmly: "This salary has been fully used." Don't show alarm. Maybe show a gentle "playbook complete" state.

8. **Negative remaining (spent more than income)** → Possible if user links more expenses than the source amount. Show: "RM 200 over the original RM 3,200". Use CALM.neutral color.

9. **Playbook period overlap** → Two salary playbooks from different months both active. This is fine — each tracks its own linked expenses independently.

10. **MoneyChat creates expense via chat** → If 1 active playbook, auto-link. If multiple, the AI response should mention the active playbooks and ask which one. For v1, auto-link to the one with the most remaining balance (smart default).

---

## IMPLEMENTATION PHASES

### Phase 1: Data layer
1. Add `Playbook`, `PlaybookAllocation`, `PlaybookStats` types to `types/index.ts`
2. Add `playbookLinks` field to `Transaction` interface
3. Create `src/store/playbookStore.ts` with full CRUD + stats
4. Update `personalStore` partialize/rehydrate to handle `playbookLinks` on transactions

### Phase 2: Budget Planning UI
5. Add segment toggle (Regular Budget / Playbook) to `BudgetPlanning.tsx`
6. Build Playbook list view (active + closed sections)
7. Build Playbook detail card (waterfall, stats, allocations, burn rate)
8. Build "Create Playbook" modal (name, amount, end date, allocations)
9. Build "Close Playbook" flow with summary

### Phase 3: Expense linking
10. Add playbook picker modal to `ExpenseEntry.tsx`
11. Add auto-link logic for single active playbook
12. Add playbook suggestion after income > RM 500
13. Wire up `chatActions.ts` add_expense to auto-link

### Phase 4: AI integration
14. Add playbook context to `moneyChat.ts` `buildFinancialContext()`
15. Update system prompt with playbook awareness
16. (Optional) Add `create_playbook` chat action

### Phase 5: Polish
17. Add close nudge for stale playbooks
18. Add "View All Transactions" modal per playbook
19. QuickAddExpense integration
20. Test all edge cases

---

## FILES TO TOUCH

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add Playbook, PlaybookAllocation, PlaybookStats types; add playbookLinks to Transaction |
| `src/store/playbookStore.ts` | NEW FILE — full Zustand store |
| `src/store/personalStore.ts` | Update partialize/rehydrate for playbookLinks field |
| `src/screens/personal/BudgetPlanning.tsx` | Add segment toggle + playbook view |
| `src/screens/personal/ExpenseEntry.tsx` | Add playbook picker + income suggestion |
| `src/services/moneyChat.ts` | Add playbook context to buildFinancialContext() |
| `src/services/chatActions.ts` | Add playbook awareness to add_expense/add_income executors |

---

## CALM DESIGN NOTES

- Playbook waterfall uses each category's color from EXPENSE_CATEGORIES
- "Remaining" uses CALM.accent (olive)
- "Over budget" inside playbook allocation uses CALM.neutral (not red!)
- Burn rate text: CALM.textSecondary
- Segment toggle: CALM.accent for active, CALM.pillBg for inactive
- Close nudge: CALM.highlight (#FFF7E6) background — warm, not alarming
- The entire feature is opt-in. Users who never create a playbook see zero changes to their experience.
