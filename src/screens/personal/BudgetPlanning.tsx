import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  TouchableOpacity,
  Pressable,
  Keyboard,
  Platform,
  Switch,
  KeyboardAvoidingView,
  FlatList,
  Animated as RNAnimated,
  useWindowDimensions,
} from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  useAnimatedReaction,
  SharedValue,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutUp,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import {
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  startOfYear, endOfYear,
  isWithinInterval,
  differenceInDays,
  getDaysInMonth,
  getDate,
} from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, BUDGET_PERIODS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useEchoFabPan } from '../../hooks/useEchoFabPan';
import EchoDragHideZone from '../../components/wallet/EchoDragHideZone';
import { useCategories } from '../../hooks/useCategories';
import { FREE_TIER } from '../../constants/premium';
import CategoryPicker from '../../components/common/CategoryPicker';
import PaywallModal from '../../components/common/PaywallModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremiumStore } from '../../store/premiumStore';
import { useToast } from '../../context/ToastContext';
import { Budget, CategoryOption, Playbook } from '../../types';
import ModalToastHost from '../../components/common/ModalToastHost';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { lightTap, mediumTap } from '../../services/haptics';
import ScreenGuide from '../../components/common/ScreenGuide';
import EchoInlineChat from '../../components/common/EchoInlineChat';
import TypewriterText from '../../components/common/TypewriterText';
import { usePlaybookStore } from '../../store/playbookStore';
import { computePlaybookStats, isOverspent, getOverspentAmount, isPlaybookStale } from '../../utils/playbookStats';
import PlaybookNotebook from '../../components/playbook/PlaybookNotebook';
import { format } from 'date-fns';

const HARD_SWIPE = 120;
const SWIPE_ACTION_MIN = 72;
const SWIPE_ACTION_MAX = 140;

type BudgetSwipeActionProps = {
  variant: 'edit' | 'delete';
  direction: 'right' | 'left';
  drag: SharedValue<number>;
  label: string;
  styles: ReturnType<typeof makeStyles>;
  onTap: () => void;
  onHardSwipe: () => void;
};

function BudgetSwipeAction({
  variant, direction, drag, label, styles, onTap, onHardSwipe,
}: BudgetSwipeActionProps) {
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
      if (Math.abs(v) < 10) {
        triggered.value = false;
      }
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    const absDrag = Math.abs(drag.value);
    const w = Math.min(SWIPE_ACTION_MAX, Math.max(SWIPE_ACTION_MIN, absDrag));
    return { width: w };
  });

  return (
    <Reanimated.View
      style={[
        styles.swipeFill,
        variant === 'edit' ? styles.swipeEditColor : styles.swipeDeleteColor,
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
          name={variant === 'edit' ? 'edit-2' : 'trash-2'}
          size={22}
          color="#fff"
        />
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// ─── Pace helpers ──────────────────────────────────────────
// Pace color resolves against the active palette (light/dark) — pass `C` from
// the component scope so dark mode renders the dark-variant tokens.
// (UX-H5, DESIGN-H1)
const getPaceColor = (paceRatio: number, C: typeof CALM) => {
  if (paceRatio <= 1.1) return C.accent; // olive — on track / ahead
  if (paceRatio <= 1.3) return C.bronze; // bronze — moving a bit fast
  return C.gold; // gold — needs attention (icon/pill use, not body text)
};

const getPaceLabel = (paceRatio: number) => {
  if (paceRatio < 0.9) return 'ahead';
  if (paceRatio <= 1.1) return 'on track';
  if (paceRatio <= 1.3) return 'moving a bit fast';
  return 'needs attention';
};

const getPaceIcon = (paceRatio: number): 'trending-down' | 'check-circle' | 'trending-up' | 'alert-circle' => {
  if (paceRatio < 0.9) return 'trending-down';
  if (paceRatio <= 1.1) return 'check-circle';
  if (paceRatio <= 1.3) return 'trending-up';
  return 'alert-circle';
};

type BudgetStatus = 'urgent' | 'track' | 'plenty';
const classifyBudget = (percentSpent: number, paceRatio: number): BudgetStatus => {
  if (percentSpent >= 0.85 || paceRatio > 1.3) return 'urgent';
  if (percentSpent >= 0.4 || paceRatio > 0.9) return 'track';
  return 'plenty';
};

const getPeriodInterval = (period: 'weekly' | 'monthly' | 'yearly', now: Date) => {
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'yearly':
      return { start: startOfYear(now), end: endOfYear(now) };
    case 'monthly':
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
};

const getPeriodDates = (period: 'weekly' | 'monthly' | 'yearly', now: Date) => {
  switch (period) {
    case 'weekly':
      return { startDate: startOfWeek(now, { weekStartsOn: 1 }), endDate: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'yearly':
      return { startDate: startOfYear(now), endDate: endOfYear(now) };
    case 'monthly':
    default:
      return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
  }
};

// ─── Component ─────────────────────────────────────────────
const BudgetPlanning: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { budgets, addBudget, updateBudget, deleteBudget, transactions, subscriptions, goals } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const echoHidden = useSettingsStore((s) => s.budgetEchoHidden);
  const setEchoHidden = useSettingsStore((s) => s.setBudgetEchoHidden);
  const canCreateBudget = usePremiumStore((s) => s.canCreateBudget);
  const tier = usePremiumStore((s) => s.tier);
  const expenseCategories = useCategories('expense');

  const [modalVisible, setModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [echoPaywallVisible, setEchoPaywallVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [echoSheetVisible, setEchoSheetVisible] = useState(false);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [greetingHiddenDuringDrag, setGreetingHiddenDuringDrag] = useState(false);
  const [greetingText, setGreetingText] = useState('');
  const [greetingChips, setGreetingChips] = useState<{ label: string; question: string }[]>([]);
  const [echoAutoPrompt, setEchoAutoPrompt] = useState<string | undefined>(undefined);
  const [fabSide, setFabSide] = useState<'left' | 'right'>('right');
  const [chipRotation, setChipRotation] = useState(0);

  // ── Bottom-sheet animation for Add/Edit Budget ──
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const bSheetY = useSharedValue(SCREEN_H);
  const bDragStart = useSharedValue(0);

  useEffect(() => {
    if (modalVisible) {
      bClosingRef.current = false;
      bSheetY.value = SCREEN_H;
      bSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [modalVisible, SCREEN_H, bSheetY]);

  const bClosingRef = useRef(false);
  const bFinishClose = useCallback(() => {
    if (!bClosingRef.current) return;
    bClosingRef.current = false;
    setModalVisible(false);
    setTimeout(() => resetForm(), 0);
  }, []);

  const bCloseSheet = useCallback(() => {
    if (bClosingRef.current) return;
    bClosingRef.current = true;
    Keyboard.dismiss();
    bSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(bFinishClose)();
    });
  }, [SCREEN_H, bSheetY, bFinishClose]);

  const bSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          bDragStart.value = bSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = bDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          bSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(bCloseSheet)();
          } else {
            bSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    [SCREEN_H, bCloseSheet]
  );

  const bSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bSheetY.value }],
  }));
  const bBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Draggable Echo FAB — free X+Y drag, snaps to edge, drag-to-hide ──
  const { echoFabPan, echoFabPanResponder, hideZoneAnim, hideZoneHoverAnim, fabScale, hideZoneRef } = useEchoFabPan({
    fabSide,
    setFabSide,
    setGreetingHiddenDuringDrag,
    onHide: () => setEchoHidden(true),
    insets,
  });

  // Form state
  const [category, setCategory] = useState(expenseCategories[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [rollover, setRollover] = useState(false);

  // ─── Playbook state ─────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'budget' | 'playbook'>('budget');
  const [playbookTab, setPlaybookTab] = useState<'active' | 'past'>('active');
  const [createPlaybookVisible, setCreatePlaybookVisible] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  // expandedPbId removed — cards now tap-to-open notebook directly
  const [notebookPb, setNotebookPb] = useState<Playbook | null>(null);
  const navigation = useNavigation<any>();

  useLayoutEffect(() => {
    if (!echoHidden) {
      navigation.setOptions({ headerRight: undefined, headerRightContainerStyle: undefined });
      return;
    }
    navigation.setOptions({
      headerRightContainerStyle: { paddingRight: 12 },
      headerRight: () => (
        <TouchableOpacity
          onPress={() => { lightTap(); setEchoHidden(false); }}
          accessibilityRole="button"
          accessibilityLabel="Show Echo assistant"
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="zap" size={20} color={C.textPrimary} />
        </TouchableOpacity>
      ),
    });
  }, [echoHidden, navigation, C]);

  const pendingNavRef = useRef<string | null>(null);
  const pendingNavParamsRef = useRef<Record<string, any> | undefined>(undefined);
  const reopenPlaybookRef = useRef<string | null>(null);
  const [notebookOblExpanded, setNotebookOblExpanded] = useState(false);

  // Reopen notebook modal when returning from obligation screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (reopenPlaybookRef.current) {
        const pbId = reopenPlaybookRef.current;
        reopenPlaybookRef.current = null;
        const pb = usePlaybookStore.getState().playbooks.find((p) => p.id === pbId);
        if (pb) {
          setNotebookOblExpanded(true);
          setTimeout(() => setNotebookPb(pb), 150);
        }
      }
    });
    return unsubscribe;
  }, [navigation]);

  const handleNotebookNavigate = useCallback((screen: string, params?: Record<string, any>) => {
    // Store which playbook to reopen on return
    if (notebookPb) reopenPlaybookRef.current = notebookPb.id;
    pendingNavRef.current = screen;
    pendingNavParamsRef.current = params;
    setNotebookPb(null); // close notebook modal
    // Navigate after modal dismisses
    setTimeout(() => {
      if (pendingNavRef.current) {
        navigation.navigate(pendingNavRef.current, pendingNavParamsRef.current);
        pendingNavRef.current = null;
        pendingNavParamsRef.current = undefined;
      }
    }, 100);
  }, [navigation, notebookPb]);

  // Create/edit playbook form
  const [pbName, setPbName] = useState('');
  const [pbAmount, setPbAmount] = useState('');

  // Playbook store
  const playbooks = usePlaybookStore((s) => s.playbooks);
  const createPlaybook = usePlaybookStore((s) => s.createPlaybook);
  const updatePlaybookAction = usePlaybookStore((s) => s.updatePlaybook);
  const closePlaybookAction = usePlaybookStore((s) => s.closePlaybook);
  const deletePlaybookAction = usePlaybookStore((s) => s.deletePlaybook);
  const reopenPlaybookAction = usePlaybookStore((s) => s.reopenPlaybook);
  const canCreatePb = usePlaybookStore((s) => s.canCreatePlaybook);
  const canClosePb = usePlaybookStore((s) => s.canClosePlaybook);

  const now = useMemo(() => new Date(), []);

  // ─── Compute spent per budget from transactions (no stale useEffect) ───
  const budgetsWithSpent = useMemo(() => {
    return budgets.map((budget) => {
      const { start, end } = getPeriodInterval(budget.period, now);
      const spent = transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            t.category === budget.category &&
            isWithinInterval(t.date, { start, end })
        )
        .reduce((sum, t) => sum + t.amount, 0);

      return { ...budget, spentAmount: spent };
    });
  }, [budgets, transactions, now]);

  // ─── Breathing room hero calculations ────────────────────
  const heroData = useMemo(() => {
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const totalIncome = transactions
      .filter(
        (t) =>
          t.type === 'income' &&
          isWithinInterval(t.date, { start: monthStart, end: monthEnd })
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          isWithinInterval(t.date, { start: monthStart, end: monthEnd })
      )
      .reduce((sum, t) => sum + t.amount, 0);

    // Baseline: sum of budgeted allocations (monthly)
    const totalAllocated = budgetsWithSpent
      .filter((b) => b.period === 'monthly')
      .reduce((sum, b) => sum + b.allocatedAmount, 0);
    const totalBudgetSpent = budgetsWithSpent
      .filter((b) => b.period === 'monthly')
      .reduce((sum, b) => sum + b.spentAmount, 0);

    const overBudgets = budgetsWithSpent.filter((b) => b.spentAmount > b.allocatedAmount);
    const totalOverBy = overBudgets.reduce((s, b) => s + (b.spentAmount - b.allocatedAmount), 0);

    const totalSpent = totalExpenses;
    // Use BUDGET baseline for "left to spend" (not income — income might not be tracked)
    const budgetLeft = Math.max(totalAllocated - totalBudgetSpent, 0);
    const freeToSpend = totalAllocated > 0 ? budgetLeft : Math.max(totalIncome - totalExpenses, 0);

    const daysInMonth = getDaysInMonth(now);
    const dayOfMonth = getDate(now);
    const daysRemaining = Math.max(daysInMonth - dayOfMonth + 1, 1);
    const dailyAllowance = freeToSpend > 0 ? freeToSpend / daysRemaining : 0;

    const percentElapsed = dayOfMonth / daysInMonth;
    // Percent spent is now budget-relative (with income fallback)
    const percentSpent = totalAllocated > 0
      ? totalBudgetSpent / totalAllocated
      : totalIncome > 0 ? totalSpent / totalIncome : 0;
    const paceRatio = percentElapsed > 0 ? percentSpent / percentElapsed : 0;

    // Runway prediction — uses BUDGET baseline (not income)
    const daysElapsed = Math.max(dayOfMonth, 1);
    const runwayBaseline = totalAllocated > 0 ? totalAllocated : totalIncome;
    const runwayBurn = totalAllocated > 0
      ? totalBudgetSpent / daysElapsed
      : totalExpenses / daysElapsed;
    const dailyBurn = runwayBurn;
    const runwayDays = runwayBurn > 0 && runwayBaseline > 0
      ? Math.floor(runwayBaseline / runwayBurn)
      : daysInMonth + 10;
    const runsOutOnDay = Math.min(runwayDays, daysInMonth + 5);
    const stretchesWholeMonth = overBudgets.length === 0 && runwayDays >= daysInMonth;
    const runwayOverage = Math.max(runwayDays - daysInMonth, 0);
    const alreadyOver = overBudgets.length > 0;

    // ─── Smart daily allowance ───
    // Considers: upcoming subscriptions, active goal contributions, safety buffer
    // Returns: RM per day the user should spend to stay on plan
    const upcomingBillsTotal = subscriptions
      .filter((s) => s.isActive && !s.isPaused)
      .reduce((sum, s) => {
        const next = s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate);
        if (next >= now && next <= monthEnd) return sum + s.amount;
        return sum;
      }, 0);
    const upcomingBillsCount = subscriptions.filter((s) => {
      if (!s.isActive || s.isPaused) return false;
      const next = s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate);
      return next >= now && next <= monthEnd;
    }).length;

    // Active goals still being contributed to — reserve ~5% of remaining target per month
    const activeGoalReserve = goals
      .filter((g) => {
        const contributed = (g.contributions || []).reduce((s, c) => s + c.amount, 0);
        return contributed < g.targetAmount;
      })
      .reduce((sum, g) => {
        const contributed = (g.contributions || []).reduce((s, c) => s + c.amount, 0);
        const remaining = Math.max(g.targetAmount - contributed, 0);
        return sum + Math.min(remaining * 0.05, remaining);
      }, 0);
    const activeGoalCount = goals.filter((g) => {
      const contributed = (g.contributions || []).reduce((s, c) => s + c.amount, 0);
      return contributed < g.targetAmount;
    }).length;

    // 10% safety buffer on remaining free money
    const rawFree = Math.max(budgetLeft > 0 ? budgetLeft : freeToSpend, 0);
    const safetyBuffer = rawFree * 0.10;

    // Spendable after commitments + reserves + buffer
    const spendablePool = Math.max(rawFree - upcomingBillsTotal - activeGoalReserve - safetyBuffer, 0);
    const smartDaily = daysRemaining > 0 ? spendablePool / daysRemaining : 0;

    // Confidence signal
    const naiveDaily = rawFree / daysRemaining;
    const smartVsNaive = naiveDaily > 0 ? smartDaily / naiveDaily : 1;

    return {
      freeToSpend,
      dailyAllowance,
      daysRemaining,
      daysInMonth,
      percentSpent,
      percentElapsed,
      totalIncome,
      totalSpent,
      totalAllocated,
      paceRatio,
      dailyBurn,
      runwayDays,
      runsOutOnDay,
      stretchesWholeMonth,
      runwayOverage,
      dayOfMonth,
      smartDaily,
      smartVsNaive,
      upcomingBillsTotal,
      upcomingBillsCount,
      activeGoalReserve,
      activeGoalCount,
      safetyBuffer,
      alreadyOver,
      overBudgets,
      totalOverBy,
      budgetLeft,
      totalBudgetSpent,
      paceColor: getPaceColor(paceRatio, C),
    };
  }, [transactions, budgetsWithSpent, now, subscriptions, goals, C]);

  // ─── Handlers ────────────────────────────────────────────
  const handleAdd = useCallback(() => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      showToast('enter a valid amount', 'error');
      return;
    }
    if (!category) {
      showToast('please select a category', 'error');
      return;
    }

    const parsedAmount = parseFloat(amount);
    const dates = getPeriodDates(period, new Date());

    if (editingBudget) {
      const conflicting = budgets.find(
        (b) => b.category === category && b.id !== editingBudget.id
      );
      if (conflicting) {
        showToast('a budget for this category already exists', 'error');
        return;
      }
      mediumTap();
      updateBudget(editingBudget.id, {
        category,
        allocatedAmount: parsedAmount,
        period,
        rollover,
        startDate: dates.startDate,
        endDate: dates.endDate,
      });
      closeModal();
      showToast('budget updated.', 'success');
    } else {
      const existing = budgets.find((b) => b.category === category);
      if (existing) {
        showToast('a budget for this category already exists', 'error');
        return;
      }

      mediumTap();
      addBudget({
        category,
        allocatedAmount: parsedAmount,
        period,
        rollover,
        startDate: dates.startDate,
        endDate: dates.endDate,
      });
      closeModal();
      showToast('budget created.', 'success');
    }
  }, [amount, category, period, rollover, editingBudget, budgets, addBudget, updateBudget, showToast]);

  const handleEdit = useCallback((budget: Budget) => {
    lightTap();
    setEditingBudget(budget);
    setCategory(budget.category);
    setAmount(budget.allocatedAmount.toString());
    setPeriod(budget.period);
    setRollover(budget.rollover ?? false);
    setModalVisible(true);
  }, []);

  const handleDelete = useCallback((budget: Budget) => {
    Alert.alert(
      t.common.delete.toLowerCase(),
      'are you sure you want to remove this budget?',
      [
        { text: t.common.cancel.toLowerCase(), style: 'cancel' },
        {
          text: t.common.delete.toLowerCase(),
          style: 'destructive',
          onPress: () => {
            mediumTap();
            deleteBudget(budget.id);
            setExpandedId(null);
            showToast('budget deleted', 'success');
          },
        },
      ]
    );
  }, [deleteBudget, showToast]);

  const resetForm = useCallback(() => {
    setAmount('');
    setCategory(expenseCategories[0]?.id || 'food');
    setPeriod('monthly');
    setRollover(false);
    setEditingBudget(null);
  }, [expenseCategories]);

  const closeModal = useCallback(() => {
    bCloseSheet();
  }, [bCloseSheet]);

  const openAddModal = useCallback(() => {
    if (!canCreateBudget(budgets.length)) {
      setPaywallVisible(true);
      return;
    }
    lightTap();
    setModalVisible(true);
  }, [canCreateBudget, budgets.length]);

  // ── Swipeable refs per budget (for closing after action) ──
  const budgetSwipeRefs = useRef<Record<string, React.RefObject<SwipeableMethods | null>>>({}).current;
  const getBudgetSwipeRef = useCallback((id: string) => {
    if (!budgetSwipeRefs[id]) budgetSwipeRefs[id] = React.createRef<SwipeableMethods | null>();
    return budgetSwipeRefs[id];
  }, [budgetSwipeRefs]);

  const toggleExpand = useCallback((id: string) => {
    lightTap();
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // togglePbExpand removed — cards tap-to-open notebook directly

  // ─── Budget row helper ───────────────────────────────────
  const getBudgetMeta = useCallback((budget: Budget & { spentAmount: number }) => {
    const { start, end } = getPeriodInterval(budget.period, now);
    const totalDays = Math.max(differenceInDays(end, start) + 1, 1);
    const elapsed = Math.max(differenceInDays(now, start) + 1, 1);
    const remaining = Math.max(totalDays - elapsed + 1, 1);

    const percentSpent = budget.allocatedAmount > 0 ? budget.spentAmount / budget.allocatedAmount : 0;
    const percentElapsed = elapsed / totalDays;
    const paceRatio = percentElapsed > 0 ? percentSpent / percentElapsed : 0;

    const leftAmount = Math.max(budget.allocatedAmount - budget.spentAmount, 0);
    const dailyBudget = remaining > 0 ? leftAmount / remaining : 0;

    const cat = expenseCategories.find((c) => c.id === budget.category);

    return {
      totalDays,
      elapsed,
      remaining,
      percentSpent,
      percentElapsed,
      paceRatio,
      paceColor: getPaceColor(paceRatio, C),
      paceLabel: getPaceLabel(paceRatio),
      leftAmount,
      dailyBudget,
      cat,
    };
  }, [now, expenseCategories, C]);

  // ─── Smart insight — observes patterns and narrates them ───
  const smartInsight = useMemo(() => {
    if (heroData.overBudgets.length > 0) {
      const worst = [...heroData.overBudgets].sort((a, b) => (b.spentAmount - b.allocatedAmount) - (a.spentAmount - a.allocatedAmount))[0];
      const overBy = worst.spentAmount - worst.allocatedAmount;
      const cat = expenseCategories.find((c) => c.id === worst.category);
      const biggest = transactions
        .filter((tx) => tx.category === worst.category && tx.type === 'expense' && tx.date >= startOfMonth(now))
        .sort((a, b) => b.amount - a.amount)[0];
      return {
        mode: 'over' as const,
        title: `${cat?.name || worst.category} went ${currency} ${overBy.toFixed(0)} past the line`,
        subtitle: biggest && biggest.description
          ? `biggest single hit was ${currency} ${biggest.amount.toFixed(0)} on "${biggest.description}". unusual, or a pattern building?`
          : biggest
          ? `biggest single hit was ${currency} ${biggest.amount.toFixed(0)}. want echo to walk through what pushed it past?`
          : `want echo to scan what pushed it past the line?`,
      };
    }
    const close = budgetsWithSpent.filter((b) => {
      const pct = b.allocatedAmount > 0 ? b.spentAmount / b.allocatedAmount : 0;
      return pct >= 0.85 && pct < 1;
    });
    if (close.length > 0) {
      const nearest = close[0];
      const cat = expenseCategories.find((c) => c.id === nearest.category);
      const leftAmt = nearest.allocatedAmount - nearest.spentAmount;
      const dailyLeft = leftAmt / Math.max(heroData.daysRemaining, 1);
      return {
        mode: 'close' as const,
        title: `${cat?.name || nearest.category} is brushing the ceiling`,
        subtitle: `${currency} ${leftAmt.toFixed(0)} left — that's ${currency} ${dailyLeft.toFixed(0)}/day through day ${heroData.daysInMonth}. careful with weekend plans.`,
      };
    }
    if (!heroData.stretchesWholeMonth) {
      return {
        mode: 'tight' as const,
        title: `money runs out on day ${heroData.runsOutOnDay} of ${heroData.daysInMonth}`,
        subtitle: heroData.smartDaily > 0
          ? `burning ${currency} ${heroData.dailyBurn.toFixed(0)}/day. slowing to ${currency} ${heroData.smartDaily.toFixed(0)}/day keeps you through month end.`
          : `burning ${currency} ${heroData.dailyBurn.toFixed(0)}/day. set a budget per category for a sharper daily pace.`,
      };
    }
    const cushion = [...budgetsWithSpent].sort((a, b) => (b.allocatedAmount - b.spentAmount) - (a.allocatedAmount - a.spentAmount))[0];
    if (cushion && cushion.allocatedAmount - cushion.spentAmount > 0) {
      const cat = expenseCategories.find((c) => c.id === cushion.category);
      const left = cushion.allocatedAmount - cushion.spentAmount;
      return {
        mode: 'healthy' as const,
        title: `you're on pace through day ${heroData.daysInMonth}`,
        subtitle: `${cat?.name || cushion.category} has ${currency} ${left.toFixed(0)} unused — a cushion if anything else runs hot.`,
      };
    }
    return {
      mode: 'empty' as const,
      title: `add a budget to unlock coaching`,
      subtitle: `echo works best when there's something to measure against. start with your biggest category.`,
    };
  }, [heroData, budgetsWithSpent, transactions, expenseCategories, now, currency]);

  // ─── Psychology-driven chip pool (Gollwitzer, Thaler, Hershfield, MI) ───
  // STING: loss aversion, regret, mental accounting — reflective framing
  // SPARK: future self, identity, values — aspirational framing
  // PLAN:  implementation intentions, habit stacking — actionable framing
  const suggestedPrompts = useMemo(() => {
    const state: 'over' | 'tight' | 'healthy' = heroData.alreadyOver
      ? 'over'
      : !heroData.stretchesWholeMonth
      ? 'tight'
      : 'healthy';

    // Context injection — user's actual worst category, name-qualified
    const topOver = [...budgetsWithSpent].sort((a, b) => (b.spentAmount - b.allocatedAmount) - (a.spentAmount - a.allocatedAmount))[0];
    const topCatName = (expenseCategories.find((c) => c.id === topOver?.category)?.name || topOver?.category || 'spending').toLowerCase();
    const overBy = heroData.totalOverBy;
    const deficit = Math.max((heroData.dailyBurn - heroData.smartDaily) * heroData.daysRemaining, 100);

    type Bucket = 'sting' | 'spark' | 'plan';
    type ChipDef = { bucket: Bucket; states: ('over' | 'tight' | 'healthy')[]; build: () => { label: string; question: string } };

    const POOL: ChipDef[] = [
      // ── STING ── loss aversion / regret / mental accounting
      { bucket: 'sting', states: ['over', 'tight', 'healthy'], build: () => ({
        label: `what leaks away by year end?`,
        question: `If I keep my current pace on ${topCatName}, roughly how much will have slipped by the end of the year? Give me the actual number and one concrete thing it could have gone toward (a trip, an emergency cushion, etc.).`,
      })},
      { bucket: 'sting', states: ['over', 'tight'], build: () => ({
        label: `which ringgit would sting most?`,
        question: `Scan my recent expenses. Which specific ringgit I spent this week would hurt the most if I had to pay it again tomorrow? Help me feel the weight of it.`,
      })},
      { bucket: 'sting', states: ['over', 'healthy'], build: () => ({
        label: `is ${topCatName} from fun money or future money?`,
        question: `I spent the most on ${topCatName} this month. Help me reframe: is that category genuinely fun-money (joy I'd repeat) or future-money (money that should have grown)? Use my actual transactions to show it.`,
      })},
      { bucket: 'sting', states: ['tight', 'healthy'], build: () => ({
        label: `if ${topCatName} had its own jar?`,
        question: `If my ${topCatName} budget was a physical jar with exactly RM in it, and I had to hand over the cash for each transaction — which ones would I have paused on? Walk me through them honestly.`,
      })},
      { bucket: 'sting', states: ['over'], build: () => ({
        label: `what would i undo this month?`,
        question: `Looking at my transactions this month, if I could undo just ONE purchase, which one would I pick and why? Reason out loud — this is self-reflection, not shame.`,
      })},

      // ── SPARK ── future self / identity / values
      { bucket: 'spark', states: ['over', 'tight', 'healthy'], build: () => ({
        label: `what would future me thank me for?`,
        question: `Imagine 40-year-old me looking at this month's spending. What would they quietly thank me for? What would they wish I'd done differently? Be specific with my actual numbers.`,
      })},
      { bucket: 'spark', states: ['healthy', 'tight'], build: () => ({
        label: `am i becoming a saver?`,
        question: `Am I currently acting like a person who saves, or a person who's just surviving month to month? Look at my recent patterns and tell me honestly which identity my money habits are building.`,
      })},
      { bucket: 'spark', states: ['healthy'], build: () => ({
        label: `what does 'enough' look like?`,
        question: `What does "enough" actually look like for me this month? Given my budgets and values, help me define a number and a feeling — not a finish line that keeps moving.`,
      })},
      { bucket: 'spark', states: ['over', 'tight'], build: () => ({
        label: `what am i spending TO feel?`,
        question: `When I spent the most this month, what emotion was I probably feeling — stressed, celebrating, bored, lonely? Cross-reference timestamps with the transactions and give me your best read.`,
      })},
      { bucket: 'spark', states: ['over', 'tight', 'healthy'], build: () => ({
        label: `what if family wasn't watching?`,
        question: `If nobody — family, friends, colleagues — could see my spending, what would I actually spend on? And what does that tell me about where face-saving is costing me money?`,
      })},

      // ── PLAN ── implementation intentions / habit stacking
      { bucket: 'plan', states: ['over', 'tight', 'healthy'], build: () => ({
        label: `when payday hits, what's my first move?`,
        question: `Give me a concrete if-then plan for payday: "When salary arrives, the first RM X I'll move before I spend is..." Use my real numbers and goals to fill it in. One sentence, unmissable.`,
      })},
      { bucket: 'plan', states: ['over', 'tight'], build: () => ({
        label: `'jom makan' midweek — what's the plan?`,
        question: `Build me a mamak/jom-makan implementation intention for weekdays when I'm tired and someone suggests eating out. "When X happens, I will Y." Keep it realistic — I'm Malaysian, not going to never eat out.`,
      })},
      { bucket: 'plan', states: ['over', 'tight', 'healthy'], build: () => ({
        label: `Shopee after 10pm — what instead?`,
        question: `Build me a concrete if-then plan for late-night Shopee/Lazada scrolling. "If I open the app after 10pm, I will..." — replacement behavior, not just willpower.`,
      })},
      { bucket: 'plan', states: ['healthy', 'tight'], build: () => ({
        label: `smallest win this week?`,
        question: `What's the tiniest possible money win I can lock in this week? Something I'd be almost embarrassed NOT to achieve. Give me one, with the exact trigger and action.`,
      })},
      { bucket: 'plan', states: ['over', 'tight'], build: () => ({
        label: `where's ${currency} ${Math.max(deficit, overBy, 50).toFixed(0)} to cut?`,
        question: `I need to trim ${currency} ${Math.max(deficit, overBy, 50).toFixed(0)} this month. Point to the 2-3 easiest cuts with specific Malaysian swaps (mamak → masak sendiri, Grab → LRT, Shopee → wait 48h). Be numbers-specific, not preachy.`,
      })},
      { bucket: 'plan', states: ['healthy'], build: () => ({
        label: `stack a habit on morning kopi?`,
        question: `Stack a tiny money-check habit onto something I already do every morning (like kopi, shower, phone unlock). What's the smallest, stickiest one you can design for me? Keep it under 30 seconds.`,
      })},
      { bucket: 'plan', states: ['over', 'tight', 'healthy'], build: () => ({
        label: `forecast month end — honestly`,
        question: `Forecast where each of my categories will land on the last day of the month — under, on, or over. Use real pace math, be blunt, and explain the one category I should watch hardest this week.`,
      })},
    ];

    // Daily rotation seed — same chips all day, fresh tomorrow; state break changes immediately
    const dayKey = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const stateOffset = state === 'over' ? 7 : state === 'tight' ? 13 : 19;
    const seed = dayKey + stateOffset + chipRotation * 3;

    const pickFrom = (bucket: Bucket, extraOffset: number) => {
      const candidates = POOL.filter((c) => c.bucket === bucket && c.states.includes(state));
      if (candidates.length === 0) return null;
      const idx = (seed + extraOffset) % candidates.length;
      return candidates[idx].build();
    };

    const chips = [
      pickFrom('sting', 0),
      pickFrom('spark', 1),
      pickFrom('plan', 2),
    ].filter((c): c is { label: string; question: string } => c !== null);

    return chips;
  }, [heroData, budgetsWithSpent, expenseCategories, currency, chipRotation]);

  // ─── Upcoming bills this week (next 7 days) ───
  const upcomingBillsThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysOut = new Date(today);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const bills = subscriptions
      .filter((s) => s.isActive && !s.isPaused)
      .map((s) => ({
        ...s,
        nextDate: s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate),
      }))
      .filter((s) => s.nextDate >= today && s.nextDate <= sevenDaysOut)
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
    const total = bills.reduce((sum, b) => sum + b.amount, 0);
    return { bills, total, count: bills.length };
  }, [subscriptions]);

  // ─── Top active savings goal (connects budget defense with saving offense) ───
  const topGoal = useMemo(() => {
    const active = goals
      .map((g) => {
        const contributed = (g.contributions || []).reduce((s, c) => s + c.amount, 0);
        const pct = g.targetAmount > 0 ? contributed / g.targetAmount : 0;
        return { goal: g, contributed, pct };
      })
      .filter(({ pct }) => pct < 1);
    if (active.length === 0) return null;
    // Pick the goal with the most recent contribution (or highest pct as tiebreak)
    active.sort((a, b) => {
      const aLatest = Math.max(0, ...(a.goal.contributions || []).map((c) => new Date(c.date).getTime()));
      const bLatest = Math.max(0, ...(b.goal.contributions || []).map((c) => new Date(c.date).getTime()));
      if (aLatest !== bLatest) return bLatest - aLatest;
      return b.pct - a.pct;
    });
    return active[0];
  }, [goals]);

  // ─── Build adaptive budget snapshot for Echo ───
  const buildBudgetSnapshot = useCallback(() => {
    const lines: string[] = [];
    const situation = heroData.alreadyOver
      ? 'OVER_BUDGET'
      : !heroData.stretchesWholeMonth
      ? 'TIGHT'
      : 'HEALTHY';
    lines.push(`[Situation: ${situation}]`);
    lines.push(`Today is day ${heroData.dayOfMonth} of ${heroData.daysInMonth} (${heroData.daysRemaining} days left)`);
    lines.push('');
    lines.push(`--- Money picture ---`);
    if (heroData.totalIncome > 0) {
      lines.push(`Income tracked: ${currency} ${heroData.totalIncome.toFixed(0)}`);
    } else {
      lines.push(`Income: not tracked yet`);
    }
    lines.push(`Total allocated across budgets: ${currency} ${heroData.totalAllocated.toFixed(0)}`);
    lines.push(`Total spent so far: ${currency} ${heroData.totalBudgetSpent.toFixed(0)} (${(heroData.percentSpent * 100).toFixed(0)}% of allocated, day ${heroData.dayOfMonth}/${heroData.daysInMonth})`);
    lines.push(`Daily burn rate: ${currency} ${heroData.dailyBurn.toFixed(0)}/day`);
    if (heroData.smartDaily > 0) {
      lines.push(`Remaining budget pace: ${currency} ${heroData.smartDaily.toFixed(0)}/day would keep me on plan`);
    }
    lines.push('');
    if (heroData.upcomingBillsCount > 0 || heroData.activeGoalCount > 0) {
      lines.push(`--- Commitments ahead ---`);
      if (heroData.upcomingBillsCount > 0) {
        lines.push(`• ${heroData.upcomingBillsCount} upcoming bill${heroData.upcomingBillsCount > 1 ? 's' : ''} totaling ${currency} ${heroData.upcomingBillsTotal.toFixed(0)} due before month end`);
      }
      if (heroData.activeGoalCount > 0) {
        lines.push(`• ${heroData.activeGoalCount} active savings goal${heroData.activeGoalCount > 1 ? 's' : ''} (reserving ~${currency} ${heroData.activeGoalReserve.toFixed(0)}/month)`);
      }
      lines.push('');
    }
    lines.push(`--- Category breakdown (worst first) ---`);
    const sorted = [...budgetsWithSpent].sort((a, b) => {
      const aPct = a.allocatedAmount > 0 ? a.spentAmount / a.allocatedAmount : 0;
      const bPct = b.allocatedAmount > 0 ? b.spentAmount / b.allocatedAmount : 0;
      return bPct - aPct;
    });
    sorted.forEach((b) => {
      const meta = getBudgetMeta(b);
      const pct = (meta.percentSpent * 100).toFixed(0);
      const catName = meta.cat?.name || b.category;
      const leftAmt = b.allocatedAmount - b.spentAmount;
      const statusTag = meta.percentSpent > 1
        ? `OVER by ${currency} ${Math.abs(leftAmt).toFixed(0)}`
        : meta.percentSpent >= 0.85
        ? 'close to limit'
        : meta.percentSpent >= 0.4
        ? 'on track'
        : 'plenty of room';
      lines.push(`• ${catName}: spent ${currency} ${b.spentAmount.toFixed(0)} / ${currency} ${b.allocatedAmount.toFixed(0)} (${pct}%) — ${statusTag}`);
    });
    return lines.join('\n');
  }, [heroData, budgetsWithSpent, currency, getBudgetMeta]);

  const handleAskEcho = useCallback((specificQuestion?: string) => {
    lightTap();
    setEchoSheetVisible(false);
    const snapshot = buildBudgetSnapshot();
    navigation.navigate('MoneyChat', {
      budgetContext: snapshot,
      budgetQuestion: specificQuestion,
    });
    // Rotate chip pool so next view surfaces different questions
    setChipRotation((prev) => prev + 1);
  }, [navigation, buildBudgetSnapshot]);

  // ─── Greeting bubble — pool of variants, one picked fresh on each screen focus ───
  const greetingPool = useMemo((): string[] => {
    if (budgetsWithSpent.length === 0) return [];
    const m = smartInsight.mode;
    const over = heroData.overBudgets.length;
    if (m === 'over') {
      const label = over > 1 ? `${over} categories` : `one category`;
      return [
        `${label} over budget — want a plan?`,
        `${label} went over — let's look at it`,
        `overspent in ${label} — shall we rebalance?`,
        `${label} in the red — want to fix it?`,
      ];
    }
    if (m === 'close') {
      return [
        `one category's brushing its limit`,
        `getting close on a few — check in?`,
        `some budgets are nearly full`,
        `a category's close to the edge`,
      ];
    }
    if (m === 'tight') {
      return [
        `runway's tight — let's slow the burn`,
        `spending's a bit fast — want to review?`,
        `burn rate's high — shall we adjust?`,
        `pace is fast — want to see where?`,
      ];
    }
    return [
      `on pace — want a cushion review?`,
      `looking good this month — any tweaks?`,
      `budget's healthy — want to plan ahead?`,
      `all clear — want to see what's next?`,
    ];
  }, [smartInsight.mode, heroData.overBudgets.length, budgetsWithSpent.length]);

  useFocusEffect(useCallback(() => {
    if (greetingPool.length === 0) return;
    const idx = Math.floor(Math.random() * greetingPool.length);
    setGreetingText(greetingPool[idx]);
    setGreetingDismissed(false);

    const m = smartInsight.mode;
    const over = heroData.overBudgets.length;
    if (m === 'over') {
      const label = over > 1 ? `${over} categories` : `one category`;
      setGreetingChips([
        { label: 'which category is worst?', question: `Which of my budget categories is most overspent right now? Show me the numbers.` },
        { label: `how do I catch up?`, question: `I'm over budget this month in ${label}. Is there a realistic way to recover before month end, or should I adjust my limits?` },
        { label: 'should I reallocate?', question: `Should I move budget from an underspent category to cover the overspent ones? What makes sense for my situation?` },
      ]);
    } else if (m === 'close') {
      setGreetingChips([
        { label: 'which one is closest?', question: `Which budget category is closest to hitting its limit right now? How much runway do I have left?` },
        { label: 'should I slow down?', question: `With some categories close to their limits, should I slow spending now or is there still comfortable room?` },
        { label: 'can I adjust the limit?', question: `Would it make sense to adjust any category budget to give myself more room, or should I hold the line?` },
      ]);
    } else if (m === 'tight') {
      setGreetingChips([
        { label: 'what can I cut today?', question: `What's one thing I can slow down or cut right now to stretch my budget for the rest of the month?` },
        { label: 'how many days left?', question: `At my current burn rate, how many more days can I spend before hitting my limits? Show me the math.` },
        { label: "what's my safe daily limit?", question: `What's a safe daily spending amount for me for the rest of this month given my current budgets?` },
      ]);
    } else {
      setGreetingChips([
        { label: 'where can I save more?', question: `My budget's healthy. Are there any categories where I could save a bit more without really feeling it?` },
        { label: 'am I on pace?', question: `Am I on pace to finish the month under budget? What's my forecast based on current spending?` },
        { label: 'what to do with leftover budget?', question: `If I have leftover budget at month end, what's the smartest thing to do with it?` },
      ]);
    }
  }, [greetingPool, smartInsight.mode, heroData.overBudgets.length]));

  // ─── Playbook data ─────────────────────────────────────────
  const activePlaybooks = useMemo(
    () => playbooks.filter((p) => p.isActive && !p.isClosed),
    [playbooks]
  );
  const closedPlaybooks = useMemo(
    () => playbooks.filter((p) => p.isClosed),
    [playbooks]
  );

  const stalePlaybooks = useMemo(
    () => activePlaybooks.filter((p) => isPlaybookStale(p) && !dismissedNudges.has(p.id)),
    [activePlaybooks, dismissedNudges]
  );

  const playbookStatsMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof computePlaybookStats>> = {};
    for (const pb of [...activePlaybooks, ...closedPlaybooks]) {
      map[pb.id] = computePlaybookStats(pb, transactions);
    }
    return map;
  }, [activePlaybooks, closedPlaybooks, transactions]);

  // ─── Playbook handlers ──────────────────────────────────────
  const resetPlaybookForm = useCallback(() => {
    setPbName('');
    setPbAmount('');
    setEditingPlaybook(null);
  }, []);

  const closePlaybookModal = useCallback(() => {
    setCreatePlaybookVisible(false);
    resetPlaybookForm();
  }, [resetPlaybookForm]);

  const handleCreatePlaybook = useCallback(() => {
    const trimmed = pbName.trim();
    const parsed = parseFloat(pbAmount);
    if (!trimmed || isNaN(parsed) || parsed <= 0) {
      showToast('enter a name and amount', 'error');
      return;
    }

    // Edit mode — update name + allocations
    if (editingPlaybook) {
      mediumTap();
      updatePlaybookAction(editingPlaybook.id, {
        name: trimmed,
      });
      closePlaybookModal();
      showToast('playbook updated', 'success');
      return;
    }

    // Create mode
    if (!canCreatePb()) {
      showToast('close one of your active playbooks first', 'error');
      return;
    }
    mediumTap();
    const id = createPlaybook({
      name: trimmed,
      sourceAmount: parsed,
    });
    if (id) {
      closePlaybookModal();
      showToast('playbook created', 'success');
    } else {
      showToast('you already have 2 active playbooks', 'error');
    }
  }, [pbName, pbAmount, editingPlaybook, canCreatePb, createPlaybook, updatePlaybookAction, closePlaybookModal, showToast]);

  const handleEditPlaybook = useCallback((pb: Playbook) => {
    lightTap();
    setEditingPlaybook(pb);
    setPbName(pb.name);
    setPbAmount(pb.sourceAmount.toString());
    setCreatePlaybookVisible(true);
  }, []);

  const handleClosePlaybook = useCallback((pb: Playbook) => {
    Alert.alert(
      `close "${pb.name}"?`,
      'you can view it later in Past.',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'close',
          onPress: () => {
            const success = closePlaybookAction(pb.id);
            if (success) {
              mediumTap();
              setPlaybookTab('past');
              showToast('playbook closed', 'success');
            } else {
              showToast('delete an old playbook first (free limit: 5)', 'error');
            }
          },
        },
      ]
    );
  }, [closePlaybookAction, showToast]);

  const handleDeletePlaybook = useCallback((pb: Playbook) => {
    Alert.alert(
      `delete "${pb.name}"?`,
      'this cannot be undone. transactions will stay.',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'delete',
          style: 'destructive',
          onPress: () => {
            mediumTap();
            deletePlaybookAction(pb.id);
            showToast('playbook deleted', 'success');
          },
        },
      ]
    );
  }, [deletePlaybookAction, showToast]);

  const handleReopenPlaybook = useCallback((pb: Playbook) => {
    const success = reopenPlaybookAction(pb.id);
    if (success) {
      lightTap();
      setPlaybookTab('active');
      showToast('playbook reopened', 'success');
    } else {
      showToast('you already have 2 active playbooks', 'error');
    }
  }, [reopenPlaybookAction, showToast]);

  // ─── Render ──────────────────────────────────────────────
  const hasBudgets = budgetsWithSpent.length > 0;

  // ─── Header Echo button (only when FAB is hidden) ─
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => hasBudgets && echoHidden ? (
        <TouchableOpacity
          onPress={() => {
            lightTap();
            if (tier !== 'premium') { setEchoPaywallVisible(true); return; }
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
  }, [echoHidden, tier, hasBudgets, navigation, C, setEchoHidden]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.segmentRow}>
            <TouchableOpacity
              style={[styles.segmentChip, viewMode === 'budget' && styles.segmentChipActive]}
              onPress={() => { lightTap(); setViewMode('budget'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, viewMode === 'budget' && styles.segmentTextActive]}>
                {t.budget.regularBudget}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentChip, viewMode === 'playbook' && styles.segmentChipActive]}
              onPress={() => { lightTap(); setViewMode('playbook'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, viewMode === 'playbook' && styles.segmentTextActive]}>
                playbook
              </Text>
            </TouchableOpacity>
          </View>

        {/* ══════════════ BUDGET VIEW ══════════════ */}
        {viewMode === 'budget' && (<>

        {/* ── Hero: Runway narrative + AI daily inline ── */}
        {hasBudgets ? (
          <View style={styles.heroV2}>
            {/* Narrative hero — always visible anchor */}
            <Text style={styles.runwayEyebrow}>
              {heroData.alreadyOver ? 'heads up' : 'at this pace'}
            </Text>
            <Text style={styles.runwayNarrative}>
              {heroData.alreadyOver ? (
                <>
                  you're over in{' '}
                  <Text style={[styles.runwayHighlight, { color: C.bronze }]}>
                    {heroData.overBudgets.length} categor{heroData.overBudgets.length === 1 ? 'y' : 'ies'}
                  </Text>
                  {' by '}
                  <Text style={[styles.runwayHighlight, { color: C.bronze }]}>
                    {currency} {heroData.totalOverBy.toFixed(0)}
                  </Text>
                </>
              ) : heroData.stretchesWholeMonth ? (
                <>
                  you'll stretch to{' '}
                  <Text style={[styles.runwayHighlight, { color: heroData.paceColor }]}>the end of the month</Text>
                  {heroData.runwayOverage > 2 && <Text> with room to spare</Text>}
                </>
              ) : (
                <>
                  money runs out on{' '}
                  <Text style={[styles.runwayHighlight, { color: heroData.paceColor }]}>
                    day {heroData.runsOutOnDay}
                  </Text>
                  <Text> of {heroData.daysInMonth}</Text>
                </>
              )}
            </Text>

            {/* Month bar — single horizontal timeline with two markers */}
            <View style={styles.monthBarWrap}>
              <View style={styles.monthBar}>
                <View
                  style={[
                    styles.monthBarElapsed,
                    { width: `${Math.min(heroData.percentElapsed * 100, 100)}%` },
                  ]}
                />
                {!heroData.stretchesWholeMonth && (
                  <View
                    style={[
                      styles.monthBarRunwayMark,
                      {
                        left: `${Math.min((heroData.runsOutOnDay / heroData.daysInMonth) * 100, 99)}%`,
                        backgroundColor: heroData.paceColor,
                      },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.monthBarTodayMark,
                    { left: `${Math.min((heroData.dayOfMonth / heroData.daysInMonth) * 100, 99)}%` },
                  ]}
                />
              </View>
              <View style={styles.monthBarLabels}>
                <Text style={styles.monthBarLabelText}>day 1</Text>
                <Text style={[styles.monthBarLabelText, { color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.semibold }]}>
                  today — day {heroData.dayOfMonth}
                </Text>
                <Text style={styles.monthBarLabelText}>day {heroData.daysInMonth}</Text>
              </View>
            </View>

            {/* ── Bills this week — awareness strip ── */}
            {upcomingBillsThisWeek.count > 0 && (
              <View style={styles.billsStrip}>
                <View style={styles.billsStripIcon}>
                  <Feather name="calendar" size={13} color={C.bronze} />
                </View>
                <View style={styles.billsStripContent}>
                  <Text style={styles.billsStripTitle}>
                    {upcomingBillsThisWeek.count} bill{upcomingBillsThisWeek.count > 1 ? 's' : ''} this week · {currency} {upcomingBillsThisWeek.total.toFixed(0)}
                  </Text>
                  <Text style={styles.billsStripNames} numberOfLines={1}>
                    {upcomingBillsThisWeek.bills
                      .slice(0, 3)
                      .map((b) => `${b.name} ${currency}${b.amount.toFixed(0)}`)
                      .join('  ·  ')}
                    {upcomingBillsThisWeek.bills.length > 3 ? '  ·  …' : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* ── Top savings goal — aspirational offense beneath defensive budget ── */}
            {topGoal && (
              <TouchableOpacity
                style={styles.goalStrip}
                onPress={() => { lightTap(); navigation.navigate('Goals'); }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Open ${topGoal.goal.name} goal`}
              >
                <View style={styles.goalStripIcon}>
                  <Feather name="target" size={12} color={C.accent} />
                </View>
                <View style={styles.goalStripContent}>
                  <View style={styles.goalStripHeader}>
                    <Text style={styles.goalStripName} numberOfLines={1}>
                      {topGoal.goal.name}
                    </Text>
                    <Text style={styles.goalStripAmount}>
                      {currency} {topGoal.contributed.toFixed(0)} / {topGoal.goal.targetAmount.toFixed(0)}
                    </Text>
                  </View>
                  <View style={styles.goalStripBarTrack}>
                    <View style={[styles.goalStripBarFill, { width: `${Math.min(topGoal.pct * 100, 100)}%` }]} />
                  </View>
                </View>
                <Feather name="chevron-right" size={14} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* ── Over-limit banner (free tier) ── */}
        {tier === 'free' && budgets.length > FREE_TIER.maxBudgets && (
          <View style={styles.bannerCard}>
            <Feather name="info" size={16} color={C.bronze} />
            <Text style={styles.bannerText}>
              you have {budgets.length} budgets (free limit: {FREE_TIER.maxBudgets}).{' '}
              <Text
                style={styles.bannerLink}
                onPress={() => setPaywallVisible(true)}
              >
                upgrade to add more.
              </Text>
            </Text>
          </View>
        )}

        {/* ── Quick actions (Wallet-style outline buttons) ── */}
        {hasBudgets && (
          <View style={styles.actionsRowV2}>
            <TouchableOpacity
              style={styles.actionBtnV2}
              onPress={openAddModal}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.budget.addBudget}
            >
              <Feather name="plus" size={16} color={C.accent} />
              <Text style={styles.actionBtnV2Label}>add budget</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtnV2}
              onPress={() => { lightTap(); setViewMode('playbook'); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="playbooks"
            >
              <Feather name="book-open" size={16} color={C.accent} />
              <Text style={styles.actionBtnV2Label}>playbooks</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Budget groups by status (Wallet-style grouped sections) ── */}
        {hasBudgets ? (() => {
          const urgent: typeof budgetsWithSpent = [];
          const track: typeof budgetsWithSpent = [];
          const plenty: typeof budgetsWithSpent = [];
          budgetsWithSpent.forEach((b) => {
            const meta = getBudgetMeta(b);
            const status = classifyBudget(meta.percentSpent, meta.paceRatio);
            if (status === 'urgent') urgent.push(b);
            else if (status === 'track') track.push(b);
            else plenty.push(b);
          });

          const renderBudgetRowV2 = (budget: typeof budgetsWithSpent[0], isLast: boolean) => {
            const meta = getBudgetMeta(budget);
            const percentage = meta.percentSpent * 100;
            const tickPercent = Math.min(meta.percentElapsed * 100, 100);
            const leftAmount = Math.max(budget.allocatedAmount - budget.spentAmount, 0);
            const catColor = meta.cat?.color || C.accent;
            const perDaySpend = meta.elapsed > 0 ? budget.spentAmount / meta.elapsed : 0;
            const perCategoryRunway = perDaySpend > 0
              ? Math.floor(leftAmount / perDaySpend)
              : meta.remaining;
            const willStretch = perCategoryRunway >= meta.remaining;

            const renderRightActions = (
              _prog: SharedValue<number>,
              drag: SharedValue<number>,
              swipeable: SwipeableMethods,
            ) => (
              <BudgetSwipeAction
                variant="edit"
                direction="right"
                drag={drag}
                label="edit"
                styles={styles}
                onTap={() => { swipeable.close(); handleEdit(budget); }}
                onHardSwipe={() => { swipeable.close(); handleEdit(budget); }}
              />
            );

            const renderLeftActions = (
              _prog: SharedValue<number>,
              drag: SharedValue<number>,
              swipeable: SwipeableMethods,
            ) => (
              <BudgetSwipeAction
                variant="delete"
                direction="left"
                drag={drag}
                label="delete"
                styles={styles}
                onTap={() => { handleDelete(budget); }}
                onHardSwipe={() => { handleDelete(budget); }}
              />
            );

            return (
              <View key={budget.id}>
                <ReanimatedSwipeable
                  ref={getBudgetSwipeRef(budget.id)}
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
                >
                  <Pressable
                    onLongPress={() => {
                      mediumTap();
                      Alert.alert(meta.cat?.name || budget.category, undefined, [
                        { text: t.common.edit, onPress: () => handleEdit(budget) },
                        { text: t.common.delete, style: 'destructive', onPress: () => handleDelete(budget) },
                        { text: t.common.cancel, style: 'cancel' },
                      ]);
                    }}
                    delayLongPress={350}
                    style={({ pressed }) => [styles.editorialRow, pressed && { opacity: 0.6 }]}
                  >
                    {/* Eyebrow — category name + tiny color dot */}
                    <View style={styles.editorialEyebrow}>
                      <View style={[styles.editorialDot, { backgroundColor: catColor }]} />
                      <Text style={styles.editorialCategoryName} numberOfLines={1}>
                        {meta.cat?.name || budget.category}
                      </Text>
                      <Text style={[styles.editorialPercent, { color: meta.paceColor }]}>
                        {percentage.toFixed(0)}%
                      </Text>
                    </View>

                    {/* Main line — spent, "of", allocated — newspaper-style */}
                    <Text style={styles.editorialMainLine}>
                      <Text style={styles.editorialSpent}>
                        {currency} {budget.spentAmount.toFixed(0)}
                      </Text>
                      <Text style={styles.editorialOfLabel}> of </Text>
                      <Text style={styles.editorialAllocated}>
                        {currency} {budget.allocatedAmount.toFixed(0)}
                      </Text>
                    </Text>

                    {/* Ultra-thin hairline progress with tick */}
                    <View style={styles.editorialBar}>
                      <View
                        style={[
                          styles.editorialBarFill,
                          {
                            width: `${Math.min(percentage, 100)}%`,
                            backgroundColor: meta.paceColor,
                          },
                        ]}
                      />
                      <View style={[styles.editorialBarTick, { left: `${tickPercent}%` }]} />
                    </View>

                    {/* Tight meta line — just the essentials */}
                    <Text style={styles.editorialCaption}>
                      {meta.percentSpent > 1
                        ? `over by ${currency} ${(budget.spentAmount - budget.allocatedAmount).toFixed(0)}`
                        : willStretch
                        ? `${currency} ${leftAmount.toFixed(0)} left · ${meta.remaining}d`
                        : `${currency} ${leftAmount.toFixed(0)} left · ${perCategoryRunway}d at this pace`}
                    </Text>

                    {budget.rollover && budget.rolloverAmount != null && budget.rolloverAmount !== 0 && (
                      <Text style={styles.editorialRollover}>
                        {budget.rolloverAmount > 0
                          ? `+${currency} ${budget.rolloverAmount.toFixed(0)} carried`
                          : `−${currency} ${Math.abs(budget.rolloverAmount).toFixed(0)} debt`}
                      </Text>
                    )}
                  </Pressable>
                </ReanimatedSwipeable>
                {!isLast && <View style={styles.editorialHairline} />}
              </View>
            );
          };

          const renderSection = (
            label: string,
            icon: keyof typeof Feather.glyphMap,
            color: string,
            list: typeof budgetsWithSpent,
          ) => {
            if (list.length === 0) return null;
            return (
              <View style={styles.sectionV2}>
                <View style={styles.sectionHeaderV2}>
                  <View style={[styles.sectionIconDot, { backgroundColor: color }]} />
                  <Feather name={icon} size={13} color={C.textSecondary} />
                  <Text style={styles.sectionTitleV2}>{label}</Text>
                  <Text style={styles.sectionCountV2}>{list.length}</Text>
                </View>
                {list.map((b, i) => renderBudgetRowV2(b, i === list.length - 1))}
              </View>
            );
          };

          return (
            <View style={styles.budgetGroupsWrap}>
              {renderSection(t.budget.needsAttention, 'alert-circle', C.gold, urgent)}
              {renderSection(t.budget.onTrackSection, 'check-circle', C.accent, track)}
              {renderSection(t.budget.plentyOfRoom, 'circle', C.bronze, plenty)}
            </View>
          );
        })() : (
          /* ── Empty state ── */
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Feather name="pie-chart" size={48} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t.budget.noBudgets}</Text>
            <Text style={styles.emptyMessage}>
              {t.budget.setBudget}
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={openAddModal}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={18} color={C.onAccent} />
              <Text style={styles.emptyButtonText}>{t.budget.addBudget.toLowerCase()}</Text>
            </TouchableOpacity>
          </View>
        )}

        </>)}

        {/* ══════════════ PLAYBOOK VIEW ══════════════ */}
        {viewMode === 'playbook' && (<>

          {/* Active / Past tabs */}
          <View style={styles.pbTabRow}>
            <TouchableOpacity
              style={[styles.pbTab, playbookTab === 'active' && styles.pbTabActive]}
              onPress={() => { lightTap(); setPlaybookTab('active'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pbTabText, playbookTab === 'active' && styles.pbTabTextActive]}>
                active ({activePlaybooks.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pbTab, playbookTab === 'past' && styles.pbTabActive]}
              onPress={() => { lightTap(); setPlaybookTab('past'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pbTabText, playbookTab === 'past' && styles.pbTabTextActive]}>
                past ({closedPlaybooks.length}{tier === 'free' ? `/${FREE_TIER.maxSavedPlaybooks}` : ''})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Stale playbook nudge */}
          {playbookTab === 'active' && stalePlaybooks.map((pb) => (
            <View key={`stale-${pb.id}`} style={styles.nudgeCard}>
              <Text style={styles.nudgeText}>
                "{pb.name}" has been open {playbookStatsMap[pb.id]?.daysActive || 0} days
              </Text>
              <Text style={styles.nudgeSubtext}>ready to close and see the summary?</Text>
              <View style={styles.nudgeActions}>
                <TouchableOpacity
                  style={styles.nudgeButton}
                  onPress={() => handleClosePlaybook(pb)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.nudgeButtonText}>close & review</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDismissedNudges((prev) => new Set(prev).add(pb.id))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.nudgeDismissText}>keep open</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* ── Active tab ── */}
          {playbookTab === 'active' && (<>
            {activePlaybooks.length > 0 ? (
              <View style={styles.groupCard}>
                {activePlaybooks.map((pb, index) => {
                  const stats = playbookStatsMap[pb.id];
                  if (!stats) return null;
                  const over = isOverspent(pb, stats);
                  const overAmount = getOverspentAmount(pb, stats);
                  const rawRemaining = pb.sourceAmount - stats.totalSpent;
                  const isLast = index === activePlaybooks.length - 1;
                  const percentage = stats.percentSpent;
                  const paceColor = over ? C.neutral : C.accent;

                  return (
                    <View key={pb.id}>
                      <Pressable
                        onPress={() => { lightTap(); setNotebookPb(pb); }}
                        onLongPress={() => {
                          mediumTap();
                          Alert.alert(pb.name, undefined, [
                            { text: 'Edit', onPress: () => handleEditPlaybook(pb) },
                            { text: 'Close Playbook', style: 'destructive', onPress: () => handleClosePlaybook(pb) },
                            { text: 'Delete', style: 'destructive', onPress: () => handleDeletePlaybook(pb) },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        }}
                        style={({ pressed }) => [styles.budgetRow, pressed && { opacity: 0.7 }]}
                      >
                        {/* Icon */}
                        <View
                          style={[styles.iconCircle, { backgroundColor: withAlpha(C.accent, 0.08) }]}
                        >
                          <Feather name="book-open" size={18} color={C.accent} />
                        </View>

                        {/* Content */}
                        <View style={styles.budgetContent}>
                          <View style={styles.budgetNameRow}>
                            <Text style={styles.budgetName} numberOfLines={1}>{pb.name}</Text>
                            <Text style={styles.budgetAmounts}>
                              <Text style={{ fontWeight: TYPOGRAPHY.weight.semibold }}>
                                {currency} {stats.totalSpent.toFixed(0)}
                              </Text>
                              {' / '}
                              {pb.sourceAmount.toFixed(0)}
                            </Text>
                          </View>

                          {/* Progress bar */}
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  width: `${Math.min(percentage, 100)}%`,
                                  backgroundColor: paceColor,
                                },
                              ]}
                            />
                          </View>

                          {/* Pace row */}
                          <View style={styles.paceRow}>
                            <Text style={styles.paceText}>
                              {stats.linkedTransactionCount} txns
                              {'  ·  '}
                              ~{currency} {stats.dailyBurnRate.toFixed(0)}/day
                              {'  ·  '}
                              <Text style={{ color: paceColor }}>
                                {over
                                  ? `${currency} ${overAmount.toFixed(0)} over`
                                  : stats.daysUntilEmpty != null ? `~${stats.daysUntilEmpty}d left` : `${currency} ${rawRemaining.toFixed(0)} left`}
                              </Text>
                            </Text>
                            <Text style={[styles.percentLabel, { color: paceColor }]}>
                              {percentage.toFixed(0)}%
                            </Text>
                          </View>
                        </View>

                        <Feather name="chevron-right" size={16} color={withAlpha(C.accent, 0.4)} />
                      </Pressable>

                      {!isLast && <View style={styles.divider} />}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="book-open" size={48} color={C.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>no active playbooks</Text>
                <Text style={styles.emptyMessage}>
                  create one when income arrives to track where every ringgit goes
                </Text>
              </View>
            )}
          </>)}

          {/* ── Past tab ── */}
          {playbookTab === 'past' && (<>
            {closedPlaybooks.length > 0 ? (
              <View style={styles.groupCard}>
                {closedPlaybooks.map((pb, index) => {
                  const stats = playbookStatsMap[pb.id];
                  if (!stats) return null;
                  const startStr = format(pb.startDate instanceof Date ? pb.startDate : new Date(pb.startDate), 'MMM d');
                  const endStr = pb.endDate ? format(pb.endDate instanceof Date ? pb.endDate : new Date(pb.endDate), 'MMM d') : '—';
                  const isLast = index === closedPlaybooks.length - 1;

                  return (
                    <View key={pb.id}>
                      <Pressable
                        onPress={() => { lightTap(); setNotebookPb(pb); }}
                        onLongPress={() => {
                          mediumTap();
                          Alert.alert(pb.name, undefined, [
                            { text: 'Reopen', onPress: () => handleReopenPlaybook(pb) },
                            { text: 'Delete', style: 'destructive', onPress: () => handleDeletePlaybook(pb) },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        }}
                        style={({ pressed }) => [styles.budgetRow, pressed && { opacity: 0.7 }]}
                      >
                        {/* Icon */}
                        <View
                          style={[styles.iconCircle, { backgroundColor: withAlpha(C.neutral, 0.08) }]}
                        >
                          <Feather name="book-open" size={18} color={C.neutral} />
                        </View>

                        {/* Content */}
                        <View style={styles.budgetContent}>
                          <View style={styles.budgetNameRow}>
                            <Text style={[styles.budgetName, { color: C.textSecondary }]} numberOfLines={1}>{pb.name}</Text>
                            <Text style={styles.budgetAmounts}>
                              <Text style={{ fontWeight: TYPOGRAPHY.weight.semibold }}>
                                {stats.totalSpent.toFixed(0)}
                              </Text>
                              {' / '}
                              {pb.sourceAmount.toFixed(0)}
                            </Text>
                          </View>

                          {/* Progress bar */}
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  width: `${Math.min(stats.percentSpent, 100)}%`,
                                  backgroundColor: C.neutral,
                                },
                              ]}
                            />
                          </View>

                          {/* Stats row */}
                          <View style={styles.paceRow}>
                            <Text style={styles.paceText}>
                              {startStr} – {endStr}
                              {'  ·  '}
                              {stats.daysActive} days
                              {'  ·  '}
                              {stats.linkedTransactionCount} txns
                            </Text>
                            <Text style={[styles.percentLabel, { color: C.neutral }]}>
                              {stats.percentSpent.toFixed(0)}%
                            </Text>
                          </View>
                        </View>

                        <Feather name="chevron-right" size={16} color={withAlpha(C.neutral, 0.4)} />
                      </Pressable>

                      {!isLast && <View style={styles.divider} />}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>no past playbooks</Text>
                <Text style={styles.emptyMessage}>
                  closed playbooks will appear here
                </Text>
              </View>
            )}

            {/* Free tier counter */}
            {tier === 'free' && closedPlaybooks.length > 0 && (
              <Text style={styles.pbTierCounter}>
                {closedPlaybooks.length}/{FREE_TIER.maxSavedPlaybooks} saved playbooks (free tier)
              </Text>
            )}
          </>)}

        </>)}

      </ScrollView>

      {/* ── FAB ── */}
      {viewMode === 'budget' && hasBudgets && !modalVisible && (
        <TouchableOpacity
          style={[styles.fab, { bottom: Math.max(insets.bottom, SPACING.lg) + SPACING.md }]}
          onPress={openAddModal}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={24} color={C.onAccent} />
        </TouchableOpacity>
      )}

      {/* ── Add / Edit Budget — bottom-sheet (drag-to-dismiss, animated backdrop) ─── */}
      {modalVisible && (<Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={bCloseSheet}>
        <Reanimated.View style={[styles.modalBackdrop, bBackdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={bCloseSheet} />
        </Reanimated.View>

        <Reanimated.View style={[styles.modalSheetContainer, bSheetAnimatedStyle]}>
          <GestureDetector gesture={bSheetGesture}>
            <View collapsable={false}>
              <View style={styles.modalHandleRow}>
                <View style={styles.modalHandle} />
              </View>
              <View style={styles.modalTitleZone}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {editingBudget ? 'edit ' : 'add '}
                  <Text style={styles.modalTitleAccent}>
                    {editingBudget
                      ? (expenseCategories.find((c) => c.id === editingBudget.category)?.name?.toLowerCase() || 'budget')
                      : 'budget'}
                  </Text>
                </Text>
                <Text style={styles.modalSubtitle}>
                  {editingBudget ? 'update your spending limit' : 'set a monthly spending limit'}
                </Text>
              </View>
            </View>
          </GestureDetector>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={10}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              contentContainerStyle={styles.modalScrollContent}
              keyboardDismissMode="on-drag"
            >
              <View style={styles.modalHeroCard}>
                <Text style={styles.modalFieldLabel}>
                  amount <Text style={styles.modalFieldRequired}>*</Text>
                </Text>
                <View style={styles.modalHeroAmountRow}>
                  <Text style={[styles.modalHeroCurrency, { color: C.accent }]}>{currency}</Text>
                  <TextInput
                    style={[styles.modalHeroAmountInput, { color: C.accent }]}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    selectTextOnFocus
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                    accessibilityLabel="budget amount"
                  />
                </View>
              </View>

              <View style={styles.modalDivider} />

              <View style={styles.modalFieldCard}>
                <Text style={styles.modalFieldLabel}>{t.budget.category.toLowerCase()}</Text>
                <CategoryPicker
                  categories={expenseCategories}
                  selectedId={category}
                  onSelect={setCategory}
                  layout="dropdown"
                />
              </View>

              <View style={styles.modalFieldCard}>
                <Text style={styles.modalFieldLabel}>{t.budget.period.toLowerCase()}</Text>
                <View style={styles.periodRow}>
                  {BUDGET_PERIODS.map((p) => {
                    const isActive = period === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        style={[styles.periodChip, isActive && styles.periodChipActive]}
                        onPress={() => { lightTap(); setPeriod(p.value as typeof period); }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={p.label}
                      >
                        <Text style={[styles.periodChipText, isActive && styles.periodChipTextActive]}>
                          {p.label.toLowerCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.modalFieldCard, styles.rolloverRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalFieldLabelBase}>{t.budget.rollover}</Text>
                  <Text style={styles.modalFieldHint}>
                    carry leftover to next period
                  </Text>
                </View>
                <Switch
                  value={rollover}
                  onValueChange={setRollover}
                  trackColor={{ false: C.border, true: withAlpha(C.accent, 0.3) }}
                  thumbColor={rollover ? C.accent : C.textMuted}
                  accessibilityLabel="rollover leftover budget"
                  accessibilityRole="switch"
                />
              </View>

              {editingBudget && (
                <Pressable
                  style={styles.modalDeleteLink}
                  onPress={() => { bCloseSheet(); setTimeout(() => handleDelete(editingBudget), 200); }}
                  hitSlop={{ top: 14, bottom: 14, left: 18, right: 18 }}
                  accessibilityRole="button"
                  accessibilityLabel="delete budget"
                >
                  {({ pressed }) => (
                    <View style={[styles.modalDeleteLinkInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="trash-2" size={13} color={C.textMuted} />
                      <Text style={styles.modalDeleteLinkText}>delete budget</Text>
                    </View>
                  )}
                </Pressable>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          <View style={[styles.modalSaveZone, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
            <Pressable
              style={({ pressed }) => [
                styles.modalSaveBtn,
                pressed && { opacity: 0.88 },
              ]}
              onPress={handleAdd}
              accessibilityRole="button"
              accessibilityLabel={editingBudget ? 'save changes' : 'add budget'}
            >
              <View style={styles.modalSaveBtnInner}>
                <Feather name="check" size={16} color={C.surface} />
                <Text style={styles.modalSaveBtnText}>
                  {editingBudget ? 'save changes' : 'add budget'}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.modalSecondaryLink}
              onPress={bCloseSheet}
              hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
              accessibilityRole="button"
              accessibilityLabel="close"
            >
              {({ pressed }) => (
                <View style={[styles.modalSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                  <Feather name="x" size={12} color={C.textMuted} />
                  <Text style={styles.modalSecondaryLinkText}>close</Text>
                </View>
              )}
            </Pressable>
          </View>
        </Reanimated.View>
        <ModalToastHost />
      </Modal>)}

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="budget"
        currentUsage={budgets.length}
      />

      {/* Echo paywall (separate so it shows AI upgrade pitch, not budget) */}
      <PaywallModal
        visible={echoPaywallVisible}
        onClose={() => setEchoPaywallVisible(false)}
        feature="ai"
      />

      {/* ── Playbook FAB ── */}
      {viewMode === 'playbook' && playbookTab === 'active' && !createPlaybookVisible && (
        <TouchableOpacity
          style={[styles.fab, { bottom: Math.max(insets.bottom, SPACING.lg) + SPACING.md }]}
          onPress={() => {
            if (!canCreatePb()) {
              showToast('close one of your active playbooks first', 'error');
              return;
            }
            lightTap();
            setCreatePlaybookVisible(true);
          }}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={24} color={C.onAccent} />
        </TouchableOpacity>
      )}

      {/* ── Create / Edit Playbook Modal ── */}
      {createPlaybookVisible && (
        <Modal
          visible={createPlaybookVisible}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={closePlaybookModal}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closePlaybookModal} />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalKAV}
            >
              <View style={[styles.modalCard, { maxHeight: undefined }]} onStartShouldSetResponder={() => true}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {editingPlaybook ? 'edit playbook' : 'create playbook'}
                  </Text>
                  <TouchableOpacity
                    onPress={closePlaybookModal}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={22} color={C.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled scrollEnabled={false}>
                  <Text style={styles.label}>name</Text>
                  <TextInput
                    style={styles.pbInput}
                    value={pbName}
                    onChangeText={setPbName}
                    placeholder="e.g. March Salary"
                    placeholderTextColor={C.textMuted}
                    autoFocus={!editingPlaybook}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />

                  <Text style={styles.label}>amount ({currency})</Text>
                  <View style={[styles.amountRow, editingPlaybook && { opacity: 0.5 }]}>
                    <Text style={styles.currencyPrefix}>{currency}</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={pbAmount}
                      onChangeText={setPbAmount}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      placeholderTextColor={C.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      editable={!editingPlaybook}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                    />
                  </View>
                  {editingPlaybook && (
                    <Text style={styles.pbEditHint}>amount cannot be changed after creation</Text>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.confirmButton, { marginTop: SPACING.lg }]}
                  onPress={handleCreatePlaybook}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmButtonText}>
                    {editingPlaybook ? 'save changes' : 'create playbook'}
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
          <ModalToastHost />
        </Modal>
      )}

      {/* ── Playbook Notebook ── */}
      {notebookPb && (
        <PlaybookNotebook
          playbook={notebookPb}
          readOnly={notebookPb.isClosed}
          onClose={() => { setNotebookPb(null); setNotebookOblExpanded(false); }}
          initialOblExpanded={notebookOblExpanded}
          onNavigate={handleNotebookNavigate}
        />
      )}
      {/* ── Echo FAB + Greeting bubble (draggable, default top-right) ── */}
      {viewMode === 'budget' && hasBudgets && !echoHidden && !modalVisible && !echoSheetVisible && (
        <>
        <RNAnimated.View
          style={[
            styles.echoFabContainer,
            fabSide === 'right'
              ? { right: SPACING.xl, flexDirection: 'row-reverse' }
              : { left: SPACING.xl, flexDirection: 'row' },
            { top: Math.max(insets.top, 20) + 80 },
            { transform: [...echoFabPan.getTranslateTransform(), { scale: fabScale }] },
          ]}
          {...echoFabPanResponder.panHandlers}
        >
          {/* FAB always first in JSX; flexDirection controls visual order */}
          <TouchableOpacity
            style={styles.echoFab}
            onPress={() => {
              lightTap();
              if (tier !== 'premium') { setEchoPaywallVisible(true); return; }
              setEchoAutoPrompt(undefined);
              setEchoSheetVisible(true);
              setGreetingDismissed(true);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open Echo assistant"
          >
            <Feather name="zap" size={22} color={C.onAccent} />
            {tier !== 'premium' && (
              <View style={styles.echoFabLock}>
                <Feather name="lock" size={9} color={C.onAccent} />
              </View>
            )}
            <View style={styles.echoFabPulse} />
          </TouchableOpacity>
          {greetingText && !greetingDismissed && !greetingHiddenDuringDrag && (
            <TouchableOpacity
              style={styles.echoGreetingBubble}
              onPress={() => {
                lightTap();
                if (tier !== 'premium') { setEchoPaywallVisible(true); return; }
                setEchoAutoPrompt(greetingChips[0]?.question || greetingText);
                setEchoSheetVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Echo: ${greetingText}`}
            >
              <View style={styles.echoGreetingDot} />
              <TypewriterText
                text={greetingText}
                style={styles.echoGreetingText}
                speed={28}
                startDelay={140}
              />
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setGreetingDismissed(true); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.echoGreetingDismiss}
                accessibilityRole="button"
                accessibilityLabel="Dismiss greeting"
              >
                <Feather name="x" size={12} color={C.textMuted} />
              </TouchableOpacity>
              <View style={[
                styles.echoGreetingTail,
                fabSide === 'left'
                  ? { left: -6, right: undefined, borderBottomWidth: 1, borderLeftWidth: 1, borderTopWidth: 0, borderRightWidth: 0 }
                  : { right: -6, left: undefined, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 0, borderLeftWidth: 0 },
              ]} />
            </TouchableOpacity>
          )}
        </RNAnimated.View>
        <EchoDragHideZone hideZoneAnim={hideZoneAnim} hideZoneHoverAnim={hideZoneHoverAnim} measureRef={hideZoneRef} />
        </>
      )}

      {/* ── Echo inline chat sheet ── */}
      <EchoInlineChat
        visible={echoSheetVisible}
        onClose={() => setEchoSheetVisible(false)}
        insightTitle={smartInsight.title}
        insightSubtitle={smartInsight.subtitle}
        chips={greetingChips}
        contextSnapshot={buildBudgetSnapshot()}
        topInset={insets.top}
        bottomInset={insets.bottom}
        autoPrompt={echoAutoPrompt}
      />

      <ScreenGuide
        id="guide_budget"
        title={t.guide.spendingLimits}
        icon="sliders"
        description={t.guide.descBudget}
        accent={C.bronze}
      />
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
  },

  // Hero
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    textTransform: 'lowercase',
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: 2,
    fontVariant: ['tabular-nums'] as any,
  },
  heroAmountSub: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
  },
  heroDailyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.md,
    fontVariant: ['tabular-nums'] as any,
  },
  heroBarTrack: {
    height: 6,
    backgroundColor: withAlpha(C.accent, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  heroBarFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  heroPercentText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textAlign: 'right',
  },

  // Banner
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  bannerText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    lineHeight: 20,
  },
  bannerLink: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Grouped card
  groupCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
  },

  // Budget row
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    paddingVertical: SPACING.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    marginTop: 2,
  },
  budgetContent: {
    flex: 1,
  },
  budgetNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  budgetName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flex: 1,
    marginRight: SPACING.sm,
  },
  budgetAmounts: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },

  // Progress bar (thin)
  barTrack: {
    height: 3,
    backgroundColor: withAlpha(C.accent, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  barFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },

  // Pace
  paceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paceText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    flex: 1,
    fontVariant: ['tabular-nums'] as any,
  },
  percentLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    marginLeft: SPACING.sm,
    fontVariant: ['tabular-nums'] as any,
  },

  // Rollover hint on card
  rolloverText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    marginTop: 2,
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 36 + SPACING.md + SPACING.md, // icon width + margins
  },

  // Expanded actions
  expandedActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingLeft: 36 + SPACING.md + SPACING.md,
    gap: SPACING.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: C.background,
  },
  actionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['5xl'],
    paddingHorizontal: SPACING.xl,
  },
  emptyIconCircle: {
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  emptyMessage: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: C.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
  },
  emptyButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },

  // ── Echo FAB + greeting bubble + bottom sheet ──
  echoFabContainer: {
    position: 'absolute',
    alignItems: 'center',
    gap: SPACING.sm,
    zIndex: 999,
    // left/right anchor applied dynamically in JSX based on fabSide
  },
  echoFab: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  echoFabPulse: {
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
  echoFabLock: {
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
    borderColor: C.surface,
  },
  echoGreetingBubble: {
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
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  echoGreetingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.accent,
  },
  echoGreetingText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    lineHeight: 18,
  },
  echoGreetingDismiss: {
    padding: 2,
    marginLeft: SPACING.xs,
  },
  echoGreetingTail: {
    position: 'absolute',
    top: 13,
    width: 12,
    height: 12,
    backgroundColor: C.surface,
    borderColor: withAlpha(C.accent, 0.2),
    transform: [{ rotate: '45deg' }],
  },
  echoSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  echoSheetCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  echoSheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: SPACING.md,
  },
  echoSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  echoSheetHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm + 2,
  },
  echoSheetIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  echoSheetEyebrow: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  echoSheetTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    lineHeight: 22,
  },
  echoSheetSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  echoSheetChips: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  echoSheetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.15),
  },
  echoSheetChipText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    lineHeight: 19,
  },
  echoSheetOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: C.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  echoSheetOpenBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // ─── Add / Edit Budget Modal — matches DebtTracking sheet pattern ───────────
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '92%',
  },
  // Drag-handle visual at top of card (mirrors DebtTracking dDebtSheetTopRow)
  modalHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  // Centered title zone with italic serif accent (mirrors dDebtTitleZone)
  modalTitleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  modalTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  modalSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  modalScrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  // Hero amount card (mirrors dDebtFieldHeroCard)
  modalHeroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  modalHeroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: SPACING.xs,
  },
  modalHeroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
    marginRight: 4,
    letterSpacing: -0.2,
  },
  modalHeroAmountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? -0.6 : -0.8,
    paddingVertical: 0,
  },
  // Quiet hairline divider (mirrors dDebtSheetDivider)
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06),
    marginVertical: SPACING.sm,
  },
  // Generic field card (mirrors dDebtFieldCard)
  modalFieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  // Tiny muted uppercase field label (mirrors dDebtFieldCardLabel)
  modalFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  modalFieldRequired: {
    fontSize: TYPOGRAPHY.size.sm,
    color: '#C1694F',
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  // Normal-weight label used for rollover toggle row
  modalFieldLabelBase: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  modalFieldHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },

  // Period chips — rendered inside modalFieldCard
  periodRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  periodChip: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  periodChipActive: {
    backgroundColor: withAlpha(C.accent, 0.08),
    borderColor: C.accent,
  },
  periodChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  periodChipTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },

  // Rollover row — extends modalFieldCard
  rolloverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Anchored save zone (mirrors dDebtSaveZone)
  modalSaveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  modalSaveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  modalSaveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalSaveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.surface,
    letterSpacing: 0.3,
  },
  // Secondary close text-link (mirrors dDebtSecondaryLink)
  modalSecondaryLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  modalSecondaryLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  modalSecondaryLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  // Delete link in edit mode (mirrors dDebtDeleteLink)
  modalDeleteLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  modalDeleteLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  modalDeleteLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // ─── Playbook modal styles ────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalKAV: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS['2xl'],
    width: '88%',
    maxHeight: '85%',
    overflow: 'hidden',
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
    padding: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.md,
  },
  currencyPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginRight: SPACING.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    paddingVertical: SPACING.md,
    fontVariant: ['tabular-nums'],
  },
  confirmButton: {
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  confirmButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.surface,
  },

  // ─── Segment Toggle ──────────────────────────────────────
  segmentRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  segmentChip: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  segmentChipActive: {
    backgroundColor: withAlpha(C.accent, 0.08),
    borderColor: C.accent,
  },
  segmentText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  segmentTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },

  // ─── Playbook Tabs ────────────────────────────────────────
  pbTabRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  pbTab: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    backgroundColor: C.pillBg,
  },
  pbTabActive: {
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  pbTabText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  pbTabTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },

  // ─── Nudge Card ───────────────────────────────────────────
  nudgeCard: {
    backgroundColor: C.highlight,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  nudgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    marginBottom: 2,
  },
  nudgeSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
  },
  nudgeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  nudgeButton: {
    backgroundColor: C.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  nudgeButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  nudgeDismissText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },

  // ─── Playbook expanded ──────────────────────────────────
  pbExpandedWrap: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  pbNotebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  pbNotebookBtnTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  pbNotebookBtnSub: {
    fontSize: TYPOGRAPHY.size.xs,
    marginTop: 1,
  },
  pbQuickBreakdown: {
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  pbQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pbQuickDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pbQuickLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    flex: 1,
  },
  pbQuickAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  pbQuickMore: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    paddingLeft: 6 + SPACING.sm,
  },

  //
  pbEmptyMessage: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  pbTierCounter: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  // ─── Create Playbook form ─────────────────────────────────
  pbInput: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.inputBorder,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  pbEditHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: SPACING.xs,
  },

  // ─── Transaction modal ────────────────────────────────────
  pbTxModalSummary: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  pbTxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: SPACING.sm,
  },
  pbTxDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    width: 44,
  },
  pbTxInfo: {
    flex: 1,
  },
  pbTxDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  pbTxCat: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  pbTxAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },

  // ═══ V2 Redesign ═══════════════════════════════════════════
  // Hero (Wallet-caliber typography)
  heroV2: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  heroV2Label: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    textTransform: 'lowercase',
  },
  heroV2AmountLine: {
    marginTop: SPACING.xs,
    fontVariant: ['tabular-nums'] as any,
  },
  heroV2Prefix: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  heroV2Int: {
    fontSize: 48,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -1,
  },
  heroV2Sub: {
    marginTop: SPACING.xs,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  heroV2TrackWrap: {
    marginTop: SPACING.lg,
  },
  heroV2Track: {
    height: 8,
    backgroundColor: withAlpha(C.textMuted, 0.12),
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
  },
  heroV2Fill: {
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  heroV2Marker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 14,
    backgroundColor: withAlpha(C.textPrimary, 0.35),
    borderRadius: 1,
    zIndex: 2,
  },
  heroV2TrackMeta: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroV2TrackMetaText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  heroV2PaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  heroV2PaceChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'lowercase',
  },
  heroV2Footer: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroV2FooterText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Quick actions row (Wallet-style outline buttons)
  actionsRowV2: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  actionBtnV2: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionBtnV2Label: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },

  // Budget groups wrapper
  budgetGroupsWrap: {
    gap: SPACING.lg,
  },

  // Section — editorial groupings, no card wrapper
  sectionV2: {
    marginBottom: SPACING.md,
  },
  sectionHeaderV2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  sectionIconDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitleV2: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    flex: 1,
    textTransform: 'lowercase',
  },
  sectionCountV2: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  sectionCardV2: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },

  // Budget row V2
  budgetRowV2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  iconCircleV2: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  budgetContentV2: {
    flex: 1,
    minWidth: 0,
  },
  budgetHeaderRowV2: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  budgetNameV2: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textTransform: 'lowercase',
    flex: 1,
  },
  budgetAmountsV2: {
    fontVariant: ['tabular-nums'] as any,
  },
  budgetSpentV2: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  budgetAllocV2: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
  },
  barTrackV2: {
    height: 6,
    backgroundColor: withAlpha(C.textMuted, 0.12),
    borderRadius: 3,
    marginBottom: SPACING.xs,
    position: 'relative',
    overflow: 'visible',
  },
  barFillV2: {
    height: 6,
    borderRadius: 3,
  },
  budgetMetaRowV2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  budgetMetaTextV2: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    flex: 1,
  },
  budgetPercentV2: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'] as any,
  },
  rolloverTextV2: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontStyle: 'italic',
    marginTop: 4,
  },
  dividerV2: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: SPACING.md,
  },

  // ─── Runway narrative hero ───
  runwayEyebrow: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  runwayNarrative: {
    marginTop: 6,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.5,
  },
  runwayHighlight: {
    fontWeight: TYPOGRAPHY.weight.bold,
  },

  // ─── AI callout nested in hero ───
  aiCallout: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.15),
  },
  aiCalloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  aiCalloutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: withAlpha(C.accent, 0.15),
    borderRadius: RADIUS.full,
  },
  aiCalloutBadgeText: {
    fontSize: 10,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  aiCalloutDailyLine: {
    fontVariant: ['tabular-nums'] as any,
  },
  aiCalloutDailyPrefix: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  aiCalloutDailyInt: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  aiCalloutDailyPerDay: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  aiCalloutReason: {
    marginTop: 4,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    lineHeight: 18,
  },

  // ─── Smart daily inline + Ask Echo CTA ───
  smartDailyInline: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smartDailyInlineText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  smartDailyInlineLabel: {
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  smartDailyInlineAmount: {
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  askEchoBtn: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.lg,
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
  },
  askEchoBtnText: {
    color: C.onAccent,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },

  // ─── Bills this week strip ───
  billsStrip: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: C.bronze,
  },
  billsStripIcon: {
    width: 22,
    alignItems: 'center',
  },
  billsStripContent: {
    flex: 1,
    minWidth: 0,
  },
  billsStripTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  billsStripNames: {
    marginTop: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },

  // ─── Top goal strip ───
  goalStrip: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.md,
  },
  goalStripIcon: {
    width: 22,
    alignItems: 'center',
  },
  goalStripContent: {
    flex: 1,
    minWidth: 0,
  },
  goalStripHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginBottom: 6,
  },
  goalStripName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textTransform: 'lowercase',
    flex: 1,
  },
  goalStripAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  goalStripBarTrack: {
    height: 4,
    backgroundColor: withAlpha(C.textMuted, 0.15),
    borderRadius: 2,
    overflow: 'hidden',
  },
  goalStripBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.accent,
  },

  // ─── Echo CTA (collapsed state) ───
  echoCTA: {
    marginTop: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.22),
  },
  echoCTALeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    flex: 1,
    minWidth: 0,
  },
  echoCTAIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  echoCTATextCol: {
    flex: 1,
    minWidth: 0,
  },
  echoCTATitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    textTransform: 'lowercase',
    letterSpacing: -0.2,
  },
  echoCTASubtitle: {
    marginTop: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  echoCTAArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  livePulseDotBig: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.accent,
  },

  // ─── Echo expanded panel ───
  echoPanel: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
  },
  echoPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  echoPanelTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    lineHeight: 24,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -0.3,
    textTransform: 'lowercase',
  },
  echoPanelSubtitle: {
    marginTop: 4,
    fontSize: TYPOGRAPHY.size.sm,
    lineHeight: 20,
    color: C.textSecondary,
  },
  echoPanelChips: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  echoPanelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    backgroundColor: C.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.25),
    maxWidth: '100%',
  },
  echoPanelChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
    flexShrink: 1,
  },

  // ─── Echo collapsed pill (legacy, unused but kept) ───
  echoCollapsedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.08),
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.22),
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  echoCollapsedText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'lowercase',
  },

  // ─── Echo expanded card ───
  echoExpandedCard: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.05),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.18),
  },
  echoExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  // ─── Echo insight eyebrow + chips ───
  insightEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  insightEyebrowText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  insightTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -0.5,
    textTransform: 'lowercase',
  },
  insightSubtitle: {
    marginTop: 8,
    fontSize: TYPOGRAPHY.size.sm,
    lineHeight: 22,
    color: C.textSecondary,
  },
  promptChipsRow: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    backgroundColor: withAlpha(C.accent, 0.08),
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
    maxWidth: '100%',
  },
  promptChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
    flexShrink: 1,
  },

  // Month timeline bar
  monthBarWrap: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xs,
  },
  monthBar: {
    height: 6,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
  },
  monthBarElapsed: {
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
    position: 'absolute',
    left: 0,
    top: 0,
  },
  monthBarTodayMark: {
    position: 'absolute',
    top: -4,
    width: 3,
    height: 14,
    backgroundColor: C.textPrimary,
    borderRadius: 1.5,
    marginLeft: -1.5,
  },
  monthBarRunwayMark: {
    position: 'absolute',
    top: -7,
    width: 2,
    height: 20,
    borderRadius: 1,
    marginLeft: -1,
    opacity: 0.9,
  },
  monthBarLabels: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthBarLabelText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textTransform: 'lowercase',
  },

  // 3-tile stat strip
  statStrip: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  statTile: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  statTileDivider: {
    width: 1,
    backgroundColor: C.border,
    marginHorizontal: SPACING.sm,
  },
  statTileLabel: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statTileValue: {
    marginTop: 4,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.bold,
    textTransform: 'lowercase',
    fontVariant: ['tabular-nums'] as any,
  },

  // Monarch-style time-of-month tick on budget row progress bars
  barTickV2: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 10,
    backgroundColor: withAlpha(C.textPrimary, 0.45),
    borderRadius: 1,
    marginLeft: -1,
  },

  // Swipe actions (Edit / Delete) — shown when swiping row left
  swipeFill: {
    width: 72,
    alignSelf: 'stretch' as const,
    borderRadius: RADIUS.lg,
    overflow: 'hidden' as const,
  },
  swipeInner: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  swipeEditColor: {
    backgroundColor: C.accent,
  },
  swipeDeleteColor: {
    backgroundColor: C.neutral,
  },

  // ─── Depth Card — the budget row ───
  depthCard: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  depthCardEdge: {
    width: 4,
    alignSelf: 'stretch',
  },
  depthCardInner: {
    flex: 1,
    padding: SPACING.md,
  },
  depthCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  depthCardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    minWidth: 0,
  },
  depthCardIconBg: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depthCardNameCol: {
    flex: 1,
    minWidth: 0,
  },
  depthCardName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textTransform: 'lowercase',
  },
  depthCardBudgetOf: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  depthCardAmountCol: {
    alignItems: 'flex-end',
  },
  depthCardSpentAmount: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: -0.3,
  },
  depthCardPercent: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    marginTop: 2,
    fontVariant: ['tabular-nums'] as any,
  },
  depthCardBarTrack: {
    height: 6,
    backgroundColor: withAlpha(C.textMuted, 0.12),
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
    marginBottom: SPACING.sm,
  },
  depthCardBarFill: {
    height: 6,
    borderRadius: 3,
  },
  depthCardBarTick: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 12,
    backgroundColor: withAlpha(C.textPrimary, 0.5),
    borderRadius: 1,
    marginLeft: -1,
  },
  depthCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  depthCardFooterText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  depthCardFooterEmphasis: {
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  depthCardDailyHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
  },
  depthCardSpacer: {
    height: SPACING.sm,
  },

  // ─── Editorial Row (bordered card, typography-first) ───
  editorialRow: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  editorialEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  editorialDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  editorialCategoryName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  editorialPercent: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'] as any,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  editorialMainLine: {
    marginTop: 2,
    fontVariant: ['tabular-nums'] as any,
  },
  editorialSpent: {
    fontSize: 28,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -0.7,
  },
  editorialOfLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
  },
  editorialAllocated: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  editorialBar: {
    marginTop: SPACING.md,
    height: 2,
    backgroundColor: withAlpha(C.textMuted, 0.15),
    position: 'relative',
    overflow: 'visible',
  },
  editorialBarFill: {
    height: 2,
  },
  editorialBarTick: {
    position: 'absolute',
    top: -3,
    width: 1,
    height: 8,
    backgroundColor: withAlpha(C.textPrimary, 0.55),
    marginLeft: -0.5,
  },
  editorialCaption: {
    marginTop: SPACING.sm,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
  },
  editorialRollover: {
    marginTop: SPACING.xs,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontStyle: 'italic',
  },
  editorialHairline: {
    height: SPACING.sm,
  },
});

export default BudgetPlanning;
