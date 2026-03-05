import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { ExtractedReceipt } from '../types';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function imageToBase64(uri: string): Promise<string> {
  return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

async function callGemini(base64: string, retries = 2): Promise<Response> {
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: `You are a receipt parser for a Malaysian user. Analyze this receipt image and extract structured data.

Return JSON only with this exact shape:
{
  "vendor": "store name or null",
  "items": [{ "name": "item name", "amount": 12.50 }],
  "subtotal": 25.00 or null,
  "tax": 1.50 or null,
  "total": 26.50,
  "date": "date string or null"
}

Rules:
- amounts must be numbers, not strings
- items should only be purchased products/food, NOT subtotal/total/tax/discount/change/payment lines
- if you see RM prefix, strip it from amounts
- total is the final amount paid (grand total / amount due / jumlah)
- if no total line found, sum the items
- tax includes SST, GST, service tax, service charge
- date in whatever format is on the receipt
- vendor is the store/restaurant name, usually at the top
- if something is unclear, make your best guess rather than omitting it`,
          },
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
      maxOutputTokens: 1024,
    },
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (response.status === 429 && attempt < retries) {
      // Wait 3s then retry
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    return response;
  }

  // Should never reach here, but satisfy TS
  throw new Error('Rate limited by Gemini. Please wait a moment and try again.');
}

export async function scanReceipt(imageUri: string): Promise<ExtractedReceipt> {
  if (!API_KEY) {
    throw new Error('Receipt scanning is not configured. Please set EXPO_PUBLIC_GEMINI_API_KEY.');
  }

  const base64 = await imageToBase64(imageUri);
  const response = await callGemini(base64);

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited — please wait a few seconds and try again.');
    }
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

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
    };
  } catch {
    throw new Error('Could not parse receipt data. Please try again.');
  }
}
