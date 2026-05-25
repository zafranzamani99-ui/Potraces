# Receipt Scanning UX Research — Fintech Apps (2025-2026)

Research conducted May 2026. Covers 10 apps + general UX best practices.

---

## 1. Expensify — SmartScan

**After photo:**
- User taps green camera button → snaps photo → SmartScan begins immediately
- Back-to-back scanning (July 2025): snap multiple receipts without extra taps — each auto-scans
- Processing happens in background; expense entry created with spinning/processing indicator
- Fields auto-populate within seconds: merchant, date, amount, currency (150+ currencies)

**Fields shown:** Merchant name, date, amount, currency. Auto-categorized. Auto-matched to corporate card transactions.

**Receipt image:** Stored as attachment on the expense entry. Viewable inline.

**AI/OCR:** SmartScan claims 99% accuracy (vs Concur's 88%). Works on receipts in any language. Converts foreign currency automatically.

**Save flow:** No explicit "confirm" step — expense is created automatically. User can edit afterward. Minimal friction by design.

**Multi-channel capture:**
- Camera snap in-app
- Email forwarding to receipts@expensify.com
- SMS/text photo to 47777 (US)
- Drag-and-drop bulk upload on web
- Batch scanning (multiple receipts at once)

**Key insight:** Expensify's philosophy is *zero-tap after capture*. The expense is created immediately — editing is optional, not required. This is the most frictionless flow in the market.

---

## 2. Dext (formerly Receipt Bank)

**After photo:**
- Camera offers 3 modes: **Single** (one receipt), **Multiple** (several separate items), **Combine** (multi-page receipt → one PDF)
- After capture → **Review screen** appears where user can expand "Item details" to view/edit fields
- User taps **Submit** → document uploaded → extraction begins
- Item appears under **"Processing"** section at top of inbox while OCR runs
- Once complete, item moves to inbox with extracted data

**Fields shown:** Supplier name, date, amount, tax, currency. Category auto-suggested based on learned patterns.

**Receipt image:** Stored as document attachment. Viewable in item detail.

**AI/OCR:** AI extracts merchant, date, amount, tax, currency. Auto-categorization improves over time — learns from user's previous choices and supplier rules. Manual exceptions become rarer as system learns.

**Save flow:** Two-step: Review screen (optional field editing) → Submit → Processing → Inbox. Not instant like Expensify, but gives user control before submission.

**Key insight:** The 3 camera modes (single/multiple/combine) are excellent for real-world use. The "Processing" queue with visible status is honest and builds trust. Category learning over time reduces friction progressively.

---

## 3. Fyle (now Sage Expense Management)

**After photo:**
- User taps "Instafyle" icon → camera opens → snap receipt
- OCR picks up date, merchant, amount within seconds
- Expense form auto-fills immediately
- Receipt image attached and ready to submit

**Fields shown:** Amount, currency, date of spend, category, merchant name. All auto-filled.

**AI/OCR:** "3-click experience" — designed for minimal taps. Real-time extraction, not async processing.

**Save flow:** Auto-filled form → user reviews → submit. Instant alerts for out-of-policy expenses before submission (compliance built into the flow).

**Multi-channel:** Text, Gmail, Outlook, email forwarding, mobile app, web app.

**Key insight:** The real-time policy compliance check before save is clever — catches issues before they become problems. The "Instafyle" branding of their quick-capture is good naming.

---

## 4. Wave

**After photo:**
- Snap photo or bulk upload up to 10 receipts at once
- OCR auto-populates details (merchant, amount, date)
- Receipt linked to accounting transaction

**Fields shown:** Standard accounting fields. Category assignment.

**AI/OCR:** OCR-based auto-population. Unlimited receipt scanning.

**Save flow:** Capture → auto-extract → categorize → syncs with desktop. Changes on mobile sync to desktop and vice versa.

**Limitations:** Receipt scanning is a paid add-on ($8-11/month). Some users report app stability issues and data loss when switching between apps. App lacks desktop parity for complex tasks.

**Key insight:** The bulk upload (up to 10) is practical. The sync-to-desktop is important for users who start on mobile but finish on desktop. The stability issues are a cautionary tale — receipt capture must be rock-solid because losing a scanned receipt is infuriating.

---

## 5. Mint / Credit Karma

**Receipt scanning: NOT available.**

Mint shut down January 2024. Users migrated to Credit Karma, which focuses on credit monitoring. No receipt scanning, no budgeting, no expense categorization. Users can view transaction history from linked bank accounts but cannot categorize or track against budgets.

**Key insight:** The gap left by Mint's shutdown created opportunity for apps that combine transaction tracking WITH receipt capture. This is exactly the space Potraces could fill for Malaysian users.

---

## 6. Zoho Expense

**After photo:**
- User takes photo → selects category → submits
- **Quick Scan** mode: add multiple receipts for autoscan WITHOUT preview (speed-optimized)
- **Multipage** mode: combine multiple pages into single PDF document
- Autoscan extracts data in background

**Fields shown:** Date, amount, currency, merchant. Line-item level extraction. Coming soon: taxes, discounts, invoice numbers, reference numbers, due dates.

**AI/OCR:** Autoscan reads receipts in 14+ languages. Line-item level extraction (not just totals).

**Save flow:** Quick Scan bypasses preview entirely for speed. Standard mode: capture → category → submit.

**Key insight:** The **Quick Scan** (no preview) vs **Standard** (with preview) dual-mode is smart — power users want speed, new users want verification. The line-item extraction (individual items, not just total) is advanced and useful for splitting expenses.

---

## 7. SAP Concur (ExpenseIt)

**After photo:**
- User opens ExpenseIt within Concur app → takes photo
- Back-end processing: image digitized, OCR extracts data
- Once complete, blue **"certified" icon** appears on the receipt
- Expense claim auto-created from extracted data

**Fields shown:** Standard expense report fields. Merchant, date, amount.

**AI/OCR:** Enterprise-grade OCR. "Certified" status indicates legal-grade digitization.

**Save flow:** Camera → processing → certified → ready for reporting. The "certified" badge builds trust for enterprise compliance.

**Key insight:** The blue "certified" icon after processing is a trust signal — tells the user the receipt is legally valid and properly stored. This is relevant for any app that claims to help with tax records.

---

## 8. Grab (Southeast Asia Super App)

**Receipt handling: Auto-generated e-receipts, not user-scanned.**

- E-receipt automatically emailed after ride/delivery completion
- Transaction history viewable in-app (past 6 months)
- Daily GrabPay wallet statement can be toggled on (emailed next day)
- Receipts sent as email body, not PDF attachment
- Integration with Expensify for business expense management

**Key insight:** Grab doesn't do receipt *scanning* — it generates receipts. But the auto-email receipt pattern and transaction history browsing are relevant UX references. The Expensify integration shows how super apps defer to specialized tools for expense management.

---

## 9. Touch 'n Go eWallet (Malaysia)

**Receipt handling: Transaction history, not receipt scanning.**

- Transaction history under "Overview" tab → "View Transactions"
- Filter by date range or transaction type
- Can email transaction history to registered email
- Can hide transactions from history for cleaner view
- 24M+ verified users, 62% market preference in Malaysia

**Key insight:** No receipt scanning, but the transaction history UX is the local benchmark. The "hide transactions" feature is interesting — acknowledges that not all transactions are worth tracking. The email export is how Malaysian users share financial records.

---

## 10. BigPay (Malaysia)

**Receipt handling: Auto-categorized spending analytics, not receipt scanning.**

- Automatic spending categorization across all transactions
- Monthly and yearly spending breakdown by category
- Instant push notification on every transaction
- Detailed analytics page: balance, loan repayments, monthly expenses by category
- QR payments, P2P transfers, budgeting tools

**Key insight:** BigPay's auto-categorization of card transactions is the closest thing to receipt intelligence in the Malaysian market. The instant notification per transaction is expected behavior — Potraces should match this for any captured receipt. The spending breakdown by category is the output that receipt scanning should feed into.

---

## General UX Best Practices

### The Ideal Flow

```
Camera → [Auto-capture or manual tap] → Processing indicator → 
Extracted fields (editable) → Category selection → Save
```

### Variations by User Sophistication

| User Type | Ideal Flow | Example |
|---|---|---|
| Power user | Camera → auto-save (edit later) | Expensify |
| Standard user | Camera → preview → edit fields → save | Dext, Fyle |
| Cautious user | Camera → preview → confirm each field → save | Zoho standard |
| Batch user | Camera × N → process all → review queue | Zoho Quick Scan, Dext Multiple |

### Loading State After Photo

**Best practice:** Skeleton shimmer on the form fields while OCR processes.
- Show receipt thumbnail immediately (the photo itself loads instantly)
- Show form field placeholders with shimmer animation (150-300ms pulse)
- Fields "fill in" one by one or all at once when extraction completes
- If < 500ms processing: skip skeleton, show fields directly
- If 1-3 seconds: skeleton shimmer is ideal
- If > 3 seconds: show progress indicator with "Extracting details..." text

**DoorDash pattern (relevant):** Left-to-right shimmer across skeleton fields. Perceived load time feels 30% shorter.

### Editable Extracted Fields

**Best patterns:**
1. **Inline editable fields** — extracted values appear as pre-filled form inputs. User can tap any field to edit. No separate "edit mode."
2. **Confidence indicators** — numerical score (0-1) or visual indicator per field. Low-confidence fields highlighted or marked for review.
3. **Smart defaults** — if OCR can't extract a field, show placeholder text ("Add merchant name") rather than leaving blank.
4. **Field highlighting** — briefly highlight each field as it's extracted (subtle green flash or border pulse) to show the AI is working.

### Receipt Image Display

| Pattern | When to use |
|---|---|
| **Small thumbnail** (left of form) | When form fields are the focus. Expensify style. |
| **Header preview** (top of form, 30% height) | When receipt verification matters. Dext style. |
| **Full-screen viewer** (tap to expand) | Always available as secondary action. Pinch-to-zoom. |
| **Split view** (receipt left, form right) | Tablet/landscape only. Not for phone portrait. |

**Recommendation for Potraces:** Header preview (receipt photo at top, ~30% of screen) + tap to expand to full-screen viewer. Form fields below the preview.

### Save Confirmation Patterns

| Pattern | Pros | Cons | Used by |
|---|---|---|---|
| **Auto-save** (no confirmation) | Fastest, zero friction | User anxiety, harder to cancel | Expensify |
| **Bottom sheet** | Non-disruptive, keeps context | Limited space for many fields | Fintech standard |
| **Full-screen form** | Room for all fields, focused | Feels heavy for quick captures | Dext, Zoho |
| **Inline confirm** (single button) | Quick, clear action | May miss review step | Fyle |

**Recommendation for Potraces:** Full-screen form with receipt preview at top. Not a bottom sheet (too cramped for receipt + fields). Not auto-save (Potraces users want control). Single "Save" button at bottom, not a confirmation dialog.

### Category Auto-Assignment

**Best approaches:**
1. **Merchant-based** — "Starbucks" → Food & Drink. Most reliable.
2. **Learning-based** — "You categorized similar receipts as Groceries." Dext does this well.
3. **Amount-based** — Large amounts default to different categories than small ones.
4. **Suggested with one-tap override** — Show suggested category as pill, tap to change. Don't force a picker.

### Micro-interactions Worth Implementing

1. **Camera auto-capture** — detect receipt edges, auto-snap when aligned (like passport scanners)
2. **Receipt edge detection overlay** — green border overlay when receipt is properly framed
3. **Field fill animation** — extracted values "type themselves in" left-to-right (like a typewriter effect)
4. **Confidence pulse** — low-confidence fields have a subtle amber pulse inviting correction
5. **Success haptic** — light haptic feedback when extraction completes successfully
6. **Category chip animation** — suggested category slides in from right, settable with one tap
7. **Receipt thumbnail in transaction list** — small receipt icon on transactions that have receipts attached

### Dark Patterns to Avoid

1. **Forced premium upsell on scan** — don't show "upgrade to scan more" after 3 receipts. If you have limits, show them upfront.
2. **Fake processing delay** — don't add artificial delay to make OCR seem more sophisticated. Be honest about speed.
3. **Hidden manual entry** — don't hide the manual entry option to push people toward scanning. Some receipts can't be scanned.
4. **Overconfident extraction** — don't show extracted data without any indication it might be wrong. Always allow editing.
5. **Receipt lock-in** — don't make it hard to export or delete receipt images. Users own their data.
6. **Guilt-tripping on skip** — if user skips receipt for a transaction, don't nag. Respect the choice.
7. **Mandatory category** — don't block save if user hasn't categorized. Allow "Uncategorized" and prompt later.

---

## Competitive Landscape Summary for Potraces

### What exists in Malaysia
- **Touch 'n Go:** Transaction history only, no receipt scanning
- **BigPay:** Auto-categorized spending, no receipt scanning  
- **Grab:** Auto-generated e-receipts, no user scanning

### The gap
No Malaysian fintech app offers receipt scanning with OCR extraction for personal expense tracking. This is entirely served by Western apps (Expensify, Dext) aimed at businesses, not individuals.

### Potraces opportunity
A receipt scanner that:
1. Works with Malaysian receipts (RM currency, SST tax, Malay+English text)
2. Feeds into personal budget tracking (not expense reports)
3. Uses calm, non-corporate UI (not enterprise software)
4. Supports both BM and English receipt text
5. Integrates with the existing wallet/transaction/category system

### Recommended Potraces Receipt Flow

```
1. TAP receipt icon (from Quick Add or transaction detail)
2. CAMERA opens with edge detection overlay
3. SNAP (auto or manual)
4. PREVIEW: receipt image top 30%, form fields below
   - Amount (extracted, editable, RM default)
   - Merchant (extracted, editable)
   - Date (extracted, editable)
   - Category (auto-suggested pill, tap to change)
   - Wallet (pre-selected from active wallet)
   - Note (optional, empty)
5. Shimmer animation on fields while extracting (1-2 sec)
6. Fields fill in with subtle animation
7. User reviews, edits if needed
8. TAP "Save" → haptic feedback → transaction created
9. Receipt thumbnail visible on transaction in list view
```

---

## Sources

### Expensify
- [Expensify Receipt Scanning App](https://use.expensify.com/receipt-scanning-app)
- [Expensify July 2025 Update](https://use.expensify.com/blog/expensify-july-2025-product-update-new-features)
- [Expensify Mobile App](https://use.expensify.com/expensify-mobile-app)
- [SmartScan Makes Paper Receipts History](https://smallbiztrends.com/expensify-smartscan/)

### Dext
- [Dext Capture Receipts & Invoices](https://dext.com/us/business/product/capture-receipts-and-invoices)
- [How to Use Dext Mobile App](https://help.dext.com/en/articles/416730-how-to-use-the-dext-mobile-app)
- [How to Scan Documents in Dext](https://help.dext.com/en/articles/105670-how-to-scan-and-upload-documents-in-the-dext-mobile-app)
- [Dext Prepare Review 2026](https://aitoolshop.co/reviews/dext-prepare-review/)

### Fyle
- [Fyle Receipt Scanner App](https://www.fylehq.com/receipt-scanner-app)
- [Fyle Mobile Expense Reporting](https://www.fylehq.com/blog/mobile-expense-reporting-for-modern-employees)
- [Fyle Easy Expense Tracking](https://www.fylehq.com/mobile)

### Wave
- [Wave Receipts](https://www.waveapps.com/receipts)
- [Wave Receipt Upload Help](https://support.waveapps.com/hc/en-us/articles/360059848112-Scan-and-upload-your-receipts)
- [Introducing Receipts by Wave](https://www.waveapps.com/blog/introducing-receipts-by-wave)

### Zoho Expense
- [Zoho Receipt Scanner App](https://www.zoho.com/us/expense/receipt-scanner-app/)
- [Zoho Autoscan Receipts Guide](https://www.zoho.com/us/expense/help/expenses/autoscan-receipts/)
- [Zoho Receipt Tracking](https://www.zoho.com/us/expense/receipt-tracking/)

### SAP Concur
- [Concur Receipt Capture Guide](https://www.concur.com/blog/article/how-capture-receipts-your-mobile-phone)
- [Concur ExpenseIt](https://www.concur.com/receipt-management-app)
- [Concur Receipt Digitization](https://www.concur.com/blog/article/digitize-receipts-sap-concur)

### Grab
- [Downloading Grab Receipts Guide](https://receiptor.ai/guides/merchants/downloading-grab-receipts-a-step-by-step-guide)
- [Grab Help — Access Receipts](https://help.grab.com/passenger/en-ph/115005686007-How-can-I-access-my-receipts)
- [Grab Fintech Expansion](https://techcollectivesea.com/2025/05/29/grab-fintech-southeast-asia/)

### Touch 'n Go
- [TnG Transaction History Help](https://support.tngdigital.com.my/hc/en-my/articles/360035649754-How-can-I-view-or-download-my-transaction-history)
- [TnG eWallet Guide](https://wise.com/my/blog/touch-n-go-ewallet)

### BigPay
- [BigPay App (Google Play)](https://play.google.com/store/apps/details?id=com.tpaay.bigpay)
- [BigPay Malaysia Review](https://wise.com/my/blog/bigpay-review)
- [BigPay App Redesign](https://fintechnews.my/38235/various/bigpay-redesigns-app-ahead-of-full-suite-financial-services-rollout/)

### UX Best Practices
- [Fintech UX Best Practices 2026 (Eleken)](https://www.eleken.co/blog-posts/fintech-ux-best-practices)
- [Fintech App Design Guide (UXDA)](https://theuxda.com/blog/top-20-financial-ux-dos-and-donts-to-boost-customer-experience)
- [Bottom Sheets UX Guidelines (NN/g)](https://www.nngroup.com/articles/bottom-sheet/)
- [Skeleton Screens (NN/g)](https://www.nngroup.com/articles/skeleton-screens/)
- [Bottom Sheets in Banking UX](https://medium.com/@bhargav.kattunga/why-bottom-sheets-saved-my-sanity-in-banking-app-design-0394583af106)
- [Receipt Scanner App Comparison (FreshBooks)](https://www.freshbooks.com/hub/productivity/receipt-scanning-apps)
- [Best Receipt Scanner Apps 2026 (BILL)](https://www.bill.com/blog/best-receipt-scanning-app)
- [OCR Confidence Scoring (Taggun)](https://www.taggun.io/)
- [Veryfi Receipt OCR](https://www.veryfi.com/receipt-ocr-api/)
- [Dark Patterns Examples (Eleken)](https://www.eleken.co/blog-posts/dark-patterns-examples)

### Design Inspiration
- [Dribbble: Receipt Scanner Designs](https://dribbble.com/tags/receipt_scanner)
- [Dribbble: Receipt App Designs](https://dribbble.com/tags/receipt-app)
- [Behance: Scanner App Case Studies](https://www.behance.net/search/projects/scanner%20app%20ui%20design%20case%20study)
- [Behance: Receipt UI Projects](https://www.behance.net/search/projects/receipt%20ui)
- [UXfolio: Receipts Scan App Case Study](https://uxfol.io/project/04619d08/UX-Design---Receipts-Scanner-App)
- [Mobbin: Bottom Sheet Patterns](https://mobbin.com/explore/mobile/ui-elements/bottom-sheet)
