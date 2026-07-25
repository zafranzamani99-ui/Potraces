import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// qr-create-charge — create a PSP-issued DuitNow QR for an exact amount.
//
// The app calls this with its own session bearer; we call Fiuu's Offline
// Payment API (OPA) `precreate.php` with the merchant credentials held ONLY
// here (never in the app bundle), and record a pending payment_events row so
// qr-payment-webhook has something to flip when the buyer pays.
//
// Flow: app → this → Fiuu precreate → { authorizationCode (EMVCo payload),
// molTransactionId } → app renders the QR; buyer pays → Fiuu notification →
// qr-payment-webhook flips the pending row + pushes "Payment received".
//
// Secrets (supabase secrets set):
//   FIUU_APPLICATION_CODE  — merchant applicationCode (portal-issued)
//   FIUU_SECRET_KEY        — merchant secretKey (signs every request)
//   FIUU_STORE_ID          — free-choice store identifier (4–20 chars)
//   FIUU_TERMINAL_ID       — free-choice terminal identifier (4–20 chars)
//   FIUU_BASE_URL          — https://sandbox-payment.fiuu.com (prod: https://opa.fiuu.com)
//
// Deploy: supabase functions deploy qr-create-charge

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const APP_CODE = Deno.env.get('FIUU_APPLICATION_CODE') ?? '';
const SECRET_KEY = Deno.env.get('FIUU_SECRET_KEY') ?? '';
const STORE_ID = Deno.env.get('FIUU_STORE_ID') ?? '';
const TERMINAL_ID = Deno.env.get('FIUU_TERMINAL_ID') ?? '';
const BASE_URL = (Deno.env.get('FIUU_BASE_URL') || 'https://sandbox-payment.fiuu.com').replace(/\/$/, '');

const CHANNEL_DUITNOW_QR = '24';
const API_VERSION = 'v1';
const HASH_TYPE = 'hmac-sha256';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/**
 * Fiuu OPA signature (v1, hmac-sha256): all non-empty params except
 * `signature`, sorted by parameter NAME, VALUES concatenated in that order
 * (original form, case-sensitive, whitespace-stripped), HMAC-SHA256 with the
 * merchant secretKey. Keep in sync with scripts/test-fiuu-signature.ts.
 */
async function fiuuSign(params: Record<string, string>, secretKey: string): Promise<string> {
  const concat = Object.keys(params)
    .filter((k) => k !== 'signature' && params[k].trim() !== '')
    .sort()
    .map((k) => params[k].trim())
    .join('');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(concat));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!APP_CODE || !SECRET_KEY || !STORE_ID || !TERMINAL_ID) {
      return json({ error: 'Fiuu is not configured on the server' }, 500);
    }

    // Auth: any valid session may charge (it can only ever be their own sale).
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Validate input.
    let payload: { amountCents?: unknown; refId?: unknown; mode?: unknown; description?: unknown } = {};
    try { payload = await req.json(); } catch { /* falls into validation */ }
    const amountCents = Math.round(Number(payload?.amountCents));
    const refId = String(payload?.refId ?? '').trim();
    const mode = payload?.mode === 'seller' ? 'seller' : 'stall';
    if (!Number.isFinite(amountCents) || amountCents <= 0) return json({ error: 'amountCents must be > 0' }, 400);
    if (!refId || refId.length > 40) return json({ error: 'refId is required (max 40 chars)' }, 400);
    const description = String(payload?.description ?? 'Potraces sale').slice(0, 50) || 'Potraces sale';
    const amount = (amountCents / 100).toFixed(2);

    // Call Fiuu precreate (DuitNow QR).
    const params: Record<string, string> = {
      applicationCode: APP_CODE,
      version: API_VERSION,
      referenceId: refId,
      channelId: CHANNEL_DUITNOW_QR,
      currencyCode: 'MYR',
      amount,
      description,
      storeId: STORE_ID,
      terminalId: TERMINAL_ID,
      validityDuration: '180',
      hashType: HASH_TYPE,
    };
    const signature = await fiuuSign(params, SECRET_KEY);
    const form = new URLSearchParams({ ...params, signature });

    const res = await fetch(`${BASE_URL}/RMS/API/MOLOPA/precreate.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text); } catch { /* non-JSON error page */ }
    if (!res.ok || String(body?.statusCode ?? '') !== '00') {
      const errCode = String(body?.errorCode ?? `http_${res.status}`);
      console.error('qr-create-charge: precreate failed', errCode, text.slice(0, 300));
      return json({ error: `Fiuu precreate failed (${errCode})` }, 502);
    }

    const qrPayload = String(body.authorizationCode ?? '');
    const chargeId = String(body.molTransactionId ?? '');
    if (!qrPayload || !chargeId) {
      console.error('qr-create-charge: incomplete precreate response', text.slice(0, 300));
      return json({ error: 'Fiuu returned an incomplete charge' }, 502);
    }

    // Record the pending charge so the webhook can flip it and the app can poll it.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: insErr } = await admin.from('payment_events').insert({
      user_id: user.id,
      app_ref: refId,
      provider: 'fiuu',
      charge_id: chargeId,
      amount_cents: amountCents,
      currency: 'myr',
      status: 'pending',
      raw: { mode, description },
    });
    if (insErr) {
      // The QR exists at Fiuu regardless — degrade to "untracked" rather than fail the sale.
      console.error('qr-create-charge: payment_events insert failed', insErr.message);
    }

    return json({ qrPayload, chargeId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
