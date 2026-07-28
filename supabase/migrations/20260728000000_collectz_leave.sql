-- Collectz: "leave / unclaim" support.
--
-- The collectz-join `leave` action needs to tell two roster rows apart:
--   * a row the organizer pre-added and the caller later CLAIMED  → only FREE
--     it (clear user_id) so the organizer's slot + name stay on the roster;
--   * a row the caller SELF-ADDED (add_self)                      → DROP it
--     entirely, since it was never part of the organizer's setup.
-- Nothing in the existing schema records that origin, so stamp it: add_self
-- sets self_added=true; organizer-added rows keep the default false.
--
-- Pre-existing rows default to false (there is no reliable signal to identify
-- past self-adds after the fact). Harmless: leave was disabled until now, so
-- there is no established behaviour to change — the worst case for an old
-- self-added row is that leaving unclaims instead of deleting it, leaving one
-- orphan unclaimed name the organizer can remove.
alter table public.collectz_participants
  add column if not exists self_added boolean not null default false;
