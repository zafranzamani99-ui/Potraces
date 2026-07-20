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
