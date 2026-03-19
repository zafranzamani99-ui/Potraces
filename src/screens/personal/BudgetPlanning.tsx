import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  InteractionManager,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
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
import { CALM, SPACING, TYPOGRAPHY, RADIUS, BUDGET_PERIODS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import { FREE_TIER } from '../../constants/premium';
import CategoryPicker from '../../components/common/CategoryPicker';
import PaywallModal from '../../components/common/PaywallModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremiumStore } from '../../store/premiumStore';
import { useToast } from '../../context/ToastContext';
import { Budget, CategoryOption, Playbook } from '../../types';
import { useNavigation } from '@react-navigation/native';
import { lightTap, mediumTap } from '../../services/haptics';
import ScreenGuide from '../../components/common/ScreenGuide';
import { usePlaybookStore } from '../../store/playbookStore';
import { computePlaybookStats, isOverspent, getOverspentAmount, isPlaybookStale } from '../../utils/playbookStats';
import PlaybookNotebook from '../../components/playbook/PlaybookNotebook';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { format } from 'date-fns';

// ─── Pace helpers ──────────────────────────────────────────
const getPaceColor = (paceRatio: number) => {
  if (paceRatio <= 1.1) return CALM.accent; // olive — on track / ahead
  if (paceRatio <= 1.3) return CALM.bronze; // bronze — moving a bit fast
  return '#DEAB22'; // gold — needs attention
};

const getPaceLabel = (paceRatio: number) => {
  if (paceRatio < 0.9) return 'ahead';
  if (paceRatio <= 1.1) return 'on track';
  if (paceRatio <= 1.3) return 'moving a bit fast';
  return 'needs attention';
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
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { budgets, addBudget, updateBudget, deleteBudget, transactions } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const canCreateBudget = usePremiumStore((s) => s.canCreateBudget);
  const tier = usePremiumStore((s) => s.tier);
  const expenseCategories = useCategories('expense');

  const [modalVisible, setModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [category, setCategory] = useState(expenseCategories[0]?.id || 'food');
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

    const totalAllocated = budgetsWithSpent
      .filter((b) => b.period === 'monthly')
      .reduce((sum, b) => sum + b.allocatedAmount, 0);

    const totalSpent = totalExpenses;
    const freeToSpend = totalIncome - totalExpenses;

    const daysInMonth = getDaysInMonth(now);
    const dayOfMonth = getDate(now);
    const daysRemaining = Math.max(daysInMonth - dayOfMonth + 1, 1);
    const dailyAllowance = freeToSpend > 0 ? freeToSpend / daysRemaining : 0;

    const percentElapsed = dayOfMonth / daysInMonth;
    const percentSpent = totalIncome > 0 ? totalSpent / totalIncome : 0;
    const paceRatio = percentElapsed > 0 ? percentSpent / percentElapsed : 0;

    return {
      freeToSpend,
      dailyAllowance,
      daysRemaining,
      daysInMonth,
      percentSpent,
      totalIncome,
      totalSpent,
      totalAllocated,
      paceRatio,
      paceColor: getPaceColor(paceRatio),
    };
  }, [transactions, budgetsWithSpent, now]);

  // ─── Handlers ────────────────────────────────────────────
  const handleAdd = useCallback(() => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      showToast('enter a valid amount', 'error');
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
    setModalVisible(false);
    resetForm();
  }, [resetForm]);

  const openAddModal = useCallback(() => {
    if (!canCreateBudget(budgets.length)) {
      setPaywallVisible(true);
      return;
    }
    lightTap();
    setModalVisible(true);
  }, [canCreateBudget, budgets.length]);

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
      paceColor: getPaceColor(paceRatio),
      paceLabel: getPaceLabel(paceRatio),
      leftAmount,
      dailyBudget,
      cat,
    };
  }, [now, expenseCategories]);

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

  const [ready, setReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  if (!ready) {
    return (
      <View style={styles.container}>
        <SkeletonLoader />
        <SkeletonLoader style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────
  const hasBudgets = budgetsWithSpent.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Segment Toggle ── */}
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

        {/* ── Hero: Breathing Room ── */}
        {hasBudgets && (
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>breathing room</Text>
            <Text style={styles.heroAmount}>
              {currency} {heroData.freeToSpend.toFixed(0)}{' '}
              <Text style={styles.heroAmountSub}>left this month</Text>
            </Text>
            <Text style={styles.heroDailyText}>
              {currency} {heroData.dailyAllowance.toFixed(0)}/day for {heroData.daysRemaining} days
            </Text>

            {/* Progress bar */}
            <View style={styles.heroBarTrack}>
              <View
                style={[
                  styles.heroBarFill,
                  {
                    width: `${Math.min(heroData.percentSpent * 100, 100)}%`,
                    backgroundColor: heroData.paceColor,
                  },
                ]}
              />
            </View>
            <Text style={[styles.heroPercentText, { color: heroData.paceColor }]}>
              {(heroData.percentSpent * 100).toFixed(0)}%
            </Text>
          </View>
        )}

        {/* ── Over-limit banner ── */}
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

        {/* ── Budget Cards (wallet-style grouped) ── */}
        {hasBudgets ? (
          <View style={styles.groupCard}>
            {budgetsWithSpent.map((budget, index) => {
              const meta = getBudgetMeta(budget);
              const isLast = index === budgetsWithSpent.length - 1;
              const isExpanded = expandedId === budget.id;
              const percentage = meta.percentSpent * 100;

              return (
                <View key={budget.id}>
                  <Pressable
                    onPress={() => toggleExpand(budget.id)}
                    style={({ pressed }) => [styles.budgetRow, pressed && { opacity: 0.7 }]}
                  >
                    {/* Icon */}
                    <View
                      style={[
                        styles.iconCircle,
                        {
                          backgroundColor: meta.cat?.color
                            ? withAlpha(meta.cat.color, 0.08)
                            : withAlpha(C.accent, 0.08),
                        },
                      ]}
                    >
                      <Feather
                        name={(meta.cat?.icon as keyof typeof Feather.glyphMap) || 'pie-chart'}
                        size={18}
                        color={meta.cat?.color || C.accent}
                      />
                    </View>

                    {/* Content */}
                    <View style={styles.budgetContent}>
                      {/* Name row */}
                      <View style={styles.budgetNameRow}>
                        <Text style={styles.budgetName} numberOfLines={1}>
                          {meta.cat?.name || budget.category}
                        </Text>
                        <Text style={styles.budgetAmounts}>
                          <Text style={{ fontWeight: TYPOGRAPHY.weight.semibold }}>
                            {currency} {budget.spentAmount.toFixed(0)}
                          </Text>
                          {' / '}
                          {budget.allocatedAmount.toFixed(0)}
                        </Text>
                      </View>

                      {/* Progress bar */}
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              width: `${Math.min(percentage, 100)}%`,
                              backgroundColor: meta.paceColor,
                            },
                          ]}
                        />
                      </View>

                      {/* Pace row */}
                      <View style={styles.paceRow}>
                        <Text style={styles.paceText}>
                          {currency} {meta.dailyBudget.toFixed(0)}/day
                          {'  ·  '}
                          {meta.remaining} days left
                          {'  ·  '}
                          <Text style={{ color: meta.paceColor }}>{meta.paceLabel}</Text>
                        </Text>
                        <Text style={[styles.percentLabel, { color: meta.paceColor }]}>
                          {percentage.toFixed(0)}%
                        </Text>
                      </View>

                      {/* Warm context label */}
                      <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: meta.percentSpent > 1 ? C.bronze : C.textMuted, marginTop: 2 }}>
                        {meta.percentSpent > 1
                          ? `went past — by ${currency} ${(budget.spentAmount - budget.allocatedAmount).toFixed(0)}`
                          : meta.percentSpent >= 0.95
                          ? 'almost there'
                          : meta.percentSpent >= 0.8
                          ? 'getting close'
                          : meta.percentSpent >= 0.5
                          ? 'on track'
                          : 'plenty of room'}
                      </Text>

                      {/* Rollover info */}
                      {budget.rollover && budget.rolloverAmount != null && budget.rolloverAmount !== 0 && (
                        <Text style={styles.rolloverText}>
                          {budget.rolloverAmount > 0
                            ? `+${currency} ${budget.rolloverAmount.toFixed(0)} from last month`
                            : `-${currency} ${Math.abs(budget.rolloverAmount).toFixed(0)} to make up`}
                        </Text>
                      )}
                    </View>
                  </Pressable>

                  {/* Expanded actions */}
                  {isExpanded && (
                    <View style={styles.expandedActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleEdit(budget)}
                        activeOpacity={0.7}
                      >
                        <Feather name="edit-2" size={16} color={C.accent} />
                        <Text style={[styles.actionText, { color: C.accent }]}>{t.common.edit.toLowerCase()}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDelete(budget)}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={16} color={C.neutral} />
                        <Text style={[styles.actionText, { color: C.neutral }]}>{t.common.delete.toLowerCase()}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {!isLast && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        ) : (
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
              <Feather name="plus" size={18} color="#fff" />
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
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKAV}
          >
            <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingBudget ? t.budget.editBudget.toLowerCase() : t.budget.addBudget.toLowerCase()}
                </Text>
                <TouchableOpacity
                  onPress={closeModal}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={22} color={C.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                contentContainerStyle={{ paddingBottom: SPACING.md }}
              >
                {/* Category */}
                <CategoryPicker
                  categories={expenseCategories}
                  selectedId={category}
                  onSelect={setCategory}
                  label={t.budget.category.toLowerCase()}
                  layout="dropdown"
                />

                {/* Amount */}
                <Text style={styles.label}>{t.budget.amount.toLowerCase()}</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={C.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>

                {/* Period — inline picker */}
                <Text style={styles.label}>{t.budget.period.toLowerCase()}</Text>
                <View style={styles.periodRow}>
                  {BUDGET_PERIODS.map((p) => {
                    const isActive = period === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        style={[styles.periodChip, isActive && styles.periodChipActive]}
                        onPress={() => { lightTap(); setPeriod(p.value as typeof period); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.periodChipText, isActive && styles.periodChipTextActive]}>
                          {p.label.toLowerCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Rollover toggle */}
                <View style={styles.rolloverRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rolloverLabel}>{t.budget.rollover}</Text>
                    <Text style={styles.rolloverHint}>
                      carry leftover to next period
                    </Text>
                  </View>
                  <Switch
                    value={rollover}
                    onValueChange={setRollover}
                    trackColor={{ false: C.border, true: withAlpha(C.accent, 0.3) }}
                    thumbColor={rollover ? C.accent : C.textMuted}
                  />
                </View>
              </ScrollView>

              {/* Confirm — pinned outside scroll so it's always visible */}
              <TouchableOpacity
                style={[styles.confirmButton, { marginTop: SPACING.md }]}
                onPress={handleAdd}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmButtonText}>
                  {editingBudget ? t.common.save.toLowerCase() : t.budget.addBudget.toLowerCase()}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="budget"
        currentUsage={budgets.length}
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
          <Feather name="plus" size={24} color="#fff" />
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
      <ScreenGuide
        id="guide_budget"
        title={t.guide.spendingLimits}
        icon="sliders"
        tips={[
          t.guide.tipBudget1,
          t.guide.tipBudget2,
          t.guide.tipBudget3,
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
  },

  // Hero
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
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
    ...SHADOWS.xs,
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
    color: '#fff',
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
    ...SHADOWS.md,
  },

  // Modal
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
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '88%',
    maxHeight: '85%',
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
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
    borderColor: C.inputBorder,
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

  // Period chips (inline)
  periodRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
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

  // Rollover
  rolloverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  rolloverLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  rolloverHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },

  // Confirm button
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
    color: '#fff',
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
    color: '#fff',
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
});

export default BudgetPlanning;
