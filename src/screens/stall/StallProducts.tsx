import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { newId } from '../../utils/id';

const StallProducts: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { products, addProduct, updateProduct, deleteProduct, roundCashTo5, setRoundCashTo5 } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [defaultQty, setDefaultQty] = useState('');
  const [cost, setCost] = useState('');
  const [modifiers, setModifiers] = useState<{ key: string; label: string; delta: string }[]>([]);
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

  const activeCount = useMemo(() => products.filter((p) => p.isActive).length, [products]);

  const resetForm = useCallback(() => {
    setName('');
    setPrice('');
    setDefaultQty('');
    setCost('');
    setModifiers([]);
    setEditingId(null);
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
    const cleanMods = modifiers
      .filter((m) => m.label.trim())
      .map((m) => ({ id: newId(), label: m.label.trim(), priceDelta: parseFloat(m.delta) || 0 }));
    const modsPayload = cleanMods.length ? cleanMods : undefined;

    if (editingId) {
      updateProduct(editingId, { name: trimmedName, price: parsedPrice, defaultStartQty, unitCost, modifiers: modsPayload });
    } else {
      addProduct({ name: trimmedName, price: parsedPrice, isActive: true, defaultStartQty, unitCost, modifiers: modsPayload });
    }
    resetForm();
  }, [name, price, defaultQty, cost, modifiers, editingId, updateProduct, addProduct, resetForm]);

  const handleEdit = useCallback((id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditingId(id);
    setName(product.name);
    setPrice(product.price.toString());
    setDefaultQty(product.defaultStartQty ? String(product.defaultStartQty) : '');
    setCost(product.unitCost ? String(product.unitCost) : '');
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
        <Text style={styles.heading}>{t.stall.productsHeading}</Text>
        <Text style={styles.subheading}>
          {t.stall.productsSub}{products.length > 0 ? ` \u00B7 ${t.stall.activeSuffix.replace('{n}', String(activeCount))}` : ''}
        </Text>

        {/* Add / Edit form */}
        {showForm && (
          <View style={styles.formCard}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t.stall.namePlaceholder}
              placeholderTextColor={C.neutral}
              autoFocus
              accessibilityLabel="Product name"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
            />
            <View style={styles.priceRow}>
              <Text style={styles.priceCurrency}>{currency}</Text>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={price}
                onChangeText={setPrice}
                placeholder={t.stall.pricePlaceholder}
                placeholderTextColor={C.neutral}
                keyboardType="decimal-pad"
                accessibilityLabel="Product price"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />
            </View>

            {/* Optional default starting stock */}
            <Text style={styles.fieldLabel}>{t.stall.defaultStockLabel}</Text>
            <View style={styles.priceRow}>
              <Feather name="package" size={18} color={C.textSecondary} />
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={defaultQty}
                onChangeText={(v) => setDefaultQty(v.replace(/[^0-9]/g, ''))}
                placeholder={t.stall.defaultStockPlaceholder}
                placeholderTextColor={C.neutral}
                keyboardType="number-pad"
                accessibilityLabel="Default starting stock, optional"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />
            </View>

            {/* Optional unit cost — feeds the optional "kept" number */}
            <Text style={styles.fieldLabel}>{t.stall.costEachLabel}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceCurrency}>{currency}</Text>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={cost}
                onChangeText={setCost}
                placeholder={t.stall.costEachPlaceholder}
                placeholderTextColor={C.neutral}
                keyboardType="decimal-pad"
                accessibilityLabel="Cost per unit, optional"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />
            </View>

            {/* Optional quick options (modifiers) */}
            <Text style={styles.fieldLabel}>{t.stall.modifiersLabel}</Text>
            <Text style={styles.modHint}>{t.stall.modifiersHint}</Text>
            {modifiers.map((m) => (
              <View key={m.key} style={styles.modRow}>
                <TextInput
                  style={styles.modName}
                  value={m.label}
                  onChangeText={(v) => updateModifierRow(m.key, { label: v })}
                  placeholder={t.stall.modifierNamePlaceholder}
                  placeholderTextColor={C.neutral}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
                <View style={styles.modDeltaWrap}>
                  <Text style={styles.priceCurrency}>{currency}</Text>
                  <TextInput
                    style={styles.modDelta}
                    value={m.delta}
                    onChangeText={(v) => updateModifierRow(m.key, { delta: v.replace(/[^0-9.-]/g, '') })}
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

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={editingId ? 'Update product' : 'Add product'}
              >
                <Text style={styles.saveButtonText}>
                  {editingId ? t.stall.update : t.stall.addAction}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelLink}
                onPress={resetForm}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelLinkText}>{t.stall.cancel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Add button */}
        {!showForm && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setEditingId(null);
              setName('');
              setPrice('');
              setDefaultQty('');
              setCost('');
              setModifiers([]);
              setShowForm(true);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add a new product"
          >
            <Feather name="plus" size={18} color={C.onAccent} />
            <Text style={styles.addButtonText}>{t.stall.addProduct}</Text>
          </TouchableOpacity>
        )}

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
                    {product.defaultStartQty ? ` · ${t.stall.bringsStock.replace('{n}', String(product.defaultStartQty))}` : ''}
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
        {products.length === 0 && !showForm && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {t.stall.productsEmpty}
            </Text>
          </View>
        )}

        {/* Stall setting: 5-sen cash rounding */}
        <TouchableOpacity
          style={styles.settingRow}
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
  heading: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
    marginBottom: SPACING.xs,
  },
  subheading: {
    ...TYPE.muted,
    color: C.textSecondary,
    marginBottom: SPACING['3xl'],
  },

  // ─── Form ──────────────────────────────────────────────────
  formCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  input: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    marginBottom: SPACING.md,
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
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  priceCurrency: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  priceInput: {
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.md,
  },
  saveButton: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING['2xl'],
    minHeight: 44,
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  cancelLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  cancelLinkText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },

  // ─── Add button ────────────────────────────────────────────
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    minHeight: 48,
    marginBottom: SPACING['2xl'],
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
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
  },
  emptyText: {
    ...TYPE.insight,
    color: C.textSecondary,
  },
});

export default StallProducts;
