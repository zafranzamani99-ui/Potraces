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
import { callGeminiAPI, streamGeminiText, isGeminiAvailable, getCooldownSecondsLeft } from './geminiClient';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useSavingsStore } from '../store/savingsStore';
import { usePlaybookStore, EchoMemoryEntry } from '../store/playbookStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePremiumStore } from '../store/premiumStore';
import { useLearningStore } from '../store/learningStore';
import { Playbook } from '../types';
import { computeNotebookStats, computePlaybookStats, computePlanVsActual } from '../utils/playbookStats';
import { getPlaybookObligations } from '../utils/playbookObligations';
import { computePlaybookPlan, moneyStr } from './playbookPlan';

// ─── Types ──────────────────────────────────────────────────

export interface EchoPlanItem {
  /** lowercase, casual label — "bills", "safety money", "living money", "transport" */
  label: string;
  /** ringgit figure. 0 when needsInput is true (Echo isn't confident yet) */
  amount: number;
  /** category id, if known */
  category?: string;
  /** ONE short plain line tied to the user's own life. No %/burn/pace/jargon. */
  rationale: string;
  /** true when Echo can't confidently pick a number (thin/irregular data). amount = 0, question set. */
  needsInput?: boolean;
  /** gentle ask shown when needsInput is true — "I don't know your transport yet — leave it blank or set something?" */
  question?: string;
  /** @deprecated no longer surfaced in UI; kept for parser/memory compatibility */
  alert?: string;
  /** @deprecated no longer surfaced */
  confidence?: 'high' | 'medium' | 'low';
  /** @deprecated no longer surfaced */
  source?: 'recurring' | 'historical' | 'debt' | 'goal' | 'subscription' | 'estimate';
}

export interface EchoPlanResponse {
  /** kept for backward compat (memory entries); Turn 1 hero is `reflection` */
  greeting: string;
  /** Turn 1: ONE-line mirror of the user's intent + what Echo is looking at, ending in a soft confirm. NO numbers. */
  reflection: string;
  items: EchoPlanItem[];
  /** at most ONE, gentle, framed as a choice. The plan does NOT depend on showing this. */
  warnings: string[];
  /** ONE warm closing sentence: what's handled + a tiny set-aside + the safe-to-spend daily. The hero deliverable. */
  summary: string;
}

/** What the user told Echo before planning (from intent chips + steadiness toggle). */
export interface EchoPlanOpts {
  /** stated intent: "just make it last" | "rent/bills scare me" | "save a bit" | "you decide" | free text */
  intent?: string;
  /** true = steady income; false = it changes month to month. undefined = unknown. */
  incomeSteady?: boolean;
}

export type PlaybookAIResult =
  | { ok: true; plan: EchoPlanResponse }
  | { ok: false; error: string };

// Cache context from plan generation for multi-turn chat reuse
let _lastPlanContext: string | null = null;

// ─── Context Builder ────────────────────────────────────────

function buildPlaybookContext(playbook: Playbook, opts: EchoPlanOpts = {}): string {
  const currency = useSettingsStore.getState().currency;
  const now = new Date();

  // ── 0. What the user told Echo (intent + steadiness) ──
  let ctx = `WHAT THE USER TOLD YOU (lead with this — reflect it back before any numbers):`;
  ctx += `\n  their words / intent: ${opts.intent && opts.intent.trim() ? opts.intent.trim() : '(they tapped "you decide" — they want you to lead)'}`;
  if (opts.incomeSteady === true) {
    ctx += `\n  income: steady — same most months, you can plan normally`;
  } else if (opts.incomeSteady === false) {
    ctx += `\n  income: IT CHANGES month to month — be conservative, keep the plan flexible, and SAY you kept it flexible because it varies`;
  } else {
    ctx += `\n  income: unknown — if their history looks irregular, lean conservative`;
  }

  // ── 1. Current playbook state ──
  const existingItems = playbook.lineItems || [];
  const nbStats = computeNotebookStats(existingItems);

  ctx += `\n\nCURRENT PLAYBOOK:
name: ${playbook.name}
money coming in: ${currency} ${playbook.sourceAmount.toLocaleString('en-MY')}
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

  // Count months that actually have expense data — tells Echo how much it can trust.
  const monthsWithData = monthlyExpenses.filter((x) => x > 0).length;
  const totalExpenseTxns = transactions.filter((t) => t.type === 'expense').length;
  const thinHistory = monthsWithData < 2 || totalExpenseTxns < 8;

  if (spendPatterns.length > 0) {
    const totalAvg = spendPatterns.reduce((s, p) => s + p.avg, 0);
    ctx += `\n\nWHAT THEY USUALLY SPEND (last few months, for grounding rationale — say "about what you spent last month", never quote %):`;
    for (const p of spendPatterns.slice(0, 8)) {
      ctx += `\n  ${p.cat}: about ${currency} ${Math.round(p.avg)}/mo`;
    }
    ctx += `\n  rough total they usually spend: ${currency} ${Math.round(totalAvg)}/mo`;
  }

  ctx += `\n\nHISTORY DEPTH: ${monthsWithData} month(s) with spending logged, ${totalExpenseTxns} expense entries total.`;
  if (thinHistory) {
    ctx += ` THIN — this is basically a first run. ADMIT it gently ("first time — rough start, we'll dial it in"), and for any category you can't ground in real spending, set needsInput=true with amount=0 and a soft question instead of guessing a number.`;
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
    ctx += `\n\nPAST PLAYBOOKS (planned vs ACTUAL — where the money really went, from linked spend):`;
    for (const pp of pastPlaybooks) {
      const ppStats = computePlaybookStats(pp, transactions);
      const kept = Math.round((pp.sourceAmount - ppStats.totalSpent) * 100) / 100;
      const keptLabel = kept >= 0 ? `kept ${currency} ${kept}` : `went ${currency} ${Math.abs(kept)} over`;
      ctx += `\n  "${pp.name}" (${currency} ${pp.sourceAmount}, ${keptLabel}):`;
      const rows = computePlanVsActual(pp, transactions);
      if (rows.length === 0) {
        ctx += `\n    (no linked spend recorded)`;
      }
      for (const row of rows) {
        const diff = Math.round((row.actual - row.planned) * 100) / 100;
        const diffLabel = diff > 0 ? ` (+${currency} ${diff} over)` : diff < 0 ? ` (-${currency} ${Math.abs(diff)} under)` : '';
        ctx += `\n    ${row.category}: planned ${currency} ${row.planned}, actual ${currency} ${row.actual}${diffLabel}`;
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

  // ── 9b. Already-handled vs money left (obligations are NOT plan items) ──
  // Obligations (subscriptions + debts due this period) are already-committed money
  // tracked in a separate checklist. The plan only works with what's LEFT after them.
  const oblTotal = oblResult.items.reduce((s, o) => s + o.amount, 0);
  const moneyLeft = Math.max(0, Math.round((playbook.sourceAmount - oblTotal) * 100) / 100);
  ctx += `\n\nALREADY HANDLED (bills/obligations — covered for them, present as a calm "handled" line, NEVER a scary list, DO NOT make plan items for these): ${currency} ${oblTotal}`;
  ctx += `\nMONEY LEFT TO WORK WITH (coming in − already handled): ${currency} ${moneyLeft}`;

  // ── 9c. Days in this period + a rough daily figure (the hero number) ──
  const periodStart = playbook.startDate instanceof Date ? playbook.startDate : new Date(playbook.startDate);
  // assume a roughly month-long period if no clear end; clamp to a sane range
  let daysInPeriod = 30;
  if (!isNaN(periodStart.getTime())) {
    const end = endOfMonth(periodStart);
    const d = Math.ceil((end.getTime() - periodStart.getTime()) / 86400000) + 1;
    if (d >= 7 && d <= 45) daysInPeriod = d;
  }
  ctx += `\nDAYS IN THIS PERIOD: ~${daysInPeriod} (use this to work out the safe-to-spend daily figure: living money ÷ days)`;

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

// ─── Plan Input Summary (synchronous — no API call) ─────────

/**
 * Plain-language summary of WHAT the plan is based on, so a stressed user can
 * trust it. Reuses the same store data buildPlaybookContext reads — NO API call.
 * Returns 4–6 short, warm bullet lines. No jargon (no burn/pace/%).
 */
export function getPlanInputSummary(playbook: Playbook): string[] {
  const currency = useSettingsStore.getState().currency;
  const now = new Date();
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString('en-MY')}`;
  const lines: string[] = [];

  // ── salary / source ──
  lines.push(`your salary: ${money(playbook.sourceAmount)}`);

  // ── top spending categories (3-month per-category avg) ──
  const { transactions } = usePersonalStore.getState();
  const catMonthly: Record<string, number[]> = {};
  for (let m = 1; m <= 3; m++) {
    const ms = startOfMonth(subMonths(now, m));
    const me = endOfMonth(subMonths(now, m));
    const monthExpenses = transactions.filter((t) => {
      if (t.type !== 'expense') return false;
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return isWithinInterval(d, { start: ms, end: me });
    });
    for (const t of monthExpenses) {
      if (!catMonthly[t.category]) catMonthly[t.category] = [0, 0, 0];
      catMonthly[t.category][m - 1] += t.amount;
    }
  }
  const topCats = Object.entries(catMonthly)
    .map(([cat, months]) => {
      const nonZero = months.filter((x) => x > 0);
      const avg = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
      return { cat, avg };
    })
    .filter((p) => p.avg > 0)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);
  if (topCats.length > 0) {
    const first = topCats[0];
    const rest = topCats.slice(1);
    let spendLine = `you usually spend about ${money(first.avg)}/mo on ${first.cat}`;
    for (const p of rest) {
      spendLine += `, ${money(p.avg)} on ${p.cat}`;
    }
    lines.push(spendLine);
  }

  // ── bills / obligations due this period ──
  const oblResult = getPlaybookObligations(playbook, playbook.coveredObligationIds || []);
  if (oblResult.items.length > 0) {
    const n = oblResult.items.length;
    lines.push(`${n} ${n === 1 ? 'bill' : 'bills'} due this month (${money(oblResult.totalAmount)})`);
  }

  // ── debts you owe ──
  const { debts } = useDebtStore.getState();
  const iOwe = debts.filter((d) => d.status !== 'settled' && d.type === 'i_owe');
  if (iOwe.length > 0) {
    lines.push(`${iOwe.length} ${iOwe.length === 1 ? 'debt' : 'debts'} you owe`);
  }

  // ── past months to learn from ──
  const pastClosed = usePlaybookStore.getState().playbooks.filter(
    (p) => p.isClosed && p.id !== playbook.id && (p.lineItems?.length ?? 0) > 0,
  );
  if (pastClosed.length > 0) {
    lines.push(`${pastClosed.length} past ${pastClosed.length === 1 ? 'month' : 'months'} to learn from`);
  }

  return lines;
}

// ─── System Prompt ──────────────────────────────────────────

function buildEchoPrompt(currency: string): string {
  return `You are Echo, a calm money companion inside Potraces — a Malaysian app. The person reading this is likely a young, financially STRESSED person. They are not in trouble with you. Your whole job is to make the next few weeks feel survivable.

VOICE (this matters more than the math):
- Calm. Quiet. Plain. Like a steady older sibling who has been broke too.
- NEVER scold, never imply they did anything wrong, never use alarm.
- Short words. Real life. No finance-class language.
- Safety first: protect what they can't skip BEFORE talking about anything fun or "saving".
- When you are not sure about a number, you ASK — you do not guess and pretend.

HOW TO BUILD THE PLAN, IN THIS ORDER:
1. PROTECT FIRST — the bills/obligations they can't skip are ALREADY HANDLED (see "ALREADY HANDLED" in the data). Make ONE calm item for this (label like "bills", needsInput false) that just confirms it's covered. NEVER list out each scary bill. NEVER make it feel like a pile of debt.
2. SAFETY MONEY — a small buffer, roughly ${currency} 150–250, for the thing that always goes wrong (label "safety money"). This is safety, not savings.
3. A TINY WIN — a small set-aside, roughly ${currency} 50 (label "set aside" or "saved"). KEEP IT TINY. A big savings target makes a broke person feel they can't save at all. Small and doable beats ambitious every time.
4. LIVING MONEY + THE DAILY FIGURE (the hero) — whatever is left is living money. Work out the safe-to-spend-per-day = living money ÷ days in the period (in the data). The daily figure is the single most important thing you give them.
- Cap the whole plan to about 3 to 5 items. Not 8. Fewer, calmer, clearer.

REFLECT BEFORE YOU PRESCRIBE:
- "reflection" is Turn 1. It is ONE line that mirrors back what THEY said they want + what you're looking at, ending in a soft confirm. NO numbers at all in reflection. Example: "okay — you just want this to last till month-end, and i'm looking at your bills and the usual stuff. sound right?"

ASK WHEN UNSURE:
- For any item where the data is thin or irregular and you genuinely don't know a fair number, set needsInput=true, amount=0, and write a gentle question. Example question: "i don't know your transport yet — leave it blank or set something?" Do NOT invent a confident number to fill a gap.

INCOME THAT CHANGES:
- If the data says income changes month to month, be more conservative (smaller tiny-win, slightly bigger safety money) and say so in the summary, e.g. "since it varies, i kept it flexible".

THIN / FIRST-TIME DATA:
- If the data says history is thin, admit it warmly in the reflection or summary ("first time — rough start, we'll dial it in") and use needsInput instead of confident numbers for anything you can't ground.

WARNINGS:
- AT MOST ONE. Gentle. Always framed as a CHOICE, never a verdict. Example: "things are a little tight this month — want me to find room, or trim something small?"
- The plan must make full sense WITHOUT the warning. Never put the warning first, never make the plan depend on it. Empty array is perfectly fine and usually better.

RESPONSE FORMAT (strict JSON, no markdown, no code fences):
{
  "reflection": "ONE line mirroring their intent + what you're looking at, soft confirm at the end. NO numbers.",
  "items": [
    {
      "label": "bills",
      "amount": 0,
      "category": "bills",
      "rationale": "this is handled — already set aside",
      "needsInput": false
    },
    {
      "label": "safety money",
      "amount": 200,
      "category": "other",
      "rationale": "for when something unexpected comes up",
      "needsInput": false
    },
    {
      "label": "transport",
      "amount": 0,
      "category": "transport",
      "needsInput": true,
      "question": "i don't know your transport yet — leave it blank or set something?"
    }
  ],
  "warnings": [],
  "summary": "ONE warm closing sentence: what's handled + the tiny set-aside + the safe daily figure. e.g. 'bills handled, ${currency} 50 set aside, about ${currency} 65 a day to live on — you're okay.'"
}

ITEM RULES:
- Use ${currency} amounts (numbers only in the amount field).
- category uses these exact ids when known: food, transport, shopping, entertainment, bills, health, education, family, subscription, debt_payment, other.
- label: lowercase, casual, plain — "bills", "safety money", "set aside", "living money", "makan", "transport".
- rationale: ONE short plain line tied to their own life — "about what you spent last month", "for when something comes up", "this is handled". NEVER use %, never "burn", "pace", "runway", "allocate", "discretionary". NEVER show source or confidence.
- needsInput: true ONLY when you truly can't ground a number — then amount MUST be 0 and question MUST be set, and skip rationale numbers.
- "bills"/handled item: amount may be 0 (it's tracked elsewhere) — it exists to reassure, not to spend.
- Amounts rounded to nearest 10 or 50. Keep the tiny-win small (~${currency} 50). Keep safety money ~${currency} 150–250.

BILLS/OBLIGATIONS ARE OFF-LIMITS AS SPEND ITEMS:
- The "ALREADY HANDLED" amount is committed money tracked separately. Make ONE calm "bills" confirm item — never one item per bill, never a debt pile. The rest of your items only ever work with "MONEY LEFT TO WORK WITH".

DON'T DOUBLE UP:
- Don't repeat anything already in "existing items". Match by meaning. Group related things into one item. If two of your own items feel like the same thing to a normal person, merge them.

BANNED WORDS — never appear anywhere in your output (any field): profit, loss, revenue, burn, pace, runway, discretionary, allocate, "you should", overspent, and the "%" symbol. No red/alarm framing. No judgement.`;
}

// ─── Main API Call ──────────────────────────────────────────

/**
 * Deterministic Playbook plan from live store data — the getState() glue around the pure
 * computePlaybookPlan. Never throws: on any failure it returns a minimal one-line plan so the
 * UI always has something real to show.
 */
function buildPlaybookPlan(playbook: Playbook, opts: EchoPlanOpts = {}): EchoPlanResponse {
  const currency = useSettingsStore.getState().currency;
  try {
    const startDate = playbook.startDate instanceof Date ? playbook.startDate : new Date(playbook.startDate);
    const asOf = isNaN(startDate.getTime()) ? new Date() : startDate;
    const obl = getPlaybookObligations(playbook, playbook.coveredObligationIds || []);
    return computePlaybookPlan({
      sourceAmount: playbook.sourceAmount,
      startDate: asOf,
      obligations: obl.items.map((o) => ({ label: o.label, amount: o.amount })),
      txns: usePersonalStore.getState().transactions,
      debts: useDebtStore.getState().debts,
      wallets: useWalletStore.getState().wallets,
      asOf,
      currency,
      opts,
    });
  } catch (e) {
    if (__DEV__) console.warn('[PlaybookAI] plan fell back to minimal:', e);
    const live = Math.max(0, Math.round(playbook.sourceAmount || 0));
    return {
      greeting: '',
      reflection: 'okay — here’s a simple way to spread this out. sound right?',
      items: [{ label: 'living money', amount: live, category: 'other', rationale: 'what you have to live on this round' }],
      warnings: [],
      summary: `about ${moneyStr(currency, live)} to work with this round — you’re okay.`,
    };
  }
}

/**
 * Overlay the LLM's WORDS onto the deterministic plan. Numbers, the summary, and the critic's
 * warning are ALWAYS the engine's — the model can only change phrasing (reflection + per-item
 * rationale, both number-free by the prompt's own rules). This is how "one brain" stays honest.
 */
function mergeNarration(det: EchoPlanResponse, llm: EchoPlanResponse): EchoPlanResponse {
  const rByCat: Record<string, string> = {};
  const rByLabel: Record<string, string> = {};
  for (const it of llm.items) {
    if (it.rationale && it.rationale.trim()) {
      if (it.category) rByCat[it.category] = it.rationale.trim();
      rByLabel[it.label.toLowerCase()] = it.rationale.trim();
    }
  }
  const items = det.items.map((di) => {
    const r = (di.category && rByCat[di.category]) || rByLabel[di.label.toLowerCase()] || di.rationale;
    return { ...di, rationale: r };
  });
  return {
    greeting: (llm.reflection && llm.reflection.trim()) || det.greeting,
    reflection: (llm.reflection && llm.reflection.trim()) || det.reflection,
    items,
    warnings: det.warnings,
    summary: det.summary,
  };
}

export async function askEchoPlan(
  playbook: Playbook,
  opts: EchoPlanOpts = {},
): Promise<PlaybookAIResult> {
  // ── DETERMINISTIC numbers (the fusion) ──
  // Every ringgit comes from the shared budgeting engine + critic — NEVER the LLM. The lump
  // is the period's take-home, the Playbook's bills are the protected commitments, and the
  // cushion is sized from the user's reality. See playbookPlan.ts.
  const det = buildPlaybookPlan(playbook, opts);
  const premium = usePremiumStore.getState();

  // Offline / out of AI quota: the deterministic plan stands on its own. (This path used to
  // hard-fail with an error — now the user ALWAYS gets a real plan, instantly and for free.)
  if (!isGeminiAvailable() || !premium.canUseAI()) {
    try { _lastPlanContext = buildPlaybookContext(playbook, opts); } catch { _lastPlanContext = null; }
    return { ok: true, plan: det };
  }

  // Online: let Echo warm up the WORDS only (reflection + per-item rationale). Numbers, the
  // summary, and the critic's warning stay deterministic — the LLM can never move a ringgit.
  try {
    const currency = useSettingsStore.getState().currency;
    const context = buildPlaybookContext(playbook, opts);
    _lastPlanContext = context; // cache for multi-turn chat reuse
    const systemPrompt = buildEchoPrompt(currency);

    const data = await callGeminiAPI(
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: `Here is the user's full financial data:\n\n${context}\n\nReflect back what they want, then give a calm, safety-first plan for this money.` }],
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

    const candidate = data?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text?.trim();
    if (!rawText) return { ok: true, plan: det };

    const parsed = parseEchoResponse(rawText, candidate?.finishReason === 'MAX_TOKENS');
    if (!parsed.ok) return { ok: true, plan: det };

    premium.incrementAiCalls();
    return { ok: true, plan: mergeNarration(det, parsed.plan) };
  } catch (err: any) {
    if (__DEV__) console.warn('[PlaybookAI] narration failed, using deterministic plan:', err);
    return { ok: true, plan: det };
  }
}

// ─── Echo Chat (multi-turn follow-up) ────────────────────────

/** Availability + quota gate for Echo chat. Returns an error result or null. */
function _echoChatGate(): { ok: false; error: string } | null {
  if (!isGeminiAvailable()) {
    const secs = getCooldownSecondsLeft();
    if (secs > 0) return { ok: false, error: `cooling down — ${secs}s` };
    return { ok: false, error: 'echo is unavailable right now' };
  }
  if (!usePremiumStore.getState().canUseAI()) {
    return { ok: false, error: 'AI limit reached this month' };
  }
  return null;
}

/** Build the Gemini request body for an Echo chat turn (shared by both paths). */
function _buildEchoChatBody(
  playbook: Playbook,
  plan: EchoPlanResponse,
  messages: { role: 'user' | 'echo'; text: string }[],
) {
  const currency = useSettingsStore.getState().currency;
  const context = _lastPlanContext || buildPlaybookContext(playbook);

  const systemPrompt = `You are Echo, a calm money companion inside Potraces — a Malaysian app. The person reading this is likely young and financially stressed. You just gave them a gentle, safety-first plan for their money. Now they want to talk it through.

VOICE (matters most):
- Calm, quiet, plain. Like a steady older sibling who has been broke too. Never scold, never alarm, never imply they did anything wrong.
- Safety first — protect what they can't skip before anything fun or "saving".
- When you're not sure of a number, ask instead of guessing.

HOW TO RESPOND:
- PLAIN TEXT ONLY — no markdown, no ** or * or # or bullet points. Write like a calm text message.
- Use their own life as the reference — "about what you spent last month", not stats. Keep numbers light and only when they help.
- If they want to free up money, show simply where it could come from, framed as a choice ("want me to find room, or trim something small?").
- Honest but never harsh about what's realistic.
- Malaysian context: "makan", "grab", casual language.
- Use ${currency} for amounts. Always finish your thought — never cut off mid-sentence.
- If PAST ECHO ADVICE is in the data, you remember past sessions — reference gently when relevant.

BANNED WORDS — never use, anywhere: profit, loss, revenue, burn, pace, runway, discretionary, allocate, "you should", overspent, and the "%" symbol. No red/alarm framing, no judgement.`;

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

  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 2048,
    },
  };
}

export async function chatWithEcho(
  playbook: Playbook,
  plan: EchoPlanResponse,
  messages: { role: 'user' | 'echo'; text: string }[],
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const gate = _echoChatGate();
  if (gate) return gate;

  const premium = usePremiumStore.getState();

  try {
    const data = await callGeminiAPI(_buildEchoChatBody(playbook, plan, messages), 30_000);

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

/**
 * Streaming variant of chatWithEcho. Reuses streamGeminiText and calls `onToken`
 * with the cumulative reply-so-far on each delta (REPLACE the displayed text each
 * call). Echo chat replies are PLAIN TEXT — no action markup to strip.
 *
 * Resolves with the FINAL full reply so the caller's post-processing (appending
 * the message to the thread) runs unchanged on the complete text.
 *
 * Falls back to the non-streaming chatWithEcho if streaming is unavailable,
 * throws, or yields nothing — the chat is never left broken.
 */
export async function chatWithEchoStream(
  playbook: Playbook,
  plan: EchoPlanResponse,
  messages: { role: 'user' | 'echo'; text: string }[],
  onToken: (textSoFar: string) => void,
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const gate = _echoChatGate();
  if (gate) return gate;

  const premium = usePremiumStore.getState();

  let last = '';
  let yieldedAny = false;
  try {
    const body = _buildEchoChatBody(playbook, plan, messages);
    for await (const textSoFar of streamGeminiText(body, 30_000)) {
      last = textSoFar;
      yieldedAny = true;
      onToken(textSoFar);
    }
  } catch (err: any) {
    if (__DEV__) console.warn('[PlaybookAI] stream chat failed, falling back:', err);
    // Fall back to the non-streaming path — never leave the chat broken.
    return await chatWithEcho(playbook, plan, messages);
  }

  const finalText = last.trim();
  if (yieldedAny && finalText) {
    premium.incrementAiCalls();
    return { ok: true, reply: finalText };
  }

  // Stream produced nothing usable — fall back.
  return await chatWithEcho(playbook, plan, messages);
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
    .filter((i) => !i.needsInput && i.amount > 0)
    .slice(0, 3)
    .map((i) => `${i.label}: ${i.rationale || `${i.amount}`}`);

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

        const needsInput = s.needsInput === true;
        const rawAmount = typeof s.amount === 'number' ? s.amount : parseFloat(s.amount);
        const amount = isNaN(rawAmount) || rawAmount < 0 ? 0 : Math.round(rawAmount);
        const question = typeof s.question === 'string' && s.question.trim() ? s.question.trim() : undefined;

        // Keep an item if it has a real amount, OR it's an explicit ask, OR it's a
        // zero-amount reassurance line (e.g. "bills" handled). Drop empty noise.
        if (amount <= 0 && !needsInput && !question) continue;

        items.push({
          label: s.label.trim().toLowerCase(),
          amount: needsInput ? 0 : amount,
          category: typeof s.category === 'string' ? s.category.trim() : undefined,
          rationale: typeof s.rationale === 'string' ? s.rationale.trim() : '',
          ...(needsInput ? { needsInput: true } : {}),
          ...(question ? { question } : {}),
          // legacy fields kept for memory/compat, not surfaced in UI
          alert: typeof s.alert === 'string' && s.alert.trim() ? s.alert.trim() : undefined,
          confidence: ['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : undefined,
          source: ['recurring', 'historical', 'debt', 'goal', 'subscription', 'estimate'].includes(s.source)
            ? s.source
            : undefined,
        });
      }
    }

    if (items.length === 0) {
      return { ok: false, error: 'echo had no plan items — try again' };
    }

    for (const item of items) {
      if (item.amount > 1_000_000) item.amount = 0;
    }

    const reflection = typeof parsed.reflection === 'string' ? parsed.reflection.trim() : '';
    // greeting kept for backward compat (memory entries); fall back to reflection.
    const greeting = typeof parsed.greeting === 'string' && parsed.greeting.trim()
      ? parsed.greeting.trim()
      : reflection;
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    // At most ONE gentle warning is surfaced.
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w: any) => typeof w === 'string' && w.trim()).map((w: any) => w.trim()).slice(0, 1)
      : [];

    return { ok: true, plan: { greeting, reflection, items, warnings, summary } };
  } catch {
    if (__DEV__) console.warn('[PlaybookAI] Parse error, raw:', raw.slice(0, 200));
    return { ok: false, error: 'echo response was garbled — try again' };
  }
}
