/**
 * Drains quick_log_inbox rows (written by the quick-log edge function while the
 * app was closed) into real personal transactions via logQuickExpense. Runs on
 * foreground/login. Idempotent: only rows with consumed_at IS NULL are logged,
 * and each is stamped consumed_at immediately after.
 */
import { supabasePersonal as supabase } from './supabase'; // personal client (quick-log inbox)
import { logQuickExpense, undoQuickExpense } from './quickLog';
import { mapInboxRowToQuickLog, type QuickLogInboxRow } from './quickLogInboxMap';

let draining = false;

/** Fetch → log → mark consumed. Returns how many rows were logged. */
export async function drainQuickLogInbox(): Promise<number> {
  if (draining) return 0;          // a drain is already running — skip
  draining = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
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
