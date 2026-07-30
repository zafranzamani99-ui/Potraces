/**
 * Parse `[CARD]{...}[/CARD]` directives out of MODEL OUTPUT (mirrors parseActions
 * / parseMemories in chatActions.ts).
 *
 * SECURITY: only ever run on Gemini's reply text. User-authored text is stripped
 * of `[CARD]` tags by sanitizeUserText (chatActions.ts) so a user can't inject a
 * card. Tolerant like parseMemories — a dropped closing tag or a code-fenced JSON
 * body still parses. Caps to ONE card per reply (the over-carding guard).
 */
import { EchoCardSpec, isEchoCardKind } from './types';

// Tolerant, like parseMemories: match `[CARD]` + a flat JSON object, with the
// closing `[/CARD]` OPTIONAL (small models routinely drop it — and CARD_PROMPT's
// format doesn't require it) and an optional ```json code fence. Card specs are
// always flat ({kind + string params}), so `\{[^{}]*\}` captures the whole body.
export const CARD_REGEX = /\[CARD\]\s*(?:```(?:json)?\s*)?(\{[^{}]*\})\s*(?:```\s*)?(?:\[\/CARD\])?/g;

/** Strip markdown code fences the model might wrap around the JSON. */
function cleanJson(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/** Validate the SPEC (kind + optional string params) — never amounts. */
export function validateCardSpec(parsed: any): EchoCardSpec | null {
  if (!parsed || !isEchoCardKind(parsed.kind)) return null;
  const spec: EchoCardSpec = { kind: parsed.kind };
  if (typeof parsed.goalName === 'string' && parsed.goalName.trim()) spec.goalName = parsed.goalName.trim();
  if (typeof parsed.contact === 'string' && parsed.contact.trim()) spec.contact = parsed.contact.trim();
  if (typeof parsed.category === 'string' && parsed.category.trim()) spec.category = parsed.category.trim();
  return spec;
}

/**
 * Remove every `[CARD]` block from the text and collect the valid specs.
 * Returns at most ONE spec (first valid) — a reply shows a single card.
 */
export function parseCards(text: string): { cleanText: string; specs: EchoCardSpec[] } {
  const specs: EchoCardSpec[] = [];
  const cleanText = text.replace(CARD_REGEX, (_, json) => {
    try {
      const spec = validateCardSpec(JSON.parse(cleanJson(json)));
      if (spec) specs.push(spec);
    } catch (e) {
      if (__DEV__) console.warn('[EchoCards] failed to parse card block:', json, e);
    }
    return '';
  }).trim();
  return { cleanText, specs: specs.slice(0, 1) };
}
