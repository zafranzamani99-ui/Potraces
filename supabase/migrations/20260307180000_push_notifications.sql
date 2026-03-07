-- Add push token column for Expo push notifications
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS push_token text;

-- Allow the owner to update their own push_token
-- (existing RLS policy already covers UPDATE for owner rows)

-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function: send push notification on new order_link order
CREATE OR REPLACE FUNCTION public.notify_new_order_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _push_token text;
  _seller_name text;
  _customer_name text;
  _total numeric;
BEGIN
  -- Only fire for order_link orders
  IF NEW.source != 'order_link' THEN
    RETURN NEW;
  END IF;

  -- Look up the seller's push token
  SELECT push_token, display_name
    INTO _push_token, _seller_name
    FROM public.seller_profiles
   WHERE id = NEW.seller_id;

  -- No token = no push
  IF _push_token IS NULL OR _push_token = '' THEN
    RETURN NEW;
  END IF;

  _customer_name := COALESCE(NEW.customer_name, 'Pelanggan');
  _total := COALESCE(NEW.total_amount, 0);

  -- Send via Expo Push API using pg_net
  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := jsonb_build_object(
      'to', _push_token,
      'title', 'Pesanan Baru! 🛒',
      'body', _customer_name || ' baru letak pesanan RM ' || TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM _total::text)),
      'sound', 'default',
      'data', jsonb_build_object('type', 'new_order', 'orderId', NEW.id)
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger on new order_link orders
DROP TRIGGER IF EXISTS trg_notify_order_link ON public.seller_orders;
CREATE TRIGGER trg_notify_order_link
  AFTER INSERT ON public.seller_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_order_link();
