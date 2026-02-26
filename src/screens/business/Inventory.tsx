import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  Modal,
  TouchableOpacity,
  Keyboard,
  ListRenderItemInfo,
  Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, PRODUCT_CATEGORIES, withAlpha } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import FAB from '../../components/common/FAB';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import CategoryPicker from '../../components/common/CategoryPicker';
import { useToast } from '../../context/ToastContext';

const Inventory: React.FC = () => {
  const { showToast } = useToast();
  const { products, addProduct, updateProduct, deleteProduct } = useBusinessStore();
  const currency = useSettingsStore(state => state.currency);
  const [modalVisible, setModalVisible] = useState(false);
  const [stockModalVisible, setStockModalVisible] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [stockQuantity, setStockQuantity] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [category, setCategory] = useState(PRODUCT_CATEGORIES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const availableCategories = useMemo(() => {
    const usedIds = new Set(products.map((p) => p.category));
    return PRODUCT_CATEGORIES.filter((c) => usedIds.has(c.id));
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategory) {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, selectedCategory, searchQuery]);

  const handleAdd = () => {
    if (!name.trim()) {
      showToast('Please enter product name', 'error');
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      showToast('Please enter a valid selling price', 'error');
      return;
    }

    if (cost && parseFloat(cost) < 0) {
      showToast('Cost cannot be negative', 'error');
      return;
    }

    if (!stock || parseInt(stock) < 0) {
      showToast('Please enter a valid stock quantity', 'error');
      return;
    }

    const productData = {
      name: name.trim(),
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : 0,
      stock: parseInt(stock),
      lowStockThreshold: parseInt(lowStockThreshold) || 10,
      category,
    };

    if (editingId) {
      updateProduct(editingId, productData);
      showToast('Product updated successfully!', 'success');
    } else {
      addProduct(productData);
      showToast('Product added successfully!', 'success');
    }

    setModalVisible(false);
    resetForm();
  };

  const handleEdit = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setEditingId(productId);
    setName(product.name);
    setPrice(product.price.toString());
    setCost(product.cost.toString());
    setStock(product.stock.toString());
    setLowStockThreshold(product.lowStockThreshold.toString());
    setCategory(product.category);
    setModalVisible(true);
  };

  const handleAddStock = (productId: string) => {
    setSelectedProductId(productId);
    setStockQuantity('');
    setStockModalVisible(true);
  };

  const handleDelete = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteProduct(productId);
            showToast(`${product.name} deleted`, 'success');
          },
        },
      ]
    );
  };

  const confirmAddStock = () => {
    const quantity = parseInt(stockQuantity || '0');
    if (quantity <= 0) {
      showToast('Please enter a valid quantity', 'error');
      return;
    }

    if (selectedProductId) {
      const product = products.find((p) => p.id === selectedProductId);
      if (product) {
        updateProduct(selectedProductId, { stock: product.stock + quantity });
        showToast(`Added ${quantity} units to ${product.name}`, 'success');
      }
    }

    setStockModalVisible(false);
    setStockQuantity('');
    setSelectedProductId(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPrice('');
    setCost('');
    setStock('');
    setLowStockThreshold('10');
    setCategory(PRODUCT_CATEGORIES[0].id);
  };

  const lowStockProducts = products.filter(
    (p) => p.stock > 0 && p.stock <= p.lowStockThreshold
  );
  const outOfStockProducts = products.filter((p) => p.stock === 0);

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
          <Card style={styles.alertCard}>
            {outOfStockProducts.length > 0 && (
              <View style={styles.alertRow}>
                <Feather name="alert-circle" size={20} color={COLORS.danger} />
                <Text style={[styles.alertText, { color: COLORS.danger }]}>
                  {outOfStockProducts.length} {outOfStockProducts.length === 1 ? 'product' : 'products'} out of stock
                </Text>
              </View>
            )}
            {lowStockProducts.length > 0 && (
              <View style={styles.alertRow}>
                <Feather name="alert-triangle" size={20} color={COLORS.warning} />
                <Text style={[styles.alertText, { color: COLORS.warning }]}>
                  {lowStockProducts.length} {lowStockProducts.length === 1 ? 'product' : 'products'} running low
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* Category filter tabs */}
        {availableCategories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryTabs}
            style={styles.categoryTabsContainer}
          >
            <TouchableOpacity
              style={[styles.categoryTab, selectedCategory === null && styles.categoryTabActive]}
              onPress={() => setSelectedCategory(null)}
            >
              <Feather
                name="grid"
                size={14}
                color={selectedCategory === null ? '#fff' : COLORS.textSecondary}
              />
              <Text
                style={[styles.categoryTabText, selectedCategory === null && styles.categoryTabTextActive]}
              >
                All
              </Text>
            </TouchableOpacity>
            {availableCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryTab, selectedCategory === cat.id && styles.categoryTabActive]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Feather
                  name={cat.icon as keyof typeof Feather.glyphMap}
                  size={14}
                  color={selectedCategory === cat.id ? '#fff' : COLORS.textSecondary}
                />
                <Text
                  style={[styles.categoryTabText, selectedCategory === cat.id && styles.categoryTabTextActive]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Search bar */}
        {products.length > 0 && (
          <View style={styles.searchContainer}>
            <Feather name="search" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search products..."
              placeholderTextColor={COLORS.textSecondary}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {filteredProducts.length > 0 ? (
          filteredProducts.map((product) => {
            const cat = PRODUCT_CATEGORIES.find((c) => c.id === product.category);
            const isLowStock = product.stock > 0 && product.stock <= product.lowStockThreshold;
            const isOutOfStock = product.stock === 0;
            const margin = product.price - product.cost;
            const marginPercent = (margin / product.price) * 100;

            return (
              <Card key={product.id} style={styles.productCard}>
                <View style={styles.productHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: cat?.color ? withAlpha(cat.color, 0.12) : COLORS.surface }]}>
                    <Feather name={(cat?.icon as keyof typeof Feather.glyphMap) || 'package'} size={20} color={cat?.color} />
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productCategory}>{cat?.name || product.category}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEdit(product.id)}
                  >
                    <Feather name="edit-2" size={18} color={COLORS.business} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleDelete(product.id)}
                  >
                    <Feather name="trash-2" size={18} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>

                <View style={styles.divider} />

                <View style={styles.productDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Selling Price</Text>
                    <Text style={styles.detailValue}>{currency} {product.price.toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cost</Text>
                    <Text style={styles.detailValue}>{currency} {product.cost.toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Margin</Text>
                    <Text
                      style={[
                        styles.detailValue,
                        { color: margin > 0 ? COLORS.success : COLORS.expense },
                      ]}
                    >
                      {currency} {margin.toFixed(2)} ({marginPercent.toFixed(0)}%)
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.stockSection}>
                  <View>
                    <Text style={styles.stockLabel}>Stock Level</Text>
                    <Text
                      style={[
                        styles.stockValue,
                        isOutOfStock && { color: COLORS.danger },
                        isLowStock && { color: COLORS.warning },
                      ]}
                    >
                      {product.stock} units
                    </Text>
                    {isLowStock && !isOutOfStock && (
                      <Text style={styles.stockWarning}>Low stock!</Text>
                    )}
                    {isOutOfStock && (
                      <Text style={styles.stockOutOfStock}>Out of stock!</Text>
                    )}
                  </View>
                  <Button
                    title="Add Stock"
                    onPress={() => handleAddStock(product.id)}
                    icon="plus"
                    size="small"
                    variant="success"
                  />
                </View>
              </Card>
            );
          })
        ) : products.length > 0 ? (
          <View style={styles.noResults}>
            <Feather name="search" size={40} color={COLORS.textSecondary} />
            <Text style={styles.noResultsTitle}>No results found</Text>
            <Text style={styles.noResultsText}>
              Try a different search term or category
            </Text>
          </View>
        ) : (
          <EmptyState
            icon="package"
            title="No Products"
            message="Add products to your inventory to start tracking stock and making sales"
            actionLabel="Add Product"
            onAction={() => setModalVisible(true)}
          />
        )}
      </ScrollView>

      <FAB
        onPress={() => {
          resetForm();
          setModalVisible(true);
        }}
        icon="plus"
        color={COLORS.success}
        style={{ right: undefined, left: SPACING['2xl'] }}
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Product' : 'Add Product'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
              >
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>
                Product Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Coca Cola 500ml"
                placeholderTextColor={COLORS.textSecondary}
                returnKeyType="next"
              />

              <CategoryPicker
                categories={PRODUCT_CATEGORIES}
                selectedId={category}
                onSelect={setCategory}
                label="Category"
                layout="dropdown"
              />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Selling Price <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={price}
                    onChangeText={setPrice}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={COLORS.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
                <View style={{ width: SPACING.lg }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Cost</Text>
                  <TextInput
                    style={styles.input}
                    value={cost}
                    onChangeText={setCost}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={COLORS.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Initial Stock <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={stock}
                    onChangeText={setStock}
                    placeholder="0"
                    keyboardType="number-pad"
                    placeholderTextColor={COLORS.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
                <View style={{ width: SPACING.lg }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Low Stock Alert</Text>
                  <TextInput
                    style={styles.input}
                    value={lowStockThreshold}
                    onChangeText={setLowStockThreshold}
                    placeholder="10"
                    keyboardType="number-pad"
                    placeholderTextColor={COLORS.textSecondary}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
              </View>

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                  variant="secondary"
                  style={{ flex: 1 }}
                />
                <Button
                  title={editingId ? 'Update' : 'Add'}
                  onPress={handleAdd}
                  icon="check"
                  style={{ flex: 1 }}
                />
              </View>
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={stockModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setStockModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 300 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Stock</Text>
              <TouchableOpacity onPress={() => setStockModalVisible(false)}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>
              Quantity to Add <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={stockQuantity}
              onChangeText={setStockQuantity}
              placeholder="Enter quantity"
              keyboardType="number-pad"
              placeholderTextColor={COLORS.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                onPress={() => setStockModalVisible(false)}
                variant="secondary"
                style={{ flex: 1 }}
              />
              <Button
                title="Add Stock"
                onPress={confirmAddStock}
                icon="plus"
                variant="success"
                style={{ flex: 1 }}
              />
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
    backgroundColor: COLORS.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 80,
  },

  // Category tabs
  categoryTabsContainer: {
    maxHeight: 44,
    marginBottom: SPACING.md,
  },
  categoryTabs: {
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryTabActive: {
    backgroundColor: COLORS.business,
    borderColor: COLORS.business,
  },
  categoryTabText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.textSecondary,
  },
  categoryTabTextActive: {
    color: '#fff',
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },

  // Alerts
  alertCard: {
    backgroundColor: withAlpha(COLORS.warning, 0.06),
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  alertText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Product cards
  productCard: {
    marginBottom: SPACING.md,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  productCategory: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
  },
  editButton: {
    padding: SPACING.sm,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  productDetails: {
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },

  // Stock
  stockSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  stockValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
  },
  stockWarning: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.warning,
    marginTop: 2,
  },
  stockOutOfStock: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.danger,
    fontWeight: TYPOGRAPHY.weight.semibold,
    marginTop: 2,
  },

  // No results
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['5xl'],
    gap: SPACING.sm,
  },
  noResultsTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING['2xl'],
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING['2xl'],
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
  },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  required: {
    color: COLORS.danger,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },
  row: {
    flexDirection: 'row',
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },
});

export default Inventory;
