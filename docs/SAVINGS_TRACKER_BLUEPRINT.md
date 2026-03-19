# SAVINGS TRACKER — Complete Screen Blueprint v2.0

> **Purpose**: Full audit + 200x improvement spec for `src/screens/personal/SavingsTracker.tsx`
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
6. [Store Upgrades](#6-store-upgrades)
7. [Type Upgrades](#7-type-upgrades)
8. [UI/UX Design Spec](#8-uiux-design-spec)
9. [Malaysian Context Features](#9-malaysian-context-features)
10. [Implementation Order](#10-implementation-order)
11. [Files to Touch](#11-files-to-touch)

---

## 1. CURRENT STATE AUDIT

### What Exists (1264 lines)

The current SavingsTracker is a **basic CRUD tracker** for investment/savings accounts. Here's what it does:

**Features that work:**
- Portfolio hero card showing total value, invested amount, gain/loss, return %
- Account cards with type icon, name, current value, gain badge, last updated timestamp
- Add/Edit account modal with name, investment type dropdown, initial investment, current value
- Update Value modal with change preview (shows diff + percentage)
- Full History modal showing all snapshots in reverse chronological order
- Max 5 accounts (free tier cap)
- Investment types from `useCategories('investment')`: TNG+, Robo Crypto, ESA, Bank, ASB, Tabung Haji, Stocks, Gold, Other
- Custom description for "Other" type
- Persist via Zustand + AsyncStorage
- Date hydration on rehydrate (handles ISO string → Date conversion)
- EmptyState with CTA when no accounts exist

**UI Pattern:**
- CALM design system (olive palette, no red, no green-as-success)
- Bordered card hero (no gradient) — matches other screens
- Card component for each account
- Bottom sheet modals (slide up from bottom, fade overlay)
- FAB button at bottom for "Add Account"
- Feather icons throughout
- `tabular-nums` font variant for all numbers
- `withAlpha()` helper for translucent backgrounds

### Store (`savingsStore.ts` — 75 lines)
- `accounts: SavingsAccount[]`
- `addAccount()` — creates with initial snapshot
- `updateAccount()` — partial update
- `deleteAccount()` — filter out
- `addSnapshot()` — appends to history, updates currentValue
- Persisted with date serialization/deserialization
- Rehydration validates types against hardcoded list: `['tng_plus', 'robo_crypto', 'esa', 'bank', 'other']` ← **BUG: missing 'asb', 'tabung_haji', 'stocks', 'gold' from INVESTMENT_CATEGORIES**

### Types (`types/index.ts`)
```typescript
type SavingsAccountType = string;

interface SavingsSnapshot {
  id: string;
  value: number;
  note?: string;
  date: Date;
}

interface SavingsAccount {
  id: string;
  name: string;
  type: SavingsAccountType;
  description?: string;
  initialInvestment: number;
  currentValue: number;
  history: SavingsSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Navigation
- Accessed from: Personal Dashboard quick action grid → "Savings" (icon: archive, color: #A688B8)
- Accessed from: AccountOverview → Savings section card (tap navigates to SavingsTracker)
- Route name: `SavingsTracker` in RootNavigator (stack screen)

---

## 2. ARCHITECTURE MAP

```
PersonalDashboard ──→ SavingsTracker (this screen)
AccountOverview ──→ SavingsTracker
MoneyChat ──→ (NO CONNECTION - gap!)

SavingsTracker.tsx
├── useSavingsStore (accounts, addAccount, updateAccount, deleteAccount, addSnapshot)
├── useSettingsStore (currency)
├── useCategories('investment') → INVESTMENT_CATEGORIES from categoryStore
├── useToast (success/error feedback)
├── Components used:
│   ├── Card (elevated variant, border + bg)
│   ├── Button (primary/outline variants, haptic)
│   └── EmptyState (icon + title + message + CTA)
└── No external service connections (no AI, no Supabase sync)
```

### Who else reads savings data:
- `AccountOverview.tsx` — reads `useSavingsStore.accounts` to show portfolio summary card
- **Nobody else.** Not moneyChat, not any service, not any util.

---

## 3. WHAT'S MISSING — GAP ANALYSIS

### CRITICAL BUGS
1. **Store rehydration validator is incomplete** — only validates against `['tng_plus', 'robo_crypto', 'esa', 'bank', 'other']` but INVESTMENT_CATEGORIES also has `'asb', 'tabung_haji', 'stocks', 'gold'`. Any account saved with those types gets forcibly set to `'other'` on app restart.

### MISSING FEATURES (ranked by impact)

**P0 — Must have for basic utility:**
- No mini chart/sparkline showing value over time per account
- No total portfolio growth chart
- No auto-update reminders ("You haven't updated TNG+ in 14 days")
- No sorting/reordering accounts
- No search/filter when accounts grow

**P1 — Expected in a savings tracker:**
- No monthly contribution tracking ("I put in RM 200 this month")
- No target/goal per account ("I want TNG+ to reach RM 10,000")
- No milestone celebrations ("You just crossed RM 5,000 in ASB!")
- No dividend/return recording per account
- No projected growth calculation
- No breakdown by account type (pie chart: 40% ASB, 30% TNG+, etc.)
- No "Total Contributed This Month" stat

**P2 — Makes it 200x better:**
- No MoneyChat AI integration (can't ask "how's my savings?" and get real data)
- No chatActions for savings (can't say "update TNG+ to RM 5,200")
- No savings data in moneyChat financial context (AI is completely blind to savings!)
- No auto-categorized insights ("Your ASB grew 4.6% this year — matching the dividend rate")
- No comparison between accounts ("TNG+ is outperforming your bank savings")
- No "what-if" projections ("If you add RM 200/month for 12 months at 4% return...")
- No festive season context for Malaysian users (Raya savings, year-end dividend season)

**P3 — Polish:**
- No dark mode support (the screen uses CALM which has dark variants, but no toggle logic)
- No accessibility labels on most interactive elements
- No haptic feedback on account card interactions
- No skeleton loader while data loads
- No pull-to-refresh
- No share portfolio summary feature

---

## 4. THE 200x UPGRADE SPEC

### 4.1 Portfolio Hero Card — Enhanced

**Current:** Static numbers showing total value, invested, gain/loss, return %

**Upgrade to:**

```
┌─────────────────────────────────────────┐
│ Total Portfolio                          │
│ RM 12,450.00              ← TYPE.amount │
│                                         │
│ ┌─ Mini Sparkline (last 6 snapshots) ─┐ │
│ │  ╱╲    ╱──╲                         │ │
│ │╱   ╲╱╱     ╲──                      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Invested]  [Gain/Loss]  [Return]       │
│  RM 10,200  +RM 2,250    +22.1%        │
│                                         │
│ This month: +RM 430 contributed         │
│                          3/5 accounts ↗ │
└─────────────────────────────────────────┘
```

**New data points:**
- Mini sparkline of portfolio total over time (aggregate all account snapshots by date)
- "This month" contribution line — sum of all value increases from manual updates in current month
- Accounts trending indicator — "3/5 accounts ↗" means 3 out of 5 grew since last update

### 4.2 Account Cards — Enhanced

**Current:** Type icon + name + value + gain badge + last updated + Update/History buttons

**Upgrade to:**

```
┌─────────────────────────────────────────┐
│ [TNG+ icon]  TNG GO+        [edit][del] │
│              TNG+                       │
│                                         │
│ RM 5,200.00                    +12.5%   │
│ Invested: RM 4,600.00      +RM 600.00  │
│                                         │
│ ┌─ Sparkline (last 8 values) ────────┐  │
│ │     ╱──╲                           │  │
│ │  ╱╱     ╲──╱╱                      │  │
│ └────────────────────────────────────┘  │
│                                         │
│ ⏰ Updated 3 days ago    +RM 52.00     │
│                                         │
│ ┌─ Target: RM 10,000 ───── 52% ─────┐  │
│ │████████████████░░░░░░░░░░░░░░░░░░░│  │
│ └────────────────────────────────────┘  │
│                                         │
│ [Update Value]          [History]       │
└─────────────────────────────────────────┘
```

**New per-account features:**
- **Sparkline** — SVG path from last 8 snapshot values, rendered inline. Olive color for positive trend, CALM.neutral for negative.
- **Target bar** (optional) — if user sets a target for the account, show a progress bar with percentage. Uses CALM.accent fill.
- **Stale update indicator** — if last updated > 7 days ago, show a gentle amber dot (CALM.gold) next to the timestamp. If > 30 days, show text: "hasn't been updated in a while"
- **Contribution this month** — small line showing how much was added this month specifically

### 4.3 New: Portfolio Breakdown Section

After the hero card, before account cards:

```
┌─ Where Your Money Lives ────────────────┐
│                                          │
│  [Horizontal bar chart]                  │
│  ASB        ████████████████  42%        │
│  TNG+       ██████████        25%        │
│  Stocks     ████████          20%        │
│  Bank       █████             13%        │
│                                          │
│  ───────────────────────────────────     │
│  5 accounts · 4 types                    │
└──────────────────────────────────────────┘
```

- Horizontal stacked/bar showing allocation by type
- Uses each type's color from INVESTMENT_CATEGORIES
- Only shows when 2+ accounts exist
- Collapsible (use CollapsibleSection component that already exists)

### 4.4 New: Monthly Activity Summary

```
┌─ March 2026 ────────────────────────────┐
│                                          │
│  Contributed     RM 1,200.00             │
│  Value Change    +RM 430.00             │
│  Updates         7 times                 │
│                                          │
└──────────────────────────────────────────┘
```

- Summarizes all snapshot activity for the current month
- "Contributed" = sum of positive value changes from manual updates
- "Value Change" = net change in total portfolio value since start of month
- Gentle card, no heavy styling

### 4.5 New: Update Reminders

When an account hasn't been updated in 7+ days, show a gentle nudge at the top of the list:

```
┌─────────────────────────────────────────┐
│ 💡 TNG+ hasn't been updated in 14 days  │
│    [Update now]                          │
└─────────────────────────────────────────┘
```

- Uses CALM.highlight background (#FFF7E6)
- Only shows for the most stale account (not all of them)
- Tapping "Update now" opens the Update Value modal for that account
- Dismissible (tap X to hide for 24 hours — store in local state, not persisted)

### 4.6 Enhanced History Modal

**Current:** Simple list of date + value + diff

**Upgrade:**
- Add a line chart at the top showing value over time (SVG, simple connected dots)
- Group entries by month with month headers
- Show a "best month" and "worst month" highlight
- Add total contributed vs total growth split

### 4.7 Account Sorting

- Long-press to reorder accounts (or a "Sort by" pill row)
- Sort options: Manual (default), Highest value, Best return, Most recently updated
- Persist sort preference in savingsStore

---

## 5. MONEYCHAT AI INTEGRATION

### This is the biggest gap. Currently:
- `moneyChat.ts` `buildFinancialContext()` does NOT include ANY savings/investment data
- `chatActions.ts` has NO savings-related action types
- The AI is completely blind to the user's investment portfolio

### 5.1 Add Savings Data to Financial Context

In `src/services/moneyChat.ts`, inside `buildFinancialContext()`, add after the "Savings goals" section:

```typescript
// Import at top
import { useSavingsStore } from '../store/savingsStore';

// Inside buildFinancialContext(), after goalLines:

// Savings / Investment accounts
const savingsAccounts = useSavingsStore.getState().accounts;
const totalPortfolio = savingsAccounts.reduce((s, a) => s + a.currentValue, 0);
const totalInvested = savingsAccounts.reduce((s, a) => s + a.initialInvestment, 0);
const portfolioGain = totalPortfolio - totalInvested;
const portfolioReturn = totalInvested > 0 ? (portfolioGain / totalInvested) * 100 : 0;

const savingsLines = savingsAccounts
  .map((a) => {
    const gain = a.currentValue - a.initialInvestment;
    const ret = a.initialInvestment > 0 ? (gain / a.initialInvestment) * 100 : 0;
    const lastUpdate = a.history.length > 0
      ? format(
          a.history[a.history.length - 1].date instanceof Date
            ? a.history[a.history.length - 1].date
            : new Date(a.history[a.history.length - 1].date as any),
          'dd MMM'
        )
      : 'never';
    const target = (a as any).target ? ` / target RM ${(a as any).target.toFixed(2)}` : '';
    return `  ${a.name} (${a.type}): RM ${a.currentValue.toFixed(2)} invested RM ${a.initialInvestment.toFixed(2)} (${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%) last updated ${lastUpdate}${target}`;
  })
  .join('\n');

// Add to ctx string:
ctx += `\n\nSavings & Investments (${savingsAccounts.length} accounts):
Portfolio: RM ${totalPortfolio.toFixed(2)} (invested RM ${totalInvested.toFixed(2)}, ${portfolioReturn >= 0 ? '+' : ''}${portfolioReturn.toFixed(1)}%)
${savingsLines || '  (no accounts)'}`;
```

### 5.2 Add Savings Actions to chatActions.ts

Add these new action types:

```typescript
// Add to ChatActionType union:
| 'update_savings'
| 'add_savings_account'

// Add to ChatAction interface:
accountName?: string;    // for update_savings / add_savings_account
accountType?: string;    // for add_savings_account
initialInvestment?: number; // for add_savings_account

// Add executor cases:

case 'update_savings': {
  const savingsStore = useSavingsStore.getState();
  const accounts = savingsStore.accounts;
  const name = action.accountName || action.description;
  const account = accounts.find(
    (a) => a.name.toLowerCase().includes(name.toLowerCase()) ||
           name.toLowerCase().includes(a.name.toLowerCase())
  );
  if (!account) {
    const available = accounts.map(a => a.name).join(', ');
    return {
      success: false,
      message: `No savings account matching "${name}". You have: ${available || 'none'}`,
      action,
    };
  }
  savingsStore.addSnapshot(account.id, action.amount, action.description || 'updated via chat');
  const gain = action.amount - account.initialInvestment;
  const ret = account.initialInvestment > 0 ? (gain / account.initialInvestment) * 100 : 0;
  return {
    success: true,
    message: `Updated ${account.name} to RM ${action.amount.toFixed(2)} (${ret >= 0 ? '+' : ''}${ret.toFixed(1)}% overall)`,
    action,
  };
}

case 'add_savings_account': {
  const savingsStore = useSavingsStore.getState();
  if (savingsStore.accounts.length >= 5) {
    return { success: false, message: 'Maximum 5 savings accounts — remove one first.', action };
  }
  savingsStore.addAccount({
    name: action.description || action.accountName || 'New Account',
    type: action.accountType || 'other',
    initialInvestment: action.initialInvestment || action.amount,
    currentValue: action.amount,
  });
  return {
    success: true,
    message: `Added savings account "${action.description}" with RM ${action.amount.toFixed(2)}`,
    action,
  };
}
```

### 5.3 Update ACTION_PROMPT in chatActions.ts

Add to the AVAILABLE ACTIONS section:

```
14. update_savings — Update the current value of a savings/investment account
   {"type":"update_savings","amount":NUMBER,"description":"ACCOUNT_NAME","accountName":"ACCOUNT_NAME"}
   Fuzzy matches accountName against user's savings accounts (TNG+, ASB, Tabung Haji, etc).
   Use when user says "TNG+ now RM 5200", "update ASB", "my ASB is at RM 50000 now".

15. add_savings_account — Add a new savings/investment account
   {"type":"add_savings_account","amount":NUMBER,"description":"ACCOUNT_NAME","accountType":"TYPE","initialInvestment":NUMBER}
   Types: tng_plus, robo_crypto, esa, bank, asb, tabung_haji, stocks, gold, other
   Use when user says "add my ASB account", "I opened TNG+ with RM 1000".
```

Add examples:

```
Update savings:
User: "TNG+ sekarang RM 5200"
Response: Updated your TNG GO+ balance.
[ACTION]{"type":"update_savings","amount":5200,"description":"TNG+","accountName":"TNG+"}[/ACTION]

Add savings account:
User: "aku baru open ASB, letak RM 5000"
Response: Nice — added your ASB account!
[ACTION]{"type":"add_savings_account","amount":5000,"description":"ASB","accountType":"asb","initialInvestment":5000}[/ACTION]
```

### 5.4 Update SYSTEM_PROMPT in moneyChat.ts

Add a new scenario section:

```
Savings & Investment coaching — when user asks "how's my investment?" or "macam mana savings aku?":
- Show total portfolio value, total invested, overall return percentage
- Break down by account: which ones grew, which ones dipped
- Mention how long since each was last updated (gently nudge if stale)
- For Malaysian-specific accounts, add context:
  - ASB: mention typical dividend rate (~4-5%) for comparison
  - Tabung Haji: mention it's for Hajj savings + typical hibah rate (~3-4%)
  - TNG GO+: mention it's a money market fund with daily returns
- Celebrate milestones: "Your ASB just crossed RM 50,000!"
- Never say "invest more" or "you should save" — just observe
- If they ask "which one is doing best?" — show the numbers, let them decide
```

### 5.5 Update ACTION_ICONS and ACTION_LABELS in MoneyChat.tsx

```typescript
// Add to ACTION_ICONS:
update_savings: 'trending-up',
add_savings_account: 'plus-circle',

// Add to ACTION_LABELS:
update_savings: 'Update Savings',
add_savings_account: 'New Account',
```

### 5.6 AI-Driven Scenarios (what users will actually say)

These are the Manglish/English queries the AI should handle:

| User says | Intent | Action |
|-----------|--------|--------|
| "how's my savings?" | Query portfolio | No action, just show context |
| "macam mana investment aku?" | Query portfolio | No action, just show context |
| "TNG+ sekarang RM 5200" | Update value | `update_savings` |
| "update ASB to 50k" | Update value | `update_savings` |
| "my gold is at RM 3000 now" | Update value | `update_savings` |
| "baru open Tabung Haji, letak RM 1000" | Add account | `add_savings_account` |
| "add my versa cash account RM 2000" | Add account | `add_savings_account` |
| "which investment best?" | Compare accounts | No action, show comparison |
| "ASB dividend berapa tahun ni?" | General query | No action (AI doesn't know external rates, should say so) |
| "if I add RM 200 every month, bila sampai 10k?" | Projection | No action, calculate and show |
| "total portfolio aku berapa?" | Quick check | No action, show total |

---

## 6. STORE UPGRADES

### savingsStore.ts — Enhanced

```typescript
// Add to state:
sortBy: 'manual' | 'value' | 'return' | 'updated';
accountOrder: string[]; // for manual sorting

// Add methods:
setSortBy: (sort: 'manual' | 'value' | 'return' | 'updated') => void;
reorderAccounts: (orderedIds: string[]) => void;
setTarget: (accountId: string, target: number | null) => void;

// Fix rehydration — update validTypes to match ALL INVESTMENT_CATEGORIES:
const validTypes = ['tng_plus', 'robo_crypto', 'esa', 'bank', 'asb', 'tabung_haji', 'stocks', 'gold', 'other'];
// Also allow any custom_ prefixed types and any string from categoryStore overrides
```

### SavingsAccount type — Enhanced

```typescript
interface SavingsAccount {
  id: string;
  name: string;
  type: SavingsAccountType;
  description?: string;
  initialInvestment: number;
  currentValue: number;
  target?: number;          // NEW: optional target value
  history: SavingsSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 7. TYPE UPGRADES

In `src/types/index.ts`, update:

```typescript
interface SavingsAccount {
  id: string;
  name: string;
  type: SavingsAccountType;
  description?: string;
  initialInvestment: number;
  currentValue: number;
  target?: number;
  history: SavingsSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}

interface SavingsState {
  accounts: SavingsAccount[];
  sortBy: 'manual' | 'value' | 'return' | 'updated';
  accountOrder: string[];
  addAccount: (account: Omit<SavingsAccount, 'id' | 'history' | 'createdAt' | 'updatedAt'>) => void;
  updateAccount: (id: string, updates: Partial<SavingsAccount>) => void;
  deleteAccount: (id: string) => void;
  addSnapshot: (accountId: string, value: number, note?: string) => void;
  setSortBy: (sort: 'manual' | 'value' | 'return' | 'updated') => void;
  reorderAccounts: (orderedIds: string[]) => void;
  setTarget: (accountId: string, target: number | null) => void;
}
```

---

## 8. UI/UX DESIGN SPEC

### Design System Compliance

All new UI must follow the CALM design system. Reference:

```
Background: CALM.background (#F9F9F7)
Surface/Card: CALM.surface (#FFFFFF)
Primary text: CALM.textPrimary (#1A1A1A)
Secondary text: CALM.textSecondary (#6B6B6B)
Muted text: CALM.textMuted (#A0A0A0)
Accent: CALM.accent (#4F5104) — olive green
Positive: CALM.positive (#4F5104) — same olive, NOT green
Neutral/Negative: CALM.neutral (#B8AFBC) — lavender grey
Border: CALM.border (#EBEBEB)
Highlight: CALM.highlight (#FFF7E6) — warm yellow for nudges
Gold: CALM.gold (#DEAB22) — for stale indicators
```

**Typography rules:**
- Large numbers: `TYPE.amount` (fontSize 48, fontWeight 200, tabular-nums)
- Balance numbers: `TYPE.balance` (fontSize 36, fontWeight 300, tabular-nums)
- Labels: `TYPOGRAPHY.size.xs` (11) or `TYPOGRAPHY.size.sm` (13)
- Body: `TYPOGRAPHY.size.base` (15)
- All numbers MUST use `fontVariant: ['tabular-nums']`

**Spacing:** 8pt grid via SPACING constant. Use `SPACING.md` (16) for standard padding, `SPACING['2xl']` (24) for section gaps.

**Border radius:** RADIUS.xl (20) for cards, RADIUS.md (10) for buttons/inputs, RADIUS.full (9999) for pills/badges.

**Shadows:** NEVER use shadows on regular cards. Only on floating/elevated elements (modals, FABs). Cards use `borderWidth: 1, borderColor: CALM.border`.

**Animation:** All transitions use fade (not slide). Use Animated API with `useNativeDriver: true`. Duration: ANIMATION.normal (200ms) for most, ANIMATION.slow (450ms) for page transitions.

### Sparkline Component

Create a reusable `Sparkline` component:

```typescript
// src/components/common/Sparkline.tsx
interface SparklineProps {
  data: number[];           // values
  width?: number;           // default 120
  height?: number;          // default 40
  color?: string;           // default CALM.accent
  negativeColor?: string;   // default CALM.neutral
  showDots?: boolean;       // show last dot
  strokeWidth?: number;     // default 2
}
```

- Use `react-native-svg` (already in project for other components)
- Simple polyline path from data points
- Auto-scale Y axis to data range
- Color based on whether last value > first value
- Optional dot on the last data point

### Progress Bar for Target

Reuse existing `ProgressBar` component from `src/components/common/ProgressBar.tsx`.

### Sort Pills

Horizontal scroll row of pill buttons:

```
[Manual] [Value ↓] [Return ↓] [Updated ↓]
```

- Active pill: `CALM.accent` bg, white text
- Inactive pill: `CALM.pillBg` bg, `CALM.textSecondary` text
- Same pattern used in other screens

---

## 9. MALAYSIAN CONTEXT FEATURES

### Investment Types — Malaysia-Specific

The app already has these in INVESTMENT_CATEGORIES:

| ID | Name | Context |
|----|------|---------|
| `tng_plus` | TNG+ | TNG GO+ money market fund, daily returns, ~3-4% p.a. |
| `asb` | ASB | Amanah Saham Bumiputera, fixed price RM 1/unit, ~4-5% dividend |
| `tabung_haji` | Tabung Haji | Muslim savings for Hajj, ~3-4% hibah |
| `esa` | ESA | EPF Supplemental Account |
| `stocks` | Stocks | Bursa Malaysia stocks |
| `gold` | Gold | Physical/digital gold (e.g., HelloGold, TNG Gold) |
| `robo_crypto` | Robo Crypto | Robo advisors (Stashaway, Wahed) or crypto |
| `bank` | Bank | Fixed deposit / savings account |

### Dividend Season Context

Many Malaysian investments pay annual dividends in Q1:
- ASB: Usually announced in January
- Tabung Haji: Usually announced in March/April
- EPF: Usually announced in February

The AI should be aware of this when users ask about returns or updates during these periods.

### Suggested Account Names (for the Add modal placeholder)

```
"e.g. My TNG GO+, ASB Main, Tabung Haji, Wahed Invest, CIMB FD"
```

### Currency

Always use `currency` from `useSettingsStore` (defaults to "RM").

---

## 10. IMPLEMENTATION ORDER

Execute in this exact order to avoid breaking changes:

### Phase 1: Fix Bugs + Store (do first)
1. Fix `savingsStore.ts` rehydration — add missing valid types
2. Add `target`, `sortBy`, `accountOrder` to types
3. Add `setSortBy`, `reorderAccounts`, `setTarget` to store
4. Update `SavingsState` interface in `types/index.ts`

### Phase 2: MoneyChat Integration (highest value)
5. Add savings context to `moneyChat.ts` `buildFinancialContext()`
6. Add `update_savings` and `add_savings_account` to `chatActions.ts` (types + executor + prompt)
7. Add action icons/labels to `MoneyChat.tsx`
8. Add savings coaching scenario to SYSTEM_PROMPT

### Phase 3: UI Enhancements
9. Create `Sparkline` component
10. Enhance Portfolio Hero Card (sparkline + monthly contribution + trend indicator)
11. Enhance Account Cards (sparkline + target bar + stale indicator)
12. Add Portfolio Breakdown section
13. Add Monthly Activity Summary card
14. Add Update Reminder nudge
15. Add sort pills
16. Enhance History Modal (chart + month grouping)

### Phase 4: Polish
17. Add haptic feedback to card interactions
18. Add accessibility labels
19. Test all modals on different screen sizes
20. Verify dark mode token usage

---

## 11. FILES TO TOUCH

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `target` to SavingsAccount, update SavingsState |
| `src/store/savingsStore.ts` | Fix rehydration, add sortBy/accountOrder/setTarget |
| `src/services/moneyChat.ts` | Import savingsStore, add portfolio context to buildFinancialContext() |
| `src/services/chatActions.ts` | Add update_savings + add_savings_account (type, executor, prompt) |
| `src/screens/personal/MoneyChat.tsx` | Add ACTION_ICONS + ACTION_LABELS entries |
| `src/components/common/Sparkline.tsx` | NEW FILE — reusable sparkline SVG component |
| `src/screens/personal/SavingsTracker.tsx` | Major rewrite — hero, cards, breakdown, activity, reminders, sorting |

### Files NOT to touch:
- `src/screens/personal/AccountOverview.tsx` — already reads savings correctly
- `src/screens/personal/Dashboard.tsx` — quick action routing is fine
- `src/navigation/RootNavigator.tsx` — route is fine
- `src/constants/index.ts` — INVESTMENT_CATEGORIES and CALM are fine

---

## SUMMARY

The Savings Tracker is currently a basic CRUD screen. This blueprint upgrades it to a **full investment portfolio dashboard** with:

1. **Visual storytelling** — sparklines, breakdown charts, progress bars
2. **AI brain connection** — MoneyChat can now see, query, and modify savings data
3. **Malaysian relevance** — ASB, Tabung Haji, TNG+ with cultural context
4. **Gentle nudges** — stale update reminders, milestone celebrations
5. **No anxiety** — follows CALM design system strictly, no alarming colors or language

Copy this entire document to Claude Code and execute phases 1-4 in order.
