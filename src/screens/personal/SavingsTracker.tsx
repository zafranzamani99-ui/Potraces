import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, formatDistanceToNow } from 'date-fns';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  CALM,
  TYPE,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  withAlpha,
} from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useCategories } from '../../hooks/useCategories';
import { SavingsAccount } from '../../types';
import { CategoryOption } from '../../types';

const MAX_ACCOUNTS = 5;

const FALLBACK_TYPE: CategoryOption = { id: 'other', name: 'Other', icon: 'briefcase', color: '#9CA3B4' };

const SavingsTracker: React.FC = () => {
  const { showToast } = useToast();
  const { accounts, addAccount, updateAccount, deleteAccount, addSnapshot } =
    useSavingsStore();
  const currency = useSettingsStore((s) => s.currency);
  const investmentTypes = useCategories('investment');
  const getTypeInfo = (typeId: string): CategoryOption =>
    investmentTypes.find((t) => t.id === typeId) || FALLBACK_TYPE;

  // Add / Edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SavingsAccount | null>(null);
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState(investmentTypes[0]?.id || 'tng_plus');
  const [description, setDescription] = useState('');
  const [initialInvestment, setInitialInvestment] = useState('');
  const [currentValue, setCurrentValue] = useState('');

  // Type dropdown
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  // Update value modal
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updatingAccount, setUpdatingAccount] = useState<SavingsAccount | null>(null);
  const [newValue, setNewValue] = useState('');
  const [updateNote, setUpdateNote] = useState('');

  // History modal
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyAccount, setHistoryAccount] = useState<SavingsAccount | null>(null);

  // ── Portfolio stats ──
  const portfolio = useMemo(() => {
    const totalCurrent = accounts.reduce((s, a) => s + a.currentValue, 0);
    const totalInvested = accounts.reduce((s, a) => s + a.initialInvestment, 0);
    const totalGain = totalCurrent - totalInvested;
    const totalReturn = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
    return { totalCurrent, totalInvested, totalGain, totalReturn };
  }, [accounts]);

  // ── Handlers ──
  const resetForm = () => {
    setEditingAccount(null);
    setName('');
    setSelectedType('tng_plus');
    setDescription('');
    setInitialInvestment('');
    setCurrentValue('');
    setTypeDropdownOpen(false);
  };

  const openAdd = () => {
    if (accounts.length >= MAX_ACCOUNTS) {
      showToast(`Maximum ${MAX_ACCOUNTS} savings accounts allowed`, 'error');
      return;
    }
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (account: SavingsAccount) => {
    setEditingAccount(account);
    setName(account.name);
    setSelectedType(account.type);
    setDescription(account.description || '');
    setInitialInvestment(account.initialInvestment.toString());
    setCurrentValue(account.currentValue.toString());
    setTypeDropdownOpen(false);
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      showToast('Please enter an account name', 'error');
      return;
    }
    const inv = parseFloat(initialInvestment);
    const cur = parseFloat(currentValue);
    if (!inv || inv <= 0) {
      showToast('Please enter a valid initial investment', 'error');
      return;
    }
    if (!cur || cur < 0) {
      showToast('Please enter a valid current value', 'error');
      return;
    }

    if (editingAccount) {
      updateAccount(editingAccount.id, {
        name: name.trim(),
        type: selectedType,
        description: (selectedType === 'other' || selectedType.startsWith('custom_')) ? description.trim() : undefined,
        initialInvestment: inv,
        currentValue: cur,
      });
      showToast('Account updated', 'success');
    } else {
      addAccount({
        name: name.trim(),
        type: selectedType,
        description: (selectedType === 'other' || selectedType.startsWith('custom_')) ? description.trim() : undefined,
        initialInvestment: inv,
        currentValue: cur,
      });
      showToast('Account added', 'success');
    }
    setModalVisible(false);
    resetForm();
  };

  const handleDelete = (account: SavingsAccount) => {
    Alert.alert(
      'Delete Account',
      `Remove "${account.name}" from your savings?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAccount(account.id);
            showToast('Account deleted', 'success');
          },
        },
      ]
    );
  };

  const openUpdateValue = (account: SavingsAccount) => {
    setUpdatingAccount(account);
    setNewValue(account.currentValue.toString());
    setUpdateNote('');
    setUpdateModalVisible(true);
  };

  const handleUpdateValue = () => {
    if (!updatingAccount) return;
    const val = parseFloat(newValue);
    if (!val || val < 0) {
      showToast('Please enter a valid value', 'error');
      return;
    }
    addSnapshot(updatingAccount.id, val, updateNote.trim() || undefined);
    showToast('Value updated', 'success');
    setUpdateModalVisible(false);
    setUpdatingAccount(null);
  };

  const openHistory = (account: SavingsAccount) => {
    setHistoryAccount(account);
    setHistoryModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Portfolio Hero (bordered card, no gradient) ── */}
        {accounts.length > 0 && (
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Total Portfolio</Text>
            <Text style={styles.heroAmount}>
              {currency} {portfolio.totalCurrent.toFixed(2)}
            </Text>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatSmallLabel}>Invested</Text>
                <Text style={styles.heroStatSmallValue}>
                  {currency} {portfolio.totalInvested.toFixed(2)}
                </Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatSmallLabel}>Gain / Loss</Text>
                <Text
                  style={[
                    styles.heroStatSmallValue,
                    {
                      color:
                        portfolio.totalGain >= 0
                          ? CALM.positive
                          : CALM.neutral,
                    },
                  ]}
                >
                  {portfolio.totalGain >= 0 ? '+' : ''}
                  {currency} {portfolio.totalGain.toFixed(2)}
                </Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatSmallLabel}>Return</Text>
                <Text
                  style={[
                    styles.heroStatSmallValue,
                    {
                      color:
                        portfolio.totalReturn >= 0
                          ? CALM.positive
                          : CALM.neutral,
                    },
                  ]}
                >
                  {portfolio.totalReturn >= 0 ? '+' : ''}
                  {portfolio.totalReturn.toFixed(1)}%
                </Text>
              </View>
            </View>

            <Text style={styles.heroCounter}>
              {accounts.length}/{MAX_ACCOUNTS} accounts
            </Text>
          </View>
        )}

        {/* ── Account Cards ── */}
        {accounts.length > 0 ? (
          accounts.map((account) => {
            const info = getTypeInfo(account.type);
            const gain = account.currentValue - account.initialInvestment;
            const returnPct =
              account.initialInvestment > 0
                ? (gain / account.initialInvestment) * 100
                : 0;
            const lastSnapshot =
              account.history.length > 0
                ? account.history[account.history.length - 1]
                : null;
            const prevSnapshot =
              account.history.length > 1
                ? account.history[account.history.length - 2]
                : null;
            const lastChange = prevSnapshot
              ? account.currentValue - prevSnapshot.value
              : null;

            return (
              <Card key={account.id} style={styles.accountCard}>
                {/* Header */}
                <View style={styles.accountHeader}>
                  <View
                    style={[
                      styles.accountTypeIcon,
                      { backgroundColor: withAlpha(info.color, 0.12) },
                    ]}
                  >
                    <Feather name={info.icon as keyof typeof Feather.glyphMap} size={20} color={info.color} />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName} numberOfLines={1}>
                      {account.name}
                    </Text>
                    <View style={styles.accountTypeBadge}>
                      <Text
                        style={[
                          styles.accountTypeBadgeText,
                          { color: info.color },
                        ]}
                      >
                        {account.type === 'other' && account.description
                          ? account.description
                          : info.name}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => openEdit(account)}
                    style={styles.iconBtn}
                  >
                    <Feather name="edit-2" size={16} color={CALM.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(account)}
                    style={styles.iconBtn}
                  >
                    <Feather name="trash-2" size={16} color={CALM.neutral} />
                  </TouchableOpacity>
                </View>

                {/* Value + Gain */}
                <View style={styles.valueSection}>
                  <View>
                    <Text style={styles.valueCurrent}>
                      {currency} {account.currentValue.toFixed(2)}
                    </Text>
                    <Text style={styles.valueInvested}>
                      Invested: {currency} {account.initialInvestment.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.gainContainer}>
                    <View
                      style={[
                        styles.gainBadge,
                        {
                          backgroundColor: gain >= 0
                            ? withAlpha(CALM.positive, 0.08)
                            : withAlpha(CALM.neutral, 0.08),
                        },
                      ]}
                    >
                      <Feather
                        name={gain >= 0 ? 'arrow-up-right' : 'arrow-down-right'}
                        size={14}
                        color={gain >= 0 ? CALM.positive : CALM.neutral}
                      />
                      <Text
                        style={[
                          styles.gainText,
                          { color: gain >= 0 ? CALM.positive : CALM.neutral },
                        ]}
                      >
                        {gain >= 0 ? '+' : ''}
                        {returnPct.toFixed(1)}%
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.gainAbsolute,
                        { color: gain >= 0 ? CALM.positive : CALM.neutral },
                      ]}
                    >
                      {gain >= 0 ? '+' : ''}
                      {currency} {gain.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Last updated + change */}
                <View style={styles.lastUpdatedRow}>
                  <Feather name="clock" size={12} color={CALM.neutral} />
                  <Text style={styles.lastUpdatedText}>
                    {lastSnapshot
                      ? `Updated ${formatDistanceToNow(lastSnapshot.date, { addSuffix: true })}`
                      : 'No updates'}
                  </Text>
                  {lastChange !== null && (
                    <Text
                      style={[
                        styles.lastChangeText,
                        { color: lastChange >= 0 ? CALM.positive : CALM.neutral },
                      ]}
                    >
                      {lastChange >= 0 ? '+' : ''}
                      {currency} {lastChange.toFixed(2)}
                    </Text>
                  )}
                </View>

                {/* Action buttons */}
                <View style={styles.accountActions}>
                  <TouchableOpacity
                    style={styles.updateValueBtn}
                    onPress={() => openUpdateValue(account)}
                    activeOpacity={0.7}
                  >
                    <Feather name="refresh-cw" size={14} color={CALM.accent} />
                    <Text style={styles.updateValueText}>Update Value</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.historyBtn}
                    onPress={() => openHistory(account)}
                    activeOpacity={0.7}
                  >
                    <Feather name="list" size={14} color={CALM.textSecondary} />
                    <Text style={styles.historyBtnText}>History</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon="trending-up"
            title="No Savings Accounts"
            message="Start tracking your investments — TNG+, ESA, Bank, and more"
            actionLabel="Add Account"
            onAction={openAdd}
          />
        )}
      </ScrollView>

      {/* ── FAB: Add Account ── */}
      {accounts.length < MAX_ACCOUNTS && (
        <Button
          title={`Add Account (${accounts.length}/${MAX_ACCOUNTS})`}
          onPress={openAdd}
          icon="plus"
          size="large"
          style={styles.fab}
        />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setModalVisible(false); resetForm(); }}>
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingAccount ? 'Edit Account' : 'Add Account'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                >
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>Account Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. My TNG GO+, Wahed Invest"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="next"
                />

                <Text style={styles.label}>Investment Type</Text>
                {/* Dropdown selector */}
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setTypeDropdownOpen(!typeDropdownOpen)}
                  activeOpacity={0.7}
                >
                  <View style={styles.dropdownTriggerLeft}>
                    <View
                      style={[
                        styles.dropdownIcon,
                        { backgroundColor: withAlpha(getTypeInfo(selectedType).color, 0.12) },
                      ]}
                    >
                      <Feather
                        name={getTypeInfo(selectedType).icon as keyof typeof Feather.glyphMap}
                        size={16}
                        color={getTypeInfo(selectedType).color}
                      />
                    </View>
                    <Text style={styles.dropdownTriggerText}>
                      {getTypeInfo(selectedType).name}
                    </Text>
                  </View>
                  <Feather
                    name={typeDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={CALM.textSecondary}
                  />
                </TouchableOpacity>

                {typeDropdownOpen && (
                  <View style={styles.dropdownList}>
                    {investmentTypes.map((type) => {
                      const isSelected = selectedType === type.id;
                      return (
                        <TouchableOpacity
                          key={type.id}
                          style={[
                            styles.dropdownItem,
                            isSelected && styles.dropdownItemSelected,
                          ]}
                          onPress={() => {
                            setSelectedType(type.id);
                            setTypeDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[
                              styles.dropdownItemIcon,
                              { backgroundColor: withAlpha(type.color, 0.12) },
                            ]}
                          >
                            <Feather name={type.icon as keyof typeof Feather.glyphMap} size={16} color={type.color} />
                          </View>
                          <Text
                            style={[
                              styles.dropdownItemText,
                              isSelected && { color: CALM.accent, fontWeight: TYPOGRAPHY.weight.bold },
                            ]}
                          >
                            {type.name}
                          </Text>
                          {isSelected && (
                            <Feather name="check" size={16} color={CALM.accent} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Description for "Other" or custom types */}
                {(selectedType === 'other' || selectedType.startsWith('custom_')) && (
                  <>
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                      style={styles.input}
                      value={description}
                      onChangeText={setDescription}
                      placeholder="e.g. Stashaway, Gold, Mutual Fund"
                      placeholderTextColor={CALM.textSecondary}
                      returnKeyType="next"
                    />
                  </>
                )}

                <Text style={styles.label}>Initial Investment</Text>
                <TextInput
                  style={styles.input}
                  value={initialInvestment}
                  onChangeText={setInitialInvestment}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.label}>Current Value</Text>
                <TextInput
                  style={styles.input}
                  value={currentValue}
                  onChangeText={setCurrentValue}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => {
                      setModalVisible(false);
                      resetForm();
                    }}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={editingAccount ? 'Update' : 'Add'}
                    onPress={handleSave}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>
            </View>
        </Pressable>
      </Modal>

      {/* ── Update Value Modal ── */}
      <Modal
        visible={updateModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setUpdateModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setUpdateModalVisible(false); }}>
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Update Value</Text>
                <TouchableOpacity
                  onPress={() => setUpdateModalVisible(false)}
                >
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              {updatingAccount && (
                <View style={styles.updateContext}>
                  <Text style={styles.updateContextName}>
                    {updatingAccount.name}
                  </Text>
                  <Text style={styles.updateContextPrev}>
                    Current: {currency}{' '}
                    {updatingAccount.currentValue.toFixed(2)}
                  </Text>
                </View>
              )}

              <KeyboardAwareScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>New Value</Text>
                <TextInput
                  style={styles.input}
                  value={newValue}
                  onChangeText={setNewValue}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="next"
                  autoFocus
                />

                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={updateNote}
                  onChangeText={setUpdateNote}
                  placeholder="e.g. Monthly update, market change"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                {updatingAccount && newValue && parseFloat(newValue) > 0 && (
                  <View style={styles.updatePreview}>
                    {(() => {
                      const nv = parseFloat(newValue);
                      const diff = nv - updatingAccount.currentValue;
                      const pct =
                        updatingAccount.currentValue > 0
                          ? (diff / updatingAccount.currentValue) * 100
                          : 0;
                      return (
                        <>
                          <Text style={styles.updatePreviewLabel}>
                            Change from current
                          </Text>
                          <Text
                            style={[
                              styles.updatePreviewValue,
                              {
                                color:
                                  diff >= 0 ? CALM.positive : CALM.neutral,
                              },
                            ]}
                          >
                            {diff >= 0 ? '+' : ''}
                            {currency} {diff.toFixed(2)} ({pct >= 0 ? '+' : ''}
                            {pct.toFixed(1)}%)
                          </Text>
                        </>
                      );
                    })()}
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => setUpdateModalVisible(false)}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Save"
                    onPress={handleUpdateValue}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>
            </View>
        </Pressable>
      </Modal>

      {/* ── Full History Modal ── */}
      <Modal
        visible={historyModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setHistoryModalVisible(false); }}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {historyAccount?.name || 'History'}
              </Text>
              <TouchableOpacity
                onPress={() => setHistoryModalVisible(false)}
              >
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            {historyAccount && (
              <View style={styles.historyHeaderSummary}>
                <View style={styles.historyHeaderCol}>
                  <Text style={styles.historyHeaderLabel}>Invested</Text>
                  <Text style={styles.historyHeaderValue}>
                    {currency} {historyAccount.initialInvestment.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.historyHeaderCol}>
                  <Text style={styles.historyHeaderLabel}>Current</Text>
                  <Text style={styles.historyHeaderValue}>
                    {currency} {historyAccount.currentValue.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.historyHeaderCol}>
                  <Text style={styles.historyHeaderLabel}>Return</Text>
                  <Text
                    style={[
                      styles.historyHeaderValue,
                      {
                        color:
                          historyAccount.currentValue >=
                          historyAccount.initialInvestment
                            ? CALM.positive
                            : CALM.neutral,
                      },
                    ]}
                  >
                    {historyAccount.initialInvestment > 0
                      ? `${(
                          ((historyAccount.currentValue -
                            historyAccount.initialInvestment) /
                            historyAccount.initialInvestment) *
                          100
                        ).toFixed(1)}%`
                      : '—'}
                  </Text>
                </View>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              {historyAccount?.history
                .slice()
                .reverse()
                .map((snap, idx, arr) => {
                  const next = idx < arr.length - 1 ? arr[idx + 1] : null;
                  const diff = next ? snap.value - next.value : null;
                  return (
                    <View key={snap.id} style={styles.historyItem}>
                      <View style={styles.historyItemLeft}>
                        <Text style={styles.historyItemDate}>
                          {format(snap.date, 'MMM dd, yyyy')}
                        </Text>
                        <Text style={styles.historyItemTime}>
                          {format(snap.date, 'hh:mm a')}
                          {snap.note ? ` — ${snap.note}` : ''}
                        </Text>
                      </View>
                      <View style={styles.historyItemRight}>
                        <Text style={styles.historyItemValue}>
                          {currency} {snap.value.toFixed(2)}
                        </Text>
                        {diff !== null && (
                          <Text
                            style={[
                              styles.historyItemDiff,
                              {
                                color:
                                  diff >= 0 ? CALM.positive : CALM.neutral,
                              },
                            ]}
                          >
                            {diff >= 0 ? '+' : ''}
                            {diff.toFixed(2)}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

// ── STYLES ──────────────────────────────────────────────────
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
    paddingBottom: 80,
  },

  // Hero (bordered card, no gradient)
  heroCard: {
    padding: SPACING['2xl'],
    borderRadius: RADIUS.xl,
    marginBottom: SPACING['2xl'],
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
  },
  heroAmount: {
    fontSize: TYPE.amount.fontSize,
    fontWeight: TYPE.amount.fontWeight,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.lg,
  },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  heroStatDivider: {
    width: 1,
    backgroundColor: CALM.border,
  },
  heroStatSmallLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  heroStatSmallValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  heroCounter: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    textAlign: 'right',
    marginTop: SPACING.sm,
  },

  // Account Card
  accountCard: {
    marginBottom: SPACING.xl,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  accountTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  accountTypeBadge: {
    alignSelf: 'flex-start',
  },
  accountTypeBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  iconBtn: {
    padding: SPACING.sm,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Value section
  valueSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  valueCurrent: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  valueInvested: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  gainContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },
  gainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  gainText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  gainAbsolute: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },

  // Last updated
  lastUpdatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    marginBottom: SPACING.sm,
  },
  lastUpdatedText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
  },
  lastChangeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },

  // Account action buttons
  accountActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  updateValueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderRadius: RADIUS.md,
  },
  updateValueText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  historyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  historyBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
  },

  // Modal shared
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
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },

  // Dropdown type selector
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  dropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dropdownIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownTriggerText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  dropdownList: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: CALM.border,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  dropdownItemSelected: {
    backgroundColor: withAlpha(CALM.accent, 0.06),
  },
  dropdownItemIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },

  // Update value modal context
  updateContext: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  updateContextName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  updateContextPrev: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  updatePreview: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  updatePreviewLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginBottom: 4,
  },
  updatePreviewValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },

  // History modal
  historyHeaderSummary: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  historyHeaderCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  historyHeaderLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  historyHeaderValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  historyItemLeft: {
    flex: 1,
  },
  historyItemDate: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  historyItemTime: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 1,
  },
  historyItemRight: {
    alignItems: 'flex-end',
  },
  historyItemValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  historyItemDiff: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
});

export default SavingsTracker;
