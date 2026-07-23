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
import * as Notifications from 'expo-notifications';
import { parsePaymentScreenshot, type ParsedPayment } from './paymentScreenshotParser';
import { recognizeRows, isLocalOcrAvailable } from './localReceiptOcr';
import { logQuickExpense, type QuickLogResult } from './quickLog';
import { prepareImage } from './receiptScanner';
import { callGeminiAPI, isGeminiAvailable } from './geminiClient';
import { ANDROID_CHANNELS } from './pushNotifications';
import { usePremiumStore } from '../store/premiumStore';
import { useCategoryStore } from '../store/categoryStore';
import { usePersonalStore } from '../store/personalStore';
import { dedupeKeyFor } from '../utils/paymentDedupeKey';

export { dedupeKeyFor };

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

function notifyLogged(direction: 'out' | 'in', amount: number, payee: string | null): Promise<void> {
  const verb = direction === 'in' ? 'received' : 'paid';
  const tail = payee ? ` · ${payee}` : '';
  return fireNotification('Logged to Potraces', `RM ${amount.toFixed(2)} ${verb}${tail}`, {
    type: 'share_logged',
  });
}

function notifyCouldntRead(message?: string): Promise<void> {
  return fireNotification("Couldn't read that one", message ?? 'Tap to add it manually.', {
    type: 'share_failed',
  });
}

function notifyAlreadyLogged(): Promise<void> {
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

/** Fire-and-forget: patch category/merchant on an already-logged row. NEVER amount. */
async function enrichAfterLog(
  imageUri: string,
  parsed: ParsedPayment,
  txId: string,
): Promise<void> {
  try {
    const echo = await echoEnrichPayment(imageUri, parsed);
    if (!echo) return;
    const patch: { category?: string; description?: string } = {};
    if (echo.categoryId) patch.category = echo.categoryId;
    if (echo.merchant) patch.description = echo.merchant;
    // Only category/description — amount/type/walletId untouched, so no wallet re-delta.
    if (Object.keys(patch).length > 0) {
      usePersonalStore.getState().updateTransaction(txId, patch);
    }
  } catch {
    // best-effort enrichment
  }
}

// ─── Orchestrator ────────────────────────────────────────────
/**
 * Entry point for a shared payment screenshot. `imageUri` is a local file path
 * (iOS: app-group container path from the share extension; Android: a cache file
 * copied from the share intent). Silent on success beyond the local notification.
 */
export async function logPaymentFromShare(imageUri: string | null | undefined): Promise<void> {
  if (!imageUri) {
    await notifyCouldntRead();
    return;
  }
  try {
    const uri = normalizeUri(imageUri);

    let parsed: ParsedPayment | null = null;
    if (isLocalOcrAvailable()) {
      try {
        parsed = parsePaymentScreenshot(await recognizeRows(uri));
      } catch {
        parsed = null;
      }
    }

    // Explicit failed/declined screen → never log a wrong success.
    if (parsed && parsed.reason === 'failed') {
      await notifyCouldntRead('That looked like a failed payment — nothing logged.');
      return;
    }

    const localAmount = parsed && parsed.isPaymentScreen && parsed.amount != null ? parsed : null;
    const echoUsable = isGeminiAvailable() && usePremiumStore.getState().canUseAI();

    // Strategy A — confident local amount (or Echo unavailable): log immediately,
    // then enrich category/merchant in the background.
    if (localAmount && (localAmount.confidence >= CONFIDENT || !echoUsable)) {
      const result = logFromParsed(localAmount);
      if (!result) {
        await notifyAlreadyLogged();
        return;
      }
      await notifyLogged(localAmount.direction ?? 'out', result.amount, localAmount.payee);
      void enrichAfterLog(uri, localAmount, result.txId);
      return;
    }

    // Strategy B — low/no local amount + Echo available: let Echo supply the amount
    // BEFORE logging (so there is exactly one wallet delta).
    if (echoUsable) {
      const echo = await echoEnrichPayment(uri, parsed);
      if (echo?.amount && echo.amount > 0) {
        const result = logFromEcho(echo, parsed);
        if (!result) {
          await notifyAlreadyLogged();
          return;
        }
        const dir = echo.direction ?? parsed?.direction ?? 'out';
        await notifyLogged(dir, result.amount, echo.merchant ?? parsed?.payee ?? null);
        return;
      }
    }

    // Fallback — Echo couldn't help but we DO have a (low-confidence) local amount:
    // log it rather than lose a real payment (still undoable + editable).
    if (localAmount) {
      const result = logFromParsed(localAmount);
      if (!result) {
        await notifyAlreadyLogged();
        return;
      }
      await notifyLogged(localAmount.direction ?? 'out', result.amount, localAmount.payee);
      return;
    }

    await notifyCouldntRead();
  } catch {
    await notifyCouldntRead();
  }
}
