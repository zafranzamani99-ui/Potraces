import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
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
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import {
  CALM,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  SHADOWS,
  withAlpha,
} from '../../constants';
import Sparkline from '../../components/common/Sparkline';
import CalendarPicker from '../../components/common/CalendarPicker';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, successNotification, selectionChanged } from '../../services/haptics';
import { Goal, GoalContribution } from '../../types';

const SCREEN_W = Dimensions.get('window').width;
const CARD_PAD = SPACING['2xl'];

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
  '#4F5104', // CALM.accent (olive)
  '#2E7D5B', // CALM.positive (green)
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
const getObservation = (percentage: number): string => {
  if (percentage >= 100) return 'goal reached.';
  if (percentage >= 75) return 'almost there.';
  if (percentage >= 50) return 'halfway.';
  if (percentage >= 25) return 'a quarter saved.';
  if (percentage >= 10) return 'getting started.';
  return '';
};

const MAX_GOALS = 10;

// ── GOAL TEMPLATES ────────────────────────────────────────────
const GOAL_TEMPLATES = [
  { name: 'Emergency Fund', icon: 'shield' as const, color: '#4F5104' },
  { name: 'Raya Savings', icon: 'gift' as const, color: '#F39C12' },
  { name: 'Travel', icon: 'send' as const, color: '#E67E22' },
  { name: 'Gadget Fund', icon: 'smartphone' as const, color: '#9B59B6' },
  { name: 'Downpayment', icon: 'home' as const, color: '#3498DB' },
  { name: 'Education', icon: 'book' as const, color: '#8B7355' },
];

// ── MAIN COMPONENT ────────────────────────────────────────────
const Goals: React.FC = () => {
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
  const [showArchived, setShowArchived] = useState(false);

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

  // ── History Modal state ──
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyGoal, setHistoryGoal] = useState<Goal | null>(null);

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

  // ── Open Add Modal ──
  const openAddGoal = useCallback(() => {
    if (goalsList.length >= MAX_GOALS) {
      showToast(`Maximum ${MAX_GOALS} goals allowed`, 'error');
      return;
    }
    resetGoalForm();
    setGoalModalVisible(true);
  }, [goalsList.length, resetGoalForm, showToast]);

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
    setGoalModalVisible(true);
  }, []);

  // ── Save Goal ──
  const handleSaveGoal = useCallback(() => {
    if (!goalName.trim()) {
      showToast('Please enter a goal name', 'error');
      return;
    }
    const target = parseFloat(goalTarget);
    if (!target || target <= 0) {
      showToast('Please enter a valid target amount', 'error');
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
      showToast('goal updated.', 'success');
    } else {
      addGoal({
        name: goalName.trim(),
        targetAmount: target,
        deadline: goalDeadline,
        category: 'general',
        icon: goalIcon,
        color: goalColor,
      });
      showToast('goal created.', 'success');
    }

    setGoalModalVisible(false);
    resetGoalForm();
  }, [
    goalName,
    goalTarget,
    goalDeadline,
    goalIcon,
    goalColor,
    editingGoal,
    addGoal,
    updateGoal,
    resetGoalForm,
    showToast,
  ]);

  // ── Delete Goal ──
  const handleDeleteGoal = useCallback(
    (goal: Goal) => {
      lightTap();
      Alert.alert(
        'Delete Goal',
        `Remove "${goal.name}" from your goals? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteGoal(goal.id);
              showToast('goal removed.', 'success');
            },
          },
        ]
      );
    },
    [deleteGoal, showToast]
  );

  // ── Open Contribute Modal ──
  const openContribute = useCallback((goal: Goal, presetAmount?: number) => {
    lightTap();
    setContributingGoal(goal);
    setContributeAmount(presetAmount ? presetAmount.toString() : '');
    setContributeNote('');
    setContributeWalletId(goal.walletId || undefined);
    setContributeModalVisible(true);
  }, []);

  // ── Handle Contribution ──
  const handleContribute = useCallback(() => {
    if (!contributingGoal) return;

    const amount = parseFloat(contributeAmount);
    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

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
        showToast('goal reached.', 'success');
      } else if (crossedPct) {
        mediumTap();
        showToast(`${crossedPct}% milestone.`, 'success');
      } else {
        showToast('contribution added.', 'success');
      }
    } else {
      showToast('contribution added.', 'success');
    }

    setContributeModalVisible(false);
    setContributingGoal(null);
  }, [contributingGoal, contributeAmount, contributeNote, contributeWalletId, contributeToGoal, showToast]);

  // ── Handle undo contribution ──
  const handleUndoContribution = useCallback((goalId: string, contrib: GoalContribution) => {
    Alert.alert(
      'Remove Contribution',
      `Remove this ${currency} ${Math.abs(contrib.amount).toFixed(2)} contribution?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            // Refund wallet if contribution was charged to one
            if (contrib.walletId) {
              useWalletStore.getState().addToWallet(contrib.walletId, contrib.amount);
            }
            removeContribution(goalId, contrib.id);
            showToast('contribution removed.', 'success');
            const updated = usePersonalStore.getState().goals.find((g) => g.id === goalId);
            if (updated) setHistoryGoal(updated);
          },
        },
      ]
    );
  }, [removeContribution, showToast, currency]);

  // ── Pause / Resume ──
  const handleTogglePause = useCallback((goal: Goal) => {
    selectionChanged();
    if (goal.isPaused) {
      resumeGoal(goal.id);
      showToast('goal resumed.', 'success');
    } else {
      pauseGoal(goal.id);
      showToast('goal paused.', 'success');
    }
  }, [pauseGoal, resumeGoal, showToast]);

  // ── Archive / Unarchive ──
  const handleArchive = useCallback((goal: Goal) => {
    lightTap();
    archiveGoal(goal.id);
    showToast('goal archived.', 'success');
  }, [archiveGoal, showToast]);

  const handleUnarchive = useCallback((goalId: string) => {
    lightTap();
    unarchiveGoal(goalId);
    showToast('goal restored.', 'success');
  }, [unarchiveGoal, showToast]);

  const archivedGoals = useMemo(() => goalsList.filter((g) => g.isArchived), [goalsList]);

  // ── Open History Modal ──
  const openHistory = useCallback((goal: Goal) => {
    lightTap();
    setHistoryGoal(goal);
    setHistoryModalVisible(true);
  }, []);

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
                    : { backgroundColor: CALM.border },
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

  // ── Close modals ──
  const closeGoalModal = useCallback(() => {
    setGoalModalVisible(false);
    resetGoalForm();
  }, [resetGoalForm]);

  const closeContributeModal = useCallback(() => {
    setContributeModalVisible(false);
    setContributingGoal(null);
  }, []);

  // ── History modal grouped contributions ──
  const historyGroups = useMemo(() => {
    if (!historyGoal) return [];
    const contribs = [...(historyGoal.contributions || [])].reverse();
    const groups: { label: string; items: GoalContribution[] }[] = [];
    let currentLabel = '';
    contribs.forEach((c) => {
      const d = c.date instanceof Date ? c.date : new Date(c.date);
      const label = isValid(d) ? format(d, 'MMMM yyyy') : 'Unknown';
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, items: [] });
      }
      groups[groups.length - 1].items.push(c);
    });
    return groups;
  }, [historyGoal]);

  const historyStats = useMemo(() => {
    if (!historyGoal) return { total: 0, avg: 0, count: 0 };
    const positives = (historyGoal.contributions || []).filter((c) => c.amount > 0);
    const total = positives.reduce((s, c) => s + c.amount, 0);
    const count = positives.length;
    return { total, avg: count > 0 ? total / count : 0, count };
  }, [historyGoal]);

  // ── Filter pills ──
  // FAB animation
  const fabScale = useRef(new Animated.Value(1)).current;

  const filterOptions: { key: GoalFilter; label: string }[] = [
    { key: 'all', label: 'all' },
    { key: 'active', label: 'active' },
    { key: 'completed', label: 'done' },
    { key: 'paused', label: 'paused' },
  ];

  const sortOptions: { key: GoalSort; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: 'manual', label: 'default', icon: 'list' },
    { key: 'deadline', label: 'deadline', icon: 'calendar' },
    { key: 'progress', label: 'progress', icon: 'trending-up' },
  ];

  // ── Apply template ──
  const applyTemplate = useCallback((template: typeof GOAL_TEMPLATES[0]) => {
    selectionChanged();
    setGoalName(template.name);
    setGoalIcon(template.icon);
    setGoalColor(template.color);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeGoals.length > 0 ? (
          <>
            {/* ── Hero Card ── */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>goals</Text>
              <Text style={styles.heroAmount}>
                {currency} {summary.totalSaved.toFixed(2)}
              </Text>
              <Text style={styles.heroSubtext}>
                of {currency} {summary.totalTarget.toFixed(2)} target · {summary.overallPercentage.toFixed(0)}%
              </Text>

              {/* Progress bar */}
              <View style={styles.heroProgressTrack}>
                <View style={[styles.heroProgressFill, { width: `${Math.min(summary.overallPercentage, 100)}%` }]} />
              </View>

              {monthlyContrib.thisMonth > 0 && (
                <Text style={styles.heroMonthly}>
                  +{currency} {monthlyContrib.thisMonth.toFixed(2)} this month
                  {monthlyContrib.lastMonth > 0 && `  ·  vs ${currency} ${monthlyContrib.lastMonth.toFixed(2)} last month`}
                </Text>
              )}

              <Text style={styles.heroStats}>
                {summary.activeCount} active{summary.completedCount > 0 ? ` · ${summary.completedCount} done` : ''}
              </Text>
            </View>

            {/* ── Filter & Sort Pills ── */}
            <View style={styles.filterRow}>
              {filterOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
                  onPress={() => { selectionChanged(); setFilter(opt.key); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
              {sortOptions.filter((s) => s.key !== 'manual').map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, sort === opt.key && styles.filterChipActive]}
                  onPress={() => { selectionChanged(); setSort(sort === opt.key ? 'manual' : opt.key); }}
                  activeOpacity={0.7}
                >
                  <Feather name={opt.icon} size={12} color={sort === opt.key ? '#FFFFFF' : CALM.textMuted} style={{ marginRight: 4 }} />
                  <Text style={[styles.filterChipText, sort === opt.key && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Goal Cards (grouped) ── */}
            {enrichedGoals.length > 0 ? (
              <View style={styles.groupCard}>
                {enrichedGoals.map((goal, index) => {
                  const { percentage, isCompleted, daysUntilDeadline, paceDaily, paceMonthly, sparkData, lastContribDaysAgo } = goal;

                  return (
                    <React.Fragment key={goal.id}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.goalItem,
                          goal.isPaused ? { opacity: 0.5 } : undefined,
                          pressed ? { opacity: goal.isPaused ? 0.3 : 0.6 } : undefined,
                        ]}
                        onPress={() => openEditGoal(goal)}
                      >
                        {/* Header row */}
                        <View style={styles.goalHeader}>
                          <View style={[styles.goalIconWrap, { backgroundColor: withAlpha(goal.color, goal.isPaused ? 0.06 : 0.08) }]}>
                            <Feather
                              name={(goal.icon as keyof typeof Feather.glyphMap) || 'target'}
                              size={18}
                              color={goal.isPaused ? CALM.neutral : goal.color}
                            />
                          </View>

                          <View style={styles.goalInfo}>
                            <View style={styles.goalNameRow}>
                              <Text style={[styles.goalName, goal.isPaused && { color: CALM.neutral }]} numberOfLines={1}>
                                {goal.name}
                              </Text>
                              {goal.isPaused && (
                                <View style={styles.pausedBadge}>
                                  <Text style={styles.pausedBadgeText}>paused</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.goalMeta}>
                              <Text style={styles.goalMetaText}>
                                {currency} {goal.currentAmount.toFixed(2)} / {currency} {goal.targetAmount.toFixed(2)}
                              </Text>
                              {goal.deadline && daysUntilDeadline !== null && !goal.isPaused && (
                                <>
                                  <Text style={styles.goalMetaDot}> {'\u00B7'} </Text>
                                  <Text style={[styles.goalMetaText, daysUntilDeadline < 0 && { color: CALM.bronze, fontWeight: TYPOGRAPHY.weight.semibold }]}>
                                    {daysUntilDeadline < 0
                                      ? `${Math.abs(daysUntilDeadline)}d overdue`
                                      : daysUntilDeadline === 0 ? 'due today' : `${daysUntilDeadline}d`}
                                  </Text>
                                </>
                              )}
                            </View>
                          </View>

                          <Text style={[styles.goalPercentage, isCompleted && { color: CALM.positive }]}>
                            {percentage.toFixed(0)}%
                          </Text>
                        </View>

                        {/* Progress bar */}
                        <View style={styles.goalProgressTrack}>
                          <View
                            style={[
                              styles.goalProgressFill,
                              {
                                width: `${Math.min(percentage, 100)}%`,
                                backgroundColor: goal.isPaused ? CALM.neutral : goal.color,
                              },
                            ]}
                          />
                        </View>

                        {/* Milestone dots */}
                        {renderMilestoneDots(goal)}

                        {/* Calm observation */}
                        {getObservation(percentage) !== '' && (
                          <Text style={styles.observationText}>
                            {isCompleted ? 'goal reached.' : `${percentage.toFixed(0)}% — ${getObservation(percentage)}`}
                          </Text>
                        )}

                        {/* Pace */}
                        {paceDaily !== null && paceMonthly !== null && !goal.isPaused && (
                          <Text style={styles.paceText}>
                            ~{currency} {paceDaily < 10 ? paceDaily.toFixed(2) : Math.ceil(paceDaily).toString()}/day · ~{currency} {Math.ceil(paceMonthly)}/mo
                          </Text>
                        )}

                        {/* Sparkline */}
                        {sparkData.length >= 2 && (
                          <TouchableOpacity onPress={() => { openHistory(goal); }} activeOpacity={0.7}>
                            <View style={styles.sparklineWrap}>
                              <Sparkline
                                data={sparkData}
                                width={SCREEN_W - SPACING.xl * 2 - SPACING.md * 2}
                                height={36}
                                color={goal.isPaused ? CALM.neutral : goal.color}
                                filled
                              />
                            </View>
                            <Text style={styles.sparklineLabel}>
                              {goal.contributions?.filter((c) => c.amount > 0).length || 0} contributions
                              {lastContribDaysAgo !== null && ` · last: ${lastContribDaysAgo === 0 ? 'today' : `${lastContribDaysAgo}d ago`}`}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Quick contribute */}
                        {!isCompleted && !goal.isPaused && (
                          <View style={styles.quickRow}>
                            {QUICK_AMOUNTS.map((amt) => (
                              <TouchableOpacity
                                key={amt}
                                style={[styles.quickBtn, { backgroundColor: withAlpha(goal.color, 0.08) }]}
                                onPress={() => openContribute(goal, amt)}
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.quickBtnText, { color: goal.color }]}>+{amt}</Text>
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                              style={[styles.quickBtn, { backgroundColor: withAlpha(CALM.textMuted, 0.06) }]}
                              onPress={() => openContribute(goal)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.quickBtnText, { color: CALM.textSecondary }]}>custom</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* Action row */}
                        <View style={styles.actionRow}>
                          {!isCompleted && !goal.isPaused && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: withAlpha(goal.color, 0.08) }]}
                              onPress={() => openContribute(goal)}
                              activeOpacity={0.7}
                            >
                              <Feather name="plus-circle" size={14} color={goal.color} />
                              <Text style={[styles.actionBtnText, { color: goal.color }]}>contribute</Text>
                            </TouchableOpacity>
                          )}
                          {isCompleted && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: withAlpha(CALM.positive, 0.08) }]}
                              onPress={() => handleArchive(goal)}
                              activeOpacity={0.7}
                            >
                              <Feather name="archive" size={14} color={CALM.positive} />
                              <Text style={[styles.actionBtnText, { color: CALM.positive }]}>archive</Text>
                            </TouchableOpacity>
                          )}
                          {goal.contributions?.length > 0 && (
                            <TouchableOpacity
                              style={styles.actionIconBtn}
                              onPress={() => openHistory(goal)}
                              activeOpacity={0.7}
                            >
                              <Feather name="clock" size={15} color={CALM.textMuted} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.actionIconBtn}
                            onPress={() => handleTogglePause(goal)}
                            activeOpacity={0.7}
                          >
                            <Feather name={goal.isPaused ? 'play' : 'pause'} size={15} color={CALM.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </Pressable>
                      {index < enrichedGoals.length - 1 && <View style={styles.cardDivider} />}
                    </React.Fragment>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noResults}>
                <Feather name="search" size={36} color={CALM.textMuted} />
                <Text style={styles.noResultsTitle}>no results found</Text>
                <Text style={styles.noResultsText}>try a different filter</Text>
              </View>
            )}

            {/* ── Archived ── */}
            {archivedGoals.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: SPACING['2xl'] }]}>archived</Text>
                <View style={styles.groupCard}>
                  <TouchableOpacity
                    style={styles.archivedToggle}
                    onPress={() => { lightTap(); setShowArchived((v) => !v); }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.archivedToggleLeft}>
                      <Feather name="archive" size={16} color={CALM.textMuted} />
                      <Text style={styles.archivedToggleText}>{archivedGoals.length} archived goal{archivedGoals.length > 1 ? 's' : ''}</Text>
                    </View>
                    <Feather name={showArchived ? 'chevron-up' : 'chevron-down'} size={18} color={CALM.textMuted} />
                  </TouchableOpacity>

                  {showArchived && archivedGoals.map((goal, index) => {
                    const pct = goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0;
                    return (
                      <React.Fragment key={goal.id}>
                        <View style={styles.cardDivider} />
                        <View style={[styles.archivedItem]}>
                          <View style={[styles.goalIconWrap, { backgroundColor: withAlpha(goal.color, 0.08) }]}>
                            <Feather name={goal.icon as any} size={16} color={goal.color} />
                          </View>
                          <View style={styles.goalInfo}>
                            <Text style={styles.archivedName} numberOfLines={1}>{goal.name}</Text>
                            <Text style={styles.archivedAmount}>
                              {currency} {goal.currentAmount.toLocaleString()} / {currency} {goal.targetAmount.toLocaleString()} · {pct}%
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.restoreBtn}
                            onPress={() => handleUnarchive(goal.id)}
                            activeOpacity={0.7}
                          >
                            <Feather name="rotate-ccw" size={14} color={CALM.accent} />
                          </TouchableOpacity>
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              </>
            )}
          </>
        ) : (
          /* ── Empty State ── */
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Feather name="target" size={48} color={CALM.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>no goals yet</Text>
            <Text style={styles.emptyText}>
              whether it's an emergency fund or a dream vacation, every ringgit counts
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => { lightTap(); openAddGoal(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyButtonText}>add goal</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── FAB ── */}
      {activeGoals.length > 0 && goalsList.length < MAX_GOALS && (
        <Animated.View style={[styles.fab, { bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md), transform: [{ scale: fabScale }] }]}>
          <TouchableOpacity
            style={styles.fabInner}
            onPress={() => { mediumTap(); openAddGoal(); }}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ═══ ADD / EDIT GOAL MODAL ═══ */}
      {goalModalVisible && <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={closeGoalModal}
      >
        <TouchableOpacity style={styles.overlayCenter} activeOpacity={1} onPress={closeGoalModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.kavWrapper}
          >
            <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingGoal ? 'edit goal' : 'create goal'}</Text>
                <TouchableOpacity onPress={closeGoalModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={22} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                contentContainerStyle={{ paddingBottom: SPACING.lg }}
              >
                {/* Templates */}
                {!editingGoal && (
                  <>
                    <Text style={styles.fieldLabel}>quick start</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.xs }}>
                      {GOAL_TEMPLATES.map((t) => (
                        <TouchableOpacity
                          key={t.name}
                          style={[
                            styles.templateChip,
                            goalName === t.name && { backgroundColor: withAlpha(t.color, 0.12), borderColor: t.color },
                          ]}
                          onPress={() => applyTemplate(t)}
                          activeOpacity={0.7}
                        >
                          <Feather name={t.icon} size={14} color={goalName === t.name ? t.color : CALM.textSecondary} />
                          <Text style={[styles.templateChipText, goalName === t.name && { color: t.color }]}>
                            {t.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={styles.fieldLabel}>name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={goalName}
                  onChangeText={setGoalName}
                  placeholder="e.g. Emergency Fund, Japan Trip"
                  placeholderTextColor={CALM.textMuted}
                  returnKeyType="next"
                  maxLength={50}
                />

                <Text style={styles.fieldLabel}>target amount</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.amountPrefix}>{currency}</Text>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1 }]}
                    value={goalTarget}
                    onChangeText={setGoalTarget}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={CALM.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>

                {/* Deadline */}
                <Text style={styles.fieldLabel}>deadline (optional)</Text>
                {!showCalendar ? (
                  <TouchableOpacity
                    style={styles.fieldTouchable}
                    onPress={() => { lightTap(); setShowCalendar(true); if (!goalDeadline) setGoalDeadline(new Date()); }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.fieldTouchableText}>
                      {goalDeadline ? format(goalDeadline, 'dd MMM yyyy') : 'set deadline'}
                    </Text>
                    <Feather name="calendar" size={16} color={CALM.textMuted} />
                  </TouchableOpacity>
                ) : (
                  <View>
                    <CalendarPicker
                      value={goalDeadline || new Date()}
                      minimumDate={new Date()}
                      onChange={(date) => setGoalDeadline(date)}
                    />
                    <TouchableOpacity
                      style={styles.clearDeadlineBtn}
                      onPress={() => { setGoalDeadline(undefined); setShowCalendar(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.clearDeadlineText}>clear deadline</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Icon Picker */}
                <Text style={styles.fieldLabel}>icon</Text>
                <View style={styles.iconPickerGrid}>
                  {GOAL_ICONS.map((icon) => {
                    const isSelected = goalIcon === icon;
                    return (
                      <TouchableOpacity
                        key={icon}
                        style={[
                          styles.iconPickerItem,
                          isSelected && { backgroundColor: withAlpha(goalColor, 0.12), borderColor: goalColor },
                        ]}
                        onPress={() => { lightTap(); setGoalIcon(icon); }}
                        activeOpacity={0.7}
                        accessibilityLabel={`Icon: ${icon}`}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Feather name={icon} size={22} color={isSelected ? goalColor : CALM.textSecondary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Color Picker */}
                <Text style={styles.fieldLabel}>color</Text>
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
                        {isSelected && <Feather name="check" size={16} color="#FFFFFF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Preview */}
                {goalName.trim() && (
                  <View style={styles.goalPreview}>
                    <View style={[styles.goalPreviewIcon, { backgroundColor: withAlpha(goalColor, 0.12) }]}>
                      <Feather name={goalIcon} size={20} color={goalColor} />
                    </View>
                    <Text style={styles.goalPreviewName} numberOfLines={1}>{goalName.trim()}</Text>
                    {goalTarget && parseFloat(goalTarget) > 0 && (
                      <Text style={styles.goalPreviewTarget}>
                        {currency} {parseFloat(goalTarget).toFixed(2)}
                      </Text>
                    )}
                  </View>
                )}

                {/* Confirm */}
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleSaveGoal}
                  activeOpacity={0.7}
                >
                  <Text style={styles.confirmBtnText}>{editingGoal ? 'save changes' : 'create goal'}</Text>
                </TouchableOpacity>

                {editingGoal && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => { setGoalModalVisible(false); resetGoalForm(); handleDeleteGoal(editingGoal); }}
                    activeOpacity={0.7}
                  >
                    <Feather name="trash-2" size={14} color={CALM.neutral} />
                    <Text style={styles.deleteBtnText}>delete this goal</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>}

      {/* ═══ CONTRIBUTE MODAL ═══ */}
      {contributeModalVisible && <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={closeContributeModal}
      >
        <TouchableOpacity style={styles.overlayCenter} activeOpacity={1} onPress={closeContributeModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.kavWrapper}
          >
            <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>contribute</Text>
                <TouchableOpacity onPress={closeContributeModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={22} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              {contributingGoal && (
                <View style={styles.contributeContext}>
                  <View style={[styles.contributeContextIcon, { backgroundColor: withAlpha(contributingGoal.color, 0.12) }]}>
                    <Feather
                      name={(contributingGoal.icon as keyof typeof Feather.glyphMap) || 'target'}
                      size={20}
                      color={contributingGoal.color}
                    />
                  </View>
                  <View style={styles.contributeContextInfo}>
                    <Text style={styles.contributeContextName}>{contributingGoal.name}</Text>
                    <Text style={styles.contributeContextProgress}>
                      {currency} {contributingGoal.currentAmount.toFixed(2)} / {currency} {contributingGoal.targetAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                contentContainerStyle={{ paddingBottom: SPACING.lg }}
              >
                {contributingGoal && (
                  <View style={styles.quickRow}>
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
                      >
                        <Text style={[styles.quickBtnText, { color: contributingGoal.color }]}>+{amt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={styles.fieldLabel}>amount</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.amountPrefix}>{currency}</Text>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1 }]}
                    value={contributeAmount}
                    onChangeText={setContributeAmount}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={CALM.textMuted}
                    returnKeyType="next"
                    autoFocus
                  />
                </View>

                {contributingGoal && contributeAmount && parseFloat(contributeAmount) > 0 && (
                  <View style={styles.contributePreview}>
                    {(() => {
                      const newAmount = contributingGoal.currentAmount + parseFloat(contributeAmount);
                      const newPct = contributingGoal.targetAmount > 0
                        ? Math.min((newAmount / contributingGoal.targetAmount) * 100, 100)
                        : 0;
                      const remaining = Math.max(contributingGoal.targetAmount - newAmount, 0);
                      let paceStr = '';
                      if (contributingGoal.deadline && remaining > 0) {
                        const dl = new Date(contributingGoal.deadline);
                        const daysLeft = differenceInCalendarDays(dl, new Date());
                        if (daysLeft > 0) {
                          paceStr = `~${currency} ${Math.ceil(remaining / daysLeft)}/day to deadline`;
                        }
                      }
                      return (
                        <>
                          <Text style={styles.contributePreviewLabel}>after this contribution</Text>
                          <Text style={[styles.contributePreviewValue, { color: newPct >= 100 ? CALM.positive : CALM.textPrimary }]}>
                            {newPct.toFixed(0)}% complete
                          </Text>
                          {remaining > 0 && (
                            <Text style={styles.contributePreviewRemaining}>
                              {currency} {remaining.toFixed(2)} to go
                            </Text>
                          )}
                          {paceStr !== '' && <Text style={styles.contributePreviewRemaining}>{paceStr}</Text>}
                          {newPct >= 100 && <Text style={styles.contributePreviewCelebrate}>goal will be reached.</Text>}
                        </>
                      );
                    })()}
                  </View>
                )}

                {wallets.length > 0 && (
                  <>
                    <Text style={styles.fieldLabel}>wallet (optional)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
                      <TouchableOpacity
                        style={[styles.walletChip, !contributeWalletId && styles.walletChipActive]}
                        onPress={() => setContributeWalletId(undefined)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.walletChipText, !contributeWalletId && styles.walletChipTextActive]}>none</Text>
                      </TouchableOpacity>
                      {wallets.filter((w) => w.type !== 'credit').map((w) => (
                        <TouchableOpacity
                          key={w.id}
                          style={[styles.walletChip, contributeWalletId === w.id && styles.walletChipActive]}
                          onPress={() => { lightTap(); setContributeWalletId(w.id); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.walletChipText, contributeWalletId === w.id && styles.walletChipTextActive]}>
                            {w.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={styles.fieldLabel}>note (optional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={contributeNote}
                  onChangeText={setContributeNote}
                  placeholder="e.g. birthday money, bonus"
                  placeholderTextColor={CALM.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleContribute}
                  activeOpacity={0.7}
                >
                  <Text style={styles.confirmBtnText}>contribute</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>}

      {/* ═══ CONTRIBUTION HISTORY MODAL ═══ */}
      {historyModalVisible && <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <TouchableOpacity style={styles.overlayCenter} activeOpacity={1} onPress={() => setHistoryModalVisible(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{historyGoal?.name || 'history'}</Text>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={22} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.historyStatsRow}>
              <View style={styles.historyStatItem}>
                <Text style={styles.historyStatLabel}>total</Text>
                <Text style={styles.historyStatValue}>{currency} {historyStats.total.toFixed(2)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.historyStatItem}>
                <Text style={styles.historyStatLabel}>average</Text>
                <Text style={styles.historyStatValue}>{currency} {historyStats.avg.toFixed(2)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.historyStatItem}>
                <Text style={styles.historyStatLabel}>count</Text>
                <Text style={styles.historyStatValue}>{historyStats.count}</Text>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 400 }}
              contentContainerStyle={{ paddingBottom: SPACING.lg }}
            >
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
                          <Text style={[styles.historyItemAmount, isWithdrawal && { color: CALM.neutral }]}>
                            {isWithdrawal ? '-' : '+'}{currency} {Math.abs(c.amount).toFixed(2)}
                          </Text>
                          {c.note && <Text style={styles.historyItemNote} numberOfLines={1}>{c.note}</Text>}
                        </View>
                        {historyGoal && (
                          <TouchableOpacity
                            onPress={() => handleUndoContribution(historyGoal.id, c)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Feather name="corner-down-left" size={16} color={CALM.neutral} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
              {historyGroups.length === 0 && (
                <Text style={styles.noResultsText}>no contributions yet.</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>}
    </View>
  );
};

// ── STYLES ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CALM.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.xl },

  // ── Hero ──
  heroCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  heroSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.md,
  },
  heroProgressTrack: {
    height: 4,
    backgroundColor: withAlpha(CALM.textMuted, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.full,
  },
  heroMonthly: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.accent,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  heroStats: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },

  // ── Filter Chips ──
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
  },
  filterChipActive: {
    backgroundColor: CALM.deepOlive,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // ── Section Label ──
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },

  // ── Group Card ──
  groupCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.xs,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CALM.border,
    marginLeft: 36 + SPACING.md + SPACING.md,
  },
  goalItem: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },

  // ── Goal Header ──
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  goalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  goalInfo: { flex: 1, marginRight: SPACING.sm },
  goalNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  goalName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    flexShrink: 1,
  },
  pausedBadge: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 1,
  },
  pausedBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  goalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  goalMetaText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  goalMetaDot: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  goalPercentage: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ── Progress ──
  goalProgressTrack: {
    height: 3,
    backgroundColor: withAlpha(CALM.textMuted, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },

  // ── Milestones ──
  milestoneDots: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm },
  milestoneDotContainer: { alignItems: 'center', gap: 3 },
  milestoneDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  milestoneDotLabel: { fontSize: 10, color: CALM.neutral, fontWeight: TYPOGRAPHY.weight.medium, fontVariant: ['tabular-nums'] },

  // ── Observation ──
  observationText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },

  // ── Pace ──
  paceText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.sm,
  },

  // ── Sparkline ──
  sparklineWrap: { marginBottom: 4 },
  sparklineLabel: { fontSize: TYPOGRAPHY.size.xs, color: CALM.neutral, marginBottom: SPACING.sm },

  // ── Quick Contribute ──
  quickRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.sm, flexWrap: 'wrap' },
  quickBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
  },
  quickBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, fontVariant: ['tabular-nums'] },

  // ── Wallet Chips ──
  walletChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: CALM.border, marginRight: SPACING.xs },
  walletChipActive: { backgroundColor: CALM.accent, borderColor: CALM.accent },
  walletChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: CALM.textSecondary },
  walletChipTextActive: { color: '#FFFFFF' },

  // ── Action Row ──
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  actionBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  actionIconBtn: {
    padding: SPACING.xs + 2,
    borderRadius: RADIUS.md,
  },

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
    color: CALM.textPrimary,
    marginTop: SPACING.sm,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'center',
  },

  // ── Empty State ──
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
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.size.sm * 1.6,
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  emptyButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ── Archived ──
  archivedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  archivedToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  archivedToggleText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: CALM.textMuted },
  archivedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    opacity: 0.6,
  },
  archivedName: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: CALM.textSecondary },
  archivedAmount: { fontSize: TYPOGRAPHY.size.xs, color: CALM.textMuted, fontVariant: ['tabular-nums'], marginTop: 2 },
  restoreBtn: {
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    right: SPACING.xl,
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CALM.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },

  // ── Modal (centered floating card) ──
  overlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kavWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '90%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
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
    color: CALM.textPrimary,
  },

  // ── Modal Fields ──
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  fieldInput: {
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  amountPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  fieldTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    paddingVertical: SPACING.sm + 2,
  },
  fieldTouchableText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  clearDeadlineBtn: { alignItems: 'center', paddingVertical: SPACING.sm, marginTop: SPACING.xs },
  clearDeadlineText: { fontSize: TYPOGRAPHY.size.sm, color: CALM.neutral, fontWeight: TYPOGRAPHY.weight.medium },

  // ── Templates ──
  templateChip: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: CALM.border, marginRight: SPACING.xs },
  templateChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: CALM.textSecondary },

  // ── Pickers ──
  iconPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  iconPickerItem: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: CALM.background, borderWidth: 1.5, borderColor: CALM.border },
  colorPickerRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  colorPickerItem: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  colorPickerItemSelected: { borderWidth: 3, borderColor: CALM.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3 },

  // ── Preview ──
  goalPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: CALM.background, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg, gap: SPACING.sm },
  goalPreviewIcon: { width: 36, height: 36, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  goalPreviewName: { flex: 1, fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: CALM.textPrimary },
  goalPreviewTarget: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: CALM.accent, fontVariant: ['tabular-nums'] },

  // ── Confirm / Delete ──
  confirmBtn: {
    backgroundColor: CALM.accent,
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
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg, paddingVertical: SPACING.sm },
  deleteBtnText: { fontSize: TYPOGRAPHY.size.sm, color: CALM.neutral },

  // ── Contribute Context ──
  contributeContext: { flexDirection: 'row', alignItems: 'center', backgroundColor: CALM.background, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md },
  contributeContextIcon: { width: 40, height: 40, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  contributeContextInfo: { flex: 1 },
  contributeContextName: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: CALM.textPrimary, marginBottom: 2 },
  contributeContextProgress: { fontSize: TYPOGRAPHY.size.sm, color: CALM.textSecondary, fontVariant: ['tabular-nums'] },

  // ── Contribute Preview ──
  contributePreview: { backgroundColor: CALM.background, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg, alignItems: 'center' },
  contributePreviewLabel: { fontSize: TYPOGRAPHY.size.xs, color: CALM.textSecondary, marginBottom: 4 },
  contributePreviewValue: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, fontVariant: ['tabular-nums'] },
  contributePreviewRemaining: { fontSize: TYPOGRAPHY.size.sm, color: CALM.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  contributePreviewCelebrate: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: CALM.positive, marginTop: SPACING.xs },

  // ── History ──
  historyStatsRow: { flexDirection: 'row', backgroundColor: CALM.background, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  historyStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  historyStatLabel: { fontSize: TYPOGRAPHY.size.xs, color: CALM.textSecondary, fontWeight: TYPOGRAPHY.weight.medium },
  historyStatValue: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: CALM.textPrimary, fontVariant: ['tabular-nums'] },
  statDivider: { width: 1, backgroundColor: CALM.border },
  historyGroupLabel: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: CALM.textSecondary, marginTop: SPACING.md, marginBottom: SPACING.sm },
  historyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CALM.border },
  historyItemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' },
  historyItemDate: { fontSize: TYPOGRAPHY.size.sm, color: CALM.textSecondary, minWidth: 50 },
  historyItemAmount: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: CALM.textPrimary, fontVariant: ['tabular-nums'] },
  historyItemNote: { fontSize: TYPOGRAPHY.size.xs, color: CALM.neutral, maxWidth: 120 },
});

export default Goals;
