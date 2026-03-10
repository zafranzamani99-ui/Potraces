import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  isWithinInterval,
  differenceInDays,
  getDay,
  getDaysInMonth,
  startOfDay,
  addDays,
} from 'date-fns';

import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';

// ─── HELPER: Wellness label based on score ────────────────
const getWellnessLabel = (score: number): string => {
  if (score >= 80) return 'Strong position';
  if (score >= 60) return 'Solid foundation';
  if (score >= 40) return 'Steady progress';
  if (score >= 20) return 'Getting started';
  return 'Building momentum';
};

// ─── HELPER: Velocity message ─────────────────────────────
const getVelocityMessage = (velocity: number): string => {
  if (velocity <= 80) return 'Below your usual pace';
  if (velocity <= 100) return 'On track';
  if (velocity <= 120) return 'Slightly above your usual pace';
  return 'Spending faster than usual';
};

const FinancialPulse: React.FC = () => {
  const { transactions, subscriptions, budgets, goals } = usePersonalStore();
  const currency = useSettingsStore((state) => state.currency);
  const expenseCategories = useCategories('expense');

  // ─── TIME BOUNDARIES (stable across renders) ──────────────
  const dateBounds = useMemo(() => {
    const now = new Date();
    return {
      now,
      monthStart: startOfMonth(now),
      monthEnd: endOfMonth(now),
      lastMonthStart: startOfMonth(subMonths(now, 1)),
      lastMonthEnd: endOfMonth(subMonths(now, 1)),
      dayOfMonth: now.getDate(),
      daysInCurrentMonth: getDaysInMonth(now),
      daysInLastMonth: getDaysInMonth(subMonths(now, 1)),
    };
  }, []);

  const {
    now,
    monthStart,
    monthEnd,
    lastMonthStart,
    lastMonthEnd,
    dayOfMonth,
    daysInCurrentMonth,
    daysInLastMonth,
  } = dateBounds;

  // ─── FILTERED TRANSACTIONS ────────────────────────────────
  const thisMonth = useMemo(
    () =>
      transactions.filter((t) =>
        isWithinInterval(t.date, { start: monthStart, end: monthEnd })
      ),
    [transactions, monthStart, monthEnd] // monthStart/monthEnd are stable from dateBounds memo
  );

  const lastMonth = useMemo(
    () =>
      transactions.filter((t) =>
        isWithinInterval(t.date, { start: lastMonthStart, end: lastMonthEnd })
      ),
    [transactions, lastMonthStart, lastMonthEnd] // stable from dateBounds memo
  );

  // ─── MONTHLY TOTALS ──────────────────────────────────────
  const monthlyStats = useMemo(() => {
    const income = thisMonth
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = thisMonth
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const net = income - expenses;

    const lastMonthExpenses = lastMonth
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const lastMonthIncome = lastMonth
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    return { income, expenses, net, lastMonthExpenses, lastMonthIncome };
  }, [thisMonth, lastMonth]);

  // ─── 1. WELLNESS SCORE ────────────────────────────────────
  const wellnessScore = useMemo(() => {
    let score = 0;

    // Budget adherence (30 pts): how well are you staying within budget
    const totalBudget = budgets.reduce((sum, b) => sum + b.allocatedAmount, 0);
    const totalBudgetSpent = budgets.reduce((sum, b) => sum + b.spentAmount, 0);
    if (totalBudget > 0) {
      const adherence = Math.max(0, 1 - totalBudgetSpent / totalBudget);
      score += Math.round(adherence * 30);
    } else {
      // No budgets set, give partial credit
      score += 15;
    }

    // Savings rate (30 pts): (income - expenses) / income
    if (monthlyStats.income > 0) {
      const savingsRate = Math.max(0, (monthlyStats.income - monthlyStats.expenses) / monthlyStats.income);
      score += Math.round(Math.min(savingsRate, 1) * 30);
    } else if (monthlyStats.expenses === 0) {
      score += 15; // No activity
    }

    // Consistency (20 pts): transactions spread across the month
    const uniqueDays = new Set(
      thisMonth.map((t) => format(t.date, 'yyyy-MM-dd'))
    ).size;
    const consistencyRatio = Math.min(uniqueDays / Math.max(dayOfMonth, 1), 1);
    score += Math.round(consistencyRatio * 20);

    // Goal progress (20 pts)
    if (goals && goals.length > 0) {
      const avgProgress =
        goals.reduce((sum, g) => {
          const progress = g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0;
          return sum + Math.min(progress, 1);
        }, 0) / goals.length;
      score += Math.round(avgProgress * 20);
    } else {
      score += 10; // No goals, partial credit
    }

    return Math.min(Math.round(score), 100);
  }, [budgets, monthlyStats, thisMonth, dayOfMonth, goals]);

  const wellnessColor =
    wellnessScore >= 70
      ? CALM.positive
      : wellnessScore >= 40
      ? CALM.accent
      : CALM.neutral;

  // ─── 3. SPENDING VELOCITY ─────────────────────────────────
  const velocity = useMemo(() => {
    if (monthlyStats.lastMonthExpenses === 0) return { percent: 0, proRated: 0 };
    const rawPercent =
      (monthlyStats.expenses / monthlyStats.lastMonthExpenses) * 100;
    // Pro-rate: if day 15 of 30, and spent 40% of last month = velocity 80%
    const monthProgress = dayOfMonth / daysInCurrentMonth;
    const proRated =
      monthProgress > 0 ? rawPercent / monthProgress : 0;
    return { percent: Math.round(rawPercent), proRated: Math.round(proRated) };
  }, [monthlyStats, dayOfMonth, daysInCurrentMonth]);

  const velocityColor =
    velocity.proRated <= 90
      ? CALM.positive
      : velocity.proRated <= 110
      ? CALM.accent
      : CALM.neutral;

  // ─── 4. CATEGORY BREAKDOWN ────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    thisMonth
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        totals[t.category] = (totals[t.category] || 0) + t.amount;
      });

    const totalExpenses = monthlyStats.expenses || 1;

    return Object.entries(totals)
      .map(([categoryId, amount]) => {
        const cat = expenseCategories.find((c) => c.id === categoryId);
        return {
          id: categoryId,
          name: cat?.name || categoryId,
          color: cat?.color || CALM.accent,
          amount,
          percentage: (amount / totalExpenses) * 100,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [thisMonth, monthlyStats.expenses, expenseCategories]);

  // ─── 5. NO-SPEND STREAK ───────────────────────────────────
  const streakData = useMemo(() => {
    const daysElapsed = dayOfMonth;
    const expenseDaysSet = new Set<string>();
    thisMonth
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        expenseDaysSet.add(format(t.date, 'yyyy-MM-dd'));
      });

    const noSpendDays = daysElapsed - expenseDaysSet.size;

    // Current streak: count backwards from today
    let currentStreak = 0;
    for (let i = 0; i < daysElapsed; i++) {
      const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = format(checkDate, 'yyyy-MM-dd');
      if (!expenseDaysSet.has(key)) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Best streak this month
    let bestStreak = 0;
    let tempStreak = 0;
    for (let d = 1; d <= daysElapsed; d++) {
      const checkDate = new Date(now.getFullYear(), now.getMonth(), d);
      const key = format(checkDate, 'yyyy-MM-dd');
      if (!expenseDaysSet.has(key)) {
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    return { currentStreak, bestStreak, noSpendDays, daysElapsed };
  }, [thisMonth, dayOfMonth, now]); // now is stable from dateBounds memo

  // ─── 6. WEEKLY PATTERN ────────────────────────────────────
  const weeklyPattern = useMemo(() => {
    // Group expenses by day of week (0=Sun..6=Sat)
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    thisMonth
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const dayIndex = getDay(t.date);
        dayTotals[dayIndex] += t.amount;
      });

    // Reorder to Mon-Sun: [Mon,Tue,Wed,Thu,Fri,Sat,Sun]
    const ordered = [
      { label: 'Mon', amount: dayTotals[1] },
      { label: 'Tue', amount: dayTotals[2] },
      { label: 'Wed', amount: dayTotals[3] },
      { label: 'Thu', amount: dayTotals[4] },
      { label: 'Fri', amount: dayTotals[5] },
      { label: 'Sat', amount: dayTotals[6] },
      { label: 'Sun', amount: dayTotals[0] },
    ];

    const maxAmount = Math.max(...ordered.map((d) => d.amount), 1);
    const heaviestIndex = ordered.reduce(
      (maxIdx, d, idx, arr) => (d.amount > arr[maxIdx].amount ? idx : maxIdx),
      0
    );

    return { days: ordered, maxAmount, heaviestIndex };
  }, [thisMonth]);

  // ─── 7. UPCOMING BILLS ───────────────────────────────────
  const upcomingBills = useMemo(() => {
    const today = startOfDay(now);
    const twoWeeksLater = addDays(today, 14);

    const upcoming = subscriptions
      .filter(
        (sub) =>
          sub.isActive &&
          isWithinInterval(sub.nextBillingDate, {
            start: today,
            end: twoWeeksLater,
          })
      )
      .sort(
        (a, b) =>
          a.nextBillingDate.getTime() - b.nextBillingDate.getTime()
      );

    const total = upcoming.reduce((sum, sub) => sum + sub.amount, 0);
    return { list: upcoming, total };
  }, [subscriptions, now]); // now is stable from dateBounds memo

  // ─── EMPTY STATE ──────────────────────────────────────────
  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="activity"
          title="No Data Yet"
          message="Start adding transactions to see your financial pulse"
        />
      </View>
    );
  }

  // ─── RENDER ───────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. WELLNESS SCORE HERO ──────────────────────── */}
        <View style={styles.heroSection}>
          <View
            style={[
              styles.scoreCircle,
              { borderColor: wellnessColor },
            ]}
            accessibilityLabel={`Financial wellness score: ${wellnessScore} out of 100`}
          >
            <Text style={[styles.scoreNumber, { color: wellnessColor }]}>
              {wellnessScore}
            </Text>
            <Text style={styles.scoreOutOf}>/ 100</Text>
          </View>
          <Text style={styles.wellnessLabel}>{getWellnessLabel(wellnessScore)}</Text>
          <Text style={styles.heroSubtitle}>
            Financial Wellness Score
          </Text>
        </View>

        {/* ── 2. MONTHLY CASH FLOW ────────────────────────── */}
        <Text style={styles.sectionLabel}>CASH FLOW</Text>
        <Card style={styles.card}>
          {/* Income bar */}
          <View style={styles.cashFlowRow}>
            <View style={styles.cashFlowLabelCol}>
              <Feather name="arrow-down-left" size={14} color={CALM.positive} />
              <Text style={styles.cashFlowLabel}>In</Text>
            </View>
            <View style={styles.cashFlowBarContainer}>
              <View
                style={[
                  styles.cashFlowBar,
                  {
                    backgroundColor: withAlpha(CALM.positive, 0.2),
                    width: '100%',
                  },
                ]}
              >
                <View
                  style={[
                    styles.cashFlowBarFill,
                    {
                      backgroundColor: CALM.positive,
                      width:
                        monthlyStats.income > 0 && (monthlyStats.income + monthlyStats.expenses) > 0
                          ? `${(monthlyStats.income / Math.max(monthlyStats.income, monthlyStats.expenses)) * 100}%`
                          : '0%',
                    },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.cashFlowAmount}>
              {currency} {monthlyStats.income.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          {/* Expense bar */}
          <View style={styles.cashFlowRow}>
            <View style={styles.cashFlowLabelCol}>
              <Feather name="arrow-up-right" size={14} color={CALM.accent} />
              <Text style={styles.cashFlowLabel}>Out</Text>
            </View>
            <View style={styles.cashFlowBarContainer}>
              <View
                style={[
                  styles.cashFlowBar,
                  {
                    backgroundColor: withAlpha(CALM.accent, 0.15),
                    width: '100%',
                  },
                ]}
              >
                <View
                  style={[
                    styles.cashFlowBarFill,
                    {
                      backgroundColor: CALM.accent,
                      width:
                        monthlyStats.expenses > 0 && (monthlyStats.income + monthlyStats.expenses) > 0
                          ? `${(monthlyStats.expenses / Math.max(monthlyStats.income, monthlyStats.expenses)) * 100}%`
                          : '0%',
                    },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.cashFlowAmount}>
              {currency} {monthlyStats.expenses.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          {/* Net */}
          <View style={styles.cashFlowNet}>
            <Text style={styles.cashFlowNetLabel}>Kept this month</Text>
            <Text
              style={[
                styles.cashFlowNetAmount,
                { color: monthlyStats.net >= 0 ? CALM.positive : CALM.neutral },
              ]}
            >
              {currency} {Math.abs(monthlyStats.net).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </Card>

        {/* ── 3. SPENDING VELOCITY ────────────────────────── */}
        <Text style={styles.sectionLabel}>SPENDING PACE</Text>
        <Card style={styles.card}>
          <View style={styles.velocityHeader}>
            <Feather name="activity" size={16} color={velocityColor} />
            <Text style={styles.velocityTitle}>
              {monthlyStats.lastMonthExpenses > 0
                ? `You've used ${velocity.percent}% of last month's spending`
                : 'No comparison data yet'}
            </Text>
          </View>
          {monthlyStats.lastMonthExpenses > 0 && (
            <>
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(velocity.percent, 100)}%`,
                      backgroundColor: velocityColor,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.velocityMessage, { color: velocityColor }]}>
                {getVelocityMessage(velocity.proRated)}
                {' \u2014 '}
                {velocity.proRated}% pro-rated pace
              </Text>
            </>
          )}
        </Card>

        {/* ── 4. CATEGORY BREAKDOWN ───────────────────────── */}
        {categoryBreakdown.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>WHERE IT GOES</Text>
            <Card style={styles.card}>
              {categoryBreakdown.map((cat) => (
                <View key={cat.id} style={styles.categoryRow}>
                  <View style={styles.categoryLeft}>
                    <View
                      style={[styles.categoryDot, { backgroundColor: cat.color }]}
                    />
                    <Text style={styles.categoryName} numberOfLines={1}>
                      {cat.name}
                    </Text>
                  </View>
                  <View style={styles.categoryRight}>
                    <View style={styles.categoryBarContainer}>
                      <View
                        style={[
                          styles.categoryBarFill,
                          {
                            width: `${Math.min(cat.percentage, 100)}%`,
                            backgroundColor: withAlpha(cat.color, 0.3),
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.categoryAmount}>
                      {currency} {cat.amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ── 5. NO-SPEND STREAK ──────────────────────────── */}
        <Text style={styles.sectionLabel}>QUIET DAYS</Text>
        <Card style={styles.card}>
          <View style={styles.streakRow}>
            <View style={styles.streakHero}>
              <Feather
                name={streakData.currentStreak > 0 ? 'zap' : 'sun'}
                size={20}
                color={streakData.currentStreak > 0 ? CALM.accent : CALM.neutral}
              />
              <Text style={styles.streakNumber}>{streakData.currentStreak}</Text>
              <Text style={styles.streakUnit}>
                {streakData.currentStreak === 1 ? 'day' : 'days'} current streak
              </Text>
            </View>
          </View>
          <View style={styles.streakStatsRow}>
            <View style={styles.streakStat}>
              <Text style={styles.streakStatValue}>{streakData.bestStreak}</Text>
              <Text style={styles.streakStatLabel}>Best streak</Text>
            </View>
            <View style={styles.streakDivider} />
            <View style={styles.streakStat}>
              <Text style={styles.streakStatValue}>
                {streakData.noSpendDays}
              </Text>
              <Text style={styles.streakStatLabel}>
                quiet days out of {streakData.daysElapsed}
              </Text>
            </View>
          </View>
        </Card>

        {/* ── 6. WEEKLY PATTERN ───────────────────────────── */}
        <Text style={styles.sectionLabel}>WEEKLY PATTERN</Text>
        <Card style={styles.card}>
          <View style={styles.weeklyChart}>
            {weeklyPattern.days.map((day, idx) => {
              const barHeight =
                weeklyPattern.maxAmount > 0
                  ? (day.amount / weeklyPattern.maxAmount) * 120
                  : 0;
              const isHeaviest = idx === weeklyPattern.heaviestIndex && day.amount > 0;
              return (
                <View
                  key={day.label}
                  style={styles.weeklyColumn}
                  accessibilityLabel={`${day.label}: ${currency} ${day.amount.toFixed(2)}`}
                >
                  <Text
                    style={[
                      styles.weeklyAmount,
                      isHeaviest && { color: CALM.accent, fontWeight: TYPOGRAPHY.weight.bold },
                    ]}
                  >
                    {day.amount > 0
                      ? day.amount >= 1000
                        ? `${(day.amount / 1000).toFixed(1)}k`
                        : day.amount.toFixed(0)
                      : ''}
                  </Text>
                  <View style={styles.weeklyBarTrack}>
                    <View
                      style={[
                        styles.weeklyBar,
                        {
                          height: Math.max(barHeight, day.amount > 0 ? 4 : 0),
                          backgroundColor: isHeaviest
                            ? CALM.accent
                            : withAlpha(CALM.accent, 0.3),
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.weeklyLabel,
                      isHeaviest && { color: CALM.accent, fontWeight: TYPOGRAPHY.weight.bold },
                    ]}
                  >
                    {day.label}
                  </Text>
                </View>
              );
            })}
          </View>
          {weeklyPattern.days[weeklyPattern.heaviestIndex].amount > 0 && (
            <Text style={styles.weeklyInsight}>
              {weeklyPattern.days[weeklyPattern.heaviestIndex].label}s tend to be
              your heaviest spending day
            </Text>
          )}
        </Card>

        {/* ── 7. UPCOMING BILLS ───────────────────────────── */}
        {upcomingBills.list.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>UPCOMING BILLS</Text>
            <Card style={styles.card}>
              {upcomingBills.list.slice(0, 5).map((sub) => {
                const daysUntil = differenceInDays(
                  startOfDay(sub.nextBillingDate),
                  startOfDay(now)
                );
                return (
                  <View key={sub.id} style={styles.billRow}>
                    <View style={styles.billLeft}>
                      <View
                        style={[
                          styles.billIconBg,
                          { backgroundColor: withAlpha(CALM.accent, 0.1) },
                        ]}
                      >
                        <Feather name="repeat" size={14} color={CALM.accent} />
                      </View>
                      <View style={styles.billInfo}>
                        <Text style={styles.billName} numberOfLines={1}>
                          {sub.name}
                        </Text>
                        <Text style={styles.billDue}>
                          {daysUntil <= 0
                            ? 'Due today'
                            : daysUntil === 1
                            ? 'Tomorrow'
                            : `in ${daysUntil} days`}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.billAmount}>
                      {currency} {sub.amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}
              <View style={styles.billFooter}>
                <Text style={styles.billFooterText}>
                  {currency} {upcomingBills.total.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} due
                  in the next 2 weeks
                </Text>
              </View>
            </Card>
          </>
        )}

        {/* Bottom spacing */}
        <View style={{ height: SPACING['3xl'] }} />
      </ScrollView>
    </View>
  );
};

// ─── STYLES ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
  },

  // Section labels: TYPE.label style
  sectionLabel: {
    fontSize: TYPE.label.fontSize,
    color: TYPE.label.color,
    textTransform: TYPE.label.textTransform,
    letterSpacing: TYPE.label.letterSpacing,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },

  // Card base
  card: {
    marginBottom: SPACING.xs,
  },

  // ── 1. Wellness Score Hero ────────────────────────────────
  heroSection: {
    alignItems: 'center',
    paddingVertical: SPACING['2xl'],
  },
  scoreCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CALM.surface,
    marginBottom: SPACING.lg,
  },
  scoreNumber: {
    fontSize: TYPE.amount.fontSize,
    fontWeight: TYPE.amount.fontWeight,
    fontVariant: ['tabular-nums'],
  },
  scoreOutOf: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginTop: -SPACING.xs,
  },
  wellnessLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  heroSubtitle: {
    ...TYPE.muted,
  },

  // ── 2. Cash Flow ──────────────────────────────────────────
  cashFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  cashFlowLabelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 42,
    gap: SPACING.xs,
  },
  cashFlowLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  cashFlowBarContainer: {
    flex: 1,
  },
  cashFlowBar: {
    height: 10,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  cashFlowBarFill: {
    height: 10,
    borderRadius: RADIUS.xs,
  },
  cashFlowAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    width: 100,
    textAlign: 'right',
  },
  cashFlowNet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  cashFlowNetLabel: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: CALM.textSecondary,
  },
  cashFlowNetAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },

  // ── 3. Spending Velocity ──────────────────────────────────
  velocityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  velocityTitle: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: CALM.textPrimary,
    flex: 1,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: CALM.border,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  progressBarFill: {
    height: 8,
    borderRadius: RADIUS.xs,
  },
  velocityMessage: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
  },

  // ── 4. Category Breakdown ─────────────────────────────────
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: SPACING.md,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: SPACING.sm,
  },
  categoryName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    flex: 1,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  categoryBarContainer: {
    width: 60,
    height: 6,
    backgroundColor: CALM.border,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: 6,
    borderRadius: RADIUS.xs,
  },
  categoryAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    minWidth: 80,
    textAlign: 'right',
  },

  // ── 5. No-Spend Streak ────────────────────────────────────
  streakRow: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  streakHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  streakNumber: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  streakUnit: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: CALM.textSecondary,
  },
  streakStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  streakStat: {
    flex: 1,
    alignItems: 'center',
  },
  streakStatValue: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  streakStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    textAlign: 'center',
  },
  streakDivider: {
    width: 1,
    height: 36,
    backgroundColor: CALM.border,
    marginHorizontal: SPACING.lg,
  },

  // ── 6. Weekly Pattern ─────────────────────────────────────
  weeklyChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 170,
    paddingTop: SPACING.lg,
  },
  weeklyColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  weeklyAmount: {
    fontSize: 10,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  weeklyBarTrack: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  weeklyBar: {
    width: '55%',
    borderRadius: RADIUS.xs,
    minWidth: 12,
  },
  weeklyLabel: {
    fontSize: 10,
    color: CALM.textSecondary,
    marginTop: SPACING.sm,
  },
  weeklyInsight: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: CALM.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },

  // ── 7. Upcoming Bills ─────────────────────────────────────
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  billLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
  },
  billIconBg: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billInfo: {
    flex: 1,
  },
  billName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  billDue: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  billAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  billFooter: {
    paddingTop: SPACING.md,
    borderTopWidth: 0,
    marginTop: SPACING.xs,
  },
  billFooterText: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: CALM.textSecondary,
    textAlign: 'center',
  },
});

export default FinancialPulse;
