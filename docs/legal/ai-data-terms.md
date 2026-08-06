# AI data terms — Gemini (written record)

> Launch-gate compliance record (AUGUST.md §6 + `docs/plans/import-reconciliation-design.md` §6).
> **Not legal advice** — this documents which terms govern the app's AI data flow and the
> exact owner actions required. Compiled 2026-08-05 from the sources linked below.

## 1. The data flow (what leaves the app, to whom)

All AI features call one provider through one path:

```
app (Echo/MoneyChat, note parsing, receipt scan, statement import, business AI reports,
     seller product/WhatsApp parsing, voice transcription)
  → Supabase edge function `ai-proxy` (meters + holds the key)
  → Google Gemini API (`generativelanguage.googleapis.com`), model per feature
```

- **Provider:** Google (Gemini API). The Anthropic path was retired — no user data goes to
  any other AI provider.
- **Content sent:** the text/image the user submits (note text, receipt photo/OCR, statement
  PDF pages) plus limited financial context (category/wallet names, transaction summary for
  Money Chat). PII scrubbing (`scrubPii`) removes card/IC numbers before transmission —
  best-effort, not the control. The control is the terms below + the AI opt-in toggle.
- **Server-side storage:** none. `parse-statement` processes statement pages in-memory and
  returns rows; statement passwords are never persisted.

## 2. The terms that apply

[Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms)
(effective 2026-03-23, checked 2026-08-05) split data handling by billing state:

- **Unpaid services (free quota / AI Studio):** Google MAY use submitted content and
  responses to improve its products, and human reviewers may read them. The terms say
  not to submit personal/confidential info to unpaid services. **Not acceptable for us.**
- **Paid services (Cloud Billing account activated on the API project):** Google does NOT
  use prompts (incl. system instructions, cached content, images/documents) or responses to
  improve products. They are processed under the
  [Data Processing Addendum for Products where Google is a Data Processor](https://cloud.google.com/terms/data-processing-addendum)
  and logged only for a limited period for abuse prevention / safety / legal obligations.
  **This is the required posture.**
- Activating Cloud Billing makes ALL Gemini API usage "Paid services" from a data-use
  standpoint — even calls inside the free quota. So one billing action covers everything;
  it does not require moving off the free quota.

There is no separate DPA signature flow for the Gemini API: the Additional Terms +
Data Processing Addendum apply automatically to paid-services usage. The "paperwork" is
therefore: (a) billing activated, (b) this record, (c) the in-app opt-in consent.

## 3. Owner actions (the only steps that need your Google account)

- [x] **Confirm billing is ON for the project that owns `GEMINI_API_KEY`:**
      [console.cloud.google.com/billing](https://console.cloud.google.com/billing) → the
      project must show a linked, active billing account. If not: link one. This single
      check is what puts all AI traffic under the no-training paid-services terms above.
      **CONFIRMED 2026-08-06 by Muhammad Zafran** (screenshot verified): project
      **Potraces** linked to billing account "My Billing Account 2"
      (ID 0176C8-4CA2B6-389590), tier "Paid 1" (Cloud Prepay). Paid-services data
      terms apply to ALL Gemini API usage on this project, including free-quota calls.
- [ ] **Re-check after any key/project change** — a new API key from a different (or new,
      billing-less) project silently drops the data terms back to the unpaid tier.

## 4. Store declarations (already prepared elsewhere)

AI data flow = "User Content + Financial Info transmitted off-device with user consent
(opt-in toggle), processed by Google (Gemini), not used for training (paid tier)".
Fill App Store Connect → App Privacy and Play → Data Safety to match
`audit/STORE_DATA_DISCLOSURE.md`. The opt-in toggle (Settings → AI features) is what makes
"with consent" true.

## 5. If billing ever lapses

Card failure / billing suspension quietly returns usage to unpaid-tier data terms. Treat a
billing alert on the AI project as a compliance event: pause AI features server-side
(disable via the proxy) until billing is restored, or accept that prompts may train models
and must contain no personal data (our scrub is not strong enough to rely on).
