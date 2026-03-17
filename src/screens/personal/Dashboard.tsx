import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  Dimensions,
  StatusBar,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, addDays, isWithinInterval, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, subMonths, getDaysInMonth } from 'date-fns';

import { useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
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
import { useSellerStore } from '../../store/sellerStore';
import { useBusinessStore } from '../../store/businessStore';
import { usePlaybookStore } from '../../store/playbookStore';
import { useLearningStore } from '../../store/learningStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../context/ToastContext';
import { Transaction, CategoryOption } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';
import { lightTap } from '../../services/haptics';
import { explainMonth } from '../../utils/explainMonth';
import QuickAddExpense from '../../components/common/QuickAddExpense';
import { useBNPLTotal } from '../../hooks/useBNPLTotal';
import { useKeptNumber } from '../../hooks/useKeptNumber';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { generateSpendingMirror } from '../../services/spendingMirror';
import BreathingRoom from '../../components/common/BreathingRoom';
import FreshStart from '../../components/common/FreshStart';

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const QUICK_ACTIONS = [
  { key: 'wallets', label: 'Wallets', icon: 'credit-card' as const, screen: 'WalletManagement', color: '#6BA3BE' },
  { key: 'savings', label: 'Savings', icon: 'archive' as const, screen: 'SavingsTracker', color: '#A688B8' },
  { key: 'debts', label: 'Splits', icon: 'git-branch' as const, screen: 'DebtTracking', color: '#C1694F' },
  { key: 'subscriptions', label: 'Bills', icon: 'refresh-cw' as const, screen: 'SubscriptionList', color: CALM.accent },
  { key: 'budgets', label: 'Budgets', icon: 'sliders' as const, screen: 'BudgetPlanning', color: CALM.bronze },
  { key: 'reports', label: 'Reports', icon: 'trending-up' as const, screen: 'PersonalReports', color: '#8B7355' },
  { key: 'goals', label: 'Goals', icon: 'flag' as const, screen: 'Goals', color: '#D4884A' },
  { key: 'scan', label: 'Scan', icon: 'aperture' as const, screen: 'ReceiptScanner', color: '#B87333' },
  { key: 'chat', label: 'Chat', icon: 'zap' as const, screen: 'MoneyChat', color: CALM.gold },
  { key: 'pulse', label: 'Pulse', icon: 'activity' as const, screen: 'FinancialPulse', color: '#7B8D6E' },
];

const PersonalDashboard: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const budgets = usePersonalStore((s) => s.budgets);
  const updateTransaction = usePersonalStore((s) => s.updateTransaction);
  const deleteTransaction = usePersonalStore((s) => s.deleteTransaction);
  const unmarkOrdersTransferred = useSellerStore((s) => s.unmarkOrdersTransferred);
  const updateIngredientCost = useSellerStore((s) => s.updateIngredientCost);
  const deleteTransfer = useBusinessStore((s) => s.deleteTransfer);
  const debts = useDebtStore((s) => s.debts);
  const currency = useSettingsStore(state => state.currency);
  const paymentQrs = useSettingsStore(state => state.paymentQrs);
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const [refreshing, setRefreshing] = React.useState(false);
  const navigation = useNavigation<any>();

  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const c of expenseCategories) map.set(c.id, c);
    for (const c of incomeCategories) map.set(c.id, c);
    return map;
  }, [expenseCategories, incomeCategories]);

  const walletMap = useMemo(() => {
    const map = new Map<string, typeof wallets[0]>();
    for (const w of wallets) map.set(w.id, w);
    return map;
  }, [wallets]);

  // Transaction edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editType, setEditType] = useState<'expense' | 'income'>('expense');
  const [editTags, setEditTags] = useState('');
  const [editWalletId, setEditWalletId] = useState<string | null>(null);

  // QR modal
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrViewIndex, setQrViewIndex] = useState(0);

  const userName = useSettingsStore((s) => s.userName);
  const greeting = useMemo(() => {
    const base = getGreeting();
    return userName ? `${base}, ${userName}` : base;
  }, [userName]);
  const bnpl = useBNPLTotal();
  const kept = useKeptNumber();

  // Spending Mirror
  const mirrorText = useAIInsightsStore((s) => s.spendingMirrorText);
  const mirrorGenerating = useAIInsightsStore((s) => s.isGenerating);

  useEffect(() => {
    // Generate spending mirror on mount (cached, won't re-call if recent)
    generateSpendingMirror();
  }, []);

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
      (sub) => sub.isActive && !sub.isPaused && isWithinInterval(sub.nextBillingDate, {
        start: today,
        end: addDays(today, 8),
      })
    );

    const totalUpcoming = upcomingBills.reduce((sum, sub) => sum + sub.amount, 0);

    const totalBudget = budgets.reduce((sum, b) => sum + b.allocatedAmount, 0);
    const getDateRange = (budget: { period: string }) => {
      if (budget.period === 'weekly') {
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      } else if (budget.period === 'yearly') {
        return { start: startOfYear(now), end: endOfYear(now) };
      }
      return { start: monthStart, end: monthEnd };
    };
    const totalSpent = budgets.reduce((sum, b) => {
      const range = getDateRange(b);
      const spent = transactions
        .filter((t) => t.type === 'expense' && t.category === b.category && isWithinInterval(t.date, range))
        .reduce((s, t) => s + t.amount, 0);
      return sum + spent;
    }, 0);

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

  const heroBalance = useMemo(() =>
    wallets.length > 0
      ? wallets.filter((w) => w.type !== 'credit').reduce((sum, w) => sum + w.balance, 0)
      : stats.balance,
    [wallets, stats.balance]
  );

  const netThisMonth = useMemo(() => stats.income - stats.expenses, [stats.income, stats.expenses]);

  // Insight from explainMonth
  const insight = useMemo(
    () => explainMonth(stats.monthlyTransactions, stats.prevMonthTransactions),
    [stats.monthlyTransactions, stats.prevMonthTransactions]
  );

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => {
        const da = a.date instanceof Date ? a.date : new Date(a.date);
        const db = b.date instanceof Date ? b.date : new Date(b.date);
        return db.getTime() - da.getTime();
      })
      .slice(0, 5);
  }, [transactions]);

  // ─── Insight strip data ───────────────────────────────────
  const insightStrip = useMemo(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = getDaysInMonth(now);

    // Savings rate
    const savingsRate =
      stats.income > 0
        ? Math.round(((stats.income - stats.expenses) / stats.income) * 100)
        : 0;
    const savingsColor =
      savingsRate > 20 ? CALM.positive : savingsRate > 0 ? CALM.accent : CALM.neutral;

    // Spending velocity
    const lastMonthExpenses = stats.prevMonthTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const monthProgress = dayOfMonth / daysInMonth;
    let velocityPercent = 0;
    if (lastMonthExpenses > 0 && monthProgress > 0) {
      velocityPercent = Math.round(
        (stats.expenses / lastMonthExpenses) * (1 / monthProgress) * 100
      );
    }
    const velocityColor =
      velocityPercent < 90
        ? CALM.positive
        : velocityPercent > 110
        ? CALM.neutral
        : CALM.accent;

    // Upcoming bills (next 7 days)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekLater = addDays(today, 7);
    const upcomingWeek = subscriptions.filter(
      (sub) =>
        sub.isActive &&
        !sub.isPaused &&
        isWithinInterval(sub.nextBillingDate, { start: today, end: weekLater })
    );
    const upcomingTotal = upcomingWeek.reduce((sum, sub) => sum + sub.amount, 0);

    return {
      savingsRate,
      savingsColor,
      velocityPercent,
      velocityColor,
      upcomingCount: upcomingWeek.length,
      upcomingTotal,
    };
  }, [stats, subscriptions]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const editCategories = useMemo(
    () => editType === 'expense' ? expenseCategories : incomeCategories,
    [editType, expenseCategories, incomeCategories]
  );

  const handleEditTransaction = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction);
    setEditAmount(transaction.amount.toString());
    setEditDescription(transaction.description);
    setEditCategory(transaction.category);
    setEditType(transaction.type);
    setEditTags(transaction.tags?.join(', ') || '');
    setEditWalletId(transaction.walletId || null);
    setEditModalVisible(true);
  }, []);

  const handleItemPress = useCallback((id: string) => {
    const txn = transactions.find((t) => t.id === id);
    if (txn) handleEditTransaction(txn);
  }, [transactions, handleEditTransaction]);

  const handleUpdateTransaction = useCallback(() => {
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

    // Reverse old wallet adjustment (only if wallet still exists)
    const wallets = useWalletStore.getState().wallets;
    if (oldWalletId && wallets.some(w => w.id === oldWalletId)) {
      if (oldType === 'expense') {
        addToWallet(oldWalletId, oldAmount);
      } else {
        deductFromWallet(oldWalletId, oldAmount);
      }
    }

    // Apply new wallet adjustment (only if wallet still exists)
    if (editWalletId && wallets.some(w => w.id === editWalletId)) {
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

    // Learn from user edits
    const learn = useLearningStore.getState();
    const descTrimmed = editDescription.trim();
    if (descTrimmed && editCategory) learn.learnCategory(descTrimmed, editCategory);
    if (descTrimmed && editWalletId) {
      const wName = useWalletStore.getState().wallets.find((w) => w.id === editWalletId)?.name;
      if (wName) learn.learnWallet(descTrimmed, wName);
    }
    if (editType !== oldType && descTrimmed) learn.learnTypeCorrection(descTrimmed, editType);

    // Sync amount change back to linked debt payment (no double wallet adjustment)
    if (newAmount !== oldAmount) {
      const { linkedDebtId, linkedPaymentId } = editingTransaction;
      if (linkedDebtId && linkedPaymentId) {
        useDebtStore.getState().updatePayment(linkedDebtId, linkedPaymentId, { amount: newAmount });
      } else {
        const allDebts = useDebtStore.getState().debts;
        for (const debt of allDebts) {
          const match = debt.payments.find((p) => p.linkedTransactionId === editingTransaction.id);
          if (match) {
            useDebtStore.getState().updatePayment(debt.id, match.id, { amount: newAmount });
            break;
          }
        }
      }
    }

    // Sync back to seller ingredient cost if linked
    const linkedCost = useSellerStore.getState().ingredientCosts.find(
      (c) => c.personalTransactionId === editingTransaction.id
    );
    if (linkedCost) {
      const desc = editDescription.trim();
      updateIngredientCost(linkedCost.id, {
        description: desc.startsWith('seller: ') ? desc.replace('seller: ', '') : desc,
        amount: newAmount,
      });
    }

    setEditModalVisible(false);
    setEditingTransaction(null);
    showToast('transaction updated.', 'success');
  }, [editingTransaction, editAmount, editDescription, editCategory, editType, editWalletId, editTags, addToWallet, deductFromWallet, updateTransaction, updateIngredientCost, showToast]);

  const handleDeleteTransaction = useCallback(() => {
    if (!editingTransaction) return;

    const isTransferLinked = editingTransaction.id.startsWith('transfer-');
    const transferId = isTransferLinked ? editingTransaction.id.replace('transfer-', '') : null;
    const { linkedDebtId, linkedPaymentId } = editingTransaction;

    const doDelete = () => {
      if (editingTransaction.walletId) {
        if (editingTransaction.type === 'expense') {
          addToWallet(editingTransaction.walletId, editingTransaction.amount);
        } else {
          deductFromWallet(editingTransaction.walletId, editingTransaction.amount);
        }
      }
      if (isTransferLinked && transferId) {
        unmarkOrdersTransferred(transferId);
        deleteTransfer(transferId);
      }
      // Also delete the linked debt payment (wallet already reversed above)
      if (linkedDebtId && linkedPaymentId) {
        useDebtStore.getState().deletePayment(linkedDebtId, linkedPaymentId);
      }
      // Clean up linked seller ingredient cost
      const linkedCost = useSellerStore.getState().ingredientCosts.find(
        (c) => c.personalTransactionId === editingTransaction.id
      );
      if (linkedCost) useSellerStore.getState().deleteIngredientCost(linkedCost.id);
      usePlaybookStore.getState().unlinkAllFromTransaction(editingTransaction.id);
      deleteTransaction(editingTransaction.id);
      setEditModalVisible(false);
      setEditingTransaction(null);
      showToast('Transaction deleted', 'success');
    };

    // Extra warning if linked to a debt payment
    if (linkedDebtId) {
      Alert.alert(
        'Delete Transaction?',
        'This will also remove the linked debt payment record.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete Both', style: 'destructive', onPress: doDelete },
        ]
      );
    } else {
      Alert.alert(
        'Delete Transaction',
        isTransferLinked
          ? 'This income was transferred from seller mode. Deleting it will allow you to re-transfer those orders.\n\nDelete anyway?'
          : 'Are you sure you want to delete this transaction?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  }, [editingTransaction, addToWallet, deductFromWallet, unmarkOrdersTransferred, deleteTransfer, deleteTransaction, showToast]);

  const handleEditTypeChange = useCallback((newType: 'expense' | 'income') => {
    setEditType(newType);
    const newCategories = newType === 'expense' ? expenseCategories : incomeCategories;
    setEditCategory(newCategories[0].id);
  }, [expenseCategories, incomeCategories]);

  const handleQuickAction = useCallback((screen: string) => {
    if (screen === 'PersonalReports' || screen === 'SubscriptionList' || screen === 'DebtTracking' || screen === 'WalletManagement' || screen === 'SavingsTracker' || screen === 'MoneyChat' || screen === 'Goals' || screen === 'FinancialPulse') {
      navigation.getParent()?.navigate(screen);
    } else {
      navigation.navigate(screen);
    }
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ModeToggle />
        {/* Zone 1 — Greeting (small) */}
        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>{greeting}</Text>
          <TouchableOpacity
            style={styles.qrButton}
            onPress={() => {
              lightTap();
              if (paymentQrs.length > 0) {
                setQrViewIndex(0);
                setQrModalVisible(true);
              } else {
                Alert.alert(
                  'No Payment QR',
                  'Add your payment QR code in Settings so you can show it here.',
                  [
                    { text: 'Later', style: 'cancel' },
                    { text: 'Go to Settings', onPress: () => navigation.navigate('Settings' as any, { scrollTo: 'qr' }) },
                  ]
                );
              }
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="maximize" size={22} color={paymentQrs.length > 0 ? CALM.accent : CALM.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Zone 2 — Balance (the hero) */}
        <Text style={styles.balanceAmount}>
          {currency} {heroBalance.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={styles.netMonth}>
          {netThisMonth >= 0 ? '+' : ''}{currency} {netThisMonth.toFixed(2)} this month
        </Text>

        {/* Zone 3 — Week Timeline */}
        <WeekBar transactions={transactions} />

        {/* Fresh Start — 1st of month ritual */}
        <FreshStart />

        {/* Zone 4 — Spending Mirror */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => { lightTap(); navigation.navigate('MoneyChat'); }}
          style={styles.insightWrap}
        >
          <Text style={styles.insight}>
            {mirrorText && mirrorText.length > 10 ? mirrorText : insight}
          </Text>
        </TouchableOpacity>

        {/* Zone 5 — Insight Strip */}
        <View style={styles.insightStripWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.insightStripRow}
          style={styles.insightStripScroll}
        >
          {/* Transactions */}
          <TouchableOpacity
            style={[styles.insightCard, { backgroundColor: withAlpha(CALM.accent, 0.05) }]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('TransactionsList'); }}
            accessibilityLabel={`${stats.transactionCount} transactions this month`}
          >
            <View style={styles.insightCardHeader}>
              <View style={[styles.insightIconBg, { backgroundColor: withAlpha(CALM.accent, 0.10) }]}>
                <Feather name="layers" size={16} color={CALM.accent} />
              </View>
              <Text style={styles.insightCardLabel}>this month</Text>
            </View>
            <Text style={[styles.insightValue, { color: CALM.textPrimary }]}>
              {stats.transactionCount}
            </Text>
            <Text style={styles.insightContext}>transactions</Text>
          </TouchableOpacity>

          {/* Spending Pace */}
          <TouchableOpacity
            style={[styles.insightCard, { backgroundColor: withAlpha(insightStrip.velocityColor, 0.05) }]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('FinancialPulse'); }}
            accessibilityLabel={`Spending velocity: ${insightStrip.velocityPercent} percent of usual pace`}
          >
            <View style={styles.insightCardHeader}>
              <View style={[styles.insightIconBg, { backgroundColor: withAlpha(insightStrip.velocityColor, 0.10) }]}>
                <Feather name="trending-up" size={16} color={insightStrip.velocityColor} />
              </View>
              <Text style={styles.insightCardLabel}>pace</Text>
            </View>
            <Text style={[styles.insightValue, { color: CALM.textPrimary }]}>
              {insightStrip.velocityPercent}%
            </Text>
            <Text style={styles.insightContext}>of usual spending</Text>
          </TouchableOpacity>

          {/* Kept */}
          <TouchableOpacity
            style={[styles.insightCard, { backgroundColor: withAlpha(kept.keptThisMonth >= 0 ? CALM.positive : CALM.neutral, 0.08) }]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('TransactionsList'); }}
            accessibilityLabel={`Kept ${currency} ${kept.keptThisMonth.toFixed(2)} this month`}
          >
            <View style={styles.insightCardHeader}>
              <View style={[styles.insightIconBg, { backgroundColor: withAlpha(kept.keptThisMonth >= 0 ? CALM.positive : CALM.neutral, 0.10) }]}>
                <Feather name="pocket" size={16} color={kept.keptThisMonth >= 0 ? CALM.positive : CALM.neutral} />
              </View>
              <Text style={styles.insightCardLabel}>kept</Text>
            </View>
            <Text style={[styles.insightValue, { color: CALM.textPrimary }]}>
              {kept.keptThisMonth >= 0 ? '+' : ''}{currency} {kept.keptThisMonth.toFixed(0)}
            </Text>
            <Text style={styles.insightContext}>net this month</Text>
          </TouchableOpacity>

          {/* BNPL / Credit */}
          {bnpl.walletCount > 0 && bnpl.totalUsed > 0 && (
            <TouchableOpacity
              style={[styles.insightCard, { backgroundColor: withAlpha(CALM.bronze, 0.05) }]}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('WalletManagement'); }}
              accessibilityLabel={`Future you owes ${currency} ${bnpl.totalUsed.toFixed(2)}`}
            >
              <View style={styles.insightCardHeader}>
                <View style={[styles.insightIconBg, { backgroundColor: withAlpha(CALM.bronze, 0.10) }]}>
                  <Feather name="clock" size={16} color={CALM.bronze} />
                </View>
                <Text style={styles.insightCardLabel}>owed later</Text>
              </View>
              <Text style={[styles.insightValue, { color: CALM.textPrimary }]}>
                {currency} {bnpl.totalUsed.toFixed(0)}
              </Text>
              <Text style={styles.insightContext}>buy now pay later</Text>
            </TouchableOpacity>
          )}

          {/* Upcoming Bills */}
          <TouchableOpacity
            style={[styles.insightCard, { backgroundColor: withAlpha(CALM.gold, 0.05) }]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('SubscriptionList'); }}
            accessibilityLabel={`${insightStrip.upcomingCount} bills due this week`}
          >
            <View style={styles.insightCardHeader}>
              <View style={[styles.insightIconBg, { backgroundColor: withAlpha(CALM.gold, 0.10) }]}>
                <Feather name="bell" size={16} color={CALM.gold} />
              </View>
              <Text style={styles.insightCardLabel}>coming up</Text>
            </View>
            <Text style={[styles.insightValue, { color: CALM.textPrimary }]}>
              {insightStrip.upcomingCount} {insightStrip.upcomingCount === 1 ? 'bill' : 'bills'}
            </Text>
            <Text style={styles.insightContext}>{currency} {insightStrip.upcomingTotal.toFixed(0)} this week</Text>
          </TouchableOpacity>
        </ScrollView>
        <LinearGradient
          colors={['rgba(249,249,247,0)', 'rgba(249,249,247,1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.insightStripFade}
          pointerEvents="none"
        />
        </View>

        {/* Quick Actions — pill grid */}
        {/* Quick Actions — 2-row horizontal scroll */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.detailSectionTitle}>Quick Actions</Text>
          {[0, 1].map((rowIdx) => (
            <View key={rowIdx} style={styles.quickActionsRowWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickActionsRow}
                style={styles.quickActionsScroll}
              >
                {QUICK_ACTIONS.slice(rowIdx * 5, rowIdx * 5 + 5).map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    style={styles.quickActionBtn}
                    onPress={() => handleQuickAction(action.screen)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.quickActionIcon, { backgroundColor: withAlpha(action.color, 0.08) }]}>
                      <Feather name={action.icon} size={22} color={action.color} />
                    </View>
                    <Text style={styles.quickActionLabel} numberOfLines={1}>
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <LinearGradient
                colors={['rgba(249,249,247,0)', 'rgba(249,249,247,1)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.quickActionsFade}
                pointerEvents="none"
              />
            </View>
          ))}
        </View>

        {/* Details section */}
        <CollapsibleSection title="Details" subtitle="bills, budgets, transactions" defaultOpen={false}>
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

          {/* Breathing Room (replaces Budget Overview) */}
          <BreathingRoom
            onPress={() => {
              lightTap();
              navigation.navigate('BudgetPlanning');
            }}
          />

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
                  currency={currency}
                  category={categoryMap.get(transaction.category)}
                  wallet={transaction.walletId ? walletMap.get(transaction.walletId) : undefined}
                  onPress={handleItemPress}
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
      {editModalVisible && (
      <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditingTransaction(null);
        }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setEditModalVisible(false); setEditingTransaction(null); }}>
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Transaction</Text>
                <TouchableOpacity onPress={() => {
                  setEditModalVisible(false);
                  setEditingTransaction(null);
                }}>
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
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
                    variant="danger"
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
        </Pressable>
      </Modal>
      )}

      {/* QR Fullscreen Modal */}
      {qrModalVisible && (
      <Modal
        visible
        transparent
        animationType="none"
        onRequestClose={() => setQrModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.qrModalOverlay}>
          <StatusBar barStyle="light-content" />
          {/* Close button */}
          <TouchableOpacity
            style={styles.qrCloseBtn}
            onPress={() => setQrModalVisible(false)}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Feather name="x" size={28} color="#fff" />
          </TouchableOpacity>

          {/* QR label */}
          {paymentQrs[qrViewIndex] && (
            <Text style={styles.qrLabel}>{paymentQrs[qrViewIndex].label}</Text>
          )}

          {/* QR Image */}
          {paymentQrs[qrViewIndex] && (
            <Image
              source={{ uri: paymentQrs[qrViewIndex].uri }}
              style={styles.qrFullImage}
              resizeMode="contain"
            />
          )}

          {/* Watermark below QR */}
          <Text style={styles.qrWatermark}>potraces</Text>

          {/* QR tabs at bottom */}
          {paymentQrs.length > 1 && (
            <View style={styles.qrTabs}>
              {paymentQrs.map((qr, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.qrTab, qrViewIndex === i && styles.qrTabActive]}
                  onPress={() => { lightTap(); setQrViewIndex(i); }}
                >
                  <Text style={[styles.qrTabText, qrViewIndex === i && styles.qrTabTextActive]}>
                    {qr.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Modal>
      )}

      <QuickAddExpense />
    </View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
  },

  // Zone 1 — Greeting
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  greeting: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  qrButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Zone 2 — Balance
  balanceAmount: {
    fontSize: 40,
    fontWeight: TYPOGRAPHY.weight.light,
    letterSpacing: -1,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    marginBottom: SPACING.xs,
  },
  netMonth: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as any,
    marginBottom: SPACING.lg,
  },

  // Zone 4 — Spending Mirror
  insightWrap: {
    marginBottom: SPACING.lg,
  },
  insight: {
    fontSize: TYPOGRAPHY.size.base,
    lineHeight: 24,
    color: '#7B7568',
    fontStyle: 'italic',
  },

  // Zone 5 — Insight Strip
  insightStripWrap: {
    position: 'relative',
    marginBottom: SPACING.lg,
  },
  insightStripScroll: {
    marginHorizontal: -SPACING['2xl'],
  },
  insightStripFade: {
    position: 'absolute',
    right: -SPACING['2xl'],
    top: 0,
    bottom: 0,
    width: 40,
  },
  insightStripRow: {
    paddingHorizontal: SPACING['2xl'],
    gap: SPACING.sm,
  },
  insightCard: {
    width: 150,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    gap: 2,
  },
  insightCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  insightIconBg: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightCardLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  insightValue: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    fontVariant: ['tabular-nums'] as any,
  },
  insightContext: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 2,
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
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  quickActionsRowWrap: {
    position: 'relative',
    marginRight: -SPACING['2xl'],
  },
  quickActionsScroll: {
    overflow: 'visible',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingRight: SPACING['2xl'],
  },
  quickActionsFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  quickActionBtn: {
    alignItems: 'center',
    gap: 6,
    width: 76,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    textAlign: 'center',
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

  // QR Fullscreen Modal
  qrModalOverlay: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCloseBtn: {
    position: 'absolute',
    top: 72,
    right: SPACING.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  qrLabel: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
    zIndex: 10,
  },
  qrTabs: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    zIndex: 10,
  },
  qrTab: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  qrTabActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  qrTabText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: 'rgba(255,255,255,0.5)',
  },
  qrTabTextActive: {
    color: '#fff',
  },
  qrFullImage: {
    width: SCREEN_WIDTH - SPACING['2xl'] * 2,
    height: SCREEN_WIDTH - SPACING['2xl'] * 2,
    borderRadius: RADIUS.lg,
    backgroundColor: '#fff',
  },
  qrWatermark: {
    marginTop: SPACING.lg,
    fontSize: 16,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 8,
    textTransform: 'lowercase',
  },
});

export default PersonalDashboard;
