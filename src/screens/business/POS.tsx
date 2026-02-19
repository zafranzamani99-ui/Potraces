import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, PAYMENT_METHODS, withAlpha } from '../../constants';
import GRADIENTS from '../../constants/gradients';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import GradientButton from '../../components/common/GradientButton';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import Confetti from '../../components/common/Confetti';
import { SaleItem } from '../../types';
import { useToast } from '../../context/ToastContext';
import { successNotification } from '../../services/haptics';

const POS: React.FC = () => {
  const { showToast } = useToast();
  const { products, addSale } = useBusinessStore();
  const currency = useSettingsStore(state => state.currency);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToCart = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    if (product.stock <= 0) {
      showToast(`${product.name} is currently out of stock`, 'error');
      return;
    }

    const existingItem = cart.find((item) => item.productId === productId);
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        showToast(`Only ${product.stock} units available`, 'error');
        return;
      }
      setCart(
        cart.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId,
          productName: product.name,
          quantity: 1,
          unitPrice: product.price,
          totalPrice: product.price,
        },
      ]);
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    if (quantity > product.stock) {
      showToast(`Only ${product.stock} units available`, 'error');
      return;
    }

    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart(
      cart.map((item) =>
        item.productId === productId
          ? { ...item, quantity, totalPrice: quantity * item.unitPrice }
          : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.productId !== productId));
  };

  const getTotalAmount = () => {
    return cart.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const handleCheckout = (paymentMethod: 'cash' | 'digital' | 'card') => {
    if (cart.length === 0) {
      showToast('Please add items to cart before checkout', 'error');
      return;
    }

    addSale({
      items: cart,
      totalAmount: getTotalAmount(),
      paymentMethod,
      date: new Date(),
    });

    setCart([]);
    setPaymentModalVisible(false);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 100);
    successNotification();
    showToast('Sale completed successfully!', 'success');
  };

  if (products.length === 0) {
    return (
      <View style={styles.container}>
        <ModeToggle />
        <EmptyState
          icon="package"
          title="No Products"
          message="Add products to your inventory to start making sales"
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ModeToggle />
      <Confetti active={showConfetti} />
      <View style={styles.content}>
        <View style={styles.productsSection}>
          <View style={styles.searchContainer}>
            <Feather name="search" size={20} color={COLORS.textSecondary} />
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
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={styles.productsScroll}
            contentContainerStyle={styles.productsGrid}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {filteredProducts.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={[
                  styles.productButton,
                  product.stock <= 0 && styles.productOutOfStock,
                ]}
                onPress={() => addToCart(product.id)}
                activeOpacity={0.7}
                disabled={product.stock <= 0}
              >
                <LinearGradient
                  colors={[withAlpha(COLORS.business, 0.08), 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.productGradient}
                >
                  <Text style={styles.productName} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={styles.productPrice}>{currency} {product.price.toFixed(2)}</Text>
                  <View style={styles.productStock}>
                    <Feather
                      name="package"
                      size={12}
                      color={product.stock <= product.lowStockThreshold ? COLORS.warning : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.productStockText,
                        product.stock <= product.lowStockThreshold && styles.productStockLow,
                      ]}
                    >
                      {product.stock}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.cartSection}>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>Cart ({cart.length})</Text>
            {cart.length > 0 && (
              <TouchableOpacity onPress={() => setCart([])}>
                <Text style={styles.clearCart}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={styles.cartScroll}
            contentContainerStyle={styles.cartContent}
            showsVerticalScrollIndicator={false}
          >
            {cart.length > 0 ? (
              cart.map((item) => (
                <View key={item.productId} style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.productName}</Text>
                    <Text style={styles.cartItemPrice}>{currency} {item.unitPrice.toFixed(2)} each</Text>
                  </View>

                  <View style={styles.quantityControls}>
                    <TouchableOpacity
                      style={styles.quantityButton}
                      onPress={() => updateQuantity(item.productId, item.quantity - 1)}
                    >
                      <Feather name="minus" size={16} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.quantityText}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={styles.quantityButton}
                      onPress={() => updateQuantity(item.productId, item.quantity + 1)}
                    >
                      <Feather name="plus" size={16} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.cartItemTotal}>
                    <Text style={styles.cartItemTotalText}>{currency} {item.totalPrice.toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => removeFromCart(item.productId)}>
                      <Feather name="trash-2" size={16} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyCart}>
                <Feather name="shopping-cart" size={48} color={COLORS.textSecondary} />
                <Text style={styles.emptyCartText}>Cart is empty</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.cartFooter}>
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>{currency} {getTotalAmount().toFixed(2)}</Text>
            </View>
            <GradientButton
              title="Checkout"
              onPress={() => setPaymentModalVisible(true)}
              icon="credit-card"
              size="large"
              gradient={GRADIENTS.success}
              disabled={cart.length === 0}
            />
          </View>
        </View>
      </View>

      <Modal
        visible={paymentModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <BlurView intensity={80} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Payment Method</Text>
            <Text style={styles.modalAmount}>{currency} {getTotalAmount().toFixed(2)}</Text>

            <View style={styles.paymentMethods}>
              {PAYMENT_METHODS.map((method) => (
                <TouchableOpacity
                  key={method.value}
                  style={styles.paymentButton}
                  onPress={() => handleCheckout(method.value as 'cash' | 'digital' | 'card')}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={GRADIENTS.businessIcon.colors}
                    start={GRADIENTS.businessIcon.start}
                    end={GRADIENTS.businessIcon.end}
                    style={styles.paymentIconContainer}
                  >
                    <Feather name={method.icon as keyof typeof Feather.glyphMap} size={32} color={COLORS.business} />
                  </LinearGradient>
                  <Text style={styles.paymentLabel}>{method.label}</Text>
                  <Feather name="chevron-right" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title="Cancel"
              onPress={() => setPaymentModalVisible(false)}
              variant="secondary"
              style={styles.cancelButton}
            />
          </View>
        </BlurView>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  productsSection: {
    flex: 2,
    padding: SPACING.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },
  productsScroll: {
    flex: 1,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  productButton: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  productGradient: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'space-between',
  },
  productOutOfStock: {
    opacity: 0.5,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  productPrice: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.business,
  },
  productStock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  productStockText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
  },
  productStockLow: {
    color: COLORS.warning,
  },
  cartSection: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cartTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
  },
  clearCart: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.danger,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  cartScroll: {
    flex: 1,
  },
  cartContent: {
    padding: SPACING.lg,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  cartItemPrice: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    minWidth: SPACING['2xl'],
    textAlign: 'center',
  },
  cartItemTotal: {
    alignItems: 'flex-end',
    gap: SPACING.sm,
  },
  cartItemTotalText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
  },
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyCartText: {
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  cartFooter: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  totalAmount: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.business,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  modalContent: {
    backgroundColor: withAlpha(COLORS.background, 0.95),
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: withAlpha('#fff', 0.1),
    padding: SPACING['3xl'],
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS['2xl'],
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  modalAmount: {
    fontSize: TYPOGRAPHY.size['4xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.business,
    marginBottom: SPACING['3xl'],
  },
  paymentMethods: {
    width: '100%',
    gap: SPACING.md,
    marginBottom: SPACING['2xl'],
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  paymentIconContainer: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  cancelButton: {
    width: '100%',
  },
});

export default POS;
