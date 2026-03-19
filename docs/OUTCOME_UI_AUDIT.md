# Prompt 3 — Outcome-Framed UI: Phase 1 Audit Report

> Audit date: 2026-03-19
> Scope: Every screen, every AI prompt, every label, CALM design system
> Zero code changes — report only

---

## 1. Complete Screen Inventory

### Personal Mode (12 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 1 | Dashboard | `screens/personal/Dashboard.tsx` | **Advisor** | "Monthly Balance", "Total Net Worth", "Income", "Expenses", "Saved", "Budget" |
| 2 | Expense Entry | `screens/personal/ExpenseEntry.tsx` | Filing Cabinet | "Expense", "Income", "Amount", "Category", "Wallet" |
| 3 | Transactions | `screens/personal/TransactionsList.tsx` | Filing Cabinet | "expense", "income", "amount", "transactions" |
| 4 | Reports | `screens/personal/Reports.tsx` | Filing Cabinet | "Income vs Expenses", "Expenses by Category", "Active Subscriptions", "Monthly Cost", "Top Categories" |
| 5 | Budget Planning | `screens/personal/BudgetPlanning.tsx` | **Advisor** | "Budget", "Allocated", "Spent", "Remaining", "Utilization" |
| 6 | Goals | `screens/personal/Goals.tsx` | **Advisor** | "Target", "Current", "Progress", "Deadline", "Savings", "Contribution" |
| 7 | Savings Tracker | `screens/personal/SavingsTracker.tsx` | **Advisor** | "Savings", "Investment", "Current Value", "Return", "Gain", "Loss", "Portfolio" |
| 8 | Wallet Management | `screens/personal/WalletManagement.tsx` | Filing Cabinet | "Wallet", "Balance", "Transfer", "Default" |
| 9 | Account Overview | `screens/personal/AccountOverview.tsx` | **Advisor** | "Total Net Worth", "Monthly Balance", "Income", "Expenses", "Budget Utilization", "Portfolio", "Return", "Debts" |
| 10 | Financial Pulse | `screens/personal/FinancialPulse.tsx` | **Advisor** | "Financial Wellness Score", "Cash Flow", "Spending Velocity", "Savings Rate", "Budget Adherence", "Upcoming Bills" |
| 11 | Money Chat | `screens/personal/MoneyChat.tsx` | **Advisor** | "expense", "income", "budget", "afford", "spending", "savings" |
| 12 | Subscriptions | `screens/personal/SubscriptionList.tsx` | Filing Cabinet | "Subscriptions", "Billing Cycle", "Monthly Cost", "Next Billing", "Installment" |

**Personal: 7 Advisor, 5 Filing Cabinet**

---

### Business Mode — General (11 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 13 | Biz Dashboard | `screens/business/Dashboard.tsx` | **Advisor** | "came in", "costs", "you kept", "grossed" (mostly compliant) |
| 14 | Setup | `screens/business/Setup.tsx` | Filing Cabinet | None (clean) |
| 15 | Reports | `screens/business/Reports.tsx` | Filing Cabinet | **"Total Revenue"**, **"Total Profit"**, **"Profit Margin"**, "Monthly Sales" |
| 16 | Log Income | `screens/business/LogIncome.tsx` | **Advisor** | "income", "pay", "transfer", "costs" |
| 17 | Income Streams | `screens/business/IncomeStreams.tsx` | Filing Cabinet | "income", "source" |
| 18 | Inventory | `screens/business/Inventory.tsx` | Filing Cabinet | "Stock", "Cost", "Price", "Margin", "Inventory" |
| 19 | POS | `screens/business/POS.tsx` | **Advisor** | "price", "discount", "total" |
| 20 | CRM | `screens/business/CRM.tsx` | Filing Cabinet | "sales", "orders" |
| 21 | Client List | `screens/business/ClientList.tsx` | Filing Cabinet | "clients" |
| 22 | Supplier List | `screens/business/SupplierList.tsx` | Filing Cabinet | "supplier" |
| 23 | Rider Costs | `screens/business/RiderCosts.tsx` | Filing Cabinet | "costs", "petrol" |

---

### Business — Seller Sub-mode (10 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 24 | Seller Dashboard | `screens/seller/Dashboard.tsx` | **Advisor** | "total income", "costs", "kept", "unpaid", "outstanding" |
| 25 | New Order | `screens/seller/NewOrder.tsx` | **Advisor** | "payment", "unpaid", "partial", "paid", "price", "quantity" |
| 26 | Order List | `screens/seller/OrderList.tsx` | Filing Cabinet | "orders", "payment status" |
| 27 | Products | `screens/seller/Products.tsx` | Filing Cabinet | "price", "cost", "margin" |
| 28 | Customers | `screens/seller/Customers.tsx` | Filing Cabinet | "orders", "total spent" |
| 29 | Transactions | `screens/seller/Transactions.tsx` | Filing Cabinet | "transactions", "income", "expense" |
| 30 | Manage | `screens/seller/Manage.tsx` | Filing Cabinet | "season", "products" |
| 31 | Season Summary | `screens/seller/SeasonSummary.tsx` | **Advisor** | "revenue", "costs", "margin", "performance" |
| 32 | Past Seasons | `screens/seller/PastSeasons.tsx` | Filing Cabinet | "revenue", "profit" |
| 33 | Cost Management | `screens/seller/CostManagement.tsx` | Filing Cabinet | "costs", "expenses" |

---

### Business — Stall Sub-mode (8 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 34 | Stall Dashboard | `screens/stall/Dashboard.tsx` | **Advisor** | "TOTAL", "revenue", "cash", "qr" |
| 35 | Sell Screen | `screens/stall/SellScreen.tsx` | **Advisor** | "price", "quantity", "discount", "total" |
| 36 | Session Setup | `screens/stall/SessionSetup.tsx` | Filing Cabinet | "session", "location" |
| 37 | Session History | `screens/stall/SessionHistory.tsx` | Filing Cabinet | "sessions", "total" |
| 38 | Session Summary | `screens/stall/SessionSummary.tsx` | **Advisor** | "total", "items sold" |
| 39 | Close Session | `screens/stall/CloseSession.tsx` | **Advisor** | "total", "cash", "digital" |
| 40 | Stall Products | `screens/stall/StallProducts.tsx` | Filing Cabinet | "price", "stock" |
| 41 | Regular Customers | `screens/stall/RegularCustomers.tsx` | Filing Cabinet | "orders", "total" |

---

### Business — Freelancer Sub-mode (5 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 42 | Freelancer Dashboard | `screens/business/freelancer/FreelancerDashboard.tsx` | **Advisor** | "clients", "average", "payment" |
| 43 | Client List | `screens/business/freelancer/ClientList.tsx` | Filing Cabinet | "clients", "payments" |
| 44 | Client Detail | `screens/business/freelancer/ClientDetail.tsx` | Filing Cabinet | "payment history", "total paid" |
| 45 | Add Payment | `screens/business/freelancer/AddPayment.tsx` | Filing Cabinet | "payment", "amount" |
| 46 | Freelancer Reports | `screens/business/freelancer/FreelancerReports.tsx` | Filing Cabinet | "income", "clients", "average" |

---

### Business — Mixed Sub-mode (6 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 47 | Mixed Dashboard | `screens/business/mixed/MixedDashboard.tsx` | **Advisor** | "came in", "costs", "kept" |
| 48 | Mixed Reports | `screens/business/mixed/MixedReports.tsx` | Filing Cabinet | "income", "costs" |
| 49 | Mixed Setup | `screens/business/mixed/MixedSetup.tsx` | Filing Cabinet | "streams" |
| 50 | Add Income | `screens/business/mixed/AddIncome.tsx` | Filing Cabinet | "income", "amount" |
| 51 | Add Cost | `screens/business/mixed/AddCost.tsx` | Filing Cabinet | "cost", "amount" |
| 52 | Stream History | `screens/business/mixed/StreamHistory.tsx` | Filing Cabinet | "income", "stream" |

---

### Business — On-the-Road Sub-mode (6 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 53 | OTR Dashboard | `screens/business/ontheroad/OnTheRoadDashboard.tsx` | **Advisor** | "earned", "costs", "kept" |
| 54 | OTR Reports | `screens/business/ontheroad/OnTheRoadReports.tsx` | Filing Cabinet | "earnings", "costs" |
| 55 | OTR Setup | `screens/business/ontheroad/OnTheRoadSetup.tsx` | Filing Cabinet | "platform" |
| 56 | Add Earnings | `screens/business/ontheroad/AddEarnings.tsx` | Filing Cabinet | "earnings", "amount" |
| 57 | Add Cost | `screens/business/ontheroad/AddCost.tsx` | Filing Cabinet | "cost", "amount" |
| 58 | Cost History | `screens/business/ontheroad/CostHistory.tsx` | Filing Cabinet | "costs" |

---

### Business — Part-time Sub-mode (5 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 59 | PT Dashboard | `screens/business/parttime/PartTimeDashboard.tsx` | **Advisor** | "earned", "shifts" |
| 60 | PT Reports | `screens/business/parttime/PartTimeReports.tsx` | Filing Cabinet | "income", "shifts" |
| 61 | PT Setup | `screens/business/parttime/PartTimeSetup.tsx` | Filing Cabinet | "employer" |
| 62 | Add Income | `screens/business/parttime/AddIncome.tsx` | Filing Cabinet | "income", "amount" |
| 63 | Income History | `screens/business/parttime/IncomeHistory.tsx` | Filing Cabinet | "income" |

---

### Shared Screens (12 screens)

| # | Screen | File | Classification | Key Jargon Found |
|---|--------|------|---------------|-----------------|
| 64 | Settings | `screens/shared/Settings.tsx` | Filing Cabinet | None (clean) |
| 65 | Onboarding | `screens/shared/Onboarding.tsx` | **Advisor** | "comes in", "goes out" (compliant) |
| 66 | Debt Tracking | `screens/shared/DebtTracking.tsx` | Filing Cabinet | "I Owe", "They Owe Me", "pending", "partial", "settled" |
| 67 | Receipt Scanner | `screens/shared/ReceiptScanner.tsx` | Filing Cabinet | "expense", "amount", "category" |
| 68 | Receipt Detail | `screens/shared/ReceiptDetail.tsx` | Filing Cabinet | "receipt", "amount" |
| 69 | Receipt History | `screens/shared/ReceiptHistory.tsx` | Filing Cabinet | "claimable" (tax context, OK) |
| 70 | Notes Home | `screens/notes/NotesHome.tsx` | Filing Cabinet | None |
| 71 | Note Editor | `screens/notes/NoteEditor.tsx` | **Advisor** | "Expense", "Income", "Debt", "Payment" |
| 72 | Confirmation Card | `screens/notes/ConfirmationCard.tsx` | **Advisor** | "saved", "skipped" |
| 73 | Query Result Card | `screens/notes/QueryResultCard.tsx` | **Advisor** | Context-dependent |
| 74 | Auth Screen | `screens/auth/AuthScreen.tsx` | Filing Cabinet | None |
| 75 | OTP Verification | `screens/auth/OtpVerificationScreen.tsx` | Filing Cabinet | None |

**Shared: 4 Advisor, 8 Filing Cabinet**

---

## 2. Filing Cabinet Score

| Mode | Total | Filing Cabinet | Advisor | FC % |
|------|-------|---------------|---------|------|
| Personal | 12 | 5 | 7 | 42% |
| Business General | 11 | 8 | 3 | 73% |
| Seller | 10 | 7 | 3 | 70% |
| Stall | 8 | 4 | 4 | 50% |
| Freelancer | 5 | 4 | 1 | 80% |
| Mixed | 6 | 5 | 1 | 83% |
| On-the-Road | 6 | 5 | 1 | 83% |
| Part-time | 5 | 4 | 1 | 80% |
| Shared | 12 | 8 | 4 | 67% |
| **TOTAL** | **75** | **50** | **25** | **67%** |

**67% of screens are passive Filing Cabinets** — they show data without answering "so what?"

Business sub-modes are the worst offenders (73-83%). Personal mode is the best (42%) thanks to Dashboard, FinancialPulse, and MoneyChat carrying the advisor weight.

---

## 3. Language Audit — Jargon & Cold Data Framing

### CRITICAL VIOLATIONS (words banned by CALM vocabulary)

| Location | Violation | Should Be |
|----------|-----------|-----------|
| `business/Reports.tsx` | "Total Revenue" | "total came in" |
| `business/Reports.tsx` | "Total Profit" | "total kept" |
| `business/Reports.tsx` | "Profit Margin" | "kept per sale" or just "margin" |
| `business/Reports.tsx` | "Monthly Sales" | "monthly flow" |
| `seller/SeasonSummary.tsx` | "revenue" | "came in" |
| `seller/PastSeasons.tsx` | "revenue", "profit" | "came in", "kept" |
| `business/Inventory.tsx` | "Inventory" (screen name) | "Products" |
| `personal/SavingsTracker.tsx` | "Loss" | avoid — use neutral framing |

### HIGH-PRIORITY REFRAMES (not banned but cold/clinical)

| Location | Current | Reframe To |
|----------|---------|-----------|
| Personal Dashboard | "Monthly Balance" | "your month so far" |
| Personal Dashboard | "Total Net Worth" | "everything you have" |
| Financial Pulse | "Financial Wellness Score" | "your money pulse" |
| Financial Pulse | "Cash Flow" | "in & out" |
| Financial Pulse | "Spending Velocity" | "your pace this month" |
| Financial Pulse | "Budget Adherence" | "staying in rhythm" |
| Financial Pulse | "Savings Rate" | "what you're keeping" |
| Budget Planning | "Allocated" | "set aside" |
| Budget Planning | "Utilization" | remove — use progress bar only |
| Account Overview | "Budget Utilization" | "how your plan is going" |
| Savings Tracker | "Portfolio" | "your accounts" |
| Savings Tracker | "Return" | "growth" |
| Savings Tracker | "Initial Investment" | "what you put in" |
| Goals | "Contribution" | "added" |
| Subscriptions | "Billing Cycle" | "repeats" |
| Subscriptions | "Next Billing" | "coming up" |
| Debt Tracking | "Outstanding" | "still open" |
| All Reports | "Income vs Expenses" | "in vs out" |
| All Reports | "Expenses by Category" | "where it went" |
| All Reports | "Top Categories" | "biggest slices" |
| Seller | "total income" | "total came in" |
| Seller | "outstanding" | "still waiting" |

### NEUTRAL BUT IMPROVABLE (not wrong, but could be warmer)

- "Expense" → "went out" (in display contexts, keep "expense" for data entry)
- "Income" → "came in" (same)
- "Balance" → "what's there" or just the number
- "Amount" → keep for input fields, avoid as display labels
- "Transactions" → "activity" or "what happened"

---

## 4. AI Prompt Tone Audit

### Echo (playbookAI.ts) — Plan Mode
- **Tone**: Warm, analytical, like a smart friend
- **Language rules**: ✅ Uses "kept"/"came in"/"went out", avoids "profit/loss/revenue"
- **Personalization**: ✅ Dynamic — reads 3 months of data, past playbooks, echo memory
- **Gap**: Greeting + summary are outcome-focused, but individual items are data-labeled ("makan: RM 600")

### Echo (moneyChat.ts) — Chat Mode
- **Tone**: ✅ Excellent — calm, warm, Malaysian, genuinely conversational
- **Absolute rules**: ✅ Never says "you should", never judges, never compares to others
- **Language**: ✅ Strict CALM vocabulary enforced in prompt
- **Personalization**: ✅ Full financial context injected per message
- **Gap**: None — this is the gold standard for the app's voice

### Spending Mirror (spendingMirror.ts)
- **Tone**: ✅ Mirror, not advisor — reflective narrative
- **Personalization**: ✅ Dynamic monthly data
- **Gap**: Output is a blob of text — no structured outcome framing

### Receipt Scanner (receiptScanner.ts)
- **Tone**: N/A — extraction only, no user-facing text
- **Gap**: Extracts data but doesn't generate any outcome narrative

### Query Engine (queryEngine.ts)
- **Tone**: Neutral data retrieval
- **Detection keywords**: Uses "revenue" and "sales" internally for query matching (not user-facing)
- **Gap**: Returns raw `{ title, value, detail }` — no outcome framing, no "so what?"

---

## 5. CALM Design System — Current State

### Vocabulary Rules (defined in memory/MEMORY.md + constants)
- ✅ "kept" not "saved"
- ✅ "went out" not "spent"
- ✅ "came in" not "earned/received"
- ✅ No red anywhere
- ✅ Lowercase labels in seller mode

### NOT YET DEFINED (gaps in vocabulary)
- No vocabulary for: breathing room, rhythm, comfort zone, getting clear
- No per-business-mode vocabulary (seller, stall, freelancer, etc.)
- No narrative style guide (when to use AI text vs static labels)
- No "so what?" framing rules for data display
- No Story Card system
- No time-as-context guidelines

### Color System
- ✅ Comprehensive — CALM (light), CALM_DARK (dark), BIZ (business semantic), DEBT (debt semantic)
- ✅ No red — uses bronze, gold, terracotta for warnings/alerts
- ✅ Tabular nums on all amounts

### Typography
- ✅ Hero (48/200), Balance (36/300), Amount (48/200), Insight (14/22), Label (12/uppercase), Muted (12)
- Gap: No "narrative" or "story" text style for AI-generated content

---

## 6. Top 10 Highest-Impact Reframe Opportunities

Ranked by: frequency of use × visual prominence × improvement potential

| Rank | Screen | Current State | Reframe Impact | Effort |
|------|--------|--------------|----------------|--------|
| 1 | **Personal Dashboard** | Shows numbers (balance, income, expenses) as hero. "Monthly Balance" heading. | Lead with narrative: "you're in a comfortable spot" with numbers as supporting detail. Add time context ("12 days left, on pace"). | Medium |
| 2 | **Financial Pulse** | Clinical labels: "Financial Wellness Score", "Cash Flow", "Spending Velocity", "Budget Adherence". Feels like a medical report. | Rename everything to warm language. "Your money pulse" not "Financial Wellness Score". "Your pace" not "Spending Velocity". | Small |
| 3 | **Business Reports** | Uses banned words: "Revenue", "Profit", "Profit Margin". Pure data dump. | Fix language violations. Add "so what?" context to every metric. "You kept 62% of what came in — that's steady." | Medium |
| 4 | **Transactions List** | Raw chronological list. No context, no grouping insight, no "so what?". | Add section headers with context: "Tuesday — quiet day, just grab" instead of just "Mar 18". | Medium |
| 5 | **Account Overview** | Dense metric dashboard. "Net Worth", "Budget Utilization" — financial advisor language. | Reframe as "your full picture" with warm labels and narrative summaries per section. | Medium |
| 6 | **Budget Planning** | "Allocated", "Spent", "Remaining", "Utilization" — spreadsheet language. | "Set aside RM 600 for makan — you've used RM 450 so far, breathing room: RM 150". | Medium |
| 7 | **Savings Tracker** | "Portfolio", "Return", "Gain/Loss", "Initial Investment" — investment banker language. | "Your accounts are growing" with warm framing. "You put in RM 5,000, it's now RM 5,340 — nice." | Small |
| 8 | **Personal Reports** | "Income vs Expenses" charts with no narrative. Pure visualization. | Add AI narrative per chart: "Food is your biggest slice — same as last month, nothing unusual." | Large |
| 9 | **Seller Dashboard** | Good — already uses "kept", "came in". But hero number has no context. | Add: "better than last week" or "slower start than February" — time comparison. | Small |
| 10 | **All Business Sub-mode Reports** | Freelancer, Mixed, OTR, Part-time reports are all data tables with no narrative. | Each gets a 2-sentence AI narrative about what matters this month. | Large |

---

## 7. Summary Findings

### What's Working
- **MoneyChat AI prompt** is the gold standard — warm, Malaysian, never prescriptive
- **Echo plan/chat** follows CALM vocabulary well
- **Dashboard (personal)** is partially Advisor-oriented
- **Color system** is fully compliant (no red, semantic colors)
- **Business Dashboard** uses "kept"/"came in" correctly

### What Needs Work
- **67% of screens are Filing Cabinets** — show data without meaning
- **8 critical vocabulary violations** — banned words in production (Revenue, Profit, etc.)
- **22+ high-priority reframes** — cold/clinical labels that should be warm
- **Zero narrative generation** on report/history screens
- **No per-mode vocabulary guide** for business sub-modes
- **No Story Card system** for contextual dashboard insights
- **No "so what?" framework** — numbers are shown without context everywhere
- **No time-as-context** — screens don't reference "days left", "compared to last month", etc.
- **No narrative text style** in typography system

### The Core Problem
The app's **AI voice** (Echo, MoneyChat) is excellent — warm, honest, Malaysian, never judgmental. But the app's **static UI voice** is a completely different personality — clinical, data-heavy, spreadsheet-like. The transformation is about making the static UI match the AI voice.
