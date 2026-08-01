# Potraces — First-Time Engagement Audit
**Date:** 2026-05-01
**Personas:** Aunty Salmah (kuih seller, BM, 52), Adi (rider, English, 24), Hana (freelance designer, English, 31)

## 60-second read

Potraces' first-run is technically polished but conceptually overloaded. A new user encounters **6 onboarding slides** (welcome + 5 feature mockups) before seeing any real surface — already 1 slide more than UX-H3 implied. Then on the Personal Dashboard they immediately face up to **five competing teaching surfaces** stacked vertically: hero balance (RM 0.00), WeekBar (empty), `FreshStart` banner (only 1st–5th of month), `GettingStarted` chip strip, insight strip with `pace 0%` / `kept RM 0`, and a 10-tile quick-action carousel. None of these is a clear "do this first" CTA. The FAB is the actual primary action, but onboarding never points at it.

The biggest persona-specific problem is **Aunty Salmah**: business mode is gated behind a phone+password+Telegram OTP wall — a Telegram bot is the only verification channel. She doesn't have Telegram. She abandons. This is the single highest-impact drop-off in the app.

For Adi (rider) and Hana (freelance), the lesser-but-real friction is **AI vocabulary fatigue**: in their first 10 minutes they will read "Echo," "Pulse," "Mirror," "Playbook," "Breathing Room," "Kept," "Pace," and "Fresh Start" — none of which is a real-world money word. Cognitive cost is high; emotional payoff is low.

`ExpenseEntry.tsx` is referenced in the agent brief as an entry surface but is **deleted** (`git status` shows `D src/screens/personal/ExpenseEntry.tsx`). One of the five entry paths the brief asked me to count taps for no longer exists. README/AUDIT need updating.

---

## Persona walkthroughs

### Aunty Salmah — kuih raya seller, 52, BM, mid-tier Android

1. Installs from Play Store. Taps icon.
2. **Onboarding slide 0 — Welcome.** "Hi there / let's set things up." Name field (optional). Language toggle EN/BM. Salmah taps BM. `Onboarding.tsx:236-268`. **[F1: language toggle is a 2-pill row, no MY flag — Salmah has to read "Bahasa Melayu" in tiny letters to know which is which. The "EN/BM" badge text alone is too abbreviated for her.]**
3. **Slide 1 — "Jejak Wang Anda".** Mockup shows `nasi lemak RM8.50, Grab to work RM15, Unifi bill RM129, Shopee RM89.90`. Reads as "personal money tracker," not "kuih business." `Onboarding.tsx:65-80`. **[F2: the three feature slides (track-money / split / notes) are all personal-mode framing. Slide 2 "Run Your Business" / "Urus Perniagaan" appears, but the mockup is generic Order #001 — not visibly aimed at home kuih sellers.]**
4. Slide 2 — "Urus Perniagaan". Mockup shows Order #001 with Kuih lapis RM85 — this finally lands for Salmah. **[F3: but it sits between two unrelated personal slides, not at the start, so Salmah has already half-decided it's not for her.]**
5. Slides 3, 4, 5 — Split, Notes/Echo, Receipts/Pulse. **[F4: 5 slides + welcome = 6 pages. Skip button only appears from page 2 onward (`Onboarding.tsx:292`). Page 0 (welcome) and page 5 (last) cannot be skipped — but the "Get Started" button on page 5 IS the skip equivalent. Inconsistent.]**
6. Lands on **Personal Dashboard** by default — `RootNavigator.tsx:212`+ flow shows mode is personal post-onboarding. **[F5: after a full onboarding emphasising "Run Your Business", the user lands on the personal-money screen. No mode-selection step, no "are you here for personal or business?" pivot. To reach kuih-seller features she must find Settings → Mode toggle → Business.]**
7. Salmah taps around. She finds the FAB (bottom-right, hint says "hold & drag to move" — `QuickAddExpense.tsx:569`). **[F6: the only FAB hint is about *dragging the button*, not about *what tapping it does*. She taps and gets a numpad. No prompt explaining "log spent money".]**
8. Eventually finds Settings → switches to Business. **[F7: requires guess-discovery; no labelled affordance on personal Dashboard saying "selling something? switch to business".]**
9. **Business Setup screen** (`Setup.tsx:18-24`). 6 income types in BM. "Jual produk — kedai online, made-to-order, kuih raya". Salmah taps it confidently. **[F8: BM heading "macam mana duit masuk pada kau?" uses "kau" (informal/rude register for a 52-year-old aunty). Should be "anda" or "awak".]** Tap "itulah saya".
10. **AuthGatedBusiness mounts.** Phone + password + confirm-password screen. `AuthScreen.tsx:96-109`. **[F9: Salmah has invested ~3 minutes; only NOW does she learn she must create an account to use the kuih feature. Phone + 6-char password + confirm. No "why" justification. No mention of OTP flow yet.]**
11. After signup, **OtpVerificationScreen** appears: "send this code to our Telegram bot @PotracesBot". `OtpVerificationScreen.tsx:200-214`. **[F10: Aunty Salmah has WhatsApp, not Telegram. The button "open Telegram" tries `tg://resolve?domain=PotracesBot` then falls back to t.me web. She is on Android Chrome; t.me opens Play Store. She must INSTALL Telegram, REGISTER for it, then return. There is no SMS/WhatsApp fallback.]** **[F11: BM step text exists (`tr.auth.otpStep1-4`) — verify localisation; ms.ts entries should be checked. The brand "Telegram bot" is never explained as "robot" or "akaun automatik" — Salmah won't recognise the term.]**
12. **Drop-off point.** Probability of Salmah completing this >95% drop. She quits.

### Adi — Grab + Foodpanda rider, 24, English, has tried 2 finance apps before

1. Installs. Taps icon.
2. Welcome slide. Name (skips, leaves blank), language EN. Tap "let's go".
3. Slides 1–5. Adi has seen this 4-slide pattern before. He taps "skip" at slide 2. `Onboarding.tsx:292` — skip works from slide 2 onward. Onboarding closes.
4. Lands on **Personal Dashboard**. Hero says "Good morning." Balance RM 0.00. WeekBar empty. **[F12: the Dashboard's stacked first-run surfaces all read at "RM 0" / "kept RM 0" / "pace 0%". The insight strip cards LOOK live (they have real-looking numbers and icons) but are all zero. This signals "broken / boring" before user has done anything.]**
5. Adi sees `GettingStarted` chip strip — 4 chips: "add your first expense", "set up a wallet", "set a budget", "write a note" (`GettingStarted.tsx:30-55`). **[F13: order is wrong for a rider. Adi's mental model: I want to log my Grab earnings (income), not an expense. There is no "log income" chip. First chip pushes him to log a SPEND, which feels like a guilt-trigger right after install.]**
6. Adi taps "add your first expense". Numpad appears (QuickAddExpense). Types "30" for petrol. **[F14: no clear "income vs expense" pivot here. The numpad is "expense by default" — the income toggle isn't surfaced as a primary control. Adi sees the keypad and assumes it's only for expenses.]** He proceeds → category step → wallet step. He has no wallets. WalletPicker shows preset list. **[F15: WalletPicker first-run on a never-used app: presets like "Cash / Maybank / Touch n Go" surface, but the user must commit to one before logging. There's no "I'll decide later" — wallet is required (`QuickAddExpense.tsx` flow).]**
7. He picks "Cash". Save. Toast: "expense logged". GettingStarted now shows 3 remaining chips. **[F16: confirmation is a brief toast — Adi doesn't see WHERE the RM30 went. The wallet still shows zero balance because he hasn't put money INTO the wallet first. App silently "owes" balance to the wallet. The mental model breaks here.]**
8. Adi finds the rider mode? Not from Dashboard. He has to know to go Settings → Mode → Business → Setup → "Delivery rider". **[F17: same discoverability problem as Salmah. The README claims Adi will land in rider sub-mode; in reality, the default is personal.]**
9. After 15 min Adi has logged one expense and seen "Echo," "Pulse," "Kept," "Pace," "Fresh Start." Vocabulary overload from a finance app he doesn't trust yet. **[F18: he has tried 2 apps already; novel vocabulary that doesn't map to FNB / Splitwise / YNAB makes him bounce.]**

### Hana — freelance designer, 31, English, iPhone 13

1. Installs. iPhone splash.
2. Welcome → English → Name "Hana" → let's go.
3. Slides 1–5. Hana reads slide 4 "Notes & Echo": "Write naturally — 'lunch rm12, grab rm8'". This delights her. **[+ unique positive reaction; this is the strongest onboarding moment.]**
4. Lands on Personal Dashboard. iOS App Tracking Transparency (`App.tsx:144-153`) prompt fires AFTER onboarding. **[F19: ATT prompt appears with no pre-permission rationale. She sees a system dialog: "Potraces would like permission to track your activity..." with no context. iOS HIG: pre-permission rationale screens dramatically improve consent rate. Without one, she taps "Ask App Not to Track" and any future feature relying on ATT silently degrades.]**
5. Hana taps `GettingStarted` "set up a wallet". Lands on `WalletManagement` — overlay `ScreenGuide` fades in 500ms after mount: "your wallets / track cash, bank, e-wallet…". `ScreenGuide.tsx:34`. **[F20: she didn't ask for a tour. She was trying to add a wallet. ScreenGuide is positioned bottom-floating (`ScreenGuide.tsx:60`) and absolute-positioned at `zIndex: 9998` — covers the bottom area where the "+ wallet" button likely sits. She has to dismiss before she can act.]**
6. Hana taps freelance mode (Settings → Business → Setup → Freelance). Phone+password gate. iPhone 13, has Telegram. Password 6 chars (`AuthScreen.tsx:60`). **[F21: 6-char minimum is below standard secure-default of 8. SaaS finance app norm is 8+. Trust signal weakens.]**
7. OTP screen → opens Telegram → bot interaction → returns. Realtime channel detects (`OtpVerificationScreen.tsx:62-79`). Smooth on her side.
8. Lands on Freelance/Business sub-dashboard. **[F22: Hana is now in business mode. Personal-mode wallets she just created don't carry over visually — she has to mentally split her brain between Personal and Business. No onboarding has prepared her for this dual-mode cognition.]**
9. She tries to log a client payment. Discovers she now needs to set up clients first. **[F23: in the README, business mode is positioned as more capable; in practice, the first 10 minutes are setup-heavy: clients, products, payment QR, shop link. None is auto-deferred via "start logging, set this up later".]**
10. She'd quit at point 9 unless she's strongly committed. Drop-off probability 35%.

---

## Critical (will lose users in first 5 min)

### FIRSTRUN-C1. Telegram-only OTP gate kills Aunty Salmah segment entirely
**Where:** `src/screens/auth/OtpVerificationScreen.tsx:121-126, 191-208`
**What:** Verification requires sending a code to `@PotracesBot` on Telegram. No SMS, no WhatsApp, no email fallback. Users without Telegram (a large share of the 50+ Malaysian aunty market — Telegram penetration in Malaysia is ~30-35%, vs WhatsApp ~93%) cannot complete signup.
**Why critical:** Business mode is the *primary value prop* for sellers/riders/freelancers. The OTP wall blocks 100% of non-Telegram users.
**Fix:** Add SMS OTP (Twilio / Supabase Auth phone) as default. Keep Telegram as advanced option labelled "free, no SMS cost". Add a "I don't have Telegram" link below the bot button that opens the SMS flow. File: `OtpVerificationScreen.tsx:200-208`.

### FIRSTRUN-C2. Mode-selection happens AFTER 6 onboarding slides — and defaults to personal
**Where:** `src/screens/shared/Onboarding.tsx:205-210`, `src/navigation/RootNavigator.tsx:243-265`
**What:** After onboarding, every user is dropped into Personal Dashboard regardless of which slide resonated. There is no "what brings you here?" pivot. A kuih seller/rider/freelancer must guess that mode-toggle exists in Settings.
**Why critical:** The product positions itself as for sellers/riders/freelancers, but the first surface they see is generic personal finance. Persona–context mismatch in the first 30 seconds.
**Fix:** Insert a **mode-pick screen** as page 5 of onboarding (replace the last "Get Started" page). 3 options: "I'm tracking my own money" / "I'm running a business / freelancing / riding" / "Both". Wire the choice to set initial mode + skip BusinessSetup if "personal only". File: `Onboarding.tsx:195-198` add new page; `App.tsx` post-onboarding default mode reads selection.

### FIRSTRUN-C3. Personal Dashboard shows 5+ competing first-run surfaces with no priority
**Where:** `src/screens/personal/Dashboard.tsx:600-700`
**What:** Stacked vertically: hero (RM 0), WeekBar (empty), `FreshStart` (1st-5th only), `GettingStarted` (always until 5 tx), insight strip (3-4 zero-cards), 10-tile quick-action carousel. UX-H3 already flagged the surfaces; my count is higher. No "do this first" CTA.
**Why critical:** Decision paralysis on the most important screen.
**Fix:** On first-run (transactions=0): collapse hero to "let's start," HIDE WeekBar/insight strip/quick actions, show ONE big CTA "log your first transaction" tied to FAB. Reveal other surfaces progressively after 1, 3, 5 transactions. File: `Dashboard.tsx:600-700`. Use `transactions.length` as gate.

### FIRSTRUN-C4. Onboarding has 6 slides — 1 over the 4 the README documented
**Where:** `src/screens/shared/Onboarding.tsx:34-40, 187-193`
**What:** README first-time-experience section says "4-page onboarding (welcome + 3 feature slides)". Code has welcome + 5 feature slides (track / business / split / notes / receipts). Skip button hidden on slide 0 and slide 5 (`Onboarding.tsx:292`).
**Why critical:** Skip-rate compounds. 6 slides × ~3 sec/slide = 18s of forced taps even for skip-impatient users like Adi.
**Fix:** Cut to 3 slides matching primary value: "track money" / "run business" / "notes/receipts/echo". Move "split" into a contextual hint when user adds 2nd person to a transaction. File: `Onboarding.tsx:34-40`.

---

## High (will lose users in first session)

### FIRSTRUN-H1. ScreenGuide overlays steal screen space at the worst moment
**Where:** `src/components/common/ScreenGuide.tsx:58-64` (positioned `bottom: 24, left: SPACING.lg, right: SPACING.lg, zIndex: 9998`)
**What:** Bottom-anchored floating card on first visit to 8 screens (DebtTracking, ReceiptScanner, BudgetPlanning, FinancialPulse, NotesHome, WalletManagement, MoneyChat, etc.). On WalletManagement specifically, it overlays the FAB / "add wallet" button area.
**Why high:** User opened the screen to *do* a thing; the overlay teaches them what they already inferred.
**Fix:** Either (a) move ScreenGuide to top-of-screen banner, not floating-bottom, or (b) anchor below the screen's primary CTA so it never blocks an action. File: `ScreenGuide.tsx:58-64`.

### FIRSTRUN-H2. GettingStarted assumes "expense first" — wrong for income-earners
**Where:** `src/components/common/GettingStarted.tsx:30-55`
**What:** First chip is "add your first expense". For Adi (rider) and Aunty Salmah (kuih), the first thing they want to log is *income they just earned*. The expense-first ordering implicitly frames the app as a "spending tracker" rather than a money-flow tracker.
**Why high:** The app's brand promise ("a money app that doesn't make you feel bad about money") clashes with starting in expense-tracking mode.
**Fix:** Change first chip to "log money in or out" → routes to QuickAddExpense which already supports both directions. Or split into 2 chips: "log income" + "log expense". File: `GettingStarted.tsx:32-36`.

### FIRSTRUN-H3. AI-vocabulary first-encounter rate is 7+ novel terms in first session
**Where:** `src/i18n/en.ts:1880-1888` (Echo, Pulse), `aiInsightsStore.ts` (Mirror, Breathing Room), `playbookStore.ts` (Playbook), `Dashboard.tsx:678` ("kept"), `:659` ("pace"), `FreshStart.tsx:118` ("fresh start", "breathing room")
**What:** A new user encounters: Echo (chat), Financial Pulse (a screen + insight card), Spending Mirror, Playbook, Breathing Room, Fresh Start, Kept, Pace — none used in everyday Malaysian money speech.
**Why high:** Cognitive load for users like Adi who've already abandoned 2 apps.
**Fix:** Rename to plain words first session, surface clever names only after retention. Concrete proposal: "Echo" → "ask" or "chat". "Pulse" → "money health". "Mirror" → "this week vs last". "Playbook" → "monthly plan". "Breathing room" → "limit". "Kept" → "saved" or "left over". "Pace" → "% of usual". Files: `i18n/en.ts:1903-1920` (`guide.*`), `Dashboard.tsx:659, 678`, `FreshStart.tsx:118-119`.

### FIRSTRUN-H4. BM register is too informal ("kau") for older audience
**Where:** `src/i18n/ms.ts:330` (`setupHeading: 'macam mana duit masuk pada kau?'`), `:461`, `:1655`
**What:** "kau" is street/peer-register Malay. A 52-year-old aunty reads this as rude. The app brand wants warmth, not edge.
**Why high:** Salmah-segment trust collapse.
**Fix:** Global pass: "kau" → "anda" (formal) or "awak" (warm-neutral). Especially in BusinessSetup heading, wallet copy, and any auntie-facing surface. File: `src/i18n/ms.ts` global rename.

### FIRSTRUN-H5. ATT prompt fires with no pre-permission rationale screen
**Where:** `App.tsx:144-153`
**What:** iOS App Tracking Transparency request fires immediately after `hasCompletedOnboarding=true` on iOS. No rationale screen explaining what tracking means or why.
**Why high:** Apple HIG strongly recommends rationale. Without it, denial rate ~85%; with it, ~50%.
**Fix:** Add a one-screen explainer before calling `requestTrackingPermissionsAsync()` — "we use anonymous app crash data to fix bugs. nothing personal is sent." Then trigger ATT. File: `App.tsx:144-153`.

### FIRSTRUN-H6. Onboarding writes user inputs ONLY when handleNext is called from welcome slide
**Where:** `src/screens/shared/Onboarding.tsx:212-219`
**What:** If user types name on welcome page, then SWIPES (FlatList paging) instead of tapping the button, name is *not* persisted because `handleWelcomeDone` runs only on tap-next from page 0. Skip button on later pages calls `handleComplete` which DOES call `handleWelcomeDone` (line 208) — but only if user got past welcome by tapping the button at least once.
**Why high:** Subtle data loss bug for swipe-savvy users. Settings later shows blank name.
**Fix:** Persist name + lang on every text/lang change, not on next-press. File: `Onboarding.tsx:200-203, 254, 263`.

### FIRSTRUN-H7. WalletPicker forces a wallet on first tap — no "skip / decide later"
**Where:** `QuickAddExpense.tsx` step flow (amount → category → wallet, all required)
**What:** User cannot save a transaction without committing to a wallet. First-time users don't know what their wallets are yet.
**Fix:** Auto-create a default "Cash" wallet on first transaction if none exists. Allow saving with `walletId: null` and resolve later. Or add a "decide later" pill that defers wallet selection.

---

## Medium (erodes confidence)

### FIRSTRUN-M1. ExpenseEntry referenced in audit + README, deleted from src
**Where:** `git status` shows `D src/screens/personal/ExpenseEntry.tsx`. README first-run section / agent brief lists it as one of 5 entry surfaces.
**Fix:** Update README to remove ExpenseEntry mention, or restore the screen if it was a navigation target.

### FIRSTRUN-M2. FAB "hold & drag" is the only first-tap hint
**Where:** `QuickAddExpense.tsx:569`
**What:** Hint text on first 3 visits says "hold & drag to move". Doesn't say what tapping does.
**Fix:** Two-state hint: first visit shows "tap to log money in/out", from second visit onward show "hold & drag to move".

### FIRSTRUN-M3. Insight strip cards display zeros that read as "broken"
**Where:** `Dashboard.tsx:622-700`
**What:** "pace 0%", "kept RM 0", "transactions 0" all rendered before user has data.
**Fix:** Hide insight strip until `transactions.length >= 5`. Same gate as GettingStarted's hide condition (`GettingStarted.tsx:28`).

### FIRSTRUN-M4. FreshStart shown only days 1–5 — invisible to anyone installing day 6+
**Where:** `FreshStart.tsx:75`
**What:** `if (dismissedMonth === monthKey || now.getDate() > 5) return null;` — installed on the 7th = never seen.
**Fix:** First-run override: show on first dashboard visit regardless of date, then revert to monthly cadence. Or kill component entirely (per UX-H3 advice; only 1 location uses it).

### FIRSTRUN-M5. 6-character password minimum is below 2026 norm
**Where:** `AuthScreen.tsx:60`
**Fix:** Bump to 8 chars or use Supabase Auth's built-in password strength check.

### FIRSTRUN-M6. No privacy/data-residency disclosure during signup
**Where:** `AuthScreen.tsx:96-115` (no ToS / privacy link visible)
**What:** Salmah/Hana have no signal that data syncs to Supabase (cloud) vs stays on device. The README mentions cloud-sync but onboarding never does.
**Fix:** One-line under signup: "your kuih/transaction data syncs to your account so you don't lose it." Plus link to `docs/privacy` page (if exists; if not, write one).

### FIRSTRUN-M7. Skip button missing on welcome slide — name is "optional" but feels mandatory
**Where:** `Onboarding.tsx:292` (skip only `currentIndex > 0 && < lastIndex`)
**What:** Welcome says "name (optional)" but the only forward path is "let's go" — no escape. User who doesn't want to enter info has no signal that they can just tap the button.
**Fix:** Either show skip on slide 0 too, or change button label to "skip & continue" when name is blank.

### FIRSTRUN-M8. The 4-step OTP instructions don't explain "what is a Telegram bot"
**Where:** `i18n/en.ts:122-125`, `OtpVerificationScreen.tsx:191-208`
**What:** "open @PotracesBot on Telegram / send the code to the bot". For Salmah, "bot" is alien.
**Fix:** Step 2 → "open @PotracesBot — it's a small chat that auto-replies. Send your code there."

### FIRSTRUN-M9. Empty-state copy is mostly "No X yet" — flat and uninviting
**Where:** `i18n/en.ts:895, 1035, 1361, 1401, 1833`
**What:** "No transactions yet", "No budgets yet", "No wallets yet" — generic placeholder strings, no CTA, no warm voice.
**Fix:** Brand-voice rewrites — see Suggested Rewording table below.

### FIRSTRUN-M10. Slide 4 "Notes & Echo" mockup uses "Echo" name without first-time explanation
**Where:** `Onboarding.tsx:123-135`, `i18n/en.ts:1885-1886`
**What:** "Or ask Echo anything about your money." First mention of "Echo" with zero context for what it is.
**Fix:** "Or ask anything — type 'how much on coffee this month' and we'll answer." Drop "Echo" from onboarding entirely; introduce as the chat title in-product.

---

## Low (polish opportunities)

### FIRSTRUN-L1. "EN/BM" pill labels too small for older readers
**Where:** `Onboarding.tsx:251-268, 507-512`
**Fix:** Add small flag emojis 🇬🇧/🇲🇾, increase `langFlag` size from `TYPOGRAPHY.size.sm` to `TYPOGRAPHY.size.lg`.

### FIRSTRUN-L2. GettingStarted has 4 chips horizontally scrolling — invitations feel cluttered
**Where:** `GettingStarted.tsx:71-91`
**Fix:** Show only ONE next-step chip at a time (the most relevant pending action) instead of all 4.

### FIRSTRUN-L3. Slide accent colors don't match the destination screen's accent
**Where:** `Onboarding.tsx:34-40`
**Fix:** Match each onboarding slide accent to its destination screen accent so the visual handoff is cohesive.

### FIRSTRUN-L4. Dots indicator color shifts with each slide — feels jumpy
**Where:** `Onboarding.tsx:331-347`
**Fix:** Keep dot color constant (CALM.accent), let only width animate.

### FIRSTRUN-L5. Welcome title "Hi there" is a non-Malaysian register
**Where:** `i18n/en.ts:1873`, `ms.ts:1847` (BM "hai")
**Fix:** EN: "hai!" (used naturally in Malaysian English). BM: keep "hai".

### FIRSTRUN-L6. SlideMockup #1 uses "Unifi bill" — too narrow geographically
**Where:** `Onboarding.tsx:74`
**Fix:** Use a more universal item like "TNB bill" or just "internet bill".

### FIRSTRUN-L7. `letsGo` BM = "jom mula" — should be "jom!" or "OK jom"
**Where:** `i18n/ms.ts:1852`
**Fix:** Shorter, more natural: "jom!".

### FIRSTRUN-L8. "Get Started" final-page button label is generic
**Where:** `i18n/en.ts:1889`
**Fix:** "let's go" (matches welcome page voice) or "show me my dashboard" — punchier.

---

## Top 5 drop-off moments

1. **OTP / Telegram wall (Aunty Salmah scenario)** — `OtpVerificationScreen.tsx:200-208`. **Why:** non-Telegram users hit a hard wall mid-signup. **Fix:** Add SMS fallback as first option (FIRSTRUN-C1).
2. **Personal Dashboard zero-state overload** — `Dashboard.tsx:600-700`. **Why:** 5+ surfaces compete for attention with empty data. **Fix:** Progressive disclosure tied to `transactions.length` (FIRSTRUN-C3).
3. **6-slide onboarding with no mode-pick at end** — `Onboarding.tsx:34-40`. **Why:** every user lands in personal mode regardless of the "Run Your Business" slide they just saw. **Fix:** Cut to 3 slides + insert mode-pick (FIRSTRUN-C2, C4).
4. **GettingStarted "first expense" pushes income-earners the wrong way** — `GettingStarted.tsx:32-36`. **Why:** rider/seller wants to log earnings, app pushes spending. **Fix:** Replace with "log money in or out" (FIRSTRUN-H2).
5. **Vocabulary fatigue (Echo / Pulse / Mirror / Playbook / Breathing Room / Kept / Pace)** in first 10 minutes — `Dashboard.tsx:659, 678`, `i18n/en.ts:1885-1888`, `FreshStart.tsx:118`. **Why:** 7 novel terms before user has shipped any real action. **Fix:** Plain-language defaults; surface brand names only after retention (FIRSTRUN-H3).

---

## What to delete

Beyond UX-H3's list (FreshStart, FeatureHint):

- **`FeatureHint.tsx`** — built but not wired to a single call site (Grep confirms). Delete.
- **`FreshStart.tsx`** — only consumed in `Dashboard.tsx:616`, gated to days 1–5 of month. The breathing-room concept is preserved by `BreathingRoom` component anyway. Delete or fold into the budget-setup flow.
- **Onboarding slides 3 ("Split & Settle") and 5 ("Receipts & Pulse")** — `Onboarding.tsx:34-40`. Two of five feature slides duplicate value covered by slide 1. Keep welcome + track-money + run-business + notes-echo. Cut split + receipts slides; surface them as in-context FeatureHints when user reaches relevant screens.
- **The dragging-FAB hint** as the FIRST hint shown — `QuickAddExpense.tsx:569`. Replace with tap-purpose hint first, drag hint second.
- **The 4th GettingStarted chip "write a note"** — `GettingStarted.tsx:49-54`. Notes is a power-user feature, not a first-run task. Demote to FeatureHint after 3rd transaction.
- **"Pace" insight card** — `Dashboard.tsx:649-665`. Showing "0% of usual" before user has 30 days of data is meaningless. Hide until 14 days of transactions exist.
- **Insight card "owedLater"** — only appears when BNPL wallet exists; harmless for first-run, keep.

---

## What to add

1. **Mode-pick screen as final onboarding step** — 3 cards: track-my-money / run-something / both. Sets initial mode + skips BusinessSetup if "track-my-money". File: new `Onboarding.tsx` page after slide 5 (or replace slide 5).
2. **SMS OTP fallback** — alongside Telegram. New flow in `OtpVerificationScreen.tsx`, plus Supabase edge function. Critical for Salmah segment.
3. **First-transaction success modal** — fullscreen "you logged RM30 to Cash. it's saved. take a peek at your wallets." Builds wallet-concept confidence (addresses F16). New component `FirstSavedCelebration.tsx`.
4. **Pre-permission rationale for ATT** — short sheet before `requestTrackingPermissionsAsync()` in `App.tsx:144-153`.
5. **Auto-create default "Cash" wallet** on first transaction if none exists. File: `QuickAddExpense.tsx` save-handler. Removes WalletPicker friction (FIRSTRUN-H7).

---

## Suggested rewording

| Current | Proposed | Reason |
|---|---|---|
| `i18n/en.ts:1873` "Hi there" | "hai!" / lowercase, locally-flavoured | Matches CALM lowercase voice; BM-influenced English |
| `i18n/ms.ts:330` "macam mana duit masuk pada kau?" | "macam mana duit masuk untuk anda?" | "kau" is rude register for older users |
| `i18n/en.ts:1880` "Just type 'nasi lemak RM8' and we'll sort it out." | "type 'nasi lemak rm8' — we'll sort the rest." | Drops capitalised "Just" and "RM" inconsistency |
| `i18n/en.ts:122` "copy the code above" | "1. tap the code to copy it" | Number reinforces step; explicit action verb |
| `i18n/en.ts:123` "open @PotracesBot on Telegram" | "open @PotracesBot — it's an auto-reply chat on Telegram" | Demystifies "bot" for older users |
| `i18n/en.ts:895` "No transactions yet" | "no money moves yet — tap the + to start" | CTA + plain-words ("money moves" = generic for in/out) |
| `i18n/en.ts:1035` "No budgets yet" | "no monthly limits set — tap to add one" | Drop "budget" → "limit" matches CALM voice |
| `i18n/en.ts:1361` "No wallets yet" | "no wallets set up — add one to track cash & bank" | Adds context about why a wallet matters |
| `gettingStarted.addFirstExpense` "add your first expense" | "log money in or out" | Doesn't push income-earners toward expense-framing |
| `Dashboard.tsx:659` "pace" | "% of usual" / "vs usual" | "pace" is jargon; plain comparison reads instantly |
| `Dashboard.tsx:678` "kept" | "left over" / "saved this month" | "kept" forces a re-read; "left over" is universal |
| `i18n/en.ts:1885` "Notes & Echo" | "your money notes" | Drops "Echo" branding from first-encounter |

---

Critical: 4 · High: 7 · Medium: 10 · Low: 8
