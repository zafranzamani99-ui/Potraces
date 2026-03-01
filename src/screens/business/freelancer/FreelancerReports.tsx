import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { useFreelancerStore } from '../../../store/freelancerStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../../constants';
import { askFreelancerQuestion } from '../../../services/aiService';

const screenWidth = Dimensions.get('window').width;

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

type PeriodOption = 'month' | '3months' | '6months' | 'year';

const PERIODS: { label: string; value: PeriodOption }[] = [
  { label: 'this month', value: 'month' },
  { label: '3 months', value: '3months' },
  { label: '6 months', value: '6months' },
  { label: 'this year', value: 'year' },
];

const FreelancerReports: React.FC = () => {
  const currency = useSettingsStore((s) => s.currency);
  const { businessTransactions } = useBusinessStore();
  const {
    clients,
    getSixMonthAverage,
    getClientAverageGap,
    getClientPayments,
  } = useFreelancerStore();

  const [period, setPeriod] = useState<PeriodOption>('3months');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const now = new Date();
  const sixMonthAvg = useMemo(() => getSixMonthAverage(), [businessTransactions]);

  // Section 1 — Income Over Time (last 6 months)
  const monthlyIncome = useMemo(() => {
    const data: { label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const total = businessTransactions
        .filter(
          (t) =>
            t.type === 'income' &&
            isWithinInterval(toDate(t.date), { start: ms, end: me })
        )
        .reduce((s, t) => s + t.amount, 0);
      data.push({ label: format(d, 'MMM'), amount: total });
    }
    return data;
  }, [businessTransactions]);

  // Section 2 — Client Breakdown for selected period
  const periodPayments = useMemo(() => {
    let start: Date;
    switch (period) {
      case 'month':
        start = startOfMonth(now);
        break;
      case '3months':
        start = startOfMonth(subMonths(now, 2));
        break;
      case '6months':
        start = startOfMonth(subMonths(now, 5));
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
    }
    return businessTransactions.filter(
      (t) =>
        t.type === 'income' &&
        toDate(t.date).getTime() >= start.getTime()
    );
  }, [businessTransactions, period]);

  const clientBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of periodPayments) {
      const key = t.clientId || 'uncategorized';
      totals[key] = (totals[key] || 0) + t.amount;
    }
    return Object.entries(totals)
      .map(([clientId, amount]) => {
        const client = clients.find((c) => c.id === clientId);
        return { name: client?.name || 'uncategorized', amount };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [periodPayments, clients]);

  const maxClientAmount = Math.max(...clientBreakdown.map((c) => c.amount), 1);

  // Section 3 — Payment Gaps
  const gapData = useMemo(() => {
    return clients
      .map((client) => {
        const avg = getClientAverageGap(client.id);
        if (avg === null) return null;
        const payments = getClientPayments(client.id);
        if (payments.length < 2) return null;

        let longestGap = 0;
        for (let i = 0; i < payments.length - 1; i++) {
          const gap = Math.abs(
            (toDate(payments[i].date).getTime() - toDate(payments[i + 1].date).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          if (gap > longestGap) longestGap = gap;
        }

        return {
          name: client.name,
          averageGap: avg,
          longestGap: Math.round(longestGap),
        };
      })
      .filter(Boolean) as { name: string; averageGap: number; longestGap: number }[];
  }, [clients, businessTransactions]);

  const longestWait = gapData.length > 0
    ? gapData.reduce((prev, curr) =>
        curr.longestGap > prev.longestGap ? curr : prev
      )
    : null;

  // Chart config
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
    const currentMonthTotal = periodPayments.reduce((s, t) => s + t.amount, 0);
    const result = await askFreelancerQuestion(
      `Give me a brief summary of my freelance income for the ${
        period === 'month'
          ? 'current month'
          : period === '3months'
          ? 'last 3 months'
          : period === '6months'
          ? 'last 6 months'
          : 'year'
      }. Focus on patterns, client concentration, and timing.`,
      {
        payments: businessTransactions,
        clients,
        sixMonthAverage: sixMonthAvg,
        currentMonthTotal,
        getClientAverageGap,
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
        {/* Section 1 — Income Over Time */}
        <Text style={styles.sectionLabel}>income over time</Text>
        {monthlyIncome.some((m) => m.amount > 0) ? (
          <View style={styles.chartContainer}>
            <BarChart
              data={{
                labels: monthlyIncome.map((m) => m.label),
                datasets: [{ data: monthlyIncome.map((m) => m.amount) }],
              }}
              width={screenWidth - SPACING['2xl'] * 2}
              height={200}
              chartConfig={chartConfig}
              fromZero
              showValuesOnTopOfBars={false}
              withInnerLines
              yAxisLabel={`${currency} `}
              yAxisSuffix=""
              style={styles.chart}
            />
            {sixMonthAvg > 0 && (
              <Text style={styles.avgLine}>
                — {currency} {Math.round(sixMonthAvg).toLocaleString()} average
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.noDataText}>no income data yet</Text>
        )}

        {/* Section 2 — Client Breakdown */}
        <Text style={styles.sectionLabel}>by client</Text>

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

        {clientBreakdown.length > 0 ? (
          <View style={styles.clientBreakdownSection}>
            {clientBreakdown.map((item, index) => {
              const barWidth =
                (item.amount / maxClientAmount) * (screenWidth - SPACING['2xl'] * 2 - 100);
              const opacity = 1 - index * 0.15;
              return (
                <View key={item.name} style={styles.clientBarRow}>
                  <Text style={styles.clientBarName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.clientBarContainer}>
                    <View
                      style={[
                        styles.clientBar,
                        {
                          width: Math.max(barWidth, 4),
                          backgroundColor: withAlpha(CALM.bronze, Math.max(opacity, 0.2)),
                        },
                      ]}
                    />
                    <Text style={styles.clientBarAmount}>
                      {currency} {item.amount.toLocaleString()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.noDataText}>no data for this period</Text>
        )}

        {/* Section 3 — Payment Gaps */}
        {gapData.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>payment timing</Text>
            {longestWait && (
              <Text style={styles.longestWaitText}>
                longest wait: {longestWait.longestGap} days from{' '}
                {longestWait.name}
              </Text>
            )}
            {gapData.map((item) => (
              <View key={item.name} style={styles.gapRow}>
                <Text style={styles.gapName}>{item.name}</Text>
                <View style={styles.gapStats}>
                  <Text style={styles.gapAvg}>avg {item.averageGap}d</Text>
                  <Text style={styles.gapLongest}>
                    longest {item.longestGap}d
                  </Text>
                </View>
              </View>
            ))}
          </>
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
  avgLine: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    marginTop: SPACING.xs,
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
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodOptionActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  periodText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  periodTextActive: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Client breakdown
  clientBreakdownSection: {
    marginBottom: SPACING.md,
  },
  clientBarRow: {
    marginBottom: SPACING.md,
  },
  clientBarName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
    maxWidth: 120,
  },
  clientBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  clientBar: {
    height: 20,
    borderRadius: RADIUS.xs,
  },
  clientBarAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // Gap data
  gapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  gapName: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    flex: 1,
  },
  gapStats: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  gapAvg: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  gapLongest: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  longestWaitText: {
    ...TYPE.muted,
    marginBottom: SPACING.md,
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

export default FreelancerReports;
