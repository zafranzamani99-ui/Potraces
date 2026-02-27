import React, { useState, useMemo, useCallback } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { SellerProduct, IngredientCost } from '../../types';

const UNIT_OPTIONS = ['tin', 'bekas', 'balang', 'pack', 'piece', 'kotak', 'biji', 'keping'];

const Products: React.FC = () => {
  const { products, ingredientCosts, addProduct, updateProduct, deleteProduct, addIngredientCost } =
    useSellerStore();
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const currency = useSettingsStore((s) => s.currency);

  const [showAdd, setShowAdd] = useState(false);
  const [showCostModal, setShowCostModal] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newUnit, setNewUnit] = useState('tin');
  const [newCostPerUnit, setNewCostPerUnit] = useState('');
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');

  const handleAddProduct = () => {
    if (!newName.trim() || !newPrice.trim()) return;
    addProduct({
      name: newName.trim(),
      pricePerUnit: parseFloat(newPrice) || 0,
      costPerUnit: newCostPerUnit ? parseFloat(newCostPerUnit) : undefined,
      unit: newUnit,
      isActive: true,
    });
    setNewName('');
    setNewPrice('');
    setNewCostPerUnit('');
    setNewUnit('tin');
    setShowAdd(false);
  };

  const handleAddCost = () => {
    if (!costDescription.trim() || !costAmount.trim() || !showCostModal) return;
    addIngredientCost({
      productId: showCostModal,
      description: costDescription.trim(),
      amount: parseFloat(costAmount) || 0,
      date: new Date(),
      seasonId: activeSeason?.id,
    });
    setCostDescription('');
    setCostAmount('');
    setShowCostModal(null);
  };

  const handleToggleActive = (product: SellerProduct) => {
    updateProduct(product.id, { isActive: !product.isActive });
  };

  const handleDelete = (product: SellerProduct) => {
    Alert.alert(
      'Remove product?',
      `Remove ${product.name}? Orders that already have this product won't be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteProduct(product.id) },
      ]
    );
  };

  // Calculate "kept per unit" for each product
  const productStats = useMemo(() => {
    const stats: Record<string, { totalCosts: number }> = {};
    for (const cost of ingredientCosts) {
      if (cost.productId) {
        if (!stats[cost.productId]) stats[cost.productId] = { totalCosts: 0 };
        stats[cost.productId].totalCosts += cost.amount;
      }
    }
    return stats;
  }, [ingredientCosts]);

  const renderProduct = useCallback(
    ({ item }: { item: SellerProduct }) => {
      const costs = productStats[item.id]?.totalCosts || 0;
      const keptPerUnit = item.costPerUnit
        ? item.pricePerUnit - item.costPerUnit
        : null;

      return (
        <View style={[styles.productCard, !item.isActive && styles.productCardInactive]}>
          <View style={styles.productHeader}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productPrice}>
                {currency} {item.pricePerUnit.toFixed(2)} / {item.unit}
              </Text>
            </View>
            <Switch
              value={item.isActive}
              onValueChange={() => handleToggleActive(item)}
              trackColor={{ false: CALM.border, true: CALM.accent }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.productStats}>
            <Text style={styles.statText}>sold: {item.totalSold} {item.unit}</Text>
            {keptPerUnit !== null && (
              <Text style={styles.statText}>
                kept per {item.unit}: {currency} {keptPerUnit.toFixed(2)}
              </Text>
            )}
            {costs > 0 && (
              <Text style={styles.statText}>
                ingredient costs logged: {currency} {costs.toFixed(2)}
              </Text>
            )}
          </View>

          <View style={styles.productActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowCostModal(item.id)}
            >
              <Feather name="plus" size={14} color={CALM.accent} />
              <Text style={styles.actionButtonText}>log cost</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDelete(item)}
            >
              <Feather name="trash-2" size={14} color={CALM.neutral} />
              <Text style={[styles.actionButtonText, { color: CALM.neutral }]}>remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [currency, productStats]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="package" size={32} color={CALM.border} />
            <Text style={styles.emptyText}>add your products here.</Text>
            <Text style={styles.emptyHint}>these are the things you make and sell.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={styles.addButtonText}>add product</Text>
      </TouchableOpacity>

      {/* Add product modal */}
      <Modal visible={showAdd} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>new product</Text>

            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. semperit kuning"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
            />

            <View style={styles.modalRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>price per unit</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newPrice}
                  onChangeText={setNewPrice}
                  placeholder="0.00"
                  placeholderTextColor={CALM.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>cost per unit (optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newCostPerUnit}
                  onChangeText={setNewCostPerUnit}
                  placeholder="0.00"
                  placeholderTextColor={CALM.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <Text style={styles.modalLabel}>unit</Text>
            <View style={styles.unitPicker}>
              {UNIT_OPTIONS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitChip, newUnit === u && styles.unitChipActive]}
                  onPress={() => setNewUnit(u)}
                >
                  <Text style={[styles.unitChipText, newUnit === u && styles.unitChipTextActive]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddProduct} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Log cost modal */}
      <Modal visible={!!showCostModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>log ingredient cost</Text>
            <TextInput
              style={styles.modalInput}
              value={costDescription}
              onChangeText={setCostDescription}
              placeholder="e.g. tepung, gula, mentega"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              value={costAmount}
              onChangeText={setCostAmount}
              placeholder="amount (RM)"
              placeholderTextColor={CALM.textSecondary}
              keyboardType="decimal-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowCostModal(null)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddCost} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  productCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  productCardInactive: {
    opacity: 0.5,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
    gap: 2,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  productPrice: {
    ...TYPE.insight,
    color: CALM.textSecondary,
  },
  productStats: {
    gap: 2,
  },
  statText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  productActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  actionButtonText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.accent,
  },
  emptyState: {
    alignItems: 'center',
    padding: SPACING['3xl'],
    gap: SPACING.md,
  },
  emptyText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
  },
  emptyHint: {
    ...TYPE.muted,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    margin: SPACING.lg,
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    gap: SPACING.md,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  modalLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  modalInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  modalRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  unitPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  unitChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  unitChipActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  unitChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  unitChipTextActive: {
    color: '#fff',
    fontWeight: TYPOGRAPHY.weight.medium,
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
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  modalConfirm: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.md,
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});

export default Products;
