-- Collectz: per-session join approval.
--
-- An organizer can now require their approval before an unknown SELF-ADD
-- becomes a roster member. The model deliberately mirrors the payment flow's
-- unpaid → pending → confirmed pattern, but on a SEPARATE column so the
-- payment status machine (and its guard/notify triggers) is untouched:
--
--   collectz_sessions.join_requires_approval  boolean, default false.
--     false = zero behavior change for existing sessions.
--   collectz_participants.join_status         'active' | 'requested' | 'rejected',
--     default 'active' — every existing row is 'active', so nothing moves.
--
-- Flow (toggle ON):
--   * claim of an organizer-pre-added name → still instant (the row was
--     created 'active'; claiming only links user_id).
--   * add_self → collectz-join inserts join_status='requested' → organizer
--     gets a push (trigger below). Requested rows are NOT roster members:
--     they're excluded from shares/capacity (edge function + collectzMath)
--     and hidden from the public roster projection.
--   * organizer approves → join_status='active' → requester gets a push.
--   * organizer declines → join_status='rejected' (row KEPT so the requester
--     can see the outcome) → requester gets a push. The organizer can delete
--     the declined row afterwards, which frees the requester to ask again.
--
-- The toggle never affects people already on the roster — it is read only at
-- add_self time.

-- ── Columns ───────────────────────────────────────────────────────────────

alter table public.collectz_sessions
  add column if not exists join_requires_approval boolean not null default false;

alter table public.collectz_participants
  add column if not exists join_status text not null default 'active';

alter table public.collectz_participants
  drop constraint if exists collectz_participants_join_status_check;
alter table public.collectz_participants
  add constraint collectz_participants_join_status_check
    check (join_status in ('active', 'requested', 'rejected'));

-- ── Participant guard: keep join_status organizer-only, gate payment ──────
-- Full replace of collectz_participant_guard (20260721000000). Two additions:
--   1. join_status joins the immutable-for-participants list — a requester
--      must never approve themselves.
--   2. A row whose join isn't approved yet can't move money: no status
--      transition (proof upload / withdraw) while join_status <> 'active'.
--      Self-hide (archived_at) stays allowed — it touches nothing else.

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
    -- Immutable for participants: identity, amount, slot, ownership, review
    -- fields, and the join-approval state (organizer-only).
    IF NEW.session_id IS DISTINCT FROM OLD.session_id
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.slot IS DISTINCT FROM OLD.slot
       OR NEW.share_amount IS DISTINCT FROM OLD.share_amount
       OR NEW.reject_note IS DISTINCT FROM OLD.reject_note
       OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
       OR NEW.join_status IS DISTINCT FROM OLD.join_status THEN
      RAISE EXCEPTION 'collectz: participants may only change status and proof';
    END IF;

    -- A requested/declined join is not a member yet — no payment moves.
    IF NEW.status IS DISTINCT FROM OLD.status AND OLD.join_status <> 'active' THEN
      RAISE EXCEPTION 'collectz: join not approved yet';
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

-- ── Push notifications for the join-approval flow ─────────────────────────
-- Mirrors notify_collectz_status() (20260721000000) and
-- notify_collectz_team_change() (20260725000000): pg_net → Expo push API.
--   INSERT join_status='requested'  → push the ORGANIZER ("join request")
--   UPDATE requested → active       → push the requester ("approved")
--   UPDATE requested → rejected     → push the requester ("declined")
-- The organizer's own roster inserts are 'active' by default, so adding
-- names by hand never buzzes anyone.

CREATE OR REPLACE FUNCTION public.notify_collectz_join()
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
  SELECT title INTO _session_title
    FROM collectz_sessions
   WHERE id = NEW.session_id;

  IF TG_OP = 'INSERT' THEN
    -- New self-add request → notify the organizer.
    IF NEW.join_status <> 'requested' THEN
      RETURN NEW;
    END IF;
    SELECT owner_id INTO _target FROM collectz_sessions WHERE id = NEW.session_id;
    _title := 'Collectz: join request';
    _body := NEW.name || ' wants to join "' || COALESCE(_session_title, 'session') || '"';
    _type := 'collectz_join_requested';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.join_status IS NOT DISTINCT FROM OLD.join_status THEN
      RETURN NEW;
    END IF;
    IF OLD.join_status = 'requested' AND NEW.join_status = 'active' THEN
      -- Approved → notify the requester (if app-linked).
      _target := NEW.user_id;
      _title := 'Join request approved ✅';
      _body := 'You are in "' || COALESCE(_session_title, 'session') || '" — see you there!';
      _type := 'collectz_join_approved';
    ELSIF OLD.join_status = 'requested' AND NEW.join_status = 'rejected' THEN
      _target := NEW.user_id;
      _title := 'Join request declined';
      _body := 'Your request to join "' || COALESCE(_session_title, 'session') || '" was declined';
      _type := 'collectz_join_rejected';
    ELSE
      RETURN NEW;
    END IF;
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

DROP TRIGGER IF EXISTS trg_notify_collectz_join ON public.collectz_participants;
CREATE TRIGGER trg_notify_collectz_join
  AFTER INSERT OR UPDATE OF join_status ON public.collectz_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_collectz_join();
