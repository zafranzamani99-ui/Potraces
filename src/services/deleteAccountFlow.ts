import { isSharedAccount } from './accountLink';
import type { Mode } from './supabase';

/**
 * Decide how to delete one mode's account:
 * - `'data-only'` when the two modes share one Supabase auth user — deleting that
 *   user would orphan the other mode, so we wipe only this mode's data.
 * - `'full'` otherwise — safe to delete this mode's auth user outright.
 *
 * `_mode` is accepted for call-site clarity; the decision is symmetric.
 */
export function planDelete(
  _mode: Mode,
  businessUserId: string | null,
  personalUserId: string | null,
): 'full' | 'data-only' {
  return isSharedAccount(businessUserId, personalUserId) ? 'data-only' : 'full';
}
