import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
} from 'react-native';
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
import { useCategories } from '../../hooks/useCategories';
import { FREE_TIER } from '../../constants/premium';
import CategoryPicker from '../../components/common/CategoryPicker';
import PaywallModal from '../../components/common/PaywallModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremiumStore } from '../../store/premiumStore';
import { useToast } from '../../context/ToastContext';
import { Budget, CategoryOption, Playbook, PlaybookAllocation } from '../../types';
import { lightTap, mediumTap } from '../../services/haptics';
import { usePlaybookStore } from '../../store/playbookStore';
import { computePlaybookStats, isOverspent, getOverspentAmount, isPlaybookStale } from '../../utils/playbookStats';
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
  const [viewingPlaybook, setViewingPlaybook] = useState<Playbook | null>(null);
  const [txModalVisible, setTxModalVisible] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());

  // Create/edit playbook form
  const [pbName, setPbName] = useState('');
  const [pbAmount, setPbAmount] = useState('');
  const [pbAllocations, setPbAllocations] = useState<PlaybookAllocation[]>([]);
  const [showAllocations, setShowAllocations] = useState(false);

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
    if (!amount || parseFloat(amount) <= 0) {
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
      'delete budget',
      'are you sure you want to remove this budget?',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'delete',
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
    setPbAllocations([]);
    setShowAllocations(false);
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
        allocations: pbAllocations.filter((a) => a.allocatedAmount > 0),
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
      allocations: pbAllocations.filter((a) => a.allocatedAmount > 0),
    });
    if (id) {
      closePlaybookModal();
      showToast('playbook created', 'success');
    } else {
      showToast('you already have 2 active playbooks', 'error');
    }
  }, [pbName, pbAmount, pbAllocations, editingPlaybook, canCreatePb, createPlaybook, updatePlaybookAction, closePlaybookModal, showToast]);

  const handleEditPlaybook = useCallback((pb: Playbook) => {
    lightTap();
    setEditingPlaybook(pb);
    setPbName(pb.name);
    setPbAmount(pb.sourceAmount.toString());
    setPbAllocations(pb.allocations.length > 0 ? [...pb.allocations] : []);
    setShowAllocations(pb.allocations.length > 0);
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

  const handleViewTransactions = useCallback((pb: Playbook) => {
    setViewingPlaybook(pb);
    setTxModalVisible(true);
  }, []);

  const getCategoryInfo = useCallback((catId: string) => {
    return expenseCategories.find((c) => c.id === catId);
  }, [expenseCategories]);

  // Linked transactions for the viewing playbook
  const viewingLinkedTxns = useMemo(() => {
    if (!viewingPlaybook) return [];
    return transactions
      .filter((t) => viewingPlaybook.linkedExpenseIds.includes(t.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [viewingPlaybook, transactions]);

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
              regular budget
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
            <Feather name="info" size={16} color={CALM.bronze} />
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
                            : withAlpha(CALM.accent, 0.08),
                        },
                      ]}
                    >
                      <Feather
                        name={(meta.cat?.icon as keyof typeof Feather.glyphMap) || 'pie-chart'}
                        size={18}
                        color={meta.cat?.color || CALM.accent}
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
                        <Feather name="edit-2" size={16} color={CALM.accent} />
                        <Text style={[styles.actionText, { color: CALM.accent }]}>edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDelete(budget)}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={16} color={CALM.neutral} />
                        <Text style={[styles.actionText, { color: CALM.neutral }]}>delete</Text>
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
              <Feather name="pie-chart" size={48} color={CALM.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>set your spending targets</Text>
            <Text style={styles.emptyMessage}>
              track how much you want to spend per category
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={openAddModal}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.emptyButtonText}>add budget</Text>
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
            {activePlaybooks.map((pb) => {
              const stats = playbookStatsMap[pb.id];
              if (!stats) return null;
              const over = isOverspent(pb, stats);
              const overAmount = getOverspentAmount(pb, stats);
              const rawRemaining = pb.sourceAmount - stats.totalSpent;

              return (
                <View key={pb.id} style={styles.pbCard}>
                  {/* Header — wallet-style row */}
                  <View style={styles.pbCardHeaderRow}>
                    <View style={[styles.pbIconCircle, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                      <Feather name="book-open" size={20} color={CALM.accent} />
                    </View>
                    <View style={styles.pbCardInfo}>
                      <View style={styles.pbCardNameRow}>
                        <Text style={styles.pbCardTitle} numberOfLines={1}>{pb.name}</Text>
                        <View style={styles.pbStatusBadge}>
                          <Text style={styles.pbStatusText}>active</Text>
                        </View>
                      </View>
                      <Text style={styles.pbCardAmount}>
                        {currency} {pb.sourceAmount.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* Waterfall */}
                  {stats.categoryBreakdown.length > 0 && (
                    <View style={styles.pbWaterfall}>
                      <Text style={styles.pbSectionLabel}>where it went</Text>
                      {stats.categoryBreakdown.map((cat, catIdx) => {
                        const catInfo = getCategoryInfo(cat.category);
                        const barWidth = pb.sourceAmount > 0 ? (cat.spent / pb.sourceAmount) * 100 : 0;
                        const catColor = catInfo?.color || CALM.neutral;
                        return (
                          <View key={`${cat.category}-${catIdx}`} style={styles.pbWaterfallRow}>
                            <Text style={styles.pbWaterfallLabel} numberOfLines={1}>
                              {catInfo?.name || cat.category}
                            </Text>
                            <View style={styles.pbWaterfallBarTrack}>
                              <View
                                style={[
                                  styles.pbWaterfallBarFill,
                                  {
                                    width: `${Math.min(barWidth, 100)}%`,
                                    backgroundColor: withAlpha(catColor, 0.6),
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.pbWaterfallAmount}>
                              {currency} {cat.spent.toFixed(0)}
                            </Text>
                            <Text style={styles.pbWaterfallPercent}>
                              {cat.percentOfTotal.toFixed(0)}%
                            </Text>
                          </View>
                        );
                      })}
                      {/* Remaining */}
                      <View style={[styles.pbWaterfallRow, { marginTop: SPACING.sm }]}>
                        <Text style={[styles.pbWaterfallLabel, { color: over ? CALM.neutral : CALM.accent, fontWeight: TYPOGRAPHY.weight.semibold }]}>
                          {over ? 'overspent' : 'remaining'}
                        </Text>
                        <View style={{ flex: 1 }} />
                        <Text style={[styles.pbWaterfallAmount, { color: over ? CALM.neutral : CALM.accent, fontWeight: TYPOGRAPHY.weight.semibold }]}>
                          {over
                            ? `${currency} ${overAmount.toFixed(0)} over`
                            : `${currency} ${rawRemaining.toFixed(0)}`}
                        </Text>
                        <Text style={[styles.pbWaterfallPercent, { color: over ? CALM.neutral : CALM.accent }]}>
                          {over ? '' : `${(100 - stats.percentSpent).toFixed(0)}%`}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Summary row — wallet-style */}
                  <View style={styles.pbSummaryRow}>
                    <View style={styles.pbSummaryItem}>
                      <Text style={styles.pbSummaryLabel}>{stats.linkedTransactionCount} txns</Text>
                      <Text style={styles.pbSummaryValue}>
                        ~{currency} {stats.dailyBurnRate.toFixed(0)}/day
                      </Text>
                    </View>
                    <View style={[styles.pbSummaryItem, styles.pbSummaryDivider]}>
                      <Text style={styles.pbSummaryLabel}>{stats.daysActive} days</Text>
                      <Text style={styles.pbSummaryValue}>
                        {stats.daysUntilEmpty != null ? `~${stats.daysUntilEmpty}d left` : '—'}
                      </Text>
                    </View>
                  </View>

                  {/* Allocation progress bars */}
                  {pb.allocations.length > 0 && (
                    <View style={styles.pbAllocSection}>
                      <Text style={styles.pbSectionLabel}>category limits</Text>
                      {pb.allocations.map((alloc, allocIdx) => {
                        const catInfo = getCategoryInfo(alloc.category);
                        const catBreakdown = stats.categoryBreakdown.find((c) => c.category === alloc.category);
                        const spent = catBreakdown?.spent || 0;
                        const pct = alloc.allocatedAmount > 0 ? (spent / alloc.allocatedAmount) * 100 : 0;
                        const allocOver = spent > alloc.allocatedAmount;
                        return (
                          <View key={`${alloc.category}-${allocIdx}`} style={styles.pbAllocRow}>
                            <Text style={styles.pbAllocLabel} numberOfLines={1}>
                              {catInfo?.name || alloc.category}
                            </Text>
                            <Text style={styles.pbAllocAmounts}>
                              {currency} {spent.toFixed(0)}/{alloc.allocatedAmount.toFixed(0)}
                            </Text>
                            <View style={styles.pbAllocBarTrack}>
                              <View
                                style={[
                                  styles.pbAllocBarFill,
                                  {
                                    width: `${Math.min(pct, 100)}%`,
                                    backgroundColor: allocOver ? CALM.bronze : (catInfo?.color || CALM.accent),
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Actions */}
                  <View style={styles.pbCardActions}>
                    <TouchableOpacity
                      style={styles.pbActionBtn}
                      onPress={() => handleViewTransactions(pb)}
                      activeOpacity={0.7}
                    >
                      <Feather name="list" size={14} color={CALM.accent} />
                      <Text style={[styles.pbActionText, { color: CALM.accent }]}>transactions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pbActionBtn}
                      onPress={() => handleEditPlaybook(pb)}
                      activeOpacity={0.7}
                    >
                      <Feather name="edit-2" size={14} color={CALM.textSecondary} />
                      <Text style={[styles.pbActionText, { color: CALM.textSecondary }]}>edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pbActionBtn}
                      onPress={() => handleClosePlaybook(pb)}
                      activeOpacity={0.7}
                    >
                      <Feather name="check-circle" size={14} color={CALM.bronze} />
                      <Text style={[styles.pbActionText, { color: CALM.bronze }]}>close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Empty active state */}
            {activePlaybooks.length === 0 && (
              <View style={styles.pbEmptyState}>
                <Feather name="book-open" size={40} color={CALM.textMuted} />
                <Text style={styles.pbEmptyTitle}>no active playbooks</Text>
                <Text style={styles.pbEmptyMessage}>
                  create one when income arrives to track where every ringgit goes
                </Text>
              </View>
            )}
          </>)}

          {/* ── Past tab ── */}
          {playbookTab === 'past' && (<>
            {closedPlaybooks.map((pb) => {
              const stats = playbookStatsMap[pb.id];
              if (!stats) return null;
              const startStr = format(pb.startDate instanceof Date ? pb.startDate : new Date(pb.startDate), 'MMM d');
              const endStr = pb.endDate ? format(pb.endDate instanceof Date ? pb.endDate : new Date(pb.endDate), 'MMM d') : '—';

              return (
                <View key={pb.id} style={styles.pbCard}>
                  <View style={styles.pbCardHeaderRow}>
                    <View style={[styles.pbIconCircle, { backgroundColor: withAlpha(CALM.neutral, 0.08) }]}>
                      <Feather name="book-open" size={20} color={CALM.neutral} />
                    </View>
                    <View style={styles.pbCardInfo}>
                      <View style={styles.pbCardNameRow}>
                        <Text style={[styles.pbCardTitle, { color: CALM.textSecondary }]} numberOfLines={1}>{pb.name}</Text>
                        <View style={[styles.pbStatusBadge, { backgroundColor: withAlpha(CALM.neutral, 0.08) }]}>
                          <Text style={[styles.pbStatusText, { color: CALM.neutral }]}>ended</Text>
                        </View>
                      </View>
                      <Text style={styles.pbCardAmount}>
                        {currency} {pb.sourceAmount.toFixed(2)} → {stats.totalSpent.toFixed(0)} spent ({stats.percentSpent.toFixed(0)}%)
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.pbStatsLine}>
                    {startStr} – {endStr} · {stats.daysActive} days · {stats.linkedTransactionCount} txns
                  </Text>

                  <View style={styles.pbCardActions}>
                    <TouchableOpacity
                      style={styles.pbActionBtn}
                      onPress={() => handleViewTransactions(pb)}
                      activeOpacity={0.7}
                    >
                      <Feather name="eye" size={14} color={CALM.accent} />
                      <Text style={[styles.pbActionText, { color: CALM.accent }]}>view summary</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pbActionBtn}
                      onPress={() => handleReopenPlaybook(pb)}
                      activeOpacity={0.7}
                    >
                      <Feather name="rotate-ccw" size={14} color={CALM.bronze} />
                      <Text style={[styles.pbActionText, { color: CALM.bronze }]}>reopen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pbActionBtn}
                      onPress={() => handleDeletePlaybook(pb)}
                      activeOpacity={0.7}
                    >
                      <Feather name="trash-2" size={14} color={CALM.neutral} />
                      <Text style={[styles.pbActionText, { color: CALM.neutral }]}>delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Empty past state */}
            {closedPlaybooks.length === 0 && (
              <View style={styles.pbEmptyState}>
                <Text style={styles.pbEmptyTitle}>no past playbooks</Text>
                <Text style={styles.pbEmptyMessage}>
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
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKAV}
          >
            <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingBudget ? 'edit budget' : 'add budget'}
                </Text>
                <TouchableOpacity
                  onPress={closeModal}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={22} color={CALM.textPrimary} />
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
                  label="category"
                  layout="dropdown"
                />

                {/* Amount */}
                <Text style={styles.label}>amount</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={CALM.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>

                {/* Period — inline picker */}
                <Text style={styles.label}>period</Text>
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
                    <Text style={styles.rolloverLabel}>roll over unused amount</Text>
                    <Text style={styles.rolloverHint}>
                      carry leftover to next period
                    </Text>
                  </View>
                  <Switch
                    value={rollover}
                    onValueChange={setRollover}
                    trackColor={{ false: CALM.border, true: withAlpha(CALM.accent, 0.3) }}
                    thumbColor={rollover ? CALM.accent : CALM.textMuted}
                  />
                </View>

                {/* Confirm */}
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleAdd}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmButtonText}>
                    {editingBudget ? 'update' : 'add budget'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
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
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePlaybookModal}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalKAV}
            >
              <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {editingPlaybook ? 'edit playbook' : 'create playbook'}
                  </Text>
                  <TouchableOpacity
                    onPress={closePlaybookModal}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={22} color={CALM.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  <Text style={styles.label}>name</Text>
                  <TextInput
                    style={styles.pbInput}
                    value={pbName}
                    onChangeText={setPbName}
                    placeholder="e.g. March Salary"
                    placeholderTextColor={CALM.textMuted}
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
                      placeholderTextColor={CALM.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      editable={!editingPlaybook}
                    />
                  </View>
                  {editingPlaybook && (
                    <Text style={styles.pbEditHint}>amount cannot be changed after creation</Text>
                  )}

                  {/* Optional category limits */}
                  <TouchableOpacity
                    style={styles.pbToggleAllocRow}
                    onPress={() => setShowAllocations(!showAllocations)}
                    activeOpacity={0.7}
                  >
                    <Feather name={showAllocations ? 'chevron-down' : 'chevron-right'} size={16} color={CALM.textSecondary} />
                    <Text style={styles.pbToggleAllocText}>set category limits (optional)</Text>
                  </TouchableOpacity>

                  {showAllocations && (
                    <View style={styles.pbAllocForm}>
                      {pbAllocations.map((alloc, idx) => {
                        const catInfo = getCategoryInfo(alloc.category);
                        const usedIds = pbAllocations.map((a) => a.category);
                        const availableCats = expenseCategories.filter(
                          (c) => c.id === alloc.category || !usedIds.includes(c.id),
                        );
                        return (
                          <View key={`${alloc.category}-${idx}`} style={styles.pbAllocFormRow}>
                            <TouchableOpacity
                              style={styles.pbAllocCatPicker}
                              onPress={() => {
                                // Cycle to next available category
                                const currentIdx = availableCats.findIndex((c) => c.id === alloc.category);
                                const next = availableCats[(currentIdx + 1) % availableCats.length];
                                if (next) {
                                  const updated = [...pbAllocations];
                                  updated[idx] = { ...alloc, category: next.id };
                                  setPbAllocations(updated);
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.pbAllocCatDot, { backgroundColor: catInfo?.color || CALM.accent }]} />
                              <Text style={styles.pbAllocFormLabel} numberOfLines={1}>
                                {catInfo?.name || alloc.category}
                              </Text>
                              <Feather name="chevron-down" size={12} color={CALM.textMuted} />
                            </TouchableOpacity>
                            <Text style={styles.pbAllocFormCurrency}>{currency}</Text>
                            <TextInput
                              style={styles.pbAllocFormInput}
                              value={alloc.allocatedAmount > 0 ? alloc.allocatedAmount.toString() : ''}
                              onChangeText={(v) => {
                                const updated = [...pbAllocations];
                                updated[idx] = { ...alloc, allocatedAmount: parseFloat(v) || 0 };
                                setPbAllocations(updated);
                              }}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={CALM.textMuted}
                            />
                            <TouchableOpacity
                              onPress={() => setPbAllocations(pbAllocations.filter((_, i) => i !== idx))}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather name="x" size={16} color={CALM.neutral} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                      <TouchableOpacity
                        style={styles.pbAddAllocBtn}
                        onPress={() => {
                          const usedIds = pbAllocations.map((a) => a.category);
                          const next = expenseCategories.find((c) => !usedIds.includes(c.id));
                          if (next) {
                            setPbAllocations([...pbAllocations, { category: next.id, allocatedAmount: 0 }]);
                          } else {
                            showToast('all categories added', 'info');
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="plus" size={14} color={CALM.accent} />
                        <Text style={styles.pbAddAllocText}>add limit</Text>
                      </TouchableOpacity>

                      {/* Allocation total vs source amount */}
                      {pbAllocations.length > 0 && (
                        <View style={styles.pbAllocTotal}>
                          <Text style={styles.pbAllocTotalLabel}>total allocated</Text>
                          <Text style={[
                            styles.pbAllocTotalAmount,
                            {
                              color: pbAllocations.reduce((s, a) => s + a.allocatedAmount, 0) > (parseFloat(pbAmount) || 0)
                                ? CALM.bronze
                                : CALM.textSecondary,
                            },
                          ]}>
                            {currency} {pbAllocations.reduce((s, a) => s + a.allocatedAmount, 0).toFixed(0)}
                            {parseFloat(pbAmount) > 0 ? ` / ${parseFloat(pbAmount).toFixed(0)}` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={handleCreatePlaybook}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.confirmButtonText}>
                      {editingPlaybook ? 'save changes' : 'create playbook'}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── View Transactions Modal ── */}
      {txModalVisible && viewingPlaybook && (
        <Modal
          visible={txModalVisible}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setTxModalVisible(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setTxModalVisible(false)}>
            <View style={[styles.modalCard, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>{viewingPlaybook.name}</Text>
                <TouchableOpacity
                  onPress={() => setTxModalVisible(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={22} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.pbTxModalSummary}>
                {viewingLinkedTxns.length} transactions · {currency} {
                  viewingLinkedTxns.reduce((sum, t) => {
                    const link = t.playbookLinks?.find((l) => l.playbookId === viewingPlaybook.id);
                    return sum + (link?.amount || t.amount);
                  }, 0).toFixed(2)
                } total
              </Text>
              <FlatList
                data={viewingLinkedTxns}
                keyExtractor={(tx) => tx.id}
                style={{ marginTop: SPACING.md }}
                showsVerticalScrollIndicator={false}
                initialNumToRender={10}
                ListEmptyComponent={
                  <Text style={styles.pbEmptyMessage}>no expenses linked yet</Text>
                }
                renderItem={({ item: tx }) => {
                  const link = tx.playbookLinks?.find((l) => l.playbookId === viewingPlaybook!.id);
                  const displayAmount = link?.amount || tx.amount;
                  const catInfo = getCategoryInfo(tx.category);
                  return (
                    <View style={styles.pbTxRow}>
                      <Text style={styles.pbTxDate}>
                        {format(tx.date instanceof Date ? tx.date : new Date(tx.date), 'MMM d')}
                      </Text>
                      <View style={styles.pbTxInfo}>
                        <Text style={styles.pbTxDesc} numberOfLines={1}>{tx.description}</Text>
                        <Text style={styles.pbTxCat}>{catInfo?.name || tx.category}</Text>
                      </View>
                      <Text style={styles.pbTxAmount}>
                        {currency} {displayAmount.toFixed(2)}
                      </Text>
                    </View>
                  );
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
  },

  // Hero
  heroCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
    textTransform: 'lowercase',
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: CALM.textPrimary,
    marginBottom: 2,
    fontVariant: ['tabular-nums'] as any,
  },
  heroAmountSub: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textSecondary,
  },
  heroDailyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginBottom: SPACING.md,
    fontVariant: ['tabular-nums'] as any,
  },
  heroBarTrack: {
    height: 6,
    backgroundColor: withAlpha(CALM.accent, 0.1),
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
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  bannerText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    lineHeight: 20,
  },
  bannerLink: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Grouped card
  groupCard: {
    backgroundColor: CALM.surface,
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
    color: CALM.textPrimary,
    flex: 1,
    marginRight: SPACING.sm,
  },
  budgetAmounts: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },

  // Progress bar (thin)
  barTrack: {
    height: 3,
    backgroundColor: withAlpha(CALM.accent, 0.1),
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
    color: CALM.textSecondary,
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
    color: CALM.bronze,
    marginTop: 2,
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CALM.border,
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
    backgroundColor: CALM.background,
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
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  emptyMessage: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.accent,
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
    backgroundColor: CALM.accent,
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
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '88%',
    maxHeight: '85%',
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
    color: CALM.textPrimary,
  },
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.inputBorder,
    paddingHorizontal: SPACING.md,
  },
  currencyPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginRight: SPACING.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.light,
    color: CALM.textPrimary,
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
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  periodChipActive: {
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderColor: CALM.accent,
  },
  periodChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  periodChipTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
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
    color: CALM.textPrimary,
  },
  rolloverHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 2,
  },

  // Confirm button
  confirmButton: {
    backgroundColor: CALM.accent,
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
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  segmentChipActive: {
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderColor: CALM.accent,
  },
  segmentText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  segmentTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
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
    backgroundColor: CALM.pillBg,
  },
  pbTabActive: {
    backgroundColor: withAlpha(CALM.accent, 0.08),
  },
  pbTabText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  pbTabTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },

  // ─── Nudge Card ───────────────────────────────────────────
  nudgeCard: {
    backgroundColor: CALM.highlight,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  nudgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  nudgeSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginBottom: SPACING.sm,
  },
  nudgeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  nudgeButton: {
    backgroundColor: CALM.accent,
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
    color: CALM.textSecondary,
  },

  // ─── Playbook Card (wallet-style) ─────────────────────────
  pbCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  pbCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  pbIconCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pbCardInfo: {
    flex: 1,
  },
  pbCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pbCardTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    flex: 1,
  },
  pbStatusBadge: {
    backgroundColor: withAlpha(CALM.accent, 0.08),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  pbStatusText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.accent,
  },
  pbCardAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    marginTop: 2,
  },

  // ─── Waterfall ────────────────────────────────────────────
  pbWaterfall: {
    marginBottom: SPACING.md,
  },
  pbSectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    textTransform: 'lowercase',
    marginBottom: SPACING.sm,
  },
  pbWaterfallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  pbWaterfallLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    width: 80,
  },
  pbWaterfallBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: withAlpha(CALM.accent, 0.06),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  pbWaterfallBarFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  pbWaterfallAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as any,
    width: 70,
    textAlign: 'right',
  },
  pbWaterfallPercent: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    width: 32,
    textAlign: 'right',
    fontVariant: ['tabular-nums'] as any,
  },

  // ─── Summary row (wallet-style) ──────────────────────────
  pbSummaryRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  pbSummaryItem: {
    flex: 1,
  },
  pbSummaryDivider: {
    borderLeftWidth: 1,
    borderLeftColor: CALM.border,
    paddingLeft: SPACING.md,
  },
  pbSummaryLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  pbSummaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    marginTop: 1,
  },
  pbStatsLine: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as any,
    marginBottom: 2,
  },

  // ─── Allocation progress ─────────────────────────────────
  pbAllocSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  pbAllocRow: {
    marginBottom: SPACING.sm,
  },
  pbAllocLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  pbAllocAmounts: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as any,
    marginBottom: 4,
  },
  pbAllocBarTrack: {
    height: 4,
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  pbAllocBarFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },

  // ─── Card actions ─────────────────────────────────────────
  pbCardActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  pbActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.background,
  },
  pbActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ─── Empty state ──────────────────────────────────────────
  pbEmptyState: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],
  },
  pbEmptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  pbEmptyMessage: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  pbTierCounter: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  // ─── Create Playbook form ─────────────────────────────────
  pbInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.inputBorder,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  pbToggleAllocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  pbToggleAllocText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  pbAllocForm: {
    marginTop: SPACING.sm,
  },
  pbAllocFormRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  pbAllocCatPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: CALM.border,
    minWidth: 100,
  },
  pbAllocCatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pbAllocFormLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    flex: 1,
  },
  pbEditHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: SPACING.xs,
  },
  pbAllocTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  pbAllocTotalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  pbAllocTotalAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'] as any,
  },
  pbAllocFormCurrency: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  pbAllocFormInput: {
    flex: 1,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.inputBorder,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  pbAddAllocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  pbAddAllocText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ─── Transaction modal ────────────────────────────────────
  pbTxModalSummary: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  pbTxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CALM.border,
    gap: SPACING.sm,
  },
  pbTxDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    width: 44,
  },
  pbTxInfo: {
    flex: 1,
  },
  pbTxDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  pbTxCat: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  pbTxAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
});

export default BudgetPlanning;
