import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { callGeminiAPI, isGeminiAvailable, getCooldownSecondsLeft } from './geminiClient';
import { ExtractedReceipt } from '../types';

/**
 * Resize + compress the image so Gemini processes it faster and more accurately.
 * Uses base64 output directly from manipulator to avoid file-system URI issues.
 * Falls back to raw image if manipulation fails.
 */
async function prepareImage(uri: string): Promise<string> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.9, format: SaveFormat.JPEG, base64: true }
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

export async function scanReceipt(imageUri: string): Promise<ExtractedReceipt> {
  if (!isGeminiAvailable()) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) {
      throw new Error(`AI is cooling down — try again in ${secs}s`);
    }
    throw new Error('AI is not available. Check your API key.');
  }

  const base64 = await prepareImage(imageUri);

  const data = await callGeminiAPI(
    {
      contents: [
        {
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
    const parsed = JSON.parse(stripJsonFences(text));

    return {
      vendor: parsed.vendor || undefined,
      items: Array.isArray(parsed.items)
        ? parsed.items
            .filter((i: any) => i.name && typeof i.amount === 'number' && i.amount > 0)
            .map((i: any) => ({ name: String(i.name), amount: Number(i.amount) }))
        : [],
      subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : undefined,
      tax: typeof parsed.tax === 'number' ? parsed.tax : undefined,
      total: Number(parsed.total) || 0,
      date: parsed.date || undefined,
      rawText: text,
      location: parsed.location || undefined,
      paymentMethod: parsed.paymentMethod || undefined,
      suggestedExpenseCategory: parsed.suggestedExpenseCategory || undefined,
      suggestedTaxCategory: parsed.suggestedTaxCategory || undefined,
    };
  } catch {
    throw new Error('Could not parse receipt data. Please try again.');
  }
}
