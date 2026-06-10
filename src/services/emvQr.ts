/**
 * emvQr — EMVCo Merchant-Presented-Mode (MPM) QR utilities for DuitNow.
 *
 * Pure, dependency-free. Used to re-render a seller's *static* DuitNow QR with
 * an exact Transaction Amount (EMVCo tag 54) embedded, so most payer apps
 * pre-fill the amount when the buyer scans.
 *
 * Scope & honesty:
 *  - This does NOT generate a true *dynamic* DuitNow QR (those need an acquirer
 *    to mint a 60-second temporary account number — impossible client-side).
 *  - It takes an existing static QR (plain TLV + CRC, no integrity hash),
 *    inserts/replaces tag 54, and recomputes the CRC. Payer-app behaviour
 *    varies: some pre-fill+lock, some pre-fill+editable, a few ignore tag 54.
 *    The UI must surface that variability — this module just produces a
 *    spec-valid payload.
 *
 * Data-object reference: EMVCo "QR Code Specification for Payment Systems
 * (Merchant-Presented Mode)" + PayNet DuitNow QR data-object spec
 * (docs.developer.paynet.my). Key tags:
 *   00 Payload Format Indicator ("01")        01 Point of Initiation ("11" static / "12" dynamic)
 *   26-51 Merchant Account Information templates
 *   52 Merchant Category Code                 53 Transaction Currency ("458" = MYR, ISO 4217)
 *   54 Transaction Amount                     58 Country Code ("MY")
 *   59 Merchant Name                          60 Merchant City
 *   62 Additional Data Field Template         63 CRC (last object, CRC-16/CCITT-FALSE)
 */

export interface TlvNode {
  /** 2-char numeric tag id, e.g. "54". */
  id: string;
  /** Declared value length (decimal). */
  length: number;
  /** Raw value substring. */
  value: string;
  /** The full `id+len+value` slice — byte-identical to the source. */
  raw: string;
  /** One-level children, parsed for template tags 26–51 and 62. */
  children?: TlvNode[];
}

export interface DuitNowValidation {
  valid: boolean;
  /** Why it failed (only when !valid). */
  reason?:
    | 'format'
    | 'too_short'
    | 'crc_position'
    | 'crc'
    | 'currency'
    | 'country'
    | 'no_merchant';
  /** Merchant name (tag 59), for showing back to the seller on capture. */
  merchantName?: string;
  /** Merchant city (tag 60). */
  city?: string;
}

const TAG_AMOUNT = '54';
const TAG_CRC = '63';
const TAG_CURRENCY = '53';
const TAG_COUNTRY = '58';
const TAG_MERCHANT_NAME = '59';
const TAG_MERCHANT_CITY = '60';
const CRC_PREFIX = '6304'; // tag 63, length 04 — the CRC object is always last.

/**
 * CRC-16/CCITT-FALSE — polynomial 0x1021, init 0xFFFF, no input/output
 * reflection, no final XOR. Returns 4 uppercase hex chars.
 *
 * The authoritative check value for this variant is crc16ccitt("123456789")
 * === "29B1" (see emvQr.test.ts). EMVCo QR payloads are ASCII, so charCodeAt
 * equals the byte value.
 */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= (input.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Parse an EMVCo TLV payload into top-level `[id:2][len:2][value]` records.
 * Template tags 26–51 and 62 are parsed one level deep into `children`.
 * Stops cleanly on a malformed record (non-numeric length / overrun) so a
 * truncated string yields whatever parsed so far rather than throwing.
 */
export function parseTlv(payload: string): TlvNode[] {
  const nodes: TlvNode[] = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len) || Number.isNaN(len) || len < 0) break;
    if (i + 4 + len > payload.length) break;
    const value = payload.slice(i + 4, i + 4 + len);
    const node: TlvNode = { id, length: len, value, raw: payload.slice(i, i + 4 + len) };
    const idNum = parseInt(id, 10);
    if ((idNum >= 26 && idNum <= 51) || idNum === 62) {
      node.children = parseTlv(value);
    }
    nodes.push(node);
    i += 4 + len;
  }
  return nodes;
}

function findTag(nodes: TlvNode[], id: string): TlvNode | undefined {
  return nodes.find((n) => n.id === id);
}

/**
 * Validate that `payload` is a usable static DuitNow QR:
 *  - starts with "000201" (Payload Format Indicator)
 *  - CRC object (63) is last and its value verifies
 *  - currency (53) is "458" (MYR), country (58) is "MY"
 *  - at least one merchant-account template in 26–51
 * Returns the merchant name/city for display on a successful capture.
 */
export function validateDuitNowStatic(payload: string): DuitNowValidation {
  if (typeof payload !== 'string' || !payload.startsWith('000201')) {
    return { valid: false, reason: 'format' };
  }
  if (payload.length < 8) {
    return { valid: false, reason: 'too_short' };
  }

  // CRC must be the final object: locate the last "6304" and require it to end
  // the string (it can appear inside merchant data, so use lastIndexOf).
  const crcIdx = payload.lastIndexOf(CRC_PREFIX);
  if (crcIdx === -1 || crcIdx + 8 !== payload.length) {
    return { valid: false, reason: 'crc_position' };
  }
  const provided = payload.slice(crcIdx + 4);
  const expected = crc16ccitt(payload.slice(0, crcIdx + 4));
  if (provided.toUpperCase() !== expected) {
    return { valid: false, reason: 'crc' };
  }

  const nodes = parseTlv(payload);
  const currency = findTag(nodes, TAG_CURRENCY);
  if (!currency || currency.value !== '458') {
    return { valid: false, reason: 'currency' };
  }
  const country = findTag(nodes, TAG_COUNTRY);
  if (!country || country.value.toUpperCase() !== 'MY') {
    return { valid: false, reason: 'country' };
  }
  const hasMerchant = nodes.some((n) => {
    const idn = parseInt(n.id, 10);
    return idn >= 26 && idn <= 51 && n.value.length > 0;
  });
  if (!hasMerchant) {
    return { valid: false, reason: 'no_merchant' };
  }

  return {
    valid: true,
    merchantName: findTag(nodes, TAG_MERCHANT_NAME)?.value?.trim() || undefined,
    city: findTag(nodes, TAG_MERCHANT_CITY)?.value?.trim() || undefined,
  };
}

/**
 * Produce a new payload with the Transaction Amount (tag 54) set to
 * `amountCents`, formatted as RM with two decimals (e.g. 1250 → "12.50"). Any
 * existing tag 54 is removed; every other tag — including Point of Initiation
 * (tag 01) — is kept byte-identical. The old CRC is stripped and recomputed
 * over the new body including the trailing "6304".
 *
 * Tag 54 is inserted in its canonical position, immediately after the currency
 * tag (53). Throws on a negative/non-finite amount or one too large for the
 * 13-char tag-54 ceiling.
 */
export function embedAmount(payload: string, amountCents: number): string {
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw new Error('embedAmount: amountCents must be a non-negative finite number');
  }
  const amountStr = (amountCents / 100).toFixed(2);
  if (amountStr.length > 13) {
    throw new Error('embedAmount: amount exceeds EMVCo tag-54 length limit');
  }
  const amtRecord = TAG_AMOUNT + String(amountStr.length).padStart(2, '0') + amountStr;

  const nodes = parseTlv(payload);
  const kept = nodes.filter((n) => n.id !== TAG_CRC && n.id !== TAG_AMOUNT);

  let body = '';
  let inserted = false;
  for (const n of kept) {
    body += n.raw;
    if (n.id === TAG_CURRENCY && !inserted) {
      body += amtRecord;
      inserted = true;
    }
  }
  // Fallback: no currency tag present (not a valid DuitNow QR, but stay robust)
  // — append the amount just before the CRC.
  if (!inserted) {
    body += amtRecord;
  }

  const toCrc = body + CRC_PREFIX;
  return toCrc + crc16ccitt(toCrc);
}
