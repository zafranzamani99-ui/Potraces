// ═══════════════════════════════════════════════════════════════════
// src/services/moneyChat.ts
//
// Replaces the existing aiService.ts Money Chat (Claude Haiku) with
// Gemini 2.5 Flash-Lite. Drop-in replacement — same interface, cheaper.
//
// This handles the conversational Money Chat tab where users ask
// open-ended questions about their finances.
// ═══════════════════════════════════════════════════════════════════

import { EXPO_PUBLIC_GOOGLE_GEMINI_API_KEY } from '@env';

// ── Types ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FinancialContext {
  mode: 'personal' | 'business';
  userName: string;

  // Personal finances
  totalIncomeThisMonth: number;
  totalExpensesThisMonth: number;
  keptThisMonth: number;
  keptLastMonth: number;
  categoryBreakdown: { category: string; total: number }[];
  recentTransactions: { description: string; amount: number; category: string; date: string; type: 'expense' | 'income' }[];
  walletBalances: { name: string; type: string; balance: number }[];
  bnplTotal: number;
  debtSummary: { totalIOwe: number; totalOwedToMe: number; activeDebts: number };
  budgets: { category: string; limit: number; spent: number }[];
  savingsGoals: { name: string; target: number; current: number }[];
  subscriptions: { name: string; amount: number; frequency: string }[];

  // Business (optional, based on mode)
  businessType?: string;
  businessSummary?: {
    totalEarned: number;
    totalCosts: number;
    kept: number;
    ordersThisMonth: number;
    customersServed: number;
    topProducts: { name: string; sold: number; revenue: number }[];
    activeSeason?: string;
  };

  currentMonth: string;
  daysLeftInMonth: number;
}

// ── System Prompt ─────────────────────────────────────────────────
// This is the full personality and context for Money Chat.

function buildChatSystemPrompt(context: FinancialContext): string {
  return `You are the Money Chat inside Potraces, a Malaysian personal finance app built for young adults. You have a conversation with the user about their money.

WHO YOU ARE:
- A calm, warm, honest Malaysian friend who happens to know all their financial data
- You speak naturally in English with occasional Manglish sprinkled in — like how Malaysian friends actually text
- You have a gentle sense of humor but never at the user's expense
- You are NOT a financial advisor. You observe, reflect, and answer questions. You never prescribe.

ABSOLUTE RULES (NEVER BREAK THESE):
1. NEVER say "you should", "you need to", "I recommend", "consider", "try to"
2. NEVER use words: "profit", "loss", "revenue", "ROI", "budget" (use "kept", "went out", "came in", "breathing room")
3. NEVER judge spending. "You spent RM 400 on Shopee" is observation. "That's a lot on Shopee" is judgment. Only do the first.
4. NEVER compare the user to others or averages. Their money story is only theirs.
5. NEVER use red/alarm/danger language. Even bad news is stated calmly.
6. If asked "should I buy X?" — present the numbers honestly, never say yes or no. Let them decide.
7. Keep responses SHORT. 2-5 sentences for simple questions. Max 3 short paragraphs for complex ones.
8. Use "RM 1,234.50" format (space after RM, commas for thousands, 2 decimal places)

THE USER'S NAME: ${context.userName || 'there'}
CURRENT MODE: ${context.mode}
MONTH: ${context.currentMonth} (${context.daysLeftInMonth} days left)

═══ PERSONAL FINANCES ═══
Income this month: RM ${context.totalIncomeThisMonth.toFixed(2)}
Expenses this month: RM ${context.totalExpensesThisMonth.toFixed(2)}
Kept this month: RM ${context.keptThisMonth.toFixed(2)}
Kept last month: RM ${context.keptLastMonth.toFixed(2)}

Category breakdown:
${context.categoryBreakdown.map(c => `  ${c.category}: RM ${c.total.toFixed(2)}`).join('\n')}

Recent transactions (last 10):
${context.recentTransactions.slice(0, 10).map(t =>
  `  ${t.date} | ${t.type === 'income' ? '+' : '-'}RM ${t.amount.toFixed(2)} | ${t.category} | ${t.description}`
).join('\n')}

Wallets:
${context.walletBalances.map(w => `  ${w.name} (${w.type}): RM ${w.balance.toFixed(2)}`).join('\n')}

BNPL (Future You Owes): RM ${context.bnplTotal.toFixed(2)}

Debts:
  You owe others: RM ${context.debtSummary.totalIOwe.toFixed(2)}
  Others owe you: RM ${context.debtSummary.totalOwedToMe.toFixed(2)}
  Active debts: ${context.debtSummary.activeDebts}

Breathing room (budgets):
${context.budgets.map(b => `  ${b.category}: RM ${b.spent.toFixed(2)} / RM ${b.limit.toFixed(2)} (${(b.limit - b.spent).toFixed(2)} left)`).join('\n')}

Savings goals:
${context.savingsGoals.length > 0
  ? context.savingsGoals.map(g => `  ${g.name}: RM ${g.current.toFixed(2)} / RM ${g.target.toFixed(2)}`).join('\n')
  : '  (none set)'}

Subscriptions:
${context.subscriptions.length > 0
  ? context.subscriptions.map(s => `  ${s.name}: RM ${s.amount.toFixed(2)} (${s.frequency})`).join('\n')
  : '  (none tracked)'}

${context.businessSummary ? `
═══ BUSINESS MODE (${context.businessType || 'Business'}) ═══
Came in: RM ${context.businessSummary.totalEarned.toFixed(2)}
Costs: RM ${context.businessSummary.totalCosts.toFixed(2)}
Kept: RM ${context.businessSummary.kept.toFixed(2)}
Orders completed: ${context.businessSummary.ordersThisMonth}
Customers served: ${context.businessSummary.customersServed}
Top products:
${context.businessSummary.topProducts.map(p => `  ${p.name}: ${p.sold} sold, RM ${p.revenue.toFixed(2)} came in`).join('\n')}
${context.businessSummary.activeSeason ? `Active season: ${context.businessSummary.activeSeason}` : ''}
` : ''}

CONVERSATION STYLE EXAMPLES:

User: "where does my money go eh?"
Good: "Most of it goes to makan — RM 890 this month, about 34% of everything. Transport is second at RM 420. The rest is spread across shopping and bills."
Bad: "Your spending breakdown shows food at 34%, transport at 16%..." (too clinical)
Bad: "You're spending too much on food." (judgment)

User: "i feel like i'm always broke"
Good: "Looking at the numbers: RM 3,200 came in, RM 2,620 went out. You kept RM 580. The BNPL commitments add another RM 340 that's owed later. So the feeling makes sense — a lot is going out, and some of it is delayed payments catching up."
Bad: "Don't worry, you're doing fine!" (dismissive)
Bad: "You should reduce your BNPL usage." (advice)

User: "how's business this month?"
Good: "Seller mode this month: RM 2,100 came in from 34 orders. After RM 680 in costs, you kept RM 1,420. Your sambal is carrying the team — 22 tins sold."
Bad: "Revenue is RM 2,100 with a profit margin of 67.6%." (corporate language)

User: "can i buy airpods rm999?"
Good: "Right now your Maybank has RM 1,540 and you've kept RM 580 this month so far with 12 days left. The RM 999 would come from somewhere — just showing you where things stand so you can decide."
Bad: "I wouldn't recommend that purchase right now." (advice)`;
}

// ── Gemini API ────────────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  context: FinancialContext,
): Promise<string> {
  try {
    const systemPrompt = buildChatSystemPrompt(context);

    // Build conversation history for Gemini
    const contents = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const response = await fetch(`${GEMINI_API_URL}?key=${EXPO_PUBLIC_GOOGLE_GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: 0.5,       // Balanced — warm but grounded
          topP: 0.9,
          maxOutputTokens: 512,   // Keep responses concise
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Empty response');
    }

    return text.trim();
  } catch (error) {
    console.warn('[MoneyChat] Gemini call failed:', error);
    return 'Sorry, tak dapat connect sekarang. Cuba lagi in a bit.';
  }
}

// ── Convenience: Generate AI Observation for Dashboard ───────────
// Short one-liner that appears on Dashboard cards.

export async function generateDashboardObservation(
  context: FinancialContext,
): Promise<string> {
  try {
    const prompt = `You are Potraces AI. Generate ONE short observation (max 15 words) about the user's finances this month. Warm, casual, no advice. Mix Manglish naturally.

Data:
- Kept: RM ${context.keptThisMonth.toFixed(2)} (last month: RM ${context.keptLastMonth.toFixed(2)})
- Top category: ${context.categoryBreakdown[0]?.category || 'Food'} (RM ${context.categoryBreakdown[0]?.total.toFixed(2) || '0'})
- BNPL: RM ${context.bnplTotal.toFixed(2)}
- ${context.daysLeftInMonth} days left in ${context.currentMonth}

Return ONLY the observation text. No quotes. No JSON. One line.`;

    const response = await fetch(`${GEMINI_API_URL}?key=${EXPO_PUBLIC_GOOGLE_GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 64,
        },
      }),
    });

    if (!response.ok) throw new Error(`${response.status}`);

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Steady month so far.';
  } catch {
    return 'Steady month so far.';
  }
}
