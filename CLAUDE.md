# Potraces — project guide for Claude

> **Neu by default (LOCKED — 2026-07-21).** Every screen we build from now on ships in the neu design system, not the old flat/bordered style. That means: **Onyx** dark surfaces + the **Neu family** — **Neu Card** (raised card/row surfaces), **Neu Key** (icon buttons), **Neu Select** (primary CTAs), **Neu Pills** (selectors) — and the **Neu Card seam rule** (a neu shadow and `overflow:'hidden'` NEVER share a view; split them). New screens start from these recipes; don't hand-roll a flat card, a bordered container, or a raw shadow.

> **Keep the Subscription & Echo guide in sync (LOCKED — 2026-07-22).** The founder-facing Word doc `Potraces_Subscription_and_Echo_Guide.docx` (repo root) documents every tier, price, limit, per-screen gate, after-limit behaviour, and planned-but-unbuilt gap. **Whenever you change ANYTHING about Echo (the AI) or the subscription/limit system — prices or `TIERS` in `PaywallModal.tsx`, `TIER_LIMITS` in `src/constants/tiers.ts`, the gating engine in `src/store/premiumStore.ts`, Echo chat limits, or you add/remove a paywall gate on any screen — you MUST update that docx in the same change.** How: **`docs/SUBSCRIPTION_DOC_MAINTENANCE.md`**. Fast path (known small change) — edit `scripts/subscription_docx/data.json`, then `python scripts/subscription_docx/make_docx.py scripts/subscription_docx/data.json Potraces_Subscription_and_Echo_Guide.docx`. Broad change — re-run the research workflow to rebuild `data.json` from code first.

## "Onyx" — dark-mode surface standard (LOCKED)

**Onyx** is the app's dark-mode surface look. When the user says **"apply Onyx to `<screen>`"**, run this checklist in dark mode. It's the Goals/Debt style (all sheets/modals + shared pickers already follow it; Wallet, Bills, Debt done 2026-07-15).

**Checklist (dark mode):**
1. **Sheets & modals** (bottom sheets + centered dialog cards): background `C.background` **#121212**. Never `C.surface` #1E1E1E (reads as a gray slab).
2. **No container outline.** Remove BOTH the soft `withAlpha(C.textPrimary,0.12)` outline and the hard `C.border` outline from every sheet/dialog frame — separation comes from the neu shadow, not a border. (Input `borderColor: C.inputBorder` and semantic colored chip borders are not container outlines — keep them.)
3. **Tappable pills / chips / selector buttons → neu with faintDark:** `const neuF = useNeu(undefined, { faintDark: true })`, then spread `neuF.raised` (small) or `neuF.raisedSoft` (large cards/rows). Base stays default (`C.background`).
4. **Backdrops → `rgba(0,0,0,0.4)`** (or `withAlpha(C.dimBg, 0.4)`, same thing in dark). Normalize any 0.35 / 0.45 / 0.5 and any `withAlpha(C.textPrimary, x)` scrim.
5. **Contrast rescue:** a surface that was a black well on the OLD gray sheet goes invisible on the new black sheet — re-lift with `neuF.raised`/`raisedSoft`, a faint `withAlpha(C.textPrimary,0.06)` fill, or an input border. Always check wells / numpad keys / secondary buttons inside a converted sheet.
6. **Accent CTAs keep their olive fill** (`NeuButton` / semantic-filled buttons) — do NOT add neu on top.

**Keep FLAT (exempt — never neu):** status/info badges, page dots, selection-GRID cells (calendar day/month cells, icon + color-swatch picker cells and their selection rings), toggle thumbs, Echo greeting bubble, `DebtSegmentedControl` (liquid glass), WhatsApp-green buttons.

**Reference recipes to copy:**
- Bottom-sheet frame → `dDebtSheetContainer` in `src/screens/shared/DebtTracking.tsx` or `gfSheet` in `src/screens/personal/Goals.tsx`.
- Centered dialog card → `FabChoiceModal` / `SplitChoiceModal` in `src/components/debt/`.
- Field/hero card on a sheet → Debt's `dDebtFieldCard` / `dDebtFieldHeroCard` (borderless `C.background` + `neu.raisedSoft`).

**Neu kit:** `src/components/common/neu.tsx` — `useNeu(baseColor?, { faintDark? })`. Palette: `src/constants/index.ts` (`CALM`, `CALM_DARK`). Never hand-roll shadows; always go through the kit.

**Done:** Goals, Bills (SubscriptionList/CommitmentForm), full Debt cluster, all Wallet modals + WalletManagement, shared pickers (Contact/Category/Wallet/Calendar/QuickAdd), `BottomSheet`/`FloatingModal`, Reports (full redesign 2026-07-18), full Collectz cluster (Home/Detail/Create/Join + MapPreviewCard, 2026-07-20).
**Not yet Onyx'd (apply on request):** BudgetPlanning, SavingsTracker/SavingsSheets, AccountOverview, FinancialPulse, MoneyChat, Import screens, Receipt modals, seller/* screens.

## "Neu Key" — neumorphic icon button (LOCKED)

**Neu Key** is the app's raised soft-UI icon button that presses IN on tap. When the user says **"apply Neu Key to `<button>`"**, swap that icon button to the shared `NeuIconButton` (`src/components/common/NeuIconButton.tsx`).

**Recipe:**
```tsx
<NeuIconButton size={44} radius={14} onPress={...} accessibilityLabel="...">
  <Feather name="maximize" size={20} color={active ? C.bronze : C.textMuted} />
</NeuIconButton>
```
- **Full neu face** (`NeuSurface`, default neu) — **NOT** `faintDark` (faintDark is invisible on the near-black bg).
- **Spring scale-down (0.92) + `neu.inset` on press** — the face physically pushes in. Never fake it with `opacity`.
- **One-color icon carries state** (bronze / success-green / olive). No background tint — the neu face IS the surface.
- `NeuIconButton` fires `lightTap()` itself; don't add another haptic.

**Reference:** personal QR button (`greetingRow` in `src/screens/personal/Dashboard.tsx`); seller QR + shop-link buttons in `src/screens/seller/Dashboard.tsx`.

Note: Neu Key uses FULL neu for standalone icon buttons — a deliberate exception to Onyx rule 3 (which uses `faintDark` for pills/chips), so the button stays visible and tactile in dark.

**Standalone / focal icons LIFT, never sink (LOCKED).** A hero/header icon — e.g. the big category icon at the top of a detail sheet — uses **full-neu `neuFull.raised`** (`const neuFull = useNeu()`) so it lifts off the surface, keeping its tint via a trailing `{ backgroundColor: withAlpha(tint, 0.12) }`. **Do NOT put `neu.well` (inset) on a focal icon** — it reads as *sunken*, which the owner rejected (2026-07-21, `TransactionDetailSheet`). `neu.well` is ONLY for a small recessed icon **slot inside a row/card** (the debossed category well in `TransactionItem` — a deliberate recess, not a focal element).

## "Neu Select" — primary CTA button (LOCKED)

**Neu Select** is the app's one primary-action button: the full-width olive (accent) pill with white icon + label. It's the shared `NeuButton` (`src/components/common/NeuButton.tsx`). Use it for every primary CTA (Save, Create, Add, Repay, Transfer, Confirm…) so they all read the same.

**Recipe:**
```tsx
<NeuButton icon="check" label="save" onPress={handleSave} />
```
- **Olive `C.accent` fill + `neu.raisedSoft`** — the raised soft drop-shadow stays ON the whole time.
- **Press = spring scale-down (0.95) + opacity dip (0.92). NO inset, shadow never drops.** This is the deliberate opposite of Neu Key — a neu **inset** reads muddy over the solid olive fill, so Neu Select never presses IN; it just shrinks.
- **White icon + label** (`C.onAccent`).
- `NeuButton` fires `lightTap()` itself; don't add another haptic.

**Reference:** Bills save button (`NeuButton` in `src/components/commitments/CommitmentForm.tsx`).

Neu family: **Neu Key** = icon button, presses IN (inset). **Neu Select** = primary olive CTA, shadow stays, just scales down.

## "Neu Pills" — faintDark selector pills (LOCKED)

**Neu Pills** are the app's tappable filter/selector pills (e.g. Bills' all / upcoming / overdue). This is literally **Onyx rule 3** given a name — a faintDark neu pill that fills olive when selected.

**Recipe:**
```tsx
const neu = useNeu(undefined, { faintDark: true });
<TouchableOpacity style={[styles.statusPill, neu.raised, active && styles.statusPillActive]}>
  <Text style={[styles.statusPillText, active && styles.statusPillTextActive]}>{label}</Text>
</TouchableOpacity>
// statusPill:        { borderRadius: RADIUS.full, backgroundColor: withAlpha(C.textPrimary, 0.03) }
// statusPillActive:  { backgroundColor: C.accent }
// statusPillText:    { color: C.textSecondary }
// statusPillTextActive: { color: C.onAccent, fontWeight: bold }
```
- **Idle** → `neu.raised` (faintDark) over a `withAlpha(C.textPrimary, 0.03)` base.
- **Selected** → olive `C.accent` fill + bold `C.onAccent` text. Does **NOT** inset and does **NOT** drop the neu — no press-in.

**Reference:** Bills status pills (`statusPill` in `src/screens/personal/SubscriptionList.tsx`).

Neu family recap: **Neu Key** = icon button, presses IN. **Neu Select** = primary olive CTA, shadow stays + scales down. **Neu Pills** = faintDark selector pills, raised idle / olive-filled when selected.

## "Neu Card" — raised card / row surface (LOCKED)

**Neu Card** is the app's raised soft-UI container — every list row, hero/section card, and dialog/picker card that holds content sits on one. It's the surface half of "Neu by default": new screens build their cards/rows this way instead of a flat or bordered box.

**Recipe:**
```tsx
const neu = useNeu(undefined, { faintDark: true });   // faintDark per Onyx rule 3
<View style={[styles.card, neu.raisedSoft]}>…</View>
// card: { borderRadius: RADIUS.lg, backgroundColor: C.background, padding: SPACING.md }
```
- **Surface = `C.background` base + `neu.raisedSoft`** (large cards/rows) or `neu.raised` (small tiles). Separation comes from the neu shadow — **no border outline** (Onyx rule 2). Never hand-roll a shadow; always go through the kit.

**THE seam rule (LOCKED — this is the whole reason the standard has a name):** a neu shadow and **`overflow:'hidden'` must NEVER live on the same view.** On device, a clip on the shadowed view shears the `boxShadow` into a hard vertical line down both sides — the owner calls this the **"neu onyx vertical error."** If a card needs a rounded clip (full-bleed image, edge-to-edge divider rows, a map), **SPLIT it:**
```tsx
<View style={[styles.card, neu.raisedSoft]}>   // OUTER: borderRadius + shadow, NO overflow
  <View style={styles.clip}>…</View>            // INNER: borderRadius + overflow:'hidden' + content
</View>
// card: { borderRadius: RADIUS.lg }    clip: { borderRadius: RADIUS.lg, overflow: 'hidden' }
```
If the shadowed card clips nothing, no wrapper is needed — the shadow renders fine on its own. **Never** "fix" a seam with a flat grey fill (rejected as "not onyx") or by swapping shadow variants — always split. The sim usually hides the seam; the device makes it obvious, so audit any card that has both a neu shadow and `overflow:'hidden'`.

**References (copy these):** `TransactionItem` (`rowShadow` outer + `card` inner — the canonical row, the owner's "TransactionList has it correct"), `MapPreviewCard` (`card` + `clip`), `CollectzJoin` roster (`listCard` + `listClip`, 2026-07-21).

## "Note Fields" — multi-line note/description inputs (LOCKED)

Any **note / description** input is **multi-line** and carries the **gold keyboard-done FAB**. When the user says a note/description field is wrong, this is the rule to apply.

**Recipe:**
- The `TextInput` is `multiline` + `textAlignVertical="top"` with a `minHeight` (~64).
- Track focus: `const [multilineFocused, setMultilineFocused] = useState(false)` + `onFocus`/`onBlur` on the input.
- Keyboard state via the shared hook: `const { keyboardVisible, keyboardHeight } = useKeyboardVisible(() => setMultilineFocused(false))` (`src/hooks/useKeyboardVisible.ts`).
- Render the shared FAB as the LAST child of the modal root: `<KeyboardDoneFab visible={keyboardVisible && multilineFocused} keyboardHeight={keyboardHeight} />` (`src/components/common/KeyboardDoneFab.tsx`).

**The FAB:** a `C.gold` 46×46 circle with a white `check` icon that floats just above the keyboard and dismisses it on tap. It only appears while a multiline field is focused (numeric keypads have their own native Done key). Extracted 2026-07-15 from the inline versions in `CommitmentForm` + `DebtTracking` into the shared `KeyboardDoneFab` — new note fields use the component, and those two can adopt it later.

**Reference:** `CommitmentForm.tsx` (note field wiring) and `TransferModal.tsx` (uses the shared `KeyboardDoneFab`).

## "Scroll screens" — page scroller = gesture-handler ScrollView (2026-07-21)

**`DebtTracking.tsx` is the reference for a page that scrolls reliably.** Its page scroller is **`ScrollView` imported from `react-native-gesture-handler`** — NOT from `react-native`. The app is wrapped in `GestureHandlerRootView` (`App.tsx`), and RNGH's `ScrollView` registers as a native gesture handler so it arbitrates properly. A plain RN `ScrollView` — and `KeyboardAwareScrollView`, which is built on one — can **intermittently lose the pan**: the "mostly can't scroll, sometimes can" bug.

**Recipe (copy Debt):**
```tsx
import { ScrollView } from 'react-native-gesture-handler';
import { KeyboardToolbar } from 'react-native-keyboard-controller';

<View style={styles.container /* flex:1 */}>
  <ScrollView
    style={styles.scrollView /* flex:1 */}
    contentContainerStyle={styles.scrollContent /* padding + paddingBottom ~80 */}
    showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
  >
    …
  </ScrollView>
  <KeyboardToolbar />   {/* screen-level "Done" bar for single-line inputs */}
</View>
```

**Which scroller when:**
- **Page scroller** → RNGH `ScrollView` + `KeyboardToolbar` (Debt; `CollectzJoin` 2026-07-21).
- **Modals / bottom-sheets, and input-heavy forms** → `KeyboardAwareScrollView` (`react-native-keyboard-controller`) — it follows the caret so a tapped input never hides behind the keyboard. Debt uses it in all 6 of its sheets; `CollectzCreate` uses it as a form page. See [[form-input-keyboard-aware-scroll]].
- **Inside a `<Modal>`** a plain `ScrollView` with `flexGrow:0, flexShrink:1` is fine (CollectzDetail's proof/request scrollers).
- Multi-line note inputs still add the `KeyboardDoneFab` (see **Note Fields**).

**If a page won't scroll reliably, switch its scroller to the RNGH one first** — that's the fix that stuck.
