-- Two missing indexes on the CROSS-USER collectz tables (they grow with ALL users, unlike the
-- per-user finance tables, so a seq scan here gets slower as the whole install base grows).
-- Purely additive — CREATE INDEX IF NOT EXISTS, no schema/data change, safe to re-run.

-- 1) collectz_sessions.owner_id had NO index, yet three hot readers filter by it:
--      • the weekly free-tier cap count on the session-CREATE path (.eq owner_id .gte created_at)
--      • the "my sessions" listing (.eq owner_id .order created_at desc)
--      • the RLS policy USING ((select auth.uid()) = owner_id), evaluated per row
--    Without it each is a sequential scan of the whole (global) sessions table. One composite
--    index serves all three.
create index if not exists collectz_sessions_owner_created_idx
  on public.collectz_sessions (owner_id, created_at desc);

-- 2) collectz_participants only had (session_id) and (session_id, user_id) indexes — both LEAD
--    with session_id, so a user_id-only filter ("my joined sessions", plus the self_read /
--    self_update RLS policies USING (user_id = auth.uid())) cannot use them and seq-scans the
--    highest-cardinality collectz table. Partial WHERE user_id IS NOT NULL skips offline roster
--    rows (user_id NULL = a person the organizer tracks manually, never queried by user).
create index if not exists collectz_participants_user_idx
  on public.collectz_participants (user_id)
  where user_id is not null;
