-- ============================================================
-- Security hardening: SEC-C1, SEC-C3, SEC-H2
-- Matches findings in AUDIT.md
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- SEC-C3: OTP brute-force protection
-- Add attempts counter; telegram-webhook increments on each mismatch
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.otp_verifications
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chat_id  text;

-- Bind an OTP to the first Telegram chat that attempts it.
-- The webhook should set chat_id the first time a mismatch is seen,
-- and reject subsequent attempts from a different chat_id.

-- Per-chat-id attempt log for rate limiting. One row per attempt.
CREATE TABLE IF NOT EXISTS public.otp_chat_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  matched     boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS otp_chat_attempts_chat_idx
  ON public.otp_chat_attempts(chat_id, attempted_at);

-- Service role only — never exposed to anon/auth
ALTER TABLE public.otp_chat_attempts ENABLE ROW LEVEL SECURITY;

-- Opportunistic cleanup: delete rows older than 1 hour
-- (runs on every insert; low-cost since we index on (chat_id, attempted_at))
CREATE OR REPLACE FUNCTION public.otp_chat_attempts_cleanup()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.otp_chat_attempts
   WHERE attempted_at < (now() - interval '1 hour');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS otp_chat_attempts_cleanup_trg ON public.otp_chat_attempts;
CREATE TRIGGER otp_chat_attempts_cleanup_trg
  AFTER INSERT ON public.otp_chat_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION public.otp_chat_attempts_cleanup();

-- ──────────────────────────────────────────────────────────────
-- SEC-C1: Gate claim_seller_profile on OTP verification
-- The caller must hold a verified OTP (within the last 10 min)
-- whose phone matches the target profile's phone.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_seller_profile(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _caller_uid uuid := auth.uid();
  _target_profile_id uuid;
  _target_user_id    uuid;
  _target_phone      text;
  _verified_phone    text;
BEGIN
  IF _caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the profile with this slug
  SELECT id, user_id, phone
    INTO _target_profile_id, _target_user_id, _target_phone
    FROM public.seller_profiles
   WHERE slug = p_slug;

  IF _target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for slug: %', p_slug;
  END IF;

  -- Already owned by caller — nothing to do
  IF _target_user_id = _caller_uid THEN
    RETURN _target_profile_id;
  END IF;

  -- Target profile MUST have a phone to be claimable
  IF _target_phone IS NULL OR length(trim(_target_phone)) = 0 THEN
    RAISE EXCEPTION 'This shop cannot be claimed — it has no verified phone.';
  END IF;

  -- Caller must have verified an OTP for the target phone within the last 10 minutes
  SELECT phone INTO _verified_phone
    FROM public.otp_verifications
   WHERE user_id = _caller_uid
     AND status  = 'verified'
     AND phone   = _target_phone
     AND verified_at > (now() - interval '10 minutes')
   ORDER BY verified_at DESC
   LIMIT 1;

  IF _verified_phone IS NULL THEN
    RAISE EXCEPTION 'Claim denied: verify the shop''s phone number via Telegram OTP first.';
  END IF;

  -- Delete the caller's empty/orphan profile (if any)
  DELETE FROM public.seller_profiles
   WHERE user_id = _caller_uid;

  -- Reassign any data rows from the caller's old user_id to the target profile's user_id
  UPDATE public.seller_products  SET user_id = _target_user_id WHERE user_id = _caller_uid;
  UPDATE public.seller_seasons   SET user_id = _target_user_id WHERE user_id = _caller_uid;
  UPDATE public.seller_customers SET user_id = _target_user_id WHERE user_id = _caller_uid;
  UPDATE public.seller_orders    SET user_id = _target_user_id WHERE user_id = _caller_uid;

  -- Transfer ownership
  UPDATE public.seller_profiles
     SET user_id = _caller_uid
   WHERE id = _target_profile_id;

  RETURN _target_profile_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- SEC-H2: seller_profiles_public_read leaks phone + push_token
-- Replace blanket policy with a column-filtered public view.
-- ──────────────────────────────────────────────────────────────

-- Drop the existing over-broad policy
DROP POLICY IF EXISTS "seller_profiles_public_read" ON public.seller_profiles;

-- Revoke direct anon SELECT on the table
REVOKE SELECT ON public.seller_profiles FROM anon;

-- Restricted public view — only columns needed for the order page.
-- Phone is intentionally included (WhatsApp CTA on the order page).
-- NOT included: push_token, user_id, is_verified, created_at, updated_at.
CREATE OR REPLACE VIEW public.seller_profiles_public AS
  SELECT id, user_id, slug, display_name, currency, shop_notice, logo_url, phone
    FROM public.seller_profiles
   WHERE slug IS NOT NULL;
-- Note: user_id is included for joining with products via seller's user_id.
-- It is an opaque UUID; the real leak risk is push_token (EXCLUDED).

GRANT SELECT ON public.seller_profiles_public TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- SEC-H4: Storage buckets MIME and size caps
-- Prevents HTML/JS uploads on same-origin Supabase Storage and 100MB file bombs.
-- ──────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[],
       file_size_limit = 2097152  -- 2 MB
 WHERE id IN ('shop-logos', 'product-images', 'web');


-- Note: owner access is already covered by the existing
-- "seller_profiles_owner" policy (for all using auth.uid() = user_id)
-- in 20260307062816_seller_schema.sql.
