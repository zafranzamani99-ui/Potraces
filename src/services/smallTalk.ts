/**
 * Small-talk detection for Echo. Pure module (no imports), so tsx can test it.
 *
 * The WHOLE message (normalized: punctuation and digits stripped, 3+ repeated
 * letters collapsed) must be one of these exact phrases, so anything carrying
 * an amount, category, or money keyword can never match. Conservative by
 * design: when in doubt, the caller keeps the full financial context.
 */

const SMALL_TALK = new Set([
  // English
  'hi', 'hii', 'hello', 'helo', 'hey', 'heyy', 'yo', 'sup', 'morning', 'afternoon', 'evening',
  'good morning', 'good afternoon', 'good evening', 'good night', 'goodnight', 'night',
  'how are you', 'how are you doing', 'hows it going', 'how is it going', 'whats up', 'what is up',
  'thanks', 'thank you', 'thankyou', 'thx', 'tq', 'ok', 'okay', 'okey', 'okie', 'k', 'kk',
  'cool', 'nice', 'great', 'awesome', 'lol', 'haha', 'hahaha', 'lmao', 'hm', 'hmm',
  'yes', 'yeah', 'yep', 'nope', 'no', 'sure', 'bye', 'byee', 'goodbye', 'see you',
  'test', 'testing', 'hello test',
  // Malay / Manglish
  'hai', 'haii', 'apa khabar', 'apa kaba', 'khabar baik', 'selamat pagi', 'selamat petang',
  'selamat malam', 'selamat tengah hari', 'terima kasih', 'terima kasih banyak',
  'baik', 'ok lah', 'okay lah', 'bagus', 'mantap', 'syabas', 'jumpa lagi',
]);

/** True only when the message is pure small talk (greeting/pleasantry), nothing else. */
export function isSmallTalk(message: string): boolean {
  const norm = message
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/(.)\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return norm.length > 0 && SMALL_TALK.has(norm);
}

/**
 * High-precision self-harm phrases (EN + Malay). Deliberately multi-word and
 * specific so money-app hyperbole never trips them: bare "die"/"mati"/"nak mati"
 * ("penat nak mati settle bil", "this bill is killing me") are NOT here.
 *
 * ponytail: precision-first wordlist — a keyword match can't catch every
 * euphemism/typo; the owner/a clinician should tune this list. It's the first
 * net; buildSystemPrompt carries a gentler backstop for anything it misses.
 */
const CRISIS_PHRASES = [
  // English
  'kill myself', 'killing myself', 'end my life', 'ending my life', 'want to die',
  'wanna die', 'take my own life', 'suicide', 'suicidal', 'hurt myself', 'harm myself',
  'self harm', 'self-harm', 'no reason to live', 'better off dead', 'dont want to live',
  "don't want to live", 'no point living', 'no point in living',
  // Malay / Manglish
  'bunuh diri', 'nak bunuh diri', 'cederakan diri', 'mencederakan diri', 'sakiti diri',
  'menyakiti diri', 'tak nak hidup', 'taknak hidup', 'malas nak hidup', 'tak mahu hidup',
];

/**
 * True when the user's own message expresses self-harm intent. Substring match
 * on the normalized text (lowercased, whitespace collapsed) — the phrases are
 * specific enough that a substring hit is a real signal, not a false positive.
 */
export function isCrisisMessage(message: string): boolean {
  const norm = message.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!norm) return false;
  return CRISIS_PHRASES.some((p) => norm.includes(p));
}
