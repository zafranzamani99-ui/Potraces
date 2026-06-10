# -*- coding: utf-8 -*-
"""Feature guide: How to Add Money — every method. Run: python gen_add_expense.py"""
import os, _docgen as dg

d = dg.FeatureDoc(
    kicker="POTRACES · FEATURE GUIDE",
    title="Adding Money — Every Method",
    subtitle="Every way an expense, income, or money movement gets recorded — personal & business",
    meta="Updated June 2026 · code-accurate reference · personal mode + all business sub-modes",
)

# ---------------- OVERVIEW ----------------
d.h("Overview — read this first")
d.p("Potraces records money in many places, through many surfaces. There is one rule that "
    "explains almost everything below:")
d.callout("`addTransaction` does NOT move wallet balances. Every screen that records a "
          "transaction must ALSO call `deductFromWallet` (expense) or `addToWallet` (income) "
          "itself. The only store action that bundles its own wallet write is a wallet "
          "transfer / `addTransferIncome`.", kind="note")
d.p("So when you read 'on save' below, the wallet change is done by the screen, not the store. "
    "This is why every method lists its wallet side-effect separately.")
d.p("There are **four** input methods the app records on each transaction (`inputMethod`): "
    "`manual`, `text` (AI from notes), `photo` (receipt scan), `voice`. Business transactions "
    "use a narrower set: `manual`, `text`, `voice`.")

# ---------------- AT A GLANCE ----------------
d.h("1.  Every method at a glance")
d.legend([("PERSONAL MODE", dg.OLIVE_TINT, dg.OLIVE),
          ("BUSINESS MODE", dg.GOLD_TINT, dg.GOLD),
          ("NEEDS AI / INTERNET", dg.TERRA_TINT, dg.TERRA)])
d.table(
    ["Method", "Mode", "inputMethod", "AI?", "Where"],
    [
        [("Quick Add (the + FAB)", dg.OLIVE_TINT, dg.OLIVE), "Personal", "manual", ("No", dg.OLIVE_TINT, dg.OLIVE), "Floating button, any screen"],
        [("Edit a transaction", dg.OLIVE_TINT, dg.OLIVE), "Personal", "(unchanged)", ("No", dg.OLIVE_TINT, dg.OLIVE), "Tap a row in Transactions"],
        [("Notes → AI extract", dg.OLIVE_TINT, dg.OLIVE), "Personal", "text", ("Yes*", dg.TERRA_TINT, dg.TERRA), "Notes → 'extract' pill"],
        [("Voice (mic)", dg.OLIVE_TINT, dg.OLIVE), "Personal", "text", ("Yes", dg.TERRA_TINT, dg.TERRA), "Notes → mic → extract"],
        [("MoneyChat (Echo)", dg.OLIVE_TINT, dg.OLIVE), "Personal", "(undefined)", ("Yes", dg.TERRA_TINT, dg.TERRA), "Echo chat"],
        [("Receipt scan", dg.OLIVE_TINT, dg.OLIVE), "Both", "photo", ("Yes", dg.TERRA_TINT, dg.TERRA), "Camera / gallery"],
        [("Statement / CSV import", dg.OLIVE_TINT, dg.OLIVE), "Personal", "manual", ("Partly", dg.GOLD_TINT, dg.GOLD), "Import screens"],
        [("Debt payment", dg.OLIVE_TINT, dg.OLIVE), "Both", "manual", ("No", dg.OLIVE_TINT, dg.OLIVE), "Debt screen"],
        [("Goal contribution", dg.OLIVE_TINT, dg.OLIVE), "Personal", "manual", ("No", dg.OLIVE_TINT, dg.OLIVE), "Goals"],
        [("Subscription 'mark paid'", dg.OLIVE_TINT, dg.OLIVE), "Personal", "manual", ("No", dg.OLIVE_TINT, dg.OLIVE), "Subscriptions"],
        [("Wallet transfer", dg.OLIVE_TINT, dg.OLIVE), "Personal", "(not a tx)", ("No", dg.OLIVE_TINT, dg.OLIVE), "Wallets"],
        [("LogIncome (text/voice)", dg.GOLD_TINT, dg.GOLD), "Business", "text/voice", ("Yes", dg.TERRA_TINT, dg.TERRA), "Freelance/rider/etc."],
        [("On-the-road add", dg.GOLD_TINT, dg.GOLD), "Business", "manual", ("No", dg.OLIVE_TINT, dg.OLIVE), "Rider/mixed/parttime"],
        [("Seller order + payment", dg.GOLD_TINT, dg.GOLD), "Business", "—", ("WhatsApp opt.", dg.GOLD_TINT, dg.GOLD), "NewOrder / OrderList"],
        [("Seller cost", dg.GOLD_TINT, dg.GOLD), "Business", "—", ("Scan opt.", dg.GOLD_TINT, dg.GOLD), "CostManagement"],
        [("Stall sale / POS", dg.GOLD_TINT, dg.GOLD), "Business", "—", ("No", dg.OLIVE_TINT, dg.OLIVE), "Stall / POS"],
    ],
    widths=[2.1, 0.95, 1.15, 0.9, 2.1],
)
d.p("*Notes extraction falls back to an **offline** local Manglish parser when AI is "
    "unavailable (lower confidence).", size=9, color=dg.MUTED, italic=True)

# ================= PART A: PERSONAL =================
d.h("2.  Personal mode — the methods in detail")

d.h2("2.1  Quick Add — the + FAB (the everyday way)")
d.p("**Where:** a draggable floating + button on any screen (its position is remembered). "
    "**File:** `QuickAddExpense.tsx`.")
d.p("**Flow:** a 3-step sliding card — **Amount → Category → Wallet** (drops to 2 steps if you "
    "have one wallet or none).")
d.bullet("**Amount step:** custom numpad (max 7 digits, 2 decimals); toggle **went out / came in** "
         "(expense/income); tap the amount to pick a **currency** — non-RM shows a live ≈ RM value.")
d.bullet("**Category step:** grid of your expense or income categories.")
d.bullet("**Wallet step:** only shown if you have more than one wallet.")
d.p("**On save:** a **duplicate guard** first (same amount + wallet + type within 10 minutes → "
    "asks skip / keep both). Then `addTransaction({ inputMethod:'manual' })`, and the screen "
    "**deducts** (expense) or **adds** (income) to the wallet. Success haptic + toast with **Undo**. "
    "If you have no wallets, it auto-creates a 'Cash' wallet so the money has somewhere to live. "
    "Logging **income** may offer to start a Playbook.")
d.callout("Quick Add can't set a custom **date** (always now), attach a receipt, or add tags / a "
          "long description. Use the Edit sheet (2.2) afterward for those.", kind="manual")

d.h2("2.2  Edit / fix a transaction")
d.p("**Where:** tap any row in the Transactions list → a bottom sheet. **Files:** "
    "`TransactionsList.tsx` + `EditTransactionSheet.tsx`.")
d.p("**Editable:** amount, description, category, type (expense/income), tags, wallet, **date**.")
d.p("**On save:** the screen reconciles the wallet — if the wallet is unchanged it applies just "
    "the difference; if you switched wallets it fully reverses the old one and applies the new. "
    "Amount changes on a **debt-linked**, **goal-linked**, or **business-transfer** transaction "
    "are **locked** — edit those at their source.")

d.h2("2.3  Notes → AI extract (Manglish / natural language)")
d.p("**Where:** open a note, type free text like \"lunch ali RM25, netflix 55\", tap the "
    "**extract** pill. **Files:** `NoteEditor.tsx`, `intentEngine.ts`, `manglishParser.ts`.")
d.p("**How it reads the text:**")
d.num("**Local pre-filter** (offline): regex pulls out RM amounts (`RM12`, `rm 12.50`, "
      "`12 ringgit`, `netflix-75`, `100-faris`) and matches expense / income / debt / savings / "
      "seller keywords. No money words → nothing happens, no AI call.")
d.num("**AI step (Gemini 2.5 Flash → Flash-Lite)** when available + within quota: classifies each "
      "item into expense, income, debt, BNPL, seller order/cost, subscription, savings goal, "
      "playbook, or a question — and returns amount, description, category, type, wallet, person.")
d.num("**Offline fallback:** if AI is unavailable, the local parser still extracts amounts + "
      "intent (multi-line debt lists, salary-envelope playbooks) at lower confidence.")
d.p("**You confirm each result** as a card (confirm / skip / edit). Confirming an expense/income "
    "writes `addTransaction({ inputMethod:'text' })` + wallet adjust. Other intents create debts, "
    "subscriptions, goal contributions, etc.")
d.callout("The AI step needs a Gemini key + quota + internet. Without it you still get the offline "
          "parser (amounts + keywords), just less smart.", kind="online")

d.h2("2.4  Voice (the mic)")
d.p("**Where:** the mic in a note. **Files:** `useVoiceInput.ts`, `expo-audio`.")
d.p("Tap to record → tap to stop → the audio is sent to **Gemini** for transcription "
    "(Malay/English/Manglish) → the transcript is **appended to your note text**. You then tap "
    "**extract** (2.3). So voice doesn't create a transaction by itself — it fills the note, then "
    "extraction turns it into money. (A separate older voice path using Google Speech-to-Text is "
    "used by business **LogIncome**, see 3.1.)")

d.h2("2.5  MoneyChat (Echo) — chat that does things")
d.p("**Where:** the Echo chat screen. **Files:** `MoneyChat.tsx`, `moneyChat.ts`, `chatActions.ts`.")
d.p("Echo (Gemini) can both answer questions and **perform actions**. It emits hidden `[ACTION]` "
    "blocks the app executes. Transaction-creating actions: `add_expense`, `add_income`, "
    "`split_bill` (records the full expense AND creates one debt per person), `add_bnpl` (needs a "
    "credit wallet), `debt_update`. Destructive actions ask for confirmation first. "
    "**Note:** chat-created transactions don't set an `inputMethod`.")
d.callout("The read-only insights chat (`EchoInlineChat`) can talk about your money but **cannot** "
          "create transactions — only MoneyChat executes actions.", kind="note")

d.h2("2.6  Receipt scan")
d.p("**Where:** camera or gallery. **Files:** `ReceiptScanner.tsx`, `receiptScanner.ts`.")
d.p("The image is compressed and sent to **Gemini vision**, which extracts vendor, line items, "
    "subtotal, tax, total, date, location, payment method, and a suggested category. You review "
    "and edit, pick a wallet, then save: `addTransaction({ inputMethod:'photo' })` + wallet deduct, "
    "and the receipt image is stored and linked. A **'record only'** option saves the receipt "
    "WITHOUT creating a transaction. (A separate seller-receipt path turns supplier bills into a "
    "cost and queues offline if needed.)")

d.h2("2.7  Statement / CSV import (bulk)")
d.p("**Where:** Import screens. **Files:** `ImportFromStatement.tsx`, `ImportFromCsv.tsx`. "
    "Parses a bank statement or a CSV file into many ordinary transactions at once "
    "(`inputMethod:'manual'`), crediting a chosen wallet.")

d.h2("2.8  Wallet transfer (money between your own wallets)")
d.p("**Where:** Wallets screen. Moving money between two of your wallets is a **`WalletTransfer`**, "
    "not a transaction — but it also writes two mirror rows so it shows in history. Covered fully "
    "in the **Wallets** guide.")

# ================= PART B: BUSINESS =================
d.h("3.  Business mode — the methods in detail")
d.p("Business mode has sub-modes (seller, stall, freelance, part-time, rider, mixed). Money lands "
    "in different stores depending on the sub-mode, and reaches your **personal** money only when "
    "you explicitly **transfer** it.")

d.h2("3.1  LogIncome (freelance / part-time / rider / mixed)")
d.p("**File:** `LogIncome.tsx` → `addBusinessTransaction`. Two input modes:")
d.bullet("**Text:** type free text → 'parse' → Claude Haiku fills amount + note (`inputMethod:'text'`).")
d.bullet("**Voice:** hold to record → Google Speech-to-Text → parse (`inputMethod:'voice'`).")
d.p("After saving it offers a **transfer to personal**, and for riders a quick **cost** entry.")

d.h2("3.2  On-the-road Add Earnings / Add Cost (rider, mixed, part-time)")
d.p("Dedicated quick screens (`ontheroad/AddEarnings.tsx`, `AddCost.tsx`, and mixed/part-time "
    "equivalents). Tile-pick a category (petrol / maintenance / data / toll / parking / "
    "insurance / other), amount, date, note → `addBusinessTransaction({ inputMethod:'manual' })`.")

d.h2("3.3  Seller orders (an order = an income event)")
d.p("**File:** `NewOrder.tsx` → `addOrder`. An order holds items, customer, total, status, and "
    "payment. Money-in is recorded by **payments on the order**: `recordPayment` (deposit), "
    "`markOrderPaid` (pay the rest). A WhatsApp message can be parsed into items (local or AI). "
    "Seller income reaches personal money only via **transfer**.")

d.h2("3.4  Seller costs")
d.p("**File:** `CostManagement.tsx` → `addIngredientCost`. Entered manually, from a scanned "
    "supplier receipt, or synced to a personal transaction.")

d.h2("3.5  Stall sales & generic POS")
d.p("**Stall:** `addSale` records each sale (cash / QR) inside the active session; session totals "
    "accumulate. **POS (legacy generic business):** a cart → checkout → `addSale` (cash / digital "
    "/ card), decrementing stock, optionally creating a CRM order. Both reach personal money only "
    "by transfer.")

# ================= PART C: LINKED MOVEMENTS =================
d.h("4.  Money movements that quietly create a transaction")
d.p("These aren't 'add expense' screens, but each one writes a real linked transaction:")
d.table(
    ["Action", "Creates", "Wallet effect", "Link field"],
    [
        ["Debt payment", "Income (they owe) / expense (I owe)", "Add / deduct", "linkedDebtId, linkedPaymentId"],
        ["Goal contribution", "Expense, category 'savings'", "Deduct", "linkedGoalId"],
        ["Goal withdrawal", "Income", "Add", "linkedGoalId"],
        ["Subscription 'mark paid'", "Expense", "Deduct", "(payment record)"],
        ["Business → personal transfer", "Income, category 'from business'", "Add (bundled)", "id 'transfer-…'"],
    ],
    widths=[1.8, 2.5, 1.3, 2.0],
)
d.callout("Debt-, goal-, and transfer-linked transactions have a **locked amount** in the edit "
          "sheet and can't be deleted from the Transactions list — manage them at their source "
          "(the debt, the goal, the transfer).", kind="manual")

# ================= PART D: DATA MODEL =================
d.h("5.  The Transaction data model")
d.p("Every personal transaction is this shape (`src/types/index.ts`). Optional fields are marked ◦.")
d.table(
    ["Field", "Type", "Meaning"],
    [
        ["id", "string", "Unique id"],
        ["amount", "number", "Value in RM (MYR-equivalent if multi-currency)"],
        ["category", "string", "Category id (food, savings, 'from business', …)"],
        ["description", "string", "Free text / merchant / category name"],
        ["date", "Date", "Transaction date"],
        ["type", "'income' | 'expense'", "Direction"],
        ["mode", "'personal' | 'business'", "Which mode created it"],
        ["walletId ◦", "string", "Wallet the money moved through"],
        ["receiptUrl ◦", "string", "Local URI of an attached receipt"],
        ["tags ◦", "string[]", "User tags"],
        ["inputMethod ◦", "manual|text|photo|voice", "How it was entered"],
        ["rawInput ◦", "string", "Original natural-language/voice text"],
        ["confidence ◦", "'high' | 'low'", "AI extraction confidence"],
        ["linkedDebtId / linkedPaymentId ◦", "string", "Links to a debt + its payment"],
        ["linkedGoalId / linkedGoalContributionId ◦", "string", "Links to a goal + contribution"],
        ["editLog ◦", "TransactionEdit[]", "Append-only audit of financial edits"],
        ["playbookLinks ◦", "PlaybookExpenseLink[]", "Playbook attribution"],
        ["originalAmount / originalCurrency / fxRate ◦", "—", "Pre-conversion values if non-RM"],
        ["timeContext / dayContext / sizeContext … ◦", "—", "AI enrichment tags"],
        ["createdAt / updatedAt", "Date", "Set by the store"],
    ],
    widths=[2.7, 1.9, 3.0],
)

d.h2("inputMethod — which method sets which value")
d.table(
    ["Value", "Set by"],
    [
        ["manual", "Quick Add, debt payment, goal contribution, business transfer, on-the-road adds"],
        ["text", "Notes AI extract (expense/income/playbook); business LogIncome typed"],
        ["photo", "Receipt scanner"],
        ["voice", "Business LogIncome voice (Notes voice feeds text → becomes 'text')"],
        ["(undefined)", "MoneyChat actions (add_expense / add_income / split_bill / add_bnpl)"],
    ],
    widths=[1.3, 6.3],
)

# ================= PART E: AI + RECURRING + GOTCHAS =================
d.h("6.  AI engines, recurring, and the fine print")
d.h2("AI models used")
d.bullet("**Gemini 2.5 Flash → Flash-Lite** — notes intent extraction, receipt vision, note voice "
         "transcription, MoneyChat. Key: `EXPO_PUBLIC_GEMINI_API_KEY`.")
d.bullet("**Anthropic Claude** (Haiku for parsing, Sonnet for chat) — business text parsing, "
         "WhatsApp order parsing, older Q&A. Key: `EXPO_PUBLIC_ANTHROPIC_API_KEY`.")
d.bullet("**Google Cloud Speech-to-Text** (ms-MY / en-MY) — business LogIncome voice.")
d.h2("Recurring transactions")
d.p("There is **no auto-firing recurring engine**. Recurring bills are modelled as "
    "**Subscriptions** (monthly / yearly / weekly / quarterly) and only become a real transaction "
    "when you tap **mark paid**. Reminders are scheduled as notifications. (Sellers have a separate "
    "manual `RecurringCost`.)")
d.h2("Offline behaviour")
d.bullet("**Works offline:** Quick Add, edit, the local Manglish parser (amounts + keywords).")
d.bullet("**Online-only:** receipt scan, MoneyChat, voice transcription, the smart AI step.")
d.bullet("**Queues offline:** seller supplier-receipt scans drain when back online.")
d.h2("Gotchas / what is NOT possible")
d.bullet("`addTransaction` rejects amounts ≤ 0 and never touches the wallet — the screen must.")
d.bullet("The **duplicate guard** (10-minute window) exists only in Quick Add, not the other surfaces.")
d.bullet("Quick Add can't set date / receipt / tags — use the edit sheet after.")
d.bullet("Wallet transfers and business sales/orders/stall sales are **not** personal transactions "
         "and won't appear in personal spending until transferred/synced.")
d.bullet("**No bank auto-detection** anywhere — every transaction is entered by a person or AI from "
         "text/photo/voice the person provided. (See the Bank-Connection brief for why.)")

d.rule()
d.p("Source research: docs/research/auto-capture-global-research.md and the in-repo code "
    "referenced throughout (QuickAddExpense.tsx, intentEngine.ts, receiptScanner.ts, "
    "DebtTracking.tsx, personalStore.ts, walletStore.ts).", size=8.5, color=dg.MUTED, italic=True)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "01-Adding-Money-Every-Method.docx")
d.save(out)
print("WROTE:", out)
