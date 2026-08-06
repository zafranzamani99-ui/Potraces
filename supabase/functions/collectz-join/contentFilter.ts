// ─── Server-side content filter (Deno port of src/utils/contentFilter.ts) ────
// Apple 1.2 (UGC): free text one user types and another user sees (Collectz
// member names, team names) must be filtered server-side too — the in-app
// filter is only a fast UX guard and is trivially bypassed by calling this
// function directly. KEEP IN SYNC with the client filter: same blocklists,
// same normalization, so a name the client accepts is also accepted here.

export type ContentReason = 'url' | 'profanity';
export type ContentCheck = { ok: true } | { ok: false; reason: ContentReason };

// Links / handles — names are not a place for URLs; this is the anti-spam half.
const URL_RE =
  /(https?:\/\/|www\.|\bt\.me\b|\bwa\.me\b|@[a-z0-9._]{2,}|\b[a-z0-9-]{2,}\.(com|net|org|my|co|io|xyz|link|me|ly|gg|app|shop|store|info|biz|online|site|click|vip|top)\b)/i;

// Fold common leetspeak so "f4g", "b1tch", "5hit" normalize to their letters.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '+': 't', '(': 'c',
};

const normalize = (s: string): string =>
  s.toLowerCase().split('').map((ch) => LEET[ch] ?? ch).join('');

// Whole-word obscenities/slurs (English + Malay). Matched against normalized
// tokens, so innocent words that merely CONTAIN one of these are not flagged.
const WORD_BLOCKLIST = new Set<string>([
  // English
  'fuck', 'fuk', 'fuckyou', 'shit', 'bitch', 'bastard', 'asshole', 'dick',
  'pussy', 'cunt', 'slut', 'whore', 'fag', 'faggot', 'nigger', 'nigga',
  'retard', 'cock', 'wank', 'jerk', 'twat', 'douche',
  // Malay / Manglish
  'babi', 'sial', 'sialan', 'pukimak', 'pundek', 'puki', 'pantat', 'lancau',
  'kimak', 'cibai', 'cibbai', 'kaninabu', 'lanciao', 'butoh', 'butuh',
  'pepek', 'bodoh', 'bangsat', 'celaka', 'setan', 'anjing', 'keparat',
]);

// Hardcore slurs blocked even embedded (spam tricks like "xxfaggotxx"). Kept
// tiny on purpose — these are never part of a legitimate name.
const SUBSTRING_BLOCKLIST = [
  'fuck', 'nigger', 'nigga', 'faggot', 'pukimak', 'cibai', 'kimak',
];

/** Check a piece of user-typed text destined to be shown to other users. */
export function checkContent(raw: string): ContentCheck {
  const text = (raw ?? '').trim();
  if (!text) return { ok: true };

  if (URL_RE.test(text)) return { ok: false, reason: 'url' };

  const norm = normalize(text);

  // Collapsed form (letters/digits only) catches spaced-out obscenities: "f u c k".
  const collapsed = norm.replace(/[^a-z0-9]/g, '');
  for (const bad of SUBSTRING_BLOCKLIST) {
    if (collapsed.includes(bad)) return { ok: false, reason: 'profanity' };
  }

  // Whole-token match for the broader list (no false positives on real names).
  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
  for (const tok of tokens) {
    if (WORD_BLOCKLIST.has(tok)) return { ok: false, reason: 'profanity' };
  }

  return { ok: true };
}
