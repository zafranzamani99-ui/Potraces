import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * collectz-remind — the organizer's "remind unpaid" button.
 *
 * Pushes every app-linked participant whose status is still unpaid/rejected,
 * telling them their share amount. Authz is done in code (the function is
 * JWT-free at the gateway like the other self-authz functions): the caller
 * must be the session owner.
 *
 * Secrets (Deno env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-provided.
 */

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
    .select('id,title,owner_id,scheme,total_amount,default_share,currency')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.owner_id !== user.id) return json({ error: 'forbidden' }, 403);

  const { data: participants } = await admin
    .from('collectz_participants')
    .select('id,user_id,slot,share_amount')
    .eq('session_id', sessionId)
    .in('status', ['unpaid', 'rejected'])
    .not('user_id', 'is', null);
  const targets = (participants ?? []).filter((p) => p.slot === 'active');
  if (targets.length === 0) return json({ ok: true, sent: 0 });

  // Divisor for an equal split is ALL active participants, not just the
  // unpaid ones — fetch the full active roster count.
  const { data: allActive } = await admin
    .from('collectz_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('slot', 'active');
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
  for (const p of targets) {
    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token')
      .eq('user_id', p.user_id);
    if (!tokens || tokens.length === 0) continue;

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

  return json({ ok: true, sent });
});
