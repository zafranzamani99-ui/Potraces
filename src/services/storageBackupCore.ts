/**
 * storageBackupCore — pure decision logic for the local rolling backup engine.
 *
 * No native imports (AsyncStorage / expo-file-system / fflate) on purpose: every
 * rule that decides WHAT gets kept, WHO owns a backup, and WHETHER a backup file
 * is structurally valid lives here so it can be unit-tested under plain tsx
 * (scripts/test-storage-backup.ts). The I/O that applies these rules lives in
 * storageBackup.ts. Same split as learningPure.ts / learningStore.ts.
 */

export const BACKUP_VERSION = 1;

// GFS-lite retention: 7 daily + 4 weekly + 3 monthly recovery points. More reach
// than a flat N-day window for the same file count — corruption noticed weeks
// later (a slow drift, a bad sync) still has a point to go back to.
export const KEEP_DAILY = 7;
export const KEEP_WEEKLY = 4;
export const KEEP_MONTHLY = 3;
// Pre-restore "undo" copies: a restore snapshots the current state first, and
// only the newest few of those are worth keeping.
export const KEEP_PRERESTORE = 2;

export type BackupKind = 'daily' | 'prerestore' | 'export';

/** The on-disk payload of one backup file (`backup-<stamp>.json.gz`). */
export interface BackupFilePayload {
  backupVersion: number;
  kind: BackupKind;
  /** App version that wrote the backup; null for files migrated from the AsyncStorage era. */
  appVersion: string | null;
  /**
   * Owner stamp: the signed-in PERSONAL account's userId, 'local' when captured
   * signed out, or null for legacy files that predate identity stamping.
   */
  userId: string | null;
  createdAt: string; // ISO
  /** store key → count of top-level array records (drives restore previews). */
  recordCounts: Record<string, number>;
  /** store key → raw zustand persist blob. */
  stores: Record<string, string>;
}

export function dayStamp(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FILE_RE = /^backup-(prerestore-)?(\d{4}-\d{2}-\d{2})\.json\.gz$/;

export function backupFileName(stamp: string, kind: BackupKind = 'daily'): string {
  return kind === 'prerestore' ? `backup-prerestore-${stamp}.json.gz` : `backup-${stamp}.json.gz`;
}

/** Parse a backup file name; null for anything else in the directory (incl. *.tmp). */
export function parseBackupFileName(name: string): { kind: BackupKind; stamp: string } | null {
  const m = FILE_RE.exec(name);
  if (!m) return null;
  return { kind: m[1] ? 'prerestore' : 'daily', stamp: m[2] };
}

// A blob is worth backing up only if it parses to a non-trivial object — so we
// never replace a good backup with an empty/corrupt current state.
export function looksHealthy(raw: string | null): boolean {
  if (!raw || raw.length < 20) return false;
  try {
    const p = JSON.parse(raw);
    return !!p && typeof p === 'object';
  } catch {
    return false;
  }
}

/**
 * Best-effort record count of a zustand persist blob: sum of top-level array
 * lengths inside `state`. Per-store labels map 1:1 in the UI, so one number per
 * store is exactly what a restore preview needs — no per-store schema knowledge.
 */
export function countRecords(persistBlob: string): number {
  try {
    const parsed = JSON.parse(persistBlob);
    const state = parsed?.state;
    if (!state || typeof state !== 'object') return 0;
    let n = 0;
    for (const v of Object.values(state)) {
      if (Array.isArray(v)) n += v.length;
    }
    return n;
  } catch {
    return 0;
  }
}

// ─── Retention (GFS-lite) ────────────────────────────────────────────────────

function weekKey(stamp: string): string {
  // Week bucket = the Monday of the stamp's week (local time, matching dayStamp).
  const d = new Date(`${stamp}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return dayStamp(d);
}

/**
 * Keep the EARLIEST day in each bucket (the oldest point maximises how far back
 * the tier reaches), for the `take` most recent buckets. `rest` is newest-first.
 */
function keepTiered(rest: string[], keyOf: (s: string) => string, take: number, keep: Set<string>): void {
  const buckets = new Map<string, string>(); // bucket key → earliest stamp in it
  for (const s of rest) {
    buckets.set(keyOf(s), s); // newest-first ⇒ last write per bucket is its earliest stamp
  }
  const keys = [...buckets.keys()].sort().reverse().slice(0, take);
  for (const k of keys) keep.add(buckets.get(k)!);
}

/** The set of day-stamps to KEEP out of the given daily stamps (rest get pruned). */
export function planRotation(stamps: string[]): Set<string> {
  const desc = [...new Set(stamps)].sort().reverse(); // newest first
  const keep = new Set(desc.slice(0, KEEP_DAILY));
  const restAfterDaily = desc.filter((s) => !keep.has(s));
  keepTiered(restAfterDaily, weekKey, KEEP_WEEKLY, keep);
  const restAfterWeekly = desc.filter((s) => !keep.has(s));
  keepTiered(restAfterWeekly, (s) => s.slice(0, 7), KEEP_MONTHLY, keep);
  return keep;
}

/** The set of prerestore stamps to KEEP (newest KEEP_PRERESTORE). */
export function planPrerestorePrune(stamps: string[]): Set<string> {
  const desc = [...new Set(stamps)].sort().reverse();
  return new Set(desc.slice(0, KEEP_PRERESTORE));
}

// ─── Ownership ───────────────────────────────────────────────────────────────

export type OwnerClass = 'same' | 'local-to-account' | 'mismatch' | 'legacy';

export function classifyOwner(backupUserId: string | null, me: string): OwnerClass {
  if (backupUserId == null || backupUserId === '') return 'legacy';
  if (backupUserId === me) return 'same';
  // A signed-OUT backup restored into a signed-IN session is the same person's
  // data — warn + confirm, never block. (The pre-2026-08 engine hard-blocked
  // this, permanently stranding every backup made before sign-in.)
  if (backupUserId === 'local') return 'local-to-account';
  // Another signed-in account's backup over this one's data is corruption.
  return 'mismatch';
}

// ─── Version guards ──────────────────────────────────────────────────────────

/** Numeric semver-ish compare; unparsable segments → 0 (undecided). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10));
  const pb = b.split('.').map((x) => parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i];
    const nb = pb[i];
    if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/**
 * A backup written by a NEWER backup format or a newer app version must never be
 * restored into this build — its store shapes may have migrated past what this
 * app's (mostly unversioned) persist layer can re-hydrate. Signal precedent:
 * hard-stop with "update the app first".
 */
export function isTooNew(
  backup: { backupVersion: number; appVersion: string | null },
  currentAppVersion: string | null,
): boolean {
  if (backup.backupVersion > BACKUP_VERSION) return true;
  if (backup.appVersion && currentAppVersion) {
    return compareVersions(backup.appVersion, currentAppVersion) > 0;
  }
  return false;
}

// ─── Payload validation ──────────────────────────────────────────────────────

export function validateBackupPayload(p: unknown): p is BackupFilePayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  if (typeof o.backupVersion !== 'number') return false;
  if (o.kind !== 'daily' && o.kind !== 'prerestore' && o.kind !== 'export') return false;
  if (typeof o.createdAt !== 'string') return false;
  if (o.userId !== null && typeof o.userId !== 'string') return false;
  if (o.appVersion !== null && typeof o.appVersion !== 'string') return false;
  if (!o.recordCounts || typeof o.recordCounts !== 'object' || Array.isArray(o.recordCounts)) return false;
  if (!o.stores || typeof o.stores !== 'object' || Array.isArray(o.stores)) return false;
  for (const v of Object.values(o.stores as Record<string, unknown>)) {
    if (typeof v !== 'string') return false;
  }
  return true;
}

/** JSON.parse + structural validation; null for anything unreadable or malformed. */
export function parseBackupPayload(json: string): BackupFilePayload | null {
  try {
    const p: unknown = JSON.parse(json);
    return validateBackupPayload(p) ? p : null;
  } catch {
    return null;
  }
}
