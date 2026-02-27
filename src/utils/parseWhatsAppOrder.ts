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

function extractQuantity(text: string): number {
  // Pattern: "x3", "x 3"
  const xPattern = text.match(/x\s*(\d+)/i);
  if (xPattern) return parseInt(xPattern[1], 10);

  // Pattern: "3 tin", "2 bekas", "1 balang", "5 pack"
  const unitPattern = text.match(/(\d+)\s*(tin|bekas|balang|pack|piece|pcs|biji|keping|kotak|box)/i);
  if (unitPattern) return parseInt(unitPattern[1], 10);

  // Pattern: leading number "2 semperit"
  const leadingNum = text.match(/^(\d+)\s+/);
  if (leadingNum) return parseInt(leadingNum[1], 10);

  // Pattern: trailing number "semperit 2"
  const trailingNum = text.match(/\s+(\d+)$/);
  if (trailingNum) return parseInt(trailingNum[1], 10);

  // No quantity found — default to 1 if any product matched
  return 1;
}
