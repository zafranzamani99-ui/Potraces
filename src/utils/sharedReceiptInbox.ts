import { requireOptionalNativeModule } from 'expo';

/**
 * Pending "share a receipt → TAP the notification to scan it" inbox, shared between the iOS
 * share EXTENSION and the host APP via a JSON file in the app-group container.
 *
 * Flow: the extension detects a receipt, stashes it here (keyed by a random `rid` that it also
 * puts in the "Receipt found" notification), and fires the notification. The app opens the
 * scanner ONLY when that notification is TAPPED (and only within 24h) — never on a plain app
 * open. Entries older than 24h are pruned (the receipt "expires"). The one exception is when
 * notifications are OFF: there's no tap path, so the app falls back to opening the receipt on
 * the next foreground (see shareToLog.reconcileSharedPayments).
 *
 * Best-effort throughout: a missing native module simply degrades to "no pending receipts",
 * never a crash. Concurrency (extension write vs app read/write) is rare — a lost race just
 * means one receipt must be re-shared.
 */

const FILE = 'pending-receipts.json';
export const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — the tap-to-scan window

export interface PendingReceipt {
  /** file:// path to the staged image in the app-group `sharedData` dir. */
  file: string;
  /** When it was shared (ms). Older than RECEIPT_TTL_MS ⇒ expired. */
  ts: number;
}
type Store = Record<string, PendingReceipt>; // keyed by receipt id (rid)

const native = requireOptionalNativeModule('ExpoShareExtension') as
  | {
      readSharedString?: (name: string) => Promise<string | null>;
      writeSharedString?: (name: string, content: string) => Promise<boolean>;
    }
  | null;

async function read(): Promise<Store> {
  if (!native?.readSharedString) return {};
  try {
    const raw = await native.readSharedString(FILE);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? (obj as Store) : {};
  } catch {
    return {};
  }
}

async function write(store: Store): Promise<void> {
  if (!native?.writeSharedString) return;
  try {
    await native.writeSharedString(FILE, JSON.stringify(store));
  } catch {
    /* best-effort */
  }
}

/** Stash a detected receipt so its notification tap can scan it later (within 24h). */
export async function addPendingReceipt(rid: string, file: string): Promise<void> {
  if (!rid || !file) return;
  const store = await read();
  store[rid] = { file, ts: Date.now() };
  await write(store);
}

/** Raw entry for a tapped notification's id — null only if truly absent (caller checks age). */
export async function getPendingReceiptRaw(rid: string): Promise<PendingReceipt | null> {
  if (!rid) return null;
  return (await read())[rid] ?? null;
}

/** Every still-valid (≤24h) pending receipt, with its id. */
export async function listPendingReceipts(): Promise<Array<PendingReceipt & { rid: string }>> {
  const store = await read();
  const now = Date.now();
  return Object.entries(store)
    .filter(([, e]) => !!e && now - e.ts <= RECEIPT_TTL_MS)
    .map(([rid, e]) => ({ rid, ...e }));
}

export async function removePendingReceipt(rid: string): Promise<void> {
  if (!rid) return;
  const store = await read();
  if (store[rid]) {
    delete store[rid];
    await write(store);
  }
}

/** Drop entries older than 24h; returns the removed ones so the caller can delete their images. */
export async function pruneExpiredReceipts(): Promise<PendingReceipt[]> {
  const store = await read();
  const now = Date.now();
  const removed: PendingReceipt[] = [];
  let changed = false;
  for (const [rid, e] of Object.entries(store)) {
    if (!e || now - e.ts > RECEIPT_TTL_MS) {
      if (e) removed.push(e);
      delete store[rid];
      changed = true;
    }
  }
  if (changed) await write(store);
  return removed;
}
