import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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
import { format, isSameDay, parseISO } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import TransactionItem from '../../components/common/TransactionItem';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import { Transaction } from '../../types';
import { useWalletStore } from '../../store/walletStore';
import { useSellerStore } from '../../store/sellerStore';
import { useBusinessStore } from '../../store/businessStore';
import { useDebtStore } from '../../store/debtStore';
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
  const unmarkOrdersTransferred = useSellerStore((s) => s.unmarkOrdersTransferred);
  const updateIngredientCost = useSellerStore((s) => s.updateIngredientCost);
  const deleteTransfer = useBusinessStore((s) => s.deleteTransfer);
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
        title: format(parseISO(dateKey), 'EEEE, MMM d, yyyy'),
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

    // H-4 fix: use net-difference for same-wallet edits to avoid double adjustment on type flip
    const currentWallets = useWalletStore.getState().wallets;
    const oldWalletExists = oldWalletId ? currentWallets.some(w => w.id === oldWalletId) : false;
    const newWalletExists = editWalletId ? currentWallets.some(w => w.id === editWalletId) : false;

    if (oldWalletId === editWalletId && oldWalletId && oldWalletExists) {
      // Same wallet: calculate net change
      const oldEffect = oldType === 'expense' ? -oldAmount : oldAmount;
      const newEffect = editType === 'expense' ? -newAmount : newAmount;
      const diff = newEffect - oldEffect;
      if (diff > 0) addToWallet(oldWalletId, diff);
      else if (diff < 0) deductFromWallet(oldWalletId, Math.abs(diff));
    } else {
      // Different wallets: reverse old, apply new
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

    // Sync amount change back to linked debt payment (no double wallet adjustment)
    if (newAmount !== oldAmount) {
      const { linkedDebtId, linkedPaymentId } = editingTransaction;
      if (linkedDebtId && linkedPaymentId) {
        useDebtStore.getState().updatePayment(linkedDebtId, linkedPaymentId, { amount: newAmount });
      } else {
        // Fallback: search debts for a payment linked to this transaction
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
  };

  const handleDeleteTransaction = () => {
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
      // Also delete the linked debt payment (wallet already reversed above)
      if (linkedDebtId && linkedPaymentId) {
        useDebtStore.getState().deletePayment(linkedDebtId, linkedPaymentId);
      }
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
        <Feather name="search" size={18} color={CALM.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search transactions..."
          placeholderTextColor={CALM.textSecondary}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x-circle" size={18} color={CALM.textSecondary} />
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
                color={CALM.accent}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Totals Bar */}
      <View style={styles.totalsBar}>
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>Income</Text>
          <Text style={[styles.totalValue, { color: CALM.positive }]}>
            {currency} {totals.income.toFixed(2)}
          </Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>Expenses</Text>
          <Text style={[styles.totalValue, { color: CALM.textPrimary }]}>
            {currency} {totals.expenses.toFixed(2)}
          </Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalLabel}>Net</Text>
          <Text
            style={[
              styles.totalValue,
              { color: totals.net >= 0 ? CALM.positive : CALM.neutral },
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
        animationType="fade"
        transparent
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

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.editLabel}>Type</Text>
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
                      size={20}
                      color={editType === 'expense' ? '#FFFFFF' : CALM.accent}
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
                    onPress={() => !editingTransaction?.linkedDebtId && handleEditTypeChange('income')}
                    activeOpacity={editingTransaction?.linkedDebtId ? 1 : 0.7}
                  >
                    <Feather
                      name="arrow-up-circle"
                      size={20}
                      color={editType === 'income' ? '#FFFFFF' : CALM.positive}
                    />
                    <Text style={[styles.typeText, editType === 'income' && styles.typeTextActive]}>
                      Income
                    </Text>
                  </TouchableOpacity>
                </View>
                {editingTransaction?.linkedDebtId && (
                  <View style={styles.typeLockedCaption}>
                    <Feather name="lock" size={10} color={CALM.neutral} />
                    <Text style={styles.typeLockedCaptionText}>locked · determined by debt direction</Text>
                  </View>
                )}

                <Text style={styles.editLabel}>Amount</Text>
                <TextInput
                  style={styles.editInput}
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

                <Text style={styles.editLabel}>Description</Text>
                <TextInput
                  style={styles.editInput}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="What was this for?"
                  placeholderTextColor={CALM.textSecondary}
                />

                <Text style={styles.editLabel}>Tags (optional)</Text>
                <TextInput
                  style={styles.editInput}
                  value={editTags}
                  onChangeText={setEditTags}
                  placeholder="personal, family, work"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                {editingTransaction?.linkedDebtId && (
                  <View style={styles.linkedNotice}>
                    <Feather name="link" size={12} color={CALM.bronze} />
                    <Text style={styles.linkedNoticeText}>Amount syncs to the linked debt payment</Text>
                  </View>
                )}

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    marginHorizontal: SPACING['2xl'],
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    paddingVertical: SPACING.md,
  },
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
    borderWidth: 1,
    borderColor: CALM.border,
    minHeight: 44,
  },
  filterChipActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  summaryPill: {
    marginLeft: 'auto',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.accent, 0.1),
  },
  summaryText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  totalsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING['2xl'],
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
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
    color: CALM.textSecondary,
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
    backgroundColor: CALM.border,
  },
  sectionHeader: {
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.sm,
    backgroundColor: CALM.background,
  },
  sectionHeaderText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  listContent: {
    paddingBottom: SPACING.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },

  // Sort
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  sortLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    minHeight: 44,
  },
  sortChipActive: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
    borderColor: CALM.accent,
  },
  sortChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  sortChipTextActive: {
    color: CALM.accent,
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
  editLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  editInput: {
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
    color: '#FFFFFF',
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
  typeLockedCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginBottom: SPACING.sm,
  },
  typeLockedCaptionText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
  },
  linkedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    marginTop: SPACING.md,
  },
  linkedNoticeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
    flex: 1,
  },
});

export default TransactionsList;
