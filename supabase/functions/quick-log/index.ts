// Background Quick-Log endpoint. Public (verify_jwt=false): the user's Quick-Log
// key is the only auth. Validates the key → inserts a quick_log_inbox row →
// sends a push. Does NO wallet/category math — the app reconciles on next open.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** SHA-256 → lowercase hex. MUST match src/services/quickLogKey.ts hashKey. */
async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key.trim());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const CATEGORY_LABELS: Record<string, string> = {
  food: '🍔 Food & Dining', transport: '🚗 Transportation', shopping: '🛍️ Shopping',
  entertainment: '🎬 Entertainment', health: '❤️ Healthcare', other: 'Other',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }

  const key = typeof payload.key === 'string' ? payload.key : '';
  if (!key) return json({ error: 'missing-key' }, 401);

  // Validate key → user.
  const key_hash = await hashKey(key);
  const { data: keyRow } = await admin.from('quick_log_keys')
    .select('user_id, revoked').eq('key_hash', key_hash).maybeSingle();
  if (!keyRow || keyRow.revoked) return json({ error: 'invalid-key' }, 401);
  const userId = keyRow.user_id as string;

  // Parse + validate amount.
  const amount = Math.round((parseFloat(String(payload.amount).replace(/[^0-9.]/g, '')) + Number.EPSILON) * 100) / 100;
  if (!(amount > 0)) return json({ error: 'bad-amount' }, 400);

  const type = payload.type === 'income' ? 'income' : 'expense';
  const category = typeof payload.category === 'string' ? payload.category : null;
  const wallet = typeof payload.wallet === 'string' ? payload.wallet : null;
  const note = typeof payload.note === 'string' ? payload.note.slice(0, 200) : null;
  let occurred_at = new Date().toISOString();
  if (payload.occurred_at) {
    const d = new Date(payload.occurred_at);
    if (!Number.isNaN(d.getTime())) occurred_at = d.toISOString();
  }

  // Start the device-token lookup in parallel with the inbox insert — the
  // push should leave the building the instant the insert is confirmed.
  const tokensPromise = admin.from('device_tokens').select('token').eq('user_id', userId);

  const { error: insErr } = await admin.from('quick_log_inbox')
    .insert({ user_id: userId, amount, type, category, wallet, note, occurred_at });
  if (insErr) return json({ error: 'insert-failed' }, 500);

  // Everything below is best-effort and latency-irrelevant to the caller:
  // run it AFTER the response via waitUntil (falls back to awaiting inline).
  // Outcomes are LOGGED (dashboard → Edge Functions → quick-log → Logs).
  const background = (async () => {
    try {
      const { data: tokens } = await tokensPromise;
      console.log(`[quick-log] push: ${tokens?.length ?? 0} device token(s) for user`);
      if (tokens && tokens.length) {
        const label = category ? (CATEGORY_LABELS[category] ?? category) : 'your wallet';
        const verb = type === 'income' ? 'in' : 'out';
        const messages = tokens.map((t: { token: string }) => ({
          to: t.token,
          title: `Logged RM${amount.toFixed(2)} ${verb}`,
          body: `${note ? note + ' · ' : ''}${label}`,
          sound: 'default',
          priority: 'high',
          channelId: 'orders',
          data: { type: 'quick_log' },
        }));
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        });
        // Expo returns per-message tickets; errors like DeviceNotRegistered or
        // InvalidCredentials only show up here — log them or they're invisible.
        console.log('[quick-log] expo push', res.status, await res.text());
      }
      await admin.from('quick_log_keys')
        .update({ last_used_at: new Date().toISOString() }).eq('key_hash', key_hash);
    } catch (e) {
      console.log('[quick-log] push send failed:', String(e));
    }
  })();

  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(background);
  else await background;

  return json({ ok: true });
});
