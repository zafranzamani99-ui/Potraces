/**
 * Drains quick_log_inbox rows (written by the quick-log edge function while the
 * app was closed) into real personal transactions via logQuickExpense. Runs on
 * foreground/login. Idempotent: only rows with consumed_at IS NULL are logged,
 * and each is stamped consumed_at immediately after.
 */
import { supabase } from './supabase';
import { logQuickExpense } from './quickLog';
import { mapInboxRowToQuickLog, type QuickLogInboxRow } from './quickLogInboxMap';

/** Fetch → log → mark consumed. Returns how many rows were logged. */
export async function drainQuickLogInbox(): Promise<number> {
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
    await supabase.from('quick_log_inbox')
      .update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
    if (result) logged++;
  }
  return logged;
}
