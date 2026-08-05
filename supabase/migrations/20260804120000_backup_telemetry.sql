-- Backup telemetry — one row per DEFINITIVE personal backup/sync failure.
--
-- WHY: silent backup failure is the worst outcome in this feature class. The
-- app surfaces failures locally (settings error state, mismatch alert), but the
-- founder has no visibility into how often sync auto-disables in the wild
-- (schema drift) or stalls on an account mismatch. This table is the minimum
-- viable signal: failure KIND + app version + platform. NO financial data,
-- no row contents, no free-text from the user.
--
-- Pattern mirrors beta_feedback (RLS-private to the owner; founder triages via
-- service_role). Client: src/services/backupTelemetry.ts (fire-and-forget,
-- once per kind per app launch). Idempotent migration.

create table if not exists public.backup_telemetry (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  kind        text not null,
  message     text,
  app_version text,
  platform    text,
  created_at  timestamptz not null default now()
);

create index if not exists backup_telemetry_user_idx    on public.backup_telemetry(user_id);
create index if not exists backup_telemetry_created_idx on public.backup_telemetry(created_at desc);
create index if not exists backup_telemetry_kind_idx    on public.backup_telemetry(kind);

alter table public.backup_telemetry enable row level security;

-- Owner inserts/selects only their own rows; founder reads via service_role.
drop policy if exists backup_telemetry_insert_own on public.backup_telemetry;
create policy backup_telemetry_insert_own on public.backup_telemetry
  for insert with check (auth.uid() = user_id);

drop policy if exists backup_telemetry_select_own on public.backup_telemetry;
create policy backup_telemetry_select_own on public.backup_telemetry
  for select using (auth.uid() = user_id);

grant insert, select on public.backup_telemetry to authenticated;
