/**
 * Google Drive receipt auto-backup — enqueue + queue processor for the
 * 'drive-file' jobs in the cloud-backup durable queue.
 *
 * enqueueReceiptDriveBackup() is called when a receipt is saved; the drain
 * (cloudBackupQueue.processBackupJobs) later hands each job to
 * processDriveFileJob(). The decision rules (naming, source selection, skip)
 * are pure functions in driveBackupLogic.ts — this module owns the store /
 * file-system wiring:
 *   • receipts are looked up in receiptStore; deleted locally → no-op success
 *   • stored paths are RELATIVE — always resolved via resolveReceiptImageUri
 *     before reading (iOS rewrites the sandbox container on every install)
 *   • on success the Drive file ID is recorded in backupStore so the next
 *     run skips the receipt (see shouldSkipDriveBackup)
 * Errors (incl. NEEDS_REAUTH) propagate — the queue records the attempt and
 * retries on a later drain.
 */
import { enqueueBackupJob } from './cloudBackupQueue';
import { useReceiptStore } from '../store/receiptStore';
import { useBackupStore } from '../store/backupStore';
import { resolveReceiptImageUri } from '../utils/receiptImage';
import { ensureDriveFolders, uploadToDrive } from './googleDrive';
import {
  pickDriveBackupSource,
  receiptDriveFileName,
  shouldSkipDriveBackup,
} from './driveBackupLogic';

/** Queue a Drive backup for one receipt (dedupes while one is pending). */
export async function enqueueReceiptDriveBackup(receiptId: string): Promise<void> {
  await enqueueBackupJob('drive-file', `drive:${receiptId}`, { receiptId });
}

/** Processor for kind 'drive-file' — uploads the receipt's artifact to
 *  "Potraces/Receipts" and records the remote ID. */
export async function processDriveFileJob(job: { payload: Record<string, any> }): Promise<void> {
  const receiptId = job.payload?.receiptId as string | undefined;
  if (!receiptId) return;

  const receipt = useReceiptStore.getState().receipts.find((r) => r.id === receiptId);
  if (!receipt) return; // deleted locally — nothing to back up

  if (shouldSkipDriveBackup(useBackupStore.getState().receiptRemote[receiptId])) return;

  const source = pickDriveBackupSource(receipt);
  if (!source) return; // no artifact on this receipt

  const fileUri = resolveReceiptImageUri(source.path);
  if (!fileUri) return;

  const { receiptsId } = await ensureDriveFolders();
  const driveFileId = await uploadToDrive({
    fileUri,
    name: receiptDriveFileName(receiptId, source.kind),
    mimeType: source.mimeType,
    folderId: receiptsId,
  });

  useBackupStore.getState().markReceiptRemote(receiptId, { driveFileId, backedUpAt: Date.now() });
}
