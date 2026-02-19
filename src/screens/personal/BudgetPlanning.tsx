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
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, EXPENSE_CATEGORIES, BUDGET_PERIODS, withAlpha } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import ProgressBar from '../../components/common/ProgressBar';
import CategoryPicker from '../../components/common/CategoryPicker';
import PaywallModal from '../../components/common/PaywallModal';
import { usePremiumStore } from '../../store/premiumStore';
import { useToast } from '../../context/ToastContext';

const BudgetPlanning: React.FC = () => {
  const { showToast } = useToast();
  const { budgets, addBudget, updateBudget, deleteBudget, transactions } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const canCreateBudget = usePremiumStore((s) => s.canCreateBudget);
  const tier = usePremiumStore((s) => s.tier);
  const [modalVisible, setModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].id);
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

    setModalVisible(false);
    resetForm();
    showToast('Budget created successfully!', 'success');
  };

  const resetForm = () => {
    setAmount('');
    setCategory(EXPENSE_CATEGORIES[0].id);
    setPeriod('monthly');
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
                    { color: totalSpent > totalAllocated ? COLORS.expense : COLORS.success },
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

        {budgets.length > 0 ? (
          budgets.map((budget) => {
            const category = EXPENSE_CATEGORIES.find((cat) => cat.id === budget.category);
            const percentage =
              budget.allocatedAmount > 0
                ? (budget.spentAmount / budget.allocatedAmount) * 100
                : 0;

            return (
              <Card key={budget.id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: category?.color ? withAlpha(category.color, 0.12) : COLORS.surface }]}>
                    <Feather name={(category?.icon as keyof typeof Feather.glyphMap) || 'pie-chart'} size={20} color={category?.color} />
                  </View>
                  <View style={styles.budgetInfo}>
                    <Text style={styles.budgetName}>{category?.name || budget.category}</Text>
                    <Text style={styles.budgetPeriod}>
                      {budget.period.charAt(0).toUpperCase() + budget.period.slice(1)} Budget
                    </Text>
                  </View>
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
                  color={category?.color || COLORS.primary}
                />

                {percentage > 90 && (
                  <View style={styles.warningContainer}>
                    <Feather
                      name="alert-circle"
                      size={16}
                      color={percentage > 100 ? COLORS.danger : COLORS.warning}
                    />
                    <Text
                      style={[
                        styles.warningText,
                        { color: percentage > 100 ? COLORS.danger : COLORS.warning },
                      ]}
                    >
                      {percentage > 100
                        ? `Over budget by ${currency} ${(budget.spentAmount - budget.allocatedAmount).toFixed(2)}`
                        : `Approaching budget limit`}
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

      <Button
        title={tier === 'free' ? `Create Budget (${budgets.length}/5)` : 'Create Budget'}
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

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Budget</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <CategoryPicker
                categories={EXPENSE_CATEGORIES}
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
                placeholderTextColor={COLORS.textSecondary}
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
                  onPress={() => setModalVisible(false)}
                  variant="secondary"
                  style={{ flex: 1 }}
                />
                <Button
                  title="Create"
                  onPress={handleAdd}
                  icon="check"
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
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
    backgroundColor: COLORS.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  summaryCard: {
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  budgetCard: {
    marginBottom: 12,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  budgetInfo: {
    flex: 1,
  },
  budgetName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  budgetPeriod: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  percentageContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  percentage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  percentageOver: {
    color: COLORS.expense,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    gap: 8,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  periodContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  periodButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  periodTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
});

export default BudgetPlanning;
