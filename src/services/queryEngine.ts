/**
 * Query Engine — answers user questions by reading from stores.
 * Fast local answers + optional AI-powered answers via Gemini.
 */

import { startOfMonth, endOfMonth, isWithinInterval, format, getDaysInMonth, subMonths } from 'date-fns';
import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { useWalletStore } from '../store/walletStore';
import { useSellerStore } from '../store/sellerStore';
import { callGeminiAPI, isGeminiAvailable } from './geminiClient';
import { usePremiumStore } from '../store/premiumStore';

export interface QueryAnswer {
  title: string;
  value: string;
  detail?: string;
  icon: string; // Feather icon name
  aiAnswer?: string; // Optional AI-generated natural language answer
}

type QueryType =
  | 'spending_this_month'
  | 'income_this_month'
  | 'kept_this_month'
  | 'spending_category'
  | 'debt_total'
  | 'wallet_balance'
  | 'seller_revenue'
  | 'seller_costs'
  | 'unknown';

function detectQueryType(text: string): QueryType {
  const lower = text.toLowerCase();

  // Debt queries
  if (/hutang|debt|owe|pinjam|borrow|loan/i.test(lower)) return 'debt_total';

  // Wallet/balance queries
  if (/baki|balance|wallet|duit|berapa ada/i.test(lower)) return 'wallet_balance';

  // Seller revenue
  if (/jualan|sales|revenue|came in|order.*bulan/i.test(lower)) return 'seller_revenue';

  // Seller costs
  if (/kos|cost|bahan|ingredient/i.test(lower)) return 'seller_costs';

  // Kept this month
  if (/kept|simpan.*bulan|save.*month/i.test(lower)) return 'kept_this_month';

  // Income queries
  if (/income|gaji|salary|masuk|dapat.*bulan/i.test(lower)) return 'income_this_month';

  // Category spending
  if (/makan|food|transport|shopping|bill|entertainment|health/i.test(lower)) return 'spending_category';

  // General spending
  if (/belanja|spend|perbelanjaan|keluar|went out|berapa.*bulan/i.test(lower)) return 'spending_this_month';

  return 'unknown';
}

function extractCategoryFromQuery(text: string): string | null {
  const lower = text.toLowerCase();
  const categoryMap: Record<string, string> = {
    makan: 'food', food: 'food', makanan: 'food',
    transport: 'transport', grab: 'transport', petrol: 'transport', minyak: 'transport',
    shopping: 'shopping', beli: 'shopping',
    entertainment: 'entertainment', hiburan: 'entertainment',
    bill: 'bills', bil: 'bills', bills: 'bills',
    health: 'health', kesihatan: 'health', doktor: 'health',
    education: 'education', pendidikan: 'education',
  };

  for (const [keyword, cat] of Object.entries(categoryMap)) {
    if (lower.includes(keyword)) return cat;
  }
  return null;
}

/**
 * Build a concise data summary for the AI query prompt.
 */
function buildQueryContext(): string {
  const transactions = usePersonalStore.getState().transactions;
  const debts = useDebtStore.getState().debts;
  const wallets = useWalletStore.getState().wallets;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthLabel = format(now, 'MMMM yyyy');
  const daysLeft = getDaysInMonth(now) - now.getDate();

  const thisMonthTxns = transactions.filter((t) => {
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  });

  const totalIncome = thisMonthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = thisMonthTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
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
    .slice(0, 5)
    .map(([cat, amt]) => `- ${cat}: RM ${amt.toFixed(2)}`)
    .join('\n');

  // Top recent expenses
  const topExpenses = thisMonthTxns
    .filter((t) => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return `- ${t.description}: RM ${t.amount.toFixed(2)} (${t.category}, ${format(d, 'dd MMM')})`;
    })
    .join('\n');

  // Wallets
  const walletLines = wallets
    .map((w) => `- ${w.name} (${w.type}): RM ${(w.balance || 0).toFixed(2)}`)
    .join('\n');

  // BNPL
  const bnplTotal = wallets
    .filter((w) => w.type === 'credit')
    .reduce((s, w) => s + (w.usedCredit || 0), 0);

  // Debts
  const activeDebts = debts.filter((d) => d.status !== 'settled');
  const iOwe = activeDebts.filter((d) => d.type === 'i_owe').reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);
  const theyOwe = activeDebts.filter((d) => d.type === 'they_owe').reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);

  return `Month: ${monthLabel} (${daysLeft} days left)
Came in: RM ${totalIncome.toFixed(2)}
Went out: RM ${totalExpenses.toFixed(2)}
Kept: RM ${kept.toFixed(2)} (last month: RM ${keptLastMonth.toFixed(2)})

Categories:
${catLines || '(none)'}

Top expenses:
${topExpenses || '(none)'}

Wallets:
${walletLines || '(none)'}

BNPL: RM ${bnplTotal.toFixed(2)}
Debts: you owe RM ${iOwe.toFixed(2)} | owed to you RM ${theyOwe.toFixed(2)} | ${activeDebts.length} active`;
}

/**
 * Get an AI-powered natural language answer to a financial question.
 */
async function getAIAnswer(question: string): Promise<string | null> {
  const context = buildQueryContext();

  const systemPrompt = `You are the AI inside Potraces, a Malaysian personal finance app. The user asked a question in their notes. Answer naturally.

RULES:
- Speak like a Malaysian friend — warm, casual, mix English and Malay naturally
- NEVER judge. NEVER advise. Just observe and answer.
- NEVER say "you should", "consider", "try to"
- Use Potraces language: "kept" not "saved/profit", "came in" not "revenue", "went out" not "spent/loss"
- Keep answers SHORT — 2-4 sentences max. This appears inline in a note.
- Use RM formatting: "RM X.XX"

USER'S DATA:
${context}`;

  const data = await callGeminiAPI({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: question }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 256,
    },
  });

  if (!data) return null;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

/**
 * Fast local answer from store data (no API call).
 */
function answerQueryLocal(text: string): QueryAnswer {
  const queryType = detectQueryType(text);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthLabel = format(now, 'MMM yyyy');

  const transactions = usePersonalStore.getState().transactions;
  const debts = useDebtStore.getState().debts;
  const wallets = useWalletStore.getState().wallets;

  const thisMonthTxns = transactions.filter((t) => {
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  });

  switch (queryType) {
    case 'spending_this_month': {
      const total = thisMonthTxns
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      const count = thisMonthTxns.filter((t) => t.type === 'expense').length;
      return {
        title: `spent in ${monthLabel}`,
        value: `RM ${total.toFixed(2)}`,
        detail: `${count} transaction${count !== 1 ? 's' : ''}`,
        icon: 'arrow-up-right',
      };
    }

    case 'income_this_month': {
      const total = thisMonthTxns
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        title: `income in ${monthLabel}`,
        value: `RM ${total.toFixed(2)}`,
        icon: 'arrow-down-left',
      };
    }

    case 'kept_this_month': {
      const income = thisMonthTxns
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      const expenses = thisMonthTxns
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      const kept = income - expenses;
      return {
        title: `kept in ${monthLabel}`,
        value: `RM ${kept.toFixed(2)}`,
        detail: kept >= 0 ? 'you\'re ahead' : 'spent more than earned',
        icon: kept >= 0 ? 'trending-up' : 'trending-down',
      };
    }

    case 'spending_category': {
      const cat = extractCategoryFromQuery(text);
      if (cat) {
        const catTxns = thisMonthTxns.filter(
          (t) => t.type === 'expense' && t.category === cat
        );
        const total = catTxns.reduce((sum, t) => sum + t.amount, 0);
        return {
          title: `${cat} in ${monthLabel}`,
          value: `RM ${total.toFixed(2)}`,
          detail: `${catTxns.length} transaction${catTxns.length !== 1 ? 's' : ''}`,
          icon: 'tag',
        };
      }
      return {
        title: 'spending',
        value: 'couldn\'t identify category',
        icon: 'help-circle',
      };
    }

    case 'debt_total': {
      const unsettled = debts.filter((d) => d.status !== 'settled');
      const iOwe = unsettled
        .filter((d) => d.type === 'i_owe')
        .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);
      const theyOwe = unsettled
        .filter((d) => d.type === 'they_owe')
        .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

      const parts: string[] = [];
      if (iOwe > 0) parts.push(`you owe RM ${iOwe.toFixed(2)}`);
      if (theyOwe > 0) parts.push(`owed to you RM ${theyOwe.toFixed(2)}`);

      return {
        title: 'debts',
        value: parts.length > 0 ? parts.join(' · ') : 'all clear',
        detail: `${unsettled.length} active`,
        icon: 'repeat',
      };
    }

    case 'wallet_balance': {
      const total = wallets.reduce((sum, w) => {
        if (w.type === 'credit') return sum;
        return sum + (w.balance || 0);
      }, 0);
      return {
        title: 'total balance',
        value: `RM ${total.toFixed(2)}`,
        detail: `across ${wallets.filter((w) => w.type !== 'credit').length} wallet${wallets.length !== 1 ? 's' : ''}`,
        icon: 'credit-card',
      };
    }

    case 'seller_revenue': {
      const orders = useSellerStore.getState().orders;
      const activeSeason = useSellerStore.getState().getActiveSeason();
      if (activeSeason) {
        const seasonOrders = orders.filter((o) => o.seasonId === activeSeason.id);
        const total = seasonOrders.reduce((sum, o) => sum + o.totalAmount, 0);
        return {
          title: `came in — ${activeSeason.name}`,
          value: `RM ${total.toFixed(2)}`,
          detail: `${seasonOrders.length} order${seasonOrders.length !== 1 ? 's' : ''}`,
          icon: 'shopping-bag',
        };
      }
      return {
        title: 'came in',
        value: 'no active season',
        icon: 'shopping-bag',
      };
    }

    case 'seller_costs': {
      const costs = useSellerStore.getState().ingredientCosts;
      const activeSeason = useSellerStore.getState().getActiveSeason();
      if (activeSeason) {
        const seasonCosts = costs.filter((c) => c.seasonId === activeSeason.id);
        const total = seasonCosts.reduce((sum, c) => sum + c.amount, 0);
        return {
          title: `costs — ${activeSeason.name}`,
          value: `RM ${total.toFixed(2)}`,
          detail: `${seasonCosts.length} item${seasonCosts.length !== 1 ? 's' : ''}`,
          icon: 'package',
        };
      }
      return {
        title: 'costs',
        value: 'no active season',
        icon: 'package',
      };
    }

    default:
      return {
        title: 'hmm',
        value: 'not sure what you\'re asking',
        detail: 'try: "berapa belanja bulan ni?" or "how much do I owe?"',
        icon: 'help-circle',
      };
  }
}

/**
 * Answer a financial query. Returns fast local card + optional AI answer.
 * The local answer is always returned; AI enhances it when available.
 */
export async function answerQuery(text: string): Promise<QueryAnswer> {
  const answer = answerQueryLocal(text);

  // Try AI for a richer natural language answer
  if (isGeminiAvailable() && usePremiumStore.getState().canUseAI()) {
    try {
      const aiAnswer = await getAIAnswer(text);
      if (aiAnswer) {
        answer.aiAnswer = aiAnswer;
        usePremiumStore.getState().incrementAiCalls();
      }
    } catch {
      // AI failed — local answer is still fine
    }
  }

  return answer;
}
