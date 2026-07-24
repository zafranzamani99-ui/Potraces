import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// broadcast-send — the admin fan-out for the in-app announcement inbox.
//
// Called from admin.html. Admin-gated: the caller passes their own Supabase
// access token, which we verify with rpc('is_admin') before touching anything.
//
// On a valid call we INSERT one row into `announcements` (the persistent inbox
// the app reads) with the service role, then send an Expo push to EVERY device
// in device_tokens. The push is best-effort: the announcement row is already
// saved, so a failed push chunk is logged and skipped, never fatal.
//
// Setup (operator):
//   supabase functions deploy broadcast-send
// (no extra secrets — reuses the standard SUPABASE_* edge-function env vars.)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const PAGE_SIZE = 1000;  // <= PostgREST max_rows; one full page of tokens per query
const PUSH_CHUNK = 100;  // Expo accepts max 100 messages per POST

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

  try {
    // Admin gate — verify the CALLER is an admin using their own token.
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin');
    if (adminErr || isAdmin !== true) return json({ error: 'Forbidden' }, 403);

    // Validate the payload.
    let payload: { title?: unknown; body?: unknown } = {};
    try { payload = await req.json(); } catch { /* empty body → fails validation below */ }
    const title = String(payload?.title ?? '').trim();
    const message = String(payload?.body ?? '').trim();
    if (!title || !message) return json({ error: 'title and body are required' }, 400);

    // Service-role client: write the row + read every device token (bypasses RLS).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Persist the announcement (the inbox row the app reads). This is the
    //    source of truth — if it fails we stop; if push later fails we don't.
    const { error: insErr } = await admin
      .from('announcements')
      .insert({ title, body: message, active: true });
    if (insErr) return json({ error: insErr.message }, 500);

    // 2) Collect every device token from BOTH sources, paging past PostgREST's
    //    max_rows. push_devices is the account-free registry (reaches testers who
    //    never signed in); device_tokens is the legacy account-scoped set (signed-in
    //    devices, incl. those registered before this build shipped). Reading both
    //    avoids a zero-reach gap while push_devices fills up as the app rolls out.
    //    Dedupe into a Set so a device in both isn't double-pushed.
    const tokens = new Set<string>();
    for (const table of ['push_devices', 'device_tokens']) {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: rows, error: selErr } = await admin
          .from(table)
          .select('token')
          .range(from, from + PAGE_SIZE - 1);
        if (selErr) break; // best-effort: announcement is saved; a token-read hiccup shouldn't 500
        const batch = (rows ?? []) as { token: string | null }[];
        for (const r of batch) if (r.token) tokens.add(r.token);
        if (batch.length < PAGE_SIZE) break;
      }
    }

    // 3) Expo push in chunks of 100. Best-effort: a failed chunk is logged, not fatal.
    const all = [...tokens];
    for (let i = 0; i < all.length; i += PUSH_CHUNK) {
      const messages = all.slice(i, i + PUSH_CHUNK).map((to) => ({
        to,
        title,
        body: message,
        sound: 'default',
        priority: 'high',      // heads-up delivery; without it FCM may batch/delay
        channelId: 'broadcast', // else Android drops it on the silent default channel
        data: { type: 'broadcast' },
      }));
      try {
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(messages),
        });
      } catch (e) {
        // A push failure must not fail the request — the announcement is already saved.
        console.error('broadcast-send: push chunk failed', (e as Error).message);
      }
    }

    return json({ ok: true, sent: all.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
