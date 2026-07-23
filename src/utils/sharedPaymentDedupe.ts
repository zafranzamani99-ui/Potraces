import { requireOptionalNativeModule } from 'expo';

/**
 * Payment dedupe shared between the iOS share EXTENSION and the host APP, via a small JSON
 * file in the app-group container. The extension can't read the app's AsyncStorage
 * (separate process/container), so it consults this file to decide whether a payment was
 * already logged — showing "Already logged" (and skipping the OS notification) on a repeat,
 * which also keeps the lock-screen notifications in sync with the in-app inbox.
 *
 * Deletion-aware: each key stores the transaction id it produced, and the app removes the
 * key when that transaction is deleted (see personalStore.deleteTransaction) — so deleting
 * a payment and re-sharing the same screenshot logs it fresh again. Best-effort throughout;
 * a race or a missing native module simply degrades to "no dedupe" (an extra notification),
 * never a crash.
 */

const FILE = 'payment-dedupe.json';
const TTL_MS = 72 * 60 * 60 * 1000; // 72 hours — same-payment window, not history

interface Entry {
  ts: number;
  txId: string | null;
}
type Store = Record<string, Entry>;

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

function prune(store: Store): Store {
  const cutoff = Date.now() - TTL_MS;
  const next: Store = {};
  for (const [k, e] of Object.entries(store)) if (e && e.ts >= cutoff) next[k] = e;
  return next;
}

/** True if this payment key is recorded as already-logged (within the dedupe window). */
export async function hasSharedKey(key: string): Promise<boolean> {
  if (!key) return false;
  const e = (await read())[key];
  return !!e && Date.now() - e.ts < TTL_MS;
}

/** Record a key as logged, optionally tagging the transaction it produced. */
export async function addSharedKey(key: string, txId?: string | null): Promise<void> {
  if (!key) return;
  const store = prune(await read());
  store[key] = { ts: Date.now(), txId: txId ?? store[key]?.txId ?? null };
  await write(store);
}

/** Drop any key whose transaction was deleted → re-sharing that screenshot logs it fresh. */
export async function removeSharedKeyByTxId(txId: string): Promise<void> {
  if (!txId) return;
  const store = await read();
  let changed = false;
  for (const [k, e] of Object.entries(store)) {
    if (e?.txId === txId) {
      delete store[k];
      changed = true;
    }
  }
  if (changed) await write(prune(store));
}

/**
 * Drop a specific key BY KEY. More robust than removeSharedKeyByTxId when the stored txId link
 * is stale or null (a read-modify-write race between the extension and app, or a legacy entry) —
 * the caller looks the key up from the local dedupe store's key↔txId map, which is authoritative.
 */
export async function removeSharedKey(key: string): Promise<void> {
  if (!key) return;
  const store = await read();
  if (store[key]) {
    delete store[key];
    await write(prune(store));
  }
}

/**
 * Remove a payment's dedupe entry by KEY *and* by txId in a SINGLE read-modify-write. This is the
 * delete-time cleanup: doing it in one pass (instead of two concurrent removeSharedKey +
 * removeSharedKeyByTxId writes) avoids a self-race where the second write could re-add the key the
 * first removed, and halves the app-group I/O so the removal lands before a fast re-share reads it.
 */
export async function removeSharedEntry(key: string | null | undefined, txId?: string | null): Promise<void> {
  const store = await read();
  let changed = false;
  if (key && store[key]) {
    delete store[key];
    changed = true;
  }
  if (txId) {
    for (const [k, e] of Object.entries(store)) {
      if (e?.txId === txId) {
        delete store[k];
        changed = true;
      }
    }
  }
  if (changed) await write(prune(store));
}

/**
 * Self-heal: drop entries whose (non-null) transaction id is no longer live — i.e. the payment
 * was logged then deleted, but the by-txId cleanup missed it. Leaves null-txId entries (a share
 * still awaiting its first reconcile) and live ones untouched. Called on app reconcile.
 */
export async function pruneSharedKeysByLiveTxIds(liveTxIds: Set<string>): Promise<void> {
  const store = await read();
  let changed = false;
  for (const [k, e] of Object.entries(store)) {
    if (e?.txId && !liveTxIds.has(e.txId)) {
      delete store[k];
      changed = true;
    }
  }
  if (changed) await write(prune(store));
}
