import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, subMonths, subDays, isWithinInterval, isToday, isTomorrow, isPast, startOfDay, differenceInDays, format, isSameDay } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { explainSellerMonth } from '../../utils/explainSellerMonth';
import { lightTap, mediumTap } from '../../services/haptics';
import ModeToggle from '../../components/common/ModeToggle';

// ─── Animation helper ────────────────────────────────────────
function useFadeSlide(delay: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, []);

  return { opacity, transform: [{ translateY }] };
}

// ─── Top products aggregator ─────────────────────────────────
function getTopProducts(
  orders: { items: { productName: string; quantity: number; unit: string; unitPrice: number }[] }[]
) {
  const counts: Record<string, { name: string; qty: number; unit: string; revenue: number }> = {};
  for (const order of orders) {
    for (const item of order.items) {
      if (!counts[item.productName]) {
        counts[item.productName] = { name: item.productName, qty: 0, unit: item.unit, revenue: 0 };
      }
      counts[item.productName].qty += item.quantity;
      counts[item.productName].revenue += item.quantity * item.unitPrice;
    }
  }
  return Object.values(counts)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);
}

// ─── Component ───────────────────────────────────────────────
const SellerDashboard: React.FC = () => {
  const { orders, products, ingredientCosts, seasons, sellerCustomers } = useSellerStore();
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

  // Breathing animation for active season dot
  const seasonBreathAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!activeSeason) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(seasonBreathAnim, {
          toValue: 0.3,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(seasonBreathAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [!!activeSeason]);

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

  const totalIncome = currentOrders
    .filter((o) => o.isPaid)
    .reduce((s, o) => s + o.totalAmount, 0);
  const totalCosts = currentCosts.reduce((s, c) => s + c.amount, 0);
  const kept = totalIncome - totalCosts;
  const unpaidOrders = currentOrders.filter((o) => !o.isPaid);
  const pendingOrders = currentOrders.filter(
    (o) => o.status === 'pending' || o.status === 'confirmed'
  );

  // Production list — aggregated items across pending/confirmed orders
  const productionList = useMemo(() => {
    const counts: Record<string, { name: string; qty: number; unit: string }> = {};
    for (const order of pendingOrders) {
      for (const item of order.items) {
        const key = item.productName;
        if (!counts[key]) {
          counts[key] = { name: item.productName, qty: 0, unit: item.unit };
        }
        counts[key].qty += item.quantity;
      }
    }
    return Object.values(counts).sort((a, b) => b.qty - a.qty);
  }, [pendingOrders]);

  // ── Urgency data ──────────────────────────────────────────
  const today = startOfDay(now);

  const deliverToday = useMemo(
    () => orders.filter((o) => {
      if (!o.deliveryDate) return false;
      const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate);
      return isToday(d) && o.status !== 'delivered' && o.status !== 'paid';
    }),
    [orders]
  );

  const deliverTomorrow = useMemo(
    () => orders.filter((o) => {
      if (!o.deliveryDate) return false;
      const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate);
      return isTomorrow(d) && o.status !== 'delivered' && o.status !== 'paid';
    }),
    [orders]
  );

  const overdueOrders = useMemo(
    () => orders.filter((o) => {
      if (!o.deliveryDate) return false;
      const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate);
      return isPast(startOfDay(d)) && !isToday(d) && o.status !== 'delivered' && o.status !== 'paid';
    }),
    [orders]
  );

  // Unpaid aging — group by days since order date
  const unpaidAging = useMemo(() => {
    const allUnpaid = orders.filter((o) => !o.isPaid);
    if (allUnpaid.length === 0) return null;
    const week: typeof allUnpaid = [];
    const twoWeeks: typeof allUnpaid = [];
    const older: typeof allUnpaid = [];
    for (const o of allUnpaid) {
      const d = o.date instanceof Date ? o.date : new Date(o.date);
      const days = differenceInDays(today, startOfDay(d));
      if (days <= 7) week.push(o);
      else if (days <= 14) twoWeeks.push(o);
      else older.push(o);
    }
    return { week, twoWeeks, older, total: allUnpaid.length };
  }, [orders]);

  const hasUrgency = deliverToday.length > 0 || overdueOrders.length > 0 || deliverTomorrow.length > 0;

  // ── Today's earnings ──────────────────────────────────────
  const todaysOrders = useMemo(
    () => orders.filter((o) => {
      const d = o.date instanceof Date ? o.date : new Date(o.date);
      return isToday(d);
    }),
    [orders]
  );
  const todaysEarnings = todaysOrders.reduce((s, o) => s + o.totalAmount, 0);

  // ── Today's deliveries with addresses ─────────────────────
  const todaysDeliveries = useMemo(() => {
    return deliverToday.map((o) => {
      // Try to find address from sellerCustomers
      const customer = sellerCustomers.find(
        (c) => c.name.toLowerCase() === (o.customerName || '').toLowerCase()
      );
      return {
        id: o.id,
        customerName: o.customerName || 'Unknown',
        customerPhone: o.customerPhone,
        address: customer?.address,
        items: o.items,
        totalAmount: o.totalAmount,
        status: o.status,
      };
    });
  }, [deliverToday, sellerCustomers]);

  // ── Production checklist state ────────────────────────────
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const toggleChecked = useCallback((itemName: string) => {
    mediumTap();
    setCheckedItems((prev) => ({ ...prev, [itemName]: !prev[itemName] }));
  }, []);
  const checkedCount = productionList.filter((item) => checkedItems[item.name]).length;

  // ── Previous month costs ────────────────────────────────
  const previousCosts = useMemo(
    () => ingredientCosts.filter((c) => inRange(c.date, prevStart, prevEnd)),
    [ingredientCosts]
  );
  const prevIncome = previousOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
  const prevTotalCosts = previousCosts.reduce((s, c) => s + c.amount, 0);
  const prevKept = prevIncome - prevTotalCosts;

  // ── Month-over-month delta ──────────────────────────────
  const momDelta = useMemo(() => {
    if (previousOrders.length === 0) return null;
    if (prevKept === 0) return kept > 0 ? 100 : kept < 0 ? -100 : 0;
    return ((kept - prevKept) / Math.abs(prevKept)) * 100;
  }, [kept, prevKept, previousOrders.length]);

  // ── Profit margin ───────────────────────────────────────
  const profitMargin = totalIncome > 0 ? (kept / totalIncome) * 100 : null;

  // ── Collection rate ─────────────────────────────────────
  const totalOrderValue = currentOrders.reduce((s, o) => s + o.totalAmount, 0);
  const collectionRate = totalOrderValue > 0 ? (totalIncome / totalOrderValue) * 100 : 0;

  // ── 7-day activity sparkline ────────────────────────────
  const weeklyActivity = useMemo(() => {
    const days: { date: Date; count: number; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(subDays(now, i));
      const count = orders.filter((o) => {
        const od = o.date instanceof Date ? o.date : new Date(o.date);
        return isSameDay(od, d);
      }).length;
      days.push({ date: d, count, label: format(d, 'EEE').slice(0, 3) });
    }
    return days;
  }, [orders]);
  const sparklineMax = Math.max(...weeklyActivity.map((d) => d.count), 1);

  // ── Top customer this month ─────────────────────────────
  const topCustomer = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number }> = {};
    for (const o of currentOrders) {
      const name = (o.customerName || '').trim();
      if (!name) continue;
      if (!map[name]) map[name] = { name, count: 0, total: 0 };
      map[name].count += 1;
      map[name].total += o.totalAmount;
    }
    const sorted = Object.values(map).sort((a, b) => b.total - a.total);
    return sorted.length > 0 && currentOrders.length >= 3 ? sorted[0] : null;
  }, [currentOrders]);

  // AI insight
  const insight = useMemo(
    () => explainSellerMonth(currentOrders, previousOrders, currentCosts),
    [currentOrders, previousOrders, currentCosts]
  );

  // Top products for the month
  const topProducts = useMemo(
    () => (currentOrders.length > 0 ? getTopProducts(currentOrders) : []),
    [currentOrders]
  );

  // First-time user detection
  const isFirstTime = products.length === 0 && orders.length === 0;

  // Getting started step completion
  const hasProducts = products.length > 0;
  const hasOrders = orders.length > 0;
  const hasSeasons = seasons.length > 0;

  // Staggered fade-in animations
  const seasonAnim = useFadeSlide(0);
  const urgencyAnim = useFadeSlide(20);
  const quickActionsAnim = useFadeSlide(50);
  const heroAnim = useFadeSlide(80);
  const insightAnim = useFadeSlide(120);
  const pipelineAnim = useFadeSlide(160);
  const revenueAnim = useFadeSlide(200);
  const topProductsAnim = useFadeSlide(240);
  const productionAnim = useFadeSlide(180);
  const earningsAnim = useFadeSlide(30);
  const sparklineAnim = useFadeSlide(40);
  const deliveryRouteAnim = useFadeSlide(200);
  const topCustomerAnim = useFadeSlide(220);
  const emptyStateAnim = useFadeSlide(80);
  const gettingStartedAnim = useFadeSlide(80);

  // ── Maps app picker (delivery route) ─────────────────────
  const handleOpenMaps = useCallback((address: string) => {
    lightTap();
    const encoded = encodeURIComponent(address);
    if (Platform.OS === 'android') {
      Linking.openURL('geo:0,0?q=' + encoded);
    } else {
      Alert.alert('', 'open address in', [
        { text: 'cancel', style: 'cancel' },
        { text: 'Apple Maps', onPress: () => Linking.openURL('maps:?q=' + encoded) },
        {
          text: 'Google Maps',
          onPress: () => {
            Linking.canOpenURL('comgooglemaps://').then((supported) => {
              if (supported) {
                Linking.openURL('comgooglemaps://?q=' + encoded);
              } else {
                Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encoded);
              }
            });
          },
        },
        {
          text: 'Waze',
          onPress: () => {
            Linking.canOpenURL('waze://').then((supported) => {
              if (supported) {
                Linking.openURL('waze://?q=' + encoded + '&navigate=yes');
              } else {
                Linking.openURL('https://waze.com/ul?q=' + encoded);
              }
            });
          },
        },
      ]);
    }
  }, []);

  // ── WhatsApp handler (delivery route) ───────────────────
  const handleWhatsApp = useCallback((phone: string) => {
    lightTap();
    let digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) digits = '60' + digits.slice(1);
    Linking.openURL('https://wa.me/' + digits);
  }, []);

  // Redirect to setup if not complete
  const needsSetup = !businessSetupComplete || incomeType !== 'seller';
  useEffect(() => {
    if (needsSetup) {
      navigation.getParent()?.navigate('BusinessSetup');
    }
  }, [needsSetup]);

  if (needsSetup) {
    return (
      <View style={styles.container}>
        <ModeToggle />
      </View>
    );
  }

  const unpaidTotal = unpaidOrders.reduce((s, o) => s + o.totalAmount, 0);
  const maxQty = topProducts.length > 0 ? topProducts[0].qty : 1;

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Season context ─────────────────────────────── */}
        <Animated.View style={seasonAnim}>
          {activeSeason ? (
            <View style={styles.seasonRow}>
              <TouchableOpacity
                style={styles.seasonPill}
                activeOpacity={0.7}
                onPress={() => {
                  lightTap();
                  navigation.getParent()?.navigate('SeasonSummary', { seasonId: activeSeason.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Active season: ${activeSeason.name}. Tap to view summary.`}
              >
                <Animated.View style={{ opacity: seasonBreathAnim }}>
                  <Feather name="calendar" size={14} color={CALM.bronze} />
                </Animated.View>
                <Text style={styles.seasonPillText}>{activeSeason.name}</Text>
                <Feather name="chevron-right" size={14} color={CALM.bronze} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { lightTap(); navigation.getParent()?.navigate('PastSeasons'); }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="View all seasons"
              >
                <Text style={styles.viewAllSeasonsText}>view all seasons</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.seasonPill}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('PastSeasons'); }}
              accessibilityRole="button"
              accessibilityLabel="No active season. Tap to manage seasons."
            >
              <Feather name="calendar" size={14} color={CALM.textMuted} />
              <Text style={[styles.seasonPillText, { color: CALM.textMuted }]}>no active season</Text>
              <Feather name="chevron-right" size={14} color={CALM.textMuted} />
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── TODAY urgency section ──────────────────────── */}
        {hasUrgency && !isFirstTime && (
          <Animated.View style={[styles.urgencyCard, urgencyAnim]}>
            {/* Overdue orders */}
            {overdueOrders.length > 0 && (
              <TouchableOpacity
                style={[styles.urgencyRow, { backgroundColor: withAlpha(CALM.bronze, 0.06), borderRadius: RADIUS.sm, marginHorizontal: -SPACING.sm, paddingHorizontal: SPACING.sm }]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('SellerOrders')}
                accessibilityRole="button"
                accessibilityLabel={`${overdueOrders.length} overdue orders. Tap to view.`}
              >
                <View style={styles.urgencyRowLeft}>
                  <View style={[styles.urgencyDot, styles.urgencyDotOverdue]} />
                  <Text style={styles.urgencyTextOverdue}>
                    {overdueOrders.length} overdue
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={CALM.textMuted} />
              </TouchableOpacity>
            )}

            {/* Deliver today */}
            {deliverToday.length > 0 && (
              <TouchableOpacity
                style={styles.urgencyRow}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('SellerOrders')}
                accessibilityRole="button"
                accessibilityLabel={`${deliverToday.length} orders to deliver today. Tap to view.`}
              >
                <View style={styles.urgencyRowLeft}>
                  <View style={[styles.urgencyDot, styles.urgencyDotToday]} />
                  <Text style={styles.urgencyTextToday}>
                    {deliverToday.length} to deliver today
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={CALM.textMuted} />
              </TouchableOpacity>
            )}

            {/* Deliver tomorrow */}
            {deliverTomorrow.length > 0 && (
              <TouchableOpacity
                style={[styles.urgencyRow, styles.urgencyRowLast]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('SellerOrders')}
                accessibilityRole="button"
                accessibilityLabel={`${deliverTomorrow.length} orders to deliver tomorrow. Tap to view.`}
              >
                <View style={styles.urgencyRowLeft}>
                  <View style={styles.urgencyDot} />
                  <Text style={styles.urgencyTextTomorrow}>
                    {deliverTomorrow.length} tomorrow
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={CALM.textMuted} />
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* ── Unpaid aging ─────────────────────────────────── */}
        {unpaidAging && unpaidAging.older.length > 0 && !isFirstTime && (
          <Animated.View style={[styles.unpaidAgingCard, urgencyAnim]}>
            <TouchableOpacity
              style={styles.unpaidAgingRow}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('SellerOrders')}
              accessibilityRole="button"
              accessibilityLabel={`${unpaidAging.older.length} orders unpaid for more than 2 weeks.`}
            >
              <Feather name="alert-circle" size={16} color={CALM.bronze} />
              <Text style={styles.unpaidAgingText}>
                {unpaidAging.older.length} unpaid over 2 weeks
              </Text>
              <Text style={styles.unpaidAgingAmount}>
                {currency} {unpaidAging.older.reduce((s, o) => s + o.totalAmount, 0).toFixed(0)}
              </Text>
              <Feather name="chevron-right" size={14} color={CALM.bronze} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Today's earnings ──────────────────────────── */}
        {!isFirstTime && todaysOrders.length > 0 && (
          <Animated.View style={[styles.earningsRow, earningsAnim]}>
            <View style={styles.earningsLeft}>
              <Feather name="sun" size={14} color={CALM.gold} />
              <Text style={styles.earningsLabel}>today</Text>
            </View>
            <Text style={styles.earningsValue}>
              {currency} {todaysEarnings.toFixed(0)}
            </Text>
            <Text style={styles.earningsCount}>
              from {todaysOrders.length} {todaysOrders.length === 1 ? 'order' : 'orders'}
            </Text>
          </Animated.View>
        )}

        {/* ── 7-day activity sparkline ──────────────────── */}
        {!isFirstTime && (
          <Animated.View style={sparklineAnim}>
            <TouchableOpacity
              style={styles.sparklineCard}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.navigate('SellerOrders'); }}
              accessibilityRole="button"
              accessibilityLabel="7-day order activity. Tap to view orders."
            >
              <View style={styles.sparklineHeader}>
                <Text style={styles.sparklineTitle}>LAST 7 DAYS</Text>
                <Text style={styles.sparklineTotal}>
                  {weeklyActivity.reduce((s, d) => s + d.count, 0)} orders
                </Text>
              </View>
              <View style={styles.sparklineBarsRow}>
                {weeklyActivity.map((day, i) => {
                  const heightPct = sparklineMax > 0 ? (day.count / sparklineMax) * 100 : 0;
                  const isActive = isToday(day.date);
                  return (
                    <View key={i} style={styles.sparklineBarCol}>
                      <View style={styles.sparklineBarTrack}>
                        <View
                          style={[
                            styles.sparklineBar,
                            {
                              height: `${Math.max(heightPct, 4)}%`,
                              backgroundColor: isActive
                                ? CALM.bronze
                                : withAlpha(CALM.bronze, 0.15),
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.sparklineDayLabel, isActive && styles.sparklineDayLabelActive]}>
                        {day.label}
                      </Text>
                      {day.count > 0 && (
                        <Text style={[styles.sparklineCount, isActive && styles.sparklineCountActive]}>
                          {day.count}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Quick actions 2x2 grid ───────────────────── */}
        <Animated.View style={[styles.quickActionsGrid, quickActionsAnim]}>
          <TouchableOpacity
            style={styles.quickActionButton}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('SellerNewOrder'); }}
            accessibilityRole="button"
            accessibilityLabel="Create a new order"
          >
            <Feather name="plus-circle" size={18} color={CALM.bronze} />
            <Text style={styles.quickActionLabel}>new order</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('SellerProducts'); }}
            accessibilityRole="button"
            accessibilityLabel="View products"
          >
            <Feather name="package" size={18} color={CALM.bronze} />
            <Text style={styles.quickActionLabel}>products</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.navigate('SellerManage'); }}
            accessibilityRole="button"
            accessibilityLabel="Manage costs"
          >
            <Feather name="shopping-bag" size={18} color={CALM.bronze} />
            <Text style={styles.quickActionLabel}>costs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.navigate('SellerCustomers'); }}
            accessibilityRole="button"
            accessibilityLabel="View customers"
          >
            <Feather name="users" size={18} color={CALM.bronze} />
            <Text style={styles.quickActionLabel}>customers</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Hero section ─────────────────────────────── */}
        <Animated.View style={[styles.heroSection, heroAnim]}>
          <View style={styles.heroLabelRow}>
            <Text style={styles.heroLabel}>PROFIT THIS MONTH</Text>
            {momDelta !== null && (
              <View style={styles.heroMomBadge}>
                <Feather
                  name={momDelta >= 0 ? 'trending-up' : 'trending-down'}
                  size={12}
                  color={momDelta >= 0 ? BIZ.profit : BIZ.loss}
                />
                <Text style={[styles.heroMomText, { color: momDelta >= 0 ? BIZ.profit : BIZ.loss }]}>
                  {momDelta >= 0 ? '+' : ''}{momDelta.toFixed(0)}%
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.heroAmount, { color: kept >= 0 ? BIZ.profit : BIZ.loss }]}
            accessibilityLabel={`Profit this month: ${currency} ${kept.toFixed(2)}`}
          >
            {currency} {kept.toFixed(2)}
          </Text>
          {totalCosts > 0 && (
            <Text style={[styles.heroCostsSubtitle, kept < 0 && { color: BIZ.loss }]}>
              after {currency} {totalCosts.toFixed(2)} in costs
            </Text>
          )}
          {profitMargin !== null && totalIncome > 0 && (
            <Text style={styles.heroMargin}>
              margin {profitMargin.toFixed(0)}%
            </Text>
          )}
        </Animated.View>

        {/* ── AI insight ───────────────────────────────── */}
        {insight && (
          <Animated.View style={[styles.insightContainer, insightAnim]}>
            <Text style={styles.insightText}>{insight}</Text>
          </Animated.View>
        )}

        {/* ── First-time getting started ─────────────── */}
        {isFirstTime ? (
          <Animated.View style={[styles.gettingStartedCard, gettingStartedAnim]}>
            <Text style={styles.gettingStartedTitle}>GET STARTED</Text>
            <Text style={styles.gettingStartedSubtitle}>
              get started in 3 steps
            </Text>

            {/* Step 1: Add products */}
            <TouchableOpacity
              style={styles.gettingStartedStep}
              activeOpacity={0.7}
              onPress={() => navigation.getParent()?.navigate('SellerProducts')}
              accessibilityRole="button"
              accessibilityLabel={`Step 1: Add products. ${hasProducts ? 'Completed.' : 'Not yet completed.'}`}
            >
              <View style={styles.stepLeft}>
                <View style={[styles.stepNumber, hasProducts && styles.stepNumberDone]}>
                  {hasProducts ? (
                    <Feather name="check" size={14} color={CALM.surface} />
                  ) : (
                    <Text style={styles.stepNumberText}>1</Text>
                  )}
                </View>
                <Feather
                  name="package"
                  size={18}
                  color={hasProducts ? CALM.textMuted : CALM.textPrimary}
                  style={styles.stepIcon}
                />
                <Text style={[styles.stepText, hasProducts && styles.stepTextDone]}>
                  add products
                </Text>
              </View>
              <Feather
                name={hasProducts ? 'check' : 'chevron-right'}
                size={16}
                color={hasProducts ? CALM.bronze : CALM.textMuted}
              />
            </TouchableOpacity>

            {/* Step 2: Take first order */}
            <TouchableOpacity
              style={styles.gettingStartedStep}
              activeOpacity={0.7}
              onPress={() => navigation.getParent()?.navigate('SellerNewOrder')}
              accessibilityRole="button"
              accessibilityLabel={`Step 2: Create an order. ${hasOrders ? 'Completed.' : 'Not yet completed.'}`}
            >
              <View style={styles.stepLeft}>
                <View style={[styles.stepNumber, hasOrders && styles.stepNumberDone]}>
                  {hasOrders ? (
                    <Feather name="check" size={14} color={CALM.surface} />
                  ) : (
                    <Text style={styles.stepNumberText}>2</Text>
                  )}
                </View>
                <Feather
                  name="clipboard"
                  size={18}
                  color={hasOrders ? CALM.textMuted : CALM.textPrimary}
                  style={styles.stepIcon}
                />
                <Text style={[styles.stepText, hasOrders && styles.stepTextDone]}>
                  create an order
                </Text>
              </View>
              <Feather
                name={hasOrders ? 'check' : 'chevron-right'}
                size={16}
                color={hasOrders ? CALM.bronze : CALM.textMuted}
              />
            </TouchableOpacity>

            {/* Step 3: Start a season */}
            <TouchableOpacity
              style={[styles.gettingStartedStep, styles.gettingStartedStepLast]}
              activeOpacity={0.7}
              onPress={() => navigation.getParent()?.navigate('PastSeasons')}
              accessibilityRole="button"
              accessibilityLabel={`Step 3: Start a season. ${hasSeasons ? 'Completed.' : 'Not yet completed.'}`}
            >
              <View style={styles.stepLeft}>
                <View style={[styles.stepNumber, hasSeasons && styles.stepNumberDone]}>
                  {hasSeasons ? (
                    <Feather name="check" size={14} color={CALM.surface} />
                  ) : (
                    <Text style={styles.stepNumberText}>3</Text>
                  )}
                </View>
                <Feather
                  name="calendar"
                  size={18}
                  color={hasSeasons ? CALM.textMuted : CALM.textPrimary}
                  style={styles.stepIcon}
                />
                <Text style={[styles.stepText, hasSeasons && styles.stepTextDone]}>
                  start a season
                </Text>
              </View>
              <Feather
                name={hasSeasons ? 'check' : 'chevron-right'}
                size={16}
                color={hasSeasons ? CALM.bronze : CALM.textMuted}
              />
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            {/* ── Empty state (no orders this month) ────── */}
            {currentOrders.length === 0 && (
              <Animated.View style={[styles.emptyStateCard, emptyStateAnim]}>
                <Feather name="calendar" size={32} color={CALM.textMuted} />
                <Text style={styles.emptyStateTitle}>no orders this month yet.</Text>
                <Text style={styles.emptyStateSubtitle}>tap + to start taking orders.</Text>
                <TouchableOpacity
                  style={styles.emptyStateCta}
                  activeOpacity={0.7}
                  onPress={() => { lightTap(); navigation.getParent()?.navigate('SellerNewOrder'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Create new order"
                >
                  <Feather name="plus" size={16} color={CALM.bronze} />
                  <Text style={styles.emptyStateCtaText}>new order</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Action cards (pipeline) ──────────────── */}
            <Animated.View style={[styles.actionCardsRow, pipelineAnim]}>
              {/* Orders card */}
              <TouchableOpacity
                style={styles.actionCard}
                activeOpacity={0.7}
                onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'pending' }); }}
                accessibilityRole="button"
                accessibilityLabel={`${currentOrders.length} orders this month. Tap to view pending orders.`}
              >
                <View style={styles.actionCardInner}>
                  <View style={styles.actionCardTop}>
                    <Feather name="clipboard" size={18} color={CALM.textSecondary} />
                    <Feather name="chevron-right" size={14} color={CALM.textMuted} />
                  </View>
                  <Text style={styles.actionCardNumber}>{currentOrders.length}</Text>
                  <Text style={styles.actionCardLabel}>orders</Text>
                </View>
              </TouchableOpacity>

              {/* To make card */}
              <TouchableOpacity
                style={styles.actionCard}
                activeOpacity={0.7}
                onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'confirmed' }); }}
                accessibilityRole="button"
                accessibilityLabel={`${pendingOrders.length} orders to make. Tap to view confirmed orders.`}
              >
                <View style={styles.actionCardInner}>
                  <View style={styles.actionCardTop}>
                    <Feather name="clock" size={18} color={CALM.textSecondary} />
                    <Feather name="chevron-right" size={14} color={CALM.textMuted} />
                  </View>
                  <Text style={styles.actionCardNumber}>{pendingOrders.length}</Text>
                  <Text style={styles.actionCardLabel}>to make</Text>
                </View>
              </TouchableOpacity>

              {/* Unpaid card */}
              <TouchableOpacity
                style={[
                  styles.actionCard,
                  unpaidOrders.length > 0 && styles.actionCardUnpaid,
                ]}
                activeOpacity={0.7}
                onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'delivered' }); }}
                accessibilityRole="button"
                accessibilityLabel={`${unpaidOrders.length} unpaid orders, ${currency} ${unpaidTotal.toFixed(2)} pending. Tap to view.`}
              >
                <View style={styles.actionCardInner}>
                  <View style={styles.actionCardTop}>
                    <Feather
                      name="alert-circle"
                      size={18}
                      color={unpaidOrders.length > 0 ? CALM.bronze : CALM.textSecondary}
                    />
                    <Feather name="chevron-right" size={14} color={CALM.textMuted} />
                  </View>
                  <Text
                    style={[
                      styles.actionCardNumber,
                      unpaidOrders.length > 0 && styles.actionCardNumberHighlight,
                    ]}
                  >
                    {unpaidOrders.length}
                  </Text>
                  <Text style={styles.actionCardLabel}>unpaid</Text>
                  {unpaidOrders.length > 0 && (
                    <Text style={styles.actionCardSubAmount}>
                      {currency} {unpaidTotal.toFixed(0)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* ── Production checklist (to make) ───────────── */}
            {productionList.length > 0 && (
              <Animated.View style={[styles.productionCard, productionAnim]}>
                <View style={styles.productionHeader}>
                  <View style={styles.productionHeaderLeft}>
                    <Feather name="list" size={16} color={CALM.bronze} />
                    <Text style={styles.productionHeaderText}>TO MAKE</Text>
                  </View>
                  <Text style={styles.productionCount}>
                    {checkedCount}/{productionList.length} done
                  </Text>
                </View>
                {/* Progress bar */}
                {productionList.length > 0 && (
                  <View style={styles.productionProgressTrack}>
                    <View
                      style={[
                        styles.productionProgressFill,
                        { width: `${(checkedCount / productionList.length) * 100}%` },
                      ]}
                    />
                  </View>
                )}
                {productionList.map((item, index) => {
                  const done = !!checkedItems[item.name];
                  return (
                    <TouchableOpacity
                      key={item.name}
                      style={[
                        styles.productionRow,
                        index === productionList.length - 1 && styles.productionRowLast,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => toggleChecked(item.name)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                      accessibilityLabel={`${item.name}: ${item.qty} ${item.unit}. ${done ? 'Done.' : 'Not done.'}`}
                    >
                      <View style={styles.productionItemLeft}>
                        <View style={[styles.productionCheckbox, done && styles.productionCheckboxDone]}>
                          {done && <Feather name="check" size={12} color={CALM.surface} />}
                        </View>
                        <Text style={[styles.productionItemName, done && styles.productionItemNameDone]}>
                          {item.name}
                        </Text>
                      </View>
                      <Text style={[styles.productionItemQty, done && styles.productionItemQtyDone]}>
                        {item.qty} {item.unit}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            )}

            {/* ── Delivery route ──────────────────────────── */}
            {todaysDeliveries.length > 0 && (
              <Animated.View style={[styles.deliveryRouteCard, deliveryRouteAnim]}>
                <View style={styles.deliveryRouteHeader}>
                  <View style={styles.deliveryRouteHeaderLeft}>
                    <Feather name="truck" size={16} color={CALM.bronze} />
                    <Text style={styles.deliveryRouteHeaderText}>DELIVER TODAY</Text>
                  </View>
                  <Text style={styles.deliveryRouteCount}>
                    {todaysDeliveries.length} {todaysDeliveries.length === 1 ? 'stop' : 'stops'}
                  </Text>
                </View>
                {todaysDeliveries.map((delivery, index) => (
                  <View
                    key={delivery.id}
                    style={[
                      styles.deliveryRouteRow,
                      index === todaysDeliveries.length - 1 && styles.deliveryRouteRowLast,
                    ]}
                  >
                    <View style={styles.deliveryRouteInfo}>
                      <Text style={styles.deliveryRouteName}>{delivery.customerName}</Text>
                      <Text style={styles.deliveryRouteItems} numberOfLines={1}>
                        {delivery.items.map((i) => `${i.quantity} ${i.productName}`).join(', ')}
                      </Text>
                      {delivery.address ? (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleOpenMaps(delivery.address!)}
                          accessibilityRole="link"
                          accessibilityLabel={`Open map for ${delivery.address}`}
                        >
                          <Text style={styles.deliveryRouteAddress} numberOfLines={1}>
                            {delivery.address}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.deliveryRouteNoAddress}>no address</Text>
                      )}
                    </View>
                    <View style={styles.deliveryRouteActions}>
                      {delivery.customerPhone && (
                        <TouchableOpacity
                          style={styles.deliveryRouteCall}
                          activeOpacity={0.7}
                          onPress={() => { lightTap(); Linking.openURL(`tel:${delivery.customerPhone}`); }}
                          accessibilityRole="button"
                          accessibilityLabel={`Call ${delivery.customerName}`}
                        >
                          <Feather name="phone" size={16} color={CALM.bronze} />
                        </TouchableOpacity>
                      )}
                      {delivery.customerPhone && (
                        <TouchableOpacity
                          style={styles.deliveryRouteCall}
                          activeOpacity={0.7}
                          onPress={() => handleWhatsApp(delivery.customerPhone!)}
                          accessibilityRole="button"
                          accessibilityLabel={`WhatsApp ${delivery.customerName}`}
                        >
                          <Feather name="message-circle" size={16} color={CALM.bronze} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* ── Top customer this month ───────────────── */}
            {topCustomer && (
              <Animated.View style={topCustomerAnim}>
                <TouchableOpacity
                  style={styles.topCustomerCard}
                  activeOpacity={0.7}
                  onPress={() => { lightTap(); navigation.navigate('SellerCustomers'); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Top customer: ${topCustomer.name}, ${topCustomer.count} orders, ${currency} ${topCustomer.total.toFixed(0)} total. Tap to view customers.`}
                >
                  <View style={styles.topCustomerHeader}>
                    <View style={styles.topCustomerHeaderLeft}>
                      <Feather name="award" size={16} color={CALM.bronze} />
                      <Text style={styles.topCustomerHeaderText}>TOP CUSTOMER</Text>
                    </View>
                    <Feather name="chevron-right" size={14} color={CALM.textMuted} />
                  </View>
                  <Text style={styles.topCustomerName}>{topCustomer.name}</Text>
                  <View style={styles.topCustomerStats}>
                    <Text style={styles.topCustomerStat}>
                      {topCustomer.count} {topCustomer.count === 1 ? 'order' : 'orders'}
                    </Text>
                    <Text style={styles.topCustomerDot}>{'\u00B7'}</Text>
                    <Text style={styles.topCustomerStat}>
                      {currency} {topCustomer.total.toFixed(0)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Revenue breakdown card ──────────────── */}
            <Animated.View style={[styles.revenueCard, revenueAnim]}>
              {/* Collection rate bar */}
              {totalOrderValue > 0 && (
                <View style={styles.collectionRateSection}>
                  <View style={styles.collectionRateHeader}>
                    <Text style={styles.collectionRateLabel}>collected</Text>
                    <Text style={styles.collectionRateValue}>{collectionRate.toFixed(0)}%</Text>
                  </View>
                  <View style={styles.collectionRateTrack}>
                    <View style={[styles.collectionRateFill, { width: `${Math.min(collectionRate, 100)}%` }]} />
                  </View>
                </View>
              )}

              {/* Paid row */}
              <View style={styles.revenueRow}>
                <View style={styles.revenueRowLeft}>
                  <Feather name="check-circle" size={16} color={CALM.textSecondary} />
                  <Text style={styles.revenueRowLabel}>paid</Text>
                </View>
                <Text
                  style={styles.revenueRowAmount}
                  accessibilityLabel={`Paid: ${currency} ${totalIncome.toFixed(2)}`}
                >
                  {currency} {totalIncome.toFixed(2)}
                </Text>
              </View>

              {/* Unpaid row */}
              {unpaidTotal > 0 && (
                <View style={styles.revenueRow}>
                  <View style={styles.revenueRowLeft}>
                    <Feather name="clock" size={16} color={CALM.bronze} />
                    <Text style={[styles.revenueRowLabel, { color: CALM.bronze }]}>unpaid</Text>
                  </View>
                  <Text
                    style={[styles.revenueRowAmount, { color: CALM.bronze }]}
                    accessibilityLabel={`Unpaid: ${currency} ${unpaidTotal.toFixed(2)}`}
                  >
                    {currency} {unpaidTotal.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Costs row */}
              <View style={styles.revenueRow}>
                <View style={styles.revenueRowLeft}>
                  <Feather name="shopping-bag" size={16} color={CALM.textSecondary} />
                  <Text style={styles.revenueRowLabel}>costs</Text>
                </View>
                <Text
                  style={styles.revenueRowAmount}
                  accessibilityLabel={`Costs: ${currency} ${totalCosts.toFixed(2)}`}
                >
                  {currency} {totalCosts.toFixed(2)}
                </Text>
              </View>

              {/* Profit row — bolder, separated */}
              <View style={styles.revenueDivider} />
              <View style={styles.revenueRow}>
                <View style={styles.revenueRowLeft}>
                  <Feather name="pocket" size={16} color={kept >= 0 ? BIZ.profit : BIZ.loss} />
                  <Text style={[styles.revenueKeptLabel, { color: kept >= 0 ? BIZ.profit : BIZ.loss }]}>profit</Text>
                </View>
                <Text
                  style={[styles.revenueKeptAmount, { color: kept >= 0 ? BIZ.profit : BIZ.loss }]}
                  accessibilityLabel={`Profit: ${currency} ${kept.toFixed(2)}`}
                >
                  {currency} {kept.toFixed(2)}
                </Text>
              </View>
            </Animated.View>
          </>
        )}

        {/* ── Top products ─────────────────────────────── */}
        {topProducts.length > 0 && (
          <Animated.View style={[styles.topProductsSection, topProductsAnim]}>
            <Text style={styles.topProductsHeader}>POPULAR THIS MONTH</Text>
            {topProducts.map((p, index) => {
              const barWidth = maxQty > 0 ? (p.qty / maxQty) * 100 : 0;
              return (
                <View key={p.name} style={styles.topProductRow}>
                  <View style={styles.topProductContent}>
                    {/* Rank badge */}
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankBadgeText}>{index + 1}</Text>
                    </View>
                    {/* Product name */}
                    <Text style={styles.topProductName}>{p.name}</Text>
                    {/* Quantity + revenue */}
                    <Text style={styles.topProductQty}>
                      {p.qty} {p.unit} {'\u00B7'} {currency} {p.revenue.toFixed(0)}
                    </Text>
                  </View>
                  {/* Proportional bar */}
                  <View style={styles.barTrack}>
                    <View
                      style={[styles.barFill, { width: `${barWidth}%` }]}
                    />
                  </View>
                </View>
              );
            })}
          </Animated.View>
        )}

        {/* ── Change setup link ────────────────────────── */}
        <TouchableOpacity
          onPress={() => { lightTap(); navigation.getParent()?.navigate('BusinessSetup'); }}
          style={styles.changeSetup}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Change business setup"
        >
          <Text style={styles.changeSetupText}>
            change business type
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING['2xl'], // 24pt
    paddingBottom: SPACING['5xl'],     // 48pt
  },

  // ── Season context ────────────────────────────────────────
  seasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,  // 16pt
    marginBottom: SPACING.sm, // 8pt
  },
  seasonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs, // 4pt
    backgroundColor: CALM.highlight, // #FFF7E6
    alignSelf: 'flex-start',
    borderRadius: RADIUS.full, // 9999
    paddingVertical: SPACING.xs + 2, // 6pt
    paddingHorizontal: SPACING.md,   // 16pt
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  seasonPillText: {
    fontSize: TYPOGRAPHY.size.base, // 15
    fontWeight: TYPOGRAPHY.weight.medium, // 500
    color: CALM.bronze, // #B2780A
  },
  viewAllSeasonsText: {
    fontSize: TYPOGRAPHY.size.sm, // 13
    color: CALM.bronze, // #B2780A
    fontWeight: TYPOGRAPHY.weight.medium, // 500
    textDecorationLine: 'underline',
  },

  // ── Urgency section ──────────────────────────────────────
  urgencyCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: CALM.bronze,
  },
  urgencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  urgencyRowLast: {
    borderBottomWidth: 0,
  },
  urgencyRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  urgencyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CALM.textMuted,
  },
  urgencyDotOverdue: {
    backgroundColor: BIZ.overdue,
  },
  urgencyDotToday: {
    backgroundColor: CALM.gold,
  },
  urgencyTextOverdue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: BIZ.overdue,
  },
  urgencyTextToday: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
  },
  urgencyTextTomorrow: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular as '400',
    color: CALM.textSecondary,
  },
  urgencyNames: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: SPACING.sm,
  },
  urgencyNamesText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular as '400',
  },

  // ── Unpaid aging card ──────────────────────────────────
  unpaidAgingCard: {
    backgroundColor: CALM.highlight,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  unpaidAgingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 36,
  },
  unpaidAgingText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
    flex: 1,
  },
  unpaidAgingAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: CALM.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Quick actions 2x2 grid ──────────────────────────────────
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm, // 8pt
    marginBottom: SPACING.sm, // 8pt
  },
  quickActionButton: {
    flexBasis: '47%' as any,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  quickActionLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },

  // ── Hero section ──────────────────────────────────────────
  heroSection: {
    paddingTop: SPACING['2xl'], // 24pt — tightened
    paddingBottom: SPACING.lg,  // 16pt — tightened
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  heroLabel: {
    ...TYPE.label, // fontSize 12, color #6B6B6B, uppercase, letterSpacing 1
  },
  heroMomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  heroMomText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  heroAmount: {
    ...TYPE.amount, // fontWeight 200, tabular-nums
    fontSize: 40,   // larger than 36 (4xl) for hero prominence
    color: CALM.textPrimary, // #1A1A1A
    marginBottom: SPACING.xs, // 4pt
  },
  heroCostsSubtitle: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
  },
  heroMargin: {
    ...TYPE.muted,
    marginTop: 2,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── AI insight ────────────────────────────────────────────
  insightContainer: {
    borderLeftWidth: 3,
    borderLeftColor: CALM.bronze, // #B2780A
    paddingLeft: SPACING.lg, // 16pt
    marginBottom: SPACING['2xl'], // 24pt
  },
  insightText: {
    ...TYPE.insight, // fontSize 14, lineHeight 22
    color: CALM.textSecondary, // #6B6B6B
  },

  // ── Getting started card ──────────────────────────────────
  gettingStartedCard: {
    backgroundColor: CALM.surface, // #FFFFFF
    borderWidth: 1,
    borderColor: CALM.border, // #EBEBEB
    borderRadius: RADIUS.lg, // 14
    padding: SPACING.xl, // 24pt
    marginBottom: SPACING.xl, // 24pt
  },
  gettingStartedTitle: {
    ...TYPE.label, // fontSize 12, color #6B6B6B, uppercase, letterSpacing 1
    marginBottom: SPACING.xs, // 4pt
  },
  gettingStartedSubtitle: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
    marginBottom: SPACING.xl, // 24pt
  },
  gettingStartedStep: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: SPACING.sm, // 8pt
    borderBottomWidth: 1,
    borderBottomColor: CALM.border, // #EBEBEB
  },
  gettingStartedStepLast: {
    borderBottomWidth: 0,
  },
  stepLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CALM.border, // #EBEBEB
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm, // 8pt
  },
  stepNumberDone: {
    backgroundColor: CALM.bronze, // #B2780A
  },
  stepNumberText: {
    fontSize: TYPOGRAPHY.size.xs, // 11
    fontWeight: TYPOGRAPHY.weight.bold, // 700
    color: CALM.textSecondary, // #6B6B6B
    fontVariant: ['tabular-nums'],
  },
  stepIcon: {
    marginRight: SPACING.sm, // 8pt
  },
  stepText: {
    fontSize: TYPOGRAPHY.size.base, // 15
    fontWeight: TYPOGRAPHY.weight.medium, // 500
    color: CALM.textPrimary, // #1A1A1A
    flex: 1,
  },
  stepTextDone: {
    color: CALM.textMuted, // #A0A0A0
    textDecorationLine: 'line-through',
  },

  // ── Action cards (pipeline replacement) ───────────────────
  actionCardsRow: {
    flexDirection: 'row',
    gap: SPACING.sm, // 8pt
    marginBottom: SPACING.xl, // 24pt
  },
  actionCard: {
    flex: 1,
    backgroundColor: CALM.surface, // #FFFFFF
    borderWidth: 1,
    borderColor: CALM.border, // #EBEBEB
    borderRadius: RADIUS.lg, // 14
    minHeight: 44,
  },
  actionCardUnpaid: {
    borderLeftWidth: 3,
    borderLeftColor: CALM.bronze, // #B2780A
    backgroundColor: withAlpha(CALM.bronze, 0.04),
  },
  actionCardInner: {
    padding: SPACING.md, // 16pt
  },
  actionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm, // 8pt
  },
  actionCardNumber: {
    fontSize: 28, // bigger than 2xl (24) for visual weight
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary, // #1A1A1A
    fontVariant: ['tabular-nums'],
  },
  actionCardNumberHighlight: {
    color: CALM.bronze, // #B2780A
  },
  actionCardLabel: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
    marginTop: SPACING.xs, // 4pt
  },
  actionCardSubAmount: {
    fontSize: TYPOGRAPHY.size.xs, // 11
    fontWeight: TYPOGRAPHY.weight.medium, // 500
    color: CALM.bronze, // #B2780A
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },

  // ── Production list (to make) ────────────────────────────
  productionCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  productionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  productionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  productionHeaderText: {
    ...TYPE.label,
    color: CALM.bronze,
  },
  productionCount: {
    ...TYPE.muted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  productionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    minHeight: 44,
  },
  productionRowLast: {
    borderBottomWidth: 0,
  },
  productionItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  // productionDot replaced by productionCheckbox
  productionItemName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  productionItemQty: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Revenue breakdown card ────────────────────────────────
  revenueCard: {
    backgroundColor: CALM.surface, // #FFFFFF
    borderWidth: 1,
    borderColor: CALM.border, // #EBEBEB
    borderRadius: RADIUS.lg, // 14
    padding: SPACING.lg, // 16pt
    marginBottom: SPACING.xl, // 24pt
  },
  revenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingVertical: SPACING.xs, // 4pt
  },
  revenueRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm, // 8pt
  },
  revenueRowLabel: {
    fontSize: TYPOGRAPHY.size.base, // 15
    fontWeight: TYPOGRAPHY.weight.regular, // 400
    color: CALM.textSecondary, // #6B6B6B
  },
  revenueRowAmount: {
    fontSize: TYPOGRAPHY.size.base, // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary, // #1A1A1A
    fontVariant: ['tabular-nums'],
  },
  revenueDivider: {
    height: 1,
    backgroundColor: CALM.border, // #EBEBEB
    marginVertical: SPACING.sm, // 8pt
  },
  revenueKeptLabel: {
    fontSize: TYPOGRAPHY.size.base, // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary, // #1A1A1A
  },
  revenueKeptAmount: {
    fontSize: TYPOGRAPHY.size.lg, // 17
    fontWeight: TYPOGRAPHY.weight.bold, // 700
    color: CALM.textPrimary, // #1A1A1A
    fontVariant: ['tabular-nums'],
  },

  // ── Top products ──────────────────────────────────────────
  topProductsSection: {
    marginBottom: SPACING.xl, // 24pt
  },
  topProductsHeader: {
    ...TYPE.label, // fontSize 12, color #6B6B6B, uppercase, letterSpacing 1
    marginBottom: SPACING.lg, // 16pt
  },
  topProductRow: {
    marginBottom: SPACING.md, // 16pt
  },
  topProductContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm, // 8pt
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CALM.bronze, // #B2780A
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md, // 16pt
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.bold, // 700
    color: '#FFFFFF',
  },
  topProductName: {
    ...TYPE.insight, // fontSize 14, lineHeight 22
    color: CALM.textPrimary, // #1A1A1A
    flex: 1,
  },
  topProductQty: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 6,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: 3,
    marginLeft: 24 + SPACING.md, // aligned with product name (past rank badge)
  },
  barFill: {
    height: 6,
    backgroundColor: withAlpha(CALM.bronze, 0.20),
    borderRadius: 3,
  },

  // ── Today's earnings row ────────────────────────────────
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    minHeight: 44,
  },
  earningsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  earningsLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textSecondary,
  },
  earningsValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: BIZ.profit,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    marginLeft: 'auto' as const,
  },
  earningsCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Production checklist additions ─────────────────────
  productionProgressTrack: {
    height: 3,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: 1.5,
    marginBottom: SPACING.md,
  },
  productionProgressFill: {
    height: 3,
    backgroundColor: CALM.bronze,
    borderRadius: 1.5,
  },
  productionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: CALM.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  productionCheckboxDone: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  productionItemNameDone: {
    textDecorationLine: 'line-through' as const,
    color: CALM.textMuted,
  },
  productionItemQtyDone: {
    color: CALM.textMuted,
  },

  // ── Delivery route card ────────────────────────────────
  deliveryRouteCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  deliveryRouteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  deliveryRouteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  deliveryRouteHeaderText: {
    ...TYPE.label,
    color: CALM.bronze,
  },
  deliveryRouteCount: {
    ...TYPE.muted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  deliveryRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    minHeight: 44,
  },
  deliveryRouteRowLast: {
    borderBottomWidth: 0,
  },
  deliveryRouteInfo: {
    flex: 1,
  },
  deliveryRouteName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  deliveryRouteItems: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginBottom: 2,
  },
  deliveryRouteAddress: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    textDecorationLine: 'underline' as const,
  },
  deliveryRouteNoAddress: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontStyle: 'italic' as const,
  },
  deliveryRouteActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  deliveryRouteCall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CALM.highlight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // ── 7-day sparkline ──────────────────────────────────────
  sparklineCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  sparklineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sparklineTitle: {
    ...TYPE.label,
    color: CALM.textSecondary,
  },
  sparklineTotal: {
    ...TYPE.muted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  sparklineBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  sparklineBarCol: {
    flex: 1,
    alignItems: 'center',
  },
  sparklineBarTrack: {
    width: '100%',
    height: 48,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sparklineBar: {
    width: '70%',
    borderRadius: 3,
    minHeight: 2,
  },
  sparklineDayLabel: {
    fontSize: 10,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    marginTop: SPACING.xs,
    textTransform: 'lowercase' as const,
  },
  sparklineDayLabelActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  sparklineCount: {
    fontSize: 9,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    marginTop: 1,
  },
  sparklineCountActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Collection rate ────────────────────────────────────
  collectionRateSection: {
    marginBottom: SPACING.md,
  },
  collectionRateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  collectionRateLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  collectionRateValue: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  collectionRateTrack: {
    height: 4,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: 2,
  },
  collectionRateFill: {
    height: 4,
    backgroundColor: CALM.bronze,
    borderRadius: 2,
  },

  // ── Top customer ───────────────────────────────────────
  topCustomerCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  topCustomerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  topCustomerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  topCustomerHeaderText: {
    ...TYPE.label,
    color: CALM.bronze,
  },
  topCustomerName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  topCustomerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  topCustomerStat: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  topCustomerDot: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },

  // ── Empty state ────────────────────────────────────────
  emptyStateCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING['3xl'],
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyStateSubtitle: {
    ...TYPE.muted,
    marginBottom: SPACING.xl,
  },
  emptyStateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
  },
  emptyStateCtaText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },

  // ── Change setup ──────────────────────────────────────────
  changeSetup: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'], // 32pt
    minHeight: 44,
    justifyContent: 'center',
  },
  changeSetupText: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
    color: CALM.textSecondary, // #6B6B6B
    textDecorationLine: 'underline' as const,
  },
});

export default SellerDashboard;
