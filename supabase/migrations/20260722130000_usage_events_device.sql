-- Per-call DEVICE attribution for usage_events.
--
-- usage_events.identity is the user id (signed-in) or dev:<device>. For signed-in
-- users that hid WHICH device made the call — the app already sends x-device-id on
-- every proxy/stt call, the edge functions just weren't storing it. These columns
-- capture the opaque per-install device id + a friendly model name (e.g. "iPhone 15")
-- so the ops console can break a user's usage down by device, and tie an anonymous
-- dev:<id> device to the person who later signs in on that same install.
--
-- record_usage_event gains p_device + p_device_name, DEFAULT NULL so the existing
-- 8-arg caller (parse-statement) keeps resolving unchanged. The 8-arg signature is
-- dropped first — PostgREST would treat the 8-arg + 10-arg overloads as ambiguous.

alter table public.usage_events add column if not exists device_id   text;
alter table public.usage_events add column if not exists device_name text;

create index if not exists usage_events_device_created_idx
  on public.usage_events (device_id, created_at desc);

drop function if exists public.record_usage_event(text, text, text, text, text, text, bigint, bigint);

create or replace function public.record_usage_event(
  p_identity text,
  p_kind text,
  p_provider text,
  p_model text,
  p_feature text,
  p_source text,
  p_input bigint,
  p_output bigint,
  p_device text default null,
  p_device_name text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_events
    (identity, kind, provider, model, feature, source, input_tokens, output_tokens, device_id, device_name)
  values
    (p_identity, p_kind, p_provider, p_model, p_feature, p_source, p_input, p_output, p_device, p_device_name);
$$;

revoke all on function public.record_usage_event(text, text, text, text, text, text, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.record_usage_event(text, text, text, text, text, text, bigint, bigint, text, text) to service_role;
