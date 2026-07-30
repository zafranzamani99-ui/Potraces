# Session handoff — 2026-07-27 (stall mode, pull-refresh, QR, Echo, quick-log promo)

Read this before continuing work from the previous machine's session. `CLAUDE.md` and `docs/neu-vertical-error.md` are the standing design law — everything below follows them.

## Done this session (all in the working tree, uncommitted)

**Stall Sell screen (`src/screens/stall/SellScreen.tsx`)**
- Register-only toolbar (no money hero — Home owns it): segmented quick/cart, ledger count button, clearance, custom amount, payment-default pill, customer chip. 40px tap rhythm.
- Responsive product grid: 2/3/4 columns by width (`useWindowDimensions`), max 1040 centered.
- Category dropdown (centered modal, replaces horizontal pills) + expanding search circle (Reanimated width tween, `cubic-bezier(0.16,1,0.3,1)`, shadow/clip split per neu seam rule). Collapse auto-fades the dropdown back in.
- Modifier chooser redesigned (neu option rows + delta chips); all 7 RN Modals set `animationType="none"`; `centerCard`/`sheetCard` use the established outline rule (`borderWidth: 1, borderColor: withAlpha(C.textPrimary, 0.12)`, no SHADOWS).
- Discount field lifts above keyboard via `useKeyboardVisible`; screen-level `KeyboardToolbar` added.

**Stall products (`src/screens/stall/StallProducts.tsx`)**
- Same category dropdown + expanding search ported. Bronze 56px add FAB bottom-right.
- Form validation: name+price mandatory, cost validated-if-filled. `newstOutline(C, active, error)` gained an optional error param (BIZ.inputError border + 8% wash) and `NewstInput` an `error` prop rendering `InputError`. Errors clear on type.
- "Manage categories/units" buttons navigate to `SettingsDetail`; `useFocusEffect` + `InteractionManager.runAfterInteractions` reopens the half-filled form on return (fields preserved — state never unmounts).

**New Session (`src/screens/stall/SessionSetup.tsx`)**
- "see all" → all-sessions modal: date-filter chips (**Neu Pills per CLAUDE.md** — faintDark neu.raised, bronze active, scroll slack per `docs/neu-vertical-error.md`), Sell-style expanding search, spots carry `closedAt` (store + type updated).
- Root scroller is `PageScrollView` (KeyboardAware — caret never hidden). Products: select-all/clear toggle + category dropdown filter.

**FloatingModal (`src/components/common/FloatingModal.tsx`)**
- Final locked behavior: fade mode = instant appear/close, **no animations** (entrance/exit experiments were reverted by owner). Drag handle hidden in fade mode (slide keeps it). Backdrop tap = keyboard-first dismiss (second tap closes modal); tapping empty card space dismisses keyboard. Static `paddingTop: 120` downward bias on fade cards.

**Payment QR (`src/components/settings/PaymentQrCard.tsx` + dashboards)**
- Label modal + action sheet rewritten to Onyx rules (`C.background`, `neu.raisedModal`, 0.4 scrim, `newstOutline`, `NeuButton`).
- **Tier limits**: `maxPaymentQrs` in `tiers.ts` — free 2, basic 4, pro/premium ∞. Gates in `premiumStore.canCreatePaymentQr` + `settingsStore.addPaymentQr(maxAllowed)`. Locked "more with Pro" slot → `PaywallModal` new `paymentQr` feature. Subtitle is tier-dynamic. `bankAppNote` is business-only.
- Fullscreen previews (PaymentQrCard + personal/seller Dashboards): close + share buttons bottom-center; share via `expo-sharing`.
- `scripts/subscription_docx/data.json` updated + docx regenerated (locked rule).

**Echo (`src/store/echoInlineStore.ts`, `EchoInlineChat`, App.tsx)**
- Ask-Echo messages moved out of component state into per-screen threads (`threadKey`: goals/budget/wallets/subscriptions/savings/pulse) — survive navigation.
- `flushInlineThreadsToHistory()` archives threads into the main Echo history on AppState 'background' (last reliable pre-kill signal). Wired in App.tsx's background branch.

**Savings (`SavingsSheets.tsx`)** — Add money / Withdraw / Dividend now take a delta amount (sheet computes the new total; direction guards obsolete). Snap pills follow the Neu Pills recipe.

**MoneyChat past chats** — seam fix (bleed + content padding), `neu.raisedModal` card, `animationType="none"`.

**Pull-to-refresh (the big saga — read carefully)**
- Symptom: loader never shows on dashboards (all 7), works on TransactionsList (SectionList).
- Root cause: this device is iOS 26 + react-native-screens **NativeTabs** on all dashboards; native RefreshControl never reveals on those screens regardless of scroller type (RNGH → native ScrollView → FlatList → removeClippedSubviews all failed on device).
- **Fix that works (device-verified)**: custom `src/components/common/PullRefresh.tsx` — iOS: header driven by the list's own bounce offset (`contentOffset.y < 0`, latch at −70); Android: RNGH pan at scrollY=0. Native `refreshControl` was removed from all 7 dashboards (personal, stall ×2 states, seller, business parent, freelancer, part-time, on-the-road, mixed). Loader is `ActivityIndicator size="large"` in mode accent.
- Real handlers wired: personal → `syncPersonal()`, seller → `syncAll(products, orders, seasons, sellerCustomers)` (spinner holds for actual sync). Stall re-reads store. Business parent + sub-modes are local-only revalidation gestures (documented in code).

**Quick-log promo (latest feature)**
- `src/components/common/QuickLogPromoModal.tsx` (design preview: `potraces new component design/previews/quicklog-promo-modal.html`, icons olive per owner).
- `settingsStore.quickLogPromoSeen` (persisted + migration guard). Trigger in App.tsx: fires once after the 3rd manual transaction; skipped if `quickLogConfigured`. CTAs navigate to `QuickLogSetup`. i18n en+ms added. Sim-verified rendering.

---

## RESUME HERE

**Where to pick up:**

1. **Verify on device (Android):** the custom `PullRefresh` loader on the dashboards. It is proven on the owner's iPhone; the Android path (RNGH pan) is untested on hardware. If it fails on Android, debug `PullRefresh.tsx`'s `pan` gesture (enabled/atTop/arbitration) — do NOT revert to native RefreshControl; it's broken on their build.
2. **~~Known pre-existing breakage (NOT ours):~~ ✅ RESOLVED (verified 2026-07-30, `tsc --noEmit` passes with 0 errors):** `src/screens/personal/collectz/CollectzJoin.tsx` previously failed `tsc --noEmit` with missing i18n keys (`joinPayByDaysLeft`, `joinPayByDueToday`) and styles (`payByChip`, `payByChipText`). All four now exist (keys in `en.ts`/`ms.ts`, styles in the screen), so the build error is gone.
3. **Uncommitted:** everything above is working-tree changes mixed with other people's WIP. Commit selectively.
4. **Optional leftovers:**
   - Sell screen's remaining RN Modals (ledger, custom amount, restock, customer picker, clearance, category dropdown) could be ported to `FloatingModal` for one card rule.
   - Personal Dashboard pull-refresh is cosmetic when signed out (syncPersonal no-ops by design).
   - `sessionTotalLabel`/`uncategorized` i18n keys added then removed this session — if tsc ever flags them, they are safe to re-add.

**Rules that must not regress:** neu seam rule (pad the clip container, never style the line away — `docs/neu-vertical-error.md`); modal cards `C.background` + neu separation, no `C.surface` slabs, scrim always `rgba(0,0,0,0.4)`, `animationType="none"` on RN Modals, fade FloatingModal = instant; Neu Pills for selector pills (faintDark, accent fill when active); dashboards' outer scroller is a single-row FlatList (comments in each file say why).
