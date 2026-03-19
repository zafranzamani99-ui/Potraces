# Save Receipt & Tax Relief Hub — Blueprint

> **Concept**: A digital receipt shoebox with Malaysian LHDN tax relief tracking. Scan receipts, categorize by tax relief, track spending vs limits, and be ready for tax filing.
> **Location**: Builds on existing `ReceiptScanner.tsx` + 3 new screens
> **For**: Claude Code execution — attach this alongside other blueprints

---

## THE CONCEPT IN ONE PARAGRAPH

Malaysians must keep receipts for 7 years for LHDN tax relief claims. Most people lose them. Potraces becomes the year-round tax preparation companion — scan any receipt, AI extracts the data, user tags it with the correct LHDN tax relief category, and the app tracks spending vs annual limits. At tax filing time (April-June), one tap shows exactly how much is claimable per category. The feature also educates users about Malaysia's e-Invoice (MyInvois) system — reminding them to request e-invoices at checkout for claimable purchases.

---

## MALAYSIA e-INVOICE ECOSYSTEM

### How It Works (2025-2026)

**Rollout phases by business revenue:**
- Aug 2024: >RM100M (mandatory)
- Jan 2025: >RM25M
- Jul 2025: >RM5M
- Jan 2026: >RM1M
- <RM1M: **exempt** (5th phase cancelled Dec 2025)

**For consumers/buyers:**
- Normal purchases → seller gives regular receipt → seller aggregates into consolidated e-invoice monthly
- If consumer WANTS an e-invoice (for tax claims) → must REQUEST it at checkout by providing: **TIN or IC number + name + address + contact**
- Every validated e-invoice contains a **QR code** → scan with phone → redirected to MyInvois portal to verify authenticity
- Consumers CAN view their e-invoices on the MyInvois portal/app
- **LHDN MyInvois app** exists on iOS, Android, HarmonyOS

**For tax relief claims:**
- Receipts are proof of eligible expenses
- e-Invoices are the preferred/required proof
- Must keep receipts for **7 years**
- File via e-Filing on MyTax portal → input amounts per relief category

### Tax Relief Categories (YA 2025, filed 2026)

| Category | Limit (RM) | What's Claimable |
|----------|------------|------------------|
| Individual | 9,000 | Auto — everyone gets this |
| Lifestyle | 2,500 | Books, computers, phones, tablets, sports equipment, internet |
| Sports (additional) | 1,000 | Gym fees, sports equipment, competition entry |
| Medical (self/spouse/child) | 10,000 | Treatment, dental (RM1k sub), vaccination (RM1k sub), mental health, screening |
| Parents Medical | 8,000 | Medical + RM1k sub for check-ups |
| Education (self) | 7,000 | Diploma+, skills, professional quals (RM2k upskilling sub) |
| Childcare | 3,000 | Registered nursery/kindergarten, age ≤6 |
| Breastfeeding | 1,000 | Pumps, accessories (every 2 years, child ≤2) |
| EV Charging | 2,500 | Charging equipment installation |
| SSPN | 8,000 | Net deposits in education savings |
| EPF + Life Insurance | 7,000 | RM4k EPF + RM3k life insurance |
| Education/Medical Insurance | 4,000 | Insurance/takaful |
| PRS/Deferred Annuity | 3,000 | Private retirement scheme |
| SOCSO/EIS | 350 | Employee contributions |
| Disabled Equipment | 6,000 | Self/spouse/child/parents |
| Housing Loan Interest | 7,000/5,000 | NEW — first home, SPA 2025-2027 |
| Domestic Travel | 1,000 | Registered accommodation, tourist attractions |

### How Our App Fits In

1. **Scan & save receipts** — digital shoebox with AI extraction
2. **Tag each receipt** with the correct tax relief category
3. **Track spending vs limits** — "you've used RM1,800/RM2,500 of your Lifestyle relief"
4. **QR code scan** — scan e-Invoice QR to auto-verify on MyInvois (v2)
5. **Tax filing summary** — one-tap summary of all claimable amounts per category
6. **Remind to request e-invoice** — nudge for claimable purchases

---

## FEATURE ARCHITECTURE

### Three Connected Parts

```
┌─────────────────────────────────────────┐
│           SAVE RECEIPT                  │
│  Scan/photo → AI extract → review/edit  │
│  → tag category + tax relief → save     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         RECEIPT HISTORY                 │
│  Browse by year → filter by category    │
│  → swipe to delete → tap for detail     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         TAX RELIEF TRACKER             │
│  Per-category progress bars vs limits   │
│  → total claimable → filing summary     │
│  → export for e-Filing                  │
└─────────────────────────────────────────┘
```

---

## CORE DATA MODEL

### New Type: `SavedReceipt`

```typescript
export interface SavedReceipt {
  id: string;
  title: string;           // pre-filled from vendor, editable
  vendor?: string;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  date: Date;
  category: string;        // expense category id
  myTaxCategory: string;   // MYTAX_CATEGORIES id, default 'none'
  paymentMethod?: string;
  location?: string;
  walletId?: string;
  imageUri?: string;
  verified: boolean;       // true after user reviews and saves
  transactionId?: string;  // linked Transaction.id
  year: number;            // from date, for fast year filtering
  createdAt: Date;
  updatedAt: Date;
}
```

### New Type: `MyTaxCategory`

```typescript
export interface MyTaxCategory {
  id: string;
  name: string;
  limit: number | null;   // RM annual limit, null = auto/varies
  description: string;
  icon: string;           // Feather icon name
}
```

### Extended `ExtractedReceipt`

```typescript
// Add to existing ExtractedReceipt:
location?: string;
paymentMethod?: string;
suggestedExpenseCategory?: string;
suggestedTaxCategory?: string;
```

---

## STORE: `receiptStore.ts` (NEW FILE)

```typescript
interface ReceiptState {
  receipts: SavedReceipt[];

  // CRUD
  addReceipt: (receipt: Omit<SavedReceipt, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateReceipt: (id: string, updates: Partial<SavedReceipt>) => void;
  deleteReceipt: (id: string) => void;

  // Queries
  getReceiptsByYear: (year: number) => SavedReceipt[];
  getReceiptsByTaxCategory: (year: number, categoryId: string) => SavedReceipt[];
  getTaxSummary: (year: number) => TaxCategorySummary[];
}

interface TaxCategorySummary {
  categoryId: string;
  categoryName: string;
  totalSpent: number;
  limit: number | null;
  receiptCount: number;
  remaining: number | null;  // null when limit is null
}
```

Persist with Zustand + AsyncStorage. Use `sd()` rehydration helper. Storage key: `'receipt-storage'`.

---

## TAX CATEGORIES CONSTANT

### File: `src/constants/taxCategories.ts`

```typescript
export const MYTAX_CATEGORIES: MyTaxCategory[] = [
  { id: 'none', name: 'Not Claimable', limit: null, description: 'No tax relief', icon: 'minus-circle' },
  { id: 'lifestyle', name: 'Lifestyle', limit: 2500, description: 'Books, computers, phones, internet, sports equipment', icon: 'smartphone' },
  { id: 'sports', name: 'Sports & Fitness', limit: 1000, description: 'Gym, sports equipment, competition entry fees', icon: 'activity' },
  { id: 'medical', name: 'Medical & Health', limit: 10000, description: 'Treatment, dental, vaccination, mental health, screening', icon: 'heart' },
  { id: 'parents_medical', name: 'Parents Medical', limit: 8000, description: 'Medical treatment for parents', icon: 'users' },
  { id: 'education', name: 'Education (Self)', limit: 7000, description: 'Diploma+, professional qualifications, upskilling', icon: 'book' },
  { id: 'childcare', name: 'Childcare & Kindergarten', limit: 3000, description: 'Registered nursery/kindergarten, age 6 and below', icon: 'smile' },
  { id: 'breastfeeding', name: 'Breastfeeding Equipment', limit: 1000, description: 'Breast pumps, accessories (every 2 years)', icon: 'package' },
  { id: 'ev_charging', name: 'EV Charging', limit: 2500, description: 'Electric vehicle charging installation', icon: 'zap' },
  { id: 'sspn', name: 'SSPN (Education Savings)', limit: 8000, description: 'Net deposit in SSPN education savings', icon: 'bookmark' },
  { id: 'insurance_epf', name: 'EPF + Life Insurance', limit: 7000, description: 'EPF (RM4k) + life insurance/takaful (RM3k)', icon: 'shield' },
  { id: 'education_insurance', name: 'Education/Medical Insurance', limit: 4000, description: 'Education or medical insurance/takaful', icon: 'umbrella' },
  { id: 'prs', name: 'Private Retirement Scheme', limit: 3000, description: 'PRS and deferred annuity contributions', icon: 'trending-up' },
  { id: 'domestic_travel', name: 'Domestic Travel', limit: 1000, description: 'Registered accommodation, tourist attractions', icon: 'map-pin' },
  { id: 'housing_loan', name: 'Housing Loan Interest', limit: 7000, description: 'First home loan interest (SPA 2025-2027)', icon: 'home' },
];

export const RECEIPT_PAYMENT_METHODS = [
  { label: 'Cash', value: 'cash', icon: 'dollar-sign' },
  { label: 'Debit Card', value: 'debit_card', icon: 'credit-card' },
  { label: 'Credit Card', value: 'credit_card', icon: 'credit-card' },
  { label: 'TNG', value: 'tng', icon: 'smartphone' },
  { label: 'GrabPay', value: 'grabpay', icon: 'smartphone' },
  { label: 'Boost', value: 'boost', icon: 'smartphone' },
  { label: 'ShopeePay', value: 'shopee_pay', icon: 'smartphone' },
  { label: 'MAE', value: 'mae', icon: 'smartphone' },
  { label: 'BigPay', value: 'bigpay', icon: 'smartphone' },
  { label: 'DuitNow QR', value: 'duitnow_qr', icon: 'maximize' },
  { label: 'FPX', value: 'fpx', icon: 'globe' },
  { label: 'Other', value: 'other', icon: 'more-horizontal' },
];
```

---

## USER FLOW

### Flow 1: Scan & Save Receipt

**Entry:** Dashboard quick action "Save Receipt" or "view my receipts" link

**Steps:**
1. Camera or Gallery → capture receipt image
2. "Extract with AI" → Gemini processes, returns vendor, items, total, date, location, paymentMethod, suggestedCategory, suggestedTaxCategory
3. Review screen auto-fills:
   - Title (from vendor)
   - Total (editable)
   - Date (from AI, editable via CalendarPicker)
   - Items (editable list in CollapsibleSection)
   - Expense Category (CategoryPicker dropdown)
   - Tax Relief (MyTax picker — floating card modal)
   - Payment Method (pill buttons)
   - Location (optional text)
   - Wallet (existing WalletPicker)
4. User reviews, optionally edits, taps "Save Receipt"
5. Creates: SavedReceipt + Transaction + wallet deduction
6. Toast: "receipt saved!"

### Flow 2: Browse Receipt History

**Entry:** Dashboard "Receipts" quick action → ReceiptHistory screen

**Layout:**
```
┌─────────────────────────────────────────┐
│  [2024] [2025] [2026]    ← year pills   │
├─────────────────────────────────────────┤
│  LHDN Tax Relief 2026                  │
│                                         │
│  Lifestyle     RM 1,800 / RM 2,500     │
│  ██████████████████░░░░░  72%          │
│                                         │
│  Medical       RM 450 / RM 10,000      │
│  ██░░░░░░░░░░░░░░░░░░░░  5%           │
│                                         │
│  Education     RM 2,100 / RM 7,000     │
│  ██████░░░░░░░░░░░░░░░░  30%          │
│                                         │
│  total claimable: RM 4,350             │
│                                         │
│  💡 request e-invoices for claimable    │
│     purchases — bring your IC number    │
├─────────────────────────────────────────┤
│  [All] [Lifestyle] [Medical] [Education]│
├─────────────────────────────────────────┤
│  🖼 Clinic Visit        RM 85.00       │
│     15 Mar 2026 · Medical              │
│                                         │
│  🖼 Popular Bookstore   RM 127.40      │
│     12 Mar 2026 · Lifestyle            │
│                                         │
│  🖼 Mamak Dinner        RM 32.50       │
│     10 Mar 2026 · Not Claimable        │
└─────────────────────────────────────────┘
```

### Flow 3: View Receipt Detail

**Entry:** Tap receipt row in ReceiptHistory

**Layout:**
- Full receipt image (tappable for full-screen)
- All fields displayed: title, vendor, date, total, category, tax relief, payment, location
- Items list with subtotal/tax/total
- "delete receipt" button (doesn't delete linked transaction)

---

## AI ENHANCEMENTS

### Enhanced Gemini Prompt

Add to existing `RECEIPT_PROMPT` in `receiptScanner.ts`:

```
Also extract:
- "location": store address/branch if visible
- "paymentMethod": one of [cash, debit_card, credit_card, tng, grabpay, boost, shopee_pay, mae, bigpay, duitnow_qr, fpx, other] or null
- "suggestedExpenseCategory": one of [food, transport, shopping, entertainment, bills, health, education, family, subscription, other]
- "suggestedTaxCategory": one of [none, lifestyle, sports, medical, parents_medical, education, childcare, breastfeeding, ev_charging, sspn, insurance_epf, education_insurance, prs, domestic_travel, housing_loan]

Tax category hints:
- Books, phones, tablets, computers, internet bills → lifestyle
- Gym membership, sports gear → sports
- Clinic, hospital, dental, pharmacy → medical
- Course fees, tuition → education
- Hotel/resort in Malaysia → domestic_travel
- If uncertain → none
```

---

## IMPLEMENTATION PHASES

### Phase 1: Foundation (no UI)
1. Add types to `src/types/index.ts` — SavedReceipt, MyTaxCategory, TaxCategorySummary, extend ExtractedReceipt
2. Create `src/constants/taxCategories.ts` — MYTAX_CATEGORIES + RECEIPT_PAYMENT_METHODS
3. Create `src/store/receiptStore.ts` — Zustand store with CRUD + queries + getTaxSummary

### Phase 2: Gemini Prompt
4. Update `src/services/receiptScanner.ts` — add location, paymentMethod, category suggestions to prompt + parsing

### Phase 3: ReceiptScanner Overhaul
5. Overhaul `src/screens/shared/ReceiptScanner.tsx` — add title, date, category, tax relief, payment, location fields. Replace "Add as Expense" with "Save Receipt". Add SkeletonLoader for AI processing.

### Phase 4: Receipt History
6. Create `src/screens/shared/ReceiptHistory.tsx` — year tabs, tax summary card, category filters, receipt list with swipe-to-delete

### Phase 5: Receipt Detail
7. Create `src/screens/shared/ReceiptDetail.tsx` — full receipt view with image, details, items, delete

### Phase 6: Wiring
8. Update `src/navigation/RootNavigator.tsx` — add ReceiptHistory + ReceiptDetail screens
9. Update `src/screens/personal/Dashboard.tsx` — add "Receipts" quick action
10. Update `src/i18n/en.ts` + `src/i18n/ms.ts` — add i18n keys

---

## FILES TO TOUCH

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add SavedReceipt, MyTaxCategory, TaxCategorySummary; extend ExtractedReceipt; add RootStackParamList entries |
| `src/constants/taxCategories.ts` | NEW — MYTAX_CATEGORIES + RECEIPT_PAYMENT_METHODS |
| `src/store/receiptStore.ts` | NEW — Zustand store with CRUD + tax summary queries |
| `src/services/receiptScanner.ts` | Enhanced Gemini prompt + parsing for new fields |
| `src/screens/shared/ReceiptScanner.tsx` | Major overhaul — new form fields, handleSaveReceipt, SkeletonLoader |
| `src/screens/shared/ReceiptHistory.tsx` | NEW — year tabs, tax summary, receipt list |
| `src/screens/shared/ReceiptDetail.tsx` | NEW — full receipt detail view |
| `src/navigation/RootNavigator.tsx` | Register 2 new screens, update header title |
| `src/screens/personal/Dashboard.tsx` | Add "Receipts" quick action |
| `src/i18n/en.ts`, `src/i18n/ms.ts` | Add i18n keys |

---

## FUTURE ENHANCEMENTS (v2+)

### QR Code e-Invoice Scanner
- Scan QR code from validated e-invoice → auto-import from MyInvois
- Verify authenticity against LHDN portal
- Needs: expo-camera barcode scanning, MyInvois URL parsing

### PDF Receipt Import
- `expo-document-picker` for email e-receipts (not installed yet)
- Send PDF to Gemini for extraction

### Tax Filing Export
- "Generate filing summary" button
- Per-category breakdown matching LHDN e-Filing fields
- PDF, CSV, or shareable image

### e-Invoice Reminder Nudges
- When AI detects claimable purchase: "ask for an e-invoice at checkout — bring your IC number"

### MyInvois API Integration (long-term)
- LHDN provides 15 APIs for e-invoice management
- Register as intermediary to pull user's e-invoices directly
- Needs: business registration, TIN authorization, LHDN API key

---

## EDGE CASES

1. **Image URI persistence** — `expo-image-picker` URIs are temp. Handle `Image onError` with fallback icon. v2: Supabase upload.
2. **Date parsing from Gemini** — varied formats (DD/MM/YYYY, ISO, text). Use `parseReceiptDate()` helper. Default to today.
3. **iOS sub-modal** — image preview uses inline overlay, NOT nested Modal.
4. **Sub-limits** — Sports is additional to Lifestyle. Dental RM1k is within Medical RM10k. Track separately.
5. **Delete receipt ≠ delete transaction** — explicit in delete alert.
6. **Empty title** → vendor → `'Receipt'`.
7. **7-year retention** — never auto-delete receipts.
8. **Playbook auto-link** — copy pattern from QuickAddExpense.

---

## CALM DESIGN NOTES

- Tax summary progress bars: `CALM.accent` fill, `CALM.bronze` for near-limit (>80%)
- "Not Claimable" category: muted style, at top of picker
- Year tabs: pill style from BudgetPlanning (`pbTab` pattern)
- MyTax picker: floating centered card modal (`animationType="fade"`)
- Payment pills: active = `C.accent` bg + white text, inactive = `C.pillBg` + border
- Swipe delete: `CALM.bronze` background (not red!)
- AI loading: SkeletonLoader (line + box) instead of spinner
- Toast: "receipt saved!" (lowercase, warm)
- e-Invoice reminder: `CALM.highlight` (#FFF7E6) background — warm, not alarming
- No red anywhere. CALM palette only.

---

## SOURCES

- [LHDN e-Invoice Portal](https://www.hasil.gov.my/en/e-invoice/)
- [e-Invoice Implementation Timeline](https://www.hasil.gov.my/en/e-invoice/implementation-of-e-invoicing-in-malaysia/e-invoice-implementation-timeline/)
- [Malaysia e-Invoice RM1M Update](https://rtcsuite.com/malaysias-new-rm1-million-e-invoicing-threshold-a-focused-update/)
- [MyInvois App (Play Store)](https://play.google.com/store/apps/details?id=my.gov.hasil.myinvois)
- [MyInvois App (App Store)](https://apps.apple.com/my/app/myinvois/id6502951406)
- [e-Invoicing Buyer & Seller Guidelines](https://jomeinvoice.my/e-invoicing-malaysia-guidelines-seller-and-buyer/)
- [Tax Relief 2025 Full Guide](https://blog.fundingsocieties.com.my/personal-income-tax-relief-malaysia/)
- [LHDN Tax Reliefs Official](https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-reliefs/)
- [Consolidated e-Invoice Guide](https://taxpod.com.my/articles/consolidated-e-invoice/)
- [MyInvois SDK/API](https://sdk.myinvois.hasil.gov.my/)
