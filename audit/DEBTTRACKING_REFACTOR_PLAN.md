# CQ-02 — DebtTracking.tsx Safest-First Extraction Plan

**Target:** `src/screens/shared/DebtTracking.tsx` (11,899 lines — the money god-component)
**Branch context:** pre-store-launch. The money/wallet-reconciliation surface is the app's most fragile code (see `memory/wallet-reconciliation-contract.md` — violating the single-owner rule re-introduces the documented 2×/3× balance bug).

## Intent

Land the **maximum safe line reduction with provably identical behavior**, and stop before the entangled money/state core. This plan merges three mapper lenses (pure helpers, extractable sub-components, state/hook domains), dedupes their overlaps, and orders every step **strictly safest-first**:

1. **Pure helpers / constants / types** → `src/utils/debtTracking.ts` (deterministic functions of their arguments; `useCallback([])` / single-array `useMemo` confirms zero hidden capture).
2. **Read-only derived layer** → a `useDebtDerived` / `useDebtFilters` hook pair (pure functions of store arrays + filter state; the state-graph mapper's single highest-value, lowest-risk domain).
3. **Leaf prop-driven sub-components** with narrow props and **none** of the `d<Name>SheetAnimatedStyle` / `d<Name>SheetGesture` / `d<Name>CloseSheet` reanimated trio and **no** money write — they mirror the already-extracted `SharedSub*` template.
4. **Medium presentational components** (list rows / header clusters) — wider closure over selection + open setters, but still no setState of their own and no money write.

**Dedup rule applied:** where a render block contains a pure helper (e.g. `DebtRow` closes over `getDebtAge` / `getStatusConfig` / `getTypeConfig`), the **helper is extracted in an earlier step**, and the component step consumes the already-extracted helper. The derived-memo cluster (441-672) is claimed by both the helper lens and the state-graph lens — the **pure helpers are pulled out individually first** (Steps 1-6), then `useDebtDerived` (Step 8) calls them, so there is no double-move.

### Verification gate (run after EVERY step — all three must stay green)

```
npx tsc --noEmit                            # src/ must stay 0 errors
npx tsx scripts/test-wallet-reconcile.ts    # money reconciliation round-trip
npm run test:sync                           # personal-sync round-trip
```

Each step is independently shippable: it compiles, passes both money/sync tests, and is behavior-preserving on its own.

---

## Ordered Steps

| # | Title | Source lines | Target file | Risk | Est. lines removed | How to verify |
|---|-------|--------------|-------------|------|--------------------|----------------|
| 1 | `normalizeAmountInput(raw)` — collapse 4× verbatim dup | 4571-4580, 4952-4960, 6287-6295, 6691-6699 | `src/utils/debtTracking.ts` | low | ~30 (net, 4 copies → 1) | Gate; each call site keeps its own `setX(normalized)` wrapper — output strings unchanged |
| 2 | `safeFormatDate(value, fmtStr, fallback)` — collapse 6× inline date IIFE | 6885, 6906, 6926, 6952, 6965, 7260 | `src/utils/debtTracking.ts` | low | ~25 | Gate; pass each site's own format string; rendered date labels byte-identical |
| 3 | `cleanPhoneNumber(phone)` (MY phone normalization) | 3451-3461 | `src/utils/debtTracking.ts` | low | ~11 | Gate; pure arg-only lift, no closure |
| 4 | `getDebtAge(createdAt)` + `getReminderTone(...)` (both `useCallback([])`) | 630-637, 639-649 | `src/utils/debtTracking.ts` | low | ~21 | Gate; drop `useCallback` wrappers, call module fns directly; reminder copy strings unchanged |
| 5 | `getStatusConfig(status, isDark)` + `getTypeConfig(type, isDark)` | 3680-3683, 3685-3688 | `src/utils/debtTracking.ts` | low | ~8 | Gate; pass `isDark` as arg (was sole captured dep); resolved colors identical |
| 6 | Pure derives: `computeBalanceSummary`, `getRecentDebtPeople`, `getGroupDateLabel`, count/sum cluster | 652-672, 289-302, 5733-5750, 487-491, 571-599, 610-628 | `src/utils/debtTracking.ts` | low | ~90 | Gate; keep `useMemo` at call sites calling the new util; outputs deterministic |
| 7 | `useKeyboardVisible()` (done-FAB driver) | 214-230 | `src/hooks/useKeyboardVisible.ts` | low | ~17 | **Grep first** for an existing hook (reuse rule); Gate; listener cleanup preserved |
| 8 | `useDebtDerived` — read-only filter/bucket/total memos (calls Step 1-6 utils) | 441-505, 508-628, 652-672 | `src/screens/shared/debt/useDebtDerived.ts` | low | ~200 | Gate; pure functions of `{debts,splits,mode,filters}`; bucketing branch order preserved exactly |
| 9 | `useDebtFilters` — tab/sort/search UI state + archive snap-back effect | 418-432, 691-696 | `src/screens/shared/debt/useDebtFilters.ts` | low | ~25 | Gate; bundle as the input to Step 8; snap-back still reads `debtsShowArchive` |
| 10 | `useDebtAutoArchive` — settled-debt auto-archive effect (NOT receipt-intake) | 233-248 | `src/screens/shared/debt/useDebtAutoArchive.ts` | low | ~16 | Gate; store-driven only (`debts` + `archiveDebt`); leave receipt-intake (1253-1269) in place |
| 11 | `ScanningOverlay` (fully static spinner overlay) | 8221-8232 | `src/components/debt/ScanningOverlay.tsx` | low | ~12 | Gate; props: `visible`; mirrors `SharedSub*` template |
| 12 | `DebtHowItWorksModal` (static help copy) | 8731-8802 | `src/components/debt/DebtHowItWorksModal.tsx` | low | ~72 | Gate; props: `visible`, `onClose` |
| 13 | `FabChoiceModal` + `SplitChoiceModal` (twin choice cards) | 8291-8313, 8315-8337 | `src/components/debt/FabChoiceModal.tsx`, `SplitChoiceModal.tsx` | low | ~45 | Gate; **SplitChoice MUST keep `animationType="none"`** (native-picker memory rule); each option = one outbound callback |
| 14 | `CommitmentPickerModal` (link shared-sub to subscription) | 8260-8289 | `src/components/debt/CommitmentPickerModal.tsx` | low | ~30 | Gate; props: `visible`, `subscriptions` (read-only), `onPick`, `onClose` |
| 15 | `SelectionActionBar` (bulk-select bottom bar) | 4471-4507 | `src/components/debt/SelectionActionBar.tsx` | low | ~37 | Gate; props: count + mode + `onCancel/onSelectAll/onEdit/onArchive/onDelete`; no setState of its own |
| 16 | `DebtSortFilterMenu` + `DebtViewSettingsModal` | 8804-8908, 8639-8729 | `src/components/debt/DebtSortFilterMenu.tsx`, `DebtViewSettingsModal.tsx` | low | ~195 | Gate; plain UI-state props + setters; no store, no reanimated |
| 17 | `DebtSegmentedControl` — shared by debts + splits tabs (twin at 4183-4240) | 3869-3915 (+ 4183-4240) | `src/components/debt/DebtSegmentedControl.tsx` | low | ~90 | Gate; one config-array-driven control serves both tabs; one active value + one `onChange` |
| 18 | `SplitTabHeader` (splits hero + bucket control, reuses Step 17) | 4159-4285 | `src/components/debt/SplitTabHeader.tsx` | low | ~125 | Gate; presentational reads + `setSplitTab`/`exitSelectionMode` |
| 19 | `DebtScreenHeader` cluster (balance hero + search + tab toggle) | 3706-3863 | `src/components/debt/DebtScreenHeader.tsx` | medium | ~155 | Gate; wide setter surface (filters/search/tab) but no store write, no refs; split into BalanceHeroRow/SearchBar/TabToggle if cleaner |
| 20 | `DebtRow` (grouped + single list item; consumes Step 4-6 helpers) | 3935-4137 | `src/components/debt/DebtRow.tsx` | medium | ~200 | Gate; props: debt/group + `selected` + `onOpen/onToggle/onLongPress` + passed helpers; selection machinery passed in |
| 21 | `SplitRow` (split list item; consumes Step 4-6 helpers) | 4288-4424 | `src/components/debt/SplitRow.tsx` | medium | ~135 | Gate; props: split + `selected` + open/toggle/longPress callbacks |

**Cumulative safe reduction (Steps 1-21): ≈ 1,600+ lines** removed from the component, with zero contact with the wallet-reconciliation surface and every step gated by tsc + both money/sync tests.

---

## 🛑 STOP LINE — after Step 21

**Do NOT proceed past Step 21 before the store launch.** Everything below is the entangled, high-risk core. Defer it, and ideally write a reconciliation round-trip test *before* touching any of it (the user's own goal-driven rule).

### What is deferred (and why it is past the line)

| Deferred domain | Source | Why it is HIGH risk |
|---|---|---|
| The 8-sheet reanimated/gesture machinery (`useDismissibleSheet`) | 254-285, 699-1252 | Owns **all 8 `react-hooks/exhaustive-deps` suppressions** (792, 855, 930, 993, 1052, 1117, 1183, 1241). Each sits on a `Gesture.Pan()` `useMemo` whose worklet reads/writes stable `useSharedValue` refs — the suppressions are **correct, not bugs**. Each sheet's `finishClose` fires cross-domain setState (form-reset + modal-reopen). High-touch: 8 call sites each with domain-specific `onClosed` logic. |
| The return-to-detail/group/split ref glue | 432-438, 712-737 | Shared mutable refs read/cleared across 3+ domains inside sheet-close callbacks. The primary stale-closure surface — connective tissue, not a movable domain. |
| `AddEditDebtSheet`, `AddEditSplitSheet` | 4518-4904, 4905-5389 | Money-writing form sheets; own their reanimated cluster + ~10 form setters; save auto-creates transactions + touches the wallet. |
| `DebtDetailSheet`, `GroupDetailSheet` | 5390-5696, 5697-6186 | Own reanimated clusters; read live store; launch payment/edit/delete flows. |
| `RecordPaymentSheet` (+ `TipConfirmOverlay`) | 6187-7175 | **The single most dangerous block (~990 lines).** It IS the wallet single-owner reconciliation write path; `processPayment` (1551-1673, 22-dep) cross-mutates split (`markSplitParticipantPaid`) and shared-sub (`markSharedSubPayment`), then runs the return-to-sheet ref dance. `handleDeletePayment` (1881-2199) reverses all of it. |
| `SplitDetailSheet`, `ReceiptSplitWizard` | 7176-7424, 7425-8220 | Participant paid-toggle writes money on settle; wizard owns a FlatList + scroll refs + a 6-step state machine whose save path auto-creates debts+tx+wallet. |
| Payment / split-save / wizard-save / debt-save handler domains | 286-313 + 1307-1535; 317-331 + 2200-2818; 334-353 + 1536-2199; 362-392 + 2905-3520 | All on the wallet/money write path and coupled to each other by the **data they generate** (split-save spawns debts that the payment path later reconciles). |

### Reasoning for the stop line

Steps 1-21 are **read-only or presentational**: pure helpers (deterministic functions of their args), the read-only derived layer (deterministic functions of store arrays + filter state), and prop-driven leaf/medium components that hold no money state. None of them touch `addPayment` / `addToWallet` / `deductFromWallet` / `addDebt` / `addSplit` or mutate another domain's setState. They cannot re-introduce the 2×/3× balance bug.

Everything past the line either (a) carries one of the 8 reanimated-gesture suppressions whose close callback fires cross-domain setState, or (b) is on the wallet-reconciliation write path, or (c) is the shared ref glue binding those domains. Forcing those moves before launch risks the money screen for a refactor that can wait.

**It is better to land ~1,600 lines (≈ the safe ~60%+ of the cognitive load) with provably identical behavior than to risk the money screen for the remaining entangled core.** Resume past Step 21 only after launch, with a reconciliation round-trip test written first, extracting one money-path domain at a time behind a shared `useDismissibleSheet` shell.
