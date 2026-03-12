/**
 * Intent Engine — classifies natural language notes into financial intents
 * using local pre-filter + Gemini 1.5 Flash for structured extraction.
 *
 * Pipeline: text → manglishParser (local) → Gemini (if needed) → IntentResult
 */

import { ExtractionIntent, AIExtraction } from '../types';
import { preFilter, matchCategory, matchWallet, parseStructuredLines } from './manglishParser';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '../constants';
import { usePremiumStore } from '../store/premiumStore';
import { useLearningStore } from '../store/learningStore';
import { callGeminiAPI, isGeminiAvailable } from './geminiClient';

export interface IntentResult {
  intent: ExtractionIntent;
  extractions: AIExtraction[];
  confidence: 'high' | 'low';
  rawResponse?: string;
}

const categoryList = [
  ...EXPENSE_CATEGORIES.map((c) => `${c.id}: ${c.name}`),
  ...INCOME_CATEGORIES.map((c) => `${c.id}: ${c.name}`),
].join(', ');

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Build the Gemini system prompt for intent classification.
 */
function buildPrompt(walletNames: string[]): string {
  return `You are a financial intent classifier for a Malaysian app called Potraces.
Users write in Manglish (mixed Malay + English). Extract structured financial data.

AVAILABLE CATEGORIES: ${categoryList}
AVAILABLE WALLETS: ${walletNames.join(', ') || 'none set up'}

INTENT TYPES:
- expense: user spent money
- income: user received money
- debt: someone owes money or user owes someone
- debt_update: update on existing debt (paid back, settled)
- bnpl: buy now pay later / installment / credit card purchase
- seller_order: business order from customer
- seller_cost: business cost/ingredient purchase
- query: user asking a question about their finances
- savings_goal: saving or investment action
- plain: no financial content

For each financial item found, return a JSON object:
{
  "intent": "<dominant_intent_type>",
  "items": [
    {
      "intent": "<intent for THIS item: expense|income|debt|debt_update|bnpl|seller_order|seller_cost|savings_goal>",
      "amount": <number>,
      "description": "<what it's for>",
      "category": "<category_id from list above>",
      "type": "expense" | "income",
      "wallet": "<wallet name if mentioned, null otherwise>",
      "person": "<person name if debt/split, null otherwise>",
      "confidence": "high" | "low"
    }
  ]
}

COMMON NOTE FORMATS:
Users often write quick structured notes. Understand these patterns:

1. DEBT LISTS with headers:
   "mereka hutang" or "they owe" = header meaning people owe the user (type: "income", intent per item: "debt")
   "aku hutang" or "i owe" = header meaning user owes people (type: "expense", intent per item: "debt")
   Lines below a header like "100-faris" or "300-mak(duit raya)" mean: amount-person. Extract each as a separate debt item with the person name.
   Example: "mereka hutang\\n100-faris\\n50-ali" → 2 debt items (faris RM100 type:income, ali RM50 type:income)

2. PERSON-SCOPED BLOCKS:
   A line with JUST a name (no amount) followed by item lines = all items below belong to that person.
   Example:
   "mohsin\\nair-3\\npetrol-7.5\\ntol-5.8"
   → 3 debt items, all with person: "mohsin" (air RM3, petrol RM7.5, tol RM5.8), intent: debt, type: expense (user owes mohsin)
   A new name line starts a new person block.
   "mohsin\\nair-3\\nmael\\nflavor-23"
   → air RM3 person:mohsin, flavor RM23 person:mael

3. SHORTHAND: "amount-description" or "description-amount" per line
   "netflix-75" → expense RM75, description: netflix, category: subscription
   "100-zarep" → could be debt or expense depending on context headers above

4. PARENTHETICAL NOTES: "300-mak(duit raya)" → person: mak, amount: 300, description: duit raya

5. DONE/SETTLED markers: "digi bill is done", "settled", "lunas", "dah bayar" → intent: debt_update (the item is paid/completed)
   Also: ✅ checkmark after an item = already confirmed/done. SKIP items with ✅ — do not extract them.

6. SERVICES: digi, celcom, maxis, unifi, astro, netflix, spotify etc. are subscriptions/bills, NOT debts. "240-digi bill" = expense RM240 for digi bill, category: bills or subscription.

7. MATH/BALANCE LINES: Lines that are pure arithmetic like "110+20-3-7.5 = 76.7" are the user's own calculations. SKIP these — do not extract them as items.

8. CASH ADDITIONS: "cash + 20" or "cash +20" = income RM20, description: cash, category: other. The "+" indicates money received.

RULES:
- Currency is always MYR (RM). Amount can appear with or without "RM" prefix.
- A single note may contain MULTIPLE items with DIFFERENT intents. Extract ALL of them with the correct intent per item.
- Each item gets its own "intent" field. Use the top-level "intent" for the dominant type, but set each item's intent individually.
- "rm" or "RM" prefix = amount in ringgit. "sen" suffix = cents.
- If a line has no amount, skip it or mark confidence "low"
- For debt: set type based on direction (user owes = expense, owed to user = income). Set person to the name.
- For queries: set items to empty array, just return the intent
- For plain text with no financial content: intent = "plain", items = []
- Respond with ONLY the JSON object, no markdown fences, no explanation${useLearningStore.getState().getPromptHints()}`;
}

/**
 * Call Gemini API for intent classification.
 * Returns raw JSON string or null on failure.
 */
async function callGemini(
  text: string,
  walletNames: string[]
): Promise<string | null> {
  const data = await callGeminiAPI({
    system_instruction: { parts: [{ text: buildPrompt(walletNames) }] },
    contents: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  });

  if (!data) return null;
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return raw || null;
}

/**
 * Parse Gemini response into IntentResult.
 */
function parseGeminiResponse(raw: string): IntentResult | null {
  try {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    const parsed = JSON.parse(cleaned);
    const intent: ExtractionIntent = parsed.intent || 'plain';
    const items: any[] = Array.isArray(parsed.items) ? parsed.items : [];

    const extractions: AIExtraction[] = items.map((item) => ({
      id: makeId(),
      type: (item.intent || intent) as ExtractionIntent,
      rawText: item.description || '',
      extractedData: {
        amount: Number(item.amount) || 0,
        description: item.description || '',
        category: item.category || null,
        transactionType: item.type || 'expense',
        wallet: item.wallet || null,
        person: item.person || null,
      },
      status: 'pending' as const,
      confirmedAt: undefined,
    }));

    return {
      intent,
      extractions,
      confidence: items.every((i) => i.confidence === 'high') ? 'high' : 'low',
      rawResponse: raw,
    };
  } catch {
    return null;
  }
}

/**
 * Build a local-only IntentResult from pre-filter data.
 * Tries structured line parsing first (for debt lists with headers),
 * then falls back to generic amount-based extraction.
 */
function buildLocalResult(
  text: string,
  amounts: number[],
  intent: ExtractionIntent
): IntentResult {
  // Try structured line parsing (multi-line debt format)
  const structured = parseStructuredLines(text);
  if (structured && structured.length > 0) {
    const learning = useLearningStore.getState();
    const extractions: AIExtraction[] = structured.map((line) => {
      const preferredName = learning.getSuggestedPerson(line.person) || line.person;
      return {
        id: makeId(),
        type: line.isDone ? 'debt_update' as ExtractionIntent : 'debt' as ExtractionIntent,
        rawText: `${preferredName} — RM ${line.amount}${line.note ? ` (${line.note})` : ''}`,
        extractedData: {
          amount: line.amount,
          description: line.note || `${line.direction === 'they_owe' ? `${preferredName} owes` : `owe ${preferredName}`}`,
          category: matchCategory(line.person) || 'other',
          transactionType: line.direction === 'they_owe' ? 'income' : 'expense',
          wallet: null,
          person: preferredName,
        },
        status: 'pending' as const,
      };
    });

    return {
      intent: 'debt',
      extractions,
      confidence: 'low',
    };
  }

  // Generic: one extraction per amount
  const extractions: AIExtraction[] = amounts.map((amount) => ({
    id: makeId(),
    type: intent,
    rawText: text,
    extractedData: {
      amount,
      description: text.replace(/rm\s*\d+(?:\.\d{1,2})?/gi, '').trim(),
      category: matchCategory(text),
      transactionType: intent === 'income' ? 'income' : 'expense',
      wallet: null,
      person: null,
    },
    status: 'pending' as const,
  }));

  return {
    intent,
    extractions,
    confidence: 'low',
  };
}

/**
 * Merge same-person debt extractions into a single extraction.
 * e.g. mohsin: air(3) + petrol(7.5) + tol(5.8) → one debt RM 16.30
 */
function mergeByPerson(result: IntentResult): IntentResult {
  if (result.extractions.length <= 1) return result;

  const personGroups: Map<string, AIExtraction[]> = new Map();
  const ungrouped: AIExtraction[] = [];

  for (const ext of result.extractions) {
    const person = ext.extractedData.person;
    if (person && (ext.type === 'debt' || ext.type === 'debt_update')) {
      const key = `${person.toLowerCase()}_${ext.type}_${ext.extractedData.transactionType}`;
      if (!personGroups.has(key)) personGroups.set(key, []);
      personGroups.get(key)!.push(ext);
    } else {
      ungrouped.push(ext);
    }
  }

  const merged: AIExtraction[] = [];

  for (const [, group] of personGroups) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    // Combine into one extraction
    const totalAmount = group.reduce((sum, e) => sum + e.extractedData.amount, 0);
    const desc = group
      .map((e) => {
        const name = e.extractedData.description || 'item';
        return `${name}(${e.extractedData.amount % 1 === 0 ? e.extractedData.amount : e.extractedData.amount.toFixed(2)})`;
      })
      .join(', ');

    const first = group[0];
    merged.push({
      id: first.id,
      type: first.type,
      rawText: desc,
      extractedData: {
        amount: totalAmount,
        description: desc,
        category: first.extractedData.category,
        transactionType: first.extractedData.transactionType,
        wallet: first.extractedData.wallet,
        person: first.extractedData.person,
      },
      status: 'pending' as const,
    });
  }

  return {
    ...result,
    extractions: [...merged, ...ungrouped],
  };
}

/**
 * Main entry point: classify a note's text into financial intents.
 *
 * @param text - The raw note text
 * @param walletNames - Available wallet names for matching
 * @returns IntentResult with extractions, or null if plain text
 */
export async function classifyIntent(
  text: string,
  walletNames: string[] = []
): Promise<IntentResult | null> {
  if (!text.trim()) return null;

  // Step 1: Local pre-filter
  const pf = preFilter(text);

  // No financial content at all → plain text, no AI call needed
  if (!pf.hasFinancialContent) {
    return { intent: 'plain', extractions: [], confidence: 'high' };
  }

  // Step 2: Check AI quota + cooldown
  const premium = usePremiumStore.getState();
  const aiAvailable = premium.canUseAI() && isGeminiAvailable();
  if (!aiAvailable) {
    // Over quota or rate-limited — fallback to local only
    if (pf.amounts.length > 0 && pf.hintIntent) {
      return mergeByPerson(buildLocalResult(text, pf.amounts, pf.hintIntent));
    }
    return { intent: 'plain', extractions: [], confidence: 'low' };
  }

  // Step 3: Try Gemini for structured extraction
  const geminiRaw = await callGemini(text, walletNames);
  if (geminiRaw) {
    premium.incrementAiCalls();
    const result = parseGeminiResponse(geminiRaw);
    if (result && result.extractions.length > 0) {
      // Enrich with local + learned patterns
      const learning = useLearningStore.getState();
      for (const ext of result.extractions) {
        const data = ext.extractedData;
        if (!data.category) {
          data.category = matchCategory(ext.rawText || text);
        }
        if (!data.wallet && walletNames.length > 0) {
          data.wallet = matchWallet(text, walletNames);
        }
        // Apply learned person alias
        if (data.person) {
          const preferred = learning.getSuggestedPerson(data.person);
          if (preferred) data.person = preferred;
        }
      }
      return mergeByPerson(result);
    }
    // Gemini returned but with empty items — trust it
    if (result) return result;
  }

  // Step 4: Fallback to local-only extraction
  if (pf.amounts.length > 0 && pf.hintIntent) {
    return mergeByPerson(buildLocalResult(text, pf.amounts, pf.hintIntent));
  }

  // Query detected but no amounts
  if (pf.isQuery) {
    return { intent: 'query', extractions: [], confidence: 'low' };
  }

  // Has keywords but no amounts — still flag as potential financial content
  if (pf.hintIntent && pf.hintIntent !== 'plain') {
    return {
      intent: pf.hintIntent,
      extractions: [{
        id: makeId(),
        type: pf.hintIntent,
        rawText: text,
        extractedData: {
          amount: 0,
          description: text,
          category: matchCategory(text),
          transactionType: pf.hintIntent === 'income' ? 'income' : 'expense',
          wallet: null,
          person: null,
        },
        status: 'pending' as const,
      }],
      confidence: 'low',
    };
  }

  return null;
}
