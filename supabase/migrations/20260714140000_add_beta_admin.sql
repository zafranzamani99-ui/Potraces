-- Add jejakbaki.app@gmail.com as a SECOND beta-feedback admin.
-- zafranzamani99@gmail.com stays an admin — both accounts have full access.
--
-- The admin allowlist is DATA, not code. public.app_admins is the single source of truth
-- behind public.is_admin(), which gates every RLS policy on beta_feedback, beta_installers,
-- the beta-screenshots storage bucket, and the waitlist-blast edge function. is_admin()
-- returns true when the caller's verified JWT email matches ANY row, so N admins = N rows.
-- Nothing in site/admin.html or site/beta.html needs to change.
--
-- The new admin must be able to actually SIGN IN with this exact address (magic link or
-- Google). Verify: sign in at jejakbaki.my/admin.html as jejakbaki.app@gmail.com and confirm
-- the full report list loads.
--
-- To revoke an admin later:
--   delete from public.app_admins where lower(email) = lower('someone@example.com');

insert into public.app_admins (email) values ('jejakbaki.app@gmail.com')
  on conflict (email) do nothing;
