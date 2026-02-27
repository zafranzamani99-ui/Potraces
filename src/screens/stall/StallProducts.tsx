import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';

const StallProducts: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const resetForm = () => {
    setName('');
    setPrice('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const parsedPrice = parseFloat(price);
    if (!trimmedName || isNaN(parsedPrice) || parsedPrice <= 0) return;

    if (editingId) {
      updateProduct(editingId, { name: trimmedName, price: parsedPrice });
    } else {
      addProduct({ name: trimmedName, price: parsedPrice, isActive: true });
    }
    resetForm();
  };

  const handleEdit = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditingId(id);
    setName(product.name);
    setPrice(product.price.toString());
    setShowForm(true);
  };

  const handleToggleActive = (id: string, currentlyActive: boolean) => {
    updateProduct(id, { isActive: !currentlyActive });
  };

  const handleDelete = (id: string) => {
    deleteProduct(id);
    if (editingId === id) resetForm();
  };

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
          things you sell at the stall
        </Text>

        {/* Add / Edit form */}
        {showForm && (
          <View style={styles.formCard}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. kuih seri muka"
              placeholderTextColor={CALM.neutral}
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
                placeholderTextColor={CALM.neutral}
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
            <Feather name="plus" size={18} color={CALM.accent} />
            <Text style={styles.addButtonText}>add product</Text>
          </TouchableOpacity>
        )}

        {/* Product list */}
        {products.length > 0 && (
          <View style={styles.listSection}>
            {products.map((product) => (
              <View key={product.id} style={styles.productRow}>
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
                    color={product.isActive ? CALM.accent : CALM.neutral}
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
                  <Feather name="edit-2" size={16} color={CALM.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(product.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${product.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={16} color={CALM.neutral} />
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
    paddingBottom: SPACING['4xl'],
  },
  heading: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  subheading: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    marginBottom: SPACING['3xl'],
  },

  // ─── Form ──────────────────────────────────────────────────
  formCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  input: {
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
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
    backgroundColor: CALM.accent,
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
    color: CALM.textSecondary,
  },

  // ─── Add button ────────────────────────────────────────────
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    minHeight: 48,
    marginBottom: SPACING['2xl'],
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
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
    borderBottomColor: CALM.border,
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
    color: CALM.textPrimary,
  },
  productNameInactive: {
    color: CALM.neutral,
  },
  productPrice: {
    ...TYPE.muted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
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
    color: CALM.textSecondary,
  },
});

export default StallProducts;
