# Potraces — Data-Breach Response Runbook (PDPA 2024)

> **Not legal advice.** Engineering-led operating procedure so a solo founder can act
> fast and correctly during a personal-data breach. Aligned to the Personal Data
> Protection (Amendment) Act 2024 + the PDP Data Breach Notification Guideline (in
> force June 2025). Two statutory clocks govern everything below:
> **(1) Notify the Commissioner ≤ 72 hours of becoming aware of a breach.**
> **(2) Notify affected individuals ≤ 7 days if the breach is likely to cause significant harm.**
> Keep this file current. Print/PDF it — assume you may be acting with the app down.
> Companion docs: `docs/research/legal-regulatory-risk-malaysia.md` (risk map),
> `docs/privacy.html` (the notice you must keep accurate).

---

## 0. One-screen summary (read this first under pressure)

1. **CONTAIN** — stop the bleeding (rotate keys, disable sync, pull the bad deploy).
2. **START THE CLOCK** — note the exact UTC+8 timestamp you became *aware*. The 72h clock runs from here.
3. **ASSESS** — is it personal data? Whose? How much? Significant harm likely? (§3 decision tree.)
4. **DECIDE** — Notifiable to Commissioner? (almost always yes if real personal data exposed). Notifiable to individuals? (only if significant harm likely).
5. **NOTIFY** — Commissioner ≤72h (even if facts incomplete — send an interim and update). Individuals ≤7d if harmful.
6. **RECORD** — log every step in the incident record (§6). This *is* your PDPA "practical steps" defence.
7. **REMEDIATE + REVIEW** — fix root cause, do a post-incident review, update this runbook.

Commissioner contact: **Jabatan Perlindungan Data Peribadi (JPDP / PDP)** — `aduan@pdp.gov.my` / `pdp.gov.my` (use the official breach-notification channel/form current at the time; confirm the live address before sending). Keep the submission receipt.

---

## 1. Detection triggers — "is this a breach?"

A personal-data breach = loss of, unauthorised/accidental access to, disclosure, alteration, or destruction of personal data. For Potraces the realistic triggers, mapped to actual code/architecture:

| Trigger | Where it shows up | Personal data at risk |
|---|---|---|
| **RLS gap / wrong policy** | Supabase row-level security misconfig (known open findings in `personal-sync-critical-bugs`; seller `order_link` order policies) lets one user read another's rows | Financial records, debts, contacts |
| **Sync field-stripping / data loss** | `personalSync.ts` schema preflight fails, `upsertBatch` PGRST204 / missing-column error, lossy mapper round-trip — auto-disables sync but may have already written/dropped data | Transactions, wallets, debts (integrity breach = "alteration/destruction") |
| **Account-mismatch leak** | `_accountMismatch` guard in `syncPersonal` — a different account signing in on a device with local data could pull/push the wrong user's money if the guard is bypassed | Cross-user financial data |
| **Third-party contact exposure** | `personal_contacts` holds non-users' names + phones imported via `ContactPicker` (`expo-contacts`); a leak exposes people who never signed up | Contact name + phone (PII of non-users) |
| **Lost/stolen device** | Local AsyncStorage stores full financial data + `bak:*` rolling backups unencrypted at rest | Everything for that one user |
| **Processor breach (cross-border)** | A breach at **Supabase / Anthropic / Google (Gemini) / Telegram / Stripe / Expo / Vercel** — they are processors; their breach is *your* notifiable breach to MY regulator | Depends on processor (see §3) |
| **Leaked secret** | Supabase service-role key / API key in a commit, log, or build artifact; exposed `.env` | Potentially all server data |
| **AI free-text leak** | `aiService.ts` (→ Anthropic `api.anthropic.com`) and `intentEngine.ts` / `manglishParser.ts` (→ Gemini) send note/receipt-OCR/order text + financial summaries to US LLMs; a logging/prompt leak exposes free-text that may contain names/amounts/card numbers | Financial free-text, possibly names |
| **Receipt/PII in storage bucket** | Receipt images in Supabase storage exposed via public URL / bad bucket policy | Receipt images (may show PAN, names) |

**Rule of thumb:** if real user/contact data was *accessible to someone who shouldn't have it*, or was *altered/destroyed* in a way that harms the user, treat it as a breach and run this runbook. When unsure → run the runbook anyway; an over-cautious assessment is cheap, a missed 72h notification is not.

**Not a breach (log, don't notify):** a near-miss caught before any data moved (e.g., preflight disabled sync *before* a lossy write); a bug affecting only dev/seed data; your own authorised debugging access.

---

## 2. CONTAIN — first 60 minutes (do before assessing fully)

Containment does **not** stop the clock — start the clock first (§3), then contain in parallel.

- [ ] **Note exact awareness timestamp** (date, time, UTC+8). Write it in the incident record now.
- [ ] **Stop the mechanism:**
  - RLS / data exposure → fix or tighten the Supabase policy; if unsure, revoke the offending policy / take the table read-only.
  - Sync bug → personal sync is **gated and OFF by default** today; confirm `personalSyncEnabled` is false; if a build shipped it on, push an OTA/config to force-disable (`disablePersonalSync(false)`), and pull the bad deploy.
  - Leaked key → **rotate immediately** (Supabase service-role + anon keys, any provider API keys); invalidate sessions.
  - Bad app build → halt rollout (EAS/store), roll back OTA update if the bug is client-side.
  - Storage bucket → make private, regenerate signed URLs.
- [ ] **Preserve evidence before cleaning up:** screenshot logs, export Supabase logs, save the offending commit hash/diff, keep the error payloads. Don't destroy the trail while fixing.
- [ ] **Snapshot scope:** which tables, which `user_id`s, how many rows, date range. (`select count(*)`, affected-user list — save the query + result.)
- [ ] If a **processor** notified you → save their notice; it starts *your* clock from when *you* became aware.

---

## 3. ASSESS — severity & the two clocks (decision tree)

### Step A — Is it personal data of identifiable individuals?
- No (anonymous/dev/aggregate only) → **log as near-miss, stop.**
- Yes → continue.

### Step B — Notify the Commissioner? (the 72h clock)
Under the Amendment Act, a controller that has reason to believe a breach occurred **must notify the Commissioner** (the Guideline frames mandatory notification around breaches that cause or are likely to cause harm; for financial data assume notifiable).

```
Did personal data become accessible to an unauthorised party,
or get altered/destroyed in a way affecting individuals?
        │
        ├── NO  → not notifiable; log near-miss, monitor.
        │
        └── YES → Is it personal data (esp. FINANCIAL data)?
                    │
                    └── YES → NOTIFY COMMISSIONER ≤ 72h.
                              (Financial data = treat as notifiable by default.)
                              If facts incomplete at 72h → send an INTERIM
                              notice now, supplement later. Do NOT wait past 72h
                              to "get it perfect."
```

### Step C — Notify affected individuals? (the 7-day clock)
Notify individuals **≤ 7 days** *if the breach is likely to cause significant harm*.

**Significant harm likely → notify individuals** when the exposure includes any of:
- Financial detail tied to a person (transactions, balances, debts, wallet data).
- Contact PII of non-users (name + phone in `personal_contacts`).
- Data usable for fraud, identity theft, blackmail, or physical safety risk.
- Large volume, or sensitive combinations (name + phone + financial behaviour).

**Significant harm unlikely → notify Commissioner only** when:
- Data was strongly encrypted/keyed and the key was not exposed.
- Exposure was momentary, contained, and verifiably not accessed (prove it from logs).
- Only your own pseudonymous identifiers leaked (no PII, no financial detail).

### Severity bands (drives effort + who you call)
| Band | Examples | Commissioner | Individuals | Extra |
|---|---|---|---|---|
| **Critical** | Cross-user financial data exposed; service-role key leaked; bulk contact PII out | ≤72h (interim immediately) | ≤7d | Engage lawyer/PDPA consultant day 1; consider police report if criminal |
| **High** | RLS gap read a handful of other users' rows; one processor confirms breach affecting MY users | ≤72h | ≤7d (those users) | Lawyer review of notices |
| **Medium** | Sync alteration/loss of one user's own data (integrity), no third-party access | ≤72h (assess) | Only if harmful to that user | Restore from `bak:*` / backups |
| **Low / near-miss** | Caught pre-write by preflight; dev-only data | Log only | No | Add a regression test |

> The two clocks run **in parallel from the same awareness time**, not sequentially. 72h is the *outer* limit for the Commissioner — notify sooner if you can.

---

## 4. WHO DOES WHAT (solo-founder reality)

There is one person. The point of naming roles is to make sure no step is forgotten, not to pretend there's a team.

| Role | Default holder | Responsibility during an incident |
|---|---|---|
| **Incident Lead** | Founder | Owns the clock, makes the notify/no-notify call, signs notifications. |
| **Technical Responder** | Founder (or contract dev) | Containment, root cause, evidence capture, fix + restore. |
| **DPO / Privacy contact** | Founder until DPO appointed (registration triggers ≈ >10k financial-data subjects — see risk register A5) | Drafts Commissioner + user notices; keeps the incident record. |
| **Legal** | External Malaysian lawyer / PDPA consultant **on retainer or speed-dial** | Reviews Critical/High notices before sending; advises on disputed assessments. |
| **Comms** | Founder | In-app banner + email/push to affected users; holding statement if public. |

**Pre-incident prep (do now, while calm):**
- [ ] Save the lawyer/PDPA-consultant contact in this file (or a sealed note) — name, phone, email.
- [ ] Bookmark the live PDP breach-notification channel/form + Supabase/Google/Stripe security-contact pages.
- [ ] Keep a current processor inventory (§ Appendix A) — you can't assess scope without it.
- [ ] Verify you can run `disablePersonalSync()` via OTA/config without a full store release.
- [ ] Confirm key-rotation steps for every provider are documented and tested.

---

## 5. NOTIFICATION TEMPLATES

Fill brackets. Send the Commissioner notice even with gaps (mark "preliminary / to be supplemented"). Get Legal to review Critical/High user notices before sending.

### 5A. To the Commissioner (PDP / JPDP) — within 72 hours

> **Subject:** Personal Data Breach Notification — Potraces — [DATE]
>
> **1. Notifying organisation:** [Legal/Trading name], operator of the Potraces mobile app. Contact: [Founder name], [role], [email], [phone].
> **2. Status:** [ ] Preliminary (facts still being established) [ ] Full.
> **3. Date/time breach occurred:** [estimate] — **Date/time we became aware:** [exact UTC+8].
> **4. Nature of breach:** [e.g., misconfigured database access control (RLS) allowed one user to read another user's financial records / processor breach at <name> / lost device].
> **5. Personal data involved:** [categories — e.g., transaction records, wallet balances, debt records, contact names + phone numbers]. **Financial data:** [yes/no].
> **6. Number of data subjects affected:** [N approx] — Malaysian: [N]. App users: [N]; third-party contacts (non-users): [N].
> **7. Likely consequences / harm:** [e.g., risk of financial profiling, unsolicited contact, fraud].
> **8. Cause / how it happened:** [root cause if known; "under investigation" if not].
> **9. Containment & remediation taken:** [e.g., RLS policy corrected at HH:MM; keys rotated; sync force-disabled; affected rows audited].
> **10. Will affected individuals be notified?** [Yes — by DD/MM via in-app + email; or No — reason: harm unlikely because <encryption/contained/verified-not-accessed>].
> **11. Measures to prevent recurrence:** [regression test added; policy review; DPA/SCC status with processor].
> **12. Attachments:** [log extracts, affected-user count query, processor notice].
>
> Signed: [Founder], for [Organisation], [date].

### 5B. To affected individuals — within 7 days (English)

> **Subject: Important security notice about your Potraces data**
>
> Hi [name/there],
>
> We're writing to let you know about a data security incident that may have involved your information in Potraces.
>
> **What happened:** On [date], [plain-language: e.g., a configuration error briefly allowed some account data to be accessible to another user / a service we use had a security incident].
> **What information was involved:** [e.g., your transaction records and wallet balances. No passwords were exposed.]
> **What we've done:** We fixed the cause on [date], [rotated security keys / corrected access controls], and notified Malaysia's Personal Data Protection Commissioner.
> **What you can do:** [e.g., change your password; watch for unusual messages; contact us with any concern]. Potraces never asks for your password or OTP by message.
> **Contact:** Reply here or email [privacy@…]. We're sorry this happened and have taken steps so it won't recur.
>
> — The Potraces team

### 5C. To affected individuals — within 7 days (Bahasa Malaysia)

> **Subjek: Notis keselamatan penting tentang data Potraces anda**
>
> Hai [nama/anda],
>
> Kami ingin memaklumkan tentang satu insiden keselamatan data yang mungkin melibatkan maklumat anda dalam Potraces.
>
> **Apa yang berlaku:** Pada [tarikh], [bahasa mudah: cth. satu ralat tetapan menyebabkan sebahagian data akaun boleh diakses oleh pengguna lain buat seketika / sebuah perkhidmatan yang kami guna mengalami insiden keselamatan].
> **Maklumat yang terlibat:** [cth. rekod transaksi dan baki dompet anda. Tiada kata laluan terdedah.]
> **Tindakan kami:** Kami telah membaiki puncanya pada [tarikh], [menukar kunci keselamatan / membetulkan kawalan akses], dan memaklumkan Pesuruhjaya Perlindungan Data Peribadi Malaysia.
> **Apa anda boleh buat:** [cth. tukar kata laluan; berhati-hati dengan mesej mencurigakan; hubungi kami jika ada kebimbangan]. Potraces tidak sekali-kali meminta kata laluan atau OTP anda melalui mesej.
> **Hubungi kami:** Balas di sini atau emel [privacy@…]. Kami memohon maaf atas kejadian ini dan telah mengambil langkah agar ia tidak berulang.
>
> — Pasukan Potraces

### 5D. Short in-app banner (EN / BM)
- EN: *"Security notice: we had a data incident that may affect your account. Tap to read what happened and what to do."*
- BM: *"Notis keselamatan: berlaku insiden data yang mungkin menjejaskan akaun anda. Ketik untuk maklumat lanjut."*

---

## 6. EVIDENCE & RECORD-KEEPING (keep ≥ 2 years; this is your defence)

Maintain an **Incident Record** per breach (one Markdown file in a private/secure store — not the public repo):

- [ ] Incident ID + title.
- [ ] **Timeline (UTC+8):** occurred → detected → aware → contained → Commissioner notified → users notified → closed. (The "aware" time anchors both clocks.)
- [ ] Detection source (alert, user report, processor notice, audit).
- [ ] Affected scope: tables, `user_id`s, row counts, date range, third-party contacts count, MY vs non-MY.
- [ ] Root cause (technical) + the commit/config that caused it and the fix commit.
- [ ] Decision log: notifiable to Commissioner? to individuals? **with the reasoning** (esp. any decision *not* to notify — record why harm was judged unlikely).
- [ ] Copies of: Commissioner submission + receipt, user notice sent (EN+BM), processor correspondence, log extracts, screenshots.
- [ ] Who did what, when (even if "founder" for all).
- [ ] Maintain a **standing breach register** (a running list of all incidents incl. near-misses) — regulators may ask for it.

> Treat the existing protections — schema preflight, lossless mappers, local rolling `bak:*` backups, the sync gate (OFF by default), tombstone-only deletes — as documented evidence of the PDPA **security principle** ("practical steps"). Reference them in the Commissioner notice §11.

---

## 7. POST-INCIDENT (after the clocks are met)

- [ ] **Root-cause fix merged** + a **regression test** that would have caught it (e.g., an RLS test asserting user A can't read user B; a sync round-trip test for the stripped field).
- [ ] **Restore data** if integrity was hit — from `bak:*` rolling backups or Supabase point-in-time; verify amounts reconcile (`autoReconcileWallets`).
- [ ] **Close the related audit finding** in `personal-sync-critical-bugs` / RLS backlog if this was a known gap.
- [ ] **Processor follow-up:** if a processor caused it, confirm DPA/SCC is signed and request their post-mortem; re-check the Transfer Impact Assessment.
- [ ] **Update the privacy notice** (`docs/privacy.html`, EN + BM) if categories/processors/risks changed.
- [ ] **Decide on DPO appointment** if scale crossed the threshold during/after the incident.
- [ ] **Post-incident review (within 1–2 weeks):** what failed, what worked, what to change. Update this runbook.
- [ ] **User trust comms:** if public, a brief honest status/changelog note.

---

## Appendix A — Cross-border processor inventory (assess scope fast)

Each is outside Malaysia → a breach there is a cross-border + notifiable concern. Keep current; needed to scope §3.

| Processor | Role in Potraces | Data it touches | Security contact (fill in) |
|---|---|---|---|
| **Supabase** | DB / auth / storage | All synced personal + financial data, receipts | [DPA signed? region? contact] |
| **Anthropic (Claude)** | AI parsing + Money Chat (`aiService.ts` → api.anthropic.com) | Note / receipt-OCR / order text, questions, financial summary | [DPA / zero-retention? / contact] |
| **Google (Gemini)** | AI intent/parsing (`intentEngine.ts`, `manglishParser.ts`, `aiService.ts`) | Transaction free-text + financial context | [DPA / contact] |
| **Telegram** | OTP verification | Phone number | [contact] |
| **Stripe** | Tap-to-Pay (card) | Card/payment data (Stripe-held, PCI) | [contact] |
| **Expo / EAS** | Push notifications, builds | Push tokens, device data | [contact] |
| **Vercel** | Seller order-link page (`docs/index.html`) | Seller/order data served client-side | [contact] |

## Appendix B — Quick reference card (pin this)

```
AWARE NOW → write the timestamp.
CLOCK 1: Commissioner  ≤ 72h  (interim ok)
CLOCK 2: Individuals   ≤ 7d   (only if significant harm)
CONTAIN: rotate keys · disable sync · pull deploy · make bucket private
ASSESS:  personal data? whose? financial? harm likely? how many?
NOTIFY:  PDP first (template 5A) → users EN+BM (5B/5C) if harmful
RECORD:  timeline · scope · root cause · decisions · receipts
PDP:     aduan@pdp.gov.my / pdp.gov.my (confirm live channel)
LAWYER:  [name / phone / email]
```

---

*Last updated: 2026-06-11. Review on every PDPA guideline change and after every incident.*
