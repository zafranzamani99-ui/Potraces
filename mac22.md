# mac22 — keyboard "double lift-down" on Add-Budget & New/Edit-Goal modals

**Status:** unresolved on device (user reports still reproducing). Fixes below applied but not confirmed. Pick this up on the MacBook with the iOS simulator so Claude can watch it directly.

## Symptom
On the **Add budget** modal (`BudgetPlanning.tsx`) and the **New/Edit goal** modal (`Goals.tsx`):
- Open keyboard → sheet content lifts up (one motion, fine).
- **Close keyboard → content lifts down in TWO steps** (a visible double / stutter, not one smooth descent).

## Reference that is SMOOTH (no bug)
**Add/Edit Wallet modal** — `src/components/wallet/AddEditWalletModal.tsx`.
Same library, same version, same structure. Use it as the A/B baseline: open Add-Wallet vs Add-Budget side by side, focus a field, dismiss keyboard, compare the down-motion.

## Environment
- `react-native-keyboard-controller` **1.18.5** (latest is 1.22.2). App wrapped in `<KeyboardProvider>` at `App.tsx:688`.
- All three sheets: RN `<Modal transparent statusBarTranslucent>` → `<GestureHandlerRootView>` → animated backdrop + bottom-anchored `Reanimated.View` sheet (`position:absolute; bottom:0; maxHeight:'92%'`, `translateY` spring for entrance/drag) → `[handle+title] [KeyboardAwareScrollView] [anchored save-zone View]`.

## Ruled OUT (already tried, did NOT fix — do not repeat)
1. **Double keyboard handling** — Budget originally had `KeyboardAvoidingView(padding)` + `KeyboardStickyView` stacked. Replaced with a single `KeyboardAwareScrollView` (matches Goals). Removed the spring/footer-behind-keyboard, but double-down remained.
2. **`disableScrollOnKeyboardHide`** — added to both, no effect (it's a JS prop, applied on Metro refresh). Reverted.
3. **`style={{ flex: 1 }}` on the KeyboardAwareScrollView** — removed from both (lib bug #168 = "flex:1 shifts during keyboard animation"). No effect on device.
4. **`bottomOffset={20}` + `scrollEventThrottle={16}`** — removed from both so the scroller props are now **byte-for-byte identical to the smooth Wallet sheet**. **← latest change, awaiting device confirmation.**
5. **Library-version theory (upgrade to ≥1.21)** — disproved: Wallet uses the SAME 1.18.5 and is smooth, so it's structural, not the version.

## Current code state (props now match the smooth Wallet sheet)
Both `KeyboardAwareScrollView` (Goals `~1764`, Budget `~2293`) now carry ONLY:
```
showsVerticalScrollIndicator={false}
keyboardShouldPersistTaps="handled"
nestedScrollEnabled
keyboardDismissMode="on-drag"
contentContainerStyle={...}
```
No `flex:1`, no `bottomOffset`, no `scrollEventThrottle`, no `disableScrollOnKeyboardHide` — identical to `AddEditWalletModal.tsx:271`.

## If it STILL doubles after this, next diagnostics (do on simulator)
The scroller props are now identical to the working reference, so the cause must be OUTSIDE the KeyboardAwareScrollView. Compare Wallet vs Budget/Goals on:
- **The drag-to-dismiss pan gesture** on the sheet (`GestureDetector` + `Gesture.Pan`). Wallet: `panGesture` (~621). Budget: `bSheetGesture` (~2272). Goals: `goalSheetGesture`. Check whether the buggy ones read/animate `translateY` in a way that re-settles when the keyboard's layout changes.
- **The sheet `translateY` shared value** — does anything (a keyboard listener, `useAnimatedKeyboard`, an `onLayout`, a re-render from a keyboard-driven state) write to `bSheetY` / `goalSheetY` on keyboard hide? A stray write would spring the whole sheet = the 2nd motion. (Wallet's `sheetY` is only touched by entrance + pan.)
- **contentContainerStyle** difference: Goals uses `paddingBottom: SPACING['3xl'] + insets.bottom`; Budget uses `styles.modalScrollContent`; Wallet uses `paddingBottom: SPACING.lg`. A huge bottom padding could interact with the spacer/inset restore. Try matching Wallet's small padding.
- **Bisect against Wallet:** temporarily strip Budget's sheet down to Wallet's exact JSX (same gesture wiring, same padding) until the double-down disappears, then add back one thing at a time to find the culprit.

## How to reproduce
1. Personal mode → Budget tab → **+ add budget** (or the empty-state add). Focus the amount field, then dismiss the keyboard (tap outside / swipe down). Watch the down-motion.
2. Personal mode → Goals → **+** (new goal). Focus the name/target field, dismiss keyboard.
3. Baseline: Wallets → add/edit a wallet, do the same — should be a single smooth descent.

## Key files
- `src/screens/personal/BudgetPlanning.tsx` — add-budget modal (~2264–2439).
- `src/screens/personal/Goals.tsx` — new/edit-goal modal (~1737–1955).
- `src/components/wallet/AddEditWalletModal.tsx` — SMOOTH reference (~605–674, scroller ~271).
