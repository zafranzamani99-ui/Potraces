import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { newId } from '../utils/id';
import { ScanBusyError } from './receiptScanner';

/**
 * Offline-tolerant queue for receipt scans that couldn't be processed
 * immediately (no network, AI rate-limited, etc.).
 *
 * Callers add pending entries; a drain function kicks in when the device
 * is online. The scan+parse logic lives in the caller (the drainer's
 * processor); this module owns the durable bookkeeping AND the durable
 * copy of each queued image so a scan is never lost to a cleared cache.
 */

const QUEUE_KEY = 'receipt-scan-queue-v1';
// Entries that exhausted their retries are moved here (not deleted) so the
// user can recover the image/data instead of losing it silently.
const FAILED_KEY = 'receipt-scan-failed-v1';
// IDs whose receipt was already written to the store but whose queue entry
// may not have been removed (e.g. a crash between addReceipt and
// removePending). Used to dedup a re-drain.
const PROCESSED_KEY = 'receipt-scan-processed-v1';

const MAX_ATTEMPTS = 5;
// Don't hammer a failing entry every foreground — cool off between attempts.
const BACKOFF_MS = 60_000;
// Durable home for queued source images (survives cache eviction).
export const QUEUE_IMAGE_DIR = `${FileSystem.documentDirectory}receipt-queue/`;

export interface PendingReceipt {
  id: string;
  imageUri: string;
  addedAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  lastError?: string;
}

let cache: PendingReceipt[] | null = null;

async function load(): Promise<PendingReceipt[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    cache = raw ? (JSON.parse(raw) as PendingReceipt[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(list: PendingReceipt[]): Promise<void> {
  cache = list;
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch {
    // best-effort
  }
}

async function loadFailed(): Promise<PendingReceipt[]> {
  try {
    const raw = await AsyncStorage.getItem(FAILED_KEY);
    return raw ? (JSON.parse(raw) as PendingReceipt[]) : [];
  } catch {
    return [];
  }
}

async function saveFailed(list: PendingReceipt[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FAILED_KEY, JSON.stringify(list));
  } catch {
    // best-effort
  }
}

async function loadProcessed(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PROCESSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function saveProcessed(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PROCESSED_KEY, JSON.stringify(ids));
  } catch {
    // best-effort
  }
}

/** Mark an entry's receipt as already written to the store. Call this from the
 *  processor immediately after addReceipt succeeds so a crash before
 *  removePending doesn't duplicate the receipt on the next drain. */
export async function markProcessed(id: string): Promise<void> {
  const ids = await loadProcessed();
  if (!ids.includes(id)) await saveProcessed([...ids, id]);
}

async function clearProcessed(id: string): Promise<void> {
  const ids = await loadProcessed();
  if (ids.includes(id)) await saveProcessed(ids.filter((x) => x !== id));
}

/** Best-effort delete of a queued image file (only touch files we own). */
async function deleteQueueImage(uri: string | undefined): Promise<void> {
  if (!uri || !uri.startsWith(QUEUE_IMAGE_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // best-effort
  }
}

/**
 * Enqueue a receipt image for later scanning. Copies the source bytes into a
 * durable, queue-owned location so a cleared photo cache can't strand the
 * scan (finding B5). Falls back to the original URI only if the copy fails.
 */
export async function enqueueReceipt(imageUri: string): Promise<string> {
  const list = await load();
  const id = newId();
  let storedUri = imageUri;
  try {
    const dirInfo = await FileSystem.getInfoAsync(QUEUE_IMAGE_DIR);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(QUEUE_IMAGE_DIR, { intermediates: true });
    const target = `${QUEUE_IMAGE_DIR}${id}.jpg`;
    await FileSystem.copyAsync({ from: imageUri, to: target });
    storedUri = target;
  } catch {
    // Couldn't persist a durable copy — keep the caller's URI so the scan
    // isn't dropped outright (it may still resolve while the app is warm).
    storedUri = imageUri;
  }
  const entry: PendingReceipt = {
    id,
    imageUri: storedUri,
    addedAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
  };
  await save([entry, ...list]);
  return id;
}

export async function listPending(): Promise<PendingReceipt[]> {
  return [...(await load())];
}

/** Remove a pending entry that was handled successfully, deleting its
 *  durable queue image (the saved receipt keeps its own copy). */
export async function removePending(id: string): Promise<void> {
  const list = await load();
  const entry = list.find((p) => p.id === id);
  await save(list.filter((p) => p.id !== id));
  await deleteQueueImage(entry?.imageUri);
  await clearProcessed(id);
}

export async function recordAttemptFailure(id: string, error: string): Promise<PendingReceipt | null> {
  const list = await load();
  const next = list.map((p) =>
    p.id === id
      ? { ...p, attempts: p.attempts + 1, lastAttemptAt: Date.now(), lastError: error }
      : p,
  );
  const dropped = next.find((p) => p.id === id && p.attempts >= MAX_ATTEMPTS) ?? null;
  await save(next.filter((p) => p.attempts < MAX_ATTEMPTS));
  if (dropped) {
    console.warn(`[receiptQueue] Permanently dropping receipt ${dropped.id} after ${MAX_ATTEMPTS} failed attempts. Last error: ${dropped.lastError}`);
    // Preserve the image + data for manual recovery instead of destroying it.
    const failed = await loadFailed();
    await saveFailed([dropped, ...failed]);
  }
  return dropped;
}

/** Entries that exhausted their retries, kept for manual recovery. */
export async function listFailedReceipts(): Promise<PendingReceipt[]> {
  return await loadFailed();
}

/** Discard a failed entry the user no longer wants, deleting its image. */
export async function clearFailedReceipt(id: string): Promise<void> {
  const failed = await loadFailed();
  const entry = failed.find((p) => p.id === id);
  await saveFailed(failed.filter((p) => p.id !== id));
  await deleteQueueImage(entry?.imageUri);
}

/** Move a failed entry back into the pending queue for another try (resets the
 *  attempt count). The image was preserved, so the scan can be retried — call
 *  runReceiptDrain() afterwards to process it now. */
export async function retryFailedReceipt(id: string): Promise<void> {
  const failed = await loadFailed();
  const entry = failed.find((p) => p.id === id);
  if (!entry) return;
  await saveFailed(failed.filter((p) => p.id !== id));
  const list = await load();
  await save([{ ...entry, attempts: 0, lastAttemptAt: null, lastError: undefined }, ...list]);
}

/** Drain the queue: calls `processor` for each pending entry, removes on success,
 *  records failure on throw. Stops early if offline.
 *  - Skips entries still cooling down from a recent failed attempt (backoff).
 *  - Skips (without burning an attempt) when a scan is already in progress.
 *  - Dedups entries whose receipt was already written before a crash. */
export async function drainQueue(
  processor: (p: PendingReceipt) => Promise<void>,
): Promise<{ processed: number; remaining: number; dropped: PendingReceipt[] }> {
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) {
    return { processed: 0, remaining: (await load()).length, dropped: [] };
  }
  let processed = 0;
  const dropped: PendingReceipt[] = [];
  const processedIds = await loadProcessed();
  const list = await load();
  for (const entry of list) {
    // Dedup: receipt already added to the store but the entry survived a crash
    // before removal — clean it up without re-scanning/re-adding.
    if (processedIds.includes(entry.id)) {
      await removePending(entry.id);
      processed++;
      continue;
    }
    // Backoff: leave recently-failed entries alone until the window elapses.
    if (entry.attempts > 0 && entry.lastAttemptAt && Date.now() - entry.lastAttemptAt < BACKOFF_MS) {
      continue;
    }
    try {
      await processor(entry);
      await removePending(entry.id);
      processed++;
    } catch (e: any) {
      // A concurrent scan holds the lock — retry later, don't burn an attempt.
      if (e instanceof ScanBusyError) continue;
      const d = await recordAttemptFailure(entry.id, e?.message ?? 'unknown');
      if (d) dropped.push(d);
    }
  }
  return { processed, remaining: (await load()).length, dropped };
}

export async function pendingCount(): Promise<number> {
  return (await load()).length;
}
