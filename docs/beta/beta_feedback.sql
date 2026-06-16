-- ============================================================
-- Potraces beta feedback table
--
-- Data store for the in-app "Send beta feedback" Settings row (see
-- docs/beta/feedback-form-spec.md). WhatsApp is the primary channel; this is the
-- one structured path. NO public web form, NO public screenshot bucket this round.
--
-- Public INSERT only (anon key) — no SELECT/UPDATE/DELETE for anon.
-- Triage happens in Supabase Studio / SQL as the table owner (service role bypasses RLS).
-- Mirrors the public-insert pattern already used by the seller order flow.
--
-- LOCAL ARTIFACT — do NOT apply until reviewed. Apply to project iydqeeonaljqapulboaz
-- (Supabase Studio SQL editor) BEFORE kickoff so the in-app row can land reports.
-- Suggested migration file name if you wire it in: 20260616100000_beta_feedback.sql
--
-- PDPA close-out: an assigned owner deletes these rows + name/phone by a set date
-- (<= 90 days post-beta). Record the deletion date in the tracking sheet.
-- ============================================================

create table if not exists public.beta_feedback (
  id               uuid primary key default gen_random_uuid(),
  build_id         text not null,
  severity         text not null
                     check (severity in ('blocker','major','minor','idea')),
  message          text not null,          -- "what happened" (tapped / expected / saw)
  screen           text,                   -- optional: which screen/area
  device           text,                   -- optional: model + OS, from expo-device (auto)
  tester           text,                   -- optional label if you want to attribute in-app
  consent_ok       boolean not null default false,
  consent_at       timestamptz,
  status           text not null default 'new'
                     check (status in ('new','triaged','fixed','wontfix','dup')),
  submitted_at     timestamptz not null default now(),
  -- defence-in-depth length caps so a single row can't be abused
  constraint beta_feedback_lengths check (
    char_length(build_id) <= 120 and
    char_length(message)  <= 4000 and
    char_length(coalesce(screen,'')) <= 160 and
    char_length(coalesce(device,'')) <= 160 and
    char_length(coalesce(tester,'')) <= 120
  ),
  -- consent must be explicitly true to land a row
  constraint beta_feedback_requires_consent check (consent_ok = true)
);

create index if not exists beta_feedback_severity_idx  on public.beta_feedback(severity);
create index if not exists beta_feedback_status_idx    on public.beta_feedback(status);
create index if not exists beta_feedback_submitted_idx on public.beta_feedback(submitted_at desc);

alter table public.beta_feedback enable row level security;

-- Public (anon) may INSERT only. The WITH CHECK re-enforces the gates so a crafted
-- request can't bypass them: consent true, valid severity, non-empty message.
-- No USING clause / no SELECT policy => anon cannot read anything back.
create policy "beta_feedback_anon_insert" on public.beta_feedback
  for insert
  to anon
  with check (
    consent_ok = true
    and severity in ('blocker','major','minor','idea')
    and char_length(message) > 0
    and char_length(build_id) > 0
  );

-- NOTE: deliberately NO select/update/delete policy for anon.
-- The table owner (service role / dashboard) bypasses RLS for triage.
-- If you later want an authenticated admin to read in-app, add a separate select
-- policy gated on a specific admin uid — do NOT open select to anon.
