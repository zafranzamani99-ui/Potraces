import { useMemo } from 'react';
import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { useSettingsStore } from '../store/settingsStore';
import { useWalletStore } from '../store/walletStore';
import { useCalm } from './useCalm';
import { startOfMonth, endOfMonth, isWithinInterval, getDaysInMonth, differenceInDays } from 'date-fns';

export interface StoryCandidate {
  id: string;
  narrative: string;
  icon: string;
  accentColor: string;
  priority: number; // higher = show first
  screen?: string; // navigate target on tap
}

export function useStoryCards(mode: 'personal' | 'business' = 'personal'): StoryCandidate | null {
  const C = useCalm();
  const currency = useSettingsStore((s) => s.currency);
  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const goals = usePersonalStore((s) => s.goals);
  const debts = useDebtStore((s) => s.debts);
  const wallets = useWalletStore((s) => s.wallets);

  return useMemo(() => {
    if (mode !== 'personal') return null; // business stories added later

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const dayOfMonth = now.getDate();
    const daysInMonth = getDaysInMonth(now);
    const daysLeft = daysInMonth - dayOfMonth;

    const monthlyTxns = transactions.filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });

    const monthlyIncome = monthlyTxns
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const monthlyExpenses = monthlyTxns
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    const candidates: StoryCandidate[] = [];

    // 1. Pace check (mid-month)
    if (dayOfMonth >= 10 && dayOfMonth <= 25 && monthlyIncome > 0) {
      const breathingRoom = monthlyIncome - monthlyExpenses;
      if (breathingRoom > 0) {
        candidates.push({
          id: 'pace_check',
          narrative: `${daysLeft} days left and you've got ${currency} ${breathingRoom.toFixed(0)} breathing room`,
          icon: 'clock',
          accentColor: C.accent,
          priority: 70,
          screen: 'FinancialPulse',
        });
      }
    }

    // 2. Quiet streak (no expense in 2+ days)
    const sortedExpenses = monthlyTxns
      .filter((t) => t.type === 'expense')
      .sort((a, b) => {
        const da = a.date instanceof Date ? a.date : new Date(a.date);
        const db = b.date instanceof Date ? b.date : new Date(b.date);
        return db.getTime() - da.getTime();
      });
    if (sortedExpenses.length > 0) {
      const lastExpenseDate = sortedExpenses[0].date instanceof Date
        ? sortedExpenses[0].date
        : new Date(sortedExpenses[0].date);
      const quietDays = differenceInDays(now, lastExpenseDate);
      if (quietDays >= 2) {
        candidates.push({
          id: 'quiet_streak',
          narrative: `${quietDays} quiet days in a row — nice rhythm`,
          icon: 'moon',
          accentColor: '#7B8D6E',
          priority: 60,
        });
      }
    }

    // 3. Upcoming bills (within 3 days)
    const activeSubs = subscriptions.filter((s) => s.isActive);
    const upcomingSoon = activeSubs.filter((s) => {
      const next = s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate);
      if (isNaN(next.getTime())) return false;
      const diff = differenceInDays(next, now);
      return diff >= 0 && diff <= 3;
    });
    if (upcomingSoon.length > 0) {
      const total = upcomingSoon.reduce((s, sub) => s + sub.amount, 0);
      const names = upcomingSoon.slice(0, 2).map((s) => s.name.toLowerCase()).join(' and ');
      candidates.push({
        id: 'upcoming_bills',
        narrative: `${names} coming up — ${currency} ${total.toFixed(0)} total`,
        icon: 'bell',
        accentColor: C.gold,
        priority: 80,
        screen: 'SubscriptionList',
      });
    }

    // 4. Savings goal milestone
    const activeGoals = goals.filter((g) => !g.isArchived && !g.isPaused && g.targetAmount > 0);
    for (const g of activeGoals) {
      const pct = Math.round((g.currentAmount / g.targetAmount) * 100);
      if (pct >= 25 && pct < 30) {
        candidates.push({
          id: `goal_${g.id}_25`,
          narrative: `quarter of the way to ${g.name.toLowerCase()} — ${currency} ${g.currentAmount.toFixed(0)} so far`,
          icon: 'flag',
          accentColor: '#D4884A',
          priority: 50,
          screen: 'Goals',
        });
      } else if (pct >= 50 && pct < 55) {
        candidates.push({
          id: `goal_${g.id}_50`,
          narrative: `halfway to ${g.name.toLowerCase()} — nice`,
          icon: 'flag',
          accentColor: '#D4884A',
          priority: 65,
          screen: 'Goals',
        });
      } else if (pct >= 75 && pct < 80) {
        candidates.push({
          id: `goal_${g.id}_75`,
          narrative: `almost there — ${g.name.toLowerCase()} is 75% funded`,
          icon: 'flag',
          accentColor: C.accent,
          priority: 75,
          screen: 'Goals',
        });
      }
    }

    // 5. Debt progress
    const activeDebts = debts.filter((d) => d.status !== 'settled' && d.type === 'i_owe');
    for (const d of activeDebts) {
      const remaining = d.totalAmount - d.paidAmount;
      const pct = Math.round((d.paidAmount / d.totalAmount) * 100);
      if (pct >= 50 && remaining > 0) {
        candidates.push({
          id: `debt_${d.id}`,
          narrative: `getting clear — ${currency} ${remaining.toFixed(0)} left on ${d.contact?.name || 'a debt'}`,
          icon: 'git-branch',
          accentColor: '#C1694F',
          priority: 55,
          screen: 'DebtTracking',
        });
        break; // only show one debt story
      }
    }

    // 6. Spending rhythm (top category comparison)
    if (monthlyTxns.length >= 5) {
      const catTotals: Record<string, number> = {};
      for (const t of monthlyTxns.filter((x) => x.type === 'expense')) {
        catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
      }
      const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        const [topCat, topAmt] = sorted[0];
        const pctOfTotal = monthlyExpenses > 0 ? Math.round((topAmt / monthlyExpenses) * 100) : 0;
        if (pctOfTotal >= 30) {
          candidates.push({
            id: 'spending_rhythm',
            narrative: `${topCat} is your biggest slice — ${pctOfTotal}% of what went out`,
            icon: 'pie-chart',
            accentColor: C.accent,
            priority: 40,
            screen: 'TransactionsList',
          });
        }
      }
    }

    // Sort by priority (highest first) and return top candidate
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates.length > 0 ? candidates[0] : null;
  }, [mode, transactions, subscriptions, goals, debts, wallets, currency, C]);
}
