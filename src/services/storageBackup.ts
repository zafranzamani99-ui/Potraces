/**
 * storageBackup — a local rolling safety net for the app's data stores.
 *
 * WHY: AsyncStorage keeps NO history. A single bad write (a buggy sync, a crash
 * mid-mutation, a migration error) overwrites a Zustand persist key and the old
 * value is gone forever — exactly what destroyed debt descriptions / split items
 * on 2026-06-11. This keeps rolling snapshots of every money/data store, so any
 * single bad day is recoverable.
 *
 * HOW (file-based since 2026-08 — snapshots used to live in AsyncStorage `bak:`
 * keys): one gzipped JSON file per day in `<documents>/backups/`, NEVER in
 * AsyncStorage. Snapshots were the main driver of AsyncStorage growth, and on
 * Android that DB is size-capped (default 6MB) with documented mid-transaction
 * corruption risk when full — the safety net must not live inside the thing it
 * protects. (This is also why we deliberately do NOT just raise
 * AsyncStorage_db_size_in_MB.) The files are small, enumerable, prunable, and
 * shareable, and gzip (fflate) cuts them ~5–10×.
 *
 * - `snapshotAll()` runs once per launch: first healthy capture of the day wins,
 *   writes are atomic (tmp → gunzip self-check → move over destination), and a
 *   failed snapshot never deletes the previous one.
 * - Retention is GFS-lite: 7 daily + 4 weekly + 3 monthly recovery points. The
 *   pre-restore "undo" copies are pruned to the newest KEEP_PRERESTORE.
 * - Restore is explicit + manual, snapshots the current state first (reversible),
 *   then the app reloads to re-hydrate Zustand. Another signed-in account's
 *   backup is hard-blocked; a signed-OUT backup restoring into a signed-in
 *   account is allowed with a warning (it is the same person's data).
 * - The backups dir is EXCLUDED from Android Auto Backup / device transfer
 *   (android/app/src/main/res/xml/backup_rules*.xml): the OS layer already backs
 *   up the live stores, and duplicating the snapshot history there just burns
 *   the 25MB quota. iOS has no per-app quota and no expo API for
 *   NSURLIsExcludedFromBackupKey, so the (small) dir stays included there.
 *
 * Pure rules (rotation, ownership, version guards, validation) are in
 * storageBackupCore.ts and unit-tested in scripts/test-storage-backup.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate';
import * as Application from 'expo-application';

import {
  BACKUP_VERSION,
  backupFileName,
  classifyOwner,
  countRecords,
  dayStamp,
  isTooNew,
  looksHealthy,
  parseBackupFileName,
  parseBackupPayload,
  planPrerestorePrune,
  planRotation,
  type BackupFilePayload,
  type BackupKind,
} from './storageBackupCore';

export type { BackupFilePayload } from './storageBackupCore';

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
  'learning-storage',       // learned AI hints (also cloud-synced 2026-07-22)
];

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

// Legacy AsyncStorage layout (pre-2026-08), handled by migrateLegacyBackups/purge:
const LEGACY_PREFIX = 'bak:';
const LEGACY_META_PREFIX = 'bakmeta:';

// ─── Filesystem helpers ──────────────────────────────────────────────────────

function backupsDir(): Directory {
  return new Directory(Paths.document, 'backups');
}

function ensureBackupsDir(): Directory | null {
  try {
    const dir = backupsDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return dir;
  } catch {
    return null;
  }
}

/** Day-stamps of backup files on disk, by kind. Corrupt names (incl. .tmp) are ignored. */
function listBackupStamps(): { daily: string[]; prerestore: string[] } {
  const out = { daily: [] as string[], prerestore: [] as string[] };
  try {
    const dir = backupsDir();
    if (!dir.exists) return out;
    for (const entry of dir.list()) {
      const parsed = parseBackupFileName(entry.name);
      if (!parsed) continue;
      (parsed.kind === 'prerestore' ? out.prerestore : out.daily).push(parsed.stamp);
    }
  } catch {
    /* best-effort */
  }
  return out;
}

/**
 * Atomic write: tmp file → read-back self-check (fflate verifies the gzip CRC,
 * then we re-validate the structure) → move over the destination. A snapshot
 * that can't survive its own write never replaces a good one.
 */
function writeBackupFileAtomic(target: File, payload: BackupFilePayload): boolean {
  const tmp = new File(target.parentDirectory, `${target.name}.tmp`);
  try {
    tmp.write(gzipSync(strToU8(JSON.stringify(payload))));
    const roundTrip = parseBackupPayload(strFromU8(gunzipSync(tmp.bytesSync())));
    if (!roundTrip) return false;
    if (target.exists) target.delete();
    tmp.move(target);
    return true;
  } catch {
    return false;
  } finally {
    try {
      if (tmp.exists) tmp.delete();
    } catch {
      /* ignore */
    }
  }
}

/** Read + gunzip + validate a backup file; null for missing/corrupt/malformed. */
function readBackupFile(stamp: string, kind: BackupKind = 'daily'): BackupFilePayload | null {
  try {
    const f = new File(backupsDir(), backupFileName(stamp, kind));
    if (!f.exists) return null;
    return parseBackupPayload(strFromU8(gunzipSync(f.bytesSync())));
  } catch {
    return null;
  }
}

function currentAppVersion(): string | null {
  try {
    return Application.nativeApplicationVersion ?? null;
  } catch {
    return null;
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

/** Capture the current healthy live state of every protected store. */
async function captureLiveBackup(kind: BackupKind): Promise<BackupFilePayload | null> {
  const stores: Record<string, string> = {};
  const recordCounts: Record<string, number> = {};
  for (const key of PROTECTED_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!looksHealthy(raw)) continue; // never back up empty/corrupt over a good one
      stores[key] = raw as string;
      recordCounts[key] = countRecords(raw as string);
    } catch {
      /* per-store best-effort */
    }
  }
  if (Object.keys(stores).length === 0) return null;
  return {
    backupVersion: BACKUP_VERSION,
    kind,
    appVersion: currentAppVersion(),
    userId: await currentIdentity(),
    createdAt: new Date().toISOString(),
    recordCounts,
    stores,
  };
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

/** Snapshot each protected store once per day (keeps the earliest healthy capture). */
export async function snapshotAll(): Promise<void> {
  // One-time upgrade from the AsyncStorage `bak:` era (idempotent, per-day).
  await migrateLegacyBackups();

  const dir = ensureBackupsDir();
  if (!dir) return;

  try {
    const stamp = dayStamp();
    const today = new File(dir, backupFileName(stamp));
    if (!today.exists) {
      const payload = await captureLiveBackup('daily');
      if (payload) writeBackupFileAtomic(today, payload);
    }
  } catch {
    /* best-effort — must never block startup */
  }

  // Retention. The file just written is always inside the keep set (today is by
  // construction one of the 7 most recent dailies), so pruning can't undo it.
  try {
    const { daily, prerestore } = listBackupStamps();
    const keepDaily = planRotation(daily);
    for (const s of daily) {
      if (keepDaily.has(s)) continue;
      try {
        new File(dir, backupFileName(s)).delete();
      } catch {
        /* ignore */
      }
    }
    const keepPre = planPrerestorePrune(prerestore);
    for (const s of prerestore) {
      if (keepPre.has(s)) continue;
      try {
        new File(dir, backupFileName(s, 'prerestore')).delete();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* best-effort */
  }
}

// ─── Restore ─────────────────────────────────────────────────────────────────

/**
 * Distinct backup days on disk, newest first, with how many stores each holds.
 * Corrupt/unreadable files are NOT offered (they can't be restored anyway).
 * Pre-restore "undo" copies are deliberately not listed.
 */
export async function listBackupDays(): Promise<{ stamp: string; storeCount: number }[]> {
  const { daily } = listBackupStamps();
  const out: { stamp: string; storeCount: number }[] = [];
  for (const stamp of daily) {
    const payload = readBackupFile(stamp);
    if (!payload) continue;
    out.push({ stamp, storeCount: Object.keys(payload.stores).length });
  }
  return out.sort((a, b) => (a.stamp < b.stamp ? 1 : -1)); // newest first
}

/**
 * What restoring this payload would actually do — computed BEFORE the confirm
 * sheet so the user consents to the real outcome, not an assumed one. This is
 * the SINGLE planning pipeline: on-device day restores (planRestoreDay) and
 * off-device file imports both flow through here.
 *
 * - `missing`: stores that hold live data today but have NO snapshot in this
 *   payload — a restore leaves them at CURRENT state, so restored stores and
 *   kept stores can disagree (e.g. day-old transactions against today's
 *   wallets). `missingCore` is the money subset that makes this dangerous.
 * - `identityMismatch` (HARD BLOCK): backup belongs to a different signed-in
 *   account. `localToAccount` (warn + confirm): made signed out, restoring into
 *   a signed-in account. `legacyOwner` (caution): predates identity stamping.
 * - `tooNew` (HARD BLOCK): written by a newer app/backup format — restoring it
 *   into this build could crash or corrupt on re-hydrate; update the app first.
 */
export interface DayRestorePlan {
  stamp: string;
  /** Protected stores that have a snapshot in this payload (will be restored). */
  included: string[];
  /** Stores with healthy live data but no snapshot in this payload (KEEP current state). */
  missing: string[];
  /** The subset of `missing` that is core money data. */
  missingCore: string[];
  /** Owner stamp on the backup ('local' = signed out), null for legacy files. */
  userId: string | null;
  /** HARD BLOCK — backup belongs to a different signed-in account. */
  identityMismatch: boolean;
  /** Warn + confirm — made signed out, restoring into a signed-in account. */
  localToAccount: boolean;
  /** Caution — predates identity stamping, owner can't be verified. */
  legacyOwner: boolean;
  /** HARD BLOCK — written by a newer app/backup format. */
  tooNew: boolean;
  appVersion: string | null;
  createdAt: string | null;
  /** store key → records IN THE BACKUP (drives the preview's then column). */
  recordCounts: Record<string, number>;
  /** store key → records in the LIVE data right now (the preview's now column). */
  liveRecordCounts: Record<string, number>;
}

export async function planRestorePayload(
  payload: BackupFilePayload | null,
): Promise<DayRestorePlan> {
  const stores = payload?.stores ?? {};
  const included = PROTECTED_KEYS.filter(
    (k) => typeof stores[k] === 'string' && looksHealthy(stores[k]),
  );
  const missing: string[] = [];
  const liveRecordCounts: Record<string, number> = {};
  for (const key of PROTECTED_KEYS) {
    try {
      const live = await AsyncStorage.getItem(key);
      if (!looksHealthy(live)) continue;
      liveRecordCounts[key] = countRecords(live as string);
      if (!included.includes(key)) missing.push(key);
    } catch {
      /* unreadable live store — nothing to diverge from */
    }
  }
  const owner = classifyOwner(payload?.userId ?? null, await currentIdentity());
  return {
    stamp: (payload?.createdAt ?? '').slice(0, 10),
    included,
    missing,
    missingCore: missing.filter((k) => CORE_MONEY_KEYS.includes(k)),
    userId: payload?.userId ?? null,
    identityMismatch: owner === 'mismatch',
    localToAccount: owner === 'local-to-account',
    legacyOwner: owner === 'legacy',
    tooNew: payload ? isTooNew(payload, currentAppVersion()) : false,
    appVersion: payload?.appVersion ?? null,
    createdAt: payload?.createdAt ?? null,
    recordCounts: payload?.recordCounts ?? {},
    liveRecordCounts,
  };
}

export async function planRestoreDay(
  stamp: string,
  kind: BackupKind = 'daily',
): Promise<DayRestorePlan> {
  return planRestorePayload(readBackupFile(stamp, kind));
}

/**
 * Apply a validated backup payload to the live stores — the SINGLE restore
 * pipeline (on-device day restores and off-device imports both flow through
 * here). The current state is snapshotted first (a pre-restore "undo" copy),
 * and the live keys are written in ONE multiSet batch. The app must be
 * RELOADED afterward for Zustand to re-hydrate.
 *
 * HARD GUARDS: a backup owned by a different signed-in account, or written by a
 * newer app/backup format, is never restored (`blocked: true`) — the plan-time
 * UI checks these too; this is the race-proof backstop.
 */
export async function restorePayload(
  payload: BackupFilePayload,
): Promise<{ restored: number; blocked: boolean }> {
  if (classifyOwner(payload.userId, await currentIdentity()) === 'mismatch') {
    return { restored: 0, blocked: true };
  }
  if (isTooNew(payload, currentAppVersion())) {
    return { restored: 0, blocked: true };
  }

  const dir = ensureBackupsDir();
  if (!dir) return { restored: 0, blocked: false };

  // Undo first: snapshot the CURRENT state as a pre-restore copy. Restoring a
  // pre-restore copy ("undo last restore") does this too, so undo is itself
  // undoable; pruning keeps only the newest KEEP_PRERESTORE of these.
  const pre = await captureLiveBackup('prerestore');
  if (pre) writeBackupFileAtomic(new File(dir, backupFileName(dayStamp(), 'prerestore')), pre);

  const pairs: [string, string][] = [];
  for (const key of PROTECTED_KEYS) {
    const raw = payload.stores[key];
    if (typeof raw === 'string' && looksHealthy(raw)) pairs.push([key, raw]);
  }
  if (pairs.length === 0) return { restored: 0, blocked: false };
  try {
    await AsyncStorage.multiSet(pairs);
    return { restored: pairs.length, blocked: false };
  } catch {
    return { restored: 0, blocked: false };
  }
}

/**
 * Restore EVERY store that has a snapshot for the given on-device day — reads
 * the file, then flows through restorePayload like every other restore.
 */
export async function restoreDay(
  stamp: string,
  kind: BackupKind = 'daily',
): Promise<{ restored: number; blocked: boolean }> {
  const payload = readBackupFile(stamp, kind);
  if (!payload) return { restored: 0, blocked: false };
  return restorePayload(payload);
}

// ─── Export / import (off-device copies) ─────────────────────────────────────

/**
 * Build a full backup of the CURRENT live state and write it to the cache dir
 * for sharing off-device (expo-sharing). Same file format as the daily
 * snapshots — an import goes through the exact same validation/preview/restore
 * pipeline (planRestorePayload → restorePayload), so an export can never
 * produce a file this build couldn't read back.
 */
export async function exportBackupToFile(): Promise<string | null> {
  try {
    const payload = await captureLiveBackup('export');
    if (!payload) return null;
    const dir = new Directory(Paths.cache, 'exports');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, `potraces-backup-${dayStamp()}.json.gz`);
    if (file.exists) file.delete();
    file.write(gzipSync(strToU8(JSON.stringify(payload))));
    return file.uri;
  } catch {
    return null;
  }
}

/**
 * Read + validate a backup file picked from anywhere (document-picker import).
 * Same pipeline as on-device files: gunzip (fflate verifies the CRC) → parse →
 * structural validation. Null for anything that isn't a readable backup.
 */
export async function readBackupFileFromUri(uri: string): Promise<BackupFilePayload | null> {
  try {
    const f = new File(uri);
    if (!f.exists) return null;
    return parseBackupPayload(strFromU8(gunzipSync(f.bytesSync())));
  } catch {
    return null;
  }
}

// ─── Purge ───────────────────────────────────────────────────────────────────

/**
 * The newest pre-restore "undo" copy on disk, if any — surfaced by the Backup &
 * Restore screen as "Undo last restore".
 */
export async function latestPrerestoreDay(): Promise<{ stamp: string; createdAt: string | null } | null> {
  const { prerestore } = listBackupStamps();
  if (prerestore.length === 0) return null;
  const newest = prerestore.sort().reverse()[0];
  const payload = readBackupFile(newest, 'prerestore');
  if (!payload) return null;
  return { stamp: newest, createdAt: payload.createdAt };
}

/**
 * Delete the given stores from ALL backup files (incl. pre-restore copies) —
 * defaults to every protected store. Called on account/data deletion so the
 * deletion right is complete (backups hold copies of the same data). Files that
 * end up with no stores left are deleted; others are rewritten atomically.
 */
export async function purgeBackups(keys: string[] = PROTECTED_KEYS): Promise<void> {
  try {
    const dir = backupsDir();
    if (dir.exists) {
      for (const entry of dir.list()) {
        const parsed = parseBackupFileName(entry.name);
        if (!parsed || !(entry instanceof File)) continue;
        const payload = readBackupFile(parsed.stamp, parsed.kind);
        if (!payload) continue;
        let changed = false;
        for (const k of keys) {
          if (k in payload.stores) {
            delete payload.stores[k];
            changed = true;
          }
          if (k in payload.recordCounts) {
            delete payload.recordCounts[k];
            changed = true;
          }
        }
        if (!changed) continue;
        try {
          if (Object.keys(payload.stores).length === 0) {
            entry.delete();
          } else {
            writeBackupFileAtomic(entry, payload);
          }
        } catch {
          /* best-effort */
        }
      }
    }
  } catch {
    /* best-effort */
  }
  await purgeLegacyBackups(keys);
}

// ─── Legacy AsyncStorage `bak:` era ──────────────────────────────────────────

/**
 * One-time, idempotent upgrade: convert `bak:<store>:<stamp>` keys (+ `bakmeta:`
 * identity manifests) into backup files, then remove the legacy keys. Runs at
 * the top of `snapshotAll()`; after a successful pass it's a cheap no-op scan.
 * A day whose file write fails keeps its legacy keys for the next launch.
 */
async function migrateLegacyBackups(): Promise<void> {
  let all: readonly string[];
  try {
    all = await AsyncStorage.getAllKeys();
  } catch {
    return;
  }
  const legacy = all.filter((k) => k.startsWith(LEGACY_PREFIX));
  if (legacy.length === 0) return;
  const dir = ensureBackupsDir();
  if (!dir) return;

  // Group by backup day; `prerestore-<date>` stamps map to pre-restore copies.
  const groups = new Map<string, { kind: BackupKind; stamp: string; keys: string[] }>();
  for (const k of legacy) {
    const rest = k.slice(LEGACY_PREFIX.length);
    const idx = rest.lastIndexOf(':');
    if (idx < 0) continue;
    const rawStamp = rest.slice(idx + 1);
    const kind: BackupKind = rawStamp.startsWith('prerestore') ? 'prerestore' : 'daily';
    const stamp = kind === 'prerestore' ? rawStamp.slice('prerestore-'.length) : rawStamp;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) continue;
    const gk = `${kind}:${stamp}`;
    const g = groups.get(gk) ?? { kind, stamp, keys: [] };
    g.keys.push(k);
    groups.set(gk, g);
  }

  for (const g of groups.values()) {
    try {
      const target = new File(dir, backupFileName(g.stamp, g.kind));
      if (!target.exists) {
        const stores: Record<string, string> = {};
        const recordCounts: Record<string, number> = {};
        for (const k of g.keys) {
          const raw = await AsyncStorage.getItem(k);
          if (!looksHealthy(raw)) continue;
          const store = k.slice(LEGACY_PREFIX.length, k.lastIndexOf(':'));
          stores[store] = raw as string;
          recordCounts[store] = countRecords(raw as string);
        }
        if (Object.keys(stores).length > 0) {
          let userId: string | null = null;
          if (g.kind === 'daily') {
            try {
              const metaRaw = await AsyncStorage.getItem(`${LEGACY_META_PREFIX}${g.stamp}`);
              if (metaRaw) {
                const meta = JSON.parse(metaRaw);
                if (typeof meta?.userId === 'string') userId = meta.userId;
              }
            } catch {
              /* unreadable meta → legacy (null) */
            }
          }
          writeBackupFileAtomic(target, {
            backupVersion: BACKUP_VERSION,
            kind: g.kind,
            appVersion: null, // written by an older app — exact version unknown
            userId,
            createdAt: `${g.stamp}T00:00:00.000Z`,
            recordCounts,
            stores,
          });
        }
      }
      // File written (or already existed, or nothing healthy left) — drop legacy.
      await AsyncStorage.multiRemove(g.keys);
      if (g.kind === 'daily') {
        try {
          await AsyncStorage.removeItem(`${LEGACY_META_PREFIX}${g.stamp}`);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* leave this group for the next launch */
    }
  }
}

/** Remove leftover legacy `bak:`/`bakmeta:` keys for the purged stores. */
async function purgeLegacyBackups(keys: string[]): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const toRemove = all.filter(
      (k) => k.startsWith(LEGACY_PREFIX) && keys.some((key) => k.startsWith(`${LEGACY_PREFIX}${key}:`)),
    );
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
    // Manifests whose day no longer has any snapshot name the account — don't
    // leave them behind after a deletion.
    const remaining = await AsyncStorage.getAllKeys();
    const liveDays = new Set(
      remaining.filter((k) => k.startsWith(LEGACY_PREFIX)).map((k) => k.slice(k.lastIndexOf(':') + 1)),
    );
    const orphans = remaining.filter(
      (k) => k.startsWith(LEGACY_META_PREFIX) && !liveDays.has(k.slice(LEGACY_META_PREFIX.length)),
    );
    if (orphans.length) await AsyncStorage.multiRemove(orphans);
  } catch {
    /* best-effort */
  }
}
