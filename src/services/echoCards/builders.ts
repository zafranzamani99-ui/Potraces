/**
 * Echo card builders — PURE functions `(snapshot, spec) => EchoCard | null`.
 *
 * Each wraps EXISTING deterministic calcs (insights.ts / pulseMath.ts) over a
 * plain data snapshot — they compute no new money math, and they NEVER read a
 * store or a hook (that's fillCards.ts's job), so they're node/tsx-testable with
 * a fixture snapshot. `null` = "no data for this" → the app shows no card and the
 * prose stands.
 */
import {
  Transaction, Subscription, Wallet, Debt, Goal, Budget, SavingsAccount, CategoryOption, AppMode,
} from '../../types';
import {
  cashFlow, categoryRollup, monthlyEquivalent, isLiveRecurring, monthEndOutlook, getRange,
  biggestExpenses, merchantRollup, merchantsOf, scopeTxns,
} from '../../utils/insights';
import { liquidBalance, debtPulse, expandBills } from '../../utils/pulseMath';
import { computePortfolio } from '../../screens/personal/savings/savingsMath';
import { EchoCard, EchoCardKind, EchoCardRow, EchoCardSpec } from './types';
import { formatMoney, CARD_COLORS } from './format';

// The plain data a builder needs. Gathered once by fillCards.gatherSnapshot().
export interface CardSnapshot {
  now: Date;
  currency: string;
  mode: AppMode;
  transactions: Transaction[];
  wallets: Wallet[];
  debts: Debt[];
  subscriptions: Subscription[];
  goals: Goal[];
  savings: SavingsAccount[];
  budgets: Budget[];
  expenseCats: CategoryOption[];
}

export type CardBuilder = (snap: CardSnapshot, spec: EchoCardSpec) => EchoCard | null;

// ─── helpers ─────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;
const clampPct = (n: number) => Math.max(0, Math.min(100, n));
const thisMonth = (now: Date) => getRange('this_month', now);
const lastMonth = (now: Date) => getRange('last_month', now);
const money = (snap: CardSnapshot, n: number) => formatMoney(snap.currency, n);
/** Bare amount, no currency (for "X / Y" units where currency shows once). */
const money2 = (n: number) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A subscription's icon: user-set photo → glyph → (none → renderer letter tile). */
const subIcon = (s: Subscription): string | undefined =>
  s.imageUri ? `photo:${s.imageUri}` : (s.iconName || undefined);

const CYCLE_LABEL: Record<Subscription['billingCycle'], string> = {
  monthly: 'monthly', yearly: 'yearly', weekly: 'weekly', quarterly: 'every 3 months',
};
const WALLET_TYPE_LABEL: Record<string, string> = {
  bank: 'bank', ewallet: 'e-wallet', cash: 'cash', credit: 'credit',
};

// ─── core builders ───────────────────────────────────────

const cash_flow: CardBuilder = (snap) => {
  const cf = cashFlow(snap.transactions, thisMonth(snap.now));
  if (cf.count === 0) return null;
  const prev = cashFlow(snap.transactions, lastMonth(snap.now));
  const diff = cf.kept - prev.kept;
  const subline = prev.count > 0
    ? (diff >= 0
        ? `${money(snap, diff)} more kept than last month`
        : `${money(snap, -diff)} less than last month`)
    : plural(cf.count, 'transaction', 'transactions') + ' this month';
  return {
    kind: 'cash_flow', label: 'KEPT THIS MONTH', currency: snap.currency, accent: 'olive', icon: 'trending-up',
    hero: { amount: round2(cf.kept), subline },
    rows: [
      { icon: 'arrow-down-left', iconColor: CARD_COLORS.in, name: 'Came in', amount: round2(cf.cameIn) },
      { icon: 'arrow-up-right', iconColor: CARD_COLORS.out, name: 'Went out', amount: round2(cf.wentOut) },
    ],
  };
};

const subscriptions: CardBuilder = (snap) => {
  const live = snap.subscriptions.filter(isLiveRecurring);
  if (!live.length) return null;
  const withM = live.map((s) => ({ s, m: monthlyEquivalent(s) })).sort((a, b) => b.m - a.m);
  const monthly = withM.reduce((t, x) => t + x.m, 0);
  const annual = monthly * 12;
  const biggest = withM[0];
  const rows: EchoCardRow[] = withM.slice(0, 6).map(({ s, m }) => ({
    icon: subIcon(s), name: s.name, detail: CYCLE_LABEL[s.billingCycle], amount: round2(m), unit: '/mo',
  }));
  return {
    kind: 'subscriptions', label: 'SUBSCRIPTIONS', currency: snap.currency, accent: 'olive', icon: 'repeat',
    hero: {
      amount: round2(monthly), unit: '/ month',
      subline: `${plural(live.length, 'subscription', 'subscriptions')} · ${money(snap, annual)}/year`,
    },
    tile: {
      topLabel: 'Biggest', icon: subIcon(biggest.s), name: biggest.s.name,
      amount: round2(biggest.m), unit: 'monthly',
    },
    rows,
  };
};

const wallet_liquid: CardBuilder = (snap) => {
  const spendable = snap.wallets.filter((w) => w.type !== 'credit');
  if (!spendable.length) return null;
  const total = liquidBalance(snap.wallets);
  const rows: EchoCardRow[] = [...spendable]
    .sort((a, b) => b.balance - a.balance)
    .map((w) => ({
      icon: w.icon, iconColor: w.color, name: w.name,
      detail: WALLET_TYPE_LABEL[w.type] || undefined, amount: round2(w.balance),
    }));
  return {
    kind: 'wallet_liquid', label: 'AVAILABLE BALANCE', currency: snap.currency, accent: 'olive', icon: 'credit-card',
    hero: { amount: round2(total), subline: `across ${plural(spendable.length, 'wallet', 'wallets')}` },
    rows,
  };
};

const net_worth: CardBuilder = (snap) => {
  if (!snap.wallets.length && !snap.debts.length) return null;
  const walletTotal = liquidBalance(snap.wallets);
  const bnpl = snap.wallets
    .filter((w) => w.type === 'credit')
    .reduce((s, w) => s + (w.usedCredit || 0), 0);
  const dp = debtPulse(snap.debts, snap.now);
  const net = walletTotal - dp.iOweOutstanding - bnpl;
  const rows: EchoCardRow[] = [
    { icon: 'credit-card', iconColor: CARD_COLORS.muted, name: 'Wallets', amount: round2(walletTotal) },
  ];
  if (dp.iOweOutstanding > 0.005) rows.push({ icon: 'arrow-up-right', iconColor: CARD_COLORS.out, name: 'You owe', amount: -round2(dp.iOweOutstanding) });
  if (bnpl > 0.005) rows.push({ icon: 'clock', iconColor: CARD_COLORS.warn, name: 'BNPL / credit used', amount: -round2(bnpl) });
  return {
    kind: 'net_worth', label: 'NET POSITION', currency: snap.currency, accent: 'olive', icon: 'layers',
    hero: { amount: round2(net), subline: 'wallets minus what you owe' },
    rows,
  };
};

const goals_overview: CardBuilder = (snap) => {
  const live = snap.goals.filter((g) => !g.isArchived && !g.isPaused);
  if (!live.length) return null;
  const totalSaved = live.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = live.reduce((s, g) => s + g.targetAmount, 0);
  const pctOf = (g: Goal) => (g.targetAmount > 0 ? clampPct((g.currentAmount / g.targetAmount) * 100) : 0);
  const rows: EchoCardRow[] = [...live]
    .sort((a, b) => pctOf(b) - pctOf(a))
    .slice(0, 5)
    .map((g) => ({
      icon: g.imageUri ? `photo:${g.imageUri}` : g.icon, iconColor: g.color, name: g.name,
      detail: `${Math.round(pctOf(g))}% of ${money(snap, g.targetAmount)}`, amount: round2(g.currentAmount),
    }));
  return {
    kind: 'goals_overview', label: 'SAVINGS GOALS', currency: snap.currency, accent: 'olive', icon: 'target',
    hero: { amount: round2(totalSaved), subline: `across ${plural(live.length, 'goal', 'goals')}` },
    progress: {
      pct: totalTarget > 0 ? clampPct((totalSaved / totalTarget) * 100) : 0,
      footLeft: `${money(snap, totalSaved)} saved`, footRight: `of ${money(snap, totalTarget)}`,
    },
    rows,
  };
};

const debt_overview: CardBuilder = (snap) => {
  const dp = debtPulse(snap.debts, snap.now);
  if (dp.iOweCount === 0 && dp.theyOweCount === 0) return null;
  const net = dp.theyOweOutstanding - dp.iOweOutstanding;
  const rows: EchoCardRow[] = [];
  if (dp.iOweCount > 0) rows.push({
    icon: 'arrow-up-right', iconColor: CARD_COLORS.out, name: 'You owe',
    detail: plural(dp.iOweCount, 'person', 'people'),
    amount: -round2(dp.iOweOutstanding),
    pill: dp.overdueCount > 0 ? { text: `${dp.overdueCount} overdue`, tone: 'warn' } : undefined,
  });
  if (dp.theyOweCount > 0) rows.push({
    icon: 'arrow-down-left', iconColor: CARD_COLORS.in, name: 'Owed to you',
    detail: plural(dp.theyOweCount, 'person', 'people'), amount: round2(dp.theyOweOutstanding),
  });
  let subline: string;
  if (dp.nextDue) {
    const d = dp.nextDue.inDays;
    const when = d < 0 ? `${-d}d overdue` : d === 0 ? 'due today' : `in ${d}d`;
    subline = `Next: ${dp.nextDue.name || 'a debt'} ${money(snap, dp.nextDue.amount)} · ${when}`;
  } else {
    subline = net >= 0 ? 'net — owed to you overall' : 'net — you owe overall';
  }
  return {
    kind: 'debt_overview', label: 'DEBTS', currency: snap.currency, accent: 'olive', icon: 'users',
    hero: { amount: round2(net), subline },
    rows,
  };
};

const category_breakdown: CardBuilder = (snap) => {
  const r = thisMonth(snap.now);
  const roll = categoryRollup(snap.transactions, r, snap.expenseCats, CARD_COLORS.muted, 6);
  if (!roll.length) return null;
  const monthOut = cashFlow(snap.transactions, r).wentOut;
  const rows: EchoCardRow[] = roll.map((c) => ({
    icon: c.icon, iconColor: c.color, name: c.name, amount: round2(c.amount),
    pill: { text: `${Math.round(c.percent)}%` },
  }));
  return {
    kind: 'category_breakdown', label: 'WHERE IT WENT', currency: snap.currency, accent: 'olive', icon: 'pie-chart',
    rows,
    total: { label: 'This month', amount: round2(monthOut) },
  };
};

const month_outlook: CardBuilder = (snap) => {
  const cf = cashFlow(snap.transactions, thisMonth(snap.now));
  const outlook = monthEndOutlook(snap.transactions, snap.subscriptions, snap.now);
  if (cf.count === 0 && outlook.billsToCome === 0) return null;
  const comfortable = outlook.tone === 'comfortable';
  const rows: EchoCardRow[] = [
    { icon: 'check-circle', iconColor: CARD_COLORS.in, name: 'Kept so far', amount: round2(outlook.keptSoFar) },
  ];
  if (outlook.billsToCome > 0.005) rows.push({
    icon: 'calendar', iconColor: CARD_COLORS.warn, name: 'Bills still to come', amount: -round2(outlook.billsToCome),
  });
  return {
    kind: 'month_outlook', label: 'MONTH OUTLOOK', currency: snap.currency, accent: comfortable ? 'olive' : 'gold', icon: 'activity',
    hero: {
      amount: round2(outlook.projectedKept),
      subline: comfortable ? 'on track to keep money this month' : 'snug — spending pace is high',
    },
    rows,
  };
};

// ─── parametric + extended helpers ───────────────────────
/** Both-direction includes — the same fuzzy match the action executors use. */
const fuzzy = (a: string, b: string) => {
  const x = (a || '').toLowerCase().trim();
  const y = (b || '').toLowerCase().trim();
  return !!x && !!y && (x.includes(y) || y.includes(x));
};
const catMeta = (snap: CardSnapshot, id: string) => snap.expenseCats.find((c) => c.id === id);
const catName = (snap: CardSnapshot, id: string) => catMeta(snap, id)?.name || id;

// ─── parametric builders ─────────────────────────────────

const goal_detail: CardBuilder = (snap, spec) => {
  const q = spec.goalName || '';
  const g = q ? snap.goals.filter((x) => !x.isArchived).find((x) => fuzzy(x.name, q)) : null;
  if (!g) return null;
  const pct = g.targetAmount > 0 ? clampPct((g.currentAmount / g.targetAmount) * 100) : 0;
  const remaining = Math.max(g.targetAmount - g.currentAmount, 0);
  let subline = `${money(snap, remaining)} to go`;
  if (g.deadline && remaining > 0) {
    const days = Math.ceil((new Date(g.deadline).getTime() - snap.now.getTime()) / 86400000);
    if (days > 0) subline += ` · about ${money(snap, (remaining / days) * 30)}/mo to reach it`;
  } else if (remaining <= 0) {
    subline = 'goal reached 🎉';
  }
  return {
    kind: 'goal_detail', label: g.name.toUpperCase(), currency: snap.currency, accent: 'olive', icon: 'target',
    hero: { amount: round2(g.currentAmount), unit: `/ ${money2(g.targetAmount)}` },
    progress: { pct, footLeft: `${Math.round(pct)}% there`, footRight: subline },
  };
};

const debt_detail: CardBuilder = (snap, spec) => {
  const q = spec.contact || '';
  const live = snap.debts.filter((d) => !d.isArchived && d.status !== 'settled' && d.mode !== 'business');
  const matched = q ? live.filter((d) => fuzzy(d.contact?.name || d.description || '', q)) : [];
  if (!matched.length) return null;
  const name = matched[0].contact?.name || q;
  const out = (d: typeof matched[number]) => Math.max(d.totalAmount - d.paidAmount, 0);
  const iOwe = matched.filter((d) => d.type === 'i_owe').reduce((s, d) => s + out(d), 0);
  const theyOwe = matched.filter((d) => d.type === 'they_owe').reduce((s, d) => s + out(d), 0);
  const net = theyOwe - iOwe;
  const rows: EchoCardRow[] = matched
    .filter((d) => out(d) > 0.005)
    .map((d) => ({
      icon: d.type === 'i_owe' ? 'arrow-up-right' : 'arrow-down-left',
      iconColor: d.type === 'i_owe' ? CARD_COLORS.out : CARD_COLORS.in,
      name: d.description || (d.type === 'i_owe' ? 'You owe' : 'Owes you'),
      amount: (d.type === 'i_owe' ? -1 : 1) * round2(out(d)),
    }));
  return {
    kind: 'debt_detail', label: name.toUpperCase(), currency: snap.currency, accent: 'olive', icon: 'user',
    hero: { amount: round2(net), subline: net >= 0 ? `${name} owes you overall` : `you owe ${name} overall` },
    rows,
  };
};

const category_detail: CardBuilder = (snap, spec) => {
  const q = spec.category || '';
  const cat = q
    ? snap.expenseCats.find((c) => fuzzy(c.name, q) || c.id.toLowerCase() === q.toLowerCase())
    : null;
  if (!cat) return null;
  const scoped = scopeTxns(snap.transactions, thisMonth(snap.now)).filter((t) => t.type === 'expense' && t.category === cat.id);
  if (!scoped.length) return null;
  const total = scoped.reduce((s, t) => s + t.amount, 0);
  const rows: EchoCardRow[] = merchantsOf(scoped, 5).map((m) => ({
    icon: cat.icon, iconColor: cat.color, name: m.label, detail: plural(m.count, 'time', 'times'), amount: round2(m.amount),
  }));
  return {
    kind: 'category_detail', label: cat.name.toUpperCase(), currency: snap.currency, accent: 'olive', icon: 'pie-chart',
    hero: { amount: round2(total), subline: `${cat.name} · this month` },
    rows,
  };
};

// ─── extended builders ───────────────────────────────────

const biggest_expenses: CardBuilder = (snap) => {
  const big = biggestExpenses(snap.transactions, thisMonth(snap.now), 5);
  if (!big.length) return null;
  const rows: EchoCardRow[] = big.map((b) => {
    const meta = catMeta(snap, b.category);
    return {
      icon: meta?.icon, iconColor: meta?.color,
      name: b.description || catName(snap, b.category), detail: meta?.name || b.category, amount: round2(b.amount),
    };
  });
  return {
    kind: 'biggest_expenses', label: 'BIGGEST THIS MONTH', currency: snap.currency, accent: 'olive', icon: 'trending-up',
    rows,
  };
};

const top_merchants: CardBuilder = (snap) => {
  const merch = merchantRollup(snap.transactions, thisMonth(snap.now), 6);
  if (!merch.length) return null;
  const rows: EchoCardRow[] = merch.map((m) => ({
    name: m.label, detail: plural(m.count, 'visit', 'visits'), amount: round2(m.amount), pill: { text: `${Math.round(m.percent)}%` },
  }));
  return {
    kind: 'top_merchants', label: 'TOP MERCHANTS', currency: snap.currency, accent: 'olive', icon: 'shopping-bag',
    rows,
  };
};

const upcoming_bills: CardBuilder = (snap) => {
  const forecast = expandBills(snap.subscriptions, 30, snap.now);
  if (!forecast.items.length) return null;
  const rows: EchoCardRow[] = forecast.items.slice(0, 6).map((b) => {
    const sub = snap.subscriptions.find((s) => s.id === b.subId);
    const when = b.dueInDays <= 0 ? 'due now' : b.dueInDays === 1 ? 'tomorrow' : `in ${b.dueInDays} days`;
    return { icon: sub ? subIcon(sub) : undefined, name: b.name, detail: when, amount: round2(b.amount) };
  });
  return {
    kind: 'upcoming_bills', label: 'UPCOMING BILLS', currency: snap.currency, accent: 'olive', icon: 'calendar',
    rows,
    total: { label: 'Next 30 days', amount: round2(forecast.total) },
  };
};

const savings_portfolio: CardBuilder = (snap) => {
  if (!snap.savings.length) return null;
  const p = computePortfolio(snap.savings, snap.now);
  const KNOWN_LOGOS = ['asb', 'tabung_haji', 'tng_plus', 'wahed'];
  const rows: EchoCardRow[] = [...snap.savings]
    .sort((a, b) => b.currentValue - a.currentValue)
    .map((a) => {
      const gain = a.currentValue - a.initialInvestment;
      const ret = a.initialInvestment > 0 ? (gain / a.initialInvestment) * 100 : 0;
      return {
        icon: KNOWN_LOGOS.includes(a.type) ? `logo/${a.type}` : undefined,
        name: a.name, detail: `${gain >= 0 ? '+' : ''}${ret.toFixed(1)}%`, amount: round2(a.currentValue),
      };
    });
  return {
    kind: 'savings_portfolio', label: 'PORTFOLIO', currency: snap.currency, accent: 'olive', icon: 'trending-up',
    hero: {
      amount: round2(p.totalCurrent),
      subline: `${p.totalGain >= 0 ? 'up' : 'down'} ${money(snap, Math.abs(p.totalGain))} · ${p.totalReturn.toFixed(1)}%`,
    },
    rows,
  };
};

const budget_status: CardBuilder = (snap) => {
  if (!snap.budgets.length) return null;
  const scoped = scopeTxns(snap.transactions, thisMonth(snap.now)).filter((t) => t.type === 'expense');
  const spentByCat: Record<string, number> = {};
  for (const t of scoped) spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount;
  const rows: EchoCardRow[] = snap.budgets.map((b) => {
    const spent = spentByCat[b.category] || 0;
    const pct = b.allocatedAmount > 0 ? (spent / b.allocatedAmount) * 100 : 0;
    const meta = catMeta(snap, b.category);
    return {
      icon: meta?.icon, iconColor: meta?.color, name: meta?.name || b.category,
      detail: `${money(snap, spent)} of ${money(snap, b.allocatedAmount)}`,
      pill: { text: `${Math.round(pct)}%`, tone: pct > 100 ? 'warn' : 'neutral' },
    };
  });
  return {
    kind: 'budget_status', label: 'BUDGETS', currency: snap.currency, accent: 'olive', icon: 'sliders',
    rows,
  };
};

// ─── registry ────────────────────────────────────────────
export const CARD_BUILDERS: Partial<Record<EchoCardKind, CardBuilder>> = {
  cash_flow,
  category_breakdown,
  subscriptions,
  wallet_liquid,
  net_worth,
  goals_overview,
  debt_overview,
  month_outlook,
  goal_detail,
  debt_detail,
  category_detail,
  biggest_expenses,
  top_merchants,
  upcoming_bills,
  savings_portfolio,
  budget_status,
};

export function buildCard(spec: EchoCardSpec, snap: CardSnapshot): EchoCard | null {
  const builder = CARD_BUILDERS[spec.kind];
  return builder ? builder(snap, spec) : null;
}
