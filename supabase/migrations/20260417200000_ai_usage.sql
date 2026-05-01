-- ============================================================
-- AI usage tracking (per-user, per-kind, monthly quota)
-- Used by parse-statement edge function and future AI features
-- to enforce free-tier limits without trusting the client.
-- ============================================================

create table if not exists public.ai_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists ai_usage_user_kind_created_idx
  on public.ai_usage(user_id, kind, created_at desc);

alter table public.ai_usage enable row level security;

-- Owner-read so the client can display "X uses left this month".
create policy "ai_usage_owner_read" on public.ai_usage
  for select using (auth.uid() = user_id);

-- Inserts happen only through the edge function (service role bypasses RLS).
-- No INSERT policy for authenticated users on purpose — prevents client tampering.
