# GOALS SCREEN — Complete Screen Blueprint v2.0

> **Purpose**: Full audit + 200x improvement spec for `src/screens/personal/Goals.tsx`
> **For**: Claude Code execution — copy this entire document as context
> **App**: Potraces — Malaysian personal finance app for young adults
> **Stack**: React Native, Expo, TypeScript, Zustand, Gemini AI

---

## TABLE OF CONTENTS

1. [Current State Audit](#1-current-state-audit)
2. [Architecture Map](#2-architecture-map)
3. [What's Missing — Gap Analysis](#3-whats-missing--gap-analysis)
4. [The 200x Upgrade Spec](#4-the-200x-upgrade-spec)
5. [MoneyChat AI Integration](#5-moneychat-ai-integration)
6. [Store & Type Upgrades](#6-store--type-upgrades)
7. [UI/UX Design Spec](#7-uiux-design-spec)
8. [Malaysian Context Features](#8-malaysian-context-features)
9. [Implementation Order](#9-implementation-order)
10. [Files to Touch](#10-files-to-touch)

---

## 1. CURRENT STATE AUDIT

### What Exists (1304 lines)

The Goals screen is actually one of the more complete unfinished screens. It has solid CRUD, milestones, and contribution tracking. Here's what works:

**Features that work:**
- Summary hero card showing total saved, total target, overall %, active vs completed count
- ProgressBar (animated) in the summary card
- Goal cards with custom icon (12 options), custom color (8 options), name, target, current amount
- Percentage badge per goal
- Milestone dots (25%, 50%, 75%, 100%) that fill with the goal's color when reached
- Calm observation text — italic, non-judgmental ("50% — halfway.", "goal reached.")
- Custom progress bar per goal using the goal's chosen color
- Deadline tracking with days remaining / "overdue" indicator
- Contribute modal with live preview (shows new % after contribution, remaining amount, celebration text)
- Add/Edit goal modal with name, target amount, deadline (text input YYYY-MM-DD), icon picker grid, color picker row, live preview
- Delete with Alert confirmation
- Max 10 goals cap
- EmptyState with CTA when no goals exist
- FAB for "Create Goal"
- Milestone notifications on contribute — toast "50% milestone." or "Goal reached."
- Accessibility labels on contribute buttons, icon picker, color picker
- Haptic feedback on edit/contribute/icon/color selection

**UI Pattern:**
- CALM design system throughout
- Bordered summary card (no gradient)
- Card component for each goal
- Bottom sheet modals (fade + slide up)
- Milestone dots row below each progress bar
- Icon picker: 4x3 grid of Feather icons
- Color picker: horizontal row of circles with check mark on selected

### Store (in `personalStore.ts`)
- `goals: Goal[]` — stored in personalStore alongside transactions, subscriptions, budgets
- `addGoal()` — creates with 4 milestone objects (25/50/75/100), currentAmount = 0
- `updateGoal()` — partial update
- `deleteGoal()` — filter out
- `contributeToGoal()` — adds contribution, updates currentAmount (capped at targetAmount), auto-marks milestones as reached
- Persisted with date serialization via AsyncStorage

### Types (`types/index.ts`)
```typescript
interface GoalContribution {
  id: string;
  amount: number;
  note?: string;
  date: Date;
}

interface GoalMilestone {
  percentage: number; // 25, 50, 75, 100
  label: string;
  reached: boolean;
  reachedAt?: Date;
}

interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: Date;
  category: string;
  icon: string;
  color: string;
  contributions: GoalContribution[];
  milestones: GoalMilestone[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Navigation
- Dashboard quick action: "Goals" (icon: flag, color: #D4884A)
- Route: `Goals` in RootNavigator, headerTitle: "My Goals"

### AI Connection (ALREADY EXISTS — partially)
- `chatActions.ts` has `add_goal_contribution` action type — works!
- `moneyChat.ts` `buildFinancialContext()` includes goals with deadline + pace calculation
- `moneyChat.ts` system prompt has "Goal coaching" scenario
- Recent goal contributions are included in context

---

## 2. ARCHITECTURE MAP

```
PersonalDashboard ──→ Goals (this screen)
MoneyChat ──→ add_goal_contribution action (WORKS)
MoneyChat ──→ goals context in buildFinancialContext() (WORKS)

Goals.tsx
├── usePersonalStore (goals, addGoal, updateGoal, deleteGoal, contributeToGoal)
├── useSettingsStore (currency)
├── useToast (feedback)
├── Components used:
│   ├── Card (elevated)
│   ├── Button (primary/outline)
│   ├── ProgressBar (animated, custom color)
│   └── EmptyState
└── NOT using: CalendarPicker (exists!), Sparkline, CollapsibleSection
```

### Who reads goals data:
- `MoneyChat` → via chatActions `add_goal_contribution` (finds goals by fuzzy name match)
- `moneyChat.ts` → `buildFinancialContext()` includes goal lines with pace
- `FinancialPulse.tsx` → reads goals for wellness score calculation
- `AccountOverview.tsx` → does NOT show goals (gap)

---

## 3. WHAT'S MISSING — GAP ANALYSIS

### BUGS / ISSUES
1. **Deadline input is raw text (YYYY-MM-DD)** — error-prone, no date picker. The app has a beautiful `CalendarPicker` component already but Goals doesn't use it!
2. **currentAmount capped at targetAmount** — if user over-contributes (contributes RM 100 when only RM 50 remaining), the extra is silently lost. Should either warn or allow over-target.
3. **GOAL_COLORS includes red (#E74C3C)** — violates CALM design system rule "no red ever". Should be replaced with a warm coral or removed.
4. **No withdraw/remove contribution** — if user accidentally adds wrong amount, there's no undo. Only option is to delete the entire goal.
5. **Milestone labels hardcoded with exclamation marks** ("Quarter way!", "Halfway there!") — doesn't match CALM's low-key tone. Should be calm observations.

### MISSING FEATURES (ranked by impact)

**P0 — Must have:**
- No contribution history view per goal (data exists in `goal.contributions[]` but nowhere to see it!)
- No withdraw/undo contribution
- No date picker for deadline (CalendarPicker exists but unused)
- No "pace" indicator on goal cards ("You need RM 46/day to hit your deadline")
- No link between goals and actual wallet deductions (contributing to a goal doesn't deduct from any wallet)

**P1 — Expected:**
- No sorting/filtering goals (active vs completed, deadline soonest, most progress)
- No "pause" state for goals (sometimes life happens, user wants to pause without deleting)
- No quick-contribute amounts (preset buttons: +RM 10, +RM 50, +RM 100, +RM 500)
- No monthly contribution summary ("You saved RM 1,200 toward goals this month")
- No per-goal sparkline showing contribution pattern over time
- No "auto-save" / recurring contribution reminders
- No "how much should I save per week/month to hit deadline?" calculator
- AccountOverview doesn't show goals summary (unlike savings which it does)

**P2 — Makes it 200x better:**
- No MoneyChat actions for: creating goals, editing goals, withdrawing from goals, pausing goals
- No milestone visual celebration (even subtle — a gentle pulse or color change)
- No "streak" tracking ("You've contributed 4 weeks in a row!")
- No comparison to last month's contribution pace
- No linking goal contributions to expense categories ("I saved RM 200 by spending less on food")
- No "what-if" projections from AI ("At this pace, you'll reach your goal by August")
- No share/export goal progress

**P3 — Polish:**
- No skeleton loader
- No pull-to-refresh
- No reorder goals
- No archive completed goals (they just sit in the list forever)

---

## 4. THE 200x UPGRADE SPEC

### 4.1 Summary Hero Card — Enhanced

**Current:** Total saved, total target, overall %, active/completed/overall stats

**Upgrade to:**

```
┌─────────────────────────────────────────┐
│ Goals Progress                          │
│ RM 4,200.00              ← TYPE.balance │
│ of RM 15,000.00 total target            │
│                                         │
│ ┌─ Progress Bar ─────────────────────┐  │
│ │██████████████████░░░░░░░░░░░░░░░░░│  │
│ └────────────────────────────────────┘  │
│                                         │
│ This month: +RM 800.00 contributed      │
│                                         │
│ [Active: 3]  [Completed: 1]  [28%]     │
└─────────────────────────────────────────┘
```

**New data:**
- "This month" contribution total — sum all contributions from current month across all goals
- Gentle comparison: if last month total exists, show "vs RM 600 last month" subtly

### 4.2 Goal Cards — Enhanced

**Upgrade to:**

```
┌─────────────────────────────────────────┐
│ [icon]  Japan Trip              [72%]   │
│         RM 7,200 / RM 10,000           │
│         Jun 15, 2026 · 93d left        │
│                                         │
│ 72% — almost there.                     │
│                                         │
│ ┌─ Progress Bar (goal color) ────────┐  │
│ │████████████████████████░░░░░░░░░░░│  │
│ └────────────────────────────────────┘  │
│  ○ 25%    ● 50%    ● 75%    ○ 100%    │
│                                         │
│ ┌─ Pace Indicator ──────────────────┐   │
│ │ ~RM 30/day to reach by deadline   │   │
│ │ or ~RM 933/month                  │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌─ Sparkline (contributions) ───────┐   │
│ │  ╱╲    ╱──╲                       │   │
│ │╱   ╲╱╱     ╲──                    │   │
│ └───────────────────────────────────┘   │
│ 4 contributions · last: 3 days ago      │
│                                         │
│ ─────────────────────────────────────   │
│ [+RM 50] [+RM 100] [+RM 500] [Custom]  │
│                    [Edit]  [Delete]     │
└─────────────────────────────────────────┘
```

### 4.3 New: Filter/Sort Pills

```
[All] [Active] [Completed] [Deadline ↑]
```

### 4.4 New: Archive Completed Goals

### 4.5 Enhanced Contribute Modal

### 4.6 Enhanced Add/Edit Goal Modal — CalendarPicker for deadline

### 4.7 New: Withdraw/Undo Contribution

### 4.8 New: Pause/Resume Goal

---

## 5. MONEYCHAT AI INTEGRATION

- Add `create_goal` and `withdraw_goal` action types
- Enhanced goal context in `buildFinancialContext()`
- Updated SYSTEM_PROMPT goal coaching section

---

## 6. STORE & TYPE UPGRADES

New methods: `withdrawFromGoal`, `removeContribution`, `archiveGoal`, `unarchiveGoal`, `pauseGoal`, `resumeGoal`
New Goal fields: `isPaused`, `isArchived`, `walletId`

---

## 7. UI/UX DESIGN SPEC

- No red — replace `#E74C3C` with `#C1694F`
- All numbers: `fontVariant: ['tabular-nums']`
- Cards: `borderWidth: 1, borderColor: CALM.border`
- CalendarPicker for deadline
- Sparkline for contributions

---

## 8. MALAYSIAN CONTEXT FEATURES

Goal templates: Emergency Fund, Raya Savings, Umrah/Haji, Downpayment, Gadget Fund, Travel, Wedding, Education

---

## 9. IMPLEMENTATION ORDER

### Phase 1: Fix Bugs + Store
### Phase 2: MoneyChat Integration
### Phase 3: UI Enhancements
### Phase 4: Polish

---

## 10. FILES TO TOUCH

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `isPaused`, `isArchived`, `walletId` to Goal; add new store methods |
| `src/store/personalStore.ts` | Add new methods |
| `src/services/chatActions.ts` | Add `create_goal` + `withdraw_goal` |
| `src/services/moneyChat.ts` | Enhance goal context + system prompt |
| `src/screens/personal/MoneyChat.tsx` | Add ACTION_ICONS + ACTION_LABELS |
| `src/screens/personal/Goals.tsx` | Major enhancement |
