/**
 * Share-to-Log pipeline — turns a shared payment-success screenshot into a logged
 * transaction. The unified entry point for BOTH platforms: iOS routes here from the
 * `potraces://share` deep-link branch (App.tsx), Android from the native share
 * intent bridge. See docs/SHARE_TO_LOG_PLAN.md.
 *
 * Flow (offline-first): OCR the image on-device → parsePaymentScreenshot → decide
 * (A) log immediately when we have a confident local amount, else (B) let Echo/Gemini
 * read the image to supply the amount → logQuickExpense → fire a local "Logged RM…"
 * notification (or "couldn't read — tap to add" on failure). Echo NEVER blocks the
 * instant path and NEVER changes a logged amount (that would re-delta the wallet);
 * it only patches category/merchant on an already-logged row.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import {
  deleteAsync,
  copyAsync,
  makeDirectoryAsync,
  getInfoAsync,
  documentDirectory,
} from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { parsePaymentScreenshot, type ParsedPayment } from './paymentScreenshotParser';
import { recognizeRows, isLocalOcrAvailable, extractReceiptFromRows } from './localReceiptOcr';
import { navigationRef } from '../navigation/navigationRef';
import { logQuickExpense, type QuickLogResult } from './quickLog';
import { prepareImage } from './receiptScanner';
import { callGeminiAPI, isGeminiAvailable } from './geminiClient';
import { ANDROID_CHANNELS } from './pushNotifications';
import { usePremiumStore } from '../store/premiumStore';
import { useCategoryStore } from '../store/categoryStore';
import { usePersonalStore } from '../store/personalStore';
import { useNotificationStore } from '../store/notificationStore';
import { useAppStore } from '../store/appStore';
import { globalShowToast } from '../context/ToastContext';
import { dedupeKeyFor } from '../utils/paymentDedupeKey';
import { addSharedKey, pruneSharedKeysByLiveTxIds } from '../utils/sharedPaymentDedupe';
import {
  getPendingReceiptRaw,
  listPendingReceipts,
  removePendingReceipt,
  pruneExpiredReceipts,
  RECEIPT_TTL_MS,
} from '../utils/sharedReceiptInbox';

// Temporary on-device diagnostics for the Share-to-Log flow. Logs stream to Metro
// (visible to the developer); the user-facing outcome still shows via the toast in the
// notify* helpers. Flip off once the flow is verified.
const SHARE_DEBUG = false;
function dbg(msg: string) {
  if (SHARE_DEBUG) console.log(`[share] ${msg}`);
}

// Native handle to list the app-group "sharedData" dir where the iOS share extension
// stages payment screenshots. null off iOS / when the module isn't in the build. iOS
// blocks a share extension from launching the host app, so instead of a deep-link
// hand-off the app reconciles this shared container whenever it becomes active.
const ShareExtNative = requireOptionalNativeModule('ExpoShareExtension') as
  | { getSharedFilePaths?: () => Promise<string[]> }
  | null;

const IMAGE_EXT_RE = /\.(jpe?g|png|heic|heif)$/i;
let _reconciling = false;

/**
 * Process any payment screenshots the iOS share extension staged in the app-group
 * container: log each, then delete it so it's never re-processed. Safe to call
 * repeatedly (re-entry guarded; logQuickExpense dedupes by key too). No-op off iOS or
 * when nothing is staged. Call on launch and on every AppState → 'active'.
 */
export async function reconcileSharedPayments(): Promise<void> {
  if (Platform.OS !== 'ios' || !ShareExtNative?.getSharedFilePaths || _reconciling) return;
  _reconciling = true;
  try {
    // 1) Expire pending receipts older than 24h → delete their stashed images. A receipt is
    //    tap-to-scan only; if never tapped within 24h it's gone (the user re-shares).
    try {
      const expired = await pruneExpiredReceipts();
      for (const r of expired) {
        try { await deleteAsync(normalizeUri(r.file), { idempotent: true }); } catch { /* */ }
      }
    } catch { /* best-effort */ }

    // 1b) Self-heal the app-group payment dedupe: drop entries whose transaction was deleted, so
    //     the share extension never shows "already logged" for a payment the user removed.
    try {
      const live = new Set(usePersonalStore.getState().transactions.map((t) => t.id));
      await pruneSharedKeysByLiveTxIds(live);
    } catch { /* best-effort */ }

    // 2) Receipts are opened ONLY by tapping their notification — so on a plain foreground we
    //    LEAVE them stashed. The one exception: if notifications are OFF there's no tap path,
    //    so we open the receipt here (once) as a safety net. Which staged files are receipts?
    //    the ones the extension stashed (matched by basename — no re-OCR needed).
    const notifsOn = await notificationsGranted();
    let pending: Array<{ rid: string; file: string; ts: number }> = [];
    try { pending = await listPendingReceipts(); } catch { pending = []; }
    const receiptByBase = new Map(pending.map((r) => [basename(r.file), r]));

    let paths: string[] = [];
    try {
      paths = (await ShareExtNative.getSharedFilePaths()) ?? [];
    } catch (e) {
      dbg(`reconcile list failed: ${String(e).slice(0, 60)}`);
      paths = [];
    }
    if (paths.length > 0) dbg(`reconcile: ${paths.length} staged file(s), notifsOn=${notifsOn}`);

    let openedReceipt = false;
    for (const p of paths) {
      if (!IMAGE_EXT_RE.test(p)) {
        try { await deleteAsync(p, { idempotent: true }); } catch { /* */ }
        continue;
      }
      const entry = receiptByBase.get(basename(p));
      if (entry) {
        // A pending RECEIPT. Tap-only → leave it for the notification tap (do NOT delete; the
        // 24h prune above cleans it eventually). Safety net: notifications OFF → open it now
        // (once per foreground), then consume it.
        if (!notifsOn && !openedReceipt) {
          openedReceipt = true;
          try { await openReceiptReview(entry.file); } catch { /* */ }
          await removePendingReceipt(entry.rid);
          try { await deleteAsync(p, { idempotent: true }); } catch { /* */ }
        }
        continue;
      }
      // Not a pending receipt → a PAYMENT (unchanged): silent-log + delete. scanReceipts:false so
      // an untagged receipt is never auto-opened from a silent reconcile.
      try { await logPaymentFromShare(p, { silent: true, scanReceipts: false }); } catch { /* */ }
      try { await deleteAsync(p, { idempotent: true }); } catch { /* */ }
    }
  } finally {
    _reconciling = false;
  }
}

function basename(p: string): string {
  const s = p.split(/[?#]/)[0];
  return s.substring(s.lastIndexOf('/') + 1);
}

async function notificationsGranted(): Promise<boolean> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    return perm.status === 'granted';
  } catch {
    return true; // assume ON (tap-only) — the user's primary intent
  }
}

/**
 * Tap of a "Receipt found" notification → open the scanner for THAT receipt, but only if it's
 * still within the 24h window. Expired or already-gone → a brief toast (nothing to scan). This
 * is the ONLY entry point that opens a shared receipt when notifications are on.
 */
export async function openSharedReceiptById(rid?: string): Promise<void> {
  if (!rid) return; // a legacy notification with no id → nothing to do
  let entry: { file: string; ts: number } | null = null;
  try { entry = await getPendingReceiptRaw(rid); } catch { entry = null; }
  if (!entry) {
    try { globalShowToast('That receipt is no longer available — share it again.', 'info'); } catch { /* */ }
    return;
  }
  if (Date.now() - entry.ts > RECEIPT_TTL_MS) {
    await removePendingReceipt(rid);
    try { await deleteAsync(normalizeUri(entry.file), { idempotent: true }); } catch { /* */ }
    try { globalShowToast('This receipt expired — share it again to scan.', 'info'); } catch { /* */ }
    return;
  }
  await openReceiptReview(entry.file);
  await removePendingReceipt(rid);
  try { await deleteAsync(normalizeUri(entry.file), { idempotent: true }); } catch { /* */ }
}

export { dedupeKeyFor };

// ─── Receipt hand-off ────────────────────────────────────────
// A shared store RECEIPT is handed to the full ReceiptScanner review (owner's choice —
// not silent-logged; the user confirms items/total/category and taps Save). The transient
// app-group image is copied into an app-owned dir BEFORE reconcile deletes the staged
// original, then we navigate to the scanner. If navigation isn't ready yet (a cold-launch
// reconcile), the copied URI is stashed and drained by flushPendingReceiptReview() once
// App.tsx reports nav ready / on the next foreground.
let pendingReceiptUri: string | null = null;

async function copyToInbox(uri: string): Promise<string> {
  const dir = `${documentDirectory}shared-inbox/`;
  try {
    const info = await getInfoAsync(dir);
    if (!info.exists) await makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    /* best-effort — copyAsync below still fails loudly if the dir is truly unavailable */
  }
  const ext = (uri.match(IMAGE_EXT_RE)?.[1] ?? 'jpg').toLowerCase();
  const dest = `${dir}receipt-${Date.now()}.${ext}`;
  await copyAsync({ from: uri, to: dest });
  return dest;
}

function navigateToReceipt(uri: string): boolean {
  if (!navigationRef.isReady()) return false;
  try {
    // Share-to-Log captures personal spending — like the payment path, a shared receipt
    // logs to personal, so switch mode before the review screen reads it (App.tsx does the
    // same for the share deep-link).
    if (useAppStore.getState().mode !== 'personal') useAppStore.getState().setMode('personal');
    (navigationRef as any).navigate('ReceiptScanner', { imageUri: uri, autoScan: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the ReceiptScanner review screen for a shared receipt. Copies the image out of the
 * transient app-group path first so it survives the reconcile cleanup, then navigates (or
 * stashes for flushPendingReceiptReview when nav isn't ready). Never throws.
 */
export async function openReceiptReview(imageUri: string): Promise<void> {
  let uri = normalizeUri(imageUri);
  try {
    uri = await copyToInbox(uri);
  } catch {
    // Couldn't copy out — fall back to the original path (still readable until reconcile
    // deletes it; if navigation is ready now, the scanner reads it before that happens).
  }
  if (!navigateToReceipt(uri)) pendingReceiptUri = uri;
}

/** Drain a receipt detected while navigation wasn't ready yet. Call on nav-ready + foreground. */
export function flushPendingReceiptReview(): void {
  if (!pendingReceiptUri) return;
  if (navigateToReceipt(pendingReceiptUri)) pendingReceiptUri = null;
}

const MAX_AMOUNT = 1_000_000;
// Below this local confidence, prefer letting Echo re-read the image for a better
// amount BEFORE logging (Strategy B) — but only when Echo is actually available.
// At/above it we log the local amount immediately (Strategy A) and let Echo enrich.
const CONFIDENT = 0.6;

export interface EchoEnrichResult {
  merchant?: string;
  categoryId?: string;
  amount?: number;
  direction?: 'out' | 'in';
  confidence: number;
}

// ─── URI + JSON helpers ──────────────────────────────────────
function normalizeUri(uri: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) return uri; // already file:// / content:// / ph://
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return m ? m[1].trim() : t;
}

function echoDedupeKey(echo: EchoEnrichResult, parsed: ParsedPayment | null): string {
  return dedupeKeyFor({
    refId: parsed?.refId ?? null,
    direction: echo.direction ?? parsed?.direction ?? 'out',
    amount: echo.amount ?? null,
    datetime: parsed?.datetime ?? null,
    payee: echo.merchant ?? parsed?.payee ?? null,
  });
}

// ─── Local notifications ─────────────────────────────────────
async function fireNotification(
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNELS.spendingAlerts } : {}),
      },
      trigger: null,
    });
  } catch {
    // best-effort — a missing notification must never break the log itself
  }
}

function loggedBody(direction: 'out' | 'in', amount: number, payee: string | null): string {
  const verb = direction === 'in' ? 'received' : 'paid';
  const tail = payee ? ` · ${payee}` : '';
  return `RM ${amount.toFixed(2)} ${verb}${tail}`;
}

function notifyLogged(direction: 'out' | 'in', amount: number, payee: string | null): Promise<void> {
  const msg = loggedBody(direction, amount, payee);
  dbg(`OUTCOME logged: ${msg}`);
  // In-app toast (visible in the foreground) + notification (for the background).
  try { globalShowToast(msg, 'success'); } catch { /* toast host not mounted */ }
  return fireNotification('Logged to Potraces', msg, { type: 'share_logged' });
}

/**
 * Record a logged payment into the in-app Notification inbox. Runs on EVERY
 * successful log — including the silent iOS app-group reconcile (where the OS
 * banner came from the share-extension process and never reaches this app's
 * foreground listener). Deterministic id (`txn-<txId>`) so the same payment is
 * never inboxed twice. Best-effort: a failure here must never break the log.
 */
function inboxLogged(direction: 'out' | 'in', amount: number, payee: string | null, txId: string): void {
  try {
    useNotificationStore.getState().addNotification({
      id: `txn-${txId}`,
      type: 'transaction',
      title: 'Logged to Potraces',
      body: loggedBody(direction, amount, payee),
      createdAt: Date.now(),
      data: { type: 'share_logged', direction, amount, payee: payee ?? undefined, txId },
    });
  } catch {
    // inbox is best-effort — never let it break the actual ledger write
  }
}

function notifyCouldntRead(message?: string): Promise<void> {
  const msg = message ?? "Couldn't read that one — tap to add it manually.";
  dbg(`OUTCOME couldnt-read: ${msg}`);
  // NO lock-screen banner — it's not urgent, and a slow (post-AI) alert confused users. Show
  // an in-app toast if we're in the foreground, and record it QUIETLY in the bell under
  // Announcements (a non-'transaction' type), never the Transactions tab.
  try { globalShowToast(msg, 'info'); } catch { /* toast host not mounted */ }
  try {
    useNotificationStore.getState().addNotification({
      id: `share-notpay-${Date.now()}`,
      type: 'update',
      title: 'Not a successful payment',
      body: msg,
      createdAt: Date.now(),
    });
  } catch {
    // best-effort — the inbox record must never break the flow
  }
  return Promise.resolve();
}

function notifyAlreadyLogged(): Promise<void> {
  dbg('OUTCOME already-logged (dedupe)');
  try { globalShowToast('Already logged — this payment was already recorded.', 'info'); } catch { /* */ }
  return fireNotification('Already logged', 'This payment was already recorded.', {
    type: 'share_logged',
  });
}

// ─── Logging helpers ─────────────────────────────────────────
function logFromParsed(p: ParsedPayment): QuickLogResult | null {
  return logQuickExpense({
    amount: p.amount as number,
    type: p.direction === 'in' ? 'income' : 'expense',
    wallet: p.walletHint ?? undefined,
    note: p.payee ?? undefined, // note drives free merchant→category guessing
    date: p.datetime ?? undefined,
    inputMethod: 'share',
    dedupeKey: dedupeKeyFor(p),
  });
}

function logFromEcho(echo: EchoEnrichResult, parsed: ParsedPayment | null): QuickLogResult | null {
  const direction = echo.direction ?? parsed?.direction ?? 'out';
  return logQuickExpense({
    amount: echo.amount as number,
    type: direction === 'in' ? 'income' : 'expense',
    wallet: parsed?.walletHint ?? undefined,
    note: echo.merchant ?? parsed?.payee ?? undefined,
    category: echo.categoryId,
    date: parsed?.datetime ?? undefined,
    inputMethod: 'share',
    dedupeKey: echoDedupeKey(echo, parsed),
  });
}

// ─── Echo (Gemini) enrichment ────────────────────────────────
const PAYMENT_ENRICH_PROMPT = `You are reading a MOBILE PAYMENT confirmation screenshot from a Malaysian e-wallet or bank app (Touch 'n Go, MAE/Maybank, DuitNow, GrabPay, Boost, ShopeePay, CIMB, etc.). Extract the ONE payment this screen confirms.

IGNORE wallet balance, remaining balance, fees, cashback, and reward points — those are NOT the payment amount.

Return JSON only:
{
  "isPayment": true only if this is a SUCCESSFUL payment/transfer screen (not failed/declined, not a random image),
  "amount": the amount paid or received as a number (strip "RM"), or null,
  "direction": "out" if the user PAID/SENT money, "in" if they RECEIVED money,
  "merchant": the payee — merchant name or person's name — or null,
  "suggestedExpenseCategory": one of food, transport, shopping, entertainment, bills, health, education, family, subscription, other,
  "confidence": 0 to 1
}

Rules:
- amount is a number, not a string. Never invent an amount.
- If it is NOT a successful payment screen, set "isPayment": false and "amount": null.`;

/**
 * Re-read the screenshot with Gemini for a better merchant/category (and, in the
 * low-confidence path, the amount). Never throws — returns null when offline, over
 * quota, or on any error. Metered like every other AI call (canUseAI before,
 * incrementAiCalls after a successful parse — collectzParser convention).
 */
export async function echoEnrichPayment(
  imageUri: string,
  _localParse: ParsedPayment | null,
): Promise<EchoEnrichResult | null> {
  if (!isGeminiAvailable() || !usePremiumStore.getState().canUseAI()) return null;
  try {
    const base64 = await prepareImage(imageUri);
    const data = await callGeminiAPI(
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: PAYMENT_ENRICH_PROMPT },
              { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      20_000, // 20s — image call
      true, // noFallback — vision shares the same quota
      undefined,
      'smart-capture', // allowlisted in ai-proxy
    );
    if (!data) return null;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(stripFences(text));
    } catch {
      return null;
    }
    // Successful model response + parse → count it against the monthly AI quota.
    usePremiumStore.getState().incrementAiCalls();

    const validIds = new Set(
      useCategoryStore.getState().getExpenseCategories('personal').map((c) => c.id),
    );
    const rawCat = obj.suggestedExpenseCategory;
    const categoryId = typeof rawCat === 'string' && validIds.has(rawCat) ? rawCat : undefined;

    const isPayment = obj.isPayment !== false;
    const amountRaw = typeof obj.amount === 'number' ? obj.amount : Number(obj.amount);
    const amount =
      isPayment && Number.isFinite(amountRaw) && amountRaw > 0 && amountRaw <= MAX_AMOUNT
        ? Math.round(amountRaw * 100) / 100
        : undefined;
    const direction = obj.direction === 'in' || obj.direction === 'out' ? obj.direction : undefined;
    const merchant =
      typeof obj.merchant === 'string' && obj.merchant.trim()
        ? obj.merchant.trim().slice(0, 80)
        : undefined;
    const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.8;

    return { merchant, categoryId, amount, direction, confidence };
  } catch {
    return null;
  }
}

// ─── Orchestrator ────────────────────────────────────────────
/**
 * Entry point for a shared payment screenshot. `imageUri` is a local file path
 * (iOS: app-group container path from the share extension; Android: a cache file
 * copied from the share intent). Silent on success beyond the local notification.
 */
export async function logPaymentFromShare(
  imageUri: string | null | undefined,
  opts?: { silent?: boolean; scanReceipts?: boolean },
): Promise<void> {
  // silent: the iOS share extension already fired the "Logged RM…" notification, so the
  // app-group reconcile writes the ledger entry WITHOUT firing a second notification.
  const silent = opts?.silent ?? false;
  // Record every logged payment in the in-app inbox (silent or not); only the OS banner is
  // gated by `silent` (the iOS share extension already showed one for CONFIDENT payments).
  const nLogged = (d: 'out' | 'in', a: number, p: string | null, txId: string) => {
    inboxLogged(d, a, p, txId);
    return silent ? Promise.resolve() : notifyLogged(d, a, p);
  };
  // The uncertain→AI path ALWAYS notifies: the extension showed a neutral "checking…" card
  // (it can't run AI itself), so the app delivers the final answer even in a silent reconcile.
  const nLoggedAI = (d: 'out' | 'in', a: number, p: string | null, txId: string) => {
    inboxLogged(d, a, p, txId);
    return notifyLogged(d, a, p);
  };
  const nCouldnt = (m?: string) => (silent ? Promise.resolve() : notifyCouldntRead(m));
  const nAlready = () => (silent ? Promise.resolve() : notifyAlreadyLogged());

  dbg(`start uri=${imageUri ? String(imageUri).slice(-28) : 'NULL'} silent=${silent}`);
  if (!imageUri) {
    await nCouldnt('No image received from the share.');
    return;
  }
  try {
    const uri = normalizeUri(imageUri);

    let parsed: ParsedPayment | null = null;
    let rows: string[] = [];
    const ocrAvail = isLocalOcrAvailable();
    if (ocrAvail) {
      try {
        rows = await recognizeRows(uri);
        dbg(`ocr ok, ${rows.length} rows`);
        parsed = parsePaymentScreenshot(rows);
      } catch (e) {
        dbg(`ocr THREW: ${String(e).slice(0, 60)}`);
        parsed = null;
      }
    } else {
      dbg('OCR not available in this build');
    }
    dbg(`parsed pay=${parsed?.isPaymentScreen} amt=${parsed?.amount} reason=${parsed?.reason} conf=${parsed?.confidence}`);

    // Explicit failed/declined screen → never log a wrong success.
    if (parsed && parsed.reason === 'failed') {
      await nCouldnt('That looked like a failed payment — nothing logged.');
      return;
    }

    const localAmount = parsed && parsed.isPaymentScreen && parsed.amount != null ? parsed : null;

    // 1) CONFIDENT local payment → log now. The extension already notified, so silent-gated.
    //    Never calls AI — this is the free/offline common path.
    if (localAmount && localAmount.confidence >= CONFIDENT) {
      const result = logFromParsed(localAmount);
      if (!result) {
        await nAlready();
        return;
      }
      await nLogged(localAmount.direction ?? 'out', result.amount, localAmount.payee, result.txId);
      // Tag the shared-dedupe key with this txn so the extension shows "Already logged" on a
      // repeat, and a later delete of this txn frees the key for a fresh re-share.
      void addSharedKey(dedupeKeyFor(localAmount), result.txId);
      return;
    }

    // 1b) RECEIPT — a store receipt (an itemised list + a grand TOTAL + a vendor) is a real
    //     expense, but the payment rules reject it as multi-amount. Detect it locally (free,
    //     offline, NO AI — so it runs BEFORE the paid uncertain→AI path below) and hand off to
    //     the full ReceiptScanner review; the owner wants receipts confirmed, not silent-logged.
    //     Skip in-app screens (debts/bills/paywall → not_payment_screen) — never receipts.
    if (parsed && parsed.reason !== 'not_payment_screen') {
      const receipt = extractReceiptFromRows(rows);
      if (receipt) {
        dbg(`receipt: RM ${receipt.total} · ${receipt.vendor ?? '?'} (${receipt.itemCount} items)`);
        // Receipts are tap-only: a silent reconcile passes scanReceipts:false and must NOT open
        // the scanner (the notification tap does, via openSharedReceiptById). Only the direct /
        // deep-link path (scanReceipts !== false) opens it here.
        if (opts?.scanReceipts !== false) await openReceiptReview(uri);
        return;
      }
    }

    // 2) UNCERTAIN — there's a price on screen but the rules couldn't confirm payment-or-not
    //    (a possibly-complicated payment layout). This is the ONLY paid path: ask Gemini, but
    //    only when online AND within the monthly AI quota. Only the rare hard screens reach
    //    here, so cost stays tiny. Always notifies (the extension showed a neutral "checking…").
    const aiAvailable = isGeminiAvailable() && usePremiumStore.getState().canUseAI();
    if (parsed?.uncertain && aiAvailable) {
      const echo = await echoEnrichPayment(uri, parsed);
      if (echo?.amount && echo.amount > 0) {
        const result = logFromEcho(echo, parsed);
        if (!result) {
          await notifyAlreadyLogged();
          return;
        }
        const dir = echo.direction ?? parsed?.direction ?? 'out';
        await nLoggedAI(dir, result.amount, echo.merchant ?? parsed?.payee ?? null, result.txId);
        void addSharedKey(echoDedupeKey(echo, parsed), result.txId);
        return;
      }
      // AI didn't find a payment either → it really isn't one. Always tell the user.
      await notifyCouldntRead("This isn't a successful payment — nothing logged.");
      return;
    }

    // 3) Low-confidence local amount (a price below the confident bar, AI unavailable/offline)
    //    → log it rather than lose a real payment (still editable). Silent-gated.
    if (localAmount) {
      const result = logFromParsed(localAmount);
      if (!result) {
        await nAlready();
        return;
      }
      await nLogged(localAmount.direction ?? 'out', result.amount, localAmount.payee, result.txId);
      // Tag the shared-dedupe key with this txn so the extension shows "Already logged" on a
      // repeat, and a later delete of this txn frees the key for a fresh re-share.
      void addSharedKey(dedupeKeyFor(localAmount), result.txId);
      return;
    }

    // 4) Confident reject (list / summary / receipt / random image) → nothing logged.
    await nCouldnt();
  } catch {
    await nCouldnt();
  }
}
