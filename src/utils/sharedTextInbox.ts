/**
 * Pending "shared TEXT" inbox — bank SMS, WhatsApp/Telegram payment confirmations, emailed
 * receipts pasted as text — shared between the iOS share EXTENSION and the host APP via a
 * JSON file in the app-group container (same bridge as sharedReceiptInbox/sharedPaymentDedupe).
 *
 * Flow: the extension classifies the text with the SAME parser the OCR path uses, fires the
 * "Logged RM…" notification immediately for a confident payment, and stashes the text here.
 * The app replays it through the identical pipeline on next foreground and writes the ledger
 * entry (the extension can't write the ledger — separate process/container).
 *
 * `kind` records the extension's classification so the app knows how to handle it:
 *   - 'payment': confident payment, notification already fired → app logs silently.
 *   - 'receipt': receipt-shaped, tap-to-review (like image receipts, no image though) —
 *     the app opens the ReceiptScanner review (rows, not a photo) on notification TAP only.
 *   - 'other':   uncertain / needs a look → app notifies the final outcome.
 * Entries older than 72h are pruned as hygiene. Best-effort throughout: a missing native
 * module degrades to "no pending texts", never a crash.
 */

const FILE = 'pending-texts.json';
const TTL_MS = 72 * 60 * 60 * 1000; // 72h hygiene — unconsumed texts shouldn't pile up

export type PendingTextKind = 'payment' | 'other' | 'receipt';
export interface PendingText {
  text: string;
  kind: PendingTextKind;
  ts: number;
  /** file:// path of the staged PDF (kind 'receipt' from a PDF share) — the app copies it
   *  into receipt storage as the archived document, then deletes the staged original. */
  pdfFile?: string;
}
type Store = Record<string, PendingText>; // keyed by text id (tid)

type ExtModule = {
  readSharedString?: (name: string) => Promise<string | null>;
  writeSharedString?: (name: string, content: string) => Promise<boolean>;
} | null;

// Lazy: don't pull the native `expo` module in at import time (expo/winter needs
// RN's `__DEV__`, which breaks tsx unit tests). Resolve + memoize on first real use.
let _native: ExtModule | undefined;
function getNative(): ExtModule {
  if (_native === undefined) {
    try {
      const { requireOptionalNativeModule } = require('expo');
      _native = (requireOptionalNativeModule('ExpoShareExtension') as ExtModule) ?? null;
    } catch {
      _native = null;
    }
  }
  return _native;
}

function prune(store: Store): Store {
  const cutoff = Date.now() - TTL_MS;
  const next: Store = {};
  for (const [k, e] of Object.entries(store)) if (e && e.ts >= cutoff) next[k] = e;
  return next;
}

async function read(): Promise<Store> {
  const native = getNative();
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
  const native = getNative();
  if (!native?.writeSharedString) return;
  try {
    await native.writeSharedString(FILE, JSON.stringify(store));
  } catch {
    /* best-effort */
  }
}

/** Stash a shared text for the app to consume on next foreground. */
export async function addPendingText(
  tid: string,
  text: string,
  kind: PendingTextKind,
  pdfFile?: string,
): Promise<void> {
  if (!tid || !text) return;
  const store = prune(await read());
  store[tid] = { text, kind, ts: Date.now(), ...(pdfFile ? { pdfFile } : {}) };
  await write(store);
}

/** Every still-valid pending text, with its id. */
export async function listPendingTexts(): Promise<Array<PendingText & { tid: string }>> {
  const store = await read();
  const now = Date.now();
  return Object.entries(store)
    .filter(([, e]) => !!e && now - e.ts <= TTL_MS)
    .map(([tid, e]) => ({ tid, ...e }));
}

/** Raw entry for a tapped notification's id — null only if truly absent (caller checks age). */
export async function getPendingTextRaw(tid: string): Promise<PendingText | null> {
  if (!tid) return null;
  return (await read())[tid] ?? null;
}

export async function removePendingText(tid: string): Promise<void> {
  if (!tid) return;
  const store = await read();
  if (store[tid]) {
    delete store[tid];
    await write(store);
  }
}
