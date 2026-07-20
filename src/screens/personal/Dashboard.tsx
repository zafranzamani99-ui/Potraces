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
// RN's ScrollView is required for the OUTER pull-to-refresh: RNGH's ScrollView sets
// disallowInterruption=true, which blocks Android's SwipeRefreshLayout so onRefresh
// never fires. The horizontal card rows below stay on RNGH's ScrollView.
import { ScrollView as RNScrollView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { addDays, isWithinInterval, startOfMonth, endOfMonth, startOfDay, subMonths, getDaysInMonth } from 'date-fns';

import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import GlassModeToggle from '../../components/common/GlassModeToggle';
import QuickActions from '../../components/common/QuickActions';
import { listFailedReceipts } from '../../services/receiptQueue';
import NeuIconButton from '../../components/common/NeuIconButton';
import { useNeu } from '../../components/common/neu';
import TransactionItem from '../../components/common/TransactionItem';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import WeekBar from '../../components/common/WeekBar';
import CollapsibleSection from '../../components/common/CollapsibleSection';
import DuoIcon from '../../components/common/DuoIcon';
import Svg, { Path as SvgPath } from 'react-native-svg';
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
import { useBudgetProfileStore } from '../../store/budgetProfileStore';
import { scopeTxns, getRange } from '../../utils/insights';
import { pulseScore, expandBills, baselineDailySpend, last14DailySpend, PulseBand } from '../../utils/pulseMath';
import PulseWave from '../../components/pulse/PulseWave';
import { generateSpendingMirror } from '../../services/spendingMirror';
import BreathingRoom from '../../components/common/BreathingRoom';
import FreshStart from '../../components/common/FreshStart';
import GettingStarted from '../../components/common/GettingStarted';
import SampleDataBanner from '../../components/common/SampleDataBanner';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import ModalToastHost from '../../components/common/ModalToastHost';
import OfflineBanner from '../../components/common/OfflineBanner';
import RAnimated, { FadeIn, FadeInDown } from 'react-native-reanimated';

// TEMP: the "exploring with demo data" banner is hidden for now — flip to
// true to bring it back.
const SHOW_SAMPLE_DATA_BANNER = false;

const getGreetingKey = (): 'goodMorning' | 'goodAfternoon' | 'goodEvening' => {
  const hour = new Date().getHours();
  if (hour < 12) return 'goodMorning';
  if (hour < 17) return 'goodAfternoon';
  return 'goodEvening';
};

// Quick actions moved to components/common/QuickActions.tsx (neumorphic tiles,
// same keys/screens/colors — see that file).

// ─── Insight micro-visualizations ─────────────────────────────
// Each insight card carries a tiny instrument of the user's real data
// instead of a decorative icon — the strip becomes alive as data grows.

// One dot per day of the month; lit where the user logged something.
const DotCalendar: React.FC<{
  daysInMonth: number;
  dayOfMonth: number;
  activeDays: Set<number>;
  color: string;
  C: typeof CALM;
}> = ({ daysInMonth, dayOfMonth, activeDays, color, C }) => (
  <View style={{ width: 49, flexDirection: 'row', flexWrap: 'wrap' }}>
    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
      <View
        key={d}
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          marginRight: 3,
          marginBottom: 3,
          backgroundColor:
            d > dayOfMonth
              ? withAlpha(C.textMuted, 0.14)
              : activeDays.has(d)
              ? color
              : withAlpha(C.textMuted, 0.3),
        }}
      />
    ))}
  </View>
);

// came-in vs went-out side by side — the net explains itself.
const TwinBars: React.FC<{ inAmt: number; outAmt: number; C: typeof CALM }> = ({ inAmt, outAmt, C }) => {
  const max = Math.max(inAmt, outAmt, 1);
  const h = (v: number) => 8 + Math.round(24 * (v / max));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
      <View style={{ width: 9, height: h(inAmt), borderRadius: 4.5, backgroundColor: C.positive }} />
      <View style={{ width: 9, height: h(outAmt), borderRadius: 4.5, backgroundColor: withAlpha(C.bronze, 0.75) }} />
    </View>
  );
};

// next 7 days; a tall tick where a bill lands.
const WeekTicks: React.FC<{ flags: boolean[]; color: string; C: typeof CALM }> = ({ flags, color, C }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
    {flags.map((on, i) => (
      <View
        key={i}
        style={{
          width: 5,
          height: on ? 18 : 11,
          borderRadius: 2.5,
          backgroundColor: on ? color : withAlpha(C.textMuted, 0.18),
        }}
      />
    ))}
  </View>
);

const PersonalDashboard: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const neuF = useNeu(undefined, { faintDark: true }); // details cards — Onyx soft raise
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const budgets = usePersonalStore((s) => s.budgets);
  const goals = usePersonalStore((s) => s.goals);
  const takeHome = useBudgetProfileStore((s) => s.takeHome);
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
  const isFocused = useIsFocused(); // pauses the strip's ambient ECG on other tabs

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
      youOwe,
      owedToYou,
    };
  }, [transactions, subscriptions, debts]);

  const heroBalance = useMemo(() => {
    if (wallets.length === 0) return stats.balance;
    const cashWallets = wallets.filter((w) => w.type !== 'credit');
    if (cashWallets.length > 0) {
      return cashWallets.reduce((sum, w) => sum + w.balance, 0);
    }
    // Credit-only user: there is no cash balance — show available credit
    // (limit − used) so the hero isn't a misleading RM 0.00.
    return wallets.reduce((sum, w) => sum + Math.max(0, (w.creditLimit || 0) - (w.usedCredit || 0)), 0);
  }, [wallets, stats.balance]);

  const netThisMonth = useMemo(() => stats.income - stats.expenses, [stats.income, stats.expenses]);

  // Dynamic hero headline — warm, contextual. All strings flow through useT()
  // (FIRSTRUN-H3 i18n parity).
  const heroHeadline = useMemo(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    // Days remaining INCLUDING today (device-local = Malaysia time for MY users),
    // matching the Budget screen's daysRemaining so both read the same. Today is a
    // day you're still budgeting for, so it counts — and this makes the "last 3
    // days" check below exactly 3 days and avoids a "0 days left" on the 31st.
    const daysLeft = getDaysInMonth(now) - dayOfMonth + 1;
    const savingsRate = stats.income > 0
      ? Math.round(((stats.income - stats.expenses) / stats.income) * 100)
      : 0;
    const h = t.dashboard.hero;

    // Journey ladder (FIRSTRUN) — guidance → fact-echo → earned judgment.
    // Never render an evaluative mood ("tight", "steady") about money the
    // user hasn't recorded yet; with zero data the old buckets landed on
    // "tight but managing" against RM 0.00.
    if (transactions.length === 0) {
      return wallets.length === 0
        ? { headline: h.journeyFresh, subLine: h.journeyFreshSub }
        : { headline: h.journeyReady, subLine: h.journeyReadySub };
    }

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

    // Early days: acknowledge and describe, don't evaluate — judgment needs
    // a baseline (≥10 entries over ≥7 days, YNAB/Emma-style gates).
    if (transactions.length <= 2) {
      return { headline: h.journeyFirst, subLine: h.journeyFirstSub };
    }
    const firstTxTime = Math.min(
      ...transactions.map((tx) => (tx.date instanceof Date ? tx.date : new Date(tx.date)).getTime()),
    );
    const daysSinceFirstTx = Math.floor((now.getTime() - firstTxTime) / 86400000);
    if (transactions.length < 10 || daysSinceFirstTx < 7) {
      return {
        headline: h.journeyWarming,
        subLine: h.journeyWarmingSub.replace('{n}', String(transactions.length)),
      };
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
  }, [stats, heroBalance, netThisMonth, currency, transactions, wallets, t]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => {
        const da = a.date instanceof Date ? a.date : new Date(a.date);
        const db = b.date instanceof Date ? b.date : new Date(b.date);
        return db.getTime() - da.getTime();
      })
      .slice(0, 5);
  }, [transactions]);

  // ─── Pulse snapshot — same math as the Pulse screen, so the strip's score
  // and the flagship screen can never disagree. ───────────────
  const pulseSnap = useMemo(() => {
    if (transactions.length === 0) return null;
    const now = new Date();
    return pulseScore({
      scopedMonth: scopeTxns(transactions, getRange('this_month', now)),
      budgets,
      goals,
      wallets,
      bills14: expandBills(subscriptions, 13, now),
      takeHome,
      baselineDaily: baselineDailySpend(transactions, now),
      last14Daily: last14DailySpend(transactions, now),
      now,
    });
  }, [transactions, budgets, goals, wallets, subscriptions, takeHome]);
  const pulseBandLabel: Record<PulseBand, string> = {
    good: t.pulse.feelingGood,
    steady: t.pulse.steadyGround,
    building: t.pulse.buildingUp,
    starting: t.pulse.justStarting,
    finding: t.pulse.findingRhythm,
  };
  const pulseBandColor = (band: PulseBand): string =>
    band === 'good' || band === 'steady'
      ? C.accent
      : band === 'building'
      ? (isDark ? C.gold : '#8E6610')
      : band === 'starting'
      ? C.bronze
      : (isDark ? C.lavender : '#6E6776');

  // ─── Insight strip data ───────────────────────────────────
  const insightStrip = useMemo(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = getDaysInMonth(now);

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

    // Days of this month with at least one entry — feeds the dot calendar.
    const activeDays = new Set<number>();
    for (const tx of transactions) {
      const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        activeDays.add(d.getDate());
      }
    }

    // Which of the next 7 days has a bill landing — feeds the week ticks.
    const upcomingDayFlags = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i);
      return upcomingWeek.some((sub) => {
        const bd = new Date(sub.nextBillingDate);
        return (
          bd.getFullYear() === day.getFullYear() &&
          bd.getMonth() === day.getMonth() &&
          bd.getDate() === day.getDate()
        );
      });
    });

    return {
      upcomingCount: upcomingWeek.length,
      upcomingTotal,
      dayOfMonth,
      daysInMonth,
      activeDays,
      upcomingDayFlags,
    };
  }, [stats, subscriptions, transactions, C]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  // Failed-scan count for the Receipts tile badge. Loaded from the queue (async)
  // and refreshed whenever the dashboard regains focus, since a scan can fail
  // while the user is on another screen.
  const [receiptsBadge, setReceiptsBadge] = useState(0);
  useFocusEffect(
    useCallback(() => {
      listFailedReceipts().then((l) => setReceiptsBadge(l.length)).catch(() => {});
    }, [])
  );

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
  // While sample data is loaded, the demo banner owns the first-run slot — it
  // supersedes FreshStart/GettingStarted (keeps the "exactly one" rule).
  const sampleDataLoaded = useSettingsStore((s) => s.sampleDataLoaded);
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

    if (!editAmount || isNaN(parseFloat(editAmount)) || parseFloat(editAmount) <= 0) {
      showToast(t.transaction.invalidAmount, 'error');
      return;
    }

    if (!editDescription.trim()) {
      showToast(t.transaction.missingDescription, 'error');
      return;
    }

    const newAmount = parseFloat(editAmount);
    const oldAmount = editingTransaction.amount;
    const oldType = editingTransaction.type;

    // Wallet reconciliation is owned by personalStore.updateTransaction (it reverses
    // the old adjustment and applies the new one). Do NOT adjust the wallet here.
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
      // Wallet reconciliation is owned by personalStore.deleteTransaction (it rolls
      // back the balance). deletePayment no longer touches the wallet either, so the
      // single rollback below is correct for debt-linked transactions too.
      if (isTransferLinked && transferId) {
        unmarkOrdersTransferred(transferId);
        deleteTransfer(transferId);
      }
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
    if (screen === 'PersonalReports' || screen === 'SubscriptionList' || screen === 'DebtTracking' || screen === 'WalletManagement' || screen === 'SavingsTracker' || screen === 'MoneyChat' || screen === 'Goals' || screen === 'FinancialPulse' || screen === 'ReceiptHistory' || screen === 'Calculator' || screen === 'CollectzHome') {
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
      <RNScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.textMuted} colors={[C.accent]} />
        }
      >
        <GlassModeToggle />
        <OfflineBanner />
        {/* Zone 1 — Greeting (small) */}
        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>{greeting}</Text>
          <NeuIconButton
            size={44}
            radius={14}
            onPress={() => {
              if (paymentQrs.length > 0) {
                setQrViewIndex(0);
                setQrModalVisible(true);
              } else {
                Alert.alert(
                  t.dashboard.noQrTitle,
                  t.dashboard.noQrMessage,
                  [
                    { text: t.common.later, style: 'cancel' },
                    { text: t.dashboard.goToSettings, onPress: () => navigation.navigate('SettingsDetail', { section: 'money', scrollTo: 'qr' }) },
                  ]
                );
              }
            }}
            accessibilityLabel={t.dashboard.showPaymentQr}
          >
            <Feather name="maximize" size={22} color={paymentQrs.length > 0 ? C.accent : C.textMuted} />
          </NeuIconButton>
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
            rule above. The sample-data banner (demo mode) wins the slot; else
            FreshStart on days 1-5, GettingStarted otherwise. */}
        {sampleDataLoaded ? (
          // TEMP: demo-data banner hidden for now — restore via the
          // SHOW_SAMPLE_DATA_BANNER flag at the top of this file.
          SHOW_SAMPLE_DATA_BANNER ? <SampleDataBanner /> : null
        ) : (
          <>
            {showFreshStart && <FreshStart />}
            {showGettingStarted && <GettingStarted />}
          </>
        )}

        {/* Zone 5 — Insight Strip. Hidden until real data exists — a row of
            zeros ("0 transactions", "0%") reads as a dead app, not a report. */}
        {transactions.length > 0 && (
        <RAnimated.View entering={FadeInDown.delay(150).duration(200)} style={styles.insightStripWrap}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.insightStripRow}
          style={styles.insightStripScroll}
          snapToInterval={176 + SPACING.sm}
          decelerationRate="fast"
        >
          {/* Pulse — the strip's lead: real score + a living mini ECG.
              Same pulseScore() as the flagship screen. */}
          {pulseSnap !== null && (
            <TouchableOpacity
              style={[styles.insightCard, neuF.raisedSoft]}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('FinancialPulse'); }}
              accessibilityRole="button"
              accessibilityLabel={`${t.dashboard.pulseCard}: ${pulseSnap.score}. ${pulseBandLabel[pulseSnap.band]}`}
            >
              <LinearGradient
                colors={[withAlpha(pulseBandColor(pulseSnap.band), isDark ? 0.16 : 0.09), withAlpha(pulseBandColor(pulseSnap.band), 0)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <View style={[styles.insightSpine, { backgroundColor: pulseBandColor(pulseSnap.band) }]} />
              <Text style={styles.insightCardLabel}>{t.dashboard.pulseCard}</Text>
              <View style={styles.insightBody}>
                <View style={styles.insightTextCol}>
                  <Text style={[styles.insightValue, { color: pulseBandColor(pulseSnap.band) }]} numberOfLines={1}>
                    {pulseSnap.score}
                  </Text>
                  <Text style={styles.insightContext} numberOfLines={1}>{pulseBandLabel[pulseSnap.band]}</Text>
                </View>
                <PulseWave
                  width={62}
                  height={34}
                  color={pulseBandColor(pulseSnap.band)}
                  trackColor={withAlpha(C.textPrimary, 0.1)}
                  active={isFocused}
                />
              </View>
            </TouchableOpacity>
          )}

          {/* Transactions — mini dot-calendar of the month */}
          <TouchableOpacity
            style={[styles.insightCard, neuF.raisedSoft]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('TransactionsList'); }}
            accessibilityLabel={`${stats.transactionCount} transactions this month`}
          >
            <LinearGradient
              colors={[withAlpha(C.accent, isDark ? 0.14 : 0.08), withAlpha(C.accent, 0)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <View style={[styles.insightSpine, { backgroundColor: C.accent }]} />
            <Text style={styles.insightCardLabel}>{t.dashboard.thisMonth.toLowerCase()}</Text>
            <View style={styles.insightBody}>
              <View style={styles.insightTextCol}>
                <Text style={[styles.insightValue, { color: C.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {stats.transactionCount}
                </Text>
                <Text style={styles.insightContext}>{t.dashboard.transactions.toLowerCase()}</Text>
              </View>
              <DotCalendar
                daysInMonth={insightStrip.daysInMonth}
                dayOfMonth={insightStrip.dayOfMonth}
                activeDays={insightStrip.activeDays}
                color={C.accent}
                C={C}
              />
            </View>
          </TouchableOpacity>

          {/* Kept — came-in vs went-out twin bars → Reports with the
              "show me the math" sheet opened on the kept equation */}
          <TouchableOpacity
            style={[styles.insightCard, neuF.raisedSoft]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('PersonalReports', { openMath: 'kept' }); }}
            accessibilityLabel={`Kept ${currency} ${kept.keptThisMonth.toFixed(2)} this month`}
          >
            <LinearGradient
              colors={[withAlpha(kept.keptThisMonth >= 0 ? C.positive : C.neutral, isDark ? 0.14 : 0.08), withAlpha(kept.keptThisMonth >= 0 ? C.positive : C.neutral, 0)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <View style={[styles.insightSpine, { backgroundColor: kept.keptThisMonth >= 0 ? C.positive : C.neutral }]} />
            <Text style={styles.insightCardLabel}>{t.dashboard.hero.kept}</Text>
            <View style={styles.insightBody}>
              <View style={styles.insightTextCol}>
                <Text style={[styles.insightValue, { color: C.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {kept.keptThisMonth >= 0 ? '+' : ''}{currency} {kept.keptThisMonth.toFixed(0)}
                </Text>
                <Text style={styles.insightContext}>{t.dashboard.netThisMonth}</Text>
              </View>
              <TwinBars inAmt={stats.income} outAmt={stats.expenses} C={C} />
            </View>
          </TouchableOpacity>

          {/* BNPL / Credit */}
          {bnpl.walletCount > 0 && bnpl.totalUsed > 0 && (
            <TouchableOpacity
              style={[styles.insightCard, neuF.raisedSoft]}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('WalletManagement', { focusSection: 'credit' }); }}
              accessibilityLabel={`Future you owes ${currency} ${bnpl.totalUsed.toFixed(2)}`}
            >
              <LinearGradient
                colors={[withAlpha(C.bronze, isDark ? 0.14 : 0.08), withAlpha(C.bronze, 0)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <View style={[styles.insightSpine, { backgroundColor: C.bronze }]} />
              <Text style={styles.insightCardLabel}>{t.dashboard.owedLater}</Text>
              <View style={styles.insightBody}>
                <View style={styles.insightTextCol}>
                  <Text style={[styles.insightValue, { color: C.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {currency} {bnpl.totalUsed.toFixed(0)}
                  </Text>
                  <Text style={styles.insightContext}>{t.dashboard.buyNowPayLater}</Text>
                </View>
                <DuoIcon glyph="clock" color={C.bronze} size={30} fillAlpha={isDark ? 0.32 : 0.26} />
              </View>
            </TouchableOpacity>
          )}

          {/* Upcoming Bills — 7-day tick ruler */}
          <TouchableOpacity
            style={[styles.insightCard, neuF.raisedSoft]}
            activeOpacity={0.7}
            onPress={() => { lightTap(); navigation.getParent()?.navigate('SubscriptionList', { initialStatus: 'upcoming' }); }}
            accessibilityLabel={`${insightStrip.upcomingCount} bills due this week`}
          >
            <LinearGradient
              colors={[withAlpha(C.gold, isDark ? 0.14 : 0.08), withAlpha(C.gold, 0)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <View style={[styles.insightSpine, { backgroundColor: C.gold }]} />
            <Text style={styles.insightCardLabel}>{t.dashboard.comingUp}</Text>
            <View style={styles.insightBody}>
              <View style={styles.insightTextCol}>
                <Text style={[styles.insightValue, { color: C.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {insightStrip.upcomingCount} {insightStrip.upcomingCount === 1 ? t.dashboard.billOne : t.dashboard.billMany}
                </Text>
                <Text style={styles.insightContext}>{currency} {insightStrip.upcomingTotal.toFixed(0)} {t.dashboard.thisWeekLower}</Text>
              </View>
              <WeekTicks flags={insightStrip.upcomingDayFlags} color={C.gold} C={C} />
            </View>
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
        )}

        {/* Quick Actions — neumorphic tiles (components/common/QuickActions) */}
        <QuickActions onAction={handleQuickAction} billsBadge={billsBadge} receiptsBadge={receiptsBadge} />

        {/* Details section */}
        <CollapsibleSection title={t.dashboard.details} subtitle={t.dashboard.detailsSubtitle} defaultOpen={false}>
          {/* Upcoming-bills card removed (2026-07-16) — bills live in the 7-day
              tick ruler above + the Bills screen. */}

          {/* You owe / owed to you — one minimal neu card, two columns. Micro-label
              + light tabular number per side (insight-strip type language); the
              divider separates them. Tap → Debt screen. */}
          {(stats.youOwe > 0 || stats.owedToYou > 0) && (
            <TouchableOpacity
              style={[styles.debtCard, neuF.raisedSoft]}
              activeOpacity={0.7}
              onPress={() => { lightTap(); navigation.getParent()?.navigate('DebtTracking'); }}
              accessibilityRole="button"
              accessibilityLabel={`${t.dashboard.youOwe} ${currency} ${stats.youOwe.toFixed(2)}. ${t.dashboard.owedToYou} ${currency} ${stats.owedToYou.toFixed(2)}`}
            >
              <View style={styles.debtCol}>
                <Text style={styles.debtLabel}>{t.dashboard.youOwe}</Text>
                <Text style={styles.debtValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {currency} {stats.youOwe.toFixed(0)}
                </Text>
              </View>
              <View style={styles.debtDivider} />
              <View style={styles.debtCol}>
                <Text style={styles.debtLabel}>{t.dashboard.owedToYou}</Text>
                <Text style={[styles.debtValue, { color: C.positive }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {currency} {stats.owedToYou.toFixed(0)}
                </Text>
              </View>
            </TouchableOpacity>
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
                icon="i/receipt-outline"
                title={t.dashboard.noTransactionsTitle}
                message={t.dashboard.noTransactionsMessage}
              />
            )}
          </View>
        </CollapsibleSection>
      </RNScrollView>

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
                  selectionColor={withAlpha(C.accent, 0.25)}
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
                  selectionColor={withAlpha(C.accent, 0.25)}
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
                  selectionColor={withAlpha(C.accent, 0.25)}
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
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

  // Zone 5 — Insight Strip
  insightStripWrap: {
    position: 'relative',
    marginBottom: SPACING.lg,
  },
  insightStripScroll: {
    marginHorizontal: -SPACING['2xl'],
    // Bleed so the neu boxShadow isn't clipped by the scroll viewport
    // (owner rule: "neu onyx vertical error") — the row padding gives it back.
    marginVertical: -SPACING.md,
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
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  // Onyx: borderless C.background face + neuF.raisedSoft at the use site;
  // each card carries its own color as a corner gradient wash + spine.
  insightCard: {
    width: 176,
    minHeight: 92,
    padding: SPACING.md,
    paddingLeft: SPACING.md + 6,
    borderRadius: RADIUS.xl,
    backgroundColor: C.background,
    gap: 2,
    overflow: 'hidden',
  },
  insightSpine: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  insightBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginTop: 6,
  },
  insightTextCol: {
    flexShrink: 1,
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
  detailSectionTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },

  // You owe / owed to you — Onyx neu card (no border; raise from neuF.raisedSoft
  // at the call site), two columns in the insight-strip type language.
  debtCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.lg,
  },
  debtCol: {
    flex: 1,
    gap: 4,
  },
  debtLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  debtValue: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  debtDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: withAlpha(C.textPrimary, 0.08),
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
