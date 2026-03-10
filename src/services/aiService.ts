import { AIMessage, Transaction, IncomeType, BusinessTransaction, RiderCost, Client, SellerProduct, FreelancerClient, PartTimeJobDetails, OnTheRoadDetails, MixedModeDetails } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

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
  maxTokens: number
): Promise<string | null> {
  if (!API_KEY) return null;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!response.ok) return null;

  const data: any = await response.json();
  const content = data?.content?.[0];
  if (!content || content.type !== 'text') return null;

  return content.text;
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
    const amount = Number(json.amount) || 0;
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
    const amount = Number(json.amount) || 0;
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

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    return await callAnthropic(
      `You are a calm, non-judgmental financial companion for a Malaysian user. You can see their transaction history. Answer questions about their spending honestly but kindly. Never give investment advice. Never be preachy. Use 'RM' for amounts. Keep responses concise (2-3 sentences max).\n\n${summary}`,
      messages,
      300
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
      `You are a calm, honest money companion for a Malaysian gig worker or small earner.\nYou understand that income is irregular and unpredictable.\nNever compare the user to a standard or ideal.\nNever use words like "should", "must", "discipline", or "goal".\nWhen asked about slow months, normalize them — they are part of this kind of work.\nWhen asked about affordability, calculate from realistic average income, not current month.\nIf the user earns from multiple sources, treat that as a strength, not complexity.\nKeep responses under 4 sentences.\nSpeak plainly. No jargon.\n\n${contextSummary}`,
      messages,
      400
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
}

const PRODUCT_PARSE_SYSTEM = (units: string[]) =>
  `You are a product list parser for a Malaysian home-based food seller app.
Given raw text or an image of a product list, extract all products.
Available units: ${units.join(', ')}. Pick the best match or use "piece" as default.
Currency is MYR (RM). Prices may be written as "RM 5", "5.00", "rm5", etc.

IMPORTANT: Return ONLY a valid JSON array. No explanation, no markdown, no text before or after.
Each item: { "name": string, "pricePerUnit": number, "costPerUnit": number | null, "unit": string, "description": string | null }

Rules:
- name should be clean and capitalized properly (e.g. "Kuih Lapis" not "kuih lapis")
- If cost/margin info is given, include costPerUnit
- If description is given, include it
- If no price found for an item, set pricePerUnit to 0
- Return [] if the text/image doesn't contain any products
- Output MUST start with [ and end with ]`;

function extractJsonArray(raw: string): any[] | null {
  // Try direct parse first
  const stripped = stripJsonFences(raw);
  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  // Fallback: find the first [...] block in the text
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  return null;
}

function parseParsedProducts(raw: string): ParsedProduct[] | null {
  const parsed = extractJsonArray(raw);
  if (!parsed) return null;
  return parsed.map((item: any) => ({
    name: String(item.name || '').trim(),
    pricePerUnit: Number(item.pricePerUnit) || 0,
    costPerUnit: item.costPerUnit ? Number(item.costPerUnit) : undefined,
    unit: String(item.unit || 'piece'),
    description: item.description ? String(item.description).trim() : undefined,
  })).filter((p: ParsedProduct) => p.name.length > 0);
}

export async function parseProductList(
  text: string,
  existingUnits: string[]
): Promise<ParsedProduct[] | null> {
  try {
    const result = await callAnthropic(
      PRODUCT_PARSE_SYSTEM(existingUnits),
      [{ role: 'user', content: text }],
      1024
    );
    if (!result) return null;
    return parseParsedProducts(result);
  } catch {
    return null;
  }
}

/**
 * Parse products from an image (screenshot/photo) using Gemini vision.
 * Accepts an image URI (file path).
 */
export async function parseProductImage(
  imageUri: string,
  existingUnits: string[]
): Promise<ParsedProduct[] | null> {
  const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  if (!GEMINI_KEY) {
    console.warn('[parseProductImage] No GEMINI_API_KEY');
    return null;
  }

  const base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
  console.log('[parseProductImage] base64 length:', base64.length);

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PRODUCT_PARSE_SYSTEM(existingUnits) },
            { inlineData: { mimeType: 'image/jpeg', data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.warn('[parseProductImage] Gemini error:', response.status, errText);
    return null;
  }

  const data: any = await response.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  const finishReason = candidate?.finishReason;
  console.log('[parseProductImage] Gemini response (' + finishReason + '):', text?.slice(0, 500));
  if (!text) {
    console.warn('[parseProductImage] No text in response. Full data:', JSON.stringify(data).slice(0, 300));
    return null;
  }

  const products = parseParsedProducts(text);
  console.log('[parseProductImage] Parsed products:', products?.length ?? 'null');
  return products;
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

    return parsed.map((item: any) => ({
      productName: String(item.productName || ''),
      quantity: Number(item.quantity) || 1,
      unit: String(item.unit || 'piece'),
    }));
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
Never use: revenue, sales, pipeline, billable hours, utilization, invoice.
Always use: earned, came in, payments, clients, work.
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
Never use: expenses, profit, loss, overhead, margin, operating costs, burn rate, revenue, sales.
Always use: earned, costs, kept, came in, went out, net.
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
Never use: diversified, portfolio, revenue streams, income optimization, primary, secondary, main income, side income, hustle, grind.
Always use: streams, sources, came in from, earned from, what came in, kept.
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
