// ═══════════════════════════════════════════════════════════════════
// src/services/queryEngine.ts
//
// Answers inline financial questions from the Notes screen.
// User writes "berapa habis makan bulan ni?" → AI reads from stores,
// answers in natural Manglish.
//
// Uses Gemini 2.5 Flash-Lite for cost efficiency.
// ═══════════════════════════════════════════════════════════════════

import { EXPO_PUBLIC_GOOGLE_GEMINI_API_KEY } from '@env';

// ── Types ──────────────────────────────────────────────────────────

export interface QueryContext {
  // Pull these from your existing stores before calling answerQuery()
  totalIncomeThisMonth: number;
  totalExpensesThisMonth: number;
  keptThisMonth: number;
  keptLastMonth: number;
  categoryBreakdown: { category: string; total: number }[];
  topExpenses: { description: string; amount: number; date: string; category: string }[];
  walletBalances: { name: string; type: string; balance: number }[];
  bnplTotal: number;
  bnplBreakdown: { wallet: string; amount: number }[];
  debtSummary: { totalIOwe: number; totalOwedToMe: number; activeDebts: number };
  budgets: { category: string; limit: number; spent: number }[];
  // Business mode (optional)
  businessSummary?: {
    totalEarned: number;
    totalCosts: number;
    kept: number;
    ordersThisMonth: number;
    topProducts: { name: string; sold: number }[];
  };
  currentMonth: string;      // e.g., "March 2026"
  daysLeftInMonth: number;
}

export interface QueryAnswer {
  answer: string;           // The natural language response
  dataUsed: string[];       // Which data sources were referenced
  followUp?: string;        // Optional gentle follow-up suggestion
}

// ── System Prompt ─────────────────────────────────────────────────

function buildQuerySystemPrompt(context: QueryContext): string {
  return `You are the AI assistant inside Potraces, a Malaysian personal finance app. The user just asked a question about their money inside their notes. Answer it naturally.

YOUR PERSONALITY:
- You speak like a Malaysian friend — warm, casual, mix Malay and English naturally
- You NEVER judge spending habits. You observe, never advise.
- You NEVER say "you should", "you need to", "consider reducing"
- You use Potraces language: "kept" not "saved/profit", "came in" not "revenue", "went out" not "spent/loss"
- Keep answers SHORT — 2-4 sentences max. This appears inline in a note, not a chat window.
- Use RM formatting: "RM 1,234.50" (space after RM, commas for thousands)

THE USER'S FINANCIAL DATA RIGHT NOW:
Month: ${context.currentMonth} (${context.daysLeftInMonth} days left)

Income this month: RM ${context.totalIncomeThisMonth.toFixed(2)}
Expenses this month: RM ${context.totalExpensesThisMonth.toFixed(2)}
Kept this month: RM ${context.keptThisMonth.toFixed(2)}
Kept last month: RM ${context.keptLastMonth.toFixed(2)}

Category breakdown this month:
${context.categoryBreakdown.map(c => `- ${c.category}: RM ${c.total.toFixed(2)}`).join('\n')}

Top recent expenses:
${context.topExpenses.slice(0, 5).map(e => `- ${e.description}: RM ${e.amount.toFixed(2)} (${e.category}, ${e.date})`).join('\n')}

Wallet balances:
${context.walletBalances.map(w => `- ${w.name} (${w.type}): RM ${w.balance.toFixed(2)}`).join('\n')}

BNPL / Future You Owes: RM ${context.bnplTotal.toFixed(2)}
${context.bnplBreakdown.length > 0 ? context.bnplBreakdown.map(b => `  - ${b.wallet}: RM ${b.amount.toFixed(2)}`).join('\n') : '  (none)'}

Debts: You owe RM ${context.debtSummary.totalIOwe.toFixed(2)} | Owed to you: RM ${context.debtSummary.totalOwedToMe.toFixed(2)} | ${context.debtSummary.activeDebts} active

Budgets (breathing room):
${context.budgets.map(b => `- ${b.category}: RM ${b.spent.toFixed(2)} / RM ${b.limit.toFixed(2)} (RM ${(b.limit - b.spent).toFixed(2)} room left)`).join('\n')}

${context.businessSummary ? `
Business this month:
- Came in: RM ${context.businessSummary.totalEarned.toFixed(2)}
- Costs: RM ${context.businessSummary.totalCosts.toFixed(2)}
- Kept: RM ${context.businessSummary.kept.toFixed(2)}
- Orders: ${context.businessSummary.ordersThisMonth}
- Top products: ${context.businessSummary.topProducts.map(p => `${p.name} (${p.sold} sold)`).join(', ')}
` : ''}

RESPONSE FORMAT:
Return ONLY valid JSON. No markdown. No backticks.
{
  "answer": "Your natural language answer here. Short, warm, factual.",
  "dataUsed": ["category_breakdown", "wallet_balances"],
  "followUp": "Optional gentle observation, or null"
}

EXAMPLES OF GOOD ANSWERS:
- Q: "berapa habis makan bulan ni?" → "Makan bulan ni so far RM 423.50 — mostly from tapau and mamak. Still got RM 76.50 breathing room left for food."
- Q: "total semua wallet aku?" → "All wallets combined: RM 2,340. Cash RM 450, Maybank RM 1,540, TNG RM 350."
- Q: "can i afford new phone rm2000?" → "Right now you've kept RM 580 this month with ${context.daysLeftInMonth} days to go. A RM 2,000 phone would use most of your Maybank balance. Not saying yes or no — just the numbers."
- Q: "siapa hutang aku?" → "3 people owe you a total of RM 450. Biggest one: Sarah RM 200."`;
}

// ── Gemini API Call ───────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

async function callGemini(systemPrompt: string, question: string): Promise<any> {
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
          parts: [{ text: question }],
        },
      ],
      generationConfig: {
        temperature: 0.3,       // Slightly creative for natural answers
        topP: 0.85,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

// ── Main Query Function ──────────────────────────────────────────
// Call this from the Notes screen when intent is "query".

export async function answerQuery(
  question: string,
  context: QueryContext,
): Promise<QueryAnswer> {
  try {
    const systemPrompt = buildQuerySystemPrompt(context);
    const result = await callGemini(systemPrompt, question);

    return {
      answer: result.answer || 'Hmm, tak sure macam mana nak jawab yang ni. Cuba tanya lain sikit?',
      dataUsed: result.dataUsed || [],
      followUp: result.followUp || undefined,
    };
  } catch (error) {
    console.warn('[QueryEngine] Failed:', error);

    // Graceful fallback: try to answer simple questions locally
    const lower = question.toLowerCase();

    if (lower.includes('total') || lower.includes('berapa habis')) {
      return {
        answer: `Bulan ni so far: RM ${context.totalExpensesThisMonth.toFixed(2)} went out, RM ${context.keptThisMonth.toFixed(2)} kept.`,
        dataUsed: ['expenses_total'],
      };
    }

    if (lower.includes('wallet') || lower.includes('baki') || lower.includes('balance')) {
      const walletList = context.walletBalances.map(w => `${w.name}: RM ${w.balance.toFixed(2)}`).join(', ');
      return {
        answer: `Wallet balances: ${walletList}`,
        dataUsed: ['wallet_balances'],
      };
    }

    return {
      answer: 'Sorry, tak dapat process soalan ni sekarang. Cuba lagi sekejap.',
      dataUsed: [],
    };
  }
}
