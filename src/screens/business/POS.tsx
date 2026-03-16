import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Keyboard,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useBusinessStore } from '../../store/businessStore';
import { useCRMStore } from '../../store/crmStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, PAYMENT_METHODS, PRODUCT_CATEGORIES, withAlpha } from '../../constants';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';

import { SaleItem } from '../../types';
import { useToast } from '../../context/ToastContext';
import { successNotification } from '../../services/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CART_COLLAPSED_WIDTH = SCREEN_WIDTH * 0.33;
const CART_EXPANDED_WIDTH = SCREEN_WIDTH * 0.9;

const POS: React.FC = () => {
  const { showToast } = useToast();
  const { products, addSale } = useBusinessStore();
  const { customers, addOrder } = useCRMStore();
  const currency = useSettingsStore((state) => state.currency);

  // Cart state
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);

  // Discount state
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');

  // Checkout state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Cart expand/collapse
  const [cartExpanded, setCartExpanded] = useState(false);
  const cartWidthAnim = useRef(new Animated.Value(CART_COLLAPSED_WIDTH)).current;

  const collapseCart = () => {
    setCartExpanded(false);
    Animated.spring(cartWidthAnim, {
      toValue: CART_COLLAPSED_WIDTH,
      useNativeDriver: false,
      speed: 14,
      bounciness: 4,
    }).start();
  };

  const expandCart = () => {
    setCartExpanded(true);
    Animated.spring(cartWidthAnim, {
      toValue: CART_EXPANDED_WIDTH,
      useNativeDriver: false,
      speed: 14,
      bounciness: 4,
    }).start();
  };

  const toggleCart = () => {
    if (cartExpanded) {
      collapseCart();
    } else {
      expandCart();
    }
  };

  // ── Filtered customers for checkout search ──
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
    );
  }, [customers, customerSearchQuery]);

  // ── Category tabs ──
  const availableCategories = useMemo(() => {
    const categoryIds = [...new Set(products.map((p) => p.category))];
    return categoryIds.map((id) => {
      const cat = PRODUCT_CATEGORIES.find((c) => c.id === id);
      return cat || { id, name: id, icon: 'grid', color: CALM.textSecondary };
    });
  }, [products]);

  // ── Filtered products ──
  const filteredProducts = useMemo(() => products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === null || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [products, selectedCategory, searchQuery]);

  // ── Cart helpers ──
  const cartQuantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) map[item.productId] = item.quantity;
    return map;
  }, [cart]);

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

  // ── Totals with discount ──
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.totalPrice, 0), [cart]);

  const discountAmount = useMemo((): number => {
    const val = parseFloat(discountValue) || 0;
    if (val <= 0) return 0;
    if (discountType === 'percentage') {
      return Math.min(subtotal, (val / 100) * subtotal);
    }
    return Math.min(subtotal, val);
  }, [subtotal, discountValue, discountType]);

  const totalAmount = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);

  // ── Checkout ──
  const selectedCustomer = selectedCustomerId
    ? customers.find((c) => c.id === selectedCustomerId)
    : null;

  const handleCheckout = (paymentMethod: 'cash' | 'digital' | 'card') => {
    if (cart.length === 0) {
      showToast('Please add items to cart before checkout', 'error');
      return;
    }

    addSale({
      items: cart,
      totalAmount,
      discount: discountAmount > 0 ? discountAmount : undefined,
      subtotalBeforeDiscount: discountAmount > 0 ? subtotal : undefined,
      paymentMethod,
      customerName: selectedCustomer?.name || undefined,
      date: new Date(),
    });

    // Create CRM order if customer selected
    if (selectedCustomer) {
      addOrder({
        customerId: selectedCustomer.id,
        items: cart.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
        totalAmount,
        status: 'completed',
        date: new Date(),
      });
    }

    // Reset
    setCart([]);
    setDiscountValue('');
    setSelectedCustomerId(null);
    setCustomerDropdownOpen(false);
    setCustomerSearchQuery('');
    setPaymentModalVisible(false);
    collapseCart();
    successNotification();
    showToast('Sale completed.', 'success');
  };

  if (products.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="package"
          title="No Products"
          message="Add products to your inventory to start making sales"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* ── Products Section ── */}
        <View style={styles.productsSection}>
          {/* Backdrop when cart expanded */}
          {cartExpanded && (
            <TouchableOpacity
              style={styles.backdrop}
              activeOpacity={1}
              onPress={collapseCart}
            >
              <View style={styles.backdropInner} />
            </TouchableOpacity>
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
                  color={selectedCategory === null ? '#fff' : CALM.textSecondary}
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
                    color={selectedCategory === cat.id ? '#fff' : CALM.textSecondary}
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

          {/* Search */}
          <View style={styles.searchContainer}>
            <Feather name="search" size={20} color={CALM.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search products..."
              placeholderTextColor={CALM.textSecondary}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={20} color={CALM.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Product grid */}
          <ScrollView
            style={styles.productsScroll}
            contentContainerStyle={styles.productsGrid}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {filteredProducts.map((product) => {
              const inCartQty = cartQuantityMap[product.id] || 0;
              return (
                <View key={product.id} style={styles.productCardWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.productButton,
                      product.stock <= 0 && styles.productOutOfStock,
                    ]}
                    onPress={() => addToCart(product.id)}
                    activeOpacity={0.7}
                    disabled={product.stock <= 0}
                  >
                    <View style={styles.productInner}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {product.name}
                      </Text>
                      <Text style={styles.productPrice}>
                        {currency} {product.price.toFixed(2)}
                      </Text>
                      <View style={styles.productStock}>
                        <Feather
                          name="package"
                          size={12}
                          color={
                            product.stock <= product.lowStockThreshold
                              ? CALM.neutral
                              : CALM.textSecondary
                          }
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
                    </View>
                  </TouchableOpacity>
                  {inCartQty > 0 && (
                    <View style={styles.cartBadge}>
                      <Text style={styles.cartBadgeText}>{inCartQty}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Cart Section (Tap to expand) ── */}
        <Animated.View style={[styles.cartSection, { width: cartWidthAnim }]}>
          {/* Cart header — tap left side to toggle, Clear is independent */}
          <View style={styles.cartHeader}>
            <TouchableOpacity
              onPress={toggleCart}
              activeOpacity={0.7}
              style={styles.cartHeaderLeft}
            >
              <Feather
                name={cartExpanded ? 'chevron-right' : 'chevron-left'}
                size={18}
                color={CALM.bronze}
              />
              <Text style={styles.cartTitle}>
                {cartExpanded ? 'Review Order' : `Cart (${cart.length})`}
              </Text>
            </TouchableOpacity>
            {cart.length > 0 && (
              <TouchableOpacity onPress={() => setCart([])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearCart}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cart items — tap anywhere in collapsed cart to expand */}
          <Pressable
            onPress={!cartExpanded && cart.length > 0 ? expandCart : undefined}
            disabled={cartExpanded || cart.length === 0}
            style={styles.cartScroll}
          >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.cartContent}
            showsVerticalScrollIndicator={false}
          >
            {cart.length > 0 ? (
              cart.map((item) =>
                cartExpanded ? (
                  // ── Expanded view ──
                  <View key={item.productId} style={styles.cartItemExpanded}>
                    <View style={styles.cartItemExpandedTop}>
                      <Text style={styles.cartItemNameExpanded} numberOfLines={1}>
                        {item.productName}
                      </Text>
                      <TouchableOpacity onPress={() => removeFromCart(item.productId)}>
                        <Feather name="trash-2" size={18} color={CALM.neutral} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.cartItemExpandedBottom}>
                      <Text style={styles.cartItemPriceExpanded}>
                        {currency} {item.unitPrice.toFixed(2)} ea
                      </Text>
                      <View style={styles.quantityControlsExpanded}>
                        <TouchableOpacity
                          style={styles.quantityButtonExpanded}
                          onPress={() => updateQuantity(item.productId, item.quantity - 1)}
                        >
                          <Feather name="minus" size={16} color={CALM.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.quantityTextExpanded}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.quantityButtonExpanded}
                          onPress={() => updateQuantity(item.productId, item.quantity + 1)}
                        >
                          <Feather name="plus" size={16} color={CALM.textPrimary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.cartItemTotalExpanded}>
                        {currency} {item.totalPrice.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  // ── Collapsed view ──
                  <View key={item.productId} style={styles.cartItem}>
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.productName}
                      </Text>
                      <Text style={styles.cartItemPrice}>
                        {currency} {item.unitPrice.toFixed(2)} ea
                      </Text>
                    </View>
                    <View style={styles.quantityControls}>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() => updateQuantity(item.productId, item.quantity - 1)}
                      >
                        <Feather name="minus" size={16} color={CALM.textPrimary} />
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() => updateQuantity(item.productId, item.quantity + 1)}
                      >
                        <Feather name="plus" size={16} color={CALM.textPrimary} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.cartItemTotal}>
                      <Text style={styles.cartItemTotalText}>
                        {currency} {item.totalPrice.toFixed(2)}
                      </Text>
                      <TouchableOpacity onPress={() => removeFromCart(item.productId)}>
                        <Feather name="trash-2" size={16} color={CALM.neutral} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              )
            ) : (
              <TouchableOpacity
                style={styles.emptyCart}
                onPress={expandCart}
                activeOpacity={0.7}
                accessibilityLabel="Tap to expand cart"
              >
                <Feather name="shopping-cart" size={48} color={CALM.textSecondary} />
                <Text style={styles.emptyCartText}>Cart is empty</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          </Pressable>

          {/* Cart footer */}
          <Pressable
            style={styles.cartFooter}
            onPress={!cartExpanded && cart.length > 0 ? expandCart : undefined}
            disabled={cartExpanded || cart.length === 0}
          >
            {/* Discount section — only when expanded & has items */}
            {cartExpanded && cart.length > 0 && (
              <View style={styles.discountSection}>
                <View style={styles.discountHeader}>
                  <Text style={styles.discountLabel}>Discount</Text>
                  <View style={styles.discountTypeToggle}>
                    <TouchableOpacity
                      style={[
                        styles.discountTypeButton,
                        discountType === 'percentage' && styles.discountTypeActive,
                      ]}
                      onPress={() => setDiscountType('percentage')}
                    >
                      <Feather
                        name="percent"
                        size={14}
                        color={discountType === 'percentage' ? '#fff' : CALM.textSecondary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.discountTypeButton,
                        discountType === 'fixed' && styles.discountTypeActive,
                      ]}
                      onPress={() => setDiscountType('fixed')}
                    >
                      <Text
                        style={{
                          fontSize: TYPOGRAPHY.size.xs,
                          fontWeight: TYPOGRAPHY.weight.bold,
                          color: discountType === 'fixed' ? '#fff' : CALM.textSecondary,
                        }}
                      >
                        {currency}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TextInput
                  style={styles.discountInput}
                  value={discountValue}
                  onChangeText={setDiscountValue}
                  placeholder={discountType === 'percentage' ? '0%' : '0.00'}
                  placeholderTextColor={CALM.neutral}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
              </View>
            )}

            {/* Totals */}
            <View style={styles.totalsBreakdown}>
              {(cartExpanded || discountAmount > 0) && cart.length > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalRowLabel}>Subtotal</Text>
                  <Text style={styles.totalRowValue}>
                    {currency} {subtotal.toFixed(2)}
                  </Text>
                </View>
              )}
              {discountAmount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalRowLabel, { color: CALM.positive }]}>
                    Discount{discountType === 'percentage' ? ` (${discountValue}%)` : ''}
                  </Text>
                  <Text style={[styles.totalRowValue, { color: CALM.positive }]}>
                    -{currency} {discountAmount.toFixed(2)}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.totalRow,
                  (cartExpanded || discountAmount > 0) && cart.length > 0 && styles.totalRowFinal,
                ]}
              >
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>
                  {currency} {totalAmount.toFixed(2)}
                </Text>
              </View>
            </View>

            <Button
              title="Checkout"
              onPress={() => setPaymentModalVisible(true)}
              icon="credit-card"
              size="large"
              disabled={cart.length === 0}
            />
          </Pressable>
        </Animated.View>
      </View>

      {/* ── Checkout Modal ── */}
      {paymentModalVisible && (
      <Modal
        visible={paymentModalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          setPaymentModalVisible(false);
          setSelectedCustomerId(null);
          setCustomerDropdownOpen(false);
          setCustomerSearchQuery('');
        }}
      >
        <BlurView intensity={80} style={styles.modalOverlay}>
          <View style={styles.modalKeyboardView}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Checkout</Text>

              <KeyboardAwareScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ width: '100%' }}
              >
                {/* Customer selector */}
                {customers.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Link to Customer (optional)</Text>
                    <TouchableOpacity
                      style={styles.customerDropdownTrigger}
                      onPress={() => setCustomerDropdownOpen(!customerDropdownOpen)}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name={selectedCustomer ? 'user' : 'user-plus'}
                        size={16}
                        color={selectedCustomer ? CALM.bronze : CALM.textSecondary}
                      />
                      <Text
                        style={[
                          styles.customerDropdownText,
                          selectedCustomer && { color: CALM.textPrimary, fontWeight: TYPOGRAPHY.weight.semibold },
                        ]}
                        numberOfLines={1}
                      >
                        {selectedCustomer
                          ? `${selectedCustomer.name}${selectedCustomer.company ? ` — ${selectedCustomer.company}` : ''}`
                          : 'Select customer'}
                      </Text>
                      <Feather
                        name={customerDropdownOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={CALM.textSecondary}
                      />
                    </TouchableOpacity>

                    {customerDropdownOpen && (
                      <View style={styles.customerDropdownList}>
                        <View style={styles.customerSearchContainer}>
                          <Feather name="search" size={14} color={CALM.textSecondary} />
                          <TextInput
                            style={styles.customerSearchInput}
                            value={customerSearchQuery}
                            onChangeText={setCustomerSearchQuery}
                            placeholder="Search customers..."
                            placeholderTextColor={CALM.neutral}
                            autoFocus
                          />
                          {customerSearchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setCustomerSearchQuery('')}>
                              <Feather name="x" size={14} color={CALM.textSecondary} />
                            </TouchableOpacity>
                          )}
                        </View>
                        <ScrollView style={styles.customerDropdownScroll} nestedScrollEnabled>
                        {selectedCustomerId && (
                          <TouchableOpacity
                            style={styles.customerDropdownItem}
                            onPress={() => {
                              setSelectedCustomerId(null);
                              setCustomerDropdownOpen(false);
                              setCustomerSearchQuery('');
                            }}
                          >
                            <Feather name="x-circle" size={16} color={CALM.textSecondary} />
                            <Text style={[styles.customerDropdownItemText, { color: CALM.textSecondary }]}>
                              None
                            </Text>
                          </TouchableOpacity>
                        )}
                        {filteredCustomers.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            style={[
                              styles.customerDropdownItem,
                              c.id === selectedCustomerId && styles.customerDropdownItemActive,
                            ]}
                            onPress={() => {
                              setSelectedCustomerId(c.id);
                              setCustomerDropdownOpen(false);
                              setCustomerSearchQuery('');
                            }}
                          >
                            <Feather
                              name="user"
                              size={16}
                              color={c.id === selectedCustomerId ? CALM.bronze : CALM.textSecondary}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.customerDropdownItemText}>{c.name}</Text>
                              {(c.phone || c.company) && (
                                <Text style={styles.customerDropdownItemSub}>
                                  {c.company || c.phone}
                                </Text>
                              )}
                            </View>
                            {c.id === selectedCustomerId && (
                              <Feather name="check" size={16} color={CALM.bronze} />
                            )}
                          </TouchableOpacity>
                        ))}
                        {filteredCustomers.length === 0 && (
                          <View style={styles.customerDropdownEmpty}>
                            <Text style={styles.customerDropdownEmptyText}>No customers found</Text>
                          </View>
                        )}
                      </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                {/* Order summary */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>
                    Order Summary ({cart.length} {cart.length === 1 ? 'item' : 'items'})
                  </Text>
                  <View style={styles.orderSummaryBox}>
                    {cart.map((item) => (
                      <View key={item.productId} style={styles.orderSummaryItem}>
                        <Text style={styles.orderItemName} numberOfLines={1}>
                          {item.productName}
                        </Text>
                        <Text style={styles.orderItemQty}>x{item.quantity}</Text>
                        <Text style={styles.orderItemTotal}>
                          {currency} {item.totalPrice.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Totals breakdown */}
                <View style={styles.modalTotals}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalRowLabel}>Subtotal</Text>
                    <Text style={styles.totalRowValue}>
                      {currency} {subtotal.toFixed(2)}
                    </Text>
                  </View>
                  {discountAmount > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalRowLabel, { color: CALM.positive }]}>Discount</Text>
                      <Text style={[styles.totalRowValue, { color: CALM.positive }]}>
                        -{currency} {discountAmount.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.totalRow, styles.totalRowFinal]}>
                    <Text style={styles.modalTotalLabel}>Total</Text>
                    <Text style={styles.modalAmount}>
                      {currency} {totalAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Payment methods */}
                <View style={styles.paymentMethods}>
                  {PAYMENT_METHODS.map((method) => (
                    <TouchableOpacity
                      key={method.value}
                      style={styles.paymentButton}
                      onPress={() => handleCheckout(method.value as 'cash' | 'digital' | 'card')}
                      activeOpacity={0.8}
                    >
                      <View style={styles.paymentIconContainer}>
                        <Feather
                          name={method.icon as keyof typeof Feather.glyphMap}
                          size={32}
                          color={CALM.bronze}
                        />
                      </View>
                      <Text style={styles.paymentLabel}>{method.label}</Text>
                      <Feather name="chevron-right" size={20} color={CALM.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>

                <Button
                  title="Cancel"
                  onPress={() => {
                    setPaymentModalVisible(false);
                    setSelectedCustomerId(null);
                    setCustomerDropdownOpen(false);
                    setCustomerSearchQuery('');
                  }}
                  variant="secondary"
                  style={styles.cancelButton}
                />
              </KeyboardAwareScrollView>
            </View>
          </View>
        </BlurView>
      </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },

  // ── Products ──
  productsSection: {
    flex: 1,
    padding: SPACING.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  backdropInner: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: RADIUS.lg,
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
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  categoryTabActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  categoryTabText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  categoryTabTextActive: {
    color: '#fff',
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },

  // Product grid
  productsScroll: {
    flex: 1,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  productCardWrapper: {
    width: '48%',
    aspectRatio: 1,
    overflow: 'visible',
  },
  productButton: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  productInner: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'space-between',
  },
  productOutOfStock: {
    opacity: 0.5,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
  },
  productPrice: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  productStock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  productStockText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  productStockLow: {
    color: CALM.neutral,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 2,
  },
  cartBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
  },

  // ── Cart ──
  cartSection: {
    backgroundColor: CALM.surface,
    borderLeftWidth: 1,
    borderLeftColor: CALM.border,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  cartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
  },
  cartTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  clearCart: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.neutral,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  cartScroll: {
    flex: 1,
  },
  cartContent: {
    padding: SPACING.lg,
    flexGrow: 1,
  },

  // Collapsed cart items
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  cartItemPrice: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
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
    backgroundColor: CALM.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  quantityText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
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
    color: CALM.textPrimary,
  },

  // Expanded cart items
  cartItemExpanded: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  cartItemExpandedTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  cartItemNameExpanded: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginRight: SPACING.md,
  },
  cartItemExpandedBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartItemPriceExpanded: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  quantityControlsExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  quantityButtonExpanded: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  quantityTextExpanded: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    minWidth: 30,
    textAlign: 'center',
  },
  cartItemTotalExpanded: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.bronze,
  },

  // Empty cart
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyCartText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
    marginTop: SPACING.md,
  },

  // Cart footer
  cartFooter: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    gap: SPACING.md,
  },

  // Discount
  discountSection: {
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  discountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  discountLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  discountTypeToggle: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  discountTypeButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountTypeActive: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
  },
  discountInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
  },

  // Totals
  totalsBreakdown: {
    gap: SPACING.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRowLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  totalRowValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  totalRowFinal: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  totalAmount: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'],
  },

  // ── Checkout Modal ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  modalKeyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING['3xl'],
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.lg,
  },
  modalSection: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  modalSectionTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Customer dropdown
  customerDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  customerDropdownText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
  },
  customerDropdownList: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: CALM.border,
    maxHeight: 240,
  },
  customerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  customerSearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    paddingVertical: 2,
  },
  customerDropdownScroll: {
    maxHeight: 180,
  },
  customerDropdownEmpty: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  customerDropdownEmptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.neutral,
  },
  customerDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  customerDropdownItemActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.06),
  },
  customerDropdownItemText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  customerDropdownItemSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 1,
  },

  // Order summary
  orderSummaryBox: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  orderSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  orderItemName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  orderItemQty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginHorizontal: SPACING.md,
    fontVariant: ['tabular-nums'],
  },
  orderItemTotal: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // Modal totals
  modalTotals: {
    width: '100%',
    marginBottom: SPACING.xl,
    gap: SPACING.xs,
  },
  modalTotalLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  modalAmount: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'],
  },

  // Payment methods
  paymentMethods: {
    width: '100%',
    gap: SPACING.md,
    marginBottom: SPACING['2xl'],
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.lg,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  paymentIconContainer: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(CALM.bronze, 0.08),
  },
  paymentLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  cancelButton: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
});

export default POS;
