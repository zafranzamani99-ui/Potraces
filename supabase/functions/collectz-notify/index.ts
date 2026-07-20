import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * collectz-notify — organizer-triggered session notifications.
 *
 * Pushes every app-linked participant (user_id NOT NULL) when the organizer
 * edits, cancels, or settles a session. Authz is done in code (the function
 * is JWT-free at the gateway like the other self-authz functions): the
 * caller must be the session owner — the same check as collectz-remind.
 *
 * Body: { sessionId: string, kind: 'edited'|'cancelled'|'settled', message?: string }
 * Returns: { ok: true, sent: <tokens attempted> }
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

  let body: { sessionId?: unknown; kind?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const sessionId = String(body.sessionId ?? '');
  const kind = String(body.kind ?? '');
  if (!sessionId) return json({ error: 'sessionId required' }, 400);
  if (!['edited', 'cancelled', 'settled'].includes(kind)) return json({ error: 'unknown kind' }, 400);
  const message = typeof body.message === 'string' ? body.message.trim() : '';

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
    .select('id,title,owner_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.owner_id !== user.id) return json({ error: 'forbidden' }, 403);

  const { data: participants } = await admin
    .from('collectz_participants')
    .select('user_id')
    .eq('session_id', sessionId)
    .not('user_id', 'is', null);
  const targets = participants ?? [];
  if (targets.length === 0) return json({ ok: true, sent: 0 });

  const COPY: Record<string, { title: string; body: string; type: string }> = {
    edited: {
      title: `Updated: ${session.title}`,
      body: message || 'The organizer updated this session — tap to see what changed.',
      type: 'collectz_edited',
    },
    cancelled: {
      title: `Cancelled: ${session.title}`,
      body: 'The organizer cancelled this session.',
      type: 'collectz_cancelled',
    },
    settled: {
      title: `Settled: ${session.title}`,
      body: 'All done — this session is now settled. 🎉',
      type: 'collectz_settled',
    },
  };
  const copy = COPY[kind];

  let sent = 0;
  for (const p of targets) {
    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token')
      .eq('user_id', p.user_id);
    if (!tokens || tokens.length === 0) continue;

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title: copy.title,
      body: copy.body,
      sound: 'default',
      priority: 'high',
      channelId: 'collectz',
      data: { type: copy.type, sessionId },
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      sent += tokens.length;

      // Expo returns per-message tickets (same order as messages). PRUNE dead
      // tokens: repeatedly pushing to DeviceNotRegistered recipients violates
      // Expo policy and bloats every future fanout.
      const ticketBody = await res.json().catch(() => null) as
        { data?: Array<{ status: string; details?: { error?: string } }> } | null;
      const tickets = ticketBody?.data;
      if (Array.isArray(tickets)) {
        for (let i = 0; i < tickets.length; i++) {
          if (tickets[i]?.details?.error === 'DeviceNotRegistered' && tokens[i]) {
            await admin.from('device_tokens').delete()
              .eq('user_id', p.user_id).eq('token', tokens[i].token);
          }
        }
      }
    } catch {
      // Push failures must not fail the batch.
    }
  }

  return json({ ok: true, sent });
});
