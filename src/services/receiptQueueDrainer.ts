import { drainQueue, PendingReceipt } from './receiptQueue';
import { scanReceipt } from './receiptScanner';
import { useReceiptStore } from '../store/receiptStore';
import { globalShowToast } from '../context/ToastContext';

function safeParseDate(raw: unknown): Date {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? new Date() : raw;
  if (typeof raw === 'string' && raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Process one pending receipt: re-run scan, add to receiptStore on success.
 * Thrown errors are captured by the queue so it retries with backoff.
 */
async function processOne(entry: PendingReceipt): Promise<void> {
  const extracted = await scanReceipt(entry.imageUri);
  if (!extracted || !(extracted.total > 0) || !Array.isArray(extracted.items)) {
    throw new Error('extraction returned empty');
  }
  const date = safeParseDate(extracted.date);
  const year = date.getFullYear();
  useReceiptStore.getState().addReceipt({
    vendor: extracted.vendor || 'unknown',
    items: extracted.items,
    total: extracted.total,
    date,
    year,
    myTaxCategory: (extracted.suggestedTaxCategory || 'none') as any,
    imageUri: entry.imageUri,
  } as any);
}

let inflight: Promise<void> | null = null;

/** Drain the receipt queue if online. Fire-and-forget from foreground /
 *  connectivity transitions. Coalesces concurrent calls. */
export async function runReceiptDrain(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { processed, remaining } = await drainQueue(processOne);
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
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
