import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  SectionList,
  Modal,
  Alert,
  Keyboard,
  InteractionManager,
  RefreshControl,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import Reanimated, {
  FadeInDown,
} from 'react-native-reanimated';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format, isValid, startOfMonth, endOfMonth, subMonths, isWithinInterval, startOfYear, getDay } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import TransactionItem from '../../components/common/TransactionItem';
import WalletLogo from '../../components/common/WalletLogo';
import EditTransactionSheet from '../../components/transactions/EditTransactionSheet';
import { Transaction, CategoryOption } from '../../types';
import { useWalletStore } from '../../store/walletStore';
import { useSellerStore } from '../../store/sellerStore';
import { useBusinessStore } from '../../store/businessStore';
import { useLearningStore } from '../../store/learningStore';
import { usePlaybookStore } from '../../store/playbookStore';
import { useDebtStore } from '../../store/debtStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../context/ToastContext';
import { lightTap, selectionChanged } from '../../services/haptics';
import { formatAmount } from '../../utils/formatters';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import ModalToastHost from '../../components/common/ModalToastHost';

type FilterType = 'all' | 'expense' | 'income';
type DateRange = 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'all_time';
type SortBy = 'date' | 'amount';
type SortOrder = 'asc' | 'desc';

const TYPE_FILTER_KEYS: FilterType[] = ['all', 'expense', 'income'];
const DATE_RANGE_KEYS: DateRange[] = ['this_month', 'last_month', 'last_3_months', 'this_year', 'all_time'];

function getDateInterval(range: DateRange): { start: Date; end: Date } | null {
  const now = new Date();
  switch (range) {
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_month': {
      const last = subMonths(now, 1);
      return { start: startOfMonth(last), end: endOfMonth(last) };
    }
    case 'last_3_months':
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case 'this_year':
      return { start: startOfYear(now), end: endOfMonth(now) };
    case 'all_time':
      return null;
  }
}

const TransactionsList: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Optional initial category filter passed from another screen (e.g. budget
  // detail sheet "see all transactions"). Seeded once into the filter state so
  // the list lands pre-filtered to that category instead of the full dump.
  const initialFilterCategory: string | undefined = route.params?.filterCategory;

  const TYPE_FILTERS = useMemo(() => [
    { key: 'all' as FilterType, label: t.transactionList.all.toLowerCase() },
    { key: 'expense' as FilterType, label: t.transactionList.expenses.toLowerCase() },
    { key: 'income' as FilterType, label: t.transactionList.income.toLowerCase() },
  ], [t]);

  const DATE_RANGES = useMemo(() => [
    { key: 'this_month' as DateRange, label: t.transactionList.thisMonth.toLowerCase() },
    { key: 'last_month' as DateRange, label: t.transactionList.lastMonth.toLowerCase() },
    { key: 'last_3_months' as DateRange, label: t.transactionList.last3Months.toLowerCase() },
    { key: 'this_year' as DateRange, label: t.transactionList.thisYear.toLowerCase() },
    { key: 'all_time' as DateRange, label: t.transactionList.all.toLowerCase() },
  ], [t]);
  const { transactions, updateTransaction, deleteTransaction } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const unmarkOrdersTransferred = useSellerStore((s) => s.unmarkOrdersTransferred);
  const updateIngredientCost = useSellerStore((s) => s.updateIngredientCost);
  const deleteTransfer = useBusinessStore((s) => s.deleteTransfer);
  const { showToast } = useToast();
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const allCategories = useMemo(() => [...expenseCategories, ...incomeCategories], [expenseCategories, incomeCategories]);

  // ── Lookup maps for O(1) category/wallet resolution ────────
  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const c of allCategories) map.set(c.id, c);
    return map;
  }, [allCategories]);

  const walletMap = useMemo(() => {
    const map = new Map<string, typeof wallets[0]>();
    for (const w of wallets) map.set(w.id, w);
    return map;
  }, [wallets]);

  // ── Search & filter state ────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all_time');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => (initialFilterCategory ? new Set([initialFilterCategory]) : new Set())
  );
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // ── Filter modal ─────────────────────────────────────────────
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  // Temp state for filter modal (apply on confirm)
  const [tempDateRange, setTempDateRange] = useState<DateRange>(dateRange);
  const [tempCategories, setTempCategories] = useState<Set<string>>(new Set(selectedCategories));
  const [tempWalletId, setTempWalletId] = useState<string | null>(selectedWalletId);
  const [tempSortBy, setTempSortBy] = useState<SortBy>(sortBy);
  const [tempSortOrder, setTempSortOrder] = useState<SortOrder>(sortOrder);

  // ── Select mode ──────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Edit modal state ─────────────────────────────────────────
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editType, setEditType] = useState<'expense' | 'income'>('expense');
  const [editTags, setEditTags] = useState('');
  const [editWalletId, setEditWalletId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<Date>(new Date());

  // ── Pull-to-refresh ────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 300);
  }, []);

  // ── Swipe-to-delete with undo ─────────────────────────────
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup timers on unmount — clear handles AND empty the Map so any stragglers
  // can't fire store mutations against an unmounted component.
  useEffect(() => {
    const timers = pendingDeleteTimers.current;
    return () => {
      timers.forEach((handle) => {
        if (handle) clearTimeout(handle);
      });
      timers.clear();
    };
  }, []);

  // ── Derived: has advanced filters active ─────────────────────
  const hasAdvancedFilters = dateRange !== 'all_time' || selectedCategories.size > 0 || selectedWalletId !== null;

  // ── Filtered transactions ────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((t) => t.type === typeFilter);
    }

    // Date range filter
    const interval = getDateInterval(dateRange);
    if (interval) {
      result = result.filter((t) => {
        if (!isValid(t.date)) return false;
        return isWithinInterval(t.date, interval);
      });
    }

    // Category filter
    if (selectedCategories.size > 0) {
      result = result.filter((t) => selectedCategories.has(t.category));
    }

    // Wallet filter
    if (selectedWalletId) {
      result = result.filter((t) => t.walletId === selectedWalletId);
    }

    // Search — matches description, category, tags, amount, formatted date
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((t) => {
        if (t.description.toLowerCase().includes(query)) return true;
        if (t.category.toLowerCase().includes(query)) return true;
        if (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(query))) return true;
        if (t.amount.toString().includes(query)) return true;
        if (t.amount.toFixed(2).includes(query)) return true;
        if (isValid(t.date)) {
          const iso = t.date.toISOString().slice(0, 10);
          if (iso.includes(query)) return true;
          const local = t.date.toLocaleDateString().toLowerCase();
          if (local.includes(query)) return true;
        }
        return false;
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'amount') {
        cmp = a.amount - b.amount;
      } else {
        cmp = (a.date?.getTime?.() || 0) - (b.date?.getTime?.() || 0);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Hide pending deletes
    if (pendingDeleteIds.size > 0) {
      result = result.filter((t) => !pendingDeleteIds.has(t.id));
    }

    return result;
  }, [transactions, typeFilter, dateRange, selectedCategories, selectedWalletId, searchQuery, sortBy, sortOrder, pendingDeleteIds]);

  // ── Average daily expense for micro-insights ────────────────
  const avgDailyExpense = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const daysSoFar = Math.max(1, now.getDate());
    const monthExpenses = transactions
      .filter((t) => t.type === 'expense' && isValid(t.date) && isWithinInterval(t.date, { start: monthStart, end: monthEnd }))
      .reduce((sum, t) => sum + t.amount, 0);
    return monthExpenses / daysSoFar;
  }, [transactions]);

  // ── Sections ─────────────────────────────────────────────────
  const sections = useMemo(() => {
    if (sortBy === 'amount') {
      // Flat list when sorting by amount (no date grouping)
      return [{
        title: t.transactionList.sortedByAmount.replace('{order}', sortOrder === 'desc' ? t.transactionList.highestFirst : t.transactionList.lowestFirst),
        titleDate: null as Date | null,
        data: filteredTransactions,
        dailyNet: 0,
        microInsight: '',
      }];
    }

    const grouped: Record<string, Transaction[]> = {};
    filteredTransactions.forEach((t) => {
      const dateKey = isValid(t.date) ? format(t.date, 'yyyy-MM-dd') : 'unknown';
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(t);
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, data]) => {
        const dailyNet = data.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
        let title: string;
        let titleDate: Date | null = null;
        if (dateKey === 'unknown') {
          title = t.transactionList.unknownDate;
        } else {
          try {
            titleDate = new Date(dateKey + 'T00:00:00');
            title = isValid(titleDate) ? format(titleDate, 'EEE, MMM d').toLowerCase() : t.transactionList.unknownDate;
          } catch {
            title = t.transactionList.unknownDate;
          }
        }

        // Micro-insight
        let microInsight = '';
        if (titleDate && isValid(titleDate)) {
          const dayOfWeek = getDay(titleDate);
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const dayExpenses = data.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

          if (avgDailyExpense > 0 && dayExpenses > avgDailyExpense * 2) {
            microInsight = t.transactionList.busierThanUsual;
          } else if (avgDailyExpense > 0 && dayExpenses > 0 && dayExpenses < avgDailyExpense * 0.5) {
            microInsight = t.transactionList.quietDay;
          } else if (isWeekend) {
            microInsight = t.transactionList.weekend;
          }
        }

        return { title, titleDate, data, dailyNet, microInsight };
      });
  }, [filteredTransactions, sortBy, sortOrder, avgDailyExpense, t]);

  // ── Totals ───────────────────────────────────────────────────
  const totals = useMemo(() => {
    let income = 0, expenses = 0;
    for (const t of filteredTransactions) {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expenses += t.amount;
    }
    return { income, expenses, net: income - expenses };
  }, [filteredTransactions]);

  // ── Filter modal handlers ────────────────────────────────────
  const openFilterModal = useCallback(() => {
    lightTap();
    setTempDateRange(dateRange);
    setTempCategories(new Set(selectedCategories));
    setTempWalletId(selectedWalletId);
    setTempSortBy(sortBy);
    setTempSortOrder(sortOrder);
    setFilterModalVisible(true);
  }, [dateRange, selectedCategories, selectedWalletId, sortBy, sortOrder]);

  const applyFilters = useCallback(() => {
    lightTap();
    setDateRange(tempDateRange);
    setSelectedCategories(new Set(tempCategories));
    setSelectedWalletId(tempWalletId);
    setSortBy(tempSortBy);
    setSortOrder(tempSortOrder);
    setFilterModalVisible(false);
  }, [tempDateRange, tempCategories, tempWalletId, tempSortBy, tempSortOrder]);

  const clearAllFilters = useCallback(() => {
    lightTap();
    setTempDateRange('all_time');
    setTempCategories(new Set());
    setTempWalletId(null);
    setTempSortBy('date');
    setTempSortOrder('desc');
  }, []);

  const toggleTempCategory = useCallback((catId: string) => {
    setTempCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  // ── Select mode handlers ─────────────────────────────────────
  const enterSelectMode = useCallback((firstId: string) => {
    selectionChanged();
    setSelectMode(true);
    setSelectedIds(new Set([firstId]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    lightTap();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    lightTap();
    setSelectedIds(new Set(filteredTransactions.map((t) => t.id)));
  }, [filteredTransactions]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;

    const deletableIds = new Set<string>();
    let linkedCount = 0;
    for (const id of selectedIds) {
      const txn = transactions.find((t) => t.id === id);
      if (!txn) continue;
      if (txn.linkedDebtId || txn.linkedGoalId) { linkedCount++; continue; }
      deletableIds.add(id);
    }

    if (linkedCount > 0) {
      showToast(t.transactionList.debtLinkedCannotDelete, 'info');
    }

    if (deletableIds.size === 0) { exitSelectMode(); return; }

    const title = (deletableIds.size > 1 ? t.transactionList.deleteNTitlePlural : t.transactionList.deleteNTitle).replace('{n}', String(deletableIds.size));
    Alert.alert(
      title,
      t.transactionList.deleteNMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => {
            for (const id of deletableIds) {
              const txn = transactions.find((t) => t.id === id);
              if (!txn) continue;
              // Wallet reconciliation is owned by personalStore.deleteTransaction. Do NOT adjust here.
              if (txn.id.startsWith('transfer-')) {
                const transferId = txn.id.replace('transfer-', '');
                unmarkOrdersTransferred(transferId);
                deleteTransfer(transferId);
              }
              const linkedCost = useSellerStore.getState().ingredientCosts.find(
                (c) => c.personalTransactionId === txn.id
              );
              if (linkedCost) useSellerStore.getState().deleteIngredientCost(linkedCost.id);
              usePlaybookStore.getState().unlinkAllFromTransaction(id);
              deleteTransaction(id);
            }
            showToast((deletableIds.size > 1 ? t.transactionList.nDeletedPlural : t.transactionList.nDeleted).replace('{n}', String(deletableIds.size)), 'success');
            exitSelectMode();
          },
        },
      ]
    );
  }, [selectedIds, transactions, unmarkOrdersTransferred, deleteTransfer, deleteTransaction, exitSelectMode, showToast, t]);

  // ── Edit handlers ────────────────────────────────────────────
  const handleEditTransaction = useCallback((transaction: Transaction) => {
    if (selectMode) {
      toggleSelect(transaction.id);
      return;
    }
    setEditingTransaction(transaction);
    setEditAmount(transaction.amount.toString());
    setEditDescription(transaction.description);
    setEditCategory(transaction.category);
    setEditType(transaction.type);
    setEditTags(transaction.tags?.join(', ') || '');
    setEditWalletId(transaction.walletId || null);
    setEditDate(isValid(transaction.date) ? transaction.date : new Date());
    setEditModalVisible(true);
  }, [selectMode, toggleSelect]);

  const handleSwipeDelete = useCallback((id: string) => {
    const txn = transactions.find((t) => t.id === id);
    if (!txn) return;

    if (txn.linkedDebtId || txn.linkedGoalId) {
      showToast(t.transactionList.debtLinkedCannotDelete, 'info');
      return;
    }

    if (txn.id.startsWith('transfer-')) {
      handleEditTransaction(txn);
      return;
    }

    lightTap();
    // Soft-delete: hide from list
    setPendingDeleteIds((prev) => new Set(prev).add(id));

    // Set timer for hard delete
    const timerId = setTimeout(() => {
      // Wallet reconciliation is owned by personalStore.deleteTransaction. Do NOT adjust here.
      usePlaybookStore.getState().unlinkAllFromTransaction(id);
      deleteTransaction(id);
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      pendingDeleteTimers.current.delete(id);
    }, 4200);

    pendingDeleteTimers.current.set(id, timerId);

    showToast(t.transactionList.deleted, 'info', {
      label: t.transactionList.undo,
      onPress: () => {
        const timer = pendingDeleteTimers.current.get(id);
        if (timer) {
          clearTimeout(timer);
          pendingDeleteTimers.current.delete(id);
        }
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
  }, [transactions, handleEditTransaction, deleteTransaction, showToast, t]);

  const handleUpdateTransaction = useCallback(() => {
    if (!editingTransaction) return;

    if (!editDescription.trim()) {
      showToast(t.transaction.missingDescription, 'error');
      return;
    }

    const isDebtLinked = !!editingTransaction.linkedDebtId;
    // Income transferred from business mode is owned by the seller side — its
    // amount is what the seller-side reconcile adjusts when source orders change.
    // Editing the amount here would desync the two sides, so (like debt-linked
    // payments) only description + tags are editable.
    const isTransferLinked = editingTransaction.id.startsWith('transfer-');

    if (isDebtLinked || isTransferLinked) {
      updateTransaction(editingTransaction.id, {
        description: editDescription.trim(),
        tags: editTags ? editTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      setEditModalVisible(false);
      setEditingTransaction(null);
      showToast(t.transactionList.transactionUpdated, 'success');
      return;
    }

    if (!editAmount || isNaN(parseFloat(editAmount)) || parseFloat(editAmount) <= 0) {
      showToast(t.transaction.invalidAmount, 'error');
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
    const desc = editDescription.trim();
    if (desc && editCategory) learn.learnCategory(desc, editCategory);
    if (desc && editWalletId) {
      const wName = useWalletStore.getState().wallets.find((w) => w.id === editWalletId)?.name;
      if (wName) learn.learnWallet(desc, wName);
    }
    if (editType !== oldType && desc) learn.learnTypeCorrection(desc, editType);

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

    const linkedCost = useSellerStore.getState().ingredientCosts.find(
      (c) => c.personalTransactionId === editingTransaction.id
    );
    if (linkedCost) {
      const desc2 = editDescription.trim();
      updateIngredientCost(linkedCost.id, {
        description: desc2.startsWith('seller: ') ? desc2.replace('seller: ', '') : desc2,
        amount: newAmount,
      });
    }

    setEditModalVisible(false);
    setEditingTransaction(null);
    showToast(t.transactionList.transactionUpdated, 'success');
  }, [editingTransaction, editAmount, editDescription, editCategory, editType, editTags, editWalletId, updateTransaction, updateIngredientCost, showToast, t]);

  const handleDeleteTransaction = useCallback(() => {
    if (!editingTransaction) return;

    if (editingTransaction.linkedDebtId) {
      showToast(t.transactionList.debtLinkedCannotDelete, 'info');
      return;
    }

    const isTransferLinked = editingTransaction.id.startsWith('transfer-');
    const transferId = isTransferLinked ? editingTransaction.id.replace('transfer-', '') : null;

    const doDelete = () => {
      // Wallet reconciliation is owned by personalStore.deleteTransaction (it rolls
      // back the balance). Do NOT adjust the wallet here.
      if (isTransferLinked && transferId) {
        unmarkOrdersTransferred(transferId);
        deleteTransfer(transferId);
      }
      const linkedCost = useSellerStore.getState().ingredientCosts.find(
        (c) => c.personalTransactionId === editingTransaction.id
      );
      if (linkedCost) {
        useSellerStore.getState().deleteIngredientCost(linkedCost.id);
      }
      usePlaybookStore.getState().unlinkAllFromTransaction(editingTransaction.id);
      deleteTransaction(editingTransaction.id);
      setEditModalVisible(false);
      setEditingTransaction(null);
      showToast(t.transactionList.deleted, 'success');
    };

    Alert.alert(
      t.transaction.deleteConfirm,
      isTransferLinked
        ? t.transactionList.transferDeleteMsg
        : t.transactionList.defaultDeleteMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: doDelete },
      ]
    );
  }, [editingTransaction, unmarkOrdersTransferred, deleteTransfer, deleteTransaction, showToast, t]);

  const handleEditTypeChange = (newType: 'expense' | 'income') => {
    setEditType(newType);
    const newCategories = newType === 'expense' ? expenseCategories : incomeCategories;
    setEditCategory(newCategories[0].id);
  };

  // ── Render helpers ───────────────────────────────────────────
  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  const handleItemPress = useCallback((id: string) => {
    const txn = transactions.find((t) => t.id === id);
    if (txn) handleEditTransaction(txn);
  }, [transactions, handleEditTransaction]);

  const handleItemLongPress = useCallback((id: string) => {
    if (!selectMode) enterSelectMode(id);
  }, [selectMode, enterSelectMode]);

  const renderItem = useCallback(({ item, index, section }: { item: Transaction; index: number; section: { data: Transaction[] } }) => (
    <TransactionItem
      transaction={item}
      currency={currency}
      category={categoryMap.get(item.category)}
      wallet={item.walletId ? walletMap.get(item.walletId) : undefined}
      onPress={handleItemPress}
      onLongPress={handleItemLongPress}
      onSwipeDelete={handleSwipeDelete}
      isSelected={selectedIds.has(item.id)}
      selectMode={selectMode}
      isFirst={index === 0}
      isLast={index === section.data.length - 1}
      index={index}
    />
  ), [currency, categoryMap, walletMap, handleItemPress, handleItemLongPress, handleSwipeDelete, selectMode, selectedIds]);

  // Section headers killed for the pill-card layout \u2014 each card carries its own date.
  // Matches reference pattern (My Transactions screenshot): separated cards, no day-group chrome.
  const renderSectionHeader = useCallback(() => null, []);

  // ── Categories for filter modal ──────────────────────────────
  const filterCategories = useMemo(() => {
    const cats = typeFilter === 'income' ? incomeCategories : typeFilter === 'expense' ? expenseCategories : allCategories;
    // Deduplicate by id
    const seen = new Set<string>();
    return cats.filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
  }, [typeFilter, expenseCategories, incomeCategories, allCategories]);

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

  return (
    <View style={styles.container}>
      {/* Select mode header */}
      {selectMode ? (
        <View style={styles.selectHeader}>
          <TouchableOpacity
            onPress={exitSelectMode}
            style={styles.selectHeaderBtn}
            accessibilityLabel={t.common.done.toLowerCase()}
            accessibilityRole="button"
          >
            <Text style={styles.selectHeaderBtnText}>{t.common.done.toLowerCase()}</Text>
          </TouchableOpacity>
          <Text style={styles.selectHeaderTitle}>{selectedIds.size} {t.transactionList.selected}</Text>
          <TouchableOpacity
            onPress={selectAll}
            style={styles.selectHeaderBtn}
            accessibilityLabel={t.transactionList.selectAll.toLowerCase()}
            accessibilityRole="button"
          >
            <Text style={styles.selectHeaderBtnText}>{t.transactionList.selectAll.toLowerCase()}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Feather name="search" size={18} color={C.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t.transactionList.searchPlaceholder}
              placeholderTextColor={C.textMuted}
              returnKeyType="search"
              accessibilityLabel={t.transactionList.searchPlaceholder}
              accessibilityRole="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                accessibilityLabel={t.common.clear.toLowerCase()}
                accessibilityRole="button"
              >
                <Feather name="x-circle" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter pills — 3 separate pills matching reference: dark filled active, light unfilled inactive.
              Each pill stands alone with horizontal scroll if it overflows. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterPillsScroll}
            contentContainerStyle={styles.filterPillsContent}
            keyboardShouldPersistTaps="handled"
          >
            {TYPE_FILTERS.map((f) => {
              const active = typeFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                  onPress={() => { lightTap(); setTypeFilter(f.key); }}
                  activeOpacity={0.7}
                  accessibilityLabel={f.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.filterPill, hasAdvancedFilters && styles.filterPillAdvActive]}
              onPress={openFilterModal}
              activeOpacity={0.7}
              accessibilityLabel={t.transactionList.filter.toLowerCase()}
              accessibilityRole="button"
            >
              <Feather
                name="sliders"
                size={13}
                color={hasAdvancedFilters ? C.accent : C.textMuted}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.filterPillText, hasAdvancedFilters && { color: C.accent }]}>
                {t.transactionList.filter.toLowerCase()}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Active filter chips */}
          {hasAdvancedFilters && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.activeFiltersRow}>
              {dateRange !== 'all_time' && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => { lightTap(); setDateRange('all_time'); }}
                >
                  <Text style={styles.activeFilterText}>
                    {DATE_RANGES.find((d) => d.key === dateRange)?.label}
                  </Text>
                  <Feather name="x" size={12} color={C.accent} />
                </TouchableOpacity>
              )}
              {selectedCategories.size > 0 && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => { lightTap(); setSelectedCategories(new Set()); }}
                >
                  <Text style={styles.activeFilterText}>
                    {(selectedCategories.size === 1 ? t.transactionList.categoryCount : t.transactionList.categoriesCount).replace('{n}', String(selectedCategories.size))}
                  </Text>
                  <Feather name="x" size={12} color={C.accent} />
                </TouchableOpacity>
              )}
              {selectedWalletId && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => { lightTap(); setSelectedWalletId(null); }}
                >
                  <Text style={styles.activeFilterText}>
                    {wallets.find((w) => w.id === selectedWalletId)?.name || t.transactionList.walletFallback}
                  </Text>
                  <Feather name="x" size={12} color={C.accent} />
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </>
      )}

      {/* Quiet header zone — reference-grade discipline.
          Title + 1-line summary. NO gradient, NO sparkline, NO streak, NO AI chip.
          The richness comes from the cards below, not from chrome up here. */}
      {!selectMode && (
        <Reanimated.View
          entering={FadeInDown.duration(480).springify().damping(20).stiffness(110).mass(0.7)}
          style={styles.headerZone}
        >
          <Text style={styles.headerTitle}>
            {t.transactionList.youKept.toLowerCase()}{' '}
            <Text style={styles.headerTitleAmount}>
              {totals.net >= 0 ? '+' : '−'}{formatAmount(Math.abs(totals.net), currency, 0)}
            </Text>
            {' '}
            <Text style={styles.headerTitlePeriod}>
              {((DATE_RANGES.find(d => d.key === dateRange)?.label) ?? t.transactionList.all).toLowerCase()}
            </Text>
          </Text>
        </Reanimated.View>
      )}

      {/* Transaction List */}
      {sections.length > 0 && sections.some((s) => s.data.length > 0) ? (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={true}
          removeClippedSubviews={true}
          windowSize={5}
          maxToRenderPerBatch={10}
          initialNumToRender={12}
          updateCellsBatchingPeriod={50}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          {/* Typographic empty state — no icon, no illustration.
              Vocabulary: Mercury § 2 (typography-as-design), Linear § 3 ("nothing here yet" muted line).
              Avoids: N6 (no pastel illustrations or stock empty-state icons). */}
          <Text style={styles.emptyHeadline}>
            {searchQuery
              ? `${t.transactionList.noResults.toLowerCase()}`
              : hasAdvancedFilters
              ? t.transactionList.noResults.toLowerCase()
              : t.dashboard.noTransactions.toLowerCase()}
          </Text>
          <Text style={styles.emptySubline}>
            {searchQuery
              ? t.transactionList.nothingMatching.replace('{query}', searchQuery).toLowerCase()
              : hasAdvancedFilters
              ? t.transactionList.clearAllFilters.toLowerCase()
              : t.dashboard.addFirst.toLowerCase()}
          </Text>
          {hasAdvancedFilters && (
            <TouchableOpacity
              style={styles.clearAllTextBtn}
              onPress={() => {
                lightTap();
                setDateRange('all_time');
                setSelectedCategories(new Set());
                setSelectedWalletId(null);
                setSearchQuery('');
                setTypeFilter('all');
              }}
              accessibilityRole="button"
              accessibilityLabel={t.transactionList.clearAllFilters.toLowerCase()}
            >
              <Text style={styles.clearAllTextBtnLabel}>
                {t.transactionList.clearAllFilters.toLowerCase()}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Select mode bottom bar */}
      {selectMode && (
        <View style={[styles.selectBottomBar, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <TouchableOpacity
            style={[styles.bulkDeleteBtn, selectedIds.size === 0 && { opacity: 0.4 }]}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={18} color={C.surface} />
            <Text style={styles.bulkDeleteText}>
              {selectedIds.size > 0
                ? (selectedIds.size > 1 ? t.transactionList.deleteItemsPlural : t.transactionList.deleteItems).replace('{n}', String(selectedIds.size))
                : t.transactionList.selectItemsToDelete}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Filter Modal ────────────────────────────────────────── */}
      {filterModalVisible && (
      <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFilterModalVisible(false)}>
          <View style={styles.filterModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>{t.transactionList.filter.toLowerCase()}</Text>
              <TouchableOpacity
                onPress={() => setFilterModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel={t.common.close.toLowerCase()}
                accessibilityRole="button"
              >
                <View style={styles.closeCircle}>
                  <Feather name="x" size={16} color={C.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: SPACING.lg }}>
              {/* Date range */}
              <Text style={styles.filterSectionLabel}>{t.transaction.date.toLowerCase()}</Text>
              <View style={styles.filterChipGrid}>
                {DATE_RANGES.map((d) => (
                  <TouchableOpacity
                    key={d.key}
                    style={[styles.filterOptionChip, tempDateRange === d.key && styles.filterOptionChipActive]}
                    onPress={() => { lightTap(); setTempDateRange(d.key); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterOptionText, tempDateRange === d.key && styles.filterOptionTextActive]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Categories */}
              <Text style={styles.filterSectionLabel}>{t.transaction.category.toLowerCase()}</Text>
              <View style={styles.filterChipGrid}>
                {filterCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.filterOptionChip, tempCategories.has(cat.id) && styles.filterOptionChipActive]}
                    onPress={() => { lightTap(); toggleTempCategory(cat.id); }}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={(cat.icon as keyof typeof Feather.glyphMap) || 'tag'}
                      size={14}
                      color={tempCategories.has(cat.id) ? C.surface : cat.color || C.textSecondary}
                    />
                    <Text style={[styles.filterOptionText, tempCategories.has(cat.id) && styles.filterOptionTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Wallet */}
              {wallets.length > 1 && (
                <>
                  <Text style={styles.filterSectionLabel}>{t.transaction.wallet.toLowerCase()}</Text>
                  <View style={styles.filterChipGrid}>
                    <TouchableOpacity
                      style={[styles.filterOptionChip, !tempWalletId && styles.filterOptionChipActive]}
                      onPress={() => { lightTap(); setTempWalletId(null); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.filterOptionText, !tempWalletId && styles.filterOptionTextActive]}>{t.transactionList.all.toLowerCase()}</Text>
                    </TouchableOpacity>
                    {wallets.map((w) => (
                      <TouchableOpacity
                        key={w.id}
                        style={[styles.filterOptionChip, tempWalletId === w.id && styles.filterOptionChipActive]}
                        onPress={() => { lightTap(); setTempWalletId(w.id); }}
                        activeOpacity={0.7}
                      >
                        <WalletLogo wallet={w} size={18} />
                        <Text style={[styles.filterOptionText, tempWalletId === w.id && styles.filterOptionTextActive]}>
                          {w.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Sort */}
              <Text style={styles.filterSectionLabel}>{t.transactionList.sort.toLowerCase()}</Text>
              <View style={styles.filterChipGrid}>
                {(['date', 'amount'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.filterOptionChip, tempSortBy === s && styles.filterOptionChipActive]}
                    onPress={() => {
                      lightTap();
                      if (tempSortBy === s) setTempSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
                      else { setTempSortBy(s); setTempSortOrder('desc'); }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterOptionText, tempSortBy === s && styles.filterOptionTextActive]}>
                      {s}
                    </Text>
                    {tempSortBy === s && (
                      <Feather name={tempSortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} color={C.surface} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Bottom actions */}
            <View style={styles.filterModalActions}>
              <TouchableOpacity style={styles.clearAllBtn} onPress={clearAllFilters} activeOpacity={0.7}>
                <Text style={styles.clearAllText}>{t.common.clear.toLowerCase()}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} activeOpacity={0.7}>
                <Text style={styles.applyText}>{t.common.confirm.toLowerCase()}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
        <ModalToastHost />
      </Modal>
      )}

      {/* ── Edit bottom-sheet (extracted) ─────────────────── */}
      <EditTransactionSheet
        visible={editModalVisible}
        transaction={editingTransaction}
        wallets={wallets}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        currency={currency}
        onRequestClose={() => { setEditModalVisible(false); setEditingTransaction(null); }}
        onSave={handleUpdateTransaction}
        onDelete={handleDeleteTransaction}
        editAmount={editAmount}
        setEditAmount={setEditAmount}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        editCategory={editCategory}
        setEditCategory={setEditCategory}
        editType={editType}
        onEditTypeChange={handleEditTypeChange}
        editTags={editTags}
        setEditTags={setEditTags}
        editWalletId={editWalletId}
        setEditWalletId={setEditWalletId}
        editDate={editDate}
        setEditDate={setEditDate}
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  // ── Header zone — quiet 1-line summary, no chrome ──────────
  headerZone: {
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: -0.1,
  },
  headerTitleAmount: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  headerTitlePeriod: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
  },

  // ── Search bar — quietened ───────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.textMuted, 0.06),
    marginHorizontal: SPACING['2xl'],
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    paddingVertical: SPACING.sm,
  },

  // ── Filter pills — separate pills, dark active, light inactive (reference-matched) ──
  filterPillsScroll: {
    marginTop: SPACING.md,
    flexGrow: 0,
  },
  filterPillsContent: {
    paddingHorizontal: SPACING['2xl'],
    gap: SPACING.sm,
    paddingRight: SPACING['2xl'] + SPACING.md, // extra right padding for scroll fade
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
  },
  filterPillActive: {
    backgroundColor: C.textPrimary,
  },
  filterPillAdvActive: {
    backgroundColor: withAlpha(C.accent, 0.10),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.20),
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.1,
  },
  filterPillTextActive: {
    color: C.surface,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── Active filter chips (lighter, less chunky) ───────────────
  activeFiltersRow: {
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.sm,
    gap: SPACING.xs,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.12),
  },
  activeFilterText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    letterSpacing: 0.1,
  },

  // ── List ─────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING['2xl'],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  // ── Empty state — typographic, no icon (avoids N6) ──────────
  emptyHeadline: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
    letterSpacing: -0.2,
  },
  emptySubline: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.size.sm * 1.6, // Mercury § 2 — generous body line-height
    paddingHorizontal: SPACING.lg,
  },
  clearAllTextBtn: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  clearAllTextBtnLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.1,
  },

  // ── Select mode — quieter pill chrome, no chunky borders ─
  selectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  selectHeaderTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  selectHeaderBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
  },
  selectHeaderBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    letterSpacing: 0.1,
  },
  selectBottomBar: {
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.md,
    backgroundColor: C.background,
    // Soft top shadow instead of hard hairline border (cleaner)
    shadowColor: C.textPrimary,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 4,
  },
  // Bulk delete — no red. Neutral fill, semibold white text. Per N8.
  bulkDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.textPrimary, // dark fill — confidence without red
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
  },
  bulkDeleteText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.surface,
    letterSpacing: 0.2,
  },

  // ── Modal shared — softer backdrop alpha ───────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.42),
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Modal close — quieter, smaller circle with subtle tint ─
  closeCircle: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Filter modal — pill cards inside, refined header, confident CTAs ─
  filterModalContent: {
    width: '90%',
    maxHeight: '82%',
    backgroundColor: C.surface,
    borderRadius: RADIUS['2xl'] ?? 24, // larger radius for the modal itself — pill-card feel
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    ...SHADOWS.lg,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  filterModalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
  },
  filterSectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    letterSpacing: 0.6,
    textTransform: 'lowercase',
  },
  filterChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  // Option chips inside the filter modal — match the reference's pill pattern.
  // Inactive: subtle tinted background. Active: dark fill (matches the All/Income/Expense pill on the screen).
  filterOptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
  },
  filterOptionChipActive: {
    backgroundColor: C.textPrimary,
  },
  filterOptionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  filterOptionTextActive: {
    color: C.surface,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  filterModalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
  },
  // Clear button — quieter text-button style, not a filled pill (visual hierarchy: clear < apply)
  clearAllBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.04),
  },
  clearAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  // Apply button — confident olive pill, the primary action.
  applyBtn: {
    flex: 1.4, // slightly bigger than clear — primary visual weight
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
  },
  applyText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.surface,
    letterSpacing: 0.2,
  },

});

export default TransactionsList;
