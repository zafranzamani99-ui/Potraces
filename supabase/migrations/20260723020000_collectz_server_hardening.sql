-- Collectz server hardening (audit fixes):
--  * last_notified_at        — 60s cooldown stamp for collectz-notify fanouts.
--  * collectz_view_attempts  — per-IP share_code MISS log; collectz-join 429s
--                              an IP with too many recent misses (brute-force
--                              enumeration brake). Service-role only.
--  * participant guard       — proof submission (-> pending) now requires the
--                              parent session to still be 'open', so a
--                              settled/cancelled session rejects uploads.
--  * notify_collectz_status  — fires on slot changes too: a reserve promoted
--                              to active gets a push (was completely silent);
--                              the 'rejected' push now carries reject_note so
--                              the participant learns WHY.
--  * proofs owner delete     — the organizer can actually delete a proof
--                              object (remove participant / reset / delete
--                              session); the only DELETE policy was
--                              uploader-only, so those removals silently
--                              failed and orphaned bank receipts forever.

-- ── collectz-notify cooldown stamp ─────────────────────────────────────────

alter table public.collectz_sessions
  add column if not exists last_notified_at timestamptz;

-- ── share_code brute-force brake ───────────────────────────────────────────
-- Only failed lookups are logged (real codes never miss), so legit traffic is
-- never throttled. Rows are pruned opportunistically by the edge function.

create table if not exists public.collectz_view_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists collectz_view_attempts_ip_time_idx
  on public.collectz_view_attempts (ip, attempted_at);

alter table public.collectz_view_attempts enable row level security;
-- No policies: only the collectz-join edge function (service role) touches it.

-- ── Participant guard: no proof uploads into a closed session ──────────────
-- Same body as 20260721000000 plus the session-status check on -> pending.

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

      -- Submitting proof only makes sense while the session is still open —
      -- a settled/cancelled session must not accept new payments to review.
      IF NEW.status = 'pending' AND NOT EXISTS (
        SELECT 1 FROM collectz_sessions s
        WHERE s.id = NEW.session_id AND s.status = 'open'
      ) THEN
        RAISE EXCEPTION 'collectz: session is closed';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'collectz: not allowed';
END;
$$;

-- ── Status/slot push: promotion + rejection reason ─────────────────────────
-- Same body as 20260721000000 plus the reserve->active promotion push and the
-- reject_note suffix on the 'rejected' body. Trigger now also fires on slot.

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
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.slot IS NOT DISTINCT FROM OLD.slot THEN
    RETURN NEW;
  END IF;

  SELECT title INTO _session_title
    FROM collectz_sessions
   WHERE id = NEW.session_id;

  IF OLD.slot = 'reserve' AND NEW.slot = 'active' THEN
    -- Promoted off the waiting list → notify the participant (if app-linked).
    _target := NEW.user_id;
    _title := 'You''re playing! 🎉';
    _body := 'A spot opened in "' || COALESCE(_session_title, 'session') || '" — you moved from reserve to playing. Check your share.';
    _type := 'collectz_promoted';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
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
      IF NEW.reject_note IS NOT NULL AND btrim(NEW.reject_note) <> '' THEN
        _body := _body || ': ' || NEW.reject_note;
      END IF;
      _type := 'collectz_rejected';
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

DROP TRIGGER IF EXISTS trg_notify_collectz_status ON public.collectz_participants;
CREATE TRIGGER trg_notify_collectz_status
  AFTER UPDATE OF status, slot ON public.collectz_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_collectz_status();

-- ── Proofs bucket: organizer may delete under their own session ────────────
-- Permissive policies OR together — the uploader-delete policy stays.

drop policy if exists "collectz_proofs_owner_delete" on storage.objects;
create policy "collectz_proofs_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'collectz-proofs'
    and public.collectz_is_session_owner((storage.foldername(name))[1])
  );
