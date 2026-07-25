-- Collectz: player requirements — skill level, age group, gender option, and
-- venue booking status. All optional (NULL = not specified / open to all).
-- Organizer sets them at create/edit; participants see them before joining.

ALTER TABLE public.collectz_sessions
  ADD COLUMN IF NOT EXISTS skill_level text,
  ADD COLUMN IF NOT EXISTS age_req text,
  ADD COLUMN IF NOT EXISTS gender_req text,
  ADD COLUMN IF NOT EXISTS booking_status text;

ALTER TABLE public.collectz_sessions
  DROP CONSTRAINT IF EXISTS collectz_sessions_skill_level_check,
  DROP CONSTRAINT IF EXISTS collectz_sessions_age_req_check,
  DROP CONSTRAINT IF EXISTS collectz_sessions_gender_req_check,
  DROP CONSTRAINT IF EXISTS collectz_sessions_booking_status_check;

ALTER TABLE public.collectz_sessions
  ADD CONSTRAINT collectz_sessions_skill_level_check
    CHECK (skill_level IS NULL OR skill_level IN ('beginner', 'intermediate', 'advanced')),
  ADD CONSTRAINT collectz_sessions_age_req_check
    CHECK (age_req IS NULL OR age_req IN ('below_18', '18_above', 'any')),
  ADD CONSTRAINT collectz_sessions_gender_req_check
    CHECK (gender_req IS NULL OR gender_req IN ('male', 'female', 'any')),
  ADD CONSTRAINT collectz_sessions_booking_status_check
    CHECK (booking_status IS NULL OR booking_status IN ('booked', 'later'));
