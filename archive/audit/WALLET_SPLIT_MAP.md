# WalletManagement.tsx Component Split Map

Master file: src/screens/personal/WalletManagement.tsx (3677 lines)

Extraction strategy: 8 modal components extracted in parallel, parent screen reduced from 3677 to ~900 lines.

---

## Component 1: AddEditWalletModal

File to create: src/components/wallet/AddEditWalletModal.tsx

Source lines: 1506-1856 (351 lines)
Start: {modalVisible && (
End: )}

Props interface includes:
- visible: boolean
- onClose: () => void
- editingWallet: string | null
- addStep: 'type' | 'credit_card' | 'details'
- creditCardStep: 'bank' | 'network'
- Form fields: name, balance, creditLimit, selectedIcon, selectedColor, selectedType, selectedPresetId, selectedCreditBank, selectedNetwork
- Handlers: onSave, canAddType, showTypePaywall, handleChooseTypeAndPreset, goToType

State to keep LOCAL:
- panelWidth (layout measurement)
- typeRailX (Animated.Value for swipe)
- panelWidthRef, typeIdxRef, creditCardStepRef, selectedTypeRef (gesture refs)

Special notes:
- Contains 3-step flow: type picker → credit card bank/network → details form
- Uses Gesture.Pan() for type rail swipe and credit card back swipe
- KeyboardAwareScrollView with nested conditional panels
- Animation: typeRailX needs spring physics (Animated.spring)
- Logo size overrides in LOGO_SIZE constant (keep in parent)

---

## Component 2: TransferModal

File to create: src/components/wallet/TransferModal.tsx

Source lines: 1859-1960 (102 lines)

Props:
- visible: boolean
- onClose: () => void
- transferFrom, transferTo, transferAmount, transferNote (all with setters)
- nonCreditWallets, transferToWallets, wallets, currency (parent passes)
- onTransfer: () => void

State to keep LOCAL: None - all hoisted

Special notes:
- Two WalletPicker components (from/to)
- Preview calculation inline (from/to balance diffs)
- Simple flat structure

---

## Component 3: RepayModal

File to create: src/components/wallet/RepayModal.tsx

Source lines: 1963-2036 (74 lines)

Props:
- visible: boolean
- onClose: () => void
- repayWalletId, repaySourceId, repayAmount (with setters)
- wallets, nonCreditWallets, currency
- onRepay: () => void

State to keep LOCAL: None

Special notes:
- Header shows selected credit wallet (no picker for wallet being repaid)
- Only repaySourceId gets WalletPicker
- Simpler than TransferModal

---

## Component 4: WalletActionSheet

File to create: src/components/wallet/WalletActionSheet.tsx

Source lines: 2039-2164 (126 lines)

Props:
- visible: boolean
- walletId: string | null
- onClose: () => void
- wallets, currency
- Handlers: onSetDefault, onRepay, onTransferFrom, onEdit, onRecalculate, onDelete

State to keep LOCAL: None

Special notes:
- Bottom sheet modal style
- Conditional rows: "Set as Default" (if !isDefault), "Repay" (if credit + balance), "Transfer" (if !credit + 2+ wallets), "Recalc" (if !credit)
- Looks up wallet by ID from array (parent passes wallets)
- All 6 sheet actions as separate row buttons

---

## Component 5: BillsPreviewModal

File to create: src/components/wallet/BillsPreviewModal.tsx

Source lines: 2167-2214 (48 lines)

Props:
- visible: boolean
- onClose: () => void
- upcomingBills: Array<{id?, name, amount, nextDate}>
- totalBills: number
- currency: string
- onOpenManageBills: () => void

State to keep LOCAL: None

Special notes:
- Simplest modal: read-only preview
- Date formatting inline
- "Manage Bills" button navigates to SubscriptionList

---

## Component 6: EchoFab

File to create: src/components/wallet/EchoFab.tsx

Source lines: 2225-2295 (71 lines)

RECOMMENDATION: Extract as ONE component containing FAB + greeting bubble

Props:
- visible: boolean
- fabSide: 'left' | 'right', onSetFabSide
- echoFabPan: Animated.ValueXY (ref from parent)
- echoFabPanResponder: PanResponder (ref from parent)
- greetingText, greetingDismissed, onSetGreetingDismissed
- greetingHiddenDuringDrag, onSetGreetingHiddenDuringDrag
- greetingChips: Array<{label, question}>
- onOpenSheet, onHideEcho, tier, onShowPaywall, insets

State to keep LOCAL: None

Special notes:
- FAB and greeting are TIGHTLY COUPLED (same fabSide, same animation, same visibility)
- DO NOT SPLIT - greeting is visual attachment to FAB, not separate modal
- PanResponder created in parent, passed as ref (avoid recreation)
- Greeting dismissal affects FAB layout; FAB drag hides greeting
- Greeting tail uses border styling (transform rotate 45deg)

---

## Component 7: RepayPickerModal

File to create: src/components/wallet/RepayPickerModal.tsx

Source lines: 2311-2359 (49 lines)

Props:
- visible: boolean
- onClose: () => void
- creditsWithBalance: Wallet[] (wallets where usedCredit > 0)
- currency: string
- onSelectCredit: (walletId: string) => void

State to keep LOCAL: None

Special notes:
- Simple picker card centered on screen
- List of credit wallets with WalletLogo + used balance
- Parent handles setTimeout before opening RepayModal

---

## Component 8: DeleteConfirmModal

File to create: src/components/wallet/DeleteConfirmModal.tsx

Source lines: 2362-2404 (43 lines)

Props:
- visible: boolean
- walletId: string | null
- onCancel: () => void
- onConfirm: () => void
- walletName: string (for display)

State to keep LOCAL: None

Special notes:
- Simplest modal: confirmation dialog
- No animation, no nested logic
- Parent passes walletName (already looked up)

---

## Parent Screen After Extraction

File: src/screens/personal/WalletManagement.tsx (refactored)

Retained:
- Imports & constants: ~50 lines
- WalletManagement component: ~800 lines
  - State hooks (hoisted from modals): ~40 lines
  - Derived state & useMemo: ~150 lines
  - Handler callbacks: ~200 lines
  - Main render (summary, wallet list, FAB, bottom bar): ~350 lines
  - 8 modal invocations (5-10 lines each): ~80 lines
- makeStyles function: ~1900 lines (unchanged)

Estimated total: ~2750 lines (down from 3677)

---

## Parallel Extraction Order

1. AddEditWalletModal (largest, gesture logic)
2. TransferModal (standalone)
3. RepayModal (standalone)
4. WalletActionSheet (standalone)
5. BillsPreviewModal (simplest)
6. EchoFab (animation refs)
7. RepayPickerModal (simple)
8. DeleteConfirmModal (simplest)

Merge conflict risk: LOW - each occupies separate lines, no inter-modal dependencies

---

## Key Principles

1. State hoisting: All user-input state lives in parent. Modals are presentational.
2. Refs for animation: PanResponder, Animated.Value created in parent, passed to components.
3. Local state only for transient UI: Layout measurements, animation intermediates.
4. Handlers as callbacks: Modal accepts onSave(), onTransfer(), etc. Parent owns business logic.
5. No store reads in modals: All wallets, currency, tier passed as props from parent.
6. EchoFab as single unit: Greeting bubble + FAB are tightly coupled, not separate.

