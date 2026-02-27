import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, BUDGET_PERIODS, withAlpha } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import { FREE_TIER } from '../../constants/premium';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import ProgressBar from '../../components/common/ProgressBar';
import CategoryPicker from '../../components/common/CategoryPicker';
import PaywallModal from '../../components/common/PaywallModal';
import { usePremiumStore } from '../../store/premiumStore';
import { useToast } from '../../context/ToastContext';
import { Budget } from '../../types';

const BudgetPlanning: React.FC = () => {
  const { showToast } = useToast();
  const { budgets, addBudget, updateBudget, deleteBudget, transactions } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const canCreateBudget = usePremiumStore((s) => s.canCreateBudget);
  const tier = usePremiumStore((s) => s.tier);
  const [modalVisible, setModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const expenseCategories = useCategories('expense');
  const [category, setCategory] = useState(expenseCategories[0]?.id || 'food');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'yearly'>('monthly');

  useEffect(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    budgets.forEach((budget) => {
      const relevantTransactions = transactions.filter(
        (t) =>
          t.type === 'expense' &&
          t.category === budget.category &&
          isWithinInterval(t.date, { start: monthStart, end: monthEnd })
      );

      const spent = relevantTransactions.reduce((sum, t) => sum + t.amount, 0);

      if (spent !== budget.spentAmount) {
        updateBudget(budget.id, { spentAmount: spent });
      }
    });
  }, [transactions, budgets]);

  const handleAdd = () => {
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    if (editingBudget) {
      const conflicting = budgets.find(
        (b) => b.category === category && b.id !== editingBudget.id
      );
      if (conflicting) {
        showToast('A budget for this category already exists', 'error');
        return;
      }
      updateBudget(editingBudget.id, {
        category,
        allocatedAmount: parseFloat(amount),
        period,
      });
      closeModal();
      showToast('Budget updated successfully!', 'success');
    } else {
      const existingBudget = budgets.find((b) => b.category === category);
      if (existingBudget) {
        showToast('A budget for this category already exists', 'error');
        return;
      }

      const now = new Date();
      addBudget({
        category,
        allocatedAmount: parseFloat(amount),
        period,
        startDate: startOfMonth(now),
        endDate: endOfMonth(now),
      });
      closeModal();
      showToast('Budget created successfully!', 'success');
    }
  };

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setCategory(budget.category);
    setAmount(budget.allocatedAmount.toString());
    setPeriod(budget.period);
    setModalVisible(true);
  };

  const handleDelete = (budget: Budget) => {
    Alert.alert(
      'Delete Budget',
      `Are you sure you want to delete this budget?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteBudget(budget.id);
            showToast('Budget deleted', 'success');
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setAmount('');
    setCategory(expenseCategories[0].id);
    setPeriod('monthly');
    setEditingBudget(null);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const totalAllocated = budgets.reduce((sum, b) => sum + b.allocatedAmount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spentAmount, 0);

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {budgets.length > 0 && (
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Budget</Text>
                <Text style={styles.summaryAmount}>{currency} {totalAllocated.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Spent</Text>
                <Text
                  style={[
                    styles.summaryAmount,
                    { color: totalSpent > totalAllocated ? CALM.neutral : CALM.positive },
                  ]}
                >
                  {currency} {totalSpent.toFixed(2)}
                </Text>
              </View>
            </View>
            <ProgressBar
              current={totalSpent}
              total={totalAllocated}
              showPercentage={false}
              height={12}
            />
          </Card>
        )}

        {tier === 'free' && budgets.length > FREE_TIER.maxBudgets && (
          <Card style={styles.overLimitBanner}>
            <View style={styles.bannerContent}>
              <Feather name="info" size={18} color={CALM.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerText}>
                  You have {budgets.length} budgets (free limit: {FREE_TIER.maxBudgets}).{' '}
                  <Text
                    style={styles.bannerLink}
                    onPress={() => setPaywallVisible(true)}
                  >
                    Upgrade to add more.
                  </Text>
                </Text>
              </View>
            </View>
          </Card>
        )}

        {budgets.length > 0 ? (
          budgets.map((budget) => {
            const category = expenseCategories.find((cat) => cat.id === budget.category);
            const percentage =
              budget.allocatedAmount > 0
                ? (budget.spentAmount / budget.allocatedAmount) * 100
                : 0;

            return (
              <Card key={budget.id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: category?.color ? withAlpha(category.color, 0.12) : CALM.background }]}>
                    <Feather name={(category?.icon as keyof typeof Feather.glyphMap) || 'pie-chart'} size={20} color={category?.color} />
                  </View>
                  <View style={styles.budgetInfo}>
                    <Text style={styles.budgetName}>{category?.name || budget.category}</Text>
                    <Text style={styles.budgetPeriod}>
                      {budget.period.charAt(0).toUpperCase() + budget.period.slice(1)} Budget
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleEdit(budget)} style={styles.cardAction}>
                    <Feather name="edit-2" size={18} color={CALM.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(budget)} style={styles.cardAction}>
                    <Feather name="trash-2" size={18} color={CALM.neutral} />
                  </TouchableOpacity>
                  <View style={styles.percentageContainer}>
                    <Text
                      style={[
                        styles.percentage,
                        percentage > 100 && styles.percentageOver,
                      ]}
                    >
                      {percentage.toFixed(0)}%
                    </Text>
                  </View>
                </View>

                <ProgressBar
                  current={budget.spentAmount}
                  total={budget.allocatedAmount}
                  color={category?.color || CALM.accent}
                />

                {percentage > 90 && (
                  <View style={styles.warningContainer}>
                    <Text
                      style={[
                        styles.warningText,
                        { color: CALM.neutral },
                      ]}
                    >
                      {percentage > 100
                        ? `${currency} ${(budget.spentAmount - budget.allocatedAmount).toFixed(2)} over this period`
                        : `Getting close`}
                    </Text>
                  </View>
                )}
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon="pie-chart"
            title="No Budgets Set"
            message="Create budgets for your expense categories to track spending"
            actionLabel="Create Budget"
            onAction={() => {
              if (!canCreateBudget(budgets.length)) {
                setPaywallVisible(true);
                return;
              }
              setModalVisible(true);
            }}
          />
        )}
      </ScrollView>

      {!(tier === 'free' && budgets.length >= FREE_TIER.maxBudgets) && (
        <Button
          title={tier === 'free' ? `Create Budget (${budgets.length}/${FREE_TIER.maxBudgets})` : 'Create Budget'}
          onPress={() => {
            if (!canCreateBudget(budgets.length)) {
              setPaywallVisible(true);
              return;
            }
            setModalVisible(true);
          }}
          icon="plus"
          size="large"
          style={styles.addButton}
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { closeModal(); }}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingBudget ? 'Edit Budget' : 'Create Budget'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <CategoryPicker
                categories={expenseCategories}
                selectedId={category}
                onSelect={setCategory}
                label="Category"
                layout="dropdown"
              />

              <Text style={styles.label}>Budget Amount</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Text style={styles.label}>Period</Text>
              <View style={styles.periodContainer}>
                {BUDGET_PERIODS.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.periodButton,
                      period === p.value && styles.periodButtonActive,
                    ]}
                    onPress={() => setPeriod(p.value as 'weekly' | 'monthly' | 'yearly')}
                  >
                    <Text
                      style={[
                        styles.periodText,
                        period === p.value && styles.periodTextActive,
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={closeModal}
                  variant="outline"
                  style={{ flex: 1 }}
                />
                <Button
                  title={editingBudget ? 'Update' : 'Create'}
                  onPress={handleAdd}
                  icon="check"
                  style={{ flex: 1 }}
                />
              </View>
            </KeyboardAwareScrollView>
          </View>
        </Pressable>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 80,
  },

  // Summary
  summaryCard: {
    marginBottom: SPACING.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: CALM.border,
    marginHorizontal: SPACING.lg,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
  },
  summaryAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: '300',
    color: CALM.textPrimary,
  },

  // Budget cards
  budgetCard: {
    marginBottom: SPACING.md,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  budgetInfo: {
    flex: 1,
  },
  budgetName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  budgetPeriod: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  percentageContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
  },
  percentage: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  percentageOver: {
    color: CALM.neutral,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  warningText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  cardAction: {
    padding: SPACING.md,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // Over-limit banner
  overLimitBanner: {
    marginBottom: SPACING.md,
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(CALM.accent, 0.2),
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bannerText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    lineHeight: 20,
  },
  bannerLink: {
    color: CALM.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // FAB
  addButton: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING['2xl'],
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING['2xl'],
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  input: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  periodContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  periodButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: CALM.border,
    backgroundColor: CALM.background,
    alignItems: 'center',
  },
  periodButtonActive: {
    borderColor: CALM.accent,
    backgroundColor: CALM.accent,
  },
  periodText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  periodTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },
});

export default BudgetPlanning;
