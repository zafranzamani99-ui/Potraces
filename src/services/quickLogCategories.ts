/**
 * Uploads the user's personal category labels to quick_log_prefs, so the shared
 * Quick Log Shortcut can fetch THEIR real categories (renames + customs) via
 * the quick-log function's action:'categories' — the same live-fetch trick the
 * Payment picker already uses for wallets.
 *
 * This is quick-log infrastructure, NOT cloud backup: free signed-in users get
 * it too (RLS: each user writes only their own row). Silent + best-effort —
 * the server falls back to the default category set when nothing is uploaded.
 *
 * Two triggers: an explicit push (Quick Log setup screen mount) and a debounced
 * store subscription (any category edit — add / rename / delete / reorder).
 */
import { supabasePersonal as supabase } from './supabase'; // personal client (quick-log prefs)
import { useCategoryStore } from '../store/categoryStore';

export async function pushQuickLogCategories(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  const store = useCategoryStore.getState();
  const labels = Array.from(
    new Set(
      [
        ...store.getExpenseCategories('personal'),
        ...store.getIncomeCategories('personal'),
      ]
        .map((c) => (c.name ?? '').trim())
        .filter(Boolean)
    )
  ).slice(0, 60);
  if (labels.length === 0) return;

  await supabase
    .from('quick_log_prefs')
    .upsert({ user_id: userId, categories: labels, updated_at: new Date().toISOString() });
}

// categoryStore holds ONLY category definitions — any write to it is a
// category change. Debounce so a burst of edits (reorder drags) = one upload.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
useCategoryStore.subscribe(() => {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushQuickLogCategories().catch(() => {});
  }, 3000);
});
