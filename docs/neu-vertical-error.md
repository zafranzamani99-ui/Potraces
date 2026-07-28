# The "neu vertical error" (shadow-clip seam)

A recurring dark-mode artifact in the neu kit: a **perfectly straight, axis-aligned line** at the edge of a scrollable list of neu-shadowed rows. Documented here because it keeps coming back and the fix is non-obvious (it is easy to misdiagnose as a border or a contrast problem).

## What you see

In **dark mode**, list rows that use the neu drop shadow (`neuF.raisedSoft`, faintDark) and span the **full width of a ScrollView** show a faint hard **vertical line at their left/right edges**. Described as "not quite a vertical line but kinda."

## Root cause

The ScrollView (a clipping container — `overflow: hidden` / `clipsToBounds`) **slices the soft drop shadow** at its bounds. The shadow is a blurred gradient (blur ~8, offsetX 0); when the container clips it at the edge, the gradient becomes a sliced hard edge → the seam.

It is **NOT**:
- a card border
- backdrop / scrim opacity
- a same-tone contrast issue

It **is** the soft shadow being clipped at the scroll-container edge. Web equivalent: *"box-shadow clipped by `overflow: hidden`."*

## The tell

A straight, axis-aligned line that lands **exactly** on a scrollable / `overflow: hidden` edge, and **only** on neu (shadowed) children.

## Both axes — same bug rotated 90°

- **Vertical seam** — a full-width neu row inside a **vertical** ScrollView gets its left/right shadow clipped.
- **Horizontal seam** — a neu pill row inside a **horizontal** ScrollView gets its top/bottom shadow clipped.

## The fix

**Pad the *inside* of the clip container** so the shadow renders into slack before the boundary. Never style the line away.

- On the rows: `marginHorizontal` ≥ the shadow blur (~`10`, i.e. `SPACING.md`).
- Or on the scroll container: `contentContainerStyle` `paddingHorizontal` / `paddingVertical`.

The shared `WalletPicker` ([[neu-key]]) already does this — its `item` style has `marginHorizontal: SPACING.md`, which is why it never shows the seam.

> ⚠️ Light-mode (non-faint) neu shadows are deeper (~18px), so use `md`+ padding there.

## Known fixed spots (2026-07-15)

- `src/components/common/QuickAddExpense.tsx` — wallet-step rows (first hit).
- `src/screens/personal/WalletManagement.tsx` — the "Recent Activity" see-all `FloatingModal` (FlatList `contentContainerStyle` paddingHorizontal for cards).
- `src/components/common/TimeRangePills.tsx` — the opt-in `neu` path (`contentNeu` paddingVertical for pills).
- `src/screens/shared/Onboarding.tsx` — `StartChoicePage` ("how do you want to start?") choice cards + demo profile rows: `neu.raisedSoft` rows inside the vertical `startScroll` ScrollView. Fixed with `marginHorizontal: SPACING.md` on `choiceCard` / `profileRow`.
- `src/screens/personal/EchoNotebook.tsx` — add/edit-rule modal value list (`neu.raised` rows inside a `maxHeight` ScrollView): fixed with `contentContainerStyle` `paddingHorizontal: SPACING.md` + `paddingVertical: SPACING.sm` (2026-07-27).
- `src/components/common/HowItWorksModal.tsx` — shared Bills-style explainer (Collectz how-it-works + reward quest, SavingsTracker): `neu.raised` item rows spanned the full ScrollView width. Fixed with a `scrollBleed` negative margin (`-md` horizontal, `-sm` vertical) + matching `contentContainerStyle` padding, so the visual layout is unchanged but shadows render into slack (2026-07-27).
- `src/screens/personal/SubscriptionList.tsx` — `hiwItem` rows in the inline Bills how-it-works modal: same seam, same `hiwScrollBleed` fix (2026-07-27).
- `src/components/debt/DebtHowItWorksModal.tsx` — `dHowItem` rows: same seam, same `dHowScrollBleed` fix; card also moved `raisedSoft` → `raisedModal` per the scrim rule below (2026-07-27).

---

# Sibling artifact: the "white halo" (light-mode scrim glow)

A second recurring neu artifact, same family, different mechanism. Also easy to misdiagnose (as a border, the scrim, or the seam above).

## What you see

In **light mode**, a dialog/sheet card floating on the dark scrim (`rgba(0,0,0,0.4)`) shows a **bright white glow ringing the whole card**, strongest at the top-left rim.

## Root cause

The card uses `neu.raisedSoft` / `neu.raised`, whose light-mode shadow pair includes a **pure-white `#FFFFFF` top-left highlight**. Against the dark scrim that highlight blooms into a halo. It is **NOT** the scrim opacity, a container border, or the clip seam above. Neu elements *inside* the card are unaffected — they sit on the card's own background, not on the scrim.

## The tell

A soft white glow around the **entire floating card**, only in light mode, only where the card itself sits directly on the dim scrim.

## The fix (LOCKED)

**Any card that floats directly on a scrim (centered dialogs, bottom sheets, action sheets) uses `neu.raisedModal` — never `raisedSoft` / `raised` / a hand-rolled shadow.** `raisedModal` drops the white highlight in both modes and lifts the card with a single soft neutral drop (`rgba(0,0,0,0.22)` light / `rgba(0,0,0,0.55)` dark); the scrim itself supplies the separation. Plain `SHADOWS.*` cards are also safe (all `#000`-based).

## Known fixed spots (2026-07-27)

- `src/screens/personal/SubscriptionList.tsx` — `deleteCard` ("remove commitment?"), `warnCard` (pay warning), `celebCard` (celebration), `hiwCard` (how it works): `raisedSoft` → `raisedModal`. (`markPaidCard` already used it; `dtCard` / `filterModalCard` use `SHADOWS`, which is safe.)
- `src/components/common/HowItWorksModal.tsx` — shared explainer card: `raisedSoft` → `raisedModal` (2026-07-27).
- `src/components/debt/DebtHowItWorksModal.tsx` — `dHowCard`: `raisedSoft` → `raisedModal` (2026-07-27).
