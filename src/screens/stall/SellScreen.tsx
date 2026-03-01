import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  SafeAreaView,
  Animated,
  Pressable,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';

import { successNotification } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CART_COLLAPSED_WIDTH = SCREEN_WIDTH * 0.30;
const CART_EXPANDED_WIDTH = SCREEN_WIDTH * 0.88;

interface CartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

const SellScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { products, getActiveSession, addSale } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Discount state
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');

  // Cart expand/collapse
  const [cartExpanded, setCartExpanded] = useState(false);
  const cartWidthAnim = useRef(new Animated.Value(CART_COLLAPSED_WIDTH)).current;

  const session = getActiveSession();
  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products],
  );

  // Snapshot map for remaining qty
  const snapshotMap = useMemo(() => {
    if (!session) return {};
    const map: Record<string, { startQty: number; remainingQty: number }> = {};
    session.productsSnapshot.forEach((ps) => {
      map[ps.productId] = { startQty: ps.startQty, remainingQty: ps.remainingQty };
    });
    return map;
  }, [session]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return activeProducts;
    const q = searchQuery.toLowerCase();
    return activeProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [activeProducts, searchQuery]);

  // ── Cart animation ──
  const collapseCart = useCallback(() => {
    setCartExpanded(false);
    Animated.spring(cartWidthAnim, {
      toValue: CART_COLLAPSED_WIDTH,
      useNativeDriver: false,
      speed: 14,
      bounciness: 4,
    }).start();
  }, [cartWidthAnim]);

  const expandCart = useCallback(() => {
    setCartExpanded(true);
    Animated.spring(cartWidthAnim, {
      toValue: CART_EXPANDED_WIDTH,
      useNativeDriver: false,
      speed: 14,
      bounciness: 4,
    }).start();
  }, [cartWidthAnim]);

  const toggleCart = useCallback(() => {
    if (cartExpanded) collapseCart();
    else expandCart();
  }, [cartExpanded, collapseCart, expandCart]);

  // ── Cart helpers ──
  const addToCart = useCallback(
    (productId: string) => {
      if (!session) return;
      const product = activeProducts.find((p) => p.id === productId);
      if (!product) return;

      const snap = snapshotMap[productId];
      if (snap && snap.startQty > 0 && snap.remainingQty <= 0) return;

      setCart((prev) => {
        const existing = prev.find((i) => i.productId === productId);
        const currentQty = existing ? existing.quantity : 0;
        const maxQty = snap && snap.startQty > 0 ? snap.remainingQty : Infinity;

        if (currentQty >= maxQty) return prev;

        if (existing) {
          return prev.map((i) =>
            i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [
          ...prev,
          { productId, productName: product.name, unitPrice: product.price, quantity: 1 },
        ];
      });
    },
    [session, activeProducts, snapshotMap],
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) {
        setCart((prev) => prev.filter((i) => i.productId !== productId));
        return;
      }
      const snap = snapshotMap[productId];
      const maxQty = snap && snap.startQty > 0 ? snap.remainingQty : Infinity;
      if (quantity > maxQty) return;

      setCart((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, quantity } : i))
      );
    },
    [snapshotMap],
  );

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  // ── Totals with discount ──
  const getSubtotal = () => cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const getDiscountAmount = (): number => {
    const subtotal = getSubtotal();
    const val = parseFloat(discountValue) || 0;
    if (val <= 0) return 0;
    if (discountType === 'percentage') return Math.min(subtotal, (val / 100) * subtotal);
    return Math.min(subtotal, val);
  };

  const getTotalAmount = () => Math.max(0, getSubtotal() - getDiscountAmount());

  const getCartQuantity = (productId: string): number => {
    const item = cart.find((i) => i.productId === productId);
    return item ? item.quantity : 0;
  };

  // ── Checkout ──
  const handleCheckout = useCallback(
    (method: 'cash' | 'qr') => {
      if (cart.length === 0 || !session) return;

      const discountAmt = getDiscountAmount();
      const subtotal = getSubtotal();
      // Distribute discount proportionally across items
      const discountRatio = subtotal > 0 && discountAmt > 0 ? discountAmt / subtotal : 0;

      cart.forEach((item) => {
        const itemTotal = item.unitPrice * item.quantity;
        const itemDiscount = itemTotal * discountRatio;
        addSale({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: Math.max(0, itemTotal - itemDiscount),
          paymentMethod: method,
        });
      });

      // Reset
      setCart([]);
      setDiscountValue('');
      collapseCart();
      successNotification();
      showToast('Sale recorded.', 'success');
    },
    [cart, session, addSale, collapseCart, showToast, discountValue, discountType],
  );

  // ─── No active session ──────────────────────────────────────
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Feather name="pause-circle" size={40} color={CALM.border} />
          <Text style={styles.emptyTitle}>no active session</Text>
          <Text style={styles.emptyHint}>
            start a session from the dashboard to begin selling.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── No products ────────────────────────────────────────────
  if (activeProducts.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionTotal}>
            {currency} {session.totalRevenue.toFixed(2)}
          </Text>
          <Text style={styles.sessionSplit}>
            cash {currency} {session.totalCash.toFixed(2)} {'  \u00B7  '}
            qr {currency} {session.totalQR.toFixed(2)}
          </Text>
        </View>
        <View style={styles.emptyContainer}>
          <Feather name="package" size={40} color={CALM.border} />
          <Text style={styles.emptyTitle}>add your products first</Text>
          <Text style={styles.emptyHint}>you need products to start selling.</Text>
          <TouchableOpacity
            style={styles.addProductsButton}
            onPress={() => navigation.getParent()?.navigate('StallProducts')}
            accessibilityLabel="Go to products management"
          >
            <Feather name="plus" size={16} color={CALM.bronze} />
            <Text style={styles.addProductsText}>manage products</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main selling UI ────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Session total — full width, sticky top */}
      <View style={styles.sessionHeader}>
        <View style={styles.sessionHeaderRow}>
          <View>
            <Text
              style={styles.sessionTotal}
              accessibilityLabel={`Session total ${currency} ${session.totalRevenue.toFixed(2)}`}
            >
              {currency} {session.totalRevenue.toFixed(2)}
            </Text>
            <Text style={styles.sessionSplit}>
              cash {currency} {session.totalCash.toFixed(2)} {'  \u00B7  '}
              qr {currency} {session.totalQR.toFixed(2)}
            </Text>
          </View>
          <Text style={styles.sessionSaleCount}>
            {session.sales.length} sale{session.sales.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Row layout: Products | Cart */}
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

          {/* Search */}
          <View style={styles.searchContainer}>
            <Feather name="search" size={20} color={CALM.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search products..."
              placeholderTextColor={CALM.neutral}
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
              const snap = snapshotMap[product.id];
              const isSoldOut = snap && snap.startQty > 0 && snap.remainingQty <= 0;
              const hasQty = snap && snap.startQty > 0;
              const inCartQty = getCartQuantity(product.id);

              return (
                <View key={product.id} style={styles.productCardWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.productButton,
                      isSoldOut && styles.productOutOfStock,
                    ]}
                    onPress={() => addToCart(product.id)}
                    activeOpacity={0.7}
                    disabled={!!isSoldOut}
                    accessibilityLabel={`${product.name}, ${currency} ${product.price.toFixed(2)}${hasQty ? `, ${snap.remainingQty} left` : ''}${isSoldOut ? ', sold out' : ''}`}
                    accessibilityHint={isSoldOut ? 'This product is sold out' : 'Tap to add to cart'}
                    accessibilityRole="button"
                  >
                    <View style={styles.productInner}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {product.name}
                      </Text>
                      <Text style={styles.productPrice}>
                        {currency} {product.price.toFixed(2)}
                      </Text>
                      {/* Remaining qty */}
                      {hasQty && !isSoldOut && (
                        <View style={styles.productStock}>
                          <Feather name="package" size={12} color={CALM.textSecondary} />
                          <Text style={styles.productStockText}>
                            {snap.remainingQty}
                          </Text>
                        </View>
                      )}
                      {isSoldOut && (
                        <Text style={styles.soldOutLabel}>sold out</Text>
                      )}
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

            {filteredProducts.length === 0 && searchQuery.length > 0 && (
              <View style={styles.noResults}>
                <Text style={styles.noResultsText}>no products match "{searchQuery}"</Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* ── Cart Panel (animated) ── */}
        <Animated.View style={[styles.cartSection, { width: cartWidthAnim }]}>
          {/* Cart header */}
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
              <TouchableOpacity
                onPress={() => setCart([])}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearCart}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cart items */}
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
                          {currency} {(item.unitPrice * item.quantity).toFixed(2)}
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
                          {currency} {(item.unitPrice * item.quantity).toFixed(2)}
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
            {/* Discount — only when expanded & has items */}
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
              {(cartExpanded || getDiscountAmount() > 0) && cart.length > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalRowLabel}>Subtotal</Text>
                  <Text style={styles.totalRowValue}>
                    {currency} {getSubtotal().toFixed(2)}
                  </Text>
                </View>
              )}
              {getDiscountAmount() > 0 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalRowLabel, { color: CALM.positive }]}>
                    Discount{discountType === 'percentage' ? ` (${discountValue}%)` : ''}
                  </Text>
                  <Text style={[styles.totalRowValue, { color: CALM.positive }]}>
                    -{currency} {getDiscountAmount().toFixed(2)}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.totalRow,
                  (cartExpanded || getDiscountAmount() > 0) && cart.length > 0 && styles.totalRowFinal,
                ]}
              >
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>
                  {currency} {getTotalAmount().toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Payment buttons — Cash / QR */}
            <View style={styles.paymentRow}>
              <TouchableOpacity
                style={styles.cashButton}
                onPress={() => handleCheckout('cash')}
                activeOpacity={0.85}
                disabled={cart.length === 0}
                accessibilityLabel={`Pay cash, ${currency} ${getTotalAmount().toFixed(2)}`}
                accessibilityRole="button"
              >
                <Feather name="dollar-sign" size={18} color={cart.length > 0 ? CALM.textPrimary : CALM.neutral} />
                <Text style={[styles.cashButtonText, cart.length === 0 && { color: CALM.neutral }]}>
                  Cash
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.qrButton, cart.length === 0 && styles.qrButtonDisabled]}
                onPress={() => handleCheckout('qr')}
                activeOpacity={0.85}
                disabled={cart.length === 0}
                accessibilityLabel={`Pay QR, ${currency} ${getTotalAmount().toFixed(2)}`}
                accessibilityRole="button"
              >
                <Feather name="smartphone" size={18} color={cart.length > 0 ? '#FFFFFF' : CALM.neutral} />
                <Text style={[styles.qrButtonText, cart.length === 0 && { color: CALM.neutral }]}>
                  QR
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },

  // ─── Session header ────────────────────────────────────
  sessionHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: CALM.background,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionTotal: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  sessionSplit: {
    ...TYPE.muted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  sessionSaleCount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },

  // ─── Content row ───────────────────────────────────────
  content: {
    flex: 1,
    flexDirection: 'row',
  },

  // ─── Products section ──────────────────────────────────
  productsSection: {
    flex: 1,
    padding: SPACING.md,
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

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
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
    paddingBottom: SPACING['3xl'],
  },
  productCardWrapper: {
    width: '47.5%',
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
    opacity: 0.35,
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
    fontVariant: ['tabular-nums'],
  },
  soldOutLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.neutral,
    marginTop: SPACING.xs,
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
  noResults: {
    width: '100%',
    paddingVertical: SPACING['3xl'],
    alignItems: 'center',
  },
  noResultsText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },

  // ─── Cart panel ────────────────────────────────────────
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
    fontVariant: ['tabular-nums'],
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
    fontVariant: ['tabular-nums'],
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
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'],
  },

  // Payment buttons
  paymentRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cashButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 52,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  cashButtonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  qrButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 52,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
  },
  qrButtonDisabled: {
    backgroundColor: CALM.border,
  },
  qrButtonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ─── Empty states ──────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['3xl'],
    gap: SPACING.md,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  emptyHint: {
    ...TYPE.muted,
    textAlign: 'center',
  },
  addProductsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.bronze,
    minHeight: 44,
  },
  addProductsText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
});

export default SellScreen;
