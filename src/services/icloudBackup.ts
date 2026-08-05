/**
 * iCloud receipt auto-backup — enqueue + queue processor for the
 * 'icloud-file' jobs in the cloud-backup durable queue, plus the manifest
 * and the restore path.
 *
 * Mirrors driveBackup.ts (same durable-queue contract, same receipt-source
 * rules — the ORIGINAL archived PDF is preferred over the photo/raster):
 *   • receipts are looked up in receiptStore; deleted locally → no-op success
 *   • stored paths are RELATIVE — always resolved via resolveReceiptImageUri
 *   • on success the remote path is recorded in backupStore so the next run
 *     skips the receipt (see shouldSkipIcloudBackup)
 * Errors propagate — the queue records the attempt and retries on a later
 * drain. ICLOUD_UNAVAILABLE (signed out of iCloud on the device) is thrown
 * like any transient error: the job cools down and retries; the settings UI
 * maps the code to a plain-language explanation.
 *
 * The manifest (Potraces/manifest.json) is the receipt-ID → remote-path map
 * that survives reinstall (backupStore's AsyncStorage copy does not). It is
 * rewritten after each successful drain — LAST, so a crash mid-run leaves a
 * stale-but-valid manifest.
 *
 * Restore re-materializes receipt FILES for receipt RECORDS already on the
 * device (records come back via the account's data restore / personal sync;
 * iCloud only ever held the image/PDF artifacts). Two modes:
 *   merge   — download only files missing on this device
 *   replace — re-download everything the manifest lists (overwrite)
 *
 * react-native-cloud-storage is native code that only exists in dev builds
 * created after it was added — it is require()d lazily behind an iOS check
 * so Android and stale dev builds degrade to "unavailable" instead of
 * crashing at import time.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { CloudStorageScope as CloudStorageScopeType } from 'react-native-cloud-storage';
import { enqueueBackupJob } from './cloudBackupQueue';
import { useReceiptStore } from '../store/receiptStore';
import { useBackupStore } from '../store/backupStore';
import { resolveReceiptImageUri } from '../utils/receiptImage';
import { pickDriveBackupSource } from './driveBackupLogic';
import {
  ICLOUD_MANIFEST_PATH,
  IcloudManifestEntry,
  buildIcloudManifest,
  icloudReceiptRemotePath,
  parseIcloudManifest,
  planIcloudRestore,
  shouldSkipIcloudBackup,
} from './icloudBackupLogic';

type CloudStorageModule = typeof import('react-native-cloud-storage');

let cached: CloudStorageModule | null = null;

/** The native module, or null when it isn't in this build / not iOS. */
function cloudStorage(): CloudStorageModule | null {
  if (Platform.OS !== 'ios') return null;
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('react-native-cloud-storage') as CloudStorageModule;
    return cached;
  } catch {
    return null;
  }
}

function scope(): CloudStorageScopeType {
  return cloudStorage()!.CloudStorageScope.Documents;
}

/** Native side wants a plain filesystem path (URL(fileURLWithPath:)), not a
 *  file:// URI. */
function stripFileScheme(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

/** True when iCloud Drive is usable on this device right now (signed in,
 *  container reachable). False on Android and on builds without the native
 *  module. */
export async function isIcloudAvailable(): Promise<boolean> {
  const cs = cloudStorage();
  if (!cs) return false;
  try {
    return await cs.CloudStorage.isCloudAvailable();
  } catch {
    return false;
  }
}

/** Queue an iCloud backup for one receipt (dedupes while one is pending). */
export async function enqueueReceiptIcloudBackup(receiptId: string): Promise<void> {
  await enqueueBackupJob('icloud-file', `icloud:${receiptId}`, { receiptId });
}

/** Processor for kind 'icloud-file' — uploads the receipt's artifact to
 *  "Potraces/Receipts" in the iCloud container and records the remote path. */
export async function processIcloudFileJob(job: { payload: Record<string, any> }): Promise<void> {
  const cs = cloudStorage();
  if (!cs) return; // not iOS / module missing — nothing to do, drain the job

  const receiptId = job.payload?.receiptId as string | undefined;
  if (!receiptId) return;

  const receipt = useReceiptStore.getState().receipts.find((r) => r.id === receiptId);
  if (!receipt) return; // deleted locally — nothing to back up

  if (shouldSkipIcloudBackup(useBackupStore.getState().receiptRemote[receiptId])) return;

  const source = pickDriveBackupSource(receipt);
  if (!source) return; // no artifact on this receipt

  const fileUri = resolveReceiptImageUri(source.path);
  if (!fileUri) return;

  if (!(await isIcloudAvailable())) throw new Error('ICLOUD_UNAVAILABLE');

  const remotePath = icloudReceiptRemotePath(receiptId, source.kind);
  await cs.CloudStorage.uploadFile(
    remotePath,
    stripFileScheme(fileUri),
    { mimeType: source.mimeType },
    scope(),
  );

  useBackupStore.getState().markReceiptRemote(receiptId, { icloudPath: remotePath, backedUpAt: Date.now() });
}

/** Rewrite Potraces/manifest.json from the confirmed remote-ID map. Called
 *  after a drain's iCloud uploads succeeded — best-effort: a manifest write
 *  failure must not fail the drain (the files are already safe; the next
 *  successful drain rewrites it). */
export async function writeIcloudManifest(): Promise<void> {
  const cs = cloudStorage();
  if (!cs) return;
  const receiptRemote = useBackupStore.getState().receiptRemote;
  const entries: IcloudManifestEntry[] = [];
  for (const [id, entry] of Object.entries(receiptRemote)) {
    if (!entry.icloudPath) continue;
    entries.push({ id, path: entry.icloudPath, backedUpAt: entry.backedUpAt ?? 0 });
  }
  await cs.CloudStorage.writeFile(ICLOUD_MANIFEST_PATH, buildIcloudManifest(entries, Date.now()), scope());
}

export type IcloudRestoreMode = 'merge' | 'replace';

/**
 * Download backed-up receipt files for receipt records already on this
 * device. 'merge' pulls only files missing locally; 'replace' re-pulls
 * everything the manifest lists. Also repopulates backupStore's remote map
 * from the manifest (it was wiped with the reinstall). Returns counts for
 * the UI toast. Throws Error('ICLOUD_UNAVAILABLE') / Error('NO_BACKUP_FOUND')
 * — the UI maps those codes to plain-language toasts.
 */
export async function restoreFromIcloud(
  mode: IcloudRestoreMode,
): Promise<{ restored: number; skipped: number }> {
  const cs = cloudStorage();
  if (!cs || !(await isIcloudAvailable())) throw new Error('ICLOUD_UNAVAILABLE');

  let raw: string;
  try {
    raw = await cs.CloudStorage.readFile(ICLOUD_MANIFEST_PATH, scope());
  } catch {
    throw new Error('NO_BACKUP_FOUND');
  }
  const manifest = parseIcloudManifest(raw);
  if (!manifest) throw new Error('NO_BACKUP_FOUND');

  const receipts = useReceiptStore.getState().receipts;
  const plan = planIcloudRestore(
    manifest.receipts,
    new Set(receipts.map((r) => r.id)),
  );

  let restored = 0;
  let skipped = 0;
  for (const item of plan) {
    const receipt = receipts.find((r) => r.id === item.receiptId);
    if (!receipt) {
      skipped++;
      continue;
    }
    const isPdf = item.remotePath.endsWith('.pdf');
    const relPath = isPdf ? receipt.pdfUri : receipt.imageUri;
    const targetUri = resolveReceiptImageUri(relPath ?? undefined);
    if (!targetUri) {
      skipped++; // the local record has no path to put the file at
      continue;
    }
    const targetPath = stripFileScheme(targetUri);

    if (mode === 'merge') {
      try {
        const info = await FileSystem.getInfoAsync(targetUri);
        if (info.exists) {
          skipped++;
          continue;
        }
      } catch {
        // fs check failed — fall through and try the download anyway
      }
    }

    try {
      await FileSystem.makeDirectoryAsync(targetUri.slice(0, targetUri.lastIndexOf('/')), {
        intermediates: true,
      }).catch(() => {});
      await cs.CloudStorage.downloadFile(item.remotePath, targetPath, scope());
      restored++;
    } catch {
      skipped++; // one bad file must not abort the restore
    }

    // The manifest is the source of truth for the remote map after reinstall.
    useBackupStore.getState().markReceiptRemote(item.receiptId, {
      icloudPath: item.remotePath,
      backedUpAt: manifest.receipts.find((e) => e.id === item.receiptId)?.backedUpAt ?? 0,
    });
  }
  return { restored, skipped };
}
