# Potraces — Monetization & Pricing Plan

**Status: FEATURE-GATING LOCKED (2026-07-18). Billing still PLANNING — nothing charges
anyone yet.** The tier shape *and the specific feature gates* below are now decided
(supersedes the illustrative numbers in the previous version). No billing is wired —
today the in-app "Upgrade" button opens the paywall, whose Continue just flips a local
premium flag for free. RevenueCat is the #1 blocker (see §6).

> **Changelog — 2026-07-22:** Pro price confirmed **RM14/mo · RM120/yr**; paywall hero
> tier is **Basic** (pre-selected, "BEST VALUE" ribbon — not Pro); **×N multiplier copy
> style adopted** (reverses the old "always absolute numbers" rule). See §3.

---

## 1. Philosophy

Dual goal: **genuinely help users AND make money.** The two must not fight.

- **Gate the ceiling, never the floor.** Core tracking (add/edit transactions, view
  balances, calculator) and **basic business mode** are always free. Gating them would
  break trust and kill adoption.
- **Free is a growth engine, not a giveaway.** Free business mode + a free public
  storefront pull users in and market the app for us.
- **The free tier IS the trial — there is no separate free trial.** People get real,
  ongoing value for free; paying removes friction and unlocks power. (Any leftover
  `TRIAL_DAYS` logic in code should be retired.)
- **Two kinds of limit, gated on two different principles:**
  - **Cost-metered features** (Echo AI, receipt scans, statement imports) cost us money
    or compute per use, so they stay **capped at every tier — even Premium** (a generous
    fair-use ceiling, not ∞). This is what protects the 60% margin.
  - **Count features** (wallets, budgets, savings, goals, shared subs) are near-zero
    marginal cost — just rows in a DB — so they go **unlimited at Pro+**. Cheap to give,
    great to advertise.

---

## 2. The Tiers

Four levels, RM/month. **Business mode (basic) is FREE at every level.** Prices:
**Free · Basic RM7.99 · Pro RM14 ⭐ · Premium RM25.**

### A. Personal (the everyday app)

| Feature | Free | Basic RM7.99 | Pro RM14 ⭐ | Premium RM25 |
|---|---|---|---|---|
| **Echo AI chat** / mo | 30 · lite model | 300 (10×) · lite | 800 · **smart** | 1500 · smart |
| **"Ask Echo" on every screen** | — | ✓ | ✓ | ✓ |
| **Cloud backup** | — | ✓ | ✓ | ✓ |
| **Receipt scans** / mo | 15 | 75 (5×) | 150 (10×) | 300 (20×) |
| **Statement / CSV imports** / mo | 5 | 25 | 100 | 300 |
| **Photo on category icons** | — | ✓ | ✓ | ✓ |
| **Wallets** (incl. cash) | 7 | 13 | ∞ | ∞ |
| — per wallet type | 2 | 4 | ∞ | ∞ |
| **Budgets** | 5 | 10 | ∞ | ∞ |
| **Savings accounts** | 3 | 6 | ∞ | ∞ |
| **Goals** | 3 | 6 | ∞ | ∞ |
| **Shared subscriptions** | 3 | 6 | ∞ | ∞ |

*Echo model routing (already built in `src/services/chatModel.ts`): Free/Basic → lite,
Pro/Premium → smart. Two models today — "smartest" for Premium is a future option if a
top model is added; for now Premium's Echo edge is call volume + the exclusives in C,
not a smarter-than-Pro model.*

*What counts against the Echo quota: **only when the USER asks Echo** — Echo chat, Ask-Echo,
the budget Echo-planner (ask/chat), and natural-language **questions** (NL query → answer).
**Background/auto AI does NOT count** (Dashboard spending-mirror insight, report narratives,
the NL logging *parse*, auto playbook insight, savings-rate suggestions) — cached + capped
server-side, so the "300 chats" number means real asks. Implemented 2026-07-18.*

### B. Business / storefront layer (business mode basic = free)

| Feature | Free | Basic | Pro RM14 | Premium RM25 |
|---|---|---|---|---|
| Business mode (basic) | ✓ | ✓ | ✓ | ✓ |
| Free storefront + custom domain + DuitNow QR | ✓ | ✓ | ✓ | ✓ |
| **Remove "Made with Potraces"** | — | — | ✓ | ✓ |
| **Store templates + custom colours/logo** | — | — | ✓ | ✓ |
| **AI business insights** | — | — | preview | ✓ full |
| **Storefront analytics** (views/clicks) | — | — | — | ✓ |

### C. Premium's edge — the power / future tier (the RM25 story)

| Feature | Pro RM14 | Premium RM25 |
|---|---|---|
| **Tap-to-Pay** (accept cards) | — | ✓ |
| **DuitNow QR — accept payments** / advanced | — | ✓ first access |
| **Priority AI + early access to new tools** | — | ✓ |

> **Premium = "the tier that gets the advanced money tools first."** QR-accept and
> Tap-to-Pay are daily-use infrastructure people stay subscribed for, and future
> features land here first. See §3 for the launch-day caveat.

**Tier positioning:**
- **Basic (RM7.99)** — "turn Echo on + lift my everyday caps" for a **personal** power
  user. Key unlock is capability (Ask Echo everywhere, cloud backup, photo icons) plus
  5× the metered caps. Deliberately withholds *unlimited* and the whole business layer.
- **Pro (RM14) ⭐ the hero** — everything personal goes **unlimited**, Echo gets the
  **smart model**, and the seller layer opens (own shop, remove branding, custom design,
  insights preview).
- **Premium (RM25)** — the business layer in full (analytics + full AI insights) **plus
  first access to the payment tools** (Tap-to-Pay, QR-accept) and priority. Aspirational;
  for serious sellers and early adopters.

**Annual pricing** (billed yearly — the "save more" nudge). Basic is monthly-only, which
also nudges annual-minded users up to Pro/Premium.

| Plan | Monthly ×12 | **Annual** | You save | Per month |
|---|---|---|---|---|
| **Pro** RM14/mo | RM168 | **RM120** | RM48 (**29%**) | **RM10/mo** |
| **Premium** RM25/mo | RM300 | **RM200** | RM100 (**33%**) | **RM16.67/mo** |

- The paywall **leads with the per-month price** (RM10.83) and shows the annual total
  (RM120/yr) as small print — never front-load the big number. **No "N months free"
  framing** (removed by decision — it read as gimmicky).
- Premium's annual discount (33%) is deeper than Pro's (28%); this nudges committed
  annual buyers up toward Premium. Equalise if you'd rather keep Pro the hero on annual.

### Data storage & cloud backup — what "on device" means

Potraces is **local-first**: all financial data (transactions, wallets, budgets, debts,
savings, goals…) persists to the **device** (`AsyncStorage`) and the app works fully
offline. **Cloud backup is a separate, opt-in copy to the server — and it is PAID (Basic
RM7.99+).** Cloud backup and auto-sync are the *same* switch, named for the benefit:

- **Free (no cloud backup):** data lives **only on the phone**. Reinstall, wipe, lose, or
  replace the phone → **the data is gone.** The free safety valve is **manual Export**
  (free at every tier) — the user can save a file themselves.
- **Basic RM7.99+ (cloud backup on):** the sync engine continuously copies data to the
  server (~1.5s after each change, on app-open, on foreground), so losing the phone → log
  in on a new one → **everything restores.** This is also the foundation for multi-device.
- **Restore = one device at a time → safe to sell now.** **Simultaneous multi-device**
  (two devices editing at once → server-side merge) exists in code but is **untested** —
  only advertise "use on all your devices at once" *after* the merge is hardened (see the
  wallet-LWW / sync-orchestration items in the data-safety audit).

**Why this is honest AND good monetization:** the free tier genuinely risks loss, which
makes *"Cloud backup — your money, never lost"* a real, non-manipulative reason to pay.
Keep Export free, and consider a gentle one-time *"your data is only on this phone — turn
on cloud backup to protect it"* nudge for free users.

**Code reality:** sync today is a **free opt-in toggle** (`personalSyncEnabled`), **not**
tier-gated — gate it behind the paid entitlement when wiring billing.

---

## 3. Pricing Psychology (deliberate)

Goal: make **Pro the obviously-right choice**, with Premium anchoring it from above.

- **Basic → Pro = a big, easy jump.** Basic still *caps* everything and has no business
  layer. Pro makes all personal counts **unlimited**, upgrades Echo to the smart model,
  and opens the shop — for only **+RM7**. Price gap ~2×, value gap much larger → feels
  like a steal.
- **Pro → Premium = deliberate hesitation.** Premium adds the full business analytics/
  insights + the *payment* tools (Tap-to-Pay, QR-accept) + priority. For **+RM10 (+67%)**
  the average personal user thinks "do I need to accept card payments?" and stays on Pro.
  That pause **anchors Pro as the smart buy** while **capturing serious sellers**.

**UI tactics (already in the shipped paywall):**
- **Hero tier = Basic** (owner decision 2026-07-22): the shipped paywall **pre-selects
  Basic RM7.99** and puts the **"BEST VALUE" ribbon** on it. Owner's call: *"get everyone
  paying something, upsell later"* — the first conversion matters more than its size, and
  Basic→Pro upsells happen in-app at feature walls. A Pro-hero variant ("Most Popular"
  ribbon on Pro, centre-stage, pre-selected) is a possible **future A/B test**, not the
  shipped state.
- **Multiplier copy** ("×10 more chats") is the **preferred style** on the wall (owner
  decision 2026-07-22 — REVERSES the earlier "always absolute numbers, never ×N" rule).
  "×10" sells the *jump*; absolute numbers ("300 chats/mo") are the supporting small
  print, not the headline.
- **Cloud backup** is a pinned always-visible promise strip ("your money, never lost") —
  the single benefit that alone justifies paying in a money app.
- At a Basic-level wall (business insight / shop customise), CTA reads **"Upgrade with
  Pro"** — marquee features always pull toward Pro.

### ⚠️ Launch-day Premium caveat (must-fix before charging RM25)
Tap-to-Pay and QR-accept are **future** features. If Premium launches before they exist,
its only edge over Pro is bigger metered caps (1500 vs 800 chats, 300 vs 150 scans) —
caps almost nobody reaches. **You cannot charge +RM10 for a promise.** So at launch,
Premium's concrete anchor must be the **full business/shop suite** (storefront analytics
+ full AI business insights) that Pro only previews. Sell Premium as *"the complete
business suite + first access to Tap-to-Pay & QR payments."* Don't ship Premium until it
has at least that one real, working exclusive.

---

## 4. Storefront Model ("built-in website")

Each seller gets a public shop page (products, prices, DuitNow QR) auto-generated from
the business data they already track — e.g. `potraces.com/shop/their-name`.

- **Free for all**, including **custom domain** — a real edge (Beacons charges ~RM45/mo
  for a custom domain; Linktree never offers one).
- **"Made with Potraces" badge:** free/Basic keep it; **Pro (RM14) and Premium can remove
  it.** (Changed 2026-07-18 — previously permanent-on-all-tiers as a growth lock.
  **Trade-off:** removing it costs some free viral reach, but "remove the badge" is a
  strong, concrete RM14 upgrade reason and most free stores still carry it.)
- **Pro (RM14):** templates + custom colours/logo + AI business-insights *preview*.
- **Premium (RM25):** storefront analytics (views/clicks) + *full* AI business insights.

Closest model: **Linktree / Beacons / Carrd** (free micro-site → pay to customise), *not*
Shopify (paid from day one).

---

## 5. What's ready vs. to-build

Gate only what works. Unfinished features are "coming soon" upside of the higher tiers.

**READY today** (gate as soon as billing is wired):
- All metered gating (Echo AI, receipt scans, statement/CSV imports) and count caps
  (wallets, budgets, savings, goals, shared subs).
- New capability gates to add: **Ask-Echo-per-screen**, **cloud backup**, **photo on
  category icons** (all off on Free).
- Basic business mode, advanced personal reports/insights, DuitNow QR generation.

**TO-BUILD** (sit in Pro/Premium as "coming soon" until shipped):
- **Seller storefront** (headline Pro/Premium feature — reuses products + QR).
- **AI business insights** (build on the existing Echo/AI engine).
- **Storefront analytics.**
- **Tap-to-Pay** (needs Apple entitlement approval — weeks) and **QR-accept payments** —
  Premium's future anchor.

**Code changes this locks in** (do when wiring gates, not before):
- `tiers.ts` (DONE): free Echo **100 → 30**, savings **5 → 3**; **new** `maxGoals: 3` +
  `maxSharedSubs: 3`; wallets **6 → 7**, Basic wallets-per-type **4** (budgets stay **5**); scans 15.
- New tier model: the store is 2-tier (`free`/`premium`) today; needs `basic`/`pro`/
  `premium` (the paywall + `chatModel` routing already anticipate `pro`/`premium`).
- **Grandfather existing free users** — anyone already over a lowered free cap (e.g. 4
  savings) keeps what they have; the new cap only blocks *new* creation. Never delete or
  lock data users already made.

---

## 6. Critical dependencies (build order)

1. **Wire RevenueCat billing.** `react-native-purchases` is a dependency but never
   initialised; `subscribe()` just flips a local flag for free. Until this is done, **no
   tier charges anyone — the #1 blocker to earning a cent.** (Configure SDK → products in
   App Store Connect + Play Console + RevenueCat → replace the stub in `PaywallModal`'s
   `handleContinue` with `purchasePackage()` for the selected (tier, billing) → set tier
   from entitlement → restore purchases → **verify entitlement server-side** so tier can't
   be flipped locally.)
2. **Ship Basic + Pro on ready features** (metered + count gates + capability gates +
   personal insights). No new features — just billing + turning gates on + the 3-tier
   store + grandfathering.
3. **Build the seller storefront** — the headline Pro/Premium feature.
4. **Build AI business insights** (Pro preview → Premium full).
5. Later: storefront analytics, then **Tap-to-Pay + QR-accept** → the real Premium anchor.

---

## 7. Competitor benchmarking (2026)

**We are the cheapest serious option in Malaysia.**

| App | Monthly | ≈ RM |
|---|---|---|
| YNAB | $14.99 | ~RM67 |
| Copilot | $13 | ~RM58 |
| Monarch | $14.99 | ~RM67 |
| Wallet (BudgetBakers, in MY) | — | ~RM25 |
| Spendee Premium (in MY) | — | ~RM7–53 |
| **Potraces (Basic/Pro/Premium)** | — | **RM7.99 / 15 / 25** |

- Western budgeting apps cost **RM58–67/mo** — nobody in Malaysia pays that. Our whole
  ladder undercuts even local competitors. **Low price = low friction.**
- **Business is the strongest paying segment.** Malaysian SMEs already pay **Bukku from
  RM35/mo, Financio from RM40/mo** for accounting. Our RM14 business tier is ~half that →
  **the RM14 tier may even be underpriced** (could support RM19). Low launch price is fine
  for adoption; raise later.

---

## 8. Conversion & revenue reality

**Most people will not pay — that is normal, and the model still works.**

- Mobile freemium converts ~**2%**; **fintech ~4%**. "Good" is 3–5%, "great" is 8–12%.
- Plan for **~2–4% of active users paying.** Illustrative: 10,000 free users × 3% ×
  ~RM12 avg ≈ **~RM3,600/mo**, scaling ~linearly with users.
- **The lever is (a) how many free users we get and (b) how badly they need the gated
  feature** — not price. Free business mode + viral storefront drive (a); genuinely great
  RM14 insights + shop drive (b).
- Metered walls (Echo, scans, imports) are the **highest-converting** upsells — the user
  hitting them already got value and has a concrete reason to pay. This is exactly why
  free Echo dropped **100 → 30**: at 100 almost nobody hit the wall, so the AI ladder
  never converted; at 30 the 5×/10×/20× tiers actually mean something.

---

## 9. Open decisions (still to settle)

- ~~**Wallets "3× each"**~~ — RESOLVED: Basic = **13 total**, **4 per type** (free = 7 total, 2 per type).
- Import caps (5 / 25 / 100 / 300) are the least-discussed metered row — tune to real
  server cost once measured.
- Business/Pro tier at RM14 vs RM19 (SME willingness-to-pay suggests room).
- Whether to add a **Basic annual** and whether to equalise Pro/Premium annual discounts
  (28% vs 33%).
- Exact scope of "AI business insights" (Pro preview vs Premium full — what does each
  actually tell a seller?).
- Storefront MVP scope (free v1 vs paid customisation).

---

## Sources

- [WalletGrower — YNAB / Monarch / Copilot pricing](https://walletgrower.com/compare/ynab-vs-monarch-vs-copilot)
- [SmartCalc MY — budgeting apps Malaysia](https://www.smrtcalc.com/guides/best-budgeting-apps-malaysia)
- [RinggitPlus — Malaysian finance apps](https://ringgitplus.com/en/blog/budgeting-saving/keep-your-finances-in-check-with-these-five-financial-management-apps.html)
- [Talkspresso — Beacons vs Linktree pricing 2026](https://talkspresso.com/blog/beacons-vs-linktree-2026)
- [First Page Sage — freemium conversion 2026](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/)
- [Airwallex — Malaysia accounting software pricing](https://www.airwallex.com/my/blog/best-accounting-software-malaysia)
