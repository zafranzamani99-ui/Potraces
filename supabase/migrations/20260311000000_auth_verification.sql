-- ============================================================
-- OTP Verification for Telegram Bot + business mode auth
-- ============================================================

-- OTP verifications table
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text NOT NULL,
  status      text NOT NULL DEFAULT 'pending',  -- pending | verified | expired
  created_at  timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX otp_code_idx ON public.otp_verifications(code) WHERE status = 'pending';
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- User can read own OTP status (for realtime polling)
CREATE POLICY "otp_own_read" ON public.otp_verifications
  FOR SELECT USING (auth.uid() = user_id);

-- Add verification + phone columns to seller_profiles
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone text;

-- Enable realtime for OTP polling
ALTER PUBLICATION supabase_realtime ADD TABLE public.otp_verifications;
