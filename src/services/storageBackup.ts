/**
 * storageBackup — a local rolling safety net for the app's data stores.
 *
 * WHY: AsyncStorage keeps NO history. A single bad write (a buggy sync, a crash
 * mid-mutation, a migration error) overwrites a Zustand persist key and the old
 * value is gone forever — exactly what destroyed debt descriptions / split items
 * on 2026-06-11. This keeps the last few DAILY snapshots of each money/data store,
 * so any single bad day is recoverable.
 *
 * HOW: `snapshotAll()` runs once per launch and captures the on-disk state. One
 * snapshot per calendar day per key (the FIRST/healthiest of the day is kept);
 * empty/corrupt blobs are skipped so a bad state can never overwrite a good backup.
 * Restore is explicit + manual, and itself reversible.
 *
 * This is local-only and dependency-light — it does NOT touch the live stores
 * except in `restoreBackup` (which you call deliberately, then reload the app).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// The stores worth protecting (money + user-authored content).
export const PROTECTED_KEYS = [
  'debt-storage',
  'personal-storage',
  'wallet-storage',
  'savings-storage',
  'business-storage',
  'seller-storage',
  'playbook-storage',
  'notes-storage',
  'category-storage',
];

const KEEP_DAYS = 5;
const PREFIX = 'bak:';

// The personal-data subset of PROTECTED_KEYS (excludes business/seller + shared
// category storage) — used so a personal-only account deletion purges the right
// backups without nuking business backups.
export const PERSONAL_BACKUP_KEYS = [
  'debt-storage',
  'personal-storage',
  'wallet-storage',
  'savings-storage',
  'playbook-storage',
  'notes-storage',
];

function dayStamp(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const bakKey = (key: string, stamp: string) => `${PREFIX}${key}:${stamp}`;

// A blob is worth backing up only if it parses to a non-trivial object — so we
// never replace a good backup with an empty/corrupt current state.
function looksHealthy(raw: string | null): boolean {
  if (!raw || raw.length < 20) return false;
  try {
    const p = JSON.parse(raw);
    return !!p && typeof p === 'object';
  } catch {
    return false;
  }
}

/** Snapshot each protected store once per day (keeps the earliest healthy capture). */
export async function snapshotAll(): Promise<void> {
  const stamp = dayStamp();
  for (const key of PROTECTED_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!looksHealthy(raw)) continue; // never back up empty/corrupt over a good one
      const todayKey = bakKey(key, stamp);
      if (await AsyncStorage.getItem(todayKey)) continue; // already captured today — keep earliest
      await AsyncStorage.setItem(todayKey, raw as string);
      await prune(key);
    } catch {
      /* best-effort — must never block startup */
    }
  }
}

async function prune(key: string): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const p = `${PREFIX}${key}:`;
    const stamps = all
      .filter((k) => k.startsWith(p) && !k.includes('prerestore'))
      .map((k) => k.slice(p.length))
      .sort(); // ascending date
    while (stamps.length > KEEP_DAYS) {
      const oldest = stamps.shift();
      if (oldest) await AsyncStorage.removeItem(bakKey(key, oldest));
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Delete ALL backup snapshots (incl. prerestore-*) for the given store keys —
 * defaults to every protected store. Called on account/data deletion so the
 * deletion right is complete (the backups hold copies of the same data).
 */
export async function purgeBackups(keys: string[] = PROTECTED_KEYS): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const toRemove = all.filter(
      (k) => k.startsWith(PREFIX) && keys.some((key) => k.startsWith(`${PREFIX}${key}:`)),
    );
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {
    /* best-effort */
  }
}

/** Map of store key → available snapshot day-stamps (newest last). */
export async function listBackups(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  try {
    const all = await AsyncStorage.getAllKeys();
    for (const k of all) {
      if (!k.startsWith(PREFIX)) continue;
      const rest = k.slice(PREFIX.length);
      const idx = rest.lastIndexOf(':');
      if (idx < 0) continue;
      const key = rest.slice(0, idx);
      const stamp = rest.slice(idx + 1);
      (out[key] ||= []).push(stamp);
    }
    for (const k of Object.keys(out)) out[k].sort();
  } catch {
    /* best-effort */
  }
  return out;
}

/**
 * Distinct backup day-stamps across all stores, newest first, with how many
 * stores were captured that day. Excludes the internal `prerestore-*` safety
 * copies. This is what the Backups & Restore screen lists.
 */
export async function listBackupDays(): Promise<{ stamp: string; storeCount: number }[]> {
  const map = await listBackups();
  const byDay = new Map<string, number>();
  for (const key of Object.keys(map)) {
    for (const stamp of map[key]) {
      if (stamp.startsWith('prerestore')) continue;
      byDay.set(stamp, (byDay.get(stamp) ?? 0) + 1);
    }
  }
  return Array.from(byDay.entries())
    .map(([stamp, storeCount]) => ({ stamp, storeCount }))
    .sort((a, b) => (a.stamp < b.stamp ? 1 : -1)); // newest first
}

/**
 * Restore EVERY store that has a snapshot for the given day. Each restore snapshots
 * the current state first (reversible). Returns how many stores were restored. The
 * app must be RELOADED afterward for Zustand to re-hydrate.
 */
export async function restoreDay(stamp: string): Promise<number> {
  const map = await listBackups();
  let restored = 0;
  for (const key of Object.keys(map)) {
    if (map[key].includes(stamp)) {
      const ok = await restoreBackup(key, stamp);
      if (ok) restored++;
    }
  }
  return restored;
}

/**
 * Restore one store from a daily snapshot. OVERWRITES the live key, so the app
 * must be RELOADED afterward for Zustand to re-hydrate from it. The current state
 * is itself snapshotted first (a `prerestore-*` backup) so a restore is reversible.
 * Deliberate use only.
 */
export async function restoreBackup(key: string, stamp: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(bakKey(key, stamp));
    if (!looksHealthy(raw)) return false;
    const current = await AsyncStorage.getItem(key);
    if (looksHealthy(current)) {
      await AsyncStorage.setItem(bakKey(key, `prerestore-${dayStamp()}`), current as string);
    }
    await AsyncStorage.setItem(key, raw as string);
    return true;
  } catch {
    return false;
  }
}
