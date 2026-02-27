import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  TouchableOpacity,
  Switch,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, addWeeks, addMonths, addYears } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, CALM, SPACING, TYPOGRAPHY, RADIUS, BILLING_CYCLES, withAlpha } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import ProgressBar from '../../components/common/ProgressBar';
import CategoryPicker from '../../components/common/CategoryPicker';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';

const SubscriptionList: React.FC = () => {
  const { showToast } = useToast();
  const { subscriptions, addSubscription, updateSubscription, deleteSubscription } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const expenseCategories = useCategories('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(expenseCategories[0]?.id || 'food');
  const [billingCycle, setBillingCycle] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [reminderDays, setReminderDays] = useState('3');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'amount' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const filteredSortedSubs = useMemo(() => {
    let result = [...subscriptions];

    if (filterStatus === 'active') result = result.filter((s) => s.isActive);
    if (filterStatus === 'inactive') result = result.filter((s) => !s.isActive);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'amount') cmp = a.amount - b.amount;
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else cmp = a.nextBillingDate.getTime() - b.nextBillingDate.getTime();
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [subscriptions, filterStatus, searchQuery, sortBy, sortOrder]);

  const handleEdit = (id: string) => {
    const subscription = subscriptions.find((s) => s.id === id);
    if (!subscription) return;
    setEditingId(id);
    setName(subscription.name);
    setAmount(subscription.amount.toString());
    setCategory(subscription.category);
    setBillingCycle(subscription.billingCycle);
    setReminderDays(subscription.reminderDays.toString());
    setStartDate(format(subscription.startDate, 'yyyy-MM-dd'));
    setIsInstallment(subscription.isInstallment || false);
    setTotalInstallments(subscription.totalInstallments?.toString() || '');
    setModalVisible(true);
  };

  const handleAdd = () => {
    if (!name.trim()) {
      showToast('Please enter subscription name', 'error');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const parsedStartDate = new Date(startDate);
    const validStartDate = isNaN(parsedStartDate.getTime()) ? new Date() : parsedStartDate;

    if (editingId) {
      const existing = subscriptions.find((s) => s.id === editingId);
      // Recalculate nextBillingDate if start date or billing cycle changed
      const startDateChanged = existing && validStartDate.getTime() !== existing.startDate.getTime();
      const cycleChanged = existing && billingCycle !== existing.billingCycle;
      let nextBillingDate = existing?.nextBillingDate || new Date();
      if (startDateChanged || cycleChanged) {
        const now = new Date();
        if (validStartDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          nextBillingDate = validStartDate;
        } else {
          let next = validStartDate;
          while (next < now) {
            switch (billingCycle) {
              case 'weekly': next = addWeeks(next, 1); break;
              case 'yearly': next = addYears(next, 1); break;
              default: next = addMonths(next, 1); break;
            }
          }
          nextBillingDate = next;
        }
      }
      updateSubscription(editingId, {
        name: name.trim(),
        amount: parseFloat(amount),
        category,
        billingCycle,
        reminderDays: parseInt(reminderDays) || 3,
        startDate: validStartDate,
        isInstallment,
        ...(isInstallment && {
          totalInstallments: parseInt(totalInstallments) || 1,
        }),
        ...(!isInstallment && {
          totalInstallments: undefined,
          completedInstallments: undefined,
        }),
        nextBillingDate,
      });
      showToast('Subscription updated successfully!', 'success');
    } else {
      const nextBilling = (() => {
        const now = new Date();
        // If start date is today or in the future, first billing is on start date
        if (validStartDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          return validStartDate;
        }
        // If start date is in the past, roll forward until next billing is in the future
        let next = validStartDate;
        while (next < now) {
          switch (billingCycle) {
            case 'weekly': next = addWeeks(next, 1); break;
            case 'yearly': next = addYears(next, 1); break;
            default: next = addMonths(next, 1); break;
          }
        }
        return next;
      })();
      addSubscription({
        name: name.trim(),
        amount: parseFloat(amount),
        category,
        billingCycle,
        startDate: validStartDate,
        nextBillingDate: nextBilling,
        isActive: true,
        reminderDays: parseInt(reminderDays) || 3,
        isInstallment,
        ...(isInstallment && {
          totalInstallments: parseInt(totalInstallments) || 1,
          completedInstallments: 0,
        }),
      });
      showToast('Subscription added successfully!', 'success');
    }

    setModalVisible(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setAmount('');
    setCategory(expenseCategories[0].id);
    setBillingCycle('monthly');
    setReminderDays('3');
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setIsInstallment(false);
    setTotalInstallments('');
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Subscription',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSubscription(id),
        },
      ]
    );
  };

  const totalMonthly = subscriptions
    .filter((sub) => sub.isActive)
    .reduce((sum, sub) => {
      const monthlyAmount = (() => {
        switch (sub.billingCycle) {
          case 'weekly':
            return sub.amount * 4;
          case 'yearly':
            return sub.amount / 12;
          default:
            return sub.amount;
        }
      })();
      return sum + monthlyAmount;
    }, 0);

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {subscriptions.length > 0 && (
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Monthly Total</Text>
            <Text style={styles.summaryAmount}>{currency} {totalMonthly.toFixed(2)}</Text>
            <Text style={styles.summarySubtext}>
              {subscriptions.filter((s) => s.isActive).length} active commitments
            </Text>
          </Card>
        )}

        {/* Search bar */}
        {subscriptions.length > 0 && (
          <View style={styles.searchContainer}>
            <Feather name="search" size={18} color={CALM.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search commitments..."
              placeholderTextColor={CALM.textSecondary}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={18} color={CALM.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Filter + Sort */}
        {subscriptions.length > 0 && (
          <View style={styles.filterSortRow}>
            <View style={styles.filterRow}>
              {(['all', 'active', 'inactive'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filterStatus === f && styles.filterChipActive]}
                  onPress={() => setFilterStatus(f)}
                >
                  <Text style={[styles.filterChipText, filterStatus === f && styles.filterChipTextActive]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.sortRow}>
              {(['date', 'amount', 'name'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sortChip, sortBy === s && styles.sortChipActive]}
                  onPress={() => {
                    if (sortBy === s) {
                      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortBy(s);
                      setSortOrder('asc');
                    }
                  }}
                >
                  <Text style={[styles.sortChipText, sortBy === s && styles.sortChipTextActive]}>
                    {s === 'date' ? 'Date' : s === 'amount' ? 'Amount' : 'Name'}
                  </Text>
                  {sortBy === s && (
                    <Feather name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {filteredSortedSubs.length > 0 ? (
          filteredSortedSubs.map((subscription) => {
            const category = expenseCategories.find((cat) => cat.id === subscription.category);
            const daysUntil = Math.ceil(
              (subscription.nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );

            return (
              <Card key={subscription.id} style={styles.subscriptionCard}>
                <View style={styles.subscriptionHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: category?.color ? withAlpha(category.color, 0.12) : CALM.background }]}>
                    <Feather name={(category?.icon as keyof typeof Feather.glyphMap) || 'repeat'} size={20} color={category?.color} />
                  </View>
                  <View style={styles.subscriptionInfo}>
                    <Text style={styles.subscriptionName}>{subscription.name}</Text>
                    <Text style={styles.subscriptionCategory}>{category?.name}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleEdit(subscription.id)}
                    style={styles.editButton}
                  >
                    <Feather name="edit-2" size={18} color={CALM.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(subscription.id, subscription.name)}
                    style={styles.deleteButton}
                  >
                    <Feather name="trash-2" size={18} color={CALM.neutral} />
                  </TouchableOpacity>
                </View>

                <View style={styles.subscriptionDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount</Text>
                    <Text style={styles.detailValue}>{currency} {subscription.amount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Billing Cycle</Text>
                    <Text style={styles.detailValue}>
                      {subscription.billingCycle.charAt(0).toUpperCase() + subscription.billingCycle.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Next Renewal</Text>
                    <Text style={[styles.detailValue, daysUntil <= 3 && styles.duesSoon]}>
                      {daysUntil < 0
                        ? 'Pending renewal'
                        : `Renews in ${daysUntil}d`}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Started</Text>
                    <Text style={styles.detailValue}>
                      {format(subscription.startDate, 'MMM dd, yyyy')}
                    </Text>
                  </View>
                  {subscription.isInstallment && subscription.totalInstallments && (
                    <>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Installment</Text>
                        <Text style={styles.detailValue}>
                          {subscription.completedInstallments || 0}/{subscription.totalInstallments} payments
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Remaining</Text>
                        <Text style={styles.detailValue}>
                          {currency} {(
                            subscription.amount *
                            (subscription.totalInstallments - (subscription.completedInstallments || 0))
                          ).toFixed(2)}
                        </Text>
                      </View>
                      <ProgressBar
                        current={subscription.completedInstallments || 0}
                        total={subscription.totalInstallments}
                        color={CALM.accent}
                      />
                    </>
                  )}
                </View>
              </Card>
            );
          })
        ) : subscriptions.length > 0 ? (
          <View style={styles.noResults}>
            <Feather name="search" size={40} color={CALM.textSecondary} />
            <Text style={styles.noResultsTitle}>No results found</Text>
            <Text style={styles.noResultsText}>Try a different search or filter</Text>
          </View>
        ) : (
          <EmptyState
            icon="repeat"
            title="No Commitments"
            message="Track your recurring expenses by adding your commitments"
            actionLabel="Add Commitment"
            onAction={() => setModalVisible(true)}
          />
        )}
      </ScrollView>

      <Button
        title="Add Commitment"
        onPress={() => setModalVisible(true)}
        icon="plus"
        size="large"
        style={styles.addButton}
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Commitment' : 'Add Commitment'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Netflix, Spotify, etc."
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="next"
              />

              <Text style={styles.label}>Amount</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <CategoryPicker
                categories={expenseCategories}
                selectedId={category}
                onSelect={setCategory}
                label="Category"
                layout="dropdown"
              />

              <Text style={styles.label}>Billing Cycle</Text>
              <View style={styles.cycleContainer}>
                {BILLING_CYCLES.map((cycle) => (
                  <TouchableOpacity
                    key={cycle.value}
                    style={[
                      styles.cycleButton,
                      billingCycle === cycle.value && styles.cycleButtonActive,
                    ]}
                    onPress={() => setBillingCycle(cycle.value as 'weekly' | 'monthly' | 'yearly')}
                  >
                    <Text
                      style={[
                        styles.cycleText,
                        billingCycle === cycle.value && styles.cycleTextActive,
                      ]}
                    >
                      {cycle.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Start Date</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Text style={styles.label}>Reminder (days before)</Text>
              <TextInput
                style={styles.input}
                value={reminderDays}
                onChangeText={setReminderDays}
                placeholder="3"
                keyboardType="number-pad"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <View style={styles.installmentToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.installmentLabel}>Installment</Text>
                  <Text style={styles.installmentHint}>Toggle on for fixed-payment plans</Text>
                </View>
                <Switch
                  value={isInstallment}
                  onValueChange={(val) => { lightTap(); setIsInstallment(val); }}
                  trackColor={{ false: CALM.border, true: CALM.positive }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {isInstallment && (
                <>
                  <Text style={styles.label}>Total Installments</Text>
                  <TextInput
                    style={styles.input}
                    value={totalInstallments}
                    onChangeText={setTotalInstallments}
                    placeholder="e.g. 24"
                    keyboardType="number-pad"
                    placeholderTextColor={CALM.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </>
              )}

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => { setModalVisible(false); resetForm(); }}
                  variant="secondary"
                  style={{ flex: 1 }}
                />
                <Button
                  title={editingId ? 'Update' : 'Add'}
                  onPress={handleAdd}
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
    paddingBottom: 80,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },

  // Filter + Sort
  filterSortRow: {
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.personal,
    borderColor: COLORS.personal,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
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
  },
  sortChipActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  sortChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  sortChipTextActive: {
    color: '#FFFFFF',
  },

  // Summary
  summaryCard: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
  },
  summaryAmount: {
    fontSize: TYPOGRAPHY.size['4xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  summarySubtext: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },

  // Subscription cards
  subscriptionCard: {
    marginBottom: SPACING.md,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  subscriptionCategory: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  editButton: {
    padding: SPACING.sm,
  },
  deleteButton: {
    padding: SPACING.sm,
  },
  subscriptionDetails: {
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  detailValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  duesSoon: {
    color: CALM.neutral,
  },

  // No results
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['5xl'],
    gap: SPACING.sm,
  },
  noResultsTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginTop: SPACING.sm,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },

  // FAB
  addButton: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  },
  cycleContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  cycleButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: CALM.border,
    backgroundColor: CALM.background,
    alignItems: 'center',
  },
  cycleButtonActive: {
    borderColor: CALM.accent,
    backgroundColor: CALM.accent,
  },
  cycleText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  cycleTextActive: {
    color: '#fff',
  },
  installmentToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  installmentLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  installmentHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },
});

export default SubscriptionList;
