import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, formatDistanceToNow } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { useOnTheRoadStore } from '../../../store/onTheRoadStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { explainOnTheRoadMonth } from '../../../utils/explainOnTheRoadMonth';
import WeekBar from '../../../components/common/WeekBar';
import ModeToggle from '../../../components/common/ModeToggle';
import OnTheRoadSetup from './OnTheRoadSetup';

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

const OnTheRoadDashboard: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { businessTransactions } = useBusinessStore();
  const {
    roadDetails,
    getCurrentMonthEarnings,
    getCurrentMonthCosts,
    getCurrentMonthNet,
    getCostPercentage,
    getCostsByCategory,
    getHighestCostCategory,
  } = useOnTheRoadStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [showCostPercentage, setShowCostPercentage] = useState(false);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // All computed values — hooks MUST be above the setup gate
  const earned = useMemo(() => getCurrentMonthEarnings(), [businessTransactions]);
  const costs = useMemo(() => getCurrentMonthCosts(), [businessTransactions]);
  const net = earned - costs;
  const costPercentage = earned > 0 ? Math.round((costs / earned) * 100) : 0;

  const costsByCategory = useMemo(() => getCostsByCategory(), [businessTransactions]);
  const sortedCosts = useMemo(
    () => Object.entries(costsByCategory).sort((a, b) => b[1] - a[1]),
    [costsByCategory]
  );
  const maxCostAmount = sortedCosts.length > 0 ? sortedCosts[0][1] : 1;

  // WeekBar data — map net earnings to 'expense' type for WeekBar filter compatibility
  const weekBarTxns = useMemo(() => {
    // Calculate net per transaction for WeekBar: earnings as positive, costs subtracted
    // WeekBar filters by type === 'expense' and sums amounts
    // We'll create a virtual transaction per week showing net
    const roadTxns = businessTransactions.filter(
      (t) =>
        t.roadTransactionType &&
        isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd })
    );
    return roadTxns.map((t) => ({
      id: t.id,
      amount: t.roadTransactionType === 'earning' ? t.amount : -t.amount,
      category: 'net',
      description: t.note || '',
      date: t.date,
      type: 'expense' as const,
      mode: 'business' as const,
      createdAt: t.date,
      updatedAt: t.date,
    }));
  }, [businessTransactions]);

  // AI insight
  const currentMonthData = useMemo(() => {
    const txns = businessTransactions.filter(
      (t) =>
        t.roadTransactionType &&
        isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd })
    );
    return { earned, costs, net, transactions: txns };
  }, [businessTransactions, earned, costs, net]);

  const previousMonthsData = useMemo(() => {
    const result: Array<{ earned: number; costs: number; net: number }> = [];
    for (let i = 1; i <= 6; i++) {
      const d = subMonths(now, i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const monthTxns = businessTransactions.filter(
        (t) => t.roadTransactionType && isWithinInterval(toDate(t.date), { start: ms, end: me })
      );
      const monthEarned = monthTxns
        .filter((t) => t.roadTransactionType === 'earning')
        .reduce((s, t) => s + t.amount, 0);
      const monthCosts = monthTxns
        .filter((t) => t.roadTransactionType === 'cost')
        .reduce((s, t) => s + t.amount, 0);
      result.push({ earned: monthEarned, costs: monthCosts, net: monthEarned - monthCosts });
    }
    return result;
  }, [businessTransactions]);

  const insight = useMemo(
    () => explainOnTheRoadMonth(currentMonthData, previousMonthsData, roadDetails),
    [currentMonthData, previousMonthsData, roadDetails]
  );

  // Recent activity (last 5, earnings + costs mixed)
  const recentActivity = useMemo(() => {
    return businessTransactions
      .filter((t) => t.roadTransactionType)
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
      .slice(0, 5);
  }, [businessTransactions]);

  // Setup gate — AFTER all hooks
  if (!roadDetails.setupComplete) {
    return <OnTheRoadSetup />;
  }

  const handleBarTap = () => {
    if (earned === 0 && costs === 0) return;
    setShowCostPercentage(true);
    setTimeout(() => setShowCostPercentage(false), 2000);
  };

  const formatNet = (value: number) => {
    if (value < 0) {
      return `\u2212${currency} ${Math.abs(Math.round(value)).toLocaleString()}`;
    }
    return `${currency} ${Math.round(value).toLocaleString()}`;
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
        {/* Zone 1 — Hero: Net Earnings */}
        <Text style={styles.heroAmount}>{formatNet(net)}</Text>
        <Text style={styles.heroLabel}>kept this month</Text>

        {/* Zone 2 — Gross vs Costs */}
        <TouchableOpacity
          style={styles.breakdownSection}
          onPress={handleBarTap}
          activeOpacity={0.8}
        >
          {earned === 0 && costs === 0 ? (
            <Text style={styles.noDataText}>nothing logged yet</Text>
          ) : (
            <>
              <View style={styles.breakdownLines}>
                <Text style={styles.breakdownText}>
                  earned: {currency} {Math.round(earned).toLocaleString()}
                </Text>
                <Text style={styles.breakdownTextMuted}>
                  costs: {currency} {Math.round(costs).toLocaleString()}
                </Text>
              </View>
              <View style={styles.splitBar}>
                <View
                  style={[
                    styles.splitBarEarned,
                    { flex: earned || 0.001 },
                  ]}
                />
                <View
                  style={[
                    styles.splitBarCosts,
                    { flex: costs || 0.001 },
                  ]}
                />
              </View>
              {showCostPercentage && (
                <Text style={styles.costPercentageText}>
                  costs were {costPercentage}% of what came in
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>

        {/* Zone 3 — AI Insight */}
        {insight && <Text style={styles.insightText}>{insight}</Text>}

        {/* Zone 4 — WeekBar */}
        <View style={styles.weekBarSection}>
          <WeekBar transactions={weekBarTxns} />
        </View>

        {/* Zone 5 — Cost Breakdown */}
        {sortedCosts.length > 0 && (
          <View style={styles.costBreakdownSection}>
            <Text style={styles.sectionLabel}>where costs went</Text>
            {sortedCosts.map(([category, amount]) => (
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
            <TouchableOpacity
              style={styles.seeAllLink}
              onPress={() => navigation.getParent()?.navigate('OnTheRoadCostHistory')}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>see all costs \u2192</Text>
            </TouchableOpacity>
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
                  {tx.roadTransactionType === 'earning' ? '+' : '\u2212'}
                  {currency} {tx.amount.toLocaleString()}
                </Text>
                <View style={styles.recentMeta}>
                  <Text style={styles.recentLabel}>
                    {tx.roadTransactionType === 'earning'
                      ? 'earned'
                      : getCategoryLabel(tx)}
                  </Text>
                  {tx.platform && (
                    <Text style={styles.recentPlatform}>{tx.platform}</Text>
                  )}
                </View>
                <Text style={styles.recentDate}>
                  {formatDistanceToNow(toDate(tx.date), { addSuffix: true })}
                </Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.seeAllLink}
              onPress={() => navigation.getParent()?.navigate('OnTheRoadCostHistory', { filter: 'all' })}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>see all \u2192</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reports link */}
        <TouchableOpacity
          style={styles.reportsLink}
          onPress={() => navigation.getParent()?.navigate('OnTheRoadReports')}
          activeOpacity={0.7}
        >
          <Feather name="bar-chart-2" size={16} color={C.textSecondary} />
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
          onPress={() => navigation.getParent()?.navigate('OnTheRoadSetup')}
          style={styles.bottomLink}
        >
          <Text style={styles.bottomLinkText}>edit details</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Dual FABs — log earnings (primary) + log cost (secondary) */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fabSecondary}
          onPress={() => navigation.getParent()?.navigate('OnTheRoadAddCost')}
          activeOpacity={0.7}
        >
          <Text style={styles.fabSecondaryText}>log cost</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.getParent()?.navigate('OnTheRoadAddEarnings')}
          activeOpacity={0.7}
        >
          <Text style={styles.fabText}>log earnings</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: SPACING['7xl'],
  },

  // Zone 1 — Hero
  heroAmount: {
    ...TYPE.hero,
    color: C.textPrimary,
    textAlign: 'center',
  },
  heroLabel: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },

  // Zone 2 — Breakdown
  breakdownSection: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  breakdownLines: {
    marginBottom: SPACING.sm,
  },
  breakdownText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  breakdownTextMuted: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  splitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  splitBarEarned: {
    backgroundColor: C.bronze,
  },
  splitBarCosts: {
    backgroundColor: withAlpha(C.bronze, 0.3),
  },
  costPercentageText: {
    ...TYPE.muted,
    textAlign: 'center',
  },
  noDataText: {
    ...TYPE.muted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },

  // Zone 3 — Insight
  insightText: {
    ...TYPE.insight,
    color: C.textSecondary,
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
    color: C.textPrimary,
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
    backgroundColor: withAlpha(C.bronze, 0.2),
    minWidth: 4,
  },
  costAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
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
    borderBottomColor: C.border,
  },
  recentAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    minWidth: 90,
  },
  recentAmountCost: {
    color: C.textSecondary,
  },
  recentMeta: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
  },
  recentLabel: {
    ...TYPE.muted,
  },
  recentPlatform: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: SPACING.xs,
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
    color: C.textSecondary,
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
    color: C.textSecondary,
  },

  // Bottom links
  bottomLink: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  bottomLinkText: {
    ...TYPE.muted,
    color: C.textSecondary,
  },

  // Dual FABs
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
    borderColor: C.bronze,
    backgroundColor: C.background,
  },
  fabSecondaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  fab: {
    backgroundColor: C.bronze,
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

export default OnTheRoadDashboard;
