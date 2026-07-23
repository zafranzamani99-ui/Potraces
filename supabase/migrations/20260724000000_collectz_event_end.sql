-- Collectz: optional event END time.
--
-- Sessions only stored a single `event_at` (start), so a "9pm-11pm" announcement
-- collapsed to "9pm" — the end was lost. This adds a nullable end so screens can
-- render a range ("9:00 – 11:00 PM"). Existing rows keep event_end = NULL and
-- render exactly as before (single start time). Idempotent.
ALTER TABLE public.collectz_sessions
  ADD COLUMN IF NOT EXISTS event_end timestamptz;
