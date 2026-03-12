/**
 * Spending Mirror — generates a calm, reflective monthly narrative
 * using Gemini 2.0 Flash based on the user's transaction data.
 *
 * No advice, no judgment — just a mirror.
 */

import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, getDaysInMonth, isWeekend } from 'date-fns';
import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { useWalletStore } from '../store/walletStore';
import { useAIInsightsStore } from '../store/aiInsightsStore';
import { usePremiumStore } from '../store/premiumStore';
import { callGeminiAPI, isGeminiAvailable } from './geminiClient';

function buildDataSummary(): string {
  const { transactions, subscriptions, budgets } = usePersonalStore.getState();
  const debts = useDebtStore.getState().debts;
  const wallets = useWalletStore.getState().wallets;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthLabel = format(now, 'MMMM yyyy');
  const daysLeft = getDaysInMonth(now) - now.getDate();

  const monthTxns = transactions.filter((t) => {
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  });

  const expenses = monthTxns.filter((t) => t.type === 'expense');
  const incomes = monthTxns.filter((t) => t.type === 'income');

  const totalSpent = expenses.reduce((s, t) => s + t.amount, 0);
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
  const kept = totalIncome - totalSpent;

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
  const byCategory: Record<string, { total: number; count: number }> = {};
  for (const t of expenses) {
    if (!byCategory[t.category]) byCategory[t.category] = { total: 0, count: 0 };
    byCategory[t.category].total += t.amount;
    byCategory[t.category].count++;
  }
  const catLines = Object.entries(byCategory)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6)
    .map(([cat, data]) => {
      const pct = totalSpent > 0 ? Math.round((data.total / totalSpent) * 100) : 0;
      return `  ${cat}: RM ${data.total.toFixed(2)} (${data.count} entries, ${pct}%)`;
    })
    .join('\n');

  // Weekday vs weekend
  let weekdayTotal = 0, weekdayDays = 0, weekendTotal = 0, weekendDays = 0;
  const dayTotals: Record<string, number> = {};
  for (const t of expenses) {
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    const key = format(d, 'yyyy-MM-dd');
    dayTotals[key] = (dayTotals[key] || 0) + t.amount;
  }
  for (const [dateStr, total] of Object.entries(dayTotals)) {
    const d = new Date(dateStr);
    if (isWeekend(d)) { weekendTotal += total; weekendDays++; }
    else { weekdayTotal += total; weekdayDays++; }
  }
  const weekdayAvg = weekdayDays > 0 ? weekdayTotal / weekdayDays : 0;
  const weekendAvg = weekendDays > 0 ? weekendTotal / weekendDays : 0;

  // Wallet usage
  const walletLines = wallets
    .map((w) => `  ${w.name} (${w.type}): RM ${(w.balance || 0).toFixed(2)}`)
    .join('\n');

  // BNPL
  const bnplTotal = wallets
    .filter((w) => w.type === 'credit')
    .reduce((s, w) => s + (w.usedCredit || 0), 0);

  // Debt summary
  const activeDebts = debts.filter((d) => d.status !== 'settled');
  const iOwe = activeDebts
    .filter((d) => d.type === 'i_owe')
    .reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);
  const theyOwe = activeDebts
    .filter((d) => d.type === 'they_owe')
    .reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);

  // Budget status
  const budgetLines = budgets
    .map((b) => {
      const left = b.allocatedAmount - b.spentAmount;
      return left < 0
        ? `  ${b.category}: went RM ${Math.abs(left).toFixed(2)} past breathing room`
        : `  ${b.category}: RM ${left.toFixed(2)} room left`;
    })
    .join('\n');

  // Active subscriptions
  const activeSubs = subscriptions.filter((s) => s.isActive);
  const subsTotal = activeSubs.reduce((s, sub) => s + sub.amount, 0);

  return `Month: ${monthLabel}
Day ${now.getDate()} (${daysLeft} days left)
Came in: RM ${totalIncome.toFixed(2)} (${incomes.length} entries)
Went out: RM ${totalSpent.toFixed(2)} (${expenses.length} transactions)
Kept: RM ${kept.toFixed(2)} (last month: RM ${keptLastMonth.toFixed(2)})

Categories:
${catLines || '  (none yet)'}

Weekday avg: RM ${weekdayAvg.toFixed(2)} · Weekend avg: RM ${weekendAvg.toFixed(2)}

Wallets:
${walletLines || '  (none)'}

BNPL: RM ${bnplTotal.toFixed(2)}
Debts: you owe RM ${iOwe.toFixed(2)}, owed to you RM ${theyOwe.toFixed(2)}

Breathing room:
${budgetLines || '  (none set)'}

Subscriptions: ${activeSubs.length} active, RM ${subsTotal.toFixed(2)}/month total`;
}

export async function generateSpendingMirror(): Promise<string | null> {
  const store = useAIInsightsStore.getState();
  const monthKey = format(new Date(), 'yyyy-MM');

  // Already generated for this month and less than 6 hours old
  if (
    store.spendingMirrorMonthKey === monthKey &&
    store.spendingMirrorText &&
    store.spendingMirrorGeneratedAt
  ) {
    const ageMs = Date.now() - new Date(store.spendingMirrorGeneratedAt).getTime();
    if (ageMs < 6 * 60 * 60 * 1000) {
      return store.spendingMirrorText;
    }
  }

  // Check shared cooldown + AI quota
  if (!isGeminiAvailable()) return null;
  const premium = usePremiumStore.getState();
  if (!premium.canUseAI()) return null;

  const dataSummary = buildDataSummary();

  store.setIsGenerating(true);

  try {
    const systemPrompt = `You are the Spending Mirror inside Potraces, a Malaysian personal finance app. Write a SHORT (2-3 sentences max) reflective observation about the user's month.

Rules:
- No advice. No "you should" or "consider". Just observe.
- Use warm, calm tone. Like a friend noticing something.
- Use "you" not "the user"
- Never use words: profit, loss, revenue, ROI, inventory, budget
- Instead use: kept, came in, went out, costs, breathing room
- Currency is RM (Ringgit Malaysia)
- If kept is positive, gently acknowledge it
- If kept is negative, normalize it without alarm
- Reference specific categories or patterns if interesting (weekday vs weekend, top wallet, etc.)
- Mix a little Manglish naturally — but keep it readable
- Keep it under 50 words
- Return ONLY the observation text. No quotes. No JSON.`;

    const data = await callGeminiAPI({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: `Here's my financial data for this month:\n\n${dataSummary}` }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 100,
      },
    });

    if (!data) return null;

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (text) {
      premium.incrementAiCalls();
      store.setSpendingMirror(text, monthKey);
      return text;
    }

    return null;
  } catch (err) {
    console.warn('[SpendingMirror] Failed:', err);
    return null;
  } finally {
    store.setIsGenerating(false);
  }
}
