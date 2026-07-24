-- push_devices — account-free push registry for admin broadcasts.
--
-- device_tokens is keyed by a NOT NULL auth.users FK with owner-only RLS, so a
-- phone with no personal login can never have a row there — which meant admin
-- broadcasts (broadcast-send) reached only signed-in users. This table is the
-- opposite: one row per Expo push token, NO account required. Every app
-- registers its token on startup via the register-device function (service
-- role), and broadcast-send fans out to every row here.
--
-- RLS is ON with NO policies: only the service role (edge functions) reads or
-- writes. Clients never touch this table directly — register-device validates
-- the token and upserts on their behalf.

CREATE TABLE IF NOT EXISTS public.push_devices (
  token       text PRIMARY KEY,
  platform    text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
-- No policies on purpose — service-role-only access (edge functions).
