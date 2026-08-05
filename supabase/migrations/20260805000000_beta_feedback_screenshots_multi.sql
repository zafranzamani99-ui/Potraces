-- ============================================================
-- Potraces — multiple screenshots per beta_feedback report (max 3)
--
-- The in-app "Report a bug / idea" form can attach up to 3 screenshots. They are
-- stored as an array of storage paths in a new screenshot_paths column. The
-- single screenshot_path column stays as-is for the web form (site/beta.html)
-- and for existing rows. Every path still lives under the owner's own <uid>/
-- folder in the private beta-screenshots bucket.
--
-- Apply via your live Supabase project's SQL Editor (the one the app's
-- EXPO_PUBLIC_SUPABASE_URL and site/admin.html point at). Idempotent.
-- ============================================================

alter table public.beta_feedback
  add column if not exists screenshot_paths text[];

-- At most 3 elements, and every element under the owner's <uid>/ folder
-- (defense in depth, same rule as the single screenshot_path column).
-- A CHECK constraint cannot contain a subquery, so the per-element test lives in
-- an IMMUTABLE helper function (a CHECK is allowed to call a function).
create or replace function public.beta_feedback_paths_ok(paths text[], uid uuid)
  returns boolean
  language sql immutable as $$
  select coalesce(array_length(paths, 1), 0) <= 3
     and coalesce(
           (select bool_and(p like uid::text || '/%') from unnest(paths) as p),
           true
         );
$$;

alter table public.beta_feedback drop constraint if exists beta_feedback_shotpaths_chk;
alter table public.beta_feedback
  add constraint beta_feedback_shotpaths_chk
  check (public.beta_feedback_paths_ok(screenshot_paths, user_id));

-- Testers may write their own screenshot_paths (a content column, mirroring the
-- existing screenshot_path grant). Row scope is the existing update_own policy.
grant update (screenshot_paths) on public.beta_feedback to authenticated;
