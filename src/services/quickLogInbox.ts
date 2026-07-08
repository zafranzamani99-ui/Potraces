/**
 * Drains quick_log_inbox rows (written by the quick-log edge function while the
 * app was closed) into real personal transactions via logQuickExpense. Runs on
 * foreground/login. Idempotent: only rows with consumed_at IS NULL are logged,
 * and each is stamped consumed_at immediately after.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabasePersonal as supabase } from './supabase'; // personal client (quick-log inbox)
import { logQuickExpense, undoQuickExpense } from './quickLog';
import { mapInboxRowToQuickLog, type QuickLogInboxRow } from './quickLogInboxMap';
import { useSettingsStore } from '../store/settingsStore';

let draining = false;

/** Fetch → log → mark consumed. Returns how many rows were logged. */
export async function drainQuickLogInbox(): Promise<number> {
  if (draining) return 0;          // a drain is already running — skip
  draining = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return 0;
    // Quick Log is a cloud feature — respect a user who has Cloud Backup off.
    if (!useSettingsStore.getState().personalSyncEnabled) return 0;

    const { data: rows, error } = await supabase
      .from('quick_log_inbox')
      .select('*')
      .eq('user_id', userId)
      .is('consumed_at', null)
      .order('occurred_at', { ascending: true });
    if (error || !rows || rows.length === 0) return 0;

    let logged = 0;
    for (const row of rows as QuickLogInboxRow[]) {
      const result = logQuickExpense(mapInboxRowToQuickLog(row));
      // Stamp consumed even if amount was invalid (result null) so we don't retry
      // a permanently-bad row forever.
      const { error: markErr } = await supabase.from('quick_log_inbox')
        .update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
      if (markErr) {
        // Couldn't mark consumed — reverse the just-logged tx so the row is never
        // left BOTH logged AND unconsumed (which would double-log next drain).
        if (result) undoQuickExpense(result);
        continue;
      }
      if (result) logged++;
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
      .subscribe();
  };
  const detach = () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
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
