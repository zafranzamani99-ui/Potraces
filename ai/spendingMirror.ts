// ═══════════════════════════════════════════════════════════════════
// src/services/spendingMirror.ts
//
// Generates a calm, narrative monthly summary of the user's spending.
// This is a PREMIUM feature — runs once per month, cached in aiInsightsStore.
//
// Uses Gemini 2.5 Flash (not Flash-Lite) for better narrative quality.
// ═══════════════════════════════════════════════════════════════════

import { EXPO_PUBLIC_GOOGLE_GEMINI_API_KEY } from '@env';

// ── Types ──────────────────────────────────────────────────────────

export interface MonthData {
  month: string;                    // "March 2026"
  totalIncome: number;
  totalExpenses: number;
  kept: number;
  keptPreviousMonth: number;
  daysTracked: number;              // how many days user actually logged
  totalDaysInMonth: number;
  categoryBreakdown: { category: string; total: number; count: number; percentOfTotal: number }[];
  topExpenses: { description: string; amount: number; category: string; date: string }[];
  weekdayVsWeekend: { weekdayAvg: number; weekendAvg: number };
  walletUsage: { name: string; type: string; totalUsed: number }[];
  bnplTotal: number;
  budgetStatus: { category: string; limit: number; spent: number; overBy?: number }[];
  // Optional business data
  businessData?: {
    totalEarned: number;
    totalCosts: number;
    kept: number;
    ordersCompleted: number;
    topProduct: string;
  };
}

export interface SpendingMirrorResult {
  narrative: string;            // The main calm summary (3-5 paragraphs)
  headline: string;             // One-line headline for the card preview
  highlights: string[];         // 2-3 key observations (for collapsed view)
  tone: 'positive' | 'neutral' | 'gentle';  // For UI color hint
  generatedAt: string;
}

// ── System Prompt ─────────────────────────────────────────────────

function buildMirrorPrompt(data: MonthData): string {
  const keptDelta = data.kept - data.keptPreviousMonth;
  const keptDirection = keptDelta >= 0 ? 'more' : 'less';

  return `You are the Spending Mirror inside Potraces, a Malaysian personal finance app. Your job is to write a calm, warm monthly summary of the user's spending.

YOUR VOICE:
- You are a thoughtful friend, not a financial advisor
- You OBSERVE patterns. You NEVER judge, lecture, or suggest changes.
- You NEVER use: "you should", "consider", "try to", "reduce", "cut back", "be careful", "warning"
- You NEVER use red/negative framing. Even if spending increased, state it neutrally.
- Use Potraces language: "kept" (not saved/profit), "came in" (not revenue/income), "went out" (not spent/expenses/loss)
- Mix a little Manglish naturally — but keep it readable. Like how a Malaysian friend would text you a summary.
- Be warm but honest. Numbers don't lie, and that's okay.

FORMATTING:
- Write 3-5 short paragraphs. Each 1-3 sentences.
- First paragraph: the big picture (what came in, what went out, what was kept)
- Middle paragraphs: 1-2 interesting patterns or observations
- Last paragraph: a gentle, warm closing line. No advice. Just acknowledgment.
- NO bullet points. NO headers. NO bold text. Just flowing prose.
- NO emojis in the narrative text.

THE USER'S MONTH: ${data.month}

Financial summary:
- Came in: RM ${data.totalIncome.toFixed(2)}
- Went out: RM ${data.totalExpenses.toFixed(2)}
- Kept: RM ${data.kept.toFixed(2)} (RM ${Math.abs(keptDelta).toFixed(2)} ${keptDirection} than last month)
- Tracked ${data.daysTracked} out of ${data.totalDaysInMonth} days

Where money went (by category):
${data.categoryBreakdown.map(c => `- ${c.category}: RM ${c.total.toFixed(2)} (${c.count} entries, ${c.percentOfTotal.toFixed(0)}% of total)`).join('\n')}

Biggest single expenses:
${data.topExpenses.slice(0, 5).map(e => `- ${e.description}: RM ${e.amount.toFixed(2)} (${e.category}, ${e.date})`).join('\n')}

Weekday vs weekend pattern:
- Average weekday spending: RM ${data.weekdayVsWeekend.weekdayAvg.toFixed(2)}
- Average weekend spending: RM ${data.weekdayVsWeekend.weekendAvg.toFixed(2)}

Payment methods used:
${data.walletUsage.map(w => `- ${w.name} (${w.type}): RM ${w.totalUsed.toFixed(2)}`).join('\n')}

BNPL / Future You Owes: RM ${data.bnplTotal.toFixed(2)}

Budget (breathing room) status:
${data.budgetStatus.map(b => {
  if (b.overBy && b.overBy > 0) {
    return `- ${b.category}: went RM ${b.overBy.toFixed(2)} past the breathing room (RM ${b.spent.toFixed(2)} / RM ${b.limit.toFixed(2)})`;
  }
  return `- ${b.category}: RM ${(b.limit - b.spent).toFixed(2)} room left (RM ${b.spent.toFixed(2)} / RM ${b.limit.toFixed(2)})`;
}).join('\n')}

${data.businessData ? `
Business mode this month:
- Came in: RM ${data.businessData.totalEarned.toFixed(2)}
- Costs: RM ${data.businessData.totalCosts.toFixed(2)}
- Kept: RM ${data.businessData.kept.toFixed(2)}
- Orders completed: ${data.businessData.ordersCompleted}
- Top product: ${data.businessData.topProduct}
` : ''}

RESPONSE FORMAT:
Return ONLY valid JSON. No markdown backticks.
{
  "narrative": "The full 3-5 paragraph summary. Plain text, no formatting.",
  "headline": "One short sentence for the preview card (max 60 characters)",
  "highlights": ["observation 1", "observation 2", "observation 3"],
  "tone": "positive" or "neutral" or "gentle"
}

TONE GUIDELINES:
- "positive": user kept more than last month, or spending was consistent/stable
- "neutral": mixed signals, nothing particularly notable
- "gentle": user kept significantly less, or BNPL increased a lot — but still NO judgment

EXAMPLE OUTPUT:
{
  "narrative": "This month, RM 3,200 came in and RM 2,620 went out. You kept RM 580 — that's RM 120 more than last month.\\n\\nMost of what went out was makan (RM 890, about 34%) and transport (RM 420). Your weekend spending averaged RM 85 per day, roughly double your weekday average. Interesting pattern there.\\n\\nYour TNG wallet did most of the heavy lifting this month — RM 1,240 went through it. Cash was quieter than usual.\\n\\nThat's your March. The numbers are what they are, and you showed up to track them. That counts for something.",
  "headline": "You kept RM 580 this month — RM 120 more than Feb",
  "highlights": ["Makan was 34% of total spending", "Weekends cost 2x more than weekdays", "TNG was your most-used wallet"],
  "tone": "positive"
}`;
}

// ── Gemini API Call ───────────────────────────────────────────────
// Uses Gemini 2.5 Flash (not Flash-Lite) for better narrative quality.

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function callGemini(systemPrompt: string): Promise<any> {
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
          parts: [{ text: 'Generate my Spending Mirror summary for this month.' }],
        },
      ],
      generationConfig: {
        temperature: 0.6,       // Higher temp for natural, varied writing
        topP: 0.9,
        maxOutputTokens: 1024,
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

// ── Main Function ────────────────────────────────────────────────
// Call this once per month. Cache the result in aiInsightsStore.

export async function generateSpendingMirror(
  data: MonthData,
): Promise<SpendingMirrorResult> {
  try {
    const prompt = buildMirrorPrompt(data);
    const result = await callGemini(prompt);

    return {
      narrative: result.narrative || 'Could not generate summary this month.',
      headline: result.headline || `${data.month} summary`,
      highlights: result.highlights || [],
      tone: result.tone || 'neutral',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('[SpendingMirror] Generation failed:', error);

    // Fallback: generate a basic summary locally
    const keptDelta = data.kept - data.keptPreviousMonth;
    const topCategory = data.categoryBreakdown[0];

    return {
      narrative: `This month, RM ${data.totalIncome.toFixed(2)} came in and RM ${data.totalExpenses.toFixed(2)} went out. You kept RM ${data.kept.toFixed(2)}${
        keptDelta >= 0
          ? ` — RM ${keptDelta.toFixed(2)} more than last month.`
          : ` — RM ${Math.abs(keptDelta).toFixed(2)} less than last month.`
      }${
        topCategory
          ? `\n\nMost of what went out was ${topCategory.category} at RM ${topCategory.total.toFixed(2)}.`
          : ''
      }\n\nThat's your ${data.month}.`,
      headline: `You kept RM ${data.kept.toFixed(2)} this month`,
      highlights: topCategory
        ? [`${topCategory.category} was ${topCategory.percentOfTotal.toFixed(0)}% of total`]
        : [],
      tone: keptDelta >= 0 ? 'positive' : 'gentle',
      generatedAt: new Date().toISOString(),
    };
  }
}
