# Savings & Investments — Redesign, Coaching & Echo Integration

**Date:** 2026-07-12
**Branch:** `feat/savings-investments-redesign`
**Screen:** `src/screens/personal/SavingsTracker.tsx` (route `SavingsTracker`, header "Savings & Investments")
**Status:** Design approved (direction + Echo integration + monetization). Ready for implementation plan.
**Mockup:** static reference published as an Artifact (light Savings / dark Investments / quick Echo chat).

---

## 1. Goal

Take the existing Savings & Investments screen from a **flat, buggy ledger** to an **intentional coach** — same data, rebuilt in the neu design system, with the visible bugs fixed, a coaching layer that tells the user what to do next, and Echo (the AI money chat) woven in so a user can ask about — or update — their money in plain words.

Two standing principles apply (see memory `app-purpose-help-and-monetize`): every element should **genuinely help the user** and, where tasteful, **surface a monetization hook** for the business.

## 2. Scope

**In scope**
- Full visual migration to the neu kit (`useNeu`, `NeuButton`, `NeuPressable`, `NeuIconButton`, `FAB`) — light + dark, verified on device.
- Structural split: **Savings ⇄ Investments** segmented control (reusing `DebtSegmentedControl`), driven by a per-type **risk class**.
- Fix the account **type → icon/label/colour** mapping (kills the "Other / Other" display).
- A **coaching band** engine (rotating, context-aware nudges).
- **Echo integration**: an "Ask Echo about your savings" quick-chat (bar + chips + `EchoInlineChat` sheet, seeded with a live savings snapshot) and **chat-to-log** via the existing `update_savings` / `add_savings_account` actions.
- **Bug sweep** (§9).
- **Monetization**: Echo quick-chat gated to Plus; graceful account-cap upsell; optional, off-by-default "Ways to grow" affiliate card.
- **Decompose the 2077-line monolith** into focused units (§7).
- Full EN/MS i18n parity, a11y, haptics.

**Out of scope (v1)** — explicitly not built now
- Live market prices / FX for investments (valuation stays **manual snapshots**).
- A real holdings model (units × price, per-lot cost basis).
- Compound-interest / CAGR / XIRR engines (projections stay **linear**: `currentValue × annualRate/100`, plus recent-trend goal ETA).
- Merging the separate **My Goals** screen (`Goals.tsx`) into this screen (we link, not absorb).
- New Echo write-actions beyond the two that already exist (no chat delete/rename, no dividend/withdrawal snapshot via chat).
- Drag-to-reorder for "manual" sort (kept as insertion order; may remove the dead `reorderAccounts`/`setTarget` wiring).

## 3. Design principles (locked system — do not re-derive)

- Colours only via `useCalm()` (`CALM` / `CALM_DARK`); memoized `makeStyles(C)`. Olive `accent` is the single screen accent; `gold`/`bronze`/`positive` only as per-item tints. No red, no green-as-success.
- Neu scales: **`raisedSoft`** for cards/rows, **`insetSoft`** for inputs/search, **`raised`/`inset`** for small tiles/chips, **`well`** for icon circles. Container-tone rule: `useNeu()` on the screen (`C.background`), `useNeu(C.surface)` inside sheets. No hand-rolled shadows; no `borderWidth` on neu buttons; outer shadows never inside `overflow:hidden`.
- Money always `fontVariant:['tabular-nums']`; currency = `useSettingsStore(s=>s.currency)` (default `RM`); format via `formatters.ts`; write via `roundMoney`.
- Segmented/status toggles → **glass** (`DebtSegmentedControl`), never neu.
- Reference implementations to mirror: `WalletManagement.tsx` (summary hero + grouped sections + form sheet), `DebtTracking.tsx` (hero tiles + segmented + rows + FAB + add/edit sheet), `Calculator.tsx` (`BottomSheet` + `ActionRow`).

## 4. Screen architecture

Root: plain `<View flex:1 bg:C.background>` (nav header owns the top inset; consume only `insets.bottom`). Single `<ScrollView>` (`RefreshControl` optional). Vertical order:

1. **Hero — total portfolio** (`neu.raisedSoft` on `C.background`). Label "Total value" → big amount (light weight, tabular-nums) → "since last check" pill (`sinceLastCheck`) → area `Sparkline` → time-range pills `1M/3M/6M/1Y/All` with period-change % → stats row **Invested · Growth · Return** (fixes the mislabel).
2. **Ask Echo bar + chips** — `neu.insetSoft` pill "Ask Echo about your savings…" with spark + mic + a `◆ Plus` badge; a horizontal chip row of savings prompts. Opens the Echo sheet (§8).
3. **Segmented control — Savings ⇄ Investments** (`DebtSegmentedControl`, tabs carry counts). Switching filters the account list, the allocation card, and the coaching band's inputs.
4. **Coaching band** (`neu.raisedSoft`) — the single most useful nudge for the active tab, with a primary action + "Ask Echo" (§6).
5. **Allocation — "where your {savings|investments} live"** — bars per **type** with real name + colour + dot (fixes "Other/Other"). Only when the active tab has ≥2 accounts.
6. **Sort chips** — Value / Growth / Recent + count (only when >1 account).
7. **Account cards** (`neu.raisedSoft`) — icon well (per-type icon+colour) + name + type/rate line + overflow (edit); value + return pill; put-in / gain sub-line; `Sparkline`; projected-earnings pill; goal/target `ProgressBar` + ETA; footer (relative last-updated + Update / History).
8. **Ways to grow** (Investments tab, optional/off-by-default) — a single flagged affiliate card (§ monetization).
9. **FAB** (`+`, bottom-right, `Math.max(SPACING.xl, insets.bottom+SPACING.md)`) → Add Account. At the 5-account cap it opens the **Plus upsell** instead of a dead wall. Empty state → `EmptyState` (`m/piggy-bank`).
10. Three sheets: **Add/Edit account**, **Update value**, **History** — extracted from the monolith (§7), built on `BottomSheet` / the `AddEditWalletModal` sheet shell, with `NeuButton` as the only primary CTA and `ModalToastHost` mounted.
11. **Echo sheet** — `EchoInlineChat` (§8).
12. `ScreenGuide` overlay retained (id `guide_savings`).

## 5. Data-model changes

Small, additive. The `SavingsAccount` shape (`types/index.ts:1415`) is unchanged.

- **Investment-type registry** — new `src/screens/personal/savings/investmentTypes.ts` (or extend `INVESTMENT_CATEGORIES` in `constants/index.ts:324`). One entry per type id (`tng_plus, robo_crypto, esa, bank, asb, tabung_haji, stocks, gold, other`, plus `custom_*`) with `{ id, name, nameBm, icon (CategoryIcon spec), color, class: 'savings' | 'investment' }`. A `getTypeInfo(type)` resolver returns the entry (falling back to a generic "Other" that is still class-tagged), replacing today's broken lookup. `class` drives the segmented split; unknown/`other`/`custom_*` default to **savings** (safer bucket) unless overridden.
- No store schema change, no migration, no Supabase column change (the redesign reads existing fields). `snapshotType` stays jsonb-only.
- Optional cleanup: remove dead `setTarget` import and the unused `reorderAccounts`/`accountOrder` path if "manual" sort is dropped.

## 6. The coaching engine

New **pure** module `src/screens/personal/savings/coachingEngine.ts` — input: `{ accounts, portfolio, breakdown, tab, currency, avgMonthlySpend }`; output: an ordered list of candidate nudges; the band renders the top one. Pure = unit-testable with `tsx` (no native imports), per the repo's pure/native split convention.

Nudge candidates (priority order, first applicable wins per tab):
1. **Stale reminder** — most-stale account not updated in N days → "Update now" (reuses existing `staleAccount` logic).
2. **Emergency-fund runway** (Savings tab) — `monthsCovered = totalSavingsValue / avgMonthlySpend` (avg from `calculateBuffer.ts` / transaction history). Below a 6-month target → "RM X more to a 6-month net" + "Add funds" + "Ask Echo".
3. **Concentration** (Investments tab) — if one type/account ≥60% of the tab's value → "spreading lowers risk" + "See a balanced mix" + "Ask Echo".
4. **Next milestone** — nearest un-hit milestone from the `MILESTONES` ladder or a per-account `target` → "RM X to RM Y" + ETA (reuse the recent-3-month trend projection).
5. **Best performer / added-this-month** — positive fallback.

Each nudge is `{ id, icon, tint, title, body, primaryAction?, echoPrompt }`. `echoPrompt` is the string handed to the Echo sheet's `autoPrompt` when "Ask Echo" is tapped.

## 7. Module decomposition

Replace the 2077-line monolith with focused units under `src/screens/personal/savings/`:

| File | Responsibility | Depends on |
|---|---|---|
| `SavingsTracker.tsx` (screen) | Orchestration, data memos, tab state, sheet visibility | stores, the units below |
| `savingsMath.ts` (pure) | `computePortfolio`, `computeBreakdown`, projections, runway | types, `roundMoney` |
| `coachingEngine.ts` (pure) | Nudge selection (§6) | `savingsMath`, types |
| `savingsSnapshot.ts` (pure) | `buildSavingsSnapshot()` for Echo (§8) | types, formatters |
| `investmentTypes.ts` | Type registry + `getTypeInfo` (§5) | constants |
| `SavingsHero.tsx` | Hero card + sparkline + ranges + stats | neu, Sparkline |
| `CoachingBand.tsx` | Renders selected nudge + actions | coachingEngine output |
| `AllocationCard.tsx` | Allocation bars | breakdown, getTypeInfo |
| `AccountCard.tsx` | One account row | neu, CategoryIcon, ProgressBar, Sparkline |
| `AskEchoBar.tsx` | Prompt bar + chips + sheet trigger | EchoInlineChat |
| `AddEditAccountSheet.tsx` / `UpdateValueSheet.tsx` / `HistorySheet.tsx` | The three modals | BottomSheet, NeuButton |

Each unit: one clear purpose, props-in/callbacks-out, understandable and testable in isolation. Pure modules get `tsx` tests.

## 8. Echo integration

**Reuse, don't rebuild.** `src/components/common/EchoInlineChat.tsx` is a bottom-sheet Q&A with its own prompt bar + suggested-chip row, already used on Goals/Wallet/Budget/Subscription. It is **not** on Savings today.

- **Snapshot** — add `buildSavingsSnapshot()` (pure, `savingsSnapshot.ts`) producing a `[Savings & investments snapshot]` string (portfolio totals, allocation, per-account value/return/target/last-updated), mirroring `buildWalletSnapshot` / `buildGoalSnapshot`. Pass as `contextSnapshot`. (Echo's global context already includes savings via `buildFinancialContext` — the snapshot makes on-screen answers precise.)
- **Chips** — a small bilingual `EchoChip[]` (EN + Malay, hardcoded like `DEFAULT_CHIPS`): "Am I on track?", "Too concentrated?", "Best performer?", "Patut simpan lagi?". `EchoInlineChat` owns chip styling.
- **Insight header** — `insightTitle` = portfolio value, `insightSubtitle` = return/pace (computed like `smartCommitmentInsight`).
- **Entry points** — (a) the Ask Echo bar (§4.2); (b) each coaching nudge's "Ask Echo" → opens the sheet with `autoPrompt = nudge.echoPrompt`. Fire `lightTap()` on open (already imported in the screen).
- **Chat-to-log** — no new plumbing: Echo's `update_savings` and `add_savings_account` already parse → confirm-chip → `executeAction` → `savingsStore`. Nothing writes without a tap. (Known limits, documented not fixed in v1: `update_savings` can't set exactly 0, no savings undo-receipt, chip editor has no account picker.)
- **Gating** — the inline Echo sheet is **Plus** (`tier !== 'premium'` → `PaywallModal feature="ai"`), matching `SubscriptionList`. The Echo **tab** stays free (100 msgs/mo, 7-day unlimited trial) — that is the free taste; the in-context coach is the upsell.
- **No changes required to `MoneyChat.tsx`** for this path. (A future enhancement could add `savingsContext`/`savingsQuestion` route params for a full-screen streaming handoff — deferred.)

## 9. Bug fixes (must-fix, verify on device)

1. **Duplicate-key React warning** (seen live) — audit list keys in the account list, allocation `breakdown`, and merged sparkline; ensure stable unique keys (breakdown keyed by type can collide when multiple accounts coerce to the same unmapped type). Reproduce with the demo data, fix, confirm the red toast is gone.
2. **Hero return-% mislabel** (`SavingsTracker.tsx:669`) — reuses `t.savings.growth` for the return column; add/point to a distinct "return" label.
3. **Non-i18n header title** (`RootNavigator.tsx:389`) — pass a translated `t.*` title to `makeBackHeader`, not the English literal.
4. **Snapshot rounding** — `savingsStore.addSnapshot` skips `roundMoney` (raw `parseFloat`); round on write to prevent sub-sen drift. (Data-safety; ref memory `money-data-safety-audit`.)
5. **"Other / Other" labels** — fixed by the type registry (§5).

## 10. Monetization (each tasteful, user-approved)

1. **Echo quick-chat = Plus** (§8 gating) — the flagship AI touchpoint on a high-intent screen.
2. **Account-cap upsell** — at `MAX_ACCOUNTS = 5`, the FAB/Add opens a warm "unlock unlimited with Potraces Plus" (`PaywallModal`) instead of a hard stop.
3. **"Ways to grow" affiliate card** — Investments tab, **off by default**, one flagged card suggesting a fitting product (Versa/ASB/Tabung Haji/Luno). Owner approves partners; real affiliate potential paired with genuine "put idle cash to work" help. Deeper insight tiers (projection/allocation) can also carry a `◆ Plus` marker.

## 11. Conventions checklist (ship-green)

- All copy via `useT()`, keys added to **both** `en.ts` and `ms.ts` (typecheck enforces parity); interpolate with `.replace('{token}', …)`. Chip copy may be inline bilingual per existing convention.
- Icons: `CategoryIcon` (prefix specs) for instruments; Feather elsewhere; `ICON_SIZE` scale.
- a11y: `accessibilityRole`+`accessibilityLabel` (from `t.a11y.*`) on every touchable; `minHeight:44`/`hitSlop`; palette tokens are already AA; pair state with icon+text.
- Money writes wrapped in `useSubmitGuard`; `decimal-pad`; `roundMoney`; validation → error toast / `InputError`.
- Feedback via `haptics.ts` (gated) + `useToast`; `ModalToastHost` in every sheet.
- Sync/backup/tombstones unaffected (no schema change); the account still round-trips through `personalSync` `mergeSavings`.
- Run `npm run lint`, `npm run lint:i18n`, `npm run typecheck` before commit; `npm test` for pure modules.

## 12. File touch-list

**New:** `src/screens/personal/savings/` — `SavingsTracker.tsx` (moved/rewritten) + `savingsMath.ts`, `coachingEngine.ts`, `savingsSnapshot.ts`, `investmentTypes.ts`, `SavingsHero.tsx`, `CoachingBand.tsx`, `AllocationCard.tsx`, `AccountCard.tsx`, `AskEchoBar.tsx`, `AddEditAccountSheet.tsx`, `UpdateValueSheet.tsx`, `HistorySheet.tsx`; pure-module tests as `scripts/test-savings-*.ts` run with `tsx` and wired into the `npm test` script (repo has no jest — see memory `tsx-native-module-testing`).
**Edit:** `src/navigation/RootNavigator.tsx` (i18n title; import path if screen moves), `src/store/savingsStore.ts` (round `addSnapshot`; optional dead-code removal), `src/i18n/en.ts` + `ms.ts` (new keys), `src/constants/index.ts` (type registry if placed there).
**Reuse as-is:** `neu.tsx`, `NeuButton`, `NeuPressable`, `NeuIconButton`, `FAB`, `BottomSheet`, `EmptyState`, `CategoryIcon`, `ProgressBar`, `Sparkline`, `DebtSegmentedControl`, `EchoInlineChat`, `PaywallModal`, `haptics.ts`, `useSubmitGuard`.

## 13. Test plan

- **Pure unit (`tsx`)**: `savingsMath` (totals/gain/return/breakdown/runway/projection edge cases: zero invested, negative gain, empty history), `coachingEngine` (each nudge fires under the right conditions and priority), `savingsSnapshot` (formatting, empty portfolio), `investmentTypes.getTypeInfo` (known/unknown/`custom_*` → correct class + never "Other/Other").
- **Manual on device (light + dark, both themes)**: no duplicate-key warning; segmented split filters correctly; allocation shows real labels; account icons/colours per type; coaching band shows the right nudge per tab; Ask Echo bar + chips open the sheet seeded with the snapshot; a chip question returns a savings-aware answer; "update ASB to 6,700" produces a confirm-chip that saves correctly; Add at cap shows the Plus upsell; empty state + FAB; all three sheets save/validate; i18n switch to Malay.
- **Regression**: sync round-trip (`test:sync`), wallet/goal contribution flows unaffected; `lint:i18n` + `typecheck` green.
- **Verify skill** run on the built screen in the simulator before "done".

## 14. Rollout / phases (for the implementation plan)

1. Extract + type registry + bug fixes (parity refactor, no visual change) → verify nothing regressed.
2. Neu visual migration (hero, cards, allocation, sort, sheets, FAB) → verify light+dark on device.
3. Segmented split + coaching engine → verify nudges.
4. Echo quick-chat (snapshot + chips + sheet + gating) + chat-to-log verification.
5. Monetization (cap upsell, affiliate card behind flag) → verify.
6. Full i18n/a11y pass + test suite + on-device verify.

---

*Design only. Implementation proceeds via the writing-plans skill → a step-by-step plan, then build on the real neu components, then verify in the simulator.*
