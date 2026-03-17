import React, { useCallback, useMemo, useState } from 'react';
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
  ScrollView,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, isValid, startOfMonth, endOfMonth, subMonths, isWithinInterval, startOfYear } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import TransactionItem from '../../components/common/TransactionItem';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
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

type FilterType = 'all' | 'expense' | 'income';
type DateRange = 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'all_time';
type SortBy = 'date' | 'amount';
type SortOrder = 'asc' | 'desc';

const TYPE_FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'expense', label: 'expenses' },
  { key: 'income', label: 'income' },
];

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'this_month', label: 'this month' },
  { key: 'last_month', label: 'last month' },
  { key: 'last_3_months', label: 'last 3 months' },
  { key: 'this_year', label: 'this year' },
  { key: 'all_time', label: 'all time' },
];

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
  const insets = useSafeAreaInsets();
  const { transactions, updateTransaction, deleteTransaction } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
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
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
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

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query) ||
          (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(query)))
      );
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

    return result;
  }, [transactions, typeFilter, dateRange, selectedCategories, selectedWalletId, searchQuery, sortBy, sortOrder]);

  // ── Sections ─────────────────────────────────────────────────
  const sections = useMemo(() => {
    if (sortBy === 'amount') {
      // Flat list when sorting by amount (no date grouping)
      return [{
        title: `sorted by amount · ${sortOrder === 'desc' ? 'highest first' : 'lowest first'}`,
        titleDate: null as Date | null,
        data: filteredTransactions,
        dailyNet: 0,
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
          title = 'unknown date';
        } else {
          try {
            titleDate = new Date(dateKey + 'T00:00:00');
            title = isValid(titleDate) ? format(titleDate, 'EEEE, MMM d').toLowerCase() : 'unknown date';
          } catch {
            title = 'unknown date';
          }
        }
        return { title, titleDate, data, dailyNet };
      });
  }, [filteredTransactions, sortBy, sortOrder]);

  // ── Totals ───────────────────────────────────────────────────
  const totals = useMemo(() => {
    let income = 0, expenses = 0;
    for (const t of filteredTransactions) {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expenses += t.amount;
    }
    return { income, expenses, net: income - expenses };
  }, [filteredTransactions]);

  const editCategories = useMemo(() => editType === 'expense' ? expenseCategories : incomeCategories, [editType, expenseCategories, incomeCategories]);

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
    Alert.alert(
      `Delete ${selectedIds.size} transaction${selectedIds.size > 1 ? 's' : ''}?`,
      'This cannot be undone. Wallet balances will be adjusted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const currentWallets = useWalletStore.getState().wallets;
            for (const id of selectedIds) {
              const txn = transactions.find((t) => t.id === id);
              if (!txn) continue;
              // Reverse wallet
              if (txn.walletId && currentWallets.some((w) => w.id === txn.walletId)) {
                if (txn.type === 'expense') addToWallet(txn.walletId, txn.amount);
                else deductFromWallet(txn.walletId, txn.amount);
              }
              // Transfer handling
              if (txn.id.startsWith('transfer-')) {
                const transferId = txn.id.replace('transfer-', '');
                unmarkOrdersTransferred(transferId);
                deleteTransfer(transferId);
              }
              // Debt payment cleanup
              if (txn.linkedDebtId && txn.linkedPaymentId) {
                useDebtStore.getState().deletePayment(txn.linkedDebtId, txn.linkedPaymentId);
              }
              // Seller cost cleanup
              const linkedCost = useSellerStore.getState().ingredientCosts.find(
                (c) => c.personalTransactionId === txn.id
              );
              if (linkedCost) useSellerStore.getState().deleteIngredientCost(linkedCost.id);
              usePlaybookStore.getState().unlinkAllFromTransaction(id);
              deleteTransaction(id);
            }
            showToast(`${selectedIds.size} transaction${selectedIds.size > 1 ? 's' : ''} deleted`, 'success');
            exitSelectMode();
          },
        },
      ]
    );
  }, [selectedIds, transactions, addToWallet, deductFromWallet, unmarkOrdersTransferred, deleteTransfer, deleteTransaction, exitSelectMode, showToast]);

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
    setEditModalVisible(true);
  }, [selectMode, toggleSelect]);

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

    const currentWallets = useWalletStore.getState().wallets;
    const oldWalletExists = oldWalletId ? currentWallets.some(w => w.id === oldWalletId) : false;
    const newWalletExists = editWalletId ? currentWallets.some(w => w.id === editWalletId) : false;

    if (oldWalletId === editWalletId && oldWalletId && oldWalletExists) {
      const oldEffect = oldType === 'expense' ? -oldAmount : oldAmount;
      const newEffect = editType === 'expense' ? -newAmount : newAmount;
      const diff = newEffect - oldEffect;
      if (diff > 0) addToWallet(oldWalletId, diff);
      else if (diff < 0) deductFromWallet(oldWalletId, Math.abs(diff));
    } else {
      if (oldWalletId && oldWalletExists) {
        if (oldType === 'expense') addToWallet(oldWalletId, oldAmount);
        else deductFromWallet(oldWalletId, oldAmount);
      }
      if (editWalletId && newWalletExists) {
        if (editType === 'expense') deductFromWallet(editWalletId, newAmount);
        else addToWallet(editWalletId, newAmount);
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
      const desc = editDescription.trim();
      updateIngredientCost(linkedCost.id, {
        description: desc.startsWith('seller: ') ? desc.replace('seller: ', '') : desc,
        amount: newAmount,
      });
    }

    setEditModalVisible(false);
    setEditingTransaction(null);
    showToast('transaction updated.', 'success');
  }, [editingTransaction, editAmount, editDescription, editCategory, editType, editTags, editWalletId, updateTransaction, addToWallet, deductFromWallet, updateIngredientCost, showToast]);

  const handleDeleteTransaction = useCallback(() => {
    if (!editingTransaction) return;

    const isTransferLinked = editingTransaction.id.startsWith('transfer-');
    const transferId = isTransferLinked ? editingTransaction.id.replace('transfer-', '') : null;
    const { linkedDebtId, linkedPaymentId } = editingTransaction;

    const doDelete = () => {
      if (editingTransaction.walletId) {
        const deleteWallets = useWalletStore.getState().wallets;
        if (deleteWallets.some(w => w.id === editingTransaction.walletId)) {
          if (editingTransaction.type === 'expense') {
            addToWallet(editingTransaction.walletId, editingTransaction.amount);
          } else {
            deductFromWallet(editingTransaction.walletId, editingTransaction.amount);
          }
        }
      }
      if (isTransferLinked && transferId) {
        unmarkOrdersTransferred(transferId);
        deleteTransfer(transferId);
      }
      if (linkedDebtId && linkedPaymentId) {
        useDebtStore.getState().deletePayment(linkedDebtId, linkedPaymentId);
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
      showToast('Transaction deleted', 'success');
    };

    if (linkedDebtId) {
      Alert.alert(
        'Delete Transaction?',
        'This will also remove the linked debt payment record.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete Both', style: 'destructive', onPress: doDelete },
        ]
      );
      return;
    }

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
  }, [editingTransaction, addToWallet, deductFromWallet, unmarkOrdersTransferred, deleteTransfer, deleteTransaction, showToast]);

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
      isSelected={selectedIds.has(item.id)}
      selectMode={selectMode}
      isFirst={index === 0}
      isLast={index === section.data.length - 1}
    />
  ), [currency, categoryMap, walletMap, handleItemPress, handleItemLongPress, selectMode, selectedIds]);

  const renderSectionHeader = useCallback(({ section }: { section: { title: string; dailyNet: number } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
      {section.dailyNet !== 0 && sortBy === 'date' && (
        <Text style={[styles.sectionHeaderNet, section.dailyNet > 0 && { color: CALM.accent }]}>
          {section.dailyNet > 0 ? '+' : ''}{currency} {section.dailyNet.toFixed(0)}
        </Text>
      )}
    </View>
  ), [currency, sortBy]);

  // ── Categories for filter modal ──────────────────────────────
  const filterCategories = useMemo(() => {
    const cats = typeFilter === 'income' ? incomeCategories : typeFilter === 'expense' ? expenseCategories : allCategories;
    // Deduplicate by id
    const seen = new Set<string>();
    return cats.filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
  }, [typeFilter, expenseCategories, incomeCategories, allCategories]);

  return (
    <View style={styles.container}>
      {/* Select mode header */}
      {selectMode ? (
        <View style={styles.selectHeader}>
          <TouchableOpacity onPress={exitSelectMode} style={styles.selectHeaderBtn}>
            <Text style={styles.selectHeaderBtnText}>done</Text>
          </TouchableOpacity>
          <Text style={styles.selectHeaderTitle}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={selectAll} style={styles.selectHeaderBtn}>
            <Text style={styles.selectHeaderBtnText}>select all</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Feather name="search" size={18} color={CALM.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="search transactions..."
              placeholderTextColor={CALM.textMuted}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x-circle" size={16} color={CALM.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Row */}
          <View style={styles.filterRow}>
            {TYPE_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, typeFilter === f.key && styles.filterChipActive]}
                onPress={() => { lightTap(); setTypeFilter(f.key); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, typeFilter === f.key && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Filter button */}
            <TouchableOpacity style={styles.filterButton} onPress={openFilterModal} activeOpacity={0.7}>
              <Feather name="sliders" size={16} color={hasAdvancedFilters ? CALM.accent : CALM.textMuted} />
              {hasAdvancedFilters && <View style={styles.filterDot} />}
            </TouchableOpacity>

            {/* Item count */}
            <View style={styles.summaryPill}>
              <Text style={styles.summaryText}>{filteredTransactions.length}</Text>
            </View>
          </View>

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
                  <Feather name="x" size={12} color={CALM.accent} />
                </TouchableOpacity>
              )}
              {selectedCategories.size > 0 && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => { lightTap(); setSelectedCategories(new Set()); }}
                >
                  <Text style={styles.activeFilterText}>
                    {selectedCategories.size} categor{selectedCategories.size === 1 ? 'y' : 'ies'}
                  </Text>
                  <Feather name="x" size={12} color={CALM.accent} />
                </TouchableOpacity>
              )}
              {selectedWalletId && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => { lightTap(); setSelectedWalletId(null); }}
                >
                  <Text style={styles.activeFilterText}>
                    {wallets.find((w) => w.id === selectedWalletId)?.name || 'wallet'}
                  </Text>
                  <Feather name="x" size={12} color={CALM.accent} />
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </>
      )}

      {/* Totals Bar */}
      <View style={styles.totalsBar}>
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>came in</Text>
          <Text style={[styles.totalValue, { color: CALM.accent }]}>
            +{currency} {totals.income.toFixed(0)}
          </Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>went out</Text>
          <Text style={[styles.totalValue, { color: CALM.textPrimary }]}>
            -{currency} {totals.expenses.toFixed(0)}
          </Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>net</Text>
          <Text
            style={[
              styles.totalValue,
              { color: totals.net >= 0 ? CALM.accent : CALM.neutral },
            ]}
          >
            {totals.net >= 0 ? '+' : ''}{currency} {totals.net.toFixed(0)}
          </Text>
        </View>
      </View>

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
        />
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="inbox"
            title={searchQuery || hasAdvancedFilters ? 'no matches' : 'no transactions'}
            message={
              searchQuery
                ? `nothing matching "${searchQuery}"`
                : hasAdvancedFilters
                ? 'try adjusting your filters'
                : 'your transactions will appear here'
            }
          />
          {hasAdvancedFilters && (
            <TouchableOpacity
              style={styles.clearFiltersBtn}
              onPress={() => {
                lightTap();
                setDateRange('all_time');
                setSelectedCategories(new Set());
                setSelectedWalletId(null);
                setSearchQuery('');
                setTypeFilter('all');
              }}
            >
              <Text style={styles.clearFiltersBtnText}>clear all filters</Text>
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
            <Feather name="trash-2" size={18} color="#fff" />
            <Text style={styles.bulkDeleteText}>
              {selectedIds.size > 0
                ? `delete ${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''}`
                : 'select items to delete'}
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
              <Text style={styles.filterModalTitle}>filters</Text>
              <TouchableOpacity
                onPress={() => setFilterModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <View style={styles.closeCircle}>
                  <Feather name="x" size={16} color={CALM.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
              {/* Date range */}
              <Text style={styles.filterSectionLabel}>date range</Text>
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
              <Text style={styles.filterSectionLabel}>category</Text>
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
                      color={tempCategories.has(cat.id) ? '#fff' : cat.color || CALM.textSecondary}
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
                  <Text style={styles.filterSectionLabel}>wallet</Text>
                  <View style={styles.filterChipGrid}>
                    <TouchableOpacity
                      style={[styles.filterOptionChip, !tempWalletId && styles.filterOptionChipActive]}
                      onPress={() => { lightTap(); setTempWalletId(null); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.filterOptionText, !tempWalletId && styles.filterOptionTextActive]}>all</Text>
                    </TouchableOpacity>
                    {wallets.map((w) => (
                      <TouchableOpacity
                        key={w.id}
                        style={[styles.filterOptionChip, tempWalletId === w.id && styles.filterOptionChipActive]}
                        onPress={() => { lightTap(); setTempWalletId(w.id); }}
                        activeOpacity={0.7}
                      >
                        <Feather
                          name={(w.icon as keyof typeof Feather.glyphMap) || 'credit-card'}
                          size={14}
                          color={tempWalletId === w.id ? '#fff' : w.color || CALM.textSecondary}
                        />
                        <Text style={[styles.filterOptionText, tempWalletId === w.id && styles.filterOptionTextActive]}>
                          {w.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Sort */}
              <Text style={styles.filterSectionLabel}>sort by</Text>
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
                      <Feather name={tempSortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Bottom actions */}
            <View style={styles.filterModalActions}>
              <TouchableOpacity style={styles.clearAllBtn} onPress={clearAllFilters} activeOpacity={0.7}>
                <Text style={styles.clearAllText}>clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} activeOpacity={0.7}>
                <Text style={styles.applyText}>apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
      )}

      {/* ── Edit Modal (centered floating card) ─────────────────── */}
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
        <Pressable style={styles.editModalOverlay} onPress={() => { Keyboard.dismiss(); setEditModalVisible(false); setEditingTransaction(null); }}>
          <View style={styles.editModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>edit transaction</Text>
              <TouchableOpacity onPress={() => {
                setEditModalVisible(false);
                setEditingTransaction(null);
              }}>
                <View style={styles.closeCircle}>
                  <Feather name="x" size={16} color={CALM.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
              <Text style={styles.editLabel}>type</Text>
              <View style={[styles.typeContainer, editingTransaction?.linkedDebtId ? { opacity: 0.6 } : undefined]}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    editType === 'expense' && [styles.typeButtonActive, { backgroundColor: CALM.accent }],
                    { borderColor: CALM.accent },
                  ]}
                  onPress={() => !editingTransaction?.linkedDebtId && handleEditTypeChange('expense')}
                  activeOpacity={editingTransaction?.linkedDebtId ? 1 : 0.7}
                >
                  <Feather
                    name="arrow-down-circle"
                    size={18}
                    color={editType === 'expense' ? '#FFFFFF' : CALM.accent}
                  />
                  <Text style={[styles.typeText, editType === 'expense' && styles.typeTextActive]}>
                    expense
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    editType === 'income' && [styles.typeButtonActive, { backgroundColor: CALM.accent }],
                    { borderColor: CALM.accent },
                  ]}
                  onPress={() => !editingTransaction?.linkedDebtId && handleEditTypeChange('income')}
                  activeOpacity={editingTransaction?.linkedDebtId ? 1 : 0.7}
                >
                  <Feather
                    name="arrow-up-circle"
                    size={18}
                    color={editType === 'income' ? '#FFFFFF' : CALM.accent}
                  />
                  <Text style={[styles.typeText, editType === 'income' && styles.typeTextActive]}>
                    income
                  </Text>
                </TouchableOpacity>
              </View>
              {editingTransaction?.linkedDebtId && (
                <View style={styles.typeLockedCaption}>
                  <Feather name="lock" size={10} color={CALM.textMuted} />
                  <Text style={styles.typeLockedCaptionText}>locked · determined by debt direction</Text>
                </View>
              )}

              <Text style={styles.editLabel}>amount</Text>
              <TextInput
                style={styles.editInput}
                value={editAmount}
                onChangeText={setEditAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <CategoryPicker
                categories={editCategories}
                selectedId={editCategory}
                onSelect={setEditCategory}
                label="category"
                layout="dropdown"
              />

              <WalletPicker
                wallets={wallets}
                selectedId={editWalletId}
                onSelect={setEditWalletId}
                label="wallet"
              />

              <Text style={styles.editLabel}>description</Text>
              <TextInput
                style={styles.editInput}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="what was this for?"
                placeholderTextColor={CALM.textMuted}
              />

              <Text style={styles.editLabel}>tags (optional)</Text>
              <TextInput
                style={styles.editInput}
                value={editTags}
                onChangeText={setEditTags}
                placeholder="personal, family, work"
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {editingTransaction?.linkedDebtId && (
                <View style={styles.linkedNotice}>
                  <Feather name="link" size={12} color={CALM.bronze} />
                  <Text style={styles.linkedNoticeText}>amount syncs to the linked debt payment</Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <Button
                  title="delete"
                  onPress={handleDeleteTransaction}
                  variant="danger"
                  icon="trash-2"
                  style={styles.deleteButton}
                />
                <Button
                  title="update"
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },

  // ── Search ───────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    marginHorizontal: SPACING['2xl'],
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    paddingVertical: 12,
  },

  // ── Filter row ───────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.surface,
  },
  filterChipActive: {
    backgroundColor: CALM.accent,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CALM.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: CALM.accent,
  },
  summaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.accent, 0.08),
  },
  summaryText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
    fontVariant: ['tabular-nums'],
  },

  // ── Active filter chips ──────────────────────────────────────
  activeFiltersRow: {
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.accent, 0.08),
  },
  activeFilterText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.accent,
  },

  // ── Totals bar ───────────────────────────────────────────────
  totalsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING['2xl'],
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  totalItem: {
    flex: 1,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    marginBottom: 2,
  },
  totalValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  totalDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: CALM.border,
  },

  // ── Section headers ──────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    backgroundColor: CALM.background,
  },
  sectionHeaderText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  sectionHeaderNet: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
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
  clearFiltersBtn: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.accent, 0.08),
  },
  clearFiltersBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.accent,
  },

  // ── Select mode ──────────────────────────────────────────────
  selectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.md,
  },
  selectHeaderTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  selectHeaderBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.accent, 0.08),
  },
  selectHeaderBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.accent,
  },
  selectBottomBar: {
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.md,
    backgroundColor: CALM.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  bulkDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: '#C1694F',
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
  },
  bulkDeleteText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // ── Modal shared ─────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(CALM.textPrimary, 0.5),
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Filter modal ─────────────────────────────────────────────
  filterModalContent: {
    width: '88%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    padding: SPACING['2xl'],
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  filterModalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  filterSectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  filterChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  filterOptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.background,
  },
  filterOptionChipActive: {
    backgroundColor: CALM.accent,
  },
  filterOptionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  filterOptionTextActive: {
    color: '#fff',
  },
  filterModalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
    paddingTop: SPACING.lg,
  },
  clearAllBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: CALM.background,
  },
  clearAllText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  applyBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: CALM.accent,
  },
  applyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // ── Edit modal ───────────────────────────────────────────────
  editModalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(CALM.textPrimary, 0.5),
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalContent: {
    width: '90%',
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    padding: SPACING['2xl'],
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  editModalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  editLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    marginBottom: 4,
    marginTop: SPACING.sm,
  },
  editInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    backgroundColor: CALM.background,
    gap: SPACING.sm,
  },
  typeButtonActive: {},
  typeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  typeTextActive: {
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  deleteButton: {
    flex: 1,
    borderColor: CALM.neutral,
  },
  typeLockedCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginBottom: SPACING.sm,
  },
  typeLockedCaptionText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  linkedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    marginTop: SPACING.sm,
  },
  linkedNoticeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
    flex: 1,
  },
});

export default TransactionsList;
