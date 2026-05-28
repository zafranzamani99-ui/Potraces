import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import {
  format,
  differenceInCalendarDays,
  isValid,
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  subMonths,
} from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import {
  CALM,
  CALM_DARK,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  SHADOWS,
  withAlpha,
} from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import Sparkline from '../../components/common/Sparkline';
import CalendarPicker from '../../components/common/CalendarPicker';
import EmptyState from '../../components/common/EmptyState';
import FAB from '../../components/common/FAB';
import ScreenGuide from '../../components/common/ScreenGuide';
import CollapsibleSection from '../../components/common/CollapsibleSection';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, successNotification, selectionChanged } from '../../services/haptics';
import { Goal, GoalContribution } from '../../types';
import ModalToastHost from '../../components/common/ModalToastHost';

// ── ICON & COLOR PRESETS ──────────────────────────────────────
const GOAL_ICONS: (keyof typeof Feather.glyphMap)[] = [
  'target',
  'star',
  'home',
  'smartphone',
  'truck',
  'send',
  'gift',
  'heart',
  'book',
  'coffee',
  'shopping-bag',
  'music',
  'shield',
  'flag',
];

const GOAL_COLORS = [
  '#4F5104', // C.accent (olive)
  '#2E7D5B', // C.positive (green)
  '#E67E22', // warm orange
  '#3498DB', // sky blue
  '#9B59B6', // amethyst purple
  '#C1694F', // warm terracotta (was red — fixed)
  '#1ABC9C', // teal
  '#F39C12', // golden amber
];

// ── QUICK CONTRIBUTE AMOUNTS ──────────────────────────────────
const QUICK_AMOUNTS = [10, 50, 100, 500];

// ── FILTER TYPES ──────────────────────────────────────────────
type GoalFilter = 'all' | 'active' | 'completed' | 'paused';
type GoalSort = 'manual' | 'deadline' | 'progress';

// ── ENCOURAGING MESSAGES ──────────────────────────────────────
// Localized version defined inside component via useT()

// ── CIRCULAR PROGRESS RING ───────────────────────────────────
const CircularProgress = ({ size, strokeWidth, percentage, color, trackColor, children }: {
  size: number; strokeWidth: number; percentage: number;
  color: string; trackColor: string; children?: React.ReactNode;
}) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(percentage, 100) / 100);
  const half = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle cx={half} cy={half} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <SvgCircle
          cx={half} cy={half} r={r}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          originX={half}
          originY={half}
        />
      </Svg>
      {children}
    </View>
  );
};

const MAX_GOALS = 10;

// ── MAIN COMPONENT ────────────────────────────────────────────
const Goals: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const navigation = useNavigation<any>();

  // ── Observation helper (i18n) ──
  const getObservation = useCallback((percentage: number): string => {
    if (percentage >= 100) return t.goals.goalReached;
    if (percentage >= 75) return t.goals.almostThere;
    if (percentage >= 50) return t.goals.halfway;
    if (percentage >= 25) return t.goals.quarterSaved;
    if (percentage >= 10) return t.goals.gettingStarted;
    return '';
  }, [t]);

  // ── Goal templates (i18n) ──
  const goalTemplates = useMemo(() => [
    { name: t.goals.emergencyFund, icon: 'shield' as const, color: '#4F5104' },
    { name: t.goals.rayaSavings, icon: 'gift' as const, color: '#F39C12' },
    { name: t.goals.travel, icon: 'send' as const, color: '#E67E22' },
    { name: t.goals.gadgetFund, icon: 'smartphone' as const, color: '#9B59B6' },
    { name: t.goals.downpayment, icon: 'home' as const, color: '#3498DB' },
    { name: t.goals.education, icon: 'book' as const, color: '#8B7355' },
  ], [t]);

  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const goals = usePersonalStore((s) => s.goals);
  const addGoal = usePersonalStore((s) => s.addGoal);
  const updateGoal = usePersonalStore((s) => s.updateGoal);
  const deleteGoal = usePersonalStore((s) => s.deleteGoal);
  const contributeToGoal = usePersonalStore((s) => s.contributeToGoal);
  const removeContribution = usePersonalStore((s) => s.removeContribution);
  const archiveGoal = usePersonalStore((s) => s.archiveGoal);
  const unarchiveGoal = usePersonalStore((s) => s.unarchiveGoal);
  const pauseGoal = usePersonalStore((s) => s.pauseGoal);
  const resumeGoal = usePersonalStore((s) => s.resumeGoal);
  const currency = useSettingsStore((s) => s.currency);
  const wallets = useWalletStore((s) => s.wallets);

  // ── Filter / Sort state ──
  const [filter, setFilter] = useState<GoalFilter>('all');
  const [sort, setSort] = useState<GoalSort>('manual');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // ── Add/Edit Goal Modal state ──
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadline, setGoalDeadline] = useState<Date | undefined>(undefined);
  const [showCalendar, setShowCalendar] = useState(false);
  const [goalIcon, setGoalIcon] = useState<keyof typeof Feather.glyphMap>('target');
  const [goalColor, setGoalColor] = useState(GOAL_COLORS[0]);

  // ── Contribute Modal state ──
  const [contributeModalVisible, setContributeModalVisible] = useState(false);
  const [contributingGoal, setContributingGoal] = useState<Goal | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeNote, setContributeNote] = useState('');
  const [contributeWalletId, setContributeWalletId] = useState<string | undefined>(undefined);
  const [isWithdrawMode, setIsWithdrawMode] = useState(false);
  const withdrawFromGoal = usePersonalStore((s) => s.withdrawFromGoal);

  // ── History Modal state ──
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyGoal, setHistoryGoal] = useState<Goal | null>(null);

  // ── Form sheet animation shared values ──
  const goalSheetY = useSharedValue(SCREEN_H);
  const goalDragStart = useSharedValue(0);
  const goalClosingRef = useRef(false);
  const contribSheetY = useSharedValue(SCREEN_H);
  const contribDragStart = useSharedValue(0);
  const contribClosingRef = useRef(false);
  const historySheetY = useSharedValue(SCREEN_H);
  const historyDragStart = useSharedValue(0);
  const historyClosingRef = useRef(false);

  // ── Derived data ──
  const goalsList: Goal[] = goals || [];
  const activeGoals = useMemo(() => goalsList.filter((g) => !g.isArchived), [goalsList]);

  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const monthEnd = useMemo(() => endOfMonth(now), [now]);
  const lastMonthStart = useMemo(() => startOfMonth(subMonths(now, 1)), [now]);
  const lastMonthEnd = useMemo(() => endOfMonth(subMonths(now, 1)), [now]);

  // ── Monthly contribution totals ──
  const monthlyContrib = useMemo(() => {
    let thisMonth = 0;
    let lastMonth = 0;
    goalsList.forEach((g) => {
      (g.contributions || []).forEach((c) => {
        if (c.amount <= 0) return;
        const d = c.date instanceof Date ? c.date : new Date(c.date);
        if (isWithinInterval(d, { start: monthStart, end: monthEnd })) thisMonth += c.amount;
        if (isWithinInterval(d, { start: lastMonthStart, end: lastMonthEnd })) lastMonth += c.amount;
      });
    });
    return { thisMonth, lastMonth };
  }, [goalsList, monthStart, monthEnd, lastMonthStart, lastMonthEnd]);

  const summary = useMemo(() => {
    const active = activeGoals;
    const totalSaved = active.reduce((sum, g) => sum + g.currentAmount, 0);
    const totalTarget = active.reduce((sum, g) => sum + g.targetAmount, 0);
    const overallPercentage = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
    const completedCount = active.filter((g) => g.currentAmount >= g.targetAmount).length;
    const activeCount = active.length - completedCount;
    return { totalSaved, totalTarget, overallPercentage, completedCount, activeCount };
  }, [activeGoals]);

  // ── Filtered + sorted goals ──
  const filteredGoals = useMemo(() => {
    let list = [...activeGoals];
    switch (filter) {
      case 'active':
        list = list.filter((g) => g.currentAmount < g.targetAmount && !g.isPaused);
        break;
      case 'completed':
        list = list.filter((g) => g.currentAmount >= g.targetAmount);
        break;
      case 'paused':
        list = list.filter((g) => g.isPaused);
        break;
    }
    if (sort === 'deadline') {
      list = [...list].sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
    } else if (sort === 'progress') {
      list = [...list].sort((a, b) => {
        const pctA = a.targetAmount > 0 ? a.currentAmount / a.targetAmount : 0;
        const pctB = b.targetAmount > 0 ? b.currentAmount / b.targetAmount : 0;
        return pctB - pctA;
      });
    }
    return list;
  }, [activeGoals, filter, sort]);

  const enrichedGoals = useMemo(() =>
    filteredGoals.map((goal) => {
      const percentage = goal.targetAmount > 0
        ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
        : 0;
      const isCompleted = goal.currentAmount >= goal.targetAmount;
      const daysUntilDeadline = goal.deadline
        ? differenceInCalendarDays(new Date(goal.deadline), new Date())
        : null;

      // Pace calculation
      let paceDaily: number | null = null;
      let paceMonthly: number | null = null;
      if (goal.deadline && daysUntilDeadline !== null && daysUntilDeadline > 0 && !isCompleted) {
        const remaining = goal.targetAmount - goal.currentAmount;
        paceDaily = remaining / daysUntilDeadline;
        paceMonthly = remaining / (daysUntilDeadline / 30);
      }

      // Sparkline data — last 8 contribution amounts
      const sparkData = (goal.contributions || [])
        .filter((c) => c.amount > 0)
        .slice(-8)
        .map((c) => c.amount);

      // Last contribution info
      const lastContrib = goal.contributions?.length > 0
        ? goal.contributions[goal.contributions.length - 1]
        : null;
      const lastContribDaysAgo = lastContrib
        ? Math.floor((Date.now() - new Date(lastContrib.date).getTime()) / 86400000)
        : null;

      return {
        ...goal,
        percentage,
        isCompleted,
        daysUntilDeadline,
        paceDaily,
        paceMonthly,
        sparkData,
        lastContribDaysAgo,
      };
    }), [filteredGoals]);

  // ── Form reset ──
  const resetGoalForm = useCallback(() => {
    setEditingGoal(null);
    setGoalName('');
    setGoalTarget('');
    setGoalDeadline(undefined);
    setShowCalendar(false);
    setGoalIcon('target');
    setGoalColor(GOAL_COLORS[0]);
  }, []);

  // ── Close modals (animated) ──
  const goalFinishClose = useCallback(() => {
    if (!goalClosingRef.current) return;
    goalClosingRef.current = false;
    setGoalModalVisible(false);
    resetGoalForm();
  }, [resetGoalForm]);

  const closeGoalModal = useCallback(() => {
    if (goalClosingRef.current) return;
    goalClosingRef.current = true;
    Keyboard.dismiss();
    goalSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(goalFinishClose)();
    });
  }, [SCREEN_H, goalSheetY, goalFinishClose]);

  const contribFinishClose = useCallback(() => {
    if (!contribClosingRef.current) return;
    contribClosingRef.current = false;
    setContributeModalVisible(false);
    setContributingGoal(null);
    setIsWithdrawMode(false);
  }, []);

  const closeContributeModal = useCallback(() => {
    if (contribClosingRef.current) return;
    contribClosingRef.current = true;
    Keyboard.dismiss();
    contribSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(contribFinishClose)();
    });
  }, [SCREEN_H, contribSheetY, contribFinishClose]);

  const historyFinishClose = useCallback(() => {
    if (!historyClosingRef.current) return;
    historyClosingRef.current = false;
    setHistoryModalVisible(false);
    setHistoryGoal(null);
  }, []);

  const closeHistoryModal = useCallback(() => {
    if (historyClosingRef.current) return;
    historyClosingRef.current = true;
    historySheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(historyFinishClose)();
    });
  }, [SCREEN_H, historySheetY, historyFinishClose]);

  // ── Open Add Modal ──
  const openAddGoal = useCallback(() => {
    if (goalsList.length >= MAX_GOALS) {
      showToast(t.goals.maxGoals.replace('{n}', String(MAX_GOALS)), 'error');
      return;
    }
    resetGoalForm();
    goalClosingRef.current = false;
    goalSheetY.value = SCREEN_H;
    setGoalModalVisible(true);
  }, [goalsList.length, resetGoalForm, showToast, SCREEN_H, goalSheetY]);

  // ── Open Edit Modal ──
  const openEditGoal = useCallback((goal: Goal) => {
    lightTap();
    setEditingGoal(goal);
    setGoalName(goal.name);
    setGoalTarget(goal.targetAmount.toString());
    setGoalDeadline(goal.deadline ? new Date(goal.deadline) : undefined);
    setShowCalendar(!!goal.deadline);
    setGoalIcon(goal.icon as keyof typeof Feather.glyphMap);
    setGoalColor(goal.color);
    goalClosingRef.current = false;
    goalSheetY.value = SCREEN_H;
    setGoalModalVisible(true);
  }, [SCREEN_H, goalSheetY]);

  // ── Save Goal ──
  const handleSaveGoal = useCallback(() => {
    if (!goalName.trim()) {
      showToast(t.goals.enterGoalName, 'error');
      return;
    }
    const target = parseFloat(goalTarget);
    if (!target || target <= 0) {
      showToast(t.goals.enterValidTarget, 'error');
      return;
    }

    if (editingGoal) {
      updateGoal(editingGoal.id, {
        name: goalName.trim(),
        targetAmount: target,
        deadline: goalDeadline,
        icon: goalIcon,
        color: goalColor,
      });
      showToast(t.goals.goalUpdated, 'success');
    } else {
      addGoal({
        name: goalName.trim(),
        targetAmount: target,
        deadline: goalDeadline,
        category: 'general',
        icon: goalIcon,
        color: goalColor,
      });
      showToast(t.goals.goalCreated, 'success');
    }

    closeGoalModal();
  }, [
    goalName,
    goalTarget,
    goalDeadline,
    goalIcon,
    goalColor,
    editingGoal,
    addGoal,
    updateGoal,
    closeGoalModal,
    showToast,
  ]);

  // ── Delete Goal ──
  const handleDeleteGoal = useCallback(
    (goal: Goal) => {
      lightTap();
      Alert.alert(
        t.goals.deleteGoal,
        t.goals.removeGoalConfirm.replace('{name}', goal.name),
        [
          { text: t.common.cancel, style: 'cancel' },
          {
            text: t.common.delete,
            style: 'destructive',
            onPress: () => {
              deleteGoal(goal.id);
              showToast(t.goals.goalRemoved, 'success');
            },
          },
        ]
      );
    },
    [deleteGoal, showToast, t]
  );

  // ── Open Contribute Modal ──
  const openContribute = useCallback((goal: Goal, presetAmount?: number, withdraw?: boolean) => {
    lightTap();
    setContributingGoal(goal);
    setContributeAmount(presetAmount ? presetAmount.toString() : '');
    setContributeNote('');
    setContributeWalletId(withdraw ? undefined : (goal.walletId || undefined));
    setIsWithdrawMode(!!withdraw);
    contribClosingRef.current = false;
    contribSheetY.value = SCREEN_H;
    setContributeModalVisible(true);
  }, [SCREEN_H, contribSheetY]);

  // ── Handle Contribution ──
  const handleContribute = useCallback(() => {
    if (!contributingGoal) return;

    const rawAmount = parseFloat(contributeAmount);
    if (!rawAmount || rawAmount <= 0) {
      showToast(t.goals.enterValidAmount, 'error');
      return;
    }

    // Cap to remaining so we don't over-contribute or over-deduct
    const remaining = contributingGoal.targetAmount - contributingGoal.currentAmount;
    const amount = remaining > 0 ? Math.min(rawAmount, remaining) : rawAmount;

    // Snapshot milestones BEFORE contribution
    const milestonesBefore = contributingGoal.milestones
      ? contributingGoal.milestones.filter((m) => m.reached).length
      : 0;

    // Perform contribution
    contributeToGoal(
      contributingGoal.id,
      amount,
      contributeNote.trim() || undefined,
      contributeWalletId || undefined
    );

    // Deduct from wallet if selected
    if (contributeWalletId) {
      useWalletStore.getState().deductFromWallet(contributeWalletId, amount);
    }

    // Check milestones AFTER
    const newAmount = contributingGoal.currentAmount + amount;
    const newPercentage =
      contributingGoal.targetAmount > 0
        ? (newAmount / contributingGoal.targetAmount) * 100
        : 0;

    const milestonesAfter = [25, 50, 75, 100].filter(
      (pct) => newPercentage >= pct
    ).length;

    if (milestonesAfter > milestonesBefore) {
      const crossedPct = [25, 50, 75, 100].find(
        (pct) =>
          newPercentage >= pct &&
          contributingGoal.currentAmount / contributingGoal.targetAmount * 100 < pct
      );
      if (crossedPct === 100) {
        successNotification();
        showToast(t.goals.goalReached, 'success');
      } else if (crossedPct) {
        mediumTap();
        showToast(t.goals.milestoneReached.replace('{n}', String(crossedPct)), 'success');
      } else {
        showToast(t.goals.contributionAdded, 'success');
      }
    } else {
      showToast(t.goals.contributionAdded, 'success');
    }

    closeContributeModal();
  }, [contributingGoal, contributeAmount, contributeNote, contributeWalletId, contributeToGoal, closeContributeModal, showToast, currency, t]);

  // ── Handle Withdraw ──
  const handleWithdraw = useCallback(() => {
    if (!contributingGoal) return;
    const amount = parseFloat(contributeAmount);
    if (!amount || amount <= 0) {
      showToast(t.goals.enterValidAmount, 'error');
      return;
    }
    const capped = Math.min(amount, contributingGoal.currentAmount);
    if (capped <= 0) {
      showToast(t.goals.nothingToWithdraw, 'error');
      return;
    }
    withdrawFromGoal(contributingGoal.id, capped, contributeNote.trim() || undefined);

    // Return to wallet if one was selected
    if (contributeWalletId) {
      useWalletStore.getState().addToWallet(contributeWalletId, capped);
    }

    lightTap();
    showToast(`${currency} ${capped.toFixed(2)} ${t.goals.withdrawn}`, 'success');
    closeContributeModal();
  }, [contributingGoal, contributeAmount, contributeNote, contributeWalletId, withdrawFromGoal, closeContributeModal, showToast, currency, t]);

  // ── Handle undo contribution ──
  const handleUndoContribution = useCallback((goalId: string, contrib: GoalContribution) => {
    Alert.alert(
      t.goals.removeContribution,
      t.goals.removeContribConfirm.replace('{currency}', currency).replace('{amount}', Math.abs(contrib.amount).toFixed(2)),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => {
            // Refund wallet if contribution was charged to one
            if (contrib.walletId) {
              if (contrib.amount < 0) {
                // Withdrawal undo: take money back from wallet
                useWalletStore.getState().deductFromWallet(contrib.walletId, Math.abs(contrib.amount));
              } else {
                // Contribution undo: refund money to wallet
                useWalletStore.getState().addToWallet(contrib.walletId, contrib.amount);
              }
            }
            removeContribution(goalId, contrib.id);
            showToast(t.goals.contributionRemoved, 'success');
            const updated = usePersonalStore.getState().goals.find((g) => g.id === goalId);
            if (updated) setHistoryGoal(updated);
          },
        },
      ]
    );
  }, [removeContribution, showToast, currency, t]);

  // ── Pause / Resume ──
  const handleTogglePause = useCallback((goal: Goal) => {
    selectionChanged();
    if (goal.isPaused) {
      resumeGoal(goal.id);
      showToast(t.goals.goalResumed, 'success');
    } else {
      pauseGoal(goal.id);
      showToast(t.goals.goalPaused, 'success');
    }
  }, [pauseGoal, resumeGoal, showToast, t]);

  // ── Archive / Unarchive ──
  const handleArchive = useCallback((goal: Goal) => {
    lightTap();
    archiveGoal(goal.id);
    showToast(t.goals.goalArchived, 'success');
  }, [archiveGoal, showToast, t]);

  const handleUnarchive = useCallback((goalId: string) => {
    lightTap();
    unarchiveGoal(goalId);
    showToast(t.goals.goalRestored, 'success');
  }, [unarchiveGoal, showToast, t]);

  const archivedGoals = useMemo(() => goalsList.filter((g) => g.isArchived), [goalsList]);

  // ── Open History Modal ──
  const openHistory = useCallback((goal: Goal) => {
    lightTap();
    historyClosingRef.current = false;
    historySheetY.value = SCREEN_H;
    setHistoryGoal(goal);
    setHistoryModalVisible(true);
  }, [SCREEN_H, historySheetY]);

  // ── Render Milestone Dots ──
  const renderMilestoneDots = useCallback((goal: Goal) => {
    const milestonePercentages = [25, 50, 75, 100];
    const currentPct =
      goal.targetAmount > 0
        ? (goal.currentAmount / goal.targetAmount) * 100
        : 0;

    return (
      <View style={styles.milestoneDots}>
        {milestonePercentages.map((pct) => {
          const isReached = currentPct >= pct;
          const milestoneData = goal.milestones?.find(
            (m) => m.percentage === pct
          );
          const reached = isReached || milestoneData?.reached;

          return (
            <View key={pct} style={styles.milestoneDotContainer}>
              <View
                style={[
                  styles.milestoneDot,
                  reached
                    ? { backgroundColor: goal.color }
                    : { backgroundColor: C.border },
                ]}
                accessibilityLabel={`${pct}% milestone ${reached ? 'reached' : 'not yet reached'}`}
              />
              <Text
                style={[
                  styles.milestoneDotLabel,
                  reached && { color: goal.color },
                ]}
              >
                {pct}%
              </Text>
            </View>
          );
        })}
      </View>
    );
  }, []);

  // ── History modal grouped contributions ──
  const historyGroups = useMemo(() => {
    if (!historyGoal) return [];
    const contribs = [...(historyGoal.contributions || [])].reverse();
    const groups: { label: string; items: GoalContribution[] }[] = [];
    let currentLabel = '';
    contribs.forEach((c) => {
      const d = c.date instanceof Date ? c.date : new Date(c.date);
      const label = isValid(d) ? format(d, 'MMMM yyyy') : t.goals.unknown;
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, items: [] });
      }
      groups[groups.length - 1].items.push(c);
    });
    return groups;
  }, [historyGoal, t]);

  const historyStats = useMemo(() => {
    if (!historyGoal) return { total: 0, avg: 0, count: 0 };
    const positives = (historyGoal.contributions || []).filter((c) => c.amount > 0);
    const total = positives.reduce((s, c) => s + c.amount, 0);
    const count = positives.length;
    return { total, avg: count > 0 ? total / count : 0, count };
  }, [historyGoal]);

  // ── Goal Detail Sheet state + animation ──
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);
  const detailSheetY = useSharedValue(SCREEN_H);
  const detailDragStart = useSharedValue(0);
  const detailClosingRef = useRef(false);

  const detailFinishClose = useCallback(() => {
    if (!detailClosingRef.current) return;
    detailClosingRef.current = false;
    setDetailGoal(null);
  }, []);

  const closeGoalDetail = useCallback(() => {
    if (detailClosingRef.current) return;
    detailClosingRef.current = true;
    detailSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(detailFinishClose)();
    });
  }, [SCREEN_H, detailSheetY, detailFinishClose]);

  const openGoalDetail = useCallback((goal: Goal) => {
    lightTap();
    detailClosingRef.current = false;
    detailSheetY.value = SCREEN_H;
    setDetailGoal(goal);
  }, [SCREEN_H, detailSheetY]);

  useEffect(() => {
    if (detailGoal) {
      detailSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [detailGoal, detailSheetY]);

  const detailSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          detailDragStart.value = detailSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = detailDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          detailSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(closeGoalDetail)();
          } else {
            detailSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    [SCREEN_H, closeGoalDetail, detailSheetY, detailDragStart]
  );

  const detailSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: detailSheetY.value }],
  }));
  const detailBackdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(detailSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Goal form sheet animation ──
  useEffect(() => {
    if (goalModalVisible) {
      goalSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [goalModalVisible, goalSheetY]);

  const goalSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => { 'worklet'; goalDragStart.value = goalSheetY.value; })
        .onUpdate((e) => {
          'worklet';
          let newY = goalDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          goalSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeGoalModal)();
          } else {
            goalSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    [closeGoalModal, goalSheetY, goalDragStart]
  );

  const goalSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: goalSheetY.value }],
  }));
  const goalBackdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(goalSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Contribute sheet animation ──
  useEffect(() => {
    if (contributeModalVisible) {
      contribSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [contributeModalVisible, contribSheetY]);

  const contribSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => { 'worklet'; contribDragStart.value = contribSheetY.value; })
        .onUpdate((e) => {
          'worklet';
          let newY = contribDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          contribSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeContributeModal)();
          } else {
            contribSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    [closeContributeModal, contribSheetY, contribDragStart]
  );

  const contribSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contribSheetY.value }],
  }));
  const contribBackdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(contribSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── History sheet animation ──
  useEffect(() => {
    if (historyModalVisible) {
      historySheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [historyModalVisible, historySheetY]);

  const historySheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => { 'worklet'; historyDragStart.value = historySheetY.value; })
        .onUpdate((e) => {
          'worklet';
          let newY = historyDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          historySheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeHistoryModal)();
          } else {
            historySheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    [closeHistoryModal, historySheetY, historyDragStart]
  );

  const historySheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: historySheetY.value }],
  }));
  const historyBackdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(historySheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Swipeable refs ──
  const swipeRefs = useRef<Map<string, React.RefObject<SwipeableMethods | null>>>(new Map());
  const getSwipeRef = useCallback((id: string): React.RefObject<SwipeableMethods | null> => {
    let ref = swipeRefs.current.get(id);
    if (!ref) {
      ref = React.createRef<SwipeableMethods | null>();
      swipeRefs.current.set(id, ref);
    }
    return ref;
  }, []);
  const closeAllSwipeables = useCallback(() => {
    swipeRefs.current.forEach((ref) => ref.current?.close());
  }, []);

  // ── Filter pills ──
  const filterOptions = useMemo<{ key: GoalFilter; label: string }[]>(() => [
    { key: 'all', label: t.goals.all },
    { key: 'active', label: t.goals.active },
    { key: 'completed', label: t.goals.done },
    { key: 'paused', label: t.goals.paused },
  ], [t]);

  const sortOptions = useMemo<{ key: GoalSort; label: string; icon: keyof typeof Feather.glyphMap }[]>(() => [
    { key: 'manual', label: t.goals.defaultSort, icon: 'list' },
    { key: 'deadline', label: t.goals.deadline, icon: 'calendar' },
    { key: 'progress', label: t.goals.progress, icon: 'trending-up' },
  ], [t]);

  // ── Apply template ──
  const applyTemplate = useCallback((template: typeof goalTemplates[0]) => {
    selectionChanged();
    setGoalName(template.name);
    setGoalIcon(template.icon);
    setGoalColor(template.color);
  }, [goalTemplates]);

  // ── Swipe action renderers ──
  const GoalSwipeEdit = useCallback(({ drag }: { drag: SharedValue<number> }) => {
    const animStyle = useAnimatedStyle(() => {
      const w = Math.min(Math.abs(drag.value), 80);
      return { width: w, opacity: w > 20 ? 1 : 0 };
    });
    return (
      <Reanimated.View style={[styles.swipeAction, styles.swipeEdit, animStyle]}>
        <Feather name="edit-2" size={18} color={C.onAccent} />
      </Reanimated.View>
    );
  }, [C, styles]);

  const GoalSwipeDelete = useCallback(({ drag }: { drag: SharedValue<number> }) => {
    const animStyle = useAnimatedStyle(() => {
      const w = Math.min(Math.abs(drag.value), 80);
      return { width: w, opacity: w > 20 ? 1 : 0 };
    });
    return (
      <Reanimated.View style={[styles.swipeAction, styles.swipeDelete, animStyle]}>
        <Feather name="trash-2" size={18} color="#fff" />
      </Reanimated.View>
    );
  }, [styles]);

  return (
    <View style={styles.container}>
      <ScreenGuide
        id="goals-guide"
        title={t.goals.screenGuideTitle ?? 'track your savings goals'}
        description={t.goals.screenGuideDesc ?? 'set targets, contribute regularly, and watch your progress grow'}
        icon="target"
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => { Keyboard.dismiss(); closeAllSwipeables(); }}
      >
        {activeGoals.length > 0 ? (
          <>
            {/* ── Filter & Sort Pills ── */}
            <View style={styles.filterRow}>
              {filterOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
                  onPress={() => { selectionChanged(); setFilter(opt.key); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: filter === opt.key }}
                >
                  <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.sortPill, sort !== 'manual' && styles.sortPillActive]}
                onPress={() => setShowSortMenu(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              >
                <Feather name="sliders" size={13} color={sort !== 'manual' ? C.onAccent : C.textMuted} />
                <Text style={[styles.sortPillText, sort !== 'manual' && styles.sortPillTextActive]}>
                  {sort === 'manual' ? (t.goals.sortBy ?? 'sort by') : sort === 'deadline' ? t.goals.deadline : t.goals.progress}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Goal Cards (grid) ── */}
            {enrichedGoals.length > 0 ? (
              <Reanimated.View entering={FadeInDown.duration(300).delay(100)} style={styles.goalGrid}>
                {enrichedGoals.map((goal) => {
                  const { percentage, isCompleted } = goal;
                  return (
                    <Pressable
                      key={goal.id}
                      style={({ pressed }) => [
                        styles.goalCard,
                        { width: (SCREEN_W - SPACING.xl * 2 - SPACING.md) / 2 },
                        goal.isPaused && { opacity: 0.5 },
                        pressed && { opacity: goal.isPaused ? 0.3 : 0.7 },
                      ]}
                      onPress={() => openGoalDetail(goal)}
                    >
                      <CircularProgress
                        size={48}
                        strokeWidth={3.5}
                        percentage={goal.isPaused ? 0 : percentage}
                        color={goal.isPaused ? C.neutral : goal.color}
                        trackColor={withAlpha(C.textPrimary, 0.1)}
                      >
                        <Feather
                          name={(goal.icon as keyof typeof Feather.glyphMap) || 'target'}
                          size={18}
                          color={goal.isPaused ? C.neutral : goal.color}
                        />
                      </CircularProgress>
                      <Text style={[styles.goalCardName, goal.isPaused && { color: C.neutral }]} numberOfLines={1}>
                        {goal.name}
                      </Text>
                      <Text style={styles.goalCardAmount}>
                        {currency} {goal.currentAmount.toFixed(2)}
                      </Text>
                      <Text style={styles.goalCardTarget}>
                        {currency} {goal.targetAmount.toFixed(2)}
                      </Text>
                    </Pressable>
                  );
                })}
              </Reanimated.View>
            ) : (
              <View style={styles.noResults}>
                <Feather name="search" size={36} color={C.textMuted} />
                <Text style={styles.noResultsTitle}>{t.goals.noResultsFound}</Text>
                <Text style={styles.noResultsText}>{t.goals.tryDifferentFilter}</Text>
              </View>
            )}

            {/* ── Archived ── */}
            {archivedGoals.length > 0 && (
              <CollapsibleSection
                title={t.goals.archived}
                subtitle={`${archivedGoals.length} ${archivedGoals.length > 1 ? t.goals.goals : t.goals.goal}`}
              >
                <View style={styles.groupCard}>
                  {archivedGoals.map((goal, index) => {
                    const pct = goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0;
                    return (
                      <React.Fragment key={goal.id}>
                        {index > 0 && <View style={styles.cardDivider} />}
                        <View style={styles.archivedItem}>
                          <View style={[styles.goalIconWrap, { backgroundColor: withAlpha(goal.color, 0.08) }]}>
                            <Feather name={goal.icon as keyof typeof Feather.glyphMap} size={16} color={goal.color} />
                          </View>
                          <View style={styles.goalContent}>
                            <Text style={styles.archivedName} numberOfLines={1}>{goal.name}</Text>
                            <Text style={styles.archivedAmount}>
                              {currency} {goal.currentAmount.toLocaleString()} / {currency} {goal.targetAmount.toLocaleString()} · {pct}%
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.restoreBtn}
                            onPress={() => handleUnarchive(goal.id)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            accessibilityRole="button"
                            accessibilityLabel={t.goals.restore}
                          >
                            <Feather name="rotate-ccw" size={14} color={C.accent} />
                          </TouchableOpacity>
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              </CollapsibleSection>
            )}
          </>
        ) : (
          /* ── Empty State ── */
          <EmptyState
            icon="target"
            title={t.goals.whatSavingFor}
            message={t.goals.setGoalWatch}
            actionLabel={t.goals.addGoal}
            onAction={() => { lightTap(); openAddGoal(); }}
          />
        )}
      </ScrollView>

      {/* ── FAB ── */}
      {activeGoals.length > 0 && goalsList.length < MAX_GOALS && (
        <FAB
          onPress={openAddGoal}
          style={{ bottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.md) }}
        />
      )}

      {/* ═══ ADD / EDIT GOAL SHEET ═══ */}
      {goalModalVisible && <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeGoalModal}>
        <View style={StyleSheet.absoluteFill}>
          <Reanimated.View style={[styles.detailBackdrop, goalBackdropAnimStyle]}>
            <Pressable style={{ flex: 1 }} onPress={closeGoalModal} />
          </Reanimated.View>
          <Reanimated.View style={[styles.detailSheetContainer, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }, goalSheetAnimStyle]}>
            <GestureDetector gesture={goalSheetGesture}>
              <View collapsable={false}>
                <View style={styles.detailTopRow}>
                  <View style={styles.detailHandle} />
                  <TouchableOpacity style={styles.detailCloseX} onPress={closeGoalModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Feather name="x" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.detailTitleZone}>
                  <View style={[styles.detailIconWrap, { backgroundColor: withAlpha(goalColor, 0.12) }]}>
                    <Feather name={goalIcon} size={24} color={goalColor} />
                  </View>
                  <Text style={styles.detailTitle}>
                    {editingGoal ? t.goals.editGoalTitle : t.goals.createGoal}
                  </Text>
                  <Text style={styles.detailSubtitle}>{t.goals.setGoalWatch}</Text>
                </View>
              </View>
            </GestureDetector>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.detailScrollContent}>
                {/* Templates */}
                {!editingGoal && (
                  <View style={styles.detailFieldCard}>
                    <Text style={styles.detailFieldLabel}>{t.goals.quickStart}</Text>
                    <View style={[styles.hScrollFadeWrap, { marginRight: -SPACING.lg }]}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: SPACING['2xl'] }}>
                        {goalTemplates.map((tmpl) => (
                          <TouchableOpacity
                            key={tmpl.name}
                            style={[styles.templateChip, goalName === tmpl.name && { backgroundColor: withAlpha(tmpl.color, 0.12), borderColor: tmpl.color }]}
                            onPress={() => applyTemplate(tmpl)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            accessibilityRole="button"
                            accessibilityLabel={tmpl.name}
                            accessibilityState={{ selected: goalName === tmpl.name }}
                          >
                            <Feather name={tmpl.icon} size={14} color={goalName === tmpl.name ? tmpl.color : C.textSecondary} />
                            <Text style={[styles.templateChipText, goalName === tmpl.name && { color: tmpl.color }]}>{tmpl.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <LinearGradient colors={['transparent', C.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.hScrollFade} pointerEvents="none" />
                    </View>
                  </View>
                )}

                {/* Name + Amount */}
                <View style={styles.detailFieldCard}>
                  <Text style={styles.detailFieldLabel}>{t.goals.name}</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={goalName}
                    onChangeText={setGoalName}
                    placeholder={t.goals.namePlaceholder}
                    placeholderTextColor={C.textMuted}
                    returnKeyType="next"
                    maxLength={50}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />
                  <Text style={[styles.detailFieldLabel, { marginTop: SPACING.lg }]}>{t.goals.amount}</Text>
                  <View style={styles.amountRow}>
                    <Text style={styles.amountPrefix}>{currency}</Text>
                    <TextInput
                      style={[styles.fieldInput, { flex: 1 }]}
                      value={goalTarget}
                      onChangeText={setGoalTarget}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      placeholderTextColor={C.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                    />
                  </View>
                </View>

                {/* Deadline */}
                <View style={styles.detailFieldCard}>
                  <Text style={styles.detailFieldLabel}>{t.goals.deadlineOptional}</Text>
                  {!showCalendar ? (
                    <TouchableOpacity
                      style={styles.fieldTouchable}
                      onPress={() => { lightTap(); setShowCalendar(true); if (!goalDeadline) setGoalDeadline(new Date()); }}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.fieldTouchableText}>
                        {goalDeadline ? format(goalDeadline, 'dd MMM yyyy') : t.goals.setDeadline}
                      </Text>
                      <Feather name="calendar" size={16} color={C.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <View>
                      <CalendarPicker value={goalDeadline || new Date()} minimumDate={new Date()} onChange={(date) => setGoalDeadline(date)} />
                      <TouchableOpacity
                        style={styles.clearDeadlineBtn}
                        onPress={() => { setGoalDeadline(undefined); setShowCalendar(false); }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t.goals.clearDeadline}
                      >
                        <Text style={styles.clearDeadlineText}>{t.goals.clearDeadline}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Icon + Color */}
                <View style={styles.detailFieldCard}>
                  <Text style={styles.detailFieldLabel}>{t.goals.icon.toLowerCase()}</Text>
                  <View style={styles.iconPickerGrid}>
                    {GOAL_ICONS.map((icon) => {
                      const isSelected = goalIcon === icon;
                      return (
                        <TouchableOpacity
                          key={icon}
                          style={[styles.iconPickerItem, isSelected && { backgroundColor: withAlpha(goalColor, 0.12), borderColor: goalColor }]}
                          onPress={() => { lightTap(); setGoalIcon(icon); }}
                          activeOpacity={0.7}
                          accessibilityLabel={`Icon: ${icon}`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Feather name={icon} size={22} color={isSelected ? goalColor : C.textSecondary} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.detailFieldLabel, { marginTop: SPACING.lg }]}>{t.goals.color.toLowerCase()}</Text>
                  <View style={styles.colorPickerRow}>
                    {GOAL_COLORS.map((color) => {
                      const isSelected = goalColor === color;
                      return (
                        <TouchableOpacity
                          key={color}
                          style={[styles.colorPickerItem, { backgroundColor: color }, isSelected && styles.colorPickerItemSelected]}
                          onPress={() => { lightTap(); setGoalColor(color); }}
                          activeOpacity={0.7}
                          accessibilityLabel={`Color ${color}`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          {isSelected && <Feather name="check" size={16} color={C.onAccent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Preview */}
                {goalName.trim() && (
                  <View style={styles.goalPreview}>
                    <View style={[styles.goalPreviewIcon, { backgroundColor: withAlpha(goalColor, 0.12) }]}>
                      <Feather name={goalIcon} size={20} color={goalColor} />
                    </View>
                    <Text style={styles.goalPreviewName} numberOfLines={1}>{goalName.trim()}</Text>
                    {goalTarget && parseFloat(goalTarget) > 0 && (
                      <Text style={styles.goalPreviewTarget}>{currency} {parseFloat(goalTarget).toFixed(2)}</Text>
                    )}
                  </View>
                )}
              </ScrollView>
            </KeyboardAvoidingView>

            {/* Save zone */}
            <View style={styles.detailSaveZone}>
              <Pressable style={[styles.detailSaveBtn, { backgroundColor: C.accent }]} onPress={handleSaveGoal}>
                {({ pressed }: { pressed: boolean }) => (
                  <View style={[styles.detailSaveBtnInner, pressed && { opacity: 0.7 }]}>
                    <Feather name={editingGoal ? 'check' : 'plus-circle'} size={16} color={C.onAccent} />
                    <Text style={styles.detailSaveBtnText}>{editingGoal ? t.goals.saveChanges : t.goals.createGoal}</Text>
                  </View>
                )}
              </Pressable>
              {editingGoal && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => { closeGoalModal(); handleDeleteGoal(editingGoal); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.goals.deleteThisGoal}
                >
                  <Feather name="trash-2" size={14} color={C.neutral} />
                  <Text style={styles.deleteBtnText}>{t.goals.deleteThisGoal}</Text>
                </TouchableOpacity>
              )}
              <Pressable style={styles.detailCloseLink} onPress={closeGoalModal} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
                {({ pressed }: { pressed: boolean }) => (
                  <View style={[styles.detailCloseLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.detailCloseLinkText}>{t.goals.close}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Reanimated.View>
        </View>
        <ModalToastHost />
      </Modal>}

      {/* ═══ CONTRIBUTE SHEET ═══ */}
      {contributeModalVisible && <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeContributeModal}>
        <View style={StyleSheet.absoluteFill}>
          <Reanimated.View style={[styles.detailBackdrop, contribBackdropAnimStyle]}>
            <Pressable style={{ flex: 1 }} onPress={closeContributeModal} />
          </Reanimated.View>
          <Reanimated.View style={[styles.detailSheetContainer, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }, contribSheetAnimStyle]}>
            <GestureDetector gesture={contribSheetGesture}>
              <View collapsable={false}>
                <View style={styles.detailTopRow}>
                  <View style={styles.detailHandle} />
                  <TouchableOpacity style={styles.detailCloseX} onPress={closeContributeModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Feather name="x" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
                {contributingGoal && (
                  <View style={styles.detailTitleZone}>
                    <View style={[styles.detailIconWrap, { backgroundColor: withAlpha(contributingGoal.color, 0.12) }]}>
                      <Feather name={(contributingGoal.icon as keyof typeof Feather.glyphMap) || 'target'} size={24} color={contributingGoal.color} />
                    </View>
                    <Text style={styles.detailTitle}>{contributingGoal.name}</Text>
                    <Text style={styles.detailSubtitle}>
                      {isWithdrawMode ? t.goals.withdraw : t.goals.contribute.toLowerCase()} · {currency} {contributingGoal.currentAmount.toFixed(2)} / {currency} {contributingGoal.targetAmount.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </GestureDetector>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.detailScrollContent}>
                {contributingGoal && !isWithdrawMode && (
                  <View style={[styles.quickRow, { marginBottom: SPACING.sm }]}>
                    {QUICK_AMOUNTS.map((amt) => (
                      <TouchableOpacity
                        key={amt}
                        style={[
                          styles.quickBtn,
                          { backgroundColor: withAlpha(contributingGoal.color, 0.08) },
                          contributeAmount === amt.toString() && { backgroundColor: withAlpha(contributingGoal.color, 0.18) },
                        ]}
                        onPress={() => { lightTap(); setContributeAmount(amt.toString()); }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={`${currency} ${amt}`}
                        accessibilityState={{ selected: contributeAmount === amt.toString() }}
                      >
                        <Text style={[styles.quickBtnText, { color: contributingGoal.color }]}>+{amt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.detailFieldCard}>
                  <Text style={styles.detailFieldLabel}>{t.goals.amount}</Text>
                  <View style={styles.amountRow}>
                    <Text style={styles.amountPrefix}>{currency}</Text>
                    <TextInput
                      style={[styles.fieldInput, { flex: 1 }]}
                      value={contributeAmount}
                      onChangeText={setContributeAmount}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      placeholderTextColor={C.textMuted}
                      returnKeyType="next"
                      autoFocus
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                    />
                  </View>
                </View>

                {contributingGoal && contributeAmount && parseFloat(contributeAmount) > 0 && (
                  <View style={styles.contributePreview}>
                    {(() => {
                      const inputAmt = parseFloat(contributeAmount);
                      const newAmount = isWithdrawMode
                        ? Math.max(contributingGoal.currentAmount - Math.min(inputAmt, contributingGoal.currentAmount), 0)
                        : Math.min(contributingGoal.currentAmount + inputAmt, contributingGoal.targetAmount);
                      const newPct = contributingGoal.targetAmount > 0
                        ? Math.min((newAmount / contributingGoal.targetAmount) * 100, 100)
                        : 0;
                      const remaining = Math.max(contributingGoal.targetAmount - newAmount, 0);
                      let paceStr = '';
                      if (!isWithdrawMode && contributingGoal.deadline && remaining > 0) {
                        const dl = new Date(contributingGoal.deadline);
                        const daysLeft = differenceInCalendarDays(dl, new Date());
                        if (daysLeft > 0) {
                          paceStr = `~${currency} ${Math.ceil(remaining / daysLeft)}${t.goals.perDay} ${t.goals.toDeadline}`;
                        }
                      }
                      return (
                        <>
                          <Text style={styles.contributePreviewLabel}>
                            {isWithdrawMode ? t.goals.afterWithdrawal : t.goals.afterContribution}
                          </Text>
                          <Text style={[styles.contributePreviewValue, { color: newPct >= 100 ? C.positive : C.textPrimary }]}>
                            {t.goals.percentComplete.replace('{n}', newPct.toFixed(0))}
                          </Text>
                          {remaining > 0 && (
                            <Text style={styles.contributePreviewRemaining}>{currency} {remaining.toFixed(2)} {t.goals.toGo}</Text>
                          )}
                          {paceStr !== '' && <Text style={styles.contributePreviewRemaining}>{paceStr}</Text>}
                          {!isWithdrawMode && newPct >= 100 && <Text style={styles.contributePreviewCelebrate}>{t.goals.goalWillBeReached}</Text>}
                        </>
                      );
                    })()}
                  </View>
                )}

                {wallets.length > 0 && (
                  <View style={styles.detailFieldCard}>
                    <Text style={styles.detailFieldLabel}>{isWithdrawMode ? t.goals.returnToWallet : t.goals.walletOptional}</Text>
                    <View style={[styles.hScrollFadeWrap, { marginRight: -SPACING.lg }]}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: SPACING['2xl'] }}>
                        <TouchableOpacity
                          style={[styles.walletChip, !contributeWalletId && styles.walletChipActive]}
                          onPress={() => setContributeWalletId(undefined)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          accessibilityRole="button"
                          accessibilityLabel={t.goals.none}
                          accessibilityState={{ selected: !contributeWalletId }}
                        >
                          <Text style={[styles.walletChipText, !contributeWalletId && styles.walletChipTextActive]}>{t.goals.none}</Text>
                        </TouchableOpacity>
                        {wallets.filter((w) => w.type !== 'credit').map((w) => (
                          <TouchableOpacity
                            key={w.id}
                            style={[styles.walletChip, contributeWalletId === w.id && styles.walletChipActive]}
                            onPress={() => { lightTap(); setContributeWalletId(w.id); }}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            accessibilityRole="button"
                            accessibilityLabel={w.name}
                            accessibilityState={{ selected: contributeWalletId === w.id }}
                          >
                            <Text style={[styles.walletChipText, contributeWalletId === w.id && styles.walletChipTextActive]}>{w.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <LinearGradient colors={['transparent', C.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.hScrollFade} pointerEvents="none" />
                    </View>
                  </View>
                )}

                <View style={styles.detailFieldCard}>
                  <Text style={styles.detailFieldLabel}>{t.goals.noteOptional}</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={contributeNote}
                    onChangeText={setContributeNote}
                    placeholder={t.goals.notePlaceholder}
                    placeholderTextColor={C.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />
                </View>
              </ScrollView>
            </KeyboardAvoidingView>

            {/* Save zone */}
            <View style={styles.detailSaveZone}>
              <Pressable
                style={[styles.detailSaveBtn, { backgroundColor: isWithdrawMode ? withAlpha(C.bronze, 0.15) : (contributingGoal?.color || C.accent) }]}
                onPress={isWithdrawMode ? handleWithdraw : handleContribute}
              >
                {({ pressed }: { pressed: boolean }) => (
                  <View style={[styles.detailSaveBtnInner, pressed && { opacity: 0.7 }]}>
                    <Feather name={isWithdrawMode ? 'minus-circle' : 'plus-circle'} size={16} color={isWithdrawMode ? C.bronze : C.onAccent} />
                    <Text style={[styles.detailSaveBtnText, isWithdrawMode && { color: C.bronze }]}>
                      {isWithdrawMode ? t.goals.withdraw : t.goals.contribute.toLowerCase()}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.detailCloseLink} onPress={closeContributeModal} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
                {({ pressed }: { pressed: boolean }) => (
                  <View style={[styles.detailCloseLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.detailCloseLinkText}>{t.goals.close}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Reanimated.View>
        </View>
        <ModalToastHost />
      </Modal>}

      {/* ═══ CONTRIBUTION HISTORY SHEET ═══ */}
      {historyModalVisible && <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeHistoryModal}>
        <View style={StyleSheet.absoluteFill}>
          <Reanimated.View style={[styles.detailBackdrop, historyBackdropAnimStyle]}>
            <Pressable style={{ flex: 1 }} onPress={closeHistoryModal} />
          </Reanimated.View>
          <Reanimated.View style={[styles.detailSheetContainer, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }, historySheetAnimStyle]}>
            <GestureDetector gesture={historySheetGesture}>
              <View collapsable={false}>
                <View style={styles.detailTopRow}>
                  <View style={styles.detailHandle} />
                  <TouchableOpacity style={styles.detailCloseX} onPress={closeHistoryModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Feather name="x" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.detailTitleZone}>
                  {historyGoal && (
                    <View style={[styles.detailIconWrap, { backgroundColor: withAlpha(historyGoal.color, 0.12) }]}>
                      <Feather name={(historyGoal.icon as keyof typeof Feather.glyphMap) || 'target'} size={24} color={historyGoal.color} />
                    </View>
                  )}
                  <Text style={styles.detailTitle} numberOfLines={1}>{historyGoal?.name || t.goals.history}</Text>
                  <Text style={styles.detailSubtitle}>{t.goals.history.toLowerCase()}</Text>
                </View>
              </View>
            </GestureDetector>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.detailScrollContent}>
              {/* Stats card */}
              <View style={styles.historyStatsRow}>
                <View style={styles.historyStatItem}>
                  <Text style={styles.historyStatLabel}>{t.goals.total}</Text>
                  <Text style={styles.historyStatValue}>{currency} {historyStats.total.toFixed(2)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.historyStatItem}>
                  <Text style={styles.historyStatLabel}>{t.goals.average}</Text>
                  <Text style={styles.historyStatValue}>{currency} {historyStats.avg.toFixed(2)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.historyStatItem}>
                  <Text style={styles.historyStatLabel}>{t.goals.count}</Text>
                  <Text style={styles.historyStatValue}>{historyStats.count}</Text>
                </View>
              </View>

              {historyGroups.map((group) => (
                <View key={group.label}>
                  <Text style={styles.historyGroupLabel}>{group.label.toLowerCase()}</Text>
                  {group.items.map((c) => {
                    const d = c.date instanceof Date ? c.date : new Date(c.date);
                    const isWithdrawal = c.amount < 0;
                    return (
                      <View key={c.id} style={styles.historyItem}>
                        <View style={styles.historyItemLeft}>
                          <Text style={styles.historyItemDate}>{isValid(d) ? format(d, 'MMM dd') : '—'}</Text>
                          <Text style={[styles.historyItemAmount, isWithdrawal && { color: C.neutral }]}>
                            {isWithdrawal ? '-' : '+'}{currency} {Math.abs(c.amount).toFixed(2)}
                          </Text>
                          {c.note && <Text style={styles.historyItemNote} numberOfLines={1}>{c.note}</Text>}
                        </View>
                        {historyGoal && (
                          <TouchableOpacity
                            onPress={() => handleUndoContribution(historyGoal.id, c)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                            accessibilityRole="button"
                            accessibilityLabel={t.goals.undo}
                          >
                            <Feather name="corner-down-left" size={16} color={C.neutral} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
              {historyGroups.length === 0 && (
                <Text style={styles.noResultsText}>{t.goals.noContributionsYet}</Text>
              )}
            </ScrollView>

            {/* Close zone */}
            <View style={styles.detailSaveZone}>
              <Pressable style={styles.detailCloseLink} onPress={closeHistoryModal} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
                {({ pressed }: { pressed: boolean }) => (
                  <View style={[styles.detailCloseLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.detailCloseLinkText}>{t.goals.close}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Reanimated.View>
        </View>
        <ModalToastHost />
      </Modal>}

      {/* ═══ SORT MENU ═══ */}
      {showSortMenu && (
        <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={() => setShowSortMenu(false)}>
          <Pressable style={styles.sortMenuBackdrop} onPress={() => setShowSortMenu(false)}>
            <View style={styles.sortMenuCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.sortMenuTitle}>{t.goals.sortBy ?? 'sort by'}</Text>
              {sortOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.sortMenuItem}
                  onPress={() => { selectionChanged(); setSort(opt.key); setShowSortMenu(false); }}
                  activeOpacity={0.7}
                >
                  <Feather name={opt.icon} size={15} color={sort === opt.key ? C.accent : C.textMuted} />
                  <Text style={[styles.sortMenuItemText, sort === opt.key && { color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold as any }]}>
                    {opt.label}
                  </Text>
                  {sort === opt.key && <Feather name="check" size={15} color={C.accent} style={{ marginLeft: 'auto' as any }} />}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* ═══ GOAL DETAIL SHEET ═══ */}
      {detailGoal && (() => {
        const g = detailGoal;
        const pct = g.targetAmount > 0 ? Math.min((g.currentAmount / g.targetAmount) * 100, 100) : 0;
        const done = g.currentAmount >= g.targetAmount;
        const daysLeft = g.deadline ? differenceInCalendarDays(new Date(g.deadline), new Date()) : null;
        let paceD: number | null = null;
        let paceM: number | null = null;
        if (g.deadline && daysLeft !== null && daysLeft > 0 && !done) {
          const rem = g.targetAmount - g.currentAmount;
          paceD = rem / daysLeft;
          paceM = rem / (daysLeft / 30);
        }
        const sData = (g.contributions || []).filter((c) => c.amount > 0).slice(-8).map((c) => c.amount);
        const lastC = g.contributions?.length > 0 ? g.contributions[g.contributions.length - 1] : null;
        const lastCAgo = lastC ? Math.floor((Date.now() - new Date(lastC.date).getTime()) / 86400000) : null;
        const monthsSince = Math.max(1, Math.round((Date.now() - new Date(g.createdAt).getTime()) / (30 * 86400000)));
        const monthlyRate = g.currentAmount / monthsSince;
        const onPace = paceM !== null && paceM > 0 && monthlyRate >= paceM;

        return (
          <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeGoalDetail}>
            <View style={StyleSheet.absoluteFill}>
              <Reanimated.View style={[styles.detailBackdrop, detailBackdropAnimStyle]}>
                <Pressable style={{ flex: 1 }} onPress={closeGoalDetail} />
              </Reanimated.View>
              <Reanimated.View style={[styles.detailSheetContainer, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }, detailSheetAnimStyle]}>
                {/* Drag zone: handle + close */}
                <GestureDetector gesture={detailSheetGesture}>
                  <View collapsable={false}>
                    <View style={styles.detailTopRow}>
                      <View style={styles.detailHandle} />
                      <TouchableOpacity style={styles.detailCloseX} onPress={closeGoalDetail} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Feather name="x" size={18} color={C.textMuted} />
                      </TouchableOpacity>
                    </View>

                    {/* Ring hero */}
                    <View style={styles.detailRingZone}>
                      <View style={{ position: 'relative' }}>
                        <CircularProgress
                          size={170}
                          strokeWidth={16}
                          percentage={done ? 100 : pct}
                          color={g.isPaused ? C.neutral : g.color}
                          trackColor={C.border}
                        >
                          <Text style={styles.detailRingPct}>{pct.toFixed(0)}%</Text>
                          <Text style={styles.detailRingLabel}>{t.goals.saved}</Text>
                        </CircularProgress>
                        <View style={styles.detailRingBadgeWrap}>
                          <View style={[styles.detailRingBadge, { backgroundColor: g.color }]}>
                            <Feather name={(g.icon as keyof typeof Feather.glyphMap) || 'target'} size={16} color={C.onAccent} />
                          </View>
                        </View>
                      </View>
                      <Text style={styles.detailTitle} numberOfLines={1}>{g.name}</Text>
                      {g.isPaused && (
                        <View style={styles.pausedBadge}>
                          <Text style={styles.pausedBadgeText}>{t.goals.paused}</Text>
                        </View>
                      )}
                      <Text style={styles.detailSubtitle}>
                        {done ? t.goals.goalReached : getObservation(pct) || `${pct.toFixed(0)}% ${t.goals.saved}`}
                      </Text>
                    </View>
                  </View>
                </GestureDetector>

                {/* Scrollable content */}
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.detailScrollContent}>
                  {/* Target amount card */}
                  <View style={styles.detailTargetCard}>
                    <Text style={styles.detailTargetLabel}>{t.goals.totalTarget ?? 'total target'}</Text>
                    <Text style={styles.detailTargetAmount}>{currency} {g.targetAmount.toFixed(2)}</Text>
                    {g.deadline && daysLeft !== null && (
                      <View style={styles.detailTargetDeadline}>
                        <Feather name="calendar" size={12} color={C.textMuted} />
                        <Text style={[styles.detailTargetDeadlineText, daysLeft < 0 && { color: C.bronze }]}>
                          {daysLeft < 0
                            ? t.goals.dOverdue.replace('{n}', String(Math.abs(daysLeft)))
                            : daysLeft === 0 ? t.goals.dueToday
                            : `${daysLeft}d ${t.goals.remaining} · ${format(new Date(g.deadline), 'dd MMM yyyy')}`}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Stat pills */}
                  <View style={styles.detailStatRow}>
                    <View style={styles.detailStatPill}>
                      <View style={styles.detailStatDot}>
                        <View style={[styles.detailStatDotInner, { backgroundColor: g.color }]} />
                      </View>
                      <Text style={styles.detailStatLabel}>{t.goals.amountSaved ?? 'amount saved'}</Text>
                      <Text style={styles.detailStatValue}>{currency} {g.currentAmount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.detailStatPill}>
                      <View style={styles.detailStatDot}>
                        <View style={[styles.detailStatDotInner, { backgroundColor: done ? C.positive : C.bronze }]} />
                      </View>
                      <Text style={styles.detailStatLabel}>{done ? (t.goals.goalReached ?? 'completed') : (t.goals.remaining ?? 'remaining')}</Text>
                      <Text style={styles.detailStatValue}>{done ? '—' : `${currency} ${(g.targetAmount - g.currentAmount).toFixed(2)}`}</Text>
                    </View>
                  </View>

                  {/* Action buttons */}
                  <View style={styles.detailActionRow}>
                    {g.contributions?.length > 0 && (
                      <TouchableOpacity
                        style={styles.detailActionOutline}
                        onPress={() => { closeGoalDetail(); setTimeout(() => openHistory(g), 100); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.detailActionOutlineText}>{t.goals.viewHistory ?? 'view history'}</Text>
                      </TouchableOpacity>
                    )}
                    {!done && !g.isPaused ? (
                      <TouchableOpacity
                        style={[styles.detailActionFilled, { backgroundColor: g.color }]}
                        onPress={() => { closeGoalDetail(); setTimeout(() => openContribute(g), 100); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.detailActionFilledText}>{t.goals.contribute.toLowerCase()}</Text>
                      </TouchableOpacity>
                    ) : done ? (
                      <TouchableOpacity
                        style={[styles.detailActionFilled, { backgroundColor: C.positive }]}
                        onPress={() => { closeGoalDetail(); setTimeout(() => handleArchive(g), 100); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.detailActionFilledText}>{t.goals.archive}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Quick contribute chips */}
                  {!done && !g.isPaused && (
                    <View style={[styles.quickRow, { marginTop: SPACING.xs }]}>
                      {QUICK_AMOUNTS.map((amt) => (
                        <TouchableOpacity
                          key={amt}
                          style={[styles.quickBtn, { backgroundColor: withAlpha(g.color, 0.08) }]}
                          onPress={() => { closeGoalDetail(); setTimeout(() => openContribute(g, amt), 100); }}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                          <Text style={[styles.quickBtnText, { color: g.color }]}>+{amt}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.quickBtn, { backgroundColor: withAlpha(C.textMuted, 0.06) }]}
                        onPress={() => { closeGoalDetail(); setTimeout(() => openContribute(g), 100); }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      >
                        <Text style={[styles.quickBtnText, { color: C.textSecondary }]}>{t.goals.custom}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Pace card */}
                  {paceD !== null && paceM !== null && !g.isPaused && (
                    <View style={styles.detailFieldCard}>
                      <Text style={styles.detailFieldLabel}>{t.goals.onTrack.toLowerCase()}</Text>
                      <View style={styles.detailFieldDateRow}>
                        <Feather name="trending-up" size={14} color={g.color} />
                        <Text style={styles.detailFieldValue}>
                          ~{currency} {paceD < 10 ? paceD.toFixed(2) : Math.ceil(paceD).toString()}{t.goals.perDay} {'·'} ~{currency} {Math.ceil(paceM)}{t.goals.perMonth}
                        </Text>
                      </View>
                      {paceM > 0 && (
                        <Text style={[styles.detailFieldHint, onPace && { color: C.accent }]}>
                          {onPace
                            ? (monthlyRate >= paceM * 1.2 ? t.goals.aheadOfSchedule : t.goals.onPace)
                            : t.goals.needAboutPerMonth.replace('{currency}', currency).replace('{amount}', String(Math.ceil(paceM)))}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Sparkline card */}
                  {sData.length >= 2 && (
                    <TouchableOpacity style={styles.detailFieldCard} onPress={() => { closeGoalDetail(); setTimeout(() => openHistory(g), 100); }} activeOpacity={0.7}>
                      <Text style={styles.detailFieldLabel}>
                        {t.goals.contributions.replace('{n}', String(g.contributions?.filter((c) => c.amount > 0).length || 0))}
                        {lastCAgo !== null && ` · ${lastCAgo === 0 ? t.goals.lastToday : t.goals.lastDaysAgo.replace('{n}', String(lastCAgo))}`}
                      </Text>
                      <View style={{ marginTop: SPACING.xs }}>
                        <Sparkline
                          data={sData}
                          width={SCREEN_W - SPACING.xl * 4 - SPACING.lg}
                          height={44}
                          color={g.isPaused ? C.neutral : g.color}
                          filled
                        />
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Secondary: edit, pause, delete */}
                  <View style={styles.detailSecondary}>
                    <TouchableOpacity
                      style={styles.detailSecondaryBtn}
                      onPress={() => { closeGoalDetail(); setTimeout(() => openEditGoal(g), 100); }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="edit-2" size={15} color={C.textMuted} />
                      <Text style={styles.detailSecondaryText}>{t.goals.edit}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.detailSecondaryBtn}
                      onPress={() => { handleTogglePause(g); closeGoalDetail(); }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name={g.isPaused ? 'play' : 'pause'} size={15} color={C.textMuted} />
                      <Text style={styles.detailSecondaryText}>{g.isPaused ? t.goals.resume : t.goals.pause}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.detailSecondaryBtn}
                      onPress={() => { closeGoalDetail(); setTimeout(() => handleDeleteGoal(g), 100); }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={15} color={C.neutral} />
                      <Text style={[styles.detailSecondaryText, { color: C.neutral }]}>{t.goals.delete}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                <View style={styles.detailSaveZone}>
                  <Pressable style={styles.detailCloseLink} onPress={closeGoalDetail} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
                    {({ pressed }: { pressed: boolean }) => (
                      <View style={[styles.detailCloseLinkInner, pressed && { opacity: 0.55 }]}>
                        <Feather name="x" size={12} color={C.textMuted} />
                        <Text style={styles.detailCloseLinkText}>{t.goals.close}</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </Reanimated.View>
            </View>
          </Modal>
        );
      })()}
    </View>
  );
};

// ── STYLES ────────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.xl },

  // ── Hero ──
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  heroSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.md,
  },
  heroProgressTrack: {
    height: 4,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
  },
  heroMonthly: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  heroStats: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },

  // ── Filter Chips ──
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.08),
  },
  filterChipActive: {
    backgroundColor: C.deepOlive,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  filterChipTextActive: {
    color: C.onAccent,
  },
  sortPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    marginLeft: 'auto' as const,
  },
  sortPillActive: {
    backgroundColor: C.deepOlive,
  },
  sortPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: C.textMuted,
  },
  sortPillTextActive: {
    color: C.onAccent,
  },
  sortMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  sortMenuCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    width: 240,
    maxWidth: '80%' as any,
    borderWidth: 1,
    borderColor: C.border,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.lg),
  },
  sortMenuTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textSecondary,
    textTransform: 'lowercase' as const,
    letterSpacing: 0.3,
    marginBottom: SPACING.md,
  },
  sortMenuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.06),
  },
  sortMenuItemText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },

  // ── Section Label ──
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },

  // ── Group Card ──
  groupCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 44 + SPACING.md * 2,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  goalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalContent: {
    flex: 1,
    gap: 3,
  },
  goalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  goalName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    flexShrink: 1,
  },
  goalPct: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  goalAmountText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  goalAmountTarget: {
    color: C.textMuted,
  },
  pausedBadge: {
    backgroundColor: withAlpha(C.bronze, 0.12),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 1,
  },
  pausedBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  // ── Progress ──
  goalProgressTrack: {
    height: 3,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },

  // ── Goal Grid ──
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  goalCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
  },
  goalCardName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  goalCardAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  goalCardTarget: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
    marginTop: 2,
  },

  // ── Milestones ──
  milestoneDots: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm },
  milestoneDotContainer: { alignItems: 'center', gap: 3 },
  milestoneDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  milestoneDotLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.neutral, fontWeight: TYPOGRAPHY.weight.medium, fontVariant: ['tabular-nums'] },

  // ── Quick Contribute ──
  quickRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.sm, flexWrap: 'wrap' },
  quickBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
  },
  quickBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, fontVariant: ['tabular-nums'] },

  // ── Wallet Chips ──
  walletChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.border, marginRight: SPACING.xs },
  walletChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  walletChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: C.textSecondary },
  walletChipTextActive: { color: C.onAccent },

  // ── No Results ──
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
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
  },

  // ── Archived ──
  archivedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    opacity: 0.6,
  },
  archivedName: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary },
  archivedAmount: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontVariant: ['tabular-nums'], marginTop: 2 },
  restoreBtn: {
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
  },

  // ── Modal Fields ──
  fieldInput: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
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
  fieldTouchableText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  clearDeadlineBtn: { alignItems: 'center', paddingVertical: SPACING.sm, marginTop: SPACING.xs },
  clearDeadlineText: { fontSize: TYPOGRAPHY.size.sm, color: C.neutral, fontWeight: TYPOGRAPHY.weight.medium },

  // ── Templates ──
  templateChip: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.border, marginRight: SPACING.xs },
  templateChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: C.textSecondary },

  // ── Pickers ──
  iconPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  iconPickerItem: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background, borderWidth: 1.5, borderColor: C.border },
  colorPickerRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  colorPickerItem: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  colorPickerItemSelected: { borderWidth: 3, borderColor: C.surface, ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm) },

  // ── Preview ──
  goalPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg, gap: SPACING.sm },
  goalPreviewIcon: { width: 36, height: 36, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  goalPreviewName: { flex: 1, fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
  goalPreviewTarget: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.accent, fontVariant: ['tabular-nums'] },

  // ── Delete ──
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg, paddingVertical: SPACING.sm },
  deleteBtnText: { fontSize: TYPOGRAPHY.size.sm, color: C.neutral },

  // ── Contribute Preview ──
  contributePreview: { backgroundColor: C.background, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg, alignItems: 'center' },
  contributePreviewLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginBottom: 4 },
  contributePreviewValue: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, fontVariant: ['tabular-nums'] },
  contributePreviewRemaining: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  contributePreviewCelebrate: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.positive, marginTop: SPACING.xs },

  // ── History ──
  historyStatsRow: { flexDirection: 'row', backgroundColor: C.background, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  historyStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  historyStatLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium },
  historyStatValue: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  statDivider: { width: 1, backgroundColor: C.border },
  historyGroupLabel: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary, marginTop: SPACING.md, marginBottom: SPACING.sm },
  historyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  historyItemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' },
  historyItemDate: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, minWidth: 50 },
  historyItemAmount: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  historyItemNote: { fontSize: TYPOGRAPHY.size.xs, color: C.neutral, maxWidth: 120 },

  // ── Swipe Actions ──
  swipeAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeEdit: {
    backgroundColor: C.accent,
  },
  swipeDelete: {
    backgroundColor: C.neutral,
  },

  // ── Horizontal Scroll Fade ──
  hScrollFadeWrap: {
    position: 'relative',
    marginRight: -SPACING.xl,
    marginBottom: SPACING.xs,
  },
  hScrollFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 40,
  },

  // ── Goal Detail Sheet (bottom sheet — mirrors DebtTracking) ──
  detailBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  detailSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '92%',
  },
  detailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    position: 'relative',
  },
  detailHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  detailCloseX: {
    position: 'absolute',
    right: SPACING.md,
    top: 4,
    padding: 6,
  },
  detailTitleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  detailIconWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  detailTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    textAlign: 'center',
  },
  detailSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  detailScrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.sm,
  },
  detailFieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  detailFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  detailFieldValue: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
  },
  detailFieldDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  detailFieldHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: SPACING.xs,
  },
  detailAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.sm,
  },
  detailAmountCurrent: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  detailAmountTarget: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  detailPct: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
    marginLeft: 'auto',
  },
  detailProgressTrack: {
    height: 6,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  detailProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  detailSecondary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
  },
  detailSecondaryBtn: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  detailSecondaryText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  detailSaveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  detailSaveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  detailSaveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailSaveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
  detailCloseLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  detailCloseLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  detailCloseLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // ── Detail Ring Hero ──
  detailRingZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xs,
  },
  detailRingPct: {
    fontSize: 32,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    lineHeight: 36,
  },
  detailRingLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  detailRingBadgeWrap: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    alignItems: 'center',
  } as any,
  detailRingBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 3,
    borderColor: C.surface,
    ...SHADOWS.sm,
  },

  // ── Detail Target Card ──
  detailTargetCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.md,
    alignItems: 'center' as const,
  },
  detailTargetLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
    marginBottom: SPACING.xs,
  },
  detailTargetAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  detailTargetDeadline: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: SPACING.sm,
  },
  detailTargetDeadlineText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── Detail Stat Pills ──
  detailStatRow: {
    flexDirection: 'row' as const,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  detailStatPill: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  detailStatDot: {
    marginBottom: SPACING.xs,
  },
  detailStatDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
  },
  detailStatValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── Detail Action Buttons ──
  detailActionRow: {
    flexDirection: 'row' as const,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  detailActionOutline: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 48,
  },
  detailActionOutlineText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  detailActionFilled: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 48,
  },
  detailActionFilledText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
});

export default Goals;
