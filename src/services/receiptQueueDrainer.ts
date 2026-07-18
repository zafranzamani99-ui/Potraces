import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { drainQueue, markProcessed, PendingReceipt } from './receiptQueue';
import { scanReceipt } from './receiptScanner';
import { useReceiptStore } from '../store/receiptStore';
import { globalShowToast } from '../context/ToastContext';
import { toRelativeReceiptPath } from '../utils/receiptImage';

function safeParseDate(raw: unknown): Date {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? new Date() : raw;
  if (typeof raw === 'string' && raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Persist the queued image into the durable receipts/ dir, mirroring the
 * foreground save path (resize + compress, raw-copy fallback). Returns the
 * RELATIVE path to store on the receipt; falls back to the source URI if the
 * copy fails so a receipt is never saved without an image.
 */
async function persistReceiptImage(sourceUri: string): Promise<string> {
  try {
    const dir = `${FileSystem.documentDirectory}receipts/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const target = `${dir}receipt_${Date.now()}.jpg`;
    try {
      const compressed = await manipulateAsync(
        sourceUri,
        [{ resize: { width: 1280 } }],
        { compress: 0.8, format: SaveFormat.JPEG },
      );
      await FileSystem.copyAsync({ from: compressed.uri, to: target });
    } catch {
      // Compression failed — fall back to raw copy so the receipt is never lost.
      await FileSystem.copyAsync({ from: sourceUri, to: target });
    }
    return toRelativeReceiptPath(target);
  } catch {
    // Copy into receipts/ failed entirely (rare FS error). The source is a
    // durable queue image under Documents/receipt-queue/, but the queue will
    // delete it on removePending — so MOVE it into receipts/ (a rename, cheap
    // even when a copy failed) to make it independent of queue cleanup. Only if
    // that also fails do we keep the source, stored RELATIVE so it survives a
    // sandbox rewrite.
    try {
      const dir = `${FileSystem.documentDirectory}receipts/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}receipt_${Date.now()}.jpg`;
      await FileSystem.moveAsync({ from: sourceUri, to: target });
      return toRelativeReceiptPath(target);
    } catch {
      return toRelativeReceiptPath(sourceUri);
    }
  }
}

/**
 * Process one pending receipt: re-run scan, persist the image, add to
 * receiptStore on success. Thrown errors are captured by the queue so it
 * retries with backoff. ScanBusyError propagates so the drainer can skip
 * without burning an attempt.
 */
async function processOne(entry: PendingReceipt): Promise<void> {
  const extracted = await scanReceipt(entry.imageUri);
  if (!extracted || !Array.isArray(extracted.items) || typeof extracted.total !== 'number') {
    throw new Error('extraction returned empty');
  }
  const date = safeParseDate(extracted.date);
  const year = date.getFullYear();
  // Copy the queue image into the durable receipts/ dir (matching the
  // foreground save), and store it as a RELATIVE path — never a queue/cache path.
  const imageUri = await persistReceiptImage(entry.imageUri);
  useReceiptStore.getState().addReceipt({
    vendor: extracted.vendor || 'unknown',
    items: extracted.items,
    total: extracted.total,
    date,
    year,
    myTaxCategory: (extracted.suggestedTaxCategory || 'none') as any,
    imageUri,
  } as any);
  // Mark before the queue removes the entry so a crash in between can't
  // duplicate the receipt on the next drain.
  await markProcessed(entry.id);
}

let inflight: Promise<void> | null = null;

/** Drain the receipt queue if online. Fire-and-forget from foreground /
 *  connectivity transitions. Coalesces concurrent calls. */
export async function runReceiptDrain(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { processed, remaining, dropped } = await drainQueue(processOne);
      if (processed > 0) {
        try {
          globalShowToast(
            remaining > 0
              ? `${processed} receipt${processed === 1 ? '' : 's'} processed, ${remaining} still pending`
              : `${processed} queued receipt${processed === 1 ? '' : 's'} added`,
            'success',
          );
        } catch {
          // toast context not mounted — silent
        }
      }
      if (dropped.length > 0) {
        try {
          globalShowToast(
            `${dropped.length} receipt${dropped.length === 1 ? '' : 's'} could not be processed — saved for review`,
            'error',
          );
        } catch {
          // toast context not mounted — silent
        }
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
