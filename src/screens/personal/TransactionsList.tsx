import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  SectionList,
  Modal,
  Alert,
  ScrollView,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import TransactionItem from '../../components/common/TransactionItem';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import { Transaction } from '../../types';
import { useWalletStore } from '../../store/walletStore';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';

type FilterType = 'all' | 'expense' | 'income';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
];

const TransactionsList: React.FC = () => {
  const { transactions, updateTransaction, deleteTransaction } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const { showToast } = useToast();
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Transaction edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editType, setEditType] = useState<'expense' | 'income'>('expense');
  const [editTags, setEditTags] = useState('');
  const [editWalletId, setEditWalletId] = useState<string | null>(null);

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (filter !== 'all') {
      result = result.filter((t) => t.type === filter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query) ||
          (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(query)))
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'amount') {
        cmp = a.amount - b.amount;
      } else {
        cmp = a.date.getTime() - b.date.getTime();
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [transactions, filter, searchQuery, sortBy, sortOrder]);

  const sections = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};

    filteredTransactions.forEach((t) => {
      const dateKey = format(t.date, 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(t);
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, data]) => ({
        title: format(new Date(dateKey), 'EEEE, MMM d, yyyy'),
        data,
      }));
  }, [filteredTransactions]);

  const totals = useMemo(() => {
    const income = filteredTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = filteredTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    return { income, expenses, net: income - expenses };
  }, [filteredTransactions]);

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

    if (oldWalletId) {
      if (oldType === 'expense') {
        addToWallet(oldWalletId, oldAmount);
      } else {
        deductFromWallet(oldWalletId, oldAmount);
      }
    }

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

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search transactions..."
          placeholderTextColor={COLORS.textSecondary}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x-circle" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              filter === f.key && styles.filterChipActive,
            ]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f.key && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Summary */}
        <View style={styles.summaryPill}>
          <Text style={styles.summaryText}>
            {filteredTransactions.length} items
          </Text>
        </View>
      </View>

      {/* Sort Chips */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {(['date', 'amount'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.sortChip, sortBy === s && styles.sortChipActive]}
            onPress={() => {
              lightTap();
              if (sortBy === s) {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              } else {
                setSortBy(s);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortChipText, sortBy === s && styles.sortChipTextActive]}>
              {s === 'date' ? 'Date' : 'Amount'}
            </Text>
            {sortBy === s && (
              <Feather
                name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={12}
                color={COLORS.personal}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Totals Bar */}
      <View style={styles.totalsBar}>
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>Income</Text>
          <Text style={[styles.totalValue, { color: COLORS.income }]}>
            {currency} {totals.income.toFixed(2)}
          </Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>Expenses</Text>
          <Text style={[styles.totalValue, { color: COLORS.expense }]}>
            {currency} {totals.expenses.toFixed(2)}
          </Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>Net</Text>
          <Text
            style={[
              styles.totalValue,
              { color: totals.net >= 0 ? COLORS.success : COLORS.danger },
            ]}
          >
            {currency} {totals.net.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Transaction List */}
      {sections.length > 0 ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionItem
              transaction={item}
              onPress={() => handleEditTransaction(item)}
            />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="inbox"
            title={searchQuery ? 'No Results' : 'No Transactions'}
            message={
              searchQuery
                ? `No transactions matching "${searchQuery}"`
                : 'Your transactions will appear here'
            }
          />
        </View>
      )}

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
                  <Feather name="x" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.editLabel}>Type</Text>
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
                      color={editType === 'expense' ? COLORS.background : COLORS.expense}
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
                      color={editType === 'income' ? COLORS.background : COLORS.success}
                    />
                    <Text style={[styles.typeText, editType === 'income' && styles.typeTextActive]}>
                      Income
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.editLabel}>Amount</Text>
                <TextInput
                  style={styles.editInput}
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

                <Text style={styles.editLabel}>Description</Text>
                <TextInput
                  style={styles.editInput}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="What was this for?"
                  placeholderTextColor={COLORS.textSecondary}
                />

                <Text style={styles.editLabel}>Tags (optional)</Text>
                <TextInput
                  style={styles.editInput}
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
    backgroundColor: COLORS.surface,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.personal,
    borderColor: COLORS.personal,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  summaryPill: {
    marginLeft: 'auto',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(COLORS.personal, 0.1),
  },
  summaryText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.personal,
  },
  totalsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
  },
  totalItem: {
    flex: 1,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  totalValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  totalDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },
  sectionHeader: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  sectionHeaderText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.textSecondary,
  },
  listContent: {
    paddingBottom: SPACING.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },

  // Sort
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  sortLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.textSecondary,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortChipActive: {
    backgroundColor: withAlpha(COLORS.personal, 0.1),
    borderColor: COLORS.personal,
  },
  sortChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.textSecondary,
  },
  sortChipTextActive: {
    color: COLORS.personal,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
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
    color: COLORS.text,
  },
  editLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  editInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
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
    backgroundColor: COLORS.surface,
    gap: SPACING.sm,
  },
  typeButtonActive: {},
  typeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  typeTextActive: {
    color: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },
  deleteButton: {
    flex: 1,
    borderColor: COLORS.danger,
  },
});

export default TransactionsList;
