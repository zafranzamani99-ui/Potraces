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
alter table public.beta_feedback drop constraint if exists beta_feedback_shotpaths_chk;
alter table public.beta_feedback
  add constraint beta_feedback_shotpaths_chk check (
    screenshot_paths is null
    or (
      coalesce(array_length(screenshot_paths, 1), 0) <= 3
      and (
        select bool_and(p like user_id::text || '/%')
        from unnest(screenshot_paths) as p
      )
    )
  );

-- Testers may write their own screenshot_paths (a content column, mirroring the
-- existing screenshot_path grant). Row scope is the existing update_own policy.
grant update (screenshot_paths) on public.beta_feedback to authenticated;
