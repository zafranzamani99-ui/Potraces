-- Collectz: optional organizer contact.
-- socials    jsonb — canonical profile URLs keyed by platform:
--            {"ig"|"x"|"threads"|"fb"|"telegram": "https://…"} (any subset, or null)
-- group_url  text  — WhatsApp group invite link (https://chat.whatsapp.com/…)
-- Both nullable: organizers who skip contact lose nothing. Participants see these
-- via the collectz-join `view` projection (public — the organizer opted in).
alter table public.collectz_sessions
  add column if not exists socials jsonb,
  add column if not exists group_url text;
