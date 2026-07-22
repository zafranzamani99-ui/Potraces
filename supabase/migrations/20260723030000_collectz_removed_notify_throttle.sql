-- Collectz 'removed' notification throttle (audit fix, finding 22 follow-up):
-- collectz-notify's kind='removed' is single-target and therefore exempt from
-- the per-session fanout cooldown — which left it loopable. Stamp the push on
-- the participant row instead, giving a per-(session,target) cooldown: one
-- removal push per target per minute, while removing several DIFFERENT people
-- back-to-back (different rows) stays uncooled. The row still exists at notify
-- time because the documented call order is notify-BEFORE-delete.

alter table public.collectz_participants
  add column if not exists removed_notified_at timestamptz;
