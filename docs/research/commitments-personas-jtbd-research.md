# Commitments — Persona Research & Jobs-To-Be-Done

Product research for the Commitments feature (recurring/irregular obligations). Grounded in the
shipped implementation: `src/screens/personal/SubscriptionList.tsx`, `src/components/commitments/CommitmentForm.tsx`,
`src/services/subscriptionNotifications.ts`, type `Subscription` in `src/types/index.ts`.

## What the app already does (baseline — don't re-propose)
- Track bills / payments / subscriptions in 3 tabs; weekly/monthly/quarterly/yearly cycles.
- Installments ("ansuran"): total price, months, already-paid, est. completion, progress bar, completion celebration.
- Overdue **arrears**: one row per missed cycle (doesn't silently roll forward) — this is genuinely good.
- Mark-paid with past-date, double-pay / early-pay / not-started guards, optional wallet deduction + expense.
- Shared subscription linking (`sharedSubId`) to DebtTracking for split bills.
- "After commitments" = wallet balance − pending bills this month (a buffer number, but month-only).
- Local reminders: ONE notification per sub, N days before, 09:00. Date-based only.
- Echo AI insights: overdue nudges, "RM X/yr locked in", recurring-spend detection from transactions.

**The structural gap across every persona:** the feature is a *calendar of dates*. Real Malaysian users
live a *calendar of cash*. Nothing connects "when is this due" to "will money be there when it's due."

---

## Persona 1 — Aiman, 31, Grab/freelancer (lumpy income)

**Commitments tracked:** rumah sewa RM900 (1st), motor ansuran RM320, phone Digi RM55, Atome (3 BNPL
plans staggered), Netflix shared, road tax + insurance (annual, Feb), parents RM200 when he can.

**His month / pain:**
- Income arrives in unpredictable bursts (good Raya week vs dead Monday). Rent on the 1st is terrifying
  when the 28th–31st were slow. He mentally juggles "can I cover rent if I pull RM X from the bike fund?"
- 3 Atome plans on different dates → he loses track, gets the 1% late fee, feels stupid.
- Annual road tax/insurance ambushes him — RM1,400 in one month he didn't save toward.
- He'd rather pay rent *early* in a good week than risk a bad week — but the app only knows the due date.

**Unmet need → feature → next need it exposes:**
1. *"Will my cash survive the due dates?"* → **Cash-timing forecast**: plot upcoming commitments against
   projected wallet balance (rolling, not month-bucketed). Flag the day balance goes negative.
   → exposes: *"My income isn't a salary — how do you project it?"*
2. → **Irregular-income model**: estimate from recent inflow patterns (trailing 4-week median) +
   let him log "expected income RM X around date Y". Forecast = wallet + expected inflows − commitments.
   → exposes: *"I have good weeks — tell me which bills to prepay now while I have it."*
3. → **Prepay / pull-forward suggestions**: "You're RM600 up this week. Rent (RM900, due in 9 days) —
   pay RM900 now?" One-tap pay-ahead that the timeline understands (already supports past-date pay).
   → exposes: *"Annual bills wreck me — help me not get ambushed."*
4. → **Sink-fund / smoothing**: convert annual road tax + insurance into a suggested monthly set-aside
   ("RM117/mo so Feb doesn't hurt"); links to a Goal/wallet bucket. → exposes: lump-sum capture (BNPL plans
   as one parent commitment with sub-instalments rather than 3 disconnected rows).

---

## Persona 2 — Nurul, 24, first-jobber, salaried RM2,800

**Commitments tracked:** PTPTN RM150, room rent RM650, parent allowance RM300 (duit belanja mak),
Spotify + Netflix + iCloud + ChatGPT, gym, Shopee PayLater / Atome, Digi, Takaful RM80.

**Her month / pain:**
- Salary 25th. By the 10th it's thin. She doesn't *feel* the subscription creep until it's RM200/mo of
  "small" things. The app's "RM X/yr locked in" insight is the right instinct but passive.
- She wants to send mak the RM300 *first* (cultural priority) but also not bounce rent.
- Forgot a free trial converted; got charged. Wants trial-end alerts.
- Wants to know "if I cut Netflix + gym, how much over a year?" — a tangible reframe, not shaming.

**Unmet need → feature → next need:**
1. *"Subscriptions creep silently."* → **Subscription audit card**: rank by RM/yr, last-used hint,
   "cancel candidates" (Echo already drafts this — make it a first-class actionable list with a
   one-tap "pause" and a running "you've saved RM__/yr" tally). → exposes: *"How do I cancel? When does
   it renew?"*
2. → **Renewal & trial-end intelligence**: store renewal date + trial-end; alert "Netflix renews in 2
   days, last chance to cancel"; surface the cancellation note field (already exists). → exposes:
   *"Pay the important people first."*
3. → **Priority ordering / payment waterfall**: let her rank commitments (mak > rent > PTPTN > subs).
   On payday, "pay in this order" checklist; forecast shows what survives to the bottom of the list.
   → exposes: *"Show me payday → next-payday runway, not calendar month."*
4. → **Pay-cycle framing**: anchor the whole screen to *her* pay date (25th→25th), not the 1st.
   "RM__ free after commitments until next salary." → exposes: emotional reframe (savings, not guilt).

---

## Persona 3 — Mak Cik Som, 52, kuih seller (low digital literacy)

**Commitments tracked:** kedai/stall rent RM450, supplier (tepung/gula) ~weekly, TNB, Air Selangor,
Digi prepaid top-up, kutu RM100/mo, anak's tuition RM120, motor ansuran.

**Her month / pain:**
- Typing is slow; English labels are a wall. She thinks in "bayar sewa", "bayar Pak Samad", "kena kutu".
- She doesn't trust a number she can't reconcile. If the app says RM450 but she paid RM450 cash, she
  needs to *see* it ticked, in BM, with a receipt photo (form already supports image).
- Reminders that just say "bill due" don't help — she needs "esok bayar sewa RM450 kat Pak Hassan".
- Kutu (rotating savings) is both money out (her contribution) and money in (her payout month) — no app models this.

**Unmet need → feature → next need:**
1. *"Capture without typing, in my language."* → **Voice / Manglish quick-add** (manglishParser.ts exists)
   + BM-first commitment templates (sewa, bil air, bil letrik, kutu, ansuran, tuisyen) with icons
   pre-mapped (ICON_KEYWORDS already has sewa/air/letrik/kutu-adjacent). → exposes: *"Is it really paid?"*
2. → **Plain reconciliation & receipts**: big "sudah bayar" tick, attach photo of resit, BM confirmation
   "Sewa Mei sudah bayar ✓". Trust through visibility, no jargon. → exposes: *"Reminders I'll understand."*
3. → **Concrete BM reminders with payee + amount + place** ("esok 1 hb — sewa RM450, Pak Hassan").
   → exposes: *"Kutu is not a normal bill."*
4. → **Kutu / tontine model**: N members, my slot month = inflow, other months = outflow; show net
   position and "bulan ni giliran kau" payout reminder. (Net-new model; no equivalent today.) → exposes:
   supplier "running tab" tracking (irregular but recurring) — link to DebtTracking they-owe/I-owe.

---

## Persona 4 — Pn. Faridah, 41, household manager (many bills + kids)

**Commitments tracked:** home loan/sewa, 2× tuisyen, school fees (term, lumpy), Astro, Unifi, TNB,
Air, 2 car ansuran, takaful family, Netflix family, maid/cleaner, parents both sides, zakat (annual),
groceries-as-standing-order mindset.

**Her month / pain:**
- 15+ commitments; the *month-end stacking* is the killer (the app's "X of bills hit before month end"
  insight is exactly her pain — extend it). She needs a **whole-month bill-run view** and "which week is heaviest."
- School fees are termly/irregular — not a clean cycle; current cycles (weekly/monthly/quarterly/yearly)
  don't fit "every term" or "twice a year".
- She pays from multiple wallets/accounts (her card, husband's transfer) — needs per-wallet attribution
  and "does *this* account cover *its* bills?"
- Husband shares some commitments — she wants him to see the same list / get the same reminder.

**Unmet need → feature → next need:**
1. *"See the whole month's run and the crunch week."* → **Bill-run timeline + weekly load bars**
   (dayStrip exists for 14 days — extend to a month heatmap; flag the heaviest week vs buffer).
   → exposes: *"Some bills aren't monthly/quarterly."*
2. → **Custom / irregular cadence**: "every term", "twice a year", specific months, or "irregular —
   remind me to set the date." → exposes: *"Which account pays which bill?"*
3. → **Per-wallet commitment coverage**: group commitments by funding wallet; "Maybank covers RM2,300
   of bills, has RM1,900 → short RM400." (afterCommitments logic exists, make it per-wallet). → exposes:
   *"My husband and I should share this."*
4. → **Household sharing**: shared commitment list / assignee per bill ("he pays Astro, I pay tuisyen"),
   synced reminders, "who's covering what." (Big; builds on personalSync — gated by sync stability.)

---

## Persona 5 — Two flatmates, 26 (shared living)

**Commitments tracked:** rent split 50/50, Unifi split, shared Netflix, electricity (variable), water,
each their own kutu, group makan fund.

**Their month / pain:**
- Rent is one bill, two payers. Today one person tracks it; the other forgets their half until chased.
- Shared sub linking (`sharedSubId`) handles Netflix-style splits but not "rent" as a first-class shared bill.
- Variable bills (TNB) — the split changes monthly; awkward to track "you owe RM63 this month."
- Chasing is socially awkward — they want the *app* to remind, not a person.

**Unmet need → feature → next need:**
1. *"One bill, many payers, auto-chase."* → **Shared commitment with split + auto-reminders to each
   member** (extend sharedSub beyond subs to rent/utilities). → exposes: *"Variable amount each month."*
2. → **Variable-amount commitments**: enter actual each cycle (TNB), recompute splits, log who paid.
   → exposes: *"Settle without nagging."*
3. → **Settle-up integration with DebtTracking**: shared bill → auto-creates the "they owe me RM63"
   record + gentle reminder, marks settled on receipt. → exposes: trust/audit (already have editLog pattern).

---

## Top cross-cutting Jobs-To-Be-Done (prioritized roadmap)

Ranked by how much each turns "nice tracker" → "can't live without."

### P0 — Forecast cash against commitments (the moat)
- **JTBD:** *"Tell me if my money will survive my bills before the due dates hit — especially when my
  income is irregular."*
- Rolling daily balance projection = wallet(s) + expected inflows − scheduled commitments. Flag the day
  it goes negative; surface "safe to spend until <date>".
- Irregular-income model (trailing-median + user-logged "expected RM X ~date").
- Anchor to user's pay cadence, not calendar month. This is the single feature that no MY budgeting app
  nails for gig workers — it's the wedge.

### P1 — Never-miss + humane late handling
- **JTBD:** *"Make it impossible to forget, and if I'm late, help me recover without shame."*
- Reminders today are date-only and single-shot. Make them **cash-aware** ("rent due in 3 days, you're
  RM200 short — move money?"), **payee/amount/place-rich**, and **BM-first**.
- Add **snooze / "remind on payday"**, escalation for overdue, and a **catch-up plan** for arrears
  (arrears rows already exist — add "clear oldest first, here's the order").
- Trial-end & renewal alerts (store renewal/trial date).

### P2 — Low-friction, BM-first capture
- **JTBD:** *"Let me add and tick off bills in seconds, in my language, without typing."*
- Voice/Manglish quick-add (parser exists), BM commitment templates with pre-mapped icons, photo-resit
  reconciliation, big "sudah bayar" tick. Critical for Mak Cik Som tier (huge MY segment).

### P3 — Trust in the numbers
- **JTBD:** *"I believe the number because I can see every bill ticked, dated, and reconciled to my wallet."*
- Per-wallet commitment coverage, payment history visible per bill (exists), audit trail on edits
  (editLog pattern exists), receipt attachment. Reconciliation = retention.

### P4 — Shared & household commitments
- **JTBD:** *"We share rent/Netflix/utilities — let the app split, remind each person, and settle up so
  nobody has to nag."*
- Promote sharedSub to any commitment type; per-member reminders; variable-amount cycles; auto-settle via
  DebtTracking. Gated on personalSync stability (known critical bugs — see memory).

### P5 — Smart money modeling (the "smart friend")
- **JTBD:** *"Reframe my commitments so I feel in control, not ashamed."*
- Subscription audit with running "saved RM/yr" tally, sink-funds for annual bills (zakat, road tax,
  school fees → monthly set-aside linked to Goals), priority/waterfall ordering (mak first), kutu/tontine
  model (inflow+outflow), irregular cadences (every term, twice a year).

## New data-model needs implied
- `expectedIncome[]` (amount, ~date, recurrence) for the forecast.
- `renewalDate` / `trialEndDate` on Subscription.
- Cadence beyond fixed cycles: `custom` / `irregular` / `everyTerm` / per-month set.
- `variableAmount: boolean` + per-cycle actual amount.
- `priorityRank` for the waterfall.
- Kutu: members, my-slot month, contribution vs payout direction.
- Shared: `assignee`, per-member split + paid state (extend `sharedSubId`).

## Emotional-calm guardrails (per project language rules)
- Never "you're broke / overdue!" red-alarm framing. Use bronze/neutral; "let's clear these", "esok
  bayar sewa". No profit/loss/ROI words. Praise on clear-up (celebration exists). Late = recoverable,
  never punitive.
