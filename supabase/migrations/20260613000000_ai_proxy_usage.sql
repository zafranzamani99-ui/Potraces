-- Usage metering for the `ai-proxy` Edge Function.
--
-- NOTE: distinct from the existing `ai_usage` table (20260417200000), which is a
-- per-event quota log keyed by auth user_id and used by parse-statement. The proxy
-- needs AGGREGATE counters keyed by an `identity` that may be a device id (signed-out
-- personal users), so it gets its own table: `ai_proxy_usage`.
--
-- Written ONLY by the Edge Function via the service-role key; clients get no access.
-- `identity` = Supabase auth user id (signed-in) or `dev:<device-id>` (signed-out).
-- `period` = UTC month, 'YYYY-MM'.

create table if not exists public.ai_proxy_usage (
  identity      text        not null,
  period        text        not null,
  input_tokens  bigint      not null default 0,
  output_tokens bigint      not null default 0,
  calls         integer     not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (identity, period)
);

-- RLS ON with NO policies → anon/auth roles get zero access. The Edge Function uses
-- the service-role key, which bypasses RLS, so only it can read/write usage.
alter table public.ai_proxy_usage enable row level security;

-- Atomic upsert so the proxy adds usage in one round-trip without a read-modify-write
-- race between concurrent calls from the same identity.
create or replace function public.add_ai_proxy_usage(
  p_identity text,
  p_period text,
  p_input bigint,
  p_output bigint
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_proxy_usage (identity, period, input_tokens, output_tokens, calls, updated_at)
  values (p_identity, p_period, p_input, p_output, 1, now())
  on conflict (identity, period) do update
    set input_tokens  = ai_proxy_usage.input_tokens  + excluded.input_tokens,
        output_tokens = ai_proxy_usage.output_tokens + excluded.output_tokens,
        calls         = ai_proxy_usage.calls + 1,
        updated_at    = now();
$$;

-- Only the service role (the proxy) may execute it. Revoking from PUBLIC strips the
-- implicit grant from every role, so the service role must be granted back explicitly.
revoke all on function public.add_ai_proxy_usage(text, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.add_ai_proxy_usage(text, text, bigint, bigint) to service_role;
