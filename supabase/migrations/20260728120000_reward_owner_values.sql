-- Owner reward tuning (2026-07-27 decision) as a fresh FORWARD migration.
--
-- Why a new file instead of editing 20260727120000: the tuning was authored in
-- 20260727000000 (friend welcome 30->15, Collectz milestone 3->5), but the
-- later-sorting repair 20260727120000 re-asserted the LEGACY 30/3 with `do update`.
-- Both are already applied on the remote (migration list: remote-recorded), so
-- editing either is inert — `supabase db push` only runs migration versions the
-- remote hasn't seen. This forward migration is the one thing push will apply, and
-- its unconditional upsert lands the intended values no matter the current live state.
insert into public.app_config (key, value) values
  ('reward_welcome_days',      '15'),  -- referee friend welcome gift, instant on claim
  ('milestone_collectz_count', '5')    -- qualified Collectz joins for the one-time milestone
on conflict (key) do update set value = excluded.value;
