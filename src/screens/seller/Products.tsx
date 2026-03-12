import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  Alert,
  Animated,
  Keyboard,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  PanResponder,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { SellerProduct, IngredientCost } from '../../types';
import {
  lightTap,
  mediumTap,
  selectionChanged,
  successNotification,
  warningNotification,
} from '../../services/haptics';
import * as ImagePicker from 'expo-image-picker';
import { parseProductList, parseProductImage, ParsedProduct } from '../../services/aiService';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DEFAULT_UNITS = ['balang', 'tin', 'bekas', 'pack', 'piece', 'kotak', 'biji', 'keping'];
const SWIPE_THRESHOLD = 80;

// ─── Animated product row wrapper ──────────────────────────────
const AnimatedProductCard: React.FC<{ index: number; children: React.ReactNode }> = React.memo(({
  index,
  children,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay: Math.min(index * 50, 300),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        delay: Math.min(index * 50, 300),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
});

// ─── Main component ────────────────────────────────────────────
const Products: React.FC = () => {
  const products = useSellerStore((s) => s.products);
  const orders = useSellerStore((s) => s.orders);
  const ingredientCosts = useSellerStore((s) => s.ingredientCosts);
  const addProduct = useSellerStore((s) => s.addProduct);
  const updateProduct = useSellerStore((s) => s.updateProduct);
  const deleteProduct = useSellerStore((s) => s.deleteProduct);
  const addIngredientCost = useSellerStore((s) => s.addIngredientCost);
  const updateIngredientCost = useSellerStore((s) => s.updateIngredientCost);
  const deleteIngredientCost = useSellerStore((s) => s.deleteIngredientCost);
  const markCostSynced = useSellerStore((s) => s.markCostSynced);
  const productOrder = useSellerStore((s) => s.productOrder);
  const setProductOrder = useSellerStore((s) => s.setProductOrder);
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const updateTransaction = usePersonalStore((s) => s.updateTransaction);
  const customUnits = useSellerStore((s) => s.customUnits);
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const unitOrder = useSellerStore((s) => s.unitOrder);
  const hiddenUnits = useSellerStore((s) => s.hiddenUnits);

  // ─── Search state ──────────────────────────────────────────
  const [search, setSearch] = useState('');

  const allUnits = useMemo(() => {
    const combined = [...DEFAULT_UNITS, ...(customUnits || [])].filter(
      (u) => !(hiddenUnits || []).includes(u)
    );
    if (unitOrder.length === 0) return combined;
    const ordered = unitOrder.filter((u) => combined.includes(u));
    const remaining = combined.filter((u) => !unitOrder.includes(u));
    return [...ordered, ...remaining];
  }, [customUnits, unitOrder, hiddenUnits]);

  // ─── Sorted & filtered products ───────────────────────────
  const sortedProducts = useMemo(() => {
    if (productOrder.length === 0) return products;
    const orderMap = new Map(productOrder.map((id, i) => [id, i]));
    return [...products].sort((a, b) => {
      const ai = orderMap.get(a.id);
      const bi = orderMap.get(b.id);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return 0;
    });
  }, [products, productOrder]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return sortedProducts;
    const q = search.trim().toLowerCase();
    return sortedProducts.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.unit.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }, [sortedProducts, search]);

  // ─── Popular this month ────────────────────────────────────
  const topProducts = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const monthOrders = orders.filter((o) => {
      const d = o.date instanceof Date ? o.date : new Date(o.date);
      return d >= monthStart && d <= monthEnd;
    });
    const counts: Record<string, { name: string; qty: number; unit: string; inflow: number }> = {};
    for (const order of monthOrders) {
      for (const item of order.items) {
        if (!counts[item.productName]) {
          counts[item.productName] = { name: item.productName, qty: 0, unit: item.unit, inflow: 0 };
        }
        counts[item.productName].qty += item.quantity;
        counts[item.productName].inflow += item.quantity * item.unitPrice;
      }
    }
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);
  const topMax = topProducts.length > 0 ? topProducts[0].qty : 1;

  // ─── Modal state ───────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<SellerProduct | null>(null);
  const [syncToPersonal, setSyncToPersonal] = useState(false);

  // ─── Form state (shared between add & edit) ────────────────
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newUnit, setNewUnit] = useState(() => {
    const combined = [...DEFAULT_UNITS, ...(customUnits || [])].filter((u) => !(hiddenUnits || []).includes(u));
    if (unitOrder.length === 0) return combined[0] || 'tin';
    const ordered = unitOrder.filter((u) => combined.includes(u));
    const remaining = combined.filter((u) => !unitOrder.includes(u));
    return [...ordered, ...remaining][0] || 'tin';
  });
  const [newCostPerUnit, setNewCostPerUnit] = useState('');
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTrackStock, setNewTrackStock] = useState(false);
  const [newStockQty, setNewStockQty] = useState('');
  const [reorderMode, setReorderMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── Bulk import state ──────────────────────────────────────
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkResults, setBulkResults] = useState<ParsedProduct[] | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());

  // ─── Focus state ───────────────────────────────────────────
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // ─── Unit picker modal ─────────────────────────────────────
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  // ─── Remember last used unit (session only) ────────────────
  const lastUsedUnitRef = useRef(allUnits[0] || 'tin');

  // ─── Validation state ──────────────────────────────────────
  const [nameError, setNameError] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [costDescError, setCostDescError] = useState(false);
  const [costAmtError, setCostAmtError] = useState(false);
  const nameShakeAnim = useRef(new Animated.Value(0)).current;
  const priceShakeAnim = useRef(new Animated.Value(0)).current;
  const costDescShakeAnim = useRef(new Animated.Value(0)).current;
  const costAmtShakeAnim = useRef(new Animated.Value(0)).current;

  // ─── Quick add mode ────────────────────────────────────────
  const [justAdded, setJustAdded] = useState(false);
  const addCheckAnim = useRef(new Animated.Value(0)).current;

  // ─── Swipe to close ───────────────────────────────────────
  const modalTranslateY = useRef(new Animated.Value(0)).current;
  const modalOpacity = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          modalTranslateY.setValue(gs.dy);
          modalOpacity.setValue(1 - gs.dy / 400);
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SWIPE_THRESHOLD) {
          Animated.parallel([
            Animated.timing(modalTranslateY, {
              toValue: Dimensions.get('window').height,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(modalOpacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setShowAdd(false);
            setEditingProduct(null);
            modalTranslateY.setValue(0);
            modalOpacity.setValue(1);
          });
        } else {
          Animated.spring(modalTranslateY, {
            toValue: 0,
            friction: 8,
            useNativeDriver: true,
          }).start();
          Animated.spring(modalOpacity, {
            toValue: 1,
            friction: 8,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

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

  const resetForm = useCallback(() => {
    setNewName('');
    setNewPrice('');
    setNewCostPerUnit('');
    setNewDescription('');
    setNewUnit(lastUsedUnitRef.current);
    setNameError(false);
    setPriceError(false);
    setJustAdded(false);
    setFocusedField(null);
    setNewTrackStock(false);
    setNewStockQty('');
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setEditingProduct(null);
    modalTranslateY.setValue(0);
    modalOpacity.setValue(1);
    setShowAdd(true);
    lightTap();
  }, [resetForm]);

  const openEditModal = useCallback((product: SellerProduct) => {
    setEditingProduct(product);
    setNewName(product.name);
    setNewDescription(product.description || '');
    setNewPrice(product.pricePerUnit.toString());
    setNewCostPerUnit(product.costPerUnit ? product.costPerUnit.toString() : '');
    setNewUnit(product.unit);
    setNewTrackStock(product.trackStock || false);
    setNewStockQty(product.stockQuantity != null ? product.stockQuantity.toString() : '');
    setNameError(false);
    setPriceError(false);
    setJustAdded(false);
    setFocusedField(null);
    modalTranslateY.setValue(0);
    modalOpacity.setValue(1);
    setShowAdd(true);
    mediumTap();
  }, []);

  const closeAddModal = useCallback(() => {
    setShowAdd(false);
    setEditingProduct(null);
    resetForm();
    lightTap();
  }, [resetForm]);

  // ─── Bulk import handlers ─────────────────────────────────
  const handleBulkParse = useCallback(async () => {
    if (!bulkText.trim()) return;
    Keyboard.dismiss();
    setBulkParsing(true);
    try {
      const results = await parseProductList(bulkText.trim(), allUnits);
      if (results && results.length > 0) {
        setBulkResults(results);
        setBulkSelected(new Set(results.map((_, i) => i)));
      } else {
        showToast('could not find any products in the text', 'error');
      }
    } catch {
      showToast('something went wrong', 'error');
    } finally {
      setBulkParsing(false);
    }
  }, [bulkText, allUnits, showToast]);

  const handleBulkImage = useCallback(async (source: 'camera' | 'gallery') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showToast(`please grant ${source} permission`, 'error');
      return;
    }

    const picker = source === 'camera'
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await picker({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets[0]) return;

    setBulkParsing(true);
    try {
      const uri = result.assets[0].uri;
      const results = await parseProductImage(uri, allUnits);
      if (results && results.length > 0) {
        setBulkResults(results);
        setBulkSelected(new Set(results.map((_, i) => i)));
      } else {
        showToast('could not find any products in the image', 'error');
      }
    } catch (err: any) {
      console.warn('[bulkImage]', err?.message || err);
      showToast(err?.message || 'something went wrong', 'error');
    } finally {
      setBulkParsing(false);
    }
  }, [allUnits, showToast]);

  const handleBulkAdd = useCallback(() => {
    if (!bulkResults) return;
    const toAdd = bulkResults.filter((_, i) => bulkSelected.has(i));
    if (toAdd.length === 0) {
      showToast('select at least one product', 'error');
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    for (const p of toAdd) {
      addProduct({
        name: p.name,
        description: p.description,
        pricePerUnit: p.pricePerUnit,
        costPerUnit: p.costPerUnit,
        unit: p.unit,
        isActive: true,
      });
    }
    successNotification();
    showToast(`${toAdd.length} product${toAdd.length > 1 ? 's' : ''} added`, 'success');
    setShowBulk(false);
    setBulkText('');
    setBulkResults(null);
    setBulkSelected(new Set());
  }, [bulkResults, bulkSelected, addProduct, showToast]);

  const closeBulkModal = useCallback(() => {
    setShowBulk(false);
    setBulkText('');
    setBulkResults(null);
    setBulkSelected(new Set());
  }, []);

  // ─── Duplicate detection ───────────────────────────────────
  const duplicateWarning = useMemo(() => {
    const trimmed = newName.trim().toLowerCase();
    if (!trimmed) return null;
    const match = products.find(
      (p) =>
        p.name.toLowerCase() === trimmed &&
        (!editingProduct || p.id !== editingProduct.id)
    );
    return match ? match.name : null;
  }, [newName, products, editingProduct]);

  // ─── Profit preview with margin % ─────────────────────────
  const keptPreview = useMemo(() => {
    const price = parseFloat(newPrice);
    const cost = parseFloat(newCostPerUnit);
    if (!isNaN(price) && !isNaN(cost) && price > 0 && cost > 0) {
      const kept = price - cost;
      const margin = Math.round((kept / price) * 100);
      return { kept: kept.toFixed(2), margin };
    }
    return null;
  }, [newPrice, newCostPerUnit]);

  // ─── Handlers ──────────────────────────────────────────────

  const handleAddProduct = useCallback(() => {
    const hasNameErr = !newName.trim();
    const hasPriceErr = !newPrice.trim();

    setNameError(hasNameErr);
    setPriceError(hasPriceErr);

    if (hasNameErr) shakeField(nameShakeAnim);
    if (hasPriceErr) shakeField(priceShakeAnim);

    if (hasNameErr || hasPriceErr) {
      warningNotification();
      showToast('please fill in product name and price', 'error');
      return;
    }

    if (!parseFloat(newPrice) || parseFloat(newPrice) <= 0) {
      setPriceError(true);
      shakeField(priceShakeAnim);
      warningNotification();
      showToast('price must be greater than 0.', 'error');
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    addProduct({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      pricePerUnit: parseFloat(newPrice) || 0,
      costPerUnit: newCostPerUnit ? parseFloat(newCostPerUnit) : undefined,
      unit: newUnit,
      isActive: true,
      trackStock: newTrackStock || undefined,
      stockQuantity: newTrackStock && newStockQty ? parseFloat(newStockQty) : undefined,
    });
    successNotification();

    // Remember last used unit
    lastUsedUnitRef.current = newUnit;

    // Quick add mode: show success, reset form, keep modal open
    setJustAdded(true);
    addCheckAnim.setValue(0);
    Animated.spring(addCheckAnim, {
      toValue: 1,
      friction: 4,
      tension: 80,
      useNativeDriver: true,
    }).start();

    // Reset form for next product
    setNewName('');
    setNewDescription('');
    setNewPrice('');
    setNewCostPerUnit('');
    // Keep last used unit
    setNameError(false);
    setPriceError(false);
  }, [newName, newDescription, newPrice, newCostPerUnit, newUnit, addProduct, showToast]);

  const handleSaveEdit = useCallback(() => {
    if (!editingProduct) return;
    const hasNameErr = !newName.trim();
    const hasPriceErr = !newPrice.trim();

    setNameError(hasNameErr);
    setPriceError(hasPriceErr);

    if (hasNameErr) shakeField(nameShakeAnim);
    if (hasPriceErr) shakeField(priceShakeAnim);

    if (hasNameErr || hasPriceErr) {
      warningNotification();
      showToast('please fill in product name and price', 'error');
      return;
    }

    if (!parseFloat(newPrice) || parseFloat(newPrice) <= 0) {
      setPriceError(true);
      shakeField(priceShakeAnim);
      warningNotification();
      showToast('price must be greater than 0.', 'error');
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    updateProduct(editingProduct.id, {
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      pricePerUnit: parseFloat(newPrice) || 0,
      costPerUnit: newCostPerUnit ? parseFloat(newCostPerUnit) : undefined,
      unit: newUnit,
      trackStock: newTrackStock || undefined,
      stockQuantity: newTrackStock && newStockQty ? parseFloat(newStockQty) : undefined,
    });
    successNotification();
    showToast('product updated', 'success');
    closeAddModal();
  }, [editingProduct, newName, newDescription, newPrice, newCostPerUnit, newUnit, newTrackStock, newStockQty, updateProduct, showToast, closeAddModal]);

  const handleAddCost = useCallback(() => {
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
      updateIngredientCost(editingCostId, { description: desc, amount });

      // Also update linked personal transaction if it was synced
      const editedCost = ingredientCosts.find((c) => c.id === editingCostId);
      if (editedCost?.syncedToPersonal && editedCost.personalTransactionId) {
        updateTransaction(editedCost.personalTransactionId, {
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
    setCostDescription('');
    setCostAmount('');
    setCostDescError(false);
    setCostAmtError(false);
    setEditingCostId(null);
    setSyncToPersonal(false);
    setShowCostModal(false);
  }, [costDescription, costAmount, editingCostId, syncToPersonal, addIngredientCost, updateIngredientCost, addTransaction, updateTransaction, markCostSynced, activeSeason, ingredientCosts, showToast]);

  const toggleSelectProduct = useCallback((id: string) => {
    selectionChanged();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    warningNotification();
    Alert.alert(
      `Remove ${selectedIds.size} product${selectedIds.size > 1 ? 's' : ''}?`,
      'Existing orders won\'t be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            for (const id of selectedIds) {
              deleteProduct(id);
            }
            successNotification();
            showToast(`${selectedIds.size} product${selectedIds.size > 1 ? 's' : ''} removed`, 'success');
            setSelectedIds(new Set());
            setSelectMode(false);
          },
        },
      ]
    );
  }, [selectedIds, deleteProduct, showToast]);

  const handleToggleActive = useCallback((product: SellerProduct) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    lightTap();
    updateProduct(product.id, { isActive: !product.isActive });
  }, [updateProduct]);

  const handleDelete = useCallback((product: SellerProduct) => {
    warningNotification();
    Alert.alert(
      'Remove product?',
      `Remove ${product.name}? Orders that already have this product won't be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            deleteProduct(product.id);
          },
        },
      ]
    );
  }, [deleteProduct]);

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
    setShowCostModal(true);
  }, []);

  // Clear errors on typing
  useEffect(() => { if (newName) setNameError(false); }, [newName]);
  useEffect(() => { if (newPrice) setPriceError(false); }, [newPrice]);
  useEffect(() => { if (costDescription) setCostDescError(false); }, [costDescription]);
  useEffect(() => { if (costAmount) setCostAmtError(false); }, [costAmount]);

  // ─── Input border style helper ─────────────────────────────
  const getInputStyle = (field: string, hasError: boolean) => [
    styles.modalInput,
    focusedField === field && styles.modalInputFocused,
    hasError && styles.modalInputError,
  ];

  // ─── Render product row (handles both normal + reorder mode) ──
  const renderProduct = useCallback(
    ({ item, getIndex, drag, isActive: isDragging }: RenderItemParams<SellerProduct>) => {
      const initial = item.name.charAt(0).toUpperCase();
      const marginPct = item.costPerUnit && item.pricePerUnit > 0
        ? Math.round(((item.pricePerUnit - item.costPerUnit) / item.pricePerUnit) * 100)
        : null;

      const sub: string[] = [];
      if (item.description) sub.push(item.description);
      if (item.totalSold > 0) sub.push(`${item.totalSold} sold`);
      if (marginPct !== null) sub.push(`${marginPct}% margin`);
      if (item.trackStock && item.stockQuantity != null) sub.push(`${item.stockQuantity} in stock`);

      const isSelected = selectMode && selectedIds.has(item.id);

      return (
        <ScaleDecorator>
          <AnimatedProductCard index={getIndex() ?? 0}>
            <TouchableOpacity
              style={[
                styles.productRow,
                !item.isActive && !selectMode && styles.productRowInactive,
                isDragging && styles.productRowDragging,
                isSelected && styles.productRowSelected,
              ]}
              activeOpacity={reorderMode ? 0.8 : 0.65}
              onPress={
                selectMode
                  ? () => toggleSelectProduct(item.id)
                  : reorderMode
                  ? undefined
                  : () => openEditModal(item)
              }
              onLongPress={
                selectMode
                  ? undefined
                  : reorderMode
                  ? drag
                  : () => handleDelete(item)
              }
              delayLongPress={reorderMode ? 150 : 500}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. Tap to edit, hold to delete.`}
            >
              {selectMode ? (
                <View style={[styles.selectCheckbox, isSelected && styles.selectCheckboxActive]}>
                  {isSelected && <Feather name="check" size={14} color="#fff" />}
                </View>
              ) : (
                <View style={[styles.rowAvatar, !item.isActive && styles.rowAvatarInactive]}>
                  <Text style={styles.rowAvatarText}>{initial}</Text>
                </View>
              )}
              <View style={styles.rowContent}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.rowPrice}>
                    {currency} {item.pricePerUnit.toFixed(2)}
                    <Text style={styles.rowUnit}>/{item.unit}</Text>
                  </Text>
                </View>
                {sub.length > 0 && (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {sub.join('  \u00B7  ')}
                  </Text>
                )}
              </View>
              {reorderMode ? (
                <Feather name="menu" size={18} color={isDragging ? CALM.accent : CALM.neutral} />
              ) : !selectMode ? (
                <Switch
                  value={item.isActive}
                  onValueChange={() => handleToggleActive(item)}
                  trackColor={{ false: CALM.border, true: CALM.bronze }}
                  thumbColor="#fff"
                  style={styles.rowSwitch}
                  accessibilityRole="switch"
                  accessibilityLabel={`Toggle ${item.name} active`}
                />
              ) : null}
            </TouchableOpacity>
          </AnimatedProductCard>
        </ScaleDecorator>
      );
    },
    [currency, openEditModal, handleToggleActive, handleDelete, reorderMode, selectMode, selectedIds, toggleSelectProduct]
  );

  // ─── FlatList render helpers ────────────────────────────────
  const productKeyExtractor = useCallback((p: SellerProduct) => p.id, []);

  // ─── List header ────────────────────────────────────────────
  const ListHeaderComponent = useMemo(() => (
    <View style={styles.listHeaderWrap}>
      {/* Action row */}
      <View style={styles.listHeader}>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          {selectMode ? (
            <>
              <TouchableOpacity
                style={styles.reorderButton}
                activeOpacity={0.7}
                onPress={() => {
                  lightTap();
                  if (selectedIds.size === filteredProducts.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
                  }
                }}
              >
                <Feather
                  name={selectedIds.size === filteredProducts.length ? 'check-square' : 'square'}
                  size={14}
                  color={CALM.bronze}
                />
                <Text style={styles.reorderText}>
                  {selectedIds.size === filteredProducts.length ? 'deselect all' : 'select all'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reorderButton, styles.reorderButtonActive]}
                activeOpacity={0.7}
                onPress={() => {
                  lightTap();
                  setSelectMode(false);
                  setSelectedIds(new Set());
                }}
              >
                <Text style={styles.reorderTextActive}>done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {products.length > 1 && (
                <>
                  <TouchableOpacity
                    style={styles.reorderButton}
                    activeOpacity={0.7}
                    onPress={() => {
                      lightTap();
                      setSelectMode(true);
                      setSelectedIds(new Set());
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Select products to delete"
                  >
                    <Feather name="check-square" size={14} color={CALM.bronze} />
                    <Text style={styles.reorderText}>select</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.reorderButton, reorderMode && styles.reorderButtonActive]}
                    activeOpacity={0.7}
                    onPress={() => {
                      lightTap();
                      setReorderMode((v) => !v);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={reorderMode ? 'Done reordering' : 'Reorder products'}
                  >
                    <Feather name="list" size={14} color={reorderMode ? '#fff' : CALM.bronze} />
                    <Text style={[styles.reorderText, reorderMode && styles.reorderTextActive]}>
                      {reorderMode ? 'done' : 'reorder'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={styles.logCostHeaderButton}
                activeOpacity={0.7}
                onPress={() => handleOpenCostModal()}
                accessibilityRole="button"
                accessibilityLabel="Log ingredient cost"
              >
                <Feather name="plus-circle" size={14} color={CALM.bronze} />
                <Text style={styles.logCostHeaderText}>log cost</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Feather name="search" size={14} color={CALM.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="search products..."
          placeholderTextColor={CALM.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          accessibilityLabel="Search products"
          accessibilityRole="search"
        />
        {search.length > 0 ? (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Feather name="x" size={14} color={CALM.textMuted} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.searchProductCount}>{products.length}</Text>
        )}
      </View>
      {search.trim().length > 0 && (
        <Text style={styles.searchCount}>showing {filteredProducts.length} of {products.length}</Text>
      )}

      {/* Popular this month */}
      {topProducts.length > 0 && (
        <View style={styles.popularSection}>
          <Text style={styles.popularHeader}>POPULAR THIS MONTH</Text>
          {topProducts.map((p, index) => {
            const barWidth = topMax > 0 ? (p.qty / topMax) * 100 : 0;
            return (
              <View key={p.name} style={styles.popularRow}>
                <View style={styles.popularContent}>
                  <Text style={styles.popularRank}>{index + 1}</Text>
                  <Text style={styles.popularName}>{p.name}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.popularQty}>{p.qty} {p.unit}</Text>
                  <Text style={styles.popularInflow}>  {currency} {p.inflow.toFixed(0)}</Text>
                </View>
                <View style={styles.popularBarTrack}>
                  <View style={[styles.popularBarFill, { width: `${barWidth}%` as any }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  ), [products.length, handleOpenCostModal, search, filteredProducts, topProducts, topMax, currency, selectMode, selectedIds, reorderMode]);

  // ─── Live preview values ───────────────────────────────────
  const previewName = newName.trim() || 'product name';
  const previewPrice = parseFloat(newPrice);
  const previewPriceStr = !isNaN(previewPrice) ? previewPrice.toFixed(2) : '0.00';

  // ─── Shared form JSX ──────────────────────────────────────
  const renderProductForm = () => (
    <>
      {/* Drag handle */}
      <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
        <View style={styles.dragHandle} />
      </View>

      {/* Modal header */}
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>
          {editingProduct ? 'edit product' : 'new product'}
        </Text>
        <TouchableOpacity
          onPress={closeAddModal}
          style={styles.modalCloseBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Feather name="x" size={18} color={CALM.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Success state after adding ─────────────────────── */}
      {justAdded && !editingProduct ? (
        <View style={styles.justAddedSection}>
          <Animated.View
            style={[
              styles.justAddedIcon,
              { transform: [{ scale: addCheckAnim }] },
            ]}
          >
            <Feather name="check-circle" size={32} color={BIZ.success} />
          </Animated.View>
          <Text style={styles.justAddedTitle}>product added!</Text>
          <Text style={styles.justAddedHint}>add another or tap done to close</Text>
        </View>
      ) : (
      <>
      {/* ── Live preview card ─────────────────────────────── */}
      <View style={styles.previewCard}>
        <View style={styles.previewRow}>
          <View style={styles.previewIcon}>
            <Feather name="package" size={18} color={CALM.bronze} />
          </View>
          <View style={styles.previewInfo}>
            <Text
              style={[
                styles.previewName,
                !newName.trim() && styles.previewNamePlaceholder,
              ]}
              numberOfLines={1}
            >
              {previewName}
            </Text>
            <Text style={styles.previewPrice}>
              {currency} {previewPriceStr} / {newUnit}
            </Text>
            {newDescription.trim() ? (
              <Text style={styles.previewDesc} numberOfLines={1}>{newDescription.trim()}</Text>
            ) : null}
          </View>
          {keptPreview && (
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>
                +{keptPreview.margin}%
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Name ──────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>name</Text>
        <Animated.View style={{ transform: [{ translateX: nameShakeAnim }] }}>
          <TextInput
            style={getInputStyle('name', nameError)}
            value={newName}
            onChangeText={setNewName}
            placeholder="e.g. semperit kuning"
            placeholderTextColor={CALM.textMuted}
            autoFocus={!editingProduct}
            onFocus={() => setFocusedField('name')}
            onBlur={() => setFocusedField(null)}
          />
        </Animated.View>
        {duplicateWarning && (
          <View style={styles.warningRow}>
            <Feather name="alert-circle" size={12} color={CALM.bronze} />
            <Text style={styles.warningText}>
              "{duplicateWarning}" already exists
            </Text>
          </View>
        )}
      </View>

      {/* ── Description (optional) ────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>description <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
        <TextInput
          style={[getInputStyle('desc', false), styles.descInput]}
          value={newDescription}
          onChangeText={setNewDescription}
          placeholder="e.g. 40+ pieces per tin"
          placeholderTextColor={CALM.textMuted}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          onFocus={() => setFocusedField('desc')}
          onBlur={() => setFocusedField(null)}
        />
      </View>

      {/* ── Pricing ───────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>pricing</Text>
        <View style={styles.modalRow}>
          <View style={{ flex: 1 }}>
            <Animated.View style={{ transform: [{ translateX: priceShakeAnim }] }}>
              <View
                style={[
                  styles.currencyInputRow,
                  focusedField === 'price' && styles.currencyInputRowFocused,
                  priceError && styles.currencyInputRowError,
                ]}
              >
                <Text style={styles.currencyPrefix}>{currency}</Text>
                <TextInput
                  style={styles.currencyInput}
                  value={newPrice}
                  onChangeText={setNewPrice}
                  placeholder="price"
                  placeholderTextColor={CALM.textMuted}
                  keyboardType="decimal-pad"
                  onFocus={() => setFocusedField('price')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </Animated.View>
          </View>
          <View style={{ flex: 1 }}>
            <View
              style={[
                styles.currencyInputRow,
                focusedField === 'cost' && styles.currencyInputRowFocused,
              ]}
            >
              <Text style={styles.currencyPrefix}>{currency}</Text>
              <TextInput
                style={styles.currencyInput}
                value={newCostPerUnit}
                onChangeText={setNewCostPerUnit}
                placeholder="cost"
                placeholderTextColor={CALM.textMuted}
                keyboardType="decimal-pad"
                onFocus={() => setFocusedField('cost')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>
        </View>
        {keptPreview && (
          <View style={styles.profitRow}>
            <Feather name="trending-up" size={12} color={BIZ.profit} />
            <Text style={styles.profitText}>
              kept {currency} {keptPreview.kept}/unit
            </Text>
            <View
              style={[
                styles.marginBadge,
                keptPreview.margin >= 50 && styles.marginBadgeHigh,
              ]}
            >
              <Text
                style={[
                  styles.marginBadgeText,
                  keptPreview.margin >= 50 && styles.marginBadgeTextHigh,
                ]}
              >
                {keptPreview.margin}%
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Unit & Stock (inline row) ─────────────────────── */}
      <View style={styles.fieldGroup}>
        <View style={styles.unitStockRow}>
          <TouchableOpacity
            style={styles.unitSelector}
            activeOpacity={0.7}
            onPress={() => {
              Keyboard.dismiss();
              lightTap();
              setShowUnitPicker(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Selected unit: ${newUnit}. Tap to change.`}
          >
            <Text style={styles.unitSelectorLabel}>unit</Text>
            <View style={styles.unitSelectorValue}>
              <Text style={styles.unitSelectorText}>{newUnit}</Text>
              <Feather name="chevron-down" size={14} color={CALM.textMuted} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.stockToggle}
            activeOpacity={0.7}
            onPress={() => {
              lightTap();
              setNewTrackStock((v) => !v);
            }}
          >
            <View
              style={[
                styles.syncToggleBox,
                newTrackStock && styles.syncToggleBoxActive,
              ]}
            >
              {newTrackStock && <Feather name="check" size={11} color="#fff" />}
            </View>
            <Text style={styles.stockToggleText}>track stock</Text>
          </TouchableOpacity>
        </View>

        {newTrackStock && (
          <View style={styles.stockInputWrap}>
            <View
              style={[
                styles.currencyInputRow,
                focusedField === 'stock' && styles.currencyInputRowFocused,
              ]}
            >
              <TextInput
                style={[styles.currencyInput, { paddingLeft: 12 }]}
                value={newStockQty}
                onChangeText={setNewStockQty}
                placeholder="current stock"
                placeholderTextColor={CALM.textMuted}
                keyboardType="decimal-pad"
                onFocus={() => setFocusedField('stock')}
                onBlur={() => setFocusedField(null)}
              />
              <Text style={styles.currencyPrefix}>{newUnit}</Text>
            </View>
          </View>
        )}
      </View>

      </>
      )}

      {/* ── Actions ───────────────────────────────────────── */}
      {editingProduct ? (
        <View style={styles.modalActions}>
          <TouchableOpacity
            onPress={closeAddModal}
            style={styles.modalCancel}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.modalCancelText}>cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSaveEdit}
            style={styles.modalConfirm}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Save product"
          >
            <Text style={styles.modalConfirmText}>save</Text>
          </TouchableOpacity>
        </View>
      ) : justAdded ? (
        <View style={styles.quickAddActions}>
          <TouchableOpacity
            onPress={() => {
              lightTap();
              setJustAdded(false);
            }}
            style={styles.addAnotherBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add another product"
          >
            <Feather name="plus" size={14} color={CALM.bronze} />
            <Text style={styles.addAnotherText}>add another</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={closeAddModal}
            style={styles.modalConfirm}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.modalConfirmText}>done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.modalActions}>
          <TouchableOpacity
            onPress={closeAddModal}
            style={styles.modalCancel}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.modalCancelText}>cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAddProduct}
            style={styles.modalConfirm}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add product"
          >
            <Text style={styles.modalConfirmText}>add</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  const onDragEnd = useCallback(({ data }: { data: SellerProduct[] }) => { lightTap(); setProductOrder(data.map((p) => p.id)); }, [setProductOrder]);

  // ─── Render ────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={styles.container}>
      <DraggableFlatList
        data={reorderMode ? sortedProducts : (products.length === 0 ? products : filteredProducts)}
        renderItem={renderProduct}
        keyExtractor={productKeyExtractor}
        onDragEnd={onDragEnd}
        ListHeaderComponent={products.length > 0 ? ListHeaderComponent : undefined}
        contentContainerStyle={[
          styles.listContent,
          products.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
          products.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="package" size={28} color={CALM.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>no products yet</Text>
              <Text style={styles.emptyHint}>
                add products you sell, set pricing, then start taking orders
              </Text>

              <TouchableOpacity
                style={styles.emptyCTA}
                activeOpacity={0.7}
                onPress={openAddModal}
                accessibilityRole="button"
                accessibilityLabel="Add your first product"
              >
                <Feather name="plus" size={18} color="#fff" />
                <Text style={styles.emptyCTAText}>add first product</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emptyBulkBtn}
                activeOpacity={0.7}
                onPress={() => { lightTap(); setShowBulk(true); }}
                accessibilityRole="button"
                accessibilityLabel="Bulk add with AI"
              >
                <Feather name="zap" size={16} color={CALM.bronze} />
                <Text style={styles.emptyBulkText}>bulk add with AI</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noResultsContainer}>
              <Feather name="search" size={20} color={CALM.textMuted} />
              <Text style={styles.noResultsText}>no match</Text>
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.noResultsClear}>clear</Text>
              </TouchableOpacity>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        activationDistance={reorderMode ? 5 : 99999}
        windowSize={5}
        maxToRenderPerBatch={8}
        removeClippedSubviews
      />

      {/* Bottom-anchored add buttons / select mode bar */}
      {products.length > 0 && (
        selectMode ? (
          <View style={styles.addButtonWrapper}>
            <TouchableOpacity
              style={[
                styles.addButton,
                { flex: 1, backgroundColor: selectedIds.size > 0 ? '#C1694F' : withAlpha(CALM.textMuted, 0.12) },
              ]}
              activeOpacity={0.7}
              onPress={handleBulkDelete}
              disabled={selectedIds.size === 0}
            >
              <Feather name="trash-2" size={18} color={selectedIds.size > 0 ? '#fff' : CALM.textMuted} />
              <Text style={[styles.addButtonText, selectedIds.size === 0 && { color: CALM.textMuted }]}>
                {selectedIds.size > 0
                  ? `remove ${selectedIds.size} product${selectedIds.size > 1 ? 's' : ''}`
                  : 'select products to remove'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.addButtonWrapper}>
            <TouchableOpacity
              style={styles.bulkAddButton}
              activeOpacity={0.7}
              onPress={() => { lightTap(); setShowBulk(true); }}
              accessibilityRole="button"
              accessibilityLabel="Bulk add with AI"
            >
              <Feather name="zap" size={18} color={CALM.bronze} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addButton, { flex: 1 }]}
              activeOpacity={0.7}
              onPress={openAddModal}
              accessibilityRole="button"
              accessibilityLabel="Add product"
            >
              <Feather name="plus" size={20} color="#fff" />
              <Text style={styles.addButtonText}>add product</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      {/* ── Add / Edit product modal ────────────────────────── */}
      <Modal visible={showAdd} transparent statusBarTranslucent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Animated.View
              style={[
                styles.modalContentAnimated,
                {
                  transform: [{ translateY: modalTranslateY }],
                  opacity: modalOpacity,
                },
              ]}
            >
              <View style={styles.modalContent}>
                {renderProductForm()}
              </View>
            </Animated.View>
          </KeyboardAwareScrollView>

          {/* ── Unit picker (inline overlay, not a separate Modal) ── */}
          {showUnitPicker && (
            <TouchableOpacity
              style={styles.unitModalOverlay}
              activeOpacity={1}
              onPress={() => { lightTap(); setShowUnitPicker(false); }}
            >
              <Pressable
                style={styles.unitModalContent}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.unitModalHeader}>
                  <Text style={styles.unitModalTitle}>select unit</Text>
                  <TouchableOpacity
                    onPress={() => { lightTap(); setShowUnitPicker(false); }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={20} color={CALM.textSecondary} />
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={allUnits}
                  keyExtractor={(u) => u}
                  style={styles.unitModalList}
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews
                  windowSize={5}
                  maxToRenderPerBatch={8}
                  renderItem={({ item: u }) => {
                    const isSelected = newUnit === u;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.unitModalItem,
                          isSelected && styles.unitModalItemSelected,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          selectionChanged();
                          setNewUnit(u);
                          setShowUnitPicker(false);
                        }}
                      >
                        <View style={styles.unitModalItemLeft}>
                          <View
                            style={[
                              styles.unitModalItemIcon,
                              isSelected && styles.unitModalItemIconSelected,
                            ]}
                          >
                            <Feather
                              name="box"
                              size={16}
                              color={isSelected ? '#fff' : CALM.bronze}
                            />
                          </View>
                          <Text
                            style={[
                              styles.unitModalItemText,
                              isSelected && styles.unitModalItemTextSelected,
                            ]}
                          >
                            {u}
                          </Text>
                        </View>
                        {isSelected && (
                          <Feather name="check" size={18} color={CALM.bronze} />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListFooterComponent={
                    <TouchableOpacity
                      style={styles.unitModalManageBtn}
                      activeOpacity={0.7}
                      onPress={() => {
                        lightTap();
                        setShowUnitPicker(false);
                        setShowAdd(false);
                        navigation.navigate('SellerSettings');
                      }}
                    >
                      <Feather name="settings" size={14} color={CALM.bronze} />
                      <Text style={styles.unitModalManageText}>manage units in settings</Text>
                    </TouchableOpacity>
                  }
                />
              </Pressable>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      {/* ── Log cost modal ──────────────────────────────────── */}
      <Modal visible={showCostModal} transparent statusBarTranslucent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Pressable style={styles.modalContent} onPress={() => Keyboard.dismiss()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingCostId ? 'edit cost' : 'log cost'}</Text>
                <TouchableOpacity
                  onPress={() => { lightTap(); setEditingCostId(null); setShowCostModal(false); }}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={18} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.costDatePill}>
                <Feather name="calendar" size={12} color={CALM.textSecondary} />
                <Text style={styles.costDateText}>
                  {editingCostId
                    ? format(ingredientCosts.find(c => c.id === editingCostId)?.date ?? new Date(), 'dd MMM yyyy')
                    : format(new Date(), 'dd MMM yyyy')}
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>what did you buy?</Text>
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
                      placeholderTextColor={CALM.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </Animated.View>
              </View>

              {/* Sync to personal toggle — only for new costs */}
              {!editingCostId && (
                <TouchableOpacity
                  style={styles.syncToggleRow}
                  activeOpacity={0.7}
                  onPress={() => { lightTap(); setSyncToPersonal((v) => !v); }}
                >
                  <View style={[styles.syncToggleBox, syncToPersonal && styles.syncToggleBoxActive]}>
                    {syncToPersonal && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <Text style={styles.syncToggleText}>also record as personal expense</Text>
                </TouchableOpacity>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => { lightTap(); setEditingCostId(null); setSyncToPersonal(false); setShowCostModal(false); }}
                  style={styles.modalCancel}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalCancelText}>cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddCost}
                  style={styles.modalConfirm}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={editingCostId ? "Save cost" : "Log cost"}
                >
                  <Text style={styles.modalConfirmText}>{editingCostId ? 'save' : 'log'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
      </Modal>

      {/* ── Bulk import modal ──────────────────────────────── */}
      <Modal visible={showBulk} transparent statusBarTranslucent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Pressable style={styles.modalContent} onPress={() => Keyboard.dismiss()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>bulk add</Text>
                <TouchableOpacity
                  onPress={closeBulkModal}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={18} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>

              {!bulkResults ? (
                <>
                  <Text style={styles.bulkHint}>
                    paste text or snap a photo of your product list
                  </Text>

                  {/* Image source buttons */}
                  <View style={styles.bulkImageRow}>
                    <TouchableOpacity
                      style={styles.bulkImageBtn}
                      activeOpacity={0.7}
                      onPress={() => handleBulkImage('camera')}
                      disabled={bulkParsing}
                    >
                      <Feather name="camera" size={18} color={CALM.bronze} />
                      <Text style={styles.bulkImageText}>take photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.bulkImageBtn}
                      activeOpacity={0.7}
                      onPress={() => handleBulkImage('gallery')}
                      disabled={bulkParsing}
                    >
                      <Feather name="image" size={18} color={CALM.bronze} />
                      <Text style={styles.bulkImageText}>from gallery</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.bulkDivider}>
                    <View style={styles.bulkDividerLine} />
                    <Text style={styles.bulkDividerText}>or type it</Text>
                    <View style={styles.bulkDividerLine} />
                  </View>

                  <TextInput
                    style={styles.bulkTextArea}
                    multiline
                    placeholder={'e.g.\nKuih Lapis - RM 8/tin\nDodol - RM 12/pack\nRendang - RM 15/bekas'}
                    placeholderTextColor={CALM.textMuted}
                    value={bulkText}
                    onChangeText={setBulkText}
                    textAlignVertical="top"
                  />

                  {bulkParsing && (
                    <View style={styles.bulkLoadingRow}>
                      <ActivityIndicator size="small" color={CALM.bronze} />
                      <Text style={styles.bulkLoadingText}>AI is reading your list...</Text>
                    </View>
                  )}

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      onPress={closeBulkModal}
                      style={styles.modalCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.modalCancelText}>cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleBulkParse}
                      style={[styles.modalConfirm, (!bulkText.trim() || bulkParsing) && { opacity: 0.5 }]}
                      activeOpacity={0.7}
                      disabled={!bulkText.trim() || bulkParsing}
                    >
                      <Text style={styles.modalConfirmText}>parse text</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.bulkHint}>
                    {bulkResults.length} product{bulkResults.length > 1 ? 's' : ''} found — tap to deselect
                  </Text>
                  {bulkResults.map((p, i) => {
                    const selected = bulkSelected.has(i);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[styles.bulkResultRow, !selected && styles.bulkResultDeselected]}
                        activeOpacity={0.7}
                        onPress={() => {
                          selectionChanged();
                          setBulkSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          });
                        }}
                      >
                        <View style={[styles.bulkCheckbox, selected && styles.bulkCheckboxSelected]}>
                          {selected && <Feather name="check" size={12} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bulkResultName}>{p.name}</Text>
                          <Text style={styles.bulkResultDetail}>
                            {currency} {p.pricePerUnit.toFixed(2)}/{p.unit}
                            {p.costPerUnit ? ` · cost ${currency} ${p.costPerUnit.toFixed(2)}` : ''}
                            {p.description ? ` · ${p.description}` : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      onPress={() => { setBulkResults(null); setBulkSelected(new Set()); }}
                      style={styles.modalCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.modalCancelText}>back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleBulkAdd}
                      style={[styles.modalConfirm, bulkSelected.size === 0 && { opacity: 0.5 }]}
                      activeOpacity={0.7}
                      disabled={bulkSelected.size === 0}
                    >
                      <Text style={styles.modalConfirmText}>
                        add {bulkSelected.size} product{bulkSelected.size !== 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
      </Modal>

    </GestureHandlerRootView>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: 80,
  },
  listContentEmpty: {
    minHeight: Dimensions.get('window').height * 0.6,
    justifyContent: 'center',
  },

  // List header wrapper
  listHeaderWrap: {
    gap: SPACING.sm,
    paddingBottom: SPACING.xs,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    paddingVertical: SPACING.xs,
  },
  searchCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as any,
    paddingLeft: SPACING.xs,
  },
  searchProductCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as any,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Compact product row
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    marginBottom: SPACING.sm,
  },
  productRowInactive: {
    opacity: 0.45,
  },
  productRowSelected: {
    borderColor: withAlpha('#C1694F', 0.35),
    backgroundColor: withAlpha('#C1694F', 0.04),
  },
  productRowDragging: {
    backgroundColor: withAlpha(CALM.accent, 0.06),
    borderColor: withAlpha(CALM.accent, 0.2),
  },
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: CALM.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  selectCheckboxActive: {
    backgroundColor: '#C1694F',
    borderColor: '#C1694F',
  },
  rowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarInactive: {
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
  },
  rowAvatarText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.bronze,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  rowName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    flex: 1,
  },
  rowPrice: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  rowUnit: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textMuted,
  },
  rowSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  rowSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
    marginLeft: SPACING.xs,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CALM.border,
    marginLeft: 52,
  },

  // No results
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.sm,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  noResultsClear: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
    paddingVertical: SPACING.xs,
  },

  syncToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
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

  // List header
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  listHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  listHeaderTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  listHeaderBadge: {
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeaderBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'],
  },
  logCostHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
  },
  logCostHeaderText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],
    paddingHorizontal: SPACING['3xl'],
    gap: SPACING.sm,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  emptyHint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.md,
    ...SHADOWS.sm,
  },
  emptyCTAText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  emptyBulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  emptyBulkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Bottom add button
  addButtonWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
    backgroundColor: CALM.background,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    ...SHADOWS.sm,
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Unit & Stock row
  unitStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unitSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  unitSelectorLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  unitSelectorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unitSelectorText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  stockToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  stockToggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  stockInputWrap: {
    marginTop: SPACING.sm,
  },

  // Unit picker modal
  unitModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    zIndex: 10,
  },
  unitModalContent: {
    width: '100%',
    maxHeight: '60%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.lg,
  },
  unitModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  unitModalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  unitModalList: {
    flexGrow: 0,
  },
  unitModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    minHeight: 48,
  },
  unitModalItemSelected: {
    backgroundColor: withAlpha(CALM.bronze, 0.06),
  },
  unitModalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  unitModalItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitModalItemIconSelected: {
    backgroundColor: CALM.bronze,
  },
  unitModalItemText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  unitModalItemTextSelected: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  unitModalManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  unitModalManageText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
  },

  // Modal
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
  modalContentAnimated: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderRadius: 20,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xs,
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
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    letterSpacing: -0.3,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CALM.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldGroup: {
    gap: SPACING.xs,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fieldLabelOptional: {
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },
  modalLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  modalInput: {
    ...TYPE.insight,
    lineHeight: undefined,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modalInputFocused: {
    borderColor: withAlpha(CALM.bronze, 0.4),
    backgroundColor: CALM.surface,
  },
  modalInputError: {
    borderColor: '#D4775C',
    backgroundColor: withAlpha('#D4775C', 0.04),
  },
  descInput: {
    minHeight: 56,
    maxHeight: 100,
  },
  modalRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: SPACING.md,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  modalConfirm: {
    flex: 2,
    paddingVertical: SPACING.md,
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Drag handle
  dragHandleArea: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  dragHandle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(CALM.textMuted, 0.2),
  },

  // Live preview card
  previewCard: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  previewNamePlaceholder: {
    color: CALM.textMuted,
    fontStyle: 'italic',
  },
  previewPrice: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  previewDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 2,
  },
  previewBadge: {
    backgroundColor: withAlpha(BIZ.profit, 0.1),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    marginLeft: SPACING.sm,
  },
  previewBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.profit,
    fontVariant: ['tabular-nums'],
  },

  // Currency prefix input
  currencyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingLeft: SPACING.md,
  },
  currencyInputRowFocused: {
    borderColor: withAlpha(CALM.bronze, 0.4),
    backgroundColor: CALM.surface,
  },
  currencyInputRowError: {
    borderColor: '#D4775C',
    backgroundColor: withAlpha('#D4775C', 0.04),
  },
  currencyPrefix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginRight: SPACING.xs,
  },
  currencyInput: {
    ...TYPE.insight,
    lineHeight: undefined,
    color: CALM.textPrimary,
    flex: 1,
    paddingVertical: SPACING.md + 2,
    paddingRight: SPACING.md,
    paddingLeft: 0,
  },

  // Profit preview + margin badge
  profitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  profitText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.profit,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  marginBadge: {
    backgroundColor: withAlpha(BIZ.profit, 0.1),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
  },
  marginBadgeHigh: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
  },
  marginBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.profit,
    fontVariant: ['tabular-nums'],
  },
  marginBadgeTextHigh: {
    color: CALM.accent,
  },

  // Validation warning
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  warningText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
    flex: 1,
  },

  // Quick add mode
  quickAddRow: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  justAddedSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.md,
  },
  justAddedIcon: {
    marginBottom: SPACING.xs,
  },
  justAddedTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  justAddedHint: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  quickAddCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  quickAddCheckText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  quickAddActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  addAnotherBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.lg,
    minHeight: 48,
  },
  addAnotherText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },

  costDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  costDateText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  reorderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
  },
  reorderButtonActive: {
    backgroundColor: CALM.bronze,
  },
  reorderText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  reorderTextActive: {
    color: '#fff',
  },

  // ── Popular this month ──
  popularSection: {
    marginTop: SPACING.md,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  popularHeader: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  popularRow: {
    marginBottom: SPACING.sm,
  },
  popularContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 4,
  },
  popularRankBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withAlpha(CALM.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularRankText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  popularName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  popularQty: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  popularRank: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
    width: 18,
  },
  popularInflow: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  popularBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(CALM.accent, 0.1),
    overflow: 'hidden',
  },
  popularBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(CALM.accent, 0.6),
  },

  // Bulk import
  bulkAddButton: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.xl,
    backgroundColor: withAlpha(CALM.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkHint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    lineHeight: 20,
  },
  bulkImageRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  bulkImageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.15),
  },
  bulkImageText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  bulkDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bulkDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: CALM.border,
  },
  bulkDividerText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  bulkLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  bulkLoadingText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontStyle: 'italic',
  },
  bulkTextArea: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  bulkResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  bulkResultDeselected: {
    opacity: 0.4,
  },
  bulkCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkCheckboxSelected: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  bulkResultName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  bulkResultDetail: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 2,
  },
});

export default Products;
