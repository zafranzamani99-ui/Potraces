# Staging ("test kitchen") setup — finish-it checklist

A second, separate Supabase project so beta testers / experiments never touch the production DB, and so
load-testing has a safe home. Started 2026-08-01.

## Status
- ✅ Staging Supabase project created: **`Potraces-Staging`**, ref `gdljsvsolkmfawjdsyrx`, region Southeast Asia (Singapore).
- ✅ URL + anon key saved to gitignored **`.env.staging`**.
- ✅ DB password: held by the **owner only** (set at project creation — not stored in the repo).
- ✅ **Schema loaded 2026-08-01** — all 79 migrations applied cleanly via `npx supabase db push` (CLI run through npx; no global install).
- ⬜ Edge Functions not deployed / staging secrets not set.
- ⬜ App not yet wired to point test builds at staging.

## Why this is NOT urgent
The real app runs on the production DB and is unaffected. Beta testers are already kept off prod by the
fail-closed `EXPO_PUBLIC_CLOUD_BACKUP` flag, and personal sync is beta-dormant. So staging is a
"finish before scaling real users," not an emergency.

## Step 1 — Load the DB schema (79 migrations)
The Supabase CLI is installed on the owner's Mac (it currently links the **production** ref
`jngmanwvhbpkpkeklfiv`). In a terminal at the repo root:
```bash
supabase link --project-ref gdljsvsolkmfawjdsyrx   # links to STAGING; prompts for the STAGING db password
supabase db push                                   # applies all 79 migrations to the empty staging DB
supabase link --project-ref jngmanwvhbpkpkeklfiv   # ⚠️ RE-LINK BACK to production when finished
```
`supabase db push` always targets the **currently linked** project — confirm the ref before running.
Staging is empty, so every migration applies fresh in order; watch for any migration that assumed manual
prior state (fix by hand in the staging SQL editor if one trips).

## Step 2 — Deploy Edge Functions + set staging secrets (only if you need AI/payments/etc. in staging)
```bash
# while linked to staging:
supabase functions deploy
```
Then set the staging secrets the functions read (dashboard → Edge Functions → Secrets, or `supabase secrets set`):
`GEMINI_API_KEY`, optional `ANTHROPIC_API_KEY`, `FIUU_*` (can stay dormant), optional `STRIPE_*`, maps/STT keys.
Full list of server-only secrets is in `.env.example`. For a **data-only** test kitchen you can skip these at first.

## Step 3 — Point TEST builds at staging (keep production on production)
Cleanest: set staging `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` as **EAS environment
variables** scoped to the `development` and `preview` environments (Expo dashboard → project → Environment
variables), leaving `production` pointed at the real project. `eas.json` already tags each build profile with
an `environment`. For **local** dev against staging, use the values in `.env.staging`.

## Step 4 — Seed + load-test (optional, the "fire drill")
Once staging runs, extend `scripts/test-sample-data.ts` to seed a heavy persona (10k–20k transactions +
hundreds of receipts), run the real `syncPersonal` round-trip against staging, and measure. This is the safe
place for k6/artillery backend tests + a Supabase Realtime concurrent-connection-ceiling test.
