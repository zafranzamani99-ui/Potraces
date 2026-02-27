import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { explainSellerMonth } from '../../utils/explainSellerMonth';
import ModeToggle from '../../components/common/ModeToggle';

const SellerDashboard: React.FC = () => {
  const { orders, products, ingredientCosts, seasons } = useSellerStore();
  const { businessSetupComplete, incomeType } = useBusinessStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevStart = startOfMonth(subMonths(now, 1));
  const prevEnd = endOfMonth(subMonths(now, 1));

  const inRange = (d: Date, start: Date, end: Date) =>
    isWithinInterval(d instanceof Date ? d : new Date(d), { start, end });

  const activeSeason = seasons.find((s) => s.isActive);

  // Current month orders
  const currentOrders = useMemo(
    () => orders.filter((o) => inRange(o.date, monthStart, monthEnd)),
    [orders]
  );
  const previousOrders = useMemo(
    () => orders.filter((o) => inRange(o.date, prevStart, prevEnd)),
    [orders]
  );
  const currentCosts = useMemo(
    () => ingredientCosts.filter((c) => inRange(c.date, monthStart, monthEnd)),
    [ingredientCosts]
  );

  const totalIncome = currentOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
  const totalCosts = currentCosts.reduce((s, c) => s + c.amount, 0);
  const kept = totalIncome - totalCosts;
  const unpaidOrders = currentOrders.filter((o) => !o.isPaid);
  const pendingOrders = currentOrders.filter((o) => o.status === 'pending' || o.status === 'confirmed');

  // AI insight
  const insight = useMemo(
    () => explainSellerMonth(currentOrders, previousOrders, currentCosts),
    [currentOrders, previousOrders, currentCosts]
  );

  // Redirect to setup if not complete
  if (!businessSetupComplete || incomeType !== 'seller') {
    React.useEffect(() => {
      navigation.getParent()?.navigate('BusinessSetup');
    }, []);
    return (
      <View style={styles.container}>
        <ModeToggle />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Season badge */}
        {activeSeason && (
          <View style={styles.seasonBadge}>
            <Feather name="calendar" size={14} color={CALM.accent} />
            <Text style={styles.seasonBadgeText}>{activeSeason.name}</Text>
          </View>
        )}

        {/* Zone 1 — Kept amount */}
        <Text style={styles.netLabel}>KEPT THIS MONTH</Text>
        <Text style={styles.netAmount}>
          {currency} {kept.toFixed(2)}
        </Text>

        {/* Zone 2 — Order pipeline */}
        <View style={styles.pipelineSection}>
          <View style={styles.pipelineRow}>
            <View style={styles.pipelineStat}>
              <Text style={styles.pipelineNumber}>{currentOrders.length}</Text>
              <Text style={styles.pipelineLabel}>orders</Text>
            </View>
            <View style={styles.pipelineStat}>
              <Text style={styles.pipelineNumber}>{pendingOrders.length}</Text>
              <Text style={styles.pipelineLabel}>to make</Text>
            </View>
            <View style={styles.pipelineStat}>
              <Text style={[styles.pipelineNumber, unpaidOrders.length > 0 && styles.highlightText]}>
                {unpaidOrders.length}
              </Text>
              <Text style={styles.pipelineLabel}>unpaid</Text>
            </View>
          </View>
        </View>

        {/* Zone 3 — AI insight */}
        {insight && <Text style={styles.insightText}>{insight}</Text>}

        {/* Zone 4 — Came in / costs */}
        <View style={styles.sideBySide}>
          <View style={styles.sideItem}>
            <Text style={styles.sideLabel}>came in</Text>
            <Text style={styles.sideValue}>{currency} {totalIncome.toFixed(2)}</Text>
          </View>
          <View style={styles.sideItem}>
            <Text style={styles.sideLabel}>ingredients</Text>
            <Text style={styles.sideValue}>{currency} {totalCosts.toFixed(2)}</Text>
          </View>
        </View>

        {/* Unpaid warning */}
        {unpaidOrders.length > 0 && (
          <TouchableOpacity
            style={styles.unpaidCard}
            onPress={() => navigation.navigate('SellerOrders')}
          >
            <Text style={styles.unpaidText}>
              {unpaidOrders.length} unpaid order{unpaidOrders.length !== 1 ? 's' : ''} &middot;{' '}
              {currency} {unpaidOrders.reduce((s, o) => s + o.totalAmount, 0).toFixed(2)} pending
            </Text>
            <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Top products this month */}
        {currentOrders.length > 0 && (
          <View style={styles.topProductsSection}>
            <Text style={styles.sectionTitle}>popular this month</Text>
            {getTopProducts(currentOrders).map((p) => (
              <View key={p.name} style={styles.topProductRow}>
                <Text style={styles.topProductName}>{p.name}</Text>
                <Text style={styles.topProductQty}>{p.qty} {p.unit}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Change setup */}
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

function getTopProducts(orders: { items: { productName: string; quantity: number; unit: string }[] }[]) {
  const counts: Record<string, { name: string; qty: number; unit: string }> = {};
  for (const order of orders) {
    for (const item of order.items) {
      if (!counts[item.productName]) {
        counts[item.productName] = { name: item.productName, qty: 0, unit: item.unit };
      }
      counts[item.productName].qty += item.quantity;
    }
  }
  return Object.values(counts)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 3);
}

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
  seasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: CALM.highlight,
    alignSelf: 'flex-start',
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  seasonBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.accent,
  },
  netLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  netAmount: {
    ...TYPE.amount,
    color: CALM.textPrimary,
    marginBottom: SPACING.lg,
  },
  pipelineSection: {
    marginBottom: SPACING.xl,
  },
  pipelineRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  pipelineStat: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  pipelineNumber: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  pipelineLabel: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },
  highlightText: {
    color: CALM.accent,
  },
  insightText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.xl,
  },
  sideBySide: {
    flexDirection: 'row',
    gap: SPACING.xl,
    marginBottom: SPACING.lg,
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
  unpaidCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CALM.highlight,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  unpaidText: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    flex: 1,
  },
  topProductsSection: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    ...TYPE.label,
    marginBottom: SPACING.md,
  },
  topProductRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  topProductName: {
    ...TYPE.insight,
    color: CALM.textPrimary,
  },
  topProductQty: {
    ...TYPE.muted,
  },
  changeSetup: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  changeSetupText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
});

export default SellerDashboard;
