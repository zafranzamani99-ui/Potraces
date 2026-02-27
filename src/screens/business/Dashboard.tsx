import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { BusinessTransaction, RiderCost } from '../../types';
import { explainBusinessMonth } from '../../utils/explainBusinessMonth';
import WeekBar from '../../components/common/WeekBar';
import ModeToggle from '../../components/common/ModeToggle';

const BusinessDashboard: React.FC = () => {
  const {
    incomeType,
    businessSetupComplete,
    businessTransactions,
    clients,
    riderCosts,
    incomeStreams,
    getTotalTransferredToPersonal,
  } = useBusinessStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevStart = startOfMonth(subMonths(now, 1));
  const prevEnd = endOfMonth(subMonths(now, 1));

  const inRange = (d: Date, start: Date, end: Date) =>
    isWithinInterval(d instanceof Date ? d : new Date(d), { start, end });

  const currentTxns = useMemo(
    () => businessTransactions.filter((t) => inRange(t.date, monthStart, monthEnd)),
    [businessTransactions]
  );
  const previousTxns = useMemo(
    () => businessTransactions.filter((t) => inRange(t.date, prevStart, prevEnd)),
    [businessTransactions]
  );
  const currentRiderCosts = useMemo(
    () => riderCosts.filter((r) => inRange(r.date, monthStart, monthEnd)),
    [riderCosts]
  );

  const currentIncome = currentTxns.filter((t) => t.type === 'income');
  const currentCosts = currentTxns.filter((t) => t.type === 'cost');
  const totalIncome = currentIncome.reduce((s, t) => s + t.amount, 0);
  const totalCostsTx = currentCosts.reduce((s, t) => s + t.amount, 0);
  const totalRiderCosts = currentRiderCosts.reduce((s, r) => s + r.amount, 0);
  const totalCosts = totalCostsTx + totalRiderCosts;
  const net = totalIncome - totalCosts;

  const transferredThisMonth = getTotalTransferredToPersonal(now);

  // AI insight
  const insight = useMemo(
    () =>
      incomeType
        ? explainBusinessMonth(currentTxns, previousTxns, incomeType, currentRiderCosts)
        : null,
    [currentTxns, previousTxns, incomeType, currentRiderCosts]
  );

  // Zone 1 label
  const netLabel = (() => {
    switch (incomeType) {
      case 'seller':
      case 'rider':
        return 'KEPT THIS MONTH';
      case 'freelance':
      case 'parttime':
        return 'EARNED THIS MONTH';
      case 'mixed':
        return 'TOTAL IN';
      default:
        return 'THIS MONTH';
    }
  })();

  // Build transactions for WeekBar (map to personal Transaction shape)
  const weekBarTxns = useMemo(
    () =>
      currentIncome.map((t) => ({
        id: t.id,
        amount: t.amount,
        category: t.category || 'income',
        description: t.note || '',
        date: t.date,
        type: 'income' as const,
        mode: 'business' as const,
        createdAt: t.date,
        updatedAt: t.date,
      })),
    [currentIncome]
  );

  // Freelance: 6-month average
  const monthlyAverage = useMemo(() => {
    let total = 0;
    let months = 0;
    for (let i = 0; i < 6; i++) {
      const ms = startOfMonth(subMonths(now, i));
      const me = endOfMonth(subMonths(now, i));
      const monthIncome = businessTransactions
        .filter((t) => t.type === 'income' && inRange(t.date, ms, me))
        .reduce((s, t) => s + t.amount, 0);
      if (monthIncome > 0) months++;
      total += monthIncome;
    }
    return months > 0 ? total / months : 0;
  }, [businessTransactions]);

  // Redirect to setup if not complete
  if (!businessSetupComplete || !incomeType) {
    // Navigate to setup on next tick
    React.useEffect(() => {
      navigation.getParent()?.navigate('BusinessSetup');
    }, []);
    return (
      <View style={styles.container}>
        <ModeToggle />
      </View>
    );
  }

  const renderVariantContent = () => {
    switch (incomeType) {
      case 'seller':
        return (
          <View style={styles.variantSection}>
            <View style={styles.sideBySide}>
              <View style={styles.sideItem}>
                <Text style={styles.sideLabel}>came in</Text>
                <Text style={styles.sideValue}>{currency} {totalIncome.toFixed(2)}</Text>
              </View>
              <View style={styles.sideItem}>
                <Text style={styles.sideLabel}>costs</Text>
                <Text style={styles.sideValue}>{currency} {totalCosts.toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.keptLine}>you kept {currency} {net.toFixed(2)}.</Text>
          </View>
        );

      case 'freelance': {
        const activeClients = clients.filter((c) => c.totalPaid > 0);
        const lastPayment = activeClients
          .flatMap((c) => c.paymentHistory.map((p) => ({ ...p, clientName: c.name })))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        return (
          <View style={styles.variantSection}>
            <Text style={styles.insightLine}>
              {activeClients.length} client{activeClients.length !== 1 ? 's' : ''} &middot;{' '}
              {currency} {monthlyAverage.toFixed(0)} average monthly across last 6 months.
            </Text>
            {lastPayment && (
              <Text style={styles.labelLine}>
                Last: {lastPayment.clientName} &middot; {currency} {lastPayment.amount.toFixed(2)}
              </Text>
            )}
          </View>
        );
      }

      case 'parttime': {
        const mainIncome = currentIncome
          .filter((t) => !t.streamId || t.streamId === 'main')
          .reduce((s, t) => s + t.amount, 0);
        const sideIncome = currentIncome
          .filter((t) => t.streamId && t.streamId !== 'main')
          .reduce((s, t) => s + t.amount, 0);
        const sidePct = totalIncome > 0 ? ((sideIncome / totalIncome) * 100).toFixed(0) : '0';
        return (
          <View style={styles.variantSection}>
            <Text style={styles.insightLine}>main job: {currency} {mainIncome.toFixed(2)}</Text>
            <Text style={styles.insightLine}>side income: {currency} {sideIncome.toFixed(2)}</Text>
            {sideIncome > 0 && (
              <Text style={styles.labelLine}>
                side income was {sidePct}% of your total this month.
              </Text>
            )}
          </View>
        );
      }

      case 'rider':
        return (
          <View style={styles.variantSection}>
            <View style={styles.sideBySide}>
              <View style={styles.sideItem}>
                <Text style={styles.sideLabel}>grossed</Text>
                <Text style={styles.sideValue}>{currency} {totalIncome.toFixed(2)}</Text>
              </View>
              <View style={styles.sideItem}>
                <Text style={styles.sideLabel}>costs</Text>
                <Text style={styles.sideValue}>{currency} {totalCosts.toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.riderKept}>
              after petrol and costs, you kept {currency} {net.toFixed(2)}.
            </Text>
          </View>
        );

      case 'mixed':
        return (
          <View style={styles.variantSection}>
            {incomeStreams.map((stream) => {
              const streamTotal = currentIncome
                .filter((t) => t.streamId === stream.id)
                .reduce((s, t) => s + t.amount, 0);
              return (
                <View key={stream.id} style={styles.streamRow}>
                  {stream.color && <View style={[styles.streamDot, { backgroundColor: stream.color }]} />}
                  <Text style={styles.streamLabel}>{stream.label}</Text>
                  <Text style={styles.streamAmount}>{currency} {streamTotal.toFixed(2)}</Text>
                </View>
              );
            })}
            <View style={styles.streamTotalRow}>
              <Text style={styles.streamTotalLabel}>total</Text>
              <Text style={styles.streamTotalAmount}>{currency} {totalIncome.toFixed(2)}</Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Zone 1 — Net */}
        <Text style={styles.netLabel}>{netLabel}</Text>
        <Text style={styles.netAmount}>
          {currency} {(incomeType === 'rider' ? net : totalIncome).toFixed(2)}
        </Text>

        {/* Zone 2 — WeekBar */}
        <View style={styles.weekBarSection}>
          <WeekBar transactions={weekBarTxns} />
        </View>

        {/* Zone 3 — AI Insight */}
        {insight && <Text style={styles.insightText}>{insight}</Text>}

        {/* Zone 4 — Variant Content */}
        {renderVariantContent()}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.getParent()?.navigate('LogIncome')}
          >
            <Feather name="plus" size={20} color={CALM.accent} />
            <Text style={styles.quickActionText}>Log Income</Text>
          </TouchableOpacity>

          {incomeType === 'freelance' && (
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.getParent()?.navigate('ClientList')}
            >
              <Feather name="users" size={20} color={CALM.accent} />
              <Text style={styles.quickActionText}>Clients</Text>
            </TouchableOpacity>
          )}

          {incomeType === 'rider' && (
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.getParent()?.navigate('RiderCosts')}
            >
              <Feather name="tool" size={20} color={CALM.accent} />
              <Text style={styles.quickActionText}>Costs</Text>
            </TouchableOpacity>
          )}

          {incomeType === 'mixed' && (
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.getParent()?.navigate('IncomeStreams')}
            >
              <Feather name="layers" size={20} color={CALM.accent} />
              <Text style={styles.quickActionText}>Streams</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.getParent()?.navigate('MoneyChat')}
          >
            <Feather name="message-circle" size={20} color={CALM.accent} />
            <Text style={styles.quickActionText}>Money Chat</Text>
          </TouchableOpacity>
        </View>

        {/* Transfer line */}
        {transferredThisMonth > 0 && (
          <Text style={styles.transferLine}>
            {currency} {transferredThisMonth.toFixed(2)} moved to personal this month
          </Text>
        )}

        {/* Change setup link */}
        <TouchableOpacity
          onPress={() => navigation.getParent()?.navigate('BusinessSetup')}
          style={styles.changeSetup}
        >
          <Text style={styles.changeSetupText}>not the right setup? change it.</Text>
        </TouchableOpacity>
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

  // Zone 1
  netLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  netAmount: {
    ...TYPE.amount,
    color: CALM.textPrimary,
    marginBottom: SPACING.lg,
  },

  // Zone 2
  weekBarSection: {
    marginBottom: SPACING.lg,
  },

  // Zone 3
  insightText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.xl,
  },

  // Zone 4 variants
  variantSection: {
    marginBottom: SPACING.xl,
  },
  sideBySide: {
    flexDirection: 'row',
    gap: SPACING.xl,
    marginBottom: SPACING.md,
  },
  sideItem: {
    flex: 1,
  },
  sideLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  sideValue: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  keptLine: {
    ...TYPE.insight,
    color: CALM.textSecondary,
  },
  riderKept: {
    fontSize: 20,
    fontWeight: '300' as const,
    color: CALM.textPrimary,
    marginTop: SPACING.sm,
  },
  insightLine: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  labelLine: {
    ...TYPE.label,
    marginTop: SPACING.sm,
  },

  // Mixed streams
  streamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  streamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  streamLabel: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    flex: 1,
  },
  streamAmount: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  streamTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },
  streamTotalLabel: {
    ...TYPE.label,
  },
  streamTotalAmount: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  quickActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },

  // Transfer
  transferLine: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
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
});

export default BusinessDashboard;
