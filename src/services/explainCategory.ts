import { callGeminiAPI, isGeminiAvailable } from './geminiClient';

/** Ask Gemini for a short, friendly explanation of why a description fits
 *  a given category. Returns null if AI unavailable or response malformed.
 *
 *  Output style: one sentence, conversational, Malaysian English friendly.
 *  Use case: user taps "Why?" on a transaction — one-off, cached after first call.
 */
export async function explainCategorization(
  description: string,
  category: string,
): Promise<string | null> {
  if (!isGeminiAvailable()) return null;

  const prompt = `A Malaysian finance app categorized this transaction:

Description: "${description}"
Assigned category: "${category}"

In ONE short sentence (max 25 words), explain why this description fits that category. Friendly, plain Malaysian English. Do not quote the category name. Do not say "because" more than once. If the match is weak, acknowledge it honestly.`;

  try {
    const res = await callGeminiAPI(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 80 },
      } as any,
      12_000,
    );
    const text = (res as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== 'string') return null;
    return text.trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}
