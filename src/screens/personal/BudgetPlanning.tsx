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
import { Budget, CategoryOption } from '../../types';
import { lightTap, mediumTap } from '../../services/haptics';

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
      </ScrollView>

      {/* ── FAB ── */}
      {hasBudgets && !modalVisible && (
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
            <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
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
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="budget"
        currentUsage={budgets.length}
      />
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
});

export default BudgetPlanning;
