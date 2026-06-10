# -*- coding: utf-8 -*-
"""Feature guide: Wallets. Run: python gen_wallet.py"""
import os, _docgen as dg

d = dg.FeatureDoc(
    kicker="POTRACES · FEATURE GUIDE",
    title="Wallets",
    subtitle="Every way money is held, moved, reconciled — and why it's all manual",
    meta="Updated June 2026 · code-accurate reference",
)

d.h("Overview")
d.p("A wallet is a **manually-managed money container** — bank account, e-wallet, or credit/BNPL. "
    "You type its balance; the app keeps it in sync as you log transactions, transfers, debt "
    "payments, and goal contributions. There is **no bank connection** anywhere in the app.")
d.callout("Wallets are 100% manual. There is no access token, account number, Plaid/OAuth, or "
          "bank-sync field anywhere in the wallet model, store, or cloud schema. Bank/e-wallet "
          "'presets' are just a name + brand logo shortcut. (See the Bank-Connection brief for "
          "why — Malaysia's open-banking rails don't go live until 2027.)", kind="manual")

# 1. DATA MODEL
d.h("1.  What a wallet is — the data model")
d.table(
    ["Field", "Type", "Meaning"],
    [
        ["id", "string", "Unique local id"],
        ["name", "string", "Wallet name (e.g. 'Maybank', 'Cash'). Required, trimmed"],
        ["type", "bank | ewallet | credit", "Drives behaviour, grouping, and cash-exclusion"],
        ["balance", "number", "Spendable balance. For credit = available credit (limit − used)"],
        ["initialBalance ◦", "number", "Balance at creation; the starting point for reconciliation"],
        ["icon", "string", "Feather icon (used when there's no brand logo)"],
        ["color", "string", "Accent hex (earthy palette, no harsh red)"],
        ["isDefault", "boolean", "Exactly one wallet is the default"],
        ["presetId ◦", "string", "Links to a preset (maybank, tng, credit_card…) → brand logo"],
        ["creditBank ◦", "string", "Credit card: issuing bank preset id"],
        ["creditNetwork ◦", "string", "Credit card: visa | mastercard | amex"],
        ["creditLimit ◦", "number", "Credit/BNPL total limit"],
        ["usedCredit ◦", "number", "Amount currently owed on a credit wallet"],
        ["createdAt / updatedAt", "Date", "Timestamps"],
    ],
    widths=[1.9, 2.2, 3.5],
)
d.p("Related records: **WalletTransfer** `{ from, to, amount, note?, date, kind:'transfer'|'repayment' }` "
    "and tombstone arrays for sync. Full details in §7 and §9.")

# 2. TYPES
d.h("2.  The three wallet types")
d.table(
    ["Type", "Example", "Behaviour"],
    [
        [("bank", dg.OLIVE_TINT, dg.OLIVE), "Maybank, CIMB, Public Bank", "Cash. Counted in the dashboard balance"],
        [("ewallet", dg.OLIVE_TINT, dg.OLIVE), "TnG, GrabPay, ShopeePay, Boost", "Cash. Counted in the dashboard balance"],
        [("credit", dg.GOLD_TINT, dg.GOLD), "Atome, SPayLater, Credit Card", "NOT cash. Inverted balance (see below)"],
    ],
    widths=[1.2, 2.6, 3.8],
)
d.h2("The credit wallet is special")
d.bullet("**`balance` means available credit** = `creditLimit − usedCredit`. Editing the limit "
         "recomputes the balance.")
d.bullet("**Spending on credit:** balance ↓, `usedCredit` ↑ (`deductFromWallet` / `useCredit`).")
d.bullet("**Paying it down:** balance ↑, `usedCredit` ↓ (`addToWallet` / `repayCredit`).")
d.bullet("The wallet picker shows it as **'Avail. RM x'**.")
d.callout("Brand-defining rule: **credit is NOT cash.** The Dashboard hero balance sums only "
          "bank + e-wallet wallets and excludes credit entirely. The Wallets screen shows "
          "'cash after credit used' = cash − credit owed. Don't 'fix' this — it's intentional.",
          kind="note")

# 3. CREATING
d.h("3.  Creating a wallet")
d.p("**Where:** the + button on the Wallets screen. **Flow:** pick **type + provider** → "
    "(credit card only: pick **network** then **bank**) → **details** (name, initial balance or "
    "credit limit, icon + colour or brand logo).")
d.p("**Limits:** free tier allows 6 wallets total and 2 per type; premium is unlimited. The first "
    "wallet you create becomes the default automatically.")
d.h2("Malaysian presets (name + brand logo)")
d.bullet("**Banks (16):** Maybank, CIMB, Public Bank, RHB, Hong Leong, AmBank, Bank Islam, "
         "Bank Rakyat, BSN, Agrobank, MBSB, Affin, Alliance, HSBC, UOB, OCBC.")
d.bullet("**E-Wallets (8):** Touch 'n Go, GrabPay, Boost, ShopeePay, BigPay, Setel, DuitNow, GXBank.")
d.bullet("**Credit / BNPL (5):** Atome, SPayLater, Grab PayLater, generic Credit Card, TikTok PayLater.")
d.p("16 earthy accent colours and type-specific icon sets are available for non-preset wallets.")

# 4. EDIT/DELETE
d.h("4.  Editing & deleting")
d.bullet("**Edit:** name, icon, colour, and balance (or credit limit, which recomputes the "
         "available balance). The type isn't changed in the edit path.")
d.bullet("**Delete:** removes the wallet and **orphans** linked records — it nulls the `walletId` "
         "on transactions, goal contributions, and debt payments. It does **not** refund or reverse "
         "their past balance effects. Deletions leave a durable tombstone so they don't resync.")

# 5. BALANCE MECHANICS
d.h("5.  How a balance changes (every path)")
d.table(
    ["Mechanism", "Action", "Triggered by"],
    [
        ["Set at creation", "addWallet → initialBalance", "Creating the wallet"],
        ["Add money", "addToWallet", "Logging income, debt receipt, goal withdrawal, transfer in"],
        ["Remove money", "deductFromWallet", "Logging expense, debt 'I owe' payment, goal contribution, transfer out"],
        ["Use credit", "useCredit", "Spending on a credit wallet"],
        ["Repay credit", "repayCredit", "Paying down a credit wallet"],
        ["Transfer", "transferBetweenWallets", "Moving money between two wallets"],
        [("Manual overwrite", dg.GOLD_TINT, dg.GOLD), ("setWalletBalance", dg.GOLD_TINT, dg.GOLD), ("Reconciliation only (§6)", dg.GOLD_TINT, dg.GOLD)],
    ],
    widths=[1.7, 2.0, 3.8],
)
d.p("All arithmetic is rounded to avoid floating-point drift. **Balance changes happen in the "
    "screen, not in `addTransaction`** — logging, editing, and deleting transactions each adjust "
    "the wallet explicitly (and reverse it cleanly on delete/edit).")
d.callout("Negative balances are **allowed** — a deduction that would go below zero logs a warning "
          "and proceeds (transfers are guarded against insufficient source balance, though).",
          kind="manual")

# 6. RECONCILIATION
d.h("6.  Reconciliation ('recalculate balance')")
d.p("Lets you reset a cash wallet's stored balance to a value **recomputed from its entire "
    "history** — replaying transactions, transfers, debt payments, and goal contributions from "
    "the `initialBalance`. **File:** `walletReconcile.ts`.")
d.bullet("Available only for non-credit wallets, via the wallet action sheet.")
d.bullet("Shows stored vs computed vs the difference, and warns that an unlogged opening deposit "
         "will make the recompute wrong.")
d.bullet("Also runs automatically after a cloud pull to repair multi-device drift.")

# 7. TRANSFERS
d.h("7.  Transfers & credit repayments")
d.h2("Transfer (cash wallet → cash wallet)")
d.p("Validates both wallets, amount > 0, source ≠ destination, and amount ≤ source balance. Moves "
    "the balance, records a `WalletTransfer` (kind `transfer`), and writes **two mirror "
    "transactions** ('Transfer to…' / 'Transfer from…') so it appears in history. Only non-credit "
    "wallets can be a transfer source/destination.")
d.h2("Repayment (cash wallet → credit wallet)")
d.p("Validates a credit wallet + a cash source; amount ≤ source balance AND ≤ amount owed. Then: "
    "`repayCredit` (used ↓, available ↑) → `deductFromWallet` on the source → logs a `repayment`-"
    "kind transfer → writes one expense transaction ('credit repayment'). Deleting a transfer/"
    "repayment reverses both wallets and tombstones the record.")

# 8. WHERE USED
d.h("8.  Where wallets are used")
d.p("`walletId` links a wallet to many record types — each is where money flows through a wallet:")
d.table(
    ["Record", "Wallet role"],
    [
        ["Transaction", "The wallet money moved through (reversed on edit/delete)"],
        ["Debt Payment", "Which wallet paid / received the debt money"],
        ["Goal Contribution / Goal", "Source wallet for saving toward a goal"],
        ["Subscription / SubscriptionPayment", "Wallet charged on 'mark paid' (refunded on undo)"],
        ["SplitExpense", "Wallet that paid a split (credit-aware)"],
        ["Receipt", "Wallet charged when a scanned receipt is recorded"],
        ["Statement import", "Wallet credited by an imported batch"],
    ],
    widths=[2.6, 5.0],
)
d.p("The shared **WalletPicker** is the one selector used everywhere — it groups by type, sorts "
    "the default first, can filter by type, and can offer a 'None' option.")

# 9. DEFAULT + SYNC
d.h("9.  Default wallet, selection & sync")
d.bullet("**Default wallet:** exactly one is the default; the first wallet auto-defaults; setting a "
         "new default demotes the old. The invariant self-heals on load and at runtime if it ever "
         "breaks.")
d.bullet("**selectedWalletId:** a global 'currently focused' pointer; cleared if that wallet is deleted.")
d.bullet("**Local persistence:** AsyncStorage, with safe date rehydration (bad dates fall back to "
         "now so the app never crashes) and migration of legacy wallets.")
d.bullet("**Cloud (premium):** wallets and transfers back up to Supabase (owner-only) keyed by "
         "local id, last-write-wins, with tombstones — a **backup of your manual data**, not a "
         "bank link. (Brand-logo metadata is local-only and can be lost on a pure remote restore.)")

# 10. GOTCHAS
d.h("10.  Edge cases & gotchas")
d.bullet("**No bank connection** — confirmed across the model, store, and schema (see overview).")
d.bullet("**Credit balance is inverted** — it means *available credit*, easy to misread.")
d.bullet("**Negative balances allowed** (warning only).")
d.bullet("**Delete orphans, never refunds** — deleting a wallet severs links but doesn't reverse "
         "past money movements.")
d.bullet("**Debt/goal/subscription wallet effects live in the screens**, not the store — which is "
         "exactly what reconciliation exists to repair.")
d.bullet("**Per-type free cap (2)** can be hit before the overall free cap (6).")

d.rule()
d.p("Source: src/store/walletStore.ts, src/types/index.ts, src/constants/premium.ts, "
    "src/screens/personal/WalletManagement.tsx, src/utils/walletReconcile.ts, "
    "src/screens/personal/Dashboard.tsx.", size=8.5, color=dg.MUTED, italic=True)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "02-Wallets.docx")
d.save(out)
print("WROTE:", out)
