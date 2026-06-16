/**
 * pii — minimal PII scrubbing for text that leaves the device (e.g. receipt OCR
 * sent to an LLM, or persisted). Conservative by design: only masks digit runs
 * that are 13–19 digits AND pass the Luhn checksum, so phone numbers (10–11),
 * IC numbers (12), and invoice numbers don't get clobbered.
 */

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Replace anything that looks like a payment-card PAN with a masked placeholder. */
export function scrubCardNumbers(text: string): string {
  if (!text) return text;
  return text.replace(/\d[\d -]{11,21}\d/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
    return `[card ****${digits.slice(-4)}]`;
  });
}

/**
 * Cheap, conservative scrub of Malaysian IC numbers (NRIC, 12 digits, usually
 * dashed YYMMDD-PB-###G) — they're sensitive and never needed by the model.
 * Run AFTER scrubCardNumbers so a Luhn-valid card isn't misread as an IC.
 */
export function scrubIcNumbers(text: string): string {
  if (!text) return text;
  // Dashed IC: 6-2-4 digits.
  let out = text.replace(/\b\d{6}-\d{2}-\d{4}\b/g, '[ic]');
  // Bare 12-digit run that isn't already masked.
  out = out.replace(/\b\d{12}\b/g, '[ic]');
  return out;
}

/** Apply all PII scrubs to free text that's about to leave the device (e.g. sent
 * to the LLM). Card numbers first (Luhn), then IC numbers. */
export function scrubPii(text: string): string {
  if (!text) return text;
  return scrubIcNumbers(scrubCardNumbers(text));
}
