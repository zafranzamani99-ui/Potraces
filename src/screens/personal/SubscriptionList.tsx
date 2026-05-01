import React, {
  useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect,
} from 'react';
import {
  View, Text, StyleSheet, TextInput, Modal, TouchableOpacity,
  Pressable, Switch, Keyboard, KeyboardAvoidingView, Platform,
  Animated, Dimensions, PanResponder, useWindowDimensions, Alert,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  format, differenceInDays, isSameDay,
  addWeeks, addMonths, addQuarters, addYears,
  subWeeks, subMonths, subQuarters, subYears,
  endOfMonth, startOfDay,
  isValid,
} from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, BILLING_CYCLES, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useCategories } from '../../hooks/useCategories';
import CategoryPicker from '../../components/common/CategoryPicker';
import CalendarPicker from '../../components/common/CalendarPicker';
import WalletLogo from '../../components/common/WalletLogo';
import CommitmentForm from '../../components/commitments/CommitmentForm';
import { useToast } from '../../context/ToastContext';
import { useRoute, RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { usePremiumStore } from '../../store/premiumStore';
import EchoInlineChat from '../../components/common/EchoInlineChat';
import TypewriterText from '../../components/common/TypewriterText';
import PaywallModal from '../../components/common/PaywallModal';
import { lightTap, mediumTap } from '../../services/haptics';
import { useLearningStore } from '../../store/learningStore';
import { useT } from '../../i18n';
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

type ModalView = 'form' | 'cyclePicker' | 'calendar' | 'walletPicker';

type SubscriptionListParams = {
  SubscriptionList: { highlightId?: string } | undefined;
};

// ─── Brand Color Helpers ──────────────────────────────────
// Curated on-palette colors so each name gets a stable, distinct circle
const AVATAR_PALETTE = [
  '#4F5104',  // olive
  '#8B7355',  // bronze
  '#B2780A',  // gold
  '#A688B8',  // mauve
  '#6BA3BE',  // sky blue
  '#7A9B6A',  // sage
  '#B8907D',  // dusty rose-brown
  '#5C7A8C',  // slate blue
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
  const prevBilling = getPrevBillingDate(sub.nextBillingDate, sub.billingCycle);
  return sub.lastPaidAt >= prevBilling;
}

function isSubOverdue(sub: Subscription): boolean {
  return !isClearedThisCycle(sub) && sub.nextBillingDate < startOfDay(new Date());
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

// ─── Component ────────────────────────────────────────────
const SubscriptionList: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<SubscriptionListParams, 'SubscriptionList'>>();
  const { showToast } = useToast();

  const {
    subscriptions, transactions, addSubscription, updateSubscription, deleteSubscription,
    incrementInstallment, toggleSubscriptionPause, markSubscriptionPaid,
    addTransaction,
  } = usePersonalStore();
  const wallets = useWalletStore(s => s.wallets);
  const deductFromWallet = useWalletStore(s => s.deductFromWallet);
  const currency = useSettingsStore(s => s.currency);
  const expenseCategories = useCategories('expense');

  // ── View state ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [showAnnual, setShowAnnual] = useState(false);
  const [groupBy, setGroupBy] = useState<'status' | 'category'>('status');
  const [activeTab, setActiveTab] = useState<CommitmentKind>('subs');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalDay, setSelectedCalDay] = useState<Date | null>(null);

  // ── Modal state ─────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalView, setModalView] = useState<ModalView>('form');

  // ── Mark as paid sheet ───────────────────────────────────
  const [markPaidSub, setMarkPaidSub] = useState<Subscription | null>(null);

  // ── Delete confirm ───────────────────────────────────────
  const [deleteConfirmSub, setDeleteConfirmSub] = useState<Subscription | null>(null);

  // ── Form state ───────────────────────────────────────────
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(expenseCategories[0]?.id || 'food');
  const [billingCycle, setBillingCycle] = useState<Subscription['billingCycle']>('monthly');
  const [reminderDays, setReminderDays] = useState('3');
  const [startDate, setStartDate] = useState(new Date());
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [note, setNote] = useState('');
  const [formWalletId, setFormWalletId] = useState<string | undefined>(undefined);
  const [outstandingBalance, setOutstandingBalance] = useState('');

  // ── FAB animation ────────────────────────────────────────
  const fabScale = useRef(new Animated.Value(1)).current;

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
      headerRight: () => subscriptions.length > 0 && echoHidden ? (
        <TouchableOpacity
          onPress={() => {
            lightTap();
            if (tier !== 'premium') { setPaywallVisible(true); return; }
            setEchoHidden(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Echo assistant"
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather
            name="zap"
            size={20}
            color={tier !== 'premium' ? C.textMuted : C.textPrimary}
          />
        </TouchableOpacity>
      ) : null,
    });
  }, [echoHidden, tier, subscriptions.length, navigation, C, setEchoHidden]);

  // ── Draggable Echo FAB pan ───────────────────────────────
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const echoFabPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const prevFabSideRef = useRef<'left' | 'right'>('right');
  useLayoutEffect(() => {
    if (prevFabSideRef.current !== fabSide) {
      prevFabSideRef.current = fabSide;
      echoFabPan.setValue({ x: 0, y: (echoFabPan.y as any)._value });
    }
  }, [fabSide, echoFabPan]);
  const echoFabPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        echoFabPan.setOffset({
          x: (echoFabPan.x as any)._value,
          y: (echoFabPan.y as any)._value,
        });
        echoFabPan.setValue({ x: 0, y: 0 });
        setGreetingHiddenDuringDrag(true);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: echoFabPan.x, dy: echoFabPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        echoFabPan.flattenOffset();
        const curX = (echoFabPan.x as any)._value;
        const curY = (echoFabPan.y as any)._value;
        const safeTop = Math.max(insets.top, 20);
        const defaultTop = safeTop + 80;
        const fabCenterX = fabSide === 'right'
          ? SCREEN_W - SPACING.xl - 28 + curX
          : SPACING.xl + 28 + curX;
        const newSide = fabCenterX < SCREEN_W / 2 ? 'left' : 'right';
        const edgeSpan = SCREEN_W - 2 * SPACING.xl - 56;
        const snapX = fabSide === newSide ? 0 : fabSide === 'right' ? -edgeSpan : edgeSpan;
        const minY = -(defaultTop - 8);
        const maxY = SCREEN_H - insets.top - 44 - insets.bottom - 80 - 56 - defaultTop;
        const clampedY = Math.max(minY, Math.min(maxY, curY));
        Animated.spring(echoFabPan, {
          toValue: { x: snapX, y: clampedY },
          useNativeDriver: false,
          friction: 14,
          tension: 100,
        }).start(() => {
          setFabSide(newSide);
          setGreetingHiddenDuringDrag(false);
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [echoFabPan, fabSide, SCREEN_W, SCREEN_H, insets.top, insets.bottom]
  );


  // ─── Computed ──────────────────────────────────────────
  const totalMonthly = useMemo(() =>
    subscriptions
      .filter(s => s.isActive && !s.isPaused)
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
      .filter(s => s.isActive && !s.isPaused)
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
    const cleared = active.filter(s => !s.isPaused && isClearedThisCycle(s)).length;
    const pending = active.filter(s => !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate <= monthEnd).length;
    const paused  = active.filter(s => s.isPaused).length;
    return { cleared, pending, paused };
  }, [subscriptions]);

  const categoryBreakdown = useMemo(() => {
    const active = subscriptions.filter(s => s.isActive && !s.isPaused);
    const groups: Record<string, { amount: number; color: string }> = {};
    active.forEach(s => {
      const cat = expenseCategories.find(c => c.id === s.category);
      if (!groups[s.category]) groups[s.category] = { amount: 0, color: cat?.color || CALM.accent };
      groups[s.category].amount += s.amount;
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

  const afterCommitments = useMemo(() => {
    const walletBalance = wallets
      .filter(w => w.type !== 'credit')
      .reduce((sum, w) => sum + w.balance, 0);
    const pendingBills = subscriptions
      .filter(s => s.isActive && !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate <= endOfMonth(new Date()))
      .reduce((sum, s) => sum + s.amount, 0);
    return walletBalance - pendingBills;
  }, [subscriptions, wallets]);

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
      if (isClearedThisCycle(sub)) { paid.push(sub); continue; }
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

  // ── Search result (flat filtered list) ──────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return subscriptions
      .filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      .sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime());
  }, [subscriptions, searchQuery]);

  // ── Calendar bill map ─────────────────────────────────────
  const calendarBillMap = useMemo(() => {
    const map = new Map<string, Subscription[]>();
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    subscriptions
      .filter(s => s.isActive && !s.isPaused)
      .forEach(s => {
        if (s.nextBillingDate.getFullYear() === y && s.nextBillingDate.getMonth() === m) {
          const key = format(s.nextBillingDate, 'yyyy-MM-dd');
          map.set(key, [...(map.get(key) || []), s]);
        }
      });
    return map;
  }, [subscriptions, calendarMonth]);

  // ── Sections by category ─────────────────────────────────
  const sectionsByCategory = useMemo(() => {
    const active = subscriptions.filter(s => s.isActive && !s.isPaused);
    const groups: Record<string, Subscription[]> = {};
    active.forEach(s => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    return Object.entries(groups)
      .map(([cat, subs]) => ({ cat, subs: subs.sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime()) }))
      .sort((a, b) => a.cat.localeCompare(b.cat));
  }, [subscriptions]);

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
  const resetForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setAmount('');
    setCategory(expenseCategories[0]?.id || 'food');
    setBillingCycle('monthly');
    setReminderDays('3');
    setStartDate(new Date());
    setIsInstallment(false);
    setTotalInstallments('');
    setIsPaused(false);
    setNote('');
    setFormWalletId(undefined);
    setOutstandingBalance('');
    setModalView('form');
  }, [expenseCategories]);

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
      setTimeout(() => handleEdit(hid), 300);
    }
  }, [route.params?.highlightId, handleEdit]);

  // Form save — receives the payload from CommitmentForm
  const handleFormSave = useCallback((payload: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>) => {
    const nextBilling = getNextBillingDate(payload.startDate, payload.billingCycle);
    if (editingId) {
      const existing = subscriptions.find(s => s.id === editingId);
      const startChanged = existing && payload.startDate.getTime() !== existing.startDate.getTime();
      const cycleChanged = existing && payload.billingCycle !== existing.billingCycle;
      const nextBillingDate = (startChanged || cycleChanged) ? nextBilling : (existing?.nextBillingDate || nextBilling);
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

  const handleMarkPaid = useCallback((withExpense: boolean) => {
    if (!markPaidSub) return;
    markSubscriptionPaid(markPaidSub.id);
    if (withExpense && markPaidSub.walletId) {
      addTransaction({
        amount: markPaidSub.amount,
        category: markPaidSub.category,
        description: markPaidSub.name,
        type: 'expense',
        date: new Date(),
        mode: 'personal',
        inputMethod: 'manual',
        walletId: markPaidSub.walletId,
      });
      deductFromWallet(markPaidSub.walletId, markPaidSub.amount);
    }
    mediumTap();
    setMarkPaidSub(null);
    showToast('cleared.', 'success');
  }, [markPaidSub, markSubscriptionPaid, addTransaction, deductFromWallet, showToast]);

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
    const dueColor = isCleared ? C.textMuted
      : accent === 'overdue' ? '#C1694F'
      : accent === 'today'   ? C.gold
      : C.textSecondary;

    const isInstallmentSub = sub.isInstallment && sub.totalInstallments;
    const completed = sub.completedInstallments || 0;
    const total = sub.totalInstallments || 1;
    const progress = isInstallmentSub ? Math.min(completed / total, 1) : 0;

    const subText = sub.isPaused
      ? `paused · ${getCycleLabel(sub.billingCycle)}`
      : isCleared && sub.lastPaidAt
        ? `paid ${format(sub.lastPaidAt, 'MMM d')}`
        : dueDateText;

    const rightSubText = sub.isPaused ? '' :
      isCleared ? getCycleLabel(sub.billingCycle) :
      isInstallmentSub ? `${completed}/${total}` :
      getCycleLabel(sub.billingCycle);

    const rowContent = (
      <Pressable
        style={[
          styles.row,
          isCleared && styles.rowCleared,
          sub.isPaused && styles.rowPaused,
        ]}
        android_ripple={{ color: withAlpha(C.textMuted, 0.08) }}
        onPress={() => handleEdit(sub.id)}
      >
        {/* Avatar */}
        <View style={[
          styles.rowIcon,
          { backgroundColor: withAlpha(accentColor, isCleared || sub.isPaused ? 0.07 : 0.14) },
        ]}>
          {isCleared
            ? <Feather name="check" size={16} color={C.positive} />
            : <Text style={[styles.rowIconLetter, { color: accentColor }]}>
                {sub.name.charAt(0).toUpperCase()}
              </Text>
          }
        </View>

        {/* Center */}
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, isCleared && styles.rowNameCleared]} numberOfLines={1}>
            {sub.name}
          </Text>
          <Text style={[styles.rowSub, { color: dueColor }]} numberOfLines={1}>
            {subText}
          </Text>
          {isInstallmentSub && (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
            </View>
          )}
        </View>

        {/* Right */}
        <View style={styles.rowRight}>
          <Text style={[styles.rowAmount, isCleared && styles.rowAmountCleared]}>
            {currency} {sub.amount.toFixed(2)}
          </Text>
          {rightSubText.length > 0 && (
            <Text style={styles.rowRightSub}>{rightSubText}</Text>
          )}
        </View>

        {/* Chevron — soft drill-in affordance (skip for cleared/paused) */}
        {!isCleared && !sub.isPaused && (
          <Feather name="chevron-right" size={16} color={C.textMuted} style={styles.rowChevron} />
        )}
      </Pressable>
    );

    // Wallet-pattern swipeable: right→paid (only if unpaid), left→edit (always)
    const triggerPaid = (s: SwipeableMethods) => {
      hardSwipedRef.current.add(sub.id);
      s.close();
      mediumTap();
      setMarkPaidSub(sub);
    };
    const triggerEdit = (s: SwipeableMethods) => {
      hardSwipedRef.current.add(sub.id);
      s.close();
      mediumTap();
      handleEdit(sub.id);
    };

    const renderRightActions = (
      _prog: SharedValue<number>,
      drag: SharedValue<number>,
      swipeable: SwipeableMethods,
    ) => (!isCleared && !sub.isPaused ? (
      <SubSwipeAction
        variant="paid"
        direction="right"
        drag={drag}
        label="mark paid"
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
    );
  }, [
    expenseCategories, getCycleShort,
    renderWalletChip, handleEdit, currency, C, styles,
  ]);

  // ─── Grid tile ────────────────────────────────────────
  const renderTile = useCallback((sub: Subscription) => {
    const accentColor = avatarColorForName(sub.name);
    const isCleared = isClearedThisCycle(sub);
    const { text: dueDateText, accent } = getDueDateInfo(sub.nextBillingDate);

    const chipBg = isCleared
      ? withAlpha(C.positive, 0.10)
      : accent === 'overdue' ? withAlpha('#C1694F', 0.10)
      : accent === 'today'   ? withAlpha(C.gold, 0.10)
      : withAlpha(C.textMuted, 0.07);
    const chipColor = isCleared ? C.positive
      : accent === 'overdue' ? '#C1694F'
      : accent === 'today'   ? C.gold
      : C.textMuted;
    const dueDateLabel = isCleared && sub.lastPaidAt ? `paid ${format(sub.lastPaidAt, 'MMM d')}` : dueDateText;

    return (
      <TouchableOpacity
        key={sub.id}
        style={[styles.tile, isCleared && styles.tileCleared]}
        onPress={() => handleEdit(sub.id)}
        activeOpacity={0.75}
      >
        {/* Faded watermark letter */}
        <Text style={[styles.tileWatermark, { color: accentColor }]}>
          {sub.name.charAt(0).toUpperCase()}
        </Text>
        {/* Icon */}
        <View style={[styles.tileIcon, { backgroundColor: withAlpha(accentColor, isCleared ? 0.07 : 0.14) }]}>
          {isCleared
            ? <Feather name="check" size={16} color={accentColor} style={{ opacity: 0.6 }} />
            : <Text style={[styles.rowIconLetter, { color: accentColor, fontSize: TYPOGRAPHY.size.base }]}>
                {sub.name.charAt(0).toUpperCase()}
              </Text>
          }
        </View>
        <Text style={styles.tileName} numberOfLines={1}>{sub.name}</Text>
        <Text style={styles.tileAmount}>{currency} {sub.amount.toFixed(0)}</Text>
        <Text style={[styles.rowRightSub, { color: chipColor, textAlign: 'center' }]}>{dueDateLabel}</Text>
      </TouchableOpacity>
    );
  }, [expenseCategories, handleEdit, currency, C, styles]);

  // ─── Section block ────────────────────────────────────
  const renderSection = useCallback((label: string, subs: Subscription[], isCleared = false) => {
    if (subs.length === 0) return null;
    const sectionTotal = subs.reduce((sum, s) => sum + s.amount, 0);
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{label}</Text>
          <Text style={styles.sectionTotal}>{currency} {sectionTotal.toFixed(2)}</Text>
        </View>
        <View style={styles.sectionCard}>
          {subs.map((sub, idx) => (
            <React.Fragment key={sub.id}>
              {renderRow(sub, isCleared)}
              {idx < subs.length - 1 && (
                <View style={[styles.rowDivider, { marginLeft: SPACING.xl + 44 + SPACING.md }]} />
              )}
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
        <View style={styles.sectionCard}>
          {recurringDetection.map((s, idx) => (
            <React.Fragment key={s.name}>
              <TouchableOpacity
                style={styles.suggestionRow}
                onPress={() => {
                  lightTap();
                  resetForm();
                  setName(s.name);
                  setAmount(s.amount.toString());
                  setCategory(s.category);
                  setBillingCycle(s.cycle);
                  setModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionLeft}>
                  <View style={styles.suggestionBadge}>
                    <Feather name="repeat" size={12} color={C.bronze} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.suggestionMeta}>{currency} {s.amount.toFixed(2)} · {s.cycle}</Text>
                  </View>
                </View>
                <View style={styles.suggestionAction}>
                  <Text style={styles.suggestionActionText}>track</Text>
                </View>
              </TouchableOpacity>
              {idx < recurringDetection.length - 1 && (
                <View style={[styles.rowDivider, { marginLeft: 12 + 28 + SPACING.md }]} />
              )}
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  }, [recurringDetection, currency, C, styles, resetForm]);

  // ─── Calendar grid ────────────────────────────────────────
  const renderCalendarGrid = useCallback(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const firstDay = new Date(y, m, 1);
    const totalDays = new Date(y, m + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    const today = startOfDay(new Date());
    const CELL_SIZE = (SCREEN_WIDTH - SPACING.xl * 2) / 7;

    const cells: (number | null)[] = [
      ...Array(offset).fill(null),
      ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <View style={styles.calContainer}>
        {/* Month nav */}
        <View style={styles.calNavRow}>
          <TouchableOpacity
            onPress={() => { lightTap(); setCalendarMonth(subMonths(calendarMonth, 1)); setSelectedCalDay(null); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="chevron-left" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.calMonthLabel}>{format(calendarMonth, 'MMMM yyyy')}</Text>
          <TouchableOpacity
            onPress={() => { lightTap(); setCalendarMonth(addMonths(calendarMonth, 1)); setSelectedCalDay(null); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="chevron-right" size={22} color={C.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Day headers Mon–Sun */}
        <View style={styles.calHeaderRow}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <Text key={i} style={[styles.calDayHeader, { width: CELL_SIZE }]}>{d}</Text>
          ))}
        </View>

        {/* Grid */}
        <View style={styles.calGrid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={[styles.calCell, { width: CELL_SIZE, height: CELL_SIZE }]} />;
            const date = new Date(y, m, day);
            const key = format(date, 'yyyy-MM-dd');
            const dayBills = calendarBillMap.get(key) || [];
            const isToday = isSameDay(date, today);
            const isSelected = selectedCalDay ? isSameDay(date, selectedCalDay) : false;
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.calCell,
                  { width: CELL_SIZE, height: CELL_SIZE },
                  isToday && styles.calCellToday,
                  isSelected && styles.calCellSelected,
                ]}
                onPress={() => {
                  lightTap();
                  setSelectedCalDay(dayBills.length > 0 ? (isSelected ? null : date) : null);
                }}
                activeOpacity={dayBills.length > 0 ? 0.7 : 1}
              >
                <Text style={[
                  styles.calDayNum,
                  isToday && styles.calDayNumToday,
                  isSelected && { color: C.accent },
                ]}>{day}</Text>
                {dayBills.length > 0 && (
                  <View style={styles.calDots}>
                    {dayBills.slice(0, 3).map((sub, di) => (
                      <View
                        key={di}
                        style={[styles.calDot, {
                          backgroundColor: isClearedThisCycle(sub) ? C.positive : isSubOverdue(sub) ? C.bronze : C.accent,
                        }]}
                      />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected day detail */}
        {selectedCalDay && (() => {
          const key = format(selectedCalDay, 'yyyy-MM-dd');
          const dayBills = calendarBillMap.get(key) || [];
          if (!dayBills.length) return null;
          return (
            <View style={styles.calDayDetail}>
              <Text style={styles.calDayDetailDate}>{format(selectedCalDay, 'EEEE, MMM d')}</Text>
              {dayBills.map(sub => (
                <TouchableOpacity
                  key={sub.id}
                  style={styles.calDayDetailRow}
                  onPress={() => { setSelectedCalDay(null); handleEdit(sub.id); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.calDayDetailLeft}>
                    <View style={[styles.calDayDetailDot, {
                      backgroundColor: isClearedThisCycle(sub) ? C.positive : C.accent,
                    }]} />
                    <Text style={styles.calDayDetailName}>{sub.name}</Text>
                  </View>
                  <Text style={styles.calDayDetailAmt}>{currency} {sub.amount.toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })()}
      </View>
    );
  }, [calendarMonth, selectedCalDay, calendarBillMap, C, currency, styles, handleEdit]);

  // ─── Centered hero (typographic, no card) ──────────────
  const renderMonthHeader = () => {
    if (subscriptions.length === 0) return null;
    const remainingTotal = tabSections.remaining.reduce((s, x) => s + x.amount, 0);
    const paidTotal = tabSections.paid.reduce((s, x) => s + x.amount, 0);
    const heroLabel = activeTab === 'bills' ? 'your monthly bills'
      : activeTab === 'payments' ? 'your monthly payments'
      : 'your monthly subscriptions';
    const heroAmount = remainingTotal + paidTotal;
    const showSplit = remainingTotal > 0 && paidTotal > 0;
    const allPaid = remainingTotal === 0 && paidTotal > 0;

    return (
      <View style={styles.monthHeader}>
        <Text style={styles.monthLabel}>{heroLabel}</Text>
        <Text style={styles.monthAmountLine}>
          <Text style={styles.monthAmountPrefix}>{currency} </Text>
          <Text style={styles.monthAmountInt}>
            {heroAmount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
          </Text>
        </Text>
        {showSplit && (
          <Text style={styles.monthSummary}>
            <Text style={styles.monthSummaryAccent}>{currency} {remainingTotal.toFixed(2)}</Text>
            <Text> due  ·  </Text>
            <Text>{currency} {paidTotal.toFixed(2)} paid</Text>
          </Text>
        )}
        {allPaid && (
          <Text style={styles.monthSummary}>all paid this cycle</Text>
        )}
      </View>
    );
  };

  // ─── Tab bar (bills | payments | subscriptions) ────────
  const renderTabs = () => {
    if (subscriptions.length === 0) return null;
    const tabs: { key: CommitmentKind; label: string }[] = [
      { key: 'bills', label: 'bills' },
      { key: 'payments', label: 'payments' },
      { key: 'subs', label: 'subscriptions' },
    ];
    return (
      <View style={styles.tabRow}>
        {tabs.map(tab => {
          const active = activeTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabBtn}
              onPress={() => { lightTap(); setActiveTab(tab.key); }}
              activeOpacity={0.7}
            >
              <View style={styles.tabBtnInner}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                {count > 0 && (
                  <Text style={[styles.tabCount, active && styles.tabCountActive]}>{count}</Text>
                )}
              </View>
              {active && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
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
                    bills.length > 0 && !isToday && styles.dayColHasBill,
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
    const displayAmount = showAnnual ? totalAnnual : totalMonthly;
    const { cleared, pending, paused } = heroStats;

    return (
      <Pressable
        onPress={() => { lightTap(); setShowAnnual(!showAnnual); }}
        style={styles.statsLine}
      >
        <Text style={styles.statsAmount}>
          {currency} {displayAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <Text style={styles.statsPeriod}>/{showAnnual ? 'yr' : 'mo'}</Text>
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

  // ─── Add/Edit Modal ───────────────────────────────────
  const renderFormView = () => {
    const editingSub = editingId ? subscriptions.find(s => s.id === editingId) : null;
    const showMarkPayment = editingSub?.isInstallment && editingSub?.totalInstallments;
    const selectedWallet = wallets.find(w => w.id === formWalletId);

    return (
      <>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {editingId ? t.subscriptions.editSubscription.toLowerCase() : t.subscriptions.addSubscription.toLowerCase()}
          </Text>
          <TouchableOpacity
            onPress={() => { setModalVisible(false); resetForm(); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={22} color={C.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={{ paddingBottom: SPACING.lg }}
        >
          {/* Name */}
          <Text style={styles.fieldLabel}>name</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder={t.subscriptions.namePlaceholder}
            placeholderTextColor={C.textMuted}
            returnKeyType="next"
          />

          {/* Amount */}
          <Text style={styles.fieldLabel}>amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>{currency}</Text>
            <TextInput
              style={[styles.fieldInput, { flex: 1 }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          {/* Note */}
          <Text style={styles.fieldLabel}>note <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
          <TextInput
            style={styles.fieldInput}
            value={note}
            onChangeText={setNote}
            placeholder="account login, cancellation date, linked card…"
            placeholderTextColor={C.textMuted}
            returnKeyType="next"
          />

          {/* Category */}
          <CategoryPicker
            categories={expenseCategories}
            selectedId={category}
            onSelect={setCategory}
            label="category"
            layout="dropdown"
          />

          {/* Billing Cycle */}
          <Text style={styles.fieldLabel}>{t.subscriptions.repeats}</Text>
          <TouchableOpacity
            style={styles.fieldTouchable}
            onPress={() => { lightTap(); setModalView('cyclePicker'); }}
            activeOpacity={0.6}
          >
            <Text style={styles.fieldTouchableText}>{getCycleLabel(billingCycle)}</Text>
            <Feather name="chevron-down" size={16} color={C.textMuted} />
          </TouchableOpacity>

          {/* Start Date */}
          <Text style={styles.fieldLabel}>{t.subscriptions.startDate}</Text>
          <TouchableOpacity
            style={styles.fieldTouchable}
            onPress={() => { lightTap(); setModalView('calendar'); }}
            activeOpacity={0.6}
          >
            <Text style={styles.fieldTouchableText}>
              {isValid(startDate) ? format(startDate, 'MMM dd, yyyy') : t.subscriptions.selectDate}
            </Text>
            <Feather name="calendar" size={16} color={C.textMuted} />
          </TouchableOpacity>

          {/* Wallet */}
          <Text style={styles.fieldLabel}>wallet <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
          <TouchableOpacity
            style={styles.fieldTouchable}
            onPress={() => { lightTap(); setModalView('walletPicker'); }}
            activeOpacity={0.6}
          >
            {selectedWallet ? (
              <View style={styles.walletPickerSelected}>
                <WalletLogo wallet={selectedWallet} size={20} />
                <Text style={styles.fieldTouchableText}>{selectedWallet.name}</Text>
              </View>
            ) : (
              <Text style={[styles.fieldTouchableText, { color: C.textMuted }]}>none</Text>
            )}
            <Feather name="chevron-down" size={16} color={C.textMuted} />
          </TouchableOpacity>

          {/* Reminder */}
          <Text style={styles.fieldLabel}>{t.subscriptions.reminder}</Text>
          <View style={styles.reminderRow}>
            <TextInput
              style={[styles.fieldInput, { width: 60, textAlign: 'center' }]}
              value={reminderDays}
              onChangeText={setReminderDays}
              placeholder="3"
              keyboardType="number-pad"
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <Text style={styles.reminderSuffix}>{t.subscriptions.daysBefore}</Text>
          </View>

          {/* Installment toggle */}
          <TouchableOpacity
            style={[styles.toggleCard, isInstallment && styles.toggleCardActive]}
            onPress={() => { lightTap(); setIsInstallment(!isInstallment); }}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t.subscriptions.installmentLabel}</Text>
              <Text style={styles.toggleHint}>{t.subscriptions.installmentHint}</Text>
            </View>
            <Switch
              value={isInstallment}
              onValueChange={val => { lightTap(); setIsInstallment(val); }}
              trackColor={{ false: C.border, true: withAlpha(C.accent, 0.4) }}
              thumbColor={isInstallment ? C.accent : '#FFFFFF'}
              pointerEvents="none"
            />
          </TouchableOpacity>

          {isInstallment && (
            <>
              <Text style={styles.fieldLabel}>{t.subscriptions.totalInstallments}</Text>
              <TextInput
                style={styles.fieldInput}
                value={totalInstallments}
                onChangeText={setTotalInstallments}
                placeholder={t.subscriptions.totalInstallmentsPlaceholder}
                keyboardType="number-pad"
                placeholderTextColor={C.textMuted}
                returnKeyType="next"
                onSubmitEditing={Keyboard.dismiss}
              />
              <Text style={styles.fieldLabel}>outstanding balance <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
              <View style={styles.amountRow}>
                <Text style={styles.amountPrefix}>{currency}</Text>
                <TextInput
                  style={[styles.fieldInput, { flex: 1 }]}
                  value={outstandingBalance}
                  onChangeText={setOutstandingBalance}
                  placeholder="e.g. 24000 for a car loan"
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
              </View>
            </>
          )}

          {/* Pause toggle */}
          <TouchableOpacity
            style={[styles.toggleCard, isPaused && { backgroundColor: withAlpha(C.bronze, 0.06) }]}
            onPress={() => { lightTap(); setIsPaused(!isPaused); }}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t.subscriptions.pauseThis}</Text>
              <Text style={styles.toggleHint}>{t.subscriptions.pauseHint}</Text>
            </View>
            <Switch
              value={isPaused}
              onValueChange={val => { lightTap(); setIsPaused(val); }}
              trackColor={{ false: C.border, true: withAlpha(C.bronze, 0.4) }}
              thumbColor={isPaused ? C.bronze : '#FFFFFF'}
              pointerEvents="none"
            />
          </TouchableOpacity>

          {/* Mark Payment (editing installment only) */}
          {showMarkPayment && (
            <TouchableOpacity
              style={styles.markPaymentBtn}
              onPress={() => {
                const editingSub2 = subscriptions.find(s => s.id === editingId);
                if (editingSub2) { incrementInstallment(editingId!); showToast(t.subscriptions.paymentMarked, 'success'); }
              }}
              activeOpacity={0.7}
            >
              <Feather name="check-circle" size={18} color={C.accent} />
              <Text style={styles.markPaymentText}>
                {t.subscriptions.markPayment} ({editingSub!.completedInstallments || 0}/{editingSub!.totalInstallments})
              </Text>
            </TouchableOpacity>
          )}

          {/* Delete */}
          {editingId && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => {
                setModalVisible(false);
                resetForm();
                const sub = subscriptions.find(s => s.id === editingId);
                if (sub) setTimeout(() => setDeleteConfirmSub(sub), 300);
              }}
              activeOpacity={0.7}
            >
              <Feather name="trash-2" size={16} color={C.neutral} />
              <Text style={styles.deleteBtnText}>{t.subscriptions.deleteCommitment}</Text>
            </TouchableOpacity>
          )}

          {/* Payment History */}
          {editingId && (() => {
            const sub = subscriptions.find(s => s.id === editingId);
            const history = sub?.paymentHistory;
            if (!history || history.length === 0) return null;
            return (
              <View style={styles.historySection}>
                <Text style={styles.fieldLabel}>payment history</Text>
                {history.slice().reverse().slice(0, 8).map(p => (
                  <View key={p.id} style={styles.historyRow}>
                    <Text style={styles.historyDate}>{format(p.paidAt, 'MMM d, yyyy')}</Text>
                    <Text style={styles.historyAmt}>{currency} {p.amount.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Save */}
          <TouchableOpacity style={styles.confirmBtn} onPress={handleSave} activeOpacity={0.7}>
            <Text style={styles.confirmBtnText}>
              {editingId ? t.common.save.toLowerCase() : t.subscriptions.addSubscription.toLowerCase()}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </>
    );
  };

  const renderCyclePickerView = () => (
    <>
      <View style={styles.modalHeader}>
        <TouchableOpacity
          onPress={() => setModalView('form')}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>{t.subscriptions.repeats}</Text>
        <View style={{ width: 32 }} />
      </View>
      {BILLING_CYCLES.map(cycle => {
        const isSelected = billingCycle === cycle.value;
        return (
          <TouchableOpacity
            key={cycle.value}
            style={[styles.pickerOption, isSelected && styles.pickerOptionActive]}
            onPress={() => { lightTap(); setBillingCycle(cycle.value as Subscription['billingCycle']); setModalView('form'); }}
            activeOpacity={0.6}
          >
            <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextActive]}>
              {cycle.label.toLowerCase()}
            </Text>
            {isSelected && <Feather name="check" size={18} color={C.accent} />}
          </TouchableOpacity>
        );
      })}
    </>
  );

  const renderCalendarView = () => (
    <>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => setModalView('form')} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>{t.subscriptions.startDate}</Text>
        <View style={{ width: 32 }} />
      </View>
      <CalendarPicker value={startDate} onChange={(date) => { setStartDate(date); setModalView('form'); }} />
    </>
  );

  const renderWalletPickerView = () => (
    <>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => setModalView('form')} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>wallet</Text>
        <View style={{ width: 32 }} />
      </View>
      {/* None option */}
      <TouchableOpacity
        style={[styles.pickerOption, !formWalletId && styles.pickerOptionActive]}
        onPress={() => { lightTap(); setFormWalletId(undefined); setModalView('form'); }}
        activeOpacity={0.6}
      >
        <Text style={[styles.pickerOptionText, !formWalletId && styles.pickerOptionTextActive]}>none</Text>
        {!formWalletId && <Feather name="check" size={18} color={C.accent} />}
      </TouchableOpacity>
      {wallets.map(wallet => {
        const isSelected = formWalletId === wallet.id;
        return (
          <TouchableOpacity
            key={wallet.id}
            style={[styles.pickerOption, isSelected && styles.pickerOptionActive]}
            onPress={() => { lightTap(); setFormWalletId(wallet.id); setModalView('form'); }}
            activeOpacity={0.6}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <WalletLogo wallet={wallet} size={24} />
              <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextActive]}>
                {wallet.name}
              </Text>
            </View>
            {isSelected && <Feather name="check" size={18} color={C.accent} />}
          </TouchableOpacity>
        );
      })}
    </>
  );

  const renderModal = () => (
    <Modal
      visible
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (modalView !== 'form') { setModalView('form'); return; }
        setModalVisible(false); resetForm();
      }}
    >
      <TouchableOpacity
        style={styles.overlayCenter}
        activeOpacity={1}
        onPress={() => {
          if (modalView !== 'form') { setModalView('form'); return; }
          setModalVisible(false); resetForm();
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kavWrapper}>
          <View
            style={[styles.modalCard, modalView !== 'form' && { maxHeight: undefined }]}
            onStartShouldSetResponder={() => true}
          >
            {modalView === 'form' && renderFormView()}
            {modalView === 'cyclePicker' && renderCyclePickerView()}
            {modalView === 'calendar' && renderCalendarView()}
            {modalView === 'walletPicker' && renderWalletPickerView()}
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );

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

    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMarkPaidSub(null)}>
        <Pressable style={styles.overlayCenter} onPress={() => setMarkPaidSub(null)}>
          <View style={styles.markPaidCard} onStartShouldSetResponder={() => true}>
            {/* Header */}
            <Text style={styles.markPaidTitle}>{markPaidSub.name}</Text>
            <Text style={styles.markPaidAmount}>{currency} {markPaidSub.amount.toFixed(2)}</Text>
            <Text style={styles.markPaidNext}>next cycle starts {format(nextAfterPaid, 'MMM d')}</Text>

            <View style={styles.markPaidDivider} />

            {/* Primary action */}
            <TouchableOpacity style={styles.markPaidBtn} onPress={() => handleMarkPaid(false)} activeOpacity={0.8}>
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={styles.markPaidBtnText}>mark as paid</Text>
            </TouchableOpacity>

            {/* Expense log action (only if wallet linked) */}
            {linkedWallet && (
              <TouchableOpacity style={styles.markPaidBtnOutline} onPress={() => handleMarkPaid(true)} activeOpacity={0.8}>
                <View style={styles.walletChip}>
                  <WalletLogo wallet={linkedWallet} size={16} />
                </View>
                <Text style={styles.markPaidBtnOutlineText}>
                  paid + log {currency} {markPaidSub.amount.toFixed(2)} from {linkedWallet.name}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setMarkPaidSub(null)} style={styles.markPaidCancelRow}>
              <Text style={styles.markPaidCancelText}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
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
          <View style={styles.deleteCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.deleteCardTitle}>{t.subscriptions.deleteTitle}</Text>
            <Text style={styles.deleteCardMsg}>
              {t.subscriptions.removeConfirm.replace('{name}', deleteConfirmSub.name)}
            </Text>
            <TouchableOpacity style={styles.deleteCardBtn} onPress={handleConfirmDelete} activeOpacity={0.8}>
              <Text style={styles.deleteCardBtnText}>{t.subscriptions.deleteAction}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteConfirmSub(null)} style={styles.deleteCardCancel}>
              <Text style={styles.deleteCardCancelText}>{t.subscriptions.cancelAction}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    );
  };

  // ─── Empty state ─────────────────────────────────────
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Feather name="calendar" size={48} color={C.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{t.subscriptions.noBills}</Text>
      <Text style={styles.emptyText}>{t.subscriptions.trackRecurring}</Text>
      <TouchableOpacity style={styles.emptyButton} onPress={() => { lightTap(); setModalVisible(true); }} activeOpacity={0.7}>
        <Text style={styles.emptyButtonText}>{t.subscriptions.addBill}</Text>
      </TouchableOpacity>
    </View>
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
            {renderTabs()}

            {/* Search */}
            <View style={styles.searchContainer}>
              <Feather name="search" size={16} color={C.textMuted} style={{ marginRight: SPACING.sm }} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="search commitments…"
                placeholderTextColor={C.textMuted}
                returnKeyType="search"
                onSubmitEditing={Keyboard.dismiss}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={16} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Search results */}
            {searchResults !== null ? (
              searchResults.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.sectionCard}>
                    {searchResults.map((sub, idx) => (
                      <React.Fragment key={sub.id}>
                        {renderRow(sub, isClearedThisCycle(sub))}
                        {idx < searchResults.length - 1 && <View style={[styles.rowDivider, { marginLeft: SPACING.xl + 44 + SPACING.md }]} />}
                      </React.Fragment>
                    ))}
                  </View>
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
                {tabSections.remaining.length === 0 && tabSections.paid.length === 0 && tabSections.paused.length === 0 ? (
                  <View style={styles.tabEmpty}>
                    <Text style={styles.tabEmptyTitle}>nothing in {activeTab === 'subs' ? 'subscriptions' : activeTab} yet</Text>
                    <Text style={styles.tabEmptyHint}>add one with the + button below</Text>
                  </View>
                ) : (
                  <>
                    {renderSection('remaining', tabSections.remaining, false)}
                    {renderSection('paid', tabSections.paid, true)}
                    {renderSection('paused', tabSections.paused, false)}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          renderEmptyState()
        )}
      </ScrollView>

      {/* FAB */}
      {subscriptions.length > 0 && (
        <Animated.View style={[styles.fab, { bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md), transform: [{ scale: fabScale }] }]}>
          <TouchableOpacity
            style={styles.fabInner}
            onPress={() => { mediumTap(); resetForm(); setModalVisible(true); }}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Echo FAB + greeting bubble (standardized, draggable) ── */}
      {subscriptions.length > 0 && !echoHidden && !modalVisible && !echoSheetVisible && !markPaidSub && !deleteConfirmSub ? (
        <Animated.View
          style={[
            styles.commitmentEchoFabContainer,
            fabSide === 'right'
              ? { right: SPACING.xl, flexDirection: 'row-reverse' }
              : { left: SPACING.xl, flexDirection: 'row' },
            { top: Math.max(insets.top, 20) + 80 },
            { transform: echoFabPan.getTranslateTransform() },
          ]}
          {...echoFabPanResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.commitmentEchoFab}
            onPress={() => {
              lightTap();
              if (tier !== 'premium') { setPaywallVisible(true); return; }
              setEchoAutoPrompt(undefined);
              setEchoSheetVisible(true);
              setGreetingDismissed(true);
            }}
            onLongPress={() => {
              lightTap();
              Alert.alert('hide echo here?', "you can re-enable it from settings.", [
                { text: t.common.cancel, style: 'cancel' },
                { text: 'hide', onPress: () => setEchoHidden(true) },
              ]);
            }}
            delayLongPress={500}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open Echo assistant (hold to hide)"
          >
            <Feather name="zap" size={22} color="#fff" />
            {tier !== 'premium' && (
              <View style={styles.commitmentEchoFabLock}>
                <Feather name="lock" size={9} color="#fff" />
              </View>
            )}
            <View style={styles.commitmentEchoFabPulse} />
          </TouchableOpacity>
          {greetingText && !greetingDismissed && !greetingHiddenDuringDrag && (
            <TouchableOpacity
              style={styles.commitmentEchoGreetingBubble}
              onPress={() => {
                lightTap();
                if (tier !== 'premium') { setPaywallVisible(true); return; }
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
      ) : null}

      <CommitmentForm
        visible={modalVisible}
        subscription={editingId ? subscriptions.find(s => s.id === editingId) || null : null}
        onClose={handleFormClose}
        onSave={handleFormSave}
        onDelete={handleFormDelete}
        onError={handleFormError}
      />
      {renderMarkPaidModal()}
      {renderDeleteModal()}

      {/* ── Echo inline chat sheet ── */}
      <EchoInlineChat
        visible={echoSheetVisible}
        onClose={() => setEchoSheetVisible(false)}
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
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.xl },

  // ── Tab bar ───────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    marginBottom: SPACING.lg,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    position: 'relative',
  },
  tabBtnInner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  tabTextActive: {
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  tabCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  tabCountActive: {
    color: C.accent,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: '22%',
    right: '22%',
    height: 2,
    backgroundColor: C.accent,
    borderRadius: 1,
  },
  tabEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.xs,
  },
  tabEmptyTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  tabEmptyHint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },

  // ── Centered hero (matches Wallet typography) ──────────
  monthHeader: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING['2xl'],
  },
  monthLabel: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    textAlign: 'center',
  },
  monthAmountLine: {
    marginTop: SPACING.xs,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  monthAmountPrefix: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  monthAmountInt: {
    fontSize: 44,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -1,
  },
  monthSummary: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  monthSummaryAccent: {
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── Day strip ─────────────────────────────────────────
  dayStripWrap: {
    marginBottom: SPACING.lg,
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
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  dayColToday: {
    backgroundColor: withAlpha(C.accent, 0.10),
    borderWidth: 1,
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
    backgroundColor: C.border,
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
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },

  // ── Section ───────────────────────────────────────────
  section: { marginBottom: SPACING.lg },
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOWS.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  sectionTotal: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ── Row ───────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    minHeight: 72,
    backgroundColor: C.surface,
  },
  rowCleared: { opacity: 0.55 },
  rowPaused: { opacity: 0.6 },

  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    flexShrink: 0,
  },
  rowIconLetter: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: -0.5,
  },
  rowChevron: {
    marginLeft: SPACING.sm,
    opacity: 0.3,
  },
  rowInfo: { flex: 1, marginRight: SPACING.sm },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 2 },
  rowName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    flexShrink: 1,
  },
  rowNameCleared: { color: C.textSecondary },
  pausedBadge: {
    backgroundColor: withAlpha(C.bronze, 0.12),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs + 1,
    paddingVertical: 1,
  },
  pausedBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  rowSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 2,
  },
  rowRightSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  rowNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  progressBarContainer: {
    height: 3,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: RADIUS.full,
    marginTop: SPACING.xs,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
  },

  rowRight: { alignItems: 'flex-end', flexShrink: 0 },
  rowInstallmentCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
    marginBottom: 2,
  },
  rowAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  rowAmountCleared: { color: C.textSecondary },
  rowRemaining: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginRight: SPACING.md,
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

  // ── Grid ──────────────────────────────────────────────
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    width: TILE_SIZE,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOWS.xs,
  },
  tileCleared: { opacity: 0.55 },
  tileWatermark: {
    position: 'absolute',
    fontSize: 72,
    fontWeight: TYPOGRAPHY.weight.bold,
    opacity: 0.04,
    top: -8,
    right: -4,
    lineHeight: 80,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  tileName: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  tileAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
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

  // ── Empty state ───────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['5xl'],
    paddingHorizontal: SPACING.xl,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.size.sm * 1.6,
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  emptyButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ── FAB ───────────────────────────────────────────────
  fab: { position: 'absolute', right: SPACING.xl },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
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
    ...SHADOWS.md,
  },
  commitmentEchoFabPulse: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DEAB22',
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
    borderWidth: 1,
    borderColor: '#fff',
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
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
    ...SHADOWS.md,
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
  kavWrapper: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: '90%',
    maxHeight: '85%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOWS.lg,
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

  // ── Form fields ───────────────────────────────────────
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  fieldLabelOptional: {
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
  },
  fieldInput: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  amountPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  fieldTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.sm + 2,
  },
  fieldTouchableText: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary },
  walletPickerSelected: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reminderSuffix: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted },

  // ── Toggles ───────────────────────────────────────────
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.textMuted, 0.04),
    borderRadius: RADIUS.lg,
  },
  toggleCardActive: { backgroundColor: withAlpha(C.accent, 0.06) },
  toggleLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  toggleHint: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2 },

  // ── Mark payment ──────────────────────────────────────
  markPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.08),
    borderRadius: RADIUS.md,
  },
  markPaymentText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
  },

  // ── Delete button (form) ──────────────────────────────
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  deleteBtnText: { fontSize: TYPOGRAPHY.size.sm, color: C.neutral },

  // ── Save button ───────────────────────────────────────
  confirmBtn: {
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  confirmBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
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
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  pickerOptionActive: { backgroundColor: withAlpha(C.accent, 0.08) },
  pickerOptionText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  pickerOptionTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },

  // ── Mark as Paid modal ────────────────────────────────
  markPaidCard: {
    width: '88%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  markPaidTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  markPaidAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  markPaidNext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginBottom: SPACING.md,
  },
  markPaidDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginBottom: SPACING.lg,
  },
  markPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.positive,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    marginBottom: SPACING.sm,
  },
  markPaidBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  markPaidBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    width: '100%',
    marginBottom: SPACING.sm,
  },
  markPaidBtnOutlineText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flexShrink: 1,
    textAlign: 'center',
  },
  markPaidCancelRow: { paddingVertical: SPACING.sm },
  markPaidCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },

  // ── Delete confirm modal ──────────────────────────────
  deleteCard: {
    width: '88%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  deleteCardTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  deleteCardMsg: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: TYPOGRAPHY.size.base * 1.5,
  },
  deleteCardBtn: {
    backgroundColor: withAlpha(C.neutral, 0.12),
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  deleteCardBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.neutral,
  },
  deleteCardCancel: { paddingVertical: SPACING.sm },
  deleteCardCancelText: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted },

  // ── GroupBy toggle ─────────────────────────────────────────
  groupByRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  groupByPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  groupByPillActive: {
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  groupByPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupByPillTextActive: {
    color: C.accent,
  },

  // ── Suggestions ────────────────────────────────────────────
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
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
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.accent,
  },
  suggestionActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },

  // ── Calendar ───────────────────────────────────────────────
  calContainer: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  calNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.lg,
  },
  calMonthLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  calHeaderRow: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  calDayHeader: {
    textAlign: 'center',
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: SPACING.sm,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
  },
  calCellToday: {
    backgroundColor: withAlpha(C.accent, 0.08),
    borderRadius: RADIUS.md,
  },
  calCellSelected: {
    backgroundColor: withAlpha(C.accent, 0.15),
    borderRadius: RADIUS.md,
  },
  calDayNum: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  calDayNumToday: {
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
  },
  calDots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 3,
  },
  calDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  calDayDetail: {
    marginTop: SPACING.lg,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  calDayDetailDate: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  calDayDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  calDayDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  calDayDetailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calDayDetailName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flex: 1,
  },
  calDayDetailAmt: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ── Payment history ────────────────────────────────────────
  historySection: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  historyDate: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  historyAmt: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

export default SubscriptionList;
