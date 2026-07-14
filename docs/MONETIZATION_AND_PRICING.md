# Potraces — Monetization & Pricing Plan

**Status: PLANNING (2026-07-12). Nothing here is built or gated yet.** This is the
agreed pricing model + rationale, captured so we can pressure-test it and revisit.
No billing is wired — today the in-app "Subscribe" button grants premium for free.

---

## 1. Philosophy

Dual goal: **genuinely help users AND make money.** The two must not fight.

- **Gate the ceiling, never the floor.** Core tracking (add/edit transactions, view
  balances, calculator, a reasonable number of wallets/budgets) and **basic business
  mode** are always free. Gating them would break trust and kill adoption.
- **Free is a growth engine, not a giveaway.** Free business mode + a free public
  storefront (carrying a permanent "Made with Potraces" badge) pull users in and
  market the app for us.
- **Gate what has real cost or real power:** AI (tokens), server-side statement
  parsing/OCR (compute), and power/business features people happily pay for.

---

## 2. The Tiers

Four levels. Prices in RM/month. **Business mode (basic) is FREE at every level.**

| | **Free** | **Basic** RM7.99 | **Pro** RM15 ⭐ | **Premium** RM25 |
|---|---|---|---|---|
| Statement imports / mo | 5 | 20 | 100 | ∞ |
| Echo AI calls / mo | 100 | 500 | 2,000 | ∞ |
| Receipt scans / mo | 15 | 100 | 500 | ∞ |
| Wallets / budgets | 6 / 5 | 15 / 15 | 50 / 50 | ∞ |
| Advanced **personal** insights | — | ✓ | ✓ | ✓ |
| Business mode (basic) | ✓ | ✓ | ✓ | ✓ |
| **AI business insights** | — | — | ✓ | ✓ |
| Free storefront + custom domain + DuitNow QR | ✓ | ✓ | ✓ | ✓ |
| **Store templates + custom colours/logo** | — | — | ✓ | ✓ |
| Storefront analytics (views/clicks) | — | — | — | ✓ |
| **Tap-to-Pay** (accept cards) | — | — | — | ✓ |
| Priority AI + early access | — | — | — | ✓ |

> Limit numbers are **illustrative — to be finalised.** The *shape* (free < Basic <
> Pro < unlimited at Premium) is the decision.

**Tier positioning:**
- **Basic (RM7.99)** — the "remove my everyday limits" tier for a pure **personal**
  power user. Deliberately withholds the marquee business features.
- **Pro (RM15)** — the **hero** tier for anyone serious about a side-hustle. Adds AI
  business insights + storefront customisation + big limits.
- **Premium (RM25)** — everything unlimited + the expensive/pro extras (Tap-to-Pay,
  analytics, priority). Aspirational; for heavy sellers.

---

## 3. Pricing Psychology (deliberate)

Goal: make **Pro the obviously-right choice.**

- **Basic → Pro = a big, easy jump.** Basic locks the two things a growing user
  actually wants (AI business insights + store customisation) and gives modest limits.
  Pro unlocks both + ~5× the limits for only **+RM7**. Price gap ~2×, value gap ~5×
  → upgrading feels like a steal.
- **Pro → Premium = deliberate hesitation.** Premium only adds *unlimited* (Pro's caps
  are already generous — most never hit them), analytics, Tap-to-Pay (niche), and
  priority. For **+RM10 (+67%)** the average user thinks "do I really need all that?"
  and stays on Pro. That pause is the point: Premium **anchors** Pro as the smart buy
  and still **captures heavy sellers** who genuinely need it.

**UI tactics to make it fire:**
- "Most Popular" ribbon on **Pro**, shown centre, Premium to its right (anchor effect).
- At Basic's paywalls (hitting a business-insight or store-customise wall), the CTA
  says **"Unlock with Pro"** — never "Basic" — so marquee features pull toward Pro.
- Add **annual pricing** (e.g. 2 months free) once live, to lift lifetime value.

---

## 4. Storefront Model ("built-in website")

Each seller gets a public shop page (products, prices, DuitNow QR) auto-generated from
the business data they already track — e.g. `potraces.com/shop/their-name`.

- **Free for all**, including **custom domain**. (A seller on their own domain still
  carries our badge → *more* reach.)
- **"Made with Potraces" badge is permanent — nobody can remove it, any tier.** This is
  the growth lock: every store markets the app. (Trade-off accepted: a few RM25 sellers
  may wish it gone, but permanent branding = permanent free marketing.)
- **RM15 (Pro):** templates + custom colours/logo.
- **RM25 (Premium):** storefront analytics (views/clicks).

Closest real-world model: **Linktree / Beacons / Carrd** (free micro-site → pay to
customise), *not* Shopify (which is paid from day one). Note: we give custom domain
**free** — Beacons charges ~RM45/mo for it and Linktree never offers it. That's an edge.

---

## 5. What's ready vs. to-build

Gate only what works. Unfinished features are "coming soon" upside of the higher tiers.

**READY today** (can be gated as soon as billing is wired):
- All limit-based gating (imports, AI/Echo, receipt scans, wallets, budgets)
- Basic business mode, advanced personal reports/insights
- DuitNow QR generation, receipt scanning, statement/CSV import (metered server-side)

**TO-BUILD** (sit in Pro/Premium as "coming soon" until shipped):
- **Seller storefront** (the one genuinely new feature — but reuses products + QR)
- **AI business insights** (build on the existing Echo/AI engine)
- Storefront analytics; Tap-to-Pay (needs Apple entitlement approval — weeks);
  Google Docs / accountant export

---

## 6. Critical dependencies (build order)

1. **Wire RevenueCat billing.** `react-native-purchases` is already a dependency but
   never initialised; `subscribe()` just flips a local flag for free. Until this is
   done, **no tier charges anyone.** This is the #1 blocker to earning a cent.
   (Configure SDK → products in App Store Connect + Play Console + RevenueCat →
   replace the stub with `purchasePackage()` → set tier from entitlement → restore
   purchases → ideally verify entitlement server-side so tier can't be flipped locally.)
2. **Ship Basic + Pro on ready features** (limits + insights + business). These need no
   new features — just the billing layer + turning the gates on.
3. **Build the seller storefront** — the headline Pro/Premium feature.
4. **Build AI business insights.**
5. Later: Tap-to-Pay, storefront analytics, Google Docs export → fill out Premium.

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
  RM35/mo, Financio from RM40/mo** for accounting. Our RM15 business tier is ~half that
  and sellers have real willingness-to-pay → **the RM15 business tier may even be
  underpriced** (could support RM19). Low launch price is fine for adoption; raise later.
- **Storefront:** Beacons charges ~RM45/mo for a custom domain; Linktree never offers
  one. We give it free → a genuine hook.

---

## 8. Conversion & revenue reality

**Most people will not pay — that is normal, and the model still works.**

- Mobile freemium converts ~**2%**; **fintech ~4%** (above average — good for us).
  "Good" is 3–5%, "great" is 8–12%.
- Plan for **~2–4% of active users paying.** Illustrative: 10,000 free users × 3% ×
  ~RM12 avg ≈ **~RM3,600/mo**, scaling linearly with users.
- **The lever is not price — it's (a) how many free users we get and (b) how badly they
  need the gated feature.** Hence: free business mode + viral storefront for (a);
  genuinely great RM15 business insights + storefront for (b).
- Metered walls (imports, AI, scans) are the **highest-converting** upsells — the person
  hitting them already got value and has a concrete reason to pay.

---

## 9. Open decisions (still to settle)

- Final limit numbers per tier (section 2 numbers are placeholders).
- Whether the business/Pro tier launches at RM15 or RM19 (SME WTP suggests room).
- Annual pricing discount (e.g. 2 months free?).
- Exact scope of "AI business insights" (what does it actually tell a seller?).
- Storefront MVP scope (what's in the free v1 vs the paid customisation).

---

## Sources

- [WalletGrower — YNAB / Monarch / Copilot pricing](https://walletgrower.com/compare/ynab-vs-monarch-vs-copilot)
- [SmartCalc MY — budgeting apps Malaysia](https://www.smrtcalc.com/guides/best-budgeting-apps-malaysia)
- [RinggitPlus — Malaysian finance apps](https://ringgitplus.com/en/blog/budgeting-saving/keep-your-finances-in-check-with-these-five-financial-management-apps.html)
- [Talkspresso — Beacons vs Linktree pricing 2026](https://talkspresso.com/blog/beacons-vs-linktree-2026)
- [First Page Sage — freemium conversion 2026](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/)
- [Airwallex — Malaysia accounting software pricing](https://www.airwallex.com/my/blog/best-accounting-software-malaysia)
