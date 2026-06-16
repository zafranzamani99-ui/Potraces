/**
 * Streaming JSON helpers.
 *
 * During a streaming LLM call we receive a GROWING string that is gradually
 * becoming a complete JSON object (a parsed receipt) of roughly this shape:
 *
 *   {
 *     "vendor": "...",
 *     "items": [
 *       { "name": "NASI LEMAK", "amount": 8.49 },
 *       { "name": "TEH", "amount": 2.00 }
 *     ],
 *     "subtotal": 61.41,
 *     "tax": 3.69,
 *     "total": 65.10,
 *     "date": "..."
 *   }
 *
 * The string can be cut off ANYWHERE — mid-string, mid-number, mid-object, or
 * partway through the items array. This module pulls out the line items that
 * are ALREADY fully complete so the UI can render them as they stream in.
 */

/** A single fully-parsed receipt line item. */
type CompleteItem = { name: string; amount: number };

/**
 * Extract the line items that are already fully complete from a partial
 * (possibly truncated) JSON string produced by a streaming LLM response.
 *
 * It finds the `"items"` array, then walks it character by character while
 * tracking string/escape/brace state. Each top-level object inside the array
 * whose matching `}` has been seen is parsed; a trailing object that has not
 * closed yet is ignored. Malformed objects are skipped.
 *
 * This function is pure and never throws — on any problem it simply returns
 * whatever complete items it managed to parse so far (possibly an empty array).
 *
 * @param partial The growing JSON string so far. Need not be valid/complete.
 * @returns The complete items found, in order: `{ name, amount }`.
 */
export function extractCompleteItems(partial: string): CompleteItem[] {
  const results: CompleteItem[] = [];

  // Defensive: bail on anything that isn't a usable string.
  if (typeof partial !== 'string' || partial.length === 0) return results;

  try {
    // 1) Locate the "items" key, then its opening '['.
    const keyIdx = partial.indexOf('"items"');
    if (keyIdx === -1) return results;

    const openIdx = partial.indexOf('[', keyIdx);
    if (openIdx === -1) return results; // array hasn't started yet

    // 2) Walk the array contents, tracking string + escape + depth state.
    let inString = false; // currently inside a "..." string literal
    let escaped = false; // previous char was a backslash inside a string
    let depth = 0; // brace depth relative to the array interior
    let objStart = -1; // start index of the current top-level object, or -1

    // Begin just after the opening '['.
    for (let i = openIdx + 1; i < partial.length; i++) {
      const ch = partial[i];

      if (inString) {
        // Inside a string: only quotes/escapes matter.
        if (escaped) {
          escaped = false; // this char was escaped; consume it literally
        } else if (ch === '\\') {
          escaped = true; // next char is escaped (\" or \\ etc.)
        } else if (ch === '"') {
          inString = false; // closing quote
        }
        continue;
      }

      // Outside a string.
      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{') {
        if (depth === 0) objStart = i; // start of a top-level object
        depth++;
        continue;
      }

      if (ch === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) {
          // A complete top-level object: substring is objStart..i inclusive.
          const slice = partial.slice(objStart, i + 1);
          const item = tryParseItem(slice);
          if (item) results.push(item);
          objStart = -1;
        }
        continue;
      }

      // Reaching the array's closing ']' at top level means we're done.
      if (ch === ']' && depth === 0) break;
    }
  } catch {
    // Never throw — return whatever we have collected so far.
  }

  return results;
}

/**
 * Parse a single object substring into a CompleteItem, or return null if it is
 * malformed or fails validation (non-string name / non-finite or <= 0 amount).
 */
function tryParseItem(slice: string): CompleteItem | null {
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const obj = parsed as Record<string, unknown>;
    const name = obj.name;
    const amount = obj.amount;

    if (typeof name !== 'string') return null;

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) return null;

    return { name: String(name), amount: numAmount };
  } catch {
    return null;
  }
}
