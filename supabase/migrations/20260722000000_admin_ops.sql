-- Admin ops dashboard: per-call usage events + admin-only read access to usage data.
--
-- WHY: ai_proxy_usage (20260613000000) holds monthly AGGREGATE counters per identity
-- for budget enforcement, but (a) nobody can read it client-side (RLS on, no policies)
-- and (b) it has no per-model / per-feature split, so cost-per-model and "receipt scans
-- so far" can't be computed. This migration adds:
--   1. usage_events — one row per AI call / STT token mint, written ONLY by edge
--      functions via the service role.
--   2. Admin read policies so the founder console (site/admin.html, gated by
--      public.is_admin()) can read usage data with the anon key.
--   3. admin_user_stats() — aggregate user/receipt/waitlist counts. auth.users is not
--      client-readable, so a self-gated security-definer function does the counting.
--
-- Idempotent: safe to re-apply (drop policy if exists + or-replace functions).

-- ─── 1. Per-call event log ────────────────────────────────────────────────────
create table if not exists public.usage_events (
  id            uuid        primary key default gen_random_uuid(),
  identity      text        not null,
  kind          text        not null,                -- 'ai_call' | 'stt_mint'
  provider      text,                                -- 'gemini' | 'anthropic' | 'soniox' | 'deepgram'
  model         text,                                -- upstream model actually called
  feature       text,                                -- 'vision' | 'text' | null
  input_tokens  bigint      not null default 0,
  output_tokens bigint      not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists usage_events_created_idx
  on public.usage_events (created_at desc);
create index if not exists usage_events_kind_created_idx
  on public.usage_events (kind, created_at desc);

alter table public.usage_events enable row level security;

-- Admin read (founder console). No insert/update/delete policies — writes happen
-- only through the service role (edge functions), which bypasses RLS.
drop policy if exists "usage_events_admin_read" on public.usage_events;
create policy "usage_events_admin_read" on public.usage_events
  for select to authenticated using (public.is_admin());

-- ─── 2. Admin read on the pre-existing usage tables ──────────────────────────
-- ai_proxy_usage previously had NO policies (service-role only). ai_usage keeps its
-- existing owner-read policy; this ADDS admin read on top.
drop policy if exists "ai_proxy_usage_admin_read" on public.ai_proxy_usage;
create policy "ai_proxy_usage_admin_read" on public.ai_proxy_usage
  for select to authenticated using (public.is_admin());

drop policy if exists "ai_usage_admin_read" on public.ai_usage;
create policy "ai_usage_admin_read" on public.ai_usage
  for select to authenticated using (public.is_admin());

-- ─── 3. Service-role-only writer RPC (same lockdown as add_ai_proxy_usage) ────
create or replace function public.record_usage_event(
  p_identity text,
  p_kind text,
  p_provider text,
  p_model text,
  p_feature text,
  p_input bigint,
  p_output bigint
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_events (identity, kind, provider, model, feature, input_tokens, output_tokens)
  values (p_identity, p_kind, p_provider, p_model, p_feature, p_input, p_output);
$$;

revoke all on function public.record_usage_event(text, text, text, text, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_usage_event(text, text, text, text, text, bigint, bigint) to service_role;

-- ─── 4. Admin user stats (self-gated; reads auth.users as the function owner) ─
create or replace function public.admin_user_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'total_users',           (select count(*) from auth.users),
    'new_users_this_month',  (select count(*) from auth.users
                                where created_at >= date_trunc('month', now())),
    'active_users_30d',      (select count(*) from auth.users
                                where last_sign_in_at >= now() - interval '30 days'),
    'receipts_total',        (select count(*) from public.personal_receipts
                                where deleted_at is null),
    'receipts_this_month',   (select count(*) from public.personal_receipts
                                where deleted_at is null
                                  and created_at >= date_trunc('month', now())),
    'beta_installers',       (select count(*) from public.beta_installers),
    'waitlist_total',        (select count(*) from public.waitlist)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_user_stats() to authenticated;
