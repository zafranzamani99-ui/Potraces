-- ============================================================
-- Potraces — public launch waitlist (homepage "Notify me")
--
-- Captures email/phone from anonymous visitors on jejakbaki.my.
-- Anyone (signed-out) may INSERT; the list is NOT publicly readable;
-- only an admin (public.is_admin(), from beta_feedback.sql) may read it.
--
-- Apply via: Supabase dashboard > project iydqeeonaljqapulboaz >
--            SQL Editor > paste this whole file > Run.
-- Idempotent. REQUIRES beta_feedback.sql to have been run first
-- (it defines public.is_admin(), used by the admin SELECT policy).
-- ============================================================

-- Fail fast with a clear message if the prerequisite is missing, instead of
-- creating half the objects and then aborting on the admin SELECT policy below.
do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Run docs/beta_feedback.sql first — it defines public.is_admin(), used by this file.';
  end if;
end $$;

create extension if not exists "pgcrypto";

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  contact     text not null,        -- email or phone, as typed
  kind        text,                 -- 'email' | 'phone' (client hint)
  source      text,                 -- 'hero' | 'final' (which form)
  user_agent  text
);

create index if not exists waitlist_created_idx on public.waitlist(created_at desc);

-- launch-blast bookkeeping: stamped when this contact was sent the one "we're live"
-- message, so re-running the blast never messages the same person twice. NULL = not yet notified.
alter table public.waitlist add column if not exists notified_at timestamptz;

-- length guard (mirrors the WITH CHECK below)
alter table public.waitlist drop constraint if exists waitlist_contact_len;
alter table public.waitlist
  add  constraint waitlist_contact_len check (char_length(btrim(contact)) between 3 and 120);

-- de-dupe on the normalized contact so the same person can't pile up rows
create unique index if not exists waitlist_contact_uniq
  on public.waitlist (lower(btrim(contact)));

alter table public.waitlist enable row level security;

-- Anyone may JOIN — INSERT only, with a length guard. No anon SELECT, so the
-- email/phone list can never be read back by the public.
drop policy if exists "waitlist_insert_any" on public.waitlist;
create policy "waitlist_insert_any" on public.waitlist
  for insert to anon, authenticated
  with check (char_length(btrim(contact)) between 3 and 120);

-- The list is private: only an admin may read it (in admin.html / dashboard).
drop policy if exists "waitlist_select_admin" on public.waitlist;
create policy "waitlist_select_admin" on public.waitlist
  for select to authenticated
  using (public.is_admin());

revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon, authenticated;
grant select on public.waitlist to authenticated;  -- still gated to admin by RLS

-- ============================================================
-- Referral + consent columns
--
-- referral_code : each signup gets a short url-safe code so they can share
--                 https://jejakbaki.my/?ref=CODE and we can attribute who they brought in.
-- referred_by   : the waitlist.id of whoever's code they arrived with (nullable).
-- consent_at    : when they ticked "yes, message me at launch" — we never email
--                 anyone whose consent_at is null (and the blast only ever does email).
-- ============================================================
alter table public.waitlist add column if not exists referral_code text;
alter table public.waitlist add column if not exists referred_by   uuid references public.waitlist(id);
alter table public.waitlist add column if not exists consent_at    timestamptz;

-- one code per row; partial so existing rows with NULL code don't collide
create unique index if not exists waitlist_referral_code_uniq
  on public.waitlist (referral_code) where referral_code is not null;

-- ============================================================
-- RPC: public.waitlist_signup(contact, kind, source, ref, consent) -> json
--
-- The ONLY write path the homepage forms use. SECURITY DEFINER so it can read
-- back the new row's position + mint a unique referral_code while RLS keeps the
-- table otherwise admin-read-only. Idempotent on the canonical contact.
--
-- p_kind is ignored (kind is derived server-side from the contact); p_source is
-- whitelisted to 'hero'/'final'. Anti-enumeration: only a genuinely fresh insert
-- (the caller's OWN new row) gets a real position + code back. Probing a contact
-- that's already on the list returns { position:null, referral_code:null,
-- already:true } — so membership, ranks and codes can't be harvested.
--
-- Returns: { "position": int|null, "referral_code": text|null, "already": bool }
-- Raises:  'consent_required' if p_consent is not true.
--          'invalid_contact'  if trimmed length is outside 3..120.
-- ============================================================
create or replace function public.waitlist_signup(
  p_contact text,
  p_kind    text,
  p_source  text,
  p_ref     text default null,
  p_consent boolean default false
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact   text := btrim(coalesce(p_contact, ''));
  v_kind      text;
  v_source    text;
  v_norm      text;
  v_referrer  uuid;
  v_existing  public.waitlist%rowtype;
  v_id        uuid;
  v_created   timestamptz;
  v_code      text;
  v_position  int;
  v_attempts  int := 0;
begin
  -- length guard (mirrors the INSERT WITH CHECK / table constraint)
  if char_length(v_contact) < 3 or char_length(v_contact) > 120 then
    raise exception 'invalid_contact';
  end if;

  -- consent is mandatory: no consent, no row.
  if p_consent is distinct from true then
    raise exception 'consent_required';
  end if;

  -- Derive kind from the actual contact — never trust the client p_kind hint.
  -- An email-shaped string is 'email'; everything else is treated as a phone.
  v_kind := case
    when v_contact ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then 'email'
    else 'phone'
  end;

  -- Whitelist the form source; anything unexpected becomes null.
  v_source := case when p_source in ('hero', 'final') then p_source else null end;

  -- Canonicalize the contact for de-dupe so one person can't pile up rows:
  --   email -> trimmed + lowercased (as before);
  --   phone -> digits only, with a leading '60' country code mapped to '0'
  --            ('+60123', '0123', '012 3' all collapse to the same value).
  -- The canonical phone is stored AS the contact so the unique index dedups it too.
  if v_kind = 'phone' then
    v_contact := regexp_replace(v_contact, '\D', '', 'g');
    if left(v_contact, 2) = '60' then
      v_contact := '0' || substr(v_contact, 3);
    end if;
    -- re-check length after stripping; a contact of only separators is invalid
    if char_length(v_contact) < 3 or char_length(v_contact) > 120 then
      raise exception 'invalid_contact';
    end if;
  end if;
  v_norm := lower(btrim(v_contact));

  -- Already on the list? Stay opaque — never echo this contact's rank or code
  -- back to a caller who only supplied the contact (that would be an enumeration
  -- / referral-code-harvest oracle). 'already' stays true so the homepage can
  -- show a friendly "you're already on the list" message, just without a number.
  select * into v_existing from public.waitlist
   where lower(btrim(contact)) = v_norm
   limit 1;

  if found then
    return json_build_object(
      'position',      null,
      'referral_code', null,
      'already',       true
    );
  end if;

  -- Resolve the referrer from the shared code (ignore unknown codes).
  if p_ref is not null and btrim(p_ref) <> '' then
    select id into v_referrer from public.waitlist
     where referral_code = btrim(p_ref)
     limit 1;
  end if;

  -- Mint a unique 8-char url-safe code, retrying on the rare collision.
  loop
    v_attempts := v_attempts + 1;
    -- base64url of 6 random bytes -> 8 chars, then strip any +/=
    v_code := translate(encode(gen_random_bytes(6), 'base64'), '+/=', '');
    v_code := substr(v_code, 1, 8);
    begin
      insert into public.waitlist (contact, kind, source, user_agent, referral_code, referred_by, consent_at)
      values (v_contact, v_kind, v_source, null, v_code,
              -- referred_by = the referrer's id; self-referral is impossible here because
              -- this row's id doesn't exist until the RETURNING below, so no guard is needed.
              v_referrer, now())
      returning id, created_at into v_id, v_created;
      exit; -- inserted cleanly
    exception when unique_violation then
      -- could be the contact uniq (someone inserted concurrently) or the code uniq.
      -- If the contact now exists, fall through to the "already" path; else retry the code.
      select * into v_existing from public.waitlist
       where lower(btrim(contact)) = v_norm
       limit 1;
      if found then
        -- same opaque response as the direct found-branch: never echo this
        -- contact's existing code / position to a probing caller.
        return json_build_object(
          'position',      null,
          'referral_code', null,
          'already',       true
        );
      end if;
      if v_attempts >= 8 then
        raise; -- give up after 8 code collisions (astronomically unlikely)
      end if;
    end;
  end loop;

  -- 1-based rank by signup time. Deterministic (created_at, id) tuple ordering
  -- so rows sharing an identical created_at still get consecutive ranks.
  select count(*) into v_position from public.waitlist
   where (created_at, id) <= (v_created, v_id);

  -- Fresh insert: this is the caller's OWN brand-new row, so it's safe to reveal
  -- their rank and the code we just minted for them.
  return json_build_object(
    'position',      v_position,
    'referral_code', v_code,
    'already',       false
  );
end;
$$;

grant execute on function public.waitlist_signup(text, text, text, text, boolean) to anon, authenticated;

-- ============================================================
-- RPC: public.waitlist_public_count() -> integer
--
-- The ONLY public path to a number. SECURITY DEFINER so the homepage can show
-- "N already waiting" WITHOUT exposing the list — direct SELECT stays admin-only.
-- ============================================================
create or replace function public.waitlist_public_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int from public.waitlist;
$$;

grant execute on function public.waitlist_public_count() to anon, authenticated;
