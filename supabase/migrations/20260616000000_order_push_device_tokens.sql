-- Fix order-link push notifications to match the qr-payment-webhook sender.
--
-- The original notify_new_order_link() (20260307180000) sent to the single
-- legacy seller_profiles.push_token and omitted channelId + priority. Two bugs:
--   1. It targets ONE token — the last device to register. A seller logged in
--      on two phones (e.g. two counters) only gets alerts on one, and a stale
--      token (old Expo Go / reinstalled device) silently swallows every alert.
--   2. No channelId/priority → Android posts the push to a default low-importance
--      channel, so it lands silently in the shade instead of as a heads-up banner
--      with sound.
--
-- This rewrites the function to send to EVERY row in device_tokens for the
-- seller (with the high-importance 'orders' channel created in
-- src/services/pushNotifications.ts), exactly like sendPushToUser() in
-- supabase/functions/qr-payment-webhook/index.ts. Falls back to the legacy
-- push_token only when a seller has no per-device rows yet.

CREATE OR REPLACE FUNCTION public.notify_new_order_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _user_id uuid;
  _customer_name text;
  _total numeric;
  _body text;
  _tok text;
  _sent_count int := 0;
BEGIN
  -- Only fire for order_link orders
  IF NEW.source != 'order_link' THEN
    RETURN NEW;
  END IF;

  -- Map the order's seller_id (a seller_profiles.id) to the auth user that
  -- device_tokens rows are keyed by.
  SELECT user_id INTO _user_id
    FROM public.seller_profiles
   WHERE id = NEW.seller_id;

  IF _user_id IS NULL THEN
    RETURN NEW;
  END IF;

  _customer_name := COALESCE(NEW.customer_name, 'Pelanggan');
  _total := COALESCE(NEW.total_amount, 0);
  _body := _customer_name || ' baru letak pesanan RM ' ||
           TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM _total::text));

  -- Send to every device the seller is logged into.
  FOR _tok IN
    SELECT token
      FROM public.device_tokens
     WHERE user_id = _user_id
       AND token IS NOT NULL
       AND token <> ''
  LOOP
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      ),
      body := jsonb_build_object(
        'to', _tok,
        'title', 'Pesanan Baru! 🛒',
        'body', _body,
        'sound', 'default',
        'priority', 'high',
        'channelId', 'orders',
        'data', jsonb_build_object('type', 'new_order', 'orderId', NEW.id)
      )
    );
    _sent_count := _sent_count + 1;
  END LOOP;

  -- Fallback: legacy single token, only if the seller has no device_tokens rows.
  IF _sent_count = 0 THEN
    SELECT push_token INTO _tok
      FROM public.seller_profiles
     WHERE id = NEW.seller_id;

    IF _tok IS NOT NULL AND _tok <> '' THEN
      PERFORM net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Accept', 'application/json'
        ),
        body := jsonb_build_object(
          'to', _tok,
          'title', 'Pesanan Baru! 🛒',
          'body', _body,
          'sound', 'default',
          'priority', 'high',
          'channelId', 'orders',
          'data', jsonb_build_object('type', 'new_order', 'orderId', NEW.id)
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
