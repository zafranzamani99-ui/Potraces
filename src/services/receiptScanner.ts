import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { callGeminiAPI, streamGeminiText, isGeminiAvailable, getCooldownSecondsLeft } from './geminiClient';
import { enqueueReceipt } from './receiptQueue';
import { extractCompleteItems } from '../utils/streamingJson';
import { ExtractedReceipt, SellerReceiptResult } from '../types';

/**
 * Resize + compress the image so Gemini processes it faster and more accurately.
 *
 * Image size is a SPEED vs ACCURACY dial and it cannot win both on a single
 * image-based call: smaller = faster encoding but loses the small text that
 * dense/long receipts depend on. 1080px is the balanced interim — legible on
 * most thermal receipts without being huge. The real fix for long/complex
 * receipts is the on-device-OCR-first hybrid (read text locally at full res,
 * send only TEXT to the model), which removes this tradeoff entirely.
 *
 * Width-only resize keeps aspect ratio and avoids upscaling already-cropped
 * scans from the document scanner. Uses base64 output directly from the
 * manipulator to avoid file-system URI issues; falls back to raw on failure.
 */
async function prepareImage(uri: string): Promise<string> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.8, format: SaveFormat.JPEG, base64: true }
    );
    if (result.base64) {
      return result.base64;
    }
    // base64 option didn't return data — read from file
    return readAsStringAsync(result.uri, { encoding: EncodingType.Base64 });
  } catch {
    // Image prep failed — fall back to original
    return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  }
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

const RECEIPT_PROMPT = `You are a receipt parser for Malaysian receipts. Extract ALL purchased items accurately.

Focus ONLY on the receipt paper — ignore background objects (table, hands, wallet).

CRITICAL — Malaysian thermal receipt layout:
- Items often span TWO lines: product name on line 1, then qty / unit price / total on line 2
- Example layout:
  NASI LEMAK AYAM (A/P)
               1    9.00    8.49
  This is ONE item: "NASI LEMAK AYAM (A/P)" with amount 8.49
- The RIGHTMOST number column is the line total — always use that, NOT the unit price
- Count every single item row. If the receipt says "Total Items = 16", you must return exactly 16 items
- Do NOT skip any items, even if names look similar (e.g. two separate "AIS KOSONG CUP" are two items)

Return JSON only:
{
  "vendor": "store name or null",
  "items": [{ "name": "item name", "amount": 8.49 }],
  "subtotal": 61.41 or null,
  "tax": 3.69 or null,
  "total": 65.10,
  "date": "date string or null",
  "location": "store address/branch or null",
  "paymentMethod": "one of: cash, debit_card, credit_card, tng, grabpay, boost, shopee_pay, mae, bigpay, duitnow_qr, fpx, other — or null",
  "suggestedExpenseCategory": "one of: food, transport, shopping, entertainment, bills, health, education, family, subscription, other",
  "suggestedTaxCategory": "one of: none, lifestyle, sports, medical, parents_medical, education, childcare, breastfeeding, ev_charging, sspn, insurance_epf, education_insurance, prs, domestic_travel, housing_loan"
}

Rules:
- amounts must be numbers, not strings
- items = only purchased products/food — NOT subtotal/total/tax/discount/change/rounding/payment lines
- strip RM prefix from amounts
- "amount" = the RIGHTMOST number on each item's line (line total after discount), NOT unit price
- "total" = final amount paid (grand total / total incl SST / jumlah / amount due)
- "tax" = SST, GST, service tax, or service charge amount
- if no total line, sum the items + tax
- vendor = store/restaurant name, usually at the top of receipt
- date in whatever format shown on receipt
- if unclear, guess rather than omit
- if truly unreadable, return {"vendor": null, "items": [], "total": 0}

Tax category hints:
- Books, phones, tablets, computers, internet bills → lifestyle
- Gym membership, sports gear, fitness → sports
- Clinic, hospital, dental, pharmacy, glasses, lenses → medical
- Course fees, tuition, online learning → education
- Hotel/resort/Airbnb in Malaysia → domestic_travel
- Nursery, kindergarten, daycare → childcare
- If uncertain → none

Payment method hints:
- Look for "VISA", "MASTERCARD", "DEBIT" → debit_card or credit_card
- "Touch 'n Go", "TNG" → tng
- "GrabPay" → grabpay
- "Boost" → boost
- "ShopeePay" → shopee_pay
- "TUNAI", "CASH" → cash
- "DuitNow" → duitnow_qr
- If not visible → null`;

const VALID_PAYMENT_METHODS = new Set([
  'cash', 'debit_card', 'credit_card', 'tng', 'grabpay', 'boost',
  'shopee_pay', 'mae', 'bigpay', 'duitnow_qr', 'fpx', 'other',
]);

const VALID_EXPENSE_CATEGORIES = new Set([
  'food', 'transport', 'shopping', 'entertainment', 'bills',
  'health', 'education', 'family', 'subscription', 'other',
]);

const MAX_RECEIPT_AMOUNT = 1_000_000;

let _scanningReceipt = false;
let _scanningSellerReceipt = false;

export async function scanReceipt(imageUri: string): Promise<ExtractedReceipt> {
  if (_scanningReceipt) {
    throw new Error('A receipt scan is already in progress.');
  }
  _scanningReceipt = true;
  try {
    return await _doScanReceipt(imageUri);
  } finally {
    _scanningReceipt = false;
  }
}

async function _doScanReceipt(imageUri: string, preparedBase64?: string): Promise<ExtractedReceipt> {
  if (!isGeminiAvailable()) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) {
      throw new Error(`AI is cooling down — try again in ${secs}s`);
    }
    throw new Error('AI is not available. Check your API key.');
  }

  // Reuse an already-prepared image when the streaming path falls back to us,
  // so we don't pay the resize/compress cost twice.
  const base64 = preparedBase64 ?? await prepareImage(imageUri);

  const data = await callGeminiAPI(
    {
      contents: [
        {
          role: 'user',
          parts: [
            { text: RECEIPT_PROMPT },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384,
        // JSON mode: Gemini emits clean parseable JSON (no markdown fences /
        // prose), which trims output tokens and removes a class of parse
        // failures. stripJsonFences() below stays as a defensive fallback.
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    30_000, // 30s timeout — images take longer
    true    // noFallback — vision shares same quota, fallback just wastes a call
  );

  if (!data) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) {
      throw new Error(`AI is busy — try again in ${secs}s`);
    }
    throw new Error('Could not reach AI. Please try again.');
  }

  // Debug: log raw response structure to diagnose empty results
  const candidate = data?.candidates?.[0];
  if (data?.promptFeedback?.blockReason) {
    throw new Error('AI could not process this image. Try a different photo.');
  }

  const text = candidate?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from AI. Please try a clearer photo.');
  }

  try {
    return parseReceiptJson(text);
  } catch {
    throw new Error('Could not parse receipt data. Please try again.');
  }
}

/**
 * Shared parse of the model's JSON receipt response into an ExtractedReceipt.
 * Used by both the non-streaming and streaming scan paths.
 */
function parseReceiptJson(text: string): ExtractedReceipt {
  const parsed = JSON.parse(stripJsonFences(text));

  let total = Number(parsed.total) || 0;
  if (total > MAX_RECEIPT_AMOUNT) total = 0;

  const paymentMethod = typeof parsed.paymentMethod === 'string' && VALID_PAYMENT_METHODS.has(parsed.paymentMethod)
    ? parsed.paymentMethod
    : undefined;

  const suggestedExpenseCategory = typeof parsed.suggestedExpenseCategory === 'string' && VALID_EXPENSE_CATEGORIES.has(parsed.suggestedExpenseCategory)
    ? parsed.suggestedExpenseCategory
    : undefined;

  return {
    vendor: parsed.vendor || undefined,
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((i: any) => i.name && typeof i.amount === 'number' && i.amount > 0 && i.amount <= MAX_RECEIPT_AMOUNT)
          .map((i: any) => ({ name: String(i.name), amount: Number(i.amount) }))
      : [],
    subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : undefined,
    tax: typeof parsed.tax === 'number' ? parsed.tax : undefined,
    total,
    date: parsed.date || undefined,
    rawText: text,
    location: parsed.location || undefined,
    paymentMethod,
    suggestedExpenseCategory,
    suggestedTaxCategory: parsed.suggestedTaxCategory || undefined,
  };
}

/** Callbacks for progressive receipt streaming. */
export interface ReceiptStreamHandlers {
  /** Fires once, the moment the first complete item is parsed from the stream. */
  onFirstItem?: () => void;
  /** Fires whenever the set of complete items grows (cumulative list). */
  onItems?: (items: { name: string; amount: number }[]) => void;
}

/**
 * Streaming variant of scanReceipt: items surface progressively as Gemini
 * generates them, so the UI can drop its blocking spinner on the first item
 * instead of waiting for the whole JSON. Resolves with the final, authoritative
 * ExtractedReceipt (vendor/total/tax + cleaned items). Falls back to the
 * non-streaming path if streaming is unavailable or errors mid-flight.
 */
export async function scanReceiptStream(
  imageUri: string,
  handlers: ReceiptStreamHandlers = {},
): Promise<ExtractedReceipt> {
  if (_scanningReceipt) {
    throw new Error('A receipt scan is already in progress.');
  }
  _scanningReceipt = true;
  try {
    return await _doScanReceiptStream(imageUri, handlers);
  } finally {
    _scanningReceipt = false;
  }
}

async function _doScanReceiptStream(
  imageUri: string,
  handlers: ReceiptStreamHandlers,
): Promise<ExtractedReceipt> {
  if (!isGeminiAvailable()) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) throw new Error(`AI is cooling down — try again in ${secs}s`);
    throw new Error('AI is not available. Check your API key.');
  }

  const base64 = await prepareImage(imageUri);

  try {
    let finalText = '';
    let emitted = 0;
    for await (const textSoFar of streamGeminiText(
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: RECEIPT_PROMPT },
              { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      30_000,
    )) {
      finalText = textSoFar;
      const items = extractCompleteItems(textSoFar);
      if (items.length > emitted) {
        if (emitted === 0) handlers.onFirstItem?.();
        emitted = items.length;
        handlers.onItems?.(items);
      }
    }
    // Stream finished — parse the complete JSON for authoritative totals/tax/etc.
    return parseReceiptJson(finalText);
  } catch (streamErr) {
    // Streaming unsupported on this platform, or it failed mid-flight — fall
    // back to the proven non-streaming scan so the user still gets a result.
    if (__DEV__) console.warn('[receiptScanner] stream failed, falling back to blocking scan:', streamErr);
    return _doScanReceipt(imageUri, base64);
  }
}

const SELLER_RECEIPT_PROMPT = `You are a parser for Malaysian small-business COST documents. The image is one of:
- a supplier / wholesale invoice (itemized, e.g. NSK, Bataras, Mr DIY, fabric/craft shops)
- a non-itemized bill (utility like TNB/Air/Unifi, rent receipt, platform fee/commission statement like Shopee/Grab/Lazada)

Focus ONLY on the document — ignore background objects (table, hands).

Return JSON only:
{
  "vendor": "supplier / biller / store name, or null",
  "items": [{ "name": "item name", "amount": 8.49 }],
  "total": 65.10,
  "date": "date string or null",
  "invoiceNumber": "invoice / bill / reference number or null",
  "suggestedCategory": "one of: costcat_materials, costcat_packaging, costcat_equipment, costcat_utilities, costcat_rent, costcat_transport, costcat_marketing, costcat_fees, costcat_labor, costcat_other"
}

Rules:
- amounts must be numbers, not strings; strip RM prefix
- "amount" per item = the RIGHTMOST number on its line (line total), NOT unit price
- "total" = final amount due / grand total / jumlah / amount payable
- For a NON-itemized bill, return "items": [] and put the charge in "total"
- vendor = the company/shop/biller name, usually at the top
- if no total line, sum the items
- if truly unreadable, return {"vendor": null, "items": [], "total": 0}

Category hints (map to the BEST fit):
- flour, sugar, fabric, thread, beads, wood, raw stock, COGS → costcat_materials
- boxes, bags, labels, wrapping, containers → costcat_packaging
- mixer, oven, sewing machine, laptop, tools, furniture → costcat_equipment
- TNB / electricity, Air / water, Unifi / internet, phone bill → costcat_utilities
- stall rent, kitchen rent, studio, shoplot lease → costcat_rent
- petrol, delivery, courier, Grab/Lalamove ride → costcat_transport
- ads, flyers, banner, boosted posts, printing promo → costcat_marketing
- platform commission, Shopee/Grab/Lazada fee, bank charge, software subscription → costcat_fees
- hired help, part-time wages, assistant pay → costcat_labor
- anything unclear → costcat_other`;

const VALID_COST_CATEGORY_IDS = new Set([
  'costcat_materials', 'costcat_packaging', 'costcat_equipment', 'costcat_utilities',
  'costcat_rent', 'costcat_transport', 'costcat_marketing', 'costcat_fees',
  'costcat_labor', 'costcat_other',
]);

export async function scanSellerReceipt(imageUri: string): Promise<SellerReceiptResult> {
  if (_scanningSellerReceipt) {
    throw new Error('A receipt scan is already in progress.');
  }
  _scanningSellerReceipt = true;
  try {
    return await _doScanSellerReceipt(imageUri);
  } catch (err: any) {
    const msg = err?.message ?? '';
    const isNetworkOrAI = msg.includes('Could not reach AI') || msg.includes('AI is busy') || msg.includes('AI is cooling down') || msg.includes('network');
    if (isNetworkOrAI) {
      await enqueueReceipt(imageUri);
      throw new Error('Scan queued — will retry when online.');
    }
    throw err;
  } finally {
    _scanningSellerReceipt = false;
  }
}

async function _doScanSellerReceipt(imageUri: string): Promise<SellerReceiptResult> {
  if (!isGeminiAvailable()) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) throw new Error(`AI is cooling down — try again in ${secs}s`);
    throw new Error('AI is not available. Check your API key.');
  }

  const base64 = await prepareImage(imageUri);

  const data = await callGeminiAPI(
    {
      contents: [
        {
          role: 'user',
          parts: [
            { text: SELLER_RECEIPT_PROMPT },
            { inlineData: { mimeType: 'image/jpeg', data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384,
        // JSON mode: Gemini emits clean parseable JSON (no markdown fences /
        // prose), which trims output tokens and removes a class of parse
        // failures. stripJsonFences() below stays as a defensive fallback.
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    30_000,
    true
  );

  if (!data) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) throw new Error(`AI is busy — try again in ${secs}s`);
    throw new Error('Could not reach AI. Please try again.');
  }

  const candidate = data?.candidates?.[0];
  if (data?.promptFeedback?.blockReason) {
    throw new Error('AI could not process this image. Try a different photo.');
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from AI. Please try a clearer photo.');

  try {
    const parsed = JSON.parse(stripJsonFences(text));
    const suggested = typeof parsed.suggestedCategory === 'string' && VALID_COST_CATEGORY_IDS.has(parsed.suggestedCategory)
      ? parsed.suggestedCategory
      : undefined;

    let sellerTotal = Number(parsed.total) || 0;
    if (sellerTotal > MAX_RECEIPT_AMOUNT) sellerTotal = 0;

    return {
      vendor: parsed.vendor || undefined,
      items: Array.isArray(parsed.items)
        ? parsed.items
            .filter((i: any) => i.name && typeof i.amount === 'number' && i.amount > 0 && i.amount <= MAX_RECEIPT_AMOUNT)
            .map((i: any) => ({ name: String(i.name), amount: Number(i.amount) }))
        : [],
      total: sellerTotal,
      date: parsed.date || undefined,
      invoiceNumber: parsed.invoiceNumber || undefined,
      suggestedCategory: suggested,
      rawText: text,
    };
  } catch {
    throw new Error('Could not parse receipt data. Please try again.');
  }
}
