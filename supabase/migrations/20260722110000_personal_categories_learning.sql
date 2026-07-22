-- ─── personal_categories + personal_learning — sync custom categories & AI hints ─
-- WHY (audit "what else", 2026-07-22): two personal settings blobs never synced,
-- so a user who set up custom categories (icons/colours/custom names/order) or
-- accumulated learned AI hints lost them on device loss even with cloud backup on.
--
-- Both are ONE row per user (user_id is the PK), synced as a single LWW blob:
-- `client_edit_at` is the CLIENT-stamped last-edit time (same convention as every
-- other personal_* table since 20260716000000); newer client_edit_at wins on both
-- pull and push. The whole settings object lives in a single `data` jsonb column —
-- these blobs are only ever read/written whole (device backup + restore), never
-- queried field-by-field, so an opaque blob can never silently drop a field the
-- way a hand-mapped column set could.
--
-- DEPLOY ORDER: apply this migration BEFORE shipping the app build that syncs
-- these stores. The app's schema preflight probes personal_categories.client_edit_at,
-- so on an un-migrated DB personal sync stays DISABLED (safe) rather than erroring
-- mid-push — same guard the budget-profile migration (20260722100000) relies on.

create table if not exists public.personal_categories (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  data           jsonb not null default '{}',
  -- client-authoritative edit time for true LWW (no server trigger touches it)
  client_edit_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.personal_learning (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  data           jsonb not null default '{}',
  client_edit_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- RLS: owner-only, same policy shape as personal_budget_profile (20260722100000).
alter table public.personal_categories enable row level security;
drop policy if exists "personal_categories_owner" on public.personal_categories;
create policy "personal_categories_owner" on public.personal_categories
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.personal_learning enable row level security;
drop policy if exists "personal_learning_owner" on public.personal_learning;
create policy "personal_learning_owner" on public.personal_learning
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Keep updated_at fresh on server-side updates (audit stamp only; LWW uses
-- client_edit_at, which no trigger overwrites).
drop trigger if exists personal_categories_updated_at on public.personal_categories;
create trigger personal_categories_updated_at
  before update on public.personal_categories
  for each row execute function public.handle_updated_at();

drop trigger if exists personal_learning_updated_at on public.personal_learning;
create trigger personal_learning_updated_at
  before update on public.personal_learning
  for each row execute function public.handle_updated_at();
