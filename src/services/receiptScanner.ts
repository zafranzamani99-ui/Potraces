import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { RECEIPT_SCANNER_CONFIG } from '../constants';
import { ExtractedReceipt, ReceiptItem } from '../types';

async function imageToBase64(uri: string): Promise<string> {
  const base64 = await readAsStringAsync(uri, {
    encoding: EncodingType.Base64,
  });
  return base64;
}

async function performOCR(base64Image: string): Promise<string> {
  // Validate API key before making request
  if (!RECEIPT_SCANNER_CONFIG.apiKey || RECEIPT_SCANNER_CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
    throw new Error('Receipt scanning is not configured. Please set up the Google Vision API key in your environment settings.');
  }

  const body = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      },
    ],
  };

  const response = await fetch(
    `${RECEIPT_SCANNER_CONFIG.apiUrl}?key=${RECEIPT_SCANNER_CONFIG.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const annotations = data.responses?.[0]?.textAnnotations;

  if (!annotations || annotations.length === 0) {
    throw new Error('No text found in the image. Please try a clearer photo.');
  }

  return annotations[0].description || '';
}

function parseReceiptText(rawText: string): ExtractedReceipt {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  // Vendor: first non-numeric line in top 5 lines
  let vendor: string | undefined;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (!/^\d+$/.test(line) && !/^\d{1,2}[\/\-]/.test(line) && line.length > 2) {
      vendor = line;
      break;
    }
  }

  // Date: regex for common formats
  let date: string | undefined;
  const datePatterns = [
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
    /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4})/i,
  ];
  for (const line of lines) {
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        date = match[1];
        break;
      }
    }
    if (date) break;
  }

  // Parse items and totals
  const items: ReceiptItem[] = [];
  let total = 0;
  let subtotal: number | undefined;
  let tax: number | undefined;

  const skipKeywords = /\b(subtotal|sub\s*total|total|tax|gst|sst|service|charge|cash|change|visa|master|card|payment|balance|tendered|rounding|discount)\b/i;
  const totalKeyword = /\b(total|grand\s*total|amount\s*due|jumlah)\b/i;
  const subtotalKeyword = /\b(subtotal|sub\s*total)\b/i;
  const taxKeyword = /\b(tax|gst|sst|service\s*(?:tax|charge))\b/i;

  // Amount pattern: matches RM 12.50, 12.50, RM12.50
  const amountPattern = /(?:RM\s*)?(\d+\.\d{2})\s*$/;

  for (const line of lines) {
    const amountMatch = line.match(amountPattern);
    if (!amountMatch) continue;

    const amount = parseFloat(amountMatch[1]);

    if (totalKeyword.test(line) && !subtotalKeyword.test(line)) {
      if (amount > total) total = amount;
    } else if (subtotalKeyword.test(line)) {
      subtotal = amount;
    } else if (taxKeyword.test(line)) {
      tax = amount;
    } else if (!skipKeywords.test(line) && amount > 0) {
      const name = line.replace(amountPattern, '').replace(/^RM\s*/i, '').trim();
      if (name.length > 0) {
        items.push({ name, amount });
      }
    }
  }

  // Fallback: if no total found, sum items
  if (total === 0 && items.length > 0) {
    total = items.reduce((sum, item) => sum + item.amount, 0);
  }

  return {
    vendor,
    items,
    subtotal,
    tax,
    total,
    date,
    rawText,
  };
}

export async function scanReceipt(imageUri: string): Promise<ExtractedReceipt> {
  const base64 = await imageToBase64(imageUri);
  const rawText = await performOCR(base64);
  return parseReceiptText(rawText);
}
