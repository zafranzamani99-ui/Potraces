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

/** Locale-tolerant money parser — MIRRORS src/utils/parseAmountLoose.ts. */
function parseAmountLoose(raw: unknown): number | null {
  let s = String(raw ?? '').trim().replace(/\s+/g, '');
  if (!s || s.startsWith('-')) return null; // never coerce a negative to positive
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(/,/g, '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/,/g, '.') : s.replace(/,/g, '');
  }
  s = s.replace(/[^0-9.]/g, '');
  const parts = s.split('.');
  if (parts.length > 2) s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  if (!(rounded > 0) || rounded > 1_000_000) return null;
  return rounded;
}

const CATEGORY_LABELS: Record<string, string> = {
  food: '🍔 Food & Dining', transport: '🚗 Transportation', shopping: '🛍️ Shopping',
  entertainment: '🎬 Entertainment', health: '❤️ Healthcare', other: 'Other',
};

// Returned by action:'categories' when the user hasn't uploaded their own
// labels yet (or has no cloud backup). MIRRORS the list baked into
// scripts/build-quick-log-shortcut.py — the app's resolveCategory fuzzy-matches
// these back to the default category ids.
const DEFAULT_CATEGORIES = [
  '🍔 Food & Dining',
  '🚗 Transportation',
  '🛍️ Shopping',
  '🎬 Entertainment',
  '🧾 Bills & Utilities',
  '❤️ Healthcare',
  '🎓 Education',
  '👪 Family',
  '🔁 Subscriptions',
  '💼 Business Cost',
  '💳 Debt Payment',
  '🐷 Savings Goal',
  '💸 Other',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // Abuse guard: this endpoint is public — refuse oversized bodies before
  // parsing them.
  if (Number(req.headers.get('content-length') ?? 0) > 2048) {
    return json({ error: 'too-large' }, 413);
  }

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

  // Dynamic Payment picker: the Shortcut POSTs {key, action:'wallets'} to fetch
  // the user's REAL wallet names (default-first) so it can list actual wallets
  // and the confirmation card shows the exact one. Read-only — returns early,
  // before any inbox write. Empty list → the Shortcut falls back to generic
  // payment types, so logging still works before the first cloud sync.
  if (payload.action === 'wallets') {
    const { data: rows } = await admin.from('personal_wallets')
      .select('name, is_default')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
    const names = Array.from(
      new Set((rows ?? []).map((w: { name: string }) => (w.name ?? '').trim()).filter(Boolean))
    );
    // No wallets synced yet → hand back the generic types so the Shortcut's
    // picker is never empty (the app auto-creates the matching wallet on log).
    const wallets = names.length ? names : ['Cash', 'Bank', 'E-wallet', 'Credit'];
    return json({ ok: true, wallets });
  }

  // Dynamic Category picker: the Shortcut POSTs {key, action:'categories'} to
  // fetch the user's REAL category labels (uploaded by the app to
  // quick_log_prefs — renames + custom categories included). Read-only, same
  // early-return shape as 'wallets'. Nothing uploaded → the default set, which
  // is exactly what older Shortcut builds had hardcoded.
  if (payload.action === 'categories') {
    const { data: pref } = await admin.from('quick_log_prefs')
      .select('categories').eq('user_id', userId).maybeSingle();
    const stored = Array.isArray(pref?.categories)
      ? (pref.categories as unknown[]).filter(
          (c): c is string => typeof c === 'string' && c.trim().length > 0
        )
      : [];
    return json({ ok: true, categories: stored.length ? stored : DEFAULT_CATEGORIES });
  }

  // Rate limit: a Back Tap human logs a handful per minute; a leaked key
  // hammering the endpoint burns push fanout + DB writes. 30/min is generous.
  {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from('quick_log_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', since);
    if ((count ?? 0) >= 30) return json({ error: 'rate-limited' }, 429);
  }

  // Parse + validate amount (locale-tolerant — MIRRORS src/utils/parseAmountLoose.ts).
  // Comma-decimal keyboards ("12,5") must not become 125; cap at 1,000,000.
  const amount = parseAmountLoose(payload.amount);
  if (amount === null) return json({ error: 'bad-amount' }, 400);

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
        // Expo returns per-message tickets (same order as messages). Log them,
        // and PRUNE dead tokens: repeatedly pushing to DeviceNotRegistered
        // recipients violates Expo policy and bloats every future fanout.
        const ticketBody = await res.json().catch(() => null) as
          { data?: Array<{ status: string; details?: { error?: string } }> } | null;
        console.log('[quick-log] expo push', res.status, JSON.stringify(ticketBody));
        const tickets = ticketBody?.data;
        if (Array.isArray(tickets)) {
          for (let i = 0; i < tickets.length; i++) {
            if (tickets[i]?.details?.error === 'DeviceNotRegistered' && tokens[i]) {
              await admin.from('device_tokens').delete()
                .eq('user_id', userId).eq('token', tokens[i].token);
              console.log('[quick-log] pruned dead device token');
            }
          }
        }
      }
      await admin.from('quick_log_keys')
        .update({ last_used_at: new Date().toISOString() }).eq('key_hash', key_hash);
      // Grace-period key rotation: regenerating in the app no longer revokes
      // the old key immediately — the first successful USE of the new key
      // retires the user's other keys here, so an installed Shortcut keeps
      // working until the new key is genuinely in place.
      await admin.from('quick_log_keys')
        .update({ revoked: true })
        .eq('user_id', userId).eq('revoked', false).neq('key_hash', key_hash);
    } catch (e) {
      console.log('[quick-log] push send failed:', String(e));
    }
  })();

  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(background);
  else await background;

  return json({ ok: true });
});
