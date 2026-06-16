# Potraces Beta — Feedback Path Spec (Option B: in-app Settings row)

> **Decision (settled by the critic's verdict):** for 3 known testers in one WhatsApp group, a public
> `beta.html` web form is over-engineered (severity pills, scroll-fade, honeypot, client rate-limit,
> cooldown, screenshot bucket = scope creep + a Vercel-routing + public-bucket risk). We are **not**
> building it.
>
> The structured path is a small **"Send beta feedback" row inside the app's Settings** that writes to a
> Supabase `beta_feedback` table. **WhatsApp remains the primary channel.** This keeps tester data
> in-processor (Supabase Singapore — already disclosed; no new foreign processor) and ties reports to
> build identifiers, with **5 fields, not 17**.

---

## Why in-app row, not a web form (and not a Google Form / Tally)

- **PDPA, decisive.** Collecting tester name + phone + device + feedback = personal data under PDPA 2010
  (2024 amendments). The in-app row → Supabase Singapore adds **zero** new processor (already disclosed in
  `docs/privacy.html`). A Google Form / Tally would add a brand-new foreign processor for finance-app
  testers' data — wrong direction.
- **Pattern reuse.** The existing supabase client already inserts public rows (seller order flow). The
  row reuses it verbatim — no new infra, no new account.
- **Right-sized.** A web form for 3 friends is more form than reports you'll receive. Five fields cover it.

---

## Form questions (what the tester fills)

The tester fills **two** fields; three are auto-captured.

1. **Severity** (required, pick one — no red anywhere):
   - `blocker` — can't use / tak boleh guna
   - `major` — broken, has a workaround / rosak tapi ada jalan
   - `minor` — small / remeh
   - `idea` — suggestion / cadangan
2. **What happened** (required, multiline). Placeholder (bilingual):
   *"Apa jadi? Tekan apa, jangka apa, jadi apa / What happened? What you tapped, expected, saw."*
3. **Screen** (optional, free text or a quick pill of feature names: Wallet, Transactions, Receipt Scan,
   Notes/AI, Budget, Goals, Debts/Splits, Reports, Settings/Backup, Seller, Sign-in, Other).

Auto-captured (not shown as editable-required fields):
4. **build_id** — `Constants.expoConfig.version` + versionCode + `Updates.updateId`/`Updates.channel`
   (locked / read-only).
5. **device** — `expo-device` `Device.modelName` + OS version.

> Consent: the row sits behind the **first-launch PDPA acknowledgement screen**, so no per-submit consent
> checkbox is needed inside the beta app.

---

## Landing / entry copy (in Settings)

- **Row label (EN/BM):** "Send beta feedback / Hantar feedback beta"
- **Sheet title (EN):** "Found a bug? Tell me."  **(BM):** "Jumpa bug? Bagitau aku."
- **Sub (EN):** "This goes straight to the team. You can also just drop it in our WhatsApp group."
- **Sub (BM):** "Ni terus sampai team. Boleh je drop dalam group WhatsApp kita pun."
- **Submit button (EN/BM):** "Send / Hantar"
- **Success (EN):** "Thanks! Your report reached the team."  **(BM):** "Terima kasih! Report dah sampai."

Calm styling — reuse the app's existing Settings sheet/field components (CALM / CALM_DARK tokens). No new
visual language; `blocker` severity uses bronze/gold emphasis, never alarm red.

---

## Setup steps (before kickoff)

1. **Apply the migration.** Run `beta_feedback.sql` against project `iydqeeonaljqapulboaz`
   (Supabase Studio → SQL editor, or `supabase db push` if you wire it as a migration file).
2. **Verify the anon-insert RLS** with one test row using the anon key — e.g.:
   ```sh
   curl -X POST "https://iydqeeonaljqapulboaz.supabase.co/rest/v1/beta_feedback" \
     -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -H "Prefer: return=minimal" \
     -d '{"severity":"idea","message":"test row","build_id":"setup-check","consent_ok":true}'
   ```
   Expect 201/204. Then confirm anon **cannot read** it back (a `GET` should return nothing for anon).
   Delete the test row from Studio.
3. **Wire the Settings row** (build_id + device auto, severity + message + screen entered) using the
   existing supabase client. Insert with `Prefer: return=minimal`.
4. **No screenshot bucket.** If a tester has a screenshot, they paste it into WhatsApp; the founder
   triages there. (A public-read bucket would expose finance screenshots — a PDPA security risk — so it
   is deliberately omitted.)
5. This native-touching row ships in the **same** `eas build` as the version line, Sentry, and the
   first-launch data-loss screen (see `BETA_PROGRAM.md` step 4).

---

## What was deliberately cut (scope)

`beta.html` web page; public screenshot storage bucket; the 17-field schema (`expected`/`actual` split,
`area` enum, `reproducible` enum, `app_version` param, persistent `device_id`); honeypot; client
rate-limit + cooldown. All anti-spam machinery is unnecessary for 3 named friends. The Supabase table
keeps the extra columns nullable for possible future use, but the in-app row sends only the five fields above.
