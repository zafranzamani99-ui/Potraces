/**
 * spokenAmount — convert spoken Malay/English number words to digits, but ONLY when they sit
 * next to a money cue (ringgit / rm / sen). This hardens voice capture for Echo: a recognizer
 * that returns "dua puluh ringgit" becomes "20 ringgit" before it lands in the composer.
 *
 * Safety first (per the research GO/NO-GO): the money-cue gate means bare number words inside a
 * name are LEFT ALONE — "teh satu", "Warung Dua", "nasi lemak dua" (with no adjacent cue) are
 * untouched. Only Echo's onResult calls this; LogIncome/NoteEditor never do (their downstream
 * paths handle numbers themselves). The transform is idempotent — digits are not number words,
 * so "20 ringgit" passes through unchanged.
 *
 * Scope: 0–9999, the closed MS+EN number-word set. Handles Malay's multiplicative tens correctly
 * (`lima puluh` = 5×10, `seratus lima puluh tiga` = 153) — a naive left-to-right accumulator gets
 * these wrong, so we use a `lastUnit`-replacement fold.
 */

const MONEY_CUES = new Set(['ringgit', 'ringgits', 'rm', 'sen', 'cent', 'cents']);

// Unit words 1–9 (and zero). These set `lastUnit` so a following puluh/belas/ratus can scale them.
const UNIT: Record<string, number> = {
  kosong: 0, sifar: 0, zero: 0,
  satu: 1, one: 1,
  dua: 2, two: 2,
  tiga: 3, three: 3,
  empat: 4, four: 4,
  lima: 5, five: 5,
  enam: 6, six: 6,
  tujuh: 7, seven: 7,
  lapan: 8, delapan: 8, eight: 8,
  sembilan: 9, nine: 9,
};

// Direct values that don't combine with a trailing scale word (English tens/teens, MS se-tens).
const DIRECT: Record<string, number> = {
  sepuluh: 10, sebelas: 11,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// Scale / suffix operators.
const OPS = new Set(['puluh', 'belas', 'ratus', 'hundred', 'ribu', 'thousand', 'seratus', 'seribu']);

function clean(tok: string): string {
  return tok.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function isNumberWord(w: string): boolean {
  return w in UNIT || w in DIRECT || OPS.has(w);
}

/**
 * Fold a run of known number-words (already cleaned) into an integer, or return `null` if the run is
 * ambiguous/malformed (two distinct quantities like "dua tiga", bare/repeated operators, no actual
 * quantity). The caller leaves a `null` run as words rather than emitting a confidently-wrong digit.
 */
function parseRun(words: string[]): number | null {
  let total = 0; // closed thousands
  let current = 0; // current sub-1000 group
  let lastUnit = 0; // the most recent bare unit, for puluh/belas/ratus to scale
  let sawValue = false; // did the run contain an actual quantity (not just operators)?

  for (const w of words) {
    if (w in UNIT) {
      // Two bare units in a row with no scale operator between = two separate quantities
      // ("dua tiga" = "two, three", NOT 5). Ambiguous — bail.
      if (lastUnit !== 0) return null;
      const v = UNIT[w];
      current += v;
      lastUnit = v;
      sawValue = true;
    } else if (w in DIRECT) {
      current += DIRECT[w];
      lastUnit = 0;
      sawValue = true;
    } else if (w === 'puluh') {
      // "dua puluh" = replace the just-added 2 with 20.
      current = current - lastUnit + lastUnit * 10;
      lastUnit = 0;
    } else if (w === 'belas') {
      // "lima belas" = 10 + 5.
      current = current - lastUnit + (10 + lastUnit);
      lastUnit = 0;
    } else if (w === 'ratus' || w === 'hundred') {
      const f = lastUnit || 1;
      current = current - lastUnit + f * 100;
      lastUnit = 0;
    } else if (w === 'seratus') {
      current += 100;
      lastUnit = 0;
      sawValue = true;
    } else if (w === 'ribu' || w === 'thousand') {
      if (current === 0 && total > 0) return null; // "lima ribu ribu" — double thousand
      const f = current || 1;
      total += f * 1000;
      current = 0;
      lastUnit = 0;
    } else if (w === 'seribu') {
      if (total > 0) return null; // "... ribu seribu" — malformed
      total += 1000;
      current = 0;
      lastUnit = 0;
      sawValue = true;
    }
  }
  if (!sawValue) return null; // only operators, no quantity ("rm ratus", "rm puluh")
  return total + current;
}

/**
 * Replace spoken number runs adjacent to a money cue with their digits.
 * Returns the input unchanged when nothing qualifies.
 */
export function normalizeSpokenAmount(text: string): string {
  if (!text) return text;
  const tokens = text.trim().split(/\s+/);
  if (tokens.length === 0) return text;

  const cleaned = tokens.map(clean);
  const result: string[] = [];
  let changed = false;

  let i = 0;
  while (i < tokens.length) {
    if (!isNumberWord(cleaned[i])) {
      result.push(tokens[i]);
      i += 1;
      continue;
    }
    // Maximal run of number-words.
    let j = i;
    while (j < tokens.length && isNumberWord(cleaned[j])) j += 1;

    // Gate: a money cue must touch the run on either side.
    const cueBefore = i > 0 && MONEY_CUES.has(cleaned[i - 1]);
    const cueAfter = j < tokens.length && MONEY_CUES.has(cleaned[j]);

    const value = cueBefore || cueAfter ? parseRun(cleaned.slice(i, j)) : null;
    if (value !== null) {
      result.push(String(value)); // run → one digit token
      changed = true;
    } else {
      for (let k = i; k < j; k += 1) result.push(tokens[k]); // names / ambiguous runs → leave verbatim
    }
    i = j;
  }

  return changed ? result.join(' ') : text;
}
