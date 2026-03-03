# Seller Mode Audit Report

**Date:** 3 March 2026
**Version:** 1.0.0
**Overall Readiness:** 87.78%

---

## Production Readiness Scores

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Core Functionality | 92/100 | 15% | 13.80 |
| Data Integrity | 88/100 | 12% | 10.56 |
| UI/UX Polish | 91/100 | 12% | 10.92 |
| Error Handling | 84/100 | 10% | 8.40 |
| Navigation Flow | 93/100 | 8% | 7.44 |
| Accessibility | 78/100 | 10% | 7.80 |
| Performance | 87/100 | 10% | 8.70 |
| Design Consistency | 85/100 | 8% | 6.80 |
| Malaysian Context | 90/100 | 8% | 7.20 |
| Feature Completeness | 88/100 | 7% | 6.16 |
| **OVERALL** | | **100%** | **87.78** |

---

## Audit Findings

### Critical Bugs (Must Fix)

#### 1. CRASH: CustomerDetailModal violates Rules of Hooks
**File:** `src/screens/seller/Customers.tsx` line 213-215
**Issue:** Early `return null` before `useMemo` call. If `customer` is null then becomes non-null, React sees a different hook count and crashes.
```tsx
if (!customer) return null;  // <--- Early return before hooks
const recentOrders = useMemo(() => { ... }, [customer.orders]);
```
**Fix:** Move the null check after all hooks, or return empty JSX instead of null.

#### 2. DATA CORRUPTION: UnitManager hides default unit before replacement check
**File:** `src/components/common/UnitManager.tsx` lines 111-114
**Issue:** When renaming a default unit, `hideUnit` runs before the duplicate check. If the new name already exists, the old unit is hidden but no replacement is added -- the user loses a unit.
**Fix:** Check for duplicates before hiding the original unit.

#### 3. DATA CORRUPTION: WhatsApp AI parsing creates items with empty productId
**File:** `src/screens/seller/NewOrder.tsx` lines 248-249
**Issue:** Unmatched AI-parsed items get `productId: ''` and `unitPrice: 0`, corrupting order data and totalSold tracking.
**Fix:** Filter out items with empty productId or flag them for manual matching.

#### 4. DESIGN VIOLATION: Hard-coded red (#E53935) in SeasonSummary
**File:** `src/screens/seller/SeasonSummary.tsx` lines 662-667, 786-788, 1677-1683
**Issue:** Uses `#E53935` for destructive buttons, violating the core CALM mandate "no red anywhere". Use `BIZ.error` (#A0714A) or `CALM.neutral` instead.

---

### Significant Bugs

#### 5. totalSold never decremented on order deletion
**File:** `src/store/sellerStore.ts` lines 121-124
**Issue:** `deleteOrder` removes the order but does not decrement `totalSold` on associated products. Over time, sales counts become permanently inflated.

#### 6. Reorder/prefill items use stale prices
**File:** `src/screens/seller/NewOrder.tsx` lines 87, 191-195
**Issue:** When reordering from a previous order, items retain their original prices. If a product's price changed since, the reorder uses outdated pricing.

#### 7. Alert.prompt is iOS-only for new season creation
**File:** `src/screens/seller/SeasonSummary.tsx` lines 238-246
**Issue:** `Alert.prompt` only works on iOS. Android users get a generic "use the seasons tab" message instead of being able to create a season.

#### 8. Multiple active seasons possible via SeasonSummary
**File:** `src/screens/seller/SeasonSummary.tsx` lines 238-246
**Issue:** `handleStartNewSeason` does not check for existing active season (unlike PastSeasons), allowing duplicate active seasons.

#### 9. Price validation accepts non-numeric values
**File:** `src/screens/seller/Products.tsx` lines 286-309
**Issue:** Entering "abc" passes empty-string validation, but `parseFloat("abc")` returns NaN which falls back to 0. Products can be created with price RM 0.00.

#### 10. WhatsApp parser matches shorter product names first (greedy)
**File:** `src/utils/parseWhatsAppOrder.ts` lines 36-60
**Issue:** Products iterated in order -- "tart" matches before "tart nenas". Products should be sorted by name length (longest first) before matching.

#### 11. Season deletion orphans transferred personal transactions
**File:** `src/store/sellerStore.ts` lines 164-169
**Issue:** Deleting a season cascades to orders and costs, but transferred income in the personal store remains, creating phantom entries.

#### 12. Deleting synced ingredient cost leaves personal transaction
**File:** `src/store/sellerStore.ts` lines 209-212
**Issue:** If a cost was synced to personal (`syncedToPersonal: true`), deleting it does not remove the linked personal expense.

---

### Minor Issues

#### 13. Memory leak: Module-level _animatedOrderIds set
**File:** `src/screens/seller/OrderList.tsx` line 238
**Issue:** Never cleared. Accumulates every order ID ever displayed. Over months, grows unboundedly.

#### 14. FlatList duplicate key: customerKeyExtractor uses name
**File:** `src/screens/seller/Customers.tsx` lines 939-941
**Issue:** Two customers named "Ali" produce duplicate keys. Should use a unique identifier.

#### 15. Hardcoded "RM" in explainSellerMonth
**File:** `src/utils/explainSellerMonth.ts` lines 24, 59
**Issue:** Always outputs "RM" regardless of user's currency setting. Should accept currency parameter.

#### 16. Custom units not recognized by WhatsApp parser
**File:** `src/utils/parseWhatsAppOrder.ts` line 77
**Issue:** Unit regex only matches hardcoded defaults (tin, bekas, balang, etc.). Custom units added via UnitManager are not included.

#### 17. Dashboard pull-to-refresh is simulated
**File:** `src/screens/seller/Dashboard.tsx` lines 238-242
**Issue:** Just shows a spinner for 800ms. Does nothing since store is already reactive.

#### 18. Contact import limited to 200
**File:** `src/screens/seller/Customers.tsx` line 921
**Issue:** Users with 200+ contacts see a truncated list with no indication.

#### 19. ID collision risk with Date.now().toString()
**File:** `src/store/sellerStore.ts` (multiple locations)
**Issue:** Rapid taps in the same millisecond can produce duplicate IDs. Low probability but possible.

#### 20. No Malay number word support in parser
**File:** `src/utils/parseWhatsAppOrder.ts`
**Issue:** "dua" (2), "tiga" (3), "lima" (5) not recognized. Only digit patterns work.

---

### Missing Features (Expected but not implemented)

| Feature | Impact | Notes |
|---|---|---|
| Order item editing | High | Cannot change quantities/products after creation |
| Partial payments | Medium | Orders are fully paid or unpaid, no deposits |
| Inventory/stock tracking | Medium | No way to track remaining stock of products |
| Ingredient cost templates | Medium | Must re-enter "tepung", "gula" manually each time |
| Product reordering | Low | No drag-to-reorder in product list |
| Bulk order delete | Low | Can bulk mark paid but not bulk delete |
| Decimal quantities | Low | "0.5 tin" or "half tin" not parsed |

---

## User Guidelines

### Getting Started

#### Step 1: Set Up Your Products
1. Go to **Manage** tab (grid icon) > **Products**
2. Tap the **+** button
3. Enter product name (e.g., "Semperit Kuning")
4. Enter price per unit (e.g., 25.00)
5. Optionally enter cost per unit for margin tracking
6. Select a unit (tin, bekas, balang, pack, piece, kotak, biji, keping, or custom)
7. Tap **Add** -- use quick-add mode to add multiple products rapidly

#### Step 2: Start a Season
1. Go to **Manage** tab > **Seasons**
2. Tap **Start new season**
3. Enter a name (e.g., "Raya 2026", "CNY 2026", "Bazaar March")
4. All new orders will automatically associate with this season

#### Step 3: Create Your First Order
1. Go to **New Order** tab (plus icon)
2. Select or type a customer name
3. Add items by tapping products in the menu
4. Set a delivery date (today, tomorrow, or pick a date)
5. Add a note if needed
6. Tap **Submit**
7. Copy the auto-generated Malay confirmation and send via WhatsApp

---

### Daily Workflow

#### Morning: Check Your Dashboard
- Open the **Home** tab to see urgency alerts:
  - **Overdue orders** -- past delivery date, not yet delivered
  - **Deliver today** -- orders due today
  - **Deliver tomorrow** -- upcoming deliveries
- Review the **TO MAKE** checklist -- tick off items as you prepare them
- Check **DELIVER TODAY** section for delivery addresses and contact buttons

#### Throughout the Day: Process Orders
- When customers message on WhatsApp:
  1. Copy their message
  2. Go to **New Order** > tap **Import from WhatsApp**
  3. Paste the message > tap **Extract Items**
  4. Review matched items, adjust quantities
  5. Submit and send confirmation via WhatsApp

#### Advancing Order Status
Orders move through 5 stages:

```
Pending --> Confirmed --> Ready --> Delivered --> Completed
```

- **Pending**: Order received, waiting to confirm
- **Confirmed**: You've confirmed, needs to be made (shows in TO MAKE checklist)
- **Ready**: Product is made, ready for delivery/pickup
- **Delivered**: Product delivered to customer
- **Completed**: Fully settled

Tap the status pill on any order card to advance it one step.

#### Marking Payments
- Tap **mark paid** on any order
- Choose payment method: Cash, Bank Transfer, or E-Wallet
- For bulk payments: long-press an order to enter select mode, select multiple, tap **mark paid**

---

### Managing Orders

#### Order List Features
- **View modes**: Grouped (by customer) or flat List
- **Filter by status**: All, Pending, Confirmed, Ready, Delivered, Completed
- **Filter by payment**: All, Paid, Unpaid
- **Filter by period**: All Time, Today, This Week, This Month
- **Sort**: Newest, Oldest, Highest Amount, Delivery Date
- **Search**: By customer name, order number, phone, address, or product name

#### Order Detail Actions
Tap any order to see full details:
- View order lifecycle progress bar
- Edit note, phone, address, delivery date
- Duplicate/reorder with same items
- Delete order (with transfer warning)

---

### Customer Management

#### How Customers Work
Customers are **automatically created** from your orders. Every unique customer name becomes a customer record with aggregated stats.

#### Customer Screen Features
- **Stats bar**: Total customers, Outstanding amount, Returning count
- **Search**: By name, phone, or address
- **Filter**: All, Outstanding (owes money), Returning (repeat buyers)
- **Sort**: Recent, Name A-Z, Most Orders, Most Spent, Highest Debt

#### Customer Detail
Tap any customer to see:
- Average order value and lifetime spend
- Contact buttons (Call, WhatsApp, Maps)
- Recent orders with status
- Actions: New Order, View Orders, Copy Info, Edit

#### Adding Customers
Two ways:
1. **Add manually** -- tap "add customer" button, fill in name/phone/address
2. **Import from contacts** -- tap "from contacts", search your phone contacts, select one

---

### Season Management

#### What Seasons Are For
Seasons represent peak selling periods -- Raya, CNY, Deepavali, bazaars, or any event. They group your orders and costs together for clear reporting.

#### Season Lifecycle
1. **Start a season** from Manage > Seasons
2. **Take orders** -- all new orders automatically link to the active season
3. **Track costs** -- log ingredient costs via Manage > Costs
4. **Monitor progress** -- tap the active season badge on Dashboard to see your Season Summary
5. **End the season** -- from Season Summary, tap "End this season"
6. **Review results** -- see what you kept, top products, export reports
7. **Transfer to personal** -- move your earnings to your personal finance tracker

#### Season Summary Features
- **"You Kept"** -- large animated display of net profit (income minus costs)
- **Stats**: Order count, customer count, total income
- **Top products** -- ranked by quantity ordered
- **Unpaid notice** -- how many orders still need payment
- **Transfer to personal** -- move paid-and-untransferred earnings
- **Copy report** -- bilingual Malay/English text report to clipboard
- **Export XLSX** -- spreadsheet with Summary and Orders sheets

---

### Product Management

#### Adding Products
- Name and price are required
- Cost per unit is optional but enables margin tracking
- Choose from default units (tin, bekas, balang, pack, piece, kotak, biji, keping) or create custom units
- **Profit preview** shows when both price and cost are entered

#### Editing Products
- Tap any product to edit name, price, cost, or unit
- Toggle active/inactive -- inactive products are hidden from the New Order menu
- Existing orders are not affected by product changes

#### Tracking Costs
- Go to Manage > Costs to log ingredient expenses
- Each cost links to the active season
- Toggle "sync to personal" to also create a matching expense in your personal finance tracker

---

### WhatsApp Integration

#### Parsing Customer Messages
The app understands common Malay ordering patterns:

| Message | Parsed As |
|---|---|
| "nak order semperit kuning 2 tin" | Semperit Kuning x2 tin |
| "tart nenas x3, dodol 1 balang" | Tart Nenas x3, Dodol x1 balang |
| "2 tin semperit, 1 kotak bangkit" | Semperit x2 tin, Bangkit x1 kotak |

**Tips for better parsing:**
- Product names in the message must match your catalog names
- Supported separators: commas, "dan", "and", newlines
- "nak order" prefix is automatically stripped
- If local parsing fails, AI fallback tries to extract items

#### Sending Confirmations
After creating an order, a confirmation modal shows pre-formatted Malay text:
```
Terima kasih [Name]!

Pesanan:
- Semperit Kuning x2 tin
- Tart Nenas x1 tin

Jumlah: RM 75.00
Hantar: 15 Mac 2026
```
Tap **Copy** or **WhatsApp** to send directly to the customer.

---

### Tips and Best Practices

1. **Add products first** -- WhatsApp parsing requires products in your catalog to match against
2. **Use consistent customer names** -- "Mak Cik Siti" and "Makcik Siti" are treated as different customers
3. **Set delivery dates** -- enables overdue alerts and "deliver today" on the dashboard
4. **Track ingredient costs** -- see actual profit per season, not just income
5. **Use seasons** -- even for year-round selling, seasons can represent months or quarters
6. **Check the dashboard daily** -- urgency alerts and the production checklist keep you on track
7. **Bulk mark paid** -- long-press to select multiple orders and mark them all paid at once
8. **Transfer profits regularly** -- move seller earnings to personal for a complete financial picture
9. **Export reports** -- use XLSX export for your own records or sharing with partners
10. **The "returning" filter** -- quickly identify your most loyal customers
