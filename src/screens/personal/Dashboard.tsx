import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  Dimensions,
  StatusBar,
  InteractionManager,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, addDays, isWithinInterval, startOfMonth, endOfMonth, startOfDay, subMonths, getDaysInMonth } from 'date-fns';

import { useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
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
import QuickAddExpense from '../../components/common/QuickAddExpense';
import { useBNPLTotal } from '../../hooks/useBNPLTotal';
import { useKeptNumber } from '../../hooks/useKeptNumber';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { generateSpendingMirror } from '../../services/spendingMirror';
import BreathingRoom from '../../components/common/BreathingRoom';
import FreshStart from '../../components/common/FreshStart';
import GettingStarted from '../../components/common/GettingStarted';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import ModalToastHost from '../../components/common/ModalToastHost';
import OfflineBanner from '../../components/common/OfflineBanner';
import RAnimated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const getGreetingKey = (): 'goodMorning' | 'goodAfternoon' | 'goodEvening' => {
  const hour = new Date().getHours();
  if (hour < 12) return 'goodMorning';
  if (hour < 17) return 'goodAfternoon';
  return 'goodEvening';
};

// Quick-action color tokens. Resolved against the active palette so dark-mode
// contrast is preserved (DESIGN-H1, UX-H5). No more raw hex.
const getQuickActions = (C: typeof CALM) => [
  { key: 'wallets' as const, icon: 'credit-card' as const, screen: 'WalletManagement', color: C.accent },
  { key: 'savings' as const, icon: 'archive' as const, screen: 'SavingsTracker', color: C.neutral },
  { key: 'debts' as const, icon: 'git-branch' as const, screen: 'DebtTracking', color: C.bronze },
  { key: 'bills' as const, icon: 'refresh-cw' as const, screen: 'SubscriptionList', color: C.accent },
  { key: 'budgets' as const, icon: 'sliders' as const, screen: 'BudgetPlanning', color: C.bronze },
  { key: 'reports' as const, icon: 'trending-up' as const, screen: 'PersonalReports', color: C.deepOlive },
  { key: 'goals' as const, icon: 'flag' as const, screen: 'Goals', color: C.gold },
  { key: 'receipts' as const, icon: 'file-text' as const, screen: 'ReceiptHistory', color: C.deepOlive },
  { key: 'chat' as const, icon: 'zap' as const, screen: 'MoneyChat', color: C.gold },
  { key: 'pulse' as const, icon: 'activity' as const, screen: 'FinancialPulse', color: C.accent },
];

const PersonalDashboard: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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
    const base = t.dashboard[getGreetingKey()];
    return userName ? `${base}, ${userName}` : base;
  }, [userName, t]);
  const bnpl = useBNPLTotal();
  const kept = useKeptNumber();

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

    const nonTransferTxns = monthlyTransactions.filter((t) => !t.id.startsWith('transfer-'));

    const income = nonTransferTxns
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = nonTransferTxns
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const balance = income - expenses;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcomingBills = subscriptions.filter(
      (sub) => sub.isActive && !sub.isPaused && isWithinInterval(sub.nextBillingDate, {
        start: today,
        end: addDays(today, 7),
      })
    );

    const totalUpcoming = upcomingBills.reduce((sum, sub) => sum + sub.amount, 0);

    const normalizeToMonthly = (amount: number, period: string) => {
      switch (period) {
        case 'weekly': return amount * 4.33;
        case 'daily': return amount * 30;
        case 'yearly': return amount / 12;
        default: return amount;
      }
    };
    const totalBudget = budgets.reduce((sum, b) => sum + normalizeToMonthly(b.allocatedAmount, b.period), 0);
    const totalSpent = budgets.reduce((sum, b) => {
      const spent = transactions
        .filter((t) => t.type === 'expense' && t.category === b.category && isWithinInterval(t.date, { start: monthStart, end: monthEnd }))
        .reduce((s, t) => s + t.amount, 0);
      return sum + spent;
    }, 0);

    const personalDebts = debts.filter((d) => d.mode === 'personal');
    const youOwe = personalDebts
      .filter((d) => d.type === 'i_owe' && d.status !== 'settled' && !d.isArchived)
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);
    const owedToYou = personalDebts
      .filter((d) => d.type === 'they_owe' && d.status !== 'settled' && !d.isArchived)
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

  // Dynamic hero headline — warm, contextual. All strings flow through useT()
  // (FIRSTRUN-H3 i18n parity).
  const heroHeadline = useMemo(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysLeft = getDaysInMonth(now) - dayOfMonth;
    const savingsRate = stats.income > 0
      ? Math.round(((stats.income - stats.expenses) / stats.income) * 100)
      : 0;
    const h = t.dashboard.hero;

    // Context-aware sub-line
    let subLine = '';
    if (stats.income > 0 && daysLeft > 0) {
      const dayWord = daysLeft !== 1 ? h.daysLeft : h.dayLeft;
      const verb = netThisMonth >= 0 ? h.kept : h.over;
      subLine = `${currency} ${Math.abs(netThisMonth).toFixed(0)} ${verb} · ${daysLeft} ${dayWord}`;
    } else if (stats.income > 0) {
      const verb = netThisMonth >= 0 ? h.keptThisMonth : h.overThisMonth;
      subLine = `${currency} ${Math.abs(netThisMonth).toFixed(0)} ${verb}`;
    }

    // Big income day detected (payday)
    const todayIncome = transactions
      .filter((tx) => {
        const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
        return tx.type === 'income' && d.toDateString() === now.toDateString();
      })
      .reduce((s, tx) => s + tx.amount, 0);
    if (todayIncome > stats.income * 0.5 && todayIncome > 0) {
      return { headline: h.paydayLanded, subLine: `${currency} ${todayIncome.toFixed(0)} ${h.cameInToday}` };
    }

    // No spending in 2+ days
    const recentExpenses = transactions.filter((tx) => {
      if (tx.type !== 'expense') return false;
      const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
      return diffDays < 2;
    });
    if (recentExpenses.length === 0 && stats.transactionCount > 3) {
      return { headline: h.quietStretch, subLine };
    }

    // First day of month
    if (dayOfMonth === 1) {
      return { headline: h.freshStart, subLine: `${h.newMonth} — ${currency} ${heroBalance.toFixed(0)} ${h.toWorkWith}` };
    }

    // Last 3 days
    if (daysLeft <= 3 && daysLeft >= 0 && stats.income > 0) {
      return { headline: h.wrappingUp, subLine: `${savingsRate}% ${h.keptSoFar}` };
    }

    // Savings-rate based
    if (savingsRate >= 20) return { headline: h.comfortable, subLine };
    if (savingsRate >= 5) return { headline: h.steady, subLine };
    if (savingsRate >= 0) return { headline: h.tight, subLine };
    return { headline: h.stretch, subLine };
  }, [stats, heroBalance, netThisMonth, currency, transactions, t]);

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
      savingsRate > 20 ? C.positive : savingsRate > 0 ? C.accent : C.neutral;

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
        ? C.positive
        : velocityPercent > 110
        ? C.neutral
        : C.accent;

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
  }, [stats, subscriptions, C]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  // Quick actions resolved against the active palette (SCALE-H2: stable ref
  // per palette change so child renders don't churn).
  const quickActions = useMemo(() => getQuickActions(C), [C]);

  const billsBadge = useMemo(() => {
    const today = startOfDay(new Date());
    return subscriptions.filter(sub => {
      if (!sub.isActive || sub.isPaused) return false;
      if (sub.isInstallment && sub.totalInstallments && (sub.completedInstallments || 0) >= sub.totalInstallments) return false;
      const dueDate = new Date(sub.nextBillingDate);
      return dueDate <= addDays(today, sub.reminderDays || 3);
    }).length;
  }, [subscriptions]);

  // First-run surface precedence (FIRSTRUN-C3, UX-H3):
  //   1. GettingStarted — wins while the setup ladder is incomplete; this is
  //      what new users actually need (wallet → first txn → budget).
  //   2. FreshStart — fills days 1-5 only after the ladder is done, when the
  //      monthly reset card is the most useful surface left.
  //   3. EmptyState (inside Details) — fallback when zero transactions.
  // Never render both at once.
  const gettingStartedDismissed = useSettingsStore((s) => s.gettingStartedDismissed);
  const ladderComplete = wallets.length > 0 && transactions.length > 0 && budgets.length > 0;
  const showGettingStarted = useMemo(
    () => !gettingStartedDismissed && !ladderComplete && transactions.length < 5,
    [gettingStartedDismissed, ladderComplete, transactions.length],
  );
  const showFreshStart = useMemo(() => {
    const now = new Date();
    return now.getDate() <= 5 && !showGettingStarted;
  }, [showGettingStarted]);

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
      showToast(t.transaction.invalidAmount, 'error');
      return;
    }

    if (!editDescription.trim()) {
      showToast(t.transaction.missingDescription, 'error');
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
    showToast(t.transaction.transactionUpdated, 'success');
  }, [editingTransaction, editAmount, editDescription, editCategory, editType, editWalletId, editTags, addToWallet, deductFromWallet, updateTransaction, updateIngredientCost, showToast, t]);

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
      showToast(t.transaction.transactionDeleted, 'success');
    };

    // Extra warning if linked to a debt payment
    if (linkedDebtId) {
      Alert.alert(
        t.transaction.deleteWithLinkTitle,
        t.transaction.deleteWithLinkMessage,
        [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.transaction.deleteBoth, style: 'destructive', onPress: doDelete },
        ]
      );
    } else {
      Alert.alert(
        t.transaction.deleteTransactionTitle,
        isTransferLinked
          ? t.transaction.deleteTransferMessage
          : t.transaction.deleteConfirm,
        [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.common.delete, style: 'destructive', onPress: doDelete },
        ]
      );
    }
  }, [editingTransaction, addToWallet, deductFromWallet, unmarkOrdersTransferred, deleteTransfer, deleteTransaction, showToast, t]);

  const handleEditTypeChange = useCallback((newType: 'expense' | 'income') => {
    setEditType(newType);
    const newCategories = newType === 'expense' ? expenseCategories : incomeCategories;
    setEditCategory(newCategories[0]?.id || 'other');
  }, [expenseCategories, incomeCategories]);

  const handleQuickAction = useCallback((screen: string) => {
    if (screen === 'PersonalReports' || screen === 'SubscriptionList' || screen === 'DebtTracking' || screen === 'WalletManagement' || screen === 'SavingsTracker' || screen === 'MoneyChat' || screen === 'Goals' || screen === 'FinancialPulse' || screen === 'ReceiptHistory') {
      navigation.getParent()?.navigate(screen);
    } else {
      navigation.navigate(screen);
    }
  }, [navigation]);

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
        <SkeletonLoader shape="line" style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

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
        <OfflineBanner />
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
                  t.dashboard.noQrTitle,
                  t.dashboard.noQrMessage,
                  [
                    { text: t.common.later, style: 'cancel' },
                    { text: t.dashboard.goToSettings, onPress: () => navigation.navigate('Settings', { scrollTo: 'qr' }) },
                  ]
                );
              }
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t.dashboard.showPaymentQr}
          >
            <Feather name="maximize" size={22} color={paymentQrs.length > 0 ? C.accent : C.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Zone 2 — Balance (the hero) */}
        <RAnimated.View entering={FadeIn.duration(200)}>
          <Text style={[styles.heroHeadline, { color: C.textSecondary }]}>{heroHeadline.headline}</Text>
          <Text style={styles.balanceAmount}>
            {currency} {heroBalance.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          {heroHeadline.subLine ? (
            <Text style={styles.netMonth}>{heroHeadline.subLine}</Text>
          ) : null}
        </RAnimated.View>

        {/* Zone 3 — Week Timeline */}
        <RAnimated.View entering={FadeInDown.delay(100).duration(200)}>
          <WeekBar transactions={transactions} />
        </RAnimated.View>

        {/* First-run surfaces — exactly one renders at a time. See precedence
            rule above. FreshStart wins on days 1-5; GettingStarted otherwise. */}
        {showFreshStart && <FreshStart />}
        {showGettingStarted && <GettingStarted />}

        {/* Zone 5 — Insight Strip */}
        <RAnimated.View entering={FadeInDown.delay(150).duration(200)} style={styles.insightStripWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.insightStripRow}
          style={styles.insightStripScroll}
        >
          {/* Transactions */}
          <TouchableOpacity
            style={[styles.insightCard, { backgroundColor: withAlpha(C.accent, 0.05) }]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('TransactionsList'); }}
            accessibilityLabel={`${stats.transactionCount} transactions this month`}
          >
            <View style={styles.insightCardHeader}>
              <View style={[styles.insightIconBg, { backgroundColor: withAlpha(C.accent, 0.10) }]}>
                <Feather name="layers" size={16} color={C.accent} />
              </View>
              <Text style={styles.insightCardLabel}>{t.dashboard.thisMonth.toLowerCase()}</Text>
            </View>
            <Text style={[styles.insightValue, { color: C.textPrimary }]}>
              {stats.transactionCount}
            </Text>
            <Text style={styles.insightContext}>{t.dashboard.transactions.toLowerCase()}</Text>
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
              <Text style={styles.insightCardLabel}>{t.dashboard.pace}</Text>
            </View>
            <Text style={[styles.insightValue, { color: C.textPrimary }]}>
              {insightStrip.velocityPercent}%
            </Text>
            <Text style={styles.insightContext}>{t.dashboard.ofUsualSpending}</Text>
          </TouchableOpacity>

          {/* Kept */}
          <TouchableOpacity
            style={[styles.insightCard, { backgroundColor: withAlpha(kept.keptThisMonth >= 0 ? C.positive : C.neutral, 0.08) }]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('TransactionsList'); }}
            accessibilityLabel={`Kept ${currency} ${kept.keptThisMonth.toFixed(2)} this month`}
          >
            <View style={styles.insightCardHeader}>
              <View style={[styles.insightIconBg, { backgroundColor: withAlpha(kept.keptThisMonth >= 0 ? C.positive : C.neutral, 0.10) }]}>
                <Feather name="pocket" size={16} color={kept.keptThisMonth >= 0 ? C.positive : C.neutral} />
              </View>
              <Text style={styles.insightCardLabel}>{t.dashboard.hero.kept}</Text>
            </View>
            <Text style={[styles.insightValue, { color: C.textPrimary }]}>
              {kept.keptThisMonth >= 0 ? '+' : ''}{currency} {kept.keptThisMonth.toFixed(0)}
            </Text>
            <Text style={styles.insightContext}>{t.dashboard.netThisMonth}</Text>
          </TouchableOpacity>

          {/* BNPL / Credit */}
          {bnpl.walletCount > 0 && bnpl.totalUsed > 0 && (
            <TouchableOpacity
              style={[styles.insightCard, { backgroundColor: withAlpha(C.bronze, 0.05) }]}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('WalletManagement'); }}
              accessibilityLabel={`Future you owes ${currency} ${bnpl.totalUsed.toFixed(2)}`}
            >
              <View style={styles.insightCardHeader}>
                <View style={[styles.insightIconBg, { backgroundColor: withAlpha(C.bronze, 0.10) }]}>
                  <Feather name="clock" size={16} color={C.bronze} />
                </View>
                <Text style={styles.insightCardLabel}>{t.dashboard.owedLater}</Text>
              </View>
              <Text style={[styles.insightValue, { color: C.textPrimary }]}>
                {currency} {bnpl.totalUsed.toFixed(0)}
              </Text>
              <Text style={styles.insightContext}>{t.dashboard.buyNowPayLater}</Text>
            </TouchableOpacity>
          )}

          {/* Upcoming Bills */}
          <TouchableOpacity
            style={[styles.insightCard, { backgroundColor: withAlpha(C.gold, 0.05) }]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('SubscriptionList'); }}
            accessibilityLabel={`${insightStrip.upcomingCount} bills due this week`}
          >
            <View style={styles.insightCardHeader}>
              <View style={[styles.insightIconBg, { backgroundColor: withAlpha(C.gold, 0.10) }]}>
                <Feather name="bell" size={16} color={C.gold} />
              </View>
              <Text style={styles.insightCardLabel}>{t.dashboard.comingUp}</Text>
            </View>
            <Text style={[styles.insightValue, { color: C.textPrimary }]}>
              {insightStrip.upcomingCount} {insightStrip.upcomingCount === 1 ? t.dashboard.billOne : t.dashboard.billMany}
            </Text>
            <Text style={styles.insightContext}>{currency} {insightStrip.upcomingTotal.toFixed(0)} {t.dashboard.thisWeekLower}</Text>
          </TouchableOpacity>
        </ScrollView>
        <LinearGradient
          colors={[withAlpha(C.background, 0), withAlpha(C.background, 1)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.insightStripFade}
          pointerEvents="none"
        />
        </RAnimated.View>

        {/* Quick Actions — pill grid */}
        {/* Quick Actions — 2-row horizontal scroll */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.detailSectionTitle}>{t.dashboard.quickActions}</Text>
          {[0, 1].map((rowIdx) => (
            <View key={rowIdx} style={styles.quickActionsRowWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickActionsRow}
                style={styles.quickActionsScroll}
              >
                {quickActions.slice(rowIdx * 5, rowIdx * 5 + 5).map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    style={styles.quickActionBtn}
                    onPress={() => handleQuickAction(action.screen)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.dashboard[action.key]}
                  >
                    <View style={[styles.quickActionIcon, { backgroundColor: withAlpha(action.color, 0.08) }]}>
                      <Feather name={action.icon} size={22} color={action.color} />
                      {action.key === 'bills' && billsBadge > 0 && (
                        <View style={styles.quickActionBadge}>
                          <Text style={styles.quickActionBadgeText}>{billsBadge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.quickActionLabel} numberOfLines={1}>
                      {t.dashboard[action.key]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <LinearGradient
                colors={[withAlpha(C.background, 0), withAlpha(C.background, 1)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.quickActionsFade}
                pointerEvents="none"
              />
            </View>
          ))}
        </View>

        {/* Details section */}
        <CollapsibleSection title={t.dashboard.details} subtitle={t.dashboard.detailsSubtitle} defaultOpen={false}>
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
                  <Feather name="calendar" size={18} color={C.neutral} />
                  <Text style={styles.upcomingTitle}>{t.dashboard.upcomingBills}</Text>
                  <Feather name="chevron-right" size={16} color={C.textSecondary} />
                </View>
                {stats.upcomingBillsList.slice(0, 3).map((sub) => {
                  const daysUntil = Math.ceil(
                    (sub.nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <View key={sub.id} style={styles.upcomingItem}>
                      <Text style={styles.upcomingName} numberOfLines={1}>{sub.name}</Text>
                      <Text style={styles.upcomingDays}>{daysUntil <= 0 ? t.dashboard.today : `${daysUntil}d`}</Text>
                      <Text style={styles.upcomingAmount}>{currency} {sub.amount.toFixed(2)}</Text>
                    </View>
                  );
                })}
                <View style={styles.upcomingFooter}>
                  <Text style={styles.upcomingFooterTotal}>
                    {t.dashboard.total}: {currency} {stats.upcomingTotal.toFixed(2)}
                  </Text>
                  {stats.upcomingBillsList.length > 3 && (
                    <Text style={styles.upcomingFooterMore}>
                      +{stats.upcomingBillsList.length - 3} {t.dashboard.more}
                    </Text>
                  )}
                </View>
              </Card>
            ) : (
              <Card style={styles.detailCard}>
                <View style={styles.upcomingHeader}>
                  <Feather name="calendar" size={18} color={C.neutral} />
                  <Text style={styles.upcomingTitle}>{t.dashboard.upcomingBills}</Text>
                  <Feather name="chevron-right" size={16} color={C.textSecondary} />
                </View>
                <Text style={styles.upcomingEmpty}>{t.dashboard.noBillsDueSoon}</Text>
              </Card>
            )}
          </TouchableOpacity>

          {/* Debt Stats */}
          {(stats.youOwe > 0 || stats.owedToYou > 0) && (
            <View style={styles.statsGrid}>
              <StatCard
                title={t.dashboard.youOwe}
                value={`${currency} ${stats.youOwe.toFixed(2)}`}
                icon="arrow-up-circle"
                iconColor={C.neutral}
                subtitle={t.dashboard.outstanding}
              />
              <StatCard
                title={t.dashboard.owedToYou}
                value={`${currency} ${stats.owedToYou.toFixed(2)}`}
                icon="arrow-down-circle"
                iconColor={C.positive}
                subtitle={t.dashboard.outstanding}
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
              <Text style={styles.detailSectionTitle}>{t.dashboard.recentTransactions}</Text>
              {transactions.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    lightTap();
                    navigation.getParent()?.navigate('TransactionsList');
                  }}
                >
                  <Text style={styles.seeAll}>{t.dashboard.seeAll}</Text>
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
                title={t.dashboard.noTransactionsTitle}
                message={t.dashboard.noTransactionsMessage}
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
                <Text style={styles.modalTitle}>{t.transaction.editTransaction}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditModalVisible(false);
                    setEditingTransaction(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t.common.close}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={24} color={C.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
                <Text style={styles.label}>{t.transaction.type}</Text>
                <View style={styles.typeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      editType === 'expense' && [styles.typeButtonActive, { backgroundColor: C.accent }],
                      { borderColor: C.accent },
                    ]}
                    onPress={() => handleEditTypeChange('expense')}
                    accessibilityRole="button"
                    accessibilityLabel={t.transaction.expense}
                    accessibilityState={{ selected: editType === 'expense' }}
                  >
                    <Feather
                      name="arrow-down-circle"
                      size={20}
                      color={editType === 'expense' ? C.surface : C.accent}
                    />
                    <Text style={[styles.typeText, editType === 'expense' && styles.typeTextActive]}>
                      {t.transaction.expense}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      editType === 'income' && [styles.typeButtonActive, { backgroundColor: C.positive }],
                      { borderColor: C.positive },
                    ]}
                    onPress={() => handleEditTypeChange('income')}
                    accessibilityRole="button"
                    accessibilityLabel={t.transaction.income}
                    accessibilityState={{ selected: editType === 'income' }}
                  >
                    <Feather
                      name="arrow-up-circle"
                      size={20}
                      color={editType === 'income' ? C.surface : C.positive}
                    />
                    <Text style={[styles.typeText, editType === 'income' && styles.typeTextActive]}>
                      {t.transaction.income}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t.transaction.amount}</Text>
                <TextInput
                  style={styles.input}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                  accessibilityLabel={t.transaction.amount}
                />

                <CategoryPicker
                  categories={editCategories}
                  selectedId={editCategory}
                  onSelect={setEditCategory}
                  label={t.transaction.category}
                  layout="dropdown"
                />

                <WalletPicker
                  wallets={wallets}
                  selectedId={editWalletId}
                  onSelect={setEditWalletId}
                  label={t.transaction.wallet}
                />

                <Text style={styles.label}>{t.transaction.description}</Text>
                <TextInput
                  style={styles.input}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder={t.transaction.descriptionPlaceholder}
                  placeholderTextColor={C.textSecondary}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                  accessibilityLabel={t.transaction.description}
                />

                <Text style={styles.label}>{t.transaction.tagsOptional}</Text>
                <TextInput
                  style={styles.input}
                  value={editTags}
                  onChangeText={setEditTags}
                  placeholder={t.transaction.tagsPlaceholder}
                  placeholderTextColor={C.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                  accessibilityLabel={t.transaction.tagsOptional}
                />

                <View style={styles.modalActions}>
                  <Button
                    title={t.common.delete}
                    onPress={handleDeleteTransaction}
                    variant="danger"
                    icon="trash-2"
                    style={styles.deleteButton}
                  />
                  <Button
                    title={t.common.save}
                    onPress={handleUpdateTransaction}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>
            </View>
        </Pressable>
        <ModalToastHost />
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
            accessibilityRole="button"
            accessibilityLabel={t.common.close}
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
        <ModalToastHost />
      </Modal>
      )}

      <QuickAddExpense />
    </View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
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
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  qrButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Zone 2 — Balance
  heroHeadline: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: SPACING.xs,
    letterSpacing: 0.3,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: TYPOGRAPHY.weight.light,
    letterSpacing: -1,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    marginBottom: SPACING.xs,
  },
  netMonth: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
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
    color: C.textSecondary,
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
    color: C.textMuted,
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
    color: C.textSecondary,
    marginTop: 2,
  },

  // Detail sections
  detailCard: {
    marginBottom: SPACING.md,
  },
  detailSectionTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
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
    color: C.textPrimary,
  },
  budgetPercentage: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
  },
  budgetBar: {
    height: SPACING.sm,
    backgroundColor: C.border,
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
    color: C.textPrimary,
  },
  upcomingEmpty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  upcomingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: SPACING.xs,
  },
  upcomingFooterTotal: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  upcomingFooterMore: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  upcomingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  upcomingName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  upcomingDays: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.neutral,
    fontWeight: TYPOGRAPHY.weight.semibold,
    marginRight: SPACING.sm,
  },
  upcomingAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
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
    color: C.textPrimary,
    textAlign: 'center',
  },
  quickActionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  quickActionBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    fontVariant: ['tabular-nums' as const],
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
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
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
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  input: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderWidth: 1,
    borderColor: C.border,
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
    backgroundColor: C.background,
    gap: SPACING.sm,
  },
  typeButtonActive: {},
  typeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  typeTextActive: {
    color: C.onAccent,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },
  deleteButton: {
    flex: 1,
    borderColor: C.neutral,
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
