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
