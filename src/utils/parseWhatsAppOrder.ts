import { SellerProduct, SellerOrderItem } from '../types';

/**
 * Attempts to parse a WhatsApp message into order items.
 * Works locally (no AI) for simple patterns. Falls back to empty if unclear.
 *
 * Handles patterns like:
 *   "semperit kuning 2 tin dan jem tart 1 tin"
 *   "kuih bangkit x3, tart nenas x2"
 *   "nak order 2 tin semperit, 1 balang dodol"
 */
export function parseWhatsAppOrder(
  message: string,
  products: SellerProduct[]
): { items: SellerOrderItem[]; unmatched: string[] } {
  const items: SellerOrderItem[] = [];
  const unmatched: string[] = [];

  if (!message.trim() || products.length === 0) {
    return { items, unmatched: message.trim() ? [message.trim()] : [] };
  }

  const normalized = message
    .toLowerCase()
    .replace(/nak order\s*/gi, '')
    .replace(/\bdan\b/gi, ',')
    .replace(/\bwith\b/gi, ',')
    .replace(/\band\b/gi, ',')
    .replace(/\n/g, ',');

  const segments = normalized.split(',').map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    let matched = false;

    for (const product of products) {
      if (!product.isActive) continue;

      const pName = product.name.toLowerCase();
      if (!segment.includes(pName)) continue;

      // Try to extract quantity from the segment
      const qty = extractQuantity(segment);
      if (qty > 0) {
        // Check if this product already exists in items (merge)
        const existing = items.find((i) => i.productId === product.id);
        if (existing) {
          existing.quantity += qty;
        } else {
          items.push({
            productId: product.id,
            productName: product.name,
            quantity: qty,
            unitPrice: product.pricePerUnit,
            unit: product.unit,
          });
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      unmatched.push(segment);
    }
  }

  return { items, unmatched };
}

// Malay number words
const MALAY_NUMBERS: Record<string, number> = {
  setengah: 0.5, suku: 0.25,
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5,
  enam: 6, tujuh: 7, lapan: 8, sembilan: 9, sepuluh: 10,
};

function extractQuantity(text: string): number {
  // Pattern: Malay number words ("setengah tin", "dua balang")
  for (const [word, value] of Object.entries(MALAY_NUMBERS)) {
    if (text.includes(word)) return value;
  }

  // Pattern: "x3", "x 3", "x0.5"
  const xPattern = text.match(/x\s*(\d+\.?\d*)/i);
  if (xPattern) return parseFloat(xPattern[1]);

  // Pattern: "3 tin", "0.5 bekas", "2.5 balang"
  const unitPattern = text.match(/(\d+\.?\d*)\s*(tin|bekas|balang|pack|piece|pcs|biji|keping|kotak|box)/i);
  if (unitPattern) return parseFloat(unitPattern[1]);

  // Pattern: leading number "2 semperit" or "0.5 semperit"
  const leadingNum = text.match(/^(\d+\.?\d*)\s+/);
  if (leadingNum) return parseFloat(leadingNum[1]);

  // Pattern: trailing number "semperit 2" or "semperit 0.5"
  const trailingNum = text.match(/\s+(\d+\.?\d*)$/);
  if (trailingNum) return parseFloat(trailingNum[1]);

  // No quantity found — default to 1 if any product matched
  return 1;
}
