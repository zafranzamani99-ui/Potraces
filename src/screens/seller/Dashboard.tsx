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
  RefreshControl,
  Modal,
  TextInput,
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
import { getSellerProfile, updateSellerProfile } from '../../services/sellerSync';
import * as Clipboard from 'expo-clipboard';

import { useFadeSlide } from '../../utils/fadeSlide';

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

  const { totalIncome, totalCosts, kept, unpaidOrders, pendingOrders, confirmedOrders, unpaidTotal } = useMemo(() => {
    const _totalIncome = currentOrders
      .filter((o) => o.isPaid)
      .reduce((s, o) => s + o.totalAmount, 0);
    const _totalCosts = currentCosts.reduce((s, c) => s + c.amount, 0);
    const _kept = _totalIncome - _totalCosts;
    const _unpaidOrders = currentOrders.filter(
      (o) => !o.isPaid && o.status !== 'pending' && o.status !== 'confirmed'
    );
    const _pendingOrders = currentOrders.filter(
      (o) => o.status === 'pending'
    );
    const _confirmedOrders = currentOrders.filter(
      (o) => o.status === 'confirmed'
    );
    const _unpaidTotal = _unpaidOrders.reduce((s, o) => s + o.totalAmount, 0);
    return {
      totalIncome: _totalIncome,
      totalCosts: _totalCosts,
      kept: _kept,
      unpaidOrders: _unpaidOrders,
      pendingOrders: _pendingOrders,
      confirmedOrders: _confirmedOrders,
      unpaidTotal: _unpaidTotal,
    };
  }, [currentOrders, currentCosts]);

  // Production list — aggregated items across pending/confirmed/ready orders
  const productionList = useMemo(() => {
    const counts: Record<string, { name: string; qty: number; unit: string }> = {};
    for (const order of orders) {
      if (!['pending', 'confirmed', 'ready'].includes(order.status)) continue;
      for (const item of order.items) {
        const key = item.productName;
        if (!counts[key]) {
          counts[key] = { name: item.productName, qty: 0, unit: item.unit };
        }
        counts[key].qty += item.quantity;
      }
    }
    return Object.values(counts).sort((a, b) => b.qty - a.qty);
  }, [orders]);

  // ── Urgency data ──────────────────────────────────────────
  const today = startOfDay(now);

  const deliverToday = useMemo(
    () => orders.filter((o) => {
      if (!o.deliveryDate) return false;
      const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate);
      return isToday(d) && o.status !== 'delivered' && o.status !== 'completed';
    }),
    [orders]
  );

  const deliverTomorrow = useMemo(
    () => orders.filter((o) => {
      if (!o.deliveryDate) return false;
      const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate);
      return isTomorrow(d) && o.status !== 'delivered' && o.status !== 'completed';
    }),
    [orders]
  );

  const overdueOrders = useMemo(
    () => orders.filter((o) => {
      if (!o.deliveryDate) return false;
      const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate);
      return isPast(startOfDay(d)) && !isToday(d) && o.status !== 'delivered' && o.status !== 'completed';
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
  const todaysEarnings = todaysOrders.filter(o => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);

  // ── Today's deliveries with addresses ─────────────────────
  const todaysDeliveries = useMemo(() => {
    return deliverToday.map((o) => {
      // Try to find address from sellerCustomers
      const customer = sellerCustomers.find(
        (c) => c.name.toLowerCase() === (o.customerName || '').toLowerCase()
      );
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName || 'Unknown',
        customerPhone: o.customerPhone,
        address: customer?.address,
        items: o.items,
        totalAmount: o.totalAmount,
        status: o.status,
      };
    });
  }, [deliverToday, sellerCustomers]);

  // ── Pull-to-refresh ───────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const [showItemsModal, setShowItemsModal] = useState(false);

  // ── Shop link state ───────────────────────────────────────
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [shopDisplayName, setShopDisplayName] = useState<string | null>(null);
  const [showShopModal, setShowShopModal] = useState(false);
  const [shopModalSlug, setShopModalSlug] = useState('');
  const [shopModalName, setShopModalName] = useState('');
  const [shopSaving, setShopSaving] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shopLinkCopied, setShopLinkCopied] = useState(false);

  useEffect(() => {
    getSellerProfile().then((profile) => {
      if (profile) {
        setShopSlug(profile.slug);
        setShopDisplayName(profile.displayName);
      }
    }).catch(() => {});
  }, []);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // ── Production checklist state ────────────────────────────
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const toggleChecked = useCallback((itemName: string) => {
    mediumTap();
    setCheckedItems((prev) => ({ ...prev, [itemName]: !prev[itemName] }));
  }, []);
  const checkedCount = useMemo(() => productionList.filter((item) => checkedItems[item.name]).length, [productionList, checkedItems]);

  // ── Previous month costs ────────────────────────────────
  const previousCosts = useMemo(
    () => ingredientCosts.filter((c) => inRange(c.date, prevStart, prevEnd)),
    [ingredientCosts]
  );
  const { prevIncome, prevTotalCosts, prevKept } = useMemo(() => {
    const _prevIncome = previousOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
    const _prevTotalCosts = previousCosts.reduce((s, c) => s + c.amount, 0);
    return {
      prevIncome: _prevIncome,
      prevTotalCosts: _prevTotalCosts,
      prevKept: _prevIncome - _prevTotalCosts,
    };
  }, [previousOrders, previousCosts]);

  // ── Month-over-month delta ──────────────────────────────
  const momDelta = useMemo(() => {
    if (previousOrders.length === 0) return null;
    if (prevKept === 0) return kept > 0 ? 100 : kept < 0 ? -100 : 0;
    return ((kept - prevKept) / Math.abs(prevKept)) * 100;
  }, [kept, prevKept, previousOrders.length]);

  // ── Profit margin ───────────────────────────────────────
  const { keptRate, totalOrderValue, collectionRate } = useMemo(() => {
    const _keptRate = totalIncome > 0 ? (kept / totalIncome) * 100 : null;
    const _totalOrderValue = currentOrders.reduce((s, o) => s + o.totalAmount, 0);
    const _collectionRate = _totalOrderValue > 0 ? (totalIncome / _totalOrderValue) * 100 : 0;
    return { keptRate: _keptRate, totalOrderValue: _totalOrderValue, collectionRate: _collectionRate };
  }, [totalIncome, kept, currentOrders]);

  // ── 7-day activity sparkline ────────────────────────────
  const { weeklyActivity, sparklineMax } = useMemo(() => {
    const days: { date: Date; count: number; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(subDays(now, i));
      const count = orders.filter((o) => {
        const od = o.date instanceof Date ? o.date : new Date(o.date);
        return isSameDay(od, d);
      }).length;
      days.push({ date: d, count, label: format(d, 'EEE').slice(0, 3) });
    }
    return { weeklyActivity: days, sparklineMax: Math.max(...days.map((d) => d.count), 1) };
  }, [orders]);

  // ── Unseen online order count ───────────────────────────
  const seenOnlineOrderIds = useSellerStore((s) => s.seenOnlineOrderIds);
  const unseenOnlineCount = useMemo(() => {
    const seen = new Set(seenOnlineOrderIds);
    return orders.filter((o) => o.source === 'order_link' && !seen.has(o.id)).length;
  }, [orders, seenOnlineOrderIds]);

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

  // Items still to make — aggregate qty from pending/confirmed/ready orders
  const itemOrderStats = useMemo(() => {
    const map: Record<string, { name: string; qty: number; unit: string }> = {};
    for (const order of orders) {
      if (!['pending', 'confirmed', 'ready'].includes(order.status)) continue;
      for (const item of order.items) {
        if (!map[item.productName]) {
          map[item.productName] = { name: item.productName, qty: 0, unit: item.unit };
        }
        map[item.productName].qty += item.quantity;
      }
    }
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [orders]);

  // Getting started step completion
  const hasProducts = products.length > 0;
  const hasOrders = orders.length > 0;
  const hasSeasons = seasons.length > 0;

  // First-time user detection — show checklist until all 3 steps done
  const isFirstTime = !hasProducts || !hasOrders || !hasSeasons;

  // Staggered fade-in animations
  const seasonAnim = useFadeSlide(0);
  const urgencyAnim = useFadeSlide(20);
  const quickActionsAnim = useFadeSlide(50);
  const heroAnim = useFadeSlide(80);
  const insightAnim = useFadeSlide(120);
  const pipelineAnim = useFadeSlide(160);
  const inflowAnim = useFadeSlide(200);
  const productionAnim = useFadeSlide(180);
  const earningsAnim = useFadeSlide(30);
  const sparklineAnim = useFadeSlide(40);
  const deliveryRouteAnim = useFadeSlide(200);
  const topCustomerAnim = useFadeSlide(220);
  const emptyStateAnim = useFadeSlide(80);
  const gettingStartedAnim = useFadeSlide(80);

  // ── Maps app picker (delivery route) ─────────────────────
  // Update after deploying to Vercel — replace with your actual Vercel URL
  const ORDER_PAGE_BASE = 'https://potraces.vercel.app';
  const shopLinkUrl = shopSlug ? `${ORDER_PAGE_BASE}/?slug=${shopSlug}` : null;

  const doSaveShopLink = useCallback(async () => {
    setShopError(null);
    setShopSaving(true);
    const err = await updateSellerProfile(shopModalName, shopModalSlug);
    setShopSaving(false);
    if (err) {
      setShopError(err);
      return;
    }
    setShopSlug(shopModalSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
    setShopDisplayName(shopModalName.trim() || null);
    setShowShopModal(false);
  }, [shopModalName, shopModalSlug]);

  const handleSaveShopLink = useCallback(() => {
    if (shopSlug) {
      doSaveShopLink();
      return;
    }
    Alert.alert(
      'confirm shop link',
      `your shop url will be:\n\n${ORDER_PAGE_BASE}/?slug=${shopModalSlug}\n\nthis cannot be changed later. are you sure?`,
      [
        { text: 'go back', style: 'cancel' },
        { text: 'confirm', onPress: doSaveShopLink },
      ],
    );
  }, [shopSlug, shopModalSlug, doSaveShopLink]);

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

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CALM.bronze} colors={[CALM.bronze]} />
        }
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
                  <Feather name="calendar" size={20} color={CALM.accent} />
                </Animated.View>
                <Text style={styles.seasonPillText}>{activeSeason.name}</Text>
                <Feather name="chevron-right" size={14} color={CALM.textMuted} />
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
              style={styles.seasonPillEmpty}
              activeOpacity={0.6}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('PastSeasons'); }}
              accessibilityRole="button"
              accessibilityLabel="No active season. Tap to manage seasons."
            >
              <Feather name="calendar" size={13} color={CALM.textMuted} />
              <Text style={styles.seasonPillEmptyText}>no active season</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── Hero section + sparkline ──────────────────── */}
        <Animated.View style={[styles.heroSection, heroAnim]}>
          <View style={styles.heroLabelRow}>
            <Text style={styles.heroLabel}>PROFIT THIS MONTH</Text>
            <View style={{ flex: 1 }} />
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
            <TouchableOpacity
              style={styles.shopLinkBtn}
              activeOpacity={0.7}
              onPress={() => {
                lightTap();
                setShopModalSlug(shopSlug || '');
                setShopModalName(shopDisplayName || '');
                setShopError(null);
                setShowShopModal(true);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="My shop link"
            >
              <Feather name="link-2" size={22} color={shopLinkUrl ? BIZ.success : CALM.textMuted} />
            </TouchableOpacity>
          </View>
          <Text
            style={[styles.heroAmount, { color: kept >= 0 ? BIZ.profit : BIZ.loss }]}
            accessibilityLabel={`Profit this month: ${currency} ${kept.toFixed(2)}`}
          >
            {currency} {kept.toFixed(0)}
          </Text>
          {totalCosts > 0 && (
            <Text style={[styles.heroCostsSubtitle, kept < 0 && { color: BIZ.loss }]}>
              after {currency} {totalCosts.toFixed(0)} in costs
            </Text>
          )}
          {keptRate !== null && totalIncome > 0 && (
            <Text style={styles.heroMargin}>
              kept {keptRate.toFixed(0)}%
              {todaysOrders.length > 0 && (
                <Text style={styles.heroTodayInline}>
                  {'  ·  '}today {currency} {todaysEarnings.toFixed(0)}
                </Text>
              )}
            </Text>
          )}
          {keptRate === null && todaysOrders.length > 0 && (
            <Text style={styles.heroMargin}>
              today {currency} {todaysEarnings.toFixed(0)} · {todaysOrders.length} {todaysOrders.length === 1 ? 'order' : 'orders'}
            </Text>
          )}

          {/* Inline 7-day sparkline */}
          {!isFirstTime && (
            <TouchableOpacity
              style={styles.heroSparkline}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.navigate('SellerOrders'); }}
              accessibilityRole="button"
              accessibilityLabel="7-day order activity"
            >
              <View style={styles.heroSparklineBars}>
                {weeklyActivity.map((day, i) => {
                  const heightPct = sparklineMax > 0 ? (day.count / sparklineMax) * 100 : 0;
                  const isActive = isToday(day.date);
                  return (
                    <View key={i} style={styles.heroSparklineCol}>
                      <View style={styles.heroSparklineTrack}>
                        <View
                          style={[
                            styles.heroSparklineBar,
                            {
                              height: `${Math.max(heightPct, 6)}%`,
                              backgroundColor: isActive
                                ? withAlpha(kept >= 0 ? BIZ.profit : BIZ.loss, 0.9)
                                : withAlpha(kept >= 0 ? BIZ.profit : BIZ.loss, 0.18),
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.heroSparklineLabel, isActive && styles.heroSparklineLabelActive]}>
                        {day.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.heroSparklineHint}>
                {weeklyActivity.reduce((s, d) => s + d.count, 0)} orders this week
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── AI insight (unpaid summary / observations) ── */}
        {insight && (
          <Animated.View style={[styles.insightContainer, insightAnim]}>
            <Text style={styles.insightText}>{insight}</Text>
          </Animated.View>
        )}

        {/* ── Quick actions — secondary shortcuts only ── */}
        <Animated.View style={quickActionsAnim}>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={[styles.quickActionButton, { borderColor: withAlpha(CALM.accent, 0.25), backgroundColor: withAlpha(CALM.accent, 0.08) }]}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('SellerProducts'); }}
              accessibilityRole="button"
              accessibilityLabel="View products"
            >
              <Feather name="package" size={16} color={CALM.accent} />
              <Text style={[styles.quickActionLabel, { color: CALM.accent }]}>products</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionButton}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('SellerCosts'); }}
              accessibilityRole="button"
              accessibilityLabel="Manage costs"
            >
              <Feather name="shopping-bag" size={16} color={CALM.bronze} />
              <Text style={styles.quickActionLabel}>costs</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionButton, { borderColor: withAlpha(BIZ.success, 0.25), backgroundColor: withAlpha(BIZ.success, 0.08) }]}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'online' }); }}
              accessibilityRole="button"
              accessibilityLabel="View online orders"
            >
              <Feather name="globe" size={16} color={BIZ.success} />
              <Text style={[styles.quickActionLabel, { color: BIZ.success }]}>online</Text>
              {unseenOnlineCount > 0 && (
                <View style={styles.notiBadge}>
                  <Text style={styles.notiBadgeText}>{unseenOnlineCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Production checklist (preview) ──────────────── */}
        {productionList.length > 0 && !isFirstTime && (
          <Animated.View style={urgencyAnim}>
            <TouchableOpacity
              style={styles.itemStatsCard}
              activeOpacity={0.8}
              onPress={() => { lightTap(); setShowItemsModal(true); }}
            >
              {/* Header */}
              <View style={styles.productionHeader}>
                <View style={styles.productionHeaderLeft}>
                  <Feather name="list" size={16} color={CALM.accent} />
                  <Text style={styles.productionHeaderText}>TO MAKE</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                  <Text style={styles.productionCount}>{checkedCount}/{productionList.length} done</Text>
                  <Feather name="chevron-right" size={14} color={CALM.textMuted} />
                </View>
              </View>
              {/* Progress bar */}
              <View style={styles.productionProgressTrack}>
                <View style={[styles.productionProgressFill, { width: `${(checkedCount / productionList.length) * 100}%` }]} />
              </View>
              {/* First 4 rows */}
              {productionList.slice(0, 4).map((item, index) => {
                const done = !!checkedItems[item.name];
                return (
                  <TouchableOpacity
                    key={item.name}
                    style={[styles.productionRow, index === Math.min(productionList.length, 4) - 1 && styles.productionRowLast]}
                    activeOpacity={0.7}
                    delayPressIn={50}
                    onPress={() => { toggleChecked(item.name); }}
                  >
                    <View style={styles.productionItemLeft}>
                      <View style={[styles.productionCheckbox, done && styles.productionCheckboxDone]}>
                        {done && <Feather name="check" size={12} color={CALM.surface} />}
                      </View>
                      <Text style={[styles.productionItemName, done && styles.productionItemNameDone]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                    <Text style={[styles.productionItemQty, done && styles.productionItemQtyDone]}>
                      {item.qty} {item.unit}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {productionList.length > 4 && (
                <View style={styles.itemStatsMore}>
                  <Text style={styles.itemStatsMoreText}>+{productionList.length - 4} more items</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Break-even indicator ─────────────────────── */}
        {totalCosts > 0 && (
          <View style={[styles.breakEvenCard, kept >= 0 ? styles.breakEvenCardCovered : styles.breakEvenCardShort]}>
            <Feather
              name={kept >= 0 ? 'check-circle' : 'target'}
              size={14}
              color={kept >= 0 ? BIZ.profit : CALM.bronze}
            />
            <Text style={[styles.breakEvenText, { color: kept >= 0 ? BIZ.profit : CALM.bronze }]}>
              {kept >= 0
                ? `costs covered · ${currency} ${kept.toFixed(0)} above break-even`
                : `need ${currency} ${Math.abs(kept).toFixed(0)} more to cover costs`}
            </Text>
          </View>
        )}

        {/* ── First-time getting started ─────────────── */}
        {isFirstTime ? (
          <Animated.View style={[styles.gettingStartedCard, gettingStartedAnim]}>
            <Text style={styles.gettingStartedTitle}>Let's get started 👋</Text>
            <Text style={styles.gettingStartedSubtitle}>
              3 simple steps to set up your store
            </Text>

            {/* Step 1: Start a season */}
            <TouchableOpacity
              style={styles.gettingStartedStep}
              activeOpacity={0.7}
              onPress={() => navigation.getParent()?.navigate('PastSeasons')}
              accessibilityRole="button"
              accessibilityLabel={`Step 1: Start a season. ${hasSeasons ? 'Completed.' : 'Not yet completed.'}`}
            >
              <View style={styles.stepLeft}>
                <View style={[styles.stepNumber, hasSeasons && styles.stepNumberDone]}>
                  {hasSeasons ? (
                    <Feather name="check" size={14} color={CALM.surface} />
                  ) : (
                    <Text style={styles.stepNumberText}>1</Text>
                  )}
                </View>
                <Feather
                  name="calendar"
                  size={18}
                  color={hasSeasons ? CALM.textMuted : CALM.textPrimary}
                  style={styles.stepIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepText, hasSeasons && styles.stepTextDone]}>
                    start a season
                  </Text>
                  {!hasSeasons && (
                    <Text style={styles.stepHint}>e.g. Raya 2025, CNY, or any event</Text>
                  )}
                </View>
              </View>
              <Feather
                name={hasSeasons ? 'check' : 'chevron-right'}
                size={16}
                color={hasSeasons ? CALM.accent : CALM.textMuted}
              />
            </TouchableOpacity>

            {/* Step 2: Add products */}
            <TouchableOpacity
              style={styles.gettingStartedStep}
              activeOpacity={0.7}
              onPress={() => navigation.getParent()?.navigate('SellerProducts')}
              accessibilityRole="button"
              accessibilityLabel={`Step 2: Add products. ${hasProducts ? 'Completed.' : 'Not yet completed.'}`}
            >
              <View style={styles.stepLeft}>
                <View style={[styles.stepNumber, hasProducts && styles.stepNumberDone]}>
                  {hasProducts ? (
                    <Feather name="check" size={14} color={CALM.surface} />
                  ) : (
                    <Text style={styles.stepNumberText}>2</Text>
                  )}
                </View>
                <Feather
                  name="package"
                  size={18}
                  color={hasProducts ? CALM.textMuted : CALM.textPrimary}
                  style={styles.stepIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepText, hasProducts && styles.stepTextDone]}>
                    add your products
                  </Text>
                  {!hasProducts && (
                    <Text style={styles.stepHint}>name, price, and unit</Text>
                  )}
                </View>
              </View>
              <Feather
                name={hasProducts ? 'check' : 'chevron-right'}
                size={16}
                color={hasProducts ? CALM.accent : CALM.textMuted}
              />
            </TouchableOpacity>

            {/* Step 3: Take first order */}
            <TouchableOpacity
              style={[styles.gettingStartedStep, styles.gettingStartedStepLast]}
              activeOpacity={0.7}
              onPress={() => navigation.getParent()?.navigate('SellerNewOrder')}
              accessibilityRole="button"
              accessibilityLabel={`Step 3: Create an order. ${hasOrders ? 'Completed.' : 'Not yet completed.'}`}
            >
              <View style={styles.stepLeft}>
                <View style={[styles.stepNumber, hasOrders && styles.stepNumberDone]}>
                  {hasOrders ? (
                    <Feather name="check" size={14} color={CALM.surface} />
                  ) : (
                    <Text style={styles.stepNumberText}>3</Text>
                  )}
                </View>
                <Feather
                  name="clipboard"
                  size={18}
                  color={hasOrders ? CALM.textMuted : CALM.textPrimary}
                  style={styles.stepIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepText, hasOrders && styles.stepTextDone]}>
                    record your first order
                  </Text>
                  {!hasOrders && (
                    <Text style={styles.stepHint}>customer name, product, quantity</Text>
                  )}
                </View>
              </View>
              <Feather
                name={hasOrders ? 'check' : 'chevron-right'}
                size={16}
                color={hasOrders ? CALM.accent : CALM.textMuted}
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
                <Text style={styles.emptyStateSubtitle}>tap + to record a new order.</Text>
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
                style={[styles.actionCard, pendingOrders.length > 0 && { borderLeftWidth: 3, borderLeftColor: BIZ.pending, backgroundColor: withAlpha(BIZ.pending, 0.04) }]}
                activeOpacity={0.7}
                onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'pending' }); }}
                accessibilityRole="button"
                accessibilityLabel={`${pendingOrders.length} pending orders. Tap to view.`}
              >
                <View style={styles.actionCardInner}>
                  <View style={styles.actionCardTop}>
                    <Feather name="clipboard" size={18} color={pendingOrders.length > 0 ? BIZ.pending : CALM.textSecondary} />
                    <Feather name="chevron-right" size={14} color={CALM.textMuted} />
                  </View>
                  <Text style={[styles.actionCardNumber, pendingOrders.length > 0 && { color: BIZ.pending }]}>{pendingOrders.length}</Text>
                  <Text style={styles.actionCardLabel}>pending</Text>
                </View>
              </TouchableOpacity>

              {/* To make card */}
              <TouchableOpacity
                style={[styles.actionCard, confirmedOrders.length > 0 && { borderLeftWidth: 3, borderLeftColor: CALM.accent, backgroundColor: withAlpha(CALM.accent, 0.04) }]}
                activeOpacity={0.7}
                onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'confirmed' }); }}
                accessibilityRole="button"
                accessibilityLabel={`${confirmedOrders.length} orders to make. Tap to view confirmed orders.`}
              >
                <View style={styles.actionCardInner}>
                  <View style={styles.actionCardTop}>
                    <Feather name="clock" size={18} color={confirmedOrders.length > 0 ? CALM.accent : CALM.textSecondary} />
                    <Feather name="chevron-right" size={14} color={CALM.textMuted} />
                  </View>
                  <Text style={[styles.actionCardNumber, confirmedOrders.length > 0 && { color: CALM.accent }]}>{confirmedOrders.length}</Text>
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
                onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'unpaid' }); }}
                accessibilityRole="button"
                accessibilityLabel={`${unpaidOrders.length} unpaid orders, ${currency} ${unpaidTotal.toFixed(2)} pending. Tap to view.`}
              >
                <View style={styles.actionCardInner}>
                  <View style={styles.actionCardTop}>
                    <Feather
                      name="alert-circle"
                      size={18}
                      color={unpaidOrders.length > 0 ? BIZ.unpaid : CALM.textSecondary}
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


            {/* ── Delivery route ──────────────────────────── */}
            {todaysDeliveries.length > 0 && (
              <Animated.View style={[styles.deliveryRouteCard, deliveryRouteAnim]}>
                <View style={styles.deliveryRouteHeader}>
                  <View style={styles.deliveryRouteHeaderLeft}>
                    <Feather name="truck" size={16} color={CALM.gold} />
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
                      <Text style={styles.deliveryRouteName}>
                        {delivery.orderNumber ? `${delivery.orderNumber}  ` : ''}{delivery.customerName}
                      </Text>
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
                          <Feather name="phone" size={16} color={CALM.gold} />
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
                          <Feather name="message-circle" size={16} color={CALM.gold} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* ── Revenue breakdown ──────────────────── */}
            <Animated.View style={[styles.revenueCard, inflowAnim]}>
              {/* Came in row */}
              <View style={styles.revenueRow}>
                <View style={styles.revenueRowLeft}>
                  <Feather name="arrow-down-circle" size={15} color={BIZ.success} />
                  <Text style={styles.revenueRowLabel}>came in</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.revenueRowAmount}>{currency} {totalIncome.toFixed(2)}</Text>
                  {unpaidTotal > 0 && (
                    <Text style={styles.revenueRowNote}>+ {currency} {unpaidTotal.toFixed(0)} unpaid</Text>
                  )}
                </View>
              </View>

              {/* Costs row */}
              <View style={styles.revenueRow}>
                <View style={styles.revenueRowLeft}>
                  <Feather name="shopping-bag" size={15} color={CALM.bronze} />
                  <Text style={styles.revenueRowLabel}>costs</Text>
                </View>
                <Text style={styles.revenueRowAmount}>{currency} {totalCosts.toFixed(2)}</Text>
              </View>

              {/* Divider */}
              <View style={styles.revenueDivider} />

              {/* Kept row */}
              <View style={[styles.revenueRow, { paddingVertical: 0 }]}>
                <View style={styles.revenueRowLeft}>
                  <Feather name="pocket" size={15} color={kept >= 0 ? BIZ.profit : BIZ.loss} />
                  <Text style={[styles.revenueKeptLabel, { color: kept >= 0 ? BIZ.profit : BIZ.loss }]}>kept</Text>
                </View>
                <Text style={[styles.revenueKeptAmount, { color: kept >= 0 ? BIZ.profit : BIZ.loss }]}>
                  {currency} {kept.toFixed(2)}
                </Text>
              </View>
            </Animated.View>
          </>
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

      {/* ── Shop link modal ──────────────────────────────── */}
      <Modal
        visible={showShopModal}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowShopModal(false)}
      >
        <TouchableOpacity
          style={styles.shopModalOverlay}
          activeOpacity={1}
          onPress={() => setShowShopModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.shopModalCard} onPress={() => {}}>
            {/* Header */}
            <View style={styles.shopModalHeader}>
              <View style={styles.shopModalIconWrap}>
                <Feather name="link-2" size={18} color={BIZ.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shopModalTitle}>my shop link</Text>
                <Text style={styles.shopModalSubtitle}>customers use this to place orders</Text>
              </View>
              <TouchableOpacity onPress={() => setShowShopModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={18} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.shopModalDivider} />

            <View style={styles.shopModalField}>
              <Text style={styles.shopModalFieldLabel}>shop name</Text>
              <TextInput
                style={styles.shopModalInput}
                value={shopModalName}
                onChangeText={setShopModalName}
                placeholder="e.g. Kuih Raya Mak Cik Ton"
                placeholderTextColor={CALM.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.shopModalField}>
              <Text style={styles.shopModalFieldLabel}>
                shop url{' '}
                {!shopSlug && <Text style={styles.shopModalFieldHint}>(lowercase, numbers, -)</Text>}
              </Text>
              <TextInput
                style={[styles.shopModalInput, !!shopSlug && { color: CALM.textMuted, backgroundColor: CALM.border }]}
                value={shopModalSlug}
                onChangeText={(t) => setShopModalSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g. kuih-raya-ton"
                placeholderTextColor={CALM.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!shopSlug}
              />
              <Text style={[styles.shopModalFieldHint, { marginTop: 4, color: shopSlug ? CALM.textMuted : CALM.bronze }]}>
                {shopSlug ? 'link cannot be changed' : 'choose carefully — this is permanent'}
              </Text>
            </View>

            {shopModalSlug.length > 0 && shopSlug && (
              <View style={styles.shopModalPreview}>
                <Text style={styles.shopModalPreviewLabel}>your link</Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  onPress={async () => {
                    const url = `${ORDER_PAGE_BASE}/?slug=${shopSlug}`;
                    await Clipboard.setStringAsync(url);
                    setShopLinkCopied(true);
                    setTimeout(() => setShopLinkCopied(false), 2000);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.shopModalPreviewUrl, { flex: 1 }]} numberOfLines={1}>
                    {ORDER_PAGE_BASE}/?slug={shopModalSlug}
                  </Text>
                  <Feather
                    name={shopLinkCopied ? 'check' : 'copy'}
                    size={18}
                    color={shopLinkCopied ? CALM.textMuted : BIZ.success}
                  />
                </TouchableOpacity>
              </View>
            )}

            {shopError && (
              <Text style={styles.shopModalError}>{shopError}</Text>
            )}

            <TouchableOpacity
              style={[styles.shopModalSaveBtn, (shopSaving || !shopModalSlug) && { opacity: 0.5 }]}
              disabled={shopSaving || !shopModalSlug}
              onPress={handleSaveShopLink}
              activeOpacity={0.8}
            >
              <Feather name="check" size={15} color="#fff" />
              <Text style={styles.shopModalSaveBtnText}>
                {shopSaving ? 'saving...' : 'save'}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── All items modal ───────────────────────────────── */}
      {showItemsModal && (
        <Modal
          visible
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setShowItemsModal(false)}
        >
          <TouchableOpacity
            style={styles.itemsModalOverlay}
            activeOpacity={1}
            onPress={() => setShowItemsModal(false)}
          >
            <View style={styles.itemsModalCard} onStartShouldSetResponder={() => true}>
              <View style={styles.itemsModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Feather name="list" size={16} color={CALM.accent} />
                  <Text style={styles.itemsModalTitle}>to make</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Text style={styles.productionCount}>{checkedCount}/{productionList.length} done</Text>
                  <TouchableOpacity onPress={() => setShowItemsModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Feather name="x" size={18} color={CALM.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                {productionList.map((item, index) => {
                  const done = !!checkedItems[item.name];
                  return (
                    <TouchableOpacity
                      key={item.name}
                      style={[styles.productionRow, index === productionList.length - 1 && styles.productionRowLast]}
                      activeOpacity={0.7}
                      delayPressIn={50}
                      onPress={() => toggleChecked(item.name)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
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
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

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
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  seasonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  seasonPillText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  seasonPillEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    paddingVertical: 4,
  },
  seasonPillEmptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular as '400',
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
    borderLeftColor: BIZ.warning,
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
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderLeftWidth: 3,
    borderLeftColor: BIZ.overdue,
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
    color: BIZ.overdue,
    flex: 1,
  },
  unpaidAgingAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: BIZ.overdue,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Quick actions — primary CTA + secondary row ────────────
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 52,
    borderRadius: RADIUS.xl,
    backgroundColor: CALM.deepOlive,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
    ...SHADOWS.md,
  },
  primaryCtaText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
    letterSpacing: 0.2,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    backgroundColor: CALM.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  quickActionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  notiBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: BIZ.pending,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notiBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
  },

  // ── Hero section ──────────────────────────────────────────
  heroSection: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
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
    backgroundColor: withAlpha(BIZ.profit, 0.08),
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
    ...TYPE.amount, // tabular-nums
    fontSize: 44,
    fontWeight: '300' as const,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
    letterSpacing: -1,
  },
  heroCostsSubtitle: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
  },
  heroMargin: {
    ...TYPE.muted,
    marginTop: 2,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  heroTodayInline: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Inline hero sparkline ─────────────────────────────────
  heroSparkline: {
    marginTop: SPACING.lg,
  },
  heroSparklineBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 28,
    marginBottom: SPACING.xs,
  },
  heroSparklineCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  heroSparklineTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  heroSparklineBar: {
    width: '60%',
    borderRadius: 2,
    minHeight: 2,
  },
  heroSparklineLabel: {
    fontSize: 9,
    color: CALM.textMuted,
    marginTop: 3,
    textTransform: 'lowercase' as const,
  },
  heroSparklineLabelActive: {
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  heroSparklineHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: SPACING.xs,
  },

  breakEvenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginTop: SPACING.sm,
  },
  breakEvenCardCovered: {
    backgroundColor: withAlpha(BIZ.profit, 0.08),
    borderColor: withAlpha(BIZ.profit, 0.25),
  },
  breakEvenCardShort: {
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderColor: withAlpha(CALM.bronze, 0.25),
  },
  breakEvenText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── AI insight ────────────────────────────────────────────
  insightContainer: {
    borderLeftWidth: 3,
    borderLeftColor: CALM.accent, // olive — intelligence
    paddingLeft: SPACING.lg, // 16pt
    marginBottom: SPACING.sm,
  },
  insightText: {
    ...TYPE.insight, // fontSize 14, lineHeight 22
    color: CALM.textSecondary, // #6B6B6B
  },

  // ── Getting started card ──────────────────────────────────
  gettingStartedCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
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
    backgroundColor: CALM.accent, // olive — progress
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
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  stepTextDone: {
    color: CALM.textMuted,
    textDecorationLine: 'line-through',
  },
  stepHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 1,
  },

  // ── Action cards (pipeline replacement) ───────────────────
  actionCardsRow: {
    flexDirection: 'row',
    gap: SPACING.sm, // 8pt
    marginBottom: SPACING.xl, // 24pt
  },
  actionCard: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    minHeight: 44,
  },
  actionCardUnpaid: {
    borderLeftWidth: 3,
    borderLeftColor: BIZ.unpaid,
    backgroundColor: withAlpha(BIZ.unpaid, 0.04),
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
    color: BIZ.unpaid, // warm sand — unpaid semantic
  },
  actionCardLabel: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
    marginTop: SPACING.xs, // 4pt
  },
  actionCardSubAmount: {
    fontSize: TYPOGRAPHY.size.xs, // 11
    fontWeight: TYPOGRAPHY.weight.medium, // 500
    color: BIZ.unpaid, // warm sand — unpaid semantic
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
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  productionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  productionHeaderText: {
    ...TYPE.label,
    color: CALM.accent,
  },
  productionCount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  productionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
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

  // ── Revenue breakdown ─────────────────────────────────────
  revenueCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    marginBottom: SPACING.xl,
  },
  revenueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs + 2,
  },
  revenueRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  revenueRowLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular as '400',
    color: CALM.textSecondary,
  },
  revenueRowAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  revenueRowNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.unpaid,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    marginTop: 2,
  },
  revenueDivider: {
    height: 1,
    backgroundColor: CALM.border,
    marginVertical: SPACING.xs + 2,
  },
  revenueProfitSection: {},
  revenueKeptLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  revenueKeptAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
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
    color: CALM.surface,
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
    height: 5,
    backgroundColor: withAlpha(CALM.accent, 0.15),
    borderRadius: 3,
    marginBottom: SPACING.sm,
  },
  productionProgressFill: {
    height: 5,
    backgroundColor: CALM.accent,
    borderRadius: 3,
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
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
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
    color: CALM.gold,
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
    color: CALM.gold,
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
    backgroundColor: withAlpha(CALM.gold, 0.1),
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
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  sparklineCount: {
    fontSize: 9,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    marginTop: 1,
  },
  sparklineCountActive: {
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Collection bar ────────────────────────────────────
  collectionBarWrap: {
    marginBottom: SPACING.md,
  },
  collectionBarTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: withAlpha(BIZ.unpaid, 0.12),
    marginBottom: SPACING.xs,
  },
  collectionBarPaid: {
    backgroundColor: BIZ.success,
  },
  collectionBarUnpaid: {
    backgroundColor: withAlpha(BIZ.unpaid, 0.5),
  },
  collectionBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  collectionBarLabelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionBarLabelRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BIZ.success,
  },
  collectionBarLabelText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  // kept for legacy (unused now but avoids TS error if referenced)
  collectionRateLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
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
    color: BIZ.success,
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

  // ── Shop link card ──
  shopLinkBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(BIZ.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Shop link modal ──
  shopModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  shopModalCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    width: '100%',
    ...SHADOWS.lg,
  },
  shopModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  shopModalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(BIZ.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  shopModalTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textPrimary,
  },
  shopModalSubtitle: {
    fontSize: 11,
    color: CALM.textMuted,
    marginTop: 1,
  },
  shopModalDivider: {
    height: 1,
    backgroundColor: CALM.border,
    marginBottom: SPACING.md,
  },
  shopModalField: {
    marginBottom: SPACING.sm,
  },
  shopModalFieldLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: CALM.textMuted,
    marginBottom: 5,
  },
  shopModalFieldHint: {
    fontSize: 10,
    fontWeight: '400' as any,
    textTransform: 'none' as const,
    letterSpacing: 0,
    color: CALM.textMuted,
  },
  shopModalInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  shopModalPreview: {
    backgroundColor: withAlpha(BIZ.success, 0.07),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(BIZ.success, 0.2),
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  shopModalPreviewLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: BIZ.success,
    marginBottom: 3,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  shopModalPreviewUrl: {
    fontSize: 11,
    color: BIZ.success,
    lineHeight: 16,
  },
  shopModalError: {
    fontSize: 12,
    color: '#C1694F',
    marginBottom: SPACING.sm,
  },
  shopModalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: BIZ.success,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.sm,
  },
  shopModalSaveBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: '#fff',
  },
  changeSetupText: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
    color: CALM.textSecondary, // #6B6B6B
    textDecorationLine: 'underline' as const,
  },

  // ── Item stats card ──
  itemStatsCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: CALM.border,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    overflow: 'hidden',
  },
  itemStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    marginBottom: SPACING.xs,
  },
  itemStatsHeaderTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    letterSpacing: 0.3,
  },
  itemStatsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  itemStatsHeaderSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  itemStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: SPACING.sm,
  },
  itemStatsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(CALM.border, 0.5),
  },
  itemStatsName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  itemStatsCountBadge: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    minWidth: 32,
    alignItems: 'center',
  },
  itemStatsCountText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
    fontVariant: ['tabular-nums'] as any,
  },
  itemStatsMore: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: withAlpha(CALM.border, 0.5),
    marginTop: 2,
  },
  itemStatsMoreText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },

  // ── Items modal ──
  itemsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  itemsModalCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    width: '100%',
    maxHeight: '65%',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    ...SHADOWS.lg,
  },
  itemsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    marginBottom: SPACING.xs,
  },
  itemsModalTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
});

export default SellerDashboard;
