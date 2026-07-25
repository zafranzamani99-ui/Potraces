-- Allow 'any' as an explicit skill level ("Open for all level 🙌" parses to it —
-- distinct from NULL = organizer didn't say).
ALTER TABLE public.collectz_sessions DROP CONSTRAINT IF EXISTS collectz_sessions_skill_level_check;
ALTER TABLE public.collectz_sessions
  ADD CONSTRAINT collectz_sessions_skill_level_check
    CHECK (skill_level IS NULL OR skill_level IN ('beginner', 'intermediate', 'advanced', 'any'));
