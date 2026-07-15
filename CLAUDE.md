# Potraces — project guide for Claude

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

**Done:** Goals, Bills (SubscriptionList/CommitmentForm), full Debt cluster, all Wallet modals + WalletManagement, shared pickers (Contact/Category/Wallet/Calendar/QuickAdd), `BottomSheet`/`FloatingModal`.
**Not yet Onyx'd (apply on request):** BudgetPlanning, SavingsTracker/SavingsSheets, AccountOverview, Reports, FinancialPulse, MoneyChat, Import screens, Receipt modals, seller/* screens.
