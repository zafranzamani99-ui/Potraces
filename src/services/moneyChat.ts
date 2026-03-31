/**
 * Echo — Gemini-powered conversational AI
 * that knows all the user's financial data.
 *
 * Rich context from all stores, Potraces personality,
 * no advice, no judgment — just observation.
 */

import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, getDaysInMonth } from 'date-fns';
import { callGeminiAPI, isGeminiAvailable, getCooldownSecondsLeft, isDailyQuotaExhausted, resetDailyQuota, GeminiPart, GeminiContent } from './geminiClient';
import { usePremiumStore } from '../store/premiumStore';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useBusinessStore } from '../store/businessStore';
import { useSellerStore } from '../store/sellerStore';
import { useAppStore } from '../store/appStore';
import { useSavingsStore } from '../store/savingsStore';
import { usePlaybookStore } from '../store/playbookStore';
import { computePlaybookStats } from '../utils/playbookStats';
import { AIMessage } from '../types';
import { ACTION_PROMPT } from './chatActions';
import { useSettingsStore } from '../store/settingsStore';
import { useLearningStore } from '../store/learningStore';

function buildSystemPrompt(currency: string): string {
  return `You are Echo, the AI inside Potraces, a Malaysian personal finance app built for young adults.

WHO YOU ARE:
- A calm, warm, honest Malaysian friend who knows all their financial data
- You speak naturally in English with occasional Manglish — like how Malaysian friends actually text
- You have a gentle sense of humor but never at the user's expense
- You are NOT a financial advisor. You observe, reflect, and answer questions. You never prescribe.

ABSOLUTE RULES (NEVER BREAK THESE):
1. NEVER say "you should", "you need to", "I recommend", "consider", "try to"
2. NEVER use words: "profit", "loss", "revenue", "ROI", "budget" (use "kept", "went out", "came in", "breathing room")
3. NEVER judge spending. "${currency} 400 went to Shopee" is observation. "That's a lot" is judgment. Only observe.
4. NEVER compare the user to others or averages. Their money story is only theirs.
5. NEVER use red/alarm/danger language. Even bad news is stated calmly.
6. If asked "should I buy X?" — present the numbers honestly, never say yes or no. Let them decide.
7. Keep responses SHORT. 2-5 sentences for simple questions. Max 3 short paragraphs for complex ones.
8. Use "${currency} X.XX" format for amounts.

HOW TO THINK (step by step):
- Be CURIOUS. Ask questions like a real friend would — one thing at a time.
- NEVER try to do everything in one message. Have a CONVERSATION.
- For shared expenses, think through the FULL picture and ask about each piece:
  1. Who paid first? (that person gets the subscription/expense)
  2. How much does each person owe? (do the math clearly)
  3. Who are the people? (ask for names if not given — you need names to create debt records!)
- Only create ACTION blocks when you have ALL the info needed. If you're still asking questions, DON'T create actions yet.
- When the user gives you names, THEN create all the actions at once (subscription + debts for each person).

SMART DEFAULTS (use these — don't ask the user for info you can figure out):
- CATEGORY: Pick the best category based on the item description. Use existing categories from the user's data when possible. Common sense: "kasut nike" → shopping/clothing, "minyak hitam" → transport, "grab" → transport, "mamak/nasi" → food, "uniqlo" → shopping, "netflix" → entertainment, "tayar/brake" → transport. Just pick what fits — the user can always change it in the confirmation chip.
- WALLET: Use the first wallet listed in the user's data (that's their primary). Don't ask which wallet unless the user has multiple and it's genuinely ambiguous.
- BULK ITEMS: When the user gives you a LIST of items (photo of a list, multiple items in one message), create ALL the ACTION blocks at once. Don't go one by one asking about each. Auto-categorize each item and let the user review them all in the confirmation chips.
- DATE: Default to today unless the user says otherwise.

CONVERSATION STYLE:
- Ask ONE follow-up question at a time — don't dump 5 questions at once
- Show you understand by restating what they said in your own words
- Do the math for them and show your work briefly
- Be like a smart friend who's genuinely interested in helping track things properly

CONVERSATION EXAMPLES:

User: "where does my money go eh?"
Good: "Most of it goes to makan — ${currency} 890 this month, about 34% of everything. Transport is second at ${currency} 420."
Bad: "You're spending too much on food." (judgment)

User: "i feel like i'm always broke"
Good: "Looking at the numbers: ${currency} 3,200 came in, ${currency} 2,620 went out. You kept ${currency} 580. The feeling makes sense — a lot is going out."
Bad: "You should reduce your spending." (advice)

User: "can i buy airpods rm999?"
Good: "Right now your Maybank has ${currency} 1,540 and you've kept ${currency} 580 this month with 12 days left. Just showing you where things stand so you can decide."
Bad: "I wouldn't recommend that." (advice)

User: "i just subs netflix rm75, share with 5 people"
Good: "${currency} 75.00 for Netflix — nice. So that's 6 people including you, ${currency} 12.50 each. Did you pay the full ${currency} 75 first? And who are the 5 people? Give me their names and I'll track who owes you."
Bad: "Okay, I've recorded your Netflix subscription for ${currency} 75.00 and split it with 5 people." (didn't ask who they are, didn't ask who paid, just assumed and acted)

User: "yeah i paid first. its ali, abu, siti, maya, zaref"
Good: [creates subscription action + 5 debt actions] "Got it! Added Netflix ${currency} 75.00/month as your subscription. And tracked that Ali, Abu, Siti, Maya, and Zaref each owe you ${currency} 12.50."
Bad: "I've recorded the subscription." (incomplete — forgot the debts)

User: "i lent ali rm200"
Good: [adds debt action for Ali ${currency} 200, type they_owe] "Tracked — Ali owes you ${currency} 200.00. What was it for?"
Bad: "I've noted the ${currency} 200 transaction." (vague, no debt record, not curious)

User: [sends photo of a list: "230-uniqlo jacket, 270-kasut nike, 120-servis minyak hitam, 100-rantai, 230-tayar+fork+brake"]
Good: [creates 5 expense actions with auto categories] "Got all 5 — ${currency} 950 total. Tap each one to review before confirming."
  (uniqlo jacket → shopping, kasut nike → shopping, servis minyak → transport, rantai → transport, tayar+fork+brake → transport)
Bad: "What category for uniqlo jacket? Which wallet?" (asking unnecessary questions — just auto-pick and let them edit)

SCENARIO HANDLING:

Playbook awareness — when user has active playbooks:
- When user asks "macam mana gaji aku?" or "where did my salary go?": Show the playbook waterfall — list each category and how much went there
- When discussing spending, reference the playbook: "From your March Salary, ${currency} 890 went to food — that's 28% of the total"
- If a playbook is running low, state calmly: "Your March Salary has ${currency} 340 left with 8 days to go — about ${currency} 42/day"
- After recording expenses via chat: mention which playbook it was linked to and the remaining balance
- Never say "you're running out" or "you should stop spending" — just show the numbers

Budget stress — when user says "i'm over budget" or "habis duit":
- Show the numbers calmly: which categories still have breathing room, which don't
- Mention where money went, not what to cut
- Never say "cut back", "reduce", "spend less". Just observe.
- If some categories are fine, mention them: "food's at ${currency} 480/500 but entertainment still has ${currency} 150 left"

Goal coaching — when user asks "how's my goals?" or mentions saving for something:
- Show each goal: name, current/target, percentage, deadline pace
- Mention contribution momentum: "You've added ${currency} 800 to goals this month"
- If behind pace, state calmly: "You'd need about ${currency} 46/day to hit Japan Trip by June"
- If ahead of pace, observe it: "At this rate, you could hit it 2 weeks early"
- Celebrate milestones quietly: "Emergency Fund just crossed 50%"
- If user hasn't contributed in a while: "Japan Trip hasn't had a contribution in 18 days"
- If user asks "should I save for X?": Help them create a goal — ask for target amount and optional deadline
- If user asks projection: Calculate "At ${currency} 200/month, you'd reach ${currency} 10,000 by March 2027"
- Never say "save more" or "you need to save" — just show the math

Debt awareness — when user asks "who owes me?" or "siapa hutang aku?":
- List each person, their remaining amount, and due date if set
- If someone is overdue, mention it without pressure: "Ali's ${currency} 200 was due 5 days ago"
- Never suggest how to collect or pressure people

Post-action observation — after recording any transaction:
- Add ONE short context line showing the impact
- Expense: "That puts food at ${currency} 480/500 this month" or "food is past breathing room now"
- Debt payment: "Ali's down to ${currency} 150 left" or "Ali's all settled!"
- Goal: "Japan Trip is at 52% now"
- Don't over-explain — one line is enough

Savings & Investment coaching — when user asks "how's my investment?" or "macam mana savings aku?":
- Show total portfolio value, total invested, overall return percentage
- Break down by account: which ones grew, which ones dipped
- Mention how long since each was last updated (gently nudge if stale)
- For Malaysian-specific accounts, add context:
  - ASB: typical dividend rate ~4-5% for comparison
  - Tabung Haji: for Hajj savings, typical hibah rate ~3-4%
  - TNG GO+: money market fund with daily returns
- Celebrate milestones: "Your ASB just crossed ${currency} 50,000!"
- Never say "invest more" or "you should save" — just observe
- If they ask "which one is doing best?" — show the numbers, let them decide

Emotional support — when user sounds stressed about money:
- Acknowledge the feeling first, then show numbers
- Frame positively where possible: "you've kept ${currency} 580 this month — that's real"
- Never minimize their feelings or give generic advice`;
}

let _cachedContext: string | null = null;
let _cachedAt = 0;
const CONTEXT_CACHE_MS = 2000; // reuse for 2s

// ─── Intent-driven context scope ────────────────────────────

type ContextScope = {
  recentTxns: boolean;
  lastMonthCats: boolean;
  debtDetail: boolean;
  goalDetail: boolean;
  subscriptions: boolean;
  merchants: boolean;
  goalContribs: boolean;
  investments: boolean;
  budgets: boolean;
  business: boolean;
};

const ALL_SCOPE: ContextScope = {
  recentTxns: true, lastMonthCats: true, debtDetail: true,
  goalDetail: true, subscriptions: true, merchants: true,
  goalContribs: true, investments: true, budgets: true, business: true,
};

const MIN_SCOPE: ContextScope = {
  recentTxns: false, lastMonthCats: false, debtDetail: false,
  goalDetail: false, subscriptions: false, merchants: false,
  goalContribs: false, investments: false, budgets: false, business: false,
};

function classifyScope(message?: string, debtNames?: string[]): ContextScope {
  if (!message) return ALL_SCOPE;
  const m = message.toLowerCase();

  // Short, general, or greeting → full context
  if (m.length < 15 || /how.*doing|macam mana|overall|summary|everything|semua|apa jadi|hi|hello|hey/.test(m)) return ALL_SCOPE;

  // Merge ALL matching intents (not first-match-wins)
  const scope = { ...MIN_SCOPE };
  let matched = false;

  // Debt
  if (/hutang|owe|lend|borrow|debt|bayar balik|pinjam|settle|tangguh/.test(m)) {
    scope.debtDetail = true;
    matched = true;
  }

  // Person name from debt records → auto-include debt detail
  if (debtNames?.some((name) => m.includes(name))) {
    scope.debtDetail = true;
    matched = true;
  }

  // Goals / savings
  if (/goal|target|save|simpan|emergency|kecemasan/.test(m)) {
    scope.goalDetail = true;
    scope.goalContribs = true;
    matched = true;
  }

  // Investment
  if (/invest|asb|tabung haji|portfolio|tng go|wahed|stashaway|dividen/.test(m)) {
    scope.investments = true;
    matched = true;
  }

  // Budget
  if (/budget|breathing|over budget|habis|limit|bajet/.test(m)) {
    scope.budgets = true;
    scope.lastMonthCats = true;
    matched = true;
  }

  // Spending
  if (/spend|makan|grab|shop|where.*money|duit.*mana|buy|beli|belanja|kedai|food|transport/.test(m)) {
    scope.recentTxns = true;
    scope.lastMonthCats = true;
    scope.merchants = true;
    scope.subscriptions = true;
    matched = true;
  }

  // Subscription specific
  if (/subscri|subs|netflix|spotify|bil|renew|langganan/.test(m)) {
    scope.subscriptions = true;
    matched = true;
  }

  // Business
  if (/sell|order|season|product|customer|bisnes|stall|jualan/.test(m)) {
    scope.business = true;
    matched = true;
  }

  // Action-oriented (recording expenses/debts)
  if (/rm\s?\d|add|record|log|catat/.test(m)) {
    scope.debtDetail = true;
    scope.recentTxns = true;
    matched = true;
  }

  return matched ? scope : ALL_SCOPE;
}

function buildFinancialContext(userMessage?: string): string {
  const ts = Date.now();
  if (_cachedContext && ts - _cachedAt < CONTEXT_CACHE_MS) return _cachedContext;

  const currency = useSettingsStore.getState().currency;
  const mode = useAppStore.getState().mode;
  const { transactions, subscriptions, budgets, goals } = usePersonalStore.getState();
  const wallets = useWalletStore.getState().wallets;
  const debts = useDebtStore.getState().debts;

  // Extract contact names from debt records for person-name detection
  const debtNames = debts
    .filter((d) => d.status !== 'settled' && d.contact?.name)
    .map((d) => d.contact.name.toLowerCase());
  const scope = classifyScope(userMessage, debtNames);

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

  // Last month category breakdown
  const lastMonthByCategory: Record<string, number> = {};
  for (const t of lastMonthTxns.filter((x) => x.type === 'expense')) {
    lastMonthByCategory[t.category] = (lastMonthByCategory[t.category] || 0) + t.amount;
  }
  const lastCatLines = Object.entries(lastMonthByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, amt]) => `  ${cat}: ${currency} ${amt.toFixed(2)}`)
    .join('\n');

  // Category breakdown
  const byCategory: Record<string, number> = {};
  for (const t of thisMonthTxns.filter((x) => x.type === 'expense')) {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  }
  const catLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, amt]) => `  ${cat}: ${currency} ${amt.toFixed(2)}`)
    .join('\n');

  // Recent 10 transactions
  const recentTxns = thisMonthTxns
    .sort((a, b) => {
      const da = a.date instanceof Date ? a.date : new Date(a.date);
      const db = b.date instanceof Date ? b.date : new Date(b.date);
      return db.getTime() - da.getTime();
    })
    .slice(0, 20)
    .map((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return `  ${format(d, 'dd MMM')} | ${t.type === 'income' ? '+' : '-'}${currency} ${t.amount.toFixed(2)} | ${t.category} | ${t.description}`;
    })
    .join('\n');

  // Wallets
  const walletLines = wallets
    .map((w) => `  ${w.name} (${w.type}): ${currency} ${(w.balance || 0).toFixed(2)}`)
    .join('\n');

  // BNPL (credit wallet used credit)
  const bnplTotal = wallets
    .filter((w) => w.type === 'credit')
    .reduce((s, w) => s + (w.usedCredit || 0), 0);

  // Debts — per-person breakdown
  const activeDebts = debts.filter((d) => d.status !== 'settled');
  const iOweTotal = activeDebts
    .filter((d) => d.type === 'i_owe')
    .reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);
  const theyOweTotal = activeDebts
    .filter((d) => d.type === 'they_owe')
    .reduce((s, d) => s + (d.totalAmount - d.paidAmount), 0);

  const iOweLines = activeDebts
    .filter((d) => d.type === 'i_owe')
    .slice(0, 15)
    .map((d) => {
      const remaining = d.totalAmount - d.paidAmount;
      const due = d.dueDate ? ` (due ${format(d.dueDate instanceof Date ? d.dueDate : new Date(d.dueDate), 'dd MMM')})` : '';
      return `  ${d.contact.name}: ${currency} ${remaining.toFixed(2)}${due}`;
    })
    .join('\n');

  const theyOweLines = activeDebts
    .filter((d) => d.type === 'they_owe')
    .slice(0, 15)
    .map((d) => {
      const remaining = d.totalAmount - d.paidAmount;
      const due = d.dueDate ? ` (due ${format(d.dueDate instanceof Date ? d.dueDate : new Date(d.dueDate), 'dd MMM')})` : '';
      return `  ${d.contact.name}: ${currency} ${remaining.toFixed(2)}${due}`;
    })
    .join('\n');

  // Budgets
  const budgetLines = budgets
    .map(
      (b) =>
        `  ${b.category}: ${currency} ${b.spentAmount.toFixed(2)} / ${currency} ${b.allocatedAmount.toFixed(2)} (${currency} ${(b.allocatedAmount - b.spentAmount).toFixed(2)} left)`
    )
    .join('\n');

  // Goals with deadlines + pace + contribution momentum
  const goalLines = goals
    .map((g) => {
      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
      let info = `  ${g.name}: ${currency} ${g.currentAmount.toFixed(2)} / ${currency} ${g.targetAmount.toFixed(2)} (${pct}%)`;
      if (g.isPaused) info += ' [PAUSED]';
      if (g.isArchived) info += ' [ARCHIVED]';
      if (g.deadline) {
        const dl = g.deadline instanceof Date ? g.deadline : new Date(g.deadline);
        if (!isNaN(dl.getTime())) {
          const daysToDeadline = Math.max(0, Math.ceil((dl.getTime() - now.getTime()) / 86400000));
          const remaining = g.targetAmount - g.currentAmount;
          info += ` — deadline ${format(dl, 'dd MMM yyyy')}`;
          if (daysToDeadline > 0 && remaining > 0) {
            info += `, ${daysToDeadline}d left, ~${currency} ${Math.ceil(remaining / daysToDeadline)}/day needed`;
          }
        }
      }
      if (g.contributions && g.contributions.length > 0) {
        const last = g.contributions[g.contributions.length - 1];
        const lastDate = last.date instanceof Date ? last.date : new Date(last.date);
        if (!isNaN(lastDate.getTime())) {
          const daysAgo = Math.floor((now.getTime() - lastDate.getTime()) / 86400000);
          info += `, last contributed ${daysAgo === 0 ? 'today' : `${daysAgo}d ago`}`;
        }
      }
      const monthContribs = (g.contributions || []).filter((c) => {
        const d = c.date instanceof Date ? c.date : new Date(c.date);
        return c.amount > 0 && isWithinInterval(d, { start: monthStart, end: monthEnd });
      });
      if (monthContribs.length > 0) {
        const monthTotal = monthContribs.reduce((s, c) => s + c.amount, 0);
        info += `, +${currency} ${monthTotal.toFixed(0)} this month`;
      }
      return info;
    })
    .join('\n');

  // Subscriptions with billing dates
  const activeSubs = subscriptions.filter((s) => s.isActive);
  const subLines = activeSubs
    .map((s) => {
      const next = s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate);
      const nextLabel = !isNaN(next.getTime()) ? ` — next ${format(next, 'dd MMM')}` : '';
      return `  ${s.name}: ${currency} ${s.amount.toFixed(2)} (${s.billingCycle})${nextLabel}`;
    })
    .join('\n');

  // Spending velocity
  const daysPassed = now.getDate();
  const spendPerDay = daysPassed > 0 ? totalExpenses / daysPassed : 0;
  const projectedMonthEnd = spendPerDay * getDaysInMonth(now);

  // Net worth: wallets - debts owed - BNPL
  const totalWalletBalance = wallets.reduce((s, w) => s + (w.balance || 0), 0);
  const netWorth = totalWalletBalance - iOweTotal - bnplTotal;

  // Top merchants / descriptions this month (#98)
  const merchantCount: Record<string, { count: number; total: number }> = {};
  for (const t of thisMonthTxns.filter((x) => x.type === 'expense' && x.description)) {
    const key = t.description.toLowerCase().trim();
    if (!merchantCount[key]) merchantCount[key] = { count: 0, total: 0 };
    merchantCount[key].count++;
    merchantCount[key].total += t.amount;
  }
  const merchantLines = Object.entries(merchantCount)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([name, v]) => `  ${name}: ${v.count}x, ${currency} ${v.total.toFixed(2)}`)
    .join('\n');

  // Recent goal contributions (#85)
  const contribLines = goals
    .filter((g) => g.contributions && g.contributions.length > 0)
    .map((g) => {
      const recent = g.contributions
        .slice(-3)
        .map((c) => {
          const d = c.date instanceof Date ? c.date : new Date(c.date);
          return `${currency} ${c.amount.toFixed(0)} (${!isNaN(d.getTime()) ? format(d, 'dd MMM') : '?'})`;
        })
        .join(', ');
      return `  ${g.name}: ${recent}`;
    })
    .join('\n');

  // Credit wallet details
  const creditLines = wallets
    .filter((w) => w.type === 'credit' && (w.creditLimit || 0) > 0)
    .map((w) => `  ${w.name}: ${currency} ${(w.usedCredit || 0).toFixed(2)} used / ${currency} ${(w.creditLimit || 0).toFixed(2)} limit (${currency} ${((w.creditLimit || 0) - (w.usedCredit || 0)).toFixed(2)} available)`)
    .join('\n');

  // ── Core overview (always included) ──
  let ctx = `Month: ${monthLabel} (${daysLeft} days left)
Came in: ${currency} ${totalIncome.toFixed(2)}
Went out: ${currency} ${totalExpenses.toFixed(2)}
Kept: ${currency} ${kept.toFixed(2)} (last month: ${currency} ${keptLastMonth.toFixed(2)})
Pace: ${currency} ${spendPerDay.toFixed(0)}/day — projected ${currency} ${projectedMonthEnd.toFixed(0)} by month end

Category breakdown (this month):
${catLines || '  (none yet)'}

Wallets:
${walletLines || '  (none)'}
${creditLines ? `\nCredit/BNPL:\n${creditLines}` : `\nFuture You Owes (BNPL): ${currency} ${bnplTotal.toFixed(2)}`}

Net position: ${currency} ${netWorth.toFixed(2)} (wallets ${currency} ${totalWalletBalance.toFixed(2)} − debts ${currency} ${iOweTotal.toFixed(2)} − BNPL ${currency} ${bnplTotal.toFixed(2)})`;

  // ── Conditional sections based on user intent ──

  if (scope.lastMonthCats) {
    ctx += `\n\nLast month top categories:\n${lastCatLines || '  (none)'}`;
  }

  if (scope.recentTxns) {
    ctx += `\n\nRecent transactions:\n${recentTxns || '  (none yet)'}`;
  }

  if (scope.debtDetail) {
    ctx += `\n\nDebts — you owe (total ${currency} ${iOweTotal.toFixed(2)}):\n${iOweLines || '  (none)'}`;
    ctx += `\nDebts — owed to you (total ${currency} ${theyOweTotal.toFixed(2)}):\n${theyOweLines || '  (none)'}`;
  } else if (iOweTotal > 0 || theyOweTotal > 0) {
    const iOweCount = activeDebts.filter((d) => d.type === 'i_owe').length;
    const theyOweCount = activeDebts.filter((d) => d.type === 'they_owe').length;
    ctx += `\n\nDebts: owe ${currency} ${iOweTotal.toFixed(2)} (${iOweCount} people), owed ${currency} ${theyOweTotal.toFixed(2)} (${theyOweCount} people)`;
  }

  if (scope.budgets) {
    ctx += `\n\nBreathing room:\n${budgetLines || '  (none set)'}`;
  }

  if (scope.goalDetail) {
    ctx += `\n\nSavings goals:\n${goalLines || '  (none)'}`;
  } else {
    const activeGoalCount = goals.filter((g) => !g.isArchived && !g.isPaused).length;
    if (activeGoalCount > 0) {
      const totalSaved = goals.filter((g) => !g.isArchived).reduce((s, g) => s + g.currentAmount, 0);
      const totalTarget = goals.filter((g) => !g.isArchived).reduce((s, g) => s + g.targetAmount, 0);
      ctx += `\n\nGoals: ${activeGoalCount} active, ${currency} ${totalSaved.toFixed(0)} / ${currency} ${totalTarget.toFixed(0)} total`;
    }
  }

  if (scope.subscriptions) {
    ctx += `\n\nSubscriptions:\n${subLines || '  (none)'}`;
  }

  if (scope.merchants && merchantLines) {
    ctx += `\n\nFrequent spending (2+ times this month):\n${merchantLines}`;
  }

  if (scope.goalContribs && contribLines) {
    ctx += `\n\nRecent goal contributions:\n${contribLines}`;
  }

  // Savings / Investment accounts
  if (scope.investments) {
    const savingsAccounts = useSavingsStore.getState().accounts;
    if (savingsAccounts.length > 0) {
      const totalPortfolio = savingsAccounts.reduce((s, a) => s + a.currentValue, 0);
      const totalInvested = savingsAccounts.reduce((s, a) => s + a.initialInvestment, 0);
      const portfolioGain = totalPortfolio - totalInvested;
      const portfolioReturn = totalInvested > 0 ? (portfolioGain / totalInvested) * 100 : 0;

      const savingsLines = savingsAccounts
        .map((a) => {
          const gain = a.currentValue - a.initialInvestment;
          const ret = a.initialInvestment > 0 ? (gain / a.initialInvestment) * 100 : 0;
          const lastUpdate = a.history.length > 0
            ? format(
                a.history[a.history.length - 1].date instanceof Date
                  ? a.history[a.history.length - 1].date
                  : new Date(String(a.history[a.history.length - 1].date)),
                'dd MMM'
              )
            : 'never';
          const target = a.target ? ` / target ${currency} ${a.target.toFixed(2)}` : '';
          return `  ${a.name} (${a.type}): ${currency} ${a.currentValue.toFixed(2)} invested ${currency} ${a.initialInvestment.toFixed(2)} (${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%) last updated ${lastUpdate}${target}`;
        })
        .join('\n');

      ctx += `\n\nSavings & Investments (${savingsAccounts.length} accounts):
Portfolio: ${currency} ${totalPortfolio.toFixed(2)} (invested ${currency} ${totalInvested.toFixed(2)}, ${portfolioReturn >= 0 ? '+' : ''}${portfolioReturn.toFixed(1)}%)
${savingsLines}`;
    }
  }

  // Active Playbooks (always — needed for salary tracking context)
  const pbStore = usePlaybookStore.getState();
  const activePbs = pbStore.getActivePlaybooks();
  if (activePbs.length > 0) {
    const pbLines = activePbs.map((pb) => {
      const stats = computePlaybookStats(pb, transactions);
      const topCats = stats.categoryBreakdown.slice(0, 5)
        .map((c) => `${c.category}: ${currency} ${c.spent.toFixed(0)} (${c.percentOfTotal.toFixed(0)}%)`)
        .join(', ');
      return `  ${pb.name}: ${currency} ${pb.sourceAmount.toFixed(2)} → spent ${currency} ${stats.totalSpent.toFixed(2)}, ${currency} ${stats.remaining.toFixed(2)} remaining (${stats.percentSpent.toFixed(0)}%), ~${currency} ${stats.dailyBurnRate.toFixed(0)}/day${stats.daysUntilEmpty != null ? `, ~${stats.daysUntilEmpty}d until empty` : ''}. Top: ${topCats || '(none yet)'}`;
    }).join('\n');
    ctx += `\n\nActive Playbooks (salary envelope tracking):\n${pbLines}`;
  }

  // Business context
  if (scope.business && mode === 'business') {
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
Came in: ${currency} ${stats.totalIncome.toFixed(2)}
Costs: ${currency} ${stats.totalCosts.toFixed(2)}
Kept: ${currency} ${stats.kept.toFixed(2)}
Orders: ${stats.totalOrders} (${stats.unpaidCount} unpaid, ${currency} ${stats.unpaidAmount.toFixed(2)})
Top products:
${topProducts.map((p) => `  ${p.name}: ${p.sold} sold, ${currency} ${p.revenue.toFixed(2)}`).join('\n')}`;
      }
    } else if (biz.incomeType) {
      const recentBiz = biz.businessTransactions.filter((t) => {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        return isWithinInterval(d, { start: monthStart, end: monthEnd });
      });
      const bizIncome = recentBiz.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const bizCosts = recentBiz.filter((t) => t.type === 'cost').reduce((s, t) => s + t.amount, 0);
      ctx += `\n\nBusiness (${biz.incomeType}):
Came in: ${currency} ${bizIncome.toFixed(2)}
Costs: ${currency} ${bizCosts.toFixed(2)}
Kept: ${currency} ${(bizIncome - bizCosts).toFixed(2)}`;
    }
  }

  _cachedContext = ctx;
  _cachedAt = Date.now();
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
  history: AIMessage[],
  imageBase64?: string,
): Promise<ChatResult> {
  if (!isGeminiAvailable()) {
    const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!key) return { ok: false, error: 'Gemini API key is missing. Add it in .env' };
    const secs = getCooldownSecondsLeft();
    if (secs > 0) {
      if (secs <= 120) {
        return { ok: false, error: `AI is cooling down — wait ${secs}s` };
      }
      // Long block — try resetting in case it's stale
      resetDailyQuota();
      if (!isGeminiAvailable()) {
        return { ok: false, error: `AI is busy — try again in a few minutes.` };
      }
      // Reset worked — fall through to make the call
    } else {
      // No cooldown but still unavailable — reset stale state
      resetDailyQuota();
      if (!isGeminiAvailable()) {
        return { ok: false, error: 'AI is temporarily unavailable — try again shortly.' };
      }
    }
  }

  const premium = usePremiumStore.getState();
  if (!premium.canUseAI()) {
    return { ok: false, error: 'AI limit reached this month. Resets next month!' };
  }

  try {
    const currency = useSettingsStore.getState().currency;
    // Image messages need full context (AI needs everything to categorize what it sees)
    const context = buildFinancialContext(imageBase64 ? undefined : message);
    const learnedHints = useLearningStore.getState().getPromptHints();
    const fullSystem = `${buildSystemPrompt(currency)}\n\n${ACTION_PROMPT}${learnedHints}\n\nTHE USER'S FINANCIAL DATA:\n${context}`;

    // Build conversation history — last 10 messages to keep token usage low
    const recentHistory = history.slice(-10);
    const contents: GeminiContent[] = recentHistory.map((msg) => ({
      role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: msg.content }],
    }));

    // Add current message (with optional image)
    const userParts: GeminiPart[] = [{ text: message || 'What do you see in this image?' }];
    if (imageBase64) {
      userParts.push({
        inlineData: { mimeType: 'image/jpeg', data: imageBase64 },
      });
    }
    contents.push({ role: 'user' as const, parts: userParts });

    const hasImage = !!imageBase64;
    const data = await callGeminiAPI(
      {
        system_instruction: { parts: [{ text: fullSystem }] },
        contents,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 4096,
        },
      },
      hasImage ? 45_000 : 30_000,
      hasImage, // noFallback for image — both models share quota
    );

    if (!data) {
      const secs = getCooldownSecondsLeft();
      if (secs > 0) {
        return { ok: false, error: `AI is cooling down — wait ${secs}s` };
      }
      if (isDailyQuotaExhausted()) {
        return { ok: false, error: 'AI rate limited — try again in a minute.' };
      }
      return { ok: false, error: 'Couldn\'t reach AI. Check your internet.' };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      premium.incrementAiCalls();
      return { ok: true, text };
    }

    return { ok: false, error: 'AI returned empty — try rephrasing.' };
  } catch (err: unknown) {
    if (__DEV__) console.warn('[MoneyChat] Gemini failed:', err);
    if (err instanceof Error && err.name === 'AbortError') return { ok: false, error: 'Request timed out.' };
    return { ok: false, error: 'Something went wrong. Try again.' };
  }
}
