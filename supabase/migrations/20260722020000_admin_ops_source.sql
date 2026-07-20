-- Per-feature attribution for usage_events: which screen/feature made the call.
--
-- The app threads a `source` label through geminiClient → ai-proxy (client release
-- ships separately); the proxy validates it against an allowlist and stores it here.
-- parse-statement logs its own rows with source 'statement-parse'; stt-token uses
-- 'voice'. Rows from older app builds keep source NULL (dashboard: "untagged").
--
-- record_usage_event gains p_source — the old 7-arg signature is DROPPED first
-- (only edge functions call it, via service role).

alter table public.usage_events add column if not exists source text;

create index if not exists usage_events_source_created_idx
  on public.usage_events (source, created_at desc);

drop function if exists public.record_usage_event(text, text, text, text, text, bigint, bigint);

create or replace function public.record_usage_event(
  p_identity text,
  p_kind text,
  p_provider text,
  p_model text,
  p_feature text,
  p_source text,
  p_input bigint,
  p_output bigint
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_events (identity, kind, provider, model, feature, source, input_tokens, output_tokens)
  values (p_identity, p_kind, p_provider, p_model, p_feature, p_source, p_input, p_output);
$$;

revoke all on function public.record_usage_event(text, text, text, text, text, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_usage_event(text, text, text, text, text, text, bigint, bigint) to service_role;
