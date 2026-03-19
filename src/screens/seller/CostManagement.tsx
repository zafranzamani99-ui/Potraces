import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { format, isToday, isYesterday, isValid } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { usePersonalStore } from '../../store/personalStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { IngredientCost, RecurringFrequency } from '../../types';
import { createTransfer } from '../../utils/transferBridge';
import {
  lightTap,
  successNotification,
  warningNotification,
} from '../../services/haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { useFadeSlide } from '../../utils/fadeSlide';

// ─── Component ───────────────────────────────────────────────
const CostManagement: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const ingredientCosts = useSellerStore((s) => s.ingredientCosts);
  const orders = useSellerStore((s) => s.orders);
  const seasons = useSellerStore((s) => s.seasons);
  const addIngredientCost = useSellerStore((s) => s.addIngredientCost);
  const updateIngredientCost = useSellerStore((s) => s.updateIngredientCost);
  const deleteIngredientCost = useSellerStore((s) => s.deleteIngredientCost);
  const markCostSynced = useSellerStore((s) => s.markCostSynced);
  const markOrdersTransferred = useSellerStore((s) => s.markOrdersTransferred);
  const updateSeasonBudget = useSellerStore((s) => s.updateSeasonBudget);
  const costTemplates = useSellerStore((s) => s.costTemplates);
  const addCostTemplate = useSellerStore((s) => s.addCostTemplate);
  const updateCostTemplate = useSellerStore((s) => s.updateCostTemplate);
  const deleteCostTemplate = useSellerStore((s) => s.deleteCostTemplate);
  const recurringCosts = useSellerStore((s) => s.recurringCosts);
  const addRecurringCost = useSellerStore((s) => s.addRecurringCost);
  const deleteRecurringCost = useSellerStore((s) => s.deleteRecurringCost);
  const applyRecurringCost = useSellerStore((s) => s.applyRecurringCost);
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const deletePersonalTransaction = usePersonalStore((s) => s.deleteTransaction);
  const addTransferIncome = usePersonalStore((s) => s.addTransferIncome);
  const addTransfer = useBusinessStore((s) => s.addTransfer);
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();

  // ─── Recurring cost state ──────────────────────────────────
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringDesc, setRecurringDesc] = useState('');
  const [recurringAmount, setRecurringAmount] = useState('');
  const [recurringFreq, setRecurringFreq] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');

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

  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateAmt, setTemplateAmt] = useState('');
  const [showTemplateEditModal, setShowTemplateEditModal] = useState(false);

  // ─── Search state ──────────────────────────────────────────
  const [costSearch, setCostSearch] = useState('');

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
  const now = useMemo(() => new Date(), []);
  const seasonStats = useMemo(() => {
    const seasonCosts = activeSeason
      ? ingredientCosts.filter((c) => c.seasonId === activeSeason.id)
      : ingredientCosts;
    const seasonOrders = activeSeason
      ? orders.filter((o) => o.seasonId === activeSeason.id)
      : orders;
    const totalIncome = seasonOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
    const totalCosts = seasonCosts.reduce((s, c) => s + c.amount, 0);
    return { totalIncome, totalCosts, kept: totalIncome - totalCosts };
  }, [activeSeason, ingredientCosts, orders]);

  const seasonCostEntries = useMemo(() => {
    const entries = activeSeason
      ? ingredientCosts.filter((c) => c.seasonId === activeSeason.id)
      : [...ingredientCosts];
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeSeason, ingredientCosts]);

  const filteredCostEntries = useMemo(() => {
    if (!costSearch.trim()) return seasonCostEntries;
    const q = costSearch.trim().toLowerCase();
    return seasonCostEntries.filter((c) => {
      if (c.description.toLowerCase().includes(q)) return true;
      const d = c.date instanceof Date ? c.date : new Date(c.date);
      if (!isValid(d)) return false;
      const dateStr = format(d, 'dd MMM yyyy').toLowerCase();
      if (dateStr.includes(q)) return true;
      if (isToday(d) && 'today'.includes(q)) return true;
      if (isYesterday(d) && 'yesterday'.includes(q)) return true;
      return false;
    });
  }, [seasonCostEntries, costSearch]);

  const groupedCostEntries = useMemo(() => {
    const groups: { label: string; entries: IngredientCost[] }[] = [];
    const map = new Map<string, IngredientCost[]>();

    for (const entry of filteredCostEntries) {
      const d = entry.date instanceof Date ? entry.date : new Date(entry.date);
      let label: string;
      if (!isValid(d)) label = 'unknown';
      else if (isToday(d)) label = 'today';
      else if (isYesterday(d)) label = 'yesterday';
      else label = format(d, 'dd MMM yyyy');

      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(entry);
    }

    for (const [label, entries] of map) {
      groups.push({ label, entries });
    }

    return groups;
  }, [filteredCostEntries]);

  const { budget, budgetPercent, budgetColor } = useMemo(() => {
    const _budget = activeSeason?.costBudget;
    const _budgetPercent = _budget && _budget > 0 ? Math.round((seasonStats.totalCosts / _budget) * 100) : 0;
    const _budgetColor = _budgetPercent >= 100
      ? BIZ.loss
      : _budgetPercent >= 80
      ? C.bronze
      : BIZ.profit;
    return { budget: _budget, budgetPercent: _budgetPercent, budgetColor: _budgetColor };
  }, [activeSeason?.costBudget, seasonStats.totalCosts]);

  const untransferredOrders = useMemo(() => {
    if (activeSeason) {
      return orders.filter(
        (o) => o.seasonId === activeSeason.id && o.isPaid && !o.transferredToPersonal
      );
    }
    return orders.filter((o) => o.isPaid && !o.transferredToPersonal);
  }, [activeSeason, orders]);

  const untransferredAmount = useMemo(() => {
    const calculated = untransferredOrders.reduce((s, o) => s + o.totalAmount, 0);
    return isNaN(calculated) ? 0 : calculated;
  }, [untransferredOrders]);

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

      // Save as template if toggled
      if (saveAsTemplate) {
        addCostTemplate({ description: desc, amount });
      }

      showToast(syncToPersonal ? 'cost logged + personal expense' : 'cost logged', 'success');
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowCostModal(false);
    setEditingCostId(null);
    setCostDescription('');
    setCostAmount('');
    setSyncToPersonal(false);
    setSaveAsTemplate(false);
  }, [costDescription, costAmount, editingCostId, syncToPersonal, saveAsTemplate, addIngredientCost, updateIngredientCost, addTransaction, addCostTemplate, markCostSynced, activeSeason, showToast]);

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
    if (isNaN(amount) || !amount || amount <= 0) return;
    if (amount > untransferredAmount) {
      showToast('cannot transfer more than untransferred amount', 'error');
      return;
    }

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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {/* ─── Summary ──────────────────────────────── */}
        <Animated.View style={[styles.summaryCard, summaryAnim]}>
          {activeSeason && (
            <Text style={styles.summarySeasonLabel}>
              {activeSeason.name}
            </Text>
          )}
          <Text
            style={[
              styles.summaryHero,
              seasonStats.kept >= 0 ? styles.summaryHeroProfit : styles.summaryHeroLoss,
            ]}
          >
            {currency} {seasonStats.kept.toFixed(0)}
          </Text>
          <Text style={styles.summaryHeroLabel}>
            {seasonStats.kept >= 0 ? 'kept' : 'shortfall'}
          </Text>
          <View style={styles.summaryBreakdown}>
            <View style={styles.summaryBreakdownItem}>
              <Feather name="arrow-up-circle" size={14} color={BIZ.profit} />
              <Text style={styles.summaryBreakdownValue}>
                {currency} {seasonStats.totalIncome.toFixed(0)}
              </Text>
              <Text style={styles.summaryBreakdownLabel}>came in</Text>
            </View>
            <View style={styles.summaryBreakdownDot} />
            <View style={styles.summaryBreakdownItem}>
              <Feather name="arrow-down-circle" size={14} color={BIZ.loss} />
              <Text style={styles.summaryBreakdownValue}>
                {currency} {seasonStats.totalCosts.toFixed(0)}
              </Text>
              <Text style={styles.summaryBreakdownLabel}>costs</Text>
            </View>
          </View>
        </Animated.View>

        {/* ─── Budget Bar ──────────────────────────────────── */}
        {activeSeason && (
          <Animated.View style={[styles.budgetCard, budgetAnim]}>
            <View style={styles.budgetHeader}>
              <View style={styles.budgetHeaderLeft}>
                <View style={styles.budgetIconWrap}>
                  <Feather name="pie-chart" size={14} color={C.bronze} />
                </View>
                <Text style={styles.budgetTitle}>cost budget</Text>
              </View>
              <TouchableOpacity
                style={styles.budgetEditBtn}
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
                <Feather name={budget ? 'edit-2' : 'plus'} size={14} color={C.bronze} />
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
                <View style={styles.budgetTextRow}>
                  <Text style={[styles.budgetText, { color: budgetColor }]}>
                    {budgetPercent}% used
                  </Text>
                  <Text style={styles.budgetTextMuted}>
                    {currency} {seasonStats.totalCosts.toFixed(0)} / {currency} {budget.toFixed(0)}
                  </Text>
                </View>
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
                <View style={styles.transferIconWrap}>
                  <Feather name="refresh-cw" size={14} color={C.bronze} />
                </View>
                <View>
                  <Text style={styles.transferTitle}>transfer to personal</Text>
                  <Text style={styles.transferSubtext}>
                    {currency} {untransferredAmount.toFixed(0)} from {untransferredOrders.length} order{untransferredOrders.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            </View>

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

        {/* ─── Recurring Costs ────────────────────────────── */}
        {recurringCosts.length > 0 && (
          <View style={styles.recurringCard}>
            <View style={styles.recurringHeader}>
              <Feather name="repeat" size={14} color={C.bronze} />
              <Text style={styles.recurringTitle}>recurring</Text>
              <TouchableOpacity
                onPress={() => { setRecurringDesc(''); setRecurringAmount(''); setRecurringFreq('weekly'); setShowRecurringModal(true); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="plus" size={16} color={C.bronze} />
              </TouchableOpacity>
            </View>
            {recurringCosts.filter((r) => r.isActive).map((r) => {
              const dueDate = new Date(r.nextDue);
              const isDue = dueDate <= now;
              return (
                <View key={r.id} style={styles.recurringRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recurringDesc}>{r.description}</Text>
                    <Text style={styles.recurringMeta}>
                      {currency} {r.amount.toFixed(2)} · {r.frequency === 'weekly' ? 'weekly' : r.frequency === 'biweekly' ? 'every 2 weeks' : 'monthly'}
                    </Text>
                    <Text style={[styles.recurringDue, isDue && styles.recurringDueNow]}>
                      {isDue ? 'due now' : `next: ${format(dueDate, 'dd MMM')}`}
                    </Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.recurringApplyBtn, !isDue && styles.recurringApplyBtnMuted]}
                      onPress={() => {
                        if (!activeSeason) {
                          showToast('start a season first to log costs.', 'error');
                          return;
                        }
                        lightTap();
                        applyRecurringCost(r.id, activeSeason.id);
                        showToast(`${r.description} logged.`, 'success');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.recurringApplyText, !isDue && { color: C.textMuted }]}>apply</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { warningNotification(); deleteRecurringCost(r.id); }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Feather name="trash-2" size={14} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {recurringCosts.length === 0 && (
          <TouchableOpacity
            style={styles.recurringAddRow}
            onPress={() => { setRecurringDesc(''); setRecurringAmount(''); setRecurringFreq('weekly'); setShowRecurringModal(true); }}
            activeOpacity={0.7}
          >
            <Feather name="repeat" size={14} color={C.textMuted} />
            <Text style={styles.recurringAddText}>add recurring cost</Text>
          </TouchableOpacity>
        )}

        {/* ─── Cost History ────────────────────────────────── */}
        <Animated.View style={[styles.historyCard, historyAnim]}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>cost history</Text>
            <View style={styles.historyBadge}>
              <Text style={styles.historyBadgeText}>{seasonCostEntries.length}</Text>
            </View>
          </View>

          {seasonCostEntries.length > 0 && (
            <View style={styles.historySearchBar}>
              <Feather name="search" size={14} color={C.textMuted} />
              <TextInput
                style={styles.historySearchInput}
                placeholder="search costs..."
                placeholderTextColor={C.textMuted}
                value={costSearch}
                onChangeText={setCostSearch}
                returnKeyType="search"
              />
              {costSearch.length > 0 && (
                <TouchableOpacity
                  onPress={() => setCostSearch('')}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={14} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {seasonCostEntries.length === 0 ? (
            <View style={styles.historyEmptyWrap}>
              <Feather name="inbox" size={24} color={C.textMuted} />
              <Text style={styles.historyEmpty}>no costs logged yet</Text>
            </View>
          ) : filteredCostEntries.length === 0 ? (
            <View style={styles.historyEmptyWrap}>
              <Feather name="search" size={18} color={C.textMuted} />
              <Text style={styles.historyEmpty}>no match</Text>
            </View>
          ) : (
            groupedCostEntries.map((group, gi) => (
              <View key={group.label}>
                <View style={[styles.historySectionHeader, gi > 0 && styles.historySectionHeaderSpaced]}>
                  <Text style={styles.historySectionLabel}>{group.label}</Text>
                  <View style={styles.historySectionLine} />
                </View>
                {group.entries.map((cost, i) => {
                  const initial = cost.description.charAt(0).toUpperCase();
                  return (
                    <View key={cost.id}>
                      {i > 0 && <View style={styles.historyItemDivider} />}
                      <TouchableOpacity
                        style={styles.historyItemRow}
                        activeOpacity={0.65}
                        onPress={() => handleOpenCostModal(cost)}
                        onLongPress={() => handleDeleteCost(cost)}
                        delayLongPress={500}
                        accessibilityRole="button"
                        accessibilityLabel={`${cost.description}, ${currency} ${cost.amount.toFixed(2)}. Tap to edit, hold to delete.`}
                      >
                        <View style={styles.historyAvatar}>
                          <Text style={styles.historyAvatarText}>{initial}</Text>
                        </View>
                        <View style={styles.historyItemContent}>
                          <View style={styles.historyItemTop}>
                            <Text style={styles.historyItemDesc} numberOfLines={1}>
                              {cost.description}
                            </Text>
                            <Text style={styles.historyItemAmount}>
                              {currency} {cost.amount.toFixed(2)}
                            </Text>
                          </View>
                          {cost.syncedToPersonal && (
                            <View style={styles.historyItemBottom}>
                              <View style={styles.historyLinkedBadge}>
                                <Feather name="link" size={9} color={C.bronze} />
                                <Text style={styles.historyLinkedText}>synced</Text>
                              </View>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </Animated.View>
      </ScrollView>

      {/* ─── FAB: Log Cost ──────────────────────────────────── */}
      <View style={[styles.fabWrapper, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
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

      {/* ─── Recurring Cost Modal ──────────────────────────── */}
      {showRecurringModal && (<Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={() => setShowRecurringModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRecurringModal(false)}>
          <Pressable style={[styles.modalCard, { gap: SPACING.md }]} onPress={() => {}}>
            <Text style={styles.modalTitle}>recurring cost</Text>
            <TextInput
              style={styles.modalInput}
              value={recurringDesc}
              onChangeText={setRecurringDesc}
              placeholder="e.g. Tepung from Billion"
              placeholderTextColor={C.textMuted}
              autoFocus
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <Text style={{ color: C.textMuted, fontSize: TYPOGRAPHY.size.sm }}>{currency}</Text>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={recurringAmount}
                onChangeText={setRecurringAmount}
                placeholder="amount"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              {(['weekly', 'biweekly', 'monthly'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.freqPill, recurringFreq === f && styles.freqPillActive]}
                  onPress={() => setRecurringFreq(f)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.freqPillText, recurringFreq === f && styles.freqPillTextActive]}>
                    {f === 'weekly' ? 'weekly' : f === 'biweekly' ? 'every 2 wk' : 'monthly'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.modalSave}
              activeOpacity={0.7}
              onPress={() => {
                const desc = recurringDesc.trim();
                const amount = parseFloat(recurringAmount);
                if (!desc || isNaN(amount) || amount <= 0) return;
                const now = new Date();
                let nextDue = new Date(now);
                if (recurringFreq === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
                else if (recurringFreq === 'biweekly') nextDue.setDate(nextDue.getDate() + 14);
                else nextDue.setMonth(nextDue.getMonth() + 1);
                addRecurringCost({ description: desc, amount, frequency: recurringFreq, nextDue, isActive: true, seasonId: activeSeason?.id });
                showToast('recurring cost added.', 'success');
                setShowRecurringModal(false);
              }}
            >
              <Text style={styles.modalSaveText}>save</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>)}

      {/* ─── Cost Modal ─────────────────────────────────────── */}
      {showCostModal && (<Modal visible transparent statusBarTranslucent animationType="fade">
        <View style={{flex: 1}}>
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
          >
            <Pressable style={styles.modalContent} onPress={() => Keyboard.dismiss()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingCostId ? 'edit cost' : 'log cost'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    lightTap();
                    setEditingCostId(null);
                    setShowCostModal(false);
                  }}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.costDatePill}>
                <Feather name="calendar" size={12} color={C.textSecondary} />
                <Text style={styles.costDateText}>
                  {editingCostId
                    ? format(
                        ingredientCosts.find((c) => c.id === editingCostId)?.date ?? new Date(),
                        'dd MMM yyyy'
                      )
                    : format(new Date(), 'dd MMM yyyy')}
                </Text>
              </View>

              {/* Template suggestions */}
              {!editingCostId && costTemplates.length > 0 && !costDescription.trim() && (
                <View style={styles.fieldGroup}>
                  <View style={styles.templateHeader}>
                    <Text style={styles.fieldLabel}>templates</Text>
                    <Text style={styles.templateCount}>{costTemplates.length}</Text>
                  </View>
                  <ScrollView style={styles.templateList} showsVerticalScrollIndicator={costTemplates.length > 4} nestedScrollEnabled>
                    {costTemplates.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => {
                          lightTap();
                          setCostDescription(t.description);
                          setCostAmount(t.amount.toString());
                        }}
                        onLongPress={() => {
                          warningNotification();
                          Alert.alert(t.description, '', [
                            { text: 'cancel', style: 'cancel' },
                            {
                              text: 'edit',
                              onPress: () => {
                                setEditingTemplateId(t.id);
                                setTemplateDesc(t.description);
                                setTemplateAmt(t.amount.toString());
                                setShowTemplateEditModal(true);
                              },
                            },
                            { text: 'delete', style: 'destructive', onPress: () => deleteCostTemplate(t.id) },
                          ]);
                        }}
                        delayLongPress={400}
                        style={styles.templateItem}
                        accessibilityRole="button"
                        accessibilityLabel={`Use template: ${t.description}`}
                      >
                        <Text style={styles.templateItemName} numberOfLines={1}>{t.description}</Text>
                        <Text style={styles.templateItemAmount}>{currency} {t.amount.toFixed(2)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.templateHint}>tap to use · hold to edit or delete</Text>
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>what did you buy?</Text>
                <Animated.View style={{ transform: [{ translateX: costDescShakeAnim }] }}>
                  <TextInput
                    style={[styles.modalInput, costDescError && styles.modalInputError]}
                    value={costDescription}
                    onChangeText={setCostDescription}
                    placeholder="e.g. tepung, gula, mentega"
                    placeholderTextColor={C.textMuted}
                    autoFocus
                  />
                </Animated.View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>amount</Text>
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
                      placeholderTextColor={C.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </Animated.View>
              </View>

              {/* Sync to personal toggle — only for new costs */}
              {!editingCostId && (
                <>
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
                  <TouchableOpacity
                    style={styles.syncToggleRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      lightTap();
                      setSaveAsTemplate((v) => !v);
                    }}
                  >
                    <View
                      style={[
                        styles.syncToggleBox,
                        saveAsTemplate && styles.syncToggleBoxActive,
                      ]}
                    >
                      {saveAsTemplate && <Feather name="check" size={12} color="#fff" />}
                    </View>
                    <Text style={styles.syncToggleText}>save as template</Text>
                  </TouchableOpacity>
                </>
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

        {/* ─── Template Edit overlay (inside cost modal) ─── */}
        {showTemplateEditModal && (
          <Pressable style={[StyleSheet.absoluteFill, styles.modalOverlay]} onPress={Keyboard.dismiss}>
            <KeyboardAwareScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              nestedScrollEnabled
            >
              <Pressable style={styles.modalContent} onPress={() => Keyboard.dismiss()}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>edit template</Text>
                  <TouchableOpacity
                    onPress={() => { lightTap(); setShowTemplateEditModal(false); }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Feather name="x" size={20} color={C.textSecondary} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.modalInput}
                  value={templateDesc}
                  onChangeText={setTemplateDesc}
                  placeholder="description"
                  placeholderTextColor={C.textMuted}
                  autoFocus
                />

                <View style={styles.currencyInputRow}>
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.currencyInput}
                    value={templateAmt}
                    onChangeText={setTemplateAmt}
                    placeholder="0.00"
                    placeholderTextColor={C.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={() => { lightTap(); setShowTemplateEditModal(false); }}
                    style={styles.modalCancel}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalCancelText}>cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (!templateDesc.trim() || !templateAmt.trim()) {
                        warningNotification();
                        showToast('fill in description and amount', 'error');
                        return;
                      }
                      if (editingTemplateId) {
                        updateCostTemplate(editingTemplateId, {
                          description: templateDesc.trim(),
                          amount: parseFloat(templateAmt) || 0,
                        });
                      }
                      successNotification();
                      showToast('template updated', 'success');
                      setShowTemplateEditModal(false);
                    }}
                    style={styles.modalConfirm}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalConfirmText}>save</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </KeyboardAwareScrollView>
          </Pressable>
        )}
        </View>
      </Modal>)}

      {/* ─── Budget Modal ───────────────────────────────────── */}
      {showBudgetModal && (<Modal visible transparent statusBarTranslucent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
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
                  <Feather name="x" size={20} color={C.textSecondary} />
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
                  placeholderTextColor={C.textMuted}
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
      </Modal>)}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  summarySeasonLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  summaryHero: {
    fontSize: 32,
    fontWeight: TYPOGRAPHY.weight.bold as any,
    fontVariant: ['tabular-nums'] as any,
  },
  summaryHeroProfit: {
    color: BIZ.profit,
  },
  summaryHeroLoss: {
    color: BIZ.loss,
  },
  summaryHeroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  summaryBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  summaryBreakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  summaryBreakdownDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.border,
  },
  summaryBreakdownValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  summaryBreakdownLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // ── Budget card ─────────────────────────────────────────────
  budgetCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
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
  budgetIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: C.textPrimary,
  },
  budgetEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetBarSection: {
    marginTop: SPACING.sm,
    gap: 4,
  },
  budgetTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: withAlpha(C.bronze, 0.08),
    overflow: 'hidden' as const,
  },
  budgetFill: {
    height: '100%',
    borderRadius: 4,
  },
  budgetTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    fontVariant: ['tabular-nums'] as any,
  },
  budgetTextMuted: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  budgetHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: SPACING.xs,
  },

  // ── Transfer card ───────────────────────────────────────────
  transferCard: {
    backgroundColor: withAlpha(C.bronze, 0.04),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.2),
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
    flex: 1,
  },
  transferIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },
  transferSubtext: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
    marginTop: 1,
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
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    height: 36,
  },
  transferPrefix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginRight: 4,
  },
  transferInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textPrimary,
    padding: 0,
    fontVariant: ['tabular-nums'] as any,
  },
  transferConfirmBtn: {
    backgroundColor: C.bronze,
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
    backgroundColor: C.bronze,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textSecondary,
  },
  historyBadge: {
    backgroundColor: withAlpha(C.bronze, 0.1),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    minWidth: 22,
    alignItems: 'center',
  },
  historyBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as any,
  },
  historySearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    minHeight: 36,
    marginBottom: SPACING.sm,
  },
  historySearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  historySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  historySectionHeaderSpaced: {
    marginTop: SPACING.sm,
  },
  historySectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  historySectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
  },
  historyEmptyWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  historyEmpty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  historyItemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 44,
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.sm,
  },
  historyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: withAlpha(BIZ.loss, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyAvatarText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold as any,
    color: BIZ.loss,
  },
  historyItemContent: {
    flex: 1,
    gap: 2,
  },
  historyItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  historyItemDesc: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: C.textPrimary,
    flex: 1,
  },
  historyItemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  historyItemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  historyLinkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 1,
  },
  historyLinkedText: {
    fontSize: 10,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium as any,
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
    backgroundColor: C.deepOlive,
    borderRadius: RADIUS.xl,
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
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    width: '100%',
    gap: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold as any,
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldGroup: {
    gap: SPACING.xs,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  modalInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modalInputError: {
    borderColor: '#D4775C',
    backgroundColor: withAlpha('#D4775C', 0.08),
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: C.textSecondary,
  },
  modalConfirm: {
    flex: 2,
    paddingVertical: SPACING.md,
    backgroundColor: C.deepOlive,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: '#fff',
  },
  costDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: C.background,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  costDateText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  templateCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  templateList: {
    maxHeight: 140,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    marginBottom: 4,
  },
  templateItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    flex: 1,
  },
  templateItemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    marginLeft: SPACING.sm,
  },
  templateHint: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 4,
  },
  currencyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingLeft: SPACING.md,
  },
  currencyInputRowError: {
    borderColor: '#D4775C',
    backgroundColor: withAlpha('#D4775C', 0.08),
  },
  currencyPrefix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    marginRight: SPACING.xs,
  },
  currencyInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
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
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncToggleBoxActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  syncToggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  budgetModalHint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },

  // ─── Recurring costs ──────────────────────────────────────
  recurringCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  recurringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  recurringTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: SPACING.sm,
  },
  recurringDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    flex: 1,
  },
  recurringMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },
  recurringDue: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  recurringDueNow: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },
  recurringApplyBtn: {
    backgroundColor: withAlpha(BIZ.success, 0.12),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  recurringApplyBtnMuted: {
    backgroundColor: C.background,
  },
  recurringApplyText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },
  recurringAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  recurringAddText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },

  // ─── Recurring modal ──────────────────────────────────────
  modalCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginHorizontal: SPACING.xl,
    ...SHADOWS.lg,
  },
  modalSave: {
    backgroundColor: C.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  modalSaveText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: '#fff',
  },
  freqPill: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  freqPillActive: {
    backgroundColor: withAlpha(C.accent, 0.12),
  },
  freqPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },
  freqPillTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },
});

export default CostManagement;
