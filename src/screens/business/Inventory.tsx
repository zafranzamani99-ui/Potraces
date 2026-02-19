import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ListRenderItemInfo,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, PRODUCT_CATEGORIES, withAlpha } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import CategoryPicker from '../../components/common/CategoryPicker';
import { useToast } from '../../context/ToastContext';

const Inventory: React.FC = () => {
  const { showToast } = useToast();
  const { products, addProduct, updateProduct } = useBusinessStore();
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

  const handleAdd = () => {
    if (!name.trim()) {
      showToast('Please enter product name', 'error');
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      showToast('Please enter a valid selling price', 'error');
      return;
    }

    if (!cost || parseFloat(cost) < 0) {
      showToast('Please enter a valid cost', 'error');
      return;
    }

    if (!stock || parseInt(stock) < 0) {
      showToast('Please enter a valid stock quantity', 'error');
      return;
    }

    const productData = {
      name: name.trim(),
      price: parseFloat(price),
      cost: parseFloat(cost),
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

        {products.length > 0 ? (
          products.map((product) => {
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

      <Button
        title="Add Product"
        onPress={() => {
          resetForm();
          setModalVisible(true);
        }}
        icon="plus"
        size="large"
        style={styles.addButton}
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
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

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
                <View style={{ width: 16 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Cost <Text style={styles.required}>*</Text>
                  </Text>
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
                <View style={{ width: 16 }} />
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
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={stockModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setStockModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
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
        </KeyboardAvoidingView>
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
    padding: 16,
    paddingBottom: 80,
  },
  alertCard: {
    backgroundColor: withAlpha(COLORS.warning, 0.06),
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    marginBottom: 12,
    gap: 8,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertText: {
    fontSize: 14,
    fontWeight: '600',
  },
  productCard: {
    marginBottom: 12,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  productCategory: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  editButton: {
    padding: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  productDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  stockSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  stockValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  stockWarning: {
    fontSize: 12,
    color: COLORS.warning,
    marginTop: 2,
  },
  stockOutOfStock: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '600',
    marginTop: 2,
  },
  addButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 16,
  },
  required: {
    color: COLORS.danger,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  row: {
    flexDirection: 'row',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
});

export default Inventory;
