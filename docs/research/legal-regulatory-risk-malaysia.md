# Potraces — Legal & Regulatory Risk Register (Malaysia)

> **Not legal advice.** This is engineering-led research to map where Potraces touches
> regulated surface, so you can brief a real Malaysian lawyer / PDPA consultant with the
> right questions. Laws below changed a lot in 2024–2026 (PDPA amendments, Consumer Credit
> Act, e-commerce regs, SST expansion). Current as of **June 2026**. Before launch/monetise,
> get a written opinion from counsel + a PDPA compliance review. Sources at the bottom.

## How to read this
- **Severity** = how bad if it goes wrong (Critical = shut-down / criminal / large fine; High = fine + forced change; Medium = fix-and-warn; Low = housekeeping).
- **Likelihood** = chance it actually bites given how Potraces works today.
- Each item ties the law to a **specific Potraces feature/code** so it's actionable, not abstract.

---

## TL;DR — the six that matter most

| # | Risk | Severity | Likelihood | Why it's top |
|---|------|----------|-----------|--------------|
| 1 | **Cross-border data transfer** (Supabase, **Anthropic**, Gemini, Telegram, Stripe, Expo, Vercel all outside MY) without a Transfer Impact Assessment | Critical | High | New PDPA rule, financial data, multiple US/foreign processors. Easiest thing a regulator or complainant checks first. |
| 2 | **Third-party contact data** (you import & cloud-sync other people's names + phone numbers who never consented) | High | High | The "household exemption" does **not** cover Potraces (you're commercial). Any one of those contacts can complain. |
| 3 | **No mandatory PDPA scaffolding** (bilingual notice + consent, breach process, DPO, deletion/portability) | High | High | All became mandatory June 2025. Missing any is a standalone offence; max fine now **RM1,000,000** + 3 yrs jail. |
| 4 | **Security principle / the data-loss pattern itself** | High | Medium | PDPA requires "practical steps to protect data." A data-loss incident is exactly what triggers breach notification + liability. |
| 5 | **Payments creep** (DuitNow QR pipeline, "wallet" naming, Tap-to-Pay) drifting into **BNM-regulated e-money / payment-system** territory | Critical | Low-now / High-if-you-hold-funds | Operating a payment system or issuing e-money without BNM approval is a serious FSA offence. Safe today *only* because you never touch the money. |
| 6 | **Monetisation triggers** (SST on premium) + **e-commerce disclosure** (order-link storefront) + **investment-advice line** (savings tracker / AI chat) | Medium-High | Medium | Each is a concrete obligation the moment you charge money, sell, or "advise." |

---

# A. PDPA — Personal Data Protection Act 2010 (as amended 2024)

This is your biggest cluster. The **Personal Data Protection (Amendment) Act 2024** rolled out in phases (Jan/Apr/Jun 2025): renamed "data user" → **data controller**, put direct duties on **data processors** too, and added breach notification, mandatory DPO, data portability, and a new cross-border regime. **Max fine for breaching a Data Protection Principle rose from RM300k → RM1,000,000; jail 2 → 3 years.** Potraces is a **commercial** app processing personal + financial data of Malaysian users → squarely a data controller.

### A1. Cross-border transfer — **Critical / High**
- **What triggers it:** Personal data leaving Malaysia. Potraces ships data to: **Supabase** (DB/auth/storage — region likely outside MY), **Anthropic** (US — `aiService.ts` → `api.anthropic.com`, claude-haiku/sonnet) **and Google Gemini** (US — `aiService.ts`, `intentEngine.ts`, `manglishParser.ts`); both LLMs receive free-text notes, **receipt OCR text**, WhatsApp orders, product lists & **financial summaries** (MoneyChat) — this fires even with Cloud Sync OFF, **Telegram** (OTP verification), **Expo/EAS** push (`pushNotifications.ts`), **Vercel** (`jejakbaki.my` order page), **Stripe** (Tap to Pay). Each is a transfer.
- **2025 rule:** The old "whitelist" is gone. You may transfer only if the destination has "substantially similar" law **or** "adequate protection," **or** you put safeguards (SCCs/BCRs) in place — and you must run a **Transfer Impact Assessment (TIA)** (valid ≤3 yrs) and keep **records of every transfer** (s.129). CBPDT Guidelines effective 29 Apr 2025.
- **Used against you:** A complainant or the Commissioner asks "where does my financial data go and what's your legal basis?" With no TIA / no SCCs, that's a finding.
- **Action:** (a) Inventory every processor + region; (b) sign each provider's DPA/SCCs (Supabase, **Anthropic**, Google, Stripe all publish them) and **enable Anthropic + Google zero-retention / no-training terms**; (c) write one TIA per destination; (d) name the transfers + purposes in the privacy notice; (e) prefer MY/SG Supabase region if available; (f) minimise what **the LLMs (Anthropic + Gemini)** see — note: free-prose notes have no reliable name tokens to strip (`preFilter`/`parseStructuredLines` don't extract names from prose), so masking is brittle; lean on the DPA + zero-retention + AI opt-in posture, and scrub receipt **PAN/card numbers at OCR output before the LLM call**.

### A2. Third-party contact data — **High / High**
- **What triggers it:** You import phone contacts (`expo-contacts`, `ContactPicker`) and store **other people's names + phone numbers** for debts/splits, then **sync them to `personal_contacts` / debt rows in Supabase**. Those contacts are data subjects who never consented and were never given notice.
- **Why the "household exemption" doesn't save you:** PDPA's personal/family/household exemption applies to the *individual* using data for private life — **not** to a commercial app that is itself the data controller of that data once it's in your cloud. Guidance is explicit that commercial apps don't get the exemption just because the end-user is "personal."
- **Used against you:** Any contact ("why does Potraces have my number?") files a complaint; you can't show consent or notice for them.
- **Action (pick the strongest you can ship):** (1) **Keep contact PII on-device only** — don't sync names/phones to the server; sync a hashed/opaque key instead. This is the cleanest fix and aligns with your local-first direction. (2) If you must sync, store the minimum (display name only, no phone), add a clear in-app notice that the *user* confirms they have a basis to add that person, and make third-party contact deletion easy. (3) Never use those numbers for marketing/invites.

### A3. Consent & bilingual privacy notice — **High / High**
- **Trigger:** PDPA requires explicit consent + a written notice **in English and Bahasa Malaysia** stating what you collect, why, who you share with (the A1 processors!), retention, security, and contact point.
- **Status in app:** You link to `jejakbaki.my/privacy.html` from Settings — good start, but it must (a) exist in **BM too**, (b) list the actual processors/cross-border transfers, (c) be surfaced at **first run / sign-up** with an affirmative consent, not buried.
- **Action:** Publish EN+BM privacy notice; add a first-run consent gate for cloud features (the personal **Cloud Sync** opt-in toggle is a good consent point — make sure the linked notice is accurate before sync ships widely).

### A4. Data breach notification — **High / Medium**
- **Trigger (June 2025):** On a personal-data breach you must notify the **Commissioner within 72 hours**; notify **affected individuals within 7 days** if significant harm is likely.
- **Why it's live for you:** You *just* had a real data-loss incident in dev. A production version of that (e.g., the lossy-sync field-stripping, or a Supabase RLS hole) is a notifiable breach. RLS gaps in your own audit (`personal-sync-critical-bugs`, seller order_link policies) are the kind of thing that becomes a breach.
- **Action:** Write a one-page incident-response runbook (who decides, 72h clock, template notice, Commissioner contact). Treat the local-backup + lossless-sync work you just did as part of the "practical steps" defence.

### A5. Data Protection Officer (DPO) — **Medium / Medium (rises with scale)**
- **Trigger (June 2025):** Appoint at least one DPO and notify the Commissioner if you cross the guideline thresholds — broadly: personal data of **>20,000** data subjects, **or** sensitive/financial data of **>10,000** data subjects, **or** regular & systematic monitoring. Potraces processes financial data → the ~10,000-user mark likely trips this. *(Verify exact threshold wording with counsel.)*
- **Action:** Below threshold now; set a trigger to appoint + register a DPO before you scale past ~10k active users.

### A6. Data-subject rights: access / correction / **deletion** / **portability** — **Medium / Medium**
- **Trigger:** Users can demand a copy, correction, deletion, and (new, June 2025) **direct portability** to another controller where technically feasible.
- **Status:** You have `deleteAccount` (good, also a store requirement). You need: a data **export** (you have `exportData`/CSV — make sure it's complete), and a documented way to honour access/deletion requests against Supabase + backups.
- **Action:** Ensure account deletion actually purges Supabase rows (`disablePersonalSync(wipeRemote=true)` exists — verify it covers every table) **and** local `bak:*` backups; document SLA.

### A7. Security principle — **High / Medium**
- **Trigger:** PDPA Principle: take "practical steps" to protect data from loss/misuse/unauthorised access. Includes the RLS criticals in your own audit and the sync data-loss class.
- **Action:** Close the open RLS/critical-sync findings before promoting multi-device; keep the preflight gate + lossless round-trip + local backups (already done) as evidence of diligence.

### A8. Direct marketing — **Low-Medium / Medium**
- **Trigger:** "Invite Friends"/referrals (`Share`) and push notifications. PDPA gives data subjects a right to stop direct marketing; sending unsolicited promo messages can also touch CMA/MCMC anti-spam expectations.
- **Action:** Keep invites user-initiated (you do — `Share.share`), no auto-messaging contacts, provide notification opt-out (you have notification settings).

### A9. Retention & minimisation — **Medium / Low**
- **Trigger:** Don't keep data longer than needed; the new `bak:*` local backups and Supabase rows are retained copies.
- **Action:** Your backup keep-window is 5 days (good, bounded). Document a server retention policy; purge on account deletion.

---

# B. Payments & money — BNM / Financial Services Act 2013

You are **safe today only because Potraces never holds or moves customer funds** — it *tracks* money. The risk is feature-creep across that line.

### B1. "Wallet" naming & stored value — **Critical if crossed / Low now**
- **Line:** Issuing **e-money** (stored value users top up) needs a BNM **EMI licence** (min capital RM1M+). Your "wallets" are **ledgers/trackers** with no stored value → not e-money. Keep it that way.
- **Action:** Don't let any feature hold a user balance you're liable to pay back. In user-facing copy and store listings, be clear it's a **money tracker**, not an e-wallet, to avoid drawing BNM scrutiny by name alone.

### B2. DuitNow QR / payment facilitation — **Critical if crossed / Low now**
- **Status:** Phase-1 QR shows an **exact-amount QR generated from the seller's own static DuitNow standee** — funds flow buyer's bank → seller's bank directly; Potraces is never in the money path. That's the safe design.
- **Line:** The dormant "soundbox-push / PSP" pipeline (`qrProvider.ts`, webhook) — the moment Potraces aggregates merchants, routes funds, or confirms payments as an intermediary, you're operating a **payment system** (FSA s.11, BNM approval) and likely **merchant-acquiring / PayNet** rules.
- **Action:** Keep funds out of Potraces. When you wire a PSP, use a **BNM-licensed** PSP and let *them* be the regulated party; get it in writing that you're a technical referrer, not an acquirer.

### B3. Card acceptance / Tap to Pay / PCI-DSS — **High / Low (handled by Stripe)**
- **Status:** Card flow via **Stripe Terminal** (licensed; PCI-compliant). 
- **Line:** Don't store/log PAN or full card data anywhere (app, Supabase, receipts). Receipt OCR could accidentally capture card numbers.
- **Action:** Confirm Stripe handles all card data; complete the relevant PCI **SAQ**; scrub card-number patterns from any stored receipt text/images.

### B4. AML/CFT (AMLA 2001) — **Low now**
- Only bites if you facilitate payments/transfers. As a tracker, out of scope. Re-check if B2 changes.

---

# C. Consumer Credit Act 2025 / BNPL — Consumer Credit Commission (SKK)

- **New law:** Gazetted 31 Dec 2025, in force **1 Mar 2026**; licensing for credit providers from **1 Jun 2026** (6-month compliance window). **BNPL schemes need a licence; debt collection and "debt counselling & management" need registration.**
- **Your exposure:** Potraces **does not provide credit** — it tracks user-entered debts/splits and "shared subscriptions." A passive tracker is **not** a BNPL provider. But two lines matter:
  1. The `manglishParser` has **"BNPL" intent routing** and you've blueprinted BNPL-flavoured features — *building* a BNPL scheme (you extend credit / installments as a service) would need a licence.
  2. If you ever offer **debt collection** for users or position a feature as **"debt counselling/management as a service"**, that needs registration.
- **Action:** Keep it a **personal record-keeping tool**; avoid copy that implies you provide credit, collect debts, or give debt-management services. "Track what you owe" = fine; "We'll manage/settle your debts" = regulated.

---

# D. Securities / financial advice — SC (CMSA 2007) & BNM (FSA financial adviser)

- **Line:** Giving **investment advice** or running **digital investment management / robo-advisory** is a regulated activity needing a **CMSL/DIM** licence. **Financial advice** (insurance/planning) needs an FSA financial-adviser approval.
- **Your exposure:** The **Savings & Investments tracker** stores `annualRate` and projects values; **MoneyChat / AI** answers money questions. **Tracking and education = fine.** The risk is the AI or a feature **recommending specific products, returns, or "you should invest in X."**
- **Action:** Add a persistent **"general information, not financial/investment advice"** disclaimer to MoneyChat and the savings/investment screens; constrain AI prompts to avoid product/return recommendations; don't display projected returns as promises.

---

# E. E-commerce / consumer protection — CPETTR 2024 (Ministry of Domestic Trade)

- **New regs:** Consumer Protection (Electronic Trade Transactions) Regulations **2024** (in force 25 Dec 2024) replace the 2012 version. Online **sellers** and **marketplace operators** must disclose **seller identity + contact details**, **full price (all costs)**, a **complaint channel**, truthful info — and **important information must be in Bahasa Malaysia** (Reg 4). Marketplace operators (Reg 7) must police that their sellers comply.
- **Your exposure:** The seller **order-link storefront** (`docs/index.html` on `jejakbaki.my`) is an online sales channel. Potraces likely sits as the **marketplace/platform operator**, and your sellers are "suppliers." Today the page may not show seller contact details, a complaint channel, or BM-language mandatory info.
- **Action:** On the order page, surface: seller business name + contact (phone/email/address), full price incl. any fees, an order/complaint contact, and ensure key info renders in **BM**. Add platform T&Cs putting disclosure duties on the seller.

---

# F. Tax — SST on digital services (RMCD)

- **Rule:** Service tax on **digital services is 8%**. Registration threshold generally **RM500,000** of taxable services (foreign providers RM500k; some categories RM1M). 
- **Your exposure:** **Premium subscriptions** = a taxable digital service to Malaysian customers. Once you cross the threshold you must **register for SST and charge/remit 8%**. Who remits depends on the channel: **Apple/Google may act as marketplace facilitator** for in-app purchases (they often handle SST) — but **direct sales (e.g., via Stripe) are on you**.
- **Action:** Decide billing channel; confirm in writing whether Apple/Google remit MY SST for your IAPs; if selling direct, register + charge SST past threshold; keep tax invoices.

---

# G. Intellectual property / trademark

- **Exposure:** Bank presets (Maybank, CIMB, Public Bank, RHB…) and e-wallet presets (TNG, GrabPay, ShopeePay, Boost, MAE, BigPay) — using their **names** is generally OK (nominative/descriptive use), but using their **official logos/marks** without permission risks trademark infringement / passing off, and some brands prohibit logo use.
- **Action:** Prefer neutral generic icons + plain text names; if you use official logos, check each brand's trademark/brand guidelines or get permission. Same for any DuitNow/PayNet marks (PayNet has brand rules).

---

# H. Platform & miscellaneous

- **App Store / Play data declarations — Medium:** Apple Privacy Nutrition Labels + Google Play **Data safety** form must accurately list what you collect/share (incl. financial data, contacts, cross-border). Misdeclaration = takedown risk. Play also **mandates in-app account deletion** (you have `deleteAccount` — keep it working and reachable).
- **Children's data — Low-Medium:** If under-18s use it, PDPA/▢ parental-consent expectations apply. Add a minimum-age term; don't target minors.
- **Communications & Multimedia Act / MCMC — Low:** Marketing messages/spam. Covered by keeping invites user-initiated (A8).
- **Tax-agent line — Low:** Organising receipts by `myTaxCategory` is fine; *advising* on tax filing for a fee edges toward tax-agent approval (Income Tax Act s.153). Keep it organisational + disclaimed.
- **Income Tax for sellers — informational:** Your "came in/went out" framing is deliberately not "profit/loss"; just ensure exports are usable for the seller's own filing without you claiming to compute tax owed.

---

# Cross-cutting: "who could use this against Potraces, and how"

- **A disgruntled user** → PDPA complaint (no notice/consent, can't delete data, breach). Cheapest, most likely.
- **A contact who never signed up** → PDPA complaint over A2 (their number in your cloud).
- **The PDP Commissioner** (proactive, post-2024 they're more active) → audit of cross-border + DPO + breach process.
- **BNM** → if a feature *looks* like e-money/payments (naming, QR pipeline).
- **A competitor / journalist** → points at the dev data-loss story or an RLS hole → reputational + breach-notification cascade.
- **A security researcher** → finds an RLS gap (you have known ones) → responsible-disclosure or public → breach.
- **RMCD/LHDN** → SST non-registration once you monetise.
- **Apple/Google** → store rejection/takedown over inaccurate data-safety labels.

---

# Prioritised action checklist

**Do now (pre-launch, low effort, high protection):**
1. EN **+ BM** privacy notice that names every processor + cross-border transfer; surface at first run.
2. Decide A2: keep contact names/phones **on-device only** (don't cloud-sync third-party PII) — strongest, cheapest fix.
3. Add "**not financial/investment advice**" disclaimers to MoneyChat + savings/investment screens.
4. Order-page (CPETTR): seller contact details + full price + complaint channel + BM mandatory info.
5. Write the 72-hour breach-response runbook.

**Before scaling (≈ before broad multi-device / >10k users):**
6. Sign DPAs/SCCs with Supabase, **Anthropic**, Google (Gemini), Stripe, Expo; enable LLM zero-retention/no-training terms; write a TIA per destination; keep a transfer register.
7. Appoint + register a DPO at the threshold.
8. Verify account deletion purges Supabase **and** local backups; document data-subject-request handling.
9. Close the known RLS / critical-sync findings (security principle).

**Before monetising:**
10. SST: confirm Apple/Google remittance vs direct; register/charge at threshold.

**Before any payments feature goes live:**
11. Use a **BNM-licensed PSP**; never hold funds; get written confirmation you're a technical referrer, not a regulated acquirer/EMI.

**Housekeeping:**
12. Replace any official bank/e-wallet logos with neutral icons or get permission.
13. Make store data-safety declarations match reality.

---

## Sources
- PDPA Amendment 2024 / breach / DPO / portability / penalties: [pdp.gov.my](https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-amendment-act-2024/), [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2025/07/from-legislative-reform-to-practical-guidance-key-amendments-to-malaysias-pdpa-and-the-launch-of-cross-border-transfer-guidelines), [DLA Piper – Privacy Matters](https://privacymatters.dlapiper.com/2025/03/malaysia-guidelines-issued-on-data-breach-notification-and-data-protection-officer-appointment/), [ASEAN Briefing](https://www.aseanbriefing.com/news/malaysia-tightens-data-protection-from-june-2025/), [Tay & Partners](https://taypartners.com.my/countdown-to-compliance-personal-data-protection-amendment-act-2024-in-force-starting-1-january-2025/)
- Cross-border transfer guidelines (TIA, adequacy, SCCs): [PDP CBPDT Guideline PDF 3/2025](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2025/08/GP_CBPDT_EN-1.pdf), [Hogan Lovells](https://www.hoganlovells.com/en/publications/malaysias-groundbreaking-cross-border-data-transfer-guidelines-explained), [Rahmat Lim](https://www.rahmatlim.com/publication/articles/30646/new-guidelines-on-cross-border-personal-data-transfer)
- Household exemption / app collecting contacts: [PDP Application & Non-Application](https://www.pdp.gov.my/ppdpv1/en/akta/application-and-non-application-of-the-act/), [PDPA Act 709 PDF](https://mohre.um.edu.my/img/files/Personal%20Data%20Protection%20(PDPA)%20Act%202010.pdf)
- Consumer Credit Act 2025 / BNPL: [Richard Wee Chambers](https://www.richardweechambers.com/consumer-credit-act-2025/), [The Edge](https://theedgemalaysia.com/node/794624), [RinggitPlus](https://ringgitplus.com/en/blog/the-experts-corner/malaysias-new-consumer-credit-act-explained.html)
- BNM e-money / payment system licensing: [BNM – Application for Approval](https://www.bnm.gov.my/application-for-approval-and-registration), [PKF Malaysia – BNM tech requirements](https://www.pkfmalaysia.com/insights/2026-editions/bank-negara-malaysias-new-tech-requirements/)
- Securities / robo-advisory / investment advice: [SC – Licensing](https://www.sc.com.my/regulation/licensing), [Zurina Law – Robo-Advisory framework](https://www.zurinalaw.com/capital-market/understanding-the-robo-advisory-licensing-framework-in-malaysia-and-addressing-key-challenges/)
- CPETTR 2024 (e-commerce disclosure + BM language): [Skrine](https://www.skrine.com/insights/alerts/june-2025/updated-regulations-for-e-commerce-platforms), [One Asia Lawyers](https://oneasia.legal/en/6479), [Donovan & Ho](https://dnh.com.my/legal-updates-on-e-commerce-in-malaysia/)
- SST on digital services: [InCorp – New SST 2025](https://malaysia.incorp.asia/guides/malaysia-new-sst-2025-guide/), [PwC – Service tax](https://www.pwc.com/my/en/publications/mtb/service-tax.html), [Anrok – Malaysia SST](https://www.anrok.com/vat-software-digital-services/malaysia)
