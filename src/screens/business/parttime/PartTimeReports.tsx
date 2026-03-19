import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { StackedBarChart, LineChart } from 'react-native-chart-kit';
import { format } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { usePartTimeStore } from '../../../store/partTimeStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { askPartTimeQuestion } from '../../../services/aiService';
import { generateReportNarrative, ReportMonthData } from '../../../services/reportNarrative';
import { useAIInsightsStore } from '../../../store/aiInsightsStore';

const screenWidth = Dimensions.get('window').width;

type PeriodOption = 'month' | '3months' | '6months';

const PERIODS: { label: string; value: PeriodOption }[] = [
  { label: 'this month', value: 'month' },
  { label: '3 months', value: '3months' },
  { label: '6 months', value: '6months' },
];

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const PartTimeReports: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const { businessTransactions } = useBusinessStore();
  const {
    jobDetails,
    getMonthlyBreakdown,
    getCurrentMonthMainIncome,
    getCurrentMonthSideIncome,
    getAverageSidePercentage,
  } = usePartTimeStore();

  const [period, setPeriod] = useState<PeriodOption>('3months');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Section 1 — Income Over Time (stacked bar, last 6 months)
  const monthlyData = useMemo(() => getMonthlyBreakdown(6), [businessTransactions]);
  const hasMonthlyData = monthlyData.some((m) => m.main + m.side > 0);

  const stackedData = useMemo(() => {
    return {
      labels: monthlyData.map((m) => m.month),
      legend: ['main job', 'side income'],
      data: monthlyData.map((m) => [m.main, m.side]),
      barColors: [C.bronze, withAlpha(C.bronze, 0.4)],
    };
  }, [monthlyData]);

  // Section 2 — Side Income Share Over Time (line chart)
  const sideShareData = useMemo(() => {
    const percentages = monthlyData.map((m) => {
      const total = m.main + m.side;
      return total > 0 ? (m.side / total) * 100 : 0;
    });
    return {
      labels: monthlyData.map((m) => m.month),
      datasets: [{ data: percentages.length > 0 ? percentages : [0] }],
    };
  }, [monthlyData]);

  // Section 3 — Side Income Breakdown by note
  const periodMonths = period === 'month' ? 1 : period === '3months' ? 3 : 6;
  const sideBreakdown = useMemo(() => {
    const breakdown = getMonthlyBreakdown(periodMonths);
    const now = new Date();

    // Get all side income transactions in period
    const periodStart = new Date(now.getFullYear(), now.getMonth() - (periodMonths - 1), 1);
    const sideTxns = businessTransactions.filter((t) => {
      if (t.type !== 'income' || t.incomeStream !== 'side') return false;
      return toDate(t.date).getTime() >= periodStart.getTime();
    });

    // Group by note
    const groups: Record<string, number> = {};
    let hasNotes = false;
    for (const t of sideTxns) {
      const key = t.note?.trim() || 'unlabeled';
      if (t.note?.trim()) hasNotes = true;
      groups[key] = (groups[key] || 0) + t.amount;
    }

    if (!hasNotes) return null;

    return Object.entries(groups)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [businessTransactions, periodMonths]);

  const maxBreakdownAmount = sideBreakdown
    ? Math.max(...sideBreakdown.map((b) => b.amount), 1)
    : 1;

  // Report narrative
  const reportNarratives = useAIInsightsStore((s) => s.reportNarratives);
  const monthKey = format(new Date(), 'yyyy-MM');
  const narrativeEntry = reportNarratives[`parttime_${monthKey}`];

  const currentMonthNarrative = useMemo(() => {
    const currentMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1] : null;
    const mainIncome = currentMonth?.main || 0;
    const sideIncome = currentMonth?.side || 0;
    const totalIncome = mainIncome + sideIncome;

    const topCategories = [
      { name: 'main job', amount: mainIncome, percent: totalIncome > 0 ? Math.round((mainIncome / totalIncome) * 100) : 0 },
      { name: 'side income', amount: sideIncome, percent: totalIncome > 0 ? Math.round((sideIncome / totalIncome) * 100) : 0 },
    ].filter((c) => c.amount > 0);

    // Previous month
    const prevMonth = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
    const prevIncome = prevMonth ? prevMonth.main + prevMonth.side : 0;

    // Count current month transactions
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const count = businessTransactions.filter((t) => toDate(t.date).getTime() >= monthStart.getTime()).length;

    return { income: totalIncome, topCategories, prevIncome, count };
  }, [monthlyData, businessTransactions]);

  useEffect(() => {
    if (businessTransactions.length === 0) return;
    const data: ReportMonthData = {
      mode: 'parttime',
      income: currentMonthNarrative.income,
      expenses: 0,
      kept: currentMonthNarrative.income,
      topCategories: currentMonthNarrative.topCategories,
      prevMonthIncome: currentMonthNarrative.prevIncome,
      transactionCount: currentMonthNarrative.count,
    };
    generateReportNarrative(data);
  }, [currentMonthNarrative]);

  const chartConfig = {
    backgroundGradientFrom: C.background,
    backgroundGradientTo: C.background,
    color: () => withAlpha(C.bronze, 0.6),
    labelColor: () => C.textSecondary,
    barPercentage: 0.6,
    propsForBackgroundLines: {
      stroke: C.border,
      strokeDasharray: '4 4',
    },
    decimalPlaces: 0,
  };

  const lineChartConfig = {
    ...chartConfig,
    color: () => withAlpha(C.bronze, 0.6),
    propsForDots: {
      r: '3',
      strokeWidth: '1',
      stroke: C.bronze,
    },
  };

  const handleShowSummary = async () => {
    setAiLoading(true);
    const result = await askPartTimeQuestion(
      `Give me a brief summary of my income for the ${
        period === 'month'
          ? 'current month'
          : period === '3months'
          ? 'last 3 months'
          : 'last 6 months'
      }. Focus on the balance between main job and side income.`,
      {
        transactions: businessTransactions,
        jobDetails,
        currentMonthMain: getCurrentMonthMainIncome(),
        currentMonthSide: getCurrentMonthSideIncome(),
        averageSidePercentage: getAverageSidePercentage(),
      },
      []
    );
    setAiSummary(result);
    setAiLoading(false);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {narrativeEntry?.text ? (
          <Text style={[{ ...TYPE.narrative }, { color: C.textSecondary, marginBottom: SPACING.md }]}>
            {narrativeEntry.text}
          </Text>
        ) : null}

        {/* Section 1 — Income Over Time */}
        <Text style={styles.sectionLabel}>income over time</Text>
        {hasMonthlyData ? (
          <View style={styles.chartContainer}>
            <StackedBarChart
              data={stackedData}
              width={screenWidth - SPACING['2xl'] * 2}
              height={220}
              chartConfig={chartConfig}
              style={styles.chart}
              hideLegend={false}
            />
          </View>
        ) : (
          <Text style={styles.noDataText}>no income data yet</Text>
        )}

        {/* Section 2 — Side Income Share Over Time */}
        <Text style={styles.sectionLabel}>side income share over time</Text>
        {hasMonthlyData ? (
          <View style={styles.chartContainer}>
            <LineChart
              data={sideShareData}
              width={screenWidth - SPACING['2xl'] * 2}
              height={180}
              chartConfig={lineChartConfig}
              style={styles.chart}
              bezier
              yAxisSuffix="%"
              fromZero
            />
          </View>
        ) : (
          <Text style={styles.noDataText}>not enough data yet</Text>
        )}

        {/* Section 3 — Side Income Breakdown */}
        <Text style={styles.sectionLabel}>side income breakdown</Text>

        {/* Period picker */}
        <View style={styles.periodPicker}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[
                styles.periodOption,
                period === p.value && styles.periodOptionActive,
              ]}
              onPress={() => setPeriod(p.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.periodText,
                  period === p.value && styles.periodTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {sideBreakdown ? (
          <View style={styles.breakdownSection}>
            {sideBreakdown.map((item, index) => {
              const barWidth =
                (item.amount / maxBreakdownAmount) * (screenWidth - SPACING['2xl'] * 2 - 100);
              const opacity = 1 - index * 0.15;
              return (
                <View key={item.label} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <View style={styles.breakdownBarContainer}>
                    <View
                      style={[
                        styles.breakdownBar,
                        {
                          width: Math.max(barWidth, 4),
                          backgroundColor: withAlpha(C.bronze, Math.max(opacity, 0.2)),
                        },
                      ]}
                    />
                    <Text style={styles.breakdownAmount}>
                      {currency} {item.amount.toLocaleString()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.noDataText}>
            add notes to your side income to see a breakdown here
          </Text>
        )}

        {/* Section 4 — AI Summary */}
        <View style={styles.aiSection}>
          {aiSummary ? (
            <Text style={styles.aiSummaryText}>{aiSummary}</Text>
          ) : aiLoading ? (
            <Text style={styles.aiLoadingText}>thinking...</Text>
          ) : (
            <TouchableOpacity
              onPress={handleShowSummary}
              style={styles.showSummaryButton}
              activeOpacity={0.7}
            >
              <Text style={styles.showSummaryText}>show summary</Text>
            </TouchableOpacity>
          )}
        </View>
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
    paddingBottom: SPACING['5xl'],
  },

  sectionLabel: {
    ...TYPE.muted,
    marginBottom: SPACING.md,
    marginTop: SPACING.xl,
  },

  // Chart
  chartContainer: {
    marginBottom: SPACING.md,
  },
  chart: {
    borderRadius: RADIUS.md,
    marginLeft: -SPACING.md,
  },

  noDataText: {
    ...TYPE.muted,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },

  // Period picker
  periodPicker: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    flexWrap: 'wrap',
  },
  periodOption: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodOptionActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  periodText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  periodTextActive: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Breakdown
  breakdownSection: {
    marginBottom: SPACING.md,
  },
  breakdownRow: {
    marginBottom: SPACING.md,
  },
  breakdownLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    maxWidth: 160,
  },
  breakdownBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  breakdownBar: {
    height: 20,
    borderRadius: RADIUS.xs,
  },
  breakdownAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // AI Summary
  aiSection: {
    marginTop: SPACING['2xl'],
    paddingTop: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  aiSummaryText: {
    ...TYPE.insight,
    color: C.textSecondary,
    lineHeight: 22,
  },
  aiLoadingText: {
    ...TYPE.muted,
    textAlign: 'center',
  },
  showSummaryButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  showSummaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
});

export default PartTimeReports;
