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
  'budget-profile-storage', // take-home + must-pay commitments (budget basis)
  'receipt-storage',        // scanned receipts (metadata; images live on FS)
  'business-storage',
  'seller-storage',
  'stall-storage',          // stall-mode sessions/sales/products/customers
  'crm-storage',            // seller customers/orders
  'freelancer-storage',     // income-mode: clients
  'parttime-storage',       // income-mode: job details
  'mixed-storage',          // income-mode: streams
  'ontheroad-storage',      // income-mode: road details
  'playbook-storage',
  'notes-storage',
  'category-storage',
];

const KEEP_DAYS = 5;
const PREFIX = 'bak:';

// Per-day identity manifest. Deliberately NOT under `bak:` so the snapshot-key
// parsing in listBackups/purgeBackups (which splits `bak:<store>:<stamp>`) can
// never mistake a manifest for a store snapshot. One tiny JSON blob per backup
// day: `bakmeta:<YYYY-MM-DD>` → { v, userId, createdAt }.
const META_PREFIX = 'bakmeta:';
const metaKey = (stamp: string) => `${META_PREFIX}${stamp}`;

export interface BackupMeta {
  v: 1;
  /** Personal account the snapshots belong to — auth userId, or 'local' when signed out. */
  userId: string;
  createdAt: string; // ISO timestamp of the day's first capture
}

// The stores whose divergence makes a partial restore actively dangerous
// (balances/transactions/debts drift out of step with each other). Used to
// decide when a day-restore needs an explicit "restore anyway" confirmation.
export const CORE_MONEY_KEYS = [
  'debt-storage',
  'personal-storage',
  'wallet-storage',
  'savings-storage',
  'budget-profile-storage',
  'business-storage',
  'seller-storage',
  'stall-storage',
  'crm-storage',
];

// The personal-data subset of PROTECTED_KEYS (excludes business/seller + shared
// category storage) — used so a personal-only account deletion purges the right
// backups without nuking business backups.
export const PERSONAL_BACKUP_KEYS = [
  'debt-storage',
  'personal-storage',
  'wallet-storage',
  'savings-storage',
  'receipt-storage', // scanned receipts — always wiped on a personal wipe, so purge its backup too
  'playbook-storage',
  'notes-storage',
];
// budget-profile-storage is intentionally NOT in the always-purge list above:
// its live storage is only dropped on a deliberate (userInitiated) wipe, so its
// backup is purged there too (see wipePersonalStores). Keeping it out means a
// demo-data drop before enabling sync preserves the user's real budget profile.

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

/**
 * The identity backups are stamped with: the signed-in PERSONAL account's userId,
 * or 'local' when signed out. Read straight from the persisted `auth-storage`
 * blob (zustand persist shape `{ state: { personal: { userId } } }`) rather than
 * importing the store — keeps this module dependency-light and works at launch
 * before Zustand hydration.
 */
export async function currentIdentity(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem('auth-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      const id = parsed?.state?.personal?.userId;
      if (typeof id === 'string' && id) return id;
    }
  } catch {
    /* fall through to 'local' */
  }
  return 'local';
}

/** Identity manifest for a backup day, or null for legacy (pre-stamp) days. */
export async function getDayMeta(stamp: string): Promise<BackupMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(metaKey(stamp));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.userId === 'string') {
      return parsed as BackupMeta;
    }
  } catch {
    /* treat unreadable meta as legacy */
  }
  return null;
}

// Drop identity manifests whose day no longer has any snapshot (pruned/purged).
async function cleanupOrphanMeta(): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const liveDays = new Set<string>();
    for (const k of all) {
      if (!k.startsWith(PREFIX)) continue;
      const stamp = k.slice(k.lastIndexOf(':') + 1);
      if (!stamp.startsWith('prerestore')) liveDays.add(stamp);
    }
    const orphans = all.filter(
      (k) => k.startsWith(META_PREFIX) && !liveDays.has(k.slice(META_PREFIX.length)),
    );
    if (orphans.length) await AsyncStorage.multiRemove(orphans);
  } catch {
    /* best-effort */
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
  // Stamp today's snapshots with who they belong to (kept once, like the
  // snapshots themselves), and drop manifests for days that were pruned away.
  try {
    const all = await AsyncStorage.getAllKeys();
    const hasToday = all.some((k) => k.startsWith(PREFIX) && k.endsWith(`:${stamp}`));
    if (hasToday && !(await AsyncStorage.getItem(metaKey(stamp)))) {
      const meta: BackupMeta = {
        v: 1,
        userId: await currentIdentity(),
        createdAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(metaKey(stamp), JSON.stringify(meta));
    }
    await cleanupOrphanMeta();
  } catch {
    /* best-effort — must never block startup */
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
    // Identity manifests for days that just lost their last snapshot go too —
    // they name the account, so a full deletion must not leave them behind.
    await cleanupOrphanMeta();
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
 * What restoring a given day would actually do — computed BEFORE the confirm
 * dialog so the user consents to the real outcome, not an assumed one.
 *
 * - `missing`: stores that hold live data today but have NO snapshot for this
 *   day — a day-restore leaves them at CURRENT state, so restored stores and
 *   kept stores can disagree (e.g. day-old transactions against today's
 *   wallets). `missingCore` is the money subset that makes this dangerous.
 * - `meta` / `identityMismatch`: whose backup this is. A mismatch means the
 *   snapshots belong to a different personal account (or were made signed
 *   out) — restoring them over the current account would corrupt its data.
 */
export interface DayRestorePlan {
  stamp: string;
  /** Protected stores that have a snapshot for this day (will be restored). */
  included: string[];
  /** Stores with healthy live data but no snapshot this day (will KEEP current state). */
  missing: string[];
  /** The subset of `missing` that is core money data. */
  missingCore: string[];
  /** Identity manifest, or null for legacy days captured before stamping existed. */
  meta: BackupMeta | null;
  /** True when `meta` exists and names a different identity than the current one. */
  identityMismatch: boolean;
}

export async function planRestoreDay(stamp: string): Promise<DayRestorePlan> {
  const map = await listBackups();
  const included = PROTECTED_KEYS.filter((k) => (map[k] ?? []).includes(stamp));
  const missing: string[] = [];
  for (const key of PROTECTED_KEYS) {
    if (included.includes(key)) continue;
    try {
      const live = await AsyncStorage.getItem(key);
      if (looksHealthy(live)) missing.push(key);
    } catch {
      /* unreadable live store — nothing to diverge from */
    }
  }
  const missingCore = missing.filter((k) => CORE_MONEY_KEYS.includes(k));
  const meta = await getDayMeta(stamp);
  const me = await currentIdentity();
  return {
    stamp,
    included,
    missing,
    missingCore,
    meta,
    identityMismatch: !!meta && meta.userId !== me,
  };
}

/**
 * Restore EVERY store that has a snapshot for the given day. Each restore snapshots
 * the current state first (reversible). The app must be RELOADED afterward for
 * Zustand to re-hydrate.
 *
 * HARD GUARD: a day stamped with a different identity than the current one is
 * never restored (`blocked: true`) — restoring another account's snapshots over
 * live data is corruption, not recovery. Legacy unstamped days pass (callers
 * surface a caution in their confirm dialog instead).
 */
export async function restoreDay(stamp: string): Promise<{ restored: number; blocked: boolean }> {
  const meta = await getDayMeta(stamp);
  if (meta && meta.userId !== (await currentIdentity())) {
    return { restored: 0, blocked: true };
  }
  const map = await listBackups();
  let restored = 0;
  for (const key of Object.keys(map)) {
    if (map[key].includes(stamp)) {
      const ok = await restoreBackup(key, stamp);
      if (ok) restored++;
    }
  }
  return { restored, blocked: false };
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
