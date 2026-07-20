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
  pay_by?: string | null;
  qr_payload?: string | null;
  qr_image_path?: string | null;
}

const PROOFS_BUCKET = 'collectz-proofs';
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
    'title' | 'event_at' | 'venue' | 'details_text' | 'rules_text' | 'scheme' | 'total_amount' | 'default_share' | 'currency' | 'pay_by' | 'share_code'
  >,
  activeCount: number,
): string {
  const lines: string[] = [`*${session.title}* 🔥`, ''];
  const date = fmtEventDate(session.event_at ?? null);
  const time = fmtEventTime(session.event_at ?? null);
  if (date) lines.push(`📅 ${date}`);
  if (time) lines.push(`🕰️ ${time}`);
  if (session.venue) lines.push(`📍 ${session.venue}`);
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
  const { error } = await supabase.from('collectz_participants').delete().eq('id', id);
  throwIfError(error, 'Could not remove the participant.');
}

// ── Organizer: review flow ───────────────────────────────────────────────────

/** Confirm payment — also the organizer's manual tick for offline people. */
export async function confirmParticipant(id: string): Promise<void> {
  const { error } = await supabase
    .from('collectz_participants')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
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
  const { error } = await supabase
    .from('collectz_participants')
    .update({ status: 'unpaid' })
    .eq('id', participantId);
  throwIfError(error, 'Could not withdraw the proof.');
}

/** Short-lived signed URL for viewing a proof (owner or uploader only). */
export async function proofSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PROOFS_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// ── Organizer: reminders ─────────────────────────────────────────────────────

export async function remindUnpaid(sessionId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('collectz-remind', {
    body: { session_id: sessionId },
  });
  if (error) throw new Error(error.message || 'Could not send reminders.');
  return (data as { sent?: number })?.sent ?? 0;
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
