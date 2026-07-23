import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Pressable,
  Alert,
  Keyboard,
} from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { newId } from '../../utils/id';
import NewstInput, { newstOutline } from '../../components/business/NewstInput';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import FloatingModal from '../../components/common/FloatingModal';

const StallProducts: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const { products, addProduct, updateProduct, deleteProduct, roundCashTo5, setRoundCashTo5, units } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [defaultQty, setDefaultQty] = useState('');
  const [cost, setCost] = useState('');
  const [unit, setUnit] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [modifiers, setModifiers] = useState<{ key: string; label: string; delta: string }[]>([]);
  const [focusedField, setFocusedField] = useState<string | null>(null);
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

  const resetForm = useCallback(() => {
    setName('');
    setPrice('');
    setDefaultQty('');
    setCost('');
    setUnit('');
    setImageUrl(undefined);
    setModifiers([]);
    setEditingId(null);
    setShowDetails(false);
    setShowUnitPicker(false);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    const parsedPrice = parseFloat(price);
    if (!trimmedName || isNaN(parsedPrice) || parsedPrice <= 0) return;

    const parsedDefault = parseInt(defaultQty, 10);
    const defaultStartQty = !isNaN(parsedDefault) && parsedDefault > 0 ? parsedDefault : undefined;
    const parsedCost = parseFloat(cost);
    const unitCost = !isNaN(parsedCost) && parsedCost > 0 ? parsedCost : undefined;
    const unitVal = unit.trim() || undefined;
    const cleanMods = modifiers
      .filter((m) => m.label.trim())
      .map((m) => ({ id: newId(), label: m.label.trim(), priceDelta: parseFloat(m.delta) || 0 }));
    const modsPayload = cleanMods.length ? cleanMods : undefined;

    if (editingId) {
      updateProduct(editingId, { name: trimmedName, price: parsedPrice, defaultStartQty, unitCost, unit: unitVal, imageUrl, modifiers: modsPayload });
    } else {
      addProduct({ name: trimmedName, price: parsedPrice, isActive: true, defaultStartQty, unitCost, unit: unitVal, imageUrl, modifiers: modsPayload });
    }
    resetForm();
  }, [name, price, defaultQty, cost, unit, imageUrl, modifiers, editingId, updateProduct, addProduct, resetForm]);

  const handleEdit = useCallback((id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditingId(id);
    setName(product.name);
    setPrice(product.price.toString());
    setDefaultQty(product.defaultStartQty ? String(product.defaultStartQty) : '');
    setCost(product.unitCost ? String(product.unitCost) : '');
    setUnit(product.unit || '');
    setImageUrl(product.imageUrl);
    setModifiers((product.modifiers || []).map((m) => ({ key: `m${modKeyRef.current++}`, label: m.label, delta: m.priceDelta ? String(m.priceDelta) : '' })));
    setShowForm(true);
  }, [products]);

  const handleToggleActive = useCallback((id: string, currentlyActive: boolean) => {
    updateProduct(id, { isActive: !currentlyActive });
  }, [updateProduct]);

  const handleDelete = useCallback((id: string) => {
    deleteProduct(id);
    setEditingId((prev) => prev === id ? null : prev);
  }, [deleteProduct]);

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
        contentContainerStyle={styles.scrollContent}
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
          visible={showForm}
          onClose={resetForm}
          entrance="fade"
          showDragHandle={false}
          maxWidth={520}
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
                  {/* Manage units in settings — matches seller mode. Closes the sheet
                      and jumps to Settings (stall → "Manage units"). */}
                  <TouchableOpacity
                    style={styles.unitManageBtn}
                    activeOpacity={0.7}
                    onPress={() => { setShowUnitPicker(false); setShowForm(false); navigation.navigate('SettingsDetail', { section: 'money', scrollTo: 'units' }); }}
                    accessibilityRole="button"
                    accessibilityLabel={t.stall.manageUnitsInSettings}
                  >
                    <Feather name="settings" size={14} color={C.bronze} />
                    <Text style={styles.unitManageText}>{t.stall.manageUnitsInSettings}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </Pressable>
            </Pressable>
          ) : null}
        >
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
                onChangeText={setName}
                autoFocus
                accessibilityLabel="Product name"
                style={styles.nameField}
              />
            </View>

            {/* Selling price + your cost — two columns */}
            <View style={styles.twoColRow}>
              <NewstInput
                label={t.stall.priceLabel}
                value={price}
                onChangeText={setPrice}
                prefix={currency}
                keyboardType="decimal-pad"
                accessibilityLabel="Product price"
                style={styles.col}
              />
              <NewstInput
                label={t.stall.costEachLabel}
                value={cost}
                onChangeText={setCost}
                prefix={currency}
                keyboardType="decimal-pad"
                accessibilityLabel="Cost per unit, optional"
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
                label={t.stall.defaultStockLabel}
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
          </KeyboardAwareScrollView>
        </FloatingModal>

        {/* Add button — always visible; opens the product sheet */}
        <NeuButton
          icon="plus"
          label={t.stall.addProduct}
          color={C.bronze}
          onPress={() => {
            setEditingId(null);
            setName('');
            setPrice('');
            setDefaultQty('');
            setCost('');
            setUnit('');
            setImageUrl(undefined);
            setModifiers([]);
            setShowDetails(false);
            setShowForm(true);
          }}
          accessibilityLabel="Add a new product"
          style={{ marginBottom: SPACING['2xl'] }}
        />

        {/* Product list */}
        {products.length > 0 && (
          <View style={styles.listSection}>
            {products.map((product) => (
              <View key={product.id} style={[styles.productRow, !product.isActive && styles.productRowInactive]}>
                <TouchableOpacity
                  style={styles.toggleButton}
                  onPress={() => handleToggleActive(product.id, product.isActive)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: product.isActive }}
                  accessibilityLabel={`${product.name} is ${product.isActive ? 'active' : 'inactive'}`}
                >
                  <Feather
                    name={product.isActive ? 'check-circle' : 'circle'}
                    size={20}
                    color={product.isActive ? C.bronze : C.neutral}
                  />
                </TouchableOpacity>

                {product.imageUrl && (
                  <Image
                    source={{ uri: product.imageUrl }}
                    style={[styles.rowThumb, !product.isActive && { opacity: 0.4 }]}
                    contentFit="cover"
                  />
                )}

                <View style={styles.productInfo}>
                  <Text
                    style={[
                      styles.productName,
                      !product.isActive && styles.productNameInactive,
                    ]}
                  >
                    {product.name}
                  </Text>
                  <Text style={styles.productPrice}>
                    {currency} {product.price.toFixed(2)}
                    {product.unitCost ? ` · ${t.stall.costEach.replace('{currency}', currency).replace('{amount}', product.unitCost.toFixed(2))}` : ''}
                    {product.defaultStartQty ? ` · ${t.stall.bringsStock.replace('{n}', String(product.defaultStartQty))}${product.unit ? ' ' + product.unit : ''}` : ''}
                    {product.totalSold > 0 ? ` · ${t.stall.soldSuffix.replace('{n}', String(product.totalSold))}` : ''}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleEdit(product.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${product.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="edit-2" size={16} color={C.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(product.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${product.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={16} color={C.neutral} />
                </TouchableOpacity>
              </View>
            ))}
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
    gap: 2,
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
