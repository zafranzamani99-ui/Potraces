import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format, addDays, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, withAlpha } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import StatCard from '../../components/common/StatCard';
import Card from '../../components/common/Card';
import TransactionItem from '../../components/common/TransactionItem';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import HeroCard from '../../components/common/HeroCard';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import GRADIENTS from '../../constants/gradients';
import { useWalletStore } from '../../store/walletStore';
import { useToast } from '../../context/ToastContext';
import { Transaction } from '../../types';
import { lightTap } from '../../services/haptics';

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const QUICK_ACTIONS = [
  { key: 'wallets', label: 'Wallets', icon: 'credit-card' as const, screen: 'WalletManagement', color: COLORS.personal },
  { key: 'debts', label: 'Debts & Splits', icon: 'users' as const, screen: 'DebtTracking', color: COLORS.warning },
  { key: 'subscriptions', label: 'Subscriptions', icon: 'repeat' as const, screen: 'SubscriptionList', color: COLORS.accent },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-2' as const, screen: 'PersonalReports', color: COLORS.info },
  { key: 'scan', label: 'Scan Receipt', icon: 'camera' as const, screen: 'ReceiptScanner', color: COLORS.success },
];

const PersonalDashboard: React.FC = () => {
  const { showToast } = useToast();
  const { transactions, subscriptions, budgets, updateTransaction, deleteTransaction } = usePersonalStore();
  const { debts } = useDebtStore();
  const currency = useSettingsStore(state => state.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
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

  // Stagger entrance animations
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;
  const anim4 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(80, [
      Animated.timing(anim1, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(anim2, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(anim3, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(anim4, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const makeStaggerStyle = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  });

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

    const upcomingBills = subscriptions.filter(
      (sub) => sub.isActive && isWithinInterval(sub.nextBillingDate, {
        start: now,
        end: addDays(now, 7),
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

    return {
      balance,
      income,
      expenses,
      upcomingBills: upcomingBills.length,
      upcomingTotal: totalUpcoming,
      budgetProgress: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      youOwe,
      owedToYou,
    };
  }, [transactions, subscriptions, budgets, debts]);

  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5);
  }, [transactions]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setLoading(true);
    setTimeout(() => {
      setRefreshing(false);
      setLoading(false);
    }, 1000);
  }, []);

  const editCategories = editType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

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
            // Reverse wallet balance on delete
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
    const newCategories = newType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    setEditCategory(newCategories[0].id);
  };

  const handleQuickAction = (screen: string) => {
    if (screen === 'PersonalReports' || screen === 'SubscriptionList' || screen === 'DebtTracking' || screen === 'WalletManagement') {
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
        {/* Personalized greeting */}
        <Animated.View style={makeStaggerStyle(anim1)}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMMM d')}</Text>
        </Animated.View>

        {/* Hero Card - Total Balance */}
        {loading ? (
          <SkeletonLoader
            shape="box"
            width="100%"
            height={200}
            style={{ marginBottom: SPACING.lg }}
          />
        ) : (
          <Animated.View style={makeStaggerStyle(anim1)}>
            <HeroCard
              gradient={GRADIENTS.personalHero}
              title="Total Balance"
              amount={stats.balance}
              currency={currency}
              subtitle="Updated just now"
              breakdown={[
                { label: 'Income', value: stats.income, icon: 'arrow-down' },
                { label: 'Expenses', value: stats.expenses, icon: 'arrow-up' },
              ]}
              style={{ marginBottom: SPACING.lg }}
            />
          </Animated.View>
        )}

        {/* Secondary Stats */}
        {loading ? (
          <View style={styles.statsGrid}>
            <SkeletonLoader shape="box" width="47%" height={100} />
            <SkeletonLoader shape="box" width="47%" height={100} />
          </View>
        ) : (
          <Animated.View style={[styles.statsGrid, makeStaggerStyle(anim2)]}>
            <StatCard
              title="Upcoming Bills"
              value={`${stats.upcomingBills}`}
              icon="calendar"
              iconColor={COLORS.warning}
              subtitle={`${currency} ${stats.upcomingTotal.toFixed(2)} total`}
            />
            <StatCard
              title="Budget Used"
              value={`${stats.budgetProgress.toFixed(0)}%`}
              icon="pie-chart"
              iconColor={
                stats.budgetProgress > 100
                  ? COLORS.danger
                  : stats.budgetProgress > 90
                  ? COLORS.warning
                  : COLORS.success
              }
              subtitle={stats.budgetProgress > 0 ? 'This month' : 'Not set'}
            />
          </Animated.View>
        )}

        {(stats.youOwe > 0 || stats.owedToYou > 0) && (
          <Animated.View style={[styles.statsGrid, makeStaggerStyle(anim2)]}>
            <StatCard
              title="You Owe"
              value={`${currency} ${stats.youOwe.toFixed(2)}`}
              icon="arrow-up-circle"
              iconColor={COLORS.danger}
              subtitle="Outstanding"
            />
            <StatCard
              title="Owed to You"
              value={`${currency} ${stats.owedToYou.toFixed(2)}`}
              icon="arrow-down-circle"
              iconColor={COLORS.success}
              subtitle="Outstanding"
            />
          </Animated.View>
        )}

        {stats.budgetProgress > 0 && (
          <Animated.View style={makeStaggerStyle(anim3)}>
            <Card>
              <View style={styles.budgetHeader}>
                <Text style={styles.budgetTitle}>Budget Overview</Text>
                <Text
                  style={[
                    styles.budgetPercentage,
                    stats.budgetProgress > 90 && styles.budgetWarning,
                  ]}
                >
                  {stats.budgetProgress.toFixed(0)}%
                </Text>
              </View>
              <View style={styles.budgetBar}>
                <View
                  style={[
                    styles.budgetFill,
                    {
                      width: `${Math.min(stats.budgetProgress, 100)}%`,
                      backgroundColor:
                        stats.budgetProgress > 100
                          ? COLORS.danger
                          : stats.budgetProgress > 90
                          ? COLORS.warning
                          : COLORS.success,
                    },
                  ]}
                />
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Quick Actions */}
        <Animated.View style={[styles.quickActionsSection, makeStaggerStyle(anim3)]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                lightTap();
                navigation.getParent()?.navigate('TransactionsList');
              }}
            >
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.quickActionsRow}>
              {[...Array(4)].map((_, i) => (
                <SkeletonLoader key={i} shape="box" width={78} height={80} />
              ))}
            </View>
          ) : (
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
                  <LinearGradient
                    colors={[withAlpha(action.color, 0.15), withAlpha(action.color, 0.05)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.quickActionIconGradient}
                  >
                    <Feather name={action.icon} size={18} color={action.color} />
                  </LinearGradient>
                  <Text style={styles.quickActionLabel} numberOfLines={2}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Animated.View>

        <Animated.View style={[styles.section, makeStaggerStyle(anim4)]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            {transactions.length > 0 && !loading && (
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

          {loading ? (
            <>
              <SkeletonLoader shape="line" height={60} style={{ marginBottom: SPACING.sm }} />
              <SkeletonLoader shape="line" height={60} style={{ marginBottom: SPACING.sm }} />
              <SkeletonLoader shape="line" height={60} />
            </>
          ) : recentTransactions.length > 0 ? (
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
        </Animated.View>
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Transaction</Text>
                <TouchableOpacity onPress={() => {
                  setEditModalVisible(false);
                  setEditingTransaction(null);
                }}>
                  <Feather name="x" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                <Text style={styles.label}>Type</Text>
                <View style={styles.typeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      editType === 'expense' && [styles.typeButtonActive, { backgroundColor: COLORS.expense }],
                      { borderColor: COLORS.expense },
                    ]}
                    onPress={() => handleEditTypeChange('expense')}
                  >
                    <Feather
                      name="arrow-down-circle"
                      size={20}
                      color={editType === 'expense' ? '#fff' : COLORS.expense}
                    />
                    <Text style={[styles.typeText, editType === 'expense' && styles.typeTextActive]}>
                      Expense
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      editType === 'income' && [styles.typeButtonActive, { backgroundColor: COLORS.success }],
                      { borderColor: COLORS.success },
                    ]}
                    onPress={() => handleEditTypeChange('income')}
                  >
                    <Feather
                      name="arrow-up-circle"
                      size={20}
                      color={editType === 'income' ? '#fff' : COLORS.success}
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
                  placeholderTextColor={COLORS.textSecondary}
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
                  placeholderTextColor={COLORS.textSecondary}
                />

                <Text style={styles.label}>Tags (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={editTags}
                  onChangeText={setEditTags}
                  placeholder="personal, family, work"
                  placeholderTextColor={COLORS.textSecondary}
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
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    padding: SPACING.lg,
  },
  greeting: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    marginBottom: 2,
  },
  dateText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
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
  budgetTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  budgetPercentage: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.success,
  },
  budgetWarning: {
    color: COLORS.warning,
  },
  budgetBar: {
    height: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  budgetFill: {
    height: SPACING.sm,
    borderRadius: RADIUS.xs,
  },

  // Quick Actions
  quickActionsSection: {
    marginBottom: SPACING.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  quickActionButton: {
    width: 80,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  quickActionIconGradient: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
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
  sectionTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
  },
  seeAll: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Modal
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
  typeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: COLORS.surface,
    gap: 8,
  },
  typeButtonActive: {},
  typeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  typeTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  deleteButton: {
    flex: 1,
    borderColor: COLORS.danger,
  },
});

export default PersonalDashboard;
