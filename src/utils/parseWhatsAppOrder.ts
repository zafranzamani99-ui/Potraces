import { SellerProduct, SellerOrderItem } from '../types';

// ── Section Detection ──────────────────────────────────────────
export interface WhatsAppSection {
  title: string;
  content: string;
  itemCount: number;
}

const SUMMARY_KEYWORDS = /^(simplify|simplified|total|jumlah|ringkasan|summary|keseluruhan)/i;

const NOISE_PATTERNS = [
  /^(cg|cik|en|pn|dr|ustaz|ustazah)\s/i,   // Honorific + name
  /^(pre\s*order|bawak|nota|note)\b/i,       // Notes/instructions
  /^\*.*\*$/,                                  // *bold* headers
];

function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(t)) return true;
  }
  if (SUMMARY_KEYWORDS.test(t)) return true;
  // Name with parenthetical, no digits: "Ain (kwn nurul)"
  if (/^[a-z\s]+\(.*\)\s*$/i.test(t) && !/\d/.test(t)) return true;
  // No digits at all — likely a name or header, not an item
  if (!/\d/.test(t)) return true;
  return false;
}

function countItemLines(text: string): number {
  return text.split('\n').filter((line) => !isNoiseLine(line)).length;
}

function pushSections(
  out: WhatsAppSection[],
  title: string,
  lines: string[]
): void {
  // Check for a summary sub-section (e.g. "Simplify order2 cg MCKk")
  const summaryIdx = lines.findIndex((l) => SUMMARY_KEYWORDS.test(l.trim()));

  if (summaryIdx >= 0 && summaryIdx < lines.length - 1) {
    const beforeLines = lines.slice(0, summaryIdx);
    const afterLines = lines.slice(summaryIdx + 1);
    const beforeContent = beforeLines.join('\n').trim();
    const afterContent = afterLines.join('\n').trim();
    const beforeCount = countItemLines(beforeContent);
    const afterCount = countItemLines(afterContent);

    if (beforeCount > 0) {
      out.push({
        title: title ? `${title} — detailed` : 'Detailed',
        content: beforeContent,
        itemCount: beforeCount,
      });
    }
    if (afterCount > 0) {
      out.push({
        title: title ? `${title} — summary` : 'Summary',
        content: afterContent,
        itemCount: afterCount,
      });
    }
  } else {
    const content = lines.join('\n').trim();
    const itemCount = countItemLines(content);
    out.push({
      title: title || 'Order',
      content,
      itemCount,
    });
  }
}

/**
 * Detect sections in a WhatsApp message.
 * Splits by *bold* headers (WhatsApp formatting).
 * Within each section, detects summary sub-sections.
 * Returns only sections that contain item-like lines.
 */
export function detectWhatsAppSections(message: string): WhatsAppSection[] {
  const lines = message.split('\n');
  const sections: WhatsAppSection[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.trim().match(/^\*(.+?)\*(.*)$/);
    if (headerMatch) {
      if (currentLines.some((l) => l.trim())) {
        pushSections(sections, currentTitle, currentLines);
      }
      currentTitle = headerMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.some((l) => l.trim())) {
    pushSections(sections, currentTitle, currentLines);
  }

  return sections.filter((s) => s.itemCount > 0);
}

// ── Order Parsing ──────────────────────────────────────────────

/**
 * Attempts to parse a WhatsApp message into order items.
 * Works locally (no AI) for simple patterns. Falls back to empty if unclear.
 *
 * Handles patterns like:
 *   "semperit kuning 2 tin dan jem tart 1 tin"
 *   "kuih bangkit x3, tart nenas x2"
 *   "nak order 2 tin semperit, 1 balang dodol"
 *   "- Semperit Coklat 4" (bullet lists)
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

  const segments = normalized
    .split(',')
    .map((s) => s.trim().replace(/^-\s*/, '')) // strip bullet prefix
    .filter(Boolean);

  for (const segment of segments) {
    // Skip noise segments (headers, names, notes)
    if (isNoiseLine(segment)) continue;

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

  // Filter noise from unmatched (names, headers that slipped through)
  const cleanUnmatched = unmatched.filter((u) => !isNoiseLine(u));

  return { items, unmatched: cleanUnmatched };
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
