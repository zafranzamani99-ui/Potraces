# Stall Mode — Feature & Workflow Guide

> A complete walkthrough of **stall mode** in Potraces — what it is, how a user moves
> through it, every screen, the data model behind it, and the known gaps.
> Written so a teammate can understand the whole feature without reading the code first.
>
> _Last updated: 2026-06-10_
>
> ⚠️ **Sections 1–15 describe the original baseline.** Stall mode has since grown a large
> optional feature layer (Phases 1–3): quick-sell, an editable sales ledger, custom-amount
> sales, mid-session restock, repeat-last setup, an optional cash-box + net "kept", regulars
> attached to sales + loyalty, pre-orders, pause, clearance, 5-sen rounding, and product
> modifiers. **See §16 for those additions**, and [STALL_MODE_ROADMAP.md](STALL_MODE_ROADMAP.md)
> for the build status. Where §1–15 and §16 disagree, **§16 is current.**

---

## 1. What stall mode is

Stall mode is one of **6 business "income types"** a user can pick (the others are
`seller`, `freelance`, `parttime`, `rider`, `mixed`). It is built for **live, in-person,
walk-up selling** — _pasar malam, roadside, bazaar_ — where you sell on the spot and take
cash or QR (DuitNow) payments.

The whole mode is organised around one idea: the **session**.

> **A session = one selling period / one market day.**
> You **start** a session when you set up the stall, **log sales** into it in real time,
> and **close** it when you pack up. Closed sessions become your history. It is the
> stall-mode equivalent of a "season" in seller mode, but much shorter-lived (hours, not weeks).

Only **one session can be active at a time.**

### Money model — important
Stall mode is **revenue-first**: by default it tracks **gross money that came in**, split into
**cash** vs **QR** (`totalRevenue`/`totalCash`/`totalQR`; the UI always says **"came in"**, never
"revenue"). As of Phase 2 there is an **optional** cost layer — per-product `unitCost` + session
overheads — that yields a **"kept" (net)** number, plus an **optional** cash-box count for
reconciliation. Both are skippable and only appear once data is entered, so a vendor who fills
nothing still gets exactly the revenue-only behaviour described here. There is still **no
cash-tendered/change calculator**. See **§16** for the optional layer.

---

## 2. How a user enters stall mode

Entry happens on the **business setup screen** (`src/screens/business/Setup.tsx`), which is
shown whenever `businessSetupComplete` is `false`.

1. Header asks **"how does money come to you?"**
2. A list of 6 tiles appears. The stall tile is labelled **"Stall / walk-in"** with sublabel
   **"pasar malam, roadside, bazaar"** and a `map-pin` icon.
3. User taps the stall tile (haptic + selected state), then taps the confirm button.
4. That runs `useBusinessStore.setState({ incomeType: 'stall', businessSetupComplete: true })`.
5. `BusinessNavigator` then renders the **stall tab set** (see §3).

> The income type can be changed later. In **seller** mode that link lives on the Manage
> screen; in stall and the other modes it lives in **Settings → Business Setup**.
> Changing it calls `resetSetup()`, which sends the user back to this same setup screen.

---

## 3. Navigation map

### Bottom tab bar (what the user sees in stall mode)
Defined in `src/navigation/BusinessNavigator.tsx`, `case 'stall'`. Icons only, no labels.

| # | Tab | Screen file | Icon | Purpose |
|---|-----|-------------|------|---------|
| 1 | **Home** | `stall/Dashboard.tsx` | `home` | Start/monitor the live session |
| 2 | **History** | `stall/SessionHistory.tsx` | `calendar` | Past (closed) sessions |
| 3 | **Sell** | `stall/SellScreen.tsx` | `shopping-bag` | The live point-of-sale |
| 4 | **Regulars** | `stall/RegularCustomers.tsx` | `heart` | Repeat-customer memory aid |
| 5 | **Settings** | `shared/Settings.tsx` | `settings` | Shared settings screen |

> Note: stall mode has **no Products tab** and **no Notes tab** (unlike freelance/rider/etc.).

### Stack-pushed screens (opened on top of the tabs)
Registered in `src/navigation/RootNavigator.tsx`. Each has a back-arrow header.

| Route | Screen file | Header | Opened from |
|-------|-------------|--------|-------------|
| `StallSessionSetup` | `stall/SessionSetup.tsx` | "New Session" | Dashboard CTA (no active session) |
| `StallCloseSession` | `stall/CloseSession.tsx` | "Close Session" | Dashboard (active session) |
| `StallSessionSummary` | `stall/SessionSummary.tsx` | "Session Summary" | After closing, **and** tapping a row in History |
| `StallProducts` | `stall/StallProducts.tsx` | "Products" | **Sell screen's empty state only** |

> ⚠️ Products management is **not** reachable from a tab — the only way in is the
> "manage products" button shown on the Sell screen when you have no products yet.

---

## 4. The end-to-end workflow

```
                 ┌──────────────── Settings → change income type (resetSetup) ─┐
                 │                                                              ▼
  Business setup → pick "Stall / walk-in" ──► STALL DASHBOARD (no session)
                                                   │
                                  "start selling"  ▼
                                          SESSION SETUP
                                  (name + starting stock per product)
                                                   │  start
                                                   ▼
                            ┌────────► STALL DASHBOARD (active, live monitor)
                            │              │                 ▲
                            │   logs sales │                 │ running total, recent sales
                            │              ▼                 │
                            │          SELL SCREEN (POS: pick products → cart → Cash/QR)
                            │              │
                            │  "close session"
                            │              ▼
                            │        CLOSE SESSION (condition + note)
                            │              │  close
                            │              ▼
                            │       SESSION SUMMARY  ──► optional: transfer "came in" → personal wallet
                            │              │  done                       ──► optional: share to WhatsApp
                            │              ▼
                            └──────── SESSION HISTORY (tap a past session ⇒ Session Summary again)
```

The four workflow phases are detailed below.

---

## 5. Phase 1 — Start a session (`SessionSetup.tsx`)

Opened from the dashboard's **"start selling"** button. Heading: **"new session"**.

**Inputs:**
1. **Session name** (optional) — e.g. _"pasar malam seri kembangan"_. Blank → stored as `undefined`.
2. **Product list** — only your **active** products appear. Header shows a "{selected} / {total} selected" badge.
   - Each product can be toggled in/out (default = in).
   - For each included product, a small **qty** field captures the **starting stock** you brought.
3. If you have no products yet → empty state: _"no products set up yet. you can still start selling."_

**Two ways to start:**
- **"start selling"** → builds a `{ productId, startQty }` list and calls `startSession(name, setup)`.
- **"skip setup"** → calls `startSession(name)` with no stock snapshot (every active product starts unlimited).

**What `startSession` does (in `stallStore.ts`):**
- Generates a session id.
- **Auto-closes any session that was still active** (single-active invariant).
- Builds a `productsSnapshot` for each active product: `{ productId, productName, startQty, remainingQty }`.
- Creates the session: `isActive: true`, empty `sales`, `totalRevenue/totalCash/totalQR = 0`.
- Prepends it to `sessions` and sets `activeSessionId`.

> **Stock rule:** stock only counts when `startQty > 0`. A product with `startQty = 0`
> (or started via "skip setup") is treated as **unlimited** and can never be "sold out".

---

## 6. Phase 2 — Sell (`SellScreen.tsx`) + the live dashboard

### 6a. The live dashboard (active-session state)
While a session is open, the **Home tab** turns into a read-only monitor:
- A pulsing green **"selling now"** indicator + the session name (if any).
- A **hero number**: total **"came in this session"**, with **cash** and **QR** pills underneath.
- **Recent sales**: the last 5 sales (newest first), each showing product, `x{qty}` (+`(QR)`), and line total. Empty → _"no sales yet this session"_.
- A **"close session"** button (→ `StallCloseSession`).

Actual sale logging happens on the **Sell tab**, not here.

### 6b. The Sell screen (point-of-sale)
A **two-pane layout**: a product grid on the left, an animated expand/collapse **cart** on the right.

**Gates (you can't always sell):**
1. **No active session** → full-screen empty state: _"no active session — start a session from the dashboard to begin selling."_
2. **Session but no active products** → _"add your products first"_ + a **"manage products"** button (→ `StallProducts`).
3. Otherwise → the full selling UI.

**Recording a sale, step by step:**
1. **Search / browse** the product grid (2-column cards; search bar filters by name).
   - Each card shows name, price, and remaining stock (if stock is being counted).
   - Sold-out cards (`startQty > 0 && remainingQty <= 0`) are dimmed, labelled **"sold out"**, and disabled.
2. **Tap a product** → it's added to the cart (or its quantity increments). A bronze count badge appears on the card. Won't exceed remaining stock.
3. **Adjust the cart** — expand the cart panel to review. Per line: stepper (−/qty/+), line total, remove (trash) button. **"Clear"** empties the cart.
4. **Optional discount** (expanded view only): toggle **percentage** vs **fixed amount**, type the value. Totals show Subtotal / Discount / **Total**.
5. **Pay** — tap **"Cash"** or **"QR"**. This **immediately records the whole cart** at the total.
   - There is **no cash-given / change screen** — one tap finalises the sale.
6. On save: success haptic + toast **"Sale recorded."**, cart clears, panel collapses.

**Under the hood (`handleCheckout` → `addSale`):**
- A discount is **distributed proportionally across cart lines**.
- **Each cart line is saved as its own `StallSale`** — there is **no single grouped "order/receipt" object.**
- For each sale, the store: appends it to the session, decrements that product's `remainingQty`
  (clamped at 0), adds to `totalRevenue` + (`totalCash` or `totalQR`), and bumps the product's
  lifetime `totalSold`.

---

## 7. Phase 3 — Close the session (`CloseSession.tsx`)

Opened by **"close session"** on the dashboard. Heading: **"close session"**.

1. **Preview card** — hero **"came in"** total, **duration**, **sale count**, and the **cash / QR** split.
2. **"HOW WAS IT?"** — an optional condition picker: **good · slow · rainy · hot · normal** (tap again to deselect).
3. **"NOTE"** — optional free text: _"anything to remember about today?"_
4. **"close session"** button → there is **no extra confirmation dialog**; it closes immediately.

**What `closeSession` stamps:** `isActive: false`, `closedAt: now`, the chosen `condition`,
the `note`, and clears `activeSessionId`. Money totals are **not** recomputed at close —
they were kept live as sales were logged. After closing, it navigates to **Session Summary**.

---

## 8. Phase 4 — Summary, transfer & share (`SessionSummary.tsx`)

Shown right after closing, and also re-opened when you tap a past session in History
(it's the **same screen** for both).

**What it shows (top to bottom):**
- Session name (if set) and **date** (e.g. "Tuesday, 10 Jun 2026").
- **Hero "came in"** number.
- **Duration** + **sale count**.
- **Cash / QR** split card.
- **Products** breakdown — each product with `{qty} sold` and its "came in", **sorted best-first**.
- **AI insight card** — a one-line plain-language observation (see §11).
- **Comparison card** — only with **3+ closed sessions**: _"RM 420 vs your RM 380 average"_.
- **Condition** badge + **note** (if set).
- **Transfer bridge** (see below).
- **"share summary"** and **"done"** buttons.

### Transfer to personal wallet (the money bridge)
This is how stall earnings move into the user's **personal** finances.
- Appears only when the session **hasn't** been transferred yet and `totalRevenue > 0`.
- Card **"TRANSFER TO PERSONAL"**, hint _"move stall earnings to your personal wallet"_.
- Amount is **pre-filled** with the session total (editable). Buttons: **"transfer"** / **"skip"**.
- On transfer: marks the session `transferredToPersonal: true`, then writes a transfer object to
  **both** the business store (money out) and the personal store (shows up as **income** in personal).
  A _"RM X transferred"_ confirmation shows and fades after 3s.

### Share
**"share summary"** opens the native share sheet (e.g. WhatsApp) with a plain-text recap:
total, cash/QR split, and a per-product line list.

---

## 9. Session history (`SessionHistory.tsx`)

The **History tab** lists all **closed** sessions, **newest first** (no user-facing sort/filter).

- If you have **3+ sessions**, a lifetime stats row appears: total **sessions**,
  **lifetime came in**, and **avg / session**.
- With **2+ sessions**, a one-line **insight** appears (see §11).
- Each card: title (name or date), condition badge, date · duration, the **came-in** total,
  and a meta line: `{n} sales · cash RM… · qr RM…`.
- **Tap a card** → opens **Session Summary** for that session.
- Empty state: _"no sessions yet — start selling to see your history here."_

---

## 10. Regular customers (`RegularCustomers.tsx`)

A lightweight **memory aid** for repeat customers — _not_ a full contact book.

**Per customer:** name, optional **"usual order"**, **visit count**, **last visit**, optional note.
(No money/spend total is stored per customer.)

**Workflow:**
- Tap the **+** in the header → inline add form (name, usual order, note) → **Save**. New customers prepend to the list.
- Tap a card → it morphs **in place** into an edit form (name/usual/note) with **Remove / Cancel / Save**.
- **Remove** shows a native confirm `Alert` before deleting.
- Empty state: a `users` icon with a title + hint; the **+** is the way to add.

**No search, no sort, no contacts import** on this screen (seller mode has those; stall does not).

> ⚠️ **Known gap (see §12):** the Sell screen never attaches a customer to a sale, so
> `visitCount` / `lastVisit` currently **never advance from selling**. The plumbing exists in
> the store (`StallSale.regularCustomerId` + `recordVisit`) but there is no customer-picker in the cart.

---

## 11. The "insight" lines (plain-language, rule-based)

Two pure helpers generate the one-line observations. They are **rule-based, not an LLM**, and
are written to be calm and observational — _"never advice or judgement."_ They return `null`
when there isn't enough data (which is why the UI gates on session counts).

**`explainStallSession(session, currency)`** — one session. Returns the first matching line by priority:
quiet session → short/long day → pace (RM/hour) → favourite product → `habis` (sold out) →
cash-vs-QR skew → weather/condition note → "solid session" (>RM500) → fallback "{n} sales, RM… total."

**`explainStallHistory(sessions, currency)`** — across sessions (needs ≥2). First match wins:
trending up/down (≥6 sessions) → strongest weekday (≥5) → rainy-days-bring-less → a product is
"more than half of what came in" → last session above/below usual → milestone (10th / 50th) →
fallback "{count} sessions, RM… average."

---

## 12. Data model (the source of truth)

Store: `src/store/stallStore.ts` · Types: `src/types/index.ts` · Persistence key: **`stall-storage`** (AsyncStorage).

**Persisted state:** `sessions[]`, `activeSessionId`, `products[]`, `regularCustomers[]`.

| Type | Key fields |
|------|-----------|
| `StallProduct` | `id, name, price, isActive, totalSold, createdAt, updatedAt` — **no unit, no cost** |
| `StallSale` | `id, sessionId, productId, productName, quantity, unitPrice, total, paymentMethod ('cash'\|'qr'), regularCustomerId?, timestamp` |
| `StallSession` | `id, name?, startedAt, closedAt?, isActive, condition?, sales[], productsSnapshot[], totalRevenue, totalCash, totalQR, note?, transferredToPersonal?, transferAmount?` |
| `RegularCustomer` | `id, name, usualOrder?, visitCount, lastVisit?, note?, createdAt` |

**Key store actions:** `startSession` · `closeSession` · `getActiveSession` · `addSale` · `removeSale`
· `addProduct` · `updateProduct` · `deleteProduct` · `addRegularCustomer` / `update` / `delete`
· `recordVisit` · `markSessionTransferred`.

**Derived selectors (computed, not persisted):**
- `getSessionSummary(id)` → totals, `saleCount`, `productBreakdown` (revenue-sorted), `avgSaleValue`, `duration` (mins).
- `getProductPerformance(id)` → over closed sessions: totals, sessions appeared, avg per session.
- `getLifetimeStats()` → over closed sessions: total sessions, total came-in, avg per session, best session.

**Money math (all rounded via `roundMoney`):**
- `total` per sale is **supplied by the caller**, not recomputed in the store.
- `totalRevenue += total`; `totalCash`/`totalQR += total` by payment method.
- Stock: on sale `remainingQty = max(0, remainingQty − qty)`; on remove, it's added back.
- No cost / profit / change is ever computed.

---

## 13. Cross-cutting behaviour

- **Tablet:** every screen caps content at `maxWidth: 680` and centres it.
- **Dark mode:** screens use `useCalm()` / `makeStyles(C)`.
  - ⚠️ One quirk: `CONDITION_CONFIG` in `SessionHistory.tsx` uses static light-palette `CALM.`
    refs, so the **condition badge colours don't adapt to dark mode** (the rest of the card does).
- **i18n:** all copy is under `t.stall.*`, `t.stallDashboard.*`, `t.stallHistory.*`,
  `t.stallRegulars.*` in `src/i18n/en.ts` + `ms.ts` (English + Malay).
- **Currency** comes from `useSettingsStore(s => s.currency)` (RM in MY context).
- **Active-product filtering is the linchpin:** SessionSetup, SellScreen, and the start-session
  snapshot all only ever use products where `isActive === true`.

---

## 14. Known gaps & things to be aware of

> **Note:** several gaps listed in earlier drafts are now CLOSED by Phases 1–3.
> Regulars **are** attributed to sales (via the Sell "serving" selector) and visits count;
> cost/profit ("kept") **does** exist as an optional layer. The list below is the **current**
> state.

**Still true (baseline limitations):**
1. **No grouped order/receipt.** Each cart line is a separate `StallSale`; there is no single
   transaction object grouping a checkout.
2. **Hard deletes, no tombstones/edit-log.** `deleteProduct` / `deleteRegularCustomer` /
   `deletePreOrder` remove rows outright. Sales keep a denormalized `productName`, so deleting a
   product won't corrupt historical display, but leaves `snapshot`/`totalSold` references dangling.
3. **No confirmation on close.** Tapping "close session" ends the session immediately.
4. **Old un-transferred sessions** can still show the transfer bridge when reopened from History.

**New Phase-3 limitations (documented during the code review — not yet addressed):**
5. **Pre-orders aren't linked to a regular.** The pre-order form captures a free-text
   `customerName` only — no `regularCustomerId`. So collecting an app-created pre-order does **not**
   credit a regular's visit/loyalty (a customer picker on the form would close this).
6. **Loyalty has no redemption/reset.** "Reward ready" shows at every multiple of `everyN` with no
   "claimed" flag — the vendor gives the reward manually; nothing records that it was given.
7. **Pre-order stock isn't reserved.** Pre-orders don't decrement the session snapshot until
   collected, and the setup planner's "cover pre-orders" raises `startQty` to **at least** the
   pre-order demand (not additive on top of walk-in stock). Walk-up quick sales can still consume
   units already promised to a pre-order.
8. **Spoilage / freebies (Phase 2c) not built.** No way to log non-sale stock-out, so stock
   reconciliation can't account for burnt/given-away units yet.

**Deliberate design choices (not bugs):**
- The ledger's **−** stepper clamps at qty 1; **void** is the removal path.
- **One visit per "serving"** (not per item) — undercounts if the vendor never clears the serving
  customer between two separate buyers.
- **5-sen cash rounding** rounds each cash line, so a multi-line cart total is a sum of 5-sen lines.

---

## 15. File map (where to look)

| Area | File |
|------|------|
| Store + business logic | `src/store/stallStore.ts` |
| Types | `src/types/index.ts` (`Stall*`, `RegularCustomer`) |
| Enter mode | `src/screens/business/Setup.tsx` |
| Tabs | `src/navigation/BusinessNavigator.tsx` (`case 'stall'`) |
| Stack screens | `src/navigation/RootNavigator.tsx` (search `Stall`) |
| Dashboard | `src/screens/stall/Dashboard.tsx` |
| Start session | `src/screens/stall/SessionSetup.tsx` |
| Sell (POS) | `src/screens/stall/SellScreen.tsx` |
| Products | `src/screens/stall/StallProducts.tsx` |
| Close session | `src/screens/stall/CloseSession.tsx` |
| Summary / transfer / share | `src/screens/stall/SessionSummary.tsx` |
| History | `src/screens/stall/SessionHistory.tsx` |
| Regulars + loyalty | `src/screens/stall/RegularCustomers.tsx` |
| Pre-orders | `src/screens/stall/PreOrders.tsx` |
| Insight lines | `src/utils/explainStallSession.ts`, `src/utils/explainStallHistory.ts` |
| Copy (EN/MY) | `src/i18n/en.ts`, `src/i18n/ms.ts` (`stall*` keys) |

---

## 16. Phases 1–3 additions (current behaviour)

Everything here is governed by **"optional depth, zero friction"** — every item is skippable,
nothing nags, no red. A vendor can run the whole day on tap-to-sell and touch none of it.
Build status + rationale live in [STALL_MODE_ROADMAP.md](STALL_MODE_ROADMAP.md).

### Phase 1 — speed + the forgiving spine (`SellScreen.tsx`, `SessionSetup.tsx`, `StallProducts.tsx`)
- **Quick-sell** — a **Quick / Cart** mode toggle. In Quick mode, one tap on a product tile = one
  sale at the session **default payment** (a persistent cash⇄qr pill), with a **success haptic +
  undo toast**. Cart mode is the original two-pane flow. (Switching to Quick is blocked while the
  cart has items, so nothing is stranded.)
- **Sales ledger** — tap the sale-count pill → a sheet of the session's sales; tap any sale to
  **change qty, switch cash↔QR, or void**. (`updateSale` / `removeSale`.)
- **Custom-amount sale** — `#` header button → type an amount, pick cash/qr, optional name, and
  **"save as a product"** (catalog grows from real sales). (`addCustomSale`.)
- **Restock mid-session** — long-press a tile → add stock (`restockProduct`); clears "sold out".
- **Reachable products** — a `package` header button opens Products any time (not just empty state).
- **Repeat-last setup + default stock** — Session Setup has a one-tap **"repeat last session"**
  (`getLastSetup`) and each product can carry an optional `defaultStartQty` that prefills setup.

### Phase 2 — optional cash-box layer (`CloseSession.tsx`, `SessionSummary.tsx`, `StallProducts.tsx`)
- **Cash-box reconciliation** — optional **starting float** (set in Setup or Close) + **count the
  drawer** at Close → summary shows **expected vs counted** with a calm over/short/matches pill.
  (`startingFloat`, `countedCash`, `getSessionEconomics`.)
- **Money out (overheads)** — a small list at Close (rental, gas, helper). (`expenses`,
  `addExpense`/`removeExpense`.)
- **Optional net "kept"** — per-product `unitCost` (stamped onto each sale as `costPerUnit`) +
  overheads → **came in → goods cost → money out → kept**, shown only when a cost exists.

### Phase 3 — retention + polish (`SellScreen.tsx`, `RegularCustomers.tsx`, `PreOrders.tsx`, `Dashboard.tsx`)
- **Regulars attached to sales + loyalty** — a **"serving"** selector in the Sell header attributes
  every sale (quick/cart/custom/modifier) to a chosen regular; **one visit per serving** is
  recorded. Loyalty config in the Regulars tab (**every N visits → reward**) shows progress / a
  "reward ready" badge and fires a toast on a milestone. (`regularCustomerId`, `recordVisit`,
  `loyalty`, `setLoyalty`.)
- **Pre-orders** — a stack screen (`StallPreOrders`, opened from the Dashboard with a pending-count
  badge): take an order (customer, collect-time, items via product chips or free text, paid/unpaid).
  **Collect** converts items into sales in the active session (`collectPreOrder`). Session Setup
  shows a **stock-planner banner** ("pre-orders need: …") that bumps starting stock. (`preOrders`,
  `getPreOrderStock`.) — see limitations §14.5–7.
- **Pause / resume** — Dashboard control; duration math subtracts paused time. (`pauseSession`,
  `resumeSession`, `pausedAccumMs`.)
- **Clearance mode** — header tag pill → "% off everything" for the session; applies to quick/cart/
  modifier sales (not typed custom amounts). (`clearancePercent`, `setClearance`.)
- **5-sen cash rounding** — a stall setting (Products footer); rounds **cash** sale totals to the
  nearest 5 sen across all paths. (`roundCashTo5`, `roundCash` helper.)
- **Product modifiers** — optional per-product quick options (e.g. _ais +0.50_). A product with
  options shows an **"⚙ options"** tag; tapping opens a chooser (+ "plain") and records an immediate
  labelled sale at base±delta (clamped ≥ 0). (`StallProduct.modifiers`, `handleModifierSale`.)
