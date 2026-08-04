-- Collectz moderation: user reports (Apple 1.2 UGC).
--
-- Any signed-in user who sees an offensive/abusive name or content in Collectz
-- can file a report. Reports land here for the team to review + act on (approve
-- a removal, warn, or dismiss) via the admin tools (service role). A reporter
-- can only insert/read their OWN reports; they never see anyone else's.
--
-- The client insert (services/collectzService.ts reportParticipant) fails SOFT
-- if this table is absent, so shipping the app before this migration is applied
-- degrades to "couldn't send, try later" rather than crashing.
--
-- IDEMPOTENT so a re-run converges after any partial apply.

CREATE TABLE IF NOT EXISTS public.collectz_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.collectz_sessions(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.collectz_participants(id) ON DELETE SET NULL,
  reported_user_id uuid,        -- account id of the reported person, if they have one
  reported_name text,           -- snapshot of the reported name (offline entries have no user_id)
  reason text NOT NULL DEFAULT 'user_report',
  reporter_id uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collectz_reports ENABLE ROW LEVEL SECURITY;

-- A signed-in user may file a report only as themselves.
DROP POLICY IF EXISTS "collectz_reports insert own" ON public.collectz_reports;
CREATE POLICY "collectz_reports insert own"
  ON public.collectz_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- A reporter can read back only their own reports (review is service-role only).
DROP POLICY IF EXISTS "collectz_reports read own" ON public.collectz_reports;
CREATE POLICY "collectz_reports read own"
  ON public.collectz_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

CREATE INDEX IF NOT EXISTS collectz_reports_session_idx ON public.collectz_reports (session_id);
CREATE INDEX IF NOT EXISTS collectz_reports_status_idx ON public.collectz_reports (status);
CREATE INDEX IF NOT EXISTS collectz_reports_reporter_idx ON public.collectz_reports (reporter_id);
