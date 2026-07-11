/**
 * Business income-type memory (the "how does money come to you" choice).
 *
 * Source of truth is a LOCAL per-user map in authStore (offline-first, survives
 * sign-out), backed up to seller_profiles.income_type so it follows the account
 * to a new device / reinstall. All server calls are best-effort — the local map
 * always wins for gating, so nothing here blocks on the network.
 */
import { IncomeType } from '../types';
import { useAuthStore } from '../store/authStore';
import { useBusinessStore } from '../store/businessStore';
import { getSellerIncomeType, setSellerIncomeType, clearSellerIncomeType } from './sellerSync';

/** Persist a freshly-chosen income type: local per-user map + best-effort server. */
export function rememberIncomeType(userId: string, type: IncomeType): void {
  useAuthStore.getState().setLastIncomeType(userId, type);
  setSellerIncomeType(type).catch(() => {}); // best-effort; local map is authoritative
}

/**
 * Restore the remembered income type into businessStore on sign-in.
 * Local map first (instant, offline-safe); if absent, adopt whatever is already
 * in businessStore (returning/upgrading user on the same device) and cache it;
 * otherwise pull from the server (new device / reinstall). Returns the resolved
 * type, or null if this account has no setup yet (→ show the Setup screen).
 *
 * ponytail: when the local map is empty we trust businessStore's current value
 * to avoid forcing every existing user to re-pick once on upgrade. In the rare
 * "switch accounts via a reset-only path (no full sign-out)" case this could
 * adopt the previous account's type — a pre-existing leak this doesn't worsen;
 * the full sign-out path wipes businessStore, so normal account switches are safe.
 */
export async function restoreIncomeType(userId: string): Promise<IncomeType | null> {
  const local = useAuthStore.getState().lastIncomeType[userId];
  if (local) {
    useBusinessStore.setState({ incomeType: local, businessSetupComplete: true });
    return local;
  }

  const current = useBusinessStore.getState().incomeType;
  if (current) {
    useAuthStore.getState().setLastIncomeType(userId, current);
    return current;
  }

  const server = await getSellerIncomeType().catch(() => null);
  if (server) {
    useAuthStore.getState().setLastIncomeType(userId, server);
    useBusinessStore.setState({ incomeType: server, businessSetupComplete: true });
  }
  return server;
}

/** Drop the remembered income type for the current user (local + server) — used
 *  when the user deliberately taps "change how I earn" (resetSetup). */
export function forgetCurrentIncomeType(): void {
  const userId = useAuthStore.getState().business.userId;
  if (!userId) return;
  useAuthStore.getState().setLastIncomeType(userId, null);
  clearSellerIncomeType().catch(() => {});
}
