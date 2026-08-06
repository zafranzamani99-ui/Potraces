-- Apple 1.2 (UGC) moderation foundation: generic content reports + user blocks.
--
-- content_reports — the PUBLIC report inbox. Anyone who can see user-generated
-- content (the unauthenticated Collectz join page on the web counts too) can
-- flag it. Reports are written through the `report-content` edge function
-- (service role, flood-capped per reporter/ip); direct client inserts are also
-- allowed for signed-in users. A reporter reads back only their OWN reports —
-- review + action happen via the admin tools (service role). `context` says
-- what surface was reported ('collectz-join', 'collectz-member', …) and
-- `target_id` is the opaque id of the thing reported (participant id, share
-- code, …) — kept as plain text so one table serves every surface.
--
-- user_blocks — one user blocking another (signed-in users only; anonymous
-- join-page visitors get the client-side mask instead). The blocker no longer
-- sees the blocked user's pools/content. Only the blocker can see or change
-- their own block rows — who blocked whom is never public.
--
-- The report edge function + client writes fail SOFT if this migration isn't
-- applied yet, so shipping the app first degrades to "couldn't send, try
-- later" rather than crashing.
--
-- IDEMPOTENT so a re-run converges after any partial apply.

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid DEFAULT auth.uid(),   -- null for the public (signed-out) join page
  context text NOT NULL CHECK (char_length(context) <= 40),
  target_id text NOT NULL CHECK (char_length(target_id) <= 80),
  reason text NOT NULL CHECK (char_length(reason) <= 280),
  -- Flood-cap key written by the edge function only (ip or device token); the
  -- report-content function counts recent rows by it. Not shown to anyone.
  reporter_key text CHECK (char_length(reporter_key) <= 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Anyone may file a report (the public join page has no session). A signed-in
-- reporter can only attach their OWN id; anonymous reports carry no id.
DROP POLICY IF EXISTS "content_reports insert anyone" ON public.content_reports;
CREATE POLICY "content_reports insert anyone"
  ON public.content_reports FOR INSERT
  TO anon, authenticated
  WITH CHECK (reporter_id IS NULL OR reporter_id = auth.uid());

-- A reporter can read back only their own reports (review is service-role only).
DROP POLICY IF EXISTS "content_reports read own" ON public.content_reports;
CREATE POLICY "content_reports read own"
  ON public.content_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

CREATE INDEX IF NOT EXISTS content_reports_created_idx ON public.content_reports (created_at);
CREATE INDEX IF NOT EXISTS content_reports_reporter_idx ON public.content_reports (reporter_id);
CREATE INDEX IF NOT EXISTS content_reports_reporter_key_idx ON public.content_reports (reporter_key, created_at);
CREATE INDEX IF NOT EXISTS content_reports_context_idx ON public.content_reports (context);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL DEFAULT auth.uid(),
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Blocks are private to the blocker: they add, read, and lift only their own.
DROP POLICY IF EXISTS "user_blocks insert own" ON public.user_blocks;
CREATE POLICY "user_blocks insert own"
  ON public.user_blocks FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "user_blocks read own" ON public.user_blocks;
CREATE POLICY "user_blocks read own"
  ON public.user_blocks FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "user_blocks delete own" ON public.user_blocks;
CREATE POLICY "user_blocks delete own"
  ON public.user_blocks FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id);
