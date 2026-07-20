// Collectz / Kutipz — client service for the group-payment tracker.
//
// The Supabase tables are the source of truth (shared between organizer and
// participants), so unlike personal finance data this is NOT local-first:
// screens query through here and keep fresh via realtime (`subscribeToSession`).
//
// Access split (RLS, migration 20260721000000):
//   * Organizer — direct table queries (owner policies expose everything).
//   * Participant — the `collectz-join` edge function (roster, QR, claim);
//     direct access is limited to their own participant row (proof upload +
//     status). Proofs live in the private `collectz-proofs` bucket.
import { supabasePersonal as supabase } from './supabase';
import { startOfWeek } from 'date-fns';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { computeShares, computeProgress } from './collectzMath';

// Pure math lives in ./collectzMath (no RN imports, unit-testable under tsx).
// Re-exported here so screens have a single import site.
export { computeShares, computeProgress };

// ── Types ───────────────────────────────────────────────────────────────────

export type CollectzScheme = 'flat' | 'equal' | 'custom';
export type CollectzSlot = 'active' | 'reserve';
export type CollectzParticipantStatus = 'unpaid' | 'pending' | 'confirmed' | 'rejected';
export type CollectzSessionStatus = 'open' | 'settled' | 'cancelled';

export interface CollectzSession {
  id: string;
  owner_id: string;
  title: string;
  category: string | null;
  event_at: string | null;
  venue: string | null;
  details_text: string | null;
  rules_text: string | null;
  scheme: CollectzScheme;
  total_amount: number | null;
  default_share: number | null;
  currency: string;
  pay_by: string | null;
  qr_payload: string | null;
  qr_image_path: string | null;
  /** Club identity: 'preset:<id>' (bundled icon) or a collectz-images storage path. */
  image_path: string | null;
  /** Google Maps / Waze link for the venue (preview card parses it). */
  maps_url: string | null;
  /** 24h cooldown marker for collectz-remind. */
  last_reminded_at: string | null;
  share_code: string;
  status: CollectzSessionStatus;
  created_at: string;
  updated_at: string;
}

export interface CollectzParticipant {
  id: string;
  session_id: string;
  name: string;
  user_id: string | null;
  slot: CollectzSlot;
  share_amount: number | null;
  status: CollectzParticipantStatus;
  proof_path: string | null;
  reject_note: string | null;
  marked_at: string | null;
  confirmed_at: string | null;
  /** Participant self-hide (their Home list only). */
  archived_at: string | null;
  created_at: string;
}

export interface CollectzRosterEntry {
  id: string;
  name: string;
  slot: CollectzSlot;
  status: CollectzParticipantStatus;
  effective_share: number | null;
  claimed: boolean;
}

/** Response of the collectz-join `view` action (public + authed projections). */
export interface CollectzJoinView {
  session: Pick<
    CollectzSession,
    | 'id'
    | 'title'
    | 'category'
    | 'event_at'
    | 'venue'
    | 'details_text'
    | 'rules_text'
    | 'scheme'
    | 'currency'
    | 'pay_by'
    | 'status'
    | 'image_path'
    | 'maps_url'
  >;
  participants: CollectzRosterEntry[];
  progress: {
    active_count: number;
    confirmed_count: number;
    target_amount: number | null;
    confirmed_amount: number;
  };
  // Authed callers only:
  qr_payload?: string | null;
  qr_image_path?: string | null;
  my_participant?: {
    id: string;
    name: string;
    slot: CollectzSlot;
    status: CollectzParticipantStatus;
    effective_share: number | null;
  } | null;
}

export interface CollectzSessionInput {
  title: string;
  category?: string | null;
  event_at?: string | null;
  venue?: string | null;
  details_text?: string | null;
  rules_text?: string | null;
  scheme: CollectzScheme;
  total_amount?: number | null;
  default_share?: number | null;
  currency?: string;
  pay_by?: string | null;
  qr_payload?: string | null;
  qr_image_path?: string | null;
  image_path?: string | null;
  maps_url?: string | null;
}

const PROOFS_BUCKET = 'collectz-proofs';
const IMAGES_BUCKET = 'collectz-images';
const SITE_BASE = 'https://jejakbaki.my/collectz';

// ── Links & announcement ─────────────────────────────────────────────────────

export function collectzUrl(shareCode: string): string {
  return `${SITE_BASE}/${encodeURIComponent(shareCode)}`;
}

function fmtEventDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function fmtEventTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Ready-to-paste WhatsApp announcement — replaces the hand-typed group
 * message. Ends with the join link; every share advertises the app.
 */
export function buildWhatsappAnnouncement(
  session: Pick<
    CollectzSession,
    'title' | 'event_at' | 'venue' | 'details_text' | 'rules_text' | 'scheme' | 'total_amount' | 'default_share' | 'currency' | 'pay_by' | 'share_code' | 'maps_url'
  >,
  activeCount: number,
): string {
  const lines: string[] = [`*${session.title}* 🔥`, ''];
  const date = fmtEventDate(session.event_at ?? null);
  const time = fmtEventTime(session.event_at ?? null);
  if (date) lines.push(`📅 ${date}`);
  if (time) lines.push(`🕰️ ${time}`);
  if (session.venue) lines.push(`📍 ${session.venue}`);
  if (session.maps_url) lines.push(`🗺️ ${session.maps_url}`);
  if (session.details_text) lines.push(`🏟️ ${session.details_text}`);

  if (session.scheme === 'flat' && session.default_share != null) {
    lines.push(`💸 ${session.currency} ${session.default_share.toFixed(2)} per person`);
  } else if (session.scheme === 'equal' && session.total_amount != null && activeCount > 0) {
    lines.push(
      `💸 ${session.currency} ${session.total_amount.toFixed(2)} total ÷ ${activeCount} people`,
    );
  } else if (session.scheme === 'custom') {
    lines.push(`💸 Check your share in the app`);
  }

  if (session.pay_by) {
    const pbDate = fmtEventDate(session.pay_by);
    const pbTime = fmtEventTime(session.pay_by);
    lines.push(`⏰ Pay by ${[pbDate, pbTime].filter(Boolean).join(', ')}`);
  }

  if (session.rules_text) {
    lines.push('', `*TAKE NOTE*`, session.rules_text);
  }

  lines.push('', `✅ Confirm your slot & pay here:`, collectzUrl(session.share_code));
  lines.push(`_Track & pay via Potraces_`);
  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Marker for "no personal session" — screens use this to offer sign-in. */
export const COLLECTZ_AUTH_ERROR = 'auth_required';

export function isCollectzAuthError(err: unknown): boolean {
  return err instanceof Error && err.message === COLLECTZ_AUTH_ERROR;
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error(COLLECTZ_AUTH_ERROR);
  return uid;
}

function generateShareCode(): string {
  // Unambiguous alphabet (no 0/O, 1/I/L), 8 chars ≈ 41 bits — plenty against
  // guessing for a link-capability code, short enough to read out loud.
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function throwIfError(error: { message?: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

// ── Organizer: session CRUD ──────────────────────────────────────────────────

/**
 * Sessions I created since Monday 00:00 (calendar week, weekStartsOn: 1) — the
 * usage counter for the free tier's create cap (TIER_LIMITS.maxCollectzSessionsPerWeek).
 * Fail-OPEN (0 on error): the paywall is UX, not a security boundary — an
 * offline user hits the create call's own failure soon enough anyway.
 */
export async function countSessionsCreatedThisWeek(): Promise<number> {
  const uid = await requireUserId();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const { count, error } = await supabase
    .from('collectz_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', uid)
    .gte('created_at', weekStart);
  if (error) return 0;
  return count ?? 0;
}

export async function createSession(input: CollectzSessionInput): Promise<CollectzSession> {
  const uid = await requireUserId();
  // Retry on share_code unique violation (same pattern as referral codes).
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('collectz_sessions')
      .insert({ ...input, owner_id: uid, share_code: generateShareCode() })
      .select()
      .single();
    if (!error && data) return data as CollectzSession;
    if ((error as { code?: string } | null)?.code !== '23505') {
      throwIfError(error, 'Could not create the session.');
    }
  }
  throw new Error('Could not create the session.');
}

export async function updateSession(
  id: string,
  updates: Partial<CollectzSessionInput> & { status?: CollectzSessionStatus },
): Promise<void> {
  const { error } = await supabase.from('collectz_sessions').update(updates).eq('id', id);
  throwIfError(error, 'Could not update the session.');
}

/**
 * Sessions I organize + sessions I joined (RLS returns both), split by
 * ownership. Each entry carries its participants (for me as a participant,
 * RLS limits that to my own row — progress there comes from the join view).
 */
export async function listMySessions(): Promise<{
  organizing: CollectzSession[];
  joined: CollectzSession[];
}> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('collectz_sessions')
    .select('*')
    .order('created_at', { ascending: false });
  throwIfError(error, 'Could not load sessions.');
  const all = (data ?? []) as CollectzSession[];
  return {
    organizing: all.filter((s) => s.owner_id === uid),
    joined: all.filter((s) => s.owner_id !== uid),
  };
}

/** Organizer view: session + full roster (owner RLS exposes all rows). */
export async function getSessionWithRoster(
  id: string,
): Promise<{ session: CollectzSession; participants: CollectzParticipant[] }> {
  const [{ data: session, error: sErr }, { data: participants, error: pErr }] = await Promise.all([
    supabase.from('collectz_sessions').select('*').eq('id', id).single(),
    supabase
      .from('collectz_participants')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  ]);
  throwIfError(sErr, 'Could not load the session.');
  throwIfError(pErr, 'Could not load the roster.');
  return { session: session as CollectzSession, participants: (participants ?? []) as CollectzParticipant[] };
}

// ── Roster avatars ───────────────────────────────────────────────────────────

export interface CollectzProfile {
  user_id: string;
  avatar_id: string | null;
  avatar_uri: string | null;
}

/**
 * Avatars for roster participants who claimed with a real account (user_id
 * set). Read from user_profiles (migration 20260721010000). Decorative only —
 * any failure returns an empty map so the roster always renders (initials).
 */
export async function fetchRosterProfiles(userIds: string[]): Promise<Record<string, CollectzProfile>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, avatar_id, avatar_uri')
    .in('user_id', userIds);
  if (error) return {};
  const map: Record<string, CollectzProfile> = {};
  for (const row of data ?? []) map[(row as CollectzProfile).user_id] = row as CollectzProfile;
  return map;
}

// ── Organizer: roster management ─────────────────────────────────────────────

export async function addParticipant(
  sessionId: string,
  name: string,
  opts: { slot?: CollectzSlot; share_amount?: number | null } = {},
): Promise<CollectzParticipant> {
  const { data, error } = await supabase
    .from('collectz_participants')
    .insert({
      session_id: sessionId,
      name: name.trim(),
      slot: opts.slot ?? 'active',
      share_amount: opts.share_amount ?? null,
    })
    .select()
    .single();
  throwIfError(error, 'Could not add the participant.');
  return data as CollectzParticipant;
}

export async function updateParticipant(
  id: string,
  updates: Partial<Pick<CollectzParticipant, 'name' | 'slot' | 'share_amount'>>,
): Promise<void> {
  const { error } = await supabase.from('collectz_participants').update(updates).eq('id', id);
  throwIfError(error, 'Could not update the participant.');
}

export async function removeParticipant(id: string): Promise<void> {
  // Clean up the proof file first — row deletes don't cascade into storage.
  const { data: row } = await supabase
    .from('collectz_participants')
    .select('proof_path')
    .eq('id', id)
    .single();
  if (row?.proof_path) await deleteProofObjects([row.proof_path]);
  const { error } = await supabase.from('collectz_participants').delete().eq('id', id);
  throwIfError(error, 'Could not remove the participant.');
}

// ── Organizer: review flow ───────────────────────────────────────────────────

/** Confirm payment — also the organizer's manual tick for offline people. */
export async function confirmParticipant(id: string): Promise<void> {
  // Share-lock: freeze the computed share at confirm time, so a later roster
  // edit (removal / promotion) never moves money someone already paid.
  const { data: row, error: readErr } = await supabase
    .from('collectz_participants')
    .select('session_id, share_amount')
    .eq('id', id)
    .single();
  throwIfError(readErr, 'Could not confirm.');
  let lockShare: number | null = null;
  if (row && row.share_amount === null) {
    const { session, participants } = await getSessionWithRoster(row.session_id);
    lockShare = computeShares(session, participants).get(id) ?? null;
  }
  const { error } = await supabase
    .from('collectz_participants')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      ...(lockShare !== null ? { share_amount: lockShare } : {}),
    })
    .eq('id', id);
  throwIfError(error, 'Could not confirm.');
}

export async function rejectParticipant(id: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('collectz_participants')
    .update({ status: 'rejected', reject_note: note || null })
    .eq('id', id);
  throwIfError(error, 'Could not reject.');
}

/** Move a participant back to unpaid (e.g. a confirm tapped by mistake). */
export async function resetParticipantToUnpaid(id: string): Promise<void> {
  const { data: row } = await supabase
    .from('collectz_participants')
    .select('proof_path')
    .eq('id', id)
    .single();
  if (row?.proof_path) await deleteProofObjects([row.proof_path]);
  const { error } = await supabase
    .from('collectz_participants')
    .update({ status: 'unpaid', proof_path: null, marked_at: null, confirmed_at: null, reject_note: null })
    .eq('id', id);
  throwIfError(error, 'Could not reset the participant.');
}

// ── Participant: join / pay flow ─────────────────────────────────────────────

async function invokeJoin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('collectz-join', { body });
  if (error) throw new Error(error.message || 'Could not reach the server.');
  const payload = data as T & { error?: string };
  if (payload && typeof payload === 'object' && payload.error) {
    const code = payload.error;
    if (code === 'not_found') throw new Error('Session not found — check the link.');
    if (code === 'cancelled') throw new Error('This session was cancelled.');
    if (code === 'already_joined') throw new Error('You already joined this session.');
    if (code === 'already_claimed') throw new Error('That name was already claimed.');
    if (code === 'session_closed') throw new Error('This session is closed.');
    throw new Error(code);
  }
  return payload as T;
}

/** Full join view (roster + QR + my row) via the edge function. */
export async function viewByShareCode(shareCode: string): Promise<CollectzJoinView> {
  return invokeJoin<CollectzJoinView>({ share_code: shareCode, action: 'view' });
}

/** Claim an organizer-added roster name as my own. */
export async function claimParticipant(shareCode: string, participantId: string): Promise<string> {
  const res = await invokeJoin<{ ok: boolean; participant_id: string }>({
    share_code: shareCode,
    action: 'claim',
    participant_id: participantId,
  });
  return res.participant_id;
}

/** Add myself to the roster (my name wasn't pre-added by the organizer). */
export async function addSelf(shareCode: string, name: string): Promise<string> {
  const res = await invokeJoin<{ ok: boolean; participant_id: string }>({
    share_code: shareCode,
    action: 'add_self',
    name,
  });
  return res.participant_id;
}

/**
 * Upload payment proof and move my row to `pending`. Image files are
 * compressed first; PDFs upload as-is. The DB guard trigger only lets the
 * linked user touch status/proof columns.
 */
export async function markPaidWithProof(
  sessionId: string,
  participantId: string,
  file: { uri: string; name: string; mimeType: string },
): Promise<void> {
  const uid = await requireUserId();

  let uploadUri = file.uri;
  let ext = 'jpg';
  let contentType = 'image/jpeg';

  if (file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    ext = 'pdf';
    contentType = 'application/pdf';
  } else {
    const compressed = await manipulateAsync(uploadUri, [{ resize: { width: 1200 } }], {
      compress: 0.7,
      format: SaveFormat.JPEG,
    });
    uploadUri = compressed.uri;
  }

  const path = `${sessionId}/${uid}/${participantId}.${ext}`;
  const formData = new FormData();
  formData.append('', { uri: uploadUri, name: `proof.${ext}`, type: contentType } as any);

  const { error: upErr } = await supabase.storage
    .from(PROOFS_BUCKET)
    .upload(path, formData, { upsert: true, contentType: 'multipart/form-data' });
  throwIfError(upErr, 'Could not upload the proof image.');

  const { error } = await supabase
    .from('collectz_participants')
    .update({ status: 'pending', proof_path: path, marked_at: new Date().toISOString() })
    .eq('id', participantId);
  throwIfError(error, 'Proof uploaded but the status update failed — try again.');
}

/** Withdraw a pending mark (before the organizer reviews it). */
export async function withdrawProof(participantId: string): Promise<void> {
  const { data: row } = await supabase
    .from('collectz_participants')
    .select('proof_path')
    .eq('id', participantId)
    .single();
  if (row?.proof_path) await deleteProofObjects([row.proof_path]);
  const { error } = await supabase
    .from('collectz_participants')
    .update({ status: 'unpaid', proof_path: null })
    .eq('id', participantId);
  throwIfError(error, 'Could not withdraw the proof.');
}

/** Short-lived signed URL for viewing a proof (owner or uploader only). */
export async function proofSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PROOFS_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Public URL for a club image (collectz-images is a public bucket). */
export function clubImageUrl(imagePath: string): string {
  const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(imagePath);
  return data.publicUrl;
}

/** Upload a club image (owner, from the create/edit form) → its storage path. */
export async function uploadClubImage(
  sessionId: string,
  file: { uri: string; mimeType?: string },
): Promise<string> {
  const resized = await manipulateAsync(file.uri, [{ resize: { width: 512 } }], {
    compress: 0.75,
    format: SaveFormat.JPEG,
  });
  const path = `${sessionId}/club.jpg`;
  const formData = new FormData();
  formData.append('', { uri: resized.uri, name: 'club.jpg', type: 'image/jpeg' } as any);
  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, formData, { upsert: true, contentType: 'multipart/form-data' });
  throwIfError(error, 'Could not upload the image.');
  return path;
}

// ── Organizer: reminders ─────────────────────────────────────────────────────

export async function remindUnpaid(sessionId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('collectz-remind', {
    body: { session_id: sessionId },
  });
  if (error) throw new Error(error.message || 'Could not send reminders.');
  return (data as { sent?: number })?.sent ?? 0;
}

// ── Session lifecycle v2: delete / cancel / archive / duplicate / notify ─────

/** Best-effort storage cleanup — never throws (orphan risk beats blocking UX). */
export async function deleteProofObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from(PROOFS_BUCKET).remove(paths).catch(() => {});
}

/** Hard delete: proofs out of storage first, then the row (participants cascade). */
export async function deleteSession(id: string): Promise<void> {
  const { data: rows } = await supabase
    .from('collectz_participants')
    .select('proof_path')
    .eq('session_id', id);
  const paths = (rows ?? []).map((r) => r.proof_path).filter((p): p is string => !!p);
  await deleteProofObjects(paths);
  const { error } = await supabase.from('collectz_sessions').delete().eq('id', id);
  throwIfError(error, 'Could not delete the session.');
}

/** Soft cancel: join link dies (410), history stays. Participants are notified by the caller. */
export async function cancelSession(id: string): Promise<void> {
  await updateSession(id, { status: 'cancelled' });
}

/** New share code — the remedy for a leaked link (old one stops working instantly). */
export async function regenerateShareCode(id: string): Promise<CollectzSession> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('collectz_sessions')
      .update({ share_code: generateShareCode() })
      .eq('id', id)
      .select()
      .single();
    if (!error && data) return data as CollectzSession;
    if ((error as { code?: string } | null)?.code !== '23505') {
      throwIfError(error, 'Could not regenerate the link.');
    }
  }
  throw new Error('Could not regenerate the link.');
}

/** Participant self-hide (their own Home list only; organizer unaffected). */
export async function archiveParticipant(id: string): Promise<void> {
  const { error } = await supabase
    .from('collectz_participants')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  throwIfError(error, 'Could not archive.');
}

export async function unarchiveParticipant(id: string): Promise<void> {
  const { error } = await supabase
    .from('collectz_participants')
    .update({ archived_at: null })
    .eq('id', id);
  throwIfError(error, 'Could not unarchive.');
}

export interface JoinedRow {
  id: string;
  session_id: string;
  status: CollectzParticipantStatus;
  archived_at: string | null;
}

/** My participant rows across every session I joined (RLS self-select). */
export async function listMyJoinedParticipantRows(): Promise<JoinedRow[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('collectz_participants')
    .select('id, session_id, status, archived_at')
    .eq('user_id', uid);
  if (error) return [];
  return (data ?? []) as JoinedRow[];
}

/** The organizer's most recent session (template source), null on first-ever. */
export async function getLastSession(): Promise<CollectzSession | null> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('collectz_sessions')
    .select('*')
    .eq('owner_id', uid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as CollectzSession) ?? null;
}

/**
 * "Same as previous": copies a session's setup + roster into a NEW session.
 * Statuses reset to unpaid; proofs never carry; event/pay-by shift +7 days
 * (weekly clubs); uploaded club image is copied to the new session's folder;
 * share_code is freshly generated by createSession.
 */
export async function duplicateSession(sourceId: string): Promise<CollectzSession> {
  const { session: src, participants } = await getSessionWithRoster(sourceId);
  const plus7 = (iso: string | null) =>
    iso ? new Date(new Date(iso).getTime() + 7 * 86_400_000).toISOString() : null;
  const created = await createSession({
    title: src.title,
    category: src.category,
    event_at: plus7(src.event_at),
    venue: src.venue,
    details_text: src.details_text,
    rules_text: src.rules_text,
    scheme: src.scheme,
    total_amount: src.total_amount,
    default_share: src.default_share,
    currency: src.currency,
    pay_by: plus7(src.pay_by),
    qr_payload: src.qr_payload,
    qr_image_path: src.qr_image_path,
    image_path: src.image_path,
    maps_url: src.maps_url,
  });
  // Uploaded images live under the OLD session folder — copy, don't share the
  // path (deleting the old session would orphan the duplicate's image).
  if (src.image_path && !src.image_path.startsWith('preset:')) {
    const fileName = src.image_path.split('/').pop() ?? 'club.jpg';
    const newPath = `${created.id}/${fileName}`;
    const { error: copyErr } = await supabase.storage
      .from(IMAGES_BUCKET)
      .copy(src.image_path, newPath);
    if (!copyErr) {
      await supabase.from('collectz_sessions').update({ image_path: newPath }).eq('id', created.id);
      created.image_path = newPath;
    }
  }
  for (const p of participants) {
    await addParticipant(created.id, p.name, { slot: p.slot, share_amount: p.share_amount });
  }
  return created;
}

/** Organizer push to all app-linked participants (collectz-notify function). */
export async function notifySession(
  sessionId: string,
  kind: 'edited' | 'cancelled' | 'settled',
  message?: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('collectz-notify', {
    body: { sessionId, kind, message },
  });
  if (error) throw new Error(error.message || 'Could not notify participants.');
  const payload = data as { error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
}

// ── Realtime ─────────────────────────────────────────────────────────────────

/**
 * Live updates for one session. RLS scopes what each subscriber receives:
 * the owner gets every roster change; a participant only gets their own row
 * (their screens refetch the join view on any change).
 */
export function subscribeToSession(sessionId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`collectz:${sessionId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'collectz_participants', filter: `session_id=eq.${sessionId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'collectz_sessions', filter: `id=eq.${sessionId}` },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
