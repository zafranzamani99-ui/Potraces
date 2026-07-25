import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// register-device — account-free push registration for admin broadcasts.
//
// Any installed app POSTs its Expo push token here on startup (no login). We
// upsert it into push_devices with the service role; broadcast-send later fans
// out to every row. JWT-free (config.toml verify_jwt=false) — a fresh, never
// signed-in tester MUST be able to register, which is the whole point:
// device_tokens requires an account, push_devices does not.
//
// Body: { token: string, platform?: 'ios' | 'android', remove?: boolean }
//   remove: true deletes the token instead — the in-app push toggle's opt-out
//   path (Settings → Preferences → Push notifications).
// Returns: { ok: true }
//
// Setup (operator): supabase functions deploy register-device
// (no extra secrets — reuses the standard SUPABASE_* edge-function env vars.)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: { token?: unknown; platform?: unknown } = {};
  try { payload = await req.json(); } catch { /* empty body → fails validation below */ }

  const token = String(payload?.token ?? '').trim();
  // Only accept real Expo tokens — a public endpoint would otherwise collect
  // junk. Expo tokens look like `ExponentPushToken[…]` (or `ExpoPushToken[…]`).
  if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
    return json({ error: 'invalid token' }, 400);
  }
  const platform = payload?.platform === 'ios' || payload?.platform === 'android'
    ? payload.platform : null;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Opt-out: the in-app push toggle removes this device from the broadcast list.
  if (payload?.remove === true) {
    const { error } = await admin.from('push_devices').delete().eq('token', token);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const { error } = await admin
    .from('push_devices')
    .upsert({ token, platform, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});
