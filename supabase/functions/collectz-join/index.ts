import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkContent } from './contentFilter.ts';

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
 *              the group), their own participant row if already joined, and
 *              the ids of roster entries they have blocked (Apple 1.2).
 *   claim    — authed. Links the caller's user_id to an unclaimed roster
 *              name the organizer pre-added ("Mael" → the real Mael).
 *              Always instant — pre-added names skip the approval queue.
 *   add_self — authed. Inserts a new active roster row for the caller
 *              (name not pre-added by the organizer). Rejects with
 *              'session_full' once actives >= max_participants — claiming a
 *              pre-added name stays allowed (that slot is already counted).
 *              When the session has join_requires_approval, the row goes in
 *              as join_status='requested' instead: not a roster member yet
 *              (excluded from shares/capacity and the public roster), the
 *              organizer is pushed by the DB trigger, and their approve /
 *              decline flips it to 'active' / 'rejected'.
 *   set_team — authed roster member. Moves MYSELF into a team (null =
 *              unassign); refuses a team already holding team_size people.
 *   set_team_name — authed. Renames a team (organizer OR any roster member).
 *   leave    — authed roster member. Undo a wrong claim / step out while still
 *              unpaid: a self-added row is deleted, a claimed organizer name is
 *              only freed (user_id cleared) so the roster slot survives.
 *   block / unblock — authed. Blocks the ACCOUNT behind a roster entry
 *              (user_blocks row), so the blocked user's pools stop showing
 *              for the blocker. Offline names hold no account — the client
 *              masks those locally instead. Allowed on any session status:
 *              moderation doesn't expire when the session closes.
 *
 * Free-text names written here (add_self, set_team_name) pass the server-side
 * content filter — the client filter is a UX guard only and is bypassed by
 * calling this function directly.
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

// Brute-force brake on share_code guessing: only MISSES (unknown codes) are
// logged per IP; past the limit further lookups 429 until the window clears.
// Real codes never log a miss, so legitimate traffic is untouched.
const MISS_LIMIT = 20;
const MISS_WINDOW_MS = 15 * 60 * 1000;

interface ParticipantRow {
  id: string;
  name: string;
  slot: 'active' | 'reserve';
  status: 'unpaid' | 'pending' | 'confirmed' | 'rejected';
  share_amount: number | null;
  user_id: string | null;
  team_idx: number | null;
  reject_note: string | null;
  /** Membership gate: 'requested'/'rejected' rows are NOT roster members. */
  join_status: 'active' | 'requested' | 'rejected';
  /** True for rows the caller created via add_self (vs an organizer pre-add). */
  self_added: boolean;
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
  let body: { share_code?: unknown; action?: unknown; participant_id?: unknown; name?: unknown; team_idx?: unknown };
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
  if (!['view', 'claim', 'add_self', 'set_team', 'set_team_name', 'leave', 'block', 'unblock'].includes(action)) return json({ error: 'unknown action' }, 400);

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

  // Too many recent share_code misses from this IP → refuse before the lookup.
  const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (ip) {
    const since = new Date(Date.now() - MISS_WINDOW_MS).toISOString();
    const { count } = await admin
      .from('collectz_view_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('attempted_at', since);
    if ((count ?? 0) >= MISS_LIMIT) return json({ error: 'rate_limited' }, 429);
  }

  const { data: session } = await admin
    .from('collectz_sessions')
    .select('*')
    .eq('share_code', shareCode)
    .maybeSingle();
  if (!session) {
    if (ip) {
      await admin.from('collectz_view_attempts').insert({ ip });
      // Opportunistic prune — misses are rare outside an enumeration attack.
      await admin
        .from('collectz_view_attempts')
        .delete()
        .lt('attempted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    }
    return json({ error: 'not_found' }, 404);
  }
  // Cancelled: the join link is dead for mutations (410), but `view` still
  // returns the normal payload — the web page and app render the cancelled
  // state with the organizer's contact (socials/group_url) so paid
  // participants can chase refunds. block/unblock also survive cancellation:
  // moderation doesn't expire with the session.
  if (session.status === 'cancelled' && !['view', 'block', 'unblock'].includes(action)) return json({ error: 'cancelled' }, 410);

  const { data: participants } = await admin
    .from('collectz_participants')
    .select('id,name,slot,status,share_amount,user_id,team_idx,reject_note,join_status,self_added')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const roster: ParticipantRow[] = participants ?? [];
  // Only approved members count: requested/declined joins hold no slot, pay
  // no share, and don't fill teams until the organizer says yes.
  const members = roster.filter((p) => p.join_status === 'active');
  const actives = members.filter((p) => p.slot === 'active');
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
        event_end: session.event_end,
        venue: session.venue,
        details_text: session.details_text,
        rules_text: session.rules_text,
        scheme: session.scheme,
        total_amount: session.total_amount,
        currency: session.currency,
        pay_by: session.pay_by,
        status: session.status,
        image_path: session.image_path,
        maps_url: session.maps_url,
        skill_level: session.skill_level,
        age_req: session.age_req,
        gender_req: session.gender_req,
        booking_status: session.booking_status,
        max_participants: session.max_participants,
        team_count: session.team_count,
        team_size: session.team_size,
        team_names: session.team_names,
        socials: session.socials,
        group_url: session.group_url,
        join_requires_approval: session.join_requires_approval === true,
      },
      // The public roster lists MEMBERS only — a requested/declined self-add
      // was never on the roster, so it never shows here (the requester still
      // sees their own row via my_participant below).
      participants: members.map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        status: p.status,
        effective_share: shares.get(p.id) ?? null,
        claimed: p.user_id != null,
        team_idx: p.team_idx,
        // The organizer's rejection note is payment feedback for the roster
        // member — surfaced so the web page can show WHY, not just "rejected".
        reject_note: p.status === 'rejected' ? p.reject_note : null,
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
      // The QR is the organizer's payment details — only hand it to people
      // actually in the session (an APPROVED linked participant or the owner),
      // not to any signed-in link-holder who hasn't joined — and not to a
      // requester still waiting for approval.
      if ((mine && mine.join_status === 'active') || session.owner_id === userId) {
        payload.qr_payload = session.qr_payload;
        payload.qr_image_path = session.qr_image_path;
      }
      payload.my_participant = mine
        ? {
            id: mine.id,
            name: mine.name,
            slot: mine.slot,
            status: mine.status,
            effective_share: shares.get(mine.id) ?? null,
            team_idx: mine.team_idx,
            join_status: mine.join_status,
            reject_note: mine.status === 'rejected' ? mine.reject_note : null,
          }
        : null;

      // Apple 1.2 blocking: which roster entries the caller has blocked, keyed
      // by PARTICIPANT id so account uids never leave the server. The client
      // masks those names; their pools are filtered out server-side elsewhere.
      // Fails soft pre-migration (user_blocks absent → blocks is null).
      const rosterUids = roster.map((p) => p.user_id).filter((u): u is string => !!u);
      if (rosterUids.length > 0) {
        const { data: blocks } = await admin
          .from('user_blocks')
          .select('blocked_id')
          .eq('blocker_id', userId)
          .in('blocked_id', rosterUids);
        const blockedUids = new Set((blocks ?? []).map((b: { blocked_id: string }) => b.blocked_id));
        payload.blocked_participant_ids = roster
          .filter((p) => p.user_id && blockedUids.has(p.user_id))
          .map((p) => p.id);
      }
    }

    return json(payload);
  }

  // claim / add_self / set_team / set_team_name require auth and an open session.
  if (!userId) return json({ error: 'auth_required' }, 401);

  if (action === 'block' || action === 'unblock') {
    // Block the ACCOUNT behind a roster entry (Apple 1.2). Works on any session
    // status — moderation doesn't expire when the session closes. Offline
    // roster names hold no account: report account:false and the client masks
    // them locally instead.
    const participantId = String(body.participant_id ?? '');
    const target = roster.find((p) => p.id === participantId);
    if (!target) return json({ error: 'not_found' }, 404);
    if (!target.user_id || target.user_id === userId) return json({ ok: true, account: false });
    const { error } =
      action === 'block'
        ? await admin.from('user_blocks').upsert({ blocker_id: userId, blocked_id: target.user_id })
        : await admin.from('user_blocks').delete().eq('blocker_id', userId).eq('blocked_id', target.user_id);
    if (error) return json({ error: 'block_failed' }, 500);
    return json({ ok: true, account: true });
  }

  if (session.status !== 'open') return json({ error: 'session_closed' }, 409);

  if (action === 'set_team' || action === 'set_team_name') {
    const teamCount: number = session.team_count ?? 0;
    const mine = roster.find((p) => p.user_id === userId);

    if (action === 'set_team') {
      // Move MYSELF into a team (null = unassign). Reserves hold no team slot.
      // A join still waiting for approval holds no slot either — teams come
      // after the organizer says yes.
      if (!mine || mine.join_status !== 'active') return json({ error: 'not_in_roster' }, 403);
      if (mine.slot !== 'active') return json({ error: 'team_reserve' }, 409);
      const teamIdx = body.team_idx == null ? null : Number(body.team_idx);
      if (teamIdx !== null) {
        if (!Number.isInteger(teamIdx) || teamIdx < 1 || teamIdx > teamCount) {
          return json({ error: 'team_invalid' }, 400);
        }
        if (session.team_size != null) {
          const teamMembers = actives.filter((p) => p.team_idx === teamIdx && p.id !== mine.id);
          if (teamMembers.length >= session.team_size) return json({ error: 'team_full' }, 409);
        }
      }
      const { error } = await admin
        .from('collectz_participants')
        .update({ team_idx: teamIdx })
        .eq('id', mine.id);
      if (error) return json({ error: 'team_failed' }, 500);
      return json({ ok: true, team_idx: teamIdx });
    }

    // set_team_name — the organizer OR any roster member may rename.
    if ((!mine || mine.join_status !== 'active') && session.owner_id !== userId) {
      return json({ error: 'not_in_roster' }, 403);
    }
    const teamIdx = Number(body.team_idx);
    if (!Number.isInteger(teamIdx) || teamIdx < 1 || teamIdx > teamCount) {
      return json({ error: 'team_invalid' }, 400);
    }
    const teamName = String(body.name ?? '').trim();
    if (!teamName || teamName.length > MAX_NAME_LEN) return json({ error: 'name_invalid' }, 400);
    // Server-side content filter (Apple 1.2): team names show to the whole roster.
    if (!checkContent(teamName).ok) return json({ error: 'name_blocked' }, 400);
    const names: string[] = (Array.isArray(session.team_names) ? session.team_names : [])
      .map((n: string | null) => n ?? '');
    while (names.length < teamCount) names.push('');
    names[teamIdx - 1] = teamName;
    const { error } = await admin
      .from('collectz_sessions')
      .update({ team_names: names })
      .eq('id', session.id);
    if (error) return json({ error: 'team_failed' }, 500);
    return json({ ok: true, team_names: names });
  }

  if (action === 'leave') {
    // Only a roster member (claimed or self-added) can leave, and only while
    // still unpaid — a pending/confirmed/rejected row means money already moved
    // or was reviewed, which is the organizer's to sort out. self_added rows are
    // dropped; a claimed organizer name is only freed (user_id cleared) so the
    // slot + name stay on the roster for the next claimant. The user_id guard on
    // the write makes it a no-op if the row changed hands underneath us.
    const mine = roster.find((p) => p.user_id === userId);
    if (!mine) return json({ error: 'not_in_roster' }, 403);
    if (mine.status !== 'unpaid') return json({ error: 'leave_failed' }, 409);
    const q = admin.from('collectz_participants');
    const { error } = mine.self_added
      ? await q.delete().eq('id', mine.id).eq('user_id', userId)
      : await q.update({ user_id: null }).eq('id', mine.id).eq('user_id', userId);
    if (error) return json({ error: 'leave_failed' }, 500);
    return json({ ok: true });
  }

  if (roster.some((p) => p.user_id === userId)) return json({ error: 'already_joined' }, 409);

  if (action === 'claim') {
    const participantId = String(body.participant_id ?? '');
    const target = roster.find((p) => p.id === participantId);
    if (!target) return json({ error: 'not_found' }, 404);
    if (target.user_id) return json({ error: 'already_claimed' }, 409);

    // Optional team pick — validated exactly like set_team. Omitting it keeps
    // whatever team the organizer pre-assigned to the row.
    const teamIdx = body.team_idx == null ? null : Number(body.team_idx);
    if (teamIdx !== null) {
      const teamCount: number = session.team_count ?? 0;
      if (!Number.isInteger(teamIdx) || teamIdx < 1 || teamIdx > teamCount) {
        return json({ error: 'team_invalid' }, 400);
      }
      if (session.team_size != null) {
        const teamMembers = actives.filter((p) => p.team_idx === teamIdx && p.id !== target.id);
        if (teamMembers.length >= session.team_size) return json({ error: 'team_full' }, 409);
      }
    }

    const patch: Record<string, unknown> = { user_id: userId };
    if (teamIdx !== null) patch.team_idx = teamIdx;
    const { error } = await admin
      .from('collectz_participants')
      .update(patch)
      .eq('id', participantId)
      .is('user_id', null); // guard against a race with another claimant
    if (error) return json({ error: 'claim_failed' }, 500);

    return json({ ok: true, participant_id: participantId, team_idx: teamIdx ?? target.team_idx ?? null });
  }

  // add_self
  const name = String(body.name ?? '').trim();
  if (!name || name.length > MAX_NAME_LEN) return json({ error: 'name_invalid' }, 400);
  // Server-side content filter (Apple 1.2): your name shows to everyone on the roster.
  if (!checkContent(name).ok) return json({ error: 'name_blocked' }, 400);

  // Approval mode: unknown self-adds queue as join_status='requested' instead
  // of landing on the roster. Claims above are untouched — the organizer
  // pre-added that name, so it skips the queue even when this is on.
  const needsApproval = session.join_requires_approval === true;

  // Capacity: adding yourself creates a NEW active row, so it's rejected once
  // the roster is full. Claiming a pre-added name above stays allowed — that
  // slot is already counted in actives.
  if (session.max_participants != null && actives.length >= session.max_participants) {
    return json({ error: 'session_full' }, 409);
  }

  // Optional team pick — validated exactly like set_team. A REQUESTED join
  // skips this: the team is picked from the join page once approved.
  const teamIdx = body.team_idx == null || needsApproval ? null : Number(body.team_idx);
  if (teamIdx !== null) {
    const teamCount: number = session.team_count ?? 0;
    if (!Number.isInteger(teamIdx) || teamIdx < 1 || teamIdx > teamCount) {
      return json({ error: 'team_invalid' }, 400);
    }
    if (session.team_size != null) {
      const teamMembers = actives.filter((p) => p.team_idx === teamIdx);
      if (teamMembers.length >= session.team_size) return json({ error: 'team_full' }, 409);
    }
  }

  const { data: inserted, error } = await admin
    .from('collectz_participants')
    .insert({
      session_id: session.id,
      name,
      user_id: userId,
      team_idx: teamIdx,
      join_status: needsApproval ? 'requested' : 'active',
      self_added: true,
    })
    .select('id')
    .single();
  if (error) {
    // Unique violation (23505) = lost the check-then-insert race with another
    // join/claim for the same user — that's a conflict, not a server error.
    if (error.code === '23505') return json({ error: 'already_joined' }, 409);
    return json({ error: 'join_failed' }, 500);
  }

  // A requested insert pushes the organizer via the trg_notify_collectz_join
  // DB trigger — nothing to send from here.
  return json({ ok: true, participant_id: inserted.id, team_idx: teamIdx, requested: needsApproval });
});
