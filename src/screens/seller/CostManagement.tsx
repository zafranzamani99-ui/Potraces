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
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { format, isToday, isYesterday, isValid } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { usePersonalStore } from '../../store/personalStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useToast } from '../../context/ToastContext';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ, BIZ_SAFE, semantic } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import { useT } from '../../i18n';
import { IngredientCost, RecurringFrequency } from '../../types';
import { createTransfer } from '../../utils/transferBridge';
import { scanSellerReceipt } from '../../services/receiptScanner';
import { uploadReceiptImage, deleteReceiptImage } from '../../services/sellerSync';
import CostCategoryPicker from '../../components/seller/CostCategoryPicker';
import ReceiptViewer from '../../components/seller/ReceiptViewer';
import PaywallModal from '../../components/common/PaywallModal';
import ImageSourcePills from '../../components/common/ImageSourcePills';
import ModalToastHost from '../../components/common/ModalToastHost';
import CategoryIcon from '../../components/common/CategoryIcon';
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
  const isDark = useIsDark();
  const bizProfit = semantic(BIZ_SAFE.profit, isDark);
  const bizLoss = semantic(BIZ_SAFE.loss, isDark);
  const t = useT();
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
  const costCategories = useSellerStore((s) => s.costCategories);
  const getCostCategory = useSellerStore((s) => s.getCostCategory);
  const canScanReceipt = usePremiumStore((s) => s.canScanReceipt);
  const incrementScanCount = usePremiumStore((s) => s.incrementScanCount);
  const getRemainingScans = usePremiumStore((s) => s.getRemainingScans);
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

  // ─── Category / vendor / receipt state ─────────────────────
  const [costCategory, setCostCategory] = useState('costcat_materials');
  const [costVendor, setCostVendor] = useState('');
  const [receiptLocalUri, setReceiptLocalUri] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

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
    let base = categoryFilter
      ? seasonCostEntries.filter((c) => (c.category ?? 'costcat_uncategorized') === categoryFilter)
      : seasonCostEntries;
    if (!costSearch.trim()) return base;
    const q = costSearch.trim().toLowerCase();
    return base.filter((c) => {
      if (c.description.toLowerCase().includes(q)) return true;
      if (c.vendor && c.vendor.toLowerCase().includes(q)) return true;
      if (getCostCategory(c.category).name.toLowerCase().includes(q)) return true;
      const d = c.date instanceof Date ? c.date : new Date(c.date);
      if (!isValid(d)) return false;
      const dateStr = format(d, 'dd MMM yyyy').toLowerCase();
      if (dateStr.includes(q)) return true;
      if (isToday(d) && 'today'.includes(q)) return true;
      if (isYesterday(d) && 'yesterday'.includes(q)) return true;
      return false;
    });
  }, [seasonCostEntries, costSearch, categoryFilter, getCostCategory]);

  // Per-category spend breakdown for the active season (summary card).
  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const c of seasonCostEntries) {
      const id = c.category ?? 'costcat_uncategorized';
      totals.set(id, (totals.get(id) ?? 0) + c.amount);
    }
    return Array.from(totals.entries())
      .map(([id, total]) => ({ cat: getCostCategory(id), total }))
      .sort((a, b) => b.total - a.total);
  }, [seasonCostEntries, getCostCategory]);

  // Categories that actually have entries — for filter chips.
  const usedCategories = useMemo(
    () => categoryBreakdown.map((b) => b.cat),
    [categoryBreakdown],
  );

  const groupedCostEntries = useMemo(() => {
    const groups: { label: string; entries: IngredientCost[] }[] = [];
    const map = new Map<string, IngredientCost[]>();

    for (const entry of filteredCostEntries) {
      const d = entry.date instanceof Date ? entry.date : new Date(entry.date);
      let label: string;
      if (!isValid(d)) label = t.seller.unknownLabel;
      else if (isToday(d)) label = t.seller.todayLabel;
      else if (isYesterday(d)) label = t.seller.yesterdayLabel;
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
      ? bizLoss
      : _budgetPercent >= 80
      ? C.bronze
      : bizProfit;
    return { budget: _budget, budgetPercent: _budgetPercent, budgetColor: _budgetColor };
  }, [activeSeason?.costBudget, seasonStats.totalCosts, bizLoss, bizProfit, C.bronze]);

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
      setCostCategory(costToEdit.category ?? 'costcat_materials');
      setCostVendor(costToEdit.vendor ?? '');
      setReceiptUrl(costToEdit.receiptUrl ?? null);
      setReceiptLocalUri(costToEdit.receiptLocalUri ?? null);
    } else {
      setEditingCostId(null);
      setCostDescription('');
      setCostAmount('');
      setCostCategory('costcat_materials');
      setCostVendor('');
      setReceiptUrl(null);
      setReceiptLocalUri(null);
    }
    setCostDescError(false);
    setCostAmtError(false);
    setSyncToPersonal(false);
    setShowCostModal(true);
  }, []);

  // Map an AI-suggested category id to one that still exists; fall back to "Other".
  const resolveCategory = useCallback((suggested?: string): string => {
    if (suggested && costCategories.some((c) => c.id === suggested)) return suggested;
    return 'costcat_other';
  }, [costCategories]);

  const handleScanReceipt = useCallback(async (source: 'camera' | 'gallery') => {
    if (!canScanReceipt()) {
      setPaywallVisible(true);
      return;
    }
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showToast(t.seller.grantPermission.replace('{source}', source), 'error');
      return;
    }
    const picker = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setReceiptLocalUri(uri);
    setReceiptUrl(null);
    setScanning(true);
    try {
      const parsed = await scanSellerReceipt(uri);
      incrementScanCount();
      if (parsed.total > 0) setCostAmount(parsed.total.toFixed(2));
      const desc = parsed.vendor || parsed.items[0]?.name;
      if (desc) setCostDescription(desc);
      if (parsed.vendor) setCostVendor(parsed.vendor);
      if (parsed.suggestedCategory) setCostCategory(resolveCategory(parsed.suggestedCategory));
      successNotification();
    } catch {
      showToast(t.seller.receiptScanFailed, 'error');
    } finally {
      setScanning(false);
    }
  }, [canScanReceipt, incrementScanCount, resolveCategory, showToast, t]);

  const handleSaveCost = useCallback(() => {
    const hasDescErr = !costDescription.trim();
    const hasAmtErr = !costAmount.trim();

    setCostDescError(hasDescErr);
    setCostAmtError(hasAmtErr);
    if (hasDescErr) shakeField(costDescShakeAnim);
    if (hasAmtErr) shakeField(costAmtShakeAnim);

    if (hasDescErr || hasAmtErr) {
      warningNotification();
      showToast(t.seller.fillDescAmount, 'error');
      return;
    }

    const amount = parseFloat(costAmount) || 0;
    const desc = costDescription.trim();

    const catName = getCostCategory(costCategory).name;
    const vendor = costVendor.trim() || undefined;
    // Trace category in the linked personal expense description for clarity.
    const personalDesc = `seller (${catName.toLowerCase()}): ${desc}`;

    if (editingCostId) {
      // Read sync status directly from store (not closure) to avoid stale data
      const currentCost = useSellerStore.getState().ingredientCosts.find((c) => c.id === editingCostId);
      updateIngredientCost(editingCostId, {
        description: desc,
        amount,
        category: costCategory,
        vendor,
        receiptUrl: receiptUrl ?? undefined,
        receiptLocalUri: receiptUrl ? undefined : (receiptLocalUri ?? undefined),
      });
      // Also update linked personal expense if synced
      if (currentCost?.syncedToPersonal && currentCost.personalTransactionId) {
        usePersonalStore.getState().updateTransaction(currentCost.personalTransactionId, {
          amount,
          description: personalDesc,
        });
      }
      successNotification();
      showToast(t.seller.costUpdated, 'success');
    } else {
      // Create personal expense first (if toggled) so we get the real ID
      let personalTxId: string | undefined;
      if (syncToPersonal) {
        personalTxId = addTransaction({
          amount,
          category: 'business cost',
          description: personalDesc,
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
        category: costCategory,
        vendor,
        receiptLocalUri: receiptLocalUri ?? undefined,
      });

      if (syncToPersonal && personalTxId) {
        markCostSynced(costId, personalTxId);
      }

      // Upload an attached receipt now (best-effort; sync retries if offline).
      if (receiptLocalUri) {
        uploadReceiptImage(receiptLocalUri, costId).then((url) => {
          if (url) updateIngredientCost(costId, { receiptUrl: url, receiptLocalUri: undefined });
        });
      }

      successNotification();

      // Save as template if toggled
      if (saveAsTemplate) {
        addCostTemplate({ description: desc, amount, category: costCategory });
      }

      showToast(syncToPersonal ? t.seller.costLoggedPersonal : t.seller.costLogged, 'success');
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowCostModal(false);
    setEditingCostId(null);
    setCostDescription('');
    setCostAmount('');
    setCostVendor('');
    setReceiptLocalUri(null);
    setReceiptUrl(null);
    setSyncToPersonal(false);
    setSaveAsTemplate(false);
  }, [costDescription, costAmount, editingCostId, syncToPersonal, saveAsTemplate, costCategory, costVendor, receiptUrl, receiptLocalUri, getCostCategory, addIngredientCost, updateIngredientCost, addTransaction, addCostTemplate, markCostSynced, activeSeason, showToast]);
  const guardedSaveCost = useSubmitGuard(handleSaveCost);

  // Apply a single due recurring cost (extracted from the per-row .map button).
  const handleApplyRecurring = useCallback((r: { id: string; description: string }) => {
    if (!activeSeason) {
      showToast(t.seller.startSeasonFirst, 'error');
      return;
    }
    lightTap();
    applyRecurringCost(r.id, activeSeason.id);
    showToast(t.seller.loggedToast.replace('{desc}', r.description), 'success');
  }, [activeSeason, applyRecurringCost, showToast, t]);
  const guardedApplyRecurring = useSubmitGuard(handleApplyRecurring);

  // Save a new recurring cost (extracted from the Recurring Cost Modal save button).
  const handleSaveRecurring = useCallback(() => {
    const desc = recurringDesc.trim();
    const amount = parseFloat(recurringAmount);
    if (!desc || isNaN(amount) || amount <= 0) return;
    const now = new Date();
    let nextDue = new Date(now);
    if (recurringFreq === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
    else if (recurringFreq === 'biweekly') nextDue.setDate(nextDue.getDate() + 14);
    else nextDue.setMonth(nextDue.getMonth() + 1);
    addRecurringCost({ description: desc, amount, frequency: recurringFreq, nextDue, isActive: true, seasonId: activeSeason?.id });
    showToast(t.seller.recurringCostAdded, 'success');
    setShowRecurringModal(false);
  }, [recurringDesc, recurringAmount, recurringFreq, addRecurringCost, activeSeason, showToast, t]);
  const guardedSaveRecurring = useSubmitGuard(handleSaveRecurring);

  const handleDeleteCost = useCallback((cost: IngredientCost) => {
    warningNotification();
    const msgTmpl = cost.syncedToPersonal ? t.seller.deleteCostSyncedMsg : t.seller.deleteCostMsg;
    const msg = msgTmpl
      .replace('{desc}', cost.description)
      .replace('{currency}', currency)
      .replace('{amount}', cost.amount.toFixed(2));
    Alert.alert(
      t.seller.deleteCostTitle,
      msg,
      [
        { text: t.seller.cancel, style: 'cancel' },
        {
          text: t.seller.delete,
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            // Also delete linked personal expense if synced
            if (cost.syncedToPersonal && cost.personalTransactionId) {
              deletePersonalTransaction(cost.personalTransactionId);
            }
            // Remove the receipt image from storage so it doesn't orphan.
            if (cost.receiptUrl) {
              deleteReceiptImage(cost.id);
            }
            deleteIngredientCost(cost.id);
            showToast(t.seller.costDeleted, 'success');
          },
        },
      ]
    );
  }, [currency, deleteIngredientCost, deletePersonalTransaction, showToast, t]);

  const handleSaveBudget = useCallback(() => {
    if (!activeSeason) return;
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val <= 0) {
      updateSeasonBudget(activeSeason.id, undefined);
      showToast(t.seller.budgetCleared, 'success');
    } else {
      updateSeasonBudget(activeSeason.id, val);
      showToast(t.seller.budgetSet, 'success');
    }
    successNotification();
    setShowBudgetModal(false);
  }, [activeSeason, budgetInput, updateSeasonBudget, showToast]);

  const handleTransferToPersonal = useCallback(() => {
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || !amount || amount <= 0) return;
    if (amount > untransferredAmount) {
      showToast(t.seller.cannotTransferMore, 'error');
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
    showToast(t.seller.transferredToPersonal, 'success');
    setShowTransfer(false);
  }, [transferAmount, activeSeason, untransferredOrders, addTransfer, addTransferIncome, markOrdersTransferred, showToast, t]);
  const guardedTransferToPersonal = useSubmitGuard(handleTransferToPersonal);

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
            {seasonStats.kept >= 0 ? t.seller.keptLabel : t.seller.shortfall}
          </Text>
          <View style={styles.summaryBreakdown}>
            <View style={styles.summaryBreakdownItem}>
              <Feather name="arrow-up-circle" size={14} color={bizProfit} />
              <Text style={styles.summaryBreakdownValue}>
                {currency} {seasonStats.totalIncome.toFixed(0)}
              </Text>
              <Text style={styles.summaryBreakdownLabel}>{t.seller.cameIn}</Text>
            </View>
            <View style={styles.summaryBreakdownDot} />
            <View style={styles.summaryBreakdownItem}>
              <Feather name="arrow-down-circle" size={14} color={bizLoss} />
              <Text style={styles.summaryBreakdownValue}>
                {currency} {seasonStats.totalCosts.toFixed(0)}
              </Text>
              <Text style={styles.summaryBreakdownLabel}>{t.seller.costsLabel}</Text>
            </View>
          </View>

          {categoryBreakdown.length > 1 && seasonStats.totalCosts > 0 && (
            <View style={styles.catBreakdown}>
              <View style={styles.catBar}>
                {categoryBreakdown.map((b) => (
                  <View
                    key={b.cat.id}
                    style={{ flex: b.total, backgroundColor: b.cat.color, height: '100%' }}
                  />
                ))}
              </View>
              <View style={styles.catLegend}>
                {categoryBreakdown.slice(0, 4).map((b) => (
                  <View key={b.cat.id} style={styles.catLegendItem}>
                    <View style={[styles.catLegendDot, { backgroundColor: b.cat.color }]} />
                    <Text style={styles.catLegendText} numberOfLines={1}>
                      {b.cat.name} {Math.round((b.total / seasonStats.totalCosts) * 100)}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Animated.View>

        {/* ─── Budget Bar ──────────────────────────────────── */}
        {activeSeason && (
          <Animated.View style={[styles.budgetCard, budgetAnim]}>
            <View style={styles.budgetHeader}>
              <View style={styles.budgetHeaderLeft}>
                <View style={styles.budgetIconWrap}>
                  <Feather name="pie-chart" size={14} color={C.bronze} />
                </View>
                <Text style={styles.budgetTitle}>{t.seller.costBudget}</Text>
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
                    {t.seller.pctUsed.replace('{pct}', String(budgetPercent))}
                  </Text>
                  <Text style={styles.budgetTextMuted}>
                    {currency} {seasonStats.totalCosts.toFixed(0)} / {currency} {budget.toFixed(0)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.budgetHint}>
                {t.seller.setSpendingLimit}
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
                  <Text style={styles.transferTitle}>{t.seller.transferToPersonal}</Text>
                  <Text style={styles.transferSubtext}>
                    {t.seller.fromOrders
                      .replace('{currency}', currency)
                      .replace('{amount}', untransferredAmount.toFixed(0))
                      .replace('{n}', String(untransferredOrders.length))
                      .replace('{plural}', untransferredOrders.length !== 1 ? 's' : '')}
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
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.accent, 0.25)}
                  />
                </View>
                <TouchableOpacity
                  style={styles.transferConfirmBtn}
                  activeOpacity={0.7}
                  onPress={guardedTransferToPersonal}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm transfer"
                >
                  <Feather name="check" size={18} color={C.onAccent} />
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
                <Text style={styles.transferBtnText}>{t.seller.cmTransfer}</Text>
                <Feather name="arrow-right" size={14} color={C.onAccent} />
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* ─── Recurring Costs ────────────────────────────── */}
        {recurringCosts.length > 0 && (
          <View style={styles.recurringCard}>
            <View style={styles.recurringHeader}>
              <Feather name="repeat" size={14} color={C.bronze} />
              <Text style={styles.recurringTitle}>{t.seller.recurring}</Text>
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
                      {currency} {r.amount.toFixed(2)} · {r.frequency === 'weekly' ? t.seller.weekly : r.frequency === 'biweekly' ? t.seller.every2Weeks : t.seller.monthly}
                    </Text>
                    <Text style={[styles.recurringDue, isDue && styles.recurringDueNow]}>
                      {isDue ? t.seller.dueNow : t.seller.nextDate.replace('{date}', format(dueDate, 'dd MMM'))}
                    </Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.recurringApplyBtn, !isDue && styles.recurringApplyBtnMuted]}
                      onPress={() => guardedApplyRecurring(r)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.recurringApplyText, !isDue && { color: C.textMuted }]}>{t.seller.apply}</Text>
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
            <Text style={styles.recurringAddText}>{t.seller.addRecurringCost}</Text>
          </TouchableOpacity>
        )}

        {/* ─── Cost History ────────────────────────────────── */}
        <Animated.View style={[styles.historyCard, historyAnim]}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>{t.seller.costHistory}</Text>
            <View style={styles.historyBadge}>
              <Text style={styles.historyBadgeText}>{seasonCostEntries.length}</Text>
            </View>
          </View>

          {seasonCostEntries.length > 0 && (
            <View style={styles.historySearchBar}>
              <Feather name="search" size={14} color={C.textMuted} />
              <TextInput
                style={styles.historySearchInput}
                placeholder={t.seller.searchCosts}
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                value={costSearch}
                onChangeText={setCostSearch}
                returnKeyType="search"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
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

          {usedCategories.length > 1 && (
            <View style={styles.filterChipsWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsContent}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  onPress={() => { lightTap(); setCategoryFilter(null); }}
                  style={[styles.filterChip, !categoryFilter && styles.filterChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !categoryFilter }}
                >
                  <Text style={[styles.filterChipText, !categoryFilter && styles.filterChipTextActive]}>{t.seller.allCategories}</Text>
                </Pressable>
                {usedCategories.map((cat) => {
                  const active = categoryFilter === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => { lightTap(); setCategoryFilter(active ? null : cat.id); }}
                      style={[styles.filterChip, active && { backgroundColor: withAlpha(cat.color, isDark ? 0.2 : 0.12), borderColor: cat.color }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <CategoryIcon icon={cat.icon} size={12} color={active ? cat.color : C.textSecondary} />
                      <Text style={[styles.filterChipText, active && { color: cat.color }]}>{cat.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <LinearGradient
                colors={[withAlpha(C.surface, 0), C.surface]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.filterFade}
                pointerEvents="none"
              />
            </View>
          )}

          {seasonCostEntries.length === 0 ? (
            <View style={styles.historyEmptyWrap}>
              <View style={styles.emptyIconCircle}>
                <Feather name="inbox" size={28} color={C.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>{t.seller.noCostsLoggedYet}</Text>
              <Text style={styles.emptySubtitle}>start logging costs to track your spending.</Text>
            </View>
          ) : filteredCostEntries.length === 0 ? (
            <View style={styles.historyEmptyWrap}>
              <View style={styles.emptyIconCircle}>
                <Feather name="search" size={28} color={C.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>{t.seller.noMatch}</Text>
              <Text style={styles.emptySubtitle}>try adjusting your search or filters.</Text>
            </View>
          ) : (
            groupedCostEntries.map((group, gi) => (
              <View key={group.label}>
                <View style={[styles.historySectionHeader, gi > 0 && styles.historySectionHeaderSpaced]}>
                  <Text style={styles.historySectionLabel}>{group.label}</Text>
                  <View style={styles.historySectionLine} />
                </View>
                {group.entries.map((cost, i) => {
                  const cat = getCostCategory(cost.category);
                  const hasReceipt = !!(cost.receiptUrl || cost.receiptLocalUri);
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
                        accessibilityLabel={`${cost.description}, ${cat.name}, ${currency} ${cost.amount.toFixed(2)}. Tap to edit, hold to delete.`}
                      >
                        <View style={[styles.historyAvatar, { backgroundColor: withAlpha(cat.color, isDark ? 0.2 : 0.12) }]}>
                          <CategoryIcon icon={cat.icon} size={15} color={cat.color} />
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
                          <View style={styles.historyItemBottom}>
                            <Text style={styles.historyCatLabel}>{cat.name}</Text>
                            {cost.vendor ? <Text style={styles.historyVendor} numberOfLines={1}>· {cost.vendor}</Text> : null}
                            {hasReceipt && (
                              <Pressable
                                onPress={() => setViewerUri(cost.receiptUrl || cost.receiptLocalUri || null)}
                                hitSlop={8}
                                style={styles.historyReceiptBtn}
                                accessibilityRole="button"
                                accessibilityLabel={t.seller.viewReceipt}
                              >
                                <Feather name="paperclip" size={10} color={C.bronze} />
                              </Pressable>
                            )}
                            {cost.syncedToPersonal && (
                              <View style={styles.historyLinkedBadge}>
                                <Feather name="link" size={9} color={C.bronze} />
                                <Text style={styles.historyLinkedText}>{t.seller.synced}</Text>
                              </View>
                            )}
                          </View>
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
          <Feather name="plus" size={20} color={C.onAccent} />
          <Text style={styles.fabText}>{t.seller.logCost}</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Recurring Cost Modal ──────────────────────────── */}
      {showRecurringModal && (<Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={() => setShowRecurringModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRecurringModal(false)}>
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
                  {'recurring '}<Text style={styles.modalTitleAccent}>cost</Text>
                </Text>
                <Pressable
                  onPress={() => { lightTap(); setShowRecurringModal(false); }}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={18} color={C.textMuted} />
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>set up auto-tracking for regular expenses</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>description</Text>
                <TextInput
                  style={styles.modalInput}
                  value={recurringDesc}
                  onChangeText={setRecurringDesc}
                  placeholder={t.seller.recurringDescPlaceholder}
                  placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                  autoFocus
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.bronze, 0.25)}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>amount</Text>
                <View style={styles.currencyInputRow}>
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.currencyInput}
                    value={recurringAmount}
                    onChangeText={setRecurringAmount}
                    placeholder={t.seller.amountPlaceholder}
                    placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                    keyboardType="numeric"
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.bronze, 0.25)}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>frequency</Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  {(['weekly', 'biweekly', 'monthly'] as const).map((f) => (
                    <Pressable
                      key={f}
                      style={({ pressed }) => [styles.freqPill, recurringFreq === f && styles.freqPillActive, pressed && { opacity: 0.7 }]}
                      onPress={() => setRecurringFreq(f)}
                    >
                      <Text style={[styles.freqPillText, recurringFreq === f && styles.freqPillTextActive]}>
                        {f === 'weekly' ? t.seller.weekly : f === 'biweekly' ? t.seller.every2wk : t.seller.monthly}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => { lightTap(); setShowRecurringModal(false); }}
                  style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalCancelText}>{t.seller.cmCancel}</Text>
                </Pressable>
                <Pressable
                  onPress={guardedSaveRecurring}
                  style={({ pressed }) => [styles.modalConfirm, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Save recurring cost"
                >
                  <Text style={styles.modalConfirmText}>{t.seller.saveLabel}</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
        <ModalToastHost />
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
                <View style={styles.costTitleRow}>
                  <Text style={styles.modalTitle}>
                    {editingCostId ? 'edit ' : 'log '}<Text style={styles.modalTitleAccent}>cost</Text>
                  </Text>
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
                </View>
                <Pressable
                  onPress={() => {
                    lightTap();
                    setEditingCostId(null);
                    setShowCostModal(false);
                  }}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={18} color={C.textMuted} />
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>{editingCostId ? 'update cost details' : 'track all your costs'}</Text>

              {/* Scan receipt — shared camera/gallery source pills */}
              <View style={styles.receiptRow}>
                <ImageSourcePills
                  onPick={handleScanReceipt}
                  cameraLabel={t.seller.takePhoto}
                  galleryLabel={t.seller.scanReceipt}
                  loading={scanning}
                  loadingLabel={t.seller.scanningReceipt}
                />
                {!scanning && (receiptUrl || receiptLocalUri) && (
                  <Pressable
                    onPress={() => setViewerUri(receiptUrl || receiptLocalUri)}
                    style={styles.receiptThumbWrap}
                    accessibilityRole="button"
                    accessibilityLabel={t.seller.viewReceipt}
                  >
                    <Image source={{ uri: (receiptUrl || receiptLocalUri)! }} style={styles.receiptThumb} contentFit="cover" />
                    <Pressable
                      onPress={() => { setReceiptUrl(null); setReceiptLocalUri(null); }}
                      style={styles.receiptRemove}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t.seller.removeReceipt}
                    >
                      <Feather name="x" size={11} color="#fff" />
                    </Pressable>
                  </Pressable>
                )}
              </View>

              {/* Template suggestions */}
              {!editingCostId && costTemplates.length > 0 && !costDescription.trim() && (
                <View style={styles.fieldGroup}>
                  <View style={styles.templateHeader}>
                    <Text style={styles.fieldLabel}>{t.seller.templates}</Text>
                    <Text style={styles.templateCount}>{costTemplates.length}</Text>
                  </View>
                  <ScrollView style={styles.templateList} showsVerticalScrollIndicator={costTemplates.length > 4} nestedScrollEnabled>
                    {costTemplates.map((tmpl) => (
                      <Pressable
                        key={tmpl.id}
                        onPress={() => {
                          lightTap();
                          setCostDescription(tmpl.description);
                          setCostAmount(tmpl.amount.toString());
                        }}
                        onLongPress={() => {
                          warningNotification();
                          Alert.alert(tmpl.description, '', [
                            { text: t.seller.cancelLower, style: 'cancel' },
                            {
                              text: t.seller.editLabel,
                              onPress: () => {
                                setEditingTemplateId(tmpl.id);
                                setTemplateDesc(tmpl.description);
                                setTemplateAmt(tmpl.amount.toString());
                                setShowTemplateEditModal(true);
                              },
                            },
                            { text: t.seller.deleteLabel, style: 'destructive', onPress: () => deleteCostTemplate(tmpl.id) },
                          ]);
                        }}
                        delayLongPress={400}
                        style={({ pressed }) => [styles.templateItem, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Use template: ${tmpl.description}`}
                      >
                        <Text style={styles.templateItemName} numberOfLines={1}>{tmpl.description}</Text>
                        <Text style={styles.templateItemAmount}>{currency} {tmpl.amount.toFixed(2)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.templateHint}>{t.seller.templateHintTap}</Text>
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t.seller.whatDidYouBuy}</Text>
                <Animated.View style={{ transform: [{ translateX: costDescShakeAnim }] }}>
                  <TextInput
                    style={[styles.modalInput, costDescError && styles.modalInputError]}
                    value={costDescription}
                    onChangeText={setCostDescription}
                    placeholder={t.seller.costDescPlaceholder}
                    placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                    autoFocus
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.bronze, 0.25)}
                  />
                </Animated.View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t.seller.amountLabel}</Text>
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
                      placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                      keyboardType="decimal-pad"
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={withAlpha(C.bronze, 0.25)}
                    />
                  </View>
                </Animated.View>
              </View>

              {/* Category dropdown */}
              <View style={styles.fieldGroup}>
                <CostCategoryPicker selected={costCategory} onSelect={setCostCategory} />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t.seller.vendorLabel}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={costVendor}
                  onChangeText={setCostVendor}
                  placeholder={t.seller.vendorPlaceholder}
                  placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.bronze, 0.25)}
                />
              </View>

              {/* Sync to personal toggle — only for new costs */}
              {!editingCostId && (
                <>
                  <Pressable
                    style={({ pressed }) => [styles.syncToggleRow, pressed && { opacity: 0.7 }]}
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
                      {syncToPersonal && <Feather name="check" size={12} color={C.onAccent} />}
                    </View>
                    <Text style={styles.syncToggleText}>{t.seller.alsoRecordPersonal}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.syncToggleRow, pressed && { opacity: 0.7 }]}
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
                      {saveAsTemplate && <Feather name="check" size={12} color={C.onAccent} />}
                    </View>
                    <Text style={styles.syncToggleText}>{t.seller.saveAsTemplate}</Text>
                  </Pressable>
                </>
              )}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => {
                    lightTap();
                    setEditingCostId(null);
                    setSyncToPersonal(false);
                    setShowCostModal(false);
                  }}
                  style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalCancelText}>{t.seller.cmCancel}</Text>
                </Pressable>
                <Pressable
                  onPress={guardedSaveCost}
                  style={({ pressed }) => [styles.modalConfirm, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={editingCostId ? 'Save cost' : 'Log cost'}
                >
                  <Text style={styles.modalConfirmText}>
                    {editingCostId ? t.seller.saveLabel : t.seller.logLabel}
                  </Text>
                </Pressable>
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
                  <Text style={styles.modalTitle}>
                    {'edit '}<Text style={styles.modalTitleAccent}>template</Text>
                  </Text>
                  <Pressable
                    onPress={() => { lightTap(); setShowTemplateEditModal(false); }}
                    style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Feather name="x" size={18} color={C.textMuted} />
                  </Pressable>
                </View>
                <Text style={styles.modalSubtitle}>update your saved cost template</Text>

                <TextInput
                  style={styles.modalInput}
                  value={templateDesc}
                  onChangeText={setTemplateDesc}
                  placeholder={t.seller.templateDescPlaceholder}
                  placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                  autoFocus
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.bronze, 0.25)}
                />

                <View style={styles.currencyInputRow}>
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.currencyInput}
                    value={templateAmt}
                    onChangeText={setTemplateAmt}
                    placeholder="0.00"
                    placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                    keyboardType="decimal-pad"
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.bronze, 0.25)}
                  />
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => { lightTap(); setShowTemplateEditModal(false); }}
                    style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.modalCancelText}>{t.seller.cmCancel}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!templateDesc.trim() || !templateAmt.trim()) {
                        warningNotification();
                        showToast(t.seller.fillTemplateFields, 'error');
                        return;
                      }
                      if (editingTemplateId) {
                        updateCostTemplate(editingTemplateId, {
                          description: templateDesc.trim(),
                          amount: parseFloat(templateAmt) || 0,
                        });
                      }
                      successNotification();
                      showToast(t.seller.templateUpdated, 'success');
                      setShowTemplateEditModal(false);
                    }}
                    style={({ pressed }) => [styles.modalConfirm, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.modalConfirmText}>{t.seller.saveLabel}</Text>
                  </Pressable>
                </View>
              </Pressable>
            </KeyboardAwareScrollView>
          </Pressable>
        )}

        </View>
        <ModalToastHost />
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
                <Text style={styles.modalTitle}>
                  {'cost '}<Text style={styles.modalTitleAccent}>budget</Text>
                </Text>
                <Pressable
                  onPress={() => { lightTap(); setShowBudgetModal(false); }}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={18} color={C.textMuted} />
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>{t.seller.cmBudgetHint.replace('{name}', activeSeason?.name || 'this season')}</Text>

              <View style={styles.currencyInputRow}>
                <Text style={styles.currencyPrefix}>{currency}</Text>
                <TextInput
                  style={styles.currencyInput}
                  value={budgetInput}
                  onChangeText={setBudgetInput}
                  placeholder="0.00"
                  placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                  keyboardType="decimal-pad"
                  autoFocus
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.bronze, 0.25)}
                />
              </View>

              <View style={styles.modalActions}>
                {budget ? (
                  <Pressable
                    onPress={() => {
                      lightTap();
                      if (activeSeason) {
                        updateSeasonBudget(activeSeason.id, undefined);
                        showToast(t.seller.budgetCleared, 'success');
                      }
                      setShowBudgetModal(false);
                    }}
                    style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Clear budget"
                  >
                    <Text style={styles.modalCancelText}>{t.seller.clearLabel}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => { lightTap(); setShowBudgetModal(false); }}
                    style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.modalCancelText}>{t.seller.cmCancel}</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleSaveBudget}
                  style={({ pressed }) => [styles.modalConfirm, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Save budget"
                >
                  <Text style={styles.modalConfirmText}>{t.seller.saveLabel}</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
        <ModalToastHost />
      </Modal>)}

      <ReceiptViewer uri={viewerUri} onClose={() => setViewerUri(null)} />

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="scan"
        currentUsage={15 - getRemainingScans()}
      />
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
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
    fontWeight: TYPOGRAPHY.weight.bold,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    fontWeight: TYPOGRAPHY.weight.medium,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    fontSize: TYPOGRAPHY.size.base,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    paddingVertical: SPACING['4xl'],
    paddingHorizontal: SPACING['2xl'],
    gap: SPACING.md,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
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
    fontWeight: TYPOGRAPHY.weight.bold,
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
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flex: 1,
  },
  historyItemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  historyItemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 2,
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
    fontWeight: TYPOGRAPHY.weight.medium,
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
    backgroundColor: C.deepOliveBiz,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  fabText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // ── Modals ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.4),
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    width: '100%',
    maxWidth: 420,
    gap: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
  },
  modalTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.bronze,
  },
  modalSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    letterSpacing: 0.1,
    marginTop: -SPACING.sm,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldGroup: {
    gap: SPACING.xs,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    letterSpacing: 0.2,
  },
  modalInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
  },
  modalInputError: {
    borderColor: BIZ.inputError,
    backgroundColor: withAlpha(BIZ.inputError, 0.08),
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  modalConfirm: {
    flex: 2,
    paddingVertical: SPACING.md + 2,
    backgroundColor: C.bronze,
    borderRadius: RADIUS.full,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  costTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    flex: 1,
  },
  costDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    top: 4,
    gap: SPACING.xs,
    backgroundColor: C.background,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
  },
  costDateText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
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
    fontWeight: TYPOGRAPHY.weight.medium,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingLeft: SPACING.md,
  },
  currencyInputRowError: {
    borderColor: BIZ.inputError,
    backgroundColor: withAlpha(BIZ.inputError, 0.08),
  },
  currencyPrefix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
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

  // ─── Recurring costs ──────────────────────────────────────
  recurringCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  recurringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  recurringTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    fontWeight: TYPOGRAPHY.weight.medium,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    marginHorizontal: SPACING.xl,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center' as const,
  },
  modalSave: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    marginTop: SPACING.xs,
    minHeight: 52,
    justifyContent: 'center',
  },
  modalSaveText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  freqPill: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  freqPillActive: {
    backgroundColor: withAlpha(C.bronze, 0.12),
  },
  freqPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  freqPillTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ─── Receipt + category UI ──────────────────────────────
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  receiptThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    overflow: 'visible',
  },
  receiptThumb: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
  },
  receiptRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  historyVendor: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    flexShrink: 1,
  },
  historyReceiptBtn: {
    padding: 2,
  },
  filterChipsWrap: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  filterChipsContent: {
    gap: SPACING.sm,
    paddingRight: SPACING['2xl'],
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  filterChipActive: {
    backgroundColor: withAlpha(C.bronze, 0.12),
    borderColor: C.bronze,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  filterChipTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  filterFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
  },
  catBreakdown: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  catBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: C.border,
  },
  catLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  catLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  catLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catLegendText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
});

export default CostManagement;
