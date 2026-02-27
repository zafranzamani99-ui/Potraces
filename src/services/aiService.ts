import { AIMessage, Transaction, IncomeType, BusinessTransaction, RiderCost, Client, SellerProduct } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';

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

    const json = JSON.parse(result);
    return {
      amount: Number(json.amount) || 0,
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

    const json = JSON.parse(result);
    return {
      amount: Number(json.amount) || 0,
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

    const parsed = JSON.parse(result);
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
