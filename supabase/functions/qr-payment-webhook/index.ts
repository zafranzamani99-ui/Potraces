import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * qr-payment-webhook — the soundbox replacement.
 *
 * A configured PSP (Fiuu / HitPay / Curlec) POSTs here when a buyer pays a
 * DuitNow QR it issued. We verify the signature, dedupe by event id, mark the
 * order paid, record a payment_event (the in-app feed), and push "Payment
 * received" to every device the seller is logged into. That push is the
 * soundbox — it must fire within seconds, every time, even backgrounded.
 *
 * Register the PSP's webhook URL as:
 *   https://<project>.functions.supabase.co/qr-payment-webhook?provider=hitpay
 *
 * Secrets (Supabase edge-function secrets, never bundled):
 *   HITPAY_WEBHOOK_SALT / FIUU_WEBHOOK_SECRET — per-provider signing secret.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, hitpay-signature, x-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Provider = 'fiuu' | 'hitpay';

interface ParsedEvent {
  eventId: string;       // unique per webhook delivery (idempotency key)
  chargeId: string;      // provider charge/payment id → seller_orders.psp_transaction_id
  refId: string;         // the app refId the charge was created with (a seller_orders.id)
  amountCents: number;
  currency: string;
  paid: boolean;         // only act when the event means "paid/succeeded"
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const provider = url.searchParams.get('provider') as Provider | null;
  if (provider !== 'fiuu' && provider !== 'hitpay') {
    return json({ error: 'Unknown or missing provider' }, 400);
  }

  // Raw body is required for signature verification — read it before parsing.
  const rawBody = await req.text();

  // 1) Verify the signature. Reject unsigned/forged calls.
  const verified = await verifySignature(provider, rawBody, req.headers);
  if (verified === 'not_configured') return json({ error: 'Webhook secret not configured' }, 500);
  if (!verified) return json({ error: 'Invalid signature' }, 401);

  // 2) Parse the provider event.
  let event: ParsedEvent;
  try {
    event = parseProviderEvent(provider, rawBody);
  } catch (e) {
    return json({ error: `Unparseable event: ${(e as Error).message}` }, 400);
  }
  // Acknowledge non-payment events (refunds, pending…) without acting.
  if (!event.paid) return json({ ok: true, ignored: 'not a paid event' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3) Idempotency: claim the event id first. A duplicate delivery conflicts.
  const claim = await admin
    .from('processed_webhook_events')
    .insert({ provider, event_id: event.eventId });
  if (claim.error) {
    // Unique violation → already processed. Anything else → surface as 500.
    if ((claim.error as { code?: string }).code === '23505') {
      return json({ ok: true, duplicate: true });
    }
    return json({ error: claim.error.message }, 500);
  }

  // 4–7) Process. If any step throws, RELEASE the idempotency claim so the
  //       PSP's retry reprocesses — otherwise a partial failure (e.g. the
  //       mark-paid succeeds but the push call throws) would be permanently
  //       skipped as a "duplicate" and the payment lost.
  try {
    // Find the order this charge belongs to.
    const { data: order } = await admin
      .from('seller_orders')
      .select('id, user_id, total_amount, paid_amount, order_number, customer_name')
      .eq('id', event.refId)
      .maybeSingle();
    if (!order) {
      // Valid event, no matching order (stall sale / pre-sync). Terminal, not an
      // error — leave the claim so we don't reprocess a payment we can't map.
      return json({ ok: true, note: 'no matching order' });
    }

    // Increment paid_amount (handles a partial PSP deposit, not just full pay);
    // mark fully paid only once the running total covers the order.
    const newPaid = Number(order.paid_amount || 0) + event.amountCents / 100;
    const isPaid = newPaid + 0.001 >= Number(order.total_amount);
    await admin
      .from('seller_orders')
      .update({
        is_paid: isPaid,
        paid_amount: newPaid,
        payment_method: 'duitnow',
        psp_transaction_id: event.chargeId,
        payment_provider: provider,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    // Record the in-app payment event (the feed the app polls / subscribes to).
    await admin.from('payment_events').insert({
      user_id: order.user_id,
      order_id: order.id,
      app_ref: event.refId,
      provider,
      charge_id: event.chargeId,
      amount_cents: event.amountCents,
      currency: event.currency,
      status: 'paid',
    });

    // Push "Payment received" to every device the seller is logged into.
    await sendPushToUser(admin, order.user_id, {
      amountCents: event.amountCents,
      currency: event.currency,
      orderNumber: order.order_number,
      orderId: order.id,
    });

    return json({ ok: true });
  } catch (e) {
    await admin
      .from('processed_webhook_events')
      .delete()
      .match({ provider, event_id: event.eventId });
    return json({ error: (e as Error).message }, 500);
  }
});

// ── Signature verification ──────────────────────────────────────────────────
// Returns true (valid), false (invalid), or 'not_configured' (no secret set).
async function verifySignature(
  provider: Provider,
  rawBody: string,
  headers: Headers,
): Promise<boolean | 'not_configured'> {
  if (provider === 'hitpay') {
    const salt = Deno.env.get('HITPAY_WEBHOOK_SALT');
    if (!salt) return 'not_configured';
    // HitPay signs with HMAC-SHA256. TODO(activation): confirm the exact signing
    // scheme against https://docs.hit-pay.com/ — current webhooks HMAC the
    // concatenation of sorted `key=value` form fields (excluding `hmac`) with
    // the salt. Here we HMAC the raw body and compare to the header as a
    // conservative skeleton; replace with the documented field-ordering.
    const sig = headers.get('hitpay-signature') || headers.get('x-signature') || '';
    const expected = await hmacSha256Hex(salt, rawBody);
    return timingSafeEqual(sig, expected);
  }
  if (provider === 'fiuu') {
    const secret = Deno.env.get('FIUU_WEBHOOK_SECRET');
    if (!secret) return 'not_configured';
    // TODO(activation): Fiuu signs with an MD5/SHA `skey` over specific fields
    // (amount, orderid, appcode, status, …) per https://docs.fiuu.com/ . Compute
    // that skey and compare to the posted `skey`. Stubbed-reject until wired.
    return false;
  }
  return false;
}

// ── Provider event parsing ────────────────────────────────────────────────────
function parseProviderEvent(provider: Provider, rawBody: string): ParsedEvent {
  const body = parseBody(rawBody);
  if (provider === 'hitpay') {
    // TODO(activation): map exact HitPay fields per docs.
    return {
      eventId: String(body.payment_id ?? body.id ?? ''),
      chargeId: String(body.payment_request_id ?? body.id ?? ''),
      refId: String(body.reference_number ?? body.reference ?? ''),
      amountCents: Math.round(parseFloat(String(body.amount ?? '0')) * 100),
      currency: String(body.currency ?? 'myr').toLowerCase(),
      paid: String(body.status ?? '').toLowerCase() === 'completed',
    };
  }
  // fiuu
  // TODO(activation): map exact Fiuu fields per docs.
  return {
    eventId: String(body.tranID ?? body.txn_id ?? ''),
    chargeId: String(body.tranID ?? ''),
    refId: String(body.orderid ?? body.order_id ?? ''),
    amountCents: Math.round(parseFloat(String(body.amount ?? '0')) * 100),
    currency: String(body.currency ?? 'myr').toLowerCase(),
    paid: String(body.status ?? '') === '00',
  };
}

function parseBody(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    // Fall back to form-encoded (many PSP webhooks are application/x-www-form-urlencoded).
    const out: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
    return out;
  }
}

// ── Expo push ─────────────────────────────────────────────────────────────────
async function sendPushToUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  p: { amountCents: number; currency: string; orderNumber?: number | null; orderId: string },
) {
  const { data: tokens } = await admin
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId);
  if (!tokens || tokens.length === 0) return;

  const amount = `${p.currency.toUpperCase()} ${(p.amountCents / 100).toFixed(2)}`;
  const order = p.orderNumber ? ` — order #${p.orderNumber}` : '';
  const messages = tokens.map((t: { token: string }) => ({
    to: t.token,
    title: 'Payment received',
    body: `${amount}${order}`,
    sound: 'default',
    priority: 'high',
    channelId: 'orders',
    data: { type: 'payment_received', orderId: p.orderId },
  }));

  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch {
    // A push failure must not fail the webhook — the payment is already recorded.
  }
}

// ── Crypto helpers ──────────────────────────────────────────────────────────
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
