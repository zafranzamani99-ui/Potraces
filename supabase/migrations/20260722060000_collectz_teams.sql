-- Collectz teams — when the organizer sets capacity by teams (team_count x
-- team_size), those become REAL teams that roster members belong to, not just a
-- way to compute max_participants.
--
-- team_names: editable labels, index-aligned with team_count ("Reds", "Blues").
--   NULL / short array => the UI falls back to "Team 1", "Team 2", ...
--   Editable by the organizer AND by any participant (participants go through the
--   collectz-join edge function, which runs as service-role, so no extra RLS).
-- team_idx: 1-based team a participant belongs to; NULL = unassigned.
--   A move is only allowed into a team with fewer than team_size members — that
--   rule is enforced in the edge function (participants) and the app (organizer),
--   not as a DB constraint, because it depends on a live count.
--
-- Teams do NOT affect money: shares stay per-person regardless of team.
alter table public.collectz_sessions
  add column if not exists team_names text[];

alter table public.collectz_participants
  add column if not exists team_idx integer;

alter table public.collectz_participants
  add constraint collectz_team_idx_positive
    check (team_idx is null or team_idx > 0) not valid;

-- Roster reads are always scoped to one session and frequently grouped by team.
create index if not exists collectz_participants_session_team_idx
  on public.collectz_participants (session_id, team_idx);
