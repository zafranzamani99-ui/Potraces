import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, differenceInDays, formatDistanceToNow } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { useFreelancerStore } from '../../../store/freelancerStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { explainFreelancerMonth } from '../../../utils/explainFreelancerMonth';
import WeekBar from '../../../components/common/WeekBar';
import ModeToggle from '../../../components/common/ModeToggle';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const FreelancerDashboard: React.FC = () => {
  const { businessTransactions } = useBusinessStore();
  const {
    clients,
    getSixMonthAverage,
    getClientAverageGap,
    getClientLastPayment,
    getClientPayments,
  } = useFreelancerStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // ─── TIME BOUNDARIES (stable across renders) ──────────────
  const dateBounds = useMemo(() => {
    const now = new Date();
    return {
      now,
      monthStart: startOfMonth(now),
      monthEnd: endOfMonth(now),
    };
  }, []);

  const { now, monthStart, monthEnd } = dateBounds;

  const inRange = (d: Date | string, start: Date, end: Date) =>
    isWithinInterval(toDate(d), { start, end });

  // Current month income
  const currentMonthPayments = useMemo(
    () =>
      businessTransactions.filter(
        (t) => t.type === 'income' && inRange(t.date, monthStart, monthEnd)
      ),
    [businessTransactions, monthStart, monthEnd] // monthStart/monthEnd are stable from dateBounds memo
  );

  const currentMonthTotal = currentMonthPayments.reduce((s, t) => s + t.amount, 0);

  // Previous 6 months for insight engine
  const previousMonthsPayments = useMemo(() => {
    const sixAgo = startOfMonth(subMonths(now, 6));
    return businessTransactions.filter(
      (t) => t.type === 'income' && inRange(t.date, sixAgo, monthEnd)
    );
  }, [businessTransactions, now, monthEnd]); // now/monthEnd are stable from dateBounds memo

  // Hero: 6-month average
  const sixMonthAvg = useMemo(() => getSixMonthAverage(), [businessTransactions]);

  // WeekBar data — map income to 'expense' type so existing WeekBar filter works
  const weekBarTxns = useMemo(
    () =>
      currentMonthPayments.map((t) => ({
        id: t.id,
        amount: t.amount,
        category: 'income',
        description: t.note || '',
        date: t.date,
        type: 'expense' as const,
        mode: 'business' as const,
        createdAt: t.date,
        updatedAt: t.date,
      })),
    [currentMonthPayments]
  );

  // AI insight
  const insight = useMemo(
    () =>
      explainFreelancerMonth(
        currentMonthPayments,
        previousMonthsPayments,
        clients,
        getClientAverageGap,
        getClientLastPayment
      ),
    [currentMonthPayments, previousMonthsPayments, clients]
  );

  const { topClients, gapAlert } = useMemo(() => {
    const enriched = clients.map((client) => {
      const payments = getClientPayments(client.id);
      const totalEarned = payments.reduce((s, t) => s + t.amount, 0);
      const lastPayment = getClientLastPayment(client.id);
      const avgGap = getClientAverageGap(client.id);
      return { client, totalEarned, lastPayment, avgGap };
    });

    const top = enriched
      .filter((c) => c.totalEarned > 0)
      .sort((a, b) => b.totalEarned - a.totalEarned)
      .slice(0, 3);

    let longestOverdue: { name: string; daysSince: number } | null = null;
    for (const entry of enriched) {
      if (entry.avgGap === null || !entry.lastPayment) continue;
      const daysSince = differenceInDays(now, toDate(entry.lastPayment.date));
      if (daysSince > entry.avgGap * 1.5) {
        if (!longestOverdue || daysSince > longestOverdue.daysSince) {
          longestOverdue = { name: entry.client.name, daysSince };
        }
      }
    }

    return { topClients: top, gapAlert: longestOverdue };
  }, [clients, businessTransactions]);

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
          {currency} {Math.round(sixMonthAvg).toLocaleString()}
        </Text>
        <Text style={styles.heroLabel}>your monthly average</Text>
        {currentMonthPayments.length > 0 && (
          <Text style={styles.currentMonth}>
            this month so far: {currency} {Math.round(currentMonthTotal).toLocaleString()}
          </Text>
        )}

        {/* Zone 2 — WeekBar */}
        <View style={styles.weekBarSection}>
          <WeekBar transactions={weekBarTxns} />
        </View>

        {/* Zone 3 — AI Insight */}
        {insight && <Text style={styles.insightText}>{insight}</Text>}

        {/* Zone 4 — Client Snapshot */}
        {topClients.length > 0 && (
          <View style={styles.clientSection}>
            <Text style={styles.sectionLabel}>clients</Text>
            {topClients.map(({ client, totalEarned, lastPayment }) => (
              <TouchableOpacity
                key={client.id}
                style={styles.clientRow}
                onPress={() =>
                  navigation.getParent()?.navigate('FreelancerClientDetail', {
                    clientId: client.id,
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientTotal}>
                    {currency} {totalEarned.toLocaleString()}
                  </Text>
                </View>
                {lastPayment && (
                  <Text style={styles.clientLastPaid}>
                    {formatDistanceToNow(toDate(lastPayment.date), { addSuffix: true })}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.seeAllLink}
              onPress={() => navigation.getParent()?.navigate('FreelancerClientList')}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>see all clients →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Zone 5 — Gap Alert */}
        {gapAlert && (
          <Text style={styles.gapAlertText}>
            it's been a while since {gapAlert.name} — last payment was{' '}
            {gapAlert.daysSince} days ago
          </Text>
        )}

        {/* Reports link */}
        <TouchableOpacity
          style={styles.reportsLink}
          onPress={() => navigation.getParent()?.navigate('FreelancerReports')}
          activeOpacity={0.7}
        >
          <Feather name="bar-chart-2" size={16} color={CALM.textSecondary} />
          <Text style={styles.reportsLinkText}>view reports</Text>
        </TouchableOpacity>

        {/* Change setup */}
        <TouchableOpacity
          onPress={() => useBusinessStore.getState().resetSetup()}
          style={styles.changeSetup}
        >
          <Text style={styles.changeSetupText}>
            not the right setup? change it.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* FAB — Log Payment */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.getParent()?.navigate('FreelancerAddPayment')}
        activeOpacity={0.7}
      >
        <Text style={styles.fabText}>log payment</Text>
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
  currentMonth: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },

  // Zone 2
  weekBarSection: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },

  // Zone 3
  insightText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.xl,
  },

  // Zone 4 — Clients
  clientSection: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    ...TYPE.muted,
    marginBottom: SPACING.md,
  },
  clientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  clientTotal: {
    ...TYPE.muted,
    marginTop: 2,
  },
  clientLastPaid: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  seeAllLink: {
    paddingVertical: SPACING.md,
  },
  seeAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },

  // Zone 5
  gapAlertText: {
    ...TYPE.muted,
    marginBottom: SPACING.xl,
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

  // Change setup
  changeSetup: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  changeSetupText: {
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

export default FreelancerDashboard;
