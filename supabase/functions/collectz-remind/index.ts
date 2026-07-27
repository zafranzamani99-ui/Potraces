import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * collectz-remind — the organizer's "remind unpaid" button.
 *
 * Pushes every app-linked participant whose status is still unpaid/rejected,
 * telling them their share amount. Authz is done in code (the function is
 * JWT-free at the gateway like the other self-authz functions): the caller
 * must be the session owner. Rate-limited to one blast per session per 24h
 * via collectz_sessions.last_reminded_at (HTTP 429 'cooldown' inside).
 *
 * Secrets (Deno env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-provided.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// One reminder blast per session per 24h — the button should nudge, not spam.
const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'Missing authorization' }, 401);

  let body: { session_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const sessionId = String(body.session_id ?? '');
  if (!sessionId) return json({ error: 'session_id required' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Invalid token' }, 401);

  const { data: session } = await admin
    .from('collectz_sessions')
    .select('id,title,owner_id,status,scheme,total_amount,default_share,currency,last_reminded_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.owner_id !== user.id) return json({ error: 'forbidden' }, 403);
  // Never blast "pay now" for a settled/cancelled session.
  if (session.status !== 'open') return json({ error: 'session_closed' }, 409);

  const { data: participants } = await admin
    .from('collectz_participants')
    .select('id,user_id,slot,share_amount')
    .eq('session_id', sessionId)
    // join_status gate: a queued join request isn't a member yet — reminding
    // them to pay before the organizer even approved would be nonsense.
    .eq('join_status', 'active')
    .in('status', ['unpaid', 'rejected']);
  const unpaidActives = (participants ?? []).filter((p) => p.slot === 'active');
  const targets = unpaidActives.filter((p) => p.user_id != null);
  // Unpaid actives with no app account — a push can never reach them.
  const unlinked = unpaidActives.length - targets.length;
  if (targets.length === 0) return json({ ok: true, sent: 0, eligible: 0, unlinked, no_token: 0 });

  // 24h cooldown between blasts, checked only once there is someone to
  // remind: a no-target call stays free and does not consume the window.
  if (session.last_reminded_at) {
    const elapsedMs = Date.now() - new Date(session.last_reminded_at).getTime();
    if (elapsedMs < REMIND_COOLDOWN_MS) {
      return json({
        ok: false,
        error: 'cooldown',
        retry_after_seconds: Math.ceil((REMIND_COOLDOWN_MS - elapsedMs) / 1000),
      }, 429);
    }
  }

  // Divisor for an equal split is ALL active participants, not just the
  // unpaid ones — fetch the full active roster count (approved members only).
  const { data: allActive } = await admin
    .from('collectz_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('slot', 'active')
    .eq('join_status', 'active');
  const activeCount = allActive?.length ?? 0;

  const shareFor = (p: { share_amount: number | null }): number | null => {
    if (p.share_amount != null) return p.share_amount;
    if (session.scheme === 'flat') return session.default_share;
    if (session.scheme === 'equal' && session.total_amount != null && activeCount > 0) {
      // Base share; cent-remainder distribution is cosmetic for a reminder.
      return Math.floor((Math.round(session.total_amount * 100) / activeCount)) / 100;
    }
    return null;
  };

  let sent = 0;
  let noToken = 0;
  for (const p of targets) {
    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token')
      .eq('user_id', p.user_id);
    if (!tokens || tokens.length === 0) {
      noToken += 1;
      continue;
    }

    const share = shareFor(p);
    const amount = share != null
      ? ` — ${String(session.currency ?? 'MYR').toUpperCase()} ${share.toFixed(2)}`
      : '';
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title: `Reminder: ${session.title}`,
      body: `Your share is still unpaid${amount}. Tap to pay and upload proof.`,
      sound: 'default',
      priority: 'high',
      channelId: 'collectz',
      data: { type: 'collectz_reminder', sessionId },
    }));

    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      sent += 1;
    } catch {
      // Push failures must not fail the batch.
    }
  }

  // Stamp the blast so the cooldown above holds for the next 24h — but only
  // when something actually went out. A blast where every target lacked a
  // device token reached nobody and shouldn't burn the organizer's window.
  if (sent > 0) {
    await admin
      .from('collectz_sessions')
      .update({ last_reminded_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  return json({ ok: true, sent, eligible: targets.length, unlinked, no_token: noToken });
});
