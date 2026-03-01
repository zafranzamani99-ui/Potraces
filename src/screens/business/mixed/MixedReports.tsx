import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { StackedBarChart, LineChart } from 'react-native-chart-kit';
import { useBusinessStore } from '../../../store/businessStore';
import { useMixedStore } from '../../../store/mixedStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha, COLORS } from '../../../constants';
import { askMixedQuestion } from '../../../services/aiService';

const screenWidth = Dimensions.get('window').width;

const CATEGORY_EMOJIS: Record<string, string> = {
  petrol: '\u26FD',
  maintenance: '\u{1F527}',
  data: '\u{1F4F1}',
  toll: '\u{1F6E3}\uFE0F',
  parking: '\u{1F17F}\uFE0F',
  insurance: '\u{1F6E1}\uFE0F',
  other: '\u270F\uFE0F',
};

// Opacity-based colors for streams using brand palette
const STREAM_COLORS = [
  COLORS.chart1,
  COLORS.chart2,
  COLORS.chart3,
  COLORS.chart4,
  COLORS.chart5,
  COLORS.chart6,
];

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const MixedReports: React.FC = () => {
  const currency = useSettingsStore((s) => s.currency);
  const { businessTransactions } = useBusinessStore();
  const {
    mixedDetails,
    getMonthlyBreakdown,
    getStreamConsistency,
    getSixMonthAverageTotal,
  } = useMixedStore();

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Section 1 — Stacked Bar Chart (income by stream per month)
  const monthlyData = useMemo(() => getMonthlyBreakdown(6), [businessTransactions]);
  const hasMonthlyData = monthlyData.some((m) => m.total > 0);

  const allStreams = useMemo(() => {
    const set = new Set<string>();
    for (const m of monthlyData) {
      for (const s of Object.keys(m.byStream)) {
        set.add(s);
      }
    }
    return Array.from(set);
  }, [monthlyData]);

  const stackedBarData = useMemo(() => {
    if (allStreams.length === 0) return null;
    return {
      labels: monthlyData.map((m) => m.month),
      legend: allStreams,
      data: monthlyData.map((m) =>
        allStreams.map((s) => m.byStream[s] || 0)
      ),
      barColors: allStreams.map((_, i) =>
        withAlpha(STREAM_COLORS[i % STREAM_COLORS.length], 0.7)
      ),
    };
  }, [monthlyData, allStreams]);

  // Section 2 — Stream share over time (line chart)
  const streamShareData = useMemo(() => {
    if (allStreams.length === 0 || !hasMonthlyData) return null;
    // Show top 3 streams by total
    const streamTotals = allStreams.map((s) => ({
      stream: s,
      total: monthlyData.reduce((sum, m) => sum + (m.byStream[s] || 0), 0),
    }));
    streamTotals.sort((a, b) => b.total - a.total);
    const topStreams = streamTotals.slice(0, 3).map((s) => s.stream);

    const datasets = topStreams.map((stream, i) => ({
      data: monthlyData.map((m) => {
        if (m.total === 0) return 0;
        return ((m.byStream[stream] || 0) / m.total) * 100;
      }),
      color: () => withAlpha(STREAM_COLORS[i % STREAM_COLORS.length], 0.8),
      strokeWidth: 2,
    }));

    return {
      labels: monthlyData.map((m) => m.month),
      datasets,
      legend: topStreams,
    };
  }, [monthlyData, allStreams, hasMonthlyData]);

  // Section 3 — Stream consistency
  const streamConsistency = useMemo(() => getStreamConsistency(), [businessTransactions]);

  // Section 4 — Cost breakdown (only if hasRoadCosts)
  const costBreakdown = useMemo(() => {
    if (!mixedDetails.hasRoadCosts) return [];
    const costTxns = businessTransactions.filter((t) => t.roadTransactionType === 'cost');
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
  }, [businessTransactions, mixedDetails.hasRoadCosts]);

  const maxCostAmount = costBreakdown.length > 0
    ? Math.max(...costBreakdown.map((b) => b.amount), 1)
    : 1;

  const chartConfig = {
    backgroundGradientFrom: CALM.background,
    backgroundGradientTo: CALM.background,
    color: () => withAlpha(CALM.bronze, 0.6),
    labelColor: () => CALM.textSecondary,
    barPercentage: 0.6,
    propsForBackgroundLines: {
      stroke: CALM.border,
      strokeDasharray: '4 4',
    },
    decimalPlaces: 0,
  };

  const handleShowSummary = async () => {
    setAiLoading(true);
    const result = await askMixedQuestion(
      'Give me a brief summary of my income sources and how things have been going. Focus on which sources brought in the most and any patterns you see.',
      {
        transactions: businessTransactions,
        mixedDetails,
        currentMonthTotal: monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].total : 0,
        currentMonthByStream: monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].byStream : {},
        currentMonthCosts: monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].costs : 0,
        sixMonthAverageTotal: getSixMonthAverageTotal(),
        streamConsistency: streamConsistency,
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
        {/* Section 1 — Stacked Bar: Income by Stream */}
        <Text style={styles.sectionLabel}>income by source</Text>
        {stackedBarData && hasMonthlyData ? (
          <View style={styles.chartContainer}>
            <StackedBarChart
              data={stackedBarData}
              width={screenWidth - SPACING['2xl'] * 2}
              height={220}
              chartConfig={chartConfig}
              style={styles.chart}
              hideLegend={false}
            />
          </View>
        ) : (
          <Text style={styles.noDataText}>no data yet</Text>
        )}

        {/* Section 2 — Stream Share Over Time */}
        {streamShareData && streamShareData.datasets.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>share over time</Text>
            <View style={styles.chartContainer}>
              <LineChart
                data={streamShareData}
                width={screenWidth - SPACING['2xl'] * 2}
                height={180}
                chartConfig={{
                  ...chartConfig,
                  propsForDots: {
                    r: '3',
                    strokeWidth: '1',
                    stroke: CALM.bronze,
                  },
                }}
                style={styles.chart}
                bezier
                yAxisSuffix="%"
                fromZero
              />
              <View style={styles.lineLegend}>
                {streamShareData.legend.map((stream, i) => (
                  <View key={stream} style={styles.lineLegendItem}>
                    <View
                      style={[
                        styles.lineLegendDot,
                        { backgroundColor: withAlpha(STREAM_COLORS[i % STREAM_COLORS.length], 0.8) },
                      ]}
                    />
                    <Text style={styles.lineLegendText}>{stream}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Section 3 — Stream Consistency */}
        {streamConsistency.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>consistency</Text>
            <View style={styles.consistencySection}>
              {streamConsistency.map((item) => (
                <View key={item.stream} style={styles.consistencyRow}>
                  <View style={styles.consistencyLeft}>
                    <Text style={styles.consistencyStream}>{item.stream}</Text>
                    <Text style={styles.consistencyMonths}>
                      {item.monthsActive} of 6 months
                    </Text>
                  </View>
                  <Text style={styles.consistencyTotal}>
                    {currency} {Math.round(item.total).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Section 4 — Cost Breakdown (only if hasRoadCosts) */}
        {mixedDetails.hasRoadCosts && costBreakdown.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>cost breakdown</Text>
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
                            backgroundColor: withAlpha(CALM.bronze, Math.max(opacity, 0.2)),
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
          </>
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

  // Line chart legend
  lineLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  lineLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  lineLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lineLegendText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },

  // Consistency
  consistencySection: {
    marginBottom: SPACING.md,
  },
  consistencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  consistencyLeft: {
    flex: 1,
  },
  consistencyStream: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  consistencyMonths: {
    ...TYPE.muted,
    marginTop: 2,
  },
  consistencyTotal: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
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
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // AI Summary
  aiSection: {
    marginTop: SPACING['2xl'],
    paddingTop: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  aiSummaryText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
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
    color: CALM.textSecondary,
  },
});

export default MixedReports;
