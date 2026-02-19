import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { format, isToday } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useBusinessStore } from '../../store/businessStore';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, withAlpha } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import StatCard from '../../components/common/StatCard';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import Confetti from '../../components/common/Confetti';
import HeroCard from '../../components/common/HeroCard';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import GlassCard from '../../components/common/GlassCard';
import GRADIENTS from '../../constants/gradients';

const QUICK_ACTIONS = [
  { key: 'crm', label: 'Customers', icon: 'user-check' as const, screen: 'CRM', color: COLORS.info },
  { key: 'debts', label: 'Debts & Splits', icon: 'users' as const, screen: 'DebtTracking', color: COLORS.warning },
  { key: 'scan', label: 'Scan Receipt', icon: 'camera' as const, screen: 'ReceiptScanner', color: COLORS.accent },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-2' as const, screen: 'BusinessReports', color: COLORS.primary },
];

const BusinessDashboard: React.FC = () => {
  const { sales, products } = useBusinessStore();
  const { debts } = useDebtStore();
  const currency = useSettingsStore(state => state.currency);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [celebrate, setCelebrate] = React.useState(false);
  const prevCountRef = useRef(0);
  const navigation = useNavigation<any>();

  // Animated count-up scale/opacity for today's total
  const countUpAnim = useRef(new Animated.Value(0)).current;

  const todayStats = useMemo(() => {
    const todaySales = sales.filter((s) => isToday(s.date));

    const totalSales = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const cashSales = todaySales
      .filter((s) => s.paymentMethod === 'cash')
      .reduce((sum, s) => sum + s.totalAmount, 0);
    const digitalSales = todaySales
      .filter((s) => s.paymentMethod === 'digital')
      .reduce((sum, s) => sum + s.totalAmount, 0);
    const cardSales = todaySales
      .filter((s) => s.paymentMethod === 'card')
      .reduce((sum, s) => sum + s.totalAmount, 0);

    return {
      count: todaySales.length,
      total: totalSales,
      cash: cashSales,
      digital: digitalSales,
      card: cardSales,
    };
  }, [sales]);

  // Celebrate first sale of the day
  useEffect(() => {
    if (prevCountRef.current === 0 && todayStats.count > 0) {
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 100);
    }
    prevCountRef.current = todayStats.count;
  }, [todayStats.count]);

  // Trigger count-up animation when todayStats.total changes
  useEffect(() => {
    countUpAnim.setValue(0);
    Animated.timing(countUpAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [todayStats.total, countUpAnim]);

  const inventoryStats = useMemo(() => {
    const lowStock = products.filter(
      (p) => p.stock <= p.lowStockThreshold && p.stock > 0
    );
    const outOfStock = products.filter((p) => p.stock === 0);

    return {
      lowStock: lowStock.length,
      outOfStock: outOfStock.length,
      totalProducts: products.length,
    };
  }, [products]);

  const debtStats = useMemo(() => {
    const businessDebts = debts.filter((d) => d.mode === 'business');
    const youOwe = businessDebts
      .filter((d) => d.type === 'i_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);
    const owedToYou = businessDebts
      .filter((d) => d.type === 'they_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);
    return { youOwe, owedToYou };
  }, [debts]);

  const recentSales = useMemo(() => {
    return sales.slice(0, 5);
  }, [sales]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setLoading(true);
    setTimeout(() => {
      setRefreshing(false);
      setLoading(false);
    }, 1000);
  }, []);

  const handleQuickAction = (screen: string) => {
    if (screen === 'BusinessReports' || screen === 'SupplierList' || screen === 'DebtTracking' || screen === 'ReceiptScanner') {
      navigation.getParent()?.navigate(screen);
    } else {
      navigation.navigate(screen);
    }
  };

  // Animated interpolations for the count-up hero
  const amountScale = countUpAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.85, 1.05, 1],
  });
  const amountOpacity = countUpAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={styles.container}>
      <ModeToggle />

      <Confetti active={celebrate} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Today's Sales Hero Card */}
        {loading ? (
          <SkeletonLoader
            shape="box"
            width="100%"
            height={200}
            style={{ marginBottom: SPACING.md }}
          />
        ) : (
          <HeroCard
            gradient={GRADIENTS.businessHero}
            title="Today's Sales"
            amount={todayStats.total}
            currency={currency}
            subtitle={`${todayStats.count} ${todayStats.count === 1 ? 'transaction' : 'transactions'}`}
            breakdown={[
              { label: 'Cash', value: todayStats.cash, icon: 'dollar-sign' },
              { label: 'Digital', value: todayStats.digital, icon: 'smartphone' },
              { label: 'Card', value: todayStats.card, icon: 'credit-card' },
            ]}
            style={{ marginBottom: SPACING.md }}
          />
        )}

        {/* Debt Summary */}
        {loading ? (
          <View style={styles.statsGrid}>
            <SkeletonLoader shape="box" width="47%" height={100} />
            <SkeletonLoader shape="box" width="47%" height={100} />
          </View>
        ) : (
          (debtStats.youOwe > 0 || debtStats.owedToYou > 0) && (
            <View style={styles.statsGrid}>
              <StatCard
                title="You Owe"
                value={`${currency} ${debtStats.youOwe.toFixed(2)}`}
                icon="arrow-up-circle"
                iconColor={COLORS.danger}
                subtitle="Outstanding"
              />
              <StatCard
                title="Owed to You"
                value={`${currency} ${debtStats.owedToYou.toFixed(2)}`}
                icon="arrow-down-circle"
                iconColor={COLORS.success}
                subtitle="Outstanding"
              />
            </View>
          )
        )}

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.quickActionsTitle}>Quick Actions</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.getParent()?.navigate('BusinessReports')}
            >
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.quickActionsRow}>
              {[...Array(4)].map((_, i) => (
                <SkeletonLoader key={i} shape="box" width={78} height={80} />
              ))}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickActionsRow}
            >
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={styles.quickActionButton}
                  onPress={() => handleQuickAction(action.screen)}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={[withAlpha(action.color, 0.15), withAlpha(action.color, 0.05)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.quickActionIconGradient}
                  >
                    <Feather name={action.icon} size={18} color={action.color} />
                  </LinearGradient>
                  <Text style={styles.quickActionLabel} numberOfLines={2}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Inventory Alerts */}
        {!loading && (inventoryStats.lowStock > 0 || inventoryStats.outOfStock > 0) && (
          <GlassCard variant="tinted" style={styles.alertCard}>
            <LinearGradient
              colors={[COLORS.warning, withAlpha(COLORS.warning, 0.7)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.alertBorderGradient}
            />
            <View style={styles.alertHeader}>
              <Feather name="alert-triangle" size={20} color={COLORS.warning} />
              <Text style={styles.alertTitle}>Inventory Alerts</Text>
            </View>
            {inventoryStats.lowStock > 0 && (
              <Text style={styles.alertText}>
                {inventoryStats.lowStock}{' '}
                {inventoryStats.lowStock === 1 ? 'item is' : 'items are'} running low on stock
              </Text>
            )}
            {inventoryStats.outOfStock > 0 && (
              <Animated.Text style={[styles.alertText, styles.alertTextDanger]}>
                {inventoryStats.outOfStock}{' '}
                {inventoryStats.outOfStock === 1 ? 'item is' : 'items are'} out of stock
              </Animated.Text>
            )}
          </GlassCard>
        )}

        {/* Recent Sales */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Sales</Text>
            {sales.length > 0 && !loading && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.getParent()?.navigate('BusinessReports')}
              >
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <>
              <SkeletonLoader shape="line" height={90} style={{ marginBottom: SPACING.sm }} />
              <SkeletonLoader shape="line" height={90} style={{ marginBottom: SPACING.sm }} />
              <SkeletonLoader shape="line" height={90} />
            </>
          ) : recentSales.length > 0 ? (
            recentSales.map((sale) => (
              <Card key={sale.id} style={styles.saleCard}>
                <LinearGradient
                  colors={[
                    withAlpha(COLORS.business, 0.05),
                    withAlpha(COLORS.business, 0.02),
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saleGradientOverlay}
                />
                <View style={styles.saleHeader}>
                  <View style={styles.saleInfo}>
                    <Text style={styles.saleId}>
                      Sale #{sale.id.substring(0, 8)}
                    </Text>
                    <Text style={styles.saleDate}>
                      {format(sale.date, 'MMM dd, yyyy • HH:mm')}
                    </Text>
                  </View>
                  <Text style={styles.saleAmount}>
                    {currency} {sale.totalAmount.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.saleDetails}>
                  <LinearGradient
                    colors={
                      sale.paymentMethod === 'cash'
                        ? [withAlpha(COLORS.income, 0.2), withAlpha(COLORS.income, 0.1)]
                        : sale.paymentMethod === 'digital'
                        ? [withAlpha(COLORS.info, 0.2), withAlpha(COLORS.info, 0.1)]
                        : [withAlpha(COLORS.accent, 0.2), withAlpha(COLORS.accent, 0.1)]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.paymentChip}
                  >
                    <Feather
                      name={
                        sale.paymentMethod === 'cash'
                          ? 'dollar-sign'
                          : sale.paymentMethod === 'digital'
                          ? 'smartphone'
                          : 'credit-card'
                      }
                      size={14}
                      color={
                        sale.paymentMethod === 'cash'
                          ? COLORS.income
                          : sale.paymentMethod === 'digital'
                          ? COLORS.info
                          : COLORS.accent
                      }
                    />
                    <Text
                      style={[
                        styles.saleDetailText,
                        {
                          color:
                            sale.paymentMethod === 'cash'
                              ? COLORS.income
                              : sale.paymentMethod === 'digital'
                              ? COLORS.info
                              : COLORS.accent,
                        },
                      ]}
                    >
                      {sale.paymentMethod.charAt(0).toUpperCase() +
                        sale.paymentMethod.slice(1)}
                    </Text>
                  </LinearGradient>
                  <View style={styles.saleDetail}>
                    <Feather name="package" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.saleDetailText}>
                      {sale.items.length} {sale.items.length === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                  {!sale.isSynced && (
                    <View style={styles.notSyncedPill}>
                      <Feather name="wifi-off" size={12} color={COLORS.warning} />
                      <Text style={styles.notSyncedText}>Not synced</Text>
                    </View>
                  )}
                </View>
              </Card>
            ))
          ) : (
            <EmptyState
              icon="shopping-cart"
              title="No Sales Yet"
              message="Start making sales with the POS to see them here"
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },

  // ── Stats Grid ─────────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  // ── Quick Actions ─────────────────────────────────────────
  quickActionsSection: {
    marginBottom: SPACING.md,
  },
  quickActionsTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  quickActionButton: {
    width: 80,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  quickActionIconGradient: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 13,
  },

  // ── Inventory Alerts ───────────────────────────────────────
  alertCard: {
    marginBottom: SPACING.md,
    position: 'relative',
    overflow: 'hidden',
  },
  alertBorderGradient: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  alertTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  alertText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  alertTextDanger: {
    color: COLORS.danger,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── Section / Recent Sales ─────────────────────────────────
  section: {
    marginTop: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
  },
  seeAll: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.business,
  },

  // ── Sale Card ──────────────────────────────────────────────
  saleCard: {
    marginBottom: SPACING.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  saleGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  saleInfo: {
    flex: 1,
  },
  saleId: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  saleDate: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: COLORS.textSecondary,
  },
  saleAmount: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.business,
    fontVariant: ['tabular-nums'],
  },
  saleDetails: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  saleDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  saleDetailText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  paymentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },

  // ── Not-Synced Pill ────────────────────────────────────────
  notSyncedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(COLORS.warning, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  notSyncedText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.warning,
  },
});

export default BusinessDashboard;
