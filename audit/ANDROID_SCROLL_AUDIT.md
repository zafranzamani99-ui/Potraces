# Android Scroll Audit — "always hard to scroll on a dev build"

> Owner agent: android-scroll-auditor · Scope: Android scroll responsiveness (dev builds)
> Symptom (user's exact words): *"in android, on a DEVELOPMENT build, it's ALWAYS hard to scroll — like something is rendered or still loading, or like a different scroll function is used everywhere."* iOS scroll is fine.
> HARD CONSTRAINT for every fix below: **must not regress iOS.** iOS-safety is annotated per item.

---

## TL;DR — the actual root causes

The symptom is **"a different scroll function is used everywhere"** — and that is literally true. The app routes **every** vertical scroll through `react-native-gesture-handler`'s `ScrollView` (84 files; **0 files** use React Native's native `ScrollView` for their main scroll). RNGH's `ScrollView` wraps a `NativeViewGestureHandler`, which on Android must run its gesture state-machine before committing a scroll, and which sets `disallowInterruption=true`. That is the "different scroll function" the user feels.

Three things stack on top of that to produce the "still loading / hard to start" feel:

1. **ROOT CAUSE #1 — Blanket RNGH `ScrollView` on screens with no custom gesture inside.** 84 files import `ScrollView` from RNGH; only **1 file** in the whole codebase uses `useAnimatedScrollHandler` (EditTransactionSheet), and most main scrolls have **zero** custom gestures. RNGH's own guidance is to use native RN `ScrollView` unless you need to detect a scroll gesture starting from a child View. The project's blanket rule inverts that. On Android this adds gesture-disambiguation latency to the *first touch* of every scroll → the "must nudge it to start" feel.

2. **ROOT CAUSE #2 — 17 redundant `GestureHandlerRootView` wrappers placed *inside* `Modal`s.** The app already has ONE root `GestureHandlerRootView` (`App.tsx:497`). Every sheet/modal re-wraps its content in another one. On Android a `Modal` is a separate native window, and these inner roots create extra gesture-responder negotiation per touch. They are needed for *drag-to-dismiss* on a few sheets, but most don't even use a gesture inside.

3. **ROOT CAUSE #3 — Module-level `LayoutAnimation` + synchronous focus/render work on the JS thread.** 4 files flip `UIManager.setLayoutAnimationEnabledExperimental(true)` at module scope; `CollapsibleSection` fires `LayoutAnimation.configureNext` on every toggle (JS-thread, synchronous). Combined with `freezeOnBlur:true` + a `setFocusKey` bump on every tab focus (`FinancialPulse:66`) that re-runs heavy `useMemo`s, the JS thread is busy exactly when scroll wants to start.

**Plain statement:** The dominant cause is **#1 (RNGH ScrollView everywhere)**. #2 and #3 amplify it on heavy screens and inside sheets. Dev builds make all three *more visible* but they are present in release too (see "dev-only?" below).

---

## Research verdict on the "always import ScrollView from react-native-gesture-handler" rule

**Verdict: DROP the blanket form. Apply it SELECTIVELY.**

RNGH maintainers' guidance (and the library docs) is: use React Native's native `ScrollView` by default; use RNGH's `ScrollView` **only** when you need a scroll that can co-operate with other RNGH gestures (e.g. a swipe-to-delete row, a pan-to-dismiss sheet, or `useAnimatedScrollHandler` driving a worklet) **starting from a child View**. The project memory rule ("RN's built-in ScrollView can't detect scroll gestures starting from plain View children") is a real but *narrow* RNGH behavior — it does not justify forcing RNGH onto all 84 screens.

Evidence this rule is over-applied in *this* codebase:
- 84 files import RNGH `ScrollView`; **only 1** uses `useAnimatedScrollHandler` (`EditTransactionSheet.tsx:179`).
- `Dashboard.tsx:18-22` already documents the cost: it had to import **both** RNGH and native RN `ScrollView` because *"RNGH's ScrollView sets disallowInterruption=true, which blocks Android's SwipeRefreshLayout so onRefresh never fires."* That is the team discovering, in one file, that RNGH `ScrollView` is the wrong default.

**Corrected rule (recommend updating `.claude/skills/screen-scaffold/SKILL.md`):**
> Default to `import { ScrollView } from 'react-native'`. Use `react-native-gesture-handler`'s `ScrollView` **only** when the same scroll surface also hosts an RNGH gesture (Swipeable rows, a pan-to-dismiss handle, or `useAnimatedScrollHandler`). The original "can't scroll from cards" bug is solved by native RN `ScrollView` from RN 0.71+ in the New Architecture; if a specific surface still needs it, gate that surface, not the whole app.

---

## Is this dev-build-only, or does it ship to release?

**It ships to release — dev builds just make it louder.** Two separate things are being conflated in the bug report:

- The *structural* causes (#1 RNGH everywhere, #2 nested GHRV, #3 LayoutAnimation/focus work) are in the **shipping code path**. A release build is faster, so the first-touch latency drops below the human-noticeable threshold on most devices, but the gesture-disambiguation step still happens.
- The *dev-only amplifier* is the **unoptimized bundle + Reanimated/RNGH running without release optimizations + Metro/dev-client overhead**. NOTE: the research claim that "Hermes is OFF in dev builds" is **incorrect for this project** — Expo SDK 54 / RN 0.81.5 default `jsEngine` to **Hermes**, and `app.json` sets no `jsEngine` override (so Hermes is ON in both dev and release). What is genuinely missing in dev is **release minification/bytecode precompile + R8/proguard**, not Hermes itself. So "enable Hermes in dev" is a no-op here — Hermes is already on.

**Conclusion:** Fix the structure. Don't chase a Hermes flag — it's already enabled.

---

## Ranked root causes

### RC1 — CRITICAL: RNGH `ScrollView` used as the universal scroll component (84 files, 0 native)
- **What/where:** Every screen's main scroll is `import { ScrollView } from 'react-native-gesture-handler'`. Examples with no custom gesture on the main scroll: `FinancialPulse.tsx:3,221`, `Goals.tsx:15,1370` (its 4 `Gesture.Pan()` are all on *modal* sheets at 1084-1229, NOT the main list), `TransactionsList.tsx:16`, `OrderList.tsx:18`. Only `EditTransactionSheet.tsx:179` legitimately needs RNGH scroll (`useAnimatedScrollHandler`).
- **Why it hurts Android:** RNGH `ScrollView` = native ScrollView wrapped in `NativeViewGestureHandler`. On Android the gesture handler must win an arbitration before the scroll commits, and `disallowInterruption=true` blocks competing native recognizers (this is exactly why `Dashboard.tsx:19-21` had to swap in native RN ScrollView for pull-to-refresh). Net effect: a perceptible delay / "second swipe" before scroll engages. iOS's UIScrollView absorbs this; Android's does not.
- **iOS-safety:** SAFE. Native RN `ScrollView` behaves identically on iOS for plain vertical scroll. No Platform gate required for gesture-free surfaces.
- **Surgical fix:** For each file, check for `Gesture.`/`GestureDetector`/`useAnimatedScrollHandler`/`Swipeable` on that scroll. If none → `import { ScrollView } from 'react-native'`. Keep RNGH only on surfaces that host a gesture (EditTransactionSheet, the Goals sheet bodies, Swipeable lists).
- **Effort:** Medium (mechanical, ~70 files, scriptable + per-file verify). Do it in batches by mode.

### RC2 — CRITICAL: 17 `GestureHandlerRootView` wrappers nested inside `Modal`s
- **What/where:** Root GHRV at `App.tsx:497`. Redundant inner GHRVs in: `BottomSheet.tsx:133`, `FloatingModal.tsx:142`, `EditTransactionSheet.tsx:390`, `CommitmentForm.tsx`, `CategoryManager.tsx`, `UnitManager.tsx`, `PriceChangeSheet.tsx`, `SharedSubDetailSheet.tsx`, `SharedSubFormSheet.tsx`, `TransactionDetailSheet.tsx`, `AddEditWalletModal.tsx`, `RepayModal.tsx`, `TransferModal.tsx`, `BudgetPlanning.tsx`, `Products.tsx`, `DebtTracking.tsx`, and **4 in** `Goals.tsx` (1529, 1886, 2074, 2220).
- **Why it hurts Android:** Android `Modal` = separate native window; an inner GHRV spins up its own gesture-responder context there, adding negotiation overhead per touch. For sheets that DON'T use an inner gesture, this is pure overhead. For sheets that DO (drag-to-dismiss), the inner GHRV is actually **required on Android** (Modal is a separate window — see project memory `rngh-gestures-in-modal.md`).
- **iOS-safety:** MIXED — must be careful. iOS `Modal` is a view overlay covered by the root GHRV, so the inner one is redundant there too, BUT removing it changes the responder hierarchy. For **gesture-free** modals (TransactionDetailSheet, CategoryManager w/o DraggableFlatList, RepayModal, etc.) removal is iOS-safe. For **drag-to-dismiss** sheets (BottomSheet, FloatingModal, TransferModal, EditTransactionSheet, Goals sheets) the inner GHRV is load-bearing on Android — **do NOT remove**; instead address their backdrop/coordination (see CF1, RC3-adjacent). Verdict: this carries iOS regression risk on the gesture sheets — test both platforms.
- **Surgical fix:** (a) Audit each: does the modal body use `GestureDetector`/`Gesture.Pan`/`DraggableFlatList`/`Swipeable`? If **no** → delete the inner GHRV (keep a plain `View`). If **yes** → keep it (needed on Android). (b) Never use `Platform.OS==='android' ? Fragment : GHRV` on the drag sheets — that breaks Android drag.
- **Effort:** Medium. ~8 modals are gesture-free and safe to unwrap; ~9 must stay.

### RC3 — HIGH: Module-level `LayoutAnimation` + focus-time JS work stalls scroll start
- **What/where:** `CollapsibleSection.tsx:16-18` (`setLayoutAnimationEnabledExperimental(true)` at module scope) + `:38` (`LayoutAnimation.configureNext` per toggle). Same module-level enable in `NewOrder.tsx`, `Products.tsx`, `CostManagement.tsx`. Separately: `PersonalNavigator.tsx:30` & `BusinessNavigator.tsx:182` set `freezeOnBlur:true`; `FinancialPulse.tsx:66` does `setFocusKey(k=>k+1)` on **every** focus, re-running its heavy `useMemo`s.
- **Why it hurts Android:** `LayoutAnimation` on Android is a synchronous JS-thread layout pass; any collapse/expand during or near a scroll blocks frame delivery. The focus-key bump re-runs O(n) transaction filters on tab focus, exactly as the animated tab transition is finishing — JS thread busy ⇒ scroll feels stuck. iOS schedules these off the scroll's critical path more gracefully.
- **iOS-safety:** SAFE for the LayoutAnimation swap (Reanimated entering/exiting runs on the native thread on both platforms). **NOT safe** to set `freezeOnBlur:false` globally — it guards memory on iOS. Gate it: `freezeOnBlur: Platform.OS === 'ios'`, OR (better) just make `setFocusKey` conditional on `transactions.length` change.
- **Surgical fix:** (a) Replace `LayoutAnimation.configureNext` in `CollapsibleSection` with Reanimated `entering={FadeIn}/exiting={FadeOut}`, drop the module-level enable. (b) In `FinancialPulse.tsx:66`, only bump `focusKey` when data actually changed: track `prevLen = useRef(transactions.length)` and skip otherwise. Leave `freezeOnBlur:true`.
- **Effort:** Low-medium.

### RC4 — HIGH: Heavy synchronous `useMemo` on the render path of list screens
- **What/where:** `Dashboard.tsx:267-326` (`stats` does ~8 filter/reduce passes over `transactions`/`debts` in one memo). `TransactionsList.tsx:311-371` groups + `format()`s every row, and its dep array includes `t` (the translation object from `useT()`, an unstable reference) at line 371 → spurious recomputes. Stores are read as whole-array selectors (`Dashboard.tsx:208-223`) without `shallow`, so any mutation re-runs everything.
- **Why it hurts Android:** These run on the JS thread during the same window scroll wants frames. The `t` dep churns `TransactionsList` sections on unrelated renders. Android has less JS headroom than iOS, so the stall surfaces as scroll jank.
- **iOS-safety:** SAFE (pure JS / dependency-array changes; no platform behavior touched).
- **Surgical fix:** (a) Remove `t` from `TransactionsList.tsx:371` deps (labels are reassigned each render anyway). (b) Split `Dashboard` `stats` into `monthlyStats` (dep `[transactions]`) + `debtStats` (dep `[debts]`); single-pass loops instead of chained `filter().reduce()`. (c) Add `import { shallow } from 'zustand/shallow'` and wrap whole-array selectors.
- **Effort:** Low (TransactionsList dep) to medium (Dashboard split).

### RC5 — HIGH: `FloatingModal` backdrop `Pressable` uses `absoluteFill` (full-screen hit area)
- **What/where:** `FloatingModal.tsx:144` — `<Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />` sits under a `pointerEvents="box-none"` chain. Compare `BottomSheet.tsx:137` which uses `{ flex: 1 }`.
- **Why it hurts Android:** The full-screen Pressable competes for the first touch's responder claim against the card's pan/scroll on Android, contributing to "first swipe lost." iOS's responder model is more forgiving.
- **iOS-safety:** SAFE — constraining the Pressable to the backdrop region (`flex:1`) keeps tap-to-dismiss working identically on iOS.
- **Surgical fix:** Change `FloatingModal.tsx:144` `StyleSheet.absoluteFill` → `{ flex: 1 }` to match `BottomSheet`.
- **Effort:** Trivial.

### RC6 — MEDIUM/HIGH: `EditTransactionSheet` sheet container lacks `onStartShouldSetResponder`
- **What/where:** `EditTransactionSheet.tsx` — backdrop is `pointerEvents="auto"` with an `absoluteFill` Pressable, but the animated sheet container (line ~410) has **no** `onStartShouldSetResponder={() => true}`, unlike `FloatingModal.tsx:121` and 18+ other sheets.
- **Why it hurts Android:** Backdrop Pressable claims responder before the sheet on Android's stricter disambiguation → "swipe twice" to start scrolling inside the sheet.
- **iOS-safety:** SAFE — same responder API both platforms; matches the established codebase pattern.
- **Surgical fix:** Add `onStartShouldSetResponder={() => true}` to the sheet container.
- **Effort:** Trivial.

---

## Scroll-component consistency table

| Component / surface | Import source | Count / files | Issue |
|---|---|---|---|
| Main vertical `ScrollView` (all screens) | `react-native-gesture-handler` | **84 files** | RC1 — RNGH used even with no gesture on the surface; 0 files use native RN ScrollView for main scroll |
| Native RN `ScrollView` | `react-native` | 1 usage (`Dashboard.tsx:22`, outer pull-to-refresh only) | The lone correct exception; pattern not propagated |
| `useAnimatedScrollHandler` (legit RNGH scroll need) | RNGH + Reanimated | **1 file** (`EditTransactionSheet.tsx:179`) | This is the ONLY scroll that truly needs RNGH |
| `GestureHandlerRootView` | RNGH | 19 files; **17 nested inside a `Modal`** | RC2 — root already at `App.tsx:497`; ~8 inner ones are redundant (no gesture), ~9 are load-bearing drag sheets |
| `GestureDetector` / `Gesture.Pan` | RNGH | 18 files | Mostly drag-to-dismiss on sheets (`Goals.tsx:1084-1229`, BottomSheet, FloatingModal, TransferModal) — these justify their GHRV |
| `LayoutAnimation` (JS-thread) | react-native | 4 files (`CollapsibleSection`, `NewOrder`, `Products`, `CostManagement`) | RC3 — module-level enable + per-toggle configureNext blocks JS thread |
| `SectionList` | react-native | `TransactionsList.tsx:952` | Correct virtualization; but `sections` memo has unstable `t` dep (RC4) |
| `FlatList` | react-native | `OrderList.tsx:2096` | Correct pattern — proof the codebase *can* virtualize; Goals/others don't |
| `KeyboardAwareScrollView` | react-native-keyboard-controller | ~32 form files | Often layered with an RNGH ScrollView; prefer ONE vertical scroller per form (contributing factor) |

---

## Contributing factors & minor nits

- **CF1 — KeyboardAwareScrollView layered over RNGH ScrollView** in ~32 forms (e.g. `CommitmentForm`, `AddEditWalletModal`, `SharedSubFormSheet`). Two vertical scrollers competing on Android adds a frame of indecision. Fix: one vertical scroller per form; keyboard-controller as the outer. iOS-safe.
- **CF2 — Goals main list is `ScrollView + .map()`** (`Goals.tsx:1370`), unbounded goal count, no virtualization. Convert to `FlatList` (numColumns=2) like `OrderList`. iOS-safe; helps Android with many goals.
- **CF3 — Whole-array Zustand selectors without `shallow`** (`Dashboard.tsx:208-223`, `TransactionsList.tsx:109`, `OrderList.tsx:631-648`). Causes cascade re-renders. iOS-safe.
- **CF4 — `freezeOnBlur:true` + `setFocusKey` on focus** (`FinancialPulse.tsx:66`) — covered in RC3; gate or guard.
- **Nit N1 — `scrollEventThrottle` inconsistent** (some screens 16, some unset, Goals missing). Set `16` on plain scrolls; **remove** it on the one `useAnimatedScrollHandler` scroll (Reanimated handles throttling).
- **Nit N2 — `RootNavigator` mode-switch animation `fade` @300ms** (`RootNavigator.tsx:278-289`). Reducing to ~180ms or `none` shortens the window where focus re-renders collide with input. iOS-safe.
- **Nit N3 — `nestedScrollEnabled`** scattered on modal inner scrolls; re-audit after RC2 (only meaningful when parent is native RN ScrollView).

---

## Fix plan (ordered: quick wins → structural)

| # | Action | File(s) | iOS-safe? |
|---|---|---|---|
| 1 | Change backdrop `Pressable` `absoluteFill` → `{flex:1}` | `FloatingModal.tsx:144` | **Yes** |
| 2 | Add `onStartShouldSetResponder={() => true}` to sheet container | `EditTransactionSheet.tsx:~410` | **Yes** |
| 3 | Remove unstable `t` from `sections` memo deps | `TransactionsList.tsx:371` | **Yes** |
| 4 | Guard `setFocusKey` behind a real data change (keep `freezeOnBlur:true`) | `FinancialPulse.tsx:66` | **Yes** |
| 5 | Replace `LayoutAnimation` with Reanimated FadeIn/Out; drop module-level enable | `CollapsibleSection.tsx`, `NewOrder.tsx`, `Products.tsx`, `CostManagement.tsx` | **Yes** |
| 6 | Add `shallow` to whole-array selectors | `Dashboard.tsx:208-223`, `TransactionsList.tsx:109`, `OrderList.tsx:631-648` | **Yes** |
| 7 | Split `Dashboard` `stats` memo into `monthlyStats`+`debtStats`, single-pass loops | `Dashboard.tsx:267-326` | **Yes** |
| 8 | **STRUCTURAL:** migrate gesture-free main scrolls to native RN `ScrollView` (the ~70 of 84 with no gesture) | per-file (FinancialPulse, Reports, Goals main, TransactionsList, OrderList, business/seller dashboards, …) | **Yes** (no gate; verify per file) |
| 9 | **STRUCTURAL:** remove redundant inner `GestureHandlerRootView` from gesture-free modals only | ~8 modals (TransactionDetailSheet, RepayModal, UnitManager, CategoryManager*, PriceChangeSheet, AddEditWalletModal, CommitmentForm, SharedSubFormSheet) | **With test** — keep GHRV on drag-to-dismiss sheets (BottomSheet, FloatingModal, TransferModal, EditTransactionSheet, Goals sheets) |
| 10 | Convert Goals main list to `FlatList` (numColumns=2) | `Goals.tsx:1370` | **Yes** |
| 11 | Collapse double vertical scrollers in forms to one | ~32 form files | **Yes** |
| 12 | Update the house rule in `screen-scaffold/SKILL.md` to the selective form | skill doc | n/a |

**Do NOT do:** enable Hermes in dev (already on — no-op here); set `freezeOnBlur:false` globally (iOS memory regression); blanket-remove all inner GHRVs (breaks Android drag-to-dismiss).

**Recommended first PR (all trivially iOS-safe, immediate Android relief):** steps 1–6.
**Biggest lever:** step 8 (RC1) — it is the "different scroll function everywhere" the user described.

---

## iOS-safety note (summary)

Steps 1–8, 10, 11 are iOS-safe with no Platform gate: native RN `ScrollView`, responder hints, memo/selector changes, and Reanimated transitions behave identically or better on iOS. The ONLY item carrying iOS regression risk is **step 9 (removing inner `GestureHandlerRootView`)** — safe for gesture-free modals, but must NOT be applied to drag-to-dismiss sheets (BottomSheet, FloatingModal, TransferModal, EditTransactionSheet, Goals sheets) where the inner GHRV is load-bearing on Android; test both platforms after that step. Also do not set `freezeOnBlur:false` globally (iOS memory). Hermes is already enabled in both dev and release for this Expo SDK 54 / RN 0.81.5 project, so any "turn on Hermes" suggestion is a no-op.
