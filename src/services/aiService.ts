import { AIMessage, Transaction, IncomeType, BusinessTransaction, RiderCost, Client, SellerProduct, FreelancerClient, PartTimeJobDetails, OnTheRoadDetails, MixedModeDetails } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import { readAsStringAsync, deleteAsync, EncodingType } from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { aiProxyFetch, isAiProxyConfigured } from './aiProxy';
import { streamGeminiText } from './geminiClient';

// ─── Anthropic API Types ────────────────────────────────

interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
}

/** Shape of a raw parsed product from AI JSON before validation. */
interface RawParsedProduct {
  name?: unknown;
  pricePerUnit?: unknown;
  costPerUnit?: unknown;
  unit?: unknown;
  description?: unknown;
  category?: unknown;
  stock?: unknown;
  isDuplicate?: unknown;
}

/** Shape of a raw WhatsApp order item from AI JSON before validation. */
interface RawWhatsAppItem {
  productName?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

// ─── Gemini Vision Response Types ───────────────────────

interface GeminiVisionPart {
  text?: string;
}

interface GeminiVisionCandidate {
  content?: { parts?: GeminiVisionPart[] };
}

interface GeminiVisionResponse {
  candidates?: GeminiVisionCandidate[];
}

const MODEL = 'claude-haiku-4-5-20251001';
const CHAT_MODEL = 'claude-sonnet-4-6'; // conversational Echo — needs personality, not just speed

// Regulatory guard (SC/CMSA + FSA): AI answers are general information only, never
// licensed financial/investment advice. Appended to every money-answering prompt.
const ADVICE_GUARD =
  "You give general information only — NOT financial, investment, tax, or legal advice. " +
  "Never recommend specific financial products or promise/guarantee returns. If asked for that, " +
  "say you can't give advice and suggest speaking to a licensed adviser.";

let _lastAnthropicCall = 0;
const ANTHROPIC_COOLDOWN_MS = 1000;

const categoryNames = [
  ...EXPENSE_CATEGORIES.map((c) => c.name),
  ...INCOME_CATEGORIES.map((c) => c.name),
];

export interface ParsedTransaction {
  amount: number;
  category: string;
  description: string;
  type: 'expense' | 'income';
  confidence: 'high' | 'low';
}

async function callAnthropic(
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number,
  model: string = MODEL,
  prefill?: string
): Promise<string | null> {
  if (!isAiProxyConfigured()) return null;

  // Prefill: seed the assistant's response so it continues from that point.
  // The model physically cannot insert a filler opener before the prefill.
  const msgsWithPrefill = prefill
    ? [...messages, { role: 'assistant' as const, content: prefill }]
    : messages;

  const now = Date.now();
  const elapsed = now - _lastAnthropicCall;
  if (elapsed < ANTHROPIC_COOLDOWN_MS) {
    await new Promise((r) => setTimeout(r, ANTHROPIC_COOLDOWN_MS - elapsed));
  }
  _lastAnthropicCall = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await aiProxyFetch({
      provider: 'anthropic',
      mode: 'generate',
      model,
      payload: { model, max_tokens: maxTokens, system, messages: msgsWithPrefill },
    }, controller.signal);

    if (!response.ok) return null;

    const data: AnthropicResponse = await response.json();
    const content = data?.content?.[0];
    if (!content || content.type !== 'text') return null;

    // Prepend the prefill since the API returns only the continuation
    const text = content.text ?? null;
    if (!text) return null;
    return prefill ? prefill + text : text;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Strip markdown JSON fences from AI response.
 * Claude often wraps JSON in ```json ... ``` blocks.
 */
function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

/**
 * Parse natural language text into a transaction.
 * Never throws — returns null on failure.
 */
export async function parseTextInput(
  text: string
): Promise<ParsedTransaction | null> {
  try {
    const result = await callAnthropic(
      `You are a financial transaction parser for a Malaysian user. Given natural language, extract: amount (number), category (string from this list: ${categoryNames.join(', ')}), description (string), type ('expense' | 'income'). Return JSON only. If unsure about any field, set confidence to 'low'. Default currency is MYR.`,
      [{ role: 'user', content: text }],
      256
    );

    if (!result) return null;

    const json = JSON.parse(stripJsonFences(result));
    let amount = Number(json.amount) || 0;
    if (amount <= 0) return null;
    if (amount > 1_000_000) amount = 0;
    if (amount <= 0) return null;
    return {
      amount,
      category: String(json.category || ''),
      description: String(json.description || ''),
      type: json.type === 'income' ? 'income' : 'expense',
      confidence: json.confidence === 'high' ? 'high' : 'low',
    };
  } catch {
    return null;
  }
}

/**
 * Parse OCR receipt text into a transaction.
 * Never throws — returns null on failure.
 */
export async function parseReceiptText(
  ocrText: string
): Promise<ParsedTransaction | null> {
  try {
    const result = await callAnthropic(
      `You are a receipt parser. Given OCR text from a Malaysian receipt, extract the total amount, merchant name as description, and suggest a category from this list: ${categoryNames.join(', ')}. Return JSON only with fields: amount (number), category (string), description (string), type (always 'expense'), confidence ('high' or 'low').`,
      [{ role: 'user', content: ocrText }],
      256
    );

    if (!result) return null;

    const json = JSON.parse(stripJsonFences(result));
    let amount = Number(json.amount) || 0;
    if (amount <= 0) return null;
    if (amount > 1_000_000) amount = 0;
    if (amount <= 0) return null;
    return {
      amount,
      category: String(json.category || ''),
      description: String(json.description || ''),
      type: 'expense',
      confidence: json.confidence === 'high' ? 'high' : 'low',
    };
  } catch {
    return null;
  }
}

/**
 * Ask a question about money/spending with conversation history.
 * Never throws — returns null on failure.
 */
export async function askMoneyQuestion(
  question: string,
  history: AIMessage[],
  transactions: Transaction[]
): Promise<string | null> {
  try {
    // Build a brief transaction summary
    const recentTxns = transactions.slice(0, 50);
    const totalExpenses = recentTxns
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = recentTxns
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const categoryTotals: Record<string, number> = {};
    for (const t of recentTxns.filter((t) => t.type === 'expense')) {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    }

    const summary = `User's recent data: ${recentTxns.length} transactions, total expenses RM ${totalExpenses.toFixed(2)}, total income RM ${totalIncome.toFixed(2)}. Top categories: ${Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, amt]) => `${cat} RM ${amt.toFixed(2)}`)
      .join(', ')}.`;

    // Detect language to pick right prefill and examples
    const isMalay = /\b(aku|kau|dia|saya|kita|boleh|tak|lah|sia|banyak|duit|macam|berapa|kenapa|camne|gaji|belanja|simpan|hutang|kaya|miskin|pokai|weh|wei|bro|kan|je|je lah|memang|mana|tau|tahu)\b/i.test(question);

    // Few-shot examples — include both EN and BM to show style in both languages
    const echoExamples: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: 'am i rich chat?' },
      { role: 'assistant', content: 'not rich-rich lah — but RM 6k net after debts with RM 8k cash? not pokai either. boleh tahan.' },
      { role: 'user', content: 'banyak sia duit aku' },
      { role: 'assistant', content: 'banyak ke? RM 6k net je sebenarnya. tapi takde la pokai, oklah tu.' },
      { role: 'user', content: 'kenapa aku selalu pokai' },
      { role: 'assistant', content: 'makan je dah habis 40% duit kau setiap bulan. tu la pasal.' },
      { role: 'user', content: 'how much did i spend this month' },
      { role: 'assistant', content: 'RM 1,840 out, RM 4,500 in. kept 59% — better than last month.' },
    ];

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...echoExamples,
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    return await callAnthropic(
      `You are Echo — a financial companion for a young Malaysian. Always reply in the SAME language the user writes in. Malay message = Malay reply. English = English. Manglish = Manglish. Short, direct, casual. Use RM. Max 2 sentences. ${ADVICE_GUARD}

${summary}`,
      messages,
      150,
      CHAT_MODEL,
      isMalay ? 'eh,' : 'tbh,' // prefill forces casual opener, no filler
    );
  } catch {
    return null;
  }
}

/**
 * Ask a business-context question with conversation history.
 * Never throws — returns null on failure.
 */
export async function askBusinessQuestion(
  question: string,
  context: {
    incomeType: IncomeType;
    transactions: BusinessTransaction[];
    riderCosts?: RiderCost[];
    clients?: Client[];
    monthlyAverage: number;
  },
  history: AIMessage[]
): Promise<string | null> {
  try {
    const { incomeType, transactions, riderCosts, clients, monthlyAverage } = context;
    const recentTxns = transactions.slice(0, 50);
    const totalIncome = recentTxns
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalCosts = recentTxns
      .filter((t) => t.type === 'cost')
      .reduce((sum, t) => sum + t.amount, 0);
    const riderCostTotal = (riderCosts || []).reduce((sum, r) => sum + r.amount, 0);

    let contextSummary = `Income type: ${incomeType}. Recent: ${recentTxns.length} transactions, total income RM ${totalIncome.toFixed(2)}, costs RM ${(totalCosts + riderCostTotal).toFixed(2)}, kept RM ${(totalIncome - totalCosts - riderCostTotal).toFixed(2)}. 6-month average monthly: RM ${monthlyAverage.toFixed(2)}.`;

    if (clients && clients.length > 0) {
      contextSummary += ` ${clients.length} clients, total received RM ${clients.reduce((s, c) => s + c.totalPaid, 0).toFixed(2)}.`;
    }

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    return await callAnthropic(
      `You are a calm, honest money companion for a Malaysian gig worker or small earner.\nYou understand that income is irregular and unpredictable.\nNever compare the user to a standard or ideal.\nNever use words like "should", "must", "discipline", or "goal".\nWhen asked about slow months, normalize them — they are part of this kind of work.\nWhen asked about affordability, calculate from realistic average income, not current month.\nIf the user earns from multiple sources, treat that as a strength, not complexity.\nKeep responses under 4 sentences.\nSpeak plainly. No jargon.\n${ADVICE_GUARD}\n\n${contextSummary}`,
      messages,
      150,
      CHAT_MODEL
    );
  } catch {
    return null;
  }
}

/**
 * Parse a bulk product list into structured products using AI.
 * Accepts any format — comma-separated, one per line, table, etc.
 * Returns array of parsed products or null on failure.
 */
export interface ParsedProduct {
  name: string;
  pricePerUnit: number;
  costPerUnit?: number;
  unit: string;
  description?: string;
  category?: string;
  stock?: number;
  isDuplicate?: boolean;
}

const PRODUCT_PARSE_SYSTEM = (units: string[], existingProducts?: string[]) =>
  `Extract products from Malaysian seller input. JSON array only, no markdown.
Units: ${units.join(',')}. Map Malay: biji/keping→pcs,bungkus→pack,kotak→box,balang→jar,loyang→tray. Default pcs.
MYR currency (rm5,RM 5,5 ringgit). Title case names.
Category if obvious: kuih→Kuih,biskut/cookies→Biskut,minuman→Minuman,nasi→Nasi,roti→Roti.
${existingProducts?.length ? `Existing: ${existingProducts.slice(0, 20).join(',')}. isDuplicate=true if match.` : 'isDuplicate=false.'}
[{"name":"","pricePerUnit":0,"costPerUnit":null,"unit":"pcs","description":null,"category":null,"stock":null,"isDuplicate":false}]`;

function extractJsonArray(raw: string): unknown[] | null {
  // Try direct parse first
  const stripped = stripJsonFences(raw);
  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) return parsed as unknown[];
  } catch {}

  // Fallback: find the first [...] block in the text
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed as unknown[];
    } catch {}
  }

  return null;
}

function parseParsedProducts(raw: string): ParsedProduct[] | null {
  const parsed = extractJsonArray(raw);
  if (!parsed) return null;
  return parsed.map((item: unknown) => {
    const p = item as RawParsedProduct;
    return {
      name: String(p.name || '').trim(),
      pricePerUnit: Number(p.pricePerUnit) || 0,
      costPerUnit: p.costPerUnit ? Number(p.costPerUnit) : undefined,
      unit: String(p.unit || 'pcs'),
      description: p.description ? String(p.description).trim() : undefined,
      category: p.category ? String(p.category).trim() : undefined,
      stock: p.stock ? Number(p.stock) : undefined,
      isDuplicate: Boolean(p.isDuplicate),
    };
  }).filter((p: ParsedProduct) => p.name.length > 0);
}

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export async function parseProductList(
  text: string,
  existingUnits: string[],
  existingProducts?: string[]
): Promise<ParsedProduct[] | null> {
  if (isAiProxyConfigured()) {
    try {
      const response = await aiProxyFetch({
        provider: 'gemini',
        mode: 'generate',
        model: GEMINI_MODEL,
        payload: {
          contents: [{ parts: [{ text: PRODUCT_PARSE_SYSTEM(existingUnits, existingProducts) + '\n\n' + text }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        },
      });
      if (response.ok) {
        const data: GeminiVisionResponse = await response.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (raw) return parseParsedProducts(raw);
      }
    } catch {}
  }

  try {
    const result = await callAnthropic(
      PRODUCT_PARSE_SYSTEM(existingUnits, existingProducts),
      [{ role: 'user', content: text }],
      2048
    );
    if (!result) return null;
    return parseParsedProducts(result);
  } catch {
    return null;
  }
}

export async function parseProductImage(
  imageUri: string,
  existingUnits: string[],
  existingProducts?: string[]
): Promise<ParsedProduct[] | null> {
  if (!isAiProxyConfigured()) return null;

  const resized = await manipulateAsync(imageUri, [{ resize: { width: 1024 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
  const base64 = resized.base64 || await readAsStringAsync(resized.uri, { encoding: EncodingType.Base64 });

  const response = await aiProxyFetch({
    provider: 'gemini',
    mode: 'generate',
    model: GEMINI_MODEL,
    payload: {
      contents: [{
        parts: [
          { text: `Extract EVERY product from this image (catalog, menu, price list, flyer). Name and price are required. Ignore watermarks, logos, and contact info.\n${PRODUCT_PARSE_SYSTEM(existingUnits, existingProducts)}` },
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' },
    },
  });

  if (!response.ok) {
    if (__DEV__) {
      const err = await response.text().catch(() => '');
      console.warn('[parseProductImage]', response.status, err.slice(0, 200));
    }
    return null;
  }

  const data: GeminiVisionResponse = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  return parseParsedProducts(text);
}

const TRANSCRIBE_PROMPT =
  'Transcribe this audio VERBATIM. The speaker is Malaysian and mixes Malay and ' +
  'English (Manglish). Output ONLY the exact spoken words in the language(s) spoken. ' +
  'Do NOT translate. Do NOT add quotes, labels, punctuation commentary, or any notes. ' +
  'Keep numbers as digits and money as written (e.g. RM 50, 12.50). ' +
  'If nothing intelligible was said, output nothing.';

/**
 * VERBATIM transcription of a short speech clip via the AI proxy → Gemini (the same backend Echo chat
 * uses; provider keys stay server-side). Reads the persisted WAV at `uri`, sends it as audio inlineData,
 * returns the spoken words ONLY, or null. ALWAYS deletes the temp clip afterward (success or failure) so
 * audio never lingers on disk. Never throws.
 */
export async function transcribeAudio(
  uri: string,
  mimeType: string = 'audio/wav',
  onPartial?: (text: string) => void,
): Promise<string | null> {
  if (!isAiProxyConfigured() || !uri) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    if (!base64) return null;

    // Live "types in" reveal: when a partial sink is given, STREAM the transcript word-by-word (the
    // proxy already supports SSE). On any stream failure / empty result, fall through to the batch call.
    if (onPartial) {
      try {
        let soFar = '';
        for await (const partial of streamGeminiText({
          contents: [{
            role: 'user',
            parts: [{ text: TRANSCRIBE_PROMPT }, { inlineData: { mimeType, data: base64 } }],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
        })) {
          soFar = partial;
          onPartial(soFar);
        }
        if (soFar.trim()) return soFar.trim();
      } catch {
        // stream unavailable/aborted → batch request below
      }
    }

    const response = await aiProxyFetch(
      {
        provider: 'gemini',
        mode: 'generate',
        model: GEMINI_MODEL, // gemini-2.5-flash-lite — accepts audio inlineData
        payload: {
          contents: [{
            parts: [
              { text: TRANSCRIBE_PROMPT },
              { inlineData: { mimeType, data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 }, // plain text, no responseMimeType
        },
      },
      controller.signal,
    );

    if (!response.ok) {
      if (__DEV__) {
        const err = await response.text().catch(() => '');
        console.warn('[transcribeAudio]', response.status, err.slice(0, 200));
      }
      return null; // includes 403 budget / 429 cooldown
    }

    const data: GeminiVisionResponse = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch {
    return null; // includes the 30s abort
  } finally {
    clearTimeout(timeout);
    deleteAsync(uri, { idempotent: true }).catch(() => {}); // privacy: the clip never lingers
  }
}

/**
 * Parse a WhatsApp message into order items using AI.
 * Used when local parsing (parseWhatsAppOrder) can't match products.
 * Returns structured items array or null on failure.
 */
export interface ParsedWhatsAppItem {
  productName: string;
  quantity: number;
  unit: string;
}

export async function parseWhatsAppOrderAI(
  message: string,
  products: SellerProduct[]
): Promise<ParsedWhatsAppItem[] | null> {
  try {
    const productList = products
      .filter((p) => p.isActive)
      .map((p) => `${p.name} (${p.unit}, RM ${p.pricePerUnit})`)
      .join(', ');

    const result = await callAnthropic(
      `You are a WhatsApp order parser for a Malaysian home-based food seller.\nThe seller's products: ${productList}\n\nGiven a WhatsApp message (often in Malay), extract the order items.\nReturn JSON array only. Each item: { "productName": string (exact name from product list), "quantity": number, "unit": string }.\nIf a product in the message doesn't match any known product, use the name as written.\nCommon Malay patterns: "nak order" = want to order, "dan" = and, "tin/bekas/balang/kotak" = container types.\nIf quantity is not specified, default to 1.\nReturn [] if the message is not an order.`,
      [{ role: 'user', content: message }],
      512
    );

    if (!result) return null;

    const parsed = JSON.parse(stripJsonFences(result));
    if (!Array.isArray(parsed)) return null;

    return parsed.map((item: unknown) => {
      const w = item as RawWhatsAppItem;
      return {
        productName: String(w.productName || ''),
        quantity: Number(w.quantity) || 1,
        unit: String(w.unit || 'balang'),
      };
    });
  } catch {
    return null;
  }
}

/**
 * Build context string for freelancer-mode AI calls.
 */
export function buildFreelancerContext(
  payments: BusinessTransaction[],
  clients: FreelancerClient[],
  sixMonthAverage: number,
  currentMonthTotal: number,
  getClientAverageGap?: (clientId: string) => number | null
): string {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const recentPayments = payments
    .filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return d >= ninetyDaysAgo && t.type === 'income';
    })
    .slice(0, 30);

  const activeClients = clients.filter((c) => {
    const lastPay = payments.find(
      (t) => t.clientId === c.id && t.type === 'income'
    );
    if (!lastPay) return false;
    const d = lastPay.date instanceof Date ? lastPay.date : new Date(lastPay.date);
    return d >= ninetyDaysAgo;
  });

  const quietClients = clients.filter((c) => !activeClients.includes(c));

  let ctx = `Freelancer mode. 6-month average monthly: RM ${sixMonthAverage.toFixed(0)}. This month so far: RM ${currentMonthTotal.toFixed(0)}. ${activeClients.length} active client(s), ${quietClients.length} quiet.`;

  if (recentPayments.length > 0) {
    const paymentLines = recentPayments
      .map((t) => {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        const clientName = clients.find((c) => c.id === t.clientId)?.name || 'unknown';
        return `RM ${t.amount} from ${clientName} on ${d.toISOString().slice(0, 10)}`;
      })
      .join('; ');
    ctx += ` Recent: ${paymentLines}.`;
  }

  if (getClientAverageGap) {
    const gapInfo = activeClients
      .map((c) => {
        const avg = getClientAverageGap(c.id);
        return avg !== null ? `${c.name}: ~${avg}d between payments` : null;
      })
      .filter(Boolean);
    if (gapInfo.length > 0) {
      ctx += ` Gaps: ${gapInfo.join(', ')}.`;
    }
  }

  // Check single client concentration
  if (recentPayments.length > 0) {
    const clientTotals: Record<string, number> = {};
    for (const t of recentPayments) {
      const key = t.clientId || 'unknown';
      clientTotals[key] = (clientTotals[key] || 0) + t.amount;
    }
    const total = Object.values(clientTotals).reduce((a, b) => a + b, 0);
    const topClient = Object.entries(clientTotals).sort((a, b) => b[1] - a[1])[0];
    if (topClient && total > 0 && topClient[1] / total > 0.7) {
      const name = clients.find((c) => c.id === topClient[0])?.name || 'one client';
      ctx += ` Note: ${name} accounts for ${Math.round((topClient[1] / total) * 100)}% of recent income.`;
    }
  }

  return ctx;
}

const FREELANCER_SYSTEM_PROMPT = `This person freelances for a living. Irregular income is their normal — never treat it as a problem.
Never suggest they need more clients, more hustle, or higher rates unless they directly ask.
If asked about financial planning, use their 6-month average as the planning number, not current month.
NEVER use these banned words: profit, loss, revenue, ROI, inventory, sales, pipeline, billable hours, utilization, invoice.
Always use approved Potraces vocabulary: kept (not profit), came in (not revenue), went out (not loss), costs (not expenses), efficiency (not ROI), products (not inventory), earned, payments, clients, work.
Malaysian context. Mix of English and Malay is natural. Under 4 sentences. No jargon.`;

/**
 * Ask a freelancer-context question with conversation history.
 * Never throws — returns null on failure.
 */
export async function askFreelancerQuestion(
  question: string,
  context: {
    payments: BusinessTransaction[];
    clients: FreelancerClient[];
    sixMonthAverage: number;
    currentMonthTotal: number;
    getClientAverageGap?: (clientId: string) => number | null;
  },
  history: AIMessage[]
): Promise<string | null> {
  try {
    const contextStr = buildFreelancerContext(
      context.payments,
      context.clients,
      context.sixMonthAverage,
      context.currentMonthTotal,
      context.getClientAverageGap
    );

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    return await callAnthropic(
      `${FREELANCER_SYSTEM_PROMPT}\n\n${contextStr}`,
      messages,
      400
    );
  } catch {
    return null;
  }
}

/**
 * Build context string for part-time-mode AI calls.
 */
export function buildPartTimeContext(
  transactions: BusinessTransaction[],
  jobDetails: PartTimeJobDetails,
  currentMonthMain: number,
  currentMonthSide: number,
  averageSidePercentage: number
): string {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const recentIncome = transactions
    .filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return d >= ninetyDaysAgo && t.type === 'income';
    })
    .slice(0, 30);

  const total = currentMonthMain + currentMonthSide;
  const sidePercentage = total > 0 ? Math.round((currentMonthSide / total) * 100) : 0;

  let ctx = `Part-time mode.`;

  if (jobDetails.jobName) {
    ctx += ` Main job: ${jobDetails.jobName}.`;
  }
  if (jobDetails.expectedMonthlyPay) {
    ctx += ` Expected monthly pay: RM ${jobDetails.expectedMonthlyPay.toFixed(0)}.`;
  }

  ctx += ` This month: main job RM ${currentMonthMain.toFixed(0)}, side income RM ${currentMonthSide.toFixed(0)} (${sidePercentage}% side).`;
  ctx += ` 6-month average side share: ${averageSidePercentage.toFixed(0)}%.`;

  if (jobDetails.payDay) {
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const effectivePayDay = Math.min(jobDetails.payDay, daysInMonth);
    const mainLogged = currentMonthMain > 0;

    if (dayOfMonth > effectivePayDay) {
      ctx += mainLogged
        ? ` Pay day passed, main job income logged.`
        : ` Pay day passed, main job income NOT yet logged.`;
    } else {
      ctx += ` Pay day in ${effectivePayDay - dayOfMonth} days.`;
    }
  }

  const allDates = transactions.filter((t) => t.type === 'income').map((t) => {
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    return `${d.getFullYear()}-${d.getMonth()}`;
  });
  const uniqueMonths = new Set(allDates).size;
  ctx += ` ${uniqueMonths} month(s) of data available.`;

  if (recentIncome.length > 0) {
    const lines = recentIncome
      .map((t) => {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        const stream = t.incomeStream || 'unknown';
        return `RM ${t.amount} (${stream}) on ${d.toISOString().slice(0, 10)}`;
      })
      .join('; ');
    ctx += ` Recent: ${lines}.`;
  }

  return ctx;
}

const PARTTIME_SYSTEM_PROMPT = `This person has a main job and earns side income. Both are normal parts of their financial life.
Never celebrate side income as "hustling" or "grinding." It is just another income stream.
Never suggest they should do more side work or optimize their time.
If side income is higher than their main job, state it as a plain observation, not an achievement.
The main job is the anchor for financial planning. Side income is additional context.
Never use: hustle, grind, side hustle, passive income, moonlighting, extra income.
Always use: main job, side income, came in, earned, streams.
Malaysian context. Mix of English and Malay is natural. Under 4 sentences. No jargon.`;

/**
 * Ask a part-time-context question with conversation history.
 * Never throws — returns null on failure.
 */
export async function askPartTimeQuestion(
  question: string,
  context: {
    transactions: BusinessTransaction[];
    jobDetails: PartTimeJobDetails;
    currentMonthMain: number;
    currentMonthSide: number;
    averageSidePercentage: number;
  },
  history: AIMessage[]
): Promise<string | null> {
  try {
    const contextStr = buildPartTimeContext(
      context.transactions,
      context.jobDetails,
      context.currentMonthMain,
      context.currentMonthSide,
      context.averageSidePercentage
    );

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    return await callAnthropic(
      `${PARTTIME_SYSTEM_PROMPT}\n\n${contextStr}`,
      messages,
      400
    );
  } catch {
    return null;
  }
}

/**
 * Build context string for on-the-road-mode AI calls.
 */
export function buildOnTheRoadContext(
  transactions: BusinessTransaction[],
  roadDetails: OnTheRoadDetails,
  currentMonthEarned: number,
  currentMonthCosts: number,
  currentMonthNet: number,
  costsByCategory: Record<string, number>,
  sixMonthAverageNet: number,
  earningsByPlatform: Record<string, number>
): string {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const recentTxns = transactions
    .filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return d >= ninetyDaysAgo && t.roadTransactionType;
    })
    .slice(0, 40);

  let ctx = `On-the-road mode.`;

  if (roadDetails.description) {
    ctx += ` Description: ${roadDetails.description}.`;
  }
  ctx += ` Vehicle: ${roadDetails.vehicleType === 'other' && roadDetails.vehicleOther ? roadDetails.vehicleOther : roadDetails.vehicleType}.`;
  ctx += ` This month: earned RM ${currentMonthEarned.toFixed(0)}, costs RM ${currentMonthCosts.toFixed(0)}, kept RM ${currentMonthNet.toFixed(0)}.`;
  ctx += ` 6-month average net: RM ${sixMonthAverageNet.toFixed(0)}.`;

  const costPercentage = currentMonthEarned > 0 ? (currentMonthCosts / currentMonthEarned) * 100 : 0;
  ctx += ` Cost ratio this month: ${costPercentage.toFixed(0)}%.`;

  const categoryEntries = Object.entries(costsByCategory).sort((a, b) => b[1] - a[1]);
  if (categoryEntries.length > 0) {
    ctx += ` Cost breakdown: ${categoryEntries.map(([cat, amt]) => `${cat} RM ${amt.toFixed(0)}`).join(', ')}.`;
    ctx += ` Highest cost: ${categoryEntries[0][0]}.`;
  }

  const platformEntries = Object.entries(earningsByPlatform);
  if (platformEntries.length > 0) {
    ctx += ` Earnings by platform: ${platformEntries.map(([p, amt]) => `${p} RM ${amt.toFixed(0)}`).join(', ')}.`;
  }

  if (recentTxns.length > 0) {
    const lines = recentTxns
      .map((t) => {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        const type = t.roadTransactionType === 'earning' ? '+' : '-';
        const cat = t.costCategory ? ` (${t.costCategory})` : '';
        const plat = t.platform ? ` [${t.platform}]` : '';
        return `${type}RM ${t.amount}${cat}${plat} on ${d.toISOString().slice(0, 10)}`;
      })
      .join('; ');
    ctx += ` Recent: ${lines}.`;
  }

  return ctx;
}

const ONTHEROAD_SYSTEM_PROMPT = `This person earns on the road — they may be a Grab driver, delivery rider, runner, personal shopper, or similar gig worker.
Costs like petrol, tolls, parking, data, and maintenance are the normal cost of doing this work. Never treat them as problems to fix.
The number that matters most is what they kept (net earnings), not what they earned (gross).
Never suggest they should work more hours, take more trips, drive more efficiently, or optimize routes.
If costs increased, state it as an observation with the biggest category. Never frame it as a warning.
If net earnings dropped, stay silent or be neutral. Never alarm.
NEVER use these banned words: profit, loss, revenue, ROI, inventory, expenses, overhead, margin, operating costs, burn rate, sales.
Always use approved Potraces vocabulary: earned, costs (not expenses), kept (not profit), came in (not revenue), went out (not loss), efficiency (not ROI), products (not inventory), net.
Malaysian context. Mix of English and Malay is natural. Under 4 sentences. No jargon.`;

/**
 * Ask an on-the-road-context question with conversation history.
 * Never throws — returns null on failure.
 */
export async function askOnTheRoadQuestion(
  question: string,
  context: {
    transactions: BusinessTransaction[];
    roadDetails: OnTheRoadDetails;
    currentMonthEarned: number;
    currentMonthCosts: number;
    currentMonthNet: number;
    costsByCategory: Record<string, number>;
    sixMonthAverageNet: number;
    earningsByPlatform: Record<string, number>;
  },
  history: AIMessage[]
): Promise<string | null> {
  try {
    const contextStr = buildOnTheRoadContext(
      context.transactions,
      context.roadDetails,
      context.currentMonthEarned,
      context.currentMonthCosts,
      context.currentMonthNet,
      context.costsByCategory,
      context.sixMonthAverageNet,
      context.earningsByPlatform
    );

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    return await callAnthropic(
      `${ONTHEROAD_SYSTEM_PROMPT}\n\n${contextStr}`,
      messages,
      400
    );
  } catch {
    return null;
  }
}

/**
 * Build context string for mixed-mode AI calls.
 */
export function buildMixedContext(
  transactions: BusinessTransaction[],
  mixedDetails: MixedModeDetails,
  currentMonthTotal: number,
  currentMonthByStream: Record<string, number>,
  currentMonthCosts: number,
  streamConsistency: Array<{ stream: string; monthsActive: number; total: number }>,
  sixMonthAverageTotal: number
): string {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const recentTxns = transactions
    .filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return d >= ninetyDaysAgo;
    })
    .slice(0, 40);

  let ctx = `Mixed mode. ${mixedDetails.streams.length} income streams defined: ${mixedDetails.streams.join(', ')}.`;
  ctx += ` This month total: RM ${currentMonthTotal.toFixed(0)}.`;

  const streamEntries = Object.entries(currentMonthByStream).sort((a, b) => b[1] - a[1]);
  if (streamEntries.length > 0) {
    ctx += ` By stream: ${streamEntries.map(([s, amt]) => `${s} RM ${amt.toFixed(0)}`).join(', ')}.`;
  }

  ctx += ` 6-month average total: RM ${sixMonthAverageTotal.toFixed(0)}.`;

  const activeStreamsCount = streamEntries.filter(([_, amt]) => amt > 0).length;
  ctx += ` Active streams this month: ${activeStreamsCount}.`;

  if (streamConsistency.length > 0) {
    ctx += ` Consistency: ${streamConsistency.map((s) => `${s.stream} (${s.monthsActive}/6 months, RM ${s.total.toFixed(0)} total)`).join(', ')}.`;
    ctx += ` Most consistent: ${streamConsistency[0].stream}.`;
  }

  if (streamEntries.length > 0) {
    ctx += ` Top earner this month: ${streamEntries[0][0]}.`;
  }

  if (mixedDetails.hasRoadCosts && currentMonthCosts > 0) {
    ctx += ` Road costs this month: RM ${currentMonthCosts.toFixed(0)}.`;
    ctx += ` Net after costs: RM ${(currentMonthTotal - currentMonthCosts).toFixed(0)}.`;
  }

  if (recentTxns.length > 0) {
    const lines = recentTxns
      .filter((t) => t.type === 'income' || t.roadTransactionType === 'earning')
      .map((t) => {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        const stream = t.streamLabel || 'untagged';
        return `RM ${t.amount} from ${stream} on ${d.toISOString().slice(0, 10)}`;
      })
      .join('; ');
    if (lines) ctx += ` Recent income: ${lines}.`;
  }

  return ctx;
}

const MIXED_SYSTEM_PROMPT = `This person earns from multiple sources. Having several income streams is completely normal and a strength, not a sign of being scattered or unfocused.
Never suggest they should focus on one stream, drop underperforming streams, or optimize their income mix.
Never rank their streams as "main" or "side" — they are all just streams. Treat them equally.
If one stream dominates, state it as a simple observation. If a new stream appears, note it neutrally.
The most useful thing is helping them see the overall picture of where money came from.
If they ask about planning, use their 6-month average total as the planning number.
NEVER use these banned words: profit, loss, revenue, ROI, inventory, diversified, portfolio, revenue streams, income optimization, primary, secondary, main income, side income, hustle, grind.
Always use approved Potraces vocabulary: streams, sources, came in from (not revenue), earned from, what came in, kept (not profit), went out (not loss), products (not inventory), efficiency (not ROI).
Malaysian context. Mix of English and Malay is natural. Under 4 sentences. No jargon.`;

/**
 * Ask a mixed-mode-context question with conversation history.
 * Never throws — returns null on failure.
 */
export async function askMixedQuestion(
  question: string,
  context: {
    transactions: BusinessTransaction[];
    mixedDetails: MixedModeDetails;
    currentMonthTotal: number;
    currentMonthByStream: Record<string, number>;
    currentMonthCosts: number;
    streamConsistency: Array<{ stream: string; monthsActive: number; total: number }>;
    sixMonthAverageTotal: number;
  },
  history: AIMessage[]
): Promise<string | null> {
  try {
    const contextStr = buildMixedContext(
      context.transactions,
      context.mixedDetails,
      context.currentMonthTotal,
      context.currentMonthByStream,
      context.currentMonthCosts,
      context.streamConsistency,
      context.sixMonthAverageTotal
    );

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    return await callAnthropic(
      `${MIXED_SYSTEM_PROMPT}\n\n${contextStr}`,
      messages,
      400
    );
  } catch {
    return null;
  }
}
