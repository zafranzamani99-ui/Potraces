# Stall Mode — Build Roadmap

> Companion to [STALL_MODE.md](STALL_MODE.md) (which documents what exists today).
> This is the **decision + phased plan** for making stall mode the #1 choice for Malaysian
> stall vendors. Read the governing law first — it overrides every feature decision below.
>
> _Last updated: 2026-06-10_

---

## Build status (2026-06-10)

| Phase | Status |
|-------|--------|
| **Phase 1 — speed + forgiving spine** | ✅ **Built** (quick-sell, default-payment, ledger edit/void, custom-amount + save-as-product, mid-session restock + reachable products, repeat-last setup + default stock) |
| **Phase 2 — optional cash-box layer** | ✅ **Built** (starting float + cash count + expected/counted, money-out overheads, optional `unitCost` → net "kept") |
| **Phase 3 — retention + polish** | ✅ **Built** (regulars-on-sale + loyalty, pre-orders + collect + stock-planner, pause/resume, clearance mode, 5-sen rounding, product modifiers) |
| **Phase 2c — spoilage/freebie + stock reconciliation** | ⏳ **Deferred** (intentionally; pairs with a stock-left view) |
| **Phase 4 — helper attribution, DuitNow confirm, multi-day events** | ⛔ **Not started** (heavy backend/integration) |

**Verification:** all phases are **typecheck-clean** and passed a high-effort multi-agent code
review (5 bugs found + fixed). **Not yet run on a device** — no local emulator, and stall sits
behind the Supabase phone+Telegram-OTP gate. See STALL_MODE.md §14 for the open Phase-3 limitations
surfaced by that review (pre-order↔regular link, loyalty redemption, pre-order stock reservation).

---

## The governing law: "optional depth, zero friction"

A stall vendor is **cooking, taking money, and watching a queue at the same time.** So:

1. **Nothing detailed is ever mandatory.** Costs, cash count, customer, category, reason —
   all optional. The vendor can run the whole night on tap-to-sell and touch none of it.
2. **Detail never blocks the hot path.** You can always make a sale and always close a session
   without filling anything in. Detail is *offered* at calm moments (setup, close, summary),
   never demanded mid-rush.
3. **Skipping has no penalty.** Skip the cash count → the summary simply omits the difference.
   No guilt, no red, no nag. Calm, always.
4. **The app degrades to a fast tally and up to a trusted cashbox** depending on how much
   slack the vendor has that day — *same app, no mode switch.*

> **The identity, settled:** not "revenue-only vs net money," but **a fast tally that can
> *become* a cashbox when there's a spare second.** Trust features ride on top as optional layers.

---

## The interaction model (how fast/smooth/detailed coexist)

**Three speeds of sale, one screen — the vendor picks per customer:**

| Speed | Gesture | For |
|-------|---------|-----|
| **Quick-sell** | tap a product tile = **1 sale** at session default payment | the rush ("1 burger, cash, RM5") |
| **Cart** | tap **+** / the cart = build multi-item | the "3 different things" customer |
| **Custom** | number pad = type an amount | off-menu, bundles, bargained price |

**Smooth = respect the phone's physical reality** (greasy / wet / one hand / tarp light / sun / draining battery):
- Actions live in the **bottom thumb zone**; tiles are big & high-contrast.
- **One persistent payment toggle** — cash-heavy stall sets cash default; QR is one extra tap.
- **Hot items float** by recency × volume so rush items stay under the thumb.
- **Every fast action is undoable** from its toast — speed never costs a mistake.
- **Running total survives a force-kill / battery swap.**

**Detail lives at the edges, never the rush:** setup (repeat + stock), close (count + costs), summary (net + reconciliation + WhatsApp handover).

---

## What "number one" requires (the strategic bar)

The app wins by **eating the vendor's whole toolkit** — the cash tin, the calculator, the
notebook of *hutang*/pre-orders, the WhatsApp orders, the end-of-night mental math — and then
**proving its numbers at pack-up.** Not by being a faster tally.

The spine that makes that possible: **a tappable recent-sales ledger + optional dual
reconciliation (stock and cash can match reality — if you want them to).**

---

## The personas this is designed against

| Persona | Pace / ticket | What they need most |
|---------|---------------|---------------------|
| **Food rush** (apam balik, burger, fried chicken) | high volume, tiny tickets, queue | raw speed, quick-sell, undo |
| **Goods** (cases, toys, socks) | bargaining, fewer/bigger | custom/negotiated price, optional cost (clean COGS) |
| **Ramadan bazaar** | brutal 5–7pm, WhatsApp pre-orders, by pack | pre-orders → pickup, stock planning |
| **Produce/drinks** | by weight/cup, all day, simple menu | unit + decimal qty, loyalty |
| **Artisan/weekend** | low volume, high ticket, regulars, QR | regulars + net money, share |
| **Family + helper** | one pitch, 1–2 sellers | one fast phone, helper attribution, trust at handover |

---

## Phased roadmap

### Phase 1 — The forgiving spine + speed (BUILD FIRST)
*Makes the rush fast AND safe, removes every dead-end, demands zero detail. Pure "cut slack."*

1. **Quick-sell** — tap tile = 1 sale at session default payment; undo on toast.
2. **Session default payment** — one persistent toggle (cash ⇄ qr); QR is one extra tap.
3. **Tappable sales ledger (edit / void)** — fix payment method, change qty, or void a sale.
   Makes mistakes cheap, so speed is safe. Optional void reason.
4. **Custom-amount sale + "save as product"** — instant off-menu; catalog grows from real sales
   (→ also solves cold-start: a brand-new vendor needs no setup phase).
5. **Reachable product management mid-session + restock** — add/edit a product and bump
   `remainingQty` while selling. Kills the "sold out but I have more" dead-end.
6. **Repeat-last-setup + per-product default starting stock** — setup becomes confirm-not-build.

**Data model (Phase 1):**
- `StallProduct`: `+ defaultStartQty?: number` (optional per-product default for setup).
- `StallSession`: `+ defaultPayment?: 'cash' | 'qr'` (drives quick-sell).
- `StallSale`: `+ isCustom?: boolean`, `+ label?: string` (productId-less custom lines),
  `+ voidReason?: string` (optional).
- Store actions:
  - `quickSale(productId)` — 1 unit at `session.defaultPayment`.
  - `setSessionDefaultPayment(method)`.
  - `updateSale(saleId, { quantity?, paymentMethod? })` — recompute stock + totals (the ledger edit).
  - `addCustomSale({ amount, paymentMethod, label? })` — no product, no stock decrement.
  - `restockProduct(productId, addQty)` — `remainingQty += addQty` (clears "sold out").
  - `getLastSetup()` — previous closed session's snapshot → `{ productId, startQty }[]` for repeat.

**Screen changes (Phase 1):**
- **SellScreen:** quick-sell tap path; persistent payment-default pill; number-pad custom entry
  → cash/qr → optional "save as product"; a "today's sales" ledger sheet (tap to edit/void);
  restock affordance on a product; a "manage products" entry in the header (not just empty state).
- **SessionSetup:** a **"repeat last session"** one-tap button; per-product **default qty** prefilled.
- **StallProducts:** optional `defaultStartQty` field; reachable any time.

### Phase 2 — Optional trust (the cashbox layer, all skippable)
*Turns the tally into something a vendor checks at pack-up — only if they have a second.*

- **Starting cash float + cash count at close** → summary shows **expected vs counted** + difference.
  Skip it → summary just omits the difference. No nag.
- **Spoilage / freebie / staff-meal logging** — non-sale stock-out so reconciliation is honest.
- **Optional unit cost on product + session overheads** (rental, gas, helper) →
  `kept = revenue − Σ(units × unit cost) − overheads`. *Both optional.* This deliberately
  **avoids the food-COGS trap**: goods sellers fill per-unit cost (clean); food sellers can
  log a lump ingredient cost as an overhead instead.

### Phase 3 — Retention & segment ownership
- **Pre-orders → pickup → sale** (name, packs, paid/unpaid, collect-time); the 5pm list
  **pre-fills tomorrow's starting stock** (stock-planner loop). Owns the bazaar segment.
- **Bundles/combos** — a named price covering a fixed set; decrement each component for stock.
- **Regulars attached to sales + loyalty stamp** (fixes the known gap; "10th teh free").
- **Hutang at the stall → reuse the existing debt mode** (walk-up credit, cross-mode).
- **Unit + decimal quantity** (pcs / kg / pack) for produce & food-by-weight.
- **Optional product modifiers** (ais/panas, kurang manis) — second tap *only* on products that have them.
- **Clearance mode** (blanket end-of-night price), **pause session** (rain), **5-sen cash rounding**.

### Phase 4 — Strategic & heavy (needs backend/integration)
- **Helper attribution on one phone** (cheap) — *before* true multi-device sync (expensive trap at a stall with one bar of signal).
- **DuitNow QR confirmation** — proof of payment (anti-fraud; today "QR" is an unverified tap).
- **Multi-day event grouping** — a 10-day Raya bazaar as one rolled-up total.

### Consciously NOT now
SST receipts · deep analytics · ingredient-level inventory · S/M/L variant matrices —
narrow segments, and they add weight to a flow whose whole advantage is speed.

---

## Hard rules (never violate)
- **Never block a sale or a close** to collect detail.
- **Never nag** for a skipped count/cost/customer. Silence is a valid answer.
- **No red, no alarm** — per the app's calm palette, even for a cash shortfall.
- **Every fast action is undoable.** Speed must never risk a wrong number with a queue watching.
- **Optional means optional** — a vendor who never opens setup, never counts cash, and never
  enters a cost still gets a correct, shareable "came in" total.

---

## Build order decision
**Start with Phase 1**, and within it ship in this order (each is independently useful):
**quick-sell + default payment → ledger edit/void → custom-amount + save-as-product →
mid-session product management + restock → repeat-last-setup.**

Rationale: quick-sell is the single biggest felt win for the busy vendor and is self-contained;
the ledger makes that speed *safe*; the rest close the dead-ends that currently force a vendor
back to a notebook — all without adding one mandatory field.
