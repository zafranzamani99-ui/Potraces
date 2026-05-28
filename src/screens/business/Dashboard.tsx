import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, InteractionManager, RefreshControl } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import type { BusinessTransaction, RiderCost } from '../../types';
import { explainBusinessMonth } from '../../utils/explainBusinessMonth';
import WeekBar from '../../components/common/WeekBar';
import ModeToggle from '../../components/common/ModeToggle';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import BusinessHeroNumber from '../../components/business/BusinessHeroNumber';

const BusinessDashboard: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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
  const insets = useSafeAreaInsets();

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
        return t.businessDashboard.keptThisMonth;
      case 'freelance':
      case 'parttime':
        return t.businessDashboard.earnedThisMonth;
      case 'mixed':
        return t.businessDashboard.totalIn;
      default:
        return t.businessDashboard.thisMonth;
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

  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  if (!ready) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + SPACING.md }]}>
        <SkeletonLoader />
        <SkeletonLoader style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  // AuthGatedBusiness handles the setup redirect — this is just a safety guard
  if (!businessSetupComplete || !incomeType) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + SPACING.md }]}>
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
                <Text style={styles.sideLabel}>{t.businessDashboard.cameIn}</Text>
                <Text style={styles.sideValue}>{currency} {totalIncome.toFixed(2)}</Text>
              </View>
              <View style={styles.sideItem}>
                <Text style={styles.sideLabel}>{t.businessDashboard.costs}</Text>
                <Text style={styles.sideValue}>{currency} {totalCosts.toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.keptLine}>{t.businessDashboard.keptLine.replace('{currency}', currency).replace('{amount}', net.toFixed(2))}</Text>
          </View>
        );

      case 'freelance': {
        const activeClients = clients.filter((c) => c.totalPaid > 0);
        const lastPayment = activeClients
          .flatMap((c) => c.paymentHistory.map((p) => ({ ...p, clientName: c.name })))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        const clientLabel = activeClients.length !== 1
          ? t.businessDashboard.nClientsPlural.replace('{n}', String(activeClients.length))
          : t.businessDashboard.nClients.replace('{n}', String(activeClients.length));
        return (
          <View style={styles.variantSection}>
            <Text style={styles.insightLine}>
              {clientLabel} &middot;{' '}
              {t.businessDashboard.avgMonthly.replace('{currency}', currency).replace('{amount}', monthlyAverage.toFixed(0))}
            </Text>
            {lastPayment && (
              <Text style={styles.labelLine}>
                {t.businessDashboard.lastPayment.replace('{name}', lastPayment.clientName)} &middot; {currency} {lastPayment.amount.toFixed(2)}
              </Text>
            )}
          </View>
        );
      }

      case 'parttime': {
        const mainInc = currentIncome
          .filter((tx) => !tx.streamId || tx.streamId === 'main')
          .reduce((s, tx) => s + tx.amount, 0);
        const sideInc = currentIncome
          .filter((tx) => tx.streamId && tx.streamId !== 'main')
          .reduce((s, tx) => s + tx.amount, 0);
        const sidePct = totalIncome > 0 ? ((sideInc / totalIncome) * 100).toFixed(0) : '0';
        return (
          <View style={styles.variantSection}>
            <Text style={styles.insightLine}>{t.businessDashboard.mainJob} {currency} {mainInc.toFixed(2)}</Text>
            <Text style={styles.insightLine}>{t.businessDashboard.sideIncome} {currency} {sideInc.toFixed(2)}</Text>
            {sideInc > 0 && (
              <Text style={styles.labelLine}>
                {t.businessDashboard.sidePct.replace('{pct}', sidePct)}
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
                <Text style={styles.sideLabel}>{t.businessDashboard.grossed}</Text>
                <Text style={styles.sideValue}>{currency} {totalIncome.toFixed(2)}</Text>
              </View>
              <View style={styles.sideItem}>
                <Text style={styles.sideLabel}>{t.businessDashboard.costs}</Text>
                <Text style={styles.sideValue}>{currency} {totalCosts.toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.riderKept}>
              {t.businessDashboard.riderKeptLine.replace('{currency}', currency).replace('{amount}', net.toFixed(2))}
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
              <Text style={styles.streamTotalLabel}>{t.businessDashboard.total}</Text>
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 600);
            }}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        <ModeToggle />
        {/* Zone 1 — Net (canonical hero) */}
        <BusinessHeroNumber
          amount={incomeType === 'rider' ? net : totalIncome}
          label={netLabel.toLowerCase()}
          prefix={currency}
        />

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
            <Feather name="plus" size={20} color={C.bronze} />
            <Text style={styles.quickActionText}>{t.businessDashboard.logIncome}</Text>
          </TouchableOpacity>

          {incomeType === 'freelance' && (
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.getParent()?.navigate('ClientList')}
            >
              <Feather name="users" size={20} color={C.bronze} />
              <Text style={styles.quickActionText}>{t.businessDashboard.clients}</Text>
            </TouchableOpacity>
          )}

          {incomeType === 'rider' && (
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.getParent()?.navigate('RiderCosts')}
            >
              <Feather name="tool" size={20} color={C.bronze} />
              <Text style={styles.quickActionText}>{t.businessDashboard.costsAction}</Text>
            </TouchableOpacity>
          )}

          {incomeType === 'mixed' && (
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.getParent()?.navigate('IncomeStreams')}
            >
              <Feather name="layers" size={20} color={C.bronze} />
              <Text style={styles.quickActionText}>{t.businessDashboard.streams}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.getParent()?.navigate('MoneyChat')}
          >
            <Feather name="message-circle" size={20} color={C.bronze} />
            <Text style={styles.quickActionText}>{t.businessDashboard.echo}</Text>
          </TouchableOpacity>
        </View>

        {/* Transfer line */}
        {transferredThisMonth > 0 && (
          <Text style={styles.transferLine}>
            {t.businessDashboard.transferLine.replace('{currency}', currency).replace('{amount}', transferredThisMonth.toFixed(2))}
          </Text>
        )}

        {/* Change setup link */}
        <TouchableOpacity
          onPress={() => useBusinessStore.getState().resetSetup()}
          style={styles.changeSetup}
        >
          <Text style={styles.changeSetupText}>{t.businessDashboard.changeSetup}</Text>
        </TouchableOpacity>
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },

  // Zone 1
  netLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  netAmount: {
    ...TYPE.amount,
    color: C.textPrimary,
    marginBottom: SPACING.lg,
  },

  // Zone 2
  weekBarSection: {
    marginBottom: SPACING.lg,
  },

  // Zone 3
  insightText: {
    ...TYPE.insight,
    color: C.textSecondary,
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
    color: C.textPrimary,
  },
  keptLine: {
    ...TYPE.insight,
    color: C.textSecondary,
  },
  riderKept: {
    fontSize: 20,
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginTop: SPACING.sm,
  },
  insightLine: {
    ...TYPE.insight,
    color: C.textPrimary,
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
    color: C.textPrimary,
    flex: 1,
  },
  streamAmount: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  streamTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },
  streamTotalLabel: {
    ...TYPE.label,
  },
  streamTotalAmount: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  quickActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },

  // Transfer
  transferLine: {
    ...TYPE.muted,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },

  // Change setup
  changeSetup: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  changeSetupText: {
    ...TYPE.muted,
    color: C.textSecondary,
  },
});

export default BusinessDashboard;
