/**
 * Intent Engine — classifies natural language notes into financial intents
 * using local pre-filter + Gemini (model chain in geminiClient) for structured extraction.
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
import { tierAtLeast } from '../constants/tiers';
import { useLearningStore } from '../store/learningStore';
import { callGeminiAPI, isGeminiAvailable } from './geminiClient';

export type ExtractionSource = 'ai' | 'local';

export interface IntentResult {
  intent: ExtractionIntent;
  extractions: AIExtraction[];
  confidence: 'high' | 'low';
  source?: ExtractionSource;
  rawResponse?: string;
}

const categoryList = [
  ...EXPENSE_CATEGORIES.map((c) => `${c.id}: ${c.name}`),
  ...INCOME_CATEGORIES.map((c) => `${c.id}: ${c.name}`),
].join(', ');

const VALID_INTENTS: ExtractionIntent[] = [
  'expense', 'income', 'debt', 'debt_update', 'bnpl',
  'seller_order', 'seller_cost', 'query', 'savings_goal',
  'subscription', 'playbook', 'plain',
];

const INCOME_CATEGORY_IDS = new Set(INCOME_CATEGORIES.map((c) => c.id));
const ALL_CATEGORY_IDS = new Set([
  ...EXPENSE_CATEGORIES.map((c) => c.id),
  ...INCOME_CATEGORIES.map((c) => c.id),
]);

function normalizeExtractionType(
  rawIntent: string,
  item: Record<string, any>,
): { type: ExtractionIntent; category: string | null } {
  if (VALID_INTENTS.includes(rawIntent as ExtractionIntent)) {
    return { type: rawIntent as ExtractionIntent, category: item.category || null };
  }
  if (ALL_CATEGORY_IDS.has(rawIntent)) {
    return {
      type: INCOME_CATEGORY_IDS.has(rawIntent) ? 'income' : 'expense',
      category: rawIntent,
    };
  }
  return { type: 'expense', category: item.category || null };
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Build the Gemini system prompt for intent classification.
 */
function buildPrompt(
  walletNames: string[],
  opts?: { knownPeople?: string[]; retry?: boolean },
): string {
  const knownPeople = (opts?.knownPeople ?? []).filter(Boolean);
  return `You are a financial intent classifier for a Malaysian app called Potraces.
Users write in Manglish (mixed Malay + English). Extract structured financial data.

AVAILABLE CATEGORIES: ${categoryList}
AVAILABLE WALLETS: ${walletNames.join(', ') || 'none set up'}${knownPeople.length ? `\nKNOWN PEOPLE (this user's saved contacts / debtors — when one of these names appears, treat IT as the person and other tokens on the line as the description): ${knownPeople.slice(0, 40).join(', ')}` : ''}

INTENT TYPES:
- expense: user spent money
- income: user received money
- debt: someone owes money or user owes someone
- debt_update: update on existing debt (paid back, settled)
- bnpl: buy-now-pay-later or credit-card activity — BOTH a PURCHASE on credit ("beli/guna/pakai spaylater/atome") AND a REPAYMENT of a credit/BNPL balance ("bayar/langsai/lunas/settle spaylater", "bayar kad kredit"). Product words: spaylater, spay, shopee paylater, atome, grab paylater, boost payflex, ansuran, kad kredit / credit card. A "bayar/langsai/lunas <bnpl product>" line is bnpl, NOT debt_update (debt_update is only for money owed to a PERSON).
- subscription: a RECURRING commitment or bill paid each cycle — rent (sewa/rumah sewa), monthly services (netflix, spotify, icloud, gym), internet/phone bills paid every month (unifi, digi), insurance (insurans/takaful), tuition fees (yuran). Signal words: monthly/bulanan/tiap bulan/every month, langganan, recurring, auto debit, sewa, weekly/yearly, or a due day (25hb, due 25th). A one-off mention with NO recurring signal stays an expense.
- seller_order: business order from customer
- seller_cost: business cost/ingredient purchase
- query: user asking a question about their finances
- savings_goal: money going INTO savings — either saving toward a GOAL (a purpose/target: house deposit, wedding, umrah, car, emergency fund, a trip) OR a top-up to a savings/investment VEHICLE (ASB, Tabung Haji, EPF/ESA, crypto, a robo-advisor like StashAway / Versa / Wise, fixed deposit, gold, stocks). Signal words: simpan/save/nabung untuk…, topup, masuk tabung, invest. A "save FOR <purpose>" is a goal; a named account that holds/grows money is a vehicle. NOT an everyday expense.
- playbook: income/salary with a spending breakdown (title + total + category-amount lines)
- plain: no financial content

For each financial item found, return a JSON object:
{
  "intent": "<dominant_intent_type>",
  "items": [
    {
      "intent": "<intent for THIS item: expense|income|debt|debt_update|bnpl|subscription|seller_order|seller_cost|savings_goal>",
      "amount": <number>,
      "description": "<what it's for>",
      "category": "<category_id from list above>",
      "type": "expense" | "income",
      "wallet": "<wallet name if mentioned, null otherwise>",
      "person": "<person name if debt/split, null otherwise>",
      "billingCycle": "<weekly|monthly|quarterly|yearly — subscription only, else null>",
      "dueDay": "<day of month 1-31 if a due day is stated (e.g. 25hb, due 25th), else null>",
      "installments": "<number of installments if an installment plan (e.g. 3x), else null>",
      "confidence": "high" | "low"
    }
  ]
}

CRITICAL — DO NOT CONFUSE INTENT WITH CATEGORY:
- The "intent" field MUST be one of: expense|income|debt|debt_update|bnpl|seller_order|seller_cost|savings_goal|playbook|plain
- The "category" field uses IDs from AVAILABLE CATEGORIES (bills, food, transport, debt_payment, etc.)
- NEVER put a category ID in the "intent" field
- "digi bill 240" → intent: "expense", category: "bills"
- "bayar hutang 500" → intent: "debt_update", category: "debt_payment"

COMMON NOTE FORMATS:
Users often write quick structured notes. Understand these patterns:

1. DEBT LISTS with headers:
   "mereka hutang" / "orang hutang" / "they owe" = header meaning people owe the user (type: "income", intent per item: "debt")
   "aku hutang" or "i owe" = header meaning user owes people (type: "expense", intent per item: "debt")
   A header applies to EVERY line under it until the next header. Lines can be "amount-person", "person-amount", or "person amount" ("Ali- 7", "Rahman -8", "7-ali"). Extract each as a separate debt item with the person name.
   Example: "mereka hutang\\n100-faris\\n50-ali" → 2 debt items (faris RM100 type:income, ali RM50 type:income)
   Example: "aku hutang\\nAli- 7\\n\\norang hutang\\nRahman -8" → Ali RM7 (type:expense, I owe Ali), Rahman RM8 (type:income, Rahman owes me)

1b. NAMED-PERSON DEBT HEADER (one specific person is the debtor for the WHOLE block):
   When the header names a SPECIFIC person + hutang/owe, EVERY line under it belongs to THAT ONE named person — each line's text is the ITEM the debt is for (the description), NOT a new person, even when it looks like "word- amount".
   - "<name> hutang aku" / "<name> hutang" / "<name> owes [me]" = the named person owes the USER (type: "income")
   - "aku hutang <name>" / "hutang <name>" / "i owe <name>" = the USER owes the named person (type: "expense")
   Do NOT treat the leading word of a line as a person here — only the header names the person.
   Example: "nabil hutang aku\\nawe- 28.5\\nnasi pataya lps badminton 14.5\\nserambi johor - 8.50"
   → 3 debt items, ALL person: "nabil", type: "income" (nabil owes me): {description "awe", 28.50}, {description "nasi pataya lps badminton", 14.50}, {description "serambi johor", 8.50}.
   (Contrast rule 1: GENERIC headers with NO name — "mereka hutang", "orang hutang", "aku hutang" — name a DIFFERENT person per line.)

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

4. PARENTHETICAL AMOUNTS vs NOTES:
   - A NUMBER (or arithmetic) in parentheses is the AMOUNT: "kari (18)" → expense RM18, description "kari". "ayam (17)" → RM17.
   - Parentheses containing TEXT are a note: "300-mak(duit raya)" → person: mak, amount: 300, description: duit raya.

5. DONE/SETTLED markers: "digi bill is done", "settled", "lunas", "dah bayar" → intent: debt_update (the item is paid/completed)
   Also: ✅ checkmark after an item = already confirmed/done. SKIP items with ✅ — do not extract them.

6. SERVICES: digi, celcom, maxis, unifi, astro, netflix, spotify etc. are subscriptions/bills, NOT debts. A one-off mention ("240-digi bill") = expense, category bills. A RECURRING one (has a cycle/due-day/langganan/sewa signal) = subscription, with billingCycle/dueDay/installments filled:
   "rumah sewa 850 sebulan" → subscription, amount 850, billingCycle monthly, description "rumah sewa", category bills
   "netflix 55 monthly" → subscription, amount 55, billingCycle monthly, category subscription
   "unifi 129 due 15hb" → subscription, amount 129, billingCycle monthly, dueDay 15, category bills
   "atome kasut 3x49.90" → subscription, amount 49.90 (PER installment, never the total), installments 3, description "kasut", category shopping
   "netflix 55" → subscription, billingCycle monthly (known always-recurring services like netflix/spotify/icloud/unifi/astro/gym default to a monthly commitment)
   "groceries 55" / "lunch 12" (a generic one-off, not a recurring service) → expense

7. MATH/BALANCE LINES vs MATH AMOUNTS:
   - A line that is PURELY numbers and operators like "110+20-3-7.5 = 76.7" is the user's own calculation. SKIP it.
   - But when maths is the AMOUNT of a described item, EVALUATE it: "ali (16-9)+ 6(dinner)" → person ali, amount 13 (16-9+6), note dinner. "petrol 20+5" → RM25.

8. CASH ADDITIONS: "cash + 20" or "cash +20" = income RM20, description: cash, category: other. The "+" indicates money received.

9. SALARY/PLAYBOOK PATTERN:
   A title line (e.g. "Gaji March", "salary jan", "income feb") followed by a total amount, then itemised "description-amount" or "description amount" lines = playbook (salary envelope).
   The total is the income. Each subsequent line is a budget ALLOCATION (NOT an expense — money hasn't been spent yet, these are planned limits).
   Return ONE item inside the items array with intent "playbook":
   { "intent": "playbook", "items": [{ "intent": "playbook", "amount": 2600, "description": "Gaji March", "type": "income", "category": "salary", "confidence": "high", "allocations": [ { "label": "makan", "category": "food", "amount": 600 }, { "label": "rumah", "category": "rent", "amount": 700 } ] }] }
   Map allocation labels to the closest match from AVAILABLE CATEGORIES. If unsure, use "other".
   Key signal: the allocation amounts roughly add up to the total. This distinguishes a playbook from a list of expenses.

10. CATEGORY TITLES + MIXED NOTES:
   A heading that names a spend ("Makan harini" = today's food, "belanja hari ni", "groceries", "petrol trip") followed by item-amount lines means those items are EXPENSES in that category — NOT debts and NOT a person name.
   A single note may MIX sections: an expense list under such a title AND a debt list under a "hutang"/"owe" header. Extract every line under the section it belongs to.
   Example: "Makan harini | kari (18) | ayam -17 | nasi lemak RM8 | kuih -rm17 | hutang | ali (16-9)+ 6(dinner)"
   → 4 food expenses (kari 18, ayam 17, nasi lemak 8, kuih 17) + 1 debt (person ali, RM13, dinner). The title "Makan harini" is NOT a person.
   BARE-AMOUNT LISTS: a single-word category header ("makan", "petrol", "kopi") followed by amount-only lines ("-7", "8", "-rm9") means one EXPENSE per amount in that category, described by the header. Repeats are DISTINCT (do not merge duplicates).
   Example: "makan | -7 | -8 | -8 | -9" → 4 food expenses of RM7, RM8, RM8, RM9 (keep BOTH RM8s). A category header also ENDS any preceding debt section.

RULES:
- Currency is always MYR (RM). Amount can appear with or without "RM" prefix.
- A single note may contain MULTIPLE items with DIFFERENT intents. Extract ALL of them with the correct intent per item.
- Each item gets its own "intent" field. Use the top-level "intent" for the dominant type, but set each item's intent individually.
- "rm" or "RM" prefix = amount in ringgit. "sen" suffix = cents.
- If a line has no amount, skip it or mark confidence "low"
- For debt: set type based on direction (user owes = expense, owed to user = income). Set person to the name.
- For queries: set items to empty array, just return the intent
- For plain text with no financial content: intent = "plain", items = []
- Respond with ONLY the JSON object, no markdown fences, no explanation${opts?.retry ? `

RETRY — your PREVIOUS extraction was marked WRONG by the user. Do NOT repeat it. Re-read the note line by line and reconsider from scratch. First add a top-level "reasoning" string: for EACH line decide — is it a section header? does a specific NAMED person scope the block (rule 1b)? which token is the PERSON vs the DESCRIPTION? how many DISTINCT items are there? what is the correct intent/type? Then output the corrected "items". Prefer splitting over merging, and get the person-scoping right this time.` : ''}${useLearningStore.getState().getPromptHints()}`;
}

/**
 * Call Gemini API for intent classification.
 * Returns raw JSON string or null on failure.
 */
async function callGemini(
  text: string,
  walletNames: string[],
  opts?: { knownPeople?: string[]; retry?: boolean; previous?: string }
): Promise<string | null> {
  const retry = !!opts?.retry;
  // "Think harder" (the stronger model on retry) is a PAID perk — free users still get
  // a retry, but on the normal model. Paid (basic+) get gemini-3.5-flash.
  const strong = retry && tierAtLeast(usePremiumStore.getState().tier, 'basic');
  // On retry, feed the rejected answer back so the model actively avoids repeating it,
  // and give it more room + the stronger model so it can genuinely reconsider.
  const userText = retry && opts?.previous
    ? `${text}\n\n[RETRY] Your previous extraction below was WRONG per the user — return a corrected, DIFFERENT result.\nPREVIOUS: ${opts.previous}`
    : text;
  const data = await callGeminiAPI({
    system_instruction: { parts: [{ text: buildPrompt(walletNames, { knownPeople: opts?.knownPeople, retry }) }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      temperature: retry ? 0.5 : 0.1,
      maxOutputTokens: retry ? 2048 : 1024,
      responseMimeType: 'application/json',
    },
  }, retry ? 20_000 : 15_000, false, strong ? 'gemini-3.5-flash' : undefined, 'intent');

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
    const intent: ExtractionIntent = VALID_INTENTS.includes(parsed.intent as ExtractionIntent)
      ? parsed.intent
      : 'plain';
    // Gemini may return items array, or a flat object (single-item like playbook)
    let items: any[] = Array.isArray(parsed.items) ? parsed.items : [];
    if (items.length === 0 && parsed.amount && parsed.description) {
      items = [parsed];
    }

    const extractions: AIExtraction[] = items.map((item) => {
      const normalized = normalizeExtractionType(item.intent || intent, item);
      let parsedAmount = Number(item.amount) || 0;
      if (parsedAmount > 1_000_000) parsedAmount = 0;
      return {
        id: makeId(),
        type: normalized.type,
        rawText: item.description || '',
        extractedData: {
          amount: parsedAmount,
          description: item.description || '',
          // Debts don't use an expense category — leave it null so the card reads as a
          // debt (person only), not "other · <person>".
          category: normalized.type === 'debt' || normalized.type === 'debt_update'
            ? null
            : normalized.category || item.category || null,
          transactionType: item.type || 'expense',
          wallet: item.wallet || null,
          person: item.person || null,
          allocations: item.allocations || null,
          // Commitment schedule (subscription intent) — coerce Gemini's strings/nulls.
          billingCycle: ['weekly', 'monthly', 'quarterly', 'yearly'].includes(item.billingCycle)
            ? item.billingCycle : null,
          dueDay: Number(item.dueDay) >= 1 && Number(item.dueDay) <= 31 ? Number(item.dueDay) : null,
          installments: Number(item.installments) > 1 ? Number(item.installments) : null,
        },
        status: 'pending' as const,
        confirmedAt: undefined,
      };
    });

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
 * Detect salary/playbook pattern locally:
 * Line 1: title with income keyword (gaji, salary, income)
 * Line 2: standalone total amount
 * Lines 3+: description-amount allocation lines
 */
const PLAYBOOK_TITLE = /\b(gaji|salary|income|pay|upah|wage)\b/i;

function detectLocalPlaybook(text: string): IntentResult | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  // First line: title with income keyword
  if (!PLAYBOOK_TITLE.test(lines[0])) return null;

  // Second line: standalone number (total amount)
  const totalMatch = lines[1].match(/^[\s]*(\d+(?:\.\d{1,2})?)[\s]*$/);
  if (!totalMatch) return null;
  const totalAmount = parseFloat(totalMatch[1]);
  if (totalAmount <= 0) return null;

  // Remaining lines: description-amount or amount-description allocations
  const allocLines = lines.slice(2);
  const allocations: { label: string; category: string; amount: number }[] = [];
  const ALLOC_LAST = /^(.+?)[-–\s]+(\d+(?:\.\d{1,2})?)\s*$/;
  const ALLOC_FIRST = /^(\d+(?:\.\d{1,2})?)\s*[-–]\s*(.+)$/;

  for (const al of allocLines) {
    let match = ALLOC_LAST.exec(al);
    if (match) {
      allocations.push({ label: match[1].trim(), category: matchCategory(match[1]) || 'other', amount: parseFloat(match[2]) });
      continue;
    }
    match = ALLOC_FIRST.exec(al);
    if (match) {
      allocations.push({ label: match[2].trim(), category: matchCategory(match[2]) || 'other', amount: parseFloat(match[1]) });
    }
    // Lines that don't match allocation pattern are ignored
  }

  if (allocations.length < 2) return null;

  const extraction: AIExtraction = {
    id: makeId(),
    type: 'playbook',
    rawText: text,
    extractedData: {
      amount: totalAmount,
      description: lines[0],
      category: 'salary',
      transactionType: 'income',
      wallet: null,
      person: null,
      allocations,
    },
    status: 'pending' as const,
  };

  return { intent: 'playbook', extractions: [extraction], confidence: 'low' };
}

/**
 * Build a local-only IntentResult from pre-filter data.
 * Tries playbook detection first, then structured line parsing (debt lists),
 * then falls back to generic amount-based extraction.
 */
function buildLocalResult(
  text: string,
  amounts: number[],
  intent: ExtractionIntent
): IntentResult {
  // Try playbook pattern first (salary envelope)
  const playbook = detectLocalPlaybook(text);
  if (playbook) return playbook;

  // Try structured line parsing (multi-line mixed expense / debt format)
  const structured = parseStructuredLines(text);
  if (structured && structured.length > 0) {
    const learning = useLearningStore.getState();
    const extractions: AIExtraction[] = structured.map((line) => {
      if (line.kind === 'expense') {
        return {
          id: makeId(),
          type: 'expense' as ExtractionIntent,
          rawText: `${line.label} — RM ${line.amount}`,
          extractedData: {
            amount: line.amount,
            description: line.note ? `${line.label} (${line.note})` : line.label,
            category: line.category || matchCategory(line.label) || 'other',
            transactionType: 'expense',
            wallet: null,
            person: null,
          },
          status: 'pending' as const,
        };
      }
      const person = line.person || line.label;
      const preferredName = learning.getSuggestedPerson(person) || person;
      return {
        id: makeId(),
        type: line.isDone ? 'debt_update' as ExtractionIntent : 'debt' as ExtractionIntent,
        rawText: `${preferredName} — RM ${line.amount}${line.note ? ` (${line.note})` : ''}`,
        extractedData: {
          amount: line.amount,
          description: line.note || `${line.direction === 'they_owe' ? `${preferredName} owes` : `owe ${preferredName}`}`,
          category: line.category || null,
          transactionType: line.direction === 'they_owe' ? 'income' : 'expense',
          wallet: null,
          person: preferredName,
        },
        status: 'pending' as const,
      };
    });

    const hasDebt = extractions.some((e) => e.type === 'debt' || e.type === 'debt_update');
    const hasExpense = extractions.some((e) => e.type === 'expense');
    const topIntent: ExtractionIntent = hasExpense && !hasDebt ? 'expense' : hasDebt && !hasExpense ? 'debt' : 'expense';

    return {
      intent: topIntent,
      extractions,
      confidence: 'low',
    };
  }

  // Generic: one extraction per amount
  const suggestedWallet = useLearningStore.getState().getSuggestedWallet(text);
  const extractions: AIExtraction[] = amounts.map((amount) => ({
    id: makeId(),
    type: intent,
    rawText: text,
    extractedData: {
      amount,
      description: text.replace(/rm\s*\d+(?:\.\d{1,2})?/gi, '').trim(),
      category: matchCategory(text),
      transactionType: intent === 'income' ? 'income' : 'expense',
      wallet: suggestedWallet,
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

// NOTE: `mergeByPerson` (summing all same-person debts into one entry) was removed
// 2026-07-21. It collapsed distinct itemised lines (e.g. "awe 28.5 / nasi 14.5 /
// serambi 8.5") into a single summed blob with a concatenated description, folded
// each line's amount into the header person's total, and broke per-line auto-strike
// (the summed amount matched no line, so the striker fell back to the header). Each
// extracted line now stays its own item — the user can skip/edit individually.

/**
 * Main entry point: classify a note's text into financial intents.
 *
 * @param text - The raw note text
 * @param walletNames - Available wallet names for matching
 * @returns IntentResult with extractions, or null if plain text
 */
export async function classifyIntent(
  text: string,
  walletNames: string[] = [],
  onStep?: (step: 'scanning' | 'ai' | 'local') => void,
  opts?: { knownPeople?: string[]; retryPrevious?: string }
): Promise<IntentResult | null> {
  if (!text.trim()) return null;

  // Step 1: Local pre-filter
  onStep?.('scanning');
  const pf = preFilter(text);

  // No financial content at all → plain text, no AI call needed
  if (!pf.hasFinancialContent) {
    return { intent: 'plain', extractions: [], confidence: 'high', source: 'local' };
  }

  // Step 2: Check AI quota + cooldown
  const premium = usePremiumStore.getState();
  const aiAvailable = premium.canUseAI() && isGeminiAvailable();
  if (!aiAvailable) {
    // Over quota or rate-limited — fallback to local only
    onStep?.('local');
    if (pf.amounts.length > 0 && pf.hintIntent) {
      const r = buildLocalResult(text, pf.amounts, pf.hintIntent);
      return { ...r, source: 'local' };
    }
    return { intent: 'plain', extractions: [], confidence: 'low', source: 'local' };
  }

  // Step 3: Try Gemini for structured extraction
  onStep?.('ai');
  const geminiRaw = await callGemini(text, walletNames, {
    knownPeople: opts?.knownPeople,
    retry: !!opts?.retryPrevious,
    previous: opts?.retryPrevious,
  });
  if (geminiRaw) {
    // Reading a note with the cloud AI spends ONE credit (the offline reader is the
    // no-credit fallback once the monthly bucket is empty). Retry is a second read → also 1.
    usePremiumStore.getState().incrementAiCalls();
    const result = parseGeminiResponse(geminiRaw);
    if (result && result.extractions.length > 0) {
      // Enrich with local + learned patterns
      const learning = useLearningStore.getState();
      for (const ext of result.extractions) {
        const data = ext.extractedData;
        // Don't tag debts with an expense category (would show as "other · <person>").
        if (!data.category && ext.type !== 'debt' && ext.type !== 'debt_update') {
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
      return { ...result, source: 'ai' };
    }
    // Gemini returned but with empty items — trust it
    if (result) return { ...result, source: 'ai' };
  }

  // Step 4: Fallback to local-only extraction
  onStep?.('local');
  if (pf.amounts.length > 0 && pf.hintIntent) {
    const r = buildLocalResult(text, pf.amounts, pf.hintIntent);
    return { ...r, source: 'local' };
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
