/**
 * Money Chat — Gemini-powered conversational AI
 * that knows all the user's financial data.
 *
 * Rich context from all stores, Potraces personality,
 * no advice, no judgment — just observation.
 */

import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, getDaysInMonth } from 'date-fns';
import { callGeminiAPI, isGeminiAvailable, getCooldownSecondsLeft, isDailyQuotaExhausted } from './geminiClient';
import { usePremiumStore } from '../store/premiumStore';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useBusinessStore } from '../store/businessStore';
import { useSellerStore } from '../store/sellerStore';
import { useAppStore } from '../store/appStore';
import { AIMessage } from '../types';
import { ACTION_PROMPT } from './chatActions';

const SYSTEM_PROMPT = `You are the Money Chat inside Potraces, a Malaysian personal finance app built for young adults.

WHO YOU ARE:
- A calm, warm, honest Malaysian friend who knows all their financial data
- You speak naturally in English with occasional Manglish — like how Malaysian friends actually text
- You have a gentle sense of humor but never at the user's expense
- You are NOT a financial advisor. You observe, reflect, and answer questions. You never prescribe.

ABSOLUTE RULES (NEVER BREAK THESE):
1. NEVER say "you should", "you need to", "I recommend", "consider", "try to"
2. NEVER use words: "profit", "loss", "revenue", "ROI", "budget" (use "kept", "went out", "came in", "breathing room")
3. NEVER judge spending. "RM 400 went to Shopee" is observation. "That's a lot" is judgment. Only observe.
4. NEVER compare the user to others or averages. Their money story is only theirs.
5. NEVER use red/alarm/danger language. Even bad news is stated calmly.
6. If asked "should I buy X?" — present the numbers honestly, never say yes or no. Let them decide.
7. Keep responses SHORT. 2-5 sentences for simple questions. Max 3 short paragraphs for complex ones.
8. Use "RM X.XX" format for amounts.

HOW TO THINK (step by step):
- Be CURIOUS. Ask questions like a real friend would — one thing at a time.
- NEVER try to do everything in one message. Have a CONVERSATION.
- If info is missing, ASK — don't guess, don't skip, don't assume.
- For shared expenses, think through the FULL picture and ask about each piece:
  1. Who paid first? (that person gets the subscription/expense)
  2. How much does each person owe? (do the math clearly)
  3. Who are the people? (ask for names if not given — you need names to create debt records!)
- Only create ACTION blocks when you have ALL the info needed. If you're still asking questions, DON'T create actions yet.
- When the user gives you names, THEN create all the actions at once (subscription + debts for each person).

CONVERSATION STYLE:
- Ask ONE follow-up question at a time — don't dump 5 questions at once
- Show you understand by restating what they said in your own words
- Do the math for them and show your work briefly
- Be like a smart friend who's genuinely interested in helping track things properly

CONVERSATION EXAMPLES:

User: "where does my money go eh?"
Good: "Most of it goes to makan — RM 890 this month, about 34% of everything. Transport is second at RM 420."
Bad: "You're spending too much on food." (judgment)

User: "i feel like i'm always broke"
Good: "Looking at the numbers: RM 3,200 came in, RM 2,620 went out. You kept RM 580. The feeling makes sense — a lot is going out."
Bad: "You should reduce your spending." (advice)

User: "can i buy airpods rm999?"
Good: "Right now your Maybank has RM 1,540 and you've kept RM 580 this month with 12 days left. Just showing you where things stand so you can decide."
Bad: "I wouldn't recommend that." (advice)

User: "i just subs netflix rm75, share with 5 people"
Good: "RM 75.00 for Netflix — nice. So that's 6 people including you, RM 12.50 each. Did you pay the full RM 75 first? And who are the 5 people? Give me their names and I'll track who owes you."
Bad: "Okay, I've recorded your Netflix subscription for RM 75.00 and split it with 5 people." (didn't ask who they are, didn't ask who paid, just assumed and acted)

User: "yeah i paid first. its ali, abu, siti, maya, zaref"
Good: [creates subscription action + 5 debt actions] "Got it! Added Netflix RM 75.00/month as your subscription. And tracked that Ali, Abu, Siti, Maya, and Zaref each owe you RM 12.50."
Bad: "I've recorded the subscription." (incomplete — forgot the debts)

User: "i lent ali rm200"
Good: [adds debt action for Ali RM 200, type they_owe] "Tracked — Ali owes you RM 200.00. What was it for?"
Bad: "I've noted the RM 200 transaction." (vague, no debt record, not curious)`;

function buildFinancialContext(): string {
  const mode = useAppStore.getState().mode;
  const { transactions, subscriptions, budgets, goals } = usePersonalStore.getState();
  const wallets = useWalletStore.getState().wallets;
  const debts = useDebtStore.getState().debts;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthLabel = format(now, 'MMMM yyyy');
  const daysLeft = getDaysInMonth(now) - now.getDate();

  // This month
  const thisMonthTxns = transactions.filter((t) => {
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  });

  const totalIncome = thisMonthTxns
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = thisMonthTxns
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const kept = totalIncome - totalExpenses;

  // Last month
  const lastStart = startOfMonth(subMonths(now, 1));
  const lastEnd = endOfMonth(subMonths(now, 1));
  const lastMonthTxns = transactions.filter((t) => {
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    return isWithinInterval(d, { start: lastStart, end: lastEnd });
  });
  const keptLastMonth =
    lastMonthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0) -
    lastMonthTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // Category breakdown
  const byCategory: Record<string, number> = {};
  for (const t of thisMonthTxns.filter((x) => x.type === 'expense')) {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  }
  const catLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, amt]) => `  ${cat}: RM ${amt.toFixed(2)}`)
    .join('\n');

  // Recent 10 transactions
  const recentTxns = thisMonthTxns
    .sort((a, b) => {
      const da = a.date instanceof Date ? a.date : new Date(a.date);
      const db = b.date instanceof Date ? b.date : new Date(b.date);
      return db.getTime() - da.getTime();
    })
    .slice(0, 10)
    .map((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return `  ${format(d, 'dd MMM')} | ${t.type === 'income' ? '+' : '-'}RM ${t.amount.toFixed(2)} | ${t.category} | ${t.description}`;
    })
    .join('\n');

  // Wallets
  const walletLines = wallets
    .map((w) => `  ${w.name} (${w.type}): RM ${(w.balance || 0).toFixed(2)}`)
    .join('\n');

  // BNPL (credit wallet used credit)
  const bnplTotal = wallets
    .filter((w) => w.type === 'credit')
    .reduce((s, w) => s + (w.usedCredit || 0), 0);

  // Debts
  const activeDebts = debts.filter((d) => d.status !== 'settled');
  const iOwe = activeDebts
    .filter((d) => d.type === 'i_owe')
    .reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);
  const theyOwe = activeDebts
    .filter((d) => d.type === 'they_owe')
    .reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);

  // Budgets
  const budgetLines = budgets
    .map(
      (b) =>
        `  ${b.category}: RM ${b.spentAmount.toFixed(2)} / RM ${b.allocatedAmount.toFixed(2)} (RM ${(b.allocatedAmount - b.spentAmount).toFixed(2)} left)`
    )
    .join('\n');

  // Goals
  const goalLines = goals
    .map((g) => `  ${g.name}: RM ${g.currentAmount.toFixed(2)} / RM ${g.targetAmount.toFixed(2)}`)
    .join('\n');

  // Subscriptions
  const activeSubs = subscriptions.filter((s) => s.isActive);
  const subLines = activeSubs
    .map((s) => `  ${s.name}: RM ${s.amount.toFixed(2)} (${s.billingCycle})`)
    .join('\n');

  let ctx = `Month: ${monthLabel} (${daysLeft} days left)
Came in: RM ${totalIncome.toFixed(2)}
Went out: RM ${totalExpenses.toFixed(2)}
Kept: RM ${kept.toFixed(2)} (last month: RM ${keptLastMonth.toFixed(2)})

Category breakdown:
${catLines || '  (none yet)'}

Recent transactions:
${recentTxns || '  (none yet)'}

Wallets:
${walletLines || '  (none)'}

Future You Owes (BNPL): RM ${bnplTotal.toFixed(2)}

Debts:
  You owe: RM ${iOwe.toFixed(2)}
  Owed to you: RM ${theyOwe.toFixed(2)}
  Active: ${activeDebts.length}

Breathing room:
${budgetLines || '  (none set)'}

Savings goals:
${goalLines || '  (none)'}

Subscriptions:
${subLines || '  (none)'}`;

  // Business context
  if (mode === 'business') {
    const biz = useBusinessStore.getState();
    const seller = useSellerStore.getState();

    if (biz.incomeType === 'seller' || biz.incomeType === 'stall') {
      const activeSeason = seller.getActiveSeason();
      if (activeSeason) {
        const stats = seller.getSeasonStats(activeSeason.id);
        const topProducts = seller.orders
          .filter((o) => o.seasonId === activeSeason.id)
          .flatMap((o) => o.items)
          .reduce(
            (acc, item) => {
              const existing = acc.find((p) => p.name === item.productName);
              if (existing) {
                existing.sold += item.quantity;
                existing.revenue += item.quantity * item.unitPrice;
              } else {
                acc.push({ name: item.productName, sold: item.quantity, revenue: item.quantity * item.unitPrice });
              }
              return acc;
            },
            [] as { name: string; sold: number; revenue: number }[]
          )
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        ctx += `\n\nBusiness (${biz.incomeType}) — ${activeSeason.name}:
Came in: RM ${stats.totalIncome.toFixed(2)}
Costs: RM ${stats.totalCosts.toFixed(2)}
Kept: RM ${stats.kept.toFixed(2)}
Orders: ${stats.totalOrders} (${stats.unpaidCount} unpaid, RM ${stats.unpaidAmount.toFixed(2)})
Top products:
${topProducts.map((p) => `  ${p.name}: ${p.sold} sold, RM ${p.revenue.toFixed(2)}`).join('\n')}`;
      }
    } else if (biz.incomeType) {
      const recentBiz = biz.businessTransactions.filter((t) => {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        return isWithinInterval(d, { start: monthStart, end: monthEnd });
      });
      const bizIncome = recentBiz.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const bizCosts = recentBiz.filter((t) => t.type === 'cost').reduce((s, t) => s + t.amount, 0);
      ctx += `\n\nBusiness (${biz.incomeType}):
Came in: RM ${bizIncome.toFixed(2)}
Costs: RM ${bizCosts.toFixed(2)}
Kept: RM ${(bizIncome - bizCosts).toFixed(2)}`;
    }
  }

  return ctx;
}

/**
 * Send a chat message using Gemini with full financial context.
 * Returns the AI response or a user-friendly error string.
 */
export type ChatResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function sendChatMessage(
  message: string,
  history: AIMessage[]
): Promise<ChatResult> {
  if (!isGeminiAvailable()) {
    const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!key) return { ok: false, error: 'Gemini API key is missing. Add it in .env' };
    const secs = getCooldownSecondsLeft();
    if (secs > 0) {
      return { ok: false, error: `AI is busy — try again in ${secs}s` };
    }
    return { ok: false, error: 'AI is temporarily unavailable — try again shortly.' };
  }

  const premium = usePremiumStore.getState();
  if (!premium.canUseAI()) {
    return { ok: false, error: 'AI limit reached this month. Resets next month!' };
  }

  try {
    const context = buildFinancialContext();
    const fullSystem = `${SYSTEM_PROMPT}\n\n${ACTION_PROMPT}\n\nTHE USER'S FINANCIAL DATA:\n${context}`;

    // Build conversation history — last 10 messages to keep token usage low
    const recentHistory = history.slice(-10);
    const contents = recentHistory.map((msg) => ({
      role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: msg.content }],
    }));

    // Add current message
    contents.push({
      role: 'user' as const,
      parts: [{ text: message }],
    });

    const data = await callGeminiAPI(
      {
        system_instruction: { parts: [{ text: fullSystem }] },
        contents,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 512,
        },
      },
      30_000 // 30s timeout for chat (more context than other calls)
    );

    if (!data) {
      if (isDailyQuotaExhausted()) {
        return { ok: false, error: 'AI daily limit reached — resets tomorrow. Sorry!' };
      }
      const secs = getCooldownSecondsLeft();
      if (secs > 0) return { ok: false, error: `AI is busy — try again in ${secs}s` };
      return { ok: false, error: 'Couldn\'t reach AI. Check your internet.' };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      premium.incrementAiCalls();
      return { ok: true, text };
    }

    return { ok: false, error: 'AI returned empty — try rephrasing.' };
  } catch (err: any) {
    console.warn('[MoneyChat] Gemini failed:', err);
    if (err?.name === 'AbortError') return { ok: false, error: 'Request timed out.' };
    return { ok: false, error: 'Something went wrong. Try again.' };
  }
}
