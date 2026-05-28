import React, { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,

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
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ, BIZ_SAFE, semantic } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { SellerProduct, IngredientCost, StockAdjustmentReason } from '../../types';
import {
  lightTap,
  mediumTap,
  selectionChanged,
  successNotification,
  warningNotification,
} from '../../services/haptics';
import * as ImagePicker from 'expo-image-picker';
import { parseProductList, parseProductImage, ParsedProduct } from '../../services/aiService';
import { uploadProductImage } from '../../services/sellerSync';
import ImageSourcePills from '../../components/common/ImageSourcePills';
import ModalToastHost from '../../components/common/ModalToastHost';

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
  const C = useCalm();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const isTablet = screenW >= 700;
  const bizSuccess = semantic(BIZ_SAFE.success, isDark);
  const bizKept = semantic(BIZ_SAFE.profit, isDark);
  const bizDestructive = semantic(BIZ_SAFE.destructive, isDark);
  const styles = useMemo(() => makeStyles(C), [C]);
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
  const addStockAdjustment = useSellerStore((s) => s.addStockAdjustment);
  const stockAdjustments = useSellerStore((s) => s.stockAdjustments);
  const productOrder = useSellerStore((s) => s.productOrder);
  const setProductOrder = useSellerStore((s) => s.setProductOrder);
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const updateTransaction = usePersonalStore((s) => s.updateTransaction);
  const customUnits = useSellerStore((s) => s.customUnits);
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  const t = useT();
  const sl = t.seller;

  const unitOrder = useSellerStore((s) => s.unitOrder);
  const hiddenUnits = useSellerStore((s) => s.hiddenUnits);
  const productCategories = useSellerStore((s) => s.productCategories);
  const addProductCategory = useSellerStore((s) => s.addProductCategory);

  // ─── Search & filter state ────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

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
    let result = sortedProducts;
    if (filterCategory) {
      result = result.filter((p) => (p.category || '') === filterCategory);
    }
    if (!search.trim()) return result;
    const q = search.trim().toLowerCase();
    return result.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.unit.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }, [sortedProducts, search, filterCategory]);

  // ─── Detail + Modal state ──────────────────────────────────
  const [detailProduct, setDetailProduct] = useState<SellerProduct | null>(null);
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
  const [showDescField, setShowDescField] = useState(false);
  const [showCatInput, setShowCatInput] = useState(false);
  const [newTrackStock, setNewTrackStock] = useState(false);
  const [newStockQty, setNewStockQty] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newImageUrl, setNewImageUrl] = useState<string | undefined>(undefined);
  const [imageUploading, setImageUploading] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // ─── Bulk import state ──────────────────────────────────────
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkResults, setBulkResults] = useState<ParsedProduct[] | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkDetailIdx, setBulkDetailIdx] = useState<number | null>(null);
  const [bdFocused, setBdFocused] = useState<string | null>(null);
  const [bdDescFocused, setBdDescFocused] = useState(false);
  const [bdKbVisible, setBdKbVisible] = useState(false);
  const [bdKbHeight, setBdKbHeight] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => { lightTap(); navigation.navigate('SellerProductsReport'); }}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
          accessibilityLabel={sl.reportTitle}
          accessibilityRole="button"
        >
          <Feather name="pie-chart" size={20} color={C.textPrimary} />
        </Pressable>
      ),
    });
  }, [navigation, sl.reportTitle, C.textPrimary]);

  // ─── Stock adjustment modal ────────────────────────────────
  const [stockAdjProduct, setStockAdjProduct] = useState<SellerProduct | null>(null);
  const [stockAdjDelta, setStockAdjDelta] = useState('');
  const [stockAdjReason, setStockAdjReason] = useState<StockAdjustmentReason>('received');
  const [stockAdjNote, setStockAdjNote] = useState('');

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
    setNewImageUrl(undefined);
    setNewCategory('');
    setShowDescField(false);
    setShowCatInput(false);
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
    setNewImageUrl(product.imageUrl);
    setNewCategory(product.category || '');
    setShowDescField(!!(product.description));
    setShowCatInput(!!(product.category && !productCategories.includes(product.category)));
    setNameError(false);
    setPriceError(false);
    setJustAdded(false);
    setFocusedField(null);
    modalTranslateY.setValue(0);
    modalOpacity.setValue(1);
    setShowAdd(true);
    mediumTap();
  }, [productCategories]);

  const closeAddModal = useCallback(() => {
    setShowAdd(false);
    setEditingProduct(null);
    resetForm();
    lightTap();
  }, [resetForm]);

  const handlePickProductImage = useCallback(async (productId?: string) => {
    const targetId = productId || `tmp-${Date.now()}`;

    let { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await ImagePicker.requestMediaLibraryPermissionsAsync());
      if (status !== 'granted') { Alert.alert('', sl.galleryPermissionNeeded); return; }
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || !result.assets?.[0]) return;

    setImageUploading(true);
    const url = await uploadProductImage(result.assets[0].uri, targetId);
    setImageUploading(false);
    if (url) setNewImageUrl(url);
    else Alert.alert('', sl.failedToUpload);
  }, []);

  // ─── Bulk import handlers ─────────────────────────────────
  const existingProductNames = useMemo(() => products.map((p) => p.name), [products]);

  const handleBulkParse = useCallback(async () => {
    if (!bulkText.trim()) return;
    Keyboard.dismiss();
    setBulkParsing(true);
    try {
      const results = await parseProductList(bulkText.trim(), allUnits, existingProductNames);
      if (results && results.length > 0) {
        setBulkResults(results);
        setBulkSelected(new Set(results.reduce<number[]>((acc, p, i) => { if (!p.isDuplicate) acc.push(i); return acc; }, [])));
      } else {
        showToast(sl.noProductsInText, 'error');
      }
    } catch {
      showToast(sl.somethingWentWrong, 'error');
    } finally {
      setBulkParsing(false);
    }
  }, [bulkText, allUnits, existingProductNames, showToast]);

  const handleBulkImage = useCallback(async (source: 'camera' | 'gallery') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showToast(sl.grantPermission.replace('{source}', source), 'error');
      return;
    }

    const picker = source === 'camera'
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await picker({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    setBulkParsing(true);
    try {
      const uri = result.assets[0].uri;
      const results = await parseProductImage(uri, allUnits, existingProductNames);
      if (results && results.length > 0) {
        setBulkResults(results);
        setBulkSelected(new Set(results.reduce<number[]>((acc, p, i) => { if (!p.isDuplicate) acc.push(i); return acc; }, [])));
      } else {
        showToast(sl.noProductsInImage, 'error');
      }
    } catch (err: any) {
      if (__DEV__) console.warn('[bulkImage]', err?.message || err);
      showToast(err?.message || 'something went wrong', 'error');
    } finally {
      setBulkParsing(false);
    }
  }, [allUnits, existingProductNames, showToast]);

  const handleBulkAdd = useCallback(() => {
    if (!bulkResults) return;
    const selected = bulkResults.filter((_, i) => bulkSelected.has(i));
    if (selected.length === 0) {
      showToast(sl.selectAtLeastOne, 'error');
      return;
    }
    const valid = selected.filter((p) => p.pricePerUnit > 0);
    const skipped = selected.length - valid.length;
    if (valid.length === 0) {
      warningNotification();
      showToast(sl.allSelectedNoPrice, 'error');
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    for (const p of valid) {
      addProduct({
        name: p.name,
        description: p.description,
        pricePerUnit: p.pricePerUnit,
        costPerUnit: p.costPerUnit,
        unit: p.unit,
        isActive: true,
        category: p.category || undefined,
        trackStock: p.stock != null ? true : undefined,
        stockQuantity: p.stock ?? undefined,
      });
      if (p.category) addProductCategory(p.category);
    }
    successNotification();
    const msg = skipped > 0
      ? sl.bulkAddedSkipped.replace('{added}', String(valid.length)).replace('{skipped}', String(skipped))
      : sl.bulkAdded.replace('{added}', String(valid.length)).replace('{plural}', valid.length > 1 ? 's' : '');
    showToast(msg, 'success');
    setShowBulk(false);
    setBulkText('');
    setBulkResults(null);
    setBulkSelected(new Set());
  }, [bulkResults, bulkSelected, addProduct, addProductCategory, showToast]);

  const updateBulkResult = useCallback((idx: number, updates: Partial<ParsedProduct>) => {
    setBulkResults((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  }, []);

  const closeBulkModal = useCallback(() => {
    setShowBulk(false);
    setBulkText('');
    setBulkResults(null);
    setBulkSelected(new Set());
    setBulkDetailIdx(null);
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

  // ─── Kept preview with margin % ───────────────────────────
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
      showToast(sl.fillNameAndPrice, 'error');
      return;
    }

    if (!parseFloat(newPrice) || parseFloat(newPrice) <= 0) {
      setPriceError(true);
      shakeField(priceShakeAnim);
      warningNotification();
      showToast(sl.priceGreaterThanZero, 'error');
      return;
    }

    const price = parseFloat(newPrice);
    const cost = newCostPerUnit ? parseFloat(newCostPerUnit) : 0;
    if (cost > 0 && cost >= price) {
      warningNotification();
      showToast(sl.costHigherThanPrice.replace('{currency}', currency).replace('{cost}', cost.toFixed(2)), 'error');
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (newCategory.trim()) addProductCategory(newCategory.trim());
    addProduct({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      pricePerUnit: parseFloat(newPrice) || 0,
      costPerUnit: newCostPerUnit ? parseFloat(newCostPerUnit) : undefined,
      unit: newUnit,
      isActive: true,
      trackStock: newTrackStock || undefined,
      stockQuantity: newTrackStock && newStockQty ? parseFloat(newStockQty) : undefined,
      imageUrl: newImageUrl,
      category: newCategory.trim() || undefined,
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
  }, [newName, newDescription, newPrice, newCostPerUnit, newUnit, newCategory, addProduct, addProductCategory, showToast]);

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
      showToast(sl.fillNameAndPrice, 'error');
      return;
    }

    if (!parseFloat(newPrice) || parseFloat(newPrice) <= 0) {
      setPriceError(true);
      shakeField(priceShakeAnim);
      warningNotification();
      showToast(sl.priceGreaterThanZero, 'error');
      return;
    }

    const price = parseFloat(newPrice);
    const cost = newCostPerUnit ? parseFloat(newCostPerUnit) : 0;
    if (cost > 0 && cost >= price) {
      warningNotification();
      showToast(sl.costHigherThanPrice.replace('{currency}', currency).replace('{cost}', cost.toFixed(2)), 'error');
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (newCategory.trim()) addProductCategory(newCategory.trim());
    updateProduct(editingProduct.id, {
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      pricePerUnit: parseFloat(newPrice) || 0,
      costPerUnit: newCostPerUnit ? parseFloat(newCostPerUnit) : undefined,
      unit: newUnit,
      trackStock: newTrackStock || undefined,
      stockQuantity: newTrackStock && newStockQty ? parseFloat(newStockQty) : undefined,
      imageUrl: newImageUrl,
      category: newCategory.trim() || undefined,
    });
    successNotification();
    showToast(sl.productUpdated, 'success');
    closeAddModal();
  }, [editingProduct, newName, newDescription, newPrice, newCostPerUnit, newUnit, newCategory, newTrackStock, newStockQty, newImageUrl, updateProduct, addProductCategory, showToast, closeAddModal]);

  const handleAddCost = useCallback(() => {
    const hasDescErr = !costDescription.trim();
    const hasAmtErr = !costAmount.trim();

    setCostDescError(hasDescErr);
    setCostAmtError(hasAmtErr);

    if (hasDescErr) shakeField(costDescShakeAnim);
    if (hasAmtErr) shakeField(costAmtShakeAnim);

    if (hasDescErr || hasAmtErr) {
      warningNotification();
      showToast(sl.fillDescAndAmount, 'error');
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
      showToast(sl.costUpdatedProducts, 'success');
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
      showToast(syncToPersonal ? sl.costLoggedPersonalProducts : sl.costLoggedProducts, 'success');
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
      sl.removeCount.replace('{count}', String(selectedIds.size)).replace('{plural}', selectedIds.size > 1 ? 's' : ''),
      sl.existingOrdersUnaffected,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: sl.removeBtn,
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            for (const id of selectedIds) {
              deleteProduct(id);
            }
            successNotification();
            showToast(sl.productsRemoved.replace('{count}', String(selectedIds.size)).replace('{plural}', selectedIds.size > 1 ? 's' : ''), 'success');
            setSelectedIds(new Set());
            setSelectMode(false);
          },
        },
      ]
    );
  }, [selectedIds, deleteProduct, showToast]);

  const handleBulkSetActive = useCallback((active: boolean) => {
    if (selectedIds.size === 0) return;
    lightTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    for (const id of selectedIds) {
      updateProduct(id, { isActive: active });
    }
    successNotification();
    const bulkMsg = active
      ? sl.productsActivated.replace('{count}', String(selectedIds.size)).replace('{plural}', selectedIds.size > 1 ? 's' : '')
      : sl.productsDeactivated.replace('{count}', String(selectedIds.size)).replace('{plural}', selectedIds.size > 1 ? 's' : '');
    showToast(bulkMsg, 'success');
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds, updateProduct, showToast]);

  const handleToggleActive = useCallback((product: SellerProduct) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    lightTap();
    updateProduct(product.id, { isActive: !product.isActive });
  }, [updateProduct]);

  const handleStockAdjust = useCallback(() => {
    if (!stockAdjProduct) return;
    const qty = parseFloat(stockAdjDelta);
    if (!qty || qty === 0) {
      warningNotification();
      showToast(sl.enterQuantity, 'error');
      return;
    }
    const isRemoval = ['spoilage', 'damage', 'returned'].includes(stockAdjReason);
    const delta = isRemoval ? -Math.abs(qty) : Math.abs(qty);
    addStockAdjustment({
      productId: stockAdjProduct.id,
      delta,
      reason: stockAdjReason,
      note: stockAdjNote.trim() || undefined,
      date: new Date(),
    });
    successNotification();
    const adjLabel = isRemoval ? `removed ${Math.abs(qty)}` : `added ${Math.abs(qty)}`;
    showToast(sl.stockAdjusted.replace('{label}', adjLabel).replace('{unit}', stockAdjProduct.unit).replace('{reason}', (sl as any)[stockAdjReason] || stockAdjReason), 'success');
    setStockAdjProduct(null);
    setStockAdjDelta('');
    setStockAdjNote('');
    setStockAdjReason('received');
  }, [stockAdjProduct, stockAdjDelta, stockAdjReason, stockAdjNote, addStockAdjustment, showToast]);

  const handleClone = useCallback((product: SellerProduct) => {
    lightTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    addProduct({
      name: `${product.name} (copy)`,
      description: product.description,
      pricePerUnit: product.pricePerUnit,
      costPerUnit: product.costPerUnit,
      unit: product.unit,
      isActive: true,
      trackStock: product.trackStock,
      stockQuantity: product.trackStock ? 0 : undefined,
      imageUrl: product.imageUrl,
      category: product.category,
    });
    successNotification();
    showToast(sl.productDuplicated.replace('{name}', product.name), 'success');
  }, [addProduct, showToast]);

  const handleDelete = useCallback((product: SellerProduct) => {
    warningNotification();
    const orderCount = orders.filter((o) => o.items.some((i) => i.productId === product.id)).length;
    const msg = orderCount > 0
      ? sl.orderReferencesWarning.replace('{count}', String(orderCount)).replace('{plural}', orderCount !== 1 ? 's' : '').replace('{verb}', orderCount !== 1 ? '' : 's')
      : undefined;
    Alert.alert(
      sl.removeProduct,
      msg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: sl.removeBtn,
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            deleteProduct(product.id);
          },
        },
      ]
    );
  }, [deleteProduct, orders]);

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

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setBdKbVisible(true);
      setBdKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setBdKbVisible(false);
      setBdKbHeight(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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

      const stats: string[] = [];
      if (item.totalSold > 0) stats.push(`${item.totalSold} sold`);
      if (marginPct !== null) stats.push(`${marginPct}% margin`);
      if (item.trackStock && item.stockQuantity != null) stats.push(`${item.stockQuantity} in stock`);

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
                  : () => { lightTap(); setDetailProduct(item); }
              }
              onLongPress={
                selectMode
                  ? undefined
                  : reorderMode
                  ? drag
                  : undefined
              }
              delayLongPress={reorderMode ? 150 : 500}
              accessibilityRole="button"
              accessibilityLabel={sl.productTapHint.replace('{name}', item.name)}
            >
              {selectMode ? (
                <View style={[styles.selectCheckbox, isSelected && styles.selectCheckboxActive]}>
                  {isSelected && <Feather name="check" size={14} color={C.onAccent} />}
                </View>
              ) : item.imageUrl ? (
                <TouchableOpacity onPress={() => setPreviewImageUrl(item.imageUrl!)} activeOpacity={0.8}>
                  <Image source={{ uri: item.imageUrl }} style={[styles.rowAvatar, !item.isActive && { opacity: 0.4 }]} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.rowAvatar, !item.isActive && styles.rowAvatarInactive]}>
                  <Text style={styles.rowAvatarText}>{initial}</Text>
                </View>
              )}
              <View style={styles.rowContent}>
                <View style={styles.rowNameRow}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  {!item.isActive && (
                    <View style={styles.inactiveBadge}>
                      <Text style={styles.inactiveBadgeText}>{sl.inactive}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rowPrice}>
                  {currency} {item.pricePerUnit.toFixed(2)}/{item.unit}
                </Text>
                {(stats.length > 0 || item.description || item.category) && (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[item.category, item.description, ...stats].filter(Boolean).join('  \u00B7  ')}
                  </Text>
                )}
              </View>
              {reorderMode ? (
                <Feather name="menu" size={18} color={isDragging ? C.accent : C.neutral} />
              ) : !selectMode ? (
                <Feather name="chevron-right" size={18} color={C.textMuted} />
              ) : null}
            </TouchableOpacity>
          </AnimatedProductCard>
        </ScaleDecorator>
      );
    },
    [currency, reorderMode, selectMode, selectedIds, toggleSelectProduct]
  );

  // ─── FlatList render helpers ────────────────────────────────
  const productKeyExtractor = useCallback((p: SellerProduct) => p.id, []);

  // ─── List header ────────────────────────────────────────────
  const ListHeaderComponent = useMemo(() => (
    <View style={styles.listHeaderWrap}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Feather name="search" size={14} color={C.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={sl.searchProducts}
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          accessibilityLabel={sl.searchProductsLabel}
          accessibilityRole="search"
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={C.bronze}
        />
        {search.length > 0 ? (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={sl.clearSearch}
          >
            <Feather name="x" size={14} color={C.textMuted} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.searchProductCount}>{products.length}</Text>
        )}
      </View>
      {search.trim().length > 0 && (
        <Text style={styles.searchCount}>{sl.showingOf.replace('{shown}', String(filteredProducts.length)).replace('{total}', String(products.length))}</Text>
      )}

      {/* Category filter chips */}
      {productCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.categoryChipRow}
        >
          <Pressable
            style={[styles.categoryChip, !filterCategory && styles.categoryChipActive]}
            onPress={() => { lightTap(); setFilterCategory(null); }}
          >
            <Text style={[styles.categoryChipText, !filterCategory && styles.categoryChipTextActive]}>{sl.allCategory}</Text>
          </Pressable>
          {productCategories.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.categoryChip, filterCategory === cat && styles.categoryChipActive]}
              onPress={() => { lightTap(); setFilterCategory(filterCategory === cat ? null : cat); }}
            >
              <Text style={[styles.categoryChipText, filterCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Action row */}
      <View style={styles.actionRow}>
        {selectMode ? (
          <>
            <TouchableOpacity
              style={styles.actionPill}
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
                size={15}
                color={C.bronze}
              />
              <Text style={styles.actionPillText}>
                {selectedIds.size === filteredProducts.length ? t.common.none : t.common.all}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionPill, styles.actionPillActive]}
              activeOpacity={0.7}
              onPress={() => {
                lightTap();
                setSelectMode(false);
                setSelectedIds(new Set());
              }}
            >
              <Text style={styles.actionPillTextActive}>{sl.doneSelecting}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {products.length > 1 && (
              <>
                <TouchableOpacity
                  style={styles.actionPill}
                  activeOpacity={0.7}
                  onPress={() => {
                    lightTap();
                    setSelectMode(true);
                    setSelectedIds(new Set());
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={sl.selectProducts}
                >
                  <Feather name="check-square" size={15} color={C.bronze} />
                  <Text style={styles.actionPillText}>{sl.selectMode}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionPill, reorderMode && styles.actionPillActive]}
                  activeOpacity={0.7}
                  onPress={() => {
                    lightTap();
                    setReorderMode((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={reorderMode ? sl.doneReordering : sl.reorderProducts}
                >
                  <Feather name="list" size={15} color={reorderMode ? C.onAccent : C.bronze} />
                  <Text style={[styles.actionPillText, reorderMode && styles.actionPillTextActive]}>
                    {reorderMode ? t.common.done.toLowerCase() : 'reorder'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={styles.actionPill}
              activeOpacity={0.7}
              onPress={() => handleOpenCostModal()}
              accessibilityRole="button"
              accessibilityLabel={sl.logIngredientCost}
            >
              <Feather name="dollar-sign" size={15} color={C.bronze} />
              <Text style={styles.actionPillText}>{sl.logCostBtn}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

    </View>
  ), [products.length, handleOpenCostModal, search, filteredProducts, currency, selectMode, selectedIds, reorderMode, productCategories, filterCategory]);

  // ─── Live preview values ───────────────────────────────────
  const previewName = newName.trim() || 'product name';
  const previewPrice = parseFloat(newPrice);
  const previewPriceStr = !isNaN(previewPrice) ? previewPrice.toFixed(2) : '0.00';

  // ─── Shared form JSX ──────────────────────────────────────
  const renderProductForm = () => (
    <>
      {/* Modal header */}
      <View style={styles.modalHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.modalTitle}>
            {editingProduct ? 'edit ' : 'new '}
            <Text style={styles.modalTitleAccent}>product</Text>
          </Text>
        </View>
        <Pressable
          onPress={closeAddModal}
          style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          <Feather name="x" size={16} color={C.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.modalSubtitle}>
        {editingProduct ? sl.updateProductDetails : sl.addToCatalog}
      </Text>

      {/* ── Success state after adding ─────────────────────── */}
      {justAdded && !editingProduct ? (
        <View style={styles.justAddedSection}>
          <View style={styles.justAddedCard}>
            {newImageUrl ? (
              <Image source={{ uri: newImageUrl }} style={styles.justAddedThumb} />
            ) : (
              <View style={styles.justAddedThumbPlaceholder}>
                <Text style={styles.justAddedThumbText}>{previewName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.justAddedName} numberOfLines={1}>{previewName}</Text>
              <Text style={styles.justAddedPrice}>{currency} {previewPriceStr} / {newUnit}</Text>
            </View>
          </View>
          <View style={styles.justAddedStatusRow}>
            <Feather name="check" size={14} color={C.bronze} />
            <Text style={styles.justAddedStatusText}>{sl.savedToCatalog}</Text>
          </View>
        </View>
      ) : (
      <>
      {/* ── Photo + Name ──────────────────────────────────── */}
      <View style={styles.namePhotoRow}>
        <View style={styles.inlinePhotoWrap}>
          <Pressable
            style={({ pressed }) => [styles.inlinePhoto, pressed && { opacity: 0.8 }]}
            onPress={() => handlePickProductImage(editingProduct?.id)}
            disabled={imageUploading}
          >
            {imageUploading ? (
              <ActivityIndicator size="small" color={C.bronze} />
            ) : newImageUrl ? (
              <Image source={{ uri: newImageUrl }} style={styles.inlinePhotoImg} />
            ) : (
              <Feather name="camera" size={16} color={C.bronze} />
            )}
          </Pressable>
          {newImageUrl && !imageUploading && (
            <Pressable
              style={({ pressed }) => [styles.inlinePhotoRemove, pressed && { opacity: 0.7 }]}
              onPress={() => { lightTap(); setNewImageUrl(''); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Feather name="x" size={9} color={C.onAccent} />
            </Pressable>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Animated.View style={{ transform: [{ translateX: nameShakeAnim }] }}>
            <TextInput
              style={getInputStyle('name', nameError)}
              value={newName}
              onChangeText={setNewName}
              placeholder={sl.productNamePlaceholder}
              placeholderTextColor={C.textMuted}
              autoFocus={!editingProduct}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.bronze}
            />
          </Animated.View>
          {duplicateWarning && (
            <View style={[styles.warningRow, { marginTop: 2 }]}>
              <Feather name="alert-circle" size={12} color={C.bronze} />
              <Text style={styles.warningText}>{sl.alreadyExists.replace('{name}', duplicateWarning!)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Price & Cost ──────────────────────────────────── */}
      <View style={styles.modalRow}>
        <View style={{ flex: 1 }}>
          <Animated.View style={{ transform: [{ translateX: priceShakeAnim }] }}>
            <View style={[styles.currencyInputRow, focusedField === 'price' && styles.currencyInputRowFocused, priceError && styles.currencyInputRowError]}>
              <Text style={styles.currencyPrefix}>{currency}</Text>
              <TextInput
                style={styles.currencyInput}
                value={newPrice}
                onChangeText={setNewPrice}
                placeholder={sl.sellingPricePlaceholder}
                placeholderTextColor={C.textMuted}
                keyboardType="decimal-pad"
                onFocus={() => setFocusedField('price')}
                onBlur={() => setFocusedField(null)}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.bronze}
              />
            </View>
          </Animated.View>
        </View>
        <View style={{ flex: 1 }}>
          <View style={[styles.currencyInputRow, focusedField === 'cost' && styles.currencyInputRowFocused]}>
            <Text style={styles.currencyPrefix}>{currency}</Text>
            <TextInput
              style={styles.currencyInput}
              value={newCostPerUnit}
              onChangeText={setNewCostPerUnit}
              placeholder={sl.yourCostPlaceholder}
              placeholderTextColor={C.textMuted}
              keyboardType="decimal-pad"
              onFocus={() => setFocusedField('cost')}
              onBlur={() => setFocusedField(null)}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.bronze}
            />
          </View>
        </View>
      </View>
      {keptPreview && (
        <View style={[styles.keptRow, { marginTop: -SPACING.xs }]}>
          <Feather name="trending-up" size={12} color={bizKept} />
          <Text style={styles.keptText}>{sl.keptPerUnit.replace('{currency}', currency).replace('{kept}', keptPreview.kept)}</Text>
          <View style={[styles.marginBadge, keptPreview.margin >= 50 && styles.marginBadgeHigh]}>
            <Text style={[styles.marginBadgeText, keptPreview.margin >= 50 && styles.marginBadgeTextHigh]}>{keptPreview.margin}%</Text>
          </View>
        </View>
      )}

      {/* ── Unit + Stock ──────────────────────────────────── */}
      <View style={styles.unitStockRow}>
        <Pressable
          style={({ pressed }) => [styles.unitSelector, pressed && { opacity: 0.7 }]}
          onPress={() => { Keyboard.dismiss(); lightTap(); setShowUnitPicker(true); }}
          accessibilityRole="button"
          accessibilityLabel={sl.selectedUnitHint.replace('{unit}', newUnit)}
        >
          <Text style={styles.unitSelectorLabel}>{sl.unitLabel}</Text>
          <View style={styles.unitSelectorValue}>
            <Text style={styles.unitSelectorText}>{newUnit}</Text>
            <Feather name="chevron-down" size={14} color={C.textMuted} />
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.stockToggle, pressed && { opacity: 0.7 }]}
          onPress={() => { lightTap(); setNewTrackStock((v) => !v); }}
        >
          <Text style={styles.stockToggleText}>{sl.trackStock}</Text>
          <View style={[styles.toggleTrack, newTrackStock && styles.toggleTrackActive]}>
            <View style={[styles.toggleThumb, newTrackStock && styles.toggleThumbActive]} />
          </View>
        </Pressable>
      </View>
      {newTrackStock && (
        <View style={[styles.currencyInputRow, focusedField === 'stock' && styles.currencyInputRowFocused, { maxWidth: '50%' }]}>
          <TextInput
            style={[styles.currencyInput, { paddingLeft: 12 }]}
            value={newStockQty}
            onChangeText={setNewStockQty}
            placeholder={sl.currentStockPlaceholder}
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            onFocus={() => setFocusedField('stock')}
            onBlur={() => setFocusedField(null)}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.bronze}
          />
          <Text style={styles.currencyPrefix}>{newUnit}</Text>
        </View>
      )}

      {/* ── Optional details (collapsed) ──────────────────── */}
      {showDescField || newDescription.trim() || newCategory ? (
        <View style={styles.detailsSection}>
          <TextInput
            style={[getInputStyle('desc', false), styles.descInputCompact]}
            value={newDescription}
            onChangeText={setNewDescription}
            placeholder={sl.descriptionPlaceholder}
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            onFocus={() => setFocusedField('desc')}
            onBlur={() => setFocusedField(null)}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.bronze}
          />
          {productCategories.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formCategoryChipRow}>
              {productCategories.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.formCategoryChip, newCategory === cat && styles.formCategoryChipActive]}
                  onPress={() => { lightTap(); setNewCategory(newCategory === cat ? '' : cat); setShowCatInput(false); }}
                >
                  <Text style={[styles.formCategoryChipText, newCategory === cat && styles.formCategoryChipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.formCategoryChip, showCatInput && styles.formCategoryChipActive]}
                onPress={() => { lightTap(); setNewCategory(''); setShowCatInput(true); }}
              >
                <Text style={[styles.formCategoryChipText, showCatInput && styles.formCategoryChipTextActive]}>+</Text>
              </Pressable>
            </ScrollView>
          )}
          {(showCatInput || productCategories.length === 0) && (
            <TextInput
              style={getInputStyle('category', false)}
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder={productCategories.length > 0 ? sl.newCategoryPlaceholder : sl.categoryPlaceholder}
              placeholderTextColor={C.textMuted}
              onFocus={() => setFocusedField('category')}
              onBlur={() => setFocusedField(null)}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.bronze}
            />
          )}
        </View>
      ) : (
        <Pressable
          onPress={() => { setShowDescField(true); }}
          style={({ pressed }) => [styles.addDescLink, pressed && { opacity: 0.6 }]}
        >
          <Feather name="plus" size={13} color={C.bronze} />
          <Text style={styles.addDescLinkText}>{sl.addDetails}</Text>
        </Pressable>
      )}
      </>
      )}

      {/* ── Actions ───────────────────────────────────────── */}
      {editingProduct ? (
        <View style={styles.modalActions}>
          <Pressable
            onPress={closeAddModal}
            style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t.common.cancel}
          >
            <Text style={styles.modalCancelText}>{sl.cancelBtn}</Text>
          </Pressable>
          <Pressable
            onPress={handleSaveEdit}
            style={({ pressed }) => [styles.modalConfirm, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={sl.saveBtn}
          >
            <Text style={styles.modalConfirmText}>{sl.saveBtn}</Text>
          </Pressable>
        </View>
      ) : justAdded ? (
        <View style={styles.justAddedActions}>
          <Pressable
            onPress={closeAddModal}
            style={({ pressed }) => [styles.justAddedBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={t.common.done}
          >
            <Text style={styles.modalConfirmText}>{t.common.done.toLowerCase()}</Text>
          </Pressable>
          <Pressable
            onPress={() => { lightTap(); setJustAdded(false); }}
            style={({ pressed }) => [pressed && { opacity: 0.5 }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={sl.addAnother}
          >
            <Text style={styles.justAddedDoneText}>{sl.addAnother}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.modalActions}>
          <Pressable
            onPress={closeAddModal}
            style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t.common.cancel}
          >
            <Text style={styles.modalCancelText}>{sl.cancelBtn}</Text>
          </Pressable>
          <Pressable
            onPress={handleAddProduct}
            style={({ pressed }) => [styles.modalConfirm, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={sl.addProduct}
          >
            <Text style={styles.modalConfirmText}>{sl.addProduct}</Text>
          </Pressable>
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
        extraData={selectedIds}
        ListHeaderComponent={products.length > 0 ? ListHeaderComponent : undefined}
        contentContainerStyle={[
          styles.listContent,
          products.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
          products.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="package" size={28} color={C.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>{sl.noProductsYet}</Text>
              <Text style={styles.emptyHint}>
                {sl.addFirstProductHint}
              </Text>

              <TouchableOpacity
                style={styles.emptyCTA}
                activeOpacity={0.7}
                onPress={openAddModal}
                accessibilityRole="button"
                accessibilityLabel={sl.addFirstProduct}
              >
                <Feather name="plus" size={18} color={C.onAccent} />
                <Text style={styles.emptyCTAText}>{sl.addFirstProduct}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emptyBulkBtn}
                activeOpacity={0.7}
                onPress={() => { lightTap(); setShowBulk(true); }}
                accessibilityRole="button"
                accessibilityLabel={sl.bulkAddWithAi}
              >
                <Feather name="zap" size={16} color={C.bronze} />
                <Text style={styles.emptyBulkText}>{sl.bulkAddWithAi}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noResultsContainer}>
              <Feather name="search" size={20} color={C.textMuted} />
              <Text style={styles.noResultsText}>{sl.noMatch}</Text>
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.noResultsClear}>{t.common.clear.toLowerCase()}</Text>
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
        initialNumToRender={10}
      />

      {/* Bottom action bar */}
      {products.length > 0 && (
        selectMode ? (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.xs) }]}>
            {selectedIds.size > 0 && (
              <View style={styles.bulkActionsRow}>
                <TouchableOpacity
                  style={styles.bulkActionBtn}
                  activeOpacity={0.7}
                  onPress={() => handleBulkSetActive(true)}
                >
                  <Feather name="eye" size={15} color={C.bronze} />
                  <Text style={styles.bulkActionText}>{sl.activate}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bulkActionBtn}
                  activeOpacity={0.7}
                  onPress={() => handleBulkSetActive(false)}
                >
                  <Feather name="eye-off" size={15} color={C.bronze} />
                  <Text style={styles.bulkActionText}>{sl.deactivate}</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: selectedIds.size > 0 ? bizDestructive : withAlpha(C.textMuted, 0.12) },
              ]}
              activeOpacity={0.7}
              onPress={handleBulkDelete}
              disabled={selectedIds.size === 0}
            >
              <Feather name="trash-2" size={18} color={selectedIds.size > 0 ? C.onAccent : C.textMuted} />
              <Text style={[styles.primaryButtonText, selectedIds.size === 0 && { color: C.textMuted }]}>
                {selectedIds.size > 0
                  ? sl.removeCount.replace('{count}', String(selectedIds.size)).replace('{plural}', selectedIds.size > 1 ? 's' : '').replace('?', '')
                  : sl.selectProducts.toLowerCase()}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.xs) }]}>
            <TouchableOpacity
              style={styles.bulkImportLink}
              activeOpacity={0.7}
              onPress={() => { lightTap(); setShowBulk(true); }}
              accessibilityRole="button"
              accessibilityLabel={sl.bulkAddWithAi}
            >
              <Feather name="zap" size={14} color={C.bronze} />
              <Text style={styles.bulkImportText}>{sl.bulkAddWithAi}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.7}
              onPress={openAddModal}
              accessibilityRole="button"
              accessibilityLabel={sl.addProduct}
            >
              <Feather name="plus" size={20} color={C.onAccent} />
              <Text style={styles.primaryButtonText}>{sl.addProduct}</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      {/* ── Product detail modal ──────────────────────────── */}
      <Modal visible={!!detailProduct} transparent statusBarTranslucent animationType="fade">
        <Pressable style={styles.detailOverlay} onPress={() => setDetailProduct(null)}>
          <View style={styles.detailSheet} onStartShouldSetResponder={() => true}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">

              {detailProduct && (() => {
                const p = detailProduct;
                const initial = p.name.charAt(0).toUpperCase();
                const marginPct = p.costPerUnit && p.pricePerUnit > 0
                  ? Math.round(((p.pricePerUnit - p.costPerUnit) / p.pricePerUnit) * 100)
                  : null;

                return (
                  <>
                    {/* Header — photo + name + price + close */}
                    <View style={styles.detailHeader}>
                      <View style={styles.detailHeaderLeft}>
                        {p.imageUrl ? (
                          <Pressable onPress={() => { setPreviewImageUrl(p.imageUrl!); }}>
                            <Image source={{ uri: p.imageUrl }} style={styles.detailProductImage} />
                          </Pressable>
                        ) : (
                          <View style={styles.detailProductAvatar}>
                            <Text style={styles.detailProductAvatarText}>{initial}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailName} numberOfLines={2}>{p.name}</Text>
                          <Text style={styles.detailPriceLine}>
                            {currency} {p.pricePerUnit.toFixed(2)}/{p.unit}
                          </Text>
                        </View>
                      </View>
                      <Pressable onPress={() => setDetailProduct(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <View style={styles.detailCloseBtn}>
                          <Feather name="x" size={18} color={C.textMuted} />
                        </View>
                      </Pressable>
                    </View>

                    {/* Stats — inline text */}
                    <Text style={styles.detailStatsLine}>
                      <Text style={styles.detailStatValue}>{p.totalSold}</Text>
                      <Text style={styles.detailStatLabel}> {sl.sold}</Text>
                      {marginPct !== null && (
                        <>
                          <Text style={styles.detailStatDot}>  ·  </Text>
                          <Text style={styles.detailStatValue}>{marginPct}%</Text>
                          <Text style={styles.detailStatLabel}> {sl.margin}</Text>
                        </>
                      )}
                      {p.trackStock && (
                        <>
                          <Text style={styles.detailStatDot}>  ·  </Text>
                          <Text style={styles.detailStatValue}>{p.stockQuantity ?? 0}</Text>
                          <Text style={styles.detailStatLabel}> {sl.inStock}</Text>
                        </>
                      )}
                      {p.costPerUnit != null && p.costPerUnit > 0 && (
                        <>
                          <Text style={styles.detailStatDot}>  ·  </Text>
                          <Text style={styles.detailStatValue}>{currency} {p.costPerUnit.toFixed(2)}</Text>
                          <Text style={styles.detailStatLabel}> {sl.cost}</Text>
                        </>
                      )}
                    </Text>

                    {/* Description */}
                    {p.description ? (
                      <Text style={styles.detailDescInline}>{p.description}</Text>
                    ) : null}

                    {/* Active toggle */}
                    <Pressable
                      style={({ pressed }) => [styles.detailToggleRow, pressed && { opacity: 0.7 }]}
                      onPress={() => {
                        lightTap();
                        handleToggleActive(p);
                        setDetailProduct({ ...p, isActive: !p.isActive });
                      }}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: p.isActive }}
                    >
                      <View style={[styles.detailStatusDot, { backgroundColor: p.isActive ? C.olive : C.textMuted }]} />
                      <Text style={styles.detailToggleLabel}>{p.isActive ? sl.activeStatus : sl.inactiveStatus}</Text>
                      <View style={{ flex: 1 }} />
                      <View style={[styles.toggleTrack, p.isActive && styles.toggleTrackActive]}>
                        <View style={[styles.toggleThumb, p.isActive && styles.toggleThumbActive]} />
                      </View>
                    </Pressable>

                    {/* Actions grid */}
                    <View style={styles.detailActionsGrid}>
                      <Pressable
                        style={({ pressed }) => [styles.detailActionPill, pressed && { opacity: 0.7 }]}
                        onPress={() => { setDetailProduct(null); openEditModal(p); }}
                      >
                        <Feather name="edit-2" size={15} color={C.bronze} />
                        <Text style={styles.detailActionPillText}>{sl.editBtn}</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.detailActionPill, pressed && { opacity: 0.7 }]}
                        onPress={() => { setDetailProduct(null); handleOpenCostModal(); }}
                      >
                        <Feather name="dollar-sign" size={15} color={C.bronze} />
                        <Text style={styles.detailActionPillText}>{sl.logCostAction}</Text>
                      </Pressable>
                      {p.trackStock && (
                        <Pressable
                          style={({ pressed }) => [styles.detailActionPill, pressed && { opacity: 0.7 }]}
                          onPress={() => { setDetailProduct(null); setStockAdjProduct(p); }}
                        >
                          <Feather name="package" size={15} color={C.bronze} />
                          <Text style={styles.detailActionPillText}>{sl.stockBtn}</Text>
                        </Pressable>
                      )}
                    </View>

                    {/* Delete */}
                    <Pressable
                      style={({ pressed }) => [styles.detailDeleteBtn, pressed && { opacity: 0.5 }]}
                      onPress={() => { setDetailProduct(null); handleDelete(p); }}
                    >
                      <Text style={styles.detailDeleteBtnText}>{sl.deleteProduct}</Text>
                    </Pressable>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </Pressable>
        <ModalToastHost />
      </Modal>

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
              <View style={[styles.modalContent, isTablet && { maxWidth: 600 }]}>
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
                  <Text style={styles.unitModalTitle}>{sl.selectUnit}</Text>
                  <TouchableOpacity
                    onPress={() => { lightTap(); setShowUnitPicker(false); }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={20} color={C.textSecondary} />
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
                              color={isSelected ? C.onAccent : C.bronze}
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
                          <Feather name="check" size={18} color={C.bronze} />
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
                      <Feather name="settings" size={14} color={C.bronze} />
                      <Text style={styles.unitModalManageText}>{sl.manageUnitsInSettings}</Text>
                    </TouchableOpacity>
                  }
                />
              </Pressable>
            </TouchableOpacity>
          )}
        </View>
        {previewImageUrl && (
          <Pressable style={styles.imgPreviewOverlay} onPress={() => setPreviewImageUrl(null)}>
            <Pressable style={styles.imgPreviewCloseBtn} onPress={() => setPreviewImageUrl(null)} hitSlop={12}>
              <Feather name="x" size={20} color="#fff" />
            </Pressable>
            <Image source={{ uri: previewImageUrl }} style={styles.imgPreviewImage} contentFit="contain" />
          </Pressable>
        )}
        <ModalToastHost />
      </Modal>

      {/* ── Image preview (from product list) ─────────────── */}
      {previewImageUrl && !showAdd && (
        <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPreviewImageUrl(null)}>
          <Pressable style={styles.imgPreviewOverlay} onPress={() => setPreviewImageUrl(null)}>
            <Pressable style={styles.imgPreviewCloseBtn} onPress={() => setPreviewImageUrl(null)} hitSlop={12}>
              <Feather name="x" size={20} color="#fff" />
            </Pressable>
            <Image source={{ uri: previewImageUrl }} style={styles.imgPreviewImage} contentFit="contain" />
          </Pressable>
          <ModalToastHost />
        </Modal>
      )}

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
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm }}>
                  <Text style={styles.modalTitle}>{editingCostId ? 'edit ' : 'log '}<Text style={styles.modalTitleAccent}>cost</Text></Text>
                  <View style={[styles.costDatePill, { top: 4 }]}>
                    <Feather name="calendar" size={11} color={C.textSecondary} />
                    <Text style={styles.costDateText}>
                      {editingCostId
                        ? format(ingredientCosts.find(c => c.id === editingCostId)?.date ?? new Date(), 'dd MMM')
                        : format(new Date(), 'dd MMM')}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => { lightTap(); setEditingCostId(null); setShowCostModal(false); }}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={16} color={C.textMuted} />
                </Pressable>
              </View>

              <Animated.View style={{ transform: [{ translateX: costDescShakeAnim }] }}>
                <TextInput
                  style={[styles.modalInput, costDescError && styles.modalInputError]}
                  value={costDescription}
                  onChangeText={setCostDescription}
                  placeholder={sl.whatDidYouBuyProducts}
                  placeholderTextColor={C.textMuted}
                  autoFocus
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.bronze}
                />
              </Animated.View>

              <Animated.View style={{ transform: [{ translateX: costAmtShakeAnim }] }}>
                <View style={[styles.currencyInputRow, costAmtError && styles.currencyInputRowError]}>
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.currencyInput}
                    value={costAmount}
                    onChangeText={setCostAmount}
                    placeholder="0.00"
                    placeholderTextColor={C.textMuted}
                    keyboardType="decimal-pad"
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.bronze}
                  />
                </View>
              </Animated.View>

              {!editingCostId && (
                <Pressable
                  style={({ pressed }) => [styles.syncTogglePill, pressed && { opacity: 0.7 }]}
                  onPress={() => { lightTap(); setSyncToPersonal((v) => !v); }}
                >
                  <Text style={styles.syncToggleText}>{sl.alsoRecordPersonalExpense}</Text>
                  <View style={[styles.toggleTrack, syncToPersonal && styles.toggleTrackActive]}>
                    <View style={[styles.toggleThumb, syncToPersonal && styles.toggleThumbActive]} />
                  </View>
                </Pressable>
              )}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => { lightTap(); setEditingCostId(null); setSyncToPersonal(false); setShowCostModal(false); }}
                  style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t.common.cancel}
                >
                  <Text style={styles.modalCancelText}>{sl.cancelBtn}</Text>
                </Pressable>
                <Pressable
                  onPress={handleAddCost}
                  style={({ pressed }) => [styles.modalConfirm, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={editingCostId ? sl.saveBtn : sl.logCostBtn}
                >
                  <Text style={styles.modalConfirmText}>{editingCostId ? sl.saveBtn : sl.logCostBtn}</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
        <ModalToastHost />
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{'bulk '}<Text style={styles.modalTitleAccent}>add</Text></Text>
                </View>
                <Pressable
                  onPress={closeBulkModal}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={16} color={C.textMuted} />
                </Pressable>
              </View>

              {!bulkResults ? (
                <>
                  <View style={styles.bulkSourceRow}>
                    <ImageSourcePills
                      onPick={handleBulkImage}
                      cameraLabel={sl.snap}
                      galleryLabel={sl.gallery}
                      disabled={bulkParsing}
                    />
                    <Text style={styles.bulkSourceHint}>{sl.orTypeBelow}</Text>
                  </View>

                  <TextInput
                    style={styles.bulkTextArea}
                    multiline
                    placeholder={'kuih lapis rm8/tin\ndodol rm12/pack\nrendang rm15 bekas\nnasi lemak 5 ringgit'}
                    placeholderTextColor={C.textMuted}
                    value={bulkText}
                    onChangeText={setBulkText}
                    textAlignVertical="top"
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.bronze}
                  />

                  {bulkParsing ? (
                    <View style={styles.bulkLoadingRow}>
                      <ActivityIndicator size="small" color={C.bronze} />
                      <Text style={styles.bulkLoadingText}>{sl.readingYourList}</Text>
                    </View>
                  ) : (
                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        onPress={closeBulkModal}
                        style={styles.modalCancel}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.modalCancelText}>{sl.cancelBtn}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleBulkParse}
                        style={[styles.modalConfirm, !bulkText.trim() && { opacity: 0.5 }]}
                        activeOpacity={0.7}
                        disabled={!bulkText.trim()}
                      >
                        <Text style={styles.modalConfirmText}>{sl.parse}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.bulkResultsCount}>
                    {bulkResults.length} found · tap to edit
                  </Text>

                  <FlatList
                    data={bulkResults}
                    keyExtractor={(_, i) => String(i)}
                    style={styles.bulkResultsList}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    removeClippedSubviews
                    windowSize={5}
                    maxToRenderPerBatch={10}
                    initialNumToRender={10}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item: p, index: i }) => {
                      const selected = bulkSelected.has(i);
                      return (
                        <TouchableOpacity
                          style={[styles.bulkResultRow, !selected && styles.bulkResultDeselected]}
                          activeOpacity={0.7}
                          onPress={() => setBulkDetailIdx(i)}
                        >
                          <View style={[styles.bulkCheckbox, selected && styles.bulkCheckboxSelected]}>
                            {selected && <Feather name="check" size={12} color={C.onAccent} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={styles.bulkResultNameRow}>
                              <Text style={styles.bulkResultName}>{p.name}</Text>
                              {p.isDuplicate && (
                                <View style={styles.bulkDupBadge}>
                                  <Text style={styles.bulkDupText}>{sl.exists}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.bulkResultDetail}>
                              {currency} {p.pricePerUnit.toFixed(2)}/{p.unit}
                              {p.costPerUnit ? ` · cost ${currency} ${p.costPerUnit.toFixed(2)}` : ''}
                              {p.category ? ` · ${p.category}` : ''}
                              {p.description ? ` · ${p.description}` : ''}
                            </Text>
                          </View>
                          <Feather name="chevron-right" size={14} color={C.textMuted} />
                        </TouchableOpacity>
                      );
                    }}
                  />

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      onPress={() => { setBulkResults(null); setBulkSelected(new Set()); }}
                      style={styles.modalCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.modalCancelText}>{t.common.back.toLowerCase()}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleBulkAdd}
                      style={[styles.modalConfirm, bulkSelected.size === 0 && { opacity: 0.5 }]}
                      activeOpacity={0.7}
                      disabled={bulkSelected.size === 0}
                    >
                      <Text style={styles.modalConfirmText}>
                        {sl.addProduct} ({bulkSelected.size})
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Pressable>

          </KeyboardAwareScrollView>
        </Pressable>

        {/* Detail overlay — outside scroll view, inside Modal */}
        {bulkDetailIdx != null && bulkResults && bulkResults[bulkDetailIdx] && (() => {
          const idx = bulkDetailIdx;
          const p = bulkResults[idx];
          const selected = bulkSelected.has(idx);
          const bdKept = p.costPerUnit && p.pricePerUnit
            ? { kept: (p.pricePerUnit - p.costPerUnit).toFixed(2), margin: Math.round(((p.pricePerUnit - p.costPerUnit) / p.pricePerUnit) * 100) }
            : null;
          return (
            <>
              <Pressable
                style={styles.bulkDetailDim}
                onPress={() => setBulkDetailIdx(null)}
              />
              <KeyboardAwareScrollView
                style={styles.bulkDetailDimAbs}
                contentContainerStyle={styles.bulkDetailCenter}
                keyboardShouldPersistTaps="handled"
                bounces={false}
                showsVerticalScrollIndicator={false}
              >
                <Pressable style={styles.bulkDetailCard} onPress={() => Keyboard.dismiss()} onStartShouldSetResponder={() => true}>
                  <View style={styles.modalHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalTitle}>{'edit '}<Text style={styles.modalTitleAccent}>item</Text></Text>
                    </View>
                    <Pressable
                      onPress={() => setBulkDetailIdx(null)}
                      style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Feather name="x" size={16} color={C.textMuted} />
                    </Pressable>
                  </View>

                  {/* Name */}
                  <View style={[styles.currencyInputRow, bdFocused === 'bd-name' && styles.currencyInputRowFocused]}>
                    <TextInput
                      style={[styles.currencyInput, { paddingLeft: SPACING.md }]}
                      value={p.name}
                      onChangeText={(v) => updateBulkResult(idx, { name: v })}
                      placeholder={sl.productNamePlaceholder}
                      placeholderTextColor={C.textMuted}
                      selectionColor={C.bronze}
                      onFocus={() => setBdFocused('bd-name')}
                      onBlur={() => setBdFocused(null)}
                    />
                  </View>

                  {/* Price & Cost */}
                  <View style={styles.modalRow}>
                    <View style={{ flex: 1 }}>
                      <View style={[styles.currencyInputRow, bdFocused === 'bd-price' && styles.currencyInputRowFocused]}>
                        <Text style={styles.currencyPrefix}>{currency}</Text>
                        <TextInput
                          style={styles.currencyInput}
                          value={p.pricePerUnit ? String(p.pricePerUnit) : ''}
                          onChangeText={(v) => updateBulkResult(idx, { pricePerUnit: parseFloat(v) || 0 })}
                          placeholder={sl.sellingPricePlaceholder}
                          placeholderTextColor={C.textMuted}
                          keyboardType="decimal-pad"
                          selectionColor={C.bronze}
                          onFocus={() => setBdFocused('bd-price')}
                          onBlur={() => setBdFocused(null)}
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={[styles.currencyInputRow, bdFocused === 'bd-cost' && styles.currencyInputRowFocused]}>
                        <Text style={styles.currencyPrefix}>{currency}</Text>
                        <TextInput
                          style={styles.currencyInput}
                          value={p.costPerUnit ? String(p.costPerUnit) : ''}
                          onChangeText={(v) => updateBulkResult(idx, { costPerUnit: parseFloat(v) || undefined })}
                          placeholder={sl.yourCostPlaceholder}
                          placeholderTextColor={C.textMuted}
                          keyboardType="decimal-pad"
                          selectionColor={C.bronze}
                          onFocus={() => setBdFocused('bd-cost')}
                          onBlur={() => setBdFocused(null)}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Kept preview */}
                  {bdKept && (
                    <View style={[styles.keptRow, { marginTop: -SPACING.xs }]}>
                      <Feather name="trending-up" size={12} color={bizKept} />
                      <Text style={styles.keptText}>{sl.keptPerUnit.replace('{currency}', currency).replace('{kept}', bdKept.kept)}</Text>
                      <View style={[styles.marginBadge, bdKept.margin >= 50 && styles.marginBadgeHigh]}>
                        <Text style={[styles.marginBadgeText, bdKept.margin >= 50 && styles.marginBadgeTextHigh]}>{bdKept.margin}%</Text>
                      </View>
                    </View>
                  )}

                  {/* Unit & Category */}
                  <View style={styles.unitStockRow}>
                    <View style={[styles.unitSelector, bdFocused === 'bd-unit' && styles.currencyInputRowFocused]}>
                      <Text style={styles.unitSelectorLabel}>{sl.unitLabel}</Text>
                      <TextInput
                        style={styles.bdFieldInput}
                        value={p.unit}
                        onChangeText={(v) => updateBulkResult(idx, { unit: v })}
                        placeholder="pcs"
                        placeholderTextColor={C.textMuted}
                        selectionColor={C.bronze}
                        onFocus={() => setBdFocused('bd-unit')}
                        onBlur={() => setBdFocused(null)}
                      />
                    </View>
                    <View style={[styles.unitSelector, bdFocused === 'bd-cat' && styles.currencyInputRowFocused]}>
                      <Text style={styles.unitSelectorLabel}>{sl.categoryPlaceholder.replace(/\s*\(.*\)/, '')}</Text>
                      <TextInput
                        style={styles.bdFieldInput}
                        value={p.category || ''}
                        onChangeText={(v) => updateBulkResult(idx, { category: v || undefined })}
                        placeholder={t.common.optional.toLowerCase()}
                        placeholderTextColor={C.textMuted}
                        selectionColor={C.bronze}
                        onFocus={() => setBdFocused('bd-cat')}
                        onBlur={() => setBdFocused(null)}
                      />
                    </View>
                  </View>

                  {/* Description */}
                  <View style={[styles.currencyInputRow, bdFocused === 'bd-desc' && styles.currencyInputRowFocused]}>
                    <TextInput
                      style={[styles.currencyInput, { paddingLeft: SPACING.md, minHeight: 72, textAlignVertical: 'top' }]}
                      value={p.description || ''}
                      onChangeText={(v) => updateBulkResult(idx, { description: v || undefined })}
                      placeholder={sl.descriptionPlaceholder}
                      placeholderTextColor={C.textMuted}
                      selectionColor={C.bronze}
                      multiline
                      returnKeyType="default"
                      onFocus={() => { setBdFocused('bd-desc'); setBdDescFocused(true); }}
                      onBlur={() => { setBdFocused(null); setBdDescFocused(false); }}
                    />
                  </View>

                  {p.isDuplicate && (
                    <View style={styles.warningRow}>
                      <Feather name="alert-circle" size={12} color={C.bronze} />
                      <Text style={styles.warningText}>{sl.similarExists}</Text>
                    </View>
                  )}

                  {/* Include toggle */}
                  <Pressable
                    style={styles.stockToggle}
                    onPress={() => {
                      selectionChanged();
                      setBulkSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        return next;
                      });
                    }}
                  >
                    <Text style={styles.stockToggleText}>{sl.includeInImport}</Text>
                    <View style={[styles.toggleTrack, selected && styles.toggleTrackActive]}>
                      <View style={[styles.toggleThumb, selected && styles.toggleThumbActive]} />
                    </View>
                  </Pressable>

                  {/* Save */}
                  <TouchableOpacity
                    style={styles.modalConfirm}
                    activeOpacity={0.7}
                    onPress={() => setBulkDetailIdx(null)}
                  >
                    <Text style={styles.modalConfirmText}>{sl.saveBtn}</Text>
                  </TouchableOpacity>
                </Pressable>
              </KeyboardAwareScrollView>
            </>
          );
        })()}

        {/* Multiline done FAB — must be LAST child in Modal */}
        {bdKbVisible && bdDescFocused && (
          <TouchableOpacity
            style={[styles.doneFab, { bottom: bdKbHeight + 16 }]}
            onPress={() => Keyboard.dismiss()}
            activeOpacity={0.8}
          >
            <Feather name="check" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        <ModalToastHost />
      </Modal>

      {/* ── Stock Adjustment Modal ──────────────────────────── */}
      <Modal
        visible={!!stockAdjProduct}
        transparent
        animationType="fade"
        onRequestClose={() => setStockAdjProduct(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setStockAdjProduct(null)}>
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalOverlayCenter}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Pressable style={styles.stockAdjCard} onPress={() => Keyboard.dismiss()} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{'adjust '}<Text style={styles.modalTitleAccent}>stock</Text></Text>
                  {stockAdjProduct && (
                    <Text style={styles.stockAdjSubtitle}>{sl.stockSubtitle.replace('{name}', stockAdjProduct.name).replace('{qty}', String(stockAdjProduct.stockQuantity ?? 0)).replace('{unit}', stockAdjProduct.unit)}</Text>
                  )}
                </View>
                <Pressable
                  onPress={() => setStockAdjProduct(null)}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={16} color={C.textMuted} />
                </Pressable>
              </View>

              {/* Reason pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stockAdjReasonRow} keyboardShouldPersistTaps="handled">
                {(['received', 'spoilage', 'damage', 'correction', 'returned'] as StockAdjustmentReason[]).map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.stockAdjReasonPill, stockAdjReason === r && styles.stockAdjReasonPillActive]}
                    onPress={() => { selectionChanged(); setStockAdjReason(r); }}
                  >
                    <Text style={[styles.stockAdjReasonText, stockAdjReason === r && styles.stockAdjReasonTextActive]}>{(sl as any)[r] || r}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Quantity */}
              <View style={[styles.currencyInputRow, focusedField === 'adj-qty' && styles.currencyInputRowFocused]}>
                <Text style={styles.currencyPrefix}>
                  {['spoilage', 'damage', 'returned'].includes(stockAdjReason) ? '−' : '+'}
                </Text>
                <TextInput
                  style={styles.currencyInput}
                  value={stockAdjDelta}
                  onChangeText={setStockAdjDelta}
                  placeholder={sl.quantityPlaceholder}
                  placeholderTextColor={C.textMuted}
                  keyboardType="decimal-pad"
                  selectionColor={C.bronze}
                  onFocus={() => setFocusedField('adj-qty')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Note */}
              <View style={[styles.currencyInputRow, focusedField === 'adj-note' && styles.currencyInputRowFocused]}>
                <TextInput
                  style={[styles.currencyInput, { paddingLeft: SPACING.md }]}
                  value={stockAdjNote}
                  onChangeText={setStockAdjNote}
                  placeholder={sl.noteOptionalPlaceholder}
                  placeholderTextColor={C.textMuted}
                  selectionColor={C.bronze}
                  onFocus={() => setFocusedField('adj-note')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Recent adjustments for this product */}
              {stockAdjProduct && (() => {
                const history = stockAdjustments.filter((a) => a.productId === stockAdjProduct.id).slice(0, 5);
                if (!history.length) return null;
                return (
                  <View style={styles.stockAdjHistory}>
                    <Text style={styles.stockAdjHistoryTitle}>{sl.recent}</Text>
                    {history.map((a) => (
                      <View key={a.id} style={styles.stockAdjHistoryRow}>
                        <Text style={[styles.stockAdjHistoryDelta, a.delta > 0 ? { color: C.positive } : { color: C.bronze }]}>
                          {a.delta > 0 ? '+' : ''}{a.delta}
                        </Text>
                        <Text style={styles.stockAdjHistoryReason}>{(sl as any)[a.reason] || a.reason}</Text>
                        {a.note && <Text style={styles.stockAdjHistoryNote}>{a.note}</Text>}
                        <Text style={styles.stockAdjHistoryDate}>{format(a.date, 'dd MMM')}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {/* Save */}
              <TouchableOpacity
                style={[styles.modalConfirm, !stockAdjDelta.trim() && { opacity: 0.5 }]}
                activeOpacity={0.7}
                onPress={handleStockAdjust}
                disabled={!stockAdjDelta.trim()}
              >
                <Text style={styles.modalConfirmText}>{sl.saveAdjustment}</Text>
              </TouchableOpacity>
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
        <ModalToastHost />
      </Modal>

    </GestureHandlerRootView>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: 120,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
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
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  searchCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
    paddingLeft: SPACING.xs,
  },
  searchProductCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Product row
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    marginBottom: SPACING.sm,
  },
  productRowInactive: {
    opacity: 0.45,
  },
  productRowSelected: {
    borderColor: withAlpha(BIZ.destructive, 0.35),
    backgroundColor: withAlpha(BIZ.destructive, 0.04),
  },
  productRowDragging: {
    backgroundColor: withAlpha(C.accent, 0.06),
    borderColor: withAlpha(C.accent, 0.2),
  },
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  selectCheckboxActive: {
    backgroundColor: BIZ.destructive,
    borderColor: BIZ.destructive,
  },
  rowAvatar: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarInactive: {
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
  },
  rowAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
  },
  rowContent: {
    flex: 1,
    gap: SPACING.xs,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rowName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    flex: 1,
  },
  inactiveBadge: {
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: 4,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  inactiveBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  rowPrice: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  rowSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },

  // No results
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.sm,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  noResultsClear: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
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
  syncTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(C.bronze, 0.08),
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
  },
  actionPillActive: {
    backgroundColor: C.bronze,
  },
  actionPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  actionPillTextActive: {
    color: C.onAccent,
  },

  // Category filter chips (list header)
  categoryChipRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  categoryChip: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
  },
  categoryChipActive: {
    backgroundColor: C.bronze,
  },
  categoryChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  categoryChipTextActive: {
    color: C.onAccent,
  },

  // Category picker (form)
  formCategoryChipRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  formCategoryChip: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderWidth: 1,
    borderColor: 'transparent',
  },
  formCategoryChipActive: {
    backgroundColor: withAlpha(C.bronze, 0.15),
    borderColor: withAlpha(C.bronze, 0.4),
  },
  formCategoryChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  formCategoryChipTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
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
  emptyHint: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.deepOliveBiz,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.md,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  emptyCTAText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  emptyBulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  emptyBulkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
    backgroundColor: C.background,
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.deepOliveBiz,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    width: '100%',
    minHeight: 52,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  primaryButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  bulkActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    width: '100%',
  },
  bulkActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(C.bronze, C === CALM_DARK ? 0.12 : 0.06),
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  bulkActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  bulkImportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  bulkImportText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  unitSelectorLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  unitSelectorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unitSelectorText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  stockToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stockToggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  toggleTrack: {
    width: 40,
    height: 24,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.textMuted, 0.2),
    justifyContent: 'center',
    padding: 2,
  },
  toggleTrackActive: {
    backgroundColor: C.bronze,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.md,
    backgroundColor: C.surface,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end' as const,
  },
  stockInputWrap: {
    marginTop: SPACING.xs,
  },

  // Add description link
  addDescLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
  },
  addDescLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Tablet 2-column layout
  tabletFormRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
    alignItems: 'flex-start',
  },
  tabletFormLeft: {
    width: 200,
  },
  tabletFormRight: {
    flex: 1,
    gap: SPACING.sm,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
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
    color: C.textPrimary,
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
    backgroundColor: withAlpha(C.bronze, 0.06),
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
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitModalItemIconSelected: {
    backgroundColor: C.bronze,
  },
  unitModalItemText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  unitModalItemTextSelected: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  unitModalManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  unitModalManageText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
  },

  // Modal
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
  modalContentAnimated: {
    width: '100%',
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
    gap: SPACING.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  fieldLabelOptional: {
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
    letterSpacing: 0,
  },
  modalLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  modalInput: {
    ...TYPE.insight,
    lineHeight: undefined,
    color: C.textPrimary,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
  },
  modalInputFocused: {
    borderColor: withAlpha(C.bronze, 0.4),
  },
  modalInputError: {
    borderColor: BIZ.inputError,
    backgroundColor: withAlpha(BIZ.inputError, 0.08),
  },
  descInput: {
    minHeight: 56,
    maxHeight: 100,
  },
  descInputCompact: {
    minHeight: 44,
    maxHeight: 80,
  },
  detailsSection: {
    gap: SPACING.xs,
    backgroundColor: withAlpha(C.textMuted, 0.03),
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.04),
  },
  namePhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  inlinePhotoWrap: {
    position: 'relative',
  },
  inlinePhoto: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inlinePhotoImg: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg - 1,
  },
  inlinePhotoRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.textPrimary, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.background,
  },
  modalRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  modalConfirm: {
    flex: 2,
    paddingVertical: SPACING.md,
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

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    letterSpacing: 0.3,
  },

  // Live preview card
  previewCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    padding: SPACING.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  previewPhotoWrap: {
    position: 'relative',
  },
  previewPhotoArea: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewPhotoImage: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.lg - 1,
  },
  previewPhotoEditBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: RADIUS.md,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.background,
  },
  previewPhotoRemoveBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.textPrimary, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.background,
  },
  previewPhotoCameraCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.xl,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPhotoHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  imgPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: SPACING.xl,
  },
  imgPreviewCloseBtn: {
    position: 'absolute',
    top: 56,
    right: SPACING.lg,
    width: 36,
    height: 36,
    borderRadius: RADIUS.xl,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  imgPreviewImage: {
    width: '90%',
    height: '70%',
    borderRadius: RADIUS.xl,
  },
  previewInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  previewName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  previewNamePlaceholder: {
    color: C.textMuted,
    fontStyle: 'italic',
  },
  previewPrice: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  previewDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: withAlpha(BIZ.profit, 0.1),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginTop: 4,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingLeft: SPACING.md,
  },
  currencyInputRowFocused: {
    borderColor: withAlpha(C.bronze, 0.4),
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
    ...TYPE.insight,
    lineHeight: undefined,
    color: C.textPrimary,
    flex: 1,
    paddingVertical: SPACING.md,
    paddingRight: SPACING.md,
    paddingLeft: 0,
  },

  // Kept preview + margin badge
  keptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  keptText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.profit,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  marginBadge: {
    backgroundColor: withAlpha(BIZ.profit, 0.1),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  marginBadgeHigh: {
    backgroundColor: withAlpha(C.accent, 0.1),
  },
  marginBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.profit,
    fontVariant: ['tabular-nums'],
  },
  marginBadgeTextHigh: {
    color: C.accent,
  },

  // Validation warning
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  warningText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    flex: 1,
  },

  // Quick add mode
  quickAddRow: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  justAddedSection: {
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  justAddedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.15),
    padding: SPACING.md,
  },
  justAddedThumb: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
  },
  justAddedThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  justAddedThumbText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
  },
  justAddedName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  justAddedPrice: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
    marginTop: 2,
  },
  justAddedStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  justAddedStatusText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  justAddedActions: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  justAddedBtn: {
    width: '100%',
    paddingVertical: SPACING.md,
    backgroundColor: C.bronze,
    borderRadius: RADIUS.full,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  justAddedDoneText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },

  costDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: C.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  costDateText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  // ── Product detail modal ──
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  detailSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING['2xl'],
    paddingBottom: SPACING['2xl'],
    maxHeight: '80%',
    maxWidth: 420,
    width: '88%',
    gap: SPACING['2xl'],
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: SPACING.md,
    gap: SPACING.lg,
  },
  detailProductImage: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
  },
  detailProductAvatar: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailProductAvatarText: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
  },
  detailName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 2,
  },
  detailPriceLine: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  detailCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailStatsLine: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
  detailStatValue: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  detailStatLabel: {
    color: C.textMuted,
  },
  detailStatDot: {
    color: withAlpha(C.textMuted, 0.4),
  },
  detailDescInline: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 20,
    paddingVertical: SPACING.xs,
  },
  detailToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  detailStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  detailToggleLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  detailActionPill: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(C.bronze, C === CALM_DARK ? 0.12 : 0.06),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  detailActionPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  detailDeleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },
  detailDeleteBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // Bulk import
  bulkSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bulkSourceHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginLeft: SPACING.xs,
  },
  bulkLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  bulkLoadingText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
  },
  bulkTextArea: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.md,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  bulkResultsCount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  bulkResultsList: {
    maxHeight: 380,
  },
  bulkResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  bulkResultDeselected: {
    opacity: 0.4,
  },
  bulkCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkCheckboxSelected: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  bulkResultNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  bulkResultName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  bulkDupBadge: {
    backgroundColor: withAlpha(C.bronze, 0.12),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  bulkDupText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  bulkResultDetail: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },
  bulkDetailDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(C.dimBg, 0.5),
  },
  bulkDetailDimAbs: {
    ...StyleSheet.absoluteFillObject,
  },
  bulkDetailCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  bulkDetailCard: {
    width: '88%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING['2xl'],
    gap: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOWS.lg,
  },
  bdFieldInput: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    minWidth: 40,
    paddingVertical: 0,
  },

  doneFab: {
    position: 'absolute',
    right: SPACING.md,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    ...SHADOWS.md,
  },

  // Stock adjustment modal
  modalOverlayCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  stockAdjCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOWS.lg,
  },
  stockAdjSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: SPACING.xs,
  },
  stockAdjReasonRow: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  stockAdjReasonPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    marginRight: SPACING.sm,
  },
  stockAdjReasonPillActive: {
    backgroundColor: withAlpha(C.bronze, 0.15),
  },
  stockAdjReasonText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  stockAdjReasonTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  stockAdjHistory: {
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  stockAdjHistoryTitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stockAdjHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stockAdjHistoryDelta: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    minWidth: 36,
    fontVariant: ['tabular-nums'],
  },
  stockAdjHistoryReason: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    flex: 1,
  },
  stockAdjHistoryNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    flex: 1,
  },
  stockAdjHistoryDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },

});

export default Products;
