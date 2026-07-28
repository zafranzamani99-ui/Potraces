import React, {
  useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect,
} from 'react';
import {
  View, Text, StyleSheet, TextInput, Modal, TouchableOpacity,
  Pressable, Switch, Keyboard,
  Animated, Dimensions, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { useEchoFabPan } from '../../hooks/useEchoFabPan';
import EchoDragHideZone from '../../components/wallet/EchoDragHideZone';
import { LinearGradient } from 'expo-linear-gradient';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
  runOnJS,
  SharedValue,
  FadeIn,
  FadeInDown,
  ZoomIn,
  BounceIn,
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  format, differenceInDays, isSameDay,
  addWeeks, addMonths, addQuarters, addYears,
  subWeeks, subMonths, subQuarters, subYears,
  endOfMonth, startOfMonth, startOfDay,
  isValid,
} from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, BILLING_CYCLES, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import { useCategories } from '../../hooks/useCategories';
import CategoryPicker from '../../components/common/CategoryPicker';
import CalendarPicker from '../../components/common/CalendarPicker';
import WalletLogo from '../../components/common/WalletLogo';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import FAB from '../../components/common/FAB';
import CommitmentForm from '../../components/commitments/CommitmentForm';
import EmptyState from '../../components/common/EmptyState';
import GlassSegmentedControl from '../../components/common/GlassSegmentedControl';
import { useToast } from '../../context/ToastContext';
import ModalToastHost from '../../components/common/ModalToastHost';
import { useDebtStore } from '../../store/debtStore';
import { useRoute, RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { usePremiumStore } from '../../store/premiumStore';
import { TIER_LIMITS } from '../../constants/premium';
import EchoInlineChat from '../../components/common/EchoInlineChat';
import TypewriterText from '../../components/common/TypewriterText';
import PaywallModal from '../../components/common/PaywallModal';
import { lightTap, mediumTap, successNotification } from '../../services/haptics';
import { useLearningStore } from '../../store/learningStore';
import { useT } from '../../i18n';
import ScreenGuide from '../../components/common/ScreenGuide';
import { Subscription } from '../../types';

// ─── Constants ────────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get('window').width;
const TILE_GAP = SPACING.sm;
const TILE_SIZE = (SCREEN_WIDTH - SPACING.xl * 2 - TILE_GAP * 2) / 3;
const HARD_SWIPE = 120;
const ACTION_MIN_WIDTH = 72;
const ACTION_MAX_WIDTH = 140;

// ─── Swipe action component (mirrors Wallet's WalletSwipeAction) ─
type SubSwipeActionProps = {
  variant: 'paid' | 'edit';
  direction: 'right' | 'left';
  drag: SharedValue<number>;
  label: string;
  styles: any;
  onTap: () => void;
  onHardSwipe: () => void;
};

function SubSwipeAction({
  variant, direction, drag, label, styles, onTap, onHardSwipe,
}: SubSwipeActionProps) {
  const triggered = useSharedValue(false);
  useAnimatedReaction(
    () => drag.value,
    (v) => {
      'worklet';
      const crossed = direction === 'right' ? v < -HARD_SWIPE : v > HARD_SWIPE;
      if (crossed && !triggered.value) {
        triggered.value = true;
        runOnJS(onHardSwipe)();
      }
      if (Math.abs(v) < 10) triggered.value = false;
    },
  );
  const animatedStyle = useAnimatedStyle(() => {
    const absDrag = Math.abs(drag.value);
    const w = Math.min(ACTION_MAX_WIDTH, Math.max(ACTION_MIN_WIDTH, absDrag));
    return { width: w };
  });
  return (
    <Reanimated.View
      style={[
        styles.swipeFill,
        variant === 'paid' ? styles.__paidColor : styles.__editColor,
        direction === 'right' ? styles.swipeFillAlignRight : styles.swipeFillAlignLeft,
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        style={styles.swipeInner}
        onPress={onTap}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Feather
          name={variant === 'paid' ? 'check' : 'edit-2'}
          size={24}
          color="#fff"
        />
      </TouchableOpacity>
    </Reanimated.View>
  );
}

type CommitmentKind = 'bills' | 'payments' | 'subs';
type StatusFilter = 'all' | 'upcoming' | 'overdue' | 'cleared' | 'paused' | 'archived';

type SubscriptionListParams = {
  SubscriptionList: { highlightId?: string; initialStatus?: StatusFilter } | undefined;
};

// ─── Brand Color Helpers ──────────────────────────────────
// Curated on-palette colors so each name gets a stable, distinct circle
function renderIcon(iconId: string, size: number, color: string) {
  const [lib, name] = iconId.includes('/') ? iconId.split('/') : ['f', iconId];
  switch (lib) {
    case 'm': return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
    case 'i': return <Ionicons name={name as any} size={size} color={color} />;
    case 'fa': return <FontAwesome5 name={name as any} size={size} color={color} />;
    default: return <Feather name={name as any} size={size} color={color} />;
  }
}

const AVATAR_PALETTE = [
  '#4F5104',  // olive
  '#8B7355',  // bronze
  '#C1694F',  // terracotta
  '#6BA3BE',  // sky blue
  '#A688B8',  // mauve
  '#B2780A',  // gold
  '#5C7A4B',  // sage
  '#7A6B5D',  // warm grey
  '#9B8E6E',  // khaki
  '#6D7F5C',  // moss
];

function avatarColorForName(name: string): string {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// ─── Date Helpers ─────────────────────────────────────────
function getPrevBillingDate(nextBillingDate: Date, cycle: string): Date {
  switch (cycle) {
    case 'weekly':    return subWeeks(nextBillingDate, 1);
    case 'quarterly': return subQuarters(nextBillingDate, 1);
    case 'yearly':    return subYears(nextBillingDate, 1);
    default:          return subMonths(nextBillingDate, 1);
  }
}

function isClearedThisCycle(sub: Subscription): boolean {
  if (!sub.lastPaidAt) return false;
  // The oldest unpaid cycle is sub.nextBillingDate. If it's still in the past the
  // commitment is behind — never report it as cleared, or a freshly-paid older
  // cycle would mask the next overdue one and the user would lose track of it.
  if (startOfDay(sub.nextBillingDate) < startOfDay(new Date())) return false;
  const prevBilling = getPrevBillingDate(sub.nextBillingDate, sub.billingCycle);
  if (sub.lastPaidAt >= prevBilling) return true;
  // Paid early (before due date) — nextBillingDate already advanced, check two cycles back
  if (sub.nextBillingDate > new Date()) {
    return sub.lastPaidAt >= getPrevBillingDate(prevBilling, sub.billingCycle);
  }
  return false;
}

function isInstallmentComplete(sub: Subscription): boolean {
  return !!(sub.isInstallment && sub.totalInstallments && (sub.completedInstallments || 0) >= sub.totalInstallments);
}

function isSubOverdue(sub: Subscription): boolean {
  return !isClearedThisCycle(sub) && sub.nextBillingDate < startOfDay(new Date());
}

function getSubsForMonth(subs: Subscription[], monthOffset: number): Subscription[] {
  const target = addMonths(new Date(), monthOffset);
  const mStart = startOfMonth(target);
  const mEnd = endOfMonth(target);
  return subs.filter(sub => {
    if (!sub.isActive || sub.isPaused || isInstallmentComplete(sub)) return false;
    let date = new Date(sub.nextBillingDate);
    let i = 0;
    if (date > mEnd) {
      while (date > mEnd && i < 60) {
        switch (sub.billingCycle) {
          case 'weekly': date = subWeeks(date, 1); break;
          case 'quarterly': date = subMonths(date, 3); break;
          case 'yearly': date = subYears(date, 1); break;
          default: date = subMonths(date, 1); break;
        }
        i++;
      }
    } else {
      while (date < mStart && i < 60) {
        switch (sub.billingCycle) {
          case 'weekly': date = addWeeks(date, 1); break;
          case 'quarterly': date = addMonths(date, 3); break;
          case 'yearly': date = addYears(date, 1); break;
          default: date = addMonths(date, 1); break;
        }
        i++;
      }
    }
    return date >= mStart && date <= mEnd;
  });
}

function getDueDateInfo(date: Date): { text: string; accent: 'today' | 'overdue' | 'none' } {
  const today = startOfDay(new Date());
  if (date < today) return { text: `was ${format(date, 'MMM d')}`, accent: 'overdue' };
  const days = differenceInDays(startOfDay(date), today);
  if (days === 0) return { text: 'today', accent: 'today' };
  if (days === 1) return { text: 'tomorrow', accent: 'none' };
  if (days <= 7) return { text: `in ${days} days`, accent: 'none' };
  return { text: format(date, 'MMM d'), accent: 'none' };
}

function getNextBillingDate(start: Date, cycle: string): Date {
  const now = new Date();
  const today = startOfDay(now);
  if (start >= today) return start;
  let next = start;
  let safety = 0;
  while (next < now && safety++ < 500) {
    switch (cycle) {
      case 'weekly':    next = addWeeks(next, 1);    break;
      case 'quarterly': next = addQuarters(next, 1); break;
      case 'yearly':    next = addYears(next, 1);    break;
      default:          next = addMonths(next, 1);   break;
    }
  }
  return next;
}

// Every billing date that has fallen due but isn't paid yet — the oldest
// (sub.nextBillingDate) first, then each following cycle up to today. Lets us show
// one row per missed cycle instead of silently collapsing arrears into a single bill.
function getOverdueOccurrences(sub: Subscription, today: Date): Date[] {
  const dates: Date[] = [];
  // Cycles already settled by an active (non-undone) payment — skip them. An
  // out-of-order undo can leave nextBillingDate behind a still-paid later cycle;
  // without this, that paid cycle would surface as a phantom "overdue" row (and
  // inflate the overdue count), and tapping it would settle the wrong cycle.
  const paidKeys = new Set(
    (sub.paymentHistory || [])
      .filter((p) => !p.undoneAt)
      .map((p) => startOfDay(new Date(p.periodDate ?? p.paidAt)).getTime()),
  );
  let d = new Date(sub.nextBillingDate);
  let i = 0;
  while (startOfDay(d) < today && i < 36) {
    if (!paidKeys.has(startOfDay(d).getTime())) dates.push(new Date(d));
    switch (sub.billingCycle) {
      case 'weekly':    d = addWeeks(d, 1);    break;
      case 'quarterly': d = addQuarters(d, 1); break;
      case 'yearly':    d = addYears(d, 1);    break;
      default:          d = addMonths(d, 1);   break;
    }
    i++;
  }
  return dates;
}

// ─── Floating celebration dot ─────────────────────────────
// ─── Celebration animation components ────────────────────
const ConfettiPiece: React.FC<{
  color: string; size: number; angle: number; distance: number; delay: number;
}> = ({ color, size, angle, distance, delay: d }) => {
  const progress = useSharedValue(0);
  const drift = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withDelay(d, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    drift.value = withDelay(d + 700, withRepeat(
      withSequence(
        withTiming(5, { duration: 1800 + Math.random() * 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(-5, { duration: 1800 + Math.random() * 600, easing: Easing.inOut(Easing.ease) }),
      ), -1, true,
    ));
  }, []);

  const rad = (angle * Math.PI) / 180;
  const tx = Math.cos(rad) * distance;
  const ty = Math.sin(rad) * distance;

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        { translateX: tx * p },
        { translateY: ty * p + drift.value },
        { scale: p < 0.2 ? p / 0.2 : 1 - (p - 0.2) * 0.35 },
        { rotate: `${p * 270 * (angle > 180 ? -1 : 1)}deg` },
      ],
      opacity: p < 0.1 ? p * 10 : p > 0.65 ? Math.max(0.12, (1 - p) * 2.85) : 1,
    };
  });

  return (
    <Reanimated.View style={[{
      position: 'absolute', width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
    }, style]} />
  );
};

const GlowRing: React.FC<{ color: string; size: number; delay?: number }> = ({ color, size, delay: d = 0 }) => {
  const ringScale = useSharedValue(0.8);
  const ringOp = useSharedValue(0);

  React.useEffect(() => {
    ringOp.value = withDelay(d, withRepeat(
      withSequence(
        withTiming(0.28, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 1100, easing: Easing.in(Easing.ease) }),
      ), -1,
    ));
    ringScale.value = withDelay(d, withRepeat(
      withSequence(
        withTiming(1.6, { duration: 2000, easing: Easing.out(Easing.ease) }),
        withTiming(0.8, { duration: 0 }),
      ), -1,
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOp.value,
  }));

  return (
    <Reanimated.View style={[{
      position: 'absolute', width: size, height: size, borderRadius: size / 2,
      borderWidth: 2, borderColor: color,
    }, style]} />
  );
};

// ─── Component ────────────────────────────────────────────
const SubscriptionList: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<SubscriptionListParams, 'SubscriptionList'>>();
  const { showToast } = useToast();

  const {
    subscriptions, transactions, addSubscription, updateSubscription, deleteSubscription,
    toggleSubscriptionPause, markSubscriptionPaid,
    undoSubscriptionPayment, addTransaction,
  } = usePersonalStore();
  const wallets = useWalletStore(s => s.wallets);
  const deductFromWallet = useWalletStore(s => s.deductFromWallet);
  const currency = useSettingsStore(s => s.currency);
  const expenseCategories = useCategories('expense');
  const markSharedSubPayment = useDebtStore((s) => s.markSharedSubPayment);
  const unmarkSharedSubPayment = useDebtStore((s) => s.unmarkSharedSubPayment);
  const ensureMonthRecord = useDebtStore((s) => s.ensureMonthRecord);

  // ── View state ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  // Recurring-load display period: per-day / per-month / per-year (day = yearly ÷ 365).
  const [period, setPeriod] = useState<'day' | 'mo' | 'yr'>('mo');
  const [heroMonthOffset, setHeroMonthOffset] = useState(0);
  const heroTouchRef = useRef({ x: 0, time: 0 });
  const slideX = useSharedValue(0);

  const changeMonth = useCallback((newOffset: number) => {
    const dir = newOffset > heroMonthOffset ? 1 : -1;
    slideX.value = dir * 40;
    slideX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
    setHeroMonthOffset(newOffset);
  }, [heroMonthOffset, slideX]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: interpolate(Math.abs(slideX.value), [0, 40], [1, 0.5]),
  }));
  const [activeTab, setActiveTab] = useState<CommitmentKind>('subs');
  const initialTabSet = useRef(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Deep-link: Dashboard's "coming up" card lands here pre-filtered (e.g.
  // 'upcoming'). Param cleared so later visits start on 'all' as usual.
  useEffect(() => {
    const s = route.params?.initialStatus;
    if (s) {
      setStatusFilter(s);
      navigation.setParams({ initialStatus: undefined });
    }
  }, [route.params?.initialStatus, navigation]);

  // ── Modal state ─────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Prefill for the CommitmentForm when opened from a "looks recurring" suggestion.
  const [suggestionDraft, setSuggestionDraft] = useState<Partial<Pick<Subscription, 'name' | 'amount' | 'category' | 'billingCycle'>> | undefined>(undefined);

  // ── Mark as paid sheet ───────────────────────────────────
  const [markPaidSub, setMarkPaidSub] = useState<Subscription | null>(null);
  const [markPaidDate, setMarkPaidDate] = useState<Date | null>(null); // when the user paid (null = today)
  const [mpCalendarOpen, setMpCalendarOpen] = useState(false);
  // Reset the custom pay-date whenever a DIFFERENT commitment's mark-paid sheet opens, so
  // a date picked for one commitment (then abandoned) can't leak into another via "pay anyway".
  useEffect(() => {
    if (markPaidSub) { setMarkPaidDate(null); setMpCalendarOpen(false); }
  }, [markPaidSub?.id]);
  const [payWarning, setPayWarning] = useState<{ sub: Subscription; reason: 'double' | 'early' | 'notStarted'; detail: string } | null>(null);
  const [celebrationSub, setCelebrationSub] = useState<{ id: string; name: string; amount: number; cycle: string; totalPaid: number; installments?: number } | null>(null);

  // ── Delete confirm ───────────────────────────────────────
  const [deleteConfirmSub, setDeleteConfirmSub] = useState<Subscription | null>(null);

  // ── Detail view ─────────────────────────────────────────
  const [detailSub, setDetailSub] = useState<Subscription | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // ── How it works ────────────────────────────────────────
  const [howItWorksVisible, setHowItWorksVisible] = useState(false);

  // (Legacy in-screen form state removed — the live add/edit form is <CommitmentForm>,
  // which owns its own state; suggestions prefill it via the `initialValues` prop.)

  // ── Swipeable refs ───────────────────────────────────────
  const swipeableRefs = useRef<Map<string, SwipeableMethods>>(new Map());
  // Track which row had a hard-swipe so we auto-close it on settle
  const hardSwipedRef = useRef<Set<string>>(new Set());

  // ── Echo FAB state (matches Wallet / Budget pattern) ────
  const echoHidden = useSettingsStore(s => s.commitmentEchoHidden);
  const setEchoHidden = useSettingsStore(s => s.setCommitmentEchoHidden);
  const tier = usePremiumStore(s => s.tier);
  const [echoSheetVisible, setEchoSheetVisible] = useState(false);
  const [echoAutoPrompt, setEchoAutoPrompt] = useState<string | undefined>(undefined);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [greetingText, setGreetingText] = useState('');
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [greetingHiddenDuringDrag, setGreetingHiddenDuringDrag] = useState(false);
  const [greetingChips, setGreetingChips] = useState<{ label: string; question: string }[]>([]);
  const [fabSide, setFabSide] = useState<'left' | 'right'>('right');

  // ─── Header Echo button (only when FAB is hidden) ─
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity
            onPress={() => { lightTap(); setHowItWorksVisible(true); }}
            accessibilityRole="button"
            accessibilityLabel="How it works"
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="help-circle" size={19} color={C.textMuted} />
          </TouchableOpacity>
          {subscriptions.length > 0 && echoHidden && (
            <TouchableOpacity
              onPress={() => {
                lightTap();
                if (!TIER_LIMITS[tier].askEchoPerScreen) { setPaywallVisible(true); return; }
                setEchoHidden(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Open Echo assistant"
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather
                name="zap"
                size={20}
                color={!TIER_LIMITS[tier].askEchoPerScreen ? C.textMuted : C.textPrimary}
              />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [echoHidden, tier, subscriptions.length, navigation, C, setEchoHidden]);

  // ── Draggable Echo FAB — free X+Y drag, snaps to edge, drag-to-hide ──
  const { echoFabPan, echoFabPanResponder, hideZoneAnim, hideZoneHoverAnim, fabScale, hideZoneRef } = useEchoFabPan({
    fabSide,
    setFabSide,
    setGreetingHiddenDuringDrag,
    onHide: () => setEchoHidden(true),
    insets,
  });


  // ─── Computed ──────────────────────────────────────────
  const totalMonthly = useMemo(() =>
    subscriptions
      .filter(s => s.isActive && !s.isPaused && !isInstallmentComplete(s))
      .reduce((sum, s) => {
        switch (s.billingCycle) {
          case 'weekly':    return sum + s.amount * 4;
          case 'quarterly': return sum + s.amount / 3;
          case 'yearly':    return sum + s.amount / 12;
          default:          return sum + s.amount;
        }
      }, 0),
    [subscriptions],
  );

  const totalAnnual = useMemo(() =>
    subscriptions
      .filter(s => s.isActive && !s.isPaused && !isInstallmentComplete(s))
      .reduce((sum, s) => {
        switch (s.billingCycle) {
          case 'weekly':    return sum + s.amount * 52;
          case 'quarterly': return sum + s.amount * 4;
          case 'yearly':    return sum + s.amount;
          default:          return sum + s.amount * 12;
        }
      }, 0),
    [subscriptions],
  );

  const heroStats = useMemo(() => {
    const active = subscriptions.filter(s => s.isActive);
    const monthEnd = endOfMonth(new Date());
    const cleared = active.filter(s => !s.isPaused && (isInstallmentComplete(s) || isClearedThisCycle(s))).length;
    const pending = active.filter(s => !s.isPaused && !isInstallmentComplete(s) && !isClearedThisCycle(s) && s.nextBillingDate <= monthEnd).length;
    const paused  = active.filter(s => s.isPaused).length;
    return { cleared, pending, paused };
  }, [subscriptions]);

  const categoryBreakdown = useMemo(() => {
    // Normalize every bill to its MONTHLY equivalent (yearly ÷12, quarterly ÷3,
    // weekly ×52÷12) so the category split reflects real monthly load — a raw sum
    // would let a single yearly bill dominate the pie against monthly ones. Exclude
    // finished installments (they no longer bill).
    const toMonthly = (s: Subscription) => {
      switch (s.billingCycle) {
        case 'weekly':    return (s.amount * 52) / 12;
        case 'quarterly': return s.amount / 3;
        case 'yearly':    return s.amount / 12;
        default:          return s.amount;
      }
    };
    const active = subscriptions.filter(s => s.isActive && !s.isPaused && !isInstallmentComplete(s));
    const groups: Record<string, { amount: number; color: string }> = {};
    active.forEach(s => {
      const cat = expenseCategories.find(c => c.id === s.category);
      if (!groups[s.category]) groups[s.category] = { amount: 0, color: cat?.color || C.accent };
      groups[s.category].amount += toMonthly(s);
    });
    const total = Object.values(groups).reduce((sum, g) => sum + g.amount, 0);
    return Object.entries(groups)
      .map(([id, g]) => ({ id, ...g, pct: total > 0 ? g.amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [subscriptions, expenseCategories]);

  const dueSoon = useMemo(() => {
    const in7 = addWeeks(new Date(), 1);
    return subscriptions
      .filter(s => s.isActive && !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate <= in7)
      .sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime());
  }, [subscriptions]);

  const nextBill = useMemo(() => {
    return subscriptions
      .filter(s => s.isActive && !s.isPaused && !isClearedThisCycle(s))
      .sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime())[0] || null;
  }, [subscriptions]);

  const dayStrip = useMemo(() => {
    const today = startOfDay(new Date());
    const days: { date: Date; isToday: boolean; bills: Subscription[] }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const bills = subscriptions.filter(s =>
        s.isActive && !s.isPaused && !isClearedThisCycle(s) &&
        isSameDay(s.nextBillingDate, d)
      );
      days.push({ date: d, isToday: i === 0, bills });
    }
    return days;
  }, [subscriptions]);

  // ── Echo insight + snapshot ──────────────────────────────
  const smartCommitmentInsight = useMemo(() => {
    if (subscriptions.length === 0) return { title: '', subtitle: '' };
    const active = subscriptions.filter(s => s.isActive && !s.isPaused);
    const today = startOfDay(new Date());
    const overdue = active.filter(s => !isClearedThisCycle(s) && s.nextBillingDate < today);
    if (overdue.length > 0) {
      const total = overdue.reduce((s, b) => s + b.amount, 0);
      const worst = overdue[0];
      return {
        title: `${overdue.length} bill${overdue.length > 1 ? 's' : ''} past their date`,
        subtitle: `${worst.name}${overdue.length > 1 ? ` and ${overdue.length - 1} more` : ''} — ${currency} ${total.toFixed(0)} owed. clearing them now keeps fees away.`,
      };
    }
    const monthEnd = endOfMonth(new Date());
    const dueByEnd = active.filter(s => !isClearedThisCycle(s) && s.nextBillingDate <= monthEnd);
    const totalDueByEnd = dueByEnd.reduce((s, b) => s + b.amount, 0);
    if (totalMonthly > 0) {
      const pctOfMonthly = totalDueByEnd / totalMonthly;
      if (pctOfMonthly >= 0.5 && dueByEnd.length >= 2) {
        return {
          title: `${currency} ${totalDueByEnd.toFixed(0)} of bills hit before month end`,
          subtitle: `${dueByEnd.length} commitments stacked into the same window. worth checking your buffer.`,
        };
      }
    }
    if (totalAnnual > totalMonthly * 12 * 0.95 && totalAnnual > 1000) {
      return {
        title: `you'll spend ${currency} ${totalAnnual.toLocaleString(undefined, { maximumFractionDigits: 0 })} on commitments this year`,
        subtitle: `that's ${currency} ${totalMonthly.toFixed(0)} a month locked in. anything here you can cancel?`,
      };
    }
    return {
      title: `${active.length} active commitment${active.length > 1 ? 's' : ''}`,
      subtitle: `${currency} ${totalMonthly.toFixed(0)}/month going out. let's see if any of them deserve a second look.`,
    };
  }, [subscriptions, totalMonthly, totalAnnual, currency]);

  const buildCommitmentSnapshot = useCallback(() => {
    const lines: string[] = [];
    const active = subscriptions.filter(s => s.isActive && !s.isPaused);
    const today = startOfDay(new Date());
    const monthEnd = endOfMonth(new Date());

    lines.push(`[Commitments snapshot]`);
    lines.push(`Total monthly outflow: ${currency} ${totalMonthly.toFixed(0)} across ${active.length} active commitments`);
    lines.push(`Annualized: ${currency} ${totalAnnual.toFixed(0)}/year`);
    lines.push('');

    const overdue = active.filter(s => !isClearedThisCycle(s) && s.nextBillingDate < today);
    const dueThisMonth = active.filter(s => !isClearedThisCycle(s) && s.nextBillingDate >= today && s.nextBillingDate <= monthEnd);
    const cleared = active.filter(s => isClearedThisCycle(s));

    if (overdue.length > 0) {
      lines.push(`Overdue (${overdue.length}):`);
      overdue.forEach(s => {
        lines.push(`• ${s.name}: ${currency} ${s.amount.toFixed(0)} (was due ${format(s.nextBillingDate, 'MMM d')})`);
      });
      lines.push('');
    }
    if (dueThisMonth.length > 0) {
      lines.push(`Due before month end (${dueThisMonth.length}):`);
      dueThisMonth.forEach(s => {
        lines.push(`• ${s.name}: ${currency} ${s.amount.toFixed(0)} on ${format(s.nextBillingDate, 'MMM d')} (${s.billingCycle})`);
      });
      lines.push('');
    }
    if (cleared.length > 0) {
      lines.push(`Already paid this cycle (${cleared.length}):`);
      cleared.slice(0, 5).forEach(s => {
        lines.push(`• ${s.name}: ${currency} ${s.amount.toFixed(0)}${s.lastPaidAt ? ` on ${format(s.lastPaidAt, 'MMM d')}` : ''}`);
      });
      lines.push('');
    }

    // Category breakdown
    if (categoryBreakdown.length > 0) {
      lines.push(`Spending by category (monthly equivalent):`);
      categoryBreakdown.forEach(item => {
        const cat = expenseCategories.find(c => c.id === item.id);
        lines.push(`• ${cat?.name || item.id}: ${currency} ${item.amount.toFixed(0)} (${(item.pct * 100).toFixed(0)}%)`);
      });
    }
    return lines.join('\n');
  }, [subscriptions, totalMonthly, totalAnnual, currency, categoryBreakdown, expenseCategories]);

  const commitmentGreetingPool = useMemo((): string[] => {
    if (subscriptions.length === 0) return [];
    const active = subscriptions.filter(s => s.isActive && !s.isPaused);
    const today = startOfDay(new Date());
    const overdue = active.filter(s => !isClearedThisCycle(s) && s.nextBillingDate < today);
    if (overdue.length > 0) {
      return [
        `${overdue.length} bill${overdue.length > 1 ? 's' : ''} late — sort it?`,
        `${overdue.length} past due — let's tackle them`,
        `bills slipped — want a clear-up plan?`,
        `${overdue.length} overdue — chip at them now?`,
      ];
    }
    if (totalAnnual > 2000) {
      return [
        `${currency} ${totalAnnual.toFixed(0)}/yr locked in — review?`,
        `lots of bills — any to cut?`,
        `commitments adding up — audit time?`,
        `which one earns its keep?`,
      ];
    }
    return [
      `track another bill?`,
      `anything you forgot to add?`,
      `want help spotting recurring spend?`,
      `let's keep your bills tidy`,
    ];
  }, [subscriptions, totalAnnual, currency]);

  useFocusEffect(useCallback(() => {
    if (commitmentGreetingPool.length === 0) return;
    const idx = Math.floor(Math.random() * commitmentGreetingPool.length);
    setGreetingText(commitmentGreetingPool[idx]);
    setGreetingDismissed(false);

    const active = subscriptions.filter(s => s.isActive && !s.isPaused);
    const today = startOfDay(new Date());
    const overdue = active.filter(s => !isClearedThisCycle(s) && s.nextBillingDate < today);

    if (overdue.length > 0) {
      setGreetingChips([
        { label: 'which to clear first?', question: `I have ${overdue.length} overdue bills. Which should I clear first based on amount and risk?` },
        { label: 'will this hurt my credit?', question: `What's the real-world consequence of paying these bills late? Be honest about fees and credit impact.` },
        { label: 'how to never miss again?', question: `What's the most reliable way to never miss a bill again given my setup?` },
      ]);
    } else if (totalAnnual > 2000) {
      setGreetingChips([
        { label: 'which to cancel?', question: `Look at my commitments. Which ones look like they're not earning their keep and could be cancelled?` },
        { label: 'cheaper alternatives?', question: `For my biggest recurring bills, are there cheaper alternatives I could switch to in Malaysia?` },
        { label: 'hidden recurring spend?', question: `Based on my transactions, do I have spending that's effectively recurring but not tracked as a subscription?` },
      ]);
    } else {
      setGreetingChips([
        { label: 'what should I track?', question: `What kinds of recurring spend should I be tracking as commitments to stay on top of my outflow?` },
        { label: 'monthly vs yearly?', question: `For services I pay for, is it usually better to choose monthly or yearly billing? Help me decide.` },
        { label: 'how to budget for bills?', question: `What's a smart way to budget for my recurring bills so I'm never caught short?` },
      ]);
    }
  }, [commitmentGreetingPool, subscriptions, totalAnnual, currency]));

  // NOTE: we deliberately do NOT auto-advance an overdue nextBillingDate. An unpaid
  // bill must stay on its due date so the user can still record it — advancing it
  // would erase the missed cycle. nextBillingDate only moves forward when the user
  // marks a cycle paid (markSubscriptionPaid advances exactly one cycle), so it
  // always points at the oldest unpaid cycle and arrears accumulate instead of
  // silently rolling into the new month. See getOverdueOccurrences for the per-cycle
  // rows that surface every missed bill.

  // ── Tab classification (bills / payments / subs) ────────
  const classifyKind = useCallback((sub: Subscription): CommitmentKind => {
    if (sub.isInstallment) return 'payments';
    const cat = (sub.category || '').toLowerCase();
    const name = (sub.name || '').toLowerCase();
    const billCats = ['bills', 'bill', 'utilities', 'utility', 'insurance', 'rent', 'rental', 'transport', 'housing'];
    const billNames = [
      'unifi', 'maxis', 'celcom', 'digi', 'umobile', 'u mobile', 'yes', 'time fibre', 'tm ',
      'tnb', 'tenaga', 'astro', 'air selangor', 'syabas', 'indah water', 'iwk',
      'insurance', 'takaful', 'prudential', 'aia', 'great eastern', 'etiqa',
      'rent', 'sewa', 'maintenance', 'condo', 'apartment',
    ];
    if (billCats.includes(cat)) return 'bills';
    if (billNames.some(k => name.includes(k))) return 'bills';
    return 'subs';
  }, []);

  // ── Smart default tab — land on the most urgent tab ─────
  useEffect(() => {
    if (initialTabSet.current || subscriptions.length === 0) return;
    initialTabSet.current = true;

    const today = startOfDay(new Date());
    const active = subscriptions.filter(s => s.isActive && !s.isPaused && !isInstallmentComplete(s));

    const overdueByCat: Record<CommitmentKind, number> = { bills: 0, payments: 0, subs: 0 };
    let nearestDue: { kind: CommitmentKind; date: number } | null = null;

    for (const sub of active) {
      const kind = classifyKind(sub);
      if (!isClearedThisCycle(sub)) {
        if (sub.nextBillingDate < today) {
          overdueByCat[kind]++;
        }
        const t = sub.nextBillingDate.getTime();
        if (!nearestDue || t < nearestDue.date) {
          nearestDue = { kind, date: t };
        }
      }
    }

    if (overdueByCat.bills > 0) { setActiveTab('bills'); return; }
    if (overdueByCat.payments > 0) { setActiveTab('payments'); return; }
    if (overdueByCat.subs > 0) { setActiveTab('subs'); return; }
    if (nearestDue) { setActiveTab(nearestDue.kind); }
  }, [subscriptions, classifyKind]);

  // ── Tab counts (for label badges) ───────────────────────
  const tabCounts = useMemo(() => {
    const active = subscriptions.filter(s => s.isActive);
    return active.reduce((acc, s) => {
      const k = classifyKind(s);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, { bills: 0, payments: 0, subs: 0 } as Record<CommitmentKind, number>);
  }, [subscriptions, classifyKind]);

  // ── Sections (remaining / paid / paused) ────────────────
  const sections = useMemo(() => {
    const active = subscriptions.filter(s => s.isActive);
    const remaining: Subscription[] = [];
    const paid: Subscription[] = [];
    const paused: Subscription[] = [];

    for (const sub of active) {
      if (sub.isPaused) { paused.push(sub); continue; }
      if (isInstallmentComplete(sub) || isClearedThisCycle(sub)) { paid.push(sub); continue; }
      remaining.push(sub);
    }

    remaining.sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime());
    paid.sort((a, b) => (b.lastPaidAt?.getTime() || 0) - (a.lastPaidAt?.getTime() || 0));

    return { remaining, paid, paused };
  }, [subscriptions]);

  // ── Sections filtered by active tab ─────────────────────
  const tabSections = useMemo(() => ({
    remaining: sections.remaining.filter(s => classifyKind(s) === activeTab),
    paid:      sections.paid.filter(s => classifyKind(s) === activeTab),
    paused:    sections.paused.filter(s => classifyKind(s) === activeTab),
  }), [sections, activeTab, classifyKind]);

  // ── Display data (tab + status composed) ────────────────
  const displayData = useMemo(() => {
    if (heroMonthOffset !== 0) {
      const projected = getSubsForMonth(
        subscriptions,
        heroMonthOffset,
      ).sort((a, b) => a.amount - b.amount);
      const label = heroMonthOffset > 0 ? 'expected' : 'scheduled';
      return [{ label, subs: projected, isCleared: false }];
    }

    const today = startOfDay(new Date());
    const { remaining, paid, paused } = tabSections;
    // Behind by more than one cycle → render one bill per missed cycle. Each extra
    // row is a lightweight copy of the real record carrying __realId, so pay/edit/
    // detail all route back to the single underlying subscription (paying clears the
    // oldest cycle, so the row count drops by one each time).
    const overdue = remaining
      .filter(s => new Date(s.nextBillingDate) < today)
      .flatMap(s => {
        const occ = getOverdueOccurrences(s, today);
        if (occ.length <= 1) return [s];
        return occ.map((d, i) => ({ ...s, id: `${s.id}#${i}`, nextBillingDate: d, __realId: s.id } as any as Subscription));
      })
      .sort((a, b) => new Date(a.nextBillingDate).getTime() - new Date(b.nextBillingDate).getTime());
    const upcoming = remaining.filter(s => new Date(s.nextBillingDate) >= today);

    if (statusFilter === 'archived') {
      const archived = subscriptions.filter(s => !s.isActive);
      return [{ label: 'archived', subs: archived, isCleared: false }];
    }

    switch (statusFilter) {
      case 'upcoming':
        return [{ label: 'upcoming', subs: upcoming, isCleared: false }];
      case 'overdue':
        return [{ label: 'overdue', subs: overdue, isCleared: false }];
      case 'cleared':
        return [{ label: 'paid this cycle', subs: paid, isCleared: true }];
      case 'paused':
        return [{ label: 'paused', subs: paused, isCleared: false }];
      default: {
        const result: { label: string; subs: Subscription[]; isCleared: boolean }[] = [];
        if (overdue.length > 0) result.push({ label: 'overdue', subs: overdue, isCleared: false });
        if (upcoming.length > 0) result.push({ label: 'upcoming', subs: upcoming, isCleared: false });
        if (paid.length > 0) result.push({ label: 'paid this cycle', subs: paid, isCleared: true });
        if (paused.length > 0) result.push({ label: 'paused', subs: paused, isCleared: false });
        return result;
      }
    }
  }, [tabSections, statusFilter, subscriptions, heroMonthOffset, activeTab, classifyKind]);

  // ── Search result (flat filtered list) ──────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return subscriptions
      .filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      .sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime());
  }, [subscriptions, searchQuery]);

  // ── Recurring detection ───────────────────────────────────
  const recurringDetection = useMemo(() => {
    if (!transactions || transactions.filter(t => t.type === 'expense').length < 4) return [];
    const groups: Record<string, { name: string; amounts: number[]; dates: Date[]; category: string }> = {};
    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const key = t.description.toLowerCase().trim().split(/\s+/).slice(0, 2).join('-');
        if (!groups[key]) groups[key] = { name: t.description, amounts: [], dates: [], category: t.category };
        groups[key].amounts.push(t.amount);
        groups[key].dates.push(t.date instanceof Date ? t.date : new Date(t.date));
      });

    const suggestions: { name: string; amount: number; cycle: Subscription['billingCycle']; category: string }[] = [];
    for (const g of Object.values(groups)) {
      if (g.amounts.length < 2) continue;
      const avg = g.amounts.reduce((s, a) => s + a, 0) / g.amounts.length;
      if (!g.amounts.every(a => Math.abs(a - avg) / avg < 0.15)) continue;
      const sorted = [...g.dates].sort((a, b) => a.getTime() - b.getTime());
      const intervals = sorted.slice(1).map((d, i) => differenceInDays(d, sorted[i]));
      const avgInterval = intervals.reduce((s, i) => s + i, 0) / intervals.length;
      let cycle: Subscription['billingCycle'] | null = null;
      if (avgInterval >= 25 && avgInterval <= 35) cycle = 'monthly';
      else if (avgInterval >= 350 && avgInterval <= 380) cycle = 'yearly';
      if (!cycle) continue;
      const nameWords = g.name.toLowerCase().split(' ');
      const alreadyTracked = subscriptions.some(s =>
        s.name.toLowerCase().split(' ').some(sw => nameWords.some(w => w.length > 3 && (sw.includes(w) || w.includes(sw))))
      );
      if (alreadyTracked) continue;
      suggestions.push({ name: g.name, amount: Math.round(avg * 100) / 100, cycle, category: g.category });
    }
    return suggestions.slice(0, 3);
  }, [transactions, subscriptions]);

  // ─── Helpers ────────────────────────────────────────────
  const getCycleLabel = useCallback((cycle: string) => {
    const found = BILLING_CYCLES.find(c => c.value === cycle);
    return found ? found.label.toLowerCase() : cycle;
  }, []);

  // ─── Form Actions ───────────────────────────────────────
  const handleEdit = useCallback((id: string) => {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;
    lightTap();
    setEditingId(id);
    setModalVisible(true);
  }, [subscriptions]);

  const highlightHandled = useRef(false);
  useEffect(() => {
    const hid = route.params?.highlightId;
    if (hid && !highlightHandled.current) {
      highlightHandled.current = true;
      const target = subscriptions.find(s => s.id === hid);
      if (target) {
        setActiveTab(classifyKind(target));
        setTimeout(() => setDetailSub(target), 300);
      }
    }
  }, [route.params?.highlightId, subscriptions, classifyKind]);

  // Collapse the full-history view whenever the detail sheet opens a different
  // commitment or closes, so it always starts on the recent slice.
  useEffect(() => { setShowAllHistory(false); }, [detailSub?.id]);

  // Form save — receives the payload from CommitmentForm
  const handleFormSave = useCallback((payload: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>) => {
    const nextBilling = getNextBillingDate(payload.startDate, payload.billingCycle);
    if (editingId) {
      const existing = subscriptions.find(s => s.id === editingId);
      const startChanged = existing && payload.startDate.getTime() !== existing.startDate.getTime();
      const cycleChanged = existing && payload.billingCycle !== existing.billingCycle;
      let nextBillingDate = (startChanged || cycleChanged) ? nextBilling : (existing?.nextBillingDate || nextBilling);
      // A recompute derives the pointer purely from (start, cycle, now) — blind to
      // what's been paid. If the commitment already has active payments, never let
      // that pointer roll BACK behind the current oldest-unpaid cycle: doing so
      // resurfaces already-settled periods as phantom "overdue" rows, and paying
      // one deducts the wallet a second time. Cadence still changes going forward.
      if ((startChanged || cycleChanged) && existing?.paymentHistory?.some(p => !p.undoneAt)
          && nextBillingDate.getTime() < existing.nextBillingDate.getTime()) {
        nextBillingDate = existing.nextBillingDate;
      }
      updateSubscription(editingId, { ...payload, nextBillingDate });
      showToast(t.subscriptions.commitmentUpdated, 'success');
    } else {
      addSubscription({ ...payload, nextBillingDate: nextBilling });
      showToast(t.subscriptions.commitmentAdded, 'success');
    }
    if (payload.name && payload.category) useLearningStore.getState().learnCategory(payload.name, payload.category);
    setModalVisible(false);
    setEditingId(null);
  }, [editingId, subscriptions, addSubscription, updateSubscription, showToast, t]);

  const handleFormClose = useCallback(() => {
    setModalVisible(false);
    setEditingId(null);
    setSuggestionDraft(undefined);
  }, []);

  const handleFormDelete = useCallback((sub: Subscription) => {
    setModalVisible(false);
    setEditingId(null);
    setTimeout(() => setDeleteConfirmSub(sub), 250);
  }, []);

  const handleFormError = useCallback((message: string) => {
    showToast(message, 'error');
  }, [showToast]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirmSub) return;
    deleteSubscription(deleteConfirmSub.id);
    setDeleteConfirmSub(null);
    showToast(t.subscriptions.commitmentRemoved, 'success');
  }, [deleteConfirmSub, deleteSubscription, showToast, t]);

  const smartMarkPaid = useCallback((sub: Subscription) => {
    const isInst = sub.isInstallment && sub.totalInstallments;
    const instCompleted = (sub.completedInstallments || 0) >= (sub.totalInstallments || 0);

    // Gate 1: installment fully completed — celebrate, don't allow more
    if (isInst && instCompleted) {
      const totalPaid = sub.amount * (sub.totalInstallments || 0);
      successNotification();
      setCelebrationSub({ id: sub.id, name: sub.name, amount: sub.amount, cycle: sub.billingCycle, totalPaid, installments: sub.totalInstallments });
      return;
    }

    // Gate 1b: hasn't started yet — paying before the start date records a payment
    // dated before the bill itself exists (and means no overdue cycle is being
    // cleared). Warn, but allow override.
    if (startOfDay(new Date(sub.startDate)) > startOfDay(new Date())) {
      setPayWarning({ sub, reason: 'notStarted', detail: format(new Date(sub.startDate), 'MMM d, yyyy') });
      return;
    }

    // Gate 2: already paid this cycle (skip for installments — they can pay ahead)
    if (!isInst && isClearedThisCycle(sub)) {
      const lastPaid = sub.lastPaidAt ? format(new Date(sub.lastPaidAt), 'MMM d') : 'recently';
      setPayWarning({ sub, reason: 'double', detail: lastPaid });
      return;
    }

    // Gate 3: not due for 30+ days (skip for installments — early payment is normal)
    if (!isInst) {
      const daysUntilDue = differenceInDays(startOfDay(sub.nextBillingDate), startOfDay(new Date()));
      if (daysUntilDue > 30) {
        setPayWarning({ sub, reason: 'early', detail: format(sub.nextBillingDate, 'MMM d, yyyy') });
        return;
      }
    }

    setMarkPaidDate(null);
    setMpCalendarOpen(false);
    setMarkPaidSub(sub);
  }, []);

  const handleMarkPaid = useCallback((withExpense: boolean) => {
    if (!markPaidSub) return;
    let txId: string | undefined;
    const wId = withExpense ? markPaidSub.walletId : undefined;
    // When the user actually paid — they can pick a past date; defaults to today.
    const paidOn = markPaidDate ?? new Date();
    // The bill belongs to its due cycle. If paid late, date the expense to the cycle
    // (the 25 May bill stays under May, not the June day it was paid) so reports,
    // dashboard, budgets and the playbook all attribute it correctly. Never push an
    // early payment into the future — keep the pay date when paying on time or ahead.
    const cycleDate = new Date(markPaidSub.nextBillingDate);
    const expenseDate = paidOn > cycleDate ? cycleDate : paidOn;

    // Defensive double-pay guard. Gate 2 in smartMarkPaid relies solely on
    // isClearedThisCycle, which can flip back to "not cleared" after the user edits a
    // paid commitment's cycle/startDate (nextBillingDate recomputes on the new cadence
    // while lastPaidAt carries over) — re-enabling a second deduction + duplicate expense.
    // Block if this exact cycle already has an active payment. Installments legitimately
    // pay ahead (each advances the pointer → distinct periodDates), so they never false-block.
    const alreadyPaidThisCycle = !(markPaidSub.isInstallment && markPaidSub.totalInstallments)
      && (markPaidSub.paymentHistory || []).some(
        (p) => !p.undoneAt && isSameDay(new Date(p.periodDate ?? p.paidAt), cycleDate)
      );
    if (alreadyPaidThisCycle) {
      setMarkPaidSub(null);
      showToast('this cycle is already paid', 'error');
      return;
    }

    if (withExpense && markPaidSub.walletId) {
      txId = addTransaction({
        amount: markPaidSub.amount,
        category: markPaidSub.category,
        description: markPaidSub.name,
        type: 'expense',
        date: expenseDate,
        mode: 'personal',
        inputMethod: 'manual',
        walletId: markPaidSub.walletId,
      });
      deductFromWallet(markPaidSub.walletId, markPaidSub.amount);
    }
    markSubscriptionPaid(markPaidSub.id, txId, wId, paidOn);
    mediumTap();

    if (markPaidSub.sharedSubId) {
      // Per-cycle record — key by the cleared cycle's month so mark & undo agree.
      const month = format(cycleDate, 'yyyy-MM');
      ensureMonthRecord(markPaidSub.sharedSubId, month);
      markSharedSubPayment(markPaidSub.sharedSubId, month, '__self__');
    }

    // Check if installment just completed after this payment
    const freshSub = usePersonalStore.getState().subscriptions.find(s => s.id === markPaidSub.id);
    if (freshSub?.isInstallment && freshSub.totalInstallments &&
        (freshSub.completedInstallments || 0) >= freshSub.totalInstallments) {
      const totalPaid = freshSub.amount * freshSub.totalInstallments;
      setMarkPaidSub(null);
      setTimeout(() => {
        successNotification();
        setCelebrationSub({
          id: freshSub.id, name: freshSub.name, amount: freshSub.amount, cycle: freshSub.billingCycle,
          totalPaid, installments: freshSub.totalInstallments,
        });
      }, 300);
      return;
    }

    setMarkPaidSub(null);
    showToast('cleared.', 'success');
  }, [markPaidSub, markPaidDate, markSubscriptionPaid, addTransaction, deductFromWallet, showToast, markSharedSubPayment, ensureMonthRecord]);

  const guardedMarkPaid = useSubmitGuard(handleMarkPaid);

  // ─── Render helpers ────────────────────────────────────

  const renderWalletChip = useCallback((wId?: string) => {
    if (!wId) return null;
    const wallet = wallets.find(w => w.id === wId);
    if (!wallet) return null;
    return (
      <View style={[styles.walletChip, { backgroundColor: withAlpha(wallet.color, 0.12) }]}>
        <View style={[styles.walletChipDot, { backgroundColor: wallet.color }]} />
        <Text style={[styles.walletChipText, { color: wallet.color }]} numberOfLines={1}>
          {wallet.name.length > 10 ? wallet.name.slice(0, 9) + '…' : wallet.name}
        </Text>
      </View>
    );
  }, [wallets, styles]);

  const getCycleShort = useCallback((cycle: string) => {
    switch (cycle) {
      case 'weekly':    return 'wk';
      case 'quarterly': return 'qtr';
      case 'yearly':    return 'yr';
      default:          return 'mo';
    }
  }, []);

  const renderRow = useCallback((sub: Subscription, isCleared: boolean) => {
    const accentColor = avatarColorForName(sub.name);
    const { text: dueDateText, accent } = getDueDateInfo(sub.nextBillingDate);
    // Overdue-arrears rows are virtual copies (id = "<realId>#<n>"); pay/edit/detail
    // must act on the real subscription, not the throwaway occurrence row.
    const realId = (sub as any).__realId as string | undefined;
    const resolveReal = (): Subscription =>
      realId ? (usePersonalStore.getState().subscriptions.find(s => s.id === realId) || sub) : sub;
    const dueColor = isCleared ? C.textMuted
      : accent === 'overdue' ? C.overdue
      : accent === 'today'   ? C.gold
      : C.textSecondary;

    const isInstallmentSub = sub.isInstallment && sub.totalInstallments;
    const completed = sub.completedInstallments || 0;
    const total = sub.totalInstallments || 1;
    const progress = isInstallmentSub ? Math.min(completed / total, 1) : 0;
    const installmentDone = !!(isInstallmentSub && completed >= total);
    const canPayInstallment = isInstallmentSub && !installmentDone;

    const subText = sub.isPaused
      ? `paused · ${getCycleLabel(sub.billingCycle)}`
      : isCleared && sub.lastPaidAt
        ? `paid ${format(sub.lastPaidAt, 'MMM d')}`
        : dueDateText;

    const rightSubText = sub.isPaused ? '' :
      isCleared ? getCycleLabel(sub.billingCycle) :
      isInstallmentSub ? `${completed}/${total}` :
      getCycleLabel(sub.billingCycle);

    const statusBadge = installmentDone
      ? { label: 'complete', color: C.positive, bg: withAlpha(C.positive, 0.10) }
      : sub.isPaused
        ? { label: 'paused', color: C.bronze, bg: withAlpha(C.bronze, 0.10) }
        : isCleared
          ? { label: sub.lastPaidAt ? `paid ${format(new Date(sub.lastPaidAt), 'MMM d')}` : 'paid', color: C.positive, bg: withAlpha(C.positive, 0.10) }
          : accent === 'overdue'
            ? { label: 'overdue', color: C.overdue, bg: withAlpha(C.overdue, 0.10) }
            : accent === 'today'
              ? { label: 'due today', color: C.gold, bg: withAlpha(C.gold, 0.12) }
              : null;

    const rowContent = (
      <Pressable
        style={[styles.row, (isCleared || sub.isPaused || installmentDone) && styles.rowDimmed]}
        android_ripple={{ color: withAlpha(C.textMuted, 0.06) }}
        onPress={() => { lightTap(); setDetailSub(resolveReal()); }}
      >
        {/* Squircle avatar */}
        {installmentDone ? (
          <View style={[styles.rowIcon, neu.raised, { backgroundColor: withAlpha(C.positive, 0.12) }]}>
            <Feather name="check-circle" size={18} color={C.positive} />
          </View>
        ) : sub.imageUri ? (
          <Image source={{ uri: sub.imageUri }} style={styles.rowIconImage} />
        ) : sub.iconName ? (
          <View style={[styles.rowIcon, neu.raised, { backgroundColor: withAlpha(C.accent, 0.10) }]}>
            {renderIcon(sub.iconName, 24, C.accent)}
          </View>
        ) : (
          <View style={[
            styles.rowIcon,
            neu.raised,
            { backgroundColor: isCleared ? withAlpha(C.positive, 0.12) : withAlpha(accentColor, 0.14) },
          ]}>
            {isCleared
              ? <Feather name="check" size={16} color={C.positive} />
              : <Text style={[styles.rowIconLetter, { color: accentColor }]}>{sub.name.charAt(0).toUpperCase()}</Text>
            }
          </View>
        )}

        {/* Center: name + meta row */}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>{sub.name}</Text>
          <View style={styles.rowMeta}>
            <Text style={styles.rowCycleText}>{getCycleLabel(sub.billingCycle)}</Text>
            {statusBadge && (
              <View style={[styles.rowStatusPill, { backgroundColor: statusBadge.bg }]}>
                <Text style={[styles.rowStatusText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
              </View>
            )}
            {!statusBadge && !isCleared && (
              <Text style={styles.rowDueText}>{dueDateText}</Text>
            )}
            {sub.sharedSubId && (
              <>
                <Text style={styles.rowCycleText}>·</Text>
                <Feather name="users" size={10} color={C.textMuted} />
                <Text style={styles.rowCycleText}>shared</Text>
              </>
            )}
          </View>
          {isInstallmentSub && (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: installmentDone ? C.positive : accentColor }]} />
            </View>
          )}
        </View>

        {/* Right: amount */}
        <View style={styles.rowRight}>
          <Text style={[styles.rowAmount, (isCleared || installmentDone) && styles.rowAmountCleared]}>
            {currency} {sub.amount.toFixed(2)}
          </Text>
          {isInstallmentSub && (
            <Text style={styles.rowInstFraction}>{(sub.completedInstallments || 0)}/{sub.totalInstallments}</Text>
          )}
        </View>
      </Pressable>
    );

    // Wallet-pattern swipeable: right→paid (only if unpaid), left→edit (always)
    const triggerPaid = (s: SwipeableMethods) => {
      hardSwipedRef.current.add(sub.id);
      s.close();
      mediumTap();
      smartMarkPaid(resolveReal());
    };
    const triggerEdit = (s: SwipeableMethods) => {
      hardSwipedRef.current.add(sub.id);
      s.close();
      mediumTap();
      handleEdit(resolveReal().id);
    };

    const renderRightActions = (
      _prog: SharedValue<number>,
      drag: SharedValue<number>,
      swipeable: SwipeableMethods,
      // Only allow swipe-to-pay in the current month. In a projected (next/prev-month)
      // view these are the REAL current-cycle rows, so "pre-paying" here would silently
      // clear the current cycle — confusing. Tapping the row still opens read-only detail.
    ) => (heroMonthOffset === 0 && (!isCleared || canPayInstallment) && !sub.isPaused ? (
      <SubSwipeAction
        variant="paid"
        direction="right"
        drag={drag}
        label={canPayInstallment ? `pay ${completed + 1}/${total}` : 'mark paid'}
        styles={styles}
        onTap={() => triggerPaid(swipeable)}
        onHardSwipe={() => triggerPaid(swipeable)}
      />
    ) : null);

    const renderLeftActions = (
      _prog: SharedValue<number>,
      drag: SharedValue<number>,
      swipeable: SwipeableMethods,
    ) => (
      <SubSwipeAction
        variant="edit"
        direction="left"
        drag={drag}
        label="edit"
        styles={styles}
        onTap={() => triggerEdit(swipeable)}
        onHardSwipe={() => triggerEdit(swipeable)}
      />
    );

    return (
      <View style={[styles.rowShadow, neu.raisedSoft]}>
      <ReanimatedSwipeable
        key={sub.id}
        ref={((ref: SwipeableMethods | null) => {
          if (ref) swipeableRefs.current.set(sub.id, ref);
          else swipeableRefs.current.delete(sub.id);
        }) as unknown as React.RefObject<SwipeableMethods>}
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        friction={1.2}
        rightThreshold={48}
        leftThreshold={48}
        overshootRight
        overshootLeft
        overshootFriction={2}
        dragOffsetFromLeftEdge={15}
        dragOffsetFromRightEdge={15}
        animationOptions={{ mass: 0.5, damping: 24, stiffness: 420, overshootClamping: true }}
        onSwipeableOpen={() => {
          // Auto-close after the settle animation if this row was hard-swiped
          if (hardSwipedRef.current.has(sub.id)) {
            hardSwipedRef.current.delete(sub.id);
            swipeableRefs.current.get(sub.id)?.close();
            return;
          }
          // Otherwise close any other open swipes
          swipeableRefs.current.forEach((ref, key) => {
            if (key !== sub.id) ref.close();
          });
        }}
      >
        {rowContent}
      </ReanimatedSwipeable>
      </View>
    );
  }, [
    expenseCategories, getCycleShort,
    renderWalletChip, handleEdit, currency, C, styles, heroMonthOffset,
  ]);

  // ─── Section (each row is its own neu card — no section card / dividers) ─
  const renderSection = useCallback((label: string, subs: Subscription[], isCleared = false) => {
    if (subs.length === 0) return null;
    const sectionTotal = subs.reduce((sum, s) => sum + s.amount, 0);
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{label} ({subs.length})</Text>
          <Text style={styles.sectionTotal}>{currency} {sectionTotal.toFixed(2)}</Text>
        </View>
        <View>
          {subs.map((sub) => (
            <React.Fragment key={sub.id}>
              {renderRow(sub, isCleared)}
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  }, [renderRow, styles, currency]);

  // ─── Suggestions (smart recurring detection) ─────────────
  const renderSuggestions = useCallback(() => {
    if (recurringDetection.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>looks recurring</Text>
        </View>
        {recurringDetection.map((s) => (
          <React.Fragment key={s.name}>
            <TouchableOpacity
              style={[styles.suggestionRow, neu.raisedSoft]}
              onPress={() => {
                lightTap();
                setEditingId(null);
                setSuggestionDraft({ name: s.name, amount: s.amount, category: s.category, billingCycle: s.cycle });
                setModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.suggestionLeft}>
                <View style={[styles.suggestionBadge, neu.well]}>
                  <Feather name="repeat" size={12} color={C.bronze} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.suggestionMeta}>{currency} {s.amount.toFixed(2)} · {s.cycle}</Text>
                </View>
              </View>
              <View style={[styles.suggestionAction, neu.raised]}>
                <Text style={styles.suggestionActionText}>track</Text>
              </View>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
    );
  }, [recurringDetection, currency, C, styles, neu]);

  const annualizeAmount = useCallback((amount: number, cycle: string): number => {
    switch (cycle) {
      case 'weekly': return amount * 52;
      case 'quarterly': return amount * 4;
      case 'yearly': return amount;
      default: return amount * 12;
    }
  }, []);

  const renderMonthHeader = () => {
    const isCurrent = heroMonthOffset === 0;
    const targetDate = isCurrent ? new Date() : addMonths(new Date(), heroMonthOffset);

    let paidSubs: Subscription[];
    let unpaidSubs: Subscription[];
    let allSubs: Subscription[];

    if (isCurrent) {
      const { remaining, paid, paused } = tabSections;
      allSubs = [...remaining, ...paid, ...paused];
      paidSubs = paid;
      unpaidSubs = remaining;
    } else {
      const projected = getSubsForMonth(subscriptions, heroMonthOffset);
      allSubs = projected;
      paidSubs = [];
      unpaidSubs = projected;
    }

    // Recurring load under the /mo·/yr toggle must be CYCLE-NORMALIZED — a yearly
    // RM1800 bill is RM150/mo, not RM1800/mo — and must exclude paused + finished
    // installments (which no longer bill). Deriving /mo as /yr÷12 keeps the two
    // toggle values consistent (mo×12 === yr) instead of the old raw sum where a
    // yearly bill counted in full and /mo contradicted /yr.
    const loadSubs = allSubs.filter(s => !s.isPaused && !isInstallmentComplete(s));
    const yearlyTotal = loadSubs.reduce((s, x) => s + annualizeAmount(x.amount, x.billingCycle), 0);
    const monthlyTotal = yearlyTotal / 12;
    const remainingTotal = unpaidSubs.reduce((s, x) => s + x.amount, 0);
    const paidTotal = paidSubs.reduce((s, x) => s + x.amount, 0);
    const showSplit = isCurrent && remainingTotal > 0 && paidTotal > 0;
    const allPaid = isCurrent && unpaidSubs.length === 0 && paidSubs.length > 0;
    const paidCount = paidSubs.length;
    const activeCount = allSubs.length;
    const barSubs = [...paidSubs, ...unpaidSubs];

    const nextDueSub = [...unpaidSubs]
      .sort((a, b) => new Date(a.nextBillingDate).getTime() - new Date(b.nextBillingDate).getTime())[0];
    const nextDueDays = nextDueSub ? differenceInDays(startOfDay(new Date(nextDueSub.nextBillingDate)), startOfDay(new Date())) : null;
    const overdueCount = isCurrent ? unpaidSubs.filter(s => new Date(s.nextBillingDate) < startOfDay(new Date())).length : 0;
    const displayAmount = period === 'yr' ? yearlyTotal : period === 'day' ? yearlyTotal / 365 : monthlyTotal;

    return (
      <Reanimated.View
        style={[styles.monthHeader, neu.raisedSoft, { backgroundColor: isDark ? withAlpha(C.accent, 0.06) : withAlpha(C.accent, 0.03) }, slideStyle]}
        onTouchStart={(e) => { heroTouchRef.current = { x: e.nativeEvent.pageX, time: Date.now() }; }}
        onTouchEnd={(e) => {
          const dx = e.nativeEvent.pageX - heroTouchRef.current.x;
          const dt = Date.now() - heroTouchRef.current.time;
          if (dt < 400 && Math.abs(dx) > 40) {
            if (dx < 0 && heroMonthOffset < 1) { lightTap(); changeMonth(heroMonthOffset + 1); }
            else if (dx > 0 && heroMonthOffset > -1) { lightTap(); changeMonth(heroMonthOffset - 1); }
          }
        }}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroMonthNav}>
            <Pressable
              onPress={() => { if (heroMonthOffset > -1) { lightTap(); changeMonth(heroMonthOffset - 1); } }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ opacity: heroMonthOffset > -1 ? 1 : 0.25 }}
            >
              <Feather name="chevron-left" size={16} color={C.textMuted} />
            </Pressable>
            <Text style={styles.heroMonth}>{format(targetDate, 'MMMM yyyy').toLowerCase()}</Text>
            <Pressable
              onPress={() => { if (heroMonthOffset < 1) { lightTap(); changeMonth(heroMonthOffset + 1); } }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ opacity: heroMonthOffset < 1 ? 1 : 0.25 }}
            >
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </Pressable>
            {!isCurrent && (
              <Pressable
                onPress={() => { lightTap(); changeMonth(0); }}
                style={styles.heroBackBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.heroBackBtnText}>today</Text>
              </Pressable>
            )}
          </View>
          <GlassSegmentedControl
            values={['/day', '/mo', '/yr']}
            selectedIndex={period === 'day' ? 0 : period === 'mo' ? 1 : 2}
            onChange={(i) => setPeriod(i === 0 ? 'day' : i === 1 ? 'mo' : 'yr')}
            width={120}
          />
        </View>

        <Text style={styles.heroAmount}>
          <Text style={styles.heroAmountCurrency}>{currency} </Text>
          {displayAmount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
        </Text>

        {showSplit && (
          <View style={styles.heroBreakdownRow}>
            <Text style={styles.heroBreakdownText}>
              <Text style={styles.heroBreakdownBold}>{currency} {paidTotal.toFixed(0)}</Text> paid
            </Text>
            <Text style={styles.heroBreakdownDot}>·</Text>
            <Text style={styles.heroBreakdownText}>
              <Text style={styles.heroBreakdownBold}>{currency} {remainingTotal.toFixed(0)}</Text> remaining
            </Text>
          </View>
        )}
        {!isCurrent && activeCount > 0 && (
          <View style={styles.heroBreakdownRow}>
            <Feather name="calendar" size={12} color={C.textMuted} />
            <Text style={[styles.heroBreakdownText, { marginLeft: 4 }]}>
              <Text style={styles.heroBreakdownBold}>{activeCount}</Text> {activeCount === 1 ? 'commitment' : 'commitments'} {heroMonthOffset > 0 ? 'expected' : 'scheduled'}
            </Text>
          </View>
        )}
        {isCurrent && !showSplit && !allPaid && activeCount > 0 && (
          <View style={styles.heroBreakdownRow}>
            <Text style={styles.heroBreakdownText}>
              <Text style={styles.heroBreakdownBold}>{activeCount}</Text> {activeCount === 1 ? 'commitment' : 'commitments'} this month
            </Text>
          </View>
        )}

        {activeCount > 0 && (
          <View style={styles.heroSegBar}>
            {barSubs.map((sub, i) => {
              const isPaid = paidSubs.some(p => p.id === sub.id);
              return (
                <View
                  key={sub.id}
                  style={[
                    styles.heroSegBarItem,
                    { flex: sub.amount, backgroundColor: isPaid ? C.accent : withAlpha(C.textMuted, 0.15) },
                    i === 0 && { borderTopLeftRadius: 3, borderBottomLeftRadius: 3 },
                    i === barSubs.length - 1 && { borderTopRightRadius: 3, borderBottomRightRadius: 3 },
                  ]}
                />
              );
            })}
          </View>
        )}

        {activeCount > 0 && (
          <>
            <View style={styles.heroStripDivider} />
            <View style={styles.heroStatsRow}>
              {isCurrent ? (
                <View style={styles.heroStatCol}>
                  <Text style={styles.heroStatValue}>{paidCount}/{activeCount}</Text>
                  <Text style={styles.heroStatLabel}>paid</Text>
                </View>
              ) : (
                <View style={styles.heroStatCol}>
                  <Text style={styles.heroStatValue}>{activeCount}</Text>
                  <Text style={styles.heroStatLabel}>{heroMonthOffset > 0 ? 'expected' : 'billed'}</Text>
                </View>
              )}
              {nextDueSub && nextDueDays !== null ? (
                <View style={[styles.heroStatCol, styles.heroStatColBorder]}>
                  <Text style={[
                    styles.heroStatValue,
                    isCurrent && nextDueDays < 0 && { color: C.bronze },
                    isCurrent && nextDueDays === 0 && { color: C.accent },
                  ]}>
                    {isCurrent
                      ? (nextDueDays === 0 ? 'today' : nextDueDays < 0 ? `${Math.abs(nextDueDays)}d late` : `${nextDueDays}d`)
                      : format(new Date(nextDueSub.nextBillingDate), 'd MMM').toLowerCase()}
                  </Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1}>
                    {isCurrent ? nextDueSub.name.toLowerCase() : 'earliest'}
                  </Text>
                </View>
              ) : (
                <View style={[styles.heroStatCol, styles.heroStatColBorder]}>
                  <Text style={[styles.heroStatValue, { color: C.accent }]}>—</Text>
                  <Text style={styles.heroStatLabel}>{isCurrent ? 'next due' : 'earliest'}</Text>
                </View>
              )}
              {isCurrent && overdueCount > 0 ? (
                <View style={[styles.heroStatCol, styles.heroStatColBorder]}>
                  <Text style={[styles.heroStatValue, { color: C.bronze }]}>{overdueCount}</Text>
                  <Text style={styles.heroStatLabel}>overdue</Text>
                </View>
              ) : (
                <View style={[styles.heroStatCol, styles.heroStatColBorder]}>
                  <Text style={styles.heroStatValue}>{currency} {yearlyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                  <Text style={styles.heroStatLabel}>yearly</Text>
                </View>
              )}
            </View>
          </>
        )}

        <View style={styles.heroPageDots}>
          {[-1, 0, 1].map(i => (
            <View key={i} style={[styles.heroPageDot, heroMonthOffset === i && styles.heroPageDotActive]} />
          ))}
        </View>
      </Reanimated.View>
    );
  };

  // ─── Status context chips (tab-aware) ───────────────────
  const statusCounts = useMemo(() => {
    const today = startOfDay(new Date());
    const { remaining, paid, paused } = tabSections;
    const overdue = remaining.filter(s => new Date(s.nextBillingDate) < today);
    const upcoming = remaining.filter(s => new Date(s.nextBillingDate) >= today);
    const archivedCount = subscriptions.filter(s => !s.isActive).length;
    // Count each missed cycle as its own bill so the chip matches the rows shown.
    const overdueCount = overdue.reduce((sum, s) => sum + Math.max(1, getOverdueOccurrences(s, today).length), 0);
    return {
      all: remaining.length + paid.length + paused.length,
      upcoming: upcoming.length,
      overdue: overdueCount,
      cleared: paid.length,
      paused: paused.length,
      archived: archivedCount,
    };
  }, [tabSections, subscriptions]);


  const renderContextChips = () => {
    if (subscriptions.length === 0) return null;
    // Type pills
    const typePills: { key: CommitmentKind; label: string }[] = [
      { key: 'bills', label: 'bills' },
      { key: 'payments', label: 'payments' },
      { key: 'subs', label: 'subscriptions' },
    ];

    // Status chips (only 3 inline)
    const statusChips: { key: StatusFilter; label: string; icon: string }[] = [
      { key: 'all', label: 'all', icon: 'layers' },
      { key: 'upcoming', label: 'upcoming', icon: 'clock' },
      { key: 'overdue', label: 'overdue', icon: 'alert-circle' },
    ];

    const hasActiveFilter = statusFilter === 'cleared' || statusFilter === 'paused' || statusFilter === 'archived';

    return (
      <View style={styles.chipSection}>
        {/* Type tabs (underline style) */}
        <View style={styles.typeTabRow}>
          {typePills.map(pill => {
            const active = activeTab === pill.key;
            const count = tabCounts[pill.key];
            return (
              <TouchableOpacity
                key={pill.key}
                style={[styles.typeTab, active && styles.typeTabActive]}
                onPress={() => { lightTap(); setActiveTab(pill.key); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.typeTabText, active && styles.typeTabTextActive]}>
                  {pill.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.typeTabBadge, active && styles.typeTabBadgeActive]}>
                    <Text style={[styles.typeTabBadgeText, active && styles.typeTabBadgeTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Status pills + filter button */}
        <View style={styles.statusRow}>
          {statusChips.map(chip => {
            const active = statusFilter === chip.key;
            const count = statusCounts[chip.key];
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.statusPill, neu.raised, active && styles.statusPillActive]}
                onPress={() => { lightTap(); setStatusFilter(chip.key); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.statusPillText, active && styles.statusPillTextActive]}>
                  {chip.label}{count > 0 && chip.key !== 'all' ? ` ${count}` : ''}
                </Text>
                {!active && chip.key === 'overdue' && count > 0 && (
                  <View style={styles.ctxOverdueDot} />
                )}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.filterBtn, neu.raised, hasActiveFilter && styles.filterBtnActive]}
            onPress={() => { lightTap(); setFilterModalVisible(true); }}
            activeOpacity={0.7}
          >
            <Feather name="sliders" size={14} color={hasActiveFilter ? C.accent : C.textMuted} />
            {hasActiveFilter && <View style={styles.filterBtnDot} />}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Day strip (14-day forecast) ──────────────────────
  const renderDayStrip = useCallback(() => {
    if (subscriptions.length === 0) return null;
    if (dayStrip.every(d => d.bills.length === 0)) return null;

    return (
      <View style={styles.dayStripWrap}>
        <View style={{ position: 'relative', marginRight: -SPACING['2xl'] }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: SPACING['2xl'], gap: 6 }}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
          >
            {dayStrip.map(({ date, isToday, bills }) => {
              const totalForDay = bills.reduce((s, b) => s + b.amount, 0);
              return (
                <TouchableOpacity
                  key={date.toISOString()}
                  style={[
                    styles.dayCol,
                    isToday && styles.dayColToday,
                    bills.length > 0 && !isToday && [styles.dayColHasBill, neu.raised],
                  ]}
                  onPress={() => bills[0] && handleEdit(bills[0].id)}
                  activeOpacity={bills.length > 0 ? 0.6 : 1}
                  disabled={bills.length === 0}
                >
                  <Text style={[styles.dayColNum, isToday && styles.dayColNumToday]}>
                    {format(date, 'd')}
                  </Text>
                  <View style={styles.dayColDots}>
                    {bills.slice(0, 3).map(b => {
                      const c = expenseCategories.find(x => x.id === b.category);
                      return (
                        <View
                          key={b.id}
                          style={[styles.dayDot, { backgroundColor: c?.color || C.accent }]}
                        />
                      );
                    })}
                  </View>
                  {bills.length > 0 && (
                    <Text style={[styles.dayColAmt, isToday && { color: C.accent }]}>
                      {totalForDay >= 1000 ? `${(totalForDay/1000).toFixed(1)}k` : totalForDay.toFixed(0)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <LinearGradient
            colors={[`${C.background}00`, C.background]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, pointerEvents: 'none' } as any}
          />
        </View>
      </View>
    );
  }, [dayStrip, subscriptions.length, expenseCategories, handleEdit, currency, C, styles]);

  // ─── Stats line ───────────────────────────────────────
  const renderStatsLine = () => {
    if (subscriptions.length === 0) return null;
    const displayAmount = period === 'yr' ? totalAnnual : period === 'day' ? totalAnnual / 365 : totalMonthly;
    const { cleared, pending, paused } = heroStats;

    return (
      <Pressable
        onPress={() => { lightTap(); setPeriod(period === 'day' ? 'mo' : period === 'mo' ? 'yr' : 'day'); }}
        style={styles.statsLine}
      >
        <Text style={styles.statsAmount}>
          {currency} {displayAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <Text style={styles.statsPeriod}>/{period}</Text>
        </Text>
        <View style={styles.statsDivider} />
        <Text style={styles.statsCounts}>
          <Text style={{ color: C.positive }}>{cleared}</Text>
          <Text style={{ color: C.textMuted }}> · </Text>
          <Text style={{ color: C.gold }}>{pending}</Text>
          {paused > 0 && (
            <>
              <Text style={{ color: C.textMuted }}> · </Text>
              <Text style={{ color: C.textMuted }}>{paused}</Text>
            </>
          )}
        </Text>
        {categoryBreakdown.length > 0 && (
          <View style={styles.statsBar}>
            {categoryBreakdown.map(item => (
              <View
                key={item.id}
                style={{ flex: item.pct * 100, backgroundColor: item.color }}
              />
            ))}
          </View>
        )}
      </Pressable>
    );
  };

  // ─── Mark as Paid modal ───────────────────────────────
  const renderMarkPaidModal = () => {
    if (!markPaidSub) return null;
    const linkedWallet = wallets.find(w => w.id === markPaidSub.walletId);
    // Compute what the next billing date will be after marking paid
    let nextAfterPaid = new Date(markPaidSub.nextBillingDate);
    switch (markPaidSub.billingCycle) {
      case 'weekly':    nextAfterPaid.setDate(nextAfterPaid.getDate() + 7);    break;
      case 'quarterly': nextAfterPaid.setMonth(nextAfterPaid.getMonth() + 3);  break;
      case 'yearly':    nextAfterPaid.setFullYear(nextAfterPaid.getFullYear() + 1); break;
      default:          nextAfterPaid.setMonth(nextAfterPaid.getMonth() + 1);  break;
    }

    const paidOn = markPaidDate ?? new Date();
    const today = new Date();
    const closeMp = () => { setMpCalendarOpen(false); setMarkPaidSub(null); };

    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={closeMp}>
        <Pressable style={styles.overlayCenter} onPress={closeMp}>
          <View style={[styles.markPaidCard, neu.raisedModal, mpCalendarOpen && { width: '94%', paddingHorizontal: SPACING.sm }]} onStartShouldSetResponder={() => true}>
            {mpCalendarOpen ? (
              <>
                <View style={[styles.modalHeader, { width: '100%' }]}>
                  <TouchableOpacity onPress={() => setMpCalendarOpen(false)} style={[styles.backBtn, neu.raised]} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Feather name="arrow-left" size={20} color={C.textPrimary} />
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>when did you pay?</Text>
                  <View style={{ width: 32 }} />
                </View>
                <View style={{ width: '100%' }}>
                  <CalendarPicker
                    value={paidOn}
                    minimumDate={getPrevBillingDate(markPaidSub.nextBillingDate, markPaidSub.billingCycle)}
                    maximumDate={today}
                    onChange={(d) => { setMarkPaidDate(d); setMpCalendarOpen(false); }}
                  />
                </View>
              </>
            ) : (
              <>
                {/* Dismiss X */}
                <TouchableOpacity
                  onPress={closeMp}
                  style={[styles.mpCloseBtn, neu.raised]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={18} color={C.textMuted} />
                </TouchableOpacity>

                {/* Hero amount */}
                <Text style={styles.mpHeroAmount}>
                  <Text style={styles.mpHeroCurrency}>{currency} </Text>
                  {markPaidSub.amount.toFixed(2)}
                </Text>
                <Text style={styles.mpName}>{markPaidSub.name}</Text>

                {/* Paid-on date — tap to pick when you actually paid */}
                <TouchableOpacity
                  style={[styles.mpDatePill, neu.raised]}
                  onPress={() => { lightTap(); setMpCalendarOpen(true); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`change pay date, currently ${isSameDay(paidOn, today) ? 'today' : format(paidOn, 'd MMMM yyyy')}`}
                >
                  <Feather name="calendar" size={13} color={C.accent} />
                  <Text style={styles.mpDateLabel}>paid</Text>
                  <Text style={styles.mpDateText}>{isSameDay(paidOn, today) ? 'today' : format(paidOn, 'd MMM yyyy')}</Text>
                  <Feather name="chevron-down" size={14} color={C.textMuted} />
                </TouchableOpacity>

                {/* Next cycle pill */}
                <View style={styles.mpNextPill}>
                  <Feather name="repeat" size={11} color={C.textMuted} />
                  <Text style={styles.mpNextText}>next cycle {format(nextAfterPaid, 'MMM d')}</Text>
                </View>

                {/* Actions */}
                <View style={styles.mpActions}>
                  {linkedWallet ? (
                    <>
                      <TouchableOpacity
                        style={[styles.markPaidBtn, neu.raised, { backgroundColor: withAlpha(linkedWallet.color, 0.15) }]}
                        onPress={() => {
                          // Overdraw guard: paying more than a non-credit wallet holds would
                          // silently push it negative (deductFromWallet only warns). Confirm first.
                          if (linkedWallet.type !== 'credit' && (linkedWallet.balance ?? 0) < markPaidSub.amount) {
                            Alert.alert(
                              `not enough in ${linkedWallet.name}`,
                              `this pays ${currency} ${markPaidSub.amount.toFixed(2)} from ${linkedWallet.name} (balance ${currency} ${(linkedWallet.balance ?? 0).toFixed(2)}) — it'll go negative. continue?`,
                              [
                                { text: 'cancel', style: 'cancel' },
                                { text: 'pay anyway', style: 'destructive', onPress: () => guardedMarkPaid(true) },
                              ],
                            );
                            return;
                          }
                          guardedMarkPaid(true);
                        }}
                        activeOpacity={0.85}
                      >
                        <WalletLogo wallet={linkedWallet} size={18} />
                        <Text style={[styles.markPaidBtnText, { color: linkedWallet.color }]}>
                          pay from {linkedWallet.name}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.mpWalletBtn, neu.raised]} onPress={() => guardedMarkPaid(false)} activeOpacity={0.85}>
                        <Feather name="check" size={18} color={C.textSecondary} />
                        <Text style={styles.mpWalletBtnText}>mark as paid</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <NeuButton icon="check" label="mark as paid" onPress={() => guardedMarkPaid(false)} />
                  )}
                </View>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    );
  };

  // ─── Pay warning modal (double-pay / too-early) ────────
  const renderPayWarningModal = () => {
    if (!payWarning) return null;
    const { sub, reason, detail } = payWarning;
    const isDouble = reason === 'double';
    const isNotStarted = reason === 'notStarted';

    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPayWarning(null)}>
        <Pressable style={styles.overlayCenter} onPress={() => setPayWarning(null)}>
          <View style={[styles.warnCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
            <View style={[styles.warnIconCircle, neu.well]}>
              <Feather name={isDouble ? 'alert-circle' : isNotStarted ? 'calendar' : 'clock'} size={24} color={C.gold} />
            </View>
            <Text style={styles.warnTitle}>
              {isDouble ? 'already ' : isNotStarted ? 'not started ' : 'not due '}
              <Text style={styles.warnTitleAccent}>{isDouble ? 'paid' : 'yet'}</Text>
            </Text>
            <Text style={styles.warnBody}>
              {isDouble
                ? `you paid ${sub.name.toLowerCase()} on ${detail}.\npay again for this cycle?`
                : isNotStarted
                  ? `${sub.name.toLowerCase()} doesn't start until ${detail}.\nyou'd be recording a payment before it begins. mark it paid anyway?`
                  : `${sub.name.toLowerCase()} isn't due until ${detail}.\nmark it paid now?`}
            </Text>
            <NeuButton
              icon="check"
              label="pay anyway"
              color={C.gold}
              onPress={() => { setPayWarning(null); setTimeout(() => setMarkPaidSub(sub), 50); }}
            />
            <Pressable
              style={styles.warnDismiss}
              onPress={() => setPayWarning(null)}
              hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
            >
              {({ pressed }) => (
                <Text style={[styles.warnDismissText, pressed && { opacity: 0.55 }]}>not now</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    );
  };

  // ─── Celebration modal (installment complete) ──────────
  const handleArchive = useCallback((subId: string) => {
    updateSubscription(subId, { isActive: false });
    setCelebrationSub(null);
    showToast('archived', 'success');
  }, [updateSubscription, showToast]);

  const renderCelebrationModal = () => {
    if (!celebrationSub) return null;
    const { id: celebId, name: cName, amount: cAmt, totalPaid, installments } = celebrationSub;

    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCelebrationSub(null)}>
        <Pressable style={styles.overlayCenter} onPress={() => setCelebrationSub(null)}>
          <Reanimated.View entering={ZoomIn.duration(320)}>
            <View style={[styles.celebCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>

              {/* Confetti burst + glow rings + icon */}
              <View style={styles.celebBurstWrap}>
                <GlowRing color={withAlpha(C.accent, 0.22)} size={72} delay={150} />
                <GlowRing color={withAlpha(C.gold, 0.16)} size={96} delay={700} />

                <ConfettiPiece angle={0} distance={58} size={6} color={withAlpha(C.gold, 0.7)} delay={60} />
                <ConfettiPiece angle={30} distance={48} size={5} color={withAlpha(C.accent, 0.5)} delay={100} />
                <ConfettiPiece angle={60} distance={62} size={7} color={withAlpha(C.bronze, 0.6)} delay={140} />
                <ConfettiPiece angle={90} distance={52} size={4} color={withAlpha(C.gold, 0.55)} delay={80} />
                <ConfettiPiece angle={120} distance={56} size={6} color={withAlpha(C.accent, 0.45)} delay={120} />
                <ConfettiPiece angle={150} distance={46} size={5} color={withAlpha(C.bronze, 0.5)} delay={160} />
                <ConfettiPiece angle={180} distance={60} size={6} color={withAlpha(C.gold, 0.6)} delay={70} />
                <ConfettiPiece angle={210} distance={44} size={4} color={withAlpha(C.accent, 0.4)} delay={110} />
                <ConfettiPiece angle={240} distance={54} size={7} color={withAlpha(C.bronze, 0.55)} delay={150} />
                <ConfettiPiece angle={270} distance={50} size={5} color={withAlpha(C.gold, 0.5)} delay={90} />
                <ConfettiPiece angle={300} distance={58} size={6} color={withAlpha(C.accent, 0.5)} delay={130} />
                <ConfettiPiece angle={330} distance={42} size={4} color={withAlpha(C.bronze, 0.45)} delay={170} />

                <Reanimated.View entering={BounceIn.delay(100).duration(700)} style={[styles.celebIconCircle, neu.well]}>
                  <Feather name="award" size={30} color={C.accent} />
                </Reanimated.View>
              </View>

              {/* Title */}
              <Reanimated.Text entering={FadeInDown.delay(300).duration(400).springify()} style={styles.celebTitle}>
                {'all '}
                <Text style={styles.celebTitleAccent}>done</Text>
              </Reanimated.Text>

              {/* Name pill */}
              <Reanimated.View entering={FadeInDown.delay(420).duration(350).springify()} style={styles.celebNamePill}>
                <Feather name="check" size={11} color={C.positive} />
                <Text style={styles.celebNameText}>{cName.toLowerCase()}</Text>
              </Reanimated.View>

              {/* Stats */}
              <Reanimated.View entering={FadeInDown.delay(540).duration(350).springify()} style={[styles.celebStatsRow, { alignSelf: 'stretch' }]}>
                <View style={[styles.celebStatPill, neu.raised]}>
                  <Text style={styles.celebStatValue}>{installments}</Text>
                  <Text style={styles.celebStatLabel}>payments</Text>
                </View>
                <View style={[styles.celebStatPill, neu.raised]}>
                  <Text style={styles.celebStatValue}>{currency} {totalPaid.toLocaleString()}</Text>
                  <Text style={styles.celebStatLabel}>total paid</Text>
                </View>
              </Reanimated.View>

              {/* Hint */}
              <Reanimated.View entering={FadeInDown.delay(660).duration(350)} style={[styles.celebHint, { alignSelf: 'stretch' }]}>
                <View style={styles.celebHintIcon}>
                  <Feather name="trending-up" size={12} color={C.accent} />
                </View>
                <Text style={styles.celebHintText}>
                  you now have {currency} {cAmt.toFixed(0)}/{celebrationSub.cycle} freed up — redirect it to savings or another commitment
                </Text>
              </Reanimated.View>

              {/* Buttons */}
              <Reanimated.View entering={FadeInDown.delay(780).duration(350)} style={{ alignSelf: 'stretch' }}>
                <NeuButton
                  icon="check"
                  label="nice"
                  onPress={() => { successNotification(); setCelebrationSub(null); }}
                />
                <Pressable
                  style={styles.celebArchiveLink}
                  onPress={() => handleArchive(celebId)}
                  hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                >
                  {({ pressed }) => (
                    <View style={[styles.celebArchiveLinkInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="archive" size={12} color={C.textMuted} />
                      <Text style={styles.celebArchiveLinkText}>archive this commitment</Text>
                    </View>
                  )}
                </Pressable>
              </Reanimated.View>
            </View>
          </Reanimated.View>
        </Pressable>
      </Modal>
    );
  };

  // ─── Delete confirm modal ─────────────────────────────
  const renderDeleteModal = () => {
    if (!deleteConfirmSub) return null;
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDeleteConfirmSub(null)}>
        <Pressable style={styles.overlayCenter} onPress={() => setDeleteConfirmSub(null)}>
          <View style={[styles.deleteCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
            {/* Icon */}
            <View style={[styles.delIconCircle, neu.raised, { backgroundColor: withAlpha(C.neutral, C === CALM_DARK ? 0.14 : 0.07) }]}>
              <Feather name="trash-2" size={18} color={C.neutral} />
            </View>

            <Text style={styles.delTitle}>
              {'remove '}
              <Text style={styles.delTitleAccent}>commitment</Text>
              {'?'}
            </Text>

            {/* Name badge */}
            <View style={styles.delNameBadge}>
              <Text style={styles.delNameText}>{deleteConfirmSub.name}</Text>
            </View>

            <Text style={styles.delMsg}>
              removes this commitment and its schedule. any payments you already recorded stay in your history and wallet balances are unchanged.
            </Text>

            {/* Keep — primary (accent), delete — secondary link */}
            {/* Stretch wrapper: deleteCard is alignItems:'center', so NeuButton's
                inner width:'100%' shrink-wraps without it (same as celeb modal). */}
            <View style={{ alignSelf: 'stretch' }}>
              <NeuButton
                icon="shield"
                label="keep it"
                onPress={() => setDeleteConfirmSub(null)}
              />
            </View>

            <Pressable
              style={styles.delConfirmRow}
              onPress={handleConfirmDelete}
              hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
            >
              {({ pressed }) => (
                <View style={[styles.delConfirmInner, pressed && { opacity: 0.55 }]}>
                  <Feather name="trash-2" size={12} color={C.textMuted} />
                  <Text style={styles.delConfirmText}>{t.subscriptions.deleteAction}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    );
  };

  // ─── Detail modal ───────────────────────────────────
  const renderDetailModal = () => {
    if (!detailSub) return null;
    const sub = subscriptions.find(s => s.id === detailSub.id) || detailSub;
    const accentColor = avatarColorForName(sub.name);
    const cleared = isClearedThisCycle(sub);
    const { text: dueDateText, accent } = getDueDateInfo(sub.nextBillingDate);
    const dueColor = cleared ? C.positive : accent === 'overdue' ? C.overdue : accent === 'today' ? C.gold : C.textSecondary;
    const linkedWallet = wallets.find(w => w.id === sub.walletId);
    const isInstSub = sub.isInstallment && sub.totalInstallments;
    const completed = sub.completedInstallments || 0;
    const total = sub.totalInstallments || 1;
    const instDone = !!(isInstSub && completed >= total);
    const canPayInst = isInstSub && !instDone;
    const isArchived = !sub.isActive;
    const catObj = expenseCategories.find(c => c.id === sub.category);
    const allPayments = (sub.paymentHistory || []).slice().reverse();
    const activePayments = allPayments.filter(p => !p.undoneAt);
    const HISTORY_PREVIEW = 6;
    const history = showAllHistory ? activePayments : activePayments.slice(0, HISTORY_PREVIEW);

    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDetailSub(null)}>
        <Pressable style={styles.overlayCenter} onPress={() => setDetailSub(null)}>
          <View style={[styles.dtCard, SHADOWS.lg]} onStartShouldSetResponder={() => true}>
            {/* Close */}
            <TouchableOpacity
              onPress={() => setDetailSub(null)}
              style={[styles.dtClose, neu.raised]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="x" size={18} color={C.textMuted} />
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: SPACING.sm }}>
              {/* Hero */}
              <View style={styles.dtHero}>
                {instDone || isArchived ? (
                  <View style={[styles.dtAvatar, neu.raised, { backgroundColor: withAlpha(instDone ? C.positive : C.textMuted, 0.14) }]}>
                    <Feather name={instDone ? 'check-circle' : 'archive'} size={22} color={instDone ? C.positive : C.textMuted} />
                  </View>
                ) : sub.imageUri ? (
                  <Image source={{ uri: sub.imageUri }} style={styles.dtAvatarImage} />
                ) : sub.iconName ? (
                  <View style={[styles.dtAvatar, neu.raised, { backgroundColor: withAlpha(C.accent, 0.10) }]}>
                    {renderIcon(sub.iconName, 24, C.accent)}
                  </View>
                ) : (
                  <View style={[styles.dtAvatar, neu.raised, { backgroundColor: cleared ? withAlpha(C.positive, 0.14) : withAlpha(accentColor, 0.14) }]}>
                    {cleared
                      ? <Feather name="check" size={22} color={C.positive} />
                      : <Text style={[styles.dtAvatarLetter, { color: accentColor }]}>{sub.name.charAt(0).toUpperCase()}</Text>
                    }
                  </View>
                )}
                <Text style={styles.dtName}>{sub.name}</Text>
                {catObj && (
                  <View style={styles.dtCatBadge}>
                    <Text style={styles.dtCatText}>{catObj.name.toLowerCase()}</Text>
                  </View>
                )}
              </View>

              {/* Amount */}
              <View style={[styles.dtAmountSection, neu.raisedSoft, { backgroundColor: isDark ? withAlpha(C.accent, 0.07) : withAlpha(C.accent, 0.04) }]}>
                <Text style={styles.dtAmount}>
                  <Text style={styles.dtAmountCurrency}>{currency} </Text>
                  {sub.amount.toFixed(2)}
                </Text>
                <Text style={styles.dtCycle}>{getCycleLabel(sub.billingCycle)}</Text>
              </View>

              {/* Status bar */}
              {isInstSub && (
                <View style={styles.dtProgressWrap}>
                  <View style={styles.dtProgressBar}>
                    <View style={[styles.dtProgressFill, instDone && { backgroundColor: C.positive }, { width: `${Math.min((completed / total) * 100, 100)}%` }]} />
                  </View>
                  <Text style={styles.dtProgressLabel}>{completed}/{total} payments{instDone ? ' · complete' : ''}</Text>
                </View>
              )}

              {/* Info rows */}
              <View style={[styles.dtInfoSection, neu.raisedSoft]}>
                <View style={styles.dtInfoRow}>
                  <View style={styles.dtInfoLeft}>
                    <View style={[styles.dtInfoIcon, neu.raised]}>
                      <Feather name="calendar" size={12} color={C.accent} />
                    </View>
                    <Text style={styles.dtInfoLabel}>{cleared ? 'paid' : 'next due'}</Text>
                  </View>
                  <Text style={[styles.dtInfoValue, { color: dueColor }]} numberOfLines={1}>
                    {cleared && sub.lastPaidAt ? format(new Date(sub.lastPaidAt), 'MMM d, yyyy').toLowerCase() : dueDateText}
                  </Text>
                </View>

                {linkedWallet && (
                  <View style={styles.dtInfoRow}>
                    <View style={styles.dtInfoLeft}>
                      <View style={[styles.dtInfoIcon, neu.raised]}>
                        <WalletLogo wallet={linkedWallet} size={18} />
                      </View>
                      <Text style={styles.dtInfoLabel}>wallet</Text>
                    </View>
                    <Text style={styles.dtInfoValue} numberOfLines={1}>{linkedWallet.name}</Text>
                  </View>
                )}

                <View style={styles.dtInfoRow}>
                  <View style={styles.dtInfoLeft}>
                    <View style={[styles.dtInfoIcon, neu.raised]}>
                      <Feather name="bell" size={12} color={C.accent} />
                    </View>
                    <Text style={styles.dtInfoLabel}>reminder</Text>
                  </View>
                  <Text style={styles.dtInfoValue}>{sub.reminderDays} days before</Text>
                </View>

                <View style={[styles.dtInfoRow, { borderBottomWidth: 0 }]}>
                  <View style={styles.dtInfoLeft}>
                    <View style={[styles.dtInfoIcon, neu.raised]}>
                      <Feather name="play" size={12} color={C.accent} />
                    </View>
                    <Text style={styles.dtInfoLabel}>started</Text>
                  </View>
                  <Text style={styles.dtInfoValue}>{format(new Date(sub.startDate), 'MMM d, yyyy').toLowerCase()}</Text>
                </View>
              </View>

              {sub.sharedSubId && (() => {
                const linkedShared = useDebtStore.getState().sharedSubscriptions.find(s => s.id === sub.sharedSubId);
                if (!linkedShared) return null;
                const memberCount = linkedShared.members.filter(m => m.isActive).length;
                return (
                  <View style={[neu.raisedSoft, {
                    backgroundColor: withAlpha(C.accent, isDark ? 0.06 : 0.04),
                    borderRadius: RADIUS.lg,
                    padding: SPACING.md,
                    marginBottom: SPACING.md,
                    flexDirection: 'row',
                    gap: SPACING.sm,
                    alignItems: 'flex-start',
                  }]}>
                    <View style={[neu.raised, {
                      width: 28, height: 28, borderRadius: 8,
                      backgroundColor: withAlpha(C.accent, 0.10),
                      alignItems: 'center', justifyContent: 'center', marginTop: 1,
                    }]}>
                      <Feather name="users" size={13} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: TYPOGRAPHY.size.sm,
                        fontWeight: TYPOGRAPHY.weight.semibold,
                        color: C.accent,
                        letterSpacing: -0.1,
                        marginBottom: 3,
                      }}>shared subscription</Text>
                      <Text style={{
                        fontSize: TYPOGRAPHY.size.xs,
                        color: C.textMuted,
                        lineHeight: 16,
                      }}>
                        your share of {linkedShared.name}
                      </Text>
                      <Text style={{
                        fontSize: TYPOGRAPHY.size.xs,
                        color: C.textMuted,
                        lineHeight: 16,
                      }}>
                        {currency} {linkedShared.totalAmount.toFixed(2)} total · {memberCount} members
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {sub.note ? (
                <View style={[styles.dtNoteWrap, neu.raisedSoft]}>
                  <Text style={styles.dtNoteLabel}>note</Text>
                  <Text style={styles.dtNoteText} numberOfLines={3}>{sub.note}</Text>
                </View>
              ) : null}

              {sub.isPaused && !instDone && !isArchived && (
                <View style={[styles.dtStatusCard, neu.raisedSoft]}>
                  <View style={[styles.dtStatusIconCircle, neu.raised, { backgroundColor: withAlpha(C.bronze, 0.10) }]}>
                    <Feather name="pause-circle" size={16} color={C.bronze} />
                  </View>
                  <View style={styles.dtStatusContent}>
                    <Text style={[styles.dtStatusTitle, { color: C.bronze }]}>paused</Text>
                    <Text style={styles.dtStatusSub}>due dates are skipped until resumed</Text>
                  </View>
                </View>
              )}

              {/* Completed / archived status card — single unified element */}
              {(instDone || isArchived) && (
                <View style={[
                  styles.dtStatusCard,
                  neu.raisedSoft,
                ]}>
                  <View style={[
                    styles.dtStatusIconCircle,
                    neu.raised,
                    { backgroundColor: withAlpha(instDone ? C.positive : C.textMuted, 0.10) },
                  ]}>
                    <Feather
                      name={instDone ? 'award' : 'archive'}
                      size={16}
                      color={instDone ? C.positive : C.textMuted}
                    />
                  </View>
                  <View style={styles.dtStatusContent}>
                    <Text style={[styles.dtStatusTitle, { color: instDone ? C.positive : C.textSecondary }]}>
                      {instDone ? 'completed' : 'archived'}
                    </Text>
                    <Text style={styles.dtStatusSub}>
                      {instDone && isArchived
                        ? `${total} payments · ${currency} ${(sub.amount * total).toLocaleString()} total · archived`
                        : instDone
                          ? `${total} payments · ${currency} ${(sub.amount * total).toLocaleString()} total`
                          : 'this commitment is no longer active'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Payment history */}
              {history.length > 0 && (
                <View style={styles.dtHistorySection}>
                  <View style={styles.dtHistoryHeader}>
                    <Text style={styles.dtHistoryLabel}>payment history</Text>
                    {activePayments.length > HISTORY_PREVIEW && (
                      <Text style={styles.dtHistoryCount}>{activePayments.length} total</Text>
                    )}
                  </View>
                  {history.map(p => {
                    // Show the cycle this payment settled (its period), not the day it was
                    // paid — so a late payment files under the right month, with a note.
                    const periodD = new Date(p.periodDate ?? p.paidAt);
                    const paidD = new Date(p.paidAt);
                    const paidLate = startOfDay(paidD) > startOfDay(periodD);
                    return (
                      <View key={p.id} style={styles.dtHistoryRow}>
                        <Feather name="check-circle" size={12} color={C.positive} />
                        <View style={styles.dtHistoryDateCol}>
                          <Text style={styles.dtHistoryDate}>{format(periodD, 'd MMM yyyy')}</Text>
                          {paidLate && (
                            <Text style={styles.dtHistoryLate}>paid {format(paidD, 'd MMM')}</Text>
                          )}
                        </View>
                        <Text style={styles.dtHistoryAmt}>{currency} {p.amount.toFixed(2)}</Text>
                        {!isArchived && (
                          <Pressable
                            onPress={() => {
                              lightTap();
                              Alert.alert(
                                t.subscriptions.undoPayment,
                                t.subscriptions.undoPaymentConfirm,
                                [
                                  { text: t.subscriptions.cancelAction, style: 'cancel' },
                                  {
                                    text: t.subscriptions.undoAction,
                                    style: 'destructive',
                                    onPress: () => {
                                      undoSubscriptionPayment(sub.id, p.id);
                                      if (sub.sharedSubId) {
                                        const month = format(new Date(p.periodDate ?? p.paidAt), 'yyyy-MM');
                                        unmarkSharedSubPayment(sub.sharedSubId, month, '__self__');
                                      }
                                      showToast('payment undone', 'success');
                                    },
                                  },
                                ],
                              );
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.dtHistoryUndo}
                          >
                            <Feather name="rotate-ccw" size={11} color={C.textMuted} />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                  {activePayments.length > HISTORY_PREVIEW && (
                    <Pressable
                      onPress={() => { lightTap(); setShowAllHistory(v => !v); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.dtHistorySeeAll}
                    >
                      {({ pressed }) => (
                        <>
                          <Text style={[styles.dtHistorySeeAllText, pressed && { opacity: 0.55 }]}>
                            {showAllHistory ? 'show less' : `see all ${activePayments.length} payments`}
                          </Text>
                          <Feather
                            name={showAllHistory ? 'chevron-up' : 'chevron-down'}
                            size={13}
                            color={C.accent}
                          />
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Action zone — context-aware */}
            <View style={styles.dtActions}>
              {instDone || isArchived ? (
                <>
                  {/* Completed/archived: archive or restore as primary */}
                  <NeuButton
                    icon={isArchived ? 'rotate-ccw' : 'archive'}
                    label={isArchived ? 'restore' : 'archive'}
                    color={isArchived ? C.textSecondary : undefined}
                    onPress={() => {
                      setDetailSub(null);
                      if (isArchived) {
                        updateSubscription(sub.id, { isActive: true });
                        showToast('restored', 'success');
                      } else {
                        handleArchive(sub.id);
                      }
                    }}
                  />
                  <View style={styles.dtActionRow}>
                    <Pressable
                      style={styles.dtSecondaryLink}
                      onPress={() => { setDetailSub(null); setTimeout(() => handleEdit(sub.id), 50); }}
                      hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                    >
                      {({ pressed }) => (
                        <View style={[styles.dtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                          <Feather name="edit-2" size={13} color={C.textMuted} />
                          <Text style={styles.dtSecondaryLinkText}>edit</Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.dtSecondaryLink}
                      onPress={() => { setDetailSub(null); setTimeout(() => setDeleteConfirmSub(sub), 50); }}
                      hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                    >
                      {({ pressed }) => (
                        <View style={[styles.dtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                          <Feather name="trash-2" size={13} color={C.textMuted} />
                          <Text style={styles.dtSecondaryLinkText}>delete</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  {/* Active: mark paid + edit/pause. Gated to the current month like the
                      swipe action — a projected-month row is the live current-cycle record,
                      so paying it here would silently clear the CURRENT cycle. */}
                  {heroMonthOffset === 0 && (!cleared || canPayInst) && !sub.isPaused && (
                    <NeuButton
                      icon="check"
                      label={canPayInst ? `pay ${completed + 1}/${total}` : 'mark paid'}
                      onPress={() => { setDetailSub(null); setTimeout(() => smartMarkPaid(sub), 50); }}
                    />
                  )}
                  <View style={styles.dtActionRow}>
                    <Pressable
                      style={styles.dtSecondaryLink}
                      onPress={() => { setDetailSub(null); setTimeout(() => handleEdit(sub.id), 50); }}
                      hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                    >
                      {({ pressed }) => (
                        <View style={[styles.dtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                          <Feather name="edit-2" size={13} color={C.textMuted} />
                          <Text style={styles.dtSecondaryLinkText}>edit</Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.dtSecondaryLink}
                      onPress={() => {
                        lightTap();
                        updateSubscription(sub.id, { isPaused: !sub.isPaused });
                        showToast(sub.isPaused ? 'resumed' : 'paused', 'success');
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                    >
                      {({ pressed }) => (
                        <View style={[styles.dtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                          <Feather name={sub.isPaused ? 'play-circle' : 'pause-circle'} size={13} color={C.textMuted} />
                          <Text style={styles.dtSecondaryLinkText}>{sub.isPaused ? 'resume' : 'pause'}</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </Pressable>
        <ModalToastHost />
      </Modal>
    );
  };

  // ─── Filter modal (paid / paused) ──────────────────────
  const renderFilterModal = () => {
    const filterOptions: { key: StatusFilter; label: string; icon: string; count: number }[] = [
      { key: 'cleared', label: 'paid this cycle', icon: 'check-circle', count: statusCounts.cleared },
      { key: 'paused', label: 'paused', icon: 'pause-circle', count: statusCounts.paused },
      { key: 'archived', label: 'archived', icon: 'archive', count: statusCounts.archived },
    ];

    return (
      <Modal visible={filterModalVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setFilterModalVisible(false)}>
        <Pressable style={styles.overlayCenter} onPress={() => setFilterModalVisible(false)}>
          <View style={styles.filterModalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.filterModalTitle}>filter by status</Text>
            {filterOptions.map(opt => {
              const active = statusFilter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterModalRow, active && styles.filterModalRowActive]}
                  onPress={() => {
                    lightTap();
                    setStatusFilter(active ? 'all' : opt.key);
                    setFilterModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name={opt.icon as any} size={18} color={active ? C.accent : C.textMuted} />
                  <Text style={[styles.filterModalRowText, active && styles.filterModalRowTextActive]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.filterModalRowCount, active && styles.filterModalRowCountActive]}>
                    {opt.count}
                  </Text>
                  {active && <Feather name="check" size={16} color={C.accent} />}
                </TouchableOpacity>
              );
            })}
            {(statusFilter === 'cleared' || statusFilter === 'paused' || statusFilter === 'archived') && (
              <TouchableOpacity
                style={styles.filterModalClear}
                onPress={() => { lightTap(); setStatusFilter('all'); setFilterModalVisible(false); }}
                activeOpacity={0.7}
              >
                <Text style={styles.filterModalClearText}>clear filter</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    );
  };

  // ─── How it works modal ──────────────────────────────
  const HOW_ITEMS: { group: string; items: { icon: string; bold: string; rest: string }[] }[] = [
    {
      group: 'basics',
      items: [
        { icon: 'layers', bold: 'three types', rest: '— bills (utilities, rent), payments (loans, BNPL), and subscriptions (streaming, apps). each gets its own tab.' },
        { icon: 'repeat', bold: 'billing cycle', rest: '— set weekly, monthly, quarterly, or yearly. due dates and yearly projections are auto-calculated.' },
        { icon: 'credit-card', bold: 'link a wallet', rest: '— when you mark paid, the amount is auto-deducted from the linked wallet.' },
      ],
    },
    {
      group: 'paying',
      items: [
        { icon: 'check-circle', bold: 'swipe right to pay', rest: '— or tap the card to open detail, then choose mark as paid or pay from wallet.' },
        { icon: 'rotate-ccw', bold: 'undo payment', rest: '— tap the undo icon on the most recent payment in the detail view. asks for confirmation first.' },
        { icon: 'pause-circle', bold: 'pause & resume', rest: '— paused commitments skip due date tracking. resume anytime from the detail view.' },
      ],
    },
    {
      group: 'installments',
      items: [
        { icon: 'hash', bold: 'installment mode', rest: '— track progress like 4/12 payments for car loans or BNPL. completed installments show a green checkmark.' },
        { icon: 'lock', bold: 'locked when complete', rest: '— once all payments are done, amount and installment fields are locked. you can still edit name and category.' },
        { icon: 'clock', bold: 'payment history', rest: '— every paid cycle is logged with date and amount inside the detail view.' },
      ],
    },
    {
      group: 'planning',
      items: [
        { icon: 'calendar', bold: 'swipe to see months', rest: '— swipe the screen left or right to view last month, this month, or next month commitments.' },
        { icon: 'archive', bold: 'archive', rest: '— completed or old commitments can be archived. find them via the filter icon.' },
        { icon: 'bar-chart-2', bold: 'hero breakdown', rest: '— the card at top shows paid vs remaining, progress bar, next due date, and overdue count.' },
      ],
    },
  ];

  const renderHowItWorksModal = () => (
    <Modal visible={howItWorksVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHowItWorksVisible(false)}>
      <Pressable style={styles.hiwOverlay} onPress={() => setHowItWorksVisible(false)}>
        <View style={[styles.hiwCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
          {/* Neu seam rule (docs/neu-vertical-error.md): bleed the clip edge
              out, pad content back in — rows keep their layout, shadows gain
              slack. */}
          <ScrollView
            style={styles.hiwScrollBleed}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}
          >
            <View style={styles.hiwCardHeader}>
              <Text style={styles.hiwTitle}>how it works</Text>
              <Text style={styles.hiwSubtitle}>everything about bills & commitments</Text>
            </View>

            {HOW_ITEMS.map((section) => (
              <View key={section.group}>
                <Text style={styles.hiwGroupLabel}>{section.group}</Text>
                {section.items.map((item, ii) => (
                  <View key={ii} style={[styles.hiwItem, neu.raised]}>
                    <View style={[styles.hiwIconCircle, neu.well]}>
                      <Feather name={item.icon as any} size={14} color={C.textSecondary} />
                    </View>
                    <Text style={styles.hiwText}>
                      <Text style={styles.hiwBold}>{item.bold}</Text>
                      {' '}{item.rest}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={styles.hiwDismiss}>
            <NeuButton label="got it" onPress={() => setHowItWorksVisible(false)} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  // ─── Empty state ─────────────────────────────────────
  const renderEmptyState = () => (
    <EmptyState
      icon="i/calendar-outline"
      title={t.subscriptions.noBills}
      message={t.subscriptions.trackRecurring}
      actionLabel={t.subscriptions.addBill}
      onAction={() => { lightTap(); setModalVisible(true); }}
    />
  );

  // ─── Main Render ──────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {subscriptions.length > 0 ? (
          <>
            {renderMonthHeader()}
            {heroMonthOffset === 0 && renderContextChips()}

            {/* Search */}
            {heroMonthOffset === 0 && (
              <View style={[styles.searchContainer, neu.insetSoft]}>
                <Feather name="search" size={16} color={C.textMuted} style={{ marginRight: SPACING.sm }} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="search commitments…"
                  placeholderTextColor={C.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x" size={16} color={C.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Search results */}
            {searchResults !== null ? (
              searchResults.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</Text>
                  </View>
                    {searchResults.map((sub, idx) => (
                    <React.Fragment key={sub.id}>
                      {renderRow(sub, isClearedThisCycle(sub))}
                      {idx < searchResults.length - 1 && <View style={styles.rowDivider} />}
                    </React.Fragment>
                  ))}
                </View>
              ) : (
                <View style={styles.noResults}>
                  <Feather name="search" size={36} color={C.textMuted} />
                  <Text style={styles.noResultsTitle}>{t.subscriptions.noResults}</Text>
                  <Text style={styles.noResultsText}>{t.subscriptions.noResultsHint}</Text>
                </View>
              )
            ) : (
              <>
                {renderSuggestions()}
                {displayData.length === 0 ? (
                  <View style={styles.tabEmpty}>
                    <Text style={styles.tabEmptyTitle}>
                      {statusFilter === 'all' ? `no ${activeTab} yet` : `nothing ${statusFilter}`}
                    </Text>
                    <Text style={styles.tabEmptyHint}>
                      {statusFilter === 'all' ? 'add one with the + button below' : 'try a different filter'}
                    </Text>
                  </View>
                ) : (
                  <>
                    {displayData.map(group => (
                      <React.Fragment key={group.label}>
                        {renderSection(group.label, group.subs, group.isCleared)}
                      </React.Fragment>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          renderEmptyState()
        )}
      </ScrollView>

      {/* FAB — shared neu FAB (neu face + accent glyph) */}
      {subscriptions.length > 0 && (
        <FAB
          icon="plus"
          onPress={() => { mediumTap(); setEditingId(null); setSuggestionDraft(undefined); setModalVisible(true); }}
          style={{ bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md), right: SPACING.xl }}
        />
      )}

      {/* ── Echo FAB + greeting bubble (standardized, draggable) ── */}
      {subscriptions.length > 0 && !echoHidden && !modalVisible && !echoSheetVisible && !markPaidSub && !deleteConfirmSub && !payWarning && !celebrationSub ? (
        <>
        <Animated.View
          style={[
            styles.commitmentEchoFabContainer,
            fabSide === 'right'
              ? { right: SPACING.xl, flexDirection: 'row-reverse' }
              : { left: SPACING.xl, flexDirection: 'row' },
            { top: Math.max(insets.top, 20) + 80 },
            { transform: [...echoFabPan.getTranslateTransform(), { scale: fabScale }] },
          ]}
          {...echoFabPanResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.commitmentEchoFab}
            onPress={() => {
              lightTap();
              if (!TIER_LIMITS[tier].askEchoPerScreen) { setPaywallVisible(true); return; }
              setEchoAutoPrompt(undefined);
              setEchoSheetVisible(true);
              setGreetingDismissed(true);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open Echo assistant"
          >
            <Feather name="zap" size={22} color={C.onAccent} />
            {!TIER_LIMITS[tier].askEchoPerScreen && (
              <View style={styles.commitmentEchoFabLock}>
                <Feather name="lock" size={9} color={C.onAccent} />
              </View>
            )}
            <View style={styles.commitmentEchoFabPulse} />
          </TouchableOpacity>
          {greetingText && !greetingDismissed && !greetingHiddenDuringDrag && (
            <TouchableOpacity
              style={styles.commitmentEchoGreetingBubble}
              onPress={() => {
                lightTap();
                if (!TIER_LIMITS[tier].askEchoPerScreen) { setPaywallVisible(true); return; }
                setEchoAutoPrompt(greetingChips[0]?.question || greetingText);
                setEchoSheetVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Echo: ${greetingText}`}
            >
              <View style={styles.commitmentEchoGreetingDot} />
              <TypewriterText
                text={greetingText}
                style={styles.commitmentEchoGreetingText}
                speed={28}
                startDelay={140}
              />
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setGreetingDismissed(true); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.commitmentEchoGreetingDismiss}
                accessibilityRole="button"
                accessibilityLabel="Dismiss greeting"
              >
                <Feather name="x" size={12} color={C.textMuted} />
              </TouchableOpacity>
              <View style={[
                styles.commitmentEchoGreetingTail,
                fabSide === 'left'
                  ? { left: -6, borderBottomWidth: 1, borderLeftWidth: 1 }
                  : { right: -6, borderTopWidth: 1, borderRightWidth: 1 },
              ]} />
            </TouchableOpacity>
          )}
        </Animated.View>
        <EchoDragHideZone hideZoneAnim={hideZoneAnim} hideZoneHoverAnim={hideZoneHoverAnim} measureRef={hideZoneRef} />
        </>
      ) : null}

      <CommitmentForm
        visible={modalVisible}
        subscription={editingId ? subscriptions.find(s => s.id === editingId) || null : null}
        initialValues={suggestionDraft}
        onClose={handleFormClose}
        onSave={handleFormSave}
        onDelete={handleFormDelete}
        onUnlinkShared={(sub) => {
          const linkedShared = useDebtStore.getState().sharedSubscriptions.find(s => s.id === sub.sharedSubId);
          updateSubscription(sub.id, { sharedSubId: undefined });
          if (linkedShared) {
            useDebtStore.getState().updateSharedSubscription(linkedShared.id, { subscriptionId: undefined });
          }
          setModalVisible(false);
          setEditingId(null);
          showToast('unlinked from shared subscription', 'info');
        }}
        onError={handleFormError}
      />
      {renderDetailModal()}
      {renderMarkPaidModal()}
      {renderPayWarningModal()}
      {renderCelebrationModal()}
      {renderDeleteModal()}
      {renderHowItWorksModal()}
      {renderFilterModal()}

      {/* ── Echo inline chat sheet ── */}
      <EchoInlineChat
        visible={echoSheetVisible}
        onClose={() => setEchoSheetVisible(false)}
        threadKey="subscriptions"
        insightTitle={smartCommitmentInsight.title}
        insightSubtitle={smartCommitmentInsight.subtitle}
        chips={greetingChips}
        contextSnapshot={buildCommitmentSnapshot()}
        topInset={insets.top}
        bottomInset={insets.bottom}
        autoPrompt={echoAutoPrompt}
      />

      {/* ── Paywall ── */}
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="ai"
      />

      <ScreenGuide
        id="guide_subscriptions"
        steps={[
          {
            kind: 'intro',
            icon: 'refresh-cw',
            title: t.guide.yourSubscriptions,
            body: t.guide.descSubscriptions,
            points: [
              { icon: 'plus', text: t.guide.subscriptionPoint1 },
              { icon: 'bell', text: t.guide.subscriptionPoint2 },
            ],
          },
          { kind: 'payoff', icon: 'check-circle', title: t.guide.subsPayoffTitle, body: t.guide.subsPayoffBody },
        ]}
      />
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl, maxWidth: 680, width: '100%', alignSelf: 'center' as const },

  // ── Tab chips ─────────────────────────────────────────
  chipSection: {
    marginBottom: SPACING.md,
  },
  ctxOverdueDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.overdue,
  },
  // ── Type tabs (underline) ───────────────────────────────
  typeTabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.08),
    marginBottom: SPACING.sm + 4,
  },
  typeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: SPACING.sm + 3,
    paddingHorizontal: SPACING.sm + 2,
    marginRight: SPACING.sm + 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },
  typeTabActive: {
    borderBottomColor: C.accent,
  },
  typeTabText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    letterSpacing: 0.1,
  },
  typeTabTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  typeTabBadge: {
    backgroundColor: withAlpha(C.textPrimary, 0.07),
    borderRadius: RADIUS.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  typeTabBadgeActive: {
    backgroundColor: withAlpha(C.accent, 0.12),
  },
  typeTabBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  typeTabBadgeTextActive: {
    color: C.accent,
  },
  // ── Status pills + filter button ───────────────────────
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.xs,
  },
  statusPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  statusPillActive: {
    backgroundColor: C.accent,
  },
  statusPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  statusPillTextActive: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  filterBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto' as any,
  },
  filterBtnActive: {
    backgroundColor: withAlpha(C.accent, 0.08),
    borderColor: withAlpha(C.accent, 0.3),
  },
  filterBtnDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  // ── Filter modal ──────────────────────────────────────
  filterModalCard: {
    // no neu, no outline — plain card with a regular drop shadow for elevation
    width: '80%',
    maxWidth: 320,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  filterModalTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm + 2,
  },
  filterModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: 2,
  },
  filterModalRowActive: {
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  filterModalRowText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  filterModalRowTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  filterModalRowCount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  filterModalRowCountActive: {
    color: C.accent,
  },
  filterModalClear: {
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.08),
  },
  filterModalClearText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  tabEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'] + SPACING.md,
    gap: SPACING.xs + 2,
  },
  tabEmptyTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    letterSpacing: -0.2,
  },
  tabEmptyHint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    letterSpacing: 0.1,
  },

  // ── Hero (left-aligned, no card) ────────────────────────
  monthHeader: {
    backgroundColor: C === CALM_DARK ? withAlpha(C.accent, 0.06) : withAlpha(C.accent, 0.03),
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md + 2,
    paddingBottom: SPACING.md + 2,
    marginBottom: SPACING.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  heroMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroBackBtn: {
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.12),
  },
  heroBackBtnText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroPageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm + 2,
  },
  heroPageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(C.textMuted, 0.18),
  },
  heroPageDotActive: {
    backgroundColor: withAlpha(C.accent, 0.7),
  },
  heroMonth: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroAmount: {
    fontSize: 44,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.2,
    marginBottom: 2,
  },
  heroAmountCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  heroBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  heroBreakdownText: {
    fontSize: 12,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  heroBreakdownBold: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  heroBreakdownDot: {
    fontSize: 12,
    color: withAlpha(C.textMuted, 0.4),
  },
  heroSegBar: {
    flexDirection: 'row',
    height: 6,
    gap: 2,
    marginBottom: SPACING.sm,
  },
  heroSegBarItem: {
    height: '100%',
  },
  heroStripDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.accent, 0.12),
    marginBottom: SPACING.sm,
  },
  heroStatsRow: {
    flexDirection: 'row',
  },
  heroStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatColBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: withAlpha(C.accent, 0.12),
  },
  heroStatValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: withAlpha(C.textMuted, 0.7),
    letterSpacing: 0.4,
  },

  // ── Day strip ─────────────────────────────────────────
  dayStripWrap: {
    marginBottom: SPACING.md,
  },
  dayCol: {
    width: 44,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: 4,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  dayColHasBill: {
    backgroundColor: C.background,
  },
  dayColToday: {
    backgroundColor: withAlpha(C.accent, 0.10),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(C.accent, 0.3),
  },
  dayColNum: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  dayColNumToday: {
    color: C.accent,
  },
  dayColDots: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
    minHeight: 6,
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dayColAmt: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },

  // ── Stats line ────────────────────────────────────────
  statsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  statsAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statsPeriod: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  statsDivider: {
    width: 1,
    height: 12,
    backgroundColor: withAlpha(C.textPrimary, 0.12),
  },
  statsCounts: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  statsBar: {
    flex: 1,
    flexDirection: 'row',
    height: 4,
    minWidth: 80,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginLeft: SPACING.sm,
  },
  // ── Search ────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm + 3,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    letterSpacing: -0.1,
  },

  // ── Section (borderless) ────────────────────────────────
  section: { marginBottom: SPACING.md + 4 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: withAlpha(C.textMuted, 0.7),
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs + 2,
    paddingHorizontal: SPACING.xs + 2,
  },
  sectionTotal: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },

  // ── Row (neu card) ───────────────────────────────
  // Unclipped shadow wrapper — the swipeable inside is overflow:hidden and would
  // otherwise clip the neu shadow into a hard seam.
  rowShadow: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm + 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
  },
  rowDimmed: { opacity: 0.55 },

  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm + 2,
    flexShrink: 0,
  },
  rowIconImage: {
    width: 40,
    height: 40,
    borderRadius: 11,
    marginRight: SPACING.sm + 2,
  },
  rowIconLetter: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: -0.3,
  },
  rowInfo: { flex: 1, marginRight: SPACING.md },
  rowName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  rowCycleText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  rowStatusPill: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
  },
  rowStatusText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.2,
  },
  rowDueText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },

  progressBarContainer: {
    height: 3,
    backgroundColor: withAlpha(C.textMuted, 0.10),
    borderRadius: RADIUS.full,
    marginTop: SPACING.xs + 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
  },

  rowRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  rowAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  rowAmountCleared: { color: C.textMuted },
  rowInstFraction: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    marginLeft: SPACING.md + 40 + SPACING.sm + 2,
  },

  // ── Wallet chip ───────────────────────────────────────
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    marginTop: 3,
  },
  walletChipDot: { width: 5, height: 5, borderRadius: 3 },
  walletChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Swipe actions (1:1 with Wallet) ────────────────────
  swipeFill: {
    width: 72,
    alignSelf: 'stretch' as const,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    overflow: 'hidden' as const,
    backgroundColor: 'transparent',
  },
  swipeFillAlignRight: {},
  swipeFillAlignLeft: {},
  swipeInner: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  __paidColor: {
    backgroundColor: C.accent,
  },
  __editColor: {
    backgroundColor: C.neutral,
  },

  // ── No results ────────────────────────────────────────
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['5xl'],
    gap: SPACING.sm,
  },
  noResultsTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginTop: SPACING.sm,
  },
  noResultsText: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted },

  // ── Echo FAB (matches Wallet/Budget standardized pattern) ─
  commitmentEchoFabContainer: {
    position: 'absolute',
    alignItems: 'center',
    gap: SPACING.sm,
    zIndex: 999,
  },
  commitmentEchoFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  commitmentEchoFabPulse: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.gold,
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  commitmentEchoFabLock: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.surface,
  },
  commitmentEchoGreetingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    maxWidth: 260,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C === CALM_DARK ? withAlpha(C.accent, 0.3) : withAlpha(C.accent, 0.2),
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  commitmentEchoGreetingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.accent,
  },
  commitmentEchoGreetingText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    lineHeight: 18,
  },
  commitmentEchoGreetingDismiss: {
    padding: 2,
    marginLeft: SPACING.xs,
  },
  commitmentEchoGreetingTail: {
    position: 'absolute',
    top: 13,
    width: 12,
    height: 12,
    backgroundColor: C.surface,
    borderColor: withAlpha(C.accent, 0.2),
    transform: [{ rotate: '45deg' }],
  },

  // ── Modal overlay ─────────────────────────────────────
  overlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },

  // ── Picker ────────────────────────────────────────────
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Mark as Paid modal (renovated) ─────────────────────
  markPaidCard: {
    width: '88%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.xl + 4,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  mpCloseBtn: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  mpHeroAmount: {
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? -1.0 : -1.2,
    marginBottom: 4,
  },
  mpHeroCurrency: {
    fontSize: 20,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  mpName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.md,
    letterSpacing: -0.2,
  },
  mpNextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.12 : 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 1,
    marginBottom: SPACING.xl,
  },
  mpNextText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.1,
  },
  mpDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.background,
    borderRadius: RADIUS.full,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.sm + 2,
    paddingVertical: 8,
    marginBottom: SPACING.sm,
  },
  mpDateLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  mpDateText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: -0.1,
  },
  mpActions: {
    width: '100%',
    gap: SPACING.sm,
  },
  markPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.positive,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md + 2,
    width: '100%',
  },
  markPaidBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.2,
  },
  mpWalletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: SPACING.md,
    width: '100%',
  },
  mpWalletBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: -0.1,
  },

  // ── Pay warning modal ──────────────────────────────────
  warnCard: {
    width: '84%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.xl + 4,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center' as const,
  },
  warnIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: withAlpha(C.gold, 0.12),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: SPACING.md,
  },
  warnTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    marginBottom: SPACING.sm,
  },
  warnTitleAccent: {
    fontStyle: 'italic' as const,
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.gold,
  },
  warnBody: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: SPACING.lg,
    letterSpacing: 0.1,
  },
  warnDismiss: {
    marginTop: SPACING.sm + 2,
    paddingVertical: SPACING.sm,
  },
  warnDismissText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // ── Celebration modal ─────────────────────────────────
  celebCard: {
    width: '84%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center' as const,
    overflow: 'visible' as const,
  },
  celebBurstWrap: {
    width: 120,
    height: 120,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: SPACING.sm,
  },
  celebIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: withAlpha(C.accent, 0.10),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  celebTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.3 : -0.5,
    marginBottom: SPACING.sm,
  },
  celebTitleAccent: {
    fontStyle: 'italic' as const,
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  celebNamePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: withAlpha(C.positive, 0.08),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    marginBottom: SPACING.md + 2,
  },
  celebNameText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.positive,
    letterSpacing: -0.1,
  },
  celebStatsRow: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    width: '100%',
  },
  celebStatPill: {
    flex: 1,
    alignItems: 'center' as const,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.035),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.sm,
  },
  celebStatValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: C === CALM_DARK ? -0.1 : -0.3,
  },
  celebStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 2,
  },
  celebHint: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: SPACING.sm,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.lg,
  },
  celebHintIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: withAlpha(C.accent, 0.10),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
    marginTop: 1,
  },
  celebHintText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: 18,
    flex: 1,
    letterSpacing: 0.1,
  },
  celebArchiveLink: {
    alignSelf: 'center' as const,
    marginTop: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
  },
  celebArchiveLinkInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  celebArchiveLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    letterSpacing: 0.1,
  },

  // ── Delete confirm modal (renovated) ───────────────────
  deleteCard: {
    width: '84%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.xl + 4,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  delIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  delTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
    letterSpacing: -0.4,
  },
  delTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  delNameBadge: {
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.xs + 2,
    marginBottom: SPACING.md,
  },
  delNameText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    letterSpacing: -0.1,
  },
  delMsg: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.size.sm * 1.6,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.sm,
  },
  delConfirmRow: {
    alignSelf: 'center',
    marginTop: SPACING.sm,
  },
  delConfirmInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  delConfirmText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // ── How it works modal ─────────────────────────────────
  hiwOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  hiwCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '75%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  // Counterpart to the contentContainer padding: pulls the ScrollView's clip
  // edge OUT by the same amount (neu seam rule — docs/neu-vertical-error.md).
  hiwScrollBleed: { marginHorizontal: -SPACING.md, marginVertical: -SPACING.sm },
  hiwCardHeader: {
    marginBottom: SPACING.md,
  },
  hiwTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.1 : -0.3,
  },
  hiwSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 4,
    lineHeight: 16,
  },
  hiwGroupLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  hiwItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm + 2,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.07 : 0.025),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
    marginBottom: 6,
  },
  hiwIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  hiwText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: 18,
  },
  hiwBold: {
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  hiwDismiss: {
    marginTop: SPACING.md,
  },

  // ── Detail modal ──────────────────────────────────────
  dtCard: {
    width: '90%',
    maxHeight: '82%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  dtClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  dtHero: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  dtAvatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm + 2,
  },
  dtAvatarImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
    marginBottom: SPACING.sm + 2,
  },
  dtAvatarLetter: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: -0.5,
  },
  dtName: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  dtCatBadge: {
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
  },
  dtCatText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    letterSpacing: 0.2,
  },
  dtAmountSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.xs,
    backgroundColor: C === CALM_DARK ? withAlpha(C.accent, 0.04) : withAlpha(C.accent, 0.03),
    borderRadius: RADIUS.xl,
  },
  dtAmount: {
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? -1.0 : -1.2,
  },
  dtAmountCurrency: {
    fontSize: 18,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: withAlpha(C.textMuted, 0.6),
  },
  dtCycle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
    marginTop: SPACING.xs,
    letterSpacing: 0.3,
  },
  dtProgressWrap: {
    marginBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  dtProgressBar: {
    height: 4,
    backgroundColor: withAlpha(C.textMuted, 0.10),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  dtProgressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
  },
  dtProgressLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  dtInfoSection: {
    backgroundColor: C === CALM_DARK ? withAlpha(C.textPrimary, 0.03) : C.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
  },
  dtInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.06),
  },
  dtInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  dtInfoIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  dtInfoLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  dtInfoValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
    marginLeft: SPACING.md,
    letterSpacing: -0.1,
  },
  dtNoteWrap: {
    backgroundColor: C === CALM_DARK ? withAlpha(C.textPrimary, 0.04) : withAlpha(C.textPrimary, 0.025),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  dtNoteLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dtNoteText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.sm * 1.5,
  },
  dtStatusCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md - 2,
    backgroundColor: C === CALM_DARK ? withAlpha(C.textPrimary, 0.04) : C.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  dtStatusIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dtStatusContent: {
    flex: 1,
  },
  dtStatusTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  dtStatusSub: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
    letterSpacing: 0.05,
    lineHeight: TYPOGRAPHY.size.xs * 1.45,
  },
  dtHistorySection: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dtHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  dtHistoryLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dtHistoryCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.2,
  },
  dtHistorySeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  dtHistorySeeAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  dtHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
  },
  dtHistoryDateCol: {
    flex: 1,
    gap: 1,
  },
  dtHistoryDate: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  dtHistoryLate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
  },
  dtHistoryAmt: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  dtHistoryUndo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginLeft: 2,
  },
  dtActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    paddingTop: SPACING.md,
    marginTop: SPACING.xs,
  },
  dtSecondaryLink: {
    alignSelf: 'center',
    marginTop: SPACING.sm,
  },
  dtSecondaryLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  dtSecondaryLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  dtActionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
  },

  // ── Suggestions ────────────────────────────────────────────
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm + 6,
  },
  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
  },
  suggestionBadge: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  suggestionMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },
  suggestionAction: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.sm,
  },
  suggestionActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
});

export default SubscriptionList;
