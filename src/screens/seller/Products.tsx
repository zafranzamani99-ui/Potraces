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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { SellerProduct, IngredientCost } from '../../types';

const DEFAULT_UNITS = ['tin', 'bekas', 'balang', 'pack', 'piece', 'kotak', 'biji', 'keping'];

// Animated product card wrapper with stagger fade-in
const AnimatedProductCard: React.FC<{ index: number; children: React.ReactNode }> = ({
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
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};

const Products: React.FC = () => {
  const { products, ingredientCosts, addProduct, updateProduct, deleteProduct, addIngredientCost } =
    useSellerStore();
  const customUnits = useSellerStore((s) => s.customUnits);
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const allUnits = useMemo(
    () => [...DEFAULT_UNITS, ...customUnits],
    [customUnits]
  );

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
    ({ item, index }: { item: SellerProduct; index: number }) => {
      const costs = productStats[item.id]?.totalCosts || 0;
      const keptPerUnit = item.costPerUnit
        ? item.pricePerUnit - item.costPerUnit
        : null;

      // Build compact stats string with pipe separators
      const statParts: string[] = [];
      statParts.push(`sold ${item.totalSold} ${item.unit}`);
      if (keptPerUnit !== null) {
        statParts.push(`kept ${currency} ${keptPerUnit.toFixed(2)}/${item.unit}`);
      }
      if (costs > 0) {
        statParts.push(`costs ${currency} ${costs.toFixed(2)}`);
      }

      return (
        <AnimatedProductCard index={index}>
          <View style={[styles.productCard, !item.isActive && styles.productCardInactive]}>
            {/* Top row: icon + info + switch */}
            <View style={styles.productHeader}>
              <View
                style={styles.productIconArea}
                accessibilityLabel={`Product: ${item.name}`}
              >
                <Feather name="package" size={20} color={CALM.bronze} />
              </View>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productPrice}>
                  {currency} {item.pricePerUnit.toFixed(2)} / {item.unit}
                </Text>
              </View>
              <Switch
                value={item.isActive}
                onValueChange={() => handleToggleActive(item)}
                trackColor={{ false: CALM.border, true: CALM.bronze }}
                thumbColor="#fff"
                accessibilityRole="switch"
                accessibilityLabel={`Toggle ${item.name} active`}
              />
            </View>

            {/* Compact stats row with pipe separators */}
            <View style={styles.productStats}>
              <Text style={styles.statText}>
                {statParts.join('  \u00B7  ')}
              </Text>
            </View>

            {/* Actions: "log cost" pill with icon + icon-only "remove" */}
            <View style={styles.productActions}>
              <TouchableOpacity
                style={styles.logCostButton}
                activeOpacity={0.7}
                onPress={() => setShowCostModal(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Log cost for ${item.name}`}
              >
                <Feather name="plus-circle" size={14} color="#fff" />
                <Text style={styles.logCostButtonText}>log cost</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeButton}
                activeOpacity={0.7}
                onPress={() => handleDelete(item)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name}`}
                accessibilityHint="Deletes this product from your list"
              >
                <Feather name="trash-2" size={14} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </AnimatedProductCard>
      );
    },
    [currency, productStats]
  );

  // Product count header rendered above the FlatList items
  const ListHeaderComponent = useMemo(() => (
    <View style={styles.listHeader}>
      <Text style={styles.listHeaderTitle}>products</Text>
      <View style={styles.listHeaderBadge}>
        <Text style={styles.listHeaderBadgeText}>{products.length}</Text>
      </View>
    </View>
  ), [products.length]);

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={products.length > 0 ? ListHeaderComponent : null}
        contentContainerStyle={[
          styles.listContent,
          products.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="package" size={40} color={CALM.border} />
            <Text style={styles.emptyTitle}>no products yet</Text>
            <Text style={styles.emptyHint}>
              follow these steps to get started
            </Text>

            {/* Step-by-step guide */}
            <View style={styles.stepsContainer}>
              <View style={styles.stepRow}>
                <View style={styles.stepIconArea}>
                  <Feather name="package" size={16} color={CALM.bronze} />
                </View>
                <Text style={styles.stepText}>add products you make and sell</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepIconArea}>
                  <Feather name="dollar-sign" size={16} color={CALM.bronze} />
                </View>
                <Text style={styles.stepText}>set your price and cost per unit</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepIconArea}>
                  <Feather name="clipboard" size={16} color={CALM.bronze} />
                </View>
                <Text style={styles.stepText}>start taking orders</Text>
              </View>
            </View>

            {/* Prominent CTA with icon */}
            <TouchableOpacity
              style={styles.emptyCTA}
              activeOpacity={0.7}
              onPress={() => setShowAdd(true)}
              accessibilityRole="button"
              accessibilityLabel="Add your first product"
            >
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.emptyCTAText}>add your first product</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Bottom-anchored add button (only show when products exist) */}
      {products.length > 0 && (
        <View style={styles.addButtonWrapper}>
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.7}
            onPress={() => setShowAdd(true)}
            accessibilityRole="button"
            accessibilityLabel="Add product"
          >
            <Feather name="plus" size={20} color="#fff" />
            <Text style={styles.addButtonText}>add product</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add product modal */}
      <Modal visible={showAdd} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
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
                {allUnits.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitChip, newUnit === u && styles.unitChipActive]}
                    activeOpacity={0.7}
                    onPress={() => setNewUnit(u)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select unit: ${u}`}
                  >
                    <Text style={[styles.unitChipText, newUnit === u && styles.unitChipTextActive]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.customUnitLink}
                onPress={() => {
                  setShowAdd(false);
                  navigation.getParent()?.navigate('Settings');
                }}
                accessibilityRole="link"
                accessibilityLabel="Add custom units in Settings"
              >
                <Text style={styles.customUnitLinkText}>
                  Need a different unit? Add custom units in Settings
                </Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setShowAdd(false)}
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
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
      </Modal>

      {/* Log cost modal */}
      <Modal visible={!!showCostModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
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
                <TouchableOpacity
                  onPress={() => setShowCostModal(null)}
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
                  accessibilityLabel="Log cost"
                >
                  <Text style={styles.modalConfirmText}>log</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAwareScrollView>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background, // #F9F9F7
  },
  listContent: {
    paddingHorizontal: SPACING['2xl'], // 24pt horizontal
    paddingTop: SPACING.lg,           // 16pt top
    paddingBottom: SPACING['3xl'],     // 32pt bottom (room for add button)
    gap: SPACING.md,                   // 16pt card gap
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // -- List header: product count -----------------------------------
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,          // 8pt before first card
  },
  listHeaderTitle: {
    fontSize: TYPOGRAPHY.size.xl,      // 20
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,           // #1A1A1A
  },
  listHeaderBadge: {
    backgroundColor: withAlpha(CALM.bronze, 0.1), // bronze at 10% opacity
    borderRadius: RADIUS.full,         // pill
    paddingHorizontal: SPACING.sm,     // 8pt
    paddingVertical: SPACING.xs,       // 4pt
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeaderBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,      // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.bronze,                // #B2780A
    fontVariant: ['tabular-nums'],
  },

  // -- Product card -------------------------------------------------
  productCard: {
    backgroundColor: CALM.surface,     // #FFFFFF
    borderRadius: RADIUS.lg,           // 14
    borderWidth: 1,
    borderColor: CALM.border,          // #EBEBEB
    padding: SPACING.lg,               // 16pt
    gap: SPACING.md,                   // 16pt between header / stats / actions
  },
  productCardInactive: {
    opacity: 0.5,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                   // 16pt between icon and info
  },
  productIconArea: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(CALM.bronze, 0.08), // bronze at 8% opacity
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
    gap: SPACING.xs,                   // 4pt
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,    // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,           // #1A1A1A
  },
  productPrice: {
    ...TYPE.insight,                   // fontSize 14, lineHeight 22
    color: CALM.textSecondary,         // #6B6B6B
    fontVariant: ['tabular-nums'],
  },

  // -- Compact stats row with pipe separators -----------------------
  productStats: {
    paddingTop: SPACING.xs,            // 4pt
    borderTopWidth: 1,
    borderTopColor: CALM.border,       // #EBEBEB subtle divider
  },
  statText: {
    ...TYPE.muted,                     // fontSize 12, color #A0A0A0
    color: CALM.textSecondary,         // #6B6B6B
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
  },

  // -- Action buttons -----------------------------------------------
  productActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                   // 16pt
  },
  // Primary: bronze pill with icon
  logCostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,                   // 4pt
    backgroundColor: CALM.bronze,      // #B2780A
    paddingVertical: SPACING.sm,       // 8pt
    paddingHorizontal: SPACING.lg,     // 16pt
    borderRadius: RADIUS.full,         // pill
    minHeight: 36,                     // with hitSlop achieves 44pt
  },
  logCostButtonText: {
    fontSize: TYPOGRAPHY.size.xs,      // 11
    fontWeight: TYPOGRAPHY.weight.medium, // 500
    color: '#fff',
  },
  // Destructive: icon-only with generous hit area
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // hitSlop expands to 44pt+ touch target
  },

  // -- Empty state --------------------------------------------------
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],   // 40pt generous vertical padding
    paddingHorizontal: SPACING['2xl'], // 24pt
    gap: SPACING.md,                   // 16pt
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,      // 17
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,           // #1A1A1A
  },
  emptyHint: {
    ...TYPE.insight,                   // fontSize 14, lineHeight 22
    color: CALM.textSecondary,         // #6B6B6B
    textAlign: 'center',
  },
  // Step-by-step guide
  stepsContainer: {
    alignSelf: 'stretch',
    backgroundColor: CALM.surface,     // #FFFFFF
    borderRadius: RADIUS.lg,           // 14
    borderWidth: 1,
    borderColor: CALM.border,          // #EBEBEB
    padding: SPACING.lg,              // 16pt
    gap: SPACING.md,                   // 16pt between steps
    marginTop: SPACING.sm,            // 8pt above
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                   // 16pt between icon and text
  },
  stepIconArea: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(CALM.bronze, 0.08), // bronze at 8% opacity
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    ...TYPE.insight,                   // fontSize 14, lineHeight 22
    color: CALM.textPrimary,           // #1A1A1A
    flex: 1,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,                   // 8pt between icon and text
    backgroundColor: CALM.bronze,      // #B2780A
    borderRadius: RADIUS.lg,           // 14
    paddingVertical: SPACING.lg,       // 16pt
    alignSelf: 'stretch',
    marginTop: SPACING.sm,             // 8pt above
  },
  emptyCTAText: {
    fontSize: TYPOGRAPHY.size.base,    // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },

  // -- Bottom-anchored add button -----------------------------------
  addButtonWrapper: {
    paddingHorizontal: SPACING.lg,     // 16pt sides
    paddingBottom: SPACING.lg,         // 16pt bottom
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,                   // 8pt
    backgroundColor: CALM.bronze,      // #B2780A
    borderRadius: RADIUS.lg,           // 14
    paddingVertical: SPACING.lg,       // 16pt
    ...SHADOWS.sm,                     // subtle elevation
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,    // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },

  // -- Unit picker chips --------------------------------------------
  unitPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,                   // 8pt
  },
  unitChip: {
    minHeight: 44,                     // 44pt touch target
    paddingVertical: SPACING.sm,       // 8pt
    paddingHorizontal: SPACING.lg,     // 16pt
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,          // #EBEBEB
    justifyContent: 'center',
    alignItems: 'center',
  },
  unitChipActive: {
    backgroundColor: CALM.bronze,      // #B2780A
    borderColor: CALM.bronze,
  },
  unitChipText: {
    fontSize: TYPOGRAPHY.size.sm,      // 13
    color: CALM.textSecondary,         // #6B6B6B
  },
  unitChipTextActive: {
    color: '#fff',
    fontWeight: TYPOGRAPHY.weight.medium, // 500
  },

  // -- Custom unit link -----------------------------------------------
  customUnitLink: {
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  customUnitLinkText: {
    fontSize: TYPOGRAPHY.size.xs,       // 11
    color: CALM.bronze,                 // #B2780A
  },

  // -- Modal --------------------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],           // 24pt
  },
  modalContent: {
    backgroundColor: CALM.surface,     // #FFFFFF
    borderRadius: RADIUS.lg,           // 14
    padding: SPACING.xl,               // 24pt
    width: '100%',
    gap: SPACING.md,                   // 16pt
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,      // 17
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,           // #1A1A1A
  },
  modalLabel: {
    ...TYPE.label,                     // fontSize 12, uppercase, letterSpacing 1
    marginBottom: SPACING.xs,          // 4pt
  },
  modalInput: {
    ...TYPE.insight,                   // fontSize 14, lineHeight 22
    color: CALM.textPrimary,           // #1A1A1A
    backgroundColor: CALM.background,  // #F9F9F7
    borderRadius: RADIUS.md,           // 10
    padding: SPACING.md,               // 16pt
    borderWidth: 1,
    borderColor: CALM.border,          // #EBEBEB
  },
  modalRow: {
    flexDirection: 'row',
    gap: SPACING.md,                   // 16pt
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,                   // 16pt
    marginTop: SPACING.sm,            // 8pt
  },
  modalCancel: {
    paddingVertical: SPACING.sm,       // 8pt
    paddingHorizontal: SPACING.lg,     // 16pt
    minHeight: 44,
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,      // 13
    color: CALM.textSecondary,         // #6B6B6B
  },
  modalConfirm: {
    paddingVertical: SPACING.sm,       // 8pt
    paddingHorizontal: SPACING.lg,     // 16pt
    backgroundColor: CALM.bronze,      // #B2780A
    borderRadius: RADIUS.md,           // 10
    minHeight: 44,
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,      // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },
});

export default Products;
