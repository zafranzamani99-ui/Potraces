# Commitments → The #1 Reason People Keep Potraces

Product strategy. Feeds a real roadmap. Opinionated.

Context: Potraces already ships commitments (billing cycles, installments, shared subs,
overdue), mark-paid with user-chosen pay date that files each payment under the correct
billing cycle, Echo AI nudges, wallet-linked expenses, and Notes with AI (Manglish/Gemini)
parsing. The intent engine already recognizes subscriptions/bills/installments from text.
So we are NOT starting from zero — we are choosing what to nail.

---

## 1. WHAT MAKES BILL/SUBSCRIPTION TRACKERS STICKY & #1

Studied: Rocket Money/Truebill, Bobby, Subby, YNAB scheduled txns, Emma, Monarch,
Spendee, PocketGuard, Quicken Simplifi, local MY context.

### The mechanics that drive "can't-live-without" dependence
1. **The perception gap is the whole game.** Average user has ~8 subscriptions costing
   ~RM/$219/mo but *believes* they spend ~$86 — a 2.5x gap. The app's core value is making
   that gap visible. Every charge becomes a conscious decision. This is the dopamine of
   these apps: "I had no idea I was paying for that."
2. **Forward-looking beats backward-looking.** The retention winners (Rocket Money Payday
   View, Simplifi Spending Plan, PocketGuard "In My Pocket") answer one question:
   *"what's safe to spend right now?"* Backward expense reports are a commodity; forward
   "safe-to-spend after bills" is the hook people open daily.
3. **A weekly/payday ritual.** Rocket Money's "Payday View" creates a recurring moment.
   Apps with a *ritual* (a screen worth opening on a cadence) retain far better than apps
   you only open to log.
4. **Automation of the boring part.** Auto-detection of recurring charges and one-tap
   cancel/negotiate (Rocket Money cancelled 1M+ subs) is the headline retention driver —
   the app does work *for* you, not the reverse.
5. **Trust = accuracy.** ~92% categorization accuracy is the uninstall threshold. Wrong
   numbers kill trust instantly; a single mis-forecast and people stop believing the app.
6. **Privacy-first, no-bank-connection works.** Bobby (4.7★, ~8k reviews) and Subby
   (320k+ users) prove a *manual* tracker can be beloved — IF capture is elegant and
   reminders are calm. This is directly relevant: Malaysia has no Open Finance until
   ~2027, so auto-bank-detection is OFF the table for Potraces today. Manual+AI is the lane.

### What earns trust
- Numbers that match reality (right amount, right cycle, right "next due").
- Reminders that feel like a heads-up, not a collections notice.
- No surprise charges from the app itself; no dark patterns.
- Showing the math ("you have RM X after bills" with the bills listed) — not a black box.

### Why people ABANDON them (anti-patterns Potraces MUST avoid)
- **Manual upkeep tax.** If keeping it accurate is a chore, it rots, numbers go wrong,
  trust dies, uninstall. (#1 killer of manual trackers.)
- **Nagging / alarm tone.** Red badges, "OVERDUE!", aggressive push spam → notification
  off → app dead. *Especially* violates Potraces' no-red, no-shame ethos.
- **Wrong forecasts.** One "you're fine" that wasn't → permanent distrust. Forecasts must
  be conservative and show their working.
- **Bank-connection friction & breakage** (re-auth loops). Not our problem now (no Open
  Finance), but the lesson: any sync that silently goes stale = wrong numbers = churn.
- **Feature bloat / investment-tracker creep.** Monarch/Emma do everything and overwhelm.
  Potraces should stay calm and focused.
- **Cancel-service that's US-only.** Rocket Money's cancel/negotiate doesn't work for MY
  merchants (TNG, Astro, unifi, Atome, Shopee). Do NOT promise concierge-cancel we can't
  deliver locally.

---

## 2. THE LEAPFROG: AI-NOTES-NATIVE

Every competitor fails at two things: **CAPTURE** (manual entry is tedious) and
**FORECASTING** (will I have enough?). Potraces already owns a Notes+AI pipeline. That is
the unfair advantage. The thesis: **the cheapest commitment to create is the one you never
formally "create."** You jot a note; the app does the rest.

### Capability A — Note → Commitment extraction (THE WEDGE)
User types/voices a note in Manglish:
- `"rumah sewa 850 every month start may"` → Commitment "Rumah Sewa", RM850, monthly,
  anchor May, next due computed.
- `"atome shoes 3x 49.90"` → Installment, 3 instalments of RM49.90, RM149.70 total,
  schedule generated.
- `"netflix 55 monthly"` → subscription, RM55, monthly.
Flow: intent engine (already exists) detects a *recurring* shape → shows a **confirm card**
("Track Rumah Sewa, RM850 every month from May? [yes] [edit]"). One tap = tracked.
*Retention tie:* removes the upkeep tax — the #1 abandonment cause. Capture cost ≈ zero.

### Capability B — Screenshot / bill parsing
Paste a TNG/unifi/Astro/Atome/Shopee-PayLater screenshot or e-bill → parse merchant,
amount, due date, installment count → confirm card. MY users live in these apps; the bill
already exists as an image. We turn an artifact they already have into a tracked commitment.
*Retention tie:* matches real behavior (screenshots), zero typing, builds the list fast so
the perception gap reveal lands sooner.

### Capability C — "What's due + can I afford it" forecast (THE MOAT)
A single forward screen, calm:
- **This payday → next payday:** income in, commitments due, "safe to spend RM X".
- **Month curve:** wallet balance projected down as each commitment fires; flag the day it
  would dip below a comfort floor — *as a calm heads-up, weeks ahead, never alarm.*
- Conservative math, always show the bill list behind the number (trust).
*Retention tie:* this is the daily-open hook. It answers the one anxious question. It is
the thing no MY app does well and the thing Rocket Money built retention on.

### Capability D — Calm reminders
Heads-up before due, in Potraces tone: "Heads up — Rumah Sewa (RM850) due Fri. You've got
it covered." Pair every reminder with reassurance when the forecast says they're fine.
Bundle into the weekly ritual, not per-bill spam.
*Retention tie:* notifications are the re-engagement engine, but only if calm — alarm tone
is the fastest path to a muted app.

### Capability E — End-of-month recap (the ritual + the reveal)
Monthly: "RM2,340 went to commitments. Biggest: Rumah Sewa. Two you haven't used: [X],[Y]
— still want them?" This is the perception-gap reveal, the conscious-decision moment, on a
cadence. Echo delivers it warmly.
*Retention tie:* the recurring "aha", the habit anchor, and the only ethical substitute for
Rocket Money's cancel-concierge (we surface the unused; user decides).

---

## 3. PATH TO #1 — THE SEQUENCE

Ladder: Foundation (must nail) → Differentiators → Delight. Build top-down; do not skip.

### MUST-HAVE FOUNDATION (the wedge + the trust loop) — build first
1. **Note → Commitment extraction (Capability A).** This is THE wedge. It exploits the one
   asset no competitor has and kills the #1 abandonment cause. Make the confirm-card flawless:
   right amount, right cycle, right next-due, easy edit. Manglish + voice. *Nothing else
   ships until this feels magic.*
2. **Accuracy / trust loop.** Every extracted commitment must reconcile with wallet-linked
   expenses and mark-paid filing (already built). Numbers must be right or the moat (forecast)
   is poison. This is invisible work but it is the foundation under everything.
3. **Calm reminders (Capability D)** wired to the existing Echo/notification system, no red,
   reassurance-paired. Cheap, high re-engagement, on-brand.

### DIFFERENTIATORS — build second, they compound on the wedge
4. **"Can I afford it" forecast (Capability C).** The daily-open hook and the real moat.
   Requires (1)+(2) to be trustworthy first — a forecast on bad data is worse than none.
   Ship the payday/safe-to-spend number before the full month curve.
5. **Screenshot/bill parsing (Capability B).** Accelerates list-building (so the forecast and
   the gap-reveal have data fast) and deepens the no-typing promise. Build after A because it
   reuses the same confirm-card + extraction plumbing.

### DELIGHT — build third, makes it habit-forming & defensible
6. **End-of-month recap (Capability E).** The ritual + perception-gap reveal + ethical
   cancel-nudge. Turns the app into a monthly habit, not a utility. Echo-narrated.
7. **Weekly "this week's commitments" glance** — small, calm, the payday-view cadence.

### Why this is DEFENSIBLE / habit-forming
- **Wedge → moat compounding:** frictionless capture (A) fills the data; the forecast (C)
  needs that data; the recap (E) needs both. A competitor can copy any one screen but not the
  Notes-native capture pipeline that feeds them — and that pipeline is the hard part.
- **Trust loop:** right numbers → believed forecast → daily open → more capture → richer
  recap → "this app gets my money" → can't leave.
- **Cadence:** calm reminders (daily-ish), safe-to-spend (daily), recap (monthly) = three
  habit anchors, none of them nagging.

### What NOT to build (flag explicitly)
- **No bank/Open-Finance auto-detection.** Not legally available in MY until ~2027. Chasing
  it now = broken sync = wrong numbers = the exact churn trap. The Notes-native capture IS
  our answer to "auto-detection" until then.
- **No cancel/negotiate concierge.** US-merchant feature; we can't actually cancel TNG/Astro/
  unifi/Atome. Promising it and failing destroys trust. Substitute: surface unused subs in the
  recap, user decides.
- **No investment/net-worth/portfolio tracking, no credit-score.** Bloat that pulled
  Monarch/Emma off-focus. Stay calm and singular.
- **No red, no "OVERDUE!", no shame badges, no daily push spam.** Violates the ethos and is
  the fastest uninstall path.
- **No mandatory manual setup wizard.** The whole point is you *don't* formally "add" a
  commitment — you jot a note. Don't bury the wedge behind a form.

### One-line roadmap
Nail **note→commitment** (wedge) → make it **trustworthy** (loop) → add **calm reminders**
→ ship **safe-to-spend forecast** (moat) → add **screenshot parse** → crown with
**monthly recap** (ritual). That sequence is the path to #1.
