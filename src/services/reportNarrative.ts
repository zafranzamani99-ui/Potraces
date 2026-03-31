/**
 * Report Narrative — generates a 2-3 sentence AI narrative
 * for report screens using Gemini 2.0 Flash.
 *
 * Follows the same pattern as spendingMirror.ts.
 */

import { callGeminiAPI, isGeminiAvailable } from './geminiClient';
import { useSettingsStore } from '../store/settingsStore';
import { usePremiumStore } from '../store/premiumStore';
import { useAIInsightsStore } from '../store/aiInsightsStore';
import { format } from 'date-fns';

export interface ReportMonthData {
  mode: 'personal' | 'seller' | 'stall' | 'freelancer' | 'parttime' | 'ontheroad' | 'mixed';
  income: number;
  expenses: number;
  kept: number;
  topCategories: { name: string; amount: number; percent: number }[];
  prevMonthIncome?: number;
  prevMonthExpenses?: number;
  transactionCount: number;
}

export async function generateReportNarrative(data: ReportMonthData): Promise<void> {
  const store = useAIInsightsStore.getState();
  const currency = useSettingsStore.getState().currency;
  const monthKey = format(new Date(), 'yyyy-MM');
  const cacheKey = `${data.mode}_${monthKey}`;

  // Check cache (don't regenerate within 24 hours)
  if (store.reportNarratives[cacheKey]) {
    const cached = store.reportNarratives[cacheKey];
    const hoursSince = (Date.now() - cached.generatedAt) / (1000 * 60 * 60);
    if (hoursSince < 24 && cached.text.length > 10) return;
  }

  if (!isGeminiAvailable()) return;
  const premium = usePremiumStore.getState();
  if (!premium.canUseAI()) return;

  try {
    // Build context
    let context = `Mode: ${data.mode}\n`;
    context += `This month: ${currency} ${data.income.toFixed(0)} came in, ${currency} ${data.expenses.toFixed(0)} went out, ${currency} ${data.kept.toFixed(0)} kept\n`;
    context += `Transactions: ${data.transactionCount}\n`;

    if (data.prevMonthIncome !== undefined) {
      const incChange = data.prevMonthIncome > 0
        ? Math.round(((data.income - data.prevMonthIncome) / data.prevMonthIncome) * 100)
        : 0;
      const expChange = data.prevMonthExpenses !== undefined && data.prevMonthExpenses > 0
        ? Math.round(((data.expenses - data.prevMonthExpenses) / data.prevMonthExpenses) * 100)
        : 0;
      context += `vs last month: income ${incChange >= 0 ? '+' : ''}${incChange}%, expenses ${expChange >= 0 ? '+' : ''}${expChange}%\n`;
    }

    if (data.topCategories.length > 0) {
      context += 'Top categories: ' + data.topCategories.slice(0, 5).map(
        (c) => `${c.name} ${currency} ${c.amount.toFixed(0)} (${c.percent}%)`
      ).join(', ') + '\n';
    }

    const modeVoice = {
      personal: 'personal finance',
      seller: 'small product seller',
      stall: 'food stall owner',
      freelancer: 'freelancer',
      parttime: 'part-time worker',
      ontheroad: 'delivery rider',
      mixed: 'mixed income earner',
    }[data.mode];

    const systemPrompt = `You are Echo, the AI inside Potraces, a Malaysian personal finance app. Write 2-3 warm sentences about what you notice in this month's numbers for a ${modeVoice}. Be like a friend looking at the data together, not a financial advisor.

Rules:
- Plain text only — no markdown, no ** or * or # formatting
- Never say "you should" or "I recommend"
- Use ${currency} for amounts
- Reference specific numbers from the data
- Compare to last month if the data is there
- Keep it under 50 words
- Use "kept"/"came in"/"went out" language — never "revenue"/"profit"/"loss"/"savings"
- Malaysian context welcome (Manglish ok)
- One observation about what's notable, one about the overall picture`;

    const result = await callGeminiAPI(
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user' as const, parts: [{ text: context }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 256 },
      },
      15_000,
    );

    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text && text.length > 10) {
      premium.incrementAiCalls();
      useAIInsightsStore.getState().setReportNarrative(cacheKey, text);
    }
  } catch (err) {
    if (__DEV__) console.warn('[ReportNarrative] Error:', err);
  }
}
