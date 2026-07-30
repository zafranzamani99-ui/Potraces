# Stall Mode — Simple Status & Plan

> Written 2026-07-23 after reading all the stall code (the data store, all 9 screens,
> payments, money-to-personal, subscription locks, and the setup/delete parts).
> This is only about **Stall mode**. Plain words. Companion to `STALL_MODE.md` and
> `STALL_MODE_ROADMAP.md`.

> **✅ UPDATE 2026-07-30 — money bugs resolved (verified, tsc + money tests green).**
> The 6 money bugs below are now fixed: **(a)** transfer-to-personal already credited the
> wallet, **(e)** transfer already pre-fills "kept" (both verified still-correct); newly
> fixed this pass — **(b)** deleting a card sale now lowers `totalCard`; **(c)** expected
> cash now subtracts cash expenses (no more false "short"); **(d)** custom/add-on sales
> with no cost now flag "kept" as **≈ approximate** (owner chose the label over new cost
> inputs); **(f)** selling is now **blocked while paused** with a "resume to sell" prompt.
> Also fixed the **seller** (Season/Cost) "transfer to personal" which had the same
> no-wallet-credit ghost. Still owed: run stall on a **physical device**, and a
> **free-vs-paywall gate** decision (deferred by owner). Tracker: `WAVE_TRACKER.md` #6.

**A few words explained (used a lot below):**
- **Session** = one selling day/event. You open it, sell, then close it.
- **Cost price (COGS)** = how much one item costs *you* to make or buy.
- **Kept** = money you actually keep = money that came in − cost price − expenses.
- **Float** = the small cash you put in the box at the start to give change.
- **Transfer to personal** = moving your stall earnings into your personal money.

---

## 0. Quick status (one look)

| Thing | Works? | Simple note |
|---|---|---|
| Products (name, price, on/off) | ✅ Yes | delete is instant, no "are you sure?" |
| Cost price of each item | ✅ Yes | you type it once, it's saved on each sale |
| Default stock amount | ✅ Yes | fills in your stock when you open a session |
| Add-ons (e.g. +egg +RM1) | ✅ Yes | sold at the higher price, but the add-on's own cost is not counted |
| Open / close a session | ✅ Yes | can repeat yesterday's setup |
| Selling by cash | ✅ Yes | fast tap, cart, custom price, discount |
| Selling by QR (DuitNow) | ⚠️ Works but no proof | shows *your own* QR; you tap "Received" yourself |
| Selling by card (tap phone) | ⚠️ Off by now | real code, but turned off unless a special iPhone setup |
| Fix / delete a sale | ⚠️ Small bug | deleting a card sale leaves the card total wrong |
| Close: count cash + expenses | ✅ Yes | but cash you spent from the box isn't subtracted right |
| Session report + history | ✅ Yes | you can only read old sessions, not edit them |
| Pre-orders | ✅ Mostly | works, but never links to a regular customer |
| Regular customers + loyalty | ⚠️ Reminder only | it counts visits, but you can't "claim" a reward in the app |
| Move earnings to personal | 🔴 Broken | it saves a note but **no real money moves** |
| Fiuu / online QR payment | ⛔ Not built | only a stub; only wired in *seller* mode, not stall |
| Backup / sync to cloud | ⛔ None | saved only on the phone |
| Subscription locks in stall | ⛔ None | everything is free, no limits |
| Delete data for one setup | ⛔ None | only a "delete EVERYTHING" button exists |

---

## 1. What works now (done)

**Products and cost.** You can add, edit, and delete products (name, price, on/off).
For each product you can also add its **cost price**, a **default stock amount**, and
**add-ons** (like "extra cheese +RM1"). The cost price is saved onto each sale at the
moment of sale, so if you change the price later, your old reports stay correct.

**Sessions.** You open a selling session with an optional name and a starting cash float.
You pick which products you're bringing and how many of each — or tap **"Repeat last
session"** to reuse yesterday, or **"Cover pre-orders"** to auto-add the stock people
already ordered. You can **pause** (like a rain break) and the paused time is not counted
in your selling time. You close with a mood tag (good / slow / rainy…) and a note.

**Selling.** Tap a product = 1 quick sale. Or use the cart (add many, change quantity,
give a % or RM discount). Or type a **custom price** for something not on the menu (and
save it as a product if you want). Products with add-ons show a small chooser. You can set
an **end-of-day clearance %** to drop all prices. You can **restock** an item that sold out.
And there's a **list of today's sales** where you can change or delete a sale. Stock goes
down live and blocks items that are sold out.

**Cash and QR.** Cash works fully. For QR, the app shows **your own DuitNow QR** with the
exact amount already filled in; the buyer scans and pays into your bank, then you tap
"Received".

**Closing and counting.** You enter the float and the counted cash; the app shows if you're
**over or short**. You can add **expenses** (rent, gas, helper pay). If you set cost prices,
it shows your **kept** = came in − cost price − expenses.

**Reports and history.** After closing you see a summary: which products sold, cash/QR/card
split, time open, a short AI comment, and (after a few sessions) a "vs your average" line.
You can share it as text. History shows all your past sessions and lifetime totals.

**Pre-orders.** Take an order (name, phone, pickup time, items, price, paid or not). When
you **collect** it during a session, every line turns into a real sale. Pending orders also
tell you how much stock to bring.

**Regulars and loyalty.** Add regular customers; their visits get counted automatically when
you serve them. You set one loyalty rule (e.g. "every 10 visits = 1 free"), and each
customer shows their progress and a "reward ready" mark.

**Saving.** All of this is saved on the phone (so it survives closing the app).

---

## 2. What is half-done or has bugs (ordered by money impact)

1. **🔴 Moving money to personal doesn't really move money (most important).**
   When you tap "Transfer to personal", the app writes a note but **the money does not go
   into any personal wallet, and it is not counted as personal income.** So your stall
   earnings basically disappear on the personal side. The reason: the transfer is saved
   without saying *which* wallet to put it in, so the app skips adding it to a wallet, and a
   special "transfer" tag also makes the app ignore it in income totals. **Fix is tiny:**
   tell it which wallet to use.
2. **It suggests transferring the wrong amount.** It fills in the **full money that came
   in**, not your **kept**. The full amount still includes the cost of goods you must buy
   again and the float you put in yourself — so it moves too much.
3. **Deleting a card sale breaks the card total.** When you delete a card sale, the app
   lowers the total money and the cash/QR totals, but **forgets to lower the card total.**
   So the numbers stop matching.
4. **Cash you spend from the box isn't counted right.** If you pay rent or gas from the cash
   box, it lowers your kept but not the "expected cash", so the app wrongly says your box is
   **short**.
5. **Cost price is missed on some sales.** Custom-price sales are treated as costing you 0,
   and add-ons raise the price but their cost isn't counted — so "kept" looks better than it
   really is.
6. **QR and card have no real proof.** QR is on your honor (you tap "Received" yourself), and
   card is switched off by default. So out of the box, every non-cash sale is on trust.
7. **Loyalty can't be claimed in the app.** "Reward ready" keeps showing every N visits, but
   there's no button to say "I gave the reward". So it's just a reminder, not a record, and
   the free reward's cost is never counted.
8. **Pre-orders don't build loyalty.** The pre-order form only takes a typed name, it never
   links to a real regular customer. So collecting a pre-order never adds a loyalty visit.
   This breaks the "pre-order → regular customer" loop.
9. **A paused session can still sell.** The sell screen doesn't check "paused", so you can
   keep selling even while the app says paused.
10. **The "delete all business data" button forgets some stall parts** (loyalty, pre-orders,
    and the 5-sen setting) until you restart the app.

---

## 3. What is only planned (talked about, not built)

- **Fiuu / online QR that confirms payment automatically** — only a stub (it errors if you
  try). The part that *receives* the confirmation exists, but nothing sends it, and it's
  only wired into **seller** mode, not stall.
- **A "ding!" phone alert when a QR payment arrives** — not built for stall.
- **A receipt for the customer** (print / share / SMS) — none exists.
- **Spoilage/free-giveaway logging, helper tracking, multi-day event grouping** — later.
- On purpose left out: tax receipts, deep charts, ingredient-level stock, S/M/L sizes.

---

## 4. What still needs to be done (in order)

1. **Make the transfer real** — send it to a real wallet and default to **kept**. Until this
   is done, stall earnings never reach your personal money. *(see §8)*
2. **Fix the card-delete bug** and the **cash-expense counting**.
3. **Count cost on custom and add-on sales** so "kept" is honest.
4. **Add a "claim reward" step** for loyalty.
5. **Link pre-orders to regular customers.**
6. **Safety checks**: "are you sure?" before closing a session or deleting a product; stop
   selling while paused; let you fix a closed session.
7. **Delete data for one business setup, with safety** — new feature *(see §9)*.
8. Later: Fiuu online QR, receipts, cloud backup.

---

## 5. How you can use it right now (step by step)

The **cash + QR flow is fully working today.** Real steps:

1. **Set up your products** — Products tab → add each item (name, price; and if you want:
   cost price, default stock, add-ons). Turn on "round cash to 5 sen" if you like.
2. **(Optional) take pre-orders** before the day — Pre-orders tab.
3. **Open a session** — dashboard → Start selling. Give it a name, set your **float**, tick
   products and how many you brought (or "Repeat last", or "Cover pre-orders").
4. **Sell** — Sell tab. Tap = 1 sale (cash or QR). Or use the cart with a discount. Or type
   a custom price. For QR, the app shows **your** QR with the amount; the buyer pays into
   your bank; you tap "Received". Card only works on the special iPhone setup. Fix mistakes
   in the sales list. Restock or set a clearance % late in the day.
5. **Collect pre-orders** during the session → they become sales.
6. **Close** — count the cash box (over/short), add expenses, see your **kept**, pick a mood
   + note.
7. **Review** — see the summary, share it, browse history.
8. **Transfer to personal** — ⚠️ *right now this only saves a note; the money does not really
   move into a wallet or count as income (see §8). Treat it as a reminder until it's fixed.*

**You cannot yet:** get automatic QR confirmation (Fiuu), print/send a receipt, edit a
closed session, claim a loyalty reward in the app, or delete just the stall data.

---

## 6. How the full cycle SHOULD work (manual now, Fiuu later)

The full loop, one arrow at a time:

```
PRODUCTS → COST → PRE-ORDERS → OPEN SESSION → SELL → COLLECT → CLOSE & COUNT → SUMMARY → MOVE TO PERSONAL WALLET
```

- **Products** — same as now. Add: "are you sure?" before delete; if a product has old
  sales, hide it instead of hard-deleting so history stays.
- **Cost** — same, plus: let custom sales and add-ons carry a cost, and subtract cash
  expenses from the "expected cash" so counting is right.
- **Pre-orders** — add a **pick-a-regular** step so collecting builds loyalty; a real pickup
  time; optionally hold the stock so walk-ins don't take it.
- **Session** — ask before force-closing an open session; block selling while paused.
- **Selling / payment** — cash + QR exactly like now. QR stays your own QR with a manual
  "Received" tap **until Fiuu** (see §7). Card stays the iPhone setup.
- **Close / count** — same; subtract cash expenses from expected cash.
- **Summary** — same.
- **Move to personal** — the finish line. It must put the money into a **real wallet** and
  suggest your **kept** (not the full amount). *(see §8)*

---

## 7. Payments — cash/QR now, Fiuu later

**Now (working):** cash, and your own DuitNow QR with the amount filled in (you confirm by
hand). Card by tapping a phone exists in code but is switched off unless a special setup.

**Fiuu later (automatic QR):** needs two things that aren't there yet for stall —
1. Build the real "create a charge" server function (holds the Fiuu key). The *receiving*
   part already exists.
2. Copy the same online-QR wiring that **seller** mode already has into the stall Sell
   screen (create charge → wait → auto "paid" → alert).

Good news: because manual QR already works, **Fiuu is just an add-on layer** — not a rewrite.

---

## 8. The biggest problem — money to personal doesn't really move

**What happens now:** "Transfer to personal" saves a note on three places, **but the money
does not enter any wallet and is not counted as income.** Two reasons: (1) it doesn't say
which wallet, so the app skips adding it to a wallet; (2) a "transfer" tag makes the app
leave it out of income totals. So the money is a ghost — no balance goes up, no total
changes.

**The fix (small, big value):**
1. Say **which wallet** to put it in (a chosen one, or your default) so the balance really
   goes up.
2. Suggest the **kept** amount, not the full amount.
3. Add a **wallet picker** and save a "moved RM X to <wallet>" line so it's clear and can't
   be done twice by mistake.

---

## 9. New feature — delete data for one business setup, with safety

### What "one business setup" means here
There is only **one** business in the app. The **income type** (seller / stall / …) *is* the
setup, and each one keeps its own data box on the phone (stall has `stall-storage`). So
"delete data for one setup" = **wipe just the stall data, keep the other types, and stay
signed in.** Today the only button wipes **everything** (all types + login) — too much.

### How to build it (reuse the pattern that already exists)
Add one action in the stall store, `resetStallData(scope)`, that clears the stall data. Then
reuse it inside the existing "delete everything" button too (that also fixes bug #10).

```
resetStallData(scope):
  "all"       → clear sessions, products, customers, loyalty, pre-orders, settings
  "history"   → clear only sessions (keep products + customers)
  "products"  → clear only products
  "customers" → clear only customers + loyalty
  "preorders" → clear only pre-orders
```

Show a live count next to each choice, e.g. "32 sessions · 14 products · 8 regulars".

### "Proper gating" = a safe delete (the safety is the gate, not a paywall)
1. **Safety confirmation (must have).** The current single "are you sure?" popup is too weak
   for wiping data. Use a proper sheet that:
   - **Blocks if a session is open** ("close your session first").
   - Shows exactly what will be deleted and the counts, and warns it is **only on this
     phone and cannot be undone** (offer "share/export a backup first").
   - Makes you **type the name** (or the word `DELETE`) before the button turns on — not
     just a second tap.
   - On confirm → clears the chosen scope → shows a success message. **Stays in stall mode**
     (does not log you out — that's the whole point vs the old button).
2. **Subscription lock (optional).** The app already has the tool for "must be Pro or higher"
   (`tierAtLeast`). But locking *data deletion* behind a paid plan is bad — it's a safety
   action people own. **Recommend: do NOT paywall it.** If the business really wants it paid,
   add a small capability flag (not the paywall popup).

### Where it goes
In Business Settings → danger area, a new row **"Delete stall data"**, placed **above** the
old "delete everything" row so the safer, smaller option is found first. Keep the old button
as-is.

### Backup / sync note
Stall data is only on the phone (no cloud), so this delete is local and that's fine for now.
When stall gets cloud sync later, this feature must also leave "deleted" markers so the data
doesn't come back on the next sync.

### Build steps for this feature
1. `resetStallData(scope)` in the stall store (also reuse it in the old button → fixes #10).
2. The safety sheet (counts + type-to-confirm + block-if-session-open + backup nudge), with
   English + Malay text.
3. The new row in Business Settings. 4. (Later) the optional paid flag. 5. (Later) sync markers.

---

## 10. What to build first

1. **Transfer wallet fix (§8)** — one small change, unlocks the whole money loop. *Do first.*
2. **Card-delete bug + cash-expense counting (§2).**
3. **Delete data for one setup + safety (§9)** — the feature you asked for; small and clean.
4. **Cost on custom/add-on sales; transfer suggests kept (§2).**
5. **Loyalty claim + pre-order links to regular (§2).**
6. **Safety checks: close-confirm, no selling while paused, delete-product confirm (§4).**
7. **Later:** Fiuu online QR, receipts, cloud backup.
