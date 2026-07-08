-- Live-update for Quick Log: the app subscribes to quick_log_inbox INSERTs so
-- a Back Tap entry appears on an open screen instantly — without depending on
-- push permission or AppState transitions (both proved unreliable triggers
-- when the Shortcut runs OVER the open app). RLS still applies to realtime:
-- subscribers only receive rows the owner SELECT policy exposes.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_log_inbox;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already in the publication
END $$;
