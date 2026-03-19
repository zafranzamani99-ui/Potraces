import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { format } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { useOnTheRoadStore } from '../../../store/onTheRoadStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { askOnTheRoadQuestion } from '../../../services/aiService';
import { generateReportNarrative, ReportMonthData } from '../../../services/reportNarrative';
import { useAIInsightsStore } from '../../../store/aiInsightsStore';

const screenWidth = Dimensions.get('window').width;

type PeriodOption = 'month' | '3months' | '6months';

const PERIODS: { label: string; value: PeriodOption }[] = [
  { label: 'this month', value: 'month' },
  { label: '3 months', value: '3months' },
  { label: '6 months', value: '6months' },
];

const CATEGORY_EMOJIS: Record<string, string> = {
  petrol: '\u26FD',
  maintenance: '\u{1F527}',
  data: '\u{1F4F1}',
  toll: '\u{1F6E3}\uFE0F',
  parking: '\u{1F17F}\uFE0F',
  insurance: '\u{1F6E1}\uFE0F',
  other: '\u270F\uFE0F',
};

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const OnTheRoadReports: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const { businessTransactions } = useBusinessStore();
  const {
    roadDetails,
    getMonthlyBreakdown,
    getSixMonthAverageNet,
    getSixMonthAverageCostPercentage,
    getCurrentMonthEarnings,
    getCurrentMonthCosts,
    getCurrentMonthNet,
    getCostsByCategory,
    getEarningsByPlatform,
  } = useOnTheRoadStore();

  const [period, setPeriod] = useState<PeriodOption>('month');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Section 1 — Net Earnings Over Time
  const monthlyData = useMemo(() => getMonthlyBreakdown(6), [businessTransactions]);
  const hasMonthlyData = monthlyData.some((m) => m.earned + m.costs > 0);
  const avgNet = useMemo(() => getSixMonthAverageNet(), [businessTransactions]);

  const netChartData = useMemo(() => ({
    labels: monthlyData.map((m) => m.month),
    datasets: [{
      data: monthlyData.map((m) => Math.max(m.net, 0)),
    }],
  }), [monthlyData]);

  // Section 2 — Cost Ratio Over Time
  const costRatioData = useMemo(() => {
    const percentages = monthlyData.map((m) => {
      if (m.earned === 0) return 0;
      return (m.costs / m.earned) * 100;
    });
    return {
      labels: monthlyData.map((m) => m.month),
      datasets: [{ data: percentages.length > 0 ? percentages : [0] }],
    };
  }, [monthlyData]);

  // Section 3 — Cost Breakdown by Category (period-based)
  const periodMonths = period === 'month' ? 1 : period === '3months' ? 3 : 6;
  const costBreakdown = useMemo(() => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - (periodMonths - 1), 1);
    const costTxns = businessTransactions.filter((t) => {
      if (t.roadTransactionType !== 'cost') return false;
      return toDate(t.date).getTime() >= periodStart.getTime();
    });

    const groups: Record<string, number> = {};
    for (const t of costTxns) {
      const key = t.costCategory === 'other' && t.costCategoryOther
        ? t.costCategoryOther
        : t.costCategory || 'other';
      groups[key] = (groups[key] || 0) + t.amount;
    }

    return Object.entries(groups)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [businessTransactions, periodMonths]);

  const maxCostAmount = costBreakdown.length > 0
    ? Math.max(...costBreakdown.map((b) => b.amount), 1)
    : 1;

  // Section 4 — Earnings by Platform
  const platformBreakdown = useMemo(() => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - (periodMonths - 1), 1);
    const earningTxns = businessTransactions.filter((t) => {
      if (t.roadTransactionType !== 'earning' || !t.platform) return false;
      return toDate(t.date).getTime() >= periodStart.getTime();
    });

    const groups: Record<string, number> = {};
    for (const t of earningTxns) {
      if (!t.platform) continue;
      groups[t.platform] = (groups[t.platform] || 0) + t.amount;
    }

    return Object.entries(groups)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [businessTransactions, periodMonths]);

  const maxPlatformAmount = platformBreakdown.length > 0
    ? Math.max(...platformBreakdown.map((b) => b.amount), 1)
    : 1;

  const hasPlatformData = useMemo(() => {
    return businessTransactions.some(
      (t) => t.roadTransactionType === 'earning' && t.platform
    );
  }, [businessTransactions]);

  // Report narrative
  const reportNarratives = useAIInsightsStore((s) => s.reportNarratives);
  const monthKey = format(new Date(), 'yyyy-MM');
  const narrativeEntry = reportNarratives[`ontheroad_${monthKey}`];

  const currentMonthNarrative = useMemo(() => {
    const currentMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1] : null;
    const income = currentMonth?.earned || 0;
    const costs = currentMonth?.costs || 0;

    // Cost breakdown for top categories
    const costCats = getCostsByCategory();
    const totalCosts = Object.values(costCats).reduce((s, v) => s + v, 0);
    const topCategories = Object.entries(costCats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({
        name,
        amount,
        percent: totalCosts > 0 ? Math.round((amount / totalCosts) * 100) : 0,
      }));

    // Previous month
    const prevMonth = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
    const prevIncome = prevMonth?.earned || 0;
    const prevCosts = prevMonth?.costs || 0;

    // Count current month transactions
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const count = businessTransactions.filter((t) => toDate(t.date).getTime() >= monthStart.getTime()).length;

    return { income, costs, topCategories, prevIncome, prevCosts, count };
  }, [monthlyData, businessTransactions, getCostsByCategory]);

  useEffect(() => {
    if (businessTransactions.length === 0) return;
    const data: ReportMonthData = {
      mode: 'ontheroad',
      income: currentMonthNarrative.income,
      expenses: currentMonthNarrative.costs,
      kept: currentMonthNarrative.income - currentMonthNarrative.costs,
      topCategories: currentMonthNarrative.topCategories,
      prevMonthIncome: currentMonthNarrative.prevIncome,
      prevMonthExpenses: currentMonthNarrative.prevCosts,
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
    const periodLabel =
      period === 'month' ? 'current month' : period === '3months' ? 'last 3 months' : 'last 6 months';
    const result = await askOnTheRoadQuestion(
      `Give me a brief summary of my earnings and costs for the ${periodLabel}. Focus on what I kept and where costs went.`,
      {
        transactions: businessTransactions,
        roadDetails,
        currentMonthEarned: getCurrentMonthEarnings(),
        currentMonthCosts: getCurrentMonthCosts(),
        currentMonthNet: getCurrentMonthNet(),
        costsByCategory: getCostsByCategory(),
        sixMonthAverageNet: getSixMonthAverageNet(),
        earningsByPlatform: getEarningsByPlatform(),
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

        {/* Section 1 — Net Earnings Over Time */}
        <Text style={styles.sectionLabel}>net earnings over time</Text>
        {hasMonthlyData ? (
          <View style={styles.chartContainer}>
            <BarChart
              data={netChartData}
              width={screenWidth - SPACING['2xl'] * 2}
              height={220}
              chartConfig={chartConfig}
              style={styles.chart}
              yAxisLabel={currency + ' '}
              yAxisSuffix=""
              fromZero
            />
          </View>
        ) : (
          <Text style={styles.noDataText}>no data yet</Text>
        )}

        {/* Section 2 — Cost Ratio Over Time */}
        <Text style={styles.sectionLabel}>how much costs took</Text>
        {hasMonthlyData ? (
          <View style={styles.chartContainer}>
            <LineChart
              data={costRatioData}
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

        {/* Section 3 — Cost Breakdown */}
        <Text style={styles.sectionLabel}>cost breakdown</Text>

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

        {costBreakdown.length > 0 ? (
          <View style={styles.breakdownSection}>
            {costBreakdown.map((item, index) => {
              const barWidth =
                (item.amount / maxCostAmount) * (screenWidth - SPACING['2xl'] * 2 - 120);
              const opacity = 1 - index * 0.12;
              return (
                <View key={item.label} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel} numberOfLines={1}>
                    {CATEGORY_EMOJIS[item.label] || '\u270F\uFE0F'} {item.label}
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
          <Text style={styles.noDataText}>no costs logged in this period</Text>
        )}

        {/* Section 4 — Earnings by Platform */}
        <Text style={styles.sectionLabel}>earnings by platform</Text>
        {hasPlatformData ? (
          platformBreakdown.length > 0 ? (
            <View style={styles.breakdownSection}>
              {platformBreakdown.map((item, index) => {
                const barWidth =
                  (item.amount / maxPlatformAmount) * (screenWidth - SPACING['2xl'] * 2 - 120);
                const opacity = 1 - index * 0.12;
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
            <Text style={styles.noDataText}>no platform-tagged earnings in this period</Text>
          )
        ) : (
          <Text style={styles.noDataText}>
            tag your earnings with a platform to see a breakdown here
          </Text>
        )}

        {/* Section 5 — AI Summary */}
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
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
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

export default OnTheRoadReports;
