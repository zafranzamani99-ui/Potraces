# Prompt 3 — Outcome-Framed UI: Phase 2 Architecture

> Zero code — architecture document for review
> Builds on: `docs/OUTCOME_UI_AUDIT.md` (Phase 1 findings)

---

## Design Principles

1. **Lead with meaning, numbers as supporting detail** — "you're in a comfortable spot" (hero), RM 3,200 (detail)
2. **Answer "so what?" before "what"** — "food is steady this month" before "RM 450 on food"
3. **Suggest next move, don't just report past** — "RM 500 breathing room — 12 days left"
4. **Time as context** — "slower than last week", "8 days left, on pace", "Raya is 3 weeks away"
5. **Mode-specific warmth** — each business type gets its own vocabulary
6. **No new AI calls for quick wins** — rule-based context first, AI narrative only where high-value

---

## A. Per-Mode Vocabulary Guide

### Personal Mode

| Current | Reframe | Context |
|---------|---------|---------|
| Monthly Balance | your month so far | Dashboard hero |
| Total Net Worth | everything you have | Account Overview hero |
| Income | came in | everywhere |
| Expenses | went out | everywhere |
| Saved / Savings Rate | kept / what you're keeping | Dashboard, Pulse |
| Budget | your plan | Budget screen |
| Allocated | set aside | Budget items |
| Spent | used | Budget progress |
| Remaining | breathing room | Budget items |
| Utilization | (remove — show progress bar only) | Budget |
| Budget Adherence | staying in rhythm | Pulse score |
| Financial Wellness Score | your money pulse | Pulse hero |
| Cash Flow | in & out | Pulse section |
| Spending Velocity | your pace this month | Pulse section |
| Transactions | activity | Tab label, list headers |
| Balance | what's there | Wallet display |
| Transfer | move money | Wallet action |
| Portfolio | your accounts | Savings Tracker |
| Return | growth | Savings Tracker |
| Initial Investment | what you put in | Savings Tracker |
| Gain / Loss | up / down | Savings Tracker |
| Contribution | added | Goals |
| Billing Cycle | repeats | Subscriptions |
| Next Billing | coming up | Subscriptions |
| Active Subscriptions | running | Subscriptions |
| Outstanding | still open | Debts |
| Income vs Expenses | in vs out | Reports charts |
| Expenses by Category | where it went | Reports charts |
| Top Categories | biggest slices | Reports |
| No-Spend Streak | quiet days | Pulse |

### Seller Mode

| Current | Reframe |
|---------|---------|
| Total Revenue | total came in |
| Total Profit | total kept |
| Profit Margin | kept per sale |
| Monthly Sales | monthly flow |
| Revenue | came in |
| Inventory (screen name) | products |
| Stock Level | how much left |
| Out of stock | sold out |
| Low stock | running low |
| Outstanding (orders) | still waiting |

### Stall Mode

| Current | Reframe |
|---------|---------|
| Total (revenue) | today's total |
| Revenue | came in |
| Sessions | selling days |
| Items sold | how many went out |

### Freelancer Mode

| Current | Reframe |
|---------|---------|
| Income | came in |
| Average (monthly) | typical month |
| Payment | got paid |
| Clients | people you work with |
| Payment history | what came in |

### Part-time Mode

| Current | Reframe |
|---------|---------|
| Income | came in |
| Shifts | times you worked |
| Hourly rate | per hour |

### On-the-Road Mode

| Current | Reframe |
|---------|---------|
| Earnings | came in |
| Costs | went out |
| Daily yield | daily take |

---

## B. Screen-by-Screen Reframe Map

### Tier 1 — Quick Wins (label changes only, no layout change)

#### 1. Financial Pulse (`screens/personal/FinancialPulse.tsx`)

| Current | New |
|---------|-----|
| "Financial Wellness Score" | "your money pulse" |
| "Strong position" / "Solid foundation" / etc. | "feeling good" / "steady ground" / "building up" / "just starting" / "finding your rhythm" |
| "CASH FLOW" | "in & out" |
| "In" / "Out" | "came in" / "went out" |
| "Kept this month" | "you kept" |
| "SPENDING PACE" | "your pace" |
| "below usual" / "on track" / "slightly above" / "faster than usual" | "quieter than usual" / "right on rhythm" / "a bit ahead" / "moving faster" |
| "WHERE IT GOES" | "where it went" |
| "QUIET DAYS" | "quiet days" (keep — already warm) |
| "WEEKLY PATTERN" | "your week" |
| "UPCOMING BILLS" | "coming up" |

#### 2. Business Reports (`screens/business/Reports.tsx`)

| Current | New |
|---------|-----|
| "Total Revenue" | "total came in" |
| "Total Profit" | "total kept" |
| "Monthly Sales (6 months)" | "monthly flow" |
| "Profit Margin" | "kept per sale" |
| "Business Metrics" | "the numbers" |
| "Total Sales" | "orders" |
| "No Sales Data" | "nothing here yet" |
| "Start making sales to see..." | "once orders start flowing, you'll see everything here" |

#### 3. Savings Tracker (`screens/personal/SavingsTracker.tsx`)

| Current | New |
|---------|-----|
| "Portfolio" | "your accounts" |
| "Return" | "growth" |
| "Current Value" | "now" |
| "Initial Investment" | "put in" |
| "Gain" | "up" |
| "Loss" | "down" |

#### 4. Budget Planning (`screens/personal/BudgetPlanning.tsx`)

| Current | New |
|---------|-----|
| "Budget" (screen title) | "your plan" |
| "Allocated" | "set aside" |
| "Spent" | "used" |
| "Remaining" | "breathing room" |

#### 5. Subscriptions (`screens/personal/SubscriptionList.tsx`)

| Current | New |
|---------|-----|
| "Billing Cycle" | "repeats" |
| "Next Billing" | "coming up" |
| "Active Subscriptions" | "running" |
| "Monthly Cost" | "monthly total" |

#### 6. Seller Sub-screens (SeasonSummary, PastSeasons)

Fix all "revenue" → "came in", "profit" → "kept" instances.

#### 7. Account Overview (`screens/personal/AccountOverview.tsx`)

| Current | New |
|---------|-----|
| "Total Net Worth" | "everything you have" |
| "Budget Utilization" | "how your plan is going" |

---

### Tier 2 — Contextual Labels (computation + warm text)

These require reading data from stores to generate context-aware labels. No AI calls — pure TypeScript computation.

#### 8. Personal Dashboard Hero Reframe

**Current**: "Monthly Balance" → big RM number
**New**: Dynamic headline based on financial state

```
Logic (in component, using useFinancialInsights):
- savingsRate >= 20%  → "comfortable month so far"
- savingsRate >= 5%   → "steady month"
- savingsRate >= 0%   → "tight but managing"
- savingsRate < 0%    → "a stretch this month"

Sub-headline: "RM X came in · RM Y went out · {daysLeft} days left"
```

The hero number (RM balance) stays but becomes supporting detail under the headline.

#### 9. Budget Items — Contextual Progress Labels

**Current**: "RM 450 / RM 600" with progress bar
**New**: Add warm context line below each budget item

```
Logic per budget item:
- used < 50% of allocated → "plenty of room"
- used 50-80%             → "on track"
- used 80-95%             → "getting close"
- used > 95%              → "almost there"
- used > allocated        → "went past — by RM {overage}"

+ time context: "X days left this {period}"
```

#### 10. Transactions List — Section Headers with Context

**Current**: Date headers ("Mar 18, 2026")
**New**: Date + micro-insight

```
Logic per date section:
- dayTotal > 2x dailyAvg → "busier than usual"
- dayTotal < 0.5x dailyAvg → "quiet day"
- dayTotal ≈ dailyAvg → (just the date, no label)
- weekend flag → "weekend"
```

#### 11. Debt Tracking — Progress Framing

**Current**: Shows amounts owed/owing
**New**: Add progress context

```
For debts I owe:
- paidAmount / totalAmount as % → "X% clear"
- If due date approaching → "due in {N} days"

For debts owed to me:
- "waiting on RM {remaining}"
```

#### 12. Goals — Pace Calculation

**Current**: "RM 2,000 / RM 5,000 (40%)"
**New**: Add pace context

```
Logic:
- Calculate required monthly saving to hit deadline
- Compare to current monthly saving rate
- "on pace" / "ahead of schedule" / "need to pick up a bit"
- If no deadline: "40% there — nice"
```

---

### Tier 3 — AI Narrative Integration (Gemini-powered)

These follow the existing **Spending Mirror pattern**: one Gemini call, cached, displayed as warm text.

#### 13. Story Card System (NEW component)

**Purpose**: Rotates through contextual insights on dashboards. Replaces static stat displays with warm, contextual observations.

**Component**: `StoryCard`

```
Props:
  narrative: string       // 1-2 sentence observation
  icon: string           // Feather icon name
  accentColor: string    // semantic color for the icon
  onPress?: () => void   // optional tap-to-expand
```

**Visual**:
```
┌─────────────────────────────────┐
│  ◉  food is steady this month   │
│     — same rhythm as february   │
└─────────────────────────────────┘
```

- Subtle card (surface bg, thin border, RADIUS.lg)
- Icon circle (accent bg, 28px) left-aligned
- Text: TYPOGRAPHY.size.sm, relaxed line height, textSecondary color
- Tap: navigates to relevant detail screen or MoneyChat
- CALM animation: 300ms fadeIn on mount

**Rotation Logic** (in a new hook `useStoryCards`):
- Compute 3-5 candidate stories from current data
- Prioritize by: urgency > novelty > pattern
- Show 1 card at a time, user swipes or auto-rotate (8s)
- Cache computed stories for the session

**Story Types — Personal Mode**:

| Type | Trigger | Example |
|------|---------|---------|
| spending_rhythm | category avg vs this month | "food is steady this month — same as february" |
| savings_milestone | goal crosses 25/50/75% | "you're halfway to your new laptop fund" |
| debt_progress | debt payment made | "getting clear — RM 200 less to go on sarah's debt" |
| upcoming_bills | bills due within 3 days | "netflix and spotify coming up — RM 55 total" |
| quiet_streak | 2+ no-spend days | "two quiet days in a row — nice rhythm" |
| pace_check | mid-month velocity check | "12 days left and you've got RM 800 breathing room" |
| seasonal | Raya/CNY/Deepavali proximity | "raya is 3 weeks away — your spending usually picks up around now" |

**Story Types — Business Mode** (per sub-mode):

| Type | Sub-mode | Example |
|------|----------|---------|
| margin_trend | seller | "margins are holding at 45% — same as last season" |
| restock_reminder | seller/stall | "you've sold 80% of your nasi lemak stock" |
| peak_day | stall | "saturdays bring in 2x your average — this week too" |
| client_payment | freelancer | "sarah hasn't paid for the logo job — it's been 2 weeks" |
| shift_value | part-time | "your weekend shifts bring in RM 40 more per shift" |
| daily_yield | on-the-road | "weekdays averaging RM 180 — RM 30 better than last month" |
| cost_ratio | on-the-road | "petrol is 28% of what came in — a bit higher than usual" |

#### 14. Report Narratives

**Pattern**: Follow Spending Mirror — one Gemini call per report view, cached by month.

**New service**: `src/services/reportNarrative.ts`

```ts
export async function getReportNarrative(
  mode: 'personal' | 'seller' | 'stall' | 'freelancer' | 'parttime' | 'ontheroad' | 'mixed',
  monthData: ReportMonthData,
): Promise<{ ok: true; narrative: string } | { ok: false }>
```

**AI Prompt** (shared across modes, mode injected as context):

```
You are Echo. Write 2-3 warm sentences about what you notice in this month's
numbers. Be like a friend looking at the data together, not a financial advisor.

Rules:
- Plain text only, no markdown
- Never say "you should" or "I recommend"
- Use {currency} for amounts
- Reference specific numbers from the data
- Compare to last month if the data is there
- One observation about what's notable
- One observation about the overall picture
- Keep it under 50 words
- Use "kept"/"came in"/"went out" language
- Malaysian context (Manglish welcome)
```

**Display**: Rendered at the top of each Reports screen, below the title, before charts.

**Caching**: Store in `aiInsightsStore` with key `reportNarrative_{mode}_{monthKey}`. Same 24h TTL as Spending Mirror.

#### 15. Dashboard Greeting Narrative

**Current**: "good morning/afternoon/evening" + static stats
**New**: Keep time greeting, add 1-sentence context line

**Rule-based (no AI call)**:

```
Logic:
- First day of month → "fresh start — here's your new month"
- Last 3 days of month → "wrapping up {month} — {savingsRate}% kept so far"
- Big expense yesterday (>2x daily avg) → "yesterday was a big one — RM {amount} on {category}"
- No spending in 2+ days → "quiet stretch — {streak} days"
- Payday detected (large income txn) → "payday landed — RM {amount} came in"
- Default → "RM {breathing_room} breathing room · {daysLeft} days left"
```

No Gemini call needed — pure computation with warm copy.

---

## C. New & Modified Files

### New Files

| File | Purpose | Tier |
|------|---------|------|
| `src/components/common/StoryCard.tsx` | Reusable story card component | 3 |
| `src/hooks/useStoryCards.ts` | Computes prioritized story candidates | 3 |
| `src/services/reportNarrative.ts` | AI narrative for report screens | 3 |

### Modified Files — Tier 1 (label changes only)

| File | Changes |
|------|---------|
| `screens/personal/FinancialPulse.tsx` | Rename all section labels, wellness labels, pace labels |
| `screens/business/Reports.tsx` | Fix "Revenue"→"came in", "Profit"→"kept", "Margin"→"kept per sale" |
| `screens/personal/SavingsTracker.tsx` | "Portfolio"→"your accounts", "Return"→"growth", "Gain/Loss"→"up/down" |
| `screens/personal/BudgetPlanning.tsx` | "Budget"→"your plan", "Allocated"→"set aside", "Remaining"→"breathing room" |
| `screens/personal/SubscriptionList.tsx` | "Billing Cycle"→"repeats", "Next Billing"→"coming up" |
| `screens/personal/AccountOverview.tsx` | "Net Worth"→"everything you have", "Budget Utilization"→"how your plan is going" |
| `screens/seller/SeasonSummary.tsx` | "revenue"→"came in", "profit"→"kept" |
| `screens/seller/PastSeasons.tsx` | "revenue"→"came in", "profit"→"kept" |

### Modified Files — Tier 2 (contextual labels)

| File | Changes |
|------|---------|
| `screens/personal/Dashboard.tsx` | Dynamic hero headline, greeting narrative, StoryCard integration |
| `screens/personal/BudgetPlanning.tsx` | Contextual progress labels per budget item |
| `screens/personal/TransactionsList.tsx` | Date section headers with micro-insights |
| `screens/shared/DebtTracking.tsx` | Progress framing ("X% clear", "waiting on RM Y") |
| `screens/personal/Goals.tsx` | Pace context ("on pace", "ahead", "need to pick up") |

### Modified Files — Tier 3 (AI narrative)

| File | Changes |
|------|---------|
| `screens/personal/Dashboard.tsx` | StoryCard display (personal stories) |
| `screens/personal/Reports.tsx` | Report narrative at top |
| `screens/business/Dashboard.tsx` | StoryCard display (business stories) |
| `screens/business/Reports.tsx` | Report narrative at top |
| `screens/stall/Dashboard.tsx` | StoryCard display (stall stories) |
| `screens/business/freelancer/FreelancerReports.tsx` | Report narrative |
| `screens/business/mixed/MixedReports.tsx` | Report narrative |
| `screens/business/ontheroad/OnTheRoadReports.tsx` | Report narrative |
| `screens/business/parttime/PartTimeReports.tsx` | Report narrative |
| `store/aiInsightsStore.ts` | Add reportNarrative cache fields |

---

## D. Data Requirements Per Reframe

| Reframe | Store Data Needed | Already Available? |
|---------|-------------------|-------------------|
| Dashboard dynamic headline | savingsRate, daysLeft | ✅ useFinancialInsights |
| Dashboard greeting narrative | transactions (recent), subscriptions (upcoming) | ✅ personalStore |
| Budget contextual labels | budget allocated, actual spent, period dates | ✅ personalStore |
| Transaction section insights | daily spend avg, category totals | ✅ personalStore (compute) |
| Debt progress framing | paidAmount, totalAmount, dueDate | ✅ debtStore |
| Goal pace calculation | currentAmount, targetAmount, deadline, monthly saving rate | ✅ personalStore |
| Story Cards (personal) | all useFinancialInsights + debtStore + subscriptions | ✅ existing stores |
| Story Cards (business) | business stores per sub-mode | ✅ existing stores |
| Report narratives | monthly aggregates per mode | ✅ existing (computed in Reports screens) |

**No new store data needed** — all reframes use existing Zustand store data.

---

## E. Animation & Transition Specs

All animations follow CALM guidelines — subtle, warm, never jarring.

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| StoryCard mount | fadeIn + translateY(8→0) | 300ms | ease-out |
| StoryCard swipe | horizontal slide | 250ms | ease-in-out |
| Contextual label appear | fadeIn | 200ms | ease-out |
| Report narrative mount | fadeIn | 400ms | ease-out |
| Dynamic headline change | crossfade | 300ms | ease-in-out |
| Progress label update | none (instant, no animation on data change) | — | — |

No spring animations, no bounces, no overshoots. Calm = measured movement.

---

## F. Narrative Edge Cases

| Scenario | Handling |
|----------|---------|
| **New user (no data)** | Welcome narrative: "fresh start — add your first expense to get going". No story cards, no pulse. |
| **Low activity (< 5 txns/month)** | Normalize: "quiet month — that's fine". Don't show velocity or patterns. |
| **Overspending (spent > income)** | Gentle: "went out more than came in this month — RM {gap} gap". No alarm, no red. |
| **Business loss (costs > income)** | Honest: "costs were higher than what came in — RM {gap} difference". Focus on pattern: "last month was similar" or "unusual this month". |
| **Debt overdue** | Progress-focused: "been open for {days} days — RM {remaining} still to go" |
| **Goal behind pace** | Encouraging: "a bit behind — RM {needed}/month to catch up by {deadline}" |
| **All budgets exceeded** | Calm: "all plans went past this month — happens sometimes" |
| **Festive season** | Aware: "raya month — spending usually picks up around now" |
| **Payday** | Acknowledge: "payday landed — RM {amount} came in" |

---

## G. i18n Strategy

**Current state**: 2.7% i18n coverage (only Dashboard + Settings use `useT()`).

**Strategy for Outcome Layer**:
- **Tier 1 (label changes)**: Hardcode English for now (matches 97% of app)
- **Tier 2 (contextual labels)**: Hardcode English (computed strings are complex to translate)
- **Tier 3 (AI narratives)**: Language-agnostic (Gemini generates based on user's language preference — can be added later)
- **Future**: When i18n coverage expands, add `outcome` keys to `en.ts`/`ms.ts`

This avoids blocking the Outcome Layer on i18n adoption.

---

## H. Typography Addition

Add one new text style for AI-generated narrative content:

```ts
// In constants/index.ts TYPE object:
narrative: {
  fontSize: 14,
  lineHeight: 22,
  fontWeight: '400',
  letterSpacing: 0.1,
}
```

This sits between `insight` (compact) and body text. Used for StoryCard text, report narratives, and contextual labels.
