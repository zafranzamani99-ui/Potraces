import { supabase } from './supabase';
import { usePendingPaymentsStore, type PendingCharge } from '../store/pendingPaymentsStore';
import { qrProviderConfigured } from './qrProvider';

/**
 * Resolve waiting QR charges against the server's payment_events feed.
 *
 * Design choice — POLL ON FOCUS, not realtime. The app already pulls on
 * foreground (personalSync / sellerSync) rather than holding live channels, so
 * a focus-triggered poll matches the existing pattern, needs no extra socket,
 * and is plenty: a waiting charge is a short-lived, user-present moment. Call
 * this on screen focus (and after foreground) while any charge is pending.
 *
 * Returns the charges that were just confirmed, so the caller can toast / buzz.
 * No-op (returns []) when no provider is configured or nothing is pending.
 */
export async function resolvePendingPayments(): Promise<PendingCharge[]> {
  if (!qrProviderConfigured()) return [];

  const store = usePendingPaymentsStore.getState();
  const pending = store.prune();
  if (pending.length === 0) return [];

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const since = pending.reduce(
    (min, p) => (p.createdAt < min ? p.createdAt : min),
    pending[0].createdAt,
  );

  const { data: events } = await supabase
    .from('payment_events')
    .select('charge_id, app_ref, amount_cents')
    .eq('user_id', session.user.id)
    .gte('created_at', since);
  if (!events || events.length === 0) return [];

  const resolved: PendingCharge[] = [];
  for (const p of pending) {
    const hit = events.find(
      (e: { charge_id: string | null; app_ref: string | null }) =>
        e.charge_id === p.id || e.app_ref === p.refId || e.charge_id === p.refId,
    );
    if (hit) {
      store.resolvePending(p.id);
      resolved.push(p);
    }
  }
  return resolved;
}
