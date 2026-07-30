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
  Switch,
  FlatList,
  Animated as RNAnimated,
  useWindowDimensions,
  AccessibilityInfo,
  AppState,
  InteractionManager,
} from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
  SharedValue,
  FadeIn,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import {
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  startOfYear, endOfYear,
  subMonths, subWeeks, subYears,
  isWithinInterval,
  isSameDay,
  differenceInDays,
  getDaysInMonth,
  getDate,
} from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, BUDGET_PERIODS, SHADOWS, withAlpha, ensureContrastOnDark } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useEchoFabPan } from '../../hooks/useEchoFabPan';
import EchoDragHideZone from '../../components/wallet/EchoDragHideZone';
import { useCategories } from '../../hooks/useCategories';
import { TIER_LIMITS } from '../../constants/premium';
import CategoryPicker from '../../components/common/CategoryPicker';
import CategoryIcon from '../../components/common/CategoryIcon';
import { useNeu } from '../../components/common/neu';
import CircularProgress from '../../components/common/CircularProgress';
import HalfGauge from '../../components/common/HalfGauge';
import PaywallModal from '../../components/common/PaywallModal';
import EmptyState from '../../components/common/EmptyState';
import NeuButton from '../../components/common/NeuButton';
import BudgetPlannerSheet from '../../components/common/BudgetPlannerSheet';
import PullRefresh from '../../components/common/PullRefresh';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremiumStore } from '../../store/premiumStore';
import { useToast } from '../../context/ToastContext';
import { Budget, CategoryOption, Playbook } from '../../types';
import ModalToastHost from '../../components/common/ModalToastHost';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { lightTap, mediumTap } from '../../services/haptics';
import ScreenGuide, { whenStore } from '../../components/common/ScreenGuide';
import EchoInlineChat, { EchoChip } from '../../components/common/EchoInlineChat';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import type { ChatAction } from '../../services/chatActions';
import TypewriterText from '../../components/common/TypewriterText';
import { usePlaybookStore } from '../../store/playbookStore';
import { computePlaybookStats, isOverspent, getOverspentAmount, isPlaybookStale } from '../../utils/playbookStats';
import { getPeriodInterval, computeBudgetRow, computeHeroMoney } from './budgetMath';
import PlaybookNotebook from '../../components/playbook/PlaybookNotebook';
import { format } from 'date-fns';


// ─── Pace helpers ──────────────────────────────────────────
// Pace color resolves against the active palette (light/dark) — pass `C` from
// the component scope so dark mode renders the dark-variant tokens.
// (UX-H5, DESIGN-H1)
// One attention ramp, worst = bronze (matches the over-budget treatment):
// olive (on track) → gold (moving fast) → bronze (hot / over).
const getPaceColor = (paceRatio: number, C: typeof CALM) => {
  if (paceRatio <= 1.1) return C.accent; // olive — on track / ahead
  if (paceRatio <= 1.3) return C.gold;   // gold — moving a bit fast
  return C.bronze; // bronze — hot, same as over-budget
};

// Installment plans that are fully paid off should drop out of "upcoming bills".
// Same predicate as SubscriptionList's isInstallmentComplete — inlined here
// (it isn't exported) rather than reaching across files.
const isInstallmentComplete = (sub: {
  isInstallment?: boolean;
  totalInstallments?: number;
  completedInstallments?: number;
}): boolean =>
  !!(sub.isInstallment && sub.totalInstallments && (sub.completedInstallments || 0) >= sub.totalInstallments);

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

// Playbook ships in v1.2.0. Until then the tab is HIDDEN entirely — no segment,
// no reachable "coming soon" placeholder (App Store 2.1). Flip to false to enable.
const PLAYBOOK_COMING_SOON = true;

// ─── Component ─────────────────────────────────────────────
const BudgetPlanning: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  // "Soft neu dark" tier — Onyx rule 3 lift for the commitments card.
  const neuF = useNeu(undefined, { faintDark: true });
  const insets = useSafeAreaInsets();
  // ScreenGuide spotlight target — the empty-state "add budget" hero pill
  // (present on first visit; the guide falls back to inline points if not).
  const guideTargetRef = useRef<any>(null);
  const { showToast } = useToast();
  const budgets = usePersonalStore((s) => s.budgets);
  const addBudget = usePersonalStore((s) => s.addBudget);
  const updateBudget = usePersonalStore((s) => s.updateBudget);
  const deleteBudget = usePersonalStore((s) => s.deleteBudget);
  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const goals = usePersonalStore((s) => s.goals);
  const currency = useSettingsStore(state => state.currency);
  const echoHidden = useSettingsStore((s) => s.budgetEchoHidden);
  const setEchoHidden = useSettingsStore((s) => s.setBudgetEchoHidden);
  const canCreateBudget = usePremiumStore((s) => s.canCreateBudget);
  const tier = usePremiumStore((s) => s.tier);
  const expenseCategories = useCategories('expense');

  const [modalVisible, setModalVisible] = useState(false);
  const [budgetPlannerVisible, setBudgetPlannerVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [echoPaywallVisible, setEchoPaywallVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [echoSheetVisible, setEchoSheetVisible] = useState(false);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [greetingHiddenDuringDrag, setGreetingHiddenDuringDrag] = useState(false);
  const [greetingText, setGreetingText] = useState('');
  const [greetingChips, setGreetingChips] = useState<EchoChip[]>([]);
  const [echoAutoPrompt, setEchoAutoPrompt] = useState<string | undefined>(undefined);
  const [fabSide, setFabSide] = useState<'left' | 'right'>('right');
  const [chipRotation, setChipRotation] = useState(0);
  // Payday re-tailor nudge — fires once per new income txn (marker id). A ref, not
  // state, so marking it seen doesn't re-render the greeting (no flash) and the
  // greeting effect never re-runs just because the marker changed.
  const INCOME_SEEN_KEY = 'potraces_budget_income_seen';
  const incomeSeenRef = useRef<string | null>(null);

  // ── Once-per-day delight gate ──
  const HERO_ANIM_KEY = 'potraces_budget_hero_last_anim_date';
  const [shouldRunWakeUp, setShouldRunWakeUp] = useState(false);
  const [heroCountDisplay, setHeroCountDisplay] = useState(0);
  const [wakeUpGreeting, setWakeUpGreeting] = useState('');
  const glowOpacity = useSharedValue(0);
  const countUpRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mathSheetVisible, setMathSheetVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
    bSheetY.value = withTiming(SCREEN_H, { duration: 220 }, () => {
      // No `if (finished)` guard — an interrupted animation must still finish-close,
      // otherwise the backdrop stays mounted and blocks all taps (Goals-modal bug).
      runOnJS(bFinishClose)();
    });
    // Fallback in case the worklet callback never fires (animation interrupted).
    setTimeout(() => { if (bClosingRef.current) bFinishClose(); }, 320);
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

  // ── Bottom-sheet animation for Category Detail ──
  // Store only the id — derive the live entity below so spentAmount stays fresh
  // while the sheet is open (avoids a frozen snapshot disagreeing with the rows).
  const [detailBudgetId, setDetailBudgetId] = useState<string | null>(null);
  const dSheetY = useSharedValue(SCREEN_H);
  const dDragStart = useSharedValue(0);
  const dClosingRef = useRef(false);
  // Deferred action after the sheet finishes closing (edit / delete) — avoids modal-on-modal.
  const dPendingActionRef = useRef<null | (() => void)>(null);
  // Id the deferred action targets — re-validated against the store before running.
  const pendingBudgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (detailBudgetId) {
      dClosingRef.current = false;
      dSheetY.value = SCREEN_H;
      dSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [detailBudgetId, SCREEN_H, dSheetY]);

  const dFinishClose = useCallback(() => {
    if (!dClosingRef.current) return;
    dClosingRef.current = false;
    setDetailBudgetId(null);
    const action = dPendingActionRef.current;
    dPendingActionRef.current = null;
    // Re-validate the budget still exists before running the deferred edit/delete —
    // it may have been deleted elsewhere while the sheet was open (phantom id guard).
    if (action) {
      const stillExists = pendingBudgetIdRef.current
        ? usePersonalStore.getState().budgets.some((b) => b.id === pendingBudgetIdRef.current)
        : true;
      pendingBudgetIdRef.current = null;
      if (stillExists) setTimeout(action, 60);
    }
  }, []);

  const dCloseSheet = useCallback((pending?: () => void, pendingBudgetId?: string) => {
    if (dClosingRef.current) return;
    dClosingRef.current = true;
    if (pending) dPendingActionRef.current = pending;
    pendingBudgetIdRef.current = pendingBudgetId ?? null;
    dSheetY.value = withTiming(SCREEN_H, { duration: 220 }, () => {
      // No `if (finished)` guard — an interrupted animation must still finish-close,
      // otherwise the backdrop stays mounted and blocks all taps (Goals-modal bug).
      runOnJS(dFinishClose)();
    });
    // Fallback in case the worklet callback never fires (animation interrupted).
    setTimeout(() => { if (dClosingRef.current) dFinishClose(); }, 320);
  }, [dSheetY, dFinishClose]);

  const dSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dDragStart.value = dSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          dSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(dCloseSheet)();
          } else {
            dSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    [dCloseSheet]
  );

  const dSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dSheetY.value }],
  }));
  const dBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  const openBudgetDetail = useCallback((budget: Budget & { spentAmount: number }) => {
    lightTap();
    setDetailBudgetId(budget.id);
  }, []);

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

  // Header Echo zap consolidated into a single useLayoutEffect below (after
  // `hasBudgets`/`tier` are computed) — two competing effects were fighting over
  // navigation.setOptions({ headerRight }).

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

  // ── Day-refreshing clock ──
  // Period windows / day counts must roll over without an app restart. `now` is
  // state, but the ref only changes when the calendar day actually changes, so
  // the heavy budget/hero memos below don't re-run on every focus/foreground.
  const [now, setNow] = useState(() => new Date());
  const refreshClock = useCallback(() => {
    setNow((prev) => { const next = new Date(); return isSameDay(prev, next) ? prev : next; });
  }, []);
  useFocusEffect(useCallback(() => { refreshClock(); }, [refreshClock]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshClock(); });
    return () => sub.remove();
  }, [refreshClock]);

  // Pull-to-refresh — synced Zustand stores re-render on their own; roll the
  // day-clock forward and hold the spinner briefly so the pull reads as a load.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshClock();
    setTimeout(() => setRefreshing(false), 600);
  }, [refreshClock]);

  // ── Reduce-motion check ──
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  // Cleanup count-up interval on unmount
  useEffect(() => {
    return () => {
      if (countUpRef.current) clearInterval(countUpRef.current);
    };
  }, []);

  // ── Once-per-day wake-up gate ──
  useEffect(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    AsyncStorage.getItem(HERO_ANIM_KEY).then((stored) => {
      if (stored !== todayStr) {
        setShouldRunWakeUp(true);
      }
    }).catch(() => {});
    AsyncStorage.getItem(INCOME_SEEN_KEY).then((stored) => { incomeSeenRef.current = stored; }).catch(() => {});
  }, []);

  // ── Glow animated style ──
  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  // O(1) category lookup by id — replaces repeated expenseCategories.find(...) in
  // getBudgetMeta / smartInsight, which ran once per category per render.
  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const c of expenseCategories) map.set(c.id, c);
    return map;
  }, [expenseCategories]);

  // ─── Compute spent per budget from transactions (no stale useEffect) ───
  const budgetsWithSpent = useMemo(
    () => budgets.map((budget) => ({ ...budget, ...computeBudgetRow(budget, transactions, now) })),
    [budgets, transactions, now]
  );

  // Live detail-sheet entity derived from the id — stays fresh as spent changes.
  const detailBudget = useMemo(
    () => (detailBudgetId ? (budgetsWithSpent.find((b) => b.id === detailBudgetId) ?? null) : null),
    [detailBudgetId, budgetsWithSpent]
  );

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
      .reduce((sum, t) => sum + (Number.isFinite(t.amount) ? t.amount : 0), 0);

    const totalExpenses = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          isWithinInterval(t.date, { start: monthStart, end: monthEnd })
      )
      .reduce((sum, t) => sum + (Number.isFinite(t.amount) ? t.amount : 0), 0);

    // Headline = BUDGETED MONEY ONLY (pure math in ./budgetMath, unit-tested in
    // scripts/test-budget-math.ts). Allocations normalize to a monthly-equivalent;
    // spend is REAL calendar-month RM (no extrapolation); bills/goals are NOT
    // subtracted here (they live in the commitments card for awareness).
    const money = computeHeroMoney(budgetsWithSpent, now, { totalIncome, totalExpenses });

    return {
      ...money,
      dailyAllowance: money.dailyFigure, // alias — the one headline number, kept name-compatible
      paceColor: getPaceColor(
        money.dayOfMonth < 5 && money.percentSpent <= 1 ? Math.min(money.paceRatio, 1.0) : money.paceRatio,
        C
      ),
    };
  }, [transactions, budgetsWithSpent, now, C]);

  // ── Time-of-day greeting (after heroData) ──
  const resolveGreeting = useCallback(() => {
    const h = new Date().getHours();
    if (heroData.alreadyOver) return t.budget.greetTight;
    if (h < 12) return t.budget.greetMorning;
    if (h < 17) return t.budget.greetAfternoon;
    return t.budget.greetEvening;
  }, [heroData.alreadyOver, t.budget]);

  // ── Arc animation complete → trigger count-up + glow + haptic ──
  const handleArcAnimationComplete = useCallback(() => {
    if (!shouldRunWakeUp || reduceMotion) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    AsyncStorage.setItem(HERO_ANIM_KEY, todayStr).catch(() => {});
    setWakeUpGreeting(resolveGreeting());
    const target = Math.round(heroData.dailyFigure);
    const steps = 40;
    const stepMs = 850 / steps;
    let step = 0;
    if (countUpRef.current) clearInterval(countUpRef.current);
    countUpRef.current = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setHeroCountDisplay(Math.round(eased * target));
      if (step >= steps) {
        clearInterval(countUpRef.current!);
        countUpRef.current = null;
        setHeroCountDisplay(target);
        setShouldRunWakeUp(false);
        glowOpacity.value = withSequence(
          withTiming(1, { duration: 300 }),
          withDelay(300, withTiming(0, { duration: 600 })),
        );
        lightTap();
      }
    }, stepMs);
  }, [shouldRunWakeUp, reduceMotion, heroData, resolveGreeting, glowOpacity]);

  // ─── Handlers ────────────────────────────────────────────
  const handleAdd = useCallback(() => {
    // Strict: digits with up to 2 decimals only — rejects "12.34.56" and blank.
    // On a decimal pad the comma IS the decimal point (many MY keyboards), so
    // normalize "12,50" → "12.50" before validating. Not a thousands separator.
    const trimmed = amount.trim().replace(/,/g, '.');
    const MAX_BUDGET = 100000000;
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      showToast(t.budget.invalidAmount, 'error');
      return;
    }
    const parsedAmount = parseFloat(trimmed);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > MAX_BUDGET) {
      showToast(t.budget.invalidAmount, 'error');
      return;
    }
    if (!category) {
      showToast(t.budget.selectCategory, 'error');
      return;
    }

    const dates = getPeriodDates(period, new Date());

    if (editingBudget) {
      const conflicting = budgets.find(
        (b) => b.category === category && b.id !== editingBudget.id
      );
      if (conflicting) {
        showToast(t.budget.categoryExists, 'error');
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
      showToast(t.budget.budgetUpdatedToast, 'success');
    } else {
      const existing = budgets.find((b) => b.category === category);
      if (existing) {
        showToast(t.budget.categoryExists, 'error');
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
      showToast(t.budget.budgetCreatedToast, 'success');
    }
  }, [amount, category, period, rollover, editingBudget, budgets, addBudget, updateBudget, showToast, t]);

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
      t.budget.deleteBudgetConfirm,
      [
        { text: t.common.cancel.toLowerCase(), style: 'cancel' },
        {
          text: t.common.delete.toLowerCase(),
          style: 'destructive',
          onPress: () => {
            mediumTap();
            deleteBudget(budget.id);
            showToast(t.budget.budgetDeletedToast, 'success');
          },
        },
      ]
    );
  }, [deleteBudget, showToast, t]);

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

  // togglePbExpand removed — cards tap-to-open notebook directly

  // ─── Budget row helper ───────────────────────────────────
  const getBudgetMeta = useCallback((budget: Budget & { spentAmount: number; effectiveAmount?: number }) => {
    const { start, end } = getPeriodInterval(budget.period, now);
    const totalDays = Math.max(differenceInDays(end, start) + 1, 1);
    const elapsed = Math.max(differenceInDays(now, start) + 1, 1);
    const remaining = Math.max(totalDays - elapsed + 1, 1);

    // The limit is the EFFECTIVE amount (allocation + rollover carry) — so a
    // carried cushion actually shows up in the ring / % / left figure.
    const limit = Number.isFinite(budget.effectiveAmount) ? (budget.effectiveAmount as number) : budget.allocatedAmount;
    const percentSpent = limit > 0 ? budget.spentAmount / limit : 0;
    const percentElapsed = elapsed / totalDays;
    const paceRatio = percentElapsed > 0 ? percentSpent / percentElapsed : 0;

    // Early-month warmup: in the first 5 days percentElapsed is tiny, so one
    // normal purchase reads as "hot". Keep the color calm unless actually over
    // budget — the over-budget ring/colour is handled separately.
    const colorPaceRatio = elapsed < 5 && percentSpent <= 1 ? Math.min(paceRatio, 1.0) : paceRatio;

    const leftAmount = Math.max(limit - budget.spentAmount, 0);
    const dailyBudget = remaining > 0 ? leftAmount / remaining : 0;

    const cat = categoryMap.get(budget.category);

    return {
      totalDays,
      elapsed,
      remaining,
      percentSpent,
      percentElapsed,
      paceRatio,
      paceColor: getPaceColor(colorPaceRatio, C),
      leftAmount,
      dailyBudget,
      cat,
    };
  }, [now, categoryMap, C]);

  // Worst-first sorted budget list for the category section. Memoized so we don't
  // re-sort (and call getBudgetMeta twice per comparison) on every render — only
  // when the underlying data or theme changes.
  const sortedBudgets = useMemo(
    () => [...budgetsWithSpent].sort(
      (a, b) => getBudgetMeta(b).percentSpent - getBudgetMeta(a).percentSpent,
    ),
    [budgetsWithSpent, getBudgetMeta],
  );

  // ─── Smart insight — observes patterns and narrates them ───
  const smartInsight = useMemo(() => {
    if (heroData.overBudgets.length > 0) {
      const worst = [...heroData.overBudgets].sort((a, b) => (b.spentAmount - b.effectiveAmount) - (a.spentAmount - a.effectiveAmount))[0];
      const overBy = worst.spentAmount - worst.effectiveAmount;
      const cat = categoryMap.get(worst.category);
      const biggest = transactions
        .filter((tx) => tx.category === worst.category && tx.type === 'expense' && tx.date >= startOfMonth(now))
        .sort((a, b) => b.amount - a.amount)[0];
      return {
        mode: 'over' as const,
        title: t.budget.insightOverTitle
          .replace('{{category}}', cat?.name || worst.category)
          .replace('{{currency}}', currency)
          .replace('{{amount}}', overBy.toFixed(0)),
        subtitle: biggest && biggest.description
          ? t.budget.insightOverSubDesc
              .replace('{{currency}}', currency).replace('{{amount}}', biggest.amount.toFixed(0))
              // function replacement — raw description may contain `$&`/`$'`/`$$` which
              // a string replacement would expand and corrupt the copy.
              .replace('{{desc}}', () => biggest.description)
          : biggest
          ? t.budget.insightOverSubAmount
              .replace('{{currency}}', currency).replace('{{amount}}', biggest.amount.toFixed(0))
          : t.budget.insightOverSubNone,
      };
    }
    const close = budgetsWithSpent.filter((b) => {
      const pct = b.effectiveAmount > 0 ? b.spentAmount / b.effectiveAmount : 0;
      return pct >= 0.85 && pct < 1;
    });
    if (close.length > 0) {
      const nearest = close[0];
      const cat = categoryMap.get(nearest.category);
      const leftAmt = nearest.effectiveAmount - nearest.spentAmount;
      // Use the budget's OWN period for the safe per-day figure — a weekly budget
      // divided by days-left-in-MONTH understates the pace by ~4×.
      const { endDate: periodEnd } = getPeriodDates(nearest.period ?? 'monthly', now);
      const daysLeftInPeriod = Math.max(1, Math.ceil((periodEnd.getTime() - now.getTime()) / 86400000));
      const dailyLeft = leftAmt / daysLeftInPeriod;
      return {
        mode: 'close' as const,
        title: t.budget.insightCloseTitle.replace('{{category}}', cat?.name || nearest.category),
        subtitle: t.budget.insightCloseSub
          .replace('{{currency}}', currency).replace('{{left}}', leftAmt.toFixed(0))
          .replace('{{currency}}', currency).replace('{{perDay}}', dailyLeft.toFixed(0))
          .replace('{{day}}', String(daysLeftInPeriod)),
      };
    }
    if (!heroData.stretchesWholeMonth) {
      return {
        mode: 'tight' as const,
        title: t.budget.insightTightTitle
          .replace('{{day}}', String(heroData.runsOutOnDay)).replace('{{total}}', String(heroData.daysInMonth)),
        subtitle: heroData.dailyFigure > 0
          ? t.budget.insightTightSub
              .replace('{{currency}}', currency).replace('{{burn}}', heroData.dailyBurn.toFixed(0))
              .replace('{{currency}}', currency).replace('{{pace}}', heroData.dailyFigure.toFixed(0))
          : t.budget.insightTightSubNoBudget
              .replace('{{currency}}', currency).replace('{{burn}}', heroData.dailyBurn.toFixed(0)),
      };
    }
    const cushion = [...budgetsWithSpent].sort((a, b) => (b.effectiveAmount - b.spentAmount) - (a.effectiveAmount - a.spentAmount))[0];
    if (cushion && cushion.effectiveAmount - cushion.spentAmount > 0) {
      const cat = categoryMap.get(cushion.category);
      const left = cushion.effectiveAmount - cushion.spentAmount;
      return {
        mode: 'healthy' as const,
        title: t.budget.insightHealthyTitle.replace('{{day}}', String(heroData.daysInMonth)),
        subtitle: t.budget.insightHealthySub
          .replace('{{category}}', cat?.name || cushion.category)
          .replace('{{currency}}', currency).replace('{{amount}}', left.toFixed(0)),
      };
    }
    return {
      mode: 'empty' as const,
      title: t.budget.insightEmptyTitle,
      subtitle: t.budget.insightEmptySub,
    };
  }, [heroData, budgetsWithSpent, transactions, categoryMap, now, currency, t.budget]);

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
    const topOver = [...budgetsWithSpent].sort((a, b) => (b.spentAmount - b.effectiveAmount) - (a.spentAmount - a.effectiveAmount))[0];
    const topCatName = ((topOver ? categoryMap.get(topOver.category) : undefined)?.name || topOver?.category || 'spending').toLowerCase();
    const overBy = heroData.totalOverBy;
    const deficit = Math.max((heroData.dailyBurn - heroData.dailyFigure) * heroData.daysRemaining, 100);

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
  }, [heroData, budgetsWithSpent, categoryMap, currency, chipRotation]);

  // ─── Upcoming bills this week (next 7 days) ───
  const upcomingBillsThisWeek = useMemo(() => {
    // Window slides on the same day-refresh signal as the rest of the screen.
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const sevenDaysOut = new Date(today);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const bills = subscriptions
      // Exclude finished installment plans — they have no more due dates.
      .filter((s) => s.isActive && !s.isPaused && !isInstallmentComplete(s))
      .map((s) => ({
        ...s,
        nextDate: s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate),
      }))
      // Far end is EXCLUSIVE so the window is exactly today..today+6.
      .filter((s) => s.nextDate >= today && s.nextDate < sevenDaysOut)
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
    const total = bills.reduce((sum, b) => sum + b.amount, 0);
    return { bills, total, count: bills.length };
  }, [subscriptions, now]);

  // ─── Top active savings goal (connects budget defense with saving offense) ───
  const topGoal = useMemo(() => {
    const active = goals
      .filter((g) => !g.isArchived && !g.isPaused && Number.isFinite(g.targetAmount) && g.targetAmount > 0)
      .map((g) => {
        const contributed = (g.contributions || []).reduce(
          (s, c) => s + (Number.isFinite(c.amount) ? c.amount : 0), 0);
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

  // ─── Aggregate across ALL active goals (scales to any number) ───
  const goalsSummary = useMemo(() => {
    const active = goals
      .filter((g) => !g.isArchived && !g.isPaused && Number.isFinite(g.targetAmount) && g.targetAmount > 0)
      .map((g) => {
        const contributed = (g.contributions || []).reduce(
          (s, c) => s + (Number.isFinite(c.amount) ? c.amount : 0), 0);
        return { goal: g, contributed };
      })
      .filter(({ goal, contributed }) => contributed < goal.targetAmount);
    if (active.length === 0) return null;
    const totalContributed = active.reduce((s, a) => s + a.contributed, 0);
    const totalTarget = active.reduce((s, a) => s + a.goal.targetAmount, 0);
    const pct = totalTarget > 0 ? totalContributed / totalTarget : 0;
    return { count: active.length, totalContributed, totalTarget, pct };
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
    if (heroData.dailyFigure > 0) {
      lines.push(`Free to spend: ${currency} ${heroData.dailyFigure.toFixed(0)}/day keeps me within budget through month end`);
    }
    lines.push('');
    // Commitments awareness — from the real cards (bills this week + goals),
    // no longer baked into the daily headline.
    if (upcomingBillsThisWeek.count > 0 || goalsSummary) {
      lines.push(`--- Commitments ahead ---`);
      if (upcomingBillsThisWeek.count > 0) {
        lines.push(`• ${upcomingBillsThisWeek.count} bill${upcomingBillsThisWeek.count > 1 ? 's' : ''} totaling ${currency} ${upcomingBillsThisWeek.total.toFixed(0)} due in the next 7 days`);
      }
      if (goalsSummary) {
        lines.push(`• ${goalsSummary.count} active savings goal${goalsSummary.count > 1 ? 's' : ''} (${currency} ${goalsSummary.totalContributed.toFixed(0)} of ${currency} ${goalsSummary.totalTarget.toFixed(0)} saved)`);
      }
      lines.push('');
    }
    lines.push(`--- Category breakdown (worst first) ---`);
    const sorted = [...budgetsWithSpent].sort((a, b) => {
      const aPct = a.effectiveAmount > 0 ? a.spentAmount / a.effectiveAmount : 0;
      const bPct = b.effectiveAmount > 0 ? b.spentAmount / b.effectiveAmount : 0;
      return bPct - aPct;
    });
    sorted.forEach((b) => {
      const meta = getBudgetMeta(b);
      const pct = (meta.percentSpent * 100).toFixed(0);
      const catName = meta.cat?.name || b.category;
      const leftAmt = b.effectiveAmount - b.spentAmount;
      const statusTag = meta.percentSpent > 1
        ? `OVER by ${currency} ${Math.abs(leftAmt).toFixed(0)}`
        : meta.percentSpent >= 0.85
        ? 'close to limit'
        : meta.percentSpent >= 0.4
        ? 'on track'
        : 'plenty of room';
      lines.push(`• ${catName}: spent ${currency} ${b.spentAmount.toFixed(0)} / ${currency} ${b.effectiveAmount.toFixed(0)} (${pct}%) — ${statusTag}`);
    });
    return lines.join('\n');
  }, [heroData, budgetsWithSpent, currency, getBudgetMeta, upcomingBillsThisWeek, goalsSummary]);

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

  // Tapping a re-balance action chip seeds edit_budget CONFIRMATION chips in Echo
  // (never auto-applied — the owner still taps to confirm). No budgetContext is
  // passed so MoneyChat does NOT fire an LLM send; it just shows the chips.
  const handleEchoActionChip = useCallback((actions: ChatAction[]) => {
    lightTap();
    setEchoSheetVisible(false);
    useAIInsightsStore.getState().addPendingActions(actions);
    navigation.navigate('MoneyChat', {});
  }, [navigation]);

  // Concrete pull/stretch re-balance chip (over mode only). Amounts read from the
  // real allocatedAmount (never effectiveAmount, so rollover isn't baked in) and
  // whole-RM rounded. Prefer pulling from the most underspent category; else
  // stretch the over-category's limit up to what was actually spent.
  const rebalanceChip = useMemo<EchoChip | null>(() => {
    if (smartInsight.mode !== 'over') return null;
    const overs = budgetsWithSpent.filter((b) => b.spentAmount > b.effectiveAmount);
    if (overs.length === 0) return null;
    const worst = [...overs].sort((a, b) => (b.spentAmount - b.effectiveAmount) - (a.spentAmount - a.effectiveAmount))[0];
    const overBy = Math.round(worst.spentAmount - worst.effectiveAmount);
    if (overBy <= 0) return null;
    const worstName = categoryMap.get(worst.category)?.name || worst.category;
    const desc = (cat: string, amt: number) =>
      t.budget.rebalanceDesc.replace('{{cat}}', cat).replace('{{currency}}', currency).replace('{{amt}}', String(amt));
    // amount:0 satisfies ChatAction; edit_budget reads newAmount (amount only if >0).
    const mk = (budgetCategory: string, newAmount: number, description: string): ChatAction =>
      ({ type: 'edit_budget', amount: 0, budgetCategory, newAmount, description });

    const cushion = [...budgetsWithSpent]
      .filter((b) => b.id !== worst.id)
      .sort((a, b) => (b.allocatedAmount - b.spentAmount) - (a.allocatedAmount - a.spentAmount))[0];
    const cushionRoom = cushion ? Math.round(cushion.allocatedAmount - cushion.spentAmount) : 0;

    if (cushion && cushionRoom > 0) {
      const move = Math.min(overBy, cushionRoom);
      const cushionName = categoryMap.get(cushion.category)?.name || cushion.category;
      const newCushion = Math.round(cushion.allocatedAmount - move);
      const newWorst = Math.round(worst.allocatedAmount + move);
      return {
        label: t.budget.rebalancePull.replace('{{currency}}', currency).replace('{{amt}}', String(move)).replace('{{from}}', cushionName),
        question: '',
        actions: [mk(cushion.category, newCushion, desc(cushionName, newCushion)), mk(worst.category, newWorst, desc(worstName, newWorst))],
      };
    }
    const stretched = Math.round(worst.spentAmount);
    return {
      label: t.budget.rebalanceStretch.replace('{{cat}}', worstName).replace('{{currency}}', currency).replace('{{amt}}', String(stretched)),
      question: '',
      actions: [mk(worst.category, stretched, desc(worstName, stretched))],
    };
  }, [smartInsight.mode, budgetsWithSpent, categoryMap, currency, t.budget]);

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
        `${label} a bit over — want to rebalance?`,
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

  // Newest income transaction landed this calendar month (for the payday nudge).
  const newestIncome = useMemo(() => {
    const now = new Date();
    let best: (typeof transactions)[number] | null = null;
    let bestT = -Infinity;
    for (const tx of transactions) {
      if (tx.type !== 'income') continue;
      const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
      if (d.getTime() > bestT) { bestT = d.getTime(); best = tx; }
    }
    return best;
  }, [transactions]);

  useFocusEffect(useCallback(() => {
    if (greetingPool.length === 0) return;

    // Payday re-tailor nudge — once per new in-month income txn. Reuses the
    // greeting → Echo flow (tap opens Echo to help re-tailor); no new plumbing.
    if (newestIncome && newestIncome.id !== incomeSeenRef.current) {
      setGreetingText(t.budget.paydayNudge);
      setGreetingDismissed(false);
      setGreetingChips([
        { label: t.budget.paydayRetailor, question: `I just got paid — help me re-tailor my budget for the rest of this month based on what's already come in and what I've spent.` },
      ]);
      incomeSeenRef.current = newestIncome.id;
      AsyncStorage.setItem(INCOME_SEEN_KEY, newestIncome.id).catch(() => {});
      return;
    }

    const idx = Math.floor(Math.random() * greetingPool.length);
    setGreetingText(greetingPool[idx]);
    setGreetingDismissed(false);

    const m = smartInsight.mode;
    const over = heroData.overBudgets.length;
    if (m === 'over') {
      const label = over > 1 ? `${over} categories` : `one category`;
      setGreetingChips([
        ...(rebalanceChip ? [rebalanceChip] : []),
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
  }, [greetingPool, smartInsight.mode, heroData.overBudgets.length, rebalanceChip, newestIncome, t.budget]));

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

  // ─── Header Echo button (only when FAB is hidden) — single source of truth ─
  useLayoutEffect(() => {
    const show = hasBudgets && echoHidden;
    if (!show) {
      navigation.setOptions({ headerRight: undefined });
      return;
    }
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            lightTap();
            if (!TIER_LIMITS[tier].askEchoPerScreen) { setEchoPaywallVisible(true); return; }
            setEchoHidden(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Echo assistant"
          style={{ width: 32, height: 32, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather
            name="zap"
            size={20}
            color={!TIER_LIMITS[tier].askEchoPerScreen ? C.textMuted : C.textPrimary}
          />
        </TouchableOpacity>
      ),
    });
  }, [echoHidden, tier, hasBudgets, navigation, C, setEchoHidden]);

  return (
    <View style={styles.container}>
      <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!PLAYBOOK_COMING_SOON && (
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
              <View style={styles.segmentChipInner}>
                <Text style={[styles.segmentText, viewMode === 'playbook' && styles.segmentTextActive]}>
                  {t.budget.playbookTab}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ══════════════ BUDGET VIEW ══════════════ */}
        {viewMode === 'budget' && (<>

        {/* ── Hero: daily-allowance arc card ── */}
        {hasBudgets ? (() => {
          const dailyFigure = heroData.dailyFigure;

          return (
          <View style={styles.heroOpenV3}>
            {/* Top row — solid, visible add-budget button */}
            <View style={styles.heroTopRowV3}>
              <TouchableOpacity
                style={styles.heroPlanBtn}
                onPress={() => { lightTap(); setBudgetPlannerVisible(true); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t.budget.planner.entryPill}
              >
                <Feather name="zap" size={13} color={C.accent} />
                <Text style={styles.heroPlanBtnText}>{t.budget.planner.entryPill}</Text>
              </TouchableOpacity>
              {/* Shares guideTargetRef with the empty-state button — the two never
                  mount together (hasBudgets branch), so the guide always finds one. */}
              <TouchableOpacity
                ref={guideTargetRef}
                style={styles.heroAddBtn}
                onPress={openAddModal}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t.budget.addBudget}
              >
                <Feather name="plus" size={15} color={C.onAccent} />
                <Text style={styles.heroAddBtnText}>{t.budget.addBudget.toLowerCase()}</Text>
              </TouchableOpacity>
            </View>

            {/* Gauge — emotional centrepiece, animated SVG half-ring */}
            <View style={styles.heroGaugeWrap}>
              {/* Gold glow bloom — fades in then out on first open each day */}
              <Reanimated.View
                style={[styles.heroGlowBloom, glowAnimStyle]}
                pointerEvents="none"
              />

              <HalfGauge
                size={224}
                strokeWidth={15}
                /* Fill on what's SPENT — intuitive: small arc = used a little,
                   grows as you spend. Matches the category rings. */
                percentage={Math.min(heroData.percentSpent * 100, 100)}
                color={heroData.paceColor}
                gradient={
                  heroData.alreadyOver
                    ? [C.bronze, C.bronze]
                    : isDark
                    ? ['#6E7233', C.bronze]
                    : [C.accent, C.bronze]
                }
                trackColor={isDark ? withAlpha(C.accent, 0.14) : withAlpha(C.accent, 0.08)}
                animate
                animDuration={850}
                onAnimationComplete={handleArcAnimationComplete}
              >
                {/* Only the number lives inside the arc — no overlap */}
                <Reanimated.View
                  entering={FadeIn.duration(500).delay(300)}
                  style={styles.heroGaugeCenterWrap}
                >
                  <Text
                    style={styles.heroGaugeAmount}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    <Text style={styles.heroGaugePrefix}>{currency} </Text>
                    <Text style={{ color: C.textPrimary }}>
                      {shouldRunWakeUp && heroCountDisplay > 0
                        ? String(heroCountDisplay)
                        : dailyFigure.toFixed(0)}
                    </Text>
                  </Text>
                </Reanimated.View>
              </HalfGauge>

              {/* Labels sit BELOW the arc — clear, never overlapping it */}
              <View style={styles.heroLabelStack}>
                <Text style={styles.heroGaugeSub}>{t.budget.heroDailyLabel}</Text>

                {/* Free pace verdict — one honest read for ALL users (the headline no
                    longer subtracts bills/goals, so this replaces the old trust line).
                    The Echo chat/coaching panel stays premium; only this line is free.
                    Subtitle is hidden when it references Echo, so free users never see
                    a premium hook here. Copy is localized via t.budget.insight*. */}
                {budgetsWithSpent.length > 0 && !!smartInsight.title && (
                  <Text style={styles.heroVerdictTitle} numberOfLines={2}>
                    {smartInsight.title}
                  </Text>
                )}
                {budgetsWithSpent.length > 0 && !!smartInsight.subtitle && !/echo/i.test(smartInsight.subtitle) && (
                  <Text style={styles.heroVerdictSub} numberOfLines={2}>
                    {smartInsight.subtitle}
                  </Text>
                )}

                <Text style={styles.heroResetsTomorrow}>{t.budget.heroResetsTomorrow}</Text>

                <TouchableOpacity
                  onPress={() => { lightTap(); setMathSheetVisible(true); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t.budget.heroHowCalculated}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.heroInfoBtn}
                >
                  <Feather name="info" size={12} color={C.bronze} />
                  <Text style={styles.heroInfoBtnText}>{t.budget.heroHowCalculated}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Commitments — bills due + savings goals, one quiet block.
                Itemizes the hero trust line above; typography carries the
                hierarchy, the neu lift carries the separation (no tint, no
                outline — Onyx rules 2/3). Both rows share one grammar:
                glyph · title/sub · trailing datum · chevron. ── */}
            {(upcomingBillsThisWeek.count > 0 || !!goalsSummary) && (
              <View style={[styles.commitCard, neuF.raisedSoft]}>
                {upcomingBillsThisWeek.count > 0 && (
                  <TouchableOpacity
                    style={styles.commitRow}
                    onPress={() => { lightTap(); navigation.navigate('SubscriptionList'); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${upcomingBillsThisWeek.count} ${upcomingBillsThisWeek.count > 1 ? t.budget.heroBillsPlural : t.budget.heroBillsSingular}, ${currency} ${upcomingBillsThisWeek.total.toFixed(0)}`}
                  >
                    <View style={styles.commitGlyph}>
                      <Feather name="calendar" size={15} color={C.bronze} />
                    </View>
                    <View style={styles.commitBody}>
                      <Text style={styles.commitTitle} numberOfLines={1}>
                        {upcomingBillsThisWeek.count} {upcomingBillsThisWeek.count > 1 ? t.budget.heroBillsPlural : t.budget.heroBillsSingular}
                      </Text>
                      <Text style={styles.commitSub} numberOfLines={1}>
                        {upcomingBillsThisWeek.bills
                          .slice(0, 3)
                          .map((b) => `${b.name} ${currency}${b.amount.toFixed(0)}`)
                          .join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.commitTrail}>
                      <Text style={[styles.commitValue, { color: C.bronze }]}>
                        {currency} {upcomingBillsThisWeek.total.toFixed(0)}
                      </Text>
                      <Feather name="chevron-right" size={14} color={withAlpha(C.textMuted, 0.55)} />
                    </View>
                  </TouchableOpacity>
                )}

                {upcomingBillsThisWeek.count > 0 && !!goalsSummary && (
                  <View style={styles.commitDivider} />
                )}

                {goalsSummary && (
                  <TouchableOpacity
                    style={styles.commitRow}
                    onPress={() => { lightTap(); navigation.navigate('Goals'); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={goalsSummary.count === 1 && topGoal ? `Open ${topGoal.goal.name} goal` : `Open ${goalsSummary.count} savings goals`}
                  >
                    <View style={styles.commitGlyph}>
                      <Feather name="target" size={15} color={C.accent} />
                    </View>
                    <View style={styles.commitBody}>
                      <Text style={styles.commitTitle} numberOfLines={1}>
                        {goalsSummary.count === 1 && topGoal
                          ? topGoal.goal.name
                          : t.budget.goalsCount.replace('{{n}}', String(goalsSummary.count))}
                      </Text>
                      <Text style={styles.commitSub} numberOfLines={1}>
                        {t.budget.savingTowards} · {currency} {goalsSummary.totalContributed.toFixed(0)} {t.budget.ofWord} {currency} {goalsSummary.totalTarget.toFixed(0)}
                      </Text>
                      <View style={styles.commitBarTrack}>
                        <View
                          style={[
                            styles.commitBarFill,
                            { width: `${Math.round(Math.min(goalsSummary.pct, 1) * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                    <View style={styles.commitTrail}>
                      <Text style={[styles.commitValue, { color: C.accent }]}>
                        {Math.round(goalsSummary.pct * 100)}%
                      </Text>
                      <Feather name="chevron-right" size={14} color={withAlpha(C.textMuted, 0.55)} />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── Reward good behaviour gently: "you kept RM__ here" ──
                Only shown when budget is healthy, at least one category has
                meaningful headroom, and we're past the first 5 days (so it's
                earned, not trivially early-month). One quiet warm line — not a
                celebration, just acknowledgement. Never shown when over budget. */}
            {(() => {
              if (heroData.alreadyOver || heroData.dayOfMonth < 5) return null;
              const cushionBudget = [...budgetsWithSpent]
                .filter((b) => b.allocatedAmount > 0 && b.spentAmount < b.allocatedAmount * 0.6)
                .sort((a, b) => (b.allocatedAmount - b.spentAmount) - (a.allocatedAmount - a.spentAmount))[0];
              if (!cushionBudget) return null;
              const keptAmt = Math.round(cushionBudget.allocatedAmount - cushionBudget.spentAmount);
              if (keptAmt < 10) return null;
              const cat = categoryMap.get(cushionBudget.category);
              const keptText = t.budget.heroKeptNote
                .replace('{{currency}}', currency)
                .replace('{{n}}', String(keptAmt));
              return (
                <Reanimated.View
                  entering={FadeIn.duration(560).delay(900)}
                  style={styles.heroKeptNote}
                >
                  <View style={[styles.heroKeptDot, { backgroundColor: C.accent }]} />
                  <Text style={styles.heroKeptText} numberOfLines={2}>
                    <Text style={[styles.heroKeptLabel, { color: withAlpha(C.accent, 0.7) }]}>
                      {t.budget.heroKeptNoteLabel}{' '}—{' '}
                    </Text>
                    {keptText}
                    {cat ? ` (${cat.name.toLowerCase()})` : ''}
                  </Text>
                </Reanimated.View>
              );
            })()}
          </View>
          );
        })() : null}

        {/* ── Over-limit banner (over current tier cap) ── */}
        {budgets.length > TIER_LIMITS[tier].maxBudgets && (
          <View style={styles.bannerCard}>
            <Feather name="info" size={16} color={C.bronze} />
            <Text style={styles.bannerText}>
              you have {budgets.length} budgets (limit: {TIER_LIMITS[tier].maxBudgets}).{' '}
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
        {/* ── Budget groups by status (Wallet-style grouped sections) ── */}
        {hasBudgets ? (() => {
          // Flat list, worst-first — over-budget and high-spend float to the top.
          // Sorting is memoized in `sortedBudgets` above.
          const sorted = sortedBudgets;
          // NOTE: this is a `.map()` inside the outer ScrollView with a per-row
          // ReanimatedSwipeable. Converting to FlatList here is structurally risky
          // (nested VirtualizedList-in-ScrollView + swipe gesture conflicts), so it
          // is intentionally left as a memoized .map(). Revisit FlatList only if a
          // user routinely exceeds ~30 budget categories.

          const renderCatRow = (budget: typeof budgetsWithSpent[0], isLast: boolean, rowIndex: number) => {
            const meta = getBudgetMeta(budget);
            const isOver = meta.percentSpent > 1;
            // Left / over vs the EFFECTIVE limit — so a rollover cushion reads the
            // same way here as it does in the ring (driven by meta.percentSpent).
            const leftAmount = Math.max(budget.effectiveAmount - budget.spentAmount, 0);
            const overAmount = Math.max(budget.spentAmount - budget.effectiveAmount, 0);
            const catColor = meta.cat?.color || C.accent;
            // Ring follows the ICON colour (not spend-pace) so each row reads as
            // "this category". Match CategoryIcon's dark-mode lightening exactly
            // (ensureContrastOnDark, same default target) so the arc is the same
            // bright hue as the glyph — never a dim, muddy version of it.
            const ringBase = isOver ? C.bronze : catColor;
            const ringColor = isDark ? ensureContrastOnDark(ringBase) : ringBase;

            return (
              <Reanimated.View
                key={budget.id}
                entering={FadeIn.duration(420).delay(Math.min(rowIndex, 11) * 50)}
              >
                <Pressable
                  onPress={() => openBudgetDetail(budget)}
                  style={({ pressed }) => [styles.catRowV3, pressed && { backgroundColor: withAlpha(C.textMuted, 0.04) }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${meta.cat?.name || budget.category}: ${currency} ${budget.spentAmount.toFixed(0)} ${t.budget.ofWord} ${currency} ${(budget.effectiveAmount ?? budget.allocatedAmount).toFixed(0)}, ${currency} ${(isOver ? overAmount : leftAmount).toFixed(0)} ${isOver ? t.budget.overLabel : t.budget.leftLabel}`}
                >
                  {/* Avatar — category icon wrapped in a spend-progress ring, tinted by category colour */}
                  <CircularProgress
                    size={52}
                    strokeWidth={5}
                    percentage={meta.percentSpent * 100}
                    color={ringColor}
                    trackColor={withAlpha(ringColor, 0.22)}
                  >
                    <View
                      style={[
                        styles.catAvatarV3,
                        { backgroundColor: withAlpha(ringColor, 0.2) },
                      ]}
                    >
                      {/* CategoryIcon (not raw Feather) — category icons are lib-prefixed
                          (m/, i/, fa/); Feather alone renders "?" for non-Feather names.
                          Passing the RAW colour: CategoryIcon lightens it in dark to the
                          same value as ringColor above, so glyph + ring match exactly. */}
                      <CategoryIcon icon={meta.cat?.icon || 'circle'} size={19} color={isOver ? C.bronze : catColor} />
                    </View>
                  </CircularProgress>

                  {/* Name + spent subtitle */}
                  <View style={styles.catRowMidV3}>
                    <Text style={styles.catRowNameV3} numberOfLines={1}>
                      {/* orphaned budget never shows a raw custom_<ts> id */}
                      {meta.cat?.name || t.budget.deletedCategory}
                    </Text>
                    <Text style={styles.catRowSubV3} numberOfLines={1}>
                      {currency} {budget.spentAmount.toFixed(0)} {t.budget.ofWord} {currency} {budget.effectiveAmount.toFixed(0)}
                    </Text>
                  </View>

                  {/* Remaining — olive when on track, bronze when over */}
                  <Text
                    style={[
                      styles.catRowRightV3,
                      { color: isOver ? C.bronze : C.accent },
                    ]}
                  >
                    {currency} {isOver ? overAmount.toFixed(0) : leftAmount.toFixed(0)}{' '}
                    <Text style={styles.catRowRightLabelV3}>
                      {isOver ? t.budget.overLabel : t.budget.leftLabel}
                    </Text>
                  </Text>
                  <Feather name="chevron-right" size={16} color={withAlpha(C.textMuted, 0.5)} style={{ marginLeft: SPACING.xs }} />
                </Pressable>
                {!isLast && <View style={styles.catRowDividerV3} />}
              </Reanimated.View>
            );
          };

          return (
            <View style={styles.categoriesWrapV3}>
              <View style={styles.categoriesHeaderV3}>
                <Text style={styles.categoriesHeaderTextV3}>{t.budget.budgetCategories}</Text>
                <Text style={styles.categoriesCountV3}>{sorted.length}</Text>
              </View>
              <View style={[styles.categoriesCardV3, neuF.raisedSoft]}>
                {sorted.map((b, i) => renderCatRow(b, i === sorted.length - 1, i))}
              </View>
            </View>
          );
        })() : (
          /* ── Empty state — warm, specific, inviting ── */
          <Reanimated.View style={styles.emptyContainer} entering={FadeIn.duration(560)}>
            {/* Warm icon circle — olive tinted, not muted grey */}
            <View style={[styles.emptyIconCircle, { backgroundColor: withAlpha(C.accent, 0.10) }]}>
              <Feather name="target" size={40} color={C.accent} />
            </View>
            <Text style={styles.emptyTitle}>{t.budget.emptyHeroTitle}</Text>
            <Text style={styles.emptyMessage}>
              {t.budget.emptyHeroSub}
            </Text>
            <View ref={guideTargetRef} collapsable={false} style={styles.emptyCtaWrap}>
              <NeuButton
                onPress={openAddModal}
                label={t.budget.addBudget.toLowerCase()}
                icon="plus"
                accessibilityLabel={t.budget.addBudget}
              />
            </View>
            <TouchableOpacity
              style={styles.emptyPlanLink}
              onPress={() => { lightTap(); setBudgetPlannerVisible(true); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.budget.planner.entryEmpty}
            >
              <Feather name="zap" size={14} color={C.bronze} />
              <Text style={styles.emptyPlanLinkText}>{t.budget.planner.entryEmpty}</Text>
            </TouchableOpacity>
          </Reanimated.View>
        )}

        </>)}

        {/* ══════════════ PLAYBOOK VIEW ══════════════ */}
        {viewMode === 'playbook' && (PLAYBOOK_COMING_SOON ? (
          <EmptyState
            icon="i/book-outline"
            title="playbooks — coming soon"
            message="this arrives in version 1.2.0. you'll be able to plan each paycheck and track where every ringgit goes."
          />
        ) : (<>

          {/* Active / Past tabs */}
          <View style={styles.pbTabRow}>
            <TouchableOpacity
              style={[styles.pbTab, playbookTab === 'active' && styles.pbTabActive]}
              onPress={() => { lightTap(); setPlaybookTab('active'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pbTabText, playbookTab === 'active' && styles.pbTabTextActive]}>
                {t.budget.playbookActive} ({activePlaybooks.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pbTab, playbookTab === 'past' && styles.pbTabActive]}
              onPress={() => { lightTap(); setPlaybookTab('past'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pbTabText, playbookTab === 'past' && styles.pbTabTextActive]}>
                {t.budget.playbookPast} ({closedPlaybooks.length}{Number.isFinite(TIER_LIMITS[tier].maxSavedPlaybooks) ? `/${TIER_LIMITS[tier].maxSavedPlaybooks}` : ''})
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
            {activePlaybooks.length > 0 ? (() => {
              // ── Summary hero figures across all active playbooks ──
              let totalPlanned = 0;
              let totalSpent = 0;
              let totalBurn = 0;
              let totalTxns = 0;
              for (const pb of activePlaybooks) {
                const s = playbookStatsMap[pb.id];
                if (!s) continue;
                totalPlanned += pb.sourceAmount;
                totalSpent += s.totalSpent;
                totalBurn += s.dailyBurnRate;
                totalTxns += s.linkedTransactionCount;
              }
              const pctSpent = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;
              const heroOver = totalSpent > totalPlanned;
              const heroColor = heroOver ? C.bronze : C.accent;
              const heroRemaining = totalPlanned - totalSpent;
              const subLine = heroOver
                ? `${currency} ${Math.abs(heroRemaining).toFixed(0)} over · ~${currency} ${totalBurn.toFixed(0)}/day`
                : `${currency} ${heroRemaining.toFixed(0)} left · ~${currency} ${totalBurn.toFixed(0)}/day`;

              return (
              <>
                {/* ── Playbook summary hero ── */}
                <View
                  style={styles.heroCardV3}
                  accessibilityRole="summary"
                  accessibilityLabel={`active plans, ${currency} ${totalPlanned.toFixed(0)} planned, ${subLine}`}
                >
                  <LinearGradient
                    colors={[
                      heroOver ? withAlpha(C.bronze, 0.07) : withAlpha(C.deepOlive, 0.06),
                      withAlpha(C.surface, 0),
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.heroTopRowV3}>
                    <Text style={styles.heroEyebrowV3}>active plans</Text>
                    <Text style={styles.pbHeroCountV3}>
                      {activePlaybooks.length} {activePlaybooks.length === 1 ? 'plan' : 'plans'}
                    </Text>
                  </View>

                  <Text style={styles.heroBigAmountV3}>
                    <Text style={styles.heroBigPrefixV3}>{currency} </Text>
                    {totalPlanned.toFixed(0)}
                  </Text>
                  <Text style={styles.pbHeroSubV3}>{subLine}</Text>

                  <View style={styles.heroTrackV3}>
                    <View
                      style={[
                        styles.heroFillV3,
                        { width: `${Math.min(pctSpent, 100)}%`, backgroundColor: heroColor },
                      ]}
                    />
                  </View>
                  <View style={styles.pbHeroMetaRowV3}>
                    <Text style={[styles.heroCaptionV3, { flex: 1 }]} numberOfLines={1}>
                      {currency} {totalSpent.toFixed(0)} spent · {totalTxns} entries
                    </Text>
                    <Text style={[styles.heroStatusCaptionV3, { color: heroColor }]}>
                      {pctSpent.toFixed(0)}%
                    </Text>
                  </View>
                </View>

                {/* ── Active playbook rows (ring-avatar anatomy) ── */}
                <View style={[styles.categoriesCardV3, neuF.raisedSoft]}>
                  {activePlaybooks.map((pb, index) => {
                    const stats = playbookStatsMap[pb.id];
                    if (!stats) return null;
                    const over = isOverspent(pb, stats);
                    const overAmount = getOverspentAmount(pb, stats);
                    const rawRemaining = pb.sourceAmount - stats.totalSpent;
                    const isLast = index === activePlaybooks.length - 1;
                    const percentage = stats.percentSpent;
                    const paceColor = over ? C.bronze : C.accent;

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
                          accessibilityRole="button"
                          accessibilityLabel={`${pb.name}, ${currency} ${stats.totalSpent.toFixed(0)} of ${currency} ${pb.sourceAmount.toFixed(0)} spent, ${percentage.toFixed(0)} percent`}
                          style={({ pressed }) => [styles.catRowV3, pressed && { backgroundColor: withAlpha(C.textMuted, 0.04) }]}
                        >
                          {/* Avatar — book icon wrapped in a spend-progress ring */}
                          <CircularProgress
                            size={52}
                            strokeWidth={4}
                            percentage={percentage}
                            color={paceColor}
                            trackColor={withAlpha(C.textMuted, 0.2)}
                          >
                            <View style={[styles.catAvatarV3, { backgroundColor: withAlpha(paceColor, 0.14) }]}>
                              <Feather name="book-open" size={19} color={paceColor} />
                            </View>
                          </CircularProgress>

                          {/* Two-line content */}
                          <View style={styles.catRowMidV3}>
                            {/* line 1 — name + spent / total */}
                            <View style={styles.pbRowLineV3}>
                              <Text style={[styles.catRowNameV3, styles.pbRowFlexV3]} numberOfLines={1}>{pb.name}</Text>
                              <Text style={styles.pbRowAmountV3} numberOfLines={1}>
                                {currency} {stats.totalSpent.toFixed(0)} / {pb.sourceAmount.toFixed(0)}
                              </Text>
                            </View>
                            {/* line 2 — meta + percent */}
                            <View style={styles.pbRowLineV3}>
                              <Text style={[styles.catRowSubV3, styles.pbRowFlexV3]} numberOfLines={1}>
                                {stats.linkedTransactionCount} entries · ~{currency} {stats.dailyBurnRate.toFixed(0)}/day
                                {'  ·  '}
                                <Text style={{ color: paceColor }}>
                                  {over
                                    ? `${currency} ${overAmount.toFixed(0)} over`
                                    : stats.daysUntilEmpty != null ? `~${stats.daysUntilEmpty}d left` : `${currency} ${rawRemaining.toFixed(0)} left`}
                                </Text>
                              </Text>
                              <Text style={[styles.pbRowPercentV3, { color: paceColor }]}>
                                {percentage.toFixed(0)}%
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                        {!isLast && <View style={styles.catRowDividerV3} />}
                      </View>
                    );
                  })}
                </View>
              </>
              );
            })() : (
              <EmptyState
                icon="i/book-outline"
                title="no active playbooks"
                message="create one when income arrives to track where every ringgit goes"
              />
            )}
          </>)}

          {/* ── Past tab ── */}
          {playbookTab === 'past' && (<>
            {closedPlaybooks.length > 0 ? (
              <View style={[styles.categoriesCardV3, neuF.raisedSoft]}>
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
                        accessibilityRole="button"
                        accessibilityLabel={`${pb.name}, closed, ${currency} ${stats.totalSpent.toFixed(0)} of ${currency} ${pb.sourceAmount.toFixed(0)} spent`}
                        style={({ pressed }) => [styles.catRowV3, styles.pbRowClosedV3, pressed && { backgroundColor: withAlpha(C.textMuted, 0.04) }]}
                      >
                        {/* Avatar — muted, settled ring for closed plans */}
                        <CircularProgress
                          size={52}
                          strokeWidth={4}
                          percentage={stats.percentSpent}
                          color={C.neutral}
                          trackColor={withAlpha(C.textMuted, 0.2)}
                        >
                          <View style={[styles.catAvatarV3, { backgroundColor: withAlpha(C.neutral, 0.12) }]}>
                            <Feather name="book-open" size={19} color={C.neutral} />
                          </View>
                        </CircularProgress>

                        {/* Two-line content */}
                        <View style={styles.catRowMidV3}>
                          {/* line 1 — name + spent / total */}
                          <View style={styles.pbRowLineV3}>
                            <Text style={[styles.catRowNameV3, styles.pbRowFlexV3, { color: C.textSecondary }]} numberOfLines={1}>{pb.name}</Text>
                            <Text style={[styles.pbRowAmountV3, { color: C.textSecondary }]} numberOfLines={1}>
                              {currency} {stats.totalSpent.toFixed(0)} / {pb.sourceAmount.toFixed(0)}
                            </Text>
                          </View>
                          {/* line 2 — span + days + entries */}
                          <View style={styles.pbRowLineV3}>
                            <Text style={[styles.catRowSubV3, styles.pbRowFlexV3]} numberOfLines={1}>
                              {startStr} – {endStr} · {stats.daysActive} days · {stats.linkedTransactionCount} entries
                            </Text>
                            <Text style={[styles.pbRowPercentV3, { color: C.neutral }]}>
                              {stats.percentSpent.toFixed(0)}%
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                      {!isLast && <View style={styles.catRowDividerV3} />}
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptyState
                icon="i/book-outline"
                title="no past playbooks"
                message="closed playbooks will appear here"
              />
            )}

            {/* Free tier counter */}
            {Number.isFinite(TIER_LIMITS[tier].maxSavedPlaybooks) && closedPlaybooks.length > 0 && (
              <Text style={styles.pbTierCounter}>
                {closedPlaybooks.length}/{TIER_LIMITS[tier].maxSavedPlaybooks} saved playbooks (free tier)
              </Text>
            )}
          </>)}

        </>))}

      </ScrollView>
      </PullRefresh>

      {/* add budget now lives in the hero pill — no floating FAB over content */}

      {/* ── "How we got this" math receipt sheet ── */}
      <Modal
        visible={mathSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMathSheetVisible(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.mathOverlay}
          onPress={() => setMathSheetVisible(false)}
          accessibilityLabel="Close"
        >
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.mathKAV}
            pointerEvents="box-none"
          >
            <View
              style={styles.mathCard}
              onStartShouldSetResponder={() => true}
            >
              {/* Title */}
              <Text style={styles.mathTitle}>
                {t.budget.mathSheetTitle
                  .replace('{{currency}}', currency)
                  .replace('{{n}}', Math.round(heroData.dailyFigure).toString())}
              </Text>

              {/* Receipt waterfall — budgeted-money-only. Each row chains to the
                  next: allocated − spent = budget left ÷ days = daily figure.
                  Bills + goals are NOT subtracted here anymore (they live in the
                  commitments card). */}
              <View style={styles.mathRows}>
                {/* Row: total budgeted (monthly-equivalent) */}
                <View style={styles.mathRow}>
                  <Text style={styles.mathRowLabel}>{t.budget.mathMoneyInBudgets}</Text>
                  <Text style={styles.mathRowAmount}>{currency} {Math.round(heroData.totalAllocated)}</Text>
                </View>

                {/* Row: minus spent so far this month */}
                <View style={styles.mathRow}>
                  <Text style={styles.mathRowLabel}>{`− ${t.budget.mathSpentSoFar}`}</Text>
                  <Text style={[styles.mathRowAmount, { color: C.bronze }]}>
                    − {currency} {Math.round(heroData.totalBudgetSpent)}
                  </Text>
                </View>

                {/* Divider */}
                <View style={styles.mathDivider} />

                {/* Row: = budget left */}
                <View style={styles.mathRow}>
                  <Text style={styles.mathRowLabel}>{t.budget.mathBudgetLeft}</Text>
                  <Text style={styles.mathRowAmount}>
                    = {currency} {Math.round(heroData.budgetLeft)}
                  </Text>
                </View>

                {/* Row: divide by days remaining → daily figure */}
                <View style={styles.mathRow}>
                  <Text style={styles.mathRowLabel}>
                    {t.budget.mathDivideDays.replace('{{days}}', String(heroData.daysRemaining))}
                  </Text>
                  <Text style={[styles.mathRowAmount, { color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold as any }]}>
                    {t.budget.mathDailyResult
                      .replace('{{currency}}', currency)
                      .replace('{{n}}', Math.round(heroData.dailyFigure).toString())}
                  </Text>
                </View>
              </View>

              {/* Close */}
              <TouchableOpacity
                style={styles.mathCloseBtn}
                onPress={() => setMathSheetVisible(false)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
              >
                <Text style={styles.mathCloseBtnText}>{t.common.close.toLowerCase()}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ── Category Detail — bottom-sheet (spending + transactions + actions) ─── */}
      {detailBudget && (() => {
        const dBudget = detailBudget; // non-null snapshot for deferred-action closures
        const dMeta = getBudgetMeta(detailBudget);
        const dCatColor = dMeta.cat?.color || C.accent;
        const dIsOver = dMeta.percentSpent > 1;
        // Ring + icon + progress bar follow the category colour (lightened in dark
        // to match the glyph), consistent with the category list rows — so tapping
        // a row doesn't jump from a category-coloured ring to a pace-coloured one.
        const dRingBase = dIsOver ? C.bronze : dCatColor;
        const dRingColor = isDark ? ensureContrastOnDark(dRingBase) : dRingBase;
        // Left / over vs the EFFECTIVE limit — so rollover carry shows here too.
        const dLeft = Math.max(detailBudget.effectiveAmount - detailBudget.spentAmount, 0);
        const dOver = Math.max(detailBudget.spentAmount - detailBudget.effectiveAmount, 0);
        const { start, end } = getPeriodInterval(detailBudget.period, now);
        const dTxnsAll = transactions
          .filter((tx) => tx.type === 'expense' && tx.category === detailBudget.category && isWithinInterval(tx.date, { start, end }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // Perf cap: a heavy category can hold hundreds of txns — rendering them all
        // through ScrollView+.map() freezes/OOMs the sheet on open. Render only the
        // most-recent 20; "see all transactions" (filtered) covers the rest.
        const DETAIL_TXN_CAP = 20;
        const dTxns = dTxnsAll.slice(0, DETAIL_TXN_CAP);
        const dTxnsHasMore = dTxnsAll.length > DETAIL_TXN_CAP;
        return (
        <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={() => dCloseSheet()}>
          {/* Android: RNGH gestures inside a Modal need their own root (Modal = separate window) */}
          <GestureHandlerRootView style={{ flex: 1 }}>
          <Reanimated.View style={[styles.modalBackdrop, dBackdropAnimatedStyle]}>
            <Pressable style={{ flex: 1 }} onPress={() => dCloseSheet()} />
          </Reanimated.View>

          <Reanimated.View style={[styles.modalSheetContainer, dSheetAnimatedStyle]}>
            <GestureDetector gesture={dSheetGesture}>
              <View collapsable={false}>
                <View style={styles.modalHandleRow}>
                  <View style={styles.modalHandle} />
                </View>

                {/* Summary — one lifted Onyx panel (borderless C.background + neu,
                    no outline): ring + name, over/left figure, and the pace bar. */}
                <View style={styles.bdHeroWrap}>
                <View style={[styles.bdHeroCard, neuF.raisedSoft]}>
                {/* Header — ring + name + spent-of */}
                <View style={styles.bdHeader}>
                  <CircularProgress
                    size={56}
                    strokeWidth={5}
                    percentage={dMeta.percentSpent * 100}
                    color={dRingColor}
                    trackColor={withAlpha(dCatColor, 0.18)}
                  >
                    <View style={[styles.bdAvatar, { backgroundColor: withAlpha(dCatColor, 0.16) }]}>
                      <CategoryIcon icon={dMeta.cat?.icon || 'circle'} size={22} color={dRingColor} />
                    </View>
                  </CircularProgress>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.bdName} numberOfLines={1}>{dMeta.cat?.name || t.budget.deletedCategory}</Text>
                    <Text style={styles.bdSub}>
                      {t.budget.detailSpentOf
                        .replace('{{currency}}', currency)
                        .replace('{{spent}}', detailBudget.spentAmount.toFixed(0))
                        .replace('{{currency}}', currency)
                        .replace('{{allocated}}', detailBudget.effectiveAmount.toFixed(0))}
                    </Text>
                  </View>
                </View>

                {/* Big left / over figure */}
                <Text style={[styles.bdFigure, { color: dIsOver ? C.bronze : C.textPrimary }]}>
                  <Text style={styles.bdFigurePrefix}>{currency} </Text>
                  {dIsOver ? dOver.toFixed(0) : dLeft.toFixed(0)}
                  <Text style={styles.bdFigureLabel}> {dIsOver ? t.budget.overLabel : t.budget.leftLabel}</Text>
                </Text>

                {/* Progress + pace */}
                <View style={styles.bdBarTrack}>
                  <View style={[styles.bdBarFill, { width: `${Math.min(dMeta.percentSpent * 100, 100)}%`, backgroundColor: dRingColor }]} />
                </View>
                {!dIsOver && dMeta.remaining > 0 && (
                  <Text style={styles.bdPace}>
                    {t.budget.detailPerDayLeft
                      .replace('{{currency}}', currency)
                      .replace('{{n}}', dMeta.dailyBudget.toFixed(0))
                      .replace('{{days}}', String(dMeta.remaining))}
                  </Text>
                )}
                </View>
                </View>
              </View>
            </GestureDetector>

            {/* Transactions this period */}
            <View style={styles.bdBody}>
              <Text style={styles.bdSectionLabel}>
                {t.budget.detailRecentInCategory.replace('{{category}}', (dMeta.cat?.name || detailBudget.category).toLowerCase())}
              </Text>
              {dTxns.length === 0 ? (
                <Text style={styles.bdEmpty}>{t.budget.detailNoTransactions}</Text>
              ) : (
                <ScrollView
                  style={{ maxHeight: SCREEN_H * 0.30 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {dTxns.map((tx) => (
                    <View key={tx.id} style={styles.bdTxnRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.bdTxnDesc} numberOfLines={1}>
                          {tx.description || dMeta.cat?.name || detailBudget.category}
                        </Text>
                        <Text style={styles.bdTxnDate}>{format(new Date(tx.date), 'MMM d')}</Text>
                      </View>
                      <Text style={styles.bdTxnAmt}>{currency} {tx.amount.toFixed(0)}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              {dTxns.length > 0 && (
                <TouchableOpacity
                  style={styles.bdSeeAll}
                  onPress={() => dCloseSheet(() => navigation.navigate('TransactionsList', {
                    filterCategory: dBudget.category,
                    // period → TransactionsList date range; weekly has no matching preset, so omit.
                    filterDateRange: dBudget.period === 'monthly' ? 'this_month'
                      : dBudget.period === 'yearly' ? 'this_year'
                      : undefined,
                  }))}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={dTxnsHasMore
                    ? t.budget.detailSeeAllCount.replace('{{n}}', String(dTxnsAll.length))
                    : t.budget.detailSeeAll}
                >
                  <Text style={styles.bdSeeAllText}>
                    {dTxnsHasMore
                      ? t.budget.detailSeeAllCount.replace('{{n}}', String(dTxnsAll.length))
                      : t.budget.detailSeeAll}
                  </Text>
                  <Feather name="arrow-right" size={14} color={C.accent} />
                </TouchableOpacity>
              )}
            </View>

            {/* Footer actions */}
            <View style={[styles.bdActions, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
              <TouchableOpacity
                style={styles.bdEditBtn}
                onPress={() => dCloseSheet(() => handleEdit(dBudget), dBudget.id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t.budget.editBudget}
              >
                <Feather name="edit-2" size={16} color={C.onAccent} />
                <Text style={styles.bdEditBtnText}>{t.common.edit.toLowerCase()}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bdDeleteBtn, neuF.raised]}
                onPress={() => dCloseSheet(() => handleDelete(dBudget), dBudget.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.common.delete}
              >
                <Feather name="trash-2" size={16} color={C.bronze} />
              </TouchableOpacity>
            </View>
          </Reanimated.View>
          </GestureHandlerRootView>
        </Modal>
        );
      })()}

      {/* ── Add / Edit Budget — bottom-sheet (drag-to-dismiss, animated backdrop) ─── */}
      {modalVisible && (<Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={bCloseSheet}>
        {/* Android: RNGH gestures inside a Modal need their own root (Modal = separate window) */}
        <GestureHandlerRootView style={{ flex: 1 }}>
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
                  {editingBudget ? `${t.budget.sheetEditPrefix} ` : `${t.budget.sheetAddPrefix} `}
                  <Text style={styles.modalTitleAccent}>
                    {editingBudget
                      ? (categoryMap.get(editingBudget.category)?.name?.toLowerCase() || t.budget.sheetBudgetWord)
                      : t.budget.sheetBudgetWord}
                  </Text>
                </Text>
                <Text style={styles.modalSubtitle}>
                  {editingBudget ? t.budget.sheetEditSubtitle : t.budget.sheetAddSubtitle}
                </Text>
              </View>
            </View>
          </GestureDetector>

          <KeyboardAwareScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.modalScrollContent}
          >
              <View style={[styles.modalHeroCard, neuF.raisedSoft]}>
                <Text style={styles.modalFieldLabel}>
                  {t.budget.amountLabel} <Text style={styles.modalFieldRequired}>*</Text>
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
                    selectionColor={withAlpha(C.accent, 0.25)}
                    cursorColor={C.accent}
                    accessibilityLabel="budget amount"
                  />
                </View>
              </View>

              <View style={styles.modalDivider} />

              <View style={[styles.modalFieldCard, neuF.raisedSoft]}>
                <Text style={styles.modalFieldLabel}>{t.budget.category.toLowerCase()}</Text>
                <CategoryPicker
                  categories={expenseCategories}
                  selectedId={category}
                  onSelect={setCategory}
                  layout="dropdown"
                />
              </View>

              <View style={[styles.modalFieldCard, neuF.raisedSoft]}>
                <Text style={styles.modalFieldLabel}>{t.budget.period.toLowerCase()}</Text>
                <View style={styles.periodRow}>
                  {BUDGET_PERIODS.map((p) => {
                    const isActive = period === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        style={[styles.periodChip, neuF.raised, isActive && styles.periodChipActive]}
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

              <View style={[styles.modalFieldCard, styles.rolloverRow, neuF.raisedSoft]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalFieldLabelBase}>{t.budget.rollover}</Text>
                  <Text style={styles.modalFieldHint}>
                    {t.budget.rolloverHint}
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
          </KeyboardAwareScrollView>

          {/* Anchored save zone (Goals pattern — plain View, no sticky/KAV) */}
          <View style={[styles.modalSaveZone, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
            <Pressable
              style={({ pressed }) => [
                styles.modalSaveBtn,
                pressed && { opacity: 0.88 },
              ]}
              onPress={handleAdd}
              accessibilityRole="button"
              accessibilityLabel={editingBudget ? t.budget.saveChanges : t.budget.addBudgetCta}
            >
              <View style={styles.modalSaveBtnInner}>
                <Feather name="check" size={16} color={C.surface} />
                <Text style={styles.modalSaveBtnText}>
                  {editingBudget ? t.budget.saveChanges : t.budget.addBudgetCta}
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
        </GestureHandlerRootView>
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

      {/* Echo plan — deterministic monthly-budget planner (engine + model freedom → real budgets) */}
      <BudgetPlannerSheet
        visible={budgetPlannerVisible}
        onClose={() => setBudgetPlannerVisible(false)}
        onUpgradeNeeded={() => {
          // Planner just closed (onClose ran). Present the SAME standalone budget
          // paywall the "+" add flow uses, once the sheet's dismissal settles —
          // runAfterInteractions avoids the paywall mounting behind the closing
          // Modal (the invisible-paywall iOS gotcha).
          InteractionManager.runAfterInteractions(() => setPaywallVisible(true));
        }}
        onApplied={(created, updated) => {
          const p = t.budget.planner;
          const msg = updated > 0
            ? (created > 0
                ? p.updatedToast.replace('{{u}}', String(updated)).replace('{{c}}', String(created))
                : p.updatedOnlyToast.replace('{{u}}', String(updated)))
            : p.createdToast.replace('{{n}}', String(created));
          showToast(msg, 'success');
        }}
      />

      {/* ── Playbook FAB ── */}
      {viewMode === 'playbook' && !PLAYBOOK_COMING_SOON && playbookTab === 'active' && !createPlaybookVisible && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 88 + SPACING.md }]}
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
              behavior="padding"
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
                    selectionColor={withAlpha(C.accent, 0.25)}
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
                      selectionColor={withAlpha(C.accent, 0.25)}
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
              if (!TIER_LIMITS[tier].askEchoPerScreen) { setEchoPaywallVisible(true); return; }
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
                if (!TIER_LIMITS[tier].askEchoPerScreen) { setEchoPaywallVisible(true); return; }
                setEchoAutoPrompt(greetingChips.find((c) => c.question)?.question || greetingText);
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
        threadKey="budget"
        insightTitle={smartInsight.title}
        insightSubtitle={smartInsight.subtitle}
        chips={greetingChips}
        onChipAction={handleEchoActionChip}
        contextSnapshot={buildBudgetSnapshot()}
        topInset={insets.top}
        bottomInset={insets.bottom}
        autoPrompt={echoAutoPrompt}
      />

      <ScreenGuide
        id="guide_budget"
        accent={C.bronze}
        // Do-it-with-me: the hole over the empty-state "add budget" pill is
        // tappable; the user sets their first limit and the guide advances to
        // the payoff the moment a budget is actually created.
        steps={[
          { kind: 'intro', title: t.guide.spendingLimits, icon: 'sliders', body: t.guide.descBudget },
          {
            kind: 'doWithMe',
            targetRef: guideTargetRef,
            label: t.guide.budgetWalk,
            watch: whenStore(usePersonalStore, (s) => s.budgets.length, (n, base) => n > base),
          },
          { kind: 'payoff', title: t.guide.budgetPayoffTitle, body: t.guide.budgetPayoffBody, icon: 'check-circle' },
        ]}
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
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

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['5xl'],
    paddingHorizontal: SPACING.xl,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Width wrapper so the full-width Neu Select stays capped + centered (a
  // center-aligned parent would otherwise collapse NeuButton to content width).
  emptyCtaWrap: { width: '100%', maxWidth: 256 },

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
    // Onyx rule 1: sheets sit on C.background (#121212), never the C.surface
    // gray slab. Separation from content comes from the neu cards inside.
    backgroundColor: C.background,
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

  // ─── Category detail sheet ───
  // Summary hero — borderless C.background panel lifted by neuF.raisedSoft
  // (Onyx: no outline, no gray-slab fill). Insets from the sheet edges.
  bdHeroWrap: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  bdHeroCard: {
    // Faint fill + neuF.raisedSoft (spread in JSX) — mirrors Debt's detailHeroCard
    // so the panel reads as a distinct, lifted surface on the black sheet.
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.05 : 0.03),
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  bdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  bdAvatar: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bdName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  bdSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 1,
    fontVariant: ['tabular-nums'] as any,
  },
  bdFigure: {
    fontSize: 34,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'] as any,
  },
  bdFigurePrefix: {
    fontSize: 18,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  bdFigureLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  bdBarTrack: {
    height: 6,
    backgroundColor: withAlpha(C.textMuted, 0.12),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginTop: SPACING.md,
  },
  bdBarFill: {
    height: 6,
    borderRadius: RADIUS.full,
  },
  bdPace: {
    marginTop: SPACING.sm,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  bdBody: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  bdSectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  bdEmpty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    paddingVertical: SPACING.md,
  },
  bdTxnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.06),
  },
  bdTxnDesc: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  bdTxnDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  bdTxnAmt: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  bdSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  bdSeeAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  bdActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
  },
  bdEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
  },
  bdEditBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    textTransform: 'lowercase',
  },
  // Secondary action — Onyx neu chip (faintDark raised, no outline/tint); the
  // bronze icon alone carries the destructive meaning. Mirrors debtIconChip.
  bdDeleteBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.06 : 0.03),
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
  // Hero amount card (mirrors dDebtFieldHeroCard) — borderless C.background
  // lifted by neuF.raisedSoft (Onyx: no outline, no gray-slab fill).
  modalHeroCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
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
  // Generic field card (mirrors dDebtFieldCard) — borderless C.background + neu.
  modalFieldCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
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
    color: C.bronze,
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
  // Neu Pills (Onyx rule 3): faintDark neu over a barely-there base, olive-filled
  // when selected. neuF.raised is spread at the call site; no border.
  periodChip: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  periodChipActive: {
    backgroundColor: C.accent,
  },
  periodChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  periodChipTextActive: {
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },

  // Rollover row — extends modalFieldCard
  rolloverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Anchored save zone (mirrors dDebtSaveZone) — sits on C.background like the
  // sheet, not the C.surface slab (Onyx rule 1).
  modalSaveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.background,
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
  segmentChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentSoonBadge: {
    backgroundColor: withAlpha(C.bronze, 0.16),
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  segmentSoonText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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

  // ─── Hero card V3 — daily-allowance arc design ───
  heroCardV3: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    ...(C === CALM_DARK ? { ...SHADOWS.none, borderColor: withAlpha(C.textPrimary, 0.12) } : SHADOWS.sm),
  },
  heroTopRowV3: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: SPACING.md,
  },
  heroAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  heroAddBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    textTransform: 'lowercase',
  },
  heroPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
    marginRight: SPACING.sm,
  },
  heroPlanBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    textTransform: 'lowercase',
  },
  emptyPlanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  emptyPlanLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  heroEyebrowV3: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    textTransform: 'lowercase',
    flex: 1,
  },
  // ─── Open hero (borderless — breathes on the page, not a card) ───
  heroOpenV3: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.md,
  },
  // Warm gradient backdrop for the hero zone — sunrise wash behind the gauge
  heroGradientBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS['2xl'],
  },
  heroGaugeWrap: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  // Label stack sits below the arc — no overlap with the gauge
  heroLabelStack: {
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  // Pace-aware Manglish sub-line above the arc — the "alive" copy device
  heroGaugePaceLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary, // overridden inline to paceColor so it's always readable
    textTransform: 'lowercase',
    letterSpacing: 0.1,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  // Number wrapper inside HalfGauge — lifted into the bowl of the arc
  heroGaugeCenterWrap: {
    alignItems: 'center',
    paddingBottom: SPACING.lg,
  },
  heroGaugeAmount: {
    fontSize: 52,
    fontWeight: TYPOGRAPHY.weight.regular as any,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: -0.5,
    lineHeight: 56,
  },
  heroGaugePrefix: {
    fontSize: 23,
    fontWeight: TYPOGRAPHY.weight.regular as any,
    color: C.textSecondary,
    letterSpacing: 0,
  },
  heroGaugeSub: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    marginTop: 2,
    letterSpacing: 0.1,
    textTransform: 'lowercase',
  },
  // Free pace verdict — one honest line under the gauge (replaces the trust line)
  heroVerdictTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    marginTop: SPACING.xs,
    letterSpacing: 0.05,
    textAlign: 'center',
    textTransform: 'lowercase',
  },
  heroVerdictSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 3,
    letterSpacing: 0.05,
    textAlign: 'center',
    lineHeight: 16,
  },
  // "resets tomorrow" — small, muted temporal anchor
  heroResetsTomorrow: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 3,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  // "how we got this" info tap
  heroInfoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  heroInfoBtnText: {
    fontSize: 11,
    color: C.bronze,
    letterSpacing: 0.1,
  },
  // Gold glow bloom — sits behind the gauge, centered
  heroGlowBloom: {
    position: 'absolute',
    width: 220,
    height: 120,
    top: SPACING.lg,
    borderRadius: 110,
    backgroundColor: withAlpha(C.gold, C === CALM_DARK ? 0.22 : 0.18),
    alignSelf: 'center',
  },
  // Progress bar — thin version below captions (still used by playbook hero)
  heroTrackV3: {
    height: 4,
    backgroundColor: withAlpha(C.textMuted, 0.10),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  heroFillV3: {
    height: 4,
    borderRadius: RADIUS.full,
  },
  heroCaptionV3: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
  },
  heroStatusCaptionV3: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'] as any,
    textAlign: 'center',
    flexShrink: 1,
  },
  heroBigAmountV3: {
    marginTop: SPACING.sm,
    fontSize: 48,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'] as any,
  },
  heroBigPrefixV3: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },

  // ─── Category rows V3 (reference: avatar list) ───
  categoriesWrapV3: {
    marginBottom: SPACING.lg,
  },
  categoriesHeaderV3: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  categoriesHeaderTextV3: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  categoriesCountV3: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    overflow: 'hidden',
    backgroundColor: withAlpha(C.accent, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  // Onyx: borderless C.background list card lifted by neuF.raisedSoft (spread at
  // the call sites). Rows are transparent so the card's rounded corners + neu
  // shadow read cleanly without an overflow:hidden clip — which would sever the
  // faintDark shadow into a hard seam (see SubscriptionList's rowShadow note).
  categoriesCardV3: {
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
  },
  catRowV3: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    // Symmetric with paddingRight so the avatar doesn't hug the left edge, and so
    // the text start (paddingLeft + 52 + gap = 84) matches catRowDividerV3.marginLeft.
    paddingLeft: SPACING.md,
    paddingRight: SPACING.md,
    paddingVertical: SPACING.lg,
    minHeight: 80,
    // Transparent — the neu card behind supplies the C.background surface, so its
    // rounded corners stay visible (no opaque row squaring off the card edges).
    backgroundColor: 'transparent',
  },
  catAvatarV3: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catRowMidV3: {
    flex: 1,
  },
  catRowNameV3: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flexShrink: 1,
  },
  catRowSubV3: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'] as any,
  },
  catRowRightV3: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'] as any,
  },
  catRowRightLabelV3: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
  },
  catRowDividerV3: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    marginLeft: 52 + SPACING.md + SPACING.md,
  },

  // ─── Playbook list (reuses heroCardV3 + catRowV3 anatomy) ───
  pbHeroCountV3: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
    textTransform: 'lowercase',
  },
  pbHeroSubV3: {
    marginTop: SPACING.xs,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
  },
  pbHeroMetaRowV3: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  // Two-line playbook row layout (line1 = name+amount, line2 = meta+percent)
  pbRowLineV3: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  pbRowAmountV3: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    flexShrink: 0,
  },
  pbRowPercentV3: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'] as any,
    flexShrink: 0,
  },
  pbRowFlexV3: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  pbRowClosedV3: {
    opacity: 0.85,
  },

  // ─── Bills this week strip ───
  // ─── Commitments block (replaces billsStrip* + goalStrip*) ───
  // One borderless card on C.background — separation comes from neuF.raisedSoft
  // (spread at the call site), never a border or tinted fill (Onyx rules 2/3).
  // Light mode: the same raisedSoft spread renders the soft dual-shadow card.
  commitCard: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.xl,
    backgroundColor: C.background,
  },
  commitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md - 2,
  },
  commitGlyph: {
    width: 20,
    alignItems: 'center',
    marginTop: 2, // optically centers the 15px glyph on the title cap height
  },
  commitBody: {
    flex: 1,
    minWidth: 0,
  },
  commitTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    textTransform: 'lowercase',
    letterSpacing: 0.1,
  },
  commitSub: {
    marginTop: 3,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  // Trailing datum + chevron — row-level (not in the title line) so it stays
  // vertically centered against the goal row's 3-line body.
  commitTrail: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 3,
    flexShrink: 0,
  },
  commitValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  // iOS-style inset hairline: starts at the text column (pad + glyph + gap).
  commitDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
    marginLeft: SPACING.md + 20 + SPACING.sm + 4,
  },
  // 3px hairline gauge — replaces the 44px CircularProgress ring; track alpha
  // deliberately matches the hero gauge track so the two rhyme.
  commitBarTrack: {
    marginTop: SPACING.sm,
    height: 3,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, C === CALM_DARK ? 0.14 : 0.10),
    overflow: 'hidden',
  },
  commitBarFill: {
    height: '100%',
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
  },

  // ─── Math receipt sheet (how we got this) ───
  mathOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mathKAV: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mathCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS['2xl'],
    width: '88%',
    maxWidth: 420,
    padding: SPACING.xl,
    ...(C === CALM_DARK
      ? { borderWidth: 1, borderColor: C.border, ...SHADOWS.none }
      : SHADOWS.lg),
  },
  mathTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.lg,
    textTransform: 'lowercase',
  },
  mathRows: {
    gap: SPACING.sm,
  },
  mathRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  mathRowLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 20,
  },
  mathRowSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  mathRowAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    flexShrink: 0,
  },
  mathDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: SPACING.xs,
  },
  mathCloseBtn: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    alignItems: 'center',
  },
  mathCloseBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },

  // ─── "Kept" reward note — gentle olive warm line, not a celebration ───
  heroKeptNote: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.15),
  },
  heroKeptDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 5,
    flexShrink: 0,
  },
  heroKeptText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    lineHeight: 18,
  },
  heroKeptLabel: {
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

});

export default BudgetPlanning;
