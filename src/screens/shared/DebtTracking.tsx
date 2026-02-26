import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Platform,
  Keyboard,
  ActionSheetIOS,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { useDebtStore } from '../../store/debtStore';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  SPLIT_METHODS,
  DEBT_TYPES,
  DEBT_STATUSES,
  withAlpha,
} from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ProgressBar from '../../components/common/ProgressBar';
import ContactPicker from '../../components/common/ContactPicker';
import FAB from '../../components/common/FAB';
import { useToast } from '../../context/ToastContext';
import {
  Contact,
  Debt,
  SplitExpense,
  DebtType,
  SplitMethod,
  SplitParticipant,
  SplitItem,
} from '../../types';

type TabType = 'debts' | 'splits';

type DebtTrackingParams = {
  DebtTracking: { receiptData?: { vendor: string; total: number; items: { name: string; amount: number }[] } } | undefined;
};

const DebtTracking: React.FC = () => {
  const route = useRoute<RouteProp<DebtTrackingParams, 'DebtTracking'>>();
  const { showToast } = useToast();
  const mode = useAppStore((state) => state.mode);
  const currency = useSettingsStore((state) => state.currency);
  const {
    debts,
    splits,
    addDebt,
    updateDebt,
    deleteDebt,
    addPayment,
    addSplit,
    updateSplit,
    deleteSplit,
    markSplitParticipantPaid,
  } = useDebtStore();

  const [activeTab, setActiveTab] = useState<TabType>('debts');

  // Debt modal state
  const [debtModalVisible, setDebtModalVisible] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [debtContacts, setDebtContacts] = useState<Contact[]>([]);
  const [debtType, setDebtType] = useState<DebtType>('they_owe');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDescription, setDebtDescription] = useState('');
  const [debtCategory, setDebtCategory] = useState('');

  // Split modal state
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [editingSplitId, setEditingSplitId] = useState<string | null>(null);
  const [splitDescription, setSplitDescription] = useState('');
  const [splitAmount, setSplitAmount] = useState('');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [splitContacts, setSplitContacts] = useState<Contact[]>([]);
  const [splitPaidBy, setSplitPaidBy] = useState<Contact[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [splitItems, setSplitItems] = useState<SplitItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  // Payment modal state
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentDebtId, setPaymentDebtId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  // Split detail modal state
  const [splitDetailVisible, setSplitDetailVisible] = useState(false);
  const [selectedSplit, setSelectedSplit] = useState<SplitExpense | null>(null);

  // Filtered data
  const modeDebts = useMemo(() => debts.filter((d) => d.mode === mode), [debts, mode]);
  const modeSplits = useMemo(() => splits.filter((s) => s.mode === mode), [splits, mode]);

  // Balance summary
  const balanceSummary = useMemo(() => {
    const youOwe = modeDebts
      .filter((d) => d.type === 'i_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

    const owedToYou = modeDebts
      .filter((d) => d.type === 'they_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

    return { youOwe, owedToYou, net: owedToYou - youOwe };
  }, [modeDebts]);

  // ── Receipt Data from Route Params ────────────────────────
  useEffect(() => {
    const receiptData = route.params?.receiptData;
    if (receiptData) {
      setActiveTab('splits');
      setSplitDescription(receiptData.vendor);
      setSplitAmount(receiptData.total.toFixed(2));
      setSplitMethod('item_based');
      setSplitItems(
        receiptData.items.map((item) => ({
          name: item.name,
          amount: item.amount,
          assignedTo: [],
        }))
      );
      setSplitModalVisible(true);
    }
  }, [route.params?.receiptData]);

  // ── Debt Handlers ──────────────────────────────────────────
  const resetDebtForm = () => {
    setEditingDebtId(null);
    setDebtContacts([]);
    setDebtType('they_owe');
    setDebtAmount('');
    setDebtDescription('');
    setDebtCategory('');
  };

  const handleEditDebt = (debt: Debt) => {
    setEditingDebtId(debt.id);
    setDebtContacts([debt.contact]);
    setDebtType(debt.type);
    setDebtAmount(debt.totalAmount.toString());
    setDebtDescription(debt.description);
    setDebtCategory(debt.category || '');
    setDebtModalVisible(true);
  };

  const handleSaveDebt = () => {
    if (debtContacts.length === 0) {
      showToast('Please select a contact', 'error');
      return;
    }
    if (!debtAmount || parseFloat(debtAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    if (!debtDescription.trim()) {
      showToast('Please add a description', 'error');
      return;
    }

    if (editingDebtId) {
      updateDebt(editingDebtId, {
        contact: debtContacts[0],
        type: debtType,
        totalAmount: parseFloat(debtAmount),
        description: debtDescription.trim(),
        category: debtCategory || undefined,
      });
      showToast('Debt updated!', 'success');
    } else {
      addDebt({
        contact: debtContacts[0],
        type: debtType,
        totalAmount: parseFloat(debtAmount),
        description: debtDescription.trim(),
        category: debtCategory || undefined,
        mode,
      });
      showToast('Debt added!', 'success');
    }

    setDebtModalVisible(false);
    resetDebtForm();
  };

  const handleDeleteDebt = (id: string) => {
    Alert.alert('Delete Debt', 'Are you sure you want to delete this debt?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteDebt(id);
          showToast('Debt deleted', 'success');
        },
      },
    ]);
  };

  // ── Payment Handlers ───────────────────────────────────────
  const openPaymentModal = (debtId: string) => {
    setPaymentDebtId(debtId);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentModalVisible(true);
  };

  const handleRecordPayment = () => {
    if (!paymentDebtId) return;
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    addPayment(paymentDebtId, {
      amount: parseFloat(paymentAmount),
      date: new Date(),
      note: paymentNote.trim() || undefined,
    });

    setPaymentModalVisible(false);
    showToast('Payment recorded!', 'success');
  };

  // ── Split Handlers ─────────────────────────────────────────
  const resetSplitForm = () => {
    setEditingSplitId(null);
    setSplitDescription('');
    setSplitAmount('');
    setSplitMethod('equal');
    setSplitContacts([]);
    setSplitPaidBy([]);
    setCustomAmounts({});
    setSplitItems([]);
    setNewItemName('');
    setNewItemAmount('');
  };

  const handleEditSplit = (split: SplitExpense) => {
    setEditingSplitId(split.id);
    setSplitDescription(split.description);
    setSplitAmount(split.totalAmount.toString());
    setSplitMethod(split.splitMethod);
    setSplitContacts(split.participants.map((p) => p.contact));
    setSplitPaidBy([split.paidBy]);
    if (split.splitMethod === 'custom') {
      const amounts: Record<string, string> = {};
      split.participants.forEach((p) => { amounts[p.contact.id] = p.amount.toString(); });
      setCustomAmounts(amounts);
    }
    if (split.splitMethod === 'item_based') {
      setSplitItems(split.items);
    }
    setSplitModalVisible(true);
  };

  const handleSaveSplit = () => {
    if (!splitDescription.trim()) {
      showToast('Please add a description', 'error');
      return;
    }
    if (!splitAmount || parseFloat(splitAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    if (splitContacts.length < 2) {
      showToast('Please add at least 2 participants', 'error');
      return;
    }
    if (splitPaidBy.length === 0) {
      showToast('Please select who paid', 'error');
      return;
    }

    const total = parseFloat(splitAmount);
    let participants: SplitParticipant[] = [];

    if (splitMethod === 'equal') {
      const perPerson = total / splitContacts.length;
      participants = splitContacts.map((c) => ({ contact: c, amount: perPerson, isPaid: false }));
    } else if (splitMethod === 'custom') {
      const customTotal = Object.values(customAmounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
      if (Math.abs(customTotal - total) > 0.01) {
        showToast(`Custom amounts must sum to ${currency} ${total.toFixed(2)}`, 'error');
        return;
      }
      participants = splitContacts.map((c) => ({
        contact: c,
        amount: parseFloat(customAmounts[c.id]) || 0,
        isPaid: false,
      }));
    } else if (splitMethod === 'item_based') {
      if (splitItems.length === 0) {
        showToast('Please add at least one item', 'error');
        return;
      }
      const perPersonMap: Record<string, number> = {};
      splitContacts.forEach((c) => { perPersonMap[c.id] = 0; });
      splitItems.forEach((item) => {
        const share = item.amount / (item.assignedTo.length || 1);
        item.assignedTo.forEach((c) => {
          perPersonMap[c.id] = (perPersonMap[c.id] || 0) + share;
        });
      });
      participants = splitContacts.map((c) => ({
        contact: c,
        amount: perPersonMap[c.id] || 0,
        isPaid: false,
      }));
    }

    // Mark the payer as paid
    const payerId = splitPaidBy[0].id;
    participants = participants.map((p) =>
      p.contact.id === payerId ? { ...p, isPaid: true } : p
    );

    if (editingSplitId) {
      updateSplit(editingSplitId, {
        description: splitDescription.trim(),
        totalAmount: total,
        splitMethod,
        participants,
        items: splitMethod === 'item_based' ? splitItems : [],
        paidBy: splitPaidBy[0],
      });
      showToast('Split updated!', 'success');
    } else {
      addSplit({
        description: splitDescription.trim(),
        totalAmount: total,
        splitMethod,
        participants,
        items: splitMethod === 'item_based' ? splitItems : [],
        paidBy: splitPaidBy[0],
        mode,
      });
      showToast('Split created!', 'success');
    }

    setSplitModalVisible(false);
    resetSplitForm();
  };

  const handleDeleteSplit = (id: string) => {
    Alert.alert('Delete Split', 'Are you sure you want to delete this split?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteSplit(id);
          showToast('Split deleted', 'success');
        },
      },
    ]);
  };

  const handleAddItem = () => {
    if (!newItemName.trim() || !newItemAmount || parseFloat(newItemAmount) <= 0) {
      showToast('Please enter item name and amount', 'error');
      return;
    }
    setSplitItems([...splitItems, {
      name: newItemName.trim(),
      amount: parseFloat(newItemAmount),
      assignedTo: [],
    }]);
    setNewItemName('');
    setNewItemAmount('');
  };

  const handleToggleItemAssignment = (itemIndex: number, contact: Contact) => {
    setSplitItems(splitItems.map((item, i) => {
      if (i !== itemIndex) return item;
      const assigned = item.assignedTo.some((c) => c.id === contact.id);
      return {
        ...item,
        assignedTo: assigned
          ? item.assignedTo.filter((c) => c.id !== contact.id)
          : [...item.assignedTo, contact],
      };
    }));
  };

  // ── FAB Action ─────────────────────────────────────────────
  const handleFABPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Add Debt', 'Split Expense'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) { resetDebtForm(); setDebtModalVisible(true); }
          if (buttonIndex === 2) { resetSplitForm(); setSplitModalVisible(true); }
        }
      );
    } else {
      Alert.alert('New Entry', 'What would you like to add?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add Debt', onPress: () => { resetDebtForm(); setDebtModalVisible(true); } },
        { text: 'Split Expense', onPress: () => { resetSplitForm(); setSplitModalVisible(true); } },
      ]);
    }
  };

  const getStatusConfig = (status: string) => {
    return DEBT_STATUSES.find((s) => s.value === status) || DEBT_STATUSES[0];
  };

  const getTypeConfig = (type: string) => {
    return DEBT_TYPES.find((t) => t.value === type) || DEBT_TYPES[0];
  };

  return (
    <View style={styles.container}>
      <ModeToggle />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Net Balance Summary */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>You Owe</Text>
              <Text style={[styles.summaryAmount, { color: COLORS.danger }]}>
                {currency} {balanceSummary.youOwe.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Owed to You</Text>
              <Text style={[styles.summaryAmount, { color: COLORS.success }]}>
                {currency} {balanceSummary.owedToYou.toFixed(2)}
              </Text>
            </View>
          </View>
          <View style={styles.netBalanceRow}>
            <Text style={styles.netLabel}>Net Balance</Text>
            <Text style={[styles.netAmount, { color: balanceSummary.net >= 0 ? COLORS.success : COLORS.danger }]}>
              {balanceSummary.net >= 0 ? '+' : ''}{currency} {balanceSummary.net.toFixed(2)}
            </Text>
          </View>
        </Card>

        {/* Tab Toggle */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'debts' && styles.tabActive]}
            onPress={() => setActiveTab('debts')}
            activeOpacity={0.7}
          >
            <Feather name="users" size={16} color={activeTab === 'debts' ? '#fff' : COLORS.text} />
            <Text style={[styles.tabText, activeTab === 'debts' && styles.tabTextActive]}>
              Debts ({modeDebts.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'splits' && styles.tabActive]}
            onPress={() => setActiveTab('splits')}
            activeOpacity={0.7}
          >
            <Feather name="scissors" size={16} color={activeTab === 'splits' ? '#fff' : COLORS.text} />
            <Text style={[styles.tabText, activeTab === 'splits' && styles.tabTextActive]}>
              Splits ({modeSplits.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Debts Tab */}
        {activeTab === 'debts' && (
          <>
            {modeDebts.length > 0 ? (
              modeDebts.map((debt) => {
                const typeConfig = getTypeConfig(debt.type);
                const statusConfig = getStatusConfig(debt.status);
                const remaining = debt.totalAmount - debt.paidAmount;

                return (
                  <Card key={debt.id} style={styles.debtCard}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => handleEditDebt(debt)}>
                      <View style={styles.debtHeader}>
                        <View style={[styles.debtAvatar, { backgroundColor: withAlpha(typeConfig.color, 0.12) }]}>
                          <Text style={[styles.debtAvatarText, { color: typeConfig.color }]}>
                            {debt.contact.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.debtInfo}>
                          <Text style={styles.debtName}>{debt.contact.name}</Text>
                          <Text style={styles.debtDesc} numberOfLines={1}>{debt.description}</Text>
                        </View>
                        <View style={styles.debtAmountCol}>
                          <Text style={[styles.debtAmount, { color: typeConfig.color }]}>
                            {currency} {remaining.toFixed(2)}
                          </Text>
                          <View style={[styles.statusBadge, { backgroundColor: withAlpha(statusConfig.color, 0.12) }]}>
                            <Text style={[styles.statusText, { color: statusConfig.color }]}>
                              {statusConfig.label}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <View style={[styles.typePill, { backgroundColor: withAlpha(typeConfig.color, 0.08) }]}>
                      <Feather name={typeConfig.icon as any} size={14} color={typeConfig.color} />
                      <Text style={[styles.typePillText, { color: typeConfig.color }]}>{typeConfig.label}</Text>
                    </View>

                    {debt.status !== 'settled' && (
                      <ProgressBar
                        current={debt.paidAmount}
                        total={debt.totalAmount}
                        color={typeConfig.color}
                      />
                    )}

                    <View style={styles.debtActions}>
                      {debt.status !== 'settled' && (
                        <TouchableOpacity
                          style={styles.debtActionButton}
                          onPress={() => openPaymentModal(debt.id)}
                          activeOpacity={0.7}
                        >
                          <Feather name="plus-circle" size={16} color={COLORS.success} />
                          <Text style={[styles.debtActionText, { color: COLORS.success }]}>Record Payment</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.debtActionButton}
                        onPress={() => handleDeleteDebt(debt.id)}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={16} color={COLORS.danger} />
                        <Text style={[styles.debtActionText, { color: COLORS.danger }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              })
            ) : (
              <EmptyState
                icon="users"
                title="No Debts"
                message="Track who owes you and who you owe"
                actionLabel="Add Debt"
                onAction={() => { resetDebtForm(); setDebtModalVisible(true); }}
              />
            )}
          </>
        )}

        {/* Splits Tab */}
        {activeTab === 'splits' && (
          <>
            {modeSplits.length > 0 ? (
              modeSplits.map((split) => {
                const methodConfig = SPLIT_METHODS.find((m) => m.value === split.splitMethod);
                const paidCount = split.participants.filter((p) => p.isPaid).length;

                return (
                  <Card key={split.id} style={styles.splitCard}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => { setSelectedSplit(split); setSplitDetailVisible(true); }}>
                      <View style={styles.splitHeader}>
                        <View style={styles.splitInfo}>
                          <Text style={styles.splitTitle}>{split.description}</Text>
                          <Text style={styles.splitSubtext}>
                            Paid by {split.paidBy.name} - {format(split.createdAt, 'MMM dd')}
                          </Text>
                        </View>
                        <Text style={styles.splitAmount}>{currency} {split.totalAmount.toFixed(2)}</Text>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.splitMeta}>
                      <View style={[styles.methodPill, { backgroundColor: withAlpha(COLORS.primary, 0.08) }]}>
                        <Feather name={methodConfig?.icon as any || 'users'} size={14} color={COLORS.primary} />
                        <Text style={[styles.methodPillText, { color: COLORS.primary }]}>{methodConfig?.label}</Text>
                      </View>
                      <Text style={styles.participantCount}>
                        {paidCount}/{split.participants.length} paid
                      </Text>
                    </View>

                    <View style={styles.splitParticipants}>
                      {split.participants.slice(0, 4).map((p) => (
                        <View key={p.contact.id} style={[styles.participantChip, p.isPaid && styles.participantChipPaid]}>
                          <Text style={[styles.participantChipText, p.isPaid && styles.participantChipTextPaid]} numberOfLines={1}>
                            {p.contact.name.split(' ')[0]}
                          </Text>
                          {p.isPaid && <Feather name="check" size={12} color={COLORS.success} />}
                        </View>
                      ))}
                      {split.participants.length > 4 && (
                        <View style={styles.participantChip}>
                          <Text style={styles.participantChipText}>+{split.participants.length - 4}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.splitActions}>
                      <TouchableOpacity
                        style={styles.debtActionButton}
                        onPress={() => handleEditSplit(split)}
                        activeOpacity={0.7}
                      >
                        <Feather name="edit-2" size={16} color={COLORS.primary} />
                        <Text style={[styles.debtActionText, { color: COLORS.primary }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.debtActionButton}
                        onPress={() => handleDeleteSplit(split.id)}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={16} color={COLORS.danger} />
                        <Text style={[styles.debtActionText, { color: COLORS.danger }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              })
            ) : (
              <EmptyState
                icon="scissors"
                title="No Splits"
                message="Split expenses with friends, family, or colleagues"
                actionLabel="Split Expense"
                onAction={() => { resetSplitForm(); setSplitModalVisible(true); }}
              />
            )}
          </>
        )}
      </ScrollView>

      <FAB
        onPress={handleFABPress}
        icon="plus"
        color={mode === 'personal' ? COLORS.personal : COLORS.business}
      />

      {/* ── Add/Edit Debt Modal ──────────────────────────────── */}
      <Modal visible={debtModalVisible} animationType="slide" transparent onRequestClose={() => { setDebtModalVisible(false); resetDebtForm(); }}>
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingDebtId ? 'Edit Debt' : 'Add Debt'}</Text>
                <TouchableOpacity onPress={() => { setDebtModalVisible(false); resetDebtForm(); }}>
                  <Feather name="x" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <ContactPicker
                  selectedContacts={debtContacts}
                  onSelect={setDebtContacts}
                  mode="single"
                  label="Who?"
                />

                <Text style={styles.formLabel}>Type</Text>
                <View style={styles.typeContainer}>
                  {DEBT_TYPES.map((dt) => (
                    <TouchableOpacity
                      key={dt.value}
                      style={[
                        styles.typeButton,
                        debtType === dt.value && { backgroundColor: dt.color, borderColor: dt.color },
                        { borderColor: dt.color },
                      ]}
                      onPress={() => setDebtType(dt.value as DebtType)}
                    >
                      <Feather
                        name={dt.icon as any}
                        size={18}
                        color={debtType === dt.value ? '#fff' : dt.color}
                      />
                      <Text style={[styles.typeText, debtType === dt.value && { color: '#fff' }]}>
                        {dt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formLabel}>Amount</Text>
                <TextInput
                  style={styles.formInput}
                  value={debtAmount}
                  onChangeText={setDebtAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={styles.formInput}
                  value={debtDescription}
                  onChangeText={setDebtDescription}
                  placeholder="What for?"
                  placeholderTextColor={COLORS.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => { setDebtModalVisible(false); resetDebtForm(); }}
                    variant="secondary"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={editingDebtId ? 'Update' : 'Add'}
                    onPress={handleSaveDebt}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>
            </View>
        </View>
      </Modal>

      {/* ── Add/Edit Split Modal ─────────────────────────────── */}
      <Modal visible={splitModalVisible} animationType="slide" transparent onRequestClose={() => { setSplitModalVisible(false); resetSplitForm(); }}>
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingSplitId ? 'Edit Split' : 'Split Expense'}</Text>
                <TouchableOpacity onPress={() => { setSplitModalVisible(false); resetSplitForm(); }}>
                  <Feather name="x" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={styles.formInput}
                  value={splitDescription}
                  onChangeText={setSplitDescription}
                  placeholder="Dinner, trip, etc."
                  placeholderTextColor={COLORS.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.formLabel}>Total Amount</Text>
                <TextInput
                  style={styles.formInput}
                  value={splitAmount}
                  onChangeText={setSplitAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.formLabel}>Split Method</Text>
                <View style={styles.methodContainer}>
                  {SPLIT_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m.value}
                      style={[styles.methodButton, splitMethod === m.value && styles.methodButtonActive]}
                      onPress={() => setSplitMethod(m.value as SplitMethod)}
                    >
                      <Feather
                        name={m.icon as any}
                        size={16}
                        color={splitMethod === m.value ? '#fff' : COLORS.text}
                      />
                      <Text style={[styles.methodText, splitMethod === m.value && styles.methodTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <ContactPicker
                  selectedContacts={splitContacts}
                  onSelect={setSplitContacts}
                  mode="multi"
                  label="Participants"
                />

                <ContactPicker
                  selectedContacts={splitPaidBy}
                  onSelect={setSplitPaidBy}
                  mode="single"
                  label="Paid By"
                />

                {/* Custom amounts per participant */}
                {splitMethod === 'custom' && splitContacts.length > 0 && (
                  <View style={styles.customSection}>
                    <Text style={styles.formLabel}>Amount per Person</Text>
                    {splitContacts.map((c) => (
                      <View key={c.id} style={styles.customRow}>
                        <Text style={styles.customName} numberOfLines={1}>{c.name}</Text>
                        <TextInput
                          style={styles.customInput}
                          value={customAmounts[c.id] || ''}
                          onChangeText={(v) => setCustomAmounts({ ...customAmounts, [c.id]: v })}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          placeholderTextColor={COLORS.textSecondary}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                        />
                      </View>
                    ))}
                  </View>
                )}

                {/* Item-based split */}
                {splitMethod === 'item_based' && (
                  <View style={styles.customSection}>
                    <Text style={styles.formLabel}>Items</Text>
                    <View style={styles.addItemRow}>
                      <TextInput
                        style={[styles.formInput, { flex: 2 }]}
                        value={newItemName}
                        onChangeText={setNewItemName}
                        placeholder="Item name"
                        placeholderTextColor={COLORS.textSecondary}
                        returnKeyType="next"
                      />
                      <TextInput
                        style={[styles.formInput, { flex: 1 }]}
                        value={newItemAmount}
                        onChangeText={setNewItemAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        placeholderTextColor={COLORS.textSecondary}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      <TouchableOpacity style={styles.addItemButton} onPress={handleAddItem}>
                        <Feather name="plus" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    {splitItems.map((item, index) => (
                      <View key={index} style={styles.itemCard}>
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemAmount}>{currency} {item.amount.toFixed(2)}</Text>
                          <TouchableOpacity onPress={() => setSplitItems(splitItems.filter((_, i) => i !== index))}>
                            <Feather name="x" size={16} color={COLORS.danger} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.assignLabel}>Assign to:</Text>
                        <View style={styles.assignChips}>
                          {splitContacts.map((c) => {
                            const isAssigned = item.assignedTo.some((a) => a.id === c.id);
                            return (
                              <TouchableOpacity
                                key={c.id}
                                style={[styles.assignChip, isAssigned && styles.assignChipActive]}
                                onPress={() => handleToggleItemAssignment(index, c)}
                              >
                                <Text style={[styles.assignChipText, isAssigned && styles.assignChipTextActive]} numberOfLines={1}>
                                  {c.name.split(' ')[0]}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => { setSplitModalVisible(false); resetSplitForm(); }}
                    variant="secondary"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={editingSplitId ? 'Update' : 'Create'}
                    onPress={handleSaveSplit}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>
            </View>
        </View>
      </Modal>

      {/* ── Record Payment Modal ─────────────────────────────── */}
      <Modal
        visible={paymentModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Record Payment</Text>
                  <TouchableOpacity
                    onPress={() => setPaymentModalVisible(false)}
                  >
                    <Feather name="x" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                </View>

                <KeyboardAwareScrollView
                  keyboardShouldPersistTaps="handled"
                >
                <Text style={styles.formLabel}>Amount</Text>
                <TextInput
                  style={styles.formInput}
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  placeholder="Enter amount"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleRecordPayment}
                />

                <Text style={styles.formLabel}>Note</Text>
                <TextInput
                  style={styles.formInput}
                  value={paymentNote}
                  onChangeText={setPaymentNote}
                  placeholder="Optional note"
                  returnKeyType="done"
                  onSubmitEditing={handleRecordPayment}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => setPaymentModalVisible(false)}
                    variant="secondary"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Record"
                    onPress={handleRecordPayment}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
                </KeyboardAwareScrollView>
              </View>
        </View>
      </Modal>

      {/* ── Split Detail Modal ───────────────────────────────── */}
      <Modal visible={splitDetailVisible} animationType="slide" transparent onRequestClose={() => setSplitDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Split Details</Text>
              <TouchableOpacity onPress={() => setSplitDetailVisible(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {selectedSplit && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.detailTitle}>{selectedSplit.description}</Text>
                <Text style={styles.detailSubtext}>
                  Total: {currency} {selectedSplit.totalAmount.toFixed(2)} - Paid by {selectedSplit.paidBy.name}
                </Text>

                <View style={styles.participantList}>
                  {selectedSplit.participants.map((p) => (
                    <View key={p.contact.id} style={styles.participantRow}>
                      <View style={styles.participantRowLeft}>
                        <View style={[styles.participantAvatar, { backgroundColor: withAlpha(p.isPaid ? COLORS.success : COLORS.warning, 0.12) }]}>
                          <Text style={[styles.participantAvatarText, { color: p.isPaid ? COLORS.success : COLORS.warning }]}>
                            {p.contact.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.participantName}>{p.contact.name}</Text>
                          <Text style={styles.participantAmount}>{currency} {p.amount.toFixed(2)}</Text>
                        </View>
                      </View>
                      {p.isPaid ? (
                        <View style={[styles.paidBadge, { backgroundColor: withAlpha(COLORS.success, 0.12) }]}>
                          <Feather name="check" size={14} color={COLORS.success} />
                          <Text style={[styles.paidBadgeText, { color: COLORS.success }]}>Paid</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.markPaidButton, { borderColor: COLORS.success }]}
                          onPress={() => {
                            markSplitParticipantPaid(selectedSplit.id, p.contact.id);
                            setSelectedSplit({
                              ...selectedSplit,
                              participants: selectedSplit.participants.map((part) =>
                                part.contact.id === p.contact.id ? { ...part, isPaid: true } : part
                              ),
                            });
                            showToast(`${p.contact.name} marked as paid`, 'success');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.markPaidText, { color: COLORS.success }]}>Mark Paid</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>

                <Button
                  title="Close"
                  onPress={() => setSplitDetailVisible(false)}
                  variant="secondary"
                  style={{ marginTop: SPACING.lg }}
                />
              </ScrollView>
            )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 80,
  },

  // Summary
  summaryCard: {
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.lg,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  summaryAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  netBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  netLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  netAmount: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.background,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  tabTextActive: {
    color: '#fff',
  },

  // Debt Cards
  debtCard: {
    marginBottom: SPACING.md,
  },
  debtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  debtAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  debtAvatarText: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  debtInfo: {
    flex: 1,
  },
  debtName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  debtDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
  },
  debtAmountCol: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  debtAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  statusText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
  },
  typePillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  debtActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  debtActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  debtActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Split Cards
  splitCard: {
    marginBottom: SPACING.md,
  },
  splitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  splitInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  splitTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  splitSubtext: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
  },
  splitAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  splitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  methodPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  participantCount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  splitParticipants: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  participantChipPaid: {
    backgroundColor: withAlpha(COLORS.success, 0.1),
  },
  participantChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    maxWidth: 80,
  },
  participantChipTextPaid: {
    color: COLORS.success,
  },
  splitActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },

  // Modals
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
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },

  // Form elements
  formLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  formInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
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
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    backgroundColor: COLORS.surface,
  },
  typeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  methodContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  methodButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  methodText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  methodTextActive: {
    color: COLORS.background,
  },

  // Custom split
  customSection: {
    marginTop: SPACING.sm,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  customName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.text,
  },
  customInput: {
    width: 100,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
    textAlign: 'right',
  },

  // Item-based split
  addItemRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  addItemButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  itemName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  itemAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  assignLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  assignChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  assignChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  assignChipActive: {
    backgroundColor: withAlpha(COLORS.primary, 0.12),
    borderColor: COLORS.primary,
  },
  assignChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.textSecondary,
    maxWidth: 80,
  },
  assignChipTextActive: {
    color: COLORS.primary,
  },

  // Split Detail
  detailTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  detailSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  participantList: {
    gap: SPACING.md,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  participantName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  participantAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  paidBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  markPaidButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  markPaidText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
});

export default DebtTracking;
