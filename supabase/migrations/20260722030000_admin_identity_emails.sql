-- Resolve usage_events identities → real emails for the ops console.
--
-- WHY: usage_events.identity is either an auth user id (signed-in) or `dev:<device>`
-- (signed-out). auth.users is not client-readable, so ops.html could only show an
-- opaque uuid slice for "who". This self-gated security-definer function maps the
-- handful of user-id identities on screen back to their emails. `dev:*` identities
-- are not users and never match — they stay anonymised.
--
-- Non-admins get ZERO rows (the is_admin() guard is in the WHERE) rather than an
-- error — same read-nothing outcome as the admin RLS policies, no data leak.

create or replace function public.admin_identity_emails(p_identities text[])
returns table (identity text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id::text, u.email::text
  from auth.users u
  where public.is_admin()
    and u.id::text = any(p_identities);
$$;

revoke all on function public.admin_identity_emails(text[]) from public, anon;
grant execute on function public.admin_identity_emails(text[]) to authenticated;
