/**
 * Drains quick_log_inbox rows (written by the quick-log edge function while the
 * app was closed) into real personal transactions via logQuickExpense. Runs on
 * foreground/login. Idempotent: only rows with consumed_at IS NULL are logged,
 * and each is stamped consumed_at immediately after.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabasePersonal as supabase } from './supabase'; // personal client (quick-log inbox)
import { logQuickExpense } from './quickLog';
import { mapInboxRowToQuickLog, type QuickLogInboxRow } from './quickLogInboxMap';

let draining = false;

/** Fetch → log → mark consumed. Returns how many rows were logged. */
export async function drainQuickLogInbox(): Promise<number> {
  if (draining) return 0;          // a drain is already running — skip
  draining = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    // A signed-in (free) account is all Quick Log needs — Cloud Backup stays
    // paid, but the inbox is its own tiny channel, independent of full sync.
    if (!userId) return 0;

    const { data: rows, error } = await supabase
      .from('quick_log_inbox')
      .select('*')
      .eq('user_id', userId)
      .is('consumed_at', null)
      .order('occurred_at', { ascending: true });
    if (error || !rows || rows.length === 0) return 0;

    let logged = 0;
    for (const row of rows as QuickLogInboxRow[]) {
      try {
        // CLAIM FIRST, atomically: two devices on one account both receive the
        // realtime INSERT and both reach here — the conditional UPDATE is a
        // compare-and-set, so exactly ONE device wins the row and logs money.
        // (Losing device gets zero rows back and skips.) Claiming before
        // logging also closes the crash window that could double-log.
        const { data: claimed, error: claimErr } = await supabase
          .from('quick_log_inbox')
          .update({ consumed_at: new Date().toISOString() })
          .eq('id', row.id)
          .is('consumed_at', null)
          .select('id');
        if (claimErr || !claimed || claimed.length === 0) continue; // lost the race / network — retry next drain
        const result = logQuickExpense(mapInboxRowToQuickLog(row));
        if (result) logged++;
      } catch {
        // One bad row (store edge case) must not abort the rest of the drain.
        continue;
      }
    }
    return logged;
  } finally {
    draining = false;
  }
}

/**
 * Live-update: fire `onInsert` whenever the quick-log edge function inserts a
 * row for the signed-in personal user — so a Back Tap entry appears on an
 * OPEN screen without waiting for a push or an AppState transition (both are
 * unreliable when the Shortcut runs over the foregrounded app). Requires the
 * table in the supabase_realtime publication (20260708010000 migration); RLS
 * limits events to the owner's rows. Returns an unsubscribe function.
 */
// Last realtime channel status — surfaced on the Quick Log screen so delivery
// problems are observable on-device instead of guessed at.
// 'idle' → not attached (no session yet) | SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED
let realtimeStatus = 'idle';
export function getQuickLogRealtimeStatus(): string {
  return realtimeStatus;
}

export function subscribeQuickLogInbox(onInsert: () => void): () => void {
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  const attach = (userId: string) => {
    if (cancelled || channel) return;
    channel = supabase
      .channel('quick-log-inbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quick_log_inbox', filter: `user_id=eq.${userId}` },
        () => onInsert(),
      )
      .subscribe((status, err) => {
        realtimeStatus = err ? `${status}: ${err.message}` : status;
        if (__DEV__) console.log('[quick-log] realtime:', realtimeStatus);
      });
  };
  const detach = () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
      realtimeStatus = 'idle';
    }
  };

  (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) attach(session.user.id);
  })();
  // Follow auth: attach when the personal user signs in mid-session, detach on
  // sign-out (a stale filter would otherwise linger for the old user id).
  const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') detach();
    else if (session?.user?.id) attach(session.user.id);
  });

  return () => {
    cancelled = true;
    authSub.subscription.unsubscribe();
    detach();
  };
}
