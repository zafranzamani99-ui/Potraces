import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, EXPENSE_CATEGORIES, BILLING_CYCLES, withAlpha } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import CategoryPicker from '../../components/common/CategoryPicker';
import { useToast } from '../../context/ToastContext';

const SubscriptionList: React.FC = () => {
  const { showToast } = useToast();
  const { subscriptions, addSubscription, updateSubscription, deleteSubscription } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].id);
  const [billingCycle, setBillingCycle] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [reminderDays, setReminderDays] = useState('3');

  const handleEdit = (id: string) => {
    const subscription = subscriptions.find((s) => s.id === id);
    if (!subscription) return;
    setEditingId(id);
    setName(subscription.name);
    setAmount(subscription.amount.toString());
    setCategory(subscription.category);
    setBillingCycle(subscription.billingCycle);
    setReminderDays(subscription.reminderDays.toString());
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

    if (editingId) {
      const existing = subscriptions.find((s) => s.id === editingId);
      updateSubscription(editingId, {
        name: name.trim(),
        amount: parseFloat(amount),
        category,
        billingCycle,
        reminderDays: parseInt(reminderDays) || 3,
        nextBillingDate: existing?.nextBillingDate || new Date(),
      });
      showToast('Subscription updated successfully!', 'success');
    } else {
      const nextBilling = (() => {
        const now = new Date();
        switch (billingCycle) {
          case 'weekly': return addWeeks(now, 1);
          case 'yearly': return addYears(now, 1);
          default: return addMonths(now, 1);
        }
      })();
      addSubscription({
        name: name.trim(),
        amount: parseFloat(amount),
        category,
        billingCycle,
        nextBillingDate: nextBilling,
        isActive: true,
        reminderDays: parseInt(reminderDays) || 3,
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
    setCategory(EXPENSE_CATEGORIES[0].id);
    setBillingCycle('monthly');
    setReminderDays('3');
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
              {subscriptions.filter((s) => s.isActive).length} active subscriptions
            </Text>
          </Card>
        )}

        {subscriptions.length > 0 ? (
          subscriptions.map((subscription) => {
            const category = EXPENSE_CATEGORIES.find((cat) => cat.id === subscription.category);
            const daysUntil = Math.ceil(
              (subscription.nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );

            return (
              <Card key={subscription.id} style={styles.subscriptionCard}>
                <View style={styles.subscriptionHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: category?.color ? withAlpha(category.color, 0.12) : COLORS.surface }]}>
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
                    <Feather name="edit-2" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(subscription.id, subscription.name)}
                    style={styles.deleteButton}
                  >
                    <Feather name="trash-2" size={18} color={COLORS.danger} />
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
                    <Text style={styles.detailLabel}>Next Billing</Text>
                    <Text style={[styles.detailValue, daysUntil <= 3 && styles.duesSoon]}>
                      {format(subscription.nextBillingDate, 'MMM dd, yyyy')}
                      {daysUntil >= 0 && ` (${daysUntil}d)`}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon="repeat"
            title="No Subscriptions"
            message="Track your recurring expenses by adding your subscriptions"
            actionLabel="Add Subscription"
            onAction={() => setModalVisible(true)}
          />
        )}
      </ScrollView>

      <Button
        title="Add Subscription"
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Subscription' : 'Add Subscription'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Netflix, Spotify, etc."
                placeholderTextColor={COLORS.textSecondary}
                returnKeyType="next"
              />

              <Text style={styles.label}>Amount</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={COLORS.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <CategoryPicker
                categories={EXPENSE_CATEGORIES}
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

              <Text style={styles.label}>Reminder (days before)</Text>
              <TextInput
                style={styles.input}
                value={reminderDays}
                onChangeText={setReminderDays}
                placeholder="3"
                keyboardType="number-pad"
                placeholderTextColor={COLORS.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

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
    padding: 16,
    paddingBottom: 80,
  },
  summaryCard: {
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  summarySubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  subscriptionCard: {
    marginBottom: 12,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  subscriptionCategory: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  editButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  subscriptionDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  duesSoon: {
    color: COLORS.danger,
  },
  addButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
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
  cycleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  cycleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  cycleButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  cycleText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  cycleTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
});

export default SubscriptionList;
