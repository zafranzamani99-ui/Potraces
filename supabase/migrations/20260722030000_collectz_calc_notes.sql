-- Collectz cost notes — the organizer's private per-session scratchpad for
-- working out the per-person amount (court + shuttles ÷ people). Plain nullable
-- text on the session row: RLS already limits session writes to the organizer,
-- and participants never select the session row directly (they go through the
-- collectz-join edge function, which picks explicit columns) — so the note
-- never leaks to the roster.

alter table public.collectz_sessions
  add column if not exists calc_notes text;
