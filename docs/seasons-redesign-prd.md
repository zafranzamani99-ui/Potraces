# Seasons Redesign — Product Requirements Document

**Date**: 2026-05-25
**Status**: Planning / Design Review
**Author**: Claude (design session with Zafran)

---

## Executive Summary

Seasons are Potraces' killer feature — no competitor offers named, emotionally-resonant selling periods for small Malaysian sellers. But the current implementation treats seasons as an afterthought: a pill on the dashboard, a settings-like list page, and a 2247-line summary screen that tries to do everything. This redesign rethinks seasons as the **emotional spine** of the seller experience — from anticipation to celebration.

---

## 1. CURRENT STATE AUDIT

### What Exists

| Surface | What it does | Problem |
|---------|-------------|---------|
| **Dashboard pill** | Shows active season name or "no active season" as muted text | Dead — no progress, no energy, no reason to tap |
| **Dashboard hero** | "KEPT THIS MONTH" with month-over-month delta | Conflicts with season concept. Month != season. A Ramadan seller doesn't care about "this month" — they care about "this Ramadan" |
| **PastSeasons screen** | Timeline list + create modal | Feels like a settings page. "Seasons" as a nav destination is confusing — is it history? Management? Both? |
| **SeasonSummary (2247 lines)** | Stats, target, comparison, transfer, top products, orders list, costs list, export, end/delete — all in one scroll | Information overload. The emotional answer ("how much did I keep?") is buried among admin tasks. No celebration. No milestone. No story |
| **Season creation modal** | Name field + optional template from past season | Functional but uninspiring. No smart defaults. No pre-filled name suggestions |
| **Season type** | `{ id, name, startDate, endDate?, isActive, note?, costBudget?, revenueTarget?, createdAt }` | Missing: icon/emoji, color, type/category, daily snapshots, break-even tracking, goal milestones |

### Structural Problems

1. **Month vs Season conflict**: Dashboard hero shows "KEPT THIS MONTH" but the season could be 2 days or 3 months. When a season is active, the hero should show season data, not month data.

2. **Season is invisible during daily use**: When taking orders or logging costs, there's no season context. The seller doesn't see "this order is part of Ramadan 2026" or "you've made 47 orders this season."

3. **No progress narrative**: There's a target bar, but no story. No "you broke even on day 3" or "best day so far: Tuesday RM 890" or "you're ahead of last Ramadan at this point."

4. **Ending a season is bureaucratic**: Alert dialog with warnings about transfers and unpaid orders. Should feel like finishing a race — the warnings can be gentle nudges, not blockers.

5. **No reflection or sharing**: The copy-report and XLSX export are functional but not shareable. No visual summary card for WhatsApp. No "season wrapped" moment.

6. **PastSeasons is a dead-end**: It's a list you visit, look at, and leave. No insights across seasons ("your Ramadan income has grown 40% in 3 years"). No trends.

7. **One season at a time is too rigid**: A seller at a weekend market AND selling online can't have both. Current: "end this season first" error. Should at minimum allow marking a season as "paused" or support overlapping seasons.

---

## 2. THE SEASON LIFECYCLE — REDESIGNED

### Phase 1: BEFORE — Anticipation & Preparation

**What the user needs (functional)**:
- Know that a new season is coming (especially recurring ones like Ramadan, CNY)
- Set up products, pricing, cost estimates before the rush starts
- Import/clone setup from the same season last year
- Set a realistic income target based on past data

**What the user feels (emotional)**:
- Excitement ("Ramadan is coming, let's go!")
- Confidence ("I know what worked last time")
- Preparedness ("I have my products ready")

**What the UI should show**:
- **Smart season suggestions**: If they had "Ramadan 2025" last year, in late Feb/early March show a gentle card: "Ramadan is coming. Start preparing?" with pre-filled name "Ramadan 2026" and last year's stats as context ("Last year: 89 orders, RM 4,200 kept")
- **Season prep checklist** (optional, dismissible): Products updated? Costs estimated? Target set? Payment QR ready?
- **Clone with context**: "Copy from Ramadan 2025" should show what gets copied (products, cost categories, target) and what doesn't (orders, actual costs)

**Holes / missing features**:
- No recurring season awareness — app doesn't know Ramadan comes every year
- No season templates or archetypes ("bazaar night", "monthly market", "project sprint")
- No prep phase — season starts the moment you create it. Should support a "scheduled" state where you can prepare without the clock starting
- No cost estimation/budgeting before season starts

**Recommended additions**:
- `scheduledStartDate?: Date` on Season type — allows creating a season in advance
- `type?: 'bazaar' | 'market' | 'project' | 'ongoing' | 'custom'` — drives smart defaults
- `emoji?: string` — personal touch ("🌙" for Ramadan, "🏪" for market)
- `previousSeasonId?: string` — explicit link for year-over-year comparison
- Smart name suggestions based on calendar (detect Ramadan, CNY, Deepavali, Hari Raya) and past season names

---

### Phase 2: STARTING — The Launch Moment

**What the user needs (functional)**:
- Create a season with minimum friction (name + tap)
- Optionally set target, clone from previous, add note
- All subsequent orders and costs auto-tagged to this season

**What the user feels (emotional)**:
- Momentum ("let's do this")
- Clarity ("I know what I'm aiming for")

**What the UI should show**:
- **One-tap start**: Pre-filled name suggestion. Single "Start" button. Everything else is optional and expandable.
- **Launch animation**: Brief, satisfying — like starting a timer. The dashboard should visibly transform to show "season mode."
- **Dashboard transformation**: When a season starts, the hero metric should switch from "KEPT THIS MONTH" to "KEPT THIS SEASON" with the season name. This is the critical change.

**Current friction points**:
- Must navigate to PastSeasons screen to create (two taps from dashboard + it's not obvious)
- Name field is empty — seller has to think of a name from scratch
- No visual feedback that "you're now in season mode"

**Recommended flow**:
1. Dashboard: "no active season" pill → tap → bottom sheet with name suggestion + "Start" button
2. OR: PastSeasons screen → "+" button → same bottom sheet
3. On start: haptic + brief animation + dashboard hero morphs to show season name + kept amount
4. Season name suggestions: use date context + past names. "Ramadan 2026", "Weekend Market - May", "Batch #13" (auto-increment)

---

### Phase 3: DURING — The Daily Grind

This is where the current implementation is weakest. During a season, the season is nearly invisible.

**What the user needs (functional)**:
- See season progress at a glance on the dashboard
- Know how today compares to the season average
- Track progress toward target
- See break-even point
- Quick access to season-specific stats without leaving the dashboard

**What the user feels (emotional)**:
- Day 1-3: "Slow start, but building momentum"
- Mid-season: "Am I on track? Should I push harder?"
- Near end: "Almost there — sprint to the finish!"
- After a great day: "Yes! Best day yet!"

**What the UI should show**:

#### Dashboard (during active season)
The dashboard hero should fundamentally change when a season is active:

```
┌─────────────────────────────────────┐
│  🌙 Ramadan 2026          Day 12   │
│                                     │
│         RM 3,450                    │
│         kept so far                 │
│                                     │
│  ████████████░░░░░  68% of target   │
│                                     │
│  Today: RM 320 came in              │
│  Yesterday was your best day (RM 480)│
└─────────────────────────────────────┘
```

Key elements:
- **Season name + day counter** (not dates — "Day 12" is more motivating than "12 May")
- **Kept amount** as hero (not "came in" — seller cares about what they keep)
- **Target progress bar** (if target is set)
- **Daily context**: today's performance vs season average, best day callout
- **Break-even indicator**: "You covered your costs on Day 4" (appears once, remembered)

#### Season-aware order taking
When creating an order, show subtle season context:
- "Order #47 this season" (not just order number)
- After completing order: "RM 3,770 came in this season" (running total flash)

#### Mid-season check-ins (push or in-app)
- Day 7 of a 30-day season: "One week in! Here's where you stand..."
- When target is 50% reached: "Halfway to your target!"
- When they surpass last season's total: "You just passed last Ramadan's total!"
- On their best day ever: "Your best day yet! RM 480 came in today"

#### Season summary screen (during season — SIMPLIFIED)
Currently 2247 lines doing too much. Split into clear sections:

**Above the fold (no scrolling needed)**:
- Season name + duration ("Day 12 of Ramadan 2026")
- THE number: kept amount (big, animated)
- The math: came in - costs = kept (simple, one line)
- Target progress (if set)

**Below the fold (scroll to explore)**:
- Daily breakdown (mini bar chart of income per day)
- Top products (what's selling)
- Unpaid orders (action item, not just info)

**Moved elsewhere or removed**:
- Season comparison → separate "Season History" view (not inline in active summary)
- Transfer to personal → end-of-season flow (not mid-season)
- Export → action menu (gear icon), not a dedicated section
- Delete → action menu, gated behind confirmation

**Holes / missing features**:
- No daily breakdown chart during season
- No "best day" tracking
- No break-even calculation
- No season-aware order context
- No mid-season milestones or celebrations
- Dashboard doesn't change when season is active vs inactive
- No daily income snapshot storage (for trend charts)

**Recommended additions**:
- `dailySnapshots?: { date: string; income: number; costs: number; orderCount: number }[]` on Season type
- Break-even day calculation: find the day where cumulative income first exceeds cumulative costs
- "Best day" tracking: store and surface the highest-income day
- Dashboard hero that conditionally renders season vs month view

---

### Phase 4: ENDING — The Finish Line

**What the user needs (functional)**:
- End the season and see final results
- Handle unpaid orders (they don't disappear — can still collect later)
- Transfer kept money to personal wallet
- Export/share results

**What the user feels (emotional)**:
- Satisfaction ("I did it")
- Curiosity ("How did I do compared to last time?")
- Relief ("Season's over, time to rest")
- Pride ("Look what I achieved")

**What the UI should show**:

#### Ending trigger
- **Don't make them hunt for "End Season"**: After the last day of the season (based on typical duration or set end date), show a gentle dashboard nudge: "Ramadan 2026 has been going for 30 days. Ready to wrap up?"
- **Auto-suggest end**: If no orders for 3+ days after a busy season, show: "Looks like the season has wound down. End it?"
- **Manual end**: Still available in season summary, but not buried among other actions

#### The end-of-season ritual (NEW — replaces current Alert dialog)

This should be a **full-screen celebration flow**, not a modal. Think Spotify Wrapped meets fitness app achievement.

**Screen 1: The Reveal**
```
┌─────────────────────────────────────┐
│                                     │
│       Ramadan 2026                  │
│       is complete.                  │
│                                     │
│       You kept                      │
│       RM 4,200                      │
│       (animated count-up)           │
│                                     │
│       after 30 days,                │
│       124 orders,                   │
│       and 47 customers.             │
│                                     │
│                                     │
│       [See your story →]            │
│                                     │
└─────────────────────────────────────┘
```

**Screen 2: The Story** (swipeable cards or scroll)
- "Your best day was Day 14 (Saturday) — RM 680 came in"
- "You broke even on Day 4"
- "Kuih lapis was your best seller — 89 units"
- "You had 12 repeat customers"
- vs last year: "You kept 22% more than Ramadan 2025"

**Screen 3: Loose Ends**
- Unpaid orders: "3 orders (RM 240) are still unpaid. You can collect anytime — they won't disappear."
- Transfer: "Transfer RM 4,200 to your personal wallet?"
- Export: "Save report" / "Share summary card"

**Screen 4: Share Card** (optional)
A beautiful, shareable image card:
```
┌─────────────────────────────────────┐
│  🌙 Ramadan 2026                    │
│  ─────────────────                  │
│  124 orders · 47 customers          │
│  RM 4,200 kept                      │
│                                     │
│  Best seller: Kuih lapis (89 units) │
│  Best day: Saturday, Day 14         │
│                                     │
│  Potraces                           │
└─────────────────────────────────────┘
```

**Holes / missing features**:
- No celebration moment — current end is an Alert dialog
- No shareable summary card
- No story narrative
- Transfer is mid-summary, not part of end flow
- No auto-suggest for ending

**Current over-engineering to remove/relocate**:
- Comparison grid in SeasonSummary → move to season history
- Undo transfers button → move to action menu (rare action)
- Rename season → header tap (already exists, works fine)
- Season target edit → keep but simplify

---

### Phase 5: AFTER — Reflection & Growth

**What the user needs (functional)**:
- Look back at past seasons
- Compare seasons
- See growth trends over time
- Plan the next one

**What the user feels (emotional)**:
- Nostalgia ("Remember that crazy Ramadan?")
- Growth awareness ("I'm getting better at this")
- Motivation for next season

**What the UI should show**:

#### Season History (replaces PastSeasons)
Not a timeline list — a **gallery of achievements**:

```
┌─────────────────────────────────────┐
│  Your seasons                       │
│                                     │
│  ┌──────────┐  ┌──────────┐        │
│  │🌙Ramadan │  │🏪Weekend │        │
│  │ 2026     │  │ Market   │        │
│  │RM 4,200  │  │RM 1,800  │        │
│  │kept      │  │kept      │        │
│  │124 orders│  │42 orders │        │
│  └──────────┘  └──────────┘        │
│                                     │
│  Your journey                       │
│  ──────────                         │
│  Ramadan kept: 2024→2025→2026       │
│  RM 2,800 → RM 3,400 → RM 4,200    │
│  ↑ 50% growth over 3 years          │
│                                     │
└─────────────────────────────────────┘
```

Key elements:
- Season cards as achievement tiles, not list items
- Growth trend for recurring seasons (Ramadan year-over-year)
- Total lifetime stats: "You've tracked RM 45,000 across 12 seasons"

**Holes / missing features**:
- No cross-season trends or insights
- No recurring season linking (Ramadan 2024 → 2025 → 2026)
- No lifetime stats
- PastSeasons screen is just a list — no narrative

**Recommended additions**:
- Season tagging/grouping by recurring name
- Cross-season comparison view
- Lifetime stats card

---

## 3. EDGE CASES

### Forgotten seasons
**Problem**: Seller starts a season, then life happens. Season runs for 3 months with no activity.
**Solution**:
- After 7 days of no orders, show dashboard reminder: "Your season [name] has been quiet for a week. Still selling?"
- After 30 days of no orders, show gentle nudge: "End [name]? No orders in the last month."
- Never auto-end — that's the seller's decision. Just remind.
- Show "last order: 12 days ago" on the season pill

### One-night seasons
**Problem**: Pasar malam is one night. Creating and ending a season in 4 hours should feel natural, not bureaucratic.
**Solution**:
- When creating, offer "one-night" type that auto-suggests ending when the seller closes orders
- Season summary should adapt language: "tonight" not "this season", "4 hours" not "30 days"
- Quick-end: at end of night, single tap "wrap up tonight" from dashboard
- The end-of-season celebration should be proportional — a one-night season gets a shorter, simpler wrap-up

### Multiple businesses / overlapping seasons
**Problem**: A seller does weekend bazaar AND has an online store. Can't have two seasons.
**Solution (v1 — near term)**:
- Keep single active season but add "pause/resume" capability
- Paused season stops accumulating time but keeps all data
- Dashboard shows paused indicator

**Solution (v2 — future)**:
- Allow multiple active seasons with different tags
- Orders can be tagged to a specific season at creation time
- Dashboard shows combined or per-season toggle

### Season with no orders
**Problem**: Seller starts a season but never takes an order (maybe they were just testing).
**Solution**:
- Allow deleting seasons with 0 orders without ceremony
- If season has orders, require confirmation
- "Empty" seasons don't show in the gallery/history (or show dimmed with "no activity")

### Season across month boundary
**Problem**: Season starts March 25, ends April 10. Current dashboard shows "KEPT THIS MONTH" which splits the data.
**Solution**: When a season is active, dashboard hero shows season data, not month data. Period. The month view is still accessible in reports but the emotional number is always season-first.

### Currency and large numbers
**Problem**: Some sellers make RM 200 per season, others make RM 20,000. UI must work for both.
**Solution**:
- Use `toFixed(0)` for amounts over RM 100, `toFixed(2)` under RM 100
- For very large numbers, use compact format: "RM 12.4k"
- Percentage-based insights work at any scale ("you kept 65% of what came in")

---

## 4. THE EMOTIONAL JOURNEY — MAPPED

| Day | What happens | How they feel | What the app says |
|-----|-------------|--------------|-------------------|
| -7 | Sees suggestion card | Anticipation | "Ramadan is coming. Ready?" |
| 0 | Taps "Start" | Excitement | "Let's go! Ramadan 2026 has started." |
| 1 | First order | Momentum | "First order of the season! RM 45 came in." |
| 3 | Few orders | Uncertainty | "Day 3 — building momentum. 8 orders so far." |
| 4 | Costs exceed income | Worry | (No alarm — just show the math calmly. "You've spent RM 400 on ingredients so far.") |
| 5 | Income exceeds costs | Relief | "You've covered your costs. Everything from here is kept." |
| 7 | One week in | Checkpoint | "Week 1 done! 34 orders, RM 1,200 kept." |
| 14 | Halfway | Motivation | "Halfway through Ramadan. You're ahead of last year!" |
| 14 | Best day | Pride | "Your best day yet! RM 680 came in." |
| 20 | Target reached | Celebration | "You hit your target! Everything from here is bonus." |
| 28 | Winding down | Bittersweet | "2 days left. What a season." |
| 30 | Ends season | Satisfaction | Full celebration flow (see Phase 4) |
| 31+ | Views past season | Nostalgia | Gallery view with achievements |

---

## 5. FEATURE PRIORITIZATION

### Critical (Must have for redesign v1)

1. **Dashboard hero switches to season mode when season is active** — shows season kept, not month kept. This single change transforms the daily experience.

2. **Simplified season start** — bottom sheet from dashboard with smart name suggestion, one-tap start. Kill the "go to PastSeasons to create" flow.

3. **Break SeasonSummary into focused views**:
   - Active season dashboard card (progress, kept, today's stats)
   - Season detail screen (simplified — kept number + story)
   - End-of-season flow (separate, celebratory)

4. **End-of-season celebration** — full-screen flow replacing the Alert dialog. Even a simple version (big kept number + confetti haptic + share button) is 10x better than current.

5. **Break-even day tracking** — calculate and surface when cumulative income first exceeded cumulative costs. Simple to compute, emotionally powerful.

6. **Season-aware dashboard context** — show day counter ("Day 12"), today's income, season running total. Not just a pill with the name.

7. **Forgotten season reminders** — nudge after 7+ days of inactivity.

### Important (Should have — high impact, moderate effort)

8. **Daily income tracking within season** — store daily snapshots for trend visualization. Enables "best day" and daily bar chart.

9. **Smart season name suggestions** — detect calendar events (Ramadan, CNY), increment batch numbers, remember past names.

10. **Season comparison moved to history view** — remove from active season summary, create dedicated comparison in season history.

11. **Shareable summary card** — visual card for WhatsApp/Instagram. Simple design with season name, kept amount, top seller, duration.

12. **Season types/archetypes** — "bazaar night", "weekend market", "project", "ongoing". Drive default duration, language, and behavior.

13. **"Best day" surfacing** — track and celebrate the highest-income day within a season.

### Nice to have (Can wait — future iterations)

14. **Recurring season awareness** — link Ramadan 2024 → 2025 → 2026 for automatic year-over-year comparison.

15. **Season prep mode** — create season in advance with `scheduledStartDate`, do product/cost setup before clock starts.

16. **Pause/resume** — for sellers who need to pause a season without ending it.

17. **Multiple active seasons** — for sellers with multiple income streams.

18. **Season gallery view** — achievement-tile layout replacing timeline list.

19. **Push notification milestones** — "You just passed 50 orders this season!"

20. **Lifetime stats** — "You've tracked RM 45,000 across 12 seasons since joining Potraces."

21. **Season emoji/icon picker** — personal touch for the season identity.

22. **Cost estimation during prep** — budget costs before season starts based on last season's actuals.

---

## 6. WHAT EXISTS BUT SHOULDN'T (Over-engineering to Remove)

1. **Comparison grid in active SeasonSummary** — Useful concept, wrong location. Comparing during an active season creates anxiety. Move to post-season history view where it becomes reflective rather than stressful.

2. **Transfer to personal wallet in mid-season** — Creates accounting confusion. Transfer should be part of end-of-season ritual. If they need money mid-season, that's a different flow (withdrawal, not transfer).

3. **`costBudget` field** — Exists in the type but barely surfaced in UI. Either surface it properly (cost progress bar alongside revenue target) or remove it. Currently just noise in the data model.

4. **"Start new season" button in SeasonSummary** — Confusing context. You're viewing one season's details and there's a button to start a different season? Season creation should live on the dashboard and in season history, not inside another season's summary.

5. **Alert.prompt for season creation on iOS / Alert.alert fallback on Android** — This is the `handleStartNewSeason` in SeasonSummary. Should be a proper bottom sheet, not a platform-dependent alert.

6. **Undo transfers as a visible button** — Rare administrative action taking prime visual real estate. Move to three-dot action menu.

---

## 7. WHAT'S MISSING AND CRITICAL (in priority order)

1. **Season-first dashboard** — The dashboard must center the active season, not the calendar month. This is the single most impactful change.

2. **Celebration at close** — Ending a season must feel like an achievement, not a chore. Even a minimal version (full-screen kept reveal + haptic success) transforms the experience.

3. **Break-even visibility** — "You covered your costs on Day 4" is the single most reassuring insight for a small seller worried about whether it was worth it.

4. **Progressive disclosure in summary** — The answer to "berapa saya untung?" must be visible without scrolling. Everything else is optional detail.

5. **Season creation from dashboard** — One tap to start, not "navigate to PastSeasons → tap button → fill form."

6. **Inactivity nudges** — Forgotten seasons distort data and create confusion. Gentle reminders are essential.

7. **Daily performance tracking** — Without daily snapshots, there's no trend data, no "best day", no daily bar chart. This is the data foundation for everything else.

---

## 8. DATA MODEL CHANGES

### Season type (proposed additions)

```typescript
export interface Season {
  // Existing
  id: string;
  name: string;
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
  note?: string;
  costBudget?: number;
  revenueTarget?: number;
  createdAt: Date;

  // NEW — identity
  emoji?: string;                    // "🌙", "🏪", "🎨"
  type?: SeasonType;                 // drives smart defaults

  // NEW — tracking
  breakEvenDay?: number;             // day number when income > costs (computed, cached)
  bestDayDate?: Date;                // date of highest income day
  bestDayAmount?: number;            // amount on best day

  // NEW — lifecycle
  status?: 'scheduled' | 'active' | 'paused' | 'ended';  // replaces isActive boolean
  scheduledStartDate?: Date;         // for prep mode
  pausedAt?: Date;                   // when paused

  // NEW — linking
  previousSeasonId?: string;         // explicit link for comparison
  recurringName?: string;            // "Ramadan" — groups seasons across years
}

type SeasonType = 'bazaar' | 'market' | 'project' | 'ongoing' | 'custom';

// NEW — daily tracking
export interface SeasonDailySnapshot {
  date: string;                      // "2026-03-15"
  seasonId: string;
  income: number;                    // paid orders total
  costs: number;                     // ingredient costs
  orderCount: number;
  cumulativeIncome: number;
  cumulativeCosts: number;
  cumulativeKept: number;
}
```

### Store additions needed

```typescript
// sellerStore additions
updateSeasonBreakEven: (seasonId: string, day: number) => void;
updateSeasonBestDay: (seasonId: string, date: Date, amount: number) => void;
pauseSeason: (seasonId: string) => void;
resumeSeason: (seasonId: string) => void;
getSeasonDailySnapshots: (seasonId: string) => SeasonDailySnapshot[];
addSeasonDailySnapshot: (snapshot: SeasonDailySnapshot) => void;
```

---

## 9. SCREEN INVENTORY (PROPOSED)

### Modified screens
1. **Dashboard.tsx** — Season-first hero when season is active; quick-start bottom sheet
2. **SeasonSummary.tsx** — Drastically simplified; split into sub-views
3. **PastSeasons.tsx** — Renamed to "Season History"; gallery layout

### New screens/components
4. **SeasonStartSheet.tsx** — Bottom sheet for creating a season (smart defaults, name suggestions)
5. **SeasonEndFlow.tsx** — Full-screen multi-step celebration flow
6. **SeasonShareCard.tsx** — Component that renders a shareable summary image
7. **SeasonDashboardCard.tsx** — Component for the dashboard's season section during active season
8. **SeasonMilestone.tsx** — Toast/card component for milestone notifications

---

## 10. INSPIRATION & REFERENCES

| App | What to steal | How it applies |
|-----|--------------|----------------|
| **Strava** | Activity completion screen with stats, achievement badges, share card | End-of-season celebration |
| **Duolingo** | Streak counter, daily check-in, celebration animations | Day counter, daily progress |
| **Apple Fitness** | Ring progress, monthly challenges, award tiles | Target progress bar, season gallery |
| **Spotify Wrapped** | Yearly recap with swipeable story cards | End-of-season story flow |
| **YNAB** | "Age of money" single-metric focus, month boundary handling | Season-first dashboard, break-even day |
| **Headspace** | Calm celebration (not over-the-top), streak milestone | Warm, non-corporate celebration tone |
| **Shopify** | Live sales counter during flash sales | Season running total on dashboard |

---

## 11. SUCCESS METRICS

How we know the redesign worked:

1. **Season adoption rate** increases — more sellers create seasons (currently probably low because it's hard to find)
2. **Season completion rate** increases — fewer forgotten/abandoned seasons
3. **Time to first order in season** decreases — faster setup means faster selling
4. **Share rate** — sellers share end-of-season cards (new metric)
5. **Repeat season creation** — sellers who finish one season start another (stickiness)
6. **Dashboard engagement during season** — more dashboard views during active season (season context makes dashboard more useful)

---

## 12. IMPLEMENTATION SEQUENCE

Recommended build order (each phase is shippable independently):

### Phase A: Season-first dashboard (highest impact, moderate effort)
- Dashboard hero shows season data when season is active
- Day counter on season pill
- Season quick-start bottom sheet from dashboard
- **Est: 2-3 days**

### Phase B: Simplified season summary (reduce complexity)
- Break SeasonSummary into focused sections
- Move comparison to history view
- Move transfer to end flow
- Add break-even calculation
- **Est: 2-3 days**

### Phase C: End-of-season celebration (emotional impact)
- Full-screen reveal flow
- Story cards (best day, top product, vs last season)
- Transfer step
- Share card generation
- **Est: 3-4 days**

### Phase D: Season history gallery (reflection)
- Gallery layout replacing timeline
- Cross-season trends
- Recurring season grouping
- **Est: 2-3 days**

### Phase E: Smart features (polish)
- Smart name suggestions
- Inactivity nudges
- Daily snapshot tracking
- Season types
- **Est: 3-4 days**

**Total estimated effort: 12-17 days**

---

## Appendix: Key Questions for Design Review

1. Should the dashboard hero ALWAYS show season when one is active, or should the seller be able to toggle between season view and month view?

2. Is "pause/resume" actually needed in v1, or can we ship with the current "one active season" constraint?

3. How far should the celebration go? Full Spotify Wrapped style (5+ screens) or simple reveal (2 screens)?

4. Should daily snapshots be computed on-the-fly from orders/costs or stored separately? (Trade-off: computation cost vs storage)

5. Should transfers be part of end-of-season flow ONLY, or should mid-season transfer remain available?

6. For the share card: should it be a rendered image (React Native ViewShot) or a pre-designed template with dynamic text?

7. Is multiple active seasons a genuine near-term need, or is it a theoretical edge case we can defer?
