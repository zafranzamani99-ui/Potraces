# Budget Hero: Clarity + One Calm Delight

**Goal:** Make the "RM 20 / safe to spend a day" number **instantly understood** by a non-financial person (e.g. a 52-year-old kuih seller), and **trustworthy** (they believe bills + savings are already handled), then add **one** tasteful, calm delight moment. Keep the gauge + daily-number layout.

**The problem we are solving:** A user saw `RM 20 / safe to spend a day` and could not tell if RM 20 was *per-day*, *total left*, or *already spent*. The label `heroDailyLabel: 'safe to spend a day'` (`src/i18n/en.ts:1443`) is ambiguous because "a day" is quiet and the number is huge — the eye reads the number as a balance.

**The actual math:** `(money left in budgets − upcoming bills − savings-goal slice − 10% buffer) ÷ days left`. The number is *conservative on purpose* — that is the trust story we must surface, not hide.

---

## 1. Make the number understood at a glance

### The core fix (from PocketGuard "In My Pocket" + Emma "Left to Spend")
The best apps never show a bare number. They **bind the unit to the number** and **state what's already been removed in the same breath**:
- PocketGuard surfaces ONE figure ("In My Pocket") that is explicitly *after bills, savings goals, and budgets* — the subtraction is the whole pitch, shown right under the number. ([source](https://pocketguard.com/budgeting/))
- Emma distinguishes "Left to Spend" from "Available Balance" precisely because users confuse a *plan number* with a *bank number* — the cure is an explicit one-liner stating it's "to stay within your budget," not your real balance. ([source](https://help.emma-app.com/en/article/why-is-my-left-of-different-from-my-available-balance-nklig0/))
- Daily Budget apps make the unit unmistakable by always reading "**/day**" tight to the number and re-deriving it live during onboarding so the user *watches the number drop* as bills are entered — they learn the formula by feeling it. ([source](https://www.monefy.com/guide/how-to-budget-with-daily-limits))

### Three rules for our hero
1. **The word "today" must touch the number.** "Today" disambiguates per-day vs total better than "a day" — it implies *resets tomorrow*. Put it adjacent (small caps under, or inline), never floating at the bottom.
2. **Show the subtraction inline, one line, always visible.** A single quiet line "after bills & savings" converts the number from "mystery balance" → "money that's genuinely free." This is the trust line (section 2).
3. **Add a verb of permission.** "You can spend" / "safe to spend" / "free to use" tells the user this is an *allowance*, not a *score* or a *debt*.

### Microcopy options — primary number label (EN + BM)

The current key is `heroDailyLabel`. Replace/extend. Recommended ranked:

| # | EN (warm Manglish-friendly) | BM | Notes |
|---|---|---|---|
| **1 (recommended)** | **`free to spend today`** | **`boleh belanja hari ini`** | "today" = resets daily; "free" = it's yours, already cleared. Warmest + least jargon. |
| 2 | `safe to spend today` | `selamat dibelanja hari ini` | Keeps existing "safe" equity, adds "today". Lowest-risk change. |
| 3 | `yours to spend today` | `milik anda untuk hari ini` | Ownership framing; very kakak. |
| 4 | `you can spend today` | `anda boleh belanja hari ini` | Plain verb, removes all ambiguity. |
| 5 | `today's spending money` | `duit belanja hari ini` | Noun-phrase, very literal for low-literacy. |
| 6 | `left for today` | `baki untuk hari ini` | Shortest; pairs with the "resets tomorrow" subline. |

> **Recommended primary:** **`free to spend today`** / **`boleh belanja hari ini`**. "boleh belanja" is exactly how a Malaysian aunty phrases it out loud.

### Supporting context shown INLINE (always visible, no tap needed)
Stack directly under the big number, in this order (top = most important):

1. **Big number** — `RM 20` (gauge wraps it)
2. **Unit label** — `free to spend today` / `boleh belanja hari ini`  *(this is the relabel above)*
3. **Trust subline** — `after RM340 bills + RM150 savings` / `selepas RM340 bil + RM150 simpanan`  *(section 2)*
4. **Reset reassurance** — `resets tomorrow` / `set semula esok`  *(kills "is this my total?!" — a 4th tiny line, gold, optional but high value)*
5. **Existing status line** — keep `heroSubOnTrack` etc. ("on track till payday" / "okay sampai gaji")

### Progressive disclosure: tap-to-see-the-math (from NN/g progressive disclosure)
The whole point of progressive disclosure: show the *one* number, hide the *derivation* behind one tap, so trust is available on demand without clutter (30–50% faster comprehension vs full exposure). ([source](https://www.nngroup.com/articles/progressive-disclosure/))

**Trigger:** tap the hero number / gauge → opens a calm bottom sheet "how we got RM20".
**Content (a receipt-style waterfall, no jargon):**

```
money in your budgets       RM 900
− bills coming up           − RM 340   (4 bills before payday)
− set aside for goals       − RM 150   (Raya fund, phone fund)
− safety buffer (10%)       − RM  41   so you're never caught short
─────────────────────────────────────
left to share over 9 days   = RM 369
÷ 9 days till payday        = RM 20 / day
```

BM version of the labels:
```
duit dalam bajet anda       RM 900
− bil akan datang           − RM 340   (4 bil sebelum gaji)
− simpanan matlamat         − RM 150   (tabung Raya, tabung fon)
− duit penampan (10%)       − RM  41   supaya anda tak terkapai-kapai
─────────────────────────────────────
baki untuk 9 hari           = RM 369
÷ 9 hari sampai gaji        = RM 20 / hari
```

> Each line is plain-language (Emma/UXDA rule: replace legalese with clarity). "safety buffer" not "reserve"; "bills coming up" not "liabilities"; "till payday" not "remaining period". The buffer line reassures rather than confuses: *"so you're never caught short" / "supaya anda tak terkapai-kapai"*.

### New i18n keys to add (under `budget:` block, `src/i18n/en.ts` + `ms.ts`)
```ts
heroDailyLabel: 'free to spend today',            // ms: 'boleh belanja hari ini'
heroTrustLine: 'after {{currency}}{{bills}} bills + {{currency}}{{goals}} savings',
                                                  // ms: 'selepas {{currency}}{{bills}} bil + {{currency}}{{goals}} simpanan'
heroResetsTomorrow: 'resets tomorrow',            // ms: 'set semula esok'
mathSheetTitle: 'how we got {{currency}}{{n}}',   // ms: 'macam mana kami dapat {{currency}}{{n}}'
mathMoneyInBudgets: 'money in your budgets',      // ms: 'duit dalam bajet anda'
mathBillsComing: 'bills coming up',               // ms: 'bil akan datang'
mathSetAsideGoals: 'set aside for goals',         // ms: 'simpanan matlamat'
mathSafetyBuffer: 'safety buffer (10%)',          // ms: 'duit penampan (10%)'
mathBufferWhy: 'so you're never caught short',     // ms: 'supaya anda tak terkapai-kapai'
mathLeftOverDays: 'left to share over {{days}} days', // ms: 'baki untuk {{days}} hari'
mathDivideDays: '÷ {{days}} days till payday',    // ms: '÷ {{days}} hari sampai gaji'
```

---

## 2. Trust: "we already set money aside, so this number is safe"

The whole anxiety is *"if I spend this RM20, will I be short for bills?"* Answer it before they ask.

**Pattern (PocketGuard's core promise, made into one line):** state the two biggest subtractions inline, with real numbers:

> `after RM340 bills + RM150 savings` / `selepas RM340 bil + RM150 simpanan`

- Real RM figures > vague words. Seeing "RM340 bills" already removed makes the RM20 feel *earned and safe*.
- This line is **always visible** (not behind a tap) — it's the difference between "trust me" and "here's why."
- The **full receipt** (the math sheet above) is the tappable "how we got this" for the user who wants proof. Two tiers: glanceable trust line (always) + provable receipt (one tap). This is exactly the progressive-disclosure trust model fintech UX recommends. ([source](https://fuselabcreative.com/fintech-ux-design-guide-2026-user-experience/))

**Affordance for the tap:** add a tiny `ⓘ how we got this` / `ⓘ macam mana dikira` text button under the trust line, bronze, 13px. Don't rely on users guessing the number is tappable.

```ts
heroHowCalculated: 'how we got this',  // ms: 'macam mana dikira'
```

---

## 3. ONE calm delight moment (build this), + alternates

**Monzo's magic-moments doctrine (the guardrail):** magic is "spice, not the meal" — if everything is a highlight, nothing is; most of a banking app should just get the job done. Use delight *sparingly*, tied to a *real* emotional beat. ([source](https://monzo.com/blog/2022/11/04/how-we-design-magic-moments-at-monzo))
**Ethical-dopamine guardrail (UXDA):** delight must promote a healthy beat and give room to breathe — NOT slot-machine confetti/sound engineered to maximise time-in-app. ([source](https://www.theuxda.com/blog/rise-dopamine-banking-how-fintechs-and-neobanks-are-redefining-customer-experience))
**Our palette guardrail:** olive/bronze/gold, no red, no bright green, no confetti. Calm = *one* soft beat, then stillness.

### ★ BUILD THIS — "the gentle wake-up": count-up + warm one-liner on first open of the day

**Why this one:** It does double duty — the count-up makes the number feel *fresh and earned* (reinforcing "this resets daily," which is the exact comprehension fix), AND the rotating warm line is the smile. One moment, two jobs. Calm, never repetitive-annoying (once/day).

**Trigger:** first time the budget screen mounts *each calendar day* (gate on `lastHeroAnimDate !== today` in settingsStore/local state).

**Feedback (sequence, ~900ms total, then total stillness):**
1. Gauge arc sweeps from 0 → its value (existing arc, animate `strokeDashoffset`), `Easing.out(cubic)`, 700ms.
2. Number counts up `0 → 20` synced to the arc (`Animated`/`reanimated` shared value, format RM each frame). ~700ms.
3. On settle: a **soft gold glow** behind the number fades in then out over 600ms (`withAlpha(CALM.gold, 0.18)` radial / shadow bloom — dark mode: `CALM_DARK.gold` at 0.22, since dark needs slightly more presence per the dark-mode checklist).
4. The status subline does a 200ms fade-swap to a **time-of-day warm one-liner** (below).
5. One soft haptic `Haptics.impactAsync(Light)` *only* at settle (never during count). One pulse, not a buzz.

**Warm one-liners (rotate by time of day; supportive kakak, never snarky, never scolding):**

| Slot | EN | BM |
|---|---|---|
| morning | `morning! here's today's room` | `selamat pagi! ini ruang hari ini` |
| midday | `doing okay — steady la` | `okay je — steady la` |
| evening | `evening — still got room` | `petang ni — masih ada baki` |
| on-track any time | `on track till payday, relax` | `okay sampai gaji, relax` |
| tight (calm, not alarm) | `bit tight today — you got this` | `agak ketat hari ni — boleh punya` |
| payday-eve | `almost payday, nearly there` | `dah nak gaji, hampir sampai` |

```ts
greetMorning: "morning! here's today's room",  // etc — one key per slot
```

**Rules:** runs **once per day max**. After it plays, the screen is *static* on every later visit that day (just the number). No loop, no idle animation, no sound.

### Alternate delight moments (pick later, same calm rules) — each has exact trigger + feedback

**B. "under budget" soft check — when a category lands under its limit at month-end / on close.**
- Trigger: a category's spent ≤ allocated when the period rolls (or user taps into it after period end).
- Feedback: a small **bronze checkmark** draws on (stroke animation, 400ms) beside the category + one line `you kept RM35 here` (reuse existing `heroKeptNote`/`heroKeptNoteLabel`, `en.ts:1441-1442`) fades in. No green, no confetti. Optional single Light haptic.

**C. "breathing gauge" ambient calm — only while on track.**
- Trigger: hero is in the on-track state (not tight/over).
- Feedback: the gauge arc's glow gently **breathes** (opacity 0.10↔0.18 over 4s, sine, infinite) — a *very* slow, almost-subliminal pulse that says "alive, calm, fine." Stops instantly if state goes tight (stillness = subtle signal something needs attention). This is the one allowed idle loop because it's sub-perceptual and state-meaningful.

**D. "payday reset" — the one bigger beat (monthly).**
- Trigger: first open on/after payday when budgets refill.
- Feedback: gauge refills 0→full with the count-up, glow a touch warmer/longer (900ms), line `fresh month, fresh start` / `bulan baru, mula semula`. This is the *one* moment allowed to be slightly more — it's a genuine milestone (Monzo: tie magic to a real beat).

**E. "good morning, you're ahead" — gentle positive when yesterday came in under.**
- Trigger: yesterday's actual spend < yesterday's daily allowance.
- Feedback: today's number subtly counts up *past* the base to show the rolled-over bonus, then settles, with `you saved a bit yesterday — extra room today` / `semalam jimat sikit — lebih ruang hari ni`. (Only if rollover is enabled.)

---

## 4. First-glance comprehension order (what the eye hits 1st/2nd/3rd)

For a money screen, design the visual hierarchy so a non-financial user "gets it" in <2 seconds:

1. **FIRST — the number + its gauge.** Biggest, centered, highest contrast. The gauge gives instant "how full / how much room" *before any reading* (shape is faster than digits). This is correct already.
2. **SECOND — the unit label `free to spend today`.** Must be the second-largest text, tight to the number. This is where comprehension is won or lost. Currently too quiet ("a day" at bottom) — promote it.
3. **THIRD — the trust subline `after RM340 bills + RM150 savings`.** Quiet but present; answers "is this safe?" Reading is optional but reassuring.
4. **FOURTH — status/mood line + `resets tomorrow`.** Emotional + temporal framing.
5. **LAST / on demand — the math receipt** (tap). Proof for the curious, hidden from the rest.

Eye path = **shape → unit → safety → mood → (proof on tap)**. Never make the bank-balance-looking number the only thing with no unit attached.

---

## 5. Anti-patterns (do NOT do)

- **Bare big number with the unit floating far away** ("RM20" big, "a day" tiny at the bottom). This *is* the current bug — the eye reads it as a balance. Unit must touch the number.
- **Jargon:** "disposable income", "discretionary", "allocated", "reserve", "liabilities", "remaining period", "ROI". Use: spend / bills / savings / buffer / payday. (App rule: never profit/loss/revenue/ROI.)
- **Ambiguous "a day" / "left"** with no temporal anchor. Use "today" + "resets tomorrow".
- **Number with no context** (no subtraction shown) → reads as either scary-big or scary-small. Always show "after bills & savings".
- **Fake-cheerful / hype tone** ("You're CRUSHING it!!! 🤑") and **Cleo-style snark/roast** ("lol you broke"). ([Cleo voice ref](https://www.thepennyhoarder.com/budgeting/cleo-app-review/)) Our voice = supportive kakak: calm, warm, never scolding even when tight ("bit tight today — you got this", never "you overspent").
- **Red / bright green / alarm states** when over budget. Use neutral/bronze ("a bit over — no stress").
- **Casino delight:** confetti, coin showers, slot sounds, looping celebratory animation, anything engineered to pull the user back. ([ethical ref](https://www.theuxda.com/blog/rise-dopamine-banking-how-fintechs-and-neobanks-are-redefining-customer-experience))
- **Delight that repeats too often** → becomes noise (Monzo: "if everything's a highlight, nothing is"). Gate the daily moment to once/day.
- **Over-the-top precision:** showing "RM 20.37 /day" — round to whole RM in the hero; exact figures live only in the receipt.

---

## Build checklist (engineering)
- [ ] Relabel `heroDailyLabel` → `free to spend today` / `boleh belanja hari ini` (`en.ts`, `ms.ts`).
- [ ] Add `heroTrustLine` (always-visible, real RM figures) under the unit label.
- [ ] Add `heroResetsTomorrow` line (gold, optional).
- [ ] Add `heroHowCalculated` ⓘ button → opens math receipt bottom sheet (reuse existing bottom-sheet pattern: `animationType="fade"`, transparent, `onStartShouldSetResponder`, RNGH ScrollView).
- [ ] Build the receipt waterfall with the 11 `math*` keys (EN+BM).
- [ ] Build the once-per-day count-up + arc sweep + gold glow + Light haptic + time-of-day line (gate on `lastHeroAnimDate`).
- [ ] Dark mode: glow `CALM_DARK.gold` @0.22; all new text via `useCalm()` `C.` tokens; modal `C.surface` + 1px `C.border`.
- [ ] Tablet: cap math sheet `maxWidth` + center.
- [ ] BM parity for every new key.

---

## Sources
- PocketGuard "In My Pocket" / safe-to-spend after bills+goals: https://pocketguard.com/budgeting/ , https://www.getrichslowly.org/pocketguard-review/
- Emma "Left to Spend" vs "Available Balance" disambiguation: https://help.emma-app.com/en/article/why-is-my-left-of-different-from-my-available-balance-nklig0/ , https://help.emma-app.com/en/article/learn-committed-spending-1cg2t8v/
- Daily-allowance formula + watch-it-drop onboarding: https://www.monefy.com/guide/how-to-budget-with-daily-limits , https://apps.apple.com/us/app/daily-budget-original/id651896614
- Monzo magic moments (restraint doctrine): https://monzo.com/blog/2022/11/04/how-we-design-magic-moments-at-monzo
- Ethical dopamine banking vs casino patterns: https://www.theuxda.com/blog/rise-dopamine-banking-how-fintechs-and-neobanks-are-redefining-customer-experience , https://www.theuxda.com/blog/dark-patterns-in-digital-banking-compromise-financial-brands
- Progressive disclosure (tap-to-see-math, trust on demand): https://www.nngroup.com/articles/progressive-disclosure/ , https://fuselabcreative.com/fintech-ux-design-guide-2026-user-experience/
- Cleo snark voice (the tone to AVOID): https://www.thepennyhoarder.com/budgeting/cleo-app-review/ , https://www.inc.com/ben-sherry/why-this-company-hires-comedy-writers-to-craft-an-edgy-ai-budget-assistant/91194888
- Fintech microinteractions / calm delight: https://deepinspire.com/blog/the-role-of-microinteractions-in-fintech-design-a-closer-look-at-user-engagement/ , https://procreator.design/blog/best-practices-fintech-user-experience/
