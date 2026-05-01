# Prompt 3 — Outcome-Framed UI: Phase 3 Implementation Plan

> Ordered task list, zero code
> Dependencies marked, complexity estimated
> Grouped: Quick Wins → Medium → Heavy

---

## Tier 1 — Quick Wins (label-only changes)

These touch ONLY string literals. No layout, no logic, no new components. Each is a 10-30 minute find-and-replace task.

| # | Task | File | Depends On | Size | Regression Risk |
|---|------|------|-----------|------|-----------------|
| 1 | Fix vocabulary violations: "Total Revenue"→"total came in", "Total Profit"→"total kept", "Profit Margin"→"kept per sale", "Monthly Sales"→"monthly flow" | `screens/business/Reports.tsx` | — | S | Low |
| 2 | Fix vocabulary: "revenue"→"came in", "profit"→"kept" in season display | `screens/seller/SeasonSummary.tsx` | — | S | Low |
| 3 | Fix vocabulary: "revenue"→"came in", "profit"→"kept" in past seasons | `screens/seller/PastSeasons.tsx` | — | S | Low |
| 4 | Rename Financial Pulse labels: "Financial Wellness Score"→"your money pulse", "CASH FLOW"→"in & out", "SPENDING PACE"→"your pace", "WHERE IT GOES"→"where it went", "WEEKLY PATTERN"→"your week", "UPCOMING BILLS"→"coming up", wellness tier labels, velocity labels | `screens/personal/FinancialPulse.tsx` | — | S | Low |
| 5 | Rename Savings Tracker labels: "Portfolio"→"your accounts", "Return"→"growth", "Current Value"→"now", "Initial Investment"→"put in", "Gain"→"up", "Loss"→"down" | `screens/personal/SavingsTracker.tsx` | — | S | Low |
| 6 | Rename Budget labels: "Allocated"→"set aside", "Spent"→"used", "Remaining"→"breathing room" | `screens/personal/BudgetPlanning.tsx` | — | S | Low |
| 7 | Rename Subscription labels: "Billing Cycle"→"repeats", "Next Billing"→"coming up", "Active Subscriptions"→"running" | `screens/personal/SubscriptionList.tsx` | — | S | Low |
| 8 | Rename Account Overview labels: "Total Net Worth"→"everything you have", "Budget Utilization"→"how your plan is going" | `screens/personal/AccountOverview.tsx` | — | S | Low |
| 9 | Rename Reports chart labels: "Income vs Expenses"→"in vs out", "Expenses by Category"→"where it went", "Top Categories"→"biggest slices" | `screens/personal/Reports.tsx` | — | S | Low |
| 10 | Fix Inventory screen name in navigation: "Inventory"→"Products" | `screens/business/Inventory.tsx` + navigator | — | S | Low — check nav references |
| 11 | Empty state rewrites: "No Sales Data"→"nothing here yet", "Start making sales..."→"once orders start flowing, you'll see everything here" | `screens/business/Reports.tsx` | #1 | S | Low |

**Tier 1 total: 11 tasks, all Size S, all parallelizable (no dependencies between them except #11→#1)**

---

## Tier 2 — Medium (computation + warm labels)

These add contextual text based on existing store data. No AI calls. Requires reading from `useFinancialInsights` or store data and computing warm labels.

| # | Task | File | Depends On | Size | Regression Risk |
|---|------|------|-----------|------|-----------------|
| 12 | Dashboard dynamic hero headline: replace static "Monthly Balance" with computed headline ("comfortable month", "steady month", "tight but managing", etc.) based on savingsRate + daysLeft | `screens/personal/Dashboard.tsx` | — | M | Medium — hero card is prominent |
| 13 | Dashboard greeting narrative: add 1-sentence context line under greeting ("payday landed", "quiet stretch", "RM X breathing room · Y days left") — rule-based, no AI | `screens/personal/Dashboard.tsx` | #12 | M | Low |
| 14 | Budget contextual progress labels: add warm text per budget item ("plenty of room", "on track", "getting close", "went past — by RM X") + "X days left" | `screens/personal/BudgetPlanning.tsx` | #6 | M | Low |
| 15 | Transactions date headers with micro-insight: "busier than usual" / "quiet day" / "weekend" based on daily avg comparison | `screens/personal/TransactionsList.tsx` | — | M | Medium — list rendering perf |
| 16 | Debt progress framing: add "X% clear" badge on debts, "waiting on RM Y" for owed-to-me, "due in N days" for approaching deadlines | `screens/shared/DebtTracking.tsx` | — | M | Low |
| 17 | Goals pace context: add "on pace" / "ahead" / "need to pick up — RM X/month" based on deadline + current rate | `screens/personal/Goals.tsx` | — | M | Low |
| 18 | Add `TYPE.narrative` text style to constants | `src/constants/index.ts` | — | S | None |

**Tier 2 total: 7 tasks (6 Medium, 1 Small)**

---

## Tier 3 — Heavy (AI narrative + new components)

These involve new components, new services, and Gemini API calls. Follow the existing Spending Mirror pattern.

| # | Task | File(s) | Depends On | Size | Regression Risk |
|---|------|---------|-----------|------|-----------------|
| 19 | Create `StoryCard` component: icon circle + narrative text + tap handler + fadeIn animation | `src/components/common/StoryCard.tsx` | #18 | M | None (new file) |
| 20 | Create `useStoryCards` hook: compute 3-5 story candidates from store data (personal mode), prioritize by urgency/novelty, return top story | `src/hooks/useStoryCards.ts` | #19 | L | None (new file) |
| 21 | Integrate StoryCard on Personal Dashboard: show top story card below greeting, above quick actions | `screens/personal/Dashboard.tsx` | #19, #20 | M | Low — additive |
| 22 | Add business story types to `useStoryCards`: seller (margin, restock), stall (peak day), freelancer (client payment), part-time (shift value), on-the-road (cost ratio) | `src/hooks/useStoryCards.ts` | #20 | L | None |
| 23 | Integrate StoryCard on Business Dashboard | `screens/business/Dashboard.tsx` | #19, #22 | M | Low — additive |
| 24 | Integrate StoryCard on Stall Dashboard | `screens/stall/Dashboard.tsx` | #19, #22 | M | Low — additive |
| 25 | Create `reportNarrative.ts` service: Gemini call for 2-3 sentence report narrative, cached by mode+month in aiInsightsStore | `src/services/reportNarrative.ts` | — | M | None (new file) |
| 26 | Add report narrative cache fields to aiInsightsStore | `src/store/aiInsightsStore.ts` | #25 | S | Low |
| 27 | Integrate report narrative on Personal Reports | `screens/personal/Reports.tsx` | #25, #26, #9 | M | Low — additive |
| 28 | Integrate report narrative on Business Reports | `screens/business/Reports.tsx` | #25, #26, #1 | M | Low — additive |
| 29 | Integrate report narrative on Freelancer Reports | `screens/business/freelancer/FreelancerReports.tsx` | #25, #26 | M | Low |
| 30 | Integrate report narrative on remaining Report screens (Mixed, OTR, Part-time) | 3 report files | #25, #26 | M | Low |

**Tier 3 total: 12 tasks (2 Large, 9 Medium, 1 Small)**

---

## Execution Summary

| Tier | Tasks | Effort | Can Start |
|------|-------|--------|-----------|
| Tier 1 (labels) | 11 | ~3 hours | Immediately, all parallel |
| Tier 2 (contextual) | 7 | ~5 hours | After Tier 1 for overlapping files, otherwise parallel |
| Tier 3 (AI + components) | 12 | ~8 hours | After Tier 2 for dashboard, otherwise independent |
| **Total** | **30** | **~16 hours** | |

---

## Dependency Graph

```
Tier 1 (all parallel):
  #1 ─→ #11 (empty states after label fix)
  #2, #3, #4, #5, #6, #7, #8, #9, #10 (independent)

Tier 2:
  #18 (TYPE.narrative) ── independent
  #12 → #13 (hero before greeting)
  #6 → #14 (budget labels before contextual)
  #15, #16, #17 (independent)

Tier 3:
  #18 → #19 (narrative type before StoryCard)
  #19 → #20 → #21 (component → hook → dashboard integration)
  #20 → #22 → #23, #24 (personal stories → business stories → integrations)
  #25 → #26 → #27, #28, #29, #30 (service → store → screen integrations)
```

---

## Recommended Start Order

1. **Batch 1** (Tier 1, all at once): Tasks #1-#11 — immediate vocabulary fixes
2. **Batch 2** (Tier 2 foundations): Tasks #18, #12, #13 — narrative type + dashboard reframe
3. **Batch 3** (Tier 2 remaining): Tasks #14-#17 — contextual labels across screens
4. **Batch 4** (Tier 3 components): Tasks #19, #20 — StoryCard + hook
5. **Batch 5** (Tier 3 integrations): Tasks #21-#24 — StoryCards on dashboards
6. **Batch 6** (Tier 3 AI): Tasks #25-#30 — report narratives

Each batch is a natural commit point.

---

## Verification Checklist

After each batch:
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Visual check on affected screens (dark + light mode)
- [ ] No banned words remaining (grep for: revenue, profit, loss, inventory, ROI)
- [ ] StoryCard renders correctly with 0, 1, and 5+ stories
- [ ] Report narrative loads, caches, and displays correctly
- [ ] AI calls respect premium quota + cooldown
- [ ] No layout regressions on small screens (iPhone SE)
