import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Pressable,
  Alert,
  Keyboard,
  Switch,
  Modal,
  InteractionManager,
} from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing as ReEasing,
  runOnJS,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n';
import { newId } from '../../utils/id';
import { lightTap, errorNotification } from '../../services/haptics';
import NewstInput, { newstOutline } from '../../components/business/NewstInput';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import FloatingModal from '../../components/common/FloatingModal';

// Expanding search (copied from SellScreen) — collapsed circle width + the web
// pattern's ease curve. Reanimated keeps the width tween on the UI thread.
const SEARCH_COLLAPSED = 40;
const SEARCH_EASING = ReEasing.bezier(0.16, 1, 0.3, 1);

const StallProducts: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const { products, addProduct, updateProduct, deleteProduct, roundCashTo5, setRoundCashTo5, units, categories } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  // Set when we leave for Settings from the half-filled form — on return focus
  // the form reopens with every field intact (state never unmounts).
  const returnToForm = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [defaultQty, setDefaultQty] = useState('');
  const [cost, setCost] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [modifiers, setModifiers] = useState<{ key: string; label: string; delta: string }[]>([]);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  // Inline validation — set by handleSave, cleared per-field on type.
  const [formErrors, setFormErrors] = useState<{ name?: string; price?: string; cost?: string }>({});
  const modKeyRef = React.useRef(0);
  const addModifierRow = useCallback(() => {
    setModifiers((prev) => [...prev, { key: `m${modKeyRef.current++}`, label: '', delta: '' }]);
  }, []);
  const updateModifierRow = useCallback((key: string, patch: Partial<{ label: string; delta: string }>) => {
    setModifiers((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }, []);
  const removeModifierRow = useCallback((key: string) => {
    setModifiers((prev) => prev.filter((m) => m.key !== key));
  }, []);

  // Stall is local-only: store the picked local URI directly (no upload). Mirrors
  // seller's permission gate.
  const handlePickImage = useCallback(async () => {
    let { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await ImagePicker.requestMediaLibraryPermissionsAsync());
      if (status !== 'granted') { Alert.alert('', t.stall.photoPermissionNeeded); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true });
    if (result.canceled || !result.assets?.[0]) return;
    setImageUrl(result.assets[0].uri);
  }, [t]);

  const activeCount = useMemo(() => products.filter((p) => p.isActive).length, [products]);

  // Map a category NAME → its Feather icon (for the selector + list headers).
  const categoryIcon = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.name.toLowerCase(), c.icon));
    return m;
  }, [categories]);

  // ── Browse row (copied from SellScreen): category dropdown + expanding search ──
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [browseRowWidth, setBrowseRowWidth] = useState(0);
  const searchWidth = useSharedValue(SEARCH_COLLAPSED);
  const searchAnimStyle = useAnimatedStyle(() => ({ width: searchWidth.value }));
  // Category button opacity tracks the search width — it fades back in DURING
  // the collapse instead of waiting for the animation's end callback (~0.4s
  // of empty row), and fades out while expanding.
  const catBtnAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.max((searchWidth.value - SEARCH_COLLAPSED) / 80, 0), 1),
  }));
  const searchInputRef = useRef<TextInput>(null);

  // Category options — the exact product category list from Settings, in order.
  const categoryPills = useMemo(
    () => (categories || []).map((c) => ({ value: c.name.toLowerCase(), label: c.name, icon: c.icon })),
    [categories],
  );

  // Selection may outlive its category (renamed/deleted) — fall back to 'all'.
  const effectiveCategory = categoryPills.some((p) => p.value === selectedCategory) ? selectedCategory : 'all';
  const selectedPill = categoryPills.find((p) => p.value === effectiveCategory);
  const selectedCatLabel = effectiveCategory === 'all' ? t.stall.allCategories : (selectedPill?.label ?? t.stall.allCategories);
  const selectedCatIcon = (effectiveCategory === 'all' ? 'layers' : (selectedPill?.icon ?? 'layers')) as keyof typeof Feather.glyphMap;

  const openCatDropdown = useCallback(() => {
    lightTap();
    setCatDropdownOpen(true);
  }, []);

  // Manage units/categories → the real Settings screen. The form closes (its
  // field state stays mounted on this screen), and useFocusEffect below pops
  // it back open when the user swipes back from Settings.
  const openManagerInSettings = useCallback((kind: 'unit' | 'category') => {
    lightTap();
    setShowUnitPicker(false);
    setShowCategoryPicker(false);
    returnToForm.current = true;
    setShowForm(false);
    navigation.navigate('SettingsDetail', { section: 'money', scrollTo: kind === 'unit' ? 'units' : 'stallcats' });
  }, [navigation]);

  // Returning from Settings (swipe-back or back button) → reopen the form.
  // runAfterInteractions lets the pop transition finish before the modal presents.
  useFocusEffect(
    useCallback(() => {
      if (!returnToForm.current) return;
      returnToForm.current = false;
      InteractionManager.runAfterInteractions(() => setShowForm(true));
    }, []),
  );

  const expandSearch = useCallback(() => {
    setSearchOpen(true);
    lightTap();
    searchWidth.value = withTiming(
      Math.max(browseRowWidth - SPACING.sm, SEARCH_COLLAPSED),
      { duration: 380, easing: SEARCH_EASING },
    );
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [searchWidth, browseRowWidth]);

  const collapseSearch = useCallback(() => {
    Keyboard.dismiss();
    searchWidth.value = withTiming(
      SEARCH_COLLAPSED,
      { duration: 380, easing: SEARCH_EASING },
      (finished) => {
        'worklet';
        if (finished) runOnJS(setSearchOpen)(false);
      },
    );
  }, [searchWidth]);

  // Keep an open search snapped to the row's real width (rotation / resize).
  const handleBrowseRowLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      const w = e.nativeEvent.layout.width;
      setBrowseRowWidth(w);
      if (searchOpen) searchWidth.value = w - SPACING.sm;
    },
    [searchOpen, searchWidth],
  );

  // Filtered products — category first, then the search query
  const filteredProducts = useMemo(() => {
    let list = products;
    if (effectiveCategory !== 'all') {
      list = list.filter((p) => p.category?.trim().toLowerCase() === effectiveCategory);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, effectiveCategory, searchQuery]);

  // Products grouped by category for the list; '' (uncategorized) sorts last.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof products>();
    for (const p of filteredProducts) {
      const key = p.category?.trim() || '';
      const arr = map.get(key);
      if (arr) arr.push(p); else map.set(key, [p]);
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ category: k, items: map.get(k)! }));
  }, [filteredProducts]);

  const resetForm = useCallback(() => {
    setName('');
    setPrice('');
    setDefaultQty('');
    setCost('');
    setUnit('');
    setCategory('');
    setImageUrl(undefined);
    setModifiers([]);
    setFormErrors({});
    setEditingId(null);
    setShowDetails(false);
    setShowUnitPicker(false);
    setShowCategoryPicker(false);
    setShowForm(false);
  }, []);

  // Clear one field's error as the user types into it.
  const clearFieldError = useCallback((key: 'name' | 'price' | 'cost') => {
    setFormErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  // FAB → open a blank product form (fresh fields, no leftover errors).
  const openAddForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setPrice('');
    setDefaultQty('');
    setCost('');
    setUnit('');
    setCategory('');
    setImageUrl(undefined);
    setModifiers([]);
    setFormErrors({});
    setShowDetails(false);
    setShowForm(true);
  }, []);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    const parsedPrice = parseFloat(price);

    // Validate — mandatory: name + price. Cost is optional but must be valid
    // if filled. The old silent `return` left users tapping "add" with no clue.
    const errs: { name?: string; price?: string; cost?: string } = {};
    if (!trimmedName) errs.name = t.stall.errorNameRequired;
    if (isNaN(parsedPrice) || parsedPrice <= 0) errs.price = t.stall.errorPriceInvalid;
    if (cost.trim() && (isNaN(parseFloat(cost)) || parseFloat(cost) <= 0)) errs.cost = t.stall.errorCostInvalid;
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      errorNotification();
      return;
    }
    setFormErrors({});

    const parsedDefault = parseInt(defaultQty, 10);
    const defaultStartQty = !isNaN(parsedDefault) && parsedDefault > 0 ? parsedDefault : undefined;
    const parsedCost = parseFloat(cost);
    const unitCost = !isNaN(parsedCost) && parsedCost > 0 ? parsedCost : undefined;
    const unitVal = unit.trim() || undefined;
    const categoryVal = category.trim() || undefined;
    const cleanMods = modifiers
      .filter((m) => m.label.trim())
      .map((m) => ({ id: newId(), label: m.label.trim(), priceDelta: parseFloat(m.delta) || 0 }));
    const modsPayload = cleanMods.length ? cleanMods : undefined;

    if (editingId) {
      updateProduct(editingId, { name: trimmedName, price: parsedPrice, defaultStartQty, unitCost, unit: unitVal, category: categoryVal, imageUrl, modifiers: modsPayload });
    } else {
      addProduct({ name: trimmedName, price: parsedPrice, isActive: true, defaultStartQty, unitCost, unit: unitVal, category: categoryVal, imageUrl, modifiers: modsPayload });
    }
    resetForm();
  }, [name, price, defaultQty, cost, unit, category, imageUrl, modifiers, editingId, updateProduct, addProduct, resetForm, t]);

  const handleEdit = useCallback((id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditingId(id);
    setName(product.name);
    setPrice(product.price.toString());
    setDefaultQty(product.defaultStartQty ? String(product.defaultStartQty) : '');
    setCost(product.unitCost ? String(product.unitCost) : '');
    setUnit(product.unit || '');
    setCategory(product.category || '');
    setImageUrl(product.imageUrl);
    setModifiers((product.modifiers || []).map((m) => ({ key: `m${modKeyRef.current++}`, label: m.label, delta: m.priceDelta ? String(m.priceDelta) : '' })));
    setShowForm(true);
  }, [products]);

  const handleDelete = useCallback((id: string) => {
    const product = products.find((p) => p.id === id);
    Alert.alert(
      t.stall.deleteConfirmTitle,
      t.stall.deleteConfirmMsg.replace('{name}', product?.name || ''),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.stall.deleteProduct,
          style: 'destructive',
          onPress: () => {
            deleteProduct(id);
            resetForm();
          },
        },
      ],
    );
  }, [products, deleteProduct, resetForm, t]);

  // ─── Product-detail modal (read view; opened by tapping a tile) ──
  const detailProduct = useMemo(
    () => (detailId ? products.find((p) => p.id === detailId) || null : null),
    [detailId, products],
  );

  const toggleDetailActive = useCallback(() => {
    if (!detailProduct) return;
    updateProduct(detailProduct.id, { isActive: !detailProduct.isActive });
  }, [detailProduct, updateProduct]);

  // Edit from the detail view → same modal, just switch content to the form (no
  // second RN Modal, so closing the form can't bounce back to the detail view).
  const openEditFromDetail = useCallback(() => {
    const id = detailId;
    if (id) { setDetailId(null); handleEdit(id); }
  }, [detailId, handleEdit]);

  // Two-tone title like seller — the noun ("product"/"produk") is bronze wherever
  // it sits in the phrase, so BM word order ("produk baharu") colours correctly.
  const titleText = editingId ? t.stall.editProduct : t.stall.newProduct;
  const titleNoun = t.stall.productWord;
  const nounIdx = titleText.toLowerCase().indexOf(titleNoun.toLowerCase());

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nav header already shows the "Products" title \u2014 keep just the one-line
            description + active count below it. */}
        <Text style={styles.subheading}>
          {t.stall.productsSub}{products.length > 0 ? ` \u00B7 ${t.stall.activeSuffix.replace('{n}', String(activeCount))}` : ''}
        </Text>

        {/* Add / Edit product — floating (centered) modal, keyboard-aware so a
            focused field is never hidden behind the keyboard. */}
        <FloatingModal
          visible={showForm || !!detailProduct}
          onClose={() => { setShowUnitPicker(false); setShowCategoryPicker(false); setDetailId(null); resetForm(); }}
          entrance="fade"
          showDragHandle={false}
          maxWidth={showForm ? 520 : 480}
          overlay={showUnitPicker ? (
            // Dim backdrop that closes ONLY the picker (not the whole form). The inner
            // card stops taps from bubbling, so tapping the card never dismisses.
            <Pressable
              style={styles.unitModalOverlay}
              onPress={() => setShowUnitPicker(false)}
              accessibilityRole="button"
              accessibilityLabel={t.common.close}
            >
              <Pressable style={[styles.unitModalContent, neu.raisedModal]} onStartShouldSetResponder={() => true}>
                <View style={styles.unitPickerHeader}>
                  <Text style={styles.unitPickerTitle}>{t.stall.selectUnit}</Text>
                  <TouchableOpacity
                    onPress={() => setShowUnitPicker(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={t.common.close}
                  >
                    <Feather name="x" size={20} color={C.textSecondary} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={[styles.unitPickerList, styles.unitPickerListBleed]}
                  contentContainerStyle={styles.unitPickerListContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {units.map((u) => {
                    const selected = unit === u;
                    return (
                      <TouchableOpacity
                        key={u}
                        style={[styles.unitPickerItem, selected ? styles.unitPickerItemSelected : neu.raised]}
                        activeOpacity={0.7}
                        onPress={() => { setUnit(selected ? '' : u); setShowUnitPicker(false); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={u}
                      >
                        <View style={[styles.unitPickerIcon, selected && styles.unitPickerIconSelected]}>
                          <Feather name="box" size={16} color={selected ? C.onAccent : C.bronze} />
                        </View>
                        <Text style={[styles.unitPickerItemText, selected && styles.unitPickerItemTextSelected]}>{u}</Text>
                        {selected && <Feather name="check" size={16} color={C.bronze} style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                    );
                  })}
                  {/* Manage units in settings — jumps to Settings; swiping back
                      reopens this half-filled form (fields are preserved). */}
                  <TouchableOpacity
                    style={styles.unitManageBtn}
                    activeOpacity={0.7}
                    onPress={() => openManagerInSettings('unit')}
                    accessibilityRole="button"
                    accessibilityLabel={t.stall.manageUnitsInSettings}
                  >
                    <Feather name="settings" size={14} color={C.bronze} />
                    <Text style={styles.unitManageText}>{t.stall.manageUnitsInSettings}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </Pressable>
            </Pressable>
          ) : showCategoryPicker ? (
            // Category picker — identical to the unit picker; each row has an icon.
            <Pressable
              style={styles.unitModalOverlay}
              onPress={() => setShowCategoryPicker(false)}
              accessibilityRole="button"
              accessibilityLabel={t.common.close}
            >
              <Pressable style={[styles.unitModalContent, neu.raisedModal]} onStartShouldSetResponder={() => true}>
                <View style={styles.unitPickerHeader}>
                  <Text style={styles.unitPickerTitle}>{t.stall.selectCategory}</Text>
                  <TouchableOpacity
                    onPress={() => setShowCategoryPicker(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={t.common.close}
                  >
                    <Feather name="x" size={20} color={C.textSecondary} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={[styles.unitPickerList, styles.unitPickerListBleed]}
                  contentContainerStyle={styles.unitPickerListContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {categories.map((c) => {
                    const selected = category.trim().toLowerCase() === c.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={c.name}
                        style={[styles.unitPickerItem, selected ? styles.unitPickerItemSelected : neu.raised]}
                        activeOpacity={0.7}
                        onPress={() => { setCategory(selected ? '' : c.name); setShowCategoryPicker(false); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={c.name}
                      >
                        <View style={[styles.unitPickerIcon, selected && styles.unitPickerIconSelected]}>
                          <Feather name={c.icon as keyof typeof Feather.glyphMap} size={16} color={selected ? C.onAccent : C.bronze} />
                        </View>
                        <Text style={[styles.unitPickerItemText, selected && styles.unitPickerItemTextSelected]}>{c.name}</Text>
                        {selected && <Feather name="check" size={16} color={C.bronze} style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                    );
                  })}
                  {/* Manage categories in settings — jumps to Settings; swiping back
                      reopens this half-filled form (fields are preserved). */}
                  <TouchableOpacity
                    style={styles.unitManageBtn}
                    activeOpacity={0.7}
                    onPress={() => openManagerInSettings('category')}
                    accessibilityRole="button"
                    accessibilityLabel={t.stall.manageCategoriesInSettings}
                  >
                    <Feather name="settings" size={14} color={C.bronze} />
                    <Text style={styles.unitManageText}>{t.stall.manageCategoriesInSettings}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </Pressable>
            </Pressable>
          ) : null}
        >
          {/* One modal, two views: the add/edit FORM or the product DETAIL. Merging
              them (vs two stacked RN Modals) means closing the form never bounces back
              to detail — iOS can't cleanly dismiss one modal and keep another. */}
          {showForm && (
          <KeyboardAwareScrollView
            style={styles.sheetKAS}
            contentContainerStyle={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bottomOffset={24}
          >
            {/* Header — two-tone title (noun bronze) + round close */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {nounIdx < 0 ? titleText : (
                    <>
                      {titleText.slice(0, nounIdx)}
                      <Text style={styles.modalTitleAccent}>{titleText.slice(nounIdx, nounIdx + titleNoun.length)}</Text>
                      {titleText.slice(nounIdx + titleNoun.length)}
                    </>
                  )}
                </Text>
              </View>
              <Pressable
                onPress={resetForm}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
              >
                <Feather name="x" size={16} color={C.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>{t.stall.addWhatYouSell}</Text>

            {/* Photo + name — one row. Stall is local-only (no upload). Seam rule:
                neu shadow on the tile, overflow clip on a separate inner view. */}
            <View style={styles.namePhotoRow}>
              <View style={styles.inlinePhotoWrap}>
                <Pressable
                  style={[styles.inlinePhoto, neu.raised]}
                  onPress={handlePickImage}
                  accessibilityRole="button"
                  accessibilityLabel={imageUrl ? t.stall.changePhoto : t.stall.addPhoto}
                >
                  {imageUrl ? (
                    <View style={styles.inlinePhotoClip}>
                      <Image source={{ uri: imageUrl }} style={styles.inlinePhotoImg} contentFit="cover" />
                    </View>
                  ) : (
                    <Feather name="camera" size={18} color={C.bronze} />
                  )}
                </Pressable>
                {!imageUrl && (
                  // "+" badge on the empty camera icon (matches the CommitmentForm
                  // photo picker). pointerEvents none → taps fall through to the tile.
                  <View style={styles.inlinePhotoPlus} pointerEvents="none">
                    <Feather name="plus" size={9} color={C.onAccent} />
                  </View>
                )}
                {imageUrl && (
                  <Pressable
                    style={styles.inlinePhotoRemove}
                    onPress={() => setImageUrl(undefined)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                  >
                    <Feather name="x" size={9} color={C.onAccent} />
                  </Pressable>
                )}
              </View>
              <NewstInput
                label={t.stall.productNameLabel}
                value={name}
                onChangeText={(v) => { setName(v); clearFieldError('name'); }}
                autoFocus={!editingId}
                accessibilityLabel="Product name"
                error={formErrors.name}
                style={styles.nameField}
              />
            </View>

            {/* Category selector — opens the floating category picker (identical to
                the unit picker; each category carries an icon). Groups the list. */}
            <Pressable
              style={[styles.categorySelector, neu.raised]}
              onPress={() => { Keyboard.dismiss(); setShowCategoryPicker(true); }}
              accessibilityRole="button"
              accessibilityLabel={t.stall.categoryLabel}
            >
              <Text style={styles.unitSelectorLabel} numberOfLines={1}>{t.stall.categoryLabel}</Text>
              <View style={styles.unitSelectorValue}>
                {!!category && categoryIcon.has(category.toLowerCase()) && (
                  <Feather name={categoryIcon.get(category.toLowerCase()) as keyof typeof Feather.glyphMap} size={16} color={C.bronze} style={{ marginRight: SPACING.xs }} />
                )}
                <Text style={[styles.unitSelectorText, !category && styles.unitSelectorPlaceholder]} numberOfLines={1}>
                  {category || t.stall.categoryPlaceholder}
                </Text>
                <Feather name="chevron-down" size={16} color={C.textMuted} />
              </View>
            </Pressable>

            {/* Selling price + your cost — two columns */}
            <View style={styles.twoColRow}>
              <NewstInput
                label={t.stall.priceLabel}
                value={price}
                onChangeText={(v) => { setPrice(v); clearFieldError('price'); }}
                prefix={currency}
                keyboardType="decimal-pad"
                accessibilityLabel="Product price"
                error={formErrors.price}
                style={styles.col}
              />
              <NewstInput
                label={t.stall.costEachLabel}
                value={cost}
                onChangeText={(v) => { setCost(v); clearFieldError('cost'); }}
                prefix={currency}
                keyboardType="decimal-pad"
                accessibilityLabel="Cost per unit, optional"
                error={formErrors.cost}
                style={styles.col}
              />
            </View>

            {/* Unit dropdown + default starting stock — two columns */}
            <View style={styles.twoColRow}>
              <Pressable
                style={[styles.unitSelector, neu.raised]}
                onPress={() => { Keyboard.dismiss(); setShowUnitPicker(true); }}
                accessibilityRole="button"
                accessibilityLabel={t.stall.unitLabel}
              >
                <Text style={styles.unitSelectorLabel} numberOfLines={1}>{t.stall.unitLabel}</Text>
                <View style={styles.unitSelectorValue}>
                  <Text style={[styles.unitSelectorText, !unit && styles.unitSelectorPlaceholder]} numberOfLines={1}>
                    {unit || t.stall.unitPlaceholder}
                  </Text>
                  <Feather name="chevron-down" size={16} color={C.textMuted} />
                </View>
              </Pressable>
              <NewstInput
                label={t.stall.defaultPerSession}
                value={defaultQty}
                onChangeText={(v) => setDefaultQty(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                accessibilityLabel="Default starting stock, optional"
                style={styles.col}
              />
            </View>

            {/* + add details — collapsed by default; reveals the optional
                quick-options (modifiers), matching seller's expandable details. */}
            {(showDetails || modifiers.length > 0) ? (
            <View style={styles.detailsSection}>
            <Text style={styles.fieldLabel}>{t.stall.modifiersLabel}</Text>
            <Text style={styles.modHint}>{t.stall.modifiersHint}</Text>
            {modifiers.map((m) => (
              <View key={m.key} style={styles.modRow}>
                <TextInput
                  style={[styles.modName, newstOutline(C, focusedField === 'modName-' + m.key)]}
                  value={m.label}
                  onChangeText={(v) => updateModifierRow(m.key, { label: v })}
                  onFocus={() => setFocusedField('modName-' + m.key)}
                  onBlur={() => setFocusedField((prev) => (prev === 'modName-' + m.key ? null : prev))}
                  placeholder={t.stall.modifierNamePlaceholder}
                  placeholderTextColor={C.neutral}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
                <View style={[styles.modDeltaWrap, newstOutline(C, focusedField === 'modDelta-' + m.key)]}>
                  <Text style={styles.priceCurrency}>{currency}</Text>
                  <TextInput
                    style={styles.modDelta}
                    value={m.delta}
                    onChangeText={(v) => updateModifierRow(m.key, { delta: v.replace(/[^0-9.-]/g, '') })}
                    onFocus={() => setFocusedField('modDelta-' + m.key)}
                    onBlur={() => setFocusedField((prev) => (prev === 'modDelta-' + m.key ? null : prev))}
                    placeholder={t.stall.modifierDeltaPlaceholder}
                    placeholderTextColor={C.neutral}
                    keyboardType="numbers-and-punctuation"
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.accent, 0.25)}
                  />
                </View>
                <TouchableOpacity onPress={() => removeModifierRow(m.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Remove option">
                  <Feather name="x" size={16} color={C.neutral} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addModLink} onPress={addModifierRow} accessibilityRole="button" accessibilityLabel={t.stall.addModifierBtn}>
              <Text style={styles.addModLinkText}>{t.stall.addModifierBtn}</Text>
            </TouchableOpacity>
            </View>
            ) : (
              <Pressable
                onPress={() => setShowDetails(true)}
                style={({ pressed }) => [styles.addDetailsLink, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={t.stall.addDetails}
              >
                <Feather name="plus" size={13} color={C.bronze} />
                <Text style={styles.addDetailsText}>{t.stall.addDetails}</Text>
              </Pressable>
            )}

            {/* Footer — cancel (outline) + primary CTA (bronze NeuButton) */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={resetForm}
                accessibilityRole="button"
                accessibilityLabel={t.stall.cancel}
              >
                <Text style={styles.modalCancelText}>{t.stall.cancel}</Text>
              </TouchableOpacity>
              <View style={styles.confirmCol}>
                <NeuButton
                  icon={editingId ? 'check' : 'plus'}
                  label={editingId ? t.stall.update : t.stall.addProduct}
                  color={C.bronze}
                  onPress={handleSave}
                  accessibilityLabel={editingId ? 'Update product' : 'Add product'}
                />
              </View>
            </View>

            {/* Delete — a word/link UNDER the cancel/update buttons (edit mode). */}
            {editingId && (
              <TouchableOpacity
                style={styles.deleteLink}
                onPress={() => handleDelete(editingId)}
                accessibilityRole="button"
                accessibilityLabel={t.stall.deleteProduct}
              >
                <Text style={styles.deleteLinkText}>{t.stall.deleteProduct}</Text>
              </TouchableOpacity>
            )}
          </KeyboardAwareScrollView>
          )}

          {/* Product detail — read view in the SAME modal, opened by tapping a tile. */}
          {!showForm && detailProduct ? (() => {
            const p = detailProduct;
            const hasCost = p.unitCost != null && p.unitCost > 0;
            const profit = hasCost ? p.price - (p.unitCost as number) : 0;
            const margin = hasCost && p.price > 0 ? Math.round((profit / p.price) * 100) : 0;
            const catIc = p.category ? categoryIcon.get(p.category.toLowerCase()) : undefined;
            return (
              <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
                <View style={styles.detailHeader}>
                  <View style={styles.tileThumbWrap}>
                    {p.imageUrl ? (
                      <View style={styles.tileThumbClip}>
                        <Image source={{ uri: p.imageUrl }} style={styles.tileThumbImg} contentFit="cover" />
                      </View>
                    ) : (
                      <View style={styles.tileThumbPlaceholder}>
                        <Text style={styles.tileThumbLetter}>{p.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.detailHeaderText}>
                    <Text style={styles.detailName} numberOfLines={2}>{p.name}</Text>
                    {!!p.category && (
                      <View style={styles.detailCatRow}>
                        {catIc && <Feather name={catIc as keyof typeof Feather.glyphMap} size={12} color={C.textMuted} style={{ marginRight: 4 }} />}
                        <Text style={styles.detailCatText}>{p.category}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    onPress={() => setDetailId(null)}
                    style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={t.common.close}
                  >
                    <Feather name="x" size={16} color={C.textMuted} />
                  </Pressable>
                </View>

                <View style={[styles.detailInfoCard, neu.raisedSoft]}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailRowLabel}>{t.stall.priceLabel}</Text>
                    <Text style={styles.detailRowValue}>{currency} {p.price.toFixed(2)}{p.unit ? `/${p.unit}` : ''}</Text>
                  </View>
                  {hasCost && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailRowLabel}>{t.stall.costEachLabel}</Text>
                      <Text style={styles.detailRowValue}>{currency} {(p.unitCost as number).toFixed(2)}</Text>
                    </View>
                  )}
                  {hasCost && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailRowLabel}>{t.stall.youKeep}</Text>
                      <Text style={[styles.detailRowValue, styles.detailKeepValue]}>{currency} {profit.toFixed(2)} · {margin}%</Text>
                    </View>
                  )}
                  {!!p.defaultStartQty && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailRowLabel}>{t.stall.defaultPerSession}</Text>
                      <Text style={styles.detailRowValue}>{p.defaultStartQty}{p.unit ? ' ' + p.unit : ''}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailRowLabel}>{t.stall.soldLabel}</Text>
                    <Text style={styles.detailRowValue}>{p.totalSold}</Text>
                  </View>
                </View>

                {/* Quick options (modifiers), if any */}
                {!!p.modifiers?.length && (
                  <View style={styles.detailModsSection}>
                    <Text style={styles.detailModsLabel}>{t.stall.quickOptionsLabel}</Text>
                    <View style={styles.detailModsWrap}>
                      {p.modifiers.map((m) => (
                        <View key={m.id} style={styles.detailModChip}>
                          <Text style={styles.detailModChipText}>{m.label}</Text>
                          {!!m.priceDelta && (
                            <Text style={styles.detailModChipDelta}>
                              {m.priceDelta > 0 ? '+' : '−'}{currency} {Math.abs(m.priceDelta).toFixed(2)}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Active toggle — RN Switch, matching personal mode */}
                <View style={styles.detailToggleRow}>
                  <Text style={styles.detailToggleLabel}>{t.stall.showOnSell}</Text>
                  <Switch
                    value={p.isActive}
                    onValueChange={toggleDetailActive}
                    trackColor={{ false: C.border, true: C.bronze }}
                    thumbColor={C.surface}
                    accessibilityLabel={t.stall.showOnSell}
                  />
                </View>

                <NeuButton
                  icon="edit-2"
                  label={t.stall.editBtn}
                  color={C.bronze}
                  onPress={openEditFromDetail}
                  style={{ marginTop: SPACING.sm }}
                />
              </ScrollView>
            );
          })() : null}
        </FloatingModal>

        {/* Browse row (copied from Sell): category dropdown + expanding search */}
        {products.length > 0 && (
          <View style={styles.browseRow} onLayout={handleBrowseRowLayout}>
            <View style={styles.catDropdownWrap}>
              {/* Always mounted — opacity tracks the search width, so it fades
                  in while the bar shrinks rather than after it. Untouchable
                  while the search owns the row. */}
              <ReAnimated.View style={catBtnAnimStyle} pointerEvents={searchOpen ? 'none' : 'auto'}>
                <TouchableOpacity
                  style={[styles.catDropdownBtn, neu.raised]}
                  onPress={openCatDropdown}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t.stall.selectCategory}
                >
                  <Feather name={selectedCatIcon} size={14} color={C.bronze} />
                  <Text style={styles.catDropdownText} numberOfLines={1}>{selectedCatLabel}</Text>
                  <Feather name="chevron-down" size={16} color={C.textMuted} />
                </TouchableOpacity>
              </ReAnimated.View>
            </View>

            {/* Expanding search — shadow on the OUTER view, clip on the INNER
                one (iOS masksToBounds would slice the view's own shadow). */}
            <ReAnimated.View style={[styles.searchWrap, neu.raised, searchAnimStyle]}>
              <View style={styles.searchClip}>
                {searchOpen ? (
                  <>
                    <Feather name="search" size={16} color={C.textSecondary} />
                    <TextInput
                      ref={searchInputRef}
                      style={styles.searchInput}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      onBlur={() => { if (!searchQuery) collapseSearch(); }}
                      placeholder="Search products..."
                      placeholderTextColor={C.neutral}
                      returnKeyType="search"
                      onSubmitEditing={Keyboard.dismiss}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={withAlpha(C.accent, 0.25)}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="x" size={16} color={C.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.searchCollapsedBtn}
                    onPress={expandSearch}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Search products"
                  >
                    <Feather name="search" size={16} color={C.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </ReAnimated.View>
          </View>
        )}

        {/* Product list — grouped by category, Storefront-tile neu cards */}
        {products.length > 0 && (
          <View style={styles.listSection}>
            {grouped.map(({ category: cat, items }) => (
              <View key={cat || '__uncat'} style={styles.catGroup}>
                <View style={styles.catHeaderRow}>
                  {!!cat && categoryIcon.has(cat.toLowerCase()) && (
                    <Feather name={categoryIcon.get(cat.toLowerCase()) as keyof typeof Feather.glyphMap} size={13} color={C.textMuted} style={{ marginRight: SPACING.xs }} />
                  )}
                  <Text style={styles.catHeader}>{cat || t.stall.uncategorized}</Text>
                </View>
                {items.map((product) => {
                  return (
                    <TouchableOpacity
                      key={product.id}
                      style={[styles.tile, neu.raisedSoft, !product.isActive && styles.tileInactive]}
                      activeOpacity={0.7}
                      onPress={() => setDetailId(product.id)}
                      accessibilityRole="button"
                      accessibilityLabel={product.name}
                      accessibilityHint={t.stall.tapForDetail}
                    >
                      {/* Thumbnail / letter placeholder. Seam rule: the overflow clip
                          lives on the inner view, never on the neu-shadowed tile. */}
                      <View style={styles.tileThumbWrap}>
                        {product.imageUrl ? (
                          <View style={styles.tileThumbClip}>
                            <Image source={{ uri: product.imageUrl }} style={styles.tileThumbImg} contentFit="cover" />
                          </View>
                        ) : (
                          <View style={styles.tileThumbPlaceholder}>
                            <Text style={styles.tileThumbLetter}>{product.name.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                      </View>

                      {/* Middle: name + price only (fuller info lives in the detail modal) */}
                      <View style={styles.tileInfo}>
                        <Text style={styles.tileName} numberOfLines={1}>{product.name}</Text>
                        <Text style={styles.tilePriceLine} numberOfLines={1}>
                          {currency} {product.price.toFixed(2)}{product.unit ? `/${product.unit}` : ''}
                        </Text>
                      </View>

                      {/* Whole tile is tappable → opens the product-detail modal. */}
                      <Feather name="chevron-right" size={20} color={C.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {grouped.length === 0 && (
              <Text style={styles.filterEmpty}>
                {searchQuery.trim() ? `no products match "${searchQuery}"` : t.stall.emptyCategory}
              </Text>
            )}
          </View>
        )}

        {/* Empty state */}
        {products.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="package" size={28} color={C.textMuted} />
            </View>
            <Text style={styles.emptyText}>
              {t.stall.productsEmpty}
            </Text>
          </View>
        )}

        {/* Stall setting: 5-sen cash rounding */}
        <TouchableOpacity
          style={[styles.settingRow, neu.raisedSoft]}
          onPress={() => setRoundCashTo5(!roundCashTo5)}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityState={{ checked: roundCashTo5 }}
          accessibilityLabel={t.stall.roundCashLabel}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>{t.stall.roundCashLabel}</Text>
            <Text style={styles.settingHint}>{t.stall.roundCashHint}</Text>
          </View>
          <Feather name={roundCashTo5 ? 'check-square' : 'square'} size={22} color={roundCashTo5 ? C.bronze : C.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Add product — floating bronze FAB, bottom-right (the personal-mode
          per-screen FAB pattern, in business bronze). */}
      <TouchableOpacity
        style={[styles.addFab, { bottom: insets.bottom + SPACING['2xl'] }]}
        onPress={openAddForm}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t.stall.addProduct}
      >
        <Feather name="plus" size={26} color={C.onAccent} />
      </TouchableOpacity>

      {/* Category dropdown list — centered floating modal (copied from Sell). */}
      <Modal
        visible={catDropdownOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCatDropdownOpen(false)}
      >
        <Pressable style={styles.catDropdownOverlay} onPress={() => setCatDropdownOpen(false)}>
          <View
            style={[styles.catDropdownCard, neu.raisedModal]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.catDropdownHeader}>
              <Text style={styles.catDropdownTitle}>{t.stall.selectCategory}</Text>
              <TouchableOpacity
                onPress={() => setCatDropdownOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
              >
                <Feather name="x" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.catDropdownList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={styles.catDropdownItem}
                onPress={() => { lightTap(); setSelectedCategory('all'); setCatDropdownOpen(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: effectiveCategory === 'all' }}
              >
                <Feather name="layers" size={14} color={effectiveCategory === 'all' ? C.bronze : C.textSecondary} />
                <Text style={[styles.catDropdownItemText, effectiveCategory === 'all' && styles.catDropdownItemTextActive]}>
                  {t.stall.allCategories}
                </Text>
                {effectiveCategory === 'all' && <Feather name="check" size={14} color={C.bronze} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {categoryPills.map((pill) => {
                const active = effectiveCategory === pill.value;
                return (
                  <TouchableOpacity
                    key={pill.value}
                    style={styles.catDropdownItem}
                    onPress={() => { lightTap(); setSelectedCategory(pill.value); setCatDropdownOpen(false); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Feather name={pill.icon as keyof typeof Feather.glyphMap} size={14} color={active ? C.bronze : C.textSecondary} />
                    <Text style={[styles.catDropdownItemText, active && styles.catDropdownItemTextActive]} numberOfLines={1}>
                      {pill.label}
                    </Text>
                    {active && <Feather name="check" size={14} color={C.bronze} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
};
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['4xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  subheading: {
    ...TYPE.muted,
    color: C.textSecondary,
    marginBottom: SPACING['3xl'],
  },

  // Add-product FAB — bronze fill, white +, bottom-right float (shadow like
  // BusinessFAB: present in light, dropped in dark).
  addFab: {
    position: 'absolute',
    right: SPACING['2xl'],
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },

  // ─── Browse row: category dropdown + expanding search (copied from Sell) ───
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    width: '100%',
  },
  catDropdownWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: SPACING.sm,
    alignItems: 'flex-start',
  },
  catDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    maxWidth: '100%',
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
  },
  catDropdownText: {
    flexShrink: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  catDropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  catDropdownCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  catDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  catDropdownTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  catDropdownList: {
    maxHeight: 360,
    flexGrow: 0,
  },
  catDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  catDropdownItemText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  catDropdownItemTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  // Outer shell: background + neu shadow only — no overflow (iOS masksToBounds
  // would clip the view's OWN shadow). The inner view does the clipping.
  searchWrap: {
    height: 40,
    borderRadius: RADIUS.full,
  },
  searchClip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: SPACING.xs,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  searchCollapsedBtn: {
    width: 40,
    height: 40,
    marginHorizontal: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    padding: 0,
  },
  filterEmpty: {
    ...TYPE.muted,
    textAlign: 'center',
    paddingVertical: SPACING['2xl'],
  },

  // ─── Form ──────────────────────────────────────────────────
  formCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  fieldLabel: {
    ...TYPE.muted,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
  },
  modHint: {
    ...TYPE.muted,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
  },
  modRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  modName: {
    flex: 1,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    minHeight: 40,
  },
  modDeltaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    width: 92,
    minHeight: 40,
  },
  modDelta: {
    flex: 1,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  addModLink: {
    paddingVertical: SPACING.xs,
  },
  addModLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING['2xl'],
    minHeight: 56,
  },
  settingLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  settingHint: {
    ...TYPE.muted,
    marginTop: 2,
  },
  priceCurrency: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },

  // ─── Product list ──────────────────────────────────────────
  listSection: {
    gap: 0,
  },

  // ─── Category groups + Storefront tiles ─────────────────────
  catGroup: {
    marginBottom: SPACING.xl,
  },
  catHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  catHeader: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: C.textMuted,
  },
  // Neu Card: C.background surface comes from neu.raisedSoft; NO border, NO overflow
  // here (the thumbnail clip lives on its own inner view — the seam rule).
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    minHeight: 64,
  },
  tileInactive: {
    opacity: 0.45,
  },
  tileThumbWrap: {
    width: 56,
    height: 56,
  },
  tileThumbClip: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  tileThumbImg: {
    width: '100%',
    height: '100%',
  },
  tileThumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileThumbLetter: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
  },
  tileInfo: {
    flex: 1,
    gap: 2,
  },
  tileName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  // Price: a bit bigger + darker than the old muted line (per owner).
  tilePriceLine: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  // Delete link — a word under the cancel/update buttons in the edit form.
  deleteLink: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
    minHeight: 44,
  },
  deleteLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.neutral,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ─── Product detail modal ───────────────────────────────────
  // Plain ScrollView inside the modal card → flexGrow:0/flexShrink:1 (CLAUDE.md).
  detailScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  detailBody: {
    padding: SPACING.xl,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  detailHeaderText: {
    flex: 1,
  },
  detailName: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  detailCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  detailCatText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  detailInfoCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.md,
  },
  detailRowLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  detailRowValue: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  detailKeepValue: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  detailToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    minHeight: 44,
  },
  // Quick options (modifiers) in the detail modal
  detailModsSection: {
    marginTop: SPACING.lg,
  },
  detailModsLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: C.textMuted,
    marginBottom: SPACING.sm,
  },
  detailModsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  detailModChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.1),
  },
  detailModChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  detailModChipDelta: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  detailToggleLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ─── Category selector (in the add/edit form) ───────────────
  categorySelector: {
    minHeight: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    gap: 6,
    marginBottom: SPACING.md,
  },

  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 52,
    gap: SPACING.md,
  },
  toggleButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  productNameInactive: {
    color: C.neutral,
  },
  productPrice: {
    ...TYPE.muted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  productRowInactive: {
    opacity: 0.5,
  },
  editButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Empty state ───────────────────────────────────────────
  emptyState: {
    paddingVertical: SPACING['4xl'],
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, 0.04),
  },
  emptyText: {
    ...TYPE.insight,
    color: C.textSecondary,
    textAlign: 'center',
  },

  // ─── Add/Edit product modal (floating, keyboard-aware) ───────
  // Frame (backdrop, centered card, rounded corners) comes from FloatingModal;
  // the card has no padding, so the scroll content supplies it.
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.3,
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
    letterSpacing: 0.1,
    // ── Hand-tune the two header gaps here ──────────────────────
    // Both vertical gaps around "add what you sell" live on THIS style.
    // marginTop  = space between the "new product" title and this line.
    //   (was -SPACING.sm / -8, which pulled them together)
    // marginBottom = space between this line and the first field row.
    marginTop: SPACING.sm,     // ← title ↔ description gap  (SPACING.sm = 8)
    marginBottom: SPACING.xl,  // ← description ↔ fields gap (SPACING.xl = 24)
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetKAS: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScroll: {
    padding: SPACING.xl,
    paddingTop: SPACING['3xl'],
  },
  // ─── Photo + name row (top of form) ─────────────────────────
  namePhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  nameField: {
    flex: 1,
  },
  inlinePhotoWrap: {
    position: 'relative',
  },
  inlinePhoto: {
    // seam rule: neu shadow lives here (no overflow); the clip is a separate view
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlinePhotoClip: {
    width: '100%',
    height: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  inlinePhotoImg: {
    width: '100%',
    height: '100%',
  },
  inlinePhotoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: RADIUS.md,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "+" badge on the empty photo tile (bottom-right, ringed by the card bg)
  inlinePhotoPlus: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.background,
  },
  rowThumb: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.textPrimary, 0.04),
  },
  // ─── 2-column rows (price/cost, unit/stock) ─────────────────
  twoColRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  col: {
    flex: 1,
  },
  // Unit dropdown — opens the unit picker
  unitSelector: {
    flex: 1,
    minHeight: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    gap: 6,
  },
  unitSelectorLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  unitSelectorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unitSelectorText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  unitSelectorPlaceholder: {
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
  },
  // ─── Expandable details (modifiers) ─────────────────────────
  detailsSection: {
    gap: SPACING.xs,
    backgroundColor: withAlpha(C.textMuted, 0.03),
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  addDetailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  addDetailsText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  // ─── Footer actions ─────────────────────────────────────────
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  modalCancel: {
    flex: 1,
    minHeight: 52,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  confirmCol: {
    flex: 2,
  },
  // ─── Unit picker (floats over the form via FloatingModal overlay slot) ──
  // Dim full-screen backdrop; tap closes ONLY the picker. Matches seller mode.
  unitModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  // Onyx dialog card floating over a dim scrim: neu.raisedModal (spread at the call
  // site) supplies the C.background surface + a single soft neutral drop — the neu
  // kit's dialog fragment, no white halo. Border per the floating-modal-outline rule.
  unitModalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
  },
  unitPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  unitPickerTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  unitPickerList: {
    flexGrow: 0,
    maxHeight: 360,
  },
  // Shape-3 seam fix: bleed the scroll viewport past the neu rows so its clip can't
  // shear the boxShadow; content padding puts the rows back (see the onyx seam rule).
  unitPickerListBleed: {
    marginHorizontal: -SPACING.lg,
  },
  unitPickerListContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 2,
    paddingBottom: 2,
  },
  // Onyx option row: neu.raised (unselected, spread at call site) / bronze fill
  // (selected). Base surface comes from the neu fragment — no bg here.
  unitPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    minHeight: 48,
    marginBottom: SPACING.sm,
  },
  unitPickerItemSelected: {
    backgroundColor: withAlpha(C.bronze, 0.12),
  },
  unitPickerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitPickerIconSelected: {
    backgroundColor: C.bronze,
  },
  unitPickerItemText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  unitPickerItemTextSelected: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  // "manage units in settings" footer row (list footer, matches seller mode) —
  // divider line above it via borderTop, exactly like seller's unitModalManageBtn.
  unitManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  unitManageText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
});

export default StallProducts;
