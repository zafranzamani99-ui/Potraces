import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * collectz-notify — organizer-triggered session notifications.
 *
 * Pushes every app-linked participant (user_id NOT NULL) when the organizer
 * edits, cancels, or settles a session — or ONE participant when they were
 * removed from the roster (kind 'removed' + participant_user_id, called
 * BEFORE the row is deleted since the push targets the user id directly).
 * Authz is done in code (the function is JWT-free at the gateway like the
 * other self-authz functions): the caller must be the session owner — the
 * same check as collectz-remind.
 *
 * Body: { sessionId: string, kind: 'edited'|'cancelled'|'settled'|'removed',
 *         message?: string, participant_user_id?: string }
 * Returns: { ok: true, sent: <tokens attempted>, reached: <participants with
 *            a device>, eligible: <app-linked targets>, unlinked: <roster rows
 *            with no app account — unreachable by push> }
 *
 * Fanout kinds are cooldown-limited (60s per session, HTTP 429 'cooldown')
 * so a looping owner can't buzz-spam the roster. 'removed' must target a row
 * on THIS session's roster and has its own per-(session,target) 60s cooldown
 * (stamped on the participant row) — an edit can still remove several
 * DIFFERENT people back-to-back, but one target can't be buzz-looped.
 *
 * Secrets (Deno env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-provided.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Push bodies get truncated by the platforms anyway — cap the custom message.
const MAX_MESSAGE_LEN = 500;
// One fanout blast per session per minute — enough for real edit/cancel flows,
// fatal to a spam loop.
const NOTIFY_COOLDOWN_MS = 60 * 1000;

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

  let body: { sessionId?: unknown; kind?: unknown; message?: unknown; participant_user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const sessionId = String(body.sessionId ?? '');
  const kind = String(body.kind ?? '');
  if (!sessionId) return json({ error: 'sessionId required' }, 400);
  if (!['edited', 'cancelled', 'settled', 'removed'].includes(kind)) return json({ error: 'unknown kind' }, 400);
  const message = (typeof body.message === 'string' ? body.message.trim() : '').slice(0, MAX_MESSAGE_LEN);

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
    .select('id,title,owner_id,last_notified_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.owner_id !== user.id) return json({ error: 'forbidden' }, 403);

  let targets: Array<{ user_id: string }> = [];
  let unlinked = 0;
  let removedRowId: string | null = null;
  if (kind === 'removed') {
    const targetUserId = String(body.participant_user_id ?? '');
    if (!targetUserId) return json({ error: 'participant_user_id required' }, 400);
    // The target must actually be on THIS session's roster (the row still
    // exists — call order is notify BEFORE delete). Without this, 'removed'
    // is a push-to-any-user primitive.
    const { data: rosterRow } = await admin
      .from('collectz_participants')
      .select('id,removed_notified_at')
      .eq('session_id', sessionId)
      .eq('user_id', targetUserId)
      .limit(1)
      .maybeSingle();
    if (!rosterRow) return json({ error: 'not_participant' }, 404);
    // Per-(session,target) cooldown: one removal push per target per minute.
    // Different targets = different rows, so multi-removal edits still work.
    if (rosterRow.removed_notified_at) {
      const elapsedMs = Date.now() - new Date(rosterRow.removed_notified_at).getTime();
      if (elapsedMs < NOTIFY_COOLDOWN_MS) {
        return json({
          ok: false,
          error: 'cooldown',
          retry_after_seconds: Math.ceil((NOTIFY_COOLDOWN_MS - elapsedMs) / 1000),
        }, 429);
      }
    }
    removedRowId = rosterRow.id;
    targets = [{ user_id: targetUserId }];
  } else {
    const { data: participants } = await admin
      .from('collectz_participants')
      .select('user_id')
      .eq('session_id', sessionId);
    const rows = participants ?? [];
    targets = rows.filter((p): p is { user_id: string } => p.user_id != null);
    unlinked = rows.length - targets.length;
  }
  if (targets.length === 0) return json({ ok: true, sent: 0, reached: 0, eligible: 0, unlinked });

  // 60s cooldown between fanout blasts, checked only once there is someone to
  // push. 'removed' has its own per-target cooldown (checked above).
  if (kind !== 'removed' && session.last_notified_at) {
    const elapsedMs = Date.now() - new Date(session.last_notified_at).getTime();
    if (elapsedMs < NOTIFY_COOLDOWN_MS) {
      return json({
        ok: false,
        error: 'cooldown',
        retry_after_seconds: Math.ceil((NOTIFY_COOLDOWN_MS - elapsedMs) / 1000),
      }, 429);
    }
  }

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
    removed: {
      title: `Removed: ${session.title}`,
      body: message || 'The organizer removed you from this session.',
      type: 'collectz_removed',
    },
  };
  const copy = COPY[kind];

  let sent = 0;
  let reached = 0;
  for (const p of targets) {
    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token')
      .eq('user_id', p.user_id);
    if (!tokens || tokens.length === 0) continue;
    reached += 1;

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

  // Stamp the blast only when something actually went out — an all-tokenless
  // push shouldn't burn the cooldown window.
  if (sent > 0) {
    if (kind === 'removed') {
      await admin
        .from('collectz_participants')
        .update({ removed_notified_at: new Date().toISOString() })
        .eq('id', removedRowId);
    } else {
      await admin
        .from('collectz_sessions')
        .update({ last_notified_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
  }

  return json({ ok: true, sent, reached, eligible: targets.length, unlinked });
});
