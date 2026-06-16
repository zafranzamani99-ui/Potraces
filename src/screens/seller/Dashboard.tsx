import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Linking,
  Platform,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Image,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, subMonths, subDays, isWithinInterval, isToday, isTomorrow, isPast, startOfDay, differenceInDays, format, isSameDay, formatDistanceToNow, isValid } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ, BIZ_SAFE, semantic } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { explainSellerMonth } from '../../utils/explainSellerMonth';
import { lightTap, mediumTap } from '../../services/haptics';
import ModeToggle from '../../components/common/ModeToggle';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSellerProfile, updateSellerProfile, uploadShopLogo, getSyncStatus, getLastSyncAt, subscribeSyncStatus, SyncStatus } from '../../services/sellerSync';
import { useAuthStore } from '../../store/authStore';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';

import { formatAmount } from '../../utils/formatters';
import { useT } from '../../i18n';
import { useFadeSlide } from '../../utils/fadeSlide';
import { useSeasonInsights } from '../../hooks/useSeasonInsights';
import SeasonStartSheet from '../../components/seller/SeasonStartSheet';
import ModalToastHost from '../../components/common/ModalToastHost';
import OfflineBanner from '../../components/common/OfflineBanner';

// ─── Sync status hook (CF-52) ────────────────────────────────
function useSyncStatus(): { status: SyncStatus; lastSyncAt: Date | null } {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return subscribeSyncStatus(() => forceUpdate((n) => n + 1));
  }, []);
  return { status: getSyncStatus(), lastSyncAt: getLastSyncAt() };
}

// ─── Component ───────────────────────────────────────────────
const SellerDashboard: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { orders, products, ingredientCosts, seasons, sellerCustomers, skippedOnboardingSteps, skipOnboardingStep } = useSellerStore();
  const isSyncing = useSellerStore((s) => s.isSyncing);
  const { businessSetupComplete, incomeType } = useBusinessStore();
  const currency = useSettingsStore((s) => s.currency);
  const paymentQrs = useSettingsStore((s) => s.businessPaymentQrs) || [];
  const navigation = useNavigation<any>();
  const t = useT();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevStart = startOfMonth(subMonths(now, 1));
  const prevEnd = endOfMonth(subMonths(now, 1));

  const inRange = (d: Date, start: Date, end: Date) => {
    const parsed = d instanceof Date ? d : new Date(d);
    if (!isValid(parsed)) return false;
    return isWithinInterval(parsed, { start, end });
  };

  const activeSeason = seasons.find((s) => s.isActive) || null;
  const seasonInsights = useSeasonInsights(activeSeason);
  const [showStartSheet, setShowStartSheet] = useState(false);

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
    const _unpaidOrders = currentOrders.filter((o) => !o.isPaid);
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

  const heroCosts = activeSeason && seasonInsights ? seasonInsights.costs : totalCosts;

  const { seasonWeekly, seasonSparkMax } = useMemo(() => {
    if (!activeSeason) return { seasonWeekly: [] as { date: Date; count: number; label: string }[], seasonSparkMax: 1 };
    const sOrders = orders.filter((o) => o.seasonId === activeSeason.id);
    const days: { date: Date; count: number; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(subDays(now, i));
      const count = sOrders.filter((o) => isSameDay(o.date instanceof Date ? o.date : new Date(o.date), d)).length;
      days.push({ date: d, count, label: format(d, 'EEE').slice(0, 3) });
    }
    return { seasonWeekly: days, seasonSparkMax: Math.max(...days.map((d) => d.count), 1) };
  }, [orders, activeSeason]);

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

  // ── Today's came in ──────────────────────────────────────
  const todaysOrders = useMemo(
    () => orders.filter((o) => {
      const d = o.date instanceof Date ? o.date : new Date(o.date);
      return isToday(d);
    }),
    [orders]
  );
  const todaysCameIn = todaysOrders.filter(o => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);

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

  // ── Sync status (CF-52) ──────────────────────────────────
  const { status: syncStatus, lastSyncAt } = useSyncStatus();

  // ── Pull-to-refresh ───────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const [showItemsModal, setShowItemsModal] = useState(false);

  // ── Shop link state ───────────────────────────────────────
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [shopDisplayName, setShopDisplayName] = useState<string | null>(null);
  const [showShopModal, setShowShopModal] = useState(false);
  const [shopModalSlug, setShopModalSlug] = useState('');
  const [shopModalName, setShopModalName] = useState('');
  const [shopModalNotice, setShopModalNotice] = useState('');
  const [shopNotice, setShopNotice] = useState<string | null>(null);
  const [shopSaving, setShopSaving] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shopLinkCopied, setShopLinkCopied] = useState(false);
  const [showSlugConfirm, setShowSlugConfirm] = useState(false);
  const [shopLogoUrl, setShopLogoUrl] = useState<string | null>(null);
  const [shopLogoUploading, setShopLogoUploading] = useState(false);
  const [previewLogoVisible, setPreviewLogoVisible] = useState(false);

  // QR modal
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrViewIndex, setQrViewIndex] = useState(0);

  // Guard: close all modals before opening a new one (prevents iOS stacking)
  const closeAllModals = useCallback(() => {
    setShowShopModal(false);
    setShowSlugConfirm(false);
    setShowItemsModal(false);
    setQrModalVisible(false);
    setShowStartSheet(false);
    setPreviewLogoVisible(false);
  }, []);

  useEffect(() => {
    getSellerProfile().then((profile) => {
      if (profile) {
        setShopSlug(profile.slug);
        setShopDisplayName(profile.displayName);
        setShopNotice(profile.shopNotice);
        setShopLogoUrl(profile.logoUrl);
      }
    }).catch((err) => { if (__DEV__) console.warn('[Dashboard] Profile fetch failed:', err); });
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

  // ── Kept rate ───────────────────────────────────────
  const { keptRate, totalOrderValue, collectionRate } = useMemo(() => {
    const _keptRate = totalIncome > 0 ? (kept / totalIncome) * 100 : null;
    const _totalOrderValue = currentOrders.reduce((s, o) => s + o.totalAmount, 0);
    const _collectionRate = _totalOrderValue > 0 ? (totalIncome / _totalOrderValue) * 100 : 0;
    return { keptRate: _keptRate, totalOrderValue: _totalOrderValue, collectionRate: _collectionRate };
  }, [totalIncome, kept, currentOrders]);

  const heroDisplayValue = activeSeason && seasonInsights ? seasonInsights.kept : totalOrderValue;

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
    () => explainSellerMonth(currentOrders, previousOrders, currentCosts, currency),
    [currentOrders, previousOrders, currentCosts, currency]
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

  const seasonDone = hasSeasons || skippedOnboardingSteps.includes('season');
  const productsDone = hasProducts || skippedOnboardingSteps.includes('products');
  const ordersDone = hasOrders || skippedOnboardingSteps.includes('orders');

  // First-time user detection — show checklist until all 3 steps done or skipped
  const isFirstTime = !seasonDone || !productsDone || !ordersDone;

  // Staggered fade-in animations
  const seasonAnim = useFadeSlide(0);
  const urgencyAnim = useFadeSlide(20);
  const quickActionsAnim = useFadeSlide(50);
  const heroAnim = useFadeSlide(80);
  const insightAnim = useFadeSlide(120);
  const pipelineAnim = useFadeSlide(160);
  const inflowAnim = useFadeSlide(200);
  const productionAnim = useFadeSlide(180);
  const cameInAnim = useFadeSlide(30);
  const sparklineAnim = useFadeSlide(40);
  const deliveryRouteAnim = useFadeSlide(200);
  const topCustomerAnim = useFadeSlide(220);
  const emptyStateAnim = useFadeSlide(80);
  const gettingStartedAnim = useFadeSlide(80);
  const breakEvenAnim = useFadeSlide(100);

  // Hero count-up — first session open only, 400ms, hero number only
  const hasCountedUp = useRef(false);
  const heroCountRef = useRef(new Animated.Value(0)).current;
  const [displayKept, setDisplayKept] = useState<number | null>(null);

  useEffect(() => {
    if (hasCountedUp.current) {
      setDisplayKept(null);
      return;
    }
    if (heroDisplayValue === 0) return;
    hasCountedUp.current = true;
    const listener = heroCountRef.addListener(({ value }) => {
      setDisplayKept(Math.round(value));
    });
    Animated.timing(heroCountRef, {
      toValue: heroDisplayValue,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      lightTap();
      setDisplayKept(null);
    });
    return () => heroCountRef.removeListener(listener);
  }, [heroDisplayValue]);

  // MoM badge pop — only when positive (celebrate wins, quiet on losses)
  const momPopAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (momDelta !== null && momDelta >= 0) {
      momPopAnim.setValue(0);
      Animated.spring(momPopAnim, {
        toValue: 1,
        damping: 15,
        stiffness: 400,
        delay: 500,
        useNativeDriver: true,
      }).start();
    } else {
      momPopAnim.setValue(1);
    }
  }, [momDelta]);

  // ── Maps app picker (delivery route) ─────────────────────
  // Update after deploying to Vercel — replace with your actual Vercel URL
  const ORDER_PAGE_BASE = 'https://jejakbaki.my';
  const shopLinkUrl = shopSlug ? `${ORDER_PAGE_BASE}/?slug=${shopSlug}` : null;

  const handlePickLogo = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('', 'Gallery permission is needed to pick a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      mediaTypes: ['images'],
    });
    if (result.canceled || !result.assets?.[0]) return;
    setShopLogoUploading(true);
    const url = await uploadShopLogo(result.assets[0].uri);
    setShopLogoUploading(false);
    if (url) {
      setShopLogoUrl(url);
    } else {
      Alert.alert('', 'Failed to upload logo. Please try again.');
    }
  }, []);

  const doSaveShopLink = useCallback(async () => {
    setShopError(null);
    setShopSaving(true);
    const err = await updateSellerProfile(shopModalName, shopModalSlug, shopModalNotice, shopLogoUrl);
    setShopSaving(false);
    if (err) {
      setShopError(err);
      return;
    }
    setShopSlug(shopModalSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
    setShopDisplayName(shopModalName.trim() || null);
    setShopNotice(shopModalNotice.trim() || null);
    setShowShopModal(false);
  }, [shopModalName, shopModalSlug, shopModalNotice, shopLogoUrl]);

  const handleSaveShopLink = useCallback(() => {
    if (shopSlug) {
      doSaveShopLink();
      return;
    }
    // iOS: must close parent modal before opening sub-modal
    closeAllModals();
    setTimeout(() => setShowSlugConfirm(true), 50);
  }, [shopSlug, doSaveShopLink, closeAllModals]);

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

  // ── Navigation handlers ─────────────────────────────────────
  const goToPastSeasons = useCallback(() => {
    lightTap();
    navigation.getParent()?.navigate('PastSeasons');
  }, [navigation]);

  const goToProducts = useCallback(() => {
    lightTap();
    navigation.getParent()?.navigate('SellerProducts');
  }, [navigation]);

  const goToCosts = useCallback(() => {
    lightTap();
    navigation.getParent()?.navigate('SellerCosts');
  }, [navigation]);


  const goToNewOrder = useCallback(() => {
    lightTap();
    navigation.navigate('SellerNewOrder');
  }, [navigation]);

  const goToOrders = useCallback(() => {
    lightTap();
    navigation.navigate('SellerOrders');
  }, [navigation]);

  // AuthGatedBusiness handles the setup redirect — this is just a safety guard
  const needsSetup = !businessSetupComplete || incomeType !== 'seller';
  if (needsSetup) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + SPACING.md }]}>
        <ModeToggle />
      </View>
    );
  }

  // Show loading indicator when initial sync is in progress and store is empty
  if (isSyncing && orders.length === 0 && products.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.bronze} />
        <Text style={{ marginTop: SPACING.lg, fontSize: TYPOGRAPHY.size.base, color: C.textSecondary }}>
          loading your data...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.bronze} colors={[C.bronze]} />
        }
      >
        <View style={styles.topRow}>
          <ModeToggle />
        </View>
        <OfflineBanner />
        {/* ── Sync status (CF-52) ── */}
        {syncStatus === 'syncing' ? (
          <Text style={styles.syncStatusText}>syncing...</Text>
        ) : syncStatus === 'error' ? (
          <Text style={[styles.syncStatusText, { color: C.bronze }]}>sync failed</Text>
        ) : lastSyncAt ? (
          <Text style={styles.syncStatusText}>last synced {formatDistanceToNow(lastSyncAt, { addSuffix: true })}</Text>
        ) : null}
        {/* ── Season context ─────────────────────────────── */}
        <Animated.View style={seasonAnim}>
          {activeSeason ? (
            <View style={styles.seasonRow}>
              <Pressable
                style={({ pressed }) => [styles.seasonPill, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  lightTap();
                  navigation.getParent()?.navigate('SeasonSummary', { seasonId: activeSeason.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Active season: ${activeSeason.name}. Tap to view summary.`}
              >
                <Animated.View style={{ opacity: seasonBreathAnim }}>
                  <Feather name="calendar" size={20} color={C.bronze} />
                </Animated.View>
                <Text style={styles.seasonPillText}>{activeSeason.name}</Text>
                <Feather name="chevron-right" size={14} color={C.textMuted} />
              </Pressable>
              <Pressable
                onPress={goToPastSeasons}
                style={({ pressed }) => pressed && { opacity: 0.7 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="View all seasons"
              >
                <Text style={styles.viewAllSeasonsText}>view all seasons</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.seasonStatusRow, pressed && { opacity: 0.7 }]}
              onPress={() => { lightTap(); closeAllModals(); setShowStartSheet(true); }}
              accessibilityRole="button"
              accessibilityLabel="Start a new season"
            >
              <View style={styles.seasonStatusLeft}>
                <Feather name="calendar" size={15} color={C.textMuted} />
                <Text style={styles.seasonStatusText}>no season running</Text>
              </View>
              <View style={styles.seasonStatusRight}>
                <Text style={styles.seasonStatusAction}>start</Text>
                <Feather name="arrow-right" size={14} color={C.bronze} />
              </View>
            </Pressable>
          )}
        </Animated.View>

        {/* ── Hero section + sparkline ──────────────────── */}
        <Animated.View style={[styles.heroSection, heroAnim]}>
          <View style={styles.heroLabelRow}>
            {activeSeason && seasonInsights ? (
              <>
                <Text style={styles.heroLabel}>
                  {activeSeason.emoji ? `${activeSeason.emoji} ` : ''}{activeSeason.name.toUpperCase()}
                </Text>
                <View style={{ flex: 1 }} />
                <View style={styles.seasonDayBadge}>
                  <Text style={styles.seasonDayBadgeText}>day {seasonInsights.dayNumber}</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.heroLabel}>{t.seller.sdThisMonth.toUpperCase()}</Text>
                <View style={{ flex: 1 }} />
                {currentOrders.length > 0 && (
                  <View style={styles.seasonDayBadge}>
                    <Text style={styles.seasonDayBadgeText}>
                      {currentOrders.length} {currentOrders.length === 1 ? 'order' : t.seller.orders}
                    </Text>
                  </View>
                )}
              </>
            )}
            <Pressable
              style={({ pressed }) => [styles.qrButton, pressed && { opacity: 0.7 }]}
              onPress={() => {
                lightTap();
                if (paymentQrs.length > 0) {
                  closeAllModals();
                  setQrViewIndex(0);
                  setQrModalVisible(true);
                } else {
                  Alert.alert(
                    'No Payment QR',
                    'Add your payment QR code in Settings so you can show it here.',
                    [
                      { text: 'Later', style: 'cancel' },
                      { text: 'Go to Settings', onPress: () => navigation.navigate('SellerSettings', { scrollTo: 'qr' }) },
                    ]
                  );
                }
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Show payment QR"
            >
              <Feather name="maximize" size={20} color={paymentQrs.length > 0 ? C.bronze : C.textMuted} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.shopLinkBtn, pressed && { opacity: 0.7 }]}
              onPress={() => {
                lightTap();
                setShopModalSlug(shopSlug || '');
                setShopModalName(shopDisplayName || '');
                setShopModalNotice(shopNotice || '');
                setShopError(null);
                closeAllModals();
                setShowShopModal(true);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="My shop link"
            >
              <Feather name="link-2" size={22} color={shopLinkUrl ? semantic(BIZ_SAFE.success, isDark) : C.textMuted} />
            </Pressable>
          </View>

          {activeSeason && seasonInsights ? (
            <>
              <Pressable
                onPress={() => navigation.getParent()?.navigate('SeasonSummary', { seasonId: activeSeason.id })}
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <Text
                  style={[styles.heroAmount, { color: C.textPrimary }]}
                  accessibilityLabel={`Kept this season: ${formatAmount(heroDisplayValue, currency)}`}
                >
                  {displayKept !== null ? `${currency} ${displayKept.toLocaleString()}` : formatAmount(heroDisplayValue, currency, 0)}
                </Text>
                <Text style={styles.seasonKeptLabel}>kept so far</Text>
              </Pressable>
              {seasonInsights.costs > 0 && (
                <Text style={[styles.heroCostsSubtitle, heroDisplayValue < 0 && { color: semantic(BIZ_SAFE.loss, isDark) }]}>
                  after {formatAmount(seasonInsights.costs, currency, 0)} in costs
                </Text>
              )}
              {seasonInsights.targetPct !== null && (
                <View style={styles.seasonTargetWrap}>
                  <View style={styles.seasonTargetTrack}>
                    <View style={[styles.seasonTargetFill, { width: `${Math.min(100, seasonInsights.targetPct)}%` }]} />
                  </View>
                  <Text style={styles.seasonTargetText}>
                    {seasonInsights.targetPct >= 100
                      ? 'target reached!'
                      : `${seasonInsights.targetPct.toFixed(0)}% of target`}
                  </Text>
                </View>
              )}
              {seasonInsights.breakEvenDay != null && (
                <View style={styles.seasonBreakEven}>
                  <Feather name="check-circle" size={12} color={C.bronze} />
                  <Text style={styles.seasonBreakEvenText}>
                    covered costs · day {seasonInsights.breakEvenDay}
                  </Text>
                </View>
              )}
              <Text style={styles.heroMargin}>
                {seasonInsights.todaysOrderCount > 0
                  ? `today ${formatAmount(seasonInsights.todaysCameIn, currency, 0)} · ${seasonInsights.todaysOrderCount} order${seasonInsights.todaysOrderCount === 1 ? '' : 's'}`
                  : seasonInsights.totalOrders > 0
                    ? `${seasonInsights.totalOrders} orders this season`
                    : 'your first order will appear here'}
              </Text>
              {seasonInsights.totalOrders > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.heroSparkline, pressed && { opacity: 0.7 }]}
                  onPress={goToOrders}
                  accessibilityRole="button"
                  accessibilityLabel="7-day season activity"
                >
                  <View style={styles.heroSparklineBars}>
                    {seasonWeekly.map((day, i) => {
                      const heightPct = seasonSparkMax > 0 ? (day.count / seasonSparkMax) * 100 : 0;
                      const isAct = isToday(day.date);
                      return (
                        <View key={i} style={styles.heroSparklineCol}>
                          <View style={styles.heroSparklineTrack}>
                            <View
                              style={[
                                styles.heroSparklineBar,
                                {
                                  height: `${Math.max(heightPct, 6)}%`,
                                  backgroundColor: isAct
                                    ? withAlpha(C.bronze, 0.85)
                                    : withAlpha(C.bronze, 0.15),
                                },
                              ]}
                            />
                          </View>
                          <Text style={[styles.heroSparklineLabel, isAct && styles.heroSparklineLabelActive]}>
                            {day.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.heroSparklineHint}>
                    {seasonWeekly.reduce((s, d) => s + d.count, 0)} orders this week
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Text
                style={[styles.heroAmount, { color: C.textPrimary }]}
                accessibilityLabel={`Orders this month: ${formatAmount(totalOrderValue, currency)}`}
              >
                {displayKept !== null ? `${currency} ${displayKept.toLocaleString()}` : formatAmount(totalOrderValue, currency, 0)}
              </Text>
              {currentOrders.length > 0 && totalIncome > 0 && (
                <View style={styles.heroCollectionWrap}>
                  <View style={styles.heroCollectionTrack}>
                    <View style={[styles.heroCollectionFill, { width: `${Math.min(collectionRate, 100)}%` }]} />
                  </View>
                  <Text style={styles.heroCollectionText}>
                    {formatAmount(totalIncome, currency, 0)} {t.seller.sdCollected}
                  </Text>
                </View>
              )}
              {todaysOrders.length > 0 && (
                <Text style={styles.heroMargin}>
                  today {formatAmount(todaysCameIn, currency, 0)} · {todaysOrders.length} {todaysOrders.length === 1 ? 'order' : t.seller.orders}
                </Text>
              )}
            </>
          )}
        </Animated.View>

        {/* ── Production checklist (preview) ──────────────── */}
        {productionList.length > 0 && !isFirstTime && (
          <Animated.View style={urgencyAnim}>
            <Pressable
              style={({ pressed }) => [styles.itemStatsCard, pressed && { opacity: 0.8 }]}
              onPress={() => { lightTap(); closeAllModals(); setShowItemsModal(true); }}
            >
              <View style={styles.productionHeader}>
                <View style={styles.productionHeaderLeft}>
                  <Feather name="list" size={16} color={C.bronze} />
                  <Text style={styles.productionHeaderText}>TO MAKE</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                  <Text style={styles.productionCount}>{checkedCount}/{productionList.length} done</Text>
                  <Feather name="chevron-right" size={14} color={C.textMuted} />
                </View>
              </View>
              <View style={styles.productionProgressTrack}>
                <View style={[styles.productionProgressFill, { width: `${(checkedCount / productionList.length) * 100}%` }]} />
              </View>
              {productionList.slice(0, 4).map((item, index) => {
                const done = !!checkedItems[item.name];
                return (
                  <Pressable
                    key={item.name}
                    style={({ pressed }) => [styles.productionRow, index === Math.min(productionList.length, 4) - 1 && styles.productionRowLast, pressed && { opacity: 0.7 }]}
                    unstable_pressDelay={50}
                    onPress={() => { toggleChecked(item.name); }}
                  >
                    <View style={styles.productionItemLeft}>
                      <View style={[styles.productionCheckbox, done && styles.productionCheckboxDone]}>
                        {done && <Feather name="check" size={12} color={C.surface} />}
                      </View>
                      <Text style={[styles.productionItemName, done && styles.productionItemNameDone]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                    <Text style={[styles.productionItemQty, done && styles.productionItemQtyDone]}>
                      {item.qty} {item.unit}
                    </Text>
                  </Pressable>
                );
              })}
              {productionList.length > 4 && (
                <View style={styles.itemStatsMore}>
                  <Text style={styles.itemStatsMoreText}>+{productionList.length - 4} more items</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        )}

        {/* ── To collect card ─────────────────────────── */}
        {unpaidAging && !isFirstTime && (() => {
          const bucketCount = (unpaidAging.older.length > 0 ? 1 : 0) + (unpaidAging.twoWeeks.length > 0 ? 1 : 0) + (unpaidAging.week.length > 0 ? 1 : 0);
          return (
          <Animated.View style={pipelineAnim}>
            <Pressable
              style={({ pressed }) => [styles.toCollectCard, pressed && { opacity: 0.7 }]}
              onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'unpaid' }); }}
              accessibilityRole="button"
              accessibilityLabel={`${unpaidAging.total} unpaid orders, ${formatAmount(unpaidTotal, currency, 0)}`}
            >
              <View style={styles.toCollectHeader}>
                <View style={styles.productionHeaderLeft}>
                  <Feather name="dollar-sign" size={16} color={C.bronze} />
                  <Text style={[styles.productionHeaderText]}>{t.seller.sdToCollect.toUpperCase()}</Text>
                </View>
                <Text style={styles.toCollectAmount}>{formatAmount(unpaidTotal, currency, 0)}</Text>
              </View>
              {bucketCount > 1 ? (
                <>
                  {unpaidAging.older.length > 0 && (
                    <View style={styles.toCollectRow}>
                      <View style={styles.toCollectRowLeft}>
                        <View style={[styles.toCollectDot, styles.toCollectDotOverdue]} />
                        <Text style={styles.toCollectRowText}>{unpaidAging.older.length} {t.seller.sdOverdue} · {'>'} 14 days</Text>
                      </View>
                      <Feather name="chevron-right" size={14} color={C.textMuted} />
                    </View>
                  )}
                  {unpaidAging.twoWeeks.length > 0 && (
                    <View style={styles.toCollectRow}>
                      <View style={styles.toCollectRowLeft}>
                        <View style={styles.toCollectDot} />
                        <Text style={styles.toCollectRowText}>{unpaidAging.twoWeeks.length} · 1–2 weeks</Text>
                      </View>
                      <Feather name="chevron-right" size={14} color={C.textMuted} />
                    </View>
                  )}
                  {unpaidAging.week.length > 0 && (
                    <View style={styles.toCollectRow}>
                      <View style={styles.toCollectRowLeft}>
                        <View style={styles.toCollectDot} />
                        <Text style={styles.toCollectRowText}>{unpaidAging.week.length} {t.seller.sdRecent}</Text>
                      </View>
                      <Feather name="chevron-right" size={14} color={C.textMuted} />
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.toCollectRow}>
                  <Text style={styles.toCollectRowText}>{unpaidAging.total} {t.seller.sdViewUnpaid}</Text>
                  <Feather name="chevron-right" size={14} color={C.textMuted} />
                </View>
              )}
            </Pressable>
          </Animated.View>
          );
        })()}

        {/* ── Quick actions — secondary shortcuts ────── */}
        <Animated.View style={quickActionsAnim}>
          <View style={styles.quickActionsRow}>
            <Pressable
              style={({ pressed }) => [styles.quickActionButton, { borderColor: withAlpha(C.gold, 0.25), backgroundColor: withAlpha(C.gold, 0.08) }, pressed && { opacity: 0.7 }]}
              onPress={goToProducts}
              accessibilityRole="button"
              accessibilityLabel="View products"
            >
              <Feather name="package" size={16} color={C.gold} />
              <Text style={[styles.quickActionLabel, { color: C.gold }]}>products</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.quickActionButton, pressed && { opacity: 0.7 }]}
              onPress={goToCosts}
              accessibilityRole="button"
              accessibilityLabel="Manage costs"
            >
              <Feather name="shopping-bag" size={16} color={C.bronze} />
              <Text style={styles.quickActionLabel}>costs</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.quickActionButton, { borderColor: withAlpha(semantic(BIZ_SAFE.success, isDark), 0.25), backgroundColor: withAlpha(semantic(BIZ_SAFE.success, isDark), 0.08) }, pressed && { opacity: 0.7 }]}
              onPress={() => { lightTap(); navigation.navigate('SellerOrders', { initialFilter: 'online' }); }}
              accessibilityRole="button"
              accessibilityLabel="View online orders"
            >
              <Feather name="globe" size={16} color={semantic(BIZ_SAFE.success, isDark)} />
              <Text style={[styles.quickActionLabel, { color: semantic(BIZ_SAFE.success, isDark) }]}>online</Text>
              {unseenOnlineCount > 0 && (
                <View style={styles.notiBadge}>
                  <Text style={styles.notiBadgeText}>{unseenOnlineCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </Animated.View>

        {/* ── First-time getting started ─────────────── */}
        {isFirstTime ? (
          <Animated.View style={[styles.gettingStartedCard, gettingStartedAnim]}>
            <Text style={styles.gettingStartedTitle}>Let's get started 👋</Text>
            <Text style={styles.gettingStartedSubtitle}>
              3 simple steps to set up your store
            </Text>

            {/* Step 1: Start a season */}
            {!seasonDone && (
            <View style={styles.gettingStartedStep}>
              <Pressable
                style={({ pressed }) => [styles.stepLeft, pressed && { opacity: 0.7 }]}
                onPress={goToPastSeasons}
                accessibilityRole="button"
                accessibilityLabel="Step 1: Start a season"
              >
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <Feather name="calendar" size={18} color={C.textPrimary} style={styles.stepIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepText}>start a season</Text>
                  <Text style={styles.stepHint}>e.g. Raya 2025, CNY, or any event</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
                onPress={() => skipOnboardingStep('season')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.skipText}>skip</Text>
              </Pressable>
            </View>
            )}

            {/* Step 2: Add products */}
            {!productsDone && (
            <View style={styles.gettingStartedStep}>
              <Pressable
                style={({ pressed }) => [styles.stepLeft, pressed && { opacity: 0.7 }]}
                onPress={goToProducts}
                accessibilityRole="button"
                accessibilityLabel="Step 2: Add products"
              >
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <Feather name="package" size={18} color={C.textPrimary} style={styles.stepIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepText}>add your products</Text>
                  <Text style={styles.stepHint}>name, price, and unit</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
                onPress={() => skipOnboardingStep('products')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.skipText}>skip</Text>
              </Pressable>
            </View>
            )}

            {/* Step 3: Take first order */}
            {!ordersDone && (
            <View style={[styles.gettingStartedStep, styles.gettingStartedStepLast]}>
              <Pressable
                style={({ pressed }) => [styles.stepLeft, pressed && { opacity: 0.7 }]}
                onPress={goToNewOrder}
                accessibilityRole="button"
                accessibilityLabel="Step 3: Create an order"
              >
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <Feather name="clipboard" size={18} color={C.textPrimary} style={styles.stepIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepText}>record your first order</Text>
                  <Text style={styles.stepHint}>customer name, product, quantity</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
                onPress={() => skipOnboardingStep('orders')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.skipText}>skip</Text>
              </Pressable>
            </View>
            )}
          </Animated.View>
        ) : (
          <>
            {/* ── Empty state (no orders this month) ────── */}
            {currentOrders.length === 0 && (
              <Animated.View style={[styles.emptyStateCard, emptyStateAnim]}>
                <Feather name="calendar" size={32} color={C.textMuted} />
                <Text style={styles.emptyStateTitle}>no orders this month yet.</Text>
                <Text style={styles.emptyStateSubtitle}>tap + to record a new order.</Text>
                <Pressable
                  style={({ pressed }) => [styles.emptyStateCta, pressed && { opacity: 0.7 }]}
                  onPress={goToNewOrder}
                  accessibilityRole="button"
                  accessibilityLabel="Create new order"
                >
                  <Feather name="plus" size={16} color={C.bronze} />
                  <Text style={styles.emptyStateCtaText}>new order</Text>
                </Pressable>
              </Animated.View>
            )}

            {/* ── Delivery route ──────────────────────────── */}
            {todaysDeliveries.length > 0 && (
              <Animated.View style={[styles.deliveryRouteCard, deliveryRouteAnim]}>
                <View style={styles.deliveryRouteHeader}>
                  <View style={styles.deliveryRouteHeaderLeft}>
                    <Feather name="truck" size={16} color={C.gold} />
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
                        <Pressable
                          style={({ pressed }) => pressed && { opacity: 0.7 }}
                          onPress={() => handleOpenMaps(delivery.address!)}
                          accessibilityRole="link"
                          accessibilityLabel={`Open map for ${delivery.address}`}
                        >
                          <Text style={styles.deliveryRouteAddress} numberOfLines={1}>
                            {delivery.address}
                          </Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.deliveryRouteNoAddress}>no address</Text>
                      )}
                    </View>
                    <View style={styles.deliveryRouteActions}>
                      {delivery.customerPhone && (
                        <Pressable
                          style={({ pressed }) => [styles.deliveryRouteCall, pressed && { opacity: 0.7 }]}
                          onPress={() => { lightTap(); Linking.openURL(`tel:${delivery.customerPhone}`); }}
                          accessibilityRole="button"
                          accessibilityLabel={`Call ${delivery.customerName}`}
                        >
                          <Feather name="phone" size={16} color={C.gold} />
                        </Pressable>
                      )}
                      {delivery.customerPhone && (
                        <Pressable
                          style={({ pressed }) => [styles.deliveryRouteCall, pressed && { opacity: 0.7 }]}
                          onPress={() => handleWhatsApp(delivery.customerPhone!)}
                          accessibilityRole="button"
                          accessibilityLabel={`WhatsApp ${delivery.customerName}`}
                        >
                          <Feather name="message-circle" size={16} color={C.gold} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* ── Came in breakdown ──────────────────── */}
            {(totalIncome > 0 || totalCosts > 0) && (
            <Animated.View style={[styles.cameInCard, inflowAnim]}>
              {/* Came in row */}
              <View style={styles.cameInRow}>
                <View style={styles.cameInRowLeft}>
                  <Feather name="arrow-down-circle" size={15} color={semantic(BIZ_SAFE.success, isDark)} />
                  <Text style={styles.cameInRowLabel}>came in</Text>
                </View>
                <Text style={styles.cameInRowAmount}>{formatAmount(totalIncome, currency)}</Text>
              </View>

              {/* Costs row */}
              <View style={styles.cameInRow}>
                <View style={styles.cameInRowLeft}>
                  <Feather name="shopping-bag" size={15} color={C.bronze} />
                  <Text style={styles.cameInRowLabel}>costs</Text>
                </View>
                <Text style={styles.cameInRowAmount}>{formatAmount(totalCosts, currency)}</Text>
              </View>

              {/* Divider */}
              <View style={styles.cameInDivider} />

              {/* Kept row */}
              <View style={[styles.cameInRow, { paddingVertical: 0 }]}>
                <View style={styles.cameInRowLeft}>
                  <Feather name="pocket" size={15} color={kept >= 0 ? C.bronze : semantic(BIZ_SAFE.loss, isDark)} />
                  <Text style={[styles.cameInKeptLabel, { color: kept >= 0 ? C.bronze : semantic(BIZ_SAFE.loss, isDark) }]}>kept</Text>
                </View>
                <Text style={[styles.cameInKeptAmount, { color: kept >= 0 ? C.bronze : semantic(BIZ_SAFE.loss, isDark) }]}>
                  {formatAmount(kept, currency)}
                </Text>
              </View>
            </Animated.View>
            )}
          </>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* ── Shop link modal ──────────────────────────────── */}
      {showShopModal && (
      <Modal
        visible
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setShowShopModal(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: withAlpha(C.dimBg, 0.4) }}>
        <Pressable
          style={styles.shopModalOverlay}
          onPress={() => { Keyboard.dismiss(); setShowShopModal(false); }}
        >
          <Pressable style={styles.shopModalCard} onPress={() => Keyboard.dismiss()}>

          <View style={styles.shopModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shopModalTitle}>
                my shop <Text style={styles.shopModalTitleAccent}>link</Text>
              </Text>
              <Text style={styles.shopModalSubtitle}>set up your online order page</Text>
            </View>
            <Pressable
              onPress={() => setShowShopModal(false)}
              style={({ pressed }) => [styles.shopModalCloseBtn, pressed && { opacity: 0.7 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={16} color={C.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={styles.shopModalScroll}
          >
            {/* ── Your Link ── */}
            {shopModalSlug.length > 0 && shopSlug && (
              <Pressable
                style={({ pressed }) => [styles.slmLinkCard, pressed && { opacity: 0.7 }]}
                onPress={async () => {
                  const url = `${ORDER_PAGE_BASE}/?slug=${shopSlug}`;
                  await Clipboard.setStringAsync(url);
                  setShopLinkCopied(true);
                  setTimeout(() => setShopLinkCopied(false), 2000);
                }}
              >
                <View style={styles.slmLinkIconWrap}>
                  <Feather name="globe" size={16} color={semantic(BIZ_SAFE.success, isDark)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slmLinkUrl} numberOfLines={1}>
                    {ORDER_PAGE_BASE}/?slug={shopModalSlug}
                  </Text>
                </View>
                <View style={styles.slmCopyPill}>
                  <Feather name={shopLinkCopied ? 'check' : 'copy'} size={13} color={shopLinkCopied ? C.textMuted : semantic(BIZ_SAFE.success, isDark)} />
                  <Text style={[styles.slmCopyPillText, shopLinkCopied && { color: C.textMuted }]}>
                    {shopLinkCopied ? 'copied' : 'copy'}
                  </Text>
                </View>
              </Pressable>
            )}

            {/* ── Shop Logo ── */}
            <View style={styles.logoPickerWrap}>
              <View style={styles.logoCircleWrap}>
                <Pressable
                  style={({ pressed }) => [styles.logoCircle, pressed && { opacity: 0.7 }]}
                  onPress={shopLogoUrl ? () => setPreviewLogoVisible(true) : handlePickLogo}
                  disabled={shopLogoUploading}
                >
                  {shopLogoUploading ? (
                    <Feather name="loader" size={20} color={C.textMuted} />
                  ) : shopLogoUrl ? (
                    <Image source={{ uri: shopLogoUrl }} style={styles.logoImage} />
                  ) : (
                    <Feather name="shopping-bag" size={22} color={C.textMuted} />
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.logoBadge, pressed && { opacity: 0.7 }]}
                  onPress={handlePickLogo}
                  disabled={shopLogoUploading}
                >
                  <Feather name="camera" size={10} color={C.onAccent} />
                </Pressable>
              </View>
              <Pressable onPress={handlePickLogo} disabled={shopLogoUploading} style={({ pressed }) => pressed && { opacity: 0.7 }}>
                <Text style={styles.logoLabel}>
                  {shopLogoUploading ? 'uploading...' : shopLogoUrl ? 'change logo' : 'add shop logo'}
                </Text>
              </Pressable>
            </View>

            {/* ── Shop Name ── */}
            <View style={styles.slmFieldCard}>
              <Text style={styles.slmFieldLabel}>shop name</Text>
              <TextInput
                style={styles.slmFieldInput}
                value={shopModalName}
                onChangeText={setShopModalName}
                placeholder="e.g. Kedai Mak Ton"
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                autoCapitalize="words"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={semantic(BIZ_SAFE.success, isDark)}
              />
            </View>

            {/* ── Shop URL ── */}
            <View style={styles.slmFieldCard}>
              <Text style={styles.slmFieldLabel}>
                shop url{' '}
                {!shopSlug && <Text style={styles.slmFieldHint}>(lowercase, numbers, -)</Text>}
              </Text>
              <TextInput
                style={[styles.slmFieldInput, !!shopSlug && { color: C.textMuted }]}
                value={shopModalSlug}
                onChangeText={(t) => setShopModalSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g. kedai-mak-ton"
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!shopSlug}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={semantic(BIZ_SAFE.success, isDark)}
              />
              <Text style={[styles.slmFieldHint, { marginTop: 4, color: shopSlug ? C.textMuted : C.bronze }]}>
                {shopSlug ? 'link cannot be changed' : 'choose carefully — this is permanent'}
              </Text>
            </View>

            {/* ── WhatsApp ── */}
            <View style={styles.slmFieldCard}>
              <View style={styles.slmFieldLabelRow}>
                <Text style={styles.slmFieldLabel}>whatsapp</Text>
                <View style={styles.slmRequiredPill}>
                  <Text style={styles.slmRequiredPillText}>required</Text>
                </View>
              </View>
              <Text style={styles.slmFieldValue}>
                {useAuthStore.getState().phone ?? '(not set)'}
              </Text>
              <Text style={[styles.slmFieldHint, { marginTop: 4 }]}>
                customers tap this to whatsapp you
              </Text>
            </View>

            {/* ── Customer Notice ── */}
            <View style={styles.slmFieldCard}>
              <View style={styles.slmFieldLabelRow}>
                <Text style={styles.slmFieldLabel}>customer notice</Text>
                <Text style={styles.slmFieldHintInline}>optional</Text>
              </View>
              <TextInput
                style={[styles.slmFieldInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={shopModalNotice}
                onChangeText={setShopModalNotice}
                placeholder="e.g. COD Ipoh only. Luar kawasan sila WhatsApp kami"
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                multiline
                maxLength={200}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={semantic(BIZ_SAFE.success, isDark)}
              />
              <Text style={[styles.slmFieldHint, { marginTop: 4 }]}>
                shown on your order page
              </Text>
            </View>

            {shopError && (
              <View style={styles.shopModalErrorBox}>
                <Feather name="alert-circle" size={14} color={C.bronze} />
                <Text style={styles.shopModalErrorText}>{shopError}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [styles.shopModalSaveBtn, (shopSaving || !shopModalSlug) && { opacity: 0.5 }, pressed && shopModalSlug && !shopSaving && { opacity: 0.85 }]}
              disabled={shopSaving || !shopModalSlug}
              onPress={handleSaveShopLink}
            >
              <Feather name="check" size={16} color={C.onAccent} />
              <Text style={styles.shopModalSaveBtnText}>
                {shopSaving ? 'saving...' : 'save shop link'}
              </Text>
            </Pressable>
          </ScrollView>
          </Pressable>
        </Pressable>
        {previewLogoVisible && shopLogoUrl && (
          <Pressable
            style={styles.logoPreviewOverlay}
            onPress={() => setPreviewLogoVisible(false)}
          >
            <Image source={{ uri: shopLogoUrl }} style={styles.logoPreviewImage} resizeMode="contain" />
          </Pressable>
        )}
        </KeyboardAvoidingView>
        <ModalToastHost />
      </Modal>
      )}

      {/* ── Slug confirm modal ────────────────────────────── */}
      {showSlugConfirm && (
      <Modal
        visible
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowSlugConfirm(false)}
      >
        <View style={styles.slmConfirmOverlay}>
          <View style={styles.slmConfirmCard}>
            <View style={{ alignItems: 'center', marginBottom: SPACING.md }}>
              <View style={styles.slmConfirmIconWrap}>
                <Feather name="link-2" size={20} color={semantic(BIZ_SAFE.success, isDark)} />
              </View>
              <Text style={styles.slmConfirmTitle}>confirm shop link</Text>
            </View>

            <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, textAlign: 'center', marginBottom: SPACING.sm }}>
              your shop url will be
            </Text>
            <View style={[styles.slmLinkCard, { marginBottom: SPACING.md }]}>
              <Text style={styles.slmLinkUrl} numberOfLines={2}>
                {ORDER_PAGE_BASE}/?slug={shopModalSlug}
              </Text>
            </View>
            <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.bronze, textAlign: 'center', marginBottom: SPACING.lg, fontWeight: TYPOGRAPHY.weight.medium }}>
              this cannot be changed later
            </Text>

            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <Pressable
                style={({ pressed }) => [styles.slmConfirmCancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => { closeAllModals(); setTimeout(() => setShowShopModal(true), 50); }}
              >
                <Text style={styles.slmConfirmCancelText}>go back</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.slmConfirmBtn, pressed && { opacity: 0.8 }]}
                onPress={() => { setShowSlugConfirm(false); doSaveShopLink(); }}
              >
                <Feather name="check" size={15} color={C.onAccent} />
                <Text style={styles.shopModalSaveBtnText}>confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <ModalToastHost />
      </Modal>
      )}

      {/* ── All items modal ───────────────────────────────── */}
      {showItemsModal && (
        <Modal
          visible
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setShowItemsModal(false)}
        >
          <Pressable
            style={styles.itemsModalOverlay}
            onPress={() => setShowItemsModal(false)}
          >
            <View style={styles.itemsModalCard} onStartShouldSetResponder={() => true}>
              <View style={styles.itemsModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Feather name="list" size={16} color={C.bronze} />
                  <Text style={styles.itemsModalTitle}>to make</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Text style={styles.productionCount}>{checkedCount}/{productionList.length} done</Text>
                  <Pressable onPress={() => setShowItemsModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Feather name="x" size={18} color={C.textMuted} />
                  </Pressable>
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} bounces={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {productionList.map((item, index) => {
                  const done = !!checkedItems[item.name];
                  return (
                    <Pressable
                      key={item.name}
                      style={({ pressed }) => [styles.productionRow, index === productionList.length - 1 && styles.productionRowLast, pressed && { opacity: 0.7 }]}
                      unstable_pressDelay={50}
                      onPress={() => toggleChecked(item.name)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                    >
                      <View style={styles.productionItemLeft}>
                        <View style={[styles.productionCheckbox, done && styles.productionCheckboxDone]}>
                          {done && <Feather name="check" size={12} color={C.surface} />}
                        </View>
                        <Text style={[styles.productionItemName, done && styles.productionItemNameDone]}>
                          {item.name}
                        </Text>
                      </View>
                      <Text style={[styles.productionItemQty, done && styles.productionItemQtyDone]}>
                        {item.qty} {item.unit}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
          <ModalToastHost />
        </Modal>
      )}

      {/* QR Fullscreen Modal */}
      {qrModalVisible && (
      <Modal
        visible
        transparent
        animationType="none"
        onRequestClose={() => setQrModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.qrModalOverlay}>
          <StatusBar barStyle="light-content" />
          <Pressable
            style={styles.qrCloseBtn}
            onPress={() => setQrModalVisible(false)}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Feather name="x" size={28} color="#fff" />
          </Pressable>

          {paymentQrs[qrViewIndex] && (
            <Text style={styles.qrLabel}>{paymentQrs[qrViewIndex].label}</Text>
          )}

          {paymentQrs[qrViewIndex] && (
            <Image
              source={{ uri: paymentQrs[qrViewIndex].uri }}
              style={styles.qrFullImage}
              resizeMode="contain"
            />
          )}

          {/* Watermark below QR */}
          <Text style={styles.qrWatermark}>potraces</Text>

          {paymentQrs.length > 1 && (
            <View style={styles.qrTabs}>
              {paymentQrs.map((qr, i) => (
                <Pressable
                  key={i}
                  style={[styles.qrTab, qrViewIndex === i && styles.qrTabActive]}
                  onPress={() => { lightTap(); setQrViewIndex(i); }}
                >
                  <Text style={[styles.qrTabText, qrViewIndex === i && styles.qrTabTextActive]}>
                    {qr.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <ModalToastHost />
      </Modal>
      )}

      <SeasonStartSheet
        visible={showStartSheet}
        onClose={() => setShowStartSheet(false)}
        onViewPast={goToPastSeasons}
      />
    </View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  topRow: {
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING['2xl'], // 24pt
    paddingBottom: SPACING['5xl'],     // 48pt
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },

  // ── Sync status (CF-52) ─────────────────────────────────────
  syncStatusText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'right' as const,
    marginTop: SPACING.xs,
  },

  // ── Season context ────────────────────────────────────────
  seasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
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
    color: C.textPrimary,
  },
  seasonStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  seasonStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  seasonStatusText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  seasonStatusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  seasonStatusAction: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: C.bronze,
  },
  viewAllSeasonsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    textDecorationLine: 'underline',
  },

  // ── Urgency section ──────────────────────────────────────
  urgencyCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
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
    borderBottomColor: C.border,
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
    backgroundColor: C.textMuted,
  },
  urgencyDotOverdue: {
    backgroundColor: BIZ.overdue,
  },
  urgencyDotToday: {
    backgroundColor: C.gold,
  },
  urgencyTextOverdue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.overdue,
  },
  urgencyTextToday: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  urgencyTextTomorrow: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
  },
  urgencyNames: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: SPACING.sm,
  },
  urgencyNamesText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
  },

  // ── Unpaid aging card ──────────────────────────────────
  unpaidAgingCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    borderLeftColor: BIZ.overdue,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  unpaidAgingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 36,
  },
  unpaidAgingText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: BIZ.overdue,
    flex: 1,
  },
  unpaidAgingAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
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
    backgroundColor: C.deepOliveBiz,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  primaryCtaText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.2,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
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
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  quickActionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
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
    color: C.onAccent,
  },

  // ── Hero section ──────────────────────────────────────────
  heroSection: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  heroLabel: {
    ...TYPE.label, // fontSize 12, color #6B6B6B, uppercase, letterSpacing 1
  },
  heroMomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withAlpha(C.bronze, 0.08),
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
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    letterSpacing: C === CALM_DARK ? -0.8 : -1,
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
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Season hero ─────────────────────────────────────────────
  seasonDayBadge: {
    backgroundColor: withAlpha(C.bronze, C === CALM_DARK ? 0.15 : 0.08),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
    marginRight: SPACING.xs,
  },
  seasonDayBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  seasonKeptLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: -2,
  },
  seasonTargetWrap: {
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  seasonTargetTrack: {
    height: 8,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  seasonTargetFill: {
    height: 8,
    backgroundColor: C.bronze,
    borderRadius: 4,
  },
  seasonTargetText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  seasonBreakEven: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  seasonBreakEvenText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
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
    color: C.textMuted,
    marginTop: 3,
    textTransform: 'lowercase' as const,
  },
  heroSparklineLabelActive: {
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  heroSparklineHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
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
    marginBottom: SPACING.md,
  },
  breakEvenCardCovered: {
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderColor: withAlpha(C.bronze, 0.25),
  },
  breakEvenCardShort: {
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderColor: withAlpha(C.bronze, 0.25),
  },
  breakEvenText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── AI insight ────────────────────────────────────────────
  insightContainer: {
    borderLeftWidth: 3,
    borderLeftColor: C.bronze,
    paddingLeft: SPACING.lg, // 16pt
    marginBottom: SPACING.xl,
  },
  insightText: {
    ...TYPE.insight, // fontSize 14, lineHeight 22
    color: C.textSecondary, // #6B6B6B
  },

  // ── Getting started card ──────────────────────────────────
  gettingStartedCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    borderBottomColor: C.border, // #EBEBEB
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
    backgroundColor: C.border, // #EBEBEB
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm, // 8pt
  },
  stepNumberDone: {
    backgroundColor: C.bronze,
  },
  stepNumberText: {
    fontSize: TYPOGRAPHY.size.xs, // 11
    fontWeight: TYPOGRAPHY.weight.bold, // 700
    color: C.textSecondary, // #6B6B6B
    fontVariant: ['tabular-nums'],
  },
  stepIcon: {
    marginRight: SPACING.sm, // 8pt
  },
  stepText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  stepTextDone: {
    color: C.textMuted,
    textDecorationLine: 'line-through',
  },
  stepHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingTop: SPACING.xs,
  },
  skipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // ── Action cards (pipeline replacement) ───────────────────
  actionCardsRow: {
    flexDirection: 'row',
    gap: SPACING.sm, // 8pt
    marginBottom: SPACING.xl, // 24pt
  },
  actionCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textPrimary, // #1A1A1A
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
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.bronze,
  },
  productionCount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  productionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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
    color: C.textPrimary,
  },
  productionItemQty: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Came in breakdown ─────────────────────────────────────
  cameInCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    marginBottom: SPACING.xl,
  },
  cameInRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs + 2,
  },
  cameInRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  cameInRowLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
  },
  cameInRowAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  cameInRowNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.unpaid,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    marginTop: 2,
  },
  cameInDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: SPACING.xs + 2,
  },
  cameInKeptLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  cameInKeptAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
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
    backgroundColor: C.bronze, // #B2780A
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md, // 16pt
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.bold, // 700
    color: C.surface,
  },
  topProductName: {
    ...TYPE.insight, // fontSize 14, lineHeight 22
    color: C.textPrimary, // #1A1A1A
    flex: 1,
  },
  topProductQty: {
    ...TYPE.muted, // fontSize 12, color #A0A0A0
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 6,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: 3,
    marginLeft: 24 + SPACING.md, // aligned with product name (past rank badge)
  },
  barFill: {
    height: 6,
    backgroundColor: withAlpha(C.bronze, 0.20),
    borderRadius: 3,
  },

  // ── Today's came in row ────────────────────────────────
  cameInOuterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    minHeight: 44,
  },
  cameInOuterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  cameInOuterLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  cameInOuterValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    marginLeft: 'auto' as const,
  },
  cameInOuterCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Production checklist additions ─────────────────────
  productionProgressTrack: {
    height: 5,
    backgroundColor: withAlpha(C.bronze, 0.15),
    borderRadius: 3,
    marginBottom: SPACING.sm,
  },
  productionProgressFill: {
    height: 5,
    backgroundColor: C.bronze,
    borderRadius: 3,
  },
  productionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  productionCheckboxDone: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  productionItemNameDone: {
    textDecorationLine: 'line-through' as const,
    color: C.textMuted,
  },
  productionItemQtyDone: {
    color: C.textMuted,
  },

  // ── Delivery route card ────────────────────────────────
  deliveryRouteCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.gold,
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
    borderBottomColor: C.border,
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
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    marginBottom: 2,
  },
  deliveryRouteItems: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginBottom: 2,
  },
  deliveryRouteAddress: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.gold,
    textDecorationLine: 'underline' as const,
  },
  deliveryRouteNoAddress: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
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
    backgroundColor: withAlpha(C.gold, 0.1),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // ── 7-day sparkline ──────────────────────────────────────
  sparklineCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sparklineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sparklineTitle: {
    ...TYPE.label,
    color: C.textSecondary,
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
    color: C.textMuted,
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
    color: C.textMuted,
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
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  // kept for legacy (unused now but avoids TS error if referenced)
  collectionRateLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Top customer ───────────────────────────────────────
  topCustomerCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  topCustomerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
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
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  topCustomerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  topCustomerStat: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  topCustomerDot: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },

  // ── Empty state ────────────────────────────────────────
  emptyStateCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACING['3xl'],
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
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
    backgroundColor: withAlpha(C.bronze, 0.08),
    minHeight: 44,
  },
  emptyStateCtaText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  shopModalCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
  },
  shopModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  shopModalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
  },
  shopModalTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C === CALM_DARK ? BIZ_SAFE.success.dark : BIZ_SAFE.success.light,
  },
  shopModalSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  shopModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -SPACING.sm - 2,
    marginTop: 2,
  },
  shopModalScroll: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.md,
  },
  shopModalErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm - 2,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.sm + 2,
  },
  shopModalErrorText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
    flex: 1,
    lineHeight: 18,
  },
  shopModalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BIZ.success,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md + 2,
    marginTop: SPACING.md,
    minHeight: 52,
  },
  shopModalSaveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },

  // ── Shop logo picker ──
  logoPickerWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: 8,
  },
  logoCircleWrap: {
    width: 80,
    height: 80,
    position: 'relative',
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: withAlpha(BIZ.success, C === CALM_DARK ? 0.10 : 0.06),
    borderWidth: 1.5,
    borderColor: withAlpha(C.textPrimary, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  logoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BIZ.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: C.background,
  },
  logoLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C === CALM_DARK ? BIZ_SAFE.success.dark : BIZ_SAFE.success.light,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  logoPreviewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withAlpha(C.dimBg, 0.9),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  logoPreviewImage: {
    width: '75%',
    aspectRatio: 1,
    borderRadius: 16,
  },

  // ── Shop link modal — field cards ──
  slmFieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  slmFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  slmFieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 4,
  },
  slmFieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: SPACING.sm,
    minHeight: 22,
  },
  slmFieldValue: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 4,
  },
  slmFieldHint: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
    lineHeight: 14,
  },
  slmFieldHintInline: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
  },
  slmRequiredPill: {
    backgroundColor: withAlpha(BIZ.success, 0.08),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  slmRequiredPillText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C === CALM_DARK ? BIZ_SAFE.success.dark : BIZ_SAFE.success.light,
    letterSpacing: 0.3,
  },
  slmLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(BIZ.success, C === CALM_DARK ? 0.10 : 0.06),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(BIZ.success, C === CALM_DARK ? 0.25 : 0.15),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.sm + 2,
  },
  slmLinkIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(BIZ.success, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  slmLinkUrl: {
    fontSize: 12,
    color: BIZ.success,
    lineHeight: 17,
  },
  slmCopyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(BIZ.success, C === CALM_DARK ? 0.12 : 0.08),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
  },
  slmCopyPillText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
  },

  // ── Slug confirm modal ──
  slmConfirmOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  slmConfirmCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 420,
  },
  slmConfirmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withAlpha(BIZ.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  slmConfirmTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  slmConfirmCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  slmConfirmCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  slmConfirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: BIZ.success,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 2,
  },

  // ── Item stats card ──
  itemStatsCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
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
    borderBottomColor: C.border,
    marginBottom: SPACING.xs,
  },
  itemStatsHeaderTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    letterSpacing: 0.3,
  },
  itemStatsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  itemStatsHeaderSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  itemStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: SPACING.sm,
  },
  itemStatsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(C.border, 0.5),
  },
  itemStatsName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  itemStatsCountBadge: {
    backgroundColor: withAlpha(C.bronze, 0.1),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    minWidth: 32,
    alignItems: 'center',
  },
  itemStatsCountText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as any,
  },
  itemStatsMore: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.border, 0.5),
    marginTop: 2,
  },
  itemStatsMoreText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // ── Items modal ──
  itemsModalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  itemsModalCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    width: '100%',
    maxWidth: 420,
    maxHeight: '65%',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  itemsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: SPACING.xs,
  },
  itemsModalTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },

  // ── QR modal ──
  qrButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrModalOverlay: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  qrCloseBtn: { position: 'absolute', top: 72, right: SPACING.xl, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  qrLabel: { position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center', fontSize: TYPOGRAPHY.size['2xl'], fontWeight: TYPOGRAPHY.weight.bold, color: '#fff', zIndex: 10 },
  qrFullImage: { width: SCREEN_WIDTH - SPACING['2xl'] * 2, height: SCREEN_WIDTH - SPACING['2xl'] * 2, borderRadius: RADIUS.lg, backgroundColor: '#fff' },
  qrTabs: { position: 'absolute', bottom: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm, zIndex: 10 },
  qrTab: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.1)' },
  qrTabActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  qrTabText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: 'rgba(255,255,255,0.5)' },
  qrTabTextActive: { color: '#fff' },
  qrWatermark: { marginTop: SPACING.lg, fontSize: 16, fontWeight: TYPOGRAPHY.weight.medium, color: 'rgba(255, 255, 255, 0.5)', letterSpacing: 8, textTransform: 'lowercase' },

  // ── Hero collection progress bar ────────────────────────
  heroCollectionWrap: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  heroCollectionTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(C.bronze, 0.12),
    overflow: 'hidden' as const,
    marginBottom: SPACING.xs,
  },
  heroCollectionFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.bronze,
  },
  heroCollectionText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── To collect card ─────────────────────────────────────
  toCollectCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    overflow: 'hidden' as const,
  },
  toCollectHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  toCollectAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  toCollectRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
    minHeight: 40,
  },
  toCollectRowLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
  },
  toCollectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: withAlpha(C.bronze, 0.3),
  },
  toCollectDotOverdue: {
    backgroundColor: C.bronze,
  },
  toCollectRowText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: C.textSecondary,
  },
});

export default SellerDashboard;
