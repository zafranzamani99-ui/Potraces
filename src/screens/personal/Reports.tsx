import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, InteractionManager, RefreshControl } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, TYPE, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import { generateReportNarrative, ReportMonthData } from '../../services/reportNarrative';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const screenWidth = Dimensions.get('window').width;

const PersonalReports: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { transactions, subscriptions } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const expenseCategories = useCategories('expense');

  const categoryData = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const monthlyExpenses = transactions.filter(
      (t) =>
        t.type === 'expense' &&
        isWithinInterval(t.date instanceof Date ? t.date : new Date(t.date), { start: monthStart, end: monthEnd })
    );

    const categoryTotals: { [key: string]: number } = {};
    monthlyExpenses.forEach((t) => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    return Object.entries(categoryTotals)
      .map(([category, amount]) => {
        const cat = expenseCategories.find((c) => c.id === category);
        return {
          name: cat?.name || category,
          amount,
          color: cat?.color || C.accent,           // keep chart data colors
          legendFontColor: C.textPrimary,
          legendFontSize: TYPOGRAPHY.size.xs,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [transactions, expenseCategories, C]);

  const trendData = useMemo(() => {
    const months = [];
    const expenseData = [];
    const incomeData = [];

    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);

      const monthTransactions = transactions.filter((t) =>
        !t.id.startsWith('transfer-') &&
        isWithinInterval(t.date instanceof Date ? t.date : new Date(t.date), { start: monthStart, end: monthEnd })
      );

      const income = monthTransactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const expenses = monthTransactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      months.push(format(date, 'MMM'));
      incomeData.push(income);
      expenseData.push(expenses);
    }

    return {
      labels: months,
      datasets: [
        {
          data: incomeData,
          color: (opacity = 1) => withAlpha(C.positive, opacity),  // income = positive
          strokeWidth: 2,
        },
        {
          data: expenseData,
          color: (opacity = 1) => withAlpha(C.textPrimary, opacity), // expense = primary text
          strokeWidth: 2,
        },
      ],
      legend: [t.reports.legendIn, t.reports.legendOut],
    };
  }, [transactions, C, t]);

  // Report narrative
  const reportNarratives = useAIInsightsStore((s) => s.reportNarratives);
  const monthKey = format(new Date(), 'yyyy-MM');
  const narrativeEntry = reportNarratives[`personal_${monthKey}`];

  // Compute current month totals for narrative
  const currentMonthTotals = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const monthTxns = transactions.filter((t) =>
      isWithinInterval(t.date instanceof Date ? t.date : new Date(t.date), { start: monthStart, end: monthEnd })
    );
    const realTxns = monthTxns.filter((t) => !t.id.startsWith('transfer-'));
    const income = realTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = realTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalExpenses = categoryData.reduce((s, c) => s + c.amount, 0);
    const topCategories = categoryData.slice(0, 5).map((c) => ({
      name: c.name,
      amount: c.amount,
      percent: totalExpenses > 0 ? Math.round((c.amount / totalExpenses) * 100) : 0,
    }));

    // Previous month
    const prevStart = startOfMonth(subMonths(now, 1));
    const prevEnd = endOfMonth(subMonths(now, 1));
    const prevTxns = transactions.filter((t) =>
      isWithinInterval(t.date instanceof Date ? t.date : new Date(t.date), { start: prevStart, end: prevEnd })
    );
    const realPrevTxns = prevTxns.filter((t) => !t.id.startsWith('transfer-'));
    const prevIncome = realPrevTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const prevExpenses = realPrevTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    return { income, expenses, topCategories, prevIncome, prevExpenses, count: monthTxns.length };
  }, [transactions, categoryData]);

  useEffect(() => {
    if (transactions.length === 0) return;
    const data: ReportMonthData = {
      mode: 'personal',
      income: currentMonthTotals.income,
      expenses: currentMonthTotals.expenses,
      kept: currentMonthTotals.income - currentMonthTotals.expenses,
      topCategories: currentMonthTotals.topCategories,
      prevMonthIncome: currentMonthTotals.prevIncome,
      prevMonthExpenses: currentMonthTotals.prevExpenses,
      transactionCount: currentMonthTotals.count,
    };
    generateReportNarrative(data);
  }, [currentMonthTotals]);

  const subscriptionStats = useMemo(() => {
    const activeCount = subscriptions.filter((s) => s.isActive).length;
    const totalMonthly = subscriptions
      .filter((s) => s.isActive)
      .reduce((sum, sub) => {
        const monthlyAmount = (() => {
          switch (sub.billingCycle) {
            case 'weekly':
              return sub.amount * 4;
            case 'yearly':
              return sub.amount / 12;
            default:
              return sub.amount;
          }
        })();
        return sum + monthlyAmount;
      }, 0);

    return { activeCount, totalMonthly };
  }, [subscriptions]);

  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Memoised computations re-run when transactions change; this gesture
    // gives the user a tactile "I just refreshed" affordance.
    InteractionManager.runAfterInteractions(() => setRefreshing(false));
  }, []);

  if (!ready) {
    return (
      <View style={styles.container}>
        <SkeletonLoader />
        <SkeletonLoader style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="bar-chart-2"
          title={t.reports.nothingToReport}
          message={t.reports.spendingStory}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {narrativeEntry?.text ? (
          <Text style={styles.narrative}>
            {narrativeEntry.text}
          </Text>
        ) : null}

        <Card>
          <Text style={styles.chartTitle}>{t.reports.inVsOut}</Text>
          <LineChart
            data={trendData}
            width={screenWidth - SPACING['2xl'] * 2 - SPACING['2xl']}
            height={220}
            chartConfig={{
              backgroundColor: C.surface,
              backgroundGradientFrom: C.surface,
              backgroundGradientTo: C.surface,
              decimalPlaces: 0,
              color: (opacity = 1) => withAlpha(C.accent, opacity),
              labelColor: (opacity = 1) => withAlpha(C.textSecondary, opacity),
              style: {
                borderRadius: RADIUS.lg,
              },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
              },
            }}
            bezier
            style={styles.chart}
          />
        </Card>

        {categoryData.length > 0 && (
          <Card>
            <Text style={styles.chartTitle}>{t.reports.whereItWent}</Text>
            <PieChart
              data={categoryData}
              width={screenWidth - SPACING['2xl'] * 2 - SPACING['2xl']}
              height={220}
              chartConfig={{
                color: (opacity = 1) => withAlpha(C.textPrimary, opacity),
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft={String(SPACING.md)}
              absolute
              hasLegend={true}
            />
          </Card>
        )}

        {subscriptionStats.activeCount > 0 && (
          <Card>
            <Text style={styles.chartTitle}>{t.reports.subscriptions}</Text>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{subscriptionStats.activeCount}</Text>
                <Text style={styles.statLabel}>{t.reports.running}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{currency} {subscriptionStats.totalMonthly.toFixed(2)}</Text>
                <Text style={styles.statLabel}>{t.reports.monthlyTotal}</Text>
              </View>
            </View>
          </Card>
        )}

        <Card>
          <Text style={styles.chartTitle}>{t.reports.biggestSlices}</Text>
          {categoryData.slice(0, 5).map((category, index) => (
            <View key={index} style={styles.categoryRow}>
              <View style={styles.categoryInfo}>
                <View style={[styles.colorDot, { backgroundColor: category.color }]} />
                <Text style={styles.categoryName}>{category.name}</Text>
              </View>
              <Text style={styles.categoryAmount}>{currency} {category.amount.toFixed(2)}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
  },

  // Narrative copy above the first chart
  narrative: {
    ...TYPE.narrative,
    color: C.textSecondary,
    marginBottom: SPACING.md,
  },

  // Charts
  chartTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.lg,
  },
  chart: {
    marginVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
  },

  // Stats
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: SPACING['4xl'],
    backgroundColor: C.border,
    marginHorizontal: SPACING.lg,
  },
  statValue: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
  },

  // Categories
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: SPACING.md,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: RADIUS.full,
    marginRight: SPACING.md,
  },
  categoryName: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    flexShrink: 1,
  },
  categoryAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

export default PersonalReports;
