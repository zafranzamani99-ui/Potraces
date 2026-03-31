/**
 * Playbook AI — Echo-powered salary planning assistant.
 *
 * Reads ALL app data (transactions, debts, subscriptions, savings goals,
 * past playbooks, wallet balances) to generate an intelligent spending plan.
 *
 * Philosophy: Echo is "one brain" — every suggestion is influenced by the
 * full financial picture. Past playbooks teach what the user actually
 * spends vs what they plan. Recurring obligations are auto-detected.
 */

import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { callGeminiAPI, isGeminiAvailable, getCooldownSecondsLeft } from './geminiClient';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useSavingsStore } from '../store/savingsStore';
import { usePlaybookStore, EchoMemoryEntry } from '../store/playbookStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePremiumStore } from '../store/premiumStore';
import { useLearningStore } from '../store/learningStore';
import { Playbook } from '../types';
import { computeNotebookStats, computePlaybookStats } from '../utils/playbookStats';
import { getPlaybookObligations } from '../utils/playbookObligations';

// ─── Types ──────────────────────────────────────────────────

export interface EchoPlanItem {
  label: string;
  amount: number;
  category?: string;
  rationale: string;
  alert?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'recurring' | 'historical' | 'debt' | 'goal' | 'subscription' | 'estimate';
}

export interface EchoPlanResponse {
  greeting: string;
  items: EchoPlanItem[];
  warnings: string[];
  summary: string;
}

export type PlaybookAIResult =
  | { ok: true; plan: EchoPlanResponse }
  | { ok: false; error: string };

// Cache context from plan generation for multi-turn chat reuse
let _lastPlanContext: string | null = null;

// ─── Context Builder ────────────────────────────────────────

function buildPlaybookContext(playbook: Playbook): string {
  const currency = useSettingsStore.getState().currency;
  const now = new Date();

  // ── 1. Current playbook state ──
  const existingItems = playbook.lineItems || [];
  const nbStats = computeNotebookStats(existingItems);

  let ctx = `CURRENT PLAYBOOK:
name: ${playbook.name}
source: ${currency} ${playbook.sourceAmount.toLocaleString('en-MY')}
start: ${format(playbook.startDate instanceof Date ? playbook.startDate : new Date(playbook.startDate), 'dd MMM yyyy')}`;

  if (existingItems.length > 0) {
    ctx += `\nexisting items (${existingItems.length}):`;
    for (const li of existingItems) {
      const catTag = li.category ? ` [${li.category}]` : '';
      ctx += `\n  ${li.isPaid ? '[x]' : '[ ]'} ${li.label}: ${currency} ${li.plannedAmount}${catTag}${li.note ? ` (${li.note})` : ''}`;
    }
    ctx += `\nplanned total: ${currency} ${nbStats.totalPlanned}, remaining to allocate: ${currency} ${playbook.sourceAmount - nbStats.totalPlanned}`;
  } else {
    ctx += `\nno items yet — full amount needs planning`;
  }

  // ── 2. Spending patterns (3-month aggregated — compact) ──
  const { transactions, subscriptions } = usePersonalStore.getState();

  const catMonthly: Record<string, number[]> = {};
  const monthlyIncomes: number[] = [];
  const monthlyExpenses: number[] = [];
  const monthLabels: string[] = [];

  for (let m = 1; m <= 3; m++) {
    const ms = startOfMonth(subMonths(now, m));
    const me = endOfMonth(subMonths(now, m));
    monthLabels.push(format(ms, 'MMM'));
    const monthTxns = transactions.filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return isWithinInterval(d, { start: ms, end: me });
    });

    const inc = monthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = monthTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    monthlyIncomes.push(inc);
    monthlyExpenses.push(exp);
    for (const t of monthTxns.filter((x) => x.type === 'expense')) {
      if (!catMonthly[t.category]) catMonthly[t.category] = [0, 0, 0];
      catMonthly[t.category][m - 1] += t.amount;
    }
  }

  const posIncomes = monthlyIncomes.filter((x) => x > 0);
  const avgIncomeVal = posIncomes.length > 0 ? posIncomes.reduce((a, b) => a + b, 0) / posIncomes.length : playbook.sourceAmount;

  const spendPatterns = Object.entries(catMonthly)
    .map(([cat, months]) => {
      const nonZero = months.filter((x) => x > 0);
      const avg = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
      const lastMonth = months[0] || 0;
      const pctOfIncome = avgIncomeVal > 0 ? Math.round((avg / avgIncomeVal) * 100) : 0;
      const deviation = avg > 0 ? Math.round(((lastMonth - avg) / avg) * 100) : 0;
      let trend = 'steady';
      if (Math.abs(deviation) >= 30) trend = deviation > 0 ? `up ${Math.abs(deviation)}%` : `down ${Math.abs(deviation)}%`;
      else if (Math.abs(deviation) >= 15) trend = deviation > 0 ? 'slightly up' : 'slightly down';
      return { cat, avg, pctOfIncome, trend };
    })
    .filter((p) => p.avg > 0)
    .sort((a, b) => b.avg - a.avg);

  if (spendPatterns.length > 0) {
    const totalAvg = spendPatterns.reduce((s, p) => s + p.avg, 0);
    ctx += `\n\nSPENDING PATTERNS (3-month avg):`;
    for (const p of spendPatterns.slice(0, 8)) {
      ctx += `\n  ${p.cat}: ${currency} ${Math.round(p.avg)}/mo (${p.pctOfIncome}% of income, ${p.trend})`;
    }
    ctx += `\n  total avg: ${currency} ${Math.round(totalAvg)}/mo, surplus: ${currency} ${Math.round(avgIncomeVal - totalAvg)}/mo`;
  }

  // ── 2b. Monthly trends (compact cross-month snapshot) ──
  const hasMonthData = monthlyIncomes.some((x) => x > 0) || monthlyExpenses.some((x) => x > 0);
  if (hasMonthData) {
    ctx += `\n\nMONTHLY TRENDS:`;
    for (let i = 0; i < 3; i++) {
      const inc = monthlyIncomes[i];
      const exp = monthlyExpenses[i];
      const saved = inc - exp;
      const pct = inc > 0 ? Math.round((saved / inc) * 100) : 0;
      if (inc > 0 || exp > 0) {
        ctx += `\n  ${monthLabels[i]}: in ${currency} ${Math.round(inc)}, out ${currency} ${Math.round(exp)}, kept ${currency} ${Math.round(saved)} (${pct}%)`;
      }
    }
  }

  // ── 3. Active subscriptions ──
  const activeSubs = subscriptions.filter((s) => s.isActive);
  if (activeSubs.length > 0) {
    ctx += `\n\nACTIVE SUBSCRIPTIONS:`;
    for (const s of activeSubs) {
      const next = s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate);
      ctx += `\n  ${s.name}: ${currency} ${s.amount} (${s.billingCycle}${!isNaN(next.getTime()) ? `, next ${format(next, 'dd MMM')}` : ''}, category: ${s.category || 'unknown'})`;
    }
  }

  // ── 4. Active debts (obligations) ──
  const { debts } = useDebtStore.getState();
  const activeDebts = debts.filter((d) => d.status !== 'settled');
  const iOwe = activeDebts.filter((d) => d.type === 'i_owe');
  const theyOwe = activeDebts.filter((d) => d.type === 'they_owe');

  if (iOwe.length > 0) {
    ctx += `\n\nDEBTS I OWE:`;
    for (const d of iOwe) {
      const remaining = d.totalAmount - d.paidAmount;
      const due = d.dueDate ? ` (due ${format(d.dueDate instanceof Date ? d.dueDate : new Date(d.dueDate), 'dd MMM')})` : '';
      ctx += `\n  ${d.contact.name}: ${currency} ${remaining.toLocaleString('en-MY')}${due} — ${d.description}`;
    }
  }

  if (theyOwe.length > 0) {
    ctx += `\n\nMONEY OWED TO ME:`;
    for (const d of theyOwe.slice(0, 5)) {
      const remaining = d.totalAmount - d.paidAmount;
      ctx += `\n  ${d.contact.name}: ${currency} ${remaining.toLocaleString('en-MY')} — ${d.description}`;
    }
  }

  // ── 5. Savings goals ──
  const { goals } = usePersonalStore.getState();
  const activeGoals = goals.filter((g) => !g.isArchived && !g.isPaused);
  if (activeGoals.length > 0) {
    ctx += `\n\nSAVINGS GOALS:`;
    for (const g of activeGoals) {
      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
      ctx += `\n  ${g.name}: ${currency} ${g.currentAmount.toLocaleString('en-MY')} / ${currency} ${g.targetAmount.toLocaleString('en-MY')} (${pct}%)`;
      if (g.deadline) {
        const dl = g.deadline instanceof Date ? g.deadline : new Date(g.deadline);
        if (!isNaN(dl.getTime())) {
          const daysLeft = Math.max(0, Math.ceil((dl.getTime() - now.getTime()) / 86400000));
          ctx += ` — ${daysLeft}d left`;
        }
      }
    }
  }

  // ── 6. Savings & investment accounts ──
  const { accounts } = useSavingsStore.getState();
  if (accounts.length > 0) {
    ctx += `\n\nSAVINGS/INVESTMENT ACCOUNTS:`;
    for (const a of accounts) {
      ctx += `\n  ${a.name} (${a.type}): ${currency} ${a.currentValue.toLocaleString('en-MY')}`;
    }
  }

  // ── 7. Wallets ──
  const wallets = useWalletStore.getState().wallets;
  if (wallets.length > 0) {
    ctx += `\n\nWALLETS:`;
    for (const w of wallets) {
      ctx += `\n  ${w.name} (${w.type}): ${currency} ${(w.balance || 0).toLocaleString('en-MY')}`;
      if (w.type === 'credit' && w.creditLimit) {
        ctx += ` (used ${currency} ${(w.usedCredit || 0).toLocaleString('en-MY')} / ${currency} ${w.creditLimit.toLocaleString('en-MY')})`;
      }
    }
  }

  // ── 8. Past playbooks (what was planned vs reality) ──
  const allPlaybooks = usePlaybookStore.getState().playbooks;
  const pastPlaybooks = allPlaybooks
    .filter((p) => p.isClosed && p.id !== playbook.id && (p.lineItems?.length ?? 0) > 0)
    .slice(0, 3);

  if (pastPlaybooks.length > 0) {
    ctx += `\n\nPAST PLAYBOOKS (planned vs actual):`;
    for (const pp of pastPlaybooks) {
      ctx += `\n  "${pp.name}" (${currency} ${pp.sourceAmount}):`;
      for (const li of (pp.lineItems || [])) {
        const actual = li.actualAmount ?? li.plannedAmount;
        const diff = actual - li.plannedAmount;
        const diffLabel = diff > 0 ? ` (+${currency} ${diff})` : diff < 0 ? ` (-${currency} ${Math.abs(diff)})` : '';
        ctx += `\n    ${li.isPaid ? '[x]' : '[ ]'} ${li.label}: planned ${currency} ${li.plannedAmount}, actual ${currency} ${actual}${diffLabel}`;
      }
    }
  }

  // ── 9. Obligations status ──
  const oblResult = getPlaybookObligations(playbook, playbook.coveredObligationIds || []);
  if (oblResult.items.length > 0) {
    ctx += `\n\nOBLIGATIONS FOR THIS PERIOD:`;
    for (const obl of oblResult.items) {
      ctx += `\n  ${obl.label}: ${currency} ${obl.amount} (${obl.type}${obl.category ? `, category: ${obl.category}` : ''}, ${obl.isCovered ? 'covered' : 'not covered'})`;
    }
  }

  // ── 10. Learned patterns ──
  const learned = useLearningStore.getState();
  const patterns = learned.categoryPatterns;
  if (patterns.length > 0) {
    const topPatterns = patterns
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    ctx += `\n\nLEARNED SPENDING PATTERNS:`;
    for (const p of topPatterns) {
      ctx += `\n  "${p.keyword}" → ${p.category} (${p.count}x)`;
    }
  }

  // ── 11. Past Echo sessions (memory) ──
  const echoMemory = usePlaybookStore.getState().echoMemory || [];
  if (echoMemory.length > 0) {
    ctx += `\n\nPAST ECHO ADVICE:`;
    for (const mem of echoMemory.slice(0, 3)) {
      const d = new Date(mem.date);
      const dateLabel = !isNaN(d.getTime()) ? format(d, 'MMM yyyy') : '?';
      ctx += `\n  ${dateLabel} (${currency} ${mem.sourceAmount}): ${mem.planSummary}`;
      if (mem.keyAdvice.length > 0) {
        ctx += `\n    advice: ${mem.keyAdvice.join('; ')}`;
      }
      if (mem.chatHighlights.length > 0) {
        ctx += `\n    user asked about: ${mem.chatHighlights.join(', ')}`;
      }
    }
  }

  return ctx;
}

// ─── System Prompt ──────────────────────────────────────────

function buildEchoPrompt(currency: string): string {
  return `You are Echo, the AI brain inside Potraces — a Malaysian personal finance app. You know EVERYTHING about this user's financial life.

YOUR TASK: Analyze the user's finances and create a complete, intelligent spending plan for their salary.

YOU ARE NOT a suggestion generator. You are a smart friend who actually understands their money. You:
- Know what they NEED to spend (obligations, bills, food, transport)
- Know what they WANT to spend (entertainment, shopping)
- Know what's NORMAL for them (based on 3 months of history)
- Spot when something is OFF (spending way more or less than usual)
- Think about their GOALS (savings targets, debt payoff)

HOW TO THINK:
1. Start with NEEDS: obligations, debt payments, food, transport — non-negotiable
2. Add RECURRING spending: use their ACTUAL 3-month average, not guesses
3. Flag ALERTS: if a category is 30%+ above their average, warn them
4. Include SAVINGS: if they have goals, calculate a reasonable monthly amount
5. Leave 5-10% as breathing room — don't plan every ringgit
6. If items already exist in the notebook, DON'T repeat them — plan what's MISSING
7. Think about the total: do items + obligations exceed the salary? Warn if so
8. If PAST ECHO ADVICE is available, learn from it — build on what worked, adjust what didn't, acknowledge their patterns across months

RESPONSE FORMAT (strict JSON, no markdown):
{
  "greeting": "short warm opening — acknowledge their salary, set the tone",
  "items": [
    {
      "label": "item name (lowercase, casual — 'makan', 'grab', 'cc bill')",
      "amount": 600,
      "category": "food",
      "rationale": "short reason — 'your 3-month avg' or 'covers netflix + spotify'",
      "alert": "only if something notable — 'you spent RM 350 last month, this is tight' or null",
      "confidence": "high|medium|low",
      "source": "recurring|historical|debt|goal|subscription|estimate"
    }
  ],
  "warnings": [
    "big-picture alerts — 'your subs total RM 260, that's 8% of your salary'",
    "or 'no savings allocation — consider setting aside even RM 100'"
  ],
  "summary": "one warm closing paragraph about their overall financial picture — honest, never judgmental"
}

RULES:
- Use ${currency} amounts (numbers only in amount field)
- category is REQUIRED on every item — use exact IDs: food, transport, shopping, entertainment, bills, health, education, family, subscription, debt_payment, other
- Labels: how a Malaysian would write them — "makan", "grab", "cc bill", not "Food & Dining", "Transportation"
- rationale: ALWAYS explain WHY this amount — "avg last 3 months", "minimum payment", "covers spotify + netflix"
- alert: ONLY when spending deviates 30%+ from their norm, or something genuinely notable. null otherwise
- Maximum 8 items — quality over quantity
- Amounts rounded to nearest 10 or 50
- greeting and summary: warm, honest, like a friend. Never say "you should". PLAIN TEXT ONLY — no markdown, no ** or * formatting
- warnings: max 3, only genuine concerns. Empty array if nothing notable. Plain text, no markdown
- Total items should NOT exceed the salary amount — if they do, warn about it

DEDUPLICATION (CRITICAL — read carefully):
- NEVER suggest an item that already exists in the notebook — check "existing items" in the data. Match by MEANING, not just exact text. "cc bill" = "credit card" = "credit card bill" = "kad kredit". "makan" = "food" = "groceries". "grab" = "transport" = "commute".
- NEVER create two items in YOUR OWN response that overlap. If you have "bills" covering utilities + internet, don't also add a separate "wifi" or "internet" item.
- Group related spending into ONE item. Multiple subscriptions → one "subs" item. Multiple debt payments → one "hutang" item (list what it covers in rationale).
- If an obligation or subscription is already covered by an existing notebook item, skip it entirely.
- Before finalizing, review your items list: would a human see any two items and think "isn't that the same thing?" If yes, merge them.`;
}

// ─── Main API Call ──────────────────────────────────────────

export async function askEchoPlan(playbook: Playbook): Promise<PlaybookAIResult> {
  if (!isGeminiAvailable()) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) return { ok: false, error: `echo is cooling down — ${secs}s` };
    return { ok: false, error: 'echo is unavailable right now' };
  }

  const premium = usePremiumStore.getState();
  if (!premium.canUseAI()) {
    return { ok: false, error: 'AI limit reached this month' };
  }

  try {
    const currency = useSettingsStore.getState().currency;
    const context = buildPlaybookContext(playbook);
    _lastPlanContext = context; // cache for multi-turn chat reuse
    const systemPrompt = buildEchoPrompt(currency);

    const data = await callGeminiAPI(
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: `Here is the user's full financial data:\n\n${context}\n\nCreate a complete spending plan for this paycheck.` }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      },
      30_000,
    );

    if (!data) {
      return { ok: false, error: "couldn't reach echo — check your internet" };
    }

    const candidate = data?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text?.trim();
    if (!rawText) {
      return { ok: false, error: 'echo returned empty — try again' };
    }

    const truncated = candidate?.finishReason === 'MAX_TOKENS';

    premium.incrementAiCalls();
    return parseEchoResponse(rawText, truncated);
  } catch (err: any) {
    if (__DEV__) console.warn('[PlaybookAI] Error:', err);
    if (err?.name === 'AbortError') return { ok: false, error: 'request timed out' };
    return { ok: false, error: 'something went wrong — try again' };
  }
}

// ─── Echo Chat (multi-turn follow-up) ────────────────────────

export async function chatWithEcho(
  playbook: Playbook,
  plan: EchoPlanResponse,
  messages: { role: 'user' | 'echo'; text: string }[],
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  if (!isGeminiAvailable()) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) return { ok: false, error: `cooling down — ${secs}s` };
    return { ok: false, error: 'echo is unavailable right now' };
  }

  const premium = usePremiumStore.getState();
  if (!premium.canUseAI()) {
    return { ok: false, error: 'AI limit reached this month' };
  }

  try {
    const currency = useSettingsStore.getState().currency;
    const context = _lastPlanContext || buildPlaybookContext(playbook);

    const systemPrompt = `You are Echo, the AI brain inside Potraces — a Malaysian personal finance app. You know EVERYTHING about this user's financial life.

You just gave the user a spending plan for their salary. Now they want to discuss it — ask questions, explore alternatives, get advice on managing their money better.

HOW TO RESPOND:
- PLAIN TEXT ONLY — never use markdown, never use ** or * or # or bullet points or any formatting. Just write normally like a text message.
- Be warm but ANALYTICAL — you're a smart friend who actually does the math
- ALWAYS show the numbers: "if you cut makan from ${currency} 600 to ${currency} 400, that frees up ${currency} 200 — enough to cover your savings goal"
- Compare against their REAL data: "your 3-month avg for food is ${currency} 580, so ${currency} 400 would be tight"
- Think about ripple effects: cutting one thing affects others
- Give actual advice based on their debt, savings goals, spending patterns — not generic tips
- Be honest about what's realistic vs wishful thinking
- Reference specific numbers from their financial data
- If they ask about saving more, calculate exactly how much and from where
- If they ask about debt, show the impact of different payoff strategies
- Malaysian context: "makan", "grab", casual language
- Never say "you should" — suggest, don't command
- Use ${currency} for all amounts
- Always finish your thought — never cut off mid-sentence
- If PAST ECHO ADVICE is in the data, you remember previous sessions — reference past advice when relevant ("last month we talked about cutting food to ${currency} 500, looks like that worked")`;

    // Build multi-turn conversation
    const contents: any[] = [
      {
        role: 'user' as const,
        parts: [{ text: `Here is my full financial data:\n\n${context}\n\nHere is the plan you gave me:\n${JSON.stringify(plan)}\n\nI want to discuss it with you.` }],
      },
      {
        role: 'model' as const,
        parts: [{ text: `got it — ask me anything about the plan.` }],
      },
    ];

    for (const msg of messages) {
      contents.push({
        role: msg.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: msg.text }],
      });
    }

    const data = await callGeminiAPI(
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 2048,
        },
      },
      30_000,
    );

    if (!data) {
      return { ok: false, error: "couldn't reach echo — check your internet" };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return { ok: false, error: 'echo returned empty — try again' };
    }

    premium.incrementAiCalls();
    return { ok: true, reply: text };
  } catch (err: any) {
    if (__DEV__) console.warn('[PlaybookAI] Chat error:', err);
    if (err?.name === 'AbortError') return { ok: false, error: 'request timed out' };
    return { ok: false, error: 'something went wrong — try again' };
  }
}

// ─── Lightweight Insight Call ────────────────────────────────

export async function getPlaybookInsight(
  playbook: Playbook,
): Promise<{ ok: true; insight: string } | { ok: false }> {
  if (!isGeminiAvailable()) return { ok: false };

  const premium = usePremiumStore.getState();
  if (!premium.canUseAI()) return { ok: false };

  try {
    const currency = useSettingsStore.getState().currency;
    const transactions = usePersonalStore.getState().transactions;
    const stats = computePlaybookStats(playbook, transactions);

    const context = `Playbook: ${playbook.name}
Source: ${currency} ${playbook.sourceAmount}
Spent: ${currency} ${stats.totalSpent.toFixed(0)} (${stats.percentSpent.toFixed(0)}%)
Remaining: ${currency} ${stats.remaining.toFixed(0)}
Burn rate: ${currency} ${stats.dailyBurnRate.toFixed(0)}/day
Days active: ${stats.daysActive}
Top categories: ${stats.categoryBreakdown.slice(0, 5).map((c) => `${c.category} ${currency} ${c.spent.toFixed(0)}`).join(', ')}`;

    const data = await callGeminiAPI(
      {
        system_instruction: {
          parts: [{
            text: `You are Echo. Write ONE warm, honest sentence about what you notice in their spending. Be like a friend, not an advisor. Never say "you should" or judge. Use ${currency} for amounts. Keep it under 30 words.`,
          }],
        },
        contents: [{ role: 'user' as const, parts: [{ text: context }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 128 },
      },
      15_000,
    );

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      premium.incrementAiCalls();
      return { ok: true, insight: text };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// ─── Echo Memory Helper ─────────────────────────────────────

/** Auto-extract a compact memory entry from an Echo session */
export function buildEchoMemoryEntry(
  playbook: Playbook,
  plan: EchoPlanResponse,
  chatMessages: { role: 'user' | 'echo'; text: string }[],
): Omit<EchoMemoryEntry, 'date'> {
  const keyAdvice = plan.items
    .filter((i) => i.confidence === 'high' || i.alert)
    .slice(0, 3)
    .map((i) => i.alert || `${i.label}: ${i.rationale}`);

  if (plan.warnings.length > 0) {
    keyAdvice.push(...plan.warnings.slice(0, 2));
  }

  const chatHighlights = chatMessages
    .filter((m) => m.role === 'user')
    .slice(0, 3)
    .map((m) => m.text.length > 60 ? m.text.slice(0, 57) + '...' : m.text);

  return {
    playbookName: playbook.name,
    sourceAmount: playbook.sourceAmount,
    planSummary: plan.summary.length > 200 ? plan.summary.slice(0, 197) + '...' : plan.summary,
    keyAdvice: keyAdvice.slice(0, 5),
    chatHighlights,
  };
}

// ─── Response Parser ────────────────────────────────────────

function parseEchoResponse(raw: string, truncated = false): PlaybookAIResult {
  try {
    let cleaned = raw;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Parse with truncation recovery
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      if (truncated || !cleaned.endsWith('}')) {
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace > 0) {
          const salvaged = cleaned.slice(0, lastBrace + 1) + ']}';
          try {
            parsed = JSON.parse(salvaged);
          } catch {
            try { parsed = JSON.parse(salvaged + '}'); } catch { /* give up */ }
          }
        }
      }
      if (!parsed) throw new Error('Could not parse');
    }

    const items: EchoPlanItem[] = [];

    if (Array.isArray(parsed.items)) {
      for (const s of parsed.items) {
        if (!s.label || typeof s.label !== 'string') continue;
        const amount = typeof s.amount === 'number' ? s.amount : parseFloat(s.amount);
        if (isNaN(amount) || amount <= 0) continue;

        items.push({
          label: s.label.trim().toLowerCase(),
          amount: Math.round(amount),
          category: typeof s.category === 'string' ? s.category.trim() : undefined,
          rationale: typeof s.rationale === 'string' ? s.rationale.trim() : '',
          alert: typeof s.alert === 'string' && s.alert.trim() ? s.alert.trim() : undefined,
          confidence: ['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : 'medium',
          source: ['recurring', 'historical', 'debt', 'goal', 'subscription', 'estimate'].includes(s.source)
            ? s.source
            : 'estimate',
        });
      }
    }

    if (items.length === 0) {
      return { ok: false, error: 'echo had no plan items — try again' };
    }

    const greeting = typeof parsed.greeting === 'string' ? parsed.greeting.trim() : '';
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w: any) => typeof w === 'string' && w.trim()).map((w: any) => w.trim())
      : [];

    return { ok: true, plan: { greeting, items, warnings, summary } };
  } catch {
    if (__DEV__) console.warn('[PlaybookAI] Parse error, raw:', raw.slice(0, 200));
    return { ok: false, error: 'echo response was garbled — try again' };
  }
}
