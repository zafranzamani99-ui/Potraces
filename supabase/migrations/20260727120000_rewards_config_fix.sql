-- Fix stale reward config on the remote.
--
-- Why this exists: 20260726000000 seeded the rewards app_config with
-- `on conflict (key) do nothing`. The remote already carried LEGACY referral
-- rows (pre-migration era), so the seed skipped them — leaving
-- reward_welcome_days = 0 and milestone_collectz_days = 0 while
-- reward_referrer_days happened to be right (30). The Invite banner and
-- Collectz quest card read these live ("give 0 days of Pro").
--
-- This migration RE-ASSERTS the intended values with `do update` — the part
-- the original seed couldn't do. Only the reward keys are touched; launch-gate
-- keys (premium_gate_on / premium_gate_start) are admin-controlled and left alone.

insert into public.app_config (key, value) values
  ('reward_tier',                 'pro'),
  ('reward_welcome_days',         '30'),  -- referee, instant on claim
  ('reward_referrer_days',        '30'),  -- referrer, on qualification
  ('reward_referrer_batch_count', '3'),   -- settled friends per payout
  ('reward_cap_per_year',         '12'),  -- max referrer rewards / rolling 365d
  ('milestone_collectz_count',    '3'),   -- qualified collectz joins for the one-time quest
  ('milestone_collectz_days',     '30')   -- one-time Pro grant for the quest
on conflict (key) do update set value = excluded.value;
