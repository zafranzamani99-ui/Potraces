import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, formatDistanceToNow } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { useMixedStore } from '../../../store/mixedStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../../constants';
import { explainMixedMonth } from '../../../utils/explainMixedMonth';
import WeekBar from '../../../components/common/WeekBar';
import ModeToggle from '../../../components/common/ModeToggle';
import MixedSetup from './MixedSetup';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const CATEGORY_EMOJIS: Record<string, string> = {
  petrol: '\u26FD',
  maintenance: '\u{1F527}',
  data: '\u{1F4F1}',
  toll: '\u{1F6E3}\uFE0F',
  parking: '\u{1F17F}\uFE0F',
  insurance: '\u{1F6E1}\uFE0F',
  other: '\u270F\uFE0F',
};

const MixedDashboard: React.FC = () => {
  const { businessTransactions } = useBusinessStore();
  const {
    mixedDetails,
    getCurrentMonthTotal,
    getCurrentMonthCosts,
    getIncomeByStream,
    getMonthlyBreakdown,
  } = useMixedStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [showCostPercentage, setShowCostPercentage] = useState(false);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // All computed values — hooks MUST be above the setup gate
  const total = useMemo(() => getCurrentMonthTotal(), [businessTransactions]);
  const costs = useMemo(
    () => (mixedDetails.hasRoadCosts ? getCurrentMonthCosts() : 0),
    [businessTransactions, mixedDetails.hasRoadCosts]
  );
  const net = total - costs;

  const incomeByStream = useMemo(() => getIncomeByStream(), [businessTransactions]);
  const streamEntries = useMemo(() => {
    const entries = Object.entries(incomeByStream).sort((a, b) => b[1] - a[1]);
    if (entries.length <= 5) return entries;
    const top5 = entries.slice(0, 5);
    const otherTotal = entries.slice(5).reduce((sum, [_, amt]) => sum + amt, 0);
    if (otherTotal > 0) top5.push(['other', otherTotal]);
    return top5;
  }, [incomeByStream]);

  // WeekBar data — map income to 'expense' type for WeekBar filter compatibility
  const weekBarTxns = useMemo(() => {
    const txns = businessTransactions.filter((t) => {
      if (!isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd })) return false;
      if (t.streamLabel || t.roadTransactionType === 'earning') return true;
      if (t.type === 'income') return true;
      if (mixedDetails.hasRoadCosts && t.roadTransactionType === 'cost') return true;
      return false;
    });
    return txns.map((t) => ({
      id: t.id,
      amount: t.roadTransactionType === 'cost' ? -t.amount : t.amount,
      category: 'income',
      description: t.note || '',
      date: t.date,
      type: 'expense' as const,
      mode: 'business' as const,
      createdAt: t.date,
      updatedAt: t.date,
    }));
  }, [businessTransactions, mixedDetails.hasRoadCosts]);

  // AI insight
  const currentMonthData = useMemo(() => {
    const txns = businessTransactions.filter(
      (t) => isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd })
    );
    return { total, byStream: incomeByStream, costs, transactions: txns };
  }, [businessTransactions, total, incomeByStream, costs]);

  const previousMonthsData = useMemo(() => {
    const result: Array<{ total: number; byStream: Record<string, number>; costs: number }> = [];
    for (let i = 1; i <= 6; i++) {
      const d = subMonths(now, i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const monthTxns = businessTransactions.filter(
        (t) => isWithinInterval(toDate(t.date), { start: ms, end: me })
      );
      const byStream: Record<string, number> = {};
      let monthTotal = 0;
      let monthCosts = 0;
      for (const t of monthTxns) {
        if (t.roadTransactionType === 'cost') {
          if (mixedDetails.hasRoadCosts) monthCosts += t.amount;
          continue;
        }
        if (t.type === 'income' || t.roadTransactionType === 'earning') {
          const key = t.streamLabel || 'untagged';
          byStream[key] = (byStream[key] || 0) + t.amount;
          monthTotal += t.amount;
        }
      }
      result.push({ total: monthTotal, byStream, costs: monthCosts });
    }
    return result;
  }, [businessTransactions, mixedDetails.hasRoadCosts]);

  const insight = useMemo(
    () => explainMixedMonth(currentMonthData, previousMonthsData, mixedDetails),
    [currentMonthData, previousMonthsData, mixedDetails]
  );

  // Cost breakdown by category (only if hasRoadCosts)
  const costsByCategory = useMemo(() => {
    if (!mixedDetails.hasRoadCosts) return [];
    const costTxns = businessTransactions.filter(
      (t) =>
        t.roadTransactionType === 'cost' &&
        isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd })
    );
    const groups: Record<string, number> = {};
    for (const t of costTxns) {
      const key = t.costCategory || 'other';
      groups[key] = (groups[key] || 0) + t.amount;
    }
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [businessTransactions, mixedDetails.hasRoadCosts]);

  const maxCostAmount = costsByCategory.length > 0 ? costsByCategory[0][1] : 1;

  // Recent activity (last 5)
  const recentActivity = useMemo(() => {
    return businessTransactions
      .filter((t) => t.streamLabel || t.roadTransactionType)
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
      .slice(0, 5);
  }, [businessTransactions]);

  // Setup gate — AFTER all hooks
  if (!mixedDetails.setupComplete) {
    return <MixedSetup />;
  }

  const handleBarTap = () => {
    if (!mixedDetails.hasRoadCosts || (total === 0 && costs === 0)) return;
    setShowCostPercentage(true);
    setTimeout(() => setShowCostPercentage(false), 2000);
  };

  const getCategoryLabel = (tx: typeof businessTransactions[0]) => {
    if (tx.costCategory === 'other' && tx.costCategoryOther) {
      return tx.costCategoryOther;
    }
    return tx.costCategory || 'cost';
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]}
        showsVerticalScrollIndicator={false}
      >
        <ModeToggle />
        {/* Zone 1 — Hero: Total Income */}
        <Text style={styles.heroAmount}>
          {currency} {Math.round(mixedDetails.hasRoadCosts ? net : total).toLocaleString()}
        </Text>
        <Text style={styles.heroLabel}>
          {mixedDetails.hasRoadCosts ? 'kept this month' : 'earned this month'}
        </Text>

        {/* Zone 2 — Stream Breakdown Bar */}
        {total > 0 ? (
          <TouchableOpacity
            style={styles.breakdownSection}
            onPress={handleBarTap}
            activeOpacity={0.8}
          >
            <View style={styles.streamBar}>
              {streamEntries.map(([stream, amount], index) => {
                const opacity = Math.max(1 - index * 0.15, 0.2);
                return (
                  <View
                    key={stream}
                    style={[
                      styles.streamBarSegment,
                      {
                        flex: amount,
                        backgroundColor: withAlpha(CALM.bronze, opacity),
                      },
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.streamLegend}>
              {streamEntries.map(([stream, amount], index) => {
                const opacity = Math.max(1 - index * 0.15, 0.2);
                return (
                  <View key={stream} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: withAlpha(CALM.bronze, opacity) },
                      ]}
                    />
                    <Text style={styles.legendText} numberOfLines={1}>
                      {stream}: {currency} {Math.round(amount).toLocaleString()}
                    </Text>
                  </View>
                );
              })}
            </View>
            {mixedDetails.hasRoadCosts && showCostPercentage && total > 0 && (
              <Text style={styles.costPercentageText}>
                costs were {Math.round((costs / total) * 100)}% of what came in
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.breakdownSection}>
            <Text style={styles.noDataText}>nothing logged yet</Text>
          </View>
        )}

        {/* Zone 3 — AI Insight */}
        {insight && <Text style={styles.insightText}>{insight}</Text>}

        {/* Zone 4 — WeekBar */}
        <View style={styles.weekBarSection}>
          <WeekBar transactions={weekBarTxns} />
        </View>

        {/* Zone 5 — Cost Summary (only if hasRoadCosts) */}
        {mixedDetails.hasRoadCosts && costsByCategory.length > 0 && (
          <View style={styles.costBreakdownSection}>
            <Text style={styles.sectionLabel}>where costs went</Text>
            {costsByCategory.map(([category, amount]) => (
              <View key={category} style={styles.costRow}>
                <Text style={styles.costCategoryText}>
                  {CATEGORY_EMOJIS[category] || '\u270F\uFE0F'} {category}
                </Text>
                <View style={styles.costBarContainer}>
                  <View
                    style={[
                      styles.costBar,
                      { width: `${(amount / maxCostAmount) * 100}%` },
                    ]}
                  />
                  <Text style={styles.costAmount}>
                    {currency} {Math.round(amount).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Zone 6 — Recent Activity */}
        {recentActivity.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionLabel}>recent</Text>
            {recentActivity.map((tx) => (
              <View key={tx.id} style={styles.recentRow}>
                <Text
                  style={[
                    styles.recentAmount,
                    tx.roadTransactionType === 'cost' && styles.recentAmountCost,
                  ]}
                >
                  {tx.roadTransactionType === 'cost' ? '\u2212' : '+'}
                  {currency} {tx.amount.toLocaleString()}
                </Text>
                <View style={styles.recentMeta}>
                  <Text style={styles.recentLabel}>
                    {tx.roadTransactionType === 'cost'
                      ? getCategoryLabel(tx)
                      : tx.streamLabel || 'income'}
                  </Text>
                </View>
                <Text style={styles.recentDate}>
                  {formatDistanceToNow(toDate(tx.date), { addSuffix: true })}
                </Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.seeAllLink}
              onPress={() => navigation.getParent()?.navigate('MixedStreamHistory')}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>see all {'\u2192'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reports link */}
        <TouchableOpacity
          style={styles.reportsLink}
          onPress={() => navigation.getParent()?.navigate('MixedReports')}
          activeOpacity={0.7}
        >
          <Feather name="bar-chart-2" size={16} color={CALM.textSecondary} />
          <Text style={styles.reportsLinkText}>view reports</Text>
        </TouchableOpacity>

        {/* Bottom links */}
        <TouchableOpacity
          onPress={() => useBusinessStore.getState().resetSetup()}
          style={styles.bottomLink}
        >
          <Text style={styles.bottomLinkText}>not the right setup? change it.</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.getParent()?.navigate('MixedSetup')}
          style={styles.bottomLink}
        >
          <Text style={styles.bottomLinkText}>edit streams</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* FABs — dual if hasRoadCosts, single if not */}
      <View style={styles.fabContainer}>
        {mixedDetails.hasRoadCosts && (
          <TouchableOpacity
            style={styles.fabSecondary}
            onPress={() => navigation.getParent()?.navigate('MixedAddCost')}
            activeOpacity={0.7}
          >
            <Text style={styles.fabSecondaryText}>log cost</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.getParent()?.navigate('MixedAddIncome')}
          activeOpacity={0.7}
        >
          <Text style={styles.fabText}>log income</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: SPACING['7xl'],
  },

  // Zone 1 — Hero
  heroAmount: {
    ...TYPE.hero,
    color: CALM.textPrimary,
    textAlign: 'center',
  },
  heroLabel: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },

  // Zone 2 — Stream Breakdown
  breakdownSection: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  streamBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  streamBarSegment: {
    minWidth: 2,
  },
  streamLegend: {
    gap: SPACING.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    flex: 1,
  },
  costPercentageText: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  noDataText: {
    ...TYPE.muted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },

  // Zone 3 — Insight
  insightText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
  },

  // Zone 4 — WeekBar
  weekBarSection: {
    marginBottom: SPACING.lg,
  },

  // Zone 5 — Cost Breakdown
  costBreakdownSection: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    ...TYPE.muted,
    marginBottom: SPACING.md,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  costCategoryText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    width: 120,
  },
  costBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  costBar: {
    height: 16,
    borderRadius: RADIUS.xs,
    backgroundColor: withAlpha(CALM.bronze, 0.2),
    minWidth: 4,
  },
  costAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // Zone 6 — Recent
  recentSection: {
    marginBottom: SPACING.xl,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  recentAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    minWidth: 90,
  },
  recentAmountCost: {
    color: CALM.textSecondary,
  },
  recentMeta: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
  },
  recentLabel: {
    ...TYPE.muted,
  },
  recentDate: {
    ...TYPE.muted,
    textAlign: 'right',
  },

  seeAllLink: {
    paddingVertical: SPACING.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  seeAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },

  // Reports link
  reportsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  reportsLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },

  // Bottom links
  bottomLink: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  bottomLinkText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },

  // FABs
  fabContainer: {
    position: 'absolute',
    bottom: SPACING['2xl'],
    right: SPACING['2xl'],
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  fabSecondary: {
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CALM.bronze,
    backgroundColor: CALM.background,
  },
  fabSecondaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  fab: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
});

export default MixedDashboard;
