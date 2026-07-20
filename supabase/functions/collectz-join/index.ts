import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * collectz-join — the public + authed gateway into a Collectz session.
 *
 * The tables themselves are locked down by RLS (owner or linked participant
 * only), so everything that starts from a share link goes through here:
 *
 *   view     — anon or authed. Returns the session summary + roster by
 *              share_code. Anon callers get the PUBLIC projection only
 *              (no qr_payload, no user_ids, no proofs) — this powers the
 *              jejakbaki.my/collectz web page. Authed callers additionally
 *              get the organizer's QR (they hold the link, i.e. they're in
 *              the group) and their own participant row if already joined.
 *   claim    — authed. Links the caller's user_id to an unclaimed roster
 *              name the organizer pre-added ("Mael" → the real Mael).
 *   add_self — authed. Inserts a new active roster row for the caller
 *              (name not pre-added by the organizer).
 *
 * Public function (verify_jwt=false). Secrets (Deno env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-provided by the runtime.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// View/claim bodies are tiny; reject anything bloated before parsing.
const MAX_BODY_BYTES = 16 * 1024;
const MAX_NAME_LEN = 60;

interface ParticipantRow {
  id: string;
  name: string;
  slot: 'active' | 'reserve';
  status: 'unpaid' | 'pending' | 'confirmed' | 'rejected';
  share_amount: number | null;
  user_id: string | null;
}

/**
 * Effective per-person share. Custom amount wins; otherwise the scheme
 * default (flat price, or the equal split of the total). Reserves pay
 * nothing. Equal splits are cent-exact: the remainder cents go to the
 * earliest roster entries, so the shares always sum back to the total.
 * MUST match computeShares() in src/services/collectzService.ts.
 */
function effectiveShares(session: {
  scheme: string;
  total_amount: number | null;
  default_share: number | null;
}, actives: ParticipantRow[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  let equalShares: number[] = [];
  if (session.scheme === 'equal' && session.total_amount != null && actives.length > 0) {
    const totalCents = Math.round(session.total_amount * 100);
    const base = Math.floor(totalCents / actives.length);
    const rem = totalCents - base * actives.length;
    equalShares = actives.map((_, i) => base + (i < rem ? 1 : 0));
  }
  actives.forEach((p, i) => {
    if (p.share_amount != null) out.set(p.id, p.share_amount);
    else if (session.scheme === 'flat') out.set(p.id, session.default_share);
    else if (session.scheme === 'equal') out.set(p.id, equalShares.length > 0 ? equalShares[i] / 100 : null);
    else out.set(p.id, null);
  });
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const declaredLen = parseInt(req.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    return json({ error: 'Request too large.' }, 413);
  }
  let body: { share_code?: unknown; action?: unknown; participant_id?: unknown; name?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'Request too large.' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const shareCode = String(body.share_code ?? '').trim();
  const action = String(body.action ?? '').trim();
  if (!shareCode || shareCode.length > 32) return json({ error: 'share_code required' }, 400);
  if (!['view', 'claim', 'add_self'].includes(action)) return json({ error: 'unknown action' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Optional auth — anon callers may `view`; everything else needs a user.
  let userId: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    userId = data?.user?.id ?? null;
  }

  const { data: session } = await admin
    .from('collectz_sessions')
    .select('*')
    .eq('share_code', shareCode)
    .maybeSingle();
  if (!session) return json({ error: 'not_found' }, 404);
  if (session.status === 'cancelled') return json({ error: 'cancelled' }, 410);

  const { data: participants } = await admin
    .from('collectz_participants')
    .select('id,name,slot,status,share_amount,user_id')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const roster: ParticipantRow[] = participants ?? [];
  const actives = roster.filter((p) => p.slot === 'active');
  const shares = effectiveShares(session, actives);

  if (action === 'view') {
    const confirmed = actives.filter((p) => p.status === 'confirmed');
    const sum = (rows: ParticipantRow[]) =>
      rows.reduce((acc, p) => acc + (shares.get(p.id) ?? 0), 0);

    const payload: Record<string, unknown> = {
      session: {
        id: session.id,
        title: session.title,
        category: session.category,
        event_at: session.event_at,
        venue: session.venue,
        details_text: session.details_text,
        rules_text: session.rules_text,
        scheme: session.scheme,
        currency: session.currency,
        pay_by: session.pay_by,
        status: session.status,
      },
      participants: roster.map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        status: p.status,
        effective_share: shares.get(p.id) ?? null,
        claimed: p.user_id != null,
      })),
      progress: {
        active_count: actives.length,
        confirmed_count: confirmed.length,
        target_amount: actives.some((p) => shares.get(p.id) == null) ? null : sum(actives),
        confirmed_amount: sum(confirmed),
      },
    };

    if (userId) {
      const mine = roster.find((p) => p.user_id === userId);
      payload.qr_payload = session.qr_payload;
      payload.qr_image_path = session.qr_image_path;
      payload.my_participant = mine
        ? {
            id: mine.id,
            name: mine.name,
            slot: mine.slot,
            status: mine.status,
            effective_share: shares.get(mine.id) ?? null,
          }
        : null;
    }

    return json(payload);
  }

  // claim / add_self require auth and an open session.
  if (!userId) return json({ error: 'auth_required' }, 401);
  if (session.status !== 'open') return json({ error: 'session_closed' }, 409);
  if (roster.some((p) => p.user_id === userId)) return json({ error: 'already_joined' }, 409);

  if (action === 'claim') {
    const participantId = String(body.participant_id ?? '');
    const target = roster.find((p) => p.id === participantId);
    if (!target) return json({ error: 'not_found' }, 404);
    if (target.user_id) return json({ error: 'already_claimed' }, 409);

    const { error } = await admin
      .from('collectz_participants')
      .update({ user_id: userId })
      .eq('id', participantId)
      .is('user_id', null); // guard against a race with another claimant
    if (error) return json({ error: 'claim_failed' }, 500);

    return json({ ok: true, participant_id: participantId });
  }

  // add_self
  const name = String(body.name ?? '').trim();
  if (!name || name.length > MAX_NAME_LEN) return json({ error: 'name_invalid' }, 400);

  const { data: inserted, error } = await admin
    .from('collectz_participants')
    .insert({ session_id: session.id, name, user_id: userId })
    .select('id')
    .single();
  if (error) return json({ error: 'join_failed' }, 500);

  return json({ ok: true, participant_id: inserted.id });
});
