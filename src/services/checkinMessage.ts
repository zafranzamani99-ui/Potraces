/**
 * AI-written daily check-in — Echo greets with today's tally in its OWN words
 * instead of the fixed i18n template.
 *
 * Background AI, same convention as spendingMirror: checks canUseAI() headroom
 * but does NOT increment the counter (doesn't spend the user's Echo quota).
 * The caller (MoneyChat's check-in effect) races this against a timeout and
 * falls back to the template, so null is always a safe answer. Never throws.
 */

import { usePremiumStore } from '../store/premiumStore';
import { callGeminiAPI, isGeminiAvailable } from './geminiClient';

export async function generateCheckinMessage(input: {
  count: number;
  total: number;
  streak: number;
  currency: string;
  /** App language — 'ms' writes the check-in in Malay, anything else English. */
  language?: string;
  /** Back-Tap auto-log already set up (cached server truth). Shapes the nudge:
   *  not set up + nothing logged → gently mention it; set up → acknowledge. */
  autoLogSetup?: boolean;
}): Promise<string | null> {
  try {
    // Shared cooldown + AI quota headroom — background AI never burns a call
    // the user's real chat needs.
    if (!isGeminiAvailable()) return null;
    if (!usePremiumStore.getState().canUseAI()) return null;

    const { count, total, streak, currency, language, autoLogSetup } = input;
    // Auto-log context: buttons under the message do the actual navigation —
    // the text just sets the scene (never instructs taps it can't render).
    const autoLogLine = autoLogSetup
      ? ' The user has auto-log set up (expenses can arrive by Back Tap on their own).'
      : count === 0
        ? ' The user has NOT set up auto-log; logging is manual for them.'
        : '';
    // Match the app language — a BM user must not get an English greeting.
    const languageLine = language === 'ms'
      ? '- Write in Bahasa Melayu (casual, mesra — Manglish sprinkles fine).'
      : '- Write in English; Manglish/Malay-friendly tone is natural ("steady", "boleh tahan") — but keep it readable.';
    const facts = count > 0
      ? `Today so far: ${count} expense${count === 1 ? '' : 's'} totalling ${currency} ${total.toFixed(2)}.`
      : 'Nothing recorded today yet.';
    const streakLine = streak >= 3
      ? ` The user has recorded expenses ${streak} days in a row.`
      : '';

    const systemPrompt = `You write Echo's daily check-in greeting inside Potraces, a Malaysian personal finance app. Write ONE warm, casual 1-2 sentence check-in for the user opening the chat today.

Rules:
- Mention today's tally (count + amount) if there is one; if nothing is recorded yet, keep it light — never pushy.
- If told about a day streak, weave it in as a calm rhythm note.
- If auto-log is set up, you may acknowledge it in passing ("auto log jalan"). If it is NOT set up and nothing is logged yet, a light "boleh catat bila sempat" energy is fine — buttons under your message handle the actions, so never tell the user to tap anything.
${languageLine}
- No advice. No "you should", no questions, no judgment on the amounts.
- At most ONE emoji, or none at all.
- Use "${currency} X.XX" format for amounts.
- Return ONLY the message text. No quotes, no JSON.`;

    const data = await callGeminiAPI({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: `${facts}${streakLine}${autoLogLine}` }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 256,
      },
    }, undefined, undefined, undefined, 'insights');

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}
