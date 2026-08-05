-- ============================================================
-- Potraces — beta_feedback insert rate-limit
--
-- The in-app "Report a bug / idea" form and the web form (site/beta.html) both
-- insert into public.beta_feedback with no ceiling — a signed-in account could
-- spam unlimited rows + screenshots. This BEFORE INSERT trigger caps a single
-- user to 5 reports per rolling 10 minutes. Because both surfaces go through the
-- same table, this protects the app AND the website at once.
--
-- Mirrors the beta-signup hourly-cap pattern (count recent rows, raise if over).
-- Apply via: Supabase dashboard > project iydqeeonaljqapulboaz > SQL Editor >
--            paste this whole file > Run. Idempotent (safe to re-run).
-- ============================================================

create or replace function public.beta_feedback_ratelimit()
  returns trigger
  language plpgsql
  security definer set search_path = public as $$
declare
  recent int;
begin
  -- The beta_feedback.user_id column DEFAULT auth.uid() is applied before this
  -- BEFORE-INSERT trigger fires, so new.user_id is reliably the caller's id.
  -- security definer lets the count see ALL of the caller's rows regardless of RLS.
  select count(*) into recent
    from public.beta_feedback
   where user_id = new.user_id
     and created_at > now() - interval '10 minutes';
  if recent >= 5 then
    raise exception 'feedback_rate_limited'
      using hint = 'Too many reports in a short time — please wait a few minutes.';
  end if;
  return new;
end;
$$;

revoke all on function public.beta_feedback_ratelimit() from public, anon;

drop trigger if exists beta_feedback_ratelimit_trg on public.beta_feedback;
create trigger beta_feedback_ratelimit_trg
  before insert on public.beta_feedback
  for each row execute function public.beta_feedback_ratelimit();
