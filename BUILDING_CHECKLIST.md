# Building Checklist

Recurring issues that keep appearing. Check every item before writing new code.

---

## Performance

- [ ] **No `new Date()` in render body** — wrap in `useMemo(() => new Date(), [])` or move into the hook that uses it. A bare `new Date()` creates a new object every render and invalidates all downstream `useMemo` hooks.
- [ ] **FlatList perf props** — every `<FlatList>` and `<SectionList>` must have `removeClippedSubviews`, `windowSize={5}`, and `maxToRenderPerBatch={8}`.
- [ ] **`React.memo` on reusable components** — wrap components used in lists or rendered by multiple parents (e.g., `TransactionItem`, `CategoryPicker`, `WalletPicker`, `ContactPicker`, `WeekBar`).
- [ ] **`useCallback` for handlers passed as props** — any function passed to a child component or FlatList `renderItem` must be wrapped in `useCallback`.
- [ ] **Store selectors must cache** — any Zustand getter that calls `.filter()` or `.map()` must use a module-level cache (key + result) to avoid returning new array references on every call. See `categoryStore.ts` and `sellerStore.ts` for the pattern.

## Modals & Keyboard (Android)

- [ ] **Use `KAView` from `react-native-keyboard-controller`** — React Native's built-in `KeyboardAvoidingView` does NOT work inside Android transparent modals. Always import `KeyboardAvoidingView as KAView` from `react-native-keyboard-controller` with `behavior="padding"`.
- [ ] **Dismiss area must be `absoluteFillObject`** — inside a `KAView`, the dismiss touchable must use `StyleSheet.absoluteFillObject`, NOT `flex: 1`. Using `flex: 1` competes with the sheet for space when KAView adds padding.
- [ ] **Move `paddingBottom` to FlatList `contentContainerStyle`** — bottom padding on the sheet container creates dead white space below the list. Put it inside `contentContainerStyle` so it scrolls with content.
- [ ] **Modal from modal (iOS)** — cannot navigate or open a sub-modal while a parent modal is visible. Must close parent first (`animationType="none"` for instant dismiss), then `setTimeout(handler, 50)`.
- [ ] **Native picker from modal** — use `animationType="none"` on the Modal, dismiss it first, then open the picker after `setTimeout(50)`.

## Navigation

- [ ] **`navigation.navigate()` not `navigation.getParent()?.navigate()`** — using `getParent()` navigates to the root stack, which loses the tab bar. Use `navigation.navigate('ScreenName')` to stay within the current tab navigator unless you intentionally want a full-screen stack push.

## Styling

- [ ] **No shadows on bordered cards** — if a card has `borderWidth` + `borderColor`, do NOT add `SHADOWS.sm/xs`. Shadows are for floating/elevated elements only (FABs, CTAs, modals, bottom sheets).
- [ ] **No red anywhere** — use CALM palette tones. Expenses = neutral, urgent = gold/bronze, not alarm colors.
- [ ] **Lowercase labels in seller mode** — "add customer" not "Add Customer".

## Data Integrity

- [ ] **Edit audit trail** — any editable financial record involving another person must use `editLog?: XxxEdit[]` (append-only). Snapshot previous values BEFORE applying updates.
- [ ] **Generate order codes immediately** — when creating any order (app or online), call `generateOrderCode()` right away. Don't rely on backfill-on-hydration.
- [ ] **Deduplicate by supabaseId** — when pulling data from Supabase, always check existing local state to avoid duplicates.

## Language

- [ ] **No profit/loss/revenue/ROI/inventory** — use kept/came in/went out/costs/products.
- [ ] **Malaysian context** — RM currency, Malay labels where appropriate, local food references.
