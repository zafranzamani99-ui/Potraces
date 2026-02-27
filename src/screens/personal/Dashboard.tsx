import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, addDays, isWithinInterval, startOfMonth, endOfMonth, subMonths } from 'date-fns';

import { useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
// COLORS.personal / COLORS.business kept for mode accent navigation only
import { useCategories } from '../../hooks/useCategories';
import ModeToggle from '../../components/common/ModeToggle';
import StatCard from '../../components/common/StatCard';
import Card from '../../components/common/Card';
import TransactionItem from '../../components/common/TransactionItem';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import WeekBar from '../../components/common/WeekBar';
import CollapsibleSection from '../../components/common/CollapsibleSection';
import { useWalletStore } from '../../store/walletStore';
import { useToast } from '../../context/ToastContext';
import { Transaction } from '../../types';
import { lightTap } from '../../services/haptics';
import { explainMonth } from '../../utils/explainMonth';

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const QUICK_ACTIONS = [
  { key: 'wallets', label: 'Wallets', icon: 'credit-card' as const, screen: 'WalletManagement', color: COLORS.personal },
  { key: 'savings', label: 'Savings', icon: 'trending-up' as const, screen: 'SavingsTracker', color: '#A06CD5' },
  { key: 'debts', label: 'Debts & Splits', icon: 'users' as const, screen: 'DebtTracking', color: CALM.neutral },
  { key: 'subscriptions', label: 'Commitments', icon: 'repeat' as const, screen: 'SubscriptionList', color: CALM.accent },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-2' as const, screen: 'PersonalReports', color: CALM.accent },
  { key: 'scan', label: 'Scan Receipt', icon: 'camera' as const, screen: 'ReceiptScanner', color: CALM.positive },
  { key: 'chat', label: 'Money Chat', icon: 'message-circle' as const, screen: 'MoneyChat', color: CALM.accent },
];

const PersonalDashboard: React.FC = () => {
  const { showToast } = useToast();
  const { transactions, subscriptions, budgets, updateTransaction, deleteTransaction } = usePersonalStore();
  const { debts } = useDebtStore();
  const currency = useSettingsStore(state => state.currency);
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const [refreshing, setRefreshing] = React.useState(false);
  const navigation = useNavigation<any>();

  // Transaction edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editType, setEditType] = useState<'expense' | 'income'>('expense');
  const [editTags, setEditTags] = useState('');
  const [editWalletId, setEditWalletId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const monthlyTransactions = transactions.filter((t) =>
      isWithinInterval(t.date, { start: monthStart, end: monthEnd })
    );

    const income = monthlyTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = monthlyTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const balance = income - expenses;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcomingBills = subscriptions.filter(
      (sub) => sub.isActive && isWithinInterval(sub.nextBillingDate, {
        start: today,
        end: addDays(today, 8),
      })
    );

    const totalUpcoming = upcomingBills.reduce((sum, sub) => sum + sub.amount, 0);

    const totalBudget = budgets.reduce((sum, b) => sum + b.allocatedAmount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spentAmount, 0);

    const personalDebts = debts.filter((d) => d.mode === 'personal');
    const youOwe = personalDebts
      .filter((d) => d.type === 'i_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);
    const owedToYou = personalDebts
      .filter((d) => d.type === 'they_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

    // Previous month transactions for explainMonth
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));
    const prevMonthTransactions = transactions.filter((t) =>
      isWithinInterval(t.date, { start: prevMonthStart, end: prevMonthEnd })
    );

    return {
      balance,
      income,
      expenses,
      monthlyTransactions,
      prevMonthTransactions,
      transactionCount: monthlyTransactions.length,
      upcomingBills: upcomingBills.length,
      upcomingBillsList: upcomingBills,
      upcomingTotal: totalUpcoming,
      budgetProgress: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      youOwe,
      owedToYou,
    };
  }, [transactions, subscriptions, budgets, debts]);

  const heroBalance = wallets.length > 0
    ? wallets.reduce((sum, w) => sum + w.balance, 0)
    : stats.balance;

  const netThisMonth = stats.income - stats.expenses;

  // Insight from explainMonth
  const insight = useMemo(
    () => explainMonth(stats.monthlyTransactions, stats.prevMonthTransactions),
    [stats.monthlyTransactions, stats.prevMonthTransactions]
  );

  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5);
  }, [transactions]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const editCategories = editType === 'expense' ? expenseCategories : incomeCategories;

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setEditAmount(transaction.amount.toString());
    setEditDescription(transaction.description);
    setEditCategory(transaction.category);
    setEditType(transaction.type);
    setEditTags(transaction.tags?.join(', ') || '');
    setEditWalletId(transaction.walletId || null);
    setEditModalVisible(true);
  };

  const handleUpdateTransaction = () => {
    if (!editingTransaction) return;

    if (!editAmount || parseFloat(editAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    if (!editDescription.trim()) {
      showToast('Please add a description', 'error');
      return;
    }

    const newAmount = parseFloat(editAmount);
    const oldAmount = editingTransaction.amount;
    const oldWalletId = editingTransaction.walletId;
    const oldType = editingTransaction.type;

    // Reverse old wallet adjustment
    if (oldWalletId) {
      if (oldType === 'expense') {
        addToWallet(oldWalletId, oldAmount);
      } else {
        deductFromWallet(oldWalletId, oldAmount);
      }
    }

    // Apply new wallet adjustment
    if (editWalletId) {
      if (editType === 'expense') {
        deductFromWallet(editWalletId, newAmount);
      } else {
        addToWallet(editWalletId, newAmount);
      }
    }

    updateTransaction(editingTransaction.id, {
      amount: newAmount,
      description: editDescription.trim(),
      category: editCategory,
      type: editType,
      walletId: editWalletId || undefined,
      tags: editTags ? editTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });

    setEditModalVisible(false);
    setEditingTransaction(null);
    showToast('Transaction updated successfully!', 'success');
  };

  const handleDeleteTransaction = () => {
    if (!editingTransaction) return;

    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (editingTransaction.walletId) {
              if (editingTransaction.type === 'expense') {
                addToWallet(editingTransaction.walletId, editingTransaction.amount);
              } else {
                deductFromWallet(editingTransaction.walletId, editingTransaction.amount);
              }
            }
            deleteTransaction(editingTransaction.id);
            setEditModalVisible(false);
            setEditingTransaction(null);
            showToast('Transaction deleted', 'success');
          },
        },
      ]
    );
  };

  const handleEditTypeChange = (newType: 'expense' | 'income') => {
    setEditType(newType);
    const newCategories = newType === 'expense' ? expenseCategories : incomeCategories;
    setEditCategory(newCategories[0].id);
  };

  const handleQuickAction = (screen: string) => {
    if (screen === 'PersonalReports' || screen === 'SubscriptionList' || screen === 'DebtTracking' || screen === 'WalletManagement' || screen === 'SavingsTracker' || screen === 'MoneyChat') {
      navigation.getParent()?.navigate(screen);
    } else {
      navigation.navigate(screen);
    }
  };

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Zone 1 — Greeting (small) */}
        <Text style={styles.greeting}>{getGreeting()}</Text>

        {/* Zone 2 — Balance (the hero) */}
        <Text style={styles.balanceAmount}>
          {currency} {heroBalance.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={styles.netMonth}>
          {netThisMonth >= 0 ? '+' : ''}{currency} {netThisMonth.toFixed(2)} this month
        </Text>

        {/* Zone 3 — Week Timeline */}
        <WeekBar transactions={transactions} />

        {/* Zone 4 — Insight */}
        <Text style={styles.insight}>{insight}</Text>

        {/* Everything else in collapsible Details */}
        <CollapsibleSection title="Details" defaultOpen={false}>
          {/* Upcoming Bills */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              lightTap();
              navigation.getParent()?.navigate('SubscriptionList');
            }}
          >
            {stats.upcomingBillsList.length > 0 ? (
              <Card style={styles.detailCard}>
                <View style={styles.upcomingHeader}>
                  <Feather name="calendar" size={18} color={CALM.neutral} />
                  <Text style={styles.upcomingTitle}>Upcoming Bills</Text>
                  <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
                </View>
                {stats.upcomingBillsList.slice(0, 3).map((sub) => {
                  const daysUntil = Math.ceil(
                    (sub.nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <View key={sub.id} style={styles.upcomingItem}>
                      <Text style={styles.upcomingName} numberOfLines={1}>{sub.name}</Text>
                      <Text style={styles.upcomingDays}>{daysUntil <= 0 ? 'Today' : `${daysUntil}d`}</Text>
                      <Text style={styles.upcomingAmount}>{currency} {sub.amount.toFixed(2)}</Text>
                    </View>
                  );
                })}
                <View style={styles.upcomingFooter}>
                  <Text style={styles.upcomingFooterTotal}>
                    Total: {currency} {stats.upcomingTotal.toFixed(2)}
                  </Text>
                  {stats.upcomingBillsList.length > 3 && (
                    <Text style={styles.upcomingFooterMore}>
                      +{stats.upcomingBillsList.length - 3} more
                    </Text>
                  )}
                </View>
              </Card>
            ) : (
              <Card style={styles.detailCard}>
                <View style={styles.upcomingHeader}>
                  <Feather name="calendar" size={18} color={CALM.neutral} />
                  <Text style={styles.upcomingTitle}>Upcoming Bills</Text>
                  <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
                </View>
                <Text style={styles.upcomingEmpty}>No bills due soon</Text>
              </Card>
            )}
          </TouchableOpacity>

          {/* Debt Stats */}
          {(stats.youOwe > 0 || stats.owedToYou > 0) && (
            <View style={styles.statsGrid}>
              <StatCard
                title="You Owe"
                value={`${currency} ${stats.youOwe.toFixed(2)}`}
                icon="arrow-up-circle"
                iconColor={CALM.neutral}
                subtitle="Outstanding"
              />
              <StatCard
                title="Owed to You"
                value={`${currency} ${stats.owedToYou.toFixed(2)}`}
                icon="arrow-down-circle"
                iconColor={CALM.positive}
                subtitle="Outstanding"
              />
            </View>
          )}

          {/* Budget Overview */}
          {stats.budgetProgress > 0 && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                lightTap();
                navigation.navigate('BudgetPlanning');
              }}
            >
              <Card style={styles.detailCard}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetTitle}>Budget Overview</Text>
                  <View style={styles.budgetHeaderRight}>
                    <Text style={styles.budgetPercentage}>
                      {stats.budgetProgress.toFixed(0)}%
                    </Text>
                    <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
                  </View>
                </View>
                <View style={styles.budgetBar}>
                  <View
                    style={[
                      styles.budgetFill,
                      {
                        width: `${Math.min(stats.budgetProgress, 100)}%`,
                        backgroundColor: CALM.accent,
                      },
                    ]}
                  />
                </View>
              </Card>
            </TouchableOpacity>
          )}

          {/* Quick Actions */}
          <View style={styles.quickActionsSection}>
            <Text style={styles.detailSectionTitle}>Quick Actions</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickActionsRow}
            >
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={styles.quickActionButton}
                  onPress={() => handleQuickAction(action.screen)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[styles.quickActionIconBg, { backgroundColor: withAlpha(action.color, 0.12) }]}
                  >
                    <Feather name={action.icon} size={18} color={action.color} />
                  </View>
                  <Text style={styles.quickActionLabel} numberOfLines={2}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Recent Transactions */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.detailSectionTitle}>Recent Transactions</Text>
              {transactions.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    lightTap();
                    navigation.getParent()?.navigate('TransactionsList');
                  }}
                >
                  <Text style={styles.seeAll}>See All</Text>
                </TouchableOpacity>
              )}
            </View>

            {recentTransactions.length > 0 ? (
              recentTransactions.map((transaction) => (
                <TransactionItem
                  key={transaction.id}
                  transaction={transaction}
                  onPress={() => handleEditTransaction(transaction)}
                />
              ))
            ) : (
              <EmptyState
                icon="inbox"
                title="No Transactions Yet"
                message="Start tracking your expenses by adding your first transaction"
              />
            )}
          </View>
        </CollapsibleSection>
      </ScrollView>

      {/* Transaction Edit Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditingTransaction(null);
        }}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Transaction</Text>
                <TouchableOpacity onPress={() => {
                  setEditModalVisible(false);
                  setEditingTransaction(null);
                }}>
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Type</Text>
                <View style={styles.typeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      editType === 'expense' && [styles.typeButtonActive, { backgroundColor: CALM.accent }],
                      { borderColor: CALM.accent },
                    ]}
                    onPress={() => handleEditTypeChange('expense')}
                  >
                    <Feather
                      name="arrow-down-circle"
                      size={20}
                      color={editType === 'expense' ? '#fff' : CALM.accent}
                    />
                    <Text style={[styles.typeText, editType === 'expense' && styles.typeTextActive]}>
                      Expense
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      editType === 'income' && [styles.typeButtonActive, { backgroundColor: CALM.positive }],
                      { borderColor: CALM.positive },
                    ]}
                    onPress={() => handleEditTypeChange('income')}
                  >
                    <Feather
                      name="arrow-up-circle"
                      size={20}
                      color={editType === 'income' ? '#fff' : CALM.positive}
                    />
                    <Text style={[styles.typeText, editType === 'income' && styles.typeTextActive]}>
                      Income
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Amount</Text>
                <TextInput
                  style={styles.input}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <CategoryPicker
                  categories={editCategories}
                  selectedId={editCategory}
                  onSelect={setEditCategory}
                  label="Category"
                  layout="dropdown"
                />

                <WalletPicker
                  wallets={wallets}
                  selectedId={editWalletId}
                  onSelect={setEditWalletId}
                  label="Wallet"
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={styles.input}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="What was this for?"
                  placeholderTextColor={CALM.textSecondary}
                />

                <Text style={styles.label}>Tags (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={editTags}
                  onChangeText={setEditTags}
                  placeholder="personal, family, work"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Delete"
                    onPress={handleDeleteTransaction}
                    variant="secondary"
                    icon="trash-2"
                    style={styles.deleteButton}
                  />
                  <Button
                    title="Update"
                    onPress={handleUpdateTransaction}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>
            </View>
        </View>
      </Modal>
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
  },

  // Zone 1 — Greeting
  greeting: {
    ...TYPE.muted,
    marginBottom: SPACING.lg,
  },

  // Zone 2 — Balance
  balanceAmount: {
    fontSize: TYPE.amount.fontSize,
    fontWeight: TYPE.amount.fontWeight,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  netMonth: {
    ...TYPE.muted,
    marginBottom: SPACING.lg,
  },

  // Zone 4 — Insight
  insight: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
  },

  // Detail sections
  detailCard: {
    marginBottom: SPACING.md,
  },
  detailSectionTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },

  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  budgetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  budgetTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  budgetPercentage: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
  },
  budgetBar: {
    height: SPACING.sm,
    backgroundColor: CALM.border,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  budgetFill: {
    height: SPACING.sm,
    borderRadius: RADIUS.xs,
  },

  // Upcoming Bills
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  upcomingTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  upcomingEmpty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  upcomingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    marginTop: SPACING.xs,
  },
  upcomingFooterTotal: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  upcomingFooterMore: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  upcomingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  upcomingName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  upcomingDays: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    fontWeight: TYPOGRAPHY.weight.semibold,
    marginRight: SPACING.sm,
  },
  upcomingAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // Quick Actions
  quickActionsSection: {
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  quickActionButton: {
    width: 80,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  quickActionIconBg: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    textAlign: 'center',
    lineHeight: 13,
  },

  // Section
  section: {
    marginTop: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  seeAll: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
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
  typeContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    backgroundColor: CALM.background,
    gap: SPACING.sm,
  },
  typeButtonActive: {},
  typeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  typeTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },
  deleteButton: {
    flex: 1,
    borderColor: CALM.neutral,
  },
});

export default PersonalDashboard;
