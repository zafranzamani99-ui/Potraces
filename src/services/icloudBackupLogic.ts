/**
 * Pure decision logic for the iCloud receipt backup: remote paths, the
 * skip rule, the manifest shape, and the restore plan.
 *
 * This module is intentionally free of react-native / expo imports so it can
 * be unit-tested in plain Node (scripts/test-icloud-logic.ts). The native /
 * file-system side lives in icloudBackup.ts — this file owns only the rules:
 *   • stable remote naming (one iCloud file per receipt, same convention as
 *     the Drive backup so both providers converge on `receipt-<id>.<ext>`)
 *   • the "already backed up" skip so re-runs don't upload duplicates
 *   • the manifest (Potraces/manifest.json) — the receipt-ID → remote-path
 *     map that survives reinstall (backupStore's AsyncStorage copy does not)
 *   • the restore plan: which remote files map to receipts on this device
 */

export type IcloudBackupKind = 'pdf' | 'jpg';

/** Visible container layout — browsable in the iOS Files app. */
export const ICLOUD_ROOT_DIR = 'Potraces';
export const ICLOUD_RECEIPTS_DIR = 'Potraces/Receipts';
export const ICLOUD_MANIFEST_PATH = 'Potraces/manifest.json';

/** Stable iCloud path for a receipt — re-runs target the same file. */
export function icloudReceiptRemotePath(receiptId: string, kind: IcloudBackupKind): string {
  return `${ICLOUD_RECEIPTS_DIR}/receipt-${receiptId}.${kind}`;
}

/** True when the receipt already has a confirmed iCloud copy — skip re-upload. */
export function shouldSkipIcloudBackup(remoteEntry: { icloudPath?: string } | undefined): boolean {
  return !!remoteEntry?.icloudPath;
}

export interface IcloudManifestEntry {
  /** Local receipt id (matches SavedReceipt.id). */
  id: string;
  /** Remote path inside the container, e.g. Potraces/Receipts/receipt-<id>.pdf */
  path: string;
  /** epoch ms of the confirmed upload. */
  backedUpAt: number;
}

export interface IcloudManifest {
  version: 1;
  /** epoch ms when the manifest was written. */
  updatedAt: number;
  receipts: IcloudManifestEntry[];
}

/** Serialize the manifest. Written LAST after a drain's uploads succeeded, so
 *  a crash mid-run leaves a stale-but-valid manifest (the files it lists
 *  exist; the files it doesn't list yet are re-uploaded next run). */
export function buildIcloudManifest(entries: IcloudManifestEntry[], now: number): string {
  const manifest: IcloudManifest = { version: 1, updatedAt: now, receipts: entries };
  return JSON.stringify(manifest);
}

/** Parse a manifest read back from iCloud. Tolerant: anything malformed
 *  (bad JSON, wrong shape, junk entries) → null, so the caller surfaces
 *  "no usable backup" instead of crashing on a hand-edited file. */
export function parseIcloudManifest(json: string): IcloudManifest | null {
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.receipts)) return null;
    const receipts: IcloudManifestEntry[] = [];
    for (const e of raw.receipts) {
      if (!e || typeof e.id !== 'string' || typeof e.path !== 'string') continue;
      receipts.push({ id: e.id, path: e.path, backedUpAt: typeof e.backedUpAt === 'number' ? e.backedUpAt : 0 });
    }
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      receipts,
    };
  } catch {
    return null;
  }
}

export interface IcloudRestoreItem {
  receiptId: string;
  /** Remote path inside the iCloud container. */
  remotePath: string;
}

/**
 * Which remote files to pull for the receipts present on THIS device.
 *
 * Restore re-materializes receipt FILES for receipt RECORDS the device
 * already has (records come back via the account's data restore / personal
 * sync; iCloud only ever held the image/PDF artifacts). Manifest entries
 * with no matching local receipt are skipped — there is nothing to attach
 * the file to.
 *
 * Merge vs Replace is decided by the caller: 'merge' additionally skips
 * items whose local file already exists (an async fs check the wiring owns).
 */
export function planIcloudRestore(
  manifestReceipts: IcloudManifestEntry[],
  localReceiptIds: Set<string>,
): IcloudRestoreItem[] {
  const items: IcloudRestoreItem[] = [];
  for (const entry of manifestReceipts) {
    if (!localReceiptIds.has(entry.id)) continue;
    items.push({ receiptId: entry.id, remotePath: entry.path });
  }
  return items;
}
