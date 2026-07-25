-- Collectz: notify the organizer when a PLAYER joins, moves between, or leaves
-- a team (self-serve via the collectz-join edge function, which runs as the
-- service role). The organizer's own roster edits (their client runs under
-- their own JWT) stay silent — you don't need a push for what you just did.
--
-- Scope rules:
--  * Teams sessions only (session.team_count IS NOT NULL).
--  * INSERT (add_self straight into a team)        → "{name} joined {team}"
--  * UPDATE team_idx NULL → X                      → "{name} joined {team}"
--  * UPDATE team_idx X → Y                         → "{name} moved to {team}"
--  * UPDATE team_idx X → NULL                      → "{name} left {team}"
-- Team label = team_names[idx-1] when set, else "Team N".

CREATE OR REPLACE FUNCTION public.collectz_team_label(_names jsonb, _idx int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(btrim(_names ->> (_idx - 1)), ''),
    'Team ' || _idx::text
  );
$$;

CREATE OR REPLACE FUNCTION public.notify_collectz_team_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _team_count int;
  _team_names jsonb;
  _session_title text;
  _actor_is_owner boolean;
  _body text;
  _tok text;
BEGIN
  SELECT owner_id, team_count, team_names, title
    INTO _owner, _team_count, _team_names, _session_title
    FROM collectz_sessions
   WHERE id = NEW.session_id;

  -- Teams sessions only; ownerless sessions can't be notified anyway.
  IF _team_count IS NULL OR _owner IS NULL THEN
    RETURN NEW;
  END IF;

  -- The organizer reshuffling their own roster (their JWT on the update)
  -- doesn't need a push. Service-role calls (collectz-join: claim / add_self /
  -- set_team) have auth.uid() = NULL, so participant self-serve still fires.
  _actor_is_owner := auth.uid() IS NOT NULL AND auth.uid() = _owner;
  IF _actor_is_owner THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.team_idx IS NULL THEN
      RETURN NEW;
    END IF;
    _body := NEW.name || ' joined ' || public.collectz_team_label(_team_names, NEW.team_idx)
             || ' in "' || COALESCE(_session_title, 'session') || '"';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.team_idx IS NOT DISTINCT FROM OLD.team_idx THEN
      RETURN NEW;
    END IF;
    IF NEW.team_idx IS NULL THEN
      _body := NEW.name || ' left ' || public.collectz_team_label(_team_names, OLD.team_idx)
               || ' in "' || COALESCE(_session_title, 'session') || '"';
    ELSIF OLD.team_idx IS NULL THEN
      _body := NEW.name || ' joined ' || public.collectz_team_label(_team_names, NEW.team_idx)
               || ' in "' || COALESCE(_session_title, 'session') || '"';
    ELSE
      _body := NEW.name || ' moved to ' || public.collectz_team_label(_team_names, NEW.team_idx)
               || ' in "' || COALESCE(_session_title, 'session') || '"';
    END IF;
  END IF;

  FOR _tok IN
    SELECT token
      FROM device_tokens
     WHERE user_id = _owner
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
        'title', 'Collectz: team change',
        'body', _body,
        'sound', 'default',
        'priority', 'high',
        'channelId', 'collectz',
        'data', jsonb_build_object(
          'type', 'collectz_team_change',
          'sessionId', NEW.session_id,
          'participantId', NEW.id
        )
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_collectz_team_change ON public.collectz_participants;
CREATE TRIGGER trg_notify_collectz_team_change
  AFTER INSERT OR UPDATE OF team_idx ON public.collectz_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_collectz_team_change();
