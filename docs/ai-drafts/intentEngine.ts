// ═══════════════════════════════════════════════════════════════════
// src/services/intentEngine.ts
// 
// The brain of Notes-First. Classifies Manglish text into financial
// intents and extracts structured data using Gemini 2.5 Flash-Lite.
//
// Flow: User writes → manglishPreFilter → Gemini classify → return result
// ═══════════════════════════════════════════════════════════════════

import { EXPO_PUBLIC_GOOGLE_GEMINI_API_KEY } from '@env';

// ── Types ──────────────────────────────────────────────────────────

export type IntentType =
  | 'expense'
  | 'income'
  | 'debt'
  | 'debt_update'
  | 'bnpl'
  | 'seller_order'
  | 'seller_cost'
  | 'query'
  | 'savings_goal'
  | 'transfer'
  | 'plain';

export interface Extraction {
  amount: number | null;
  currency: string;
  category: string | null;
  wallet: string | null;
  contact: string | null;
  debtDirection: 'i_owe' | 'they_owe' | null;
  description: string;
  isBNPL: boolean;
  items?: { name: string; quantity: number; unit: string; pricePerUnit: number }[];
}

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  extractions: Extraction[];
  rawText: string;
}

// ── Manglish Pre-Filter (local, no API call) ──────────────────────
// Catches obvious patterns before hitting Gemini. Saves tokens.

interface PreFilterHint {
  likelyIntent: IntentType | null;
  hasAmount: boolean;
  detectedAmount: number | null;
  keywords: string[];
}

export function manglishPreFilter(text: string): PreFilterHint {
  const lower = text.toLowerCase().trim();
  const hint: PreFilterHint = {
    likelyIntent: null,
    hasAmount: false,
    detectedAmount: null,
    keywords: [],
  };

  // Detect RM amounts
  const amountMatch = lower.match(/rm\s?(\d+(?:\.\d{1,2})?)/);
  if (amountMatch) {
    hint.hasAmount = true;
    hint.detectedAmount = parseFloat(amountMatch[1]);
  }

  // Query detection (questions)
  const queryPatterns = [
    /^berapa/, /^apa/, /^macam\s?mana/, /^how\s?much/, /^total/,
    /^kenapa/, /^bila/, /^mana/, /\?$/,
  ];
  if (queryPatterns.some(p => p.test(lower))) {
    hint.likelyIntent = 'query';
    hint.keywords.push('query');
    return hint;
  }

  // BNPL detection
  const bnplKeywords = ['spaylater', 'atome', 'tiktok pay', 'shopee pay later', 'bnpl', 'pay later', 'bayar bulan depan', 'ansuran'];
  const foundBnpl = bnplKeywords.filter(k => lower.includes(k));
  if (foundBnpl.length > 0) {
    hint.likelyIntent = 'bnpl';
    hint.keywords.push(...foundBnpl);
    return hint;
  }

  // Debt detection
  const debtKeywords = ['hutang', 'pinjam', 'owe', 'owes', 'bayar balik', 'dah bayar', 'belum bayar', 'settle'];
  const foundDebt = debtKeywords.filter(k => lower.includes(k));
  if (foundDebt.length > 0) {
    hint.likelyIntent = lower.includes('dah bayar') || lower.includes('bayar balik') || lower.includes('settle')
      ? 'debt_update'
      : 'debt';
    hint.keywords.push(...foundDebt);
    return hint;
  }

  // Income detection
  const incomeKeywords = ['gaji', 'salary', 'masuk', 'terima', 'dapat', 'freelance payment', 'client bayar', 'bonus'];
  const foundIncome = incomeKeywords.filter(k => lower.includes(k));
  if (foundIncome.length > 0) {
    hint.likelyIntent = 'income';
    hint.keywords.push(...foundIncome);
    return hint;
  }

  // Seller/business detection
  const sellerKeywords = ['buat', 'jual', 'order', 'tempahan', 'kos bahan', 'ingredient', 'cost', 'production', 'balang', 'tin', 'kotak', 'pack'];
  const foundSeller = sellerKeywords.filter(k => lower.includes(k));
  if (foundSeller.length > 0) {
    hint.likelyIntent = lower.includes('kos') || lower.includes('cost') || lower.includes('ingredient') || lower.includes('bahan')
      ? 'seller_cost'
      : 'seller_order';
    hint.keywords.push(...foundSeller);
    return hint;
  }

  // Savings goal detection
  const savingsKeywords = ['nak save', 'nak simpan', 'target', 'goal', 'saving for', 'simpan untuk'];
  const foundSavings = savingsKeywords.filter(k => lower.includes(k));
  if (foundSavings.length > 0) {
    hint.likelyIntent = 'savings_goal';
    hint.keywords.push(...foundSavings);
    return hint;
  }

  // Transfer detection
  const transferKeywords = ['transfer', 'pindah', 'topup', 'top up', 'reload'];
  const foundTransfer = transferKeywords.filter(k => lower.includes(k));
  if (foundTransfer.length > 0) {
    hint.likelyIntent = 'transfer';
    hint.keywords.push(...foundTransfer);
    return hint;
  }

  // If has amount but no specific keywords → likely expense
  if (hint.hasAmount) {
    hint.likelyIntent = 'expense';
    return hint;
  }

  // No financial signal → plain note
  hint.likelyIntent = 'plain';
  return hint;
}

// ── The Gemini System Prompt ──────────────────────────────────────
// This is the core prompt. It teaches Gemini how Malaysians talk about money.

function buildSystemPrompt(
  mode: 'personal' | 'business',
  walletNames: string[],
  categoryNames: string[],
  businessType?: string,
): string {
  return `You are the AI brain of Potraces, a Malaysian personal finance app. Your job is to read natural text written by Malaysian young adults and extract financial data from it.

CRITICAL CONTEXT:
- Users write in Manglish (mixed Malay + English, informal, with abbreviations)
- They use Malaysian Ringgit (RM/MYR)
- They reference Malaysian payment methods: Touch n Go (TNG), GrabPay, Boost, DuitNow, SPayLater, Atome, TikTok Pay Later, Shopee Pay Later
- They abbreviate: "tapau" = takeaway food, "mamak" = Indian Muslim restaurant, "pasar" = market, "kedai" = shop, "makan" = eat/food, "gi" / "pergi" = go, "dgn" = dengan = with, "tak" = tidak = not, "dah" = sudah = already, "nak" = want, "bayar" = pay, "beli" = buy, "jual" = sell, "hutang" = debt, "pinjam" = borrow/lend, "simpan" = save
- Current app mode: ${mode}
${businessType ? `- Business type: ${businessType}` : ''}

AVAILABLE WALLETS (match user text to these):
${walletNames.length > 0 ? walletNames.map(w => `- ${w}`).join('\n') : '- Cash\n- (no wallets configured yet)'}

AVAILABLE CATEGORIES (match user text to these):
${categoryNames.length > 0 ? categoryNames.map(c => `- ${c}`).join('\n') : '- Food\n- Transport\n- Shopping\n- Bills\n- Entertainment\n- Health\n- Education\n- Other'}

CLASSIFICATION RULES:
1. Each line or sentence in the text may contain a separate financial entry
2. If text contains "RM" + number → almost certainly financial (expense, income, debt, or BNPL)
3. BNPL detection: any mention of SPayLater, Atome, TikTok Pay Later, Shopee Pay Later, "ansuran", "bayar bulan depan" → mark as BNPL
4. Debt direction:
   - "hutang dgn [name]" or "pinjam dari [name]" or "owe [name]" → I owe them (i_owe)
   - "[name] hutang aku" or "[name] pinjam aku" or "[name] owes me" or "[name] tak bayar lagi" → they owe me (they_owe)
   - "dah bayar balik" or "[name] dah settle" → debt_update (mark existing debt as paid)
5. Wallet matching: "cash" / "tunai" → Cash, "TNG" / "touch n go" → Touch n Go, "grab" (for payment) → GrabPay, "bank" → first bank wallet, "kad" / "card" / "credit" → first credit wallet
6. Category matching: "makan" / "tapau" / "lunch" / "dinner" / "mamak" / "nasi" → Food, "grab" (for ride) / "parking" / "tol" / "petrol" / "LRT" / "MRT" → Transport, "shopee" / "lazada" / "beli baju" → Shopping
7. Questions (berapa, apa, macam mana, how much, total, kenapa) → intent: "query"
8. No RM, no financial keywords, no question marks → intent: "plain" (just a note, no data to extract)
${mode === 'business' ? `
BUSINESS MODE RULES:
- "buat X [unit] [product]" → seller_order (production entry)
- "kos bahan" / "beli bahan" / "ingredient cost" → seller_cost
- "jual" / "order masuk" / "customer nak" → seller_order
- Units: tin, balang, kotak, biji, pack, bekas — keep as-is
` : ''}

RESPONSE FORMAT:
Return ONLY valid JSON. No markdown. No backticks. No explanation.
{
  "intent": "expense|income|debt|debt_update|bnpl|seller_order|seller_cost|query|savings_goal|transfer|plain",
  "confidence": 0.0 to 1.0,
  "extractions": [
    {
      "amount": number or null,
      "currency": "MYR",
      "category": "matched category name" or null,
      "wallet": "matched wallet name" or null,
      "contact": "person name" or null,
      "debtDirection": "i_owe" or "they_owe" or null,
      "description": "short description of this entry",
      "isBNPL": true/false,
      "items": [{"name": "product", "quantity": 2, "unit": "tin", "pricePerUnit": 15}] or null
    }
  ]
}

If multiple financial entries exist in the text, return multiple objects in the extractions array.
If the text is a plain note with no financial content, return: {"intent": "plain", "confidence": 1.0, "extractions": []}
If the text is a query/question, return: {"intent": "query", "confidence": 1.0, "extractions": [], "queryText": "the user's question"}`;
}

// ── Gemini API Call ───────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

async function callGemini(systemPrompt: string, userText: string): Promise<any> {
  const response = await fetch(`${GEMINI_API_URL}?key=${EXPO_PUBLIC_GOOGLE_GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userText }],
        },
      ],
      generationConfig: {
        temperature: 0.1,       // Low temp = more deterministic classification
        topP: 0.8,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',  // Force JSON output
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Empty response from Gemini');
  }

  // Parse JSON (handle potential markdown wrapping)
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

// ── Main Intent Engine Function ──────────────────────────────────
// This is what you call from the UI.

export async function classifyIntent(
  text: string,
  options: {
    mode: 'personal' | 'business';
    walletNames: string[];
    categoryNames: string[];
    businessType?: string;
  },
): Promise<IntentResult> {
  const trimmed = text.trim();

  // Skip empty text
  if (!trimmed) {
    return { intent: 'plain', confidence: 1.0, extractions: [], rawText: trimmed };
  }

  // Step 1: Local pre-filter
  const hint = manglishPreFilter(trimmed);

  // If pre-filter says plain note with high confidence, skip API call
  if (hint.likelyIntent === 'plain' && !hint.hasAmount) {
    return { intent: 'plain', confidence: 0.9, extractions: [], rawText: trimmed };
  }

  // Step 2: Call Gemini for classification + extraction
  try {
    const systemPrompt = buildSystemPrompt(
      options.mode,
      options.walletNames,
      options.categoryNames,
      options.businessType,
    );

    const result = await callGemini(systemPrompt, trimmed);

    return {
      intent: result.intent || 'plain',
      confidence: result.confidence || 0.5,
      extractions: result.extractions || [],
      rawText: trimmed,
    };
  } catch (error) {
    console.warn('[IntentEngine] Gemini call failed, falling back to plain note:', error);

    // Graceful fallback: if pre-filter detected something, use that
    if (hint.likelyIntent && hint.likelyIntent !== 'plain' && hint.hasAmount) {
      return {
        intent: hint.likelyIntent,
        confidence: 0.4,
        extractions: [{
          amount: hint.detectedAmount,
          currency: 'MYR',
          category: null,
          wallet: null,
          contact: null,
          debtDirection: null,
          description: trimmed,
          isBNPL: hint.keywords.some(k => ['spaylater', 'atome', 'tiktok pay'].includes(k)),
        }],
        rawText: trimmed,
      };
    }

    // Full fallback: save as plain note
    return { intent: 'plain', confidence: 0.3, extractions: [], rawText: trimmed };
  }
}
