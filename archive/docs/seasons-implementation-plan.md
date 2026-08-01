# Seasons — Implementation Plan

**Date**: 2026-05-25
**Source**: derived from `docs/seasons-redesign-prd.md`, grounded in actual code.
**Goal**: make seasons feel complete — profit *now* (daily use + closure) and *later* (retention + growth).

## Locked Decisions
1. Dashboard is **season-first when a season is active**. No toggle. Month view stays when no season.
2. End-of-season = **one focused scrollable flow** (reveal → story → loose ends). Not 5-screen Wrapped.
3. Mid-season transfer **kept but moved** to an action menu. Not in the hero.
4. Pause/resume → deferred.
5. Multiple active seasons → deferred.

## Data Philosophy
- **Compute, don't store.** Break-even day, best day, daily series, day counter — all derived live from `getSeasonOrders` + `getSeasonCosts` in a single hook. No `SeasonDailySnapshot` table (avoids sync complexity, cache invalidation, tombstones).
- Only 2 additive optional fields on `Season`: `emoji?: string`, `recurringName?: string`. Both optional → no migration blocker; cloud-column sync is a deferred follow-up (persists locally meanwhile).
- `addSeason` switches from `Date.now().toString()` to `newId()` (collision-safe, consistent with rest of app).

## Code Facts (verified)
- `Season`: `{ id, name, startDate, endDate?, isActive, note?, costBudget?, revenueTarget?, createdAt }` — `src/types/index.ts:169`
- `getSeasonStats(seasonId)` → `{ totalOrders, totalIncome, totalCosts, kept, unpaidCount, unpaidAmount }` — `sellerStore.ts:804` (paid orders only for income)
- `getSeasonOrders` / `getSeasonCosts` — cached, `sellerStore.ts:786,795`
- Orders carry `seasonId, isPaid, totalAmount, items[], createdAt`; costs carry `seasonId, amount, date`
- Dashboard hero hardwired to month: `Dashboard.tsx:619-743` ("KEPT THIS MONTH")
- Season pill (active + empty): `Dashboard.tsx:577-617`

---

## PHASE 0 — Foundation (shared engine)
Everything else consumes this. Build first.

- **NEW `src/hooks/useSeasonInsights.ts`** — `useSeasonInsights(season)` returns:
  - `dayNumber` (days since start, 1-based), `totalDays` (if endDate or today)
  - `kept, income, costs, targetPct` (reuse getSeasonStats)
  - `breakEvenDay` — first day cumulative paid income ≥ cumulative costs (or null)
  - `bestDay` — `{ date, amount }` highest single-day paid income
  - `dailySeries` — `[{ date, income, costs, orderCount, cumulativeKept }]`
  - `todaysCameIn`, `vsAverage` (today vs season daily avg)
  - `topProducts` — ranked by revenue (reuse existing summary logic)
- **`src/types/index.ts`** — add `emoji?`, `recurringName?` to `Season`.
- **`sellerStore.ts`** — `addSeason` uses `newId()`; accept `emoji`/`recurringName`.

## PHASE 1 — Season-first dashboard (biggest "now" win)
- **NEW `src/components/seller/SeasonHeroCard.tsx`** — when `activeSeason`, renders: emoji + name + "Day N" · big kept (animated count-up) · target progress bar (if target) · break-even chip ("covered costs · day 4") · today line. Replaces month hero while a season is active.
- **`Dashboard.tsx`** — conditional: `activeSeason ? <SeasonHeroCard/> : <existing month hero>`. Keep QR + shop-link buttons.
- **Empty pill** → tap opens `SeasonStartSheet` (not navigate to PastSeasons).
- **NEW `src/components/seller/SeasonStartSheet.tsx`** — bottom sheet (fade, KAV per house rules). Pre-filled smart name, optional target, "start" button → `addSeason`. Basic name suggestion in P1; enhanced in P5.

## PHASE 2 — Simplified SeasonSummary
Refactor `SeasonSummary.tsx` (2247 lines) for progressive disclosure.
- **Above fold**: name + "Day N" · hero kept (animated) · `came in − costs = kept` one-liner · target bar · break-even line.
- **Mid**: daily mini bar chart (from `dailySeries`) · top products · unpaid orders (actionable card, not just info).
- **Action menu** (header 3-dot/gear): rename · set target · view orders · view costs · copy/export report · transfer to personal · end season · delete.
- **Removed from active summary**: comparison grid (→ Phase 4 history). Transfer leaves the hero (→ menu + end flow).

## PHASE 3 — End-of-season celebration
- **NEW `src/screens/seller/SeasonEndFlow.tsx`** — full-screen, replaces the end Alert:
  1. **Reveal** — "Ramadan 2026 is complete." + kept count-up + "N days · N orders · N customers"
  2. **Story** — best day · broke even day X · best seller · repeat customers · vs last season (if recurring match)
  3. **Loose ends** — unpaid notice ("collect anytime, won't disappear") · transfer to personal · save report / share card
- **NEW `src/components/seller/SeasonShareCard.tsx`** — styled summary card. Verify `react-native-view-shot` + `expo-sharing`; if absent, fall back to existing copy-text share. (Dependency check before build.)
- Wire `endSeason` to route into this flow instead of `Alert`.

## PHASE 4 — Season History (replaces PastSeasons)
- Rework `PastSeasons.tsx` → achievement-tile gallery (emoji, name, kept, orders per tile).
- **Recurring growth**: group by `recurringName` → "Ramadan kept: 2024 → 2025 → 2026" trend line.
- Lifetime stat strip ("tracked RM X across N seasons"). Comparison lives here now.

## PHASE 5 — Smart layer (polish / stickiness)
- **Smart name suggestions**: detect calendar events (Ramadan, Hari Raya, CNY, Deepavali via date windows) + batch auto-increment + reuse past `recurringName`.
- **Inactivity nudge**: dashboard hint when active season has no order in 7+ days.
- **emoji picker** in start sheet; auto-assign by detected event (🌙 Ramadan, 🏪 market).

---

## Build Order & Checkpoints
- **0 → 1 together** (foundation + dashboard) = the biggest immediate payoff. **Verify in app before continuing.**
- Then **2**, then **3** (now-complete: daily use + closure).
- Then **4**, **5** (later: retention + growth).
- Each phase is independently shippable. tsc clean + in-app check per phase.

## House Rules to honor (from memory)
- ScrollView/FlatList from `react-native-gesture-handler`; modal/scroll perf props; `keyboardShouldPersistTaps`.
- Bottom sheets: `animationType="fade"`, transparent, KAV on iOS; choice overlays = centered card.
- `makeStyles(C)` + `useMemo`, dark-mode via `useCalm`. No red. Warm language ("kept", "came in"). Lowercase seller labels. BM/EN parity in i18n.
- No ellipsis truncation. No dropdowns/collapsibles unless asked.
