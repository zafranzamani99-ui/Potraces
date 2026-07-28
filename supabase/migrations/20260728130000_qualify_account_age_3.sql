-- Referral qualification: shorten the referred friend's minimum account age
-- from 7 to 3 days before the referrer's reward can pay out (owner decision).
--
-- 20260726000000 seeded qualify_account_age_days=7 and is already applied on the
-- remote, so editing it is inert — this forward migration is what db push applies.
insert into public.app_config (key, value) values
  ('qualify_account_age_days', '3')
on conflict (key) do update set value = excluded.value;
