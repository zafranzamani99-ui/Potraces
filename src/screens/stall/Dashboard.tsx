/* Hallmark · redesign v2: solid bronze hero + asymmetric LIQUID-GLASS bento
 * (expo-glass-effect on iOS 26, expo-blur fallback) with spring-press tiles.
 * genre: app-locked CALM system · surfaces: one solid CTA + glass chrome
 * Glass hard-rules honored: no opacity<1 ancestors, no overflow:'hidden' masking
 * GlassView (fallback blur clips instead), one glass surface per tile.
 * pre-emit critique: P4 H5 E4 S4 R4 V5
 */
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  Animated,
  Easing,
  Image,
  Alert,
  Keyboard,
  TextInput,
  RefreshControl,
  type ViewStyle,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
// The outer scroller is a FlatList (single row), NOT a ScrollView: on this
// Android/Fabric build the ScrollView refresh path never shows the indicator
// (RNGH blocks it — disallowInterruption — and native ScrollView's attach is
// broken too), while VirtualizedList's path works (proven by TransactionsList).
import { FlatList } from 'react-native';
import PullRefresh from '../../components/common/PullRefresh';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { format } from 'date-fns';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { explainStallHistory } from '../../utils/explainStallHistory';
import { lightTap } from '../../services/haptics';
import GlassModeToggle from '../../components/common/GlassModeToggle';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { useNeu } from '../../components/common/neu';
import BottomSheet from '../../components/common/BottomSheet';
import FloatingModal from '../../components/common/FloatingModal';
import BusinessCard from '../../components/business/BusinessCard';
import { tapToPayAvailable } from '../../services/tapToPay';
import type { StallSale, StallPaymentMethod } from '../../types';

// Chosen once at module load (mirrors GlassSegmentedControl).
const GLASS = isLiquidGlassAvailable();
const SPRING = { damping: 18, stiffness: 260, mass: 0.7 } as const;

// ─── Animation helper (identity row only — entrance opacity is banned above glass) ──
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

// ─── GlassTile — one liquid-glass surface + spring-press micro-interaction ───
const GlassTile: React.FC<{
  style?: ViewStyle;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}> = ({ style, onPress, accessibilityLabel, children }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Reanimated.View style={[aStyle, style]}>
      <Pressable
        onPressIn={() => { lightTap(); scale.value = withSpring(0.95, SPRING); }}
        onPressOut={() => { scale.value = withSpring(1, SPRING); }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={tileStyles.press}
      >
        <View style={[tileStyles.inner, !GLASS && tileStyles.clip]}>
          {GLASS ? (
            <GlassView style={[StyleSheet.absoluteFill, tileStyles.shape]} glassEffectStyle="regular" />
          ) : (
            <>
              <BlurView
                style={[StyleSheet.absoluteFill, tileStyles.shape]}
                intensity={isDark ? 30 : 40}
                tint={isDark ? 'dark' : 'light'}
                experimentalBlurMethod="dimezisBlurView"
              />
              <View
                style={[
                  StyleSheet.absoluteFill,
                  tileStyles.shape,
                  {
                    backgroundColor: withAlpha(C.surface, 0.4),
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: withAlpha('#FFFFFF', 0.3),
                  },
                ]}
              />
            </>
          )}
          {children}
        </View>
      </Pressable>
    </Reanimated.View>
  );
};

const tileStyles = StyleSheet.create({
  press: { flex: 1 },
  inner: { flex: 1, borderRadius: RADIUS.xl, padding: SPACING.lg },
  clip: { overflow: 'hidden' }, // fallback (BlurView) only — a native GlassView must NOT be masked
  shape: { borderRadius: RADIUS.xl },
});

// ─── HeroAmount — count-up display number (from-prev, never from zero) ──────
// Same listener pattern as BusinessHeroNumber, but recolorable for the gradient
// hero (that component hard-codes C.textPrimary) and it counts from the
// PREVIOUS amount, so a new sale reads as a quick tick-up, not a full recount.
const HeroAmount: React.FC<{ amount: number; prefix: string; color: string; fontSize: number }> = ({
  amount,
  prefix,
  color,
  fontSize,
}) => {
  const anim = useRef(new Animated.Value(0)).current;
  const prevRef = useRef(0);
  const [text, setText] = useState(`${prefix} 0`);
  useEffect(() => {
    anim.setValue(prevRef.current);
    prevRef.current = amount;
    const id = anim.addListener(({ value }) => setText(`${prefix} ${Math.round(value).toLocaleString()}`));
    Animated.timing(anim, { toValue: amount, duration: 400, useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [amount, prefix]);
  return (
    <Text
      style={{
        fontSize,
        fontWeight: TYPOGRAPHY.weight.bold,
        color,
        fontVariant: ['tabular-nums'],
        letterSpacing: -1,
      }}
      accessibilityLabel={`${prefix} ${Math.round(amount)}`}
    >
      {text}
    </Text>
  );
};

// ─── SplitBar — cash/QR as ONE proportional bar (glanceable across a stall) ──
const SplitBar: React.FC<{
  cash: number;
  qr: number;
  cashLabel: string;
  qrLabel: string;
  cashColor: string;
  qrColor: string;
}> = ({ cash, qr, cashLabel, qrLabel, cashColor, qrColor }) => {
  const total = cash + qr;
  const cashPct = total > 0 ? (cash / total) * 100 : 0;
  const qrPct = total > 0 ? 100 - cashPct : 0;
  return (
    <View style={{ gap: SPACING.sm }}>
      <View style={splitStyles.track}>
        {cashPct > 0 && <View style={[splitStyles.seg, { width: `${cashPct}%`, backgroundColor: cashColor }]} />}
        {qrPct > 0 && <View style={[splitStyles.seg, { width: `${qrPct}%`, backgroundColor: qrColor }]} />}
      </View>
      <View style={splitStyles.labels}>
        <View style={splitStyles.labelRow}>
          <View style={[splitStyles.dot, { backgroundColor: cashColor }]} />
          <Text style={splitStyles.label}>{cashLabel}</Text>
        </View>
        <View style={splitStyles.labelRow}>
          <View style={[splitStyles.dot, { backgroundColor: qrColor }]} />
          <Text style={splitStyles.label}>{qrLabel}</Text>
        </View>
      </View>
    </View>
  );
};

const splitStyles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha('#FFFFFF', 0.18),
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 2,
  },
  seg: { height: 6, borderRadius: 3 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: withAlpha('#FFFFFF', 0.85),
    fontVariant: ['tabular-nums'],
  },
});

// Single-row FlatList data for the outer scroller (see the import comment).
const DASH_PAGE = ['page'];

const StallDashboard: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const {
    sessions,
    activeSessionId,
    getActiveSession,
    getLifetimeStats,
    preOrders,
    pauseSession,
    resumeSession,
    updateSale,
    removeSale,
  } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const businessProfile = useSettingsStore((s) => s.businessProfile);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const activeSession = getActiveSession();
  const hasActiveSession = !!activeSession;
  const pendingPreOrders = useMemo(() => preOrders.filter((p) => p.status === 'pending').length, [preOrders]);

  // ─── Business identity (real data: Settings → business profile) ───
  const shopName = businessProfile?.shopName?.trim() || t.stallDashboard.identityFallback;
  const shopLogoUri = businessProfile?.logoUri || '';
  const shopInitial = (businessProfile?.shopName?.trim() || 'S').charAt(0).toUpperCase();
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const openCardModal = useCallback(() => { lightTap(); setCardModalVisible(true); }, []);
  const openCardEditor = useCallback(() => {
    setCardModalVisible(false);
    // Defer one tick so the sheet is dismissing before the push (iOS modal-vs-push).
    setTimeout(() => navigation.getParent()?.navigate('BusinessProfile'), 250);
  }, [navigation]);

  // Every sale across every session (for the transactions tile stat).
  const totalSaleCount = useMemo(
    () => sessions.reduce((n, s) => n + (s.sales?.length || 0), 0),
    [sessions],
  );

  // Pull-to-refresh — no-op revalidation (touches stallStore to re-derive)
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // No-op: re-reading from store via getActiveSession + getLifetimeStats triggers re-render.
    getActiveSession();
    getLifetimeStats();
    setTimeout(() => setRefreshing(false), 400);
  }, [getActiveSession, getLifetimeStats]);

  // Pulsing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasActiveSession) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasActiveSession, pulseAnim]);

  // Entrance animation (identity row only)
  const headingAnim = useFadeSlide(0);

  // Hero press spring
  const heroScale = useSharedValue(1);
  const heroAStyle = useAnimatedStyle(() => ({ transform: [{ scale: heroScale.value }] }));

  // Lifetime stats
  const lifetimeStats = useMemo(() => getLifetimeStats(), [sessions]);

  // AI insight from history (needs 2+ closed sessions)
  const closedSessions = useMemo(
    () => sessions.filter((s) => !s.isActive),
    [sessions]
  );
  const historyInsight = useMemo(
    () => (closedSessions.length >= 2 ? explainStallHistory(closedSessions, currency) : null),
    [closedSessions, currency]
  );

  // Recent sales (last 5 from active session)
  const recentSales = useMemo(() => {
    if (!activeSession) return [];
    return [...activeSession.sales]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  }, [activeSession]);

  // ─── Session sales modal + POS edit ───
  const [salesModalVisible, setSalesModalVisible] = useState(false);
  const [editingSale, setEditingSale] = useState<StallSale | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [editMethod, setEditMethod] = useState<StallPaymentMethod>('cash');
  const [editTotal, setEditTotal] = useState('');
  const cardAvail = useMemo(() => tapToPayAvailable().available, []);

  // Every sale in the ACTIVE session, newest first (the "see all" list).
  const allSessionSales = useMemo(() => {
    if (!activeSession) return [];
    return [...activeSession.sales]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [activeSession]);

  const openEditSale = useCallback((sale: StallSale) => {
    lightTap();
    setEditingSale(sale);
    setEditQty(sale.quantity);
    setEditMethod(sale.paymentMethod);
    setEditTotal(sale.total.toFixed(2));
  }, []);

  const saveEditSale = useCallback(() => {
    if (!editingSale) return;
    const parsed = parseFloat(editTotal);
    updateSale(editingSale.id, {
      quantity: editQty,
      paymentMethod: editMethod,
      // Total override = the after-the-fact discount / price-correction path.
      ...(Number.isFinite(parsed) && parsed >= 0 ? { total: parsed } : {}),
    });
    setEditingSale(null);
  }, [editingSale, editQty, editMethod, editTotal, updateSale]);

  const voidEditSale = useCallback(() => {
    if (!editingSale) return;
    Alert.alert(t.stallDashboard.voidSale, t.stallDashboard.voidSaleMsg, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => { removeSale(editingSale.id); setEditingSale(null); },
      },
    ]);
  }, [editingSale, removeSale, t]);

  // Initial loader — data-driven: exits once the persisted stall store has
  // hydrated (not on a bare timer), with a hard cap so it can never stick.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (useStallStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }
    const unsub = useStallStore.persist.onFinishHydration(() => setReady(true));
    const cap = setTimeout(() => setReady(true), 1500);
    return () => { unsub(); clearTimeout(cap); };
  }, []);

  if (!ready) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + SPACING.md }]}>
        <SkeletonLoader />
        <SkeletonLoader style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  // ─── Shared pieces ─────────────────────────────────────────

  const renderIdentityRow = (tappable: boolean) => (
    <TouchableOpacity
      style={styles.identityRow}
      onPress={tappable ? openCardModal : undefined}
      activeOpacity={tappable ? 0.7 : 1}
      accessibilityRole={tappable ? 'button' : undefined}
      accessibilityLabel={`${shopName}. ${t.stallDashboard.shopCard}`}
    >
      <View style={[styles.identityChip, { backgroundColor: withAlpha(C.bronze, 0.12) }]}>
        {shopLogoUri ? (
          <Image source={{ uri: shopLogoUri }} style={styles.identityLogo} />
        ) : businessProfile?.shopName?.trim() ? (
          <Text style={[styles.identityInitial, { color: C.bronze }]}>{shopInitial}</Text>
        ) : (
          <Feather name="shopping-bag" size={18} color={C.bronze} />
        )}
      </View>
      <View style={styles.identityTextCol}>
        <Text style={styles.identityName} numberOfLines={1}>{shopName}</Text>
        <Text style={styles.identitySub} numberOfLines={1}>{t.stallDashboard.subtitle}</Text>
      </View>
      {tappable && <Feather name="chevron-right" size={16} color={C.textMuted} />}
    </TouchableOpacity>
  );

  // ─── State B: Active session — the live counter ─────────
  if (hasActiveSession && activeSession) {
    const startedAt = activeSession.startedAt instanceof Date
      ? activeSession.startedAt
      : new Date(activeSession.startedAt);
    return (
      <View style={styles.container}>
        <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.bronze}>
        <FlatList
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + 88 }]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          data={DASH_PAGE}
          keyExtractor={() => 'page'}
          renderItem={() => (
            <>
          <GlassModeToggle />
          <OfflineBanner />

          {/* Status strip — live dot · session · started time */}
          <View style={styles.statusStrip}>
            {activeSession.paused ? (
              <View style={[styles.pulsingDot, { backgroundColor: C.bronze, opacity: 1 }]} />
            ) : (
              <Animated.View style={[styles.pulsingDot, { opacity: pulseAnim }]} />
            )}
            <Text style={[styles.statusText, activeSession.paused && { color: C.bronze }]}>
              {activeSession.paused ? t.stall.pausedLabel : t.stallDashboard.sellingNow}
            </Text>
            {activeSession.name ? (
              <Text style={styles.statusSession} numberOfLines={1}>· {activeSession.name}</Text>
            ) : null}
            <Text style={styles.statusStarted}>
              {t.stallDashboard.startedLabel.replace('{time}', format(startedAt, 'h:mma'))}
            </Text>
          </View>

          {/* HERO — solid money card: count-up total + cash/QR split bar */}
          <View style={[styles.heroCard, { backgroundColor: C.bronze }]}>
            <Text style={styles.heroCardLabel}>{t.stallDashboard.cameInThisSession.toUpperCase()}</Text>
            <HeroAmount amount={activeSession.totalRevenue} prefix={currency} color="#FFFFFF" fontSize={56} />
            <View style={{ marginTop: SPACING.lg }}>
              <SplitBar
                cash={activeSession.totalCash}
                qr={activeSession.totalQR}
                cashLabel={`${t.stallDashboard.cash} ${currency} ${activeSession.totalCash.toFixed(0)}`}
                qrLabel={`${t.stallDashboard.qr} ${currency} ${activeSession.totalQR.toFixed(0)}`}
                cashColor="#FFFFFF"
                qrColor={C.accent}
              />
            </View>
          </View>

          {/* Keep selling — the production action: back to the Sell tab */}
          <GlassTile
            style={{ marginBottom: SPACING.lg }}
            onPress={() => navigation.navigate('StallSell')}
            accessibilityLabel={t.stallDashboard.keepSelling}
          >
            <View style={styles.keepSellingRow}>
              <View style={[styles.bentoIcon, { backgroundColor: withAlpha(C.bronze, 0.12) }]}>
                <Feather name="shopping-bag" size={18} color={C.bronze} />
              </View>
              <Text style={styles.keepSellingLabel}>{t.stallDashboard.keepSelling}</Text>
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </View>
          </GlassTile>

          {/* Recent sales — compact ledger (max 5; see-all → full transactions) */}
          {recentSales.length > 0 ? (
            <View style={styles.recentSection}>
              <Text style={styles.sectionLabel}>{t.stallDashboard.recentSales}</Text>
              {recentSales.map((sale) => (
                <View key={sale.id} style={styles.saleRow}>
                  <View style={styles.saleInfo}>
                    <Text style={styles.saleProduct} numberOfLines={1}>{sale.productName}</Text>
                    <Text style={styles.saleQty}>
                      x{sale.quantity} · {format(sale.timestamp instanceof Date ? sale.timestamp : new Date(sale.timestamp), 'h:mma')}{sale.paymentMethod === 'qr' ? ' · QR' : ''}
                    </Text>
                  </View>
                  <Text
                    style={styles.saleAmount}
                    accessibilityLabel={`${currency} ${sale.total.toFixed(2)}`}
                  >
                    {currency} {sale.total.toFixed(2)}
                  </Text>
                </View>
              ))}
              <TouchableOpacity
                style={styles.seeAllRow}
                onPress={() => { lightTap(); setSalesModalVisible(true); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.stallDashboard.seeAll}
              >
                <Text style={styles.seeAllText}>{t.stallDashboard.seeAll}</Text>
                <Feather name="chevron-right" size={14} color={C.accent} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptySalesCard}>
              <Feather name="inbox" size={22} color={C.textMuted} />
              <Text style={styles.emptySalesText}>{t.stallDashboard.noSalesYet}</Text>
            </View>
          )}

          {/* Pre-orders */}
          <GlassTile
            style={{ marginTop: SPACING.sm }}
            onPress={() => navigation.getParent()?.navigate('StallPreOrders')}
            accessibilityLabel={`${t.stall.preOrdersCard}. ${pendingPreOrders} to collect.`}
          >
            <View style={styles.keepSellingRow}>
              <View style={[styles.bentoIcon, { backgroundColor: withAlpha(C.bronze, 0.12) }]}>
                <Feather name="clipboard" size={16} color={C.bronze} />
              </View>
              <Text style={styles.keepSellingLabel}>{t.stall.preOrdersCard}</Text>
              {pendingPreOrders > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingPreOrders}</Text>
                </View>
              )}
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </View>
          </GlassTile>

          {/* Session controls — pause (glass) + close (quiet) */}
          <View style={styles.actionRow}>
            <View style={{ flex: 1 }}>
              <GlassTile
                onPress={() => { lightTap(); activeSession.paused ? resumeSession() : pauseSession(); }}
                accessibilityLabel={activeSession.paused ? t.stall.resumeSession : t.stall.pauseSession}
              >
                <View style={styles.pauseRow}>
                  <Feather name={activeSession.paused ? 'play' : 'pause'} size={16} color={C.bronze} />
                  <Text style={styles.pauseText}>{activeSession.paused ? t.stall.resumeSession : t.stall.pauseSession}</Text>
                </View>
              </GlassTile>
            </View>
            <TouchableOpacity
              style={styles.closeSessionButton}
              onPress={() => navigation.getParent()?.navigate('StallCloseSession')}
              accessibilityRole="button"
              accessibilityLabel="Close current selling session"
              activeOpacity={0.7}
            >
              <Feather name="square" size={14} color={C.textMuted} />
              <Text style={styles.closeSessionText}>{t.stallDashboard.closeSession}</Text>
            </TouchableOpacity>
          </View>
            </>
          )}
        />
        </PullRefresh>

        {/* ─── Session sales modal — this session only, POS edit inside ─── */}
        <FloatingModal
          visible={salesModalVisible}
          onClose={() => { setSalesModalVisible(false); setEditingSale(null); }}
          entrance="fade"
          showDragHandle={false}
        >
          {/* Tap anywhere outside the input → dismiss the keyboard */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flexShrink: 1, paddingTop: SPACING.lg, paddingBottom: SPACING.lg }}>
            <View style={styles.sheetHeader}>
              {editingSale ? (
                <TouchableOpacity
                  onPress={() => setEditingSale(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.stallDashboard.salesTitle}
                >
                  <Feather name="chevron-left" size={20} color={C.textSecondary} />
                </TouchableOpacity>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {editingSale ? t.stallDashboard.editSale : t.stallDashboard.salesTitle}
                </Text>
                <Text style={styles.sheetSub} numberOfLines={1}>
                  {editingSale
                    ? editingSale.productName
                    : `${allSessionSales.length} · ${activeSession.name || t.stallDashboard.sellingNow.toLowerCase()}`}
                </Text>
              </View>
            </View>

          {editingSale ? (
            /* ── POS edit view: qty · payment · total override · void ── */
            <View style={styles.sheetBody}>
              {/* Quantity stepper */}
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>{t.stallDashboard.qtyLabel}</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => { lightTap(); setEditQty((q) => Math.max(1, q - 1)); }}
                    accessibilityRole="button"
                    accessibilityLabel="-"
                  >
                    <Feather name="minus" size={16} color={C.textPrimary} />
                  </TouchableOpacity>
                  <Text style={styles.stepValue}>{editQty}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => { lightTap(); setEditQty((q) => q + 1); }}
                    accessibilityRole="button"
                    accessibilityLabel="+"
                  >
                    <Feather name="plus" size={16} color={C.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Payment method */}
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>{t.stallDashboard.paymentLabel}</Text>
                <View style={styles.methodChips}>
                  {(['cash', 'qr'] as StallPaymentMethod[]).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.methodChip, editMethod === m && { backgroundColor: C.bronze, borderColor: C.bronze }]}
                      onPress={() => { lightTap(); setEditMethod(m); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: editMethod === m }}
                      accessibilityLabel={m === 'cash' ? t.stall.cashPrefix : t.stall.qrPrefix}
                    >
                      <Text style={[styles.methodChipText, editMethod === m && { color: '#FFFFFF' }]}>
                        {m === 'cash' ? t.stall.cashPrefix : t.stall.qrPrefix}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {cardAvail && (
                    <TouchableOpacity
                      style={[styles.methodChip, editMethod === 'card' && { backgroundColor: C.bronze, borderColor: C.bronze }]}
                      onPress={() => { lightTap(); setEditMethod('card'); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: editMethod === 'card' }}
                      accessibilityLabel={t.tapToPay.card}
                    >
                      <Text style={[styles.methodChipText, editMethod === 'card' && { color: '#FFFFFF' }]}>
                        {t.tapToPay.card}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Total override — the discount / price-correction field */}
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>{t.stallDashboard.totalLabel}</Text>
                <View style={styles.totalInputWrap}>
                  <Text style={styles.totalPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.totalInput}
                    value={editTotal}
                    onChangeText={setEditTotal}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    accessibilityLabel={t.stallDashboard.totalLabel}
                  />
                </View>
              </View>

              {/* Save + void */}
              <TouchableOpacity
                style={[styles.sheetCta, { backgroundColor: C.bronze }]}
                onPress={saveEditSale}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t.common.save}
              >
                <Feather name="check" size={15} color="#FFFFFF" />
                <Text style={styles.sheetCtaText}>{t.common.save}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.voidBtn}
                onPress={voidEditSale}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.stallDashboard.voidSale}
              >
                <Feather name="trash-2" size={14} color={C.neutral} />
                <Text style={styles.voidBtnText}>{t.stallDashboard.voidSale}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Sales list — every sale this session, tap to edit ── */
            <ScrollView style={styles.salesListScroll} showsVerticalScrollIndicator={false}>
              {allSessionSales.map((sale) => (
                <TouchableOpacity
                  key={sale.id}
                  style={styles.saleRow}
                  onPress={() => openEditSale(sale)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${sale.productName}, ${currency} ${sale.total.toFixed(2)}. Tap to edit.`}
                >
                  <View style={styles.saleInfo}>
                    <Text style={styles.saleProduct} numberOfLines={1}>{sale.productName}</Text>
                    <Text style={styles.saleQty}>
                      x{sale.quantity} · {format(sale.timestamp instanceof Date ? sale.timestamp : new Date(sale.timestamp), 'h:mma')}{sale.paymentMethod === 'qr' ? ' · QR' : sale.paymentMethod === 'card' ? ` · ${t.tapToPay.card}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.saleAmount}>{currency} {sale.total.toFixed(2)}</Text>
                  <Feather name="chevron-right" size={14} color={C.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          </View>
          </TouchableWithoutFeedback>
        </FloatingModal>
      </View>
    );
  }

  // ─── State A: No active session — solid hero + glass bento ──
  return (
    <View style={styles.container}>
      <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.bronze}>
      <FlatList
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]}
        showsVerticalScrollIndicator={false}
        data={DASH_PAGE}
        keyExtractor={() => 'page'}
        renderItem={() => (
          <>
        <GlassModeToggle />
        <OfflineBanner />

        {/* Business identity — tappable, opens the shop-card modal */}
        <Animated.View style={headingAnim}>
          {renderIdentityRow(true)}
        </Animated.View>

        {/* HERO — the one solid surface on the screen; everything else is glass */}
        <Reanimated.View style={heroAStyle}>
          <Pressable
            onPressIn={() => { lightTap(); heroScale.value = withSpring(0.97, SPRING); }}
            onPressOut={() => { heroScale.value = withSpring(1, SPRING); }}
            onPress={() => navigation.getParent()?.navigate('StallSessionSetup')}
            accessibilityRole="button"
            accessibilityLabel="Start a new selling session"
            style={[styles.hero, { backgroundColor: C.bronze }]}
          >
            <View style={styles.heroTextCol}>
              <Text style={styles.heroLabel}>{t.stallDashboard.startSelling}</Text>
              <Text style={styles.heroCaption}>{t.stallDashboard.startSellingCaption}</Text>
            </View>
            <View style={styles.heroCircle}>
              <Feather name="play" size={24} color={C.bronze} />
            </View>
          </Pressable>
        </Reanimated.View>

        {/* BENTO — tall pre-orders tile + stacked transactions/costs */}
        <View style={styles.bentoRow}>
          <GlassTile
            style={styles.bentoTall}
            onPress={() => navigation.getParent()?.navigate('StallPreOrders')}
            accessibilityLabel={`${t.stall.preOrdersCard}. ${pendingPreOrders} to collect.`}
          >
            <View style={styles.bentoTallInner}>
              <View style={[styles.bentoIcon, { backgroundColor: withAlpha(C.bronze, 0.12) }]}>
                <Feather name="clipboard" size={16} color={C.bronze} />
              </View>
              <View>
                <Text style={styles.bentoBigNumber}>{pendingPreOrders > 0 ? pendingPreOrders : '—'}</Text>
                <Text style={styles.bentoLabel}>{t.stall.preOrdersCard}</Text>
                <Text style={styles.bentoStat}>
                  {pendingPreOrders > 0 ? t.stallDashboard.pendingCount.replace('{n}', String(pendingPreOrders)) : ' '}
                </Text>
              </View>
            </View>
          </GlassTile>

          <View style={styles.bentoCol}>
            <GlassTile
              style={styles.bentoSmall}
              onPress={() => navigation.getParent()?.navigate('StallTransactions')}
              accessibilityLabel={`${t.stallDashboard.transactions}. ${totalSaleCount}`}
            >
              <View style={[styles.bentoIcon, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
                <Feather name="list" size={16} color={C.accent} />
              </View>
              <Text style={styles.bentoLabel}>{t.stallDashboard.transactions}</Text>
              <Text style={styles.bentoStat}>
                {totalSaleCount > 0
                  ? (totalSaleCount === 1
                      ? t.stallHistory.nSales.replace('{n}', '1')
                      : t.stallHistory.nSalesPlural.replace('{n}', String(totalSaleCount)))
                  : '—'}
              </Text>
            </GlassTile>

            <GlassTile
              style={styles.bentoSmall}
              onPress={() => navigation.getParent()?.navigate('StallCosts')}
              accessibilityLabel={t.stallDashboard.costs}
            >
              <View style={styles.bentoSmallRow}>
                <View style={[styles.bentoIcon, { backgroundColor: withAlpha(C.gold, 0.12) }]}>
                  <Feather name="credit-card" size={16} color={C.gold} />
                </View>
                <Text style={styles.bentoLabel}>{t.stallDashboard.costs}</Text>
                <Feather name="chevron-right" size={14} color={C.textMuted} />
              </View>
            </GlassTile>
          </View>
        </View>

        {/* Register strip — lifetime, as a wide glass tile → history */}
        {lifetimeStats.totalSessions > 0 && (
          <GlassTile
            style={styles.bentoWide}
            onPress={() => navigation.navigate('StallHistory')}
            accessibilityLabel={`${t.stallDashboard.lifetime}. ${lifetimeStats.totalSessions} ${t.stallDashboard.sessions}. ${t.stallDashboard.sessionHistory}`}
          >
            <View style={styles.stripRow}>
              <View style={styles.stripStat}>
                <Text style={styles.stripNumber}>{lifetimeStats.totalSessions}</Text>
                <Text style={styles.stripLabel}>{t.stallDashboard.sessions.toUpperCase()}</Text>
              </View>
              <View style={styles.stripRule} />
              <View style={styles.stripStat}>
                <Text
                  style={styles.stripNumber}
                  accessibilityLabel={`Total came in ${currency} ${lifetimeStats.totalRevenue.toFixed(2)}`}
                >
                  {currency} {lifetimeStats.totalRevenue.toFixed(0)}
                </Text>
                <Text style={styles.stripLabel}>{t.stallDashboard.lifetimeCameIn.toUpperCase()}</Text>
              </View>
              <View style={styles.stripRule} />
              <View style={styles.stripStat}>
                <Text
                  style={styles.stripNumber}
                  accessibilityLabel={`Average came in per session ${currency} ${lifetimeStats.avgPerSession.toFixed(2)}`}
                >
                  {currency} {lifetimeStats.avgPerSession.toFixed(0)}
                </Text>
                <Text style={styles.stripLabel}>{t.stallDashboard.avgPerSession.toUpperCase()}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.textMuted} style={{ marginLeft: SPACING.xs }} />
            </View>
          </GlassTile>
        )}

        {/* AI insight — the clerk's margin note */}
        {historyInsight && (
          <Text style={styles.insightText}>{historyInsight}</Text>
        )}
          </>
        )}
      />
      </PullRefresh>

      {/* ─── Shop card modal — the business identity, as customers see it ─── */}
      <BottomSheet
        visible={cardModalVisible}
        onClose={() => setCardModalVisible(false)}
        header={
          <View style={styles.sheetHeader}>
            <View style={[styles.identityChip, { backgroundColor: withAlpha(C.bronze, 0.12) }]}>
              {shopLogoUri ? (
                <Image source={{ uri: shopLogoUri }} style={styles.identityLogo} />
              ) : businessProfile?.shopName?.trim() ? (
                <Text style={[styles.identityInitial, { color: C.bronze }]}>{shopInitial}</Text>
              ) : (
                <Feather name="shopping-bag" size={18} color={C.bronze} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{shopName}</Text>
              <Text style={styles.sheetSub} numberOfLines={1}>{t.stallDashboard.shopCard}</Text>
            </View>
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <BusinessCard
            profile={businessProfile}
            shopPlaceholder={t.businessProfile.shopNamePlaceholder}
            emptyHint={t.businessProfile.cardHint}
          />
          <TouchableOpacity
            style={[styles.sheetCta, { backgroundColor: C.bronze }]}
            onPress={openCardEditor}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.stallDashboard.customiseShare}
          >
            <Feather name="edit-2" size={15} color="#FFFFFF" />
            <Text style={styles.sheetCtaText}>{t.stallDashboard.customiseShare}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
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
    paddingBottom: SPACING['4xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },

  // ─── Business identity row ─────────────────────────────
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  identityChip: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  identityLogo: {
    width: 44,
    height: 44,
    resizeMode: 'cover',
  },
  identityInitial: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  identityTextCol: {
    flex: 1,
    gap: 1,
  },
  identityName: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  identitySub: {
    ...TYPE.muted,
    color: C.textSecondary,
  },

  // ─── Hero (the one solid surface) ─────────────────────
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.md,
  },
  heroTextCol: {
    flex: 1,
    gap: 3,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  heroCaption: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: withAlpha('#FFFFFF', 0.75),
  },
  heroCircle: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Bento grid ────────────────────────────────────────
  bentoRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  bentoTall: {
    flex: 1.1,
  },
  bentoTallInner: {
    flex: 1,
    justifyContent: 'space-between',
    gap: SPACING.lg,
  },
  bentoCol: {
    flex: 1,
    gap: SPACING.sm,
  },
  bentoSmall: {
    flex: 1,
  },
  bentoSmallRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bentoWide: {
    marginBottom: SPACING.md,
  },
  bentoIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoBigNumber: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : -0.5,
  },
  bentoLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginTop: SPACING.xs,
  },
  bentoStat: {
    ...TYPE.muted,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },

  // ─── Register strip (inside the wide glass tile) ──────
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stripStat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  stripRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch' as const,
    backgroundColor: C.border,
    marginVertical: 2,
  },
  stripNumber: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    letterSpacing: 1,
    textAlign: 'center' as const,
  },

  // ─── Shared row (state B pre-orders) ──────────────────
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    minHeight: 56,
    marginTop: SPACING.lg,
  },
  tileRowIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRowLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: RADIUS.full,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    fontVariant: ['tabular-nums'],
  },

  // ─── Shop card modal ──────────────────────────────────
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  sheetTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  sheetSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: 2,
  },
  sheetBody: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
  },
  sheetCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    minHeight: 48,
  },
  sheetCtaText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ─── Misc State A ──────────────────────────────────────
  sectionLabel: {
    ...TYPE.label,
    marginBottom: SPACING.md,
  },
  insightText: {
    ...TYPE.insight,
    fontStyle: 'italic',
    color: C.textSecondary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    flex: 1,
    minHeight: 48,
    borderRadius: RADIUS.lg,
    backgroundColor: C.background,
  },
  pauseText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },

  // ─── State B: live counter ────────────────────────────────
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md, // breathing room under the Personal/Business toggle
    marginBottom: SPACING.lg,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.positive,
  },
  statusText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.positive,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusSession: {
    flexShrink: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  statusStarted: {
    marginLeft: 'auto' as const,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },

  // Solid money card — one quiet bronze surface, no gradient
  heroCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.md,
  },
  heroCardLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: withAlpha('#FFFFFF', 0.7),
    letterSpacing: 1.4,
    marginBottom: SPACING.xs,
  },

  keepSellingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  keepSellingLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },

  recentSection: {
    marginBottom: SPACING.sm,
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    minHeight: 44,
  },
  saleInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  saleProduct: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  saleQty: {
    ...TYPE.muted,
    marginTop: 2,
  },
  saleAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.md,
  },
  seeAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  emptySalesCard: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING['3xl'],
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: C.border,
  },
  emptySalesText: {
    ...TYPE.muted,
    color: C.textSecondary,
  },

  pauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  closeSessionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 48,
  },
  closeSessionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },

  // ─── Session sales modal (POS edit) ─────────────────────
  salesListScroll: {
    maxHeight: 380,
    paddingHorizontal: SPACING.lg,
  },
  editRow: {
    gap: SPACING.sm,
  },
  editLabel: {
    ...TYPE.label,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    alignSelf: 'flex-start' as const,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 32,
    textAlign: 'center' as const,
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  methodChips: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  methodChip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
  },
  methodChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  totalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  totalPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
  },
  totalInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    paddingVertical: SPACING.xs,
  },
  voidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  voidBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.neutral,
  },
});

export default StallDashboard;
