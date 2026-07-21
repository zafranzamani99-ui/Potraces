-- Collectz session capacity — cap how many people can join.
--
-- max_participants: the effective cap on ACTIVE players. NULL = no limit.
--   When the roster is full (active_count >= max_participants) the collectz-join
--   edge function rejects add_self with { error: 'session_full' }.
-- team_count / team_size: the "N teams × M per team" inputs when the organizer
--   set the cap by teams (max_participants = team_count * team_size). Both NULL
--   for a plain Max, or when no cap is set. Stored so the create/edit form can
--   re-open in the right mode.
alter table public.collectz_sessions
  add column if not exists max_participants integer,
  add column if not exists team_count integer,
  add column if not exists team_size integer;

alter table public.collectz_sessions
  add constraint collectz_max_participants_positive
    check (max_participants is null or max_participants > 0) not valid;
