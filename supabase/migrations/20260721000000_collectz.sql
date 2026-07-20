-- Collectz / Kutipz: collaborative group-payment tracking.
--
-- An organizer sets up a session (roster, date/time, venue, cost split, their
-- DuitNow QR) and shares a link. Participants open it in the app, claim their
-- name, pay the organizer's QR, upload proof (image/PDF), and the organizer
-- confirms. Pure tracking — no wallet/debt side effects.
--
-- Access model:
--   * Owner (organizer)       — full CRUD on own sessions + their participants.
--   * Linked participant      — SELECT own participant row + its session;
--                               UPDATE own row, but the guard trigger restricts
--                               them to status/proof fields and the transition
--                               unpaid/rejected -> pending (or cancel pending).
--   * Anon / pre-auth join    — no table access; the collectz-join edge
--                               function (service role) serves public reads by
--                               share_code and handles claim/add_self.
--
-- Cross-table RLS checks go through SECURITY DEFINER helpers — inline
-- EXISTS subqueries between the two tables recurse infinitely (sessions policy
-- reads participants → participants policy reads sessions → …, SQLSTATE 42P17).
--
-- This file is IDEMPOTENT so a re-run converges after any partial apply.

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.collectz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL,
  category text,
  event_at timestamptz,
  venue text,
  details_text text,          -- court no., attire, play style, etc.
  rules_text text,            -- payment rules: deadline, cancel policy
  scheme text NOT NULL CHECK (scheme IN ('flat', 'equal', 'custom')),
  total_amount numeric,       -- for 'equal': the total to split
  default_share numeric,      -- for 'flat': per-person price
  currency text NOT NULL DEFAULT 'MYR',
  pay_by timestamptz,
  qr_payload text,            -- organizer's EMV QR payload (never exposed to anon)
  qr_image_path text,
  share_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collectz_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.collectz_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  user_id uuid,               -- NULL = offline person tracked by the organizer
  slot text NOT NULL DEFAULT 'active' CHECK (slot IN ('active', 'reserve')),
  share_amount numeric,       -- NULL = derived from the session scheme
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'pending', 'confirmed', 'rejected')),
  proof_path text,
  reject_note text,
  marked_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collectz_participants_session_idx
  ON public.collectz_participants (session_id);

-- One linked slot per user per session.
CREATE UNIQUE INDEX IF NOT EXISTS collectz_participants_user_uniq
  ON public.collectz_participants (session_id, user_id)
  WHERE user_id IS NOT NULL;

-- ── updated_at maintenance ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.collectz_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collectz_sessions_touch ON public.collectz_sessions;
CREATE TRIGGER trg_collectz_sessions_touch
  BEFORE UPDATE ON public.collectz_sessions
  FOR EACH ROW EXECUTE FUNCTION public.collectz_touch_updated_at();

DROP TRIGGER IF EXISTS trg_collectz_participants_touch ON public.collectz_participants;
CREATE TRIGGER trg_collectz_participants_touch
  BEFORE UPDATE ON public.collectz_participants
  FOR EACH ROW EXECUTE FUNCTION public.collectz_touch_updated_at();

-- ── RLS helpers (SECURITY DEFINER → inner reads bypass RLS, no recursion) ──

CREATE OR REPLACE FUNCTION public.collectz_is_session_owner(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM collectz_sessions
    WHERE id = _session_id AND owner_id = (select auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.collectz_is_session_participant(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM collectz_participants
    WHERE session_id = _session_id AND user_id = (select auth.uid())
  );
$$;

-- Text-taking variants for storage-path checks — a non-uuid folder name must
-- fail closed (false), never raise, since storage.object policies evaluate
-- for EVERY bucket's rows.
CREATE OR REPLACE FUNCTION public.collectz_is_session_owner(_session_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM collectz_sessions
    WHERE id = _session_id::uuid AND owner_id = (select auth.uid())
  );
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.collectz_is_session_participant(_session_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM collectz_participants
    WHERE session_id = _session_id::uuid AND user_id = (select auth.uid())
  );
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

-- ── Participant guard: what a linked (non-owner) user may change ──────────
--
-- Postgres column grants are role-level, and both organizers and participants
-- are `authenticated`, so field restrictions must live in a trigger instead.

CREATE OR REPLACE FUNCTION public.collectz_participant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_owner boolean;
BEGIN
  -- Service role (edge functions) and the DB admin: allow anything.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM collectz_sessions s
    WHERE s.id = NEW.session_id AND s.owner_id = auth.uid()
  ) INTO _is_owner;

  IF _is_owner THEN
    RETURN NEW;
  END IF;

  -- Linked participant editing their own row.
  IF OLD.user_id = auth.uid() THEN
    -- Immutable for participants: identity, amount, slot, ownership, review fields.
    IF NEW.session_id IS DISTINCT FROM OLD.session_id
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.slot IS DISTINCT FROM OLD.slot
       OR NEW.share_amount IS DISTINCT FROM OLD.share_amount
       OR NEW.reject_note IS DISTINCT FROM OLD.reject_note
       OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
      RAISE EXCEPTION 'collectz: participants may only change status and proof';
    END IF;

    -- Allowed transitions: unpaid/rejected -> pending (submit proof),
    -- pending -> unpaid (withdraw before review). Status may also stay put
    -- (re-uploading a corrected proof while pending).
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status IN ('unpaid', 'rejected') AND NEW.status = 'pending')
        OR (OLD.status = 'pending' AND NEW.status = 'unpaid')
      ) THEN
        RAISE EXCEPTION 'collectz: invalid participant status transition % -> %', OLD.status, NEW.status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'collectz: not allowed';
END;
$$;

DROP TRIGGER IF EXISTS trg_collectz_participant_guard ON public.collectz_participants;
CREATE TRIGGER trg_collectz_participant_guard
  BEFORE UPDATE ON public.collectz_participants
  FOR EACH ROW EXECUTE FUNCTION public.collectz_participant_guard();

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.collectz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collectz_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collectz_sessions_owner_all" ON public.collectz_sessions;
CREATE POLICY "collectz_sessions_owner_all"
  ON public.collectz_sessions
  FOR ALL
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS "collectz_sessions_participant_read" ON public.collectz_sessions;
CREATE POLICY "collectz_sessions_participant_read"
  ON public.collectz_sessions
  FOR SELECT
  USING (public.collectz_is_session_participant(id));

DROP POLICY IF EXISTS "collectz_participants_owner_all" ON public.collectz_participants;
CREATE POLICY "collectz_participants_owner_all"
  ON public.collectz_participants
  FOR ALL
  USING (public.collectz_is_session_owner(session_id))
  WITH CHECK (public.collectz_is_session_owner(session_id));

DROP POLICY IF EXISTS "collectz_participants_self_read" ON public.collectz_participants;
CREATE POLICY "collectz_participants_self_read"
  ON public.collectz_participants
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- No self INSERT policy: roster rows come from the owner (policy above) or the
-- collectz-join edge function (service role, bypasses RLS). This stops a user
-- from forging themselves into arbitrary sessions.

DROP POLICY IF EXISTS "collectz_participants_self_update" ON public.collectz_participants;
CREATE POLICY "collectz_participants_self_update"
  ON public.collectz_participants
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ── Realtime ──────────────────────────────────────────────────────────────
-- RLS applies to realtime: each side only receives rows its SELECT policies
-- expose (owner sees everything; participant sees own row + session).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.collectz_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.collectz_participants;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Proofs storage bucket ─────────────────────────────────────────────────
-- Path convention: {session_id}/{user_id}/{file}. The uploader writes/reads
-- their own folder; the session owner reads anything under their session id.

INSERT INTO storage.buckets (id, name, public)
VALUES ('collectz-proofs', 'collectz-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "collectz_proofs_participant_insert" ON storage.objects;
CREATE POLICY "collectz_proofs_participant_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'collectz-proofs'
    AND (select auth.uid())::text = (storage.foldername(name))[2]
    AND public.collectz_is_session_participant((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "collectz_proofs_read" ON storage.objects;
CREATE POLICY "collectz_proofs_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'collectz-proofs'
    AND (
      (select auth.uid())::text = (storage.foldername(name))[2]
      OR public.collectz_is_session_owner((storage.foldername(name))[1])
    )
  );

DROP POLICY IF EXISTS "collectz_proofs_uploader_update" ON storage.objects;
CREATE POLICY "collectz_proofs_uploader_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'collectz-proofs'
    AND (select auth.uid())::text = (storage.foldername(name))[2]
  );

DROP POLICY IF EXISTS "collectz_proofs_uploader_delete" ON storage.objects;
CREATE POLICY "collectz_proofs_uploader_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'collectz-proofs'
    AND (select auth.uid())::text = (storage.foldername(name))[2]
  );

-- ── Push notifications on status changes ──────────────────────────────────
-- Mirrors notify_new_order_link() (20260616000000): pg_net → Expo push API,
-- one POST per device_tokens row of the target user.

CREATE OR REPLACE FUNCTION public.notify_collectz_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target uuid;
  _title text;
  _body text;
  _type text;
  _session_title text;
  _tok text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT title INTO _session_title
    FROM collectz_sessions
   WHERE id = NEW.session_id;

  IF NEW.status = 'pending' THEN
    -- Participant submitted proof → notify the organizer.
    SELECT owner_id INTO _target FROM collectz_sessions WHERE id = NEW.session_id;
    _title := 'Collectz: payment to review';
    _body := NEW.name || ' uploaded proof for "' || COALESCE(_session_title, 'session') || '"';
    _type := 'collectz_pending';
  ELSIF NEW.status = 'confirmed' THEN
    -- Organizer confirmed → notify the participant (if app-linked).
    _target := NEW.user_id;
    _title := 'Payment confirmed ✅';
    _body := 'Your payment for "' || COALESCE(_session_title, 'session') || '" is confirmed';
    _type := 'collectz_confirmed';
  ELSIF NEW.status = 'rejected' THEN
    _target := NEW.user_id;
    _title := 'Payment rejected';
    _body := 'Your proof for "' || COALESCE(_session_title, 'session') || '" was rejected';
    _type := 'collectz_rejected';
  ELSE
    RETURN NEW;
  END IF;

  IF _target IS NULL THEN
    RETURN NEW;
  END IF;

  FOR _tok IN
    SELECT token
      FROM device_tokens
     WHERE user_id = _target
       AND token IS NOT NULL
       AND token <> ''
  LOOP
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      ),
      body := jsonb_build_object(
        'to', _tok,
        'title', _title,
        'body', _body,
        'sound', 'default',
        'priority', 'high',
        'channelId', 'collectz',
        'data', jsonb_build_object(
          'type', _type,
          'sessionId', NEW.session_id,
          'participantId', NEW.id
        )
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_collectz_status ON public.collectz_participants;
CREATE TRIGGER trg_notify_collectz_status
  AFTER UPDATE OF status ON public.collectz_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_collectz_status();
