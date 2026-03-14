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
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, formatDistanceToNow, format } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { usePartTimeStore } from '../../../store/partTimeStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../../constants';
import { explainPartTimeMonth } from '../../../utils/explainPartTimeMonth';
import WeekBar from '../../../components/common/WeekBar';
import ModeToggle from '../../../components/common/ModeToggle';
import PartTimeSetup from './PartTimeSetup';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const PartTimeDashboard: React.FC = () => {
  const { businessTransactions } = useBusinessStore();
  const {
    jobDetails,
    getCurrentMonthMainIncome,
    getCurrentMonthSideIncome,
    getCurrentMonthTotal,
    getSideIncomePercentage,
    getMonthlyBreakdown,
    isPayDayPassed,
    isMainJobLoggedThisMonth,
  } = usePartTimeStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [showPercentage, setShowPercentage] = useState(false);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const mainIncome = useMemo(() => getCurrentMonthMainIncome(), [businessTransactions]);
  const sideIncome = useMemo(() => getCurrentMonthSideIncome(), [businessTransactions]);
  const totalIncome = mainIncome + sideIncome;
  const sidePercentage = totalIncome > 0 ? Math.round((sideIncome / totalIncome) * 100) : 0;
  const mainPercentage = totalIncome > 0 ? 100 - sidePercentage : 0;

  // WeekBar data — map income to 'expense' type so existing WeekBar filter works
  const weekBarTxns = useMemo(() => {
    return businessTransactions
      .filter(
        (t) =>
          t.type === 'income' &&
          isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd })
      )
      .map((t) => ({
        id: t.id,
        amount: t.amount,
        category: 'income',
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
        t.type === 'income' &&
        isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd })
    );
    return { main: mainIncome, side: sideIncome, transactions: txns };
  }, [businessTransactions, mainIncome, sideIncome]);

  const previousMonthsData = useMemo(() => {
    const result: Array<{ main: number; side: number }> = [];
    for (let i = 1; i <= 6; i++) {
      const d = subMonths(now, i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const monthTxns = businessTransactions.filter(
        (t) => t.type === 'income' && isWithinInterval(toDate(t.date), { start: ms, end: me })
      );
      result.push({
        main: monthTxns.filter((t) => t.incomeStream === 'main').reduce((s, t) => s + t.amount, 0),
        side: monthTxns.filter((t) => t.incomeStream === 'side').reduce((s, t) => s + t.amount, 0),
      });
    }
    return result;
  }, [businessTransactions]);

  const insight = useMemo(
    () => explainPartTimeMonth(currentMonthData, previousMonthsData, jobDetails),
    [currentMonthData, previousMonthsData, jobDetails]
  );

  // Recent income (last 5)
  const recentIncome = useMemo(() => {
    return businessTransactions
      .filter((t) => t.type === 'income' && t.incomeStream)
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
      .slice(0, 5);
  }, [businessTransactions]);

  // Pay day tracker
  const payDayPassed = useMemo(() => isPayDayPassed(), [jobDetails]);
  const mainJobLogged = useMemo(() => isMainJobLoggedThisMonth(), [businessTransactions]);

  // Setup gate — show setup screen on first visit (after all hooks)
  if (!jobDetails.setupComplete) {
    return <PartTimeSetup />;
  }

  const getPayDayContent = () => {
    if (!jobDetails.payDay) return null;

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const effectivePayDay = Math.min(jobDetails.payDay, daysInMonth);

    if (!payDayPassed) {
      const daysUntil = effectivePayDay - now.getDate();
      return { text: `pay day in ${daysUntil} days`, showLogLink: false };
    }

    if (payDayPassed && mainJobLogged) {
      return null; // silence
    }

    if (payDayPassed && !mainJobLogged) {
      const daysSince = now.getDate() - effectivePayDay;
      return {
        text: `pay day was ${daysSince} days ago — did it come in?`,
        showLogLink: true,
      };
    }

    return null;
  };

  const payDayContent = getPayDayContent();

  const handleBarTap = () => {
    if (totalIncome === 0) return;
    setShowPercentage(true);
    setTimeout(() => setShowPercentage(false), 2000);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]}
        showsVerticalScrollIndicator={false}
      >
        <ModeToggle />
        {/* Zone 1 — Hero Number */}
        <Text style={styles.heroAmount}>
          {currency} {Math.round(totalIncome).toLocaleString()}
        </Text>
        <Text style={styles.heroLabel}>earned this month</Text>

        {/* Zone 2 — Stream Split */}
        <TouchableOpacity
          style={styles.splitSection}
          onPress={handleBarTap}
          activeOpacity={0.8}
        >
          {totalIncome > 0 ? (
            <>
              <View style={styles.splitBar}>
                <View
                  style={[
                    styles.splitBarMain,
                    { flex: mainIncome || 0.001 },
                  ]}
                />
                <View
                  style={[
                    styles.splitBarSide,
                    { flex: sideIncome || 0.001 },
                  ]}
                />
              </View>
              {showPercentage ? (
                <Text style={styles.splitPercentage}>
                  {mainPercentage}% main / {sidePercentage}% side
                </Text>
              ) : (
                <View style={styles.splitLabels}>
                  <Text style={styles.splitLabelMain}>
                    main job: {currency} {Math.round(mainIncome).toLocaleString()}
                  </Text>
                  <Text style={styles.splitLabelSide}>
                    side income: {currency} {Math.round(sideIncome).toLocaleString()}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.noDataText}>no income logged yet</Text>
          )}
        </TouchableOpacity>

        {/* Zone 3 — Pay Day Tracker */}
        {payDayContent && (
          <View style={styles.payDaySection}>
            <Text style={styles.payDayText}>
              {payDayContent.text}
              {payDayContent.showLogLink && (
                <Text
                  style={styles.payDayLink}
                  onPress={() =>
                    navigation.getParent()?.navigate('PartTimeAddIncome', { preSelectMain: true })
                  }
                >
                  {' '}log it
                </Text>
              )}
            </Text>
          </View>
        )}

        {/* Zone 4 — AI Insight */}
        {insight && <Text style={styles.insightText}>{insight}</Text>}

        {/* Zone 5 — WeekBar */}
        <View style={styles.weekBarSection}>
          <WeekBar transactions={weekBarTxns} />
        </View>

        {/* Zone 6 — Recent Income */}
        {recentIncome.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionLabel}>recent</Text>
            {recentIncome.map((tx) => (
              <View key={tx.id} style={styles.recentRow}>
                <Text style={styles.recentAmount}>
                  {currency} {tx.amount.toLocaleString()}
                </Text>
                <Text style={styles.recentStream}>
                  {tx.incomeStream === 'main' ? 'main job' : 'side income'}
                </Text>
                <Text style={styles.recentDate}>
                  {formatDistanceToNow(toDate(tx.date), { addSuffix: true })}
                </Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.seeAllLink}
              onPress={() => navigation.getParent()?.navigate('PartTimeIncomeHistory')}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>see all →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reports link */}
        <TouchableOpacity
          style={styles.reportsLink}
          onPress={() => navigation.getParent()?.navigate('PartTimeReports')}
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
          onPress={() => navigation.getParent()?.navigate('PartTimeSetup')}
          style={styles.bottomLink}
        >
          <Text style={styles.bottomLinkText}>edit job details</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* FAB — Log Income */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.getParent()?.navigate('PartTimeAddIncome')}
        activeOpacity={0.7}
      >
        <Text style={styles.fabText}>log income</Text>
      </TouchableOpacity>
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

  // Zone 2 — Stream Split
  splitSection: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  splitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  splitBarMain: {
    backgroundColor: CALM.bronze,
  },
  splitBarSide: {
    backgroundColor: withAlpha(CALM.bronze, 0.4),
  },
  splitLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splitLabelMain: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  splitLabelSide: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  splitPercentage: {
    ...TYPE.muted,
    textAlign: 'center',
  },
  noDataText: {
    ...TYPE.muted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },

  // Zone 3 — Pay Day
  payDaySection: {
    marginBottom: SPACING.lg,
  },
  payDayText: {
    ...TYPE.muted,
  },
  payDayLink: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    textDecorationLine: 'underline',
  },

  // Zone 4 — Insight
  insightText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
  },

  // Zone 5 — WeekBar
  weekBarSection: {
    marginBottom: SPACING.lg,
  },

  // Zone 6 — Recent
  recentSection: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    ...TYPE.muted,
    marginBottom: SPACING.md,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  recentAmount: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  recentStream: {
    ...TYPE.muted,
    flex: 1,
    textAlign: 'center',
  },
  recentDate: {
    ...TYPE.muted,
    flex: 1,
    textAlign: 'right',
  },
  seeAllLink: {
    paddingVertical: SPACING.md,
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

  // FAB
  fab: {
    position: 'absolute',
    bottom: SPACING['2xl'],
    right: SPACING['2xl'],
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

export default PartTimeDashboard;
