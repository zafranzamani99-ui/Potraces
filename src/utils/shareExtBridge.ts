/**
 * Share-extension coordination bridge — tiny app-group helpers shared by the iOS share
 * EXTENSION and the host APP (same lazy readSharedString/writeSharedString native bridge as
 * sharedTextInbox/sharedPaymentDedupe; best-effort throughout, never throws).
 *
 * 1) Metro host handoff (DEV only). In dev builds the extension loads its JS from Metro at a
 *    HARDCODED IP baked into ShareExtensionViewController.swift — fine on the home network,
 *    dead anywhere else (office machine, DHCP re-lease). Symptom of a dead extension: no
 *    popup card, no "Logged RM…" banner, yet the payment still logs silently on next
 *    foreground (the native half stages the file without any JS). Fix: the app records where
 *    IT loaded its bundle from (`metro-host.txt` in the app-group root); the extension's
 *    Swift reads that and points at the same Metro, falling back to the hardcoded IP.
 * 2) Notified-file markers. The extension marks each staged IMAGE it already fired the
 *    "Logged RM…" banner for (`notified-files.json`). The app's reconcile fires the outcome
 *    notification ITSELF for staged images with no marker (extension never ran), instead of
 *    silently writing the ledger with zero feedback.
 */

const HOST_FILE = 'metro-host.txt';
const NOTIFIED_FILE = 'notified-files.json';
const MAX_MARKERS = 50;

type ExtModule = {
  readSharedString?: (name: string) => Promise<string | null>;
  writeSharedString?: (name: string, content: string) => Promise<boolean>;
} | null;

// Lazy: don't pull the native `expo` module in at import time (expo/winter needs RN's
// __DEV__, which breaks tsx unit tests, and a top-level throw would kill the extension
// bundle). Resolve + memoize on first real use — same pattern as sharedTextInbox.
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

async function readFile(name: string): Promise<string | null> {
  const native = getNative();
  if (!native?.readSharedString) return null;
  try {
    return await native.readSharedString(name);
  } catch {
    return null;
  }
}

async function writeFile(name: string, content: string): Promise<void> {
  const native = getNative();
  if (!native?.writeSharedString) return;
  try {
    await native.writeSharedString(name, content);
  } catch {
    /* best-effort */
  }
}

// ─── 1) Metro host handoff (app → extension, DEV only) ─────────────
/**
 * Record the Metro host[:port] this app's bundle was loaded from. Call on launch and
 * foreground in __DEV__ (iOS only — the extension is iOS-only). No-op elsewhere.
 */
export async function writeMetroHostFromBundleUrl(): Promise<void> {
  try {
    const { NativeModules } = require('react-native');
    const url = NativeModules?.SourceCode?.scriptURL as string | undefined;
    const m = url?.match(/^https?:\/\/([^/?#]+)/);
    const host = m?.[1];
    if (host) await writeFile(HOST_FILE, host);
  } catch {
    /* best-effort */
  }
}

// ─── 2) Notified-file markers (extension → app) ────────────────────
/** Basename of a staged app-group file — MUST match shareToLog's basename() (strip ?/#, after last '/'). */
export function stagedBasename(p: string): string {
  const s = p.split(/[?#]/)[0];
  return s.substring(s.lastIndexOf('/') + 1);
}

/** Extension: remember that the "Logged RM…" banner for this staged image already fired. */
export async function markFileNotified(base: string): Promise<void> {
  if (!base) return;
  try {
    const raw = await readFile(NOTIFIED_FILE);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [base, ...list.filter((b) => b !== base)].slice(0, MAX_MARKERS);
    await writeFile(NOTIFIED_FILE, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
}

/**
 * App: consume the marker for a staged image. true = the extension already notified → the
 * reconcile stays silent. false = it never ran → the app fires the outcome notification
 * itself. Unknown/invalid store degrades to false (notify — a rare duplicate banner beats a
 * silent log).
 */
export async function consumeFileNotified(base: string): Promise<boolean> {
  if (!base) return false;
  try {
    const raw = await readFile(NOTIFIED_FILE);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(base)) return false;
    await writeFile(NOTIFIED_FILE, JSON.stringify(list.filter((b) => b !== base)));
    return true;
  } catch {
    return false;
  }
}
