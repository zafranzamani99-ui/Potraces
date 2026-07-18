-- ─── personal_notes: cloud backup + restore for the Notes feature ─────────────
-- Notes were device-only (AsyncStorage) with NO cloud backup, so a reinstall or a
-- new device lost every note — while the account UI promised "automatic backup"
-- (see the notes production audit + docs/multi-device.md). This adds a synced
-- personal_notes table so note bodies, rich-text formatting, and extractions
-- (incl. still-pending ones) restore on any device the user signs into.
--
-- Conflict resolution: whole-row LWW on client_edit_at (mirrors updated_at), same
-- as every other personal_* entity. content + formatting are stored together so the
-- offset-based marks/blocks always match the characters after a round-trip.
--
-- DEPLOY ORDER: apply this migration BEFORE shipping the app build that writes
-- personal_notes. The app's schema preflight probes personal_notes.client_edit_at,
-- so on an un-migrated DB personal sync stays DISABLED (safe) rather than erroring
-- mid-push.

create table if not exists public.personal_notes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  local_id       text not null,
  title          text not null default '',
  content        text not null default '',
  -- offset-based rich-text metadata: { marks:[{start,end,attr}], blocks:[{at,style}] }
  formatting     jsonb,
  -- the note's extractions, including un-confirmed pending ones, so they aren't lost
  extractions    jsonb not null default '[]',
  mode           text not null default 'personal',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- client-authoritative edit time for true LWW (no server trigger touches it)
  client_edit_at timestamptz
);

-- Upsert conflict target — full (non-partial) unique index; PostgREST needs a real
-- unique index it can use as ON CONFLICT (user_id, local_id).
create unique index if not exists personal_notes_user_local_idx
  on public.personal_notes(user_id, local_id);
create index if not exists personal_notes_user_id_idx
  on public.personal_notes(user_id);

-- RLS: a user can only see/write their own notes (notes hold sensitive free text).
alter table public.personal_notes enable row level security;
drop policy if exists "personal_notes_owner" on public.personal_notes;
create policy "personal_notes_owner" on public.personal_notes
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Keep updated_at fresh on server-side updates (audit stamp only; LWW uses
-- client_edit_at, which no trigger overwrites).
drop trigger if exists personal_notes_updated_at on public.personal_notes;
create trigger personal_notes_updated_at
  before update on public.personal_notes
  for each row execute function public.handle_updated_at();
