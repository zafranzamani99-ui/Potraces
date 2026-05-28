import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

/**
 * Offline-tolerant queue for receipt scans that couldn't be processed
 * immediately (no network, AI rate-limited, etc.).
 *
 * Callers add pending entries; a drain function kicks in when the device
 * is online. Keep this minimal — the actual scan+parse logic lives in the
 * caller; this module only tracks what's pending.
 */

const QUEUE_KEY = 'receipt-scan-queue-v1';
const MAX_ATTEMPTS = 5;

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

export async function enqueueReceipt(imageUri: string): Promise<string> {
  const list = await load();
  const entry: PendingReceipt = {
    id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    imageUri,
    addedAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
  };
  await save([entry, ...list]);
  return entry.id;
}

export async function listPending(): Promise<PendingReceipt[]> {
  return [...(await load())];
}

export async function removePending(id: string): Promise<void> {
  const list = await load();
  await save(list.filter((p) => p.id !== id));
}

export async function recordAttemptFailure(id: string, error: string): Promise<PendingReceipt | null> {
  const list = await load();
  const next = list.map((p) =>
    p.id === id
      ? { ...p, attempts: p.attempts + 1, lastAttemptAt: Date.now(), lastError: error }
      : p,
  );
  const dropped = next.find((p) => p.id === id && p.attempts >= MAX_ATTEMPTS) ?? null;
  if (dropped) {
    console.warn(`[receiptQueue] Permanently dropping receipt ${dropped.id} after ${MAX_ATTEMPTS} failed attempts. Last error: ${dropped.lastError}`);
  }
  await save(next.filter((p) => p.attempts < MAX_ATTEMPTS));
  return dropped;
}

/** Drain the queue: calls `processor` for each pending entry, removes on success,
 *  records failure on throw. Stops early if offline. */
export async function drainQueue(
  processor: (p: PendingReceipt) => Promise<void>,
): Promise<{ processed: number; remaining: number; dropped: PendingReceipt[] }> {
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) {
    return { processed: 0, remaining: (await load()).length, dropped: [] };
  }
  let processed = 0;
  const dropped: PendingReceipt[] = [];
  const list = await load();
  for (const entry of list) {
    try {
      await processor(entry);
      await removePending(entry.id);
      processed++;
    } catch (e: any) {
      const d = await recordAttemptFailure(entry.id, e?.message ?? 'unknown');
      if (d) dropped.push(d);
    }
  }
  return { processed, remaining: (await load()).length, dropped };
}

export async function pendingCount(): Promise<number> {
  return (await load()).length;
}
