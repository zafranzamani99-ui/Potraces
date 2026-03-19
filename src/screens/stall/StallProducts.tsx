import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

const StallProducts: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { products, addProduct, updateProduct, deleteProduct } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const activeCount = useMemo(() => products.filter((p) => p.isActive).length, [products]);

  const resetForm = useCallback(() => {
    setName('');
    setPrice('');
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    const parsedPrice = parseFloat(price);
    if (!trimmedName || isNaN(parsedPrice) || parsedPrice <= 0) return;

    if (editingId) {
      updateProduct(editingId, { name: trimmedName, price: parsedPrice });
    } else {
      addProduct({ name: trimmedName, price: parsedPrice, isActive: true });
    }
    setName('');
    setPrice('');
    setEditingId(null);
    setShowForm(false);
  }, [name, price, editingId, updateProduct, addProduct]);

  const handleEdit = useCallback((id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditingId(id);
    setName(product.name);
    setPrice(product.price.toString());
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>products</Text>
        <Text style={styles.subheading}>
          things you sell at the stall{products.length > 0 ? ` \u00B7 ${activeCount} active` : ''}
        </Text>

        {/* Add / Edit form */}
        {showForm && (
          <View style={styles.formCard}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. kuih seri muka"
              placeholderTextColor={C.neutral}
              autoFocus
              accessibilityLabel="Product name"
            />
            <View style={styles.priceRow}>
              <Text style={styles.priceCurrency}>{currency}</Text>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor={C.neutral}
                keyboardType="decimal-pad"
                accessibilityLabel="Product price"
              />
            </View>
            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={editingId ? 'Update product' : 'Add product'}
              >
                <Text style={styles.saveButtonText}>
                  {editingId ? 'update' : 'add'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelLink}
                onPress={resetForm}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelLinkText}>cancel</Text>
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
              setShowForm(true);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add a new product"
          >
            <Feather name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.addButtonText}>add product</Text>
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
                    {product.totalSold > 0 ? ` · ${product.totalSold} sold` : ''}
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
              no products yet — add what you sell
            </Text>
          </View>
        )}
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
  },
  heading: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
