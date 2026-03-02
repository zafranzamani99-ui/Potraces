import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Keyboard,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { usePersonalStore } from '../../store/personalStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { IngredientCost } from '../../types';
import { createTransfer } from '../../utils/transferBridge';
import {
  lightTap,
  successNotification,
  warningNotification,
} from '../../services/haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Animation helper ────────────────────────────────────────
function useFadeSlide(delay: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return { opacity, transform: [{ translateY }] };
}

// ─── Component ───────────────────────────────────────────────
const CostManagement: React.FC = () => {
  const {
    ingredientCosts,
    orders,
    seasons,
    addIngredientCost,
    updateIngredientCost,
    deleteIngredientCost,
    markCostSynced,
    markOrdersTransferred,
    updateSeasonBudget,
  } = useSellerStore();
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const deletePersonalTransaction = usePersonalStore((s) => s.deleteTransaction);
  const addTransferIncome = usePersonalStore((s) => s.addTransferIncome);
  const addTransfer = useBusinessStore((s) => s.addTransfer);
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();

  // ─── Cost modal state ──────────────────────────────────────
  const [showCostModal, setShowCostModal] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [syncToPersonal, setSyncToPersonal] = useState(false);
  const [costDescError, setCostDescError] = useState(false);
  const [costAmtError, setCostAmtError] = useState(false);
  const costDescShakeAnim = useRef(new Animated.Value(0)).current;
  const costAmtShakeAnim = useRef(new Animated.Value(0)).current;

  // ─── Budget modal state ────────────────────────────────────
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  // ─── Transfer state ────────────────────────────────────────
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');

  // ─── Animations ────────────────────────────────────────────
  const summaryAnim = useFadeSlide(0);
  const budgetAnim = useFadeSlide(60);
  const transferAnim = useFadeSlide(120);
  const historyAnim = useFadeSlide(180);

  // ─── Computed ──────────────────────────────────────────────
  const seasonStats = useMemo(() => {
    const seasonCosts = activeSeason
      ? ingredientCosts.filter((c) => c.seasonId === activeSeason.id)
      : ingredientCosts;
    const seasonOrders = activeSeason
      ? orders.filter((o) => o.seasonId === activeSeason.id)
      : orders;
    const totalIncome = seasonOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
    const totalCosts = seasonCosts.reduce((s, c) => s + c.amount, 0);
    return { totalIncome, totalCosts, profit: totalIncome - totalCosts };
  }, [activeSeason, ingredientCosts, orders]);

  const seasonCostEntries = useMemo(() => {
    const entries = activeSeason
      ? ingredientCosts.filter((c) => c.seasonId === activeSeason.id)
      : [...ingredientCosts];
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeSeason, ingredientCosts]);

  const budget = activeSeason?.costBudget;
  const budgetPercent = budget && budget > 0 ? Math.round((seasonStats.totalCosts / budget) * 100) : 0;

  const untransferredOrders = useMemo(() => {
    if (activeSeason) {
      return orders.filter(
        (o) => o.seasonId === activeSeason.id && o.isPaid && !o.transferredToPersonal
      );
    }
    return orders.filter((o) => o.isPaid && !o.transferredToPersonal);
  }, [activeSeason, orders]);

  const untransferredAmount = useMemo(
    () => untransferredOrders.reduce((s, o) => s + o.totalAmount, 0),
    [untransferredOrders]
  );

  useEffect(() => {
    if (untransferredAmount > 0) {
      setTransferAmount(untransferredAmount.toFixed(2));
    }
  }, [untransferredAmount]);

  // ─── Helpers ───────────────────────────────────────────────
  const shakeField = (anim: Animated.Value) => {
    anim.setValue(0);
    Animated.sequence([
      Animated.timing(anim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(anim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(anim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => { if (costDescription) setCostDescError(false); }, [costDescription]);
  useEffect(() => { if (costAmount) setCostAmtError(false); }, [costAmount]);

  // ─── Handlers ──────────────────────────────────────────────
  const handleOpenCostModal = useCallback((costToEdit?: IngredientCost) => {
    lightTap();
    if (costToEdit) {
      setEditingCostId(costToEdit.id);
      setCostDescription(costToEdit.description);
      setCostAmount(costToEdit.amount.toString());
    } else {
      setEditingCostId(null);
      setCostDescription('');
      setCostAmount('');
    }
    setCostDescError(false);
    setCostAmtError(false);
    setSyncToPersonal(false);
    setShowCostModal(true);
  }, []);

  const handleSaveCost = useCallback(() => {
    const hasDescErr = !costDescription.trim();
    const hasAmtErr = !costAmount.trim();

    setCostDescError(hasDescErr);
    setCostAmtError(hasAmtErr);
    if (hasDescErr) shakeField(costDescShakeAnim);
    if (hasAmtErr) shakeField(costAmtShakeAnim);

    if (hasDescErr || hasAmtErr) {
      warningNotification();
      showToast('please fill in description and amount', 'error');
      return;
    }

    const amount = parseFloat(costAmount) || 0;
    const desc = costDescription.trim();

    if (editingCostId) {
      // Read sync status directly from store (not closure) to avoid stale data
      const currentCost = useSellerStore.getState().ingredientCosts.find((c) => c.id === editingCostId);
      updateIngredientCost(editingCostId, { description: desc, amount });
      // Also update linked personal expense if synced
      if (currentCost?.syncedToPersonal && currentCost.personalTransactionId) {
        usePersonalStore.getState().updateTransaction(currentCost.personalTransactionId, {
          amount,
          description: `seller: ${desc}`,
        });
      }
      successNotification();
      showToast('cost updated', 'success');
    } else {
      // Create personal expense first (if toggled) so we get the real ID
      let personalTxId: string | undefined;
      if (syncToPersonal) {
        personalTxId = addTransaction({
          amount,
          category: 'business cost',
          description: `seller: ${desc}`,
          date: new Date(),
          type: 'expense',
          mode: 'personal',
          inputMethod: 'manual',
        });
      }

      const costId = addIngredientCost({
        description: desc,
        amount,
        date: new Date(),
        seasonId: activeSeason?.id,
      });

      if (syncToPersonal && personalTxId) {
        markCostSynced(costId, personalTxId);
      }

      successNotification();
      showToast(syncToPersonal ? 'cost logged + personal expense' : 'cost logged', 'success');
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowCostModal(false);
    setEditingCostId(null);
    setCostDescription('');
    setCostAmount('');
    setSyncToPersonal(false);
  }, [costDescription, costAmount, editingCostId, syncToPersonal, addIngredientCost, updateIngredientCost, addTransaction, markCostSynced, activeSeason, showToast]);

  const handleDeleteCost = useCallback((cost: IngredientCost) => {
    warningNotification();
    const msg = cost.syncedToPersonal
      ? `Remove "${cost.description}" (${currency} ${cost.amount.toFixed(2)})?\n\nThis will also remove the linked personal expense.`
      : `Remove "${cost.description}" (${currency} ${cost.amount.toFixed(2)})?`;
    Alert.alert(
      'Delete cost?',
      msg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            // Also delete linked personal expense if synced
            if (cost.syncedToPersonal && cost.personalTransactionId) {
              deletePersonalTransaction(cost.personalTransactionId);
            }
            deleteIngredientCost(cost.id);
            showToast('cost deleted', 'success');
          },
        },
      ]
    );
  }, [currency, deleteIngredientCost, deletePersonalTransaction, showToast]);

  const handleSaveBudget = useCallback(() => {
    if (!activeSeason) return;
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val <= 0) {
      updateSeasonBudget(activeSeason.id, undefined);
      showToast('budget cleared', 'success');
    } else {
      updateSeasonBudget(activeSeason.id, val);
      showToast('budget set', 'success');
    }
    successNotification();
    setShowBudgetModal(false);
  }, [activeSeason, budgetInput, updateSeasonBudget, showToast]);

  const handleTransferToPersonal = useCallback(() => {
    const amount = parseFloat(transferAmount);
    if (!amount || amount <= 0) return;

    const label = activeSeason
      ? `seller: ${activeSeason.name} (${untransferredOrders.length} orders)`
      : `seller: ${untransferredOrders.length} orders`;

    const transfer = createTransfer(amount, 'business', 'personal', label);
    addTransfer(transfer);
    addTransferIncome(transfer);
    markOrdersTransferred(
      untransferredOrders.map((o) => o.id),
      transfer.id
    );
    successNotification();
    showToast('transferred to personal', 'success');
    setShowTransfer(false);
  }, [transferAmount, activeSeason, untransferredOrders, addTransfer, addTransferIncome, markOrdersTransferred, showToast]);

  // ─── Budget bar color ──────────────────────────────────────
  const budgetColor = budgetPercent >= 100
    ? BIZ.loss
    : budgetPercent >= 80
    ? CALM.bronze
    : BIZ.profit;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Profit Summary ──────────────────────────────── */}
        <Animated.View style={[styles.summaryCard, summaryAnim]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryLabel}>income</Text>
              <Text style={styles.summaryValue}>
                {currency} {seasonStats.totalIncome.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryLabel}>costs</Text>
              <Text style={styles.summaryValue}>
                {currency} {seasonStats.totalCosts.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryLabel}>profit</Text>
              <Text
                style={[
                  styles.summaryValue,
                  seasonStats.profit >= 0 ? styles.summaryProfit : styles.summaryLoss,
                ]}
              >
                {currency} {seasonStats.profit.toFixed(2)}
              </Text>
            </View>
          </View>
          {activeSeason && (
            <Text style={styles.summarySeasonLabel}>
              season: {activeSeason.name}
            </Text>
          )}
        </Animated.View>

        {/* ─── Budget Bar ──────────────────────────────────── */}
        {activeSeason && (
          <Animated.View style={[styles.budgetCard, budgetAnim]}>
            <View style={styles.budgetHeader}>
              <View style={styles.budgetHeaderLeft}>
                <Feather name="pie-chart" size={16} color={CALM.textSecondary} />
                <Text style={styles.budgetTitle}>cost budget</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  lightTap();
                  setBudgetInput(budget ? budget.toString() : '');
                  setShowBudgetModal(true);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={budget ? "Edit cost budget" : "Set cost budget"}
              >
                <Feather name={budget ? 'edit-2' : 'plus'} size={16} color={CALM.bronze} />
              </TouchableOpacity>
            </View>

            {budget && budget > 0 ? (
              <View style={styles.budgetBarSection}>
                <View style={styles.budgetTrack}>
                  <View
                    style={[
                      styles.budgetFill,
                      {
                        width: `${Math.min(budgetPercent, 100)}%`,
                        backgroundColor: budgetColor,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.budgetText, { color: budgetColor }]}>
                  {currency} {seasonStats.totalCosts.toFixed(2)} / {currency} {budget.toFixed(2)} — {budgetPercent}% used
                </Text>
              </View>
            ) : (
              <Text style={styles.budgetHint}>
                set a spending limit for this season
              </Text>
            )}
          </Animated.View>
        )}

        {/* ─── Transfer to Personal ────────────────────────── */}
        {untransferredAmount > 0 && (
          <Animated.View style={[styles.transferCard, transferAnim]}>
            <View style={styles.transferHeader}>
              <View style={styles.transferHeaderLeft}>
                <Feather name="refresh-cw" size={16} color={CALM.bronze} />
                <Text style={styles.transferTitle}>transfer to personal</Text>
              </View>
            </View>

            <Text style={styles.transferSubtext}>
              {currency} {untransferredAmount.toFixed(2)} from {untransferredOrders.length} paid order{untransferredOrders.length !== 1 ? 's' : ''} not yet in personal wallet
            </Text>

            {showTransfer ? (
              <View style={styles.transferInputRow}>
                <View style={styles.transferInputWrap}>
                  <Text style={styles.transferPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.transferInput}
                    value={transferAmount}
                    onChangeText={setTransferAmount}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                </View>
                <TouchableOpacity
                  style={styles.transferConfirmBtn}
                  activeOpacity={0.7}
                  onPress={handleTransferToPersonal}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm transfer"
                >
                  <Feather name="check" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.transferBtn}
                activeOpacity={0.7}
                onPress={() => { lightTap(); setShowTransfer(true); }}
                accessibilityRole="button"
                accessibilityLabel="Transfer to personal wallet"
              >
                <Text style={styles.transferBtnText}>transfer</Text>
                <Feather name="arrow-right" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* ─── Cost History ────────────────────────────────── */}
        <Animated.View style={[styles.historyCard, historyAnim]}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>
              cost history
            </Text>
            <View style={styles.historyBadge}>
              <Text style={styles.historyBadgeText}>{seasonCostEntries.length}</Text>
            </View>
          </View>

          {seasonCostEntries.length === 0 ? (
            <Text style={styles.historyEmpty}>no costs logged yet</Text>
          ) : (
            seasonCostEntries.map((cost, i) => (
              <View key={cost.id}>
                {i > 0 && <View style={styles.historyItemDivider} />}
                <View style={styles.historyItem}>
                  <TouchableOpacity
                    style={styles.historyItemTappable}
                    activeOpacity={0.7}
                    onPress={() => handleOpenCostModal(cost)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${cost.description}`}
                  >
                    <View style={styles.historyItemLeft}>
                      <View style={styles.historyItemDescRow}>
                        <Text style={styles.historyItemDesc}>{cost.description}</Text>
                        {cost.syncedToPersonal && (
                          <Feather name="link" size={10} color={CALM.textMuted} />
                        )}
                      </View>
                      <Text style={styles.historyItemDate}>
                        {format(new Date(cost.date), 'dd MMM yyyy')}
                      </Text>
                    </View>
                    <Text style={styles.historyItemAmount}>
                      {currency} {cost.amount.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteCost(cost)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${cost.description}`}
                  >
                    <Feather name="trash-2" size={14} color={CALM.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </Animated.View>
      </ScrollView>

      {/* ─── FAB: Log Cost ──────────────────────────────────── */}
      <View style={styles.fabWrapper}>
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.7}
          onPress={() => handleOpenCostModal()}
          accessibilityRole="button"
          accessibilityLabel="Log new cost"
        >
          <Feather name="plus" size={20} color="#fff" />
          <Text style={styles.fabText}>log cost</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Cost Modal ─────────────────────────────────────── */}
      <Modal visible={showCostModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Pressable style={styles.modalContent} onPress={() => Keyboard.dismiss()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingCostId ? 'edit cost' : 'log ingredient cost'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    lightTap();
                    setEditingCostId(null);
                    setShowCostModal(false);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={20} color={CALM.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.costDateRow}>
                <Feather name="calendar" size={12} color={CALM.textMuted} />
                <Text style={styles.costDateText}>
                  {editingCostId
                    ? format(
                        ingredientCosts.find((c) => c.id === editingCostId)?.date ?? new Date(),
                        'dd MMM yyyy'
                      )
                    : format(new Date(), 'dd MMM yyyy')}
                </Text>
              </View>

              <Animated.View style={{ transform: [{ translateX: costDescShakeAnim }] }}>
                <TextInput
                  style={[styles.modalInput, costDescError && styles.modalInputError]}
                  value={costDescription}
                  onChangeText={setCostDescription}
                  placeholder="e.g. tepung, gula, mentega"
                  placeholderTextColor={CALM.textMuted}
                  autoFocus
                />
              </Animated.View>

              <Animated.View style={{ transform: [{ translateX: costAmtShakeAnim }] }}>
                <View
                  style={[
                    styles.currencyInputRow,
                    costAmtError && styles.currencyInputRowError,
                  ]}
                >
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.currencyInput}
                    value={costAmount}
                    onChangeText={setCostAmount}
                    placeholder="0.00"
                    placeholderTextColor={CALM.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
              </Animated.View>

              {/* Sync to personal toggle — only for new costs */}
              {!editingCostId && (
                <TouchableOpacity
                  style={styles.syncToggleRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    lightTap();
                    setSyncToPersonal((v) => !v);
                  }}
                >
                  <View
                    style={[
                      styles.syncToggleBox,
                      syncToPersonal && styles.syncToggleBoxActive,
                    ]}
                  >
                    {syncToPersonal && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <Text style={styles.syncToggleText}>also record as personal expense</Text>
                </TouchableOpacity>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => {
                    lightTap();
                    setEditingCostId(null);
                    setSyncToPersonal(false);
                    setShowCostModal(false);
                  }}
                  style={styles.modalCancel}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalCancelText}>cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveCost}
                  style={styles.modalConfirm}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={editingCostId ? 'Save cost' : 'Log cost'}
                >
                  <Text style={styles.modalConfirmText}>
                    {editingCostId ? 'save' : 'log'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
      </Modal>

      {/* ─── Budget Modal ───────────────────────────────────── */}
      <Modal visible={showBudgetModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Pressable style={styles.modalContent} onPress={() => Keyboard.dismiss()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>cost budget</Text>
                <TouchableOpacity
                  onPress={() => { lightTap(); setShowBudgetModal(false); }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={20} color={CALM.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.budgetModalHint}>
                set a spending limit for "{activeSeason?.name || 'this season'}"
              </Text>

              <View style={styles.currencyInputRow}>
                <Text style={styles.currencyPrefix}>{currency}</Text>
                <TextInput
                  style={styles.currencyInput}
                  value={budgetInput}
                  onChangeText={setBudgetInput}
                  placeholder="0.00"
                  placeholderTextColor={CALM.textMuted}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>

              <View style={styles.modalActions}>
                {budget ? (
                  <TouchableOpacity
                    onPress={() => {
                      lightTap();
                      if (activeSeason) {
                        updateSeasonBudget(activeSeason.id, undefined);
                        showToast('budget cleared', 'success');
                      }
                      setShowBudgetModal(false);
                    }}
                    style={styles.modalCancel}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Clear budget"
                  >
                    <Text style={styles.modalCancelText}>clear</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => { lightTap(); setShowBudgetModal(false); }}
                    style={styles.modalCancel}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.modalCancelText}>cancel</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleSaveBudget}
                  style={styles.modalConfirm}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Save budget"
                >
                  <Text style={styles.modalConfirmText}>save</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
      </Modal>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING['4xl'],
    gap: SPACING.md,
  },

  // ── Summary card ────────────────────────────────────────────
  summaryCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  summaryProfit: {
    color: BIZ.profit,
  },
  summaryLoss: {
    color: BIZ.loss,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: CALM.border,
  },
  summarySeasonLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  // ── Budget card ─────────────────────────────────────────────
  budgetCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  budgetTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  budgetBarSection: {
    marginTop: SPACING.sm,
    gap: 4,
  },
  budgetTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    overflow: 'hidden' as const,
  },
  budgetFill: {
    height: '100%',
    borderRadius: 2,
  },
  budgetText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontVariant: ['tabular-nums'] as any,
  },
  budgetHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: SPACING.xs,
  },

  // ── Transfer card ───────────────────────────────────────────
  transferCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transferHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  transferTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },
  transferSubtext: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: SPACING.xs,
    fontVariant: ['tabular-nums'] as any,
  },
  transferInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  transferInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    height: 36,
  },
  transferPrefix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    marginRight: 4,
  },
  transferInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textPrimary,
    padding: 0,
    fontVariant: ['tabular-nums'] as any,
  },
  transferConfirmBtn: {
    backgroundColor: CALM.bronze,
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },
  transferBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: '#fff',
  },

  // ── History card ────────────────────────────────────────────
  historyCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  historyTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  historyBadge: {
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    minWidth: 22,
    alignItems: 'center',
  },
  historyBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'] as any,
  },
  historyEmpty: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  historyItemDivider: {
    height: 1,
    backgroundColor: CALM.border,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  historyItemTappable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  historyItemLeft: {
    flex: 1,
  },
  historyItemDescRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyItemDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  historyItemDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 1,
  },
  historyItemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── FAB ─────────────────────────────────────────────────────
  fabWrapper: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    ...SHADOWS.sm,
  },
  fabText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: '#fff',
  },

  // ── Modals ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    gap: SPACING.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textPrimary,
  },
  modalInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md + 2,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  modalInputError: {
    borderColor: '#D4775C',
    backgroundColor: withAlpha('#D4775C', 0.04),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  modalCancel: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  modalConfirm: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: '#fff',
  },
  costDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  costDateText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  currencyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingLeft: SPACING.md,
  },
  currencyInputRowError: {
    borderColor: '#D4775C',
    backgroundColor: withAlpha('#D4775C', 0.04),
  },
  currencyPrefix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    marginRight: SPACING.xs,
  },
  currencyInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    paddingVertical: SPACING.md + 2,
    paddingRight: SPACING.md,
    paddingLeft: 0,
  },
  syncToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  syncToggleBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncToggleBoxActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  syncToggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  budgetModalHint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
});

export default CostManagement;
