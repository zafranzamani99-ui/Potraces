import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mints a Stripe Terminal connection token for an authenticated app user.
// This is the ONLY backend piece of Tap to Pay: PaymentIntents are created
// client-side by the SDK. The Stripe secret key lives only here, as a Supabase
// edge-function secret — it is never bundled into the app and never logged.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    // 1) Require a valid Supabase session.
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid token' }, 401);

    // 2) Operator must have configured the Stripe secret.
    if (!STRIPE_SECRET_KEY) {
      return json({ error: 'Payments not configured' }, 500);
    }

    // 3) Mint a connection token. Stripe expects form-encoded bodies.
    const res = await fetch('https://api.stripe.com/v1/terminal/connection_tokens', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const data = await res.json();
    if (!res.ok || !data?.secret) {
      // Surface only Stripe's error message, never the secret/token.
      return json({ error: data?.error?.message || 'Stripe error' }, 502);
    }

    // 4) Return only the token secret. Do not cache or log it.
    return json({ secret: data.secret as string });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
