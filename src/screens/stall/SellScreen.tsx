import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  SafeAreaView,
  Animated,
  Pressable,
  Keyboard,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { StallProduct, StallModifier } from '../../types';

import { successNotification, lightTap } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';
import { useNetInfo } from '@react-native-community/netinfo';
import TapToPaySheet from '../../components/common/TapToPaySheet';
import { tapToPayAvailable } from '../../services/tapToPay';

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
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const t = useT();
  const {
    products, getActiveSession, addSale, quickSale, addCustomSale,
    updateSale, removeSale, restockProduct, setSessionDefaultPayment, addProduct,
    regularCustomers, recordVisit, loyalty, setClearance,
  } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();

  // Tap to Pay (card) availability — re-renders on connectivity change so the
  // Card option enables/disables live. `cardConfigured` = this device/build can
  // ever show card; `cardOffline` = configured but currently offline (button
  // stays visible-but-disabled and taps explain why).
  useNetInfo();
  const cardAvail = tapToPayAvailable();
  const cardConfigured = cardAvail.available || cardAvail.reason === 'offline';
  const cardOffline = !cardAvail.available;
  const [cardSheet, setCardSheet] = useState<null | { amountCents: number; label: string; onDone: (txnId: string) => void }>(null);

  // Sell mode: quick (1 tap = 1 sale) vs cart (multi-item)
  const [mode, setMode] = useState<'quick' | 'cart'>('quick');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Discount state
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');

  // Cart expand/collapse
  const [cartExpanded, setCartExpanded] = useState(false);
  const cartWidthAnim = useRef(new Animated.Value(CART_COLLAPSED_WIDTH)).current;

  // Ledger (today's sales) sheet
  const [ledgerVisible, setLedgerVisible] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  // Custom-amount sale
  const [customVisible, setCustomVisible] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customMethod, setCustomMethod] = useState<'cash' | 'qr' | 'card'>('cash');
  const [customSaveProduct, setCustomSaveProduct] = useState(false);

  // Restock-during-session
  const [restockTarget, setRestockTarget] = useState<{ id: string; name: string } | null>(null);
  const [restockAmount, setRestockAmount] = useState('');

  // Serving a regular customer (attribution + loyalty)
  const [servingCustomerId, setServingCustomerId] = useState<string | null>(null);
  const [visitRecordedForServing, setVisitRecordedForServing] = useState(false);
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Clearance + modifiers
  const [clearanceVisible, setClearanceVisible] = useState(false);
  const [clearanceInput, setClearanceInput] = useState('');
  const [modifierProduct, setModifierProduct] = useState<StallProduct | null>(null);

  const session = getActiveSession();
  const defaultPayment: 'cash' | 'qr' = session?.defaultPayment || 'cash';
  const clearance = session?.clearancePercent || 0;
  const priceOf = useCallback(
    (p: { price: number }) => (clearance > 0 ? Math.round(p.price * (1 - clearance / 100) * 100) / 100 : p.price),
    [clearance],
  );
  const servingCustomer = servingCustomerId
    ? regularCustomers.find((c) => c.id === servingCustomerId) || null
    : null;
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return regularCustomers;
    const q = customerSearch.toLowerCase();
    return regularCustomers.filter((c) => c.name.toLowerCase().includes(q));
  }, [regularCustomers, customerSearch]);

  const loyaltyOn = loyalty.everyN > 0 && !!loyalty.reward;
  const loyaltyProgressText = (visitCount: number): string => {
    if (!loyaltyOn) return visitCount > 0 ? `${visitCount} ${t.stall.loyaltyVisitsWord}` : '';
    const mod = visitCount % loyalty.everyN;
    if (visitCount > 0 && mod === 0) return t.stall.loyaltyReady.replace('{reward}', loyalty.reward);
    return t.stall.loyaltyProgress.replace('{count}', String(mod)).replace('{n}', String(loyalty.everyN));
  };
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
          { productId, productName: product.name, unitPrice: priceOf(product), quantity: 1 },
        ];
      });
    },
    [session, activeProducts, snapshotMap, priceOf],
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

  // Record ONE visit per serving (not per item), and fire the loyalty toast on a milestone.
  const recordServingVisit = useCallback(() => {
    if (!servingCustomerId || visitRecordedForServing) return;
    recordVisit(servingCustomerId);
    setVisitRecordedForServing(true);
    const cust = useStallStore.getState().regularCustomers.find((c) => c.id === servingCustomerId);
    if (cust && loyalty.everyN > 0 && loyalty.reward && cust.visitCount % loyalty.everyN === 0) {
      successNotification();
      showToast(
        t.stall.loyaltyReachedToast.replace('{name}', cust.name).replace('{reward}', loyalty.reward),
        'success',
      );
    }
  }, [servingCustomerId, visitRecordedForServing, recordVisit, loyalty, showToast, t]);

  const selectCustomer = useCallback((id: string | null) => {
    setServingCustomerId(id);
    setVisitRecordedForServing(false);
    setCustomerPickerVisible(false);
    setCustomerSearch('');
    lightTap();
  }, []);

  // ── Totals with discount ──
  const subtotal = useMemo(() => cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0), [cart]);

  const cartQuantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) map[item.productId] = item.quantity;
    return map;
  }, [cart]);

  const discountAmount = useMemo((): number => {
    const val = parseFloat(discountValue) || 0;
    if (val <= 0) return 0;
    if (discountType === 'percentage') return Math.min(subtotal, (val / 100) * subtotal);
    return Math.min(subtotal, val);
  }, [subtotal, discountValue, discountType]);

  const totalAmount = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);

  // ── Checkout ──
  // For card, `pspTransactionId` (set after a successful Tap to Pay charge) is
  // stamped onto every per-item sale — one charge covers the whole cart.
  const handleCheckout = useCallback(
    (method: 'cash' | 'qr' | 'card', pspTransactionId?: string) => {
      if (cart.length === 0 || !session) return;

      // Distribute discount proportionally across items
      const discountRatio = subtotal > 0 && discountAmount > 0 ? discountAmount / subtotal : 0;

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
          regularCustomerId: servingCustomerId || undefined,
          ...(pspTransactionId ? { pspTransactionId, paymentProvider: 'stripe' as const } : {}),
        });
      });

      // Reset
      setCart([]);
      setDiscountValue('');
      collapseCart();
      successNotification();
      recordServingVisit();
      showToast(t.stall.saleRecorded, 'success');
    },
    [cart, session, addSale, collapseCart, showToast, subtotal, discountAmount, t, servingCustomerId, recordServingVisit],
  );

  // ── Card (Tap to Pay) cart checkout: charge first, record on success ──
  const openCardCheckout = useCallback(() => {
    if (cart.length === 0 || !session) return;
    if (cardOffline) { showToast(t.tapToPay.offlineToast, 'info'); return; }
    const names = cart.map((i) => i.productName).join(', ');
    setCardSheet({
      amountCents: Math.round(totalAmount * 100),
      label: names || t.stall.todaysSales,
      onDone: (txnId: string) => handleCheckout('card', txnId),
    });
  }, [cart, session, cardOffline, totalAmount, handleCheckout, showToast, t]);

  // ── Quick-sell: tap a tile = 1 sale at the session default payment ──
  const handleQuickSale = useCallback(
    (product: StallProduct) => {
      const id = quickSale(product.id, servingCustomerId || undefined);
      if (!id) return;
      successNotification();
      recordServingVisit();
      showToast(`${product.name} · ${currency}${priceOf(product).toFixed(0)}`, 'success', {
        label: t.stall.undo,
        onPress: () => removeSale(id),
      });
    },
    [quickSale, removeSale, showToast, currency, t, servingCustomerId, recordServingVisit, priceOf],
  );

  // ── Sell a product with a chosen modifier (immediate sale) ──
  const handleModifierSale = useCallback(
    (product: StallProduct, modifier: StallModifier | null) => {
      const unit = Math.max(0, Math.round((priceOf(product) + (modifier?.priceDelta || 0)) * 100) / 100);
      const name = modifier ? `${product.name} (${modifier.label})` : product.name;
      const id = addSale({
        productId: product.id,
        productName: name,
        quantity: 1,
        unitPrice: unit,
        total: unit,
        paymentMethod: defaultPayment,
        regularCustomerId: servingCustomerId || undefined,
      });
      setModifierProduct(null);
      if (!id) return;
      successNotification();
      recordServingVisit();
      showToast(`${name} · ${currency}${unit.toFixed(0)}`, 'success', {
        label: t.stall.undo,
        onPress: () => removeSale(id),
      });
    },
    [addSale, priceOf, defaultPayment, servingCustomerId, recordServingVisit, removeSale, showToast, currency, t],
  );

  // ── Tile press dispatcher: modifier chooser, else quick/cart ──
  const handleTilePress = useCallback(
    (product: StallProduct) => {
      if (product.modifiers && product.modifiers.length > 0) {
        setModifierProduct(product);
        return;
      }
      if (mode === 'quick') handleQuickSale(product);
      else addToCart(product.id);
    },
    [mode, handleQuickSale, addToCart],
  );

  // ── Flip the session default payment (quick mode) ──
  const toggleDefaultPayment = useCallback(() => {
    if (!session) return;
    lightTap();
    setSessionDefaultPayment((session.defaultPayment || 'cash') === 'cash' ? 'qr' : 'cash');
  }, [session, setSessionDefaultPayment]);

  // ── Clearance ──
  const openClearance = useCallback(() => {
    setClearanceInput(clearance > 0 ? String(clearance) : '');
    setClearanceVisible(true);
  }, [clearance]);
  const applyClearance = useCallback(() => {
    const v = parseInt(clearanceInput, 10);
    setClearance(isNaN(v) ? 0 : v);
    setClearanceVisible(false);
    Keyboard.dismiss();
    lightTap();
  }, [clearanceInput, setClearance]);
  const clearClearance = useCallback(() => {
    setClearance(0);
    setClearanceVisible(false);
    Keyboard.dismiss();
    lightTap();
  }, [setClearance]);

  // ── Custom-amount sale ──
  const openCustom = useCallback(() => {
    if (!session) return;
    setCustomMethod(session.defaultPayment || 'cash');
    setCustomAmount('');
    setCustomLabel('');
    setCustomSaveProduct(false);
    setCustomVisible(true);
  }, [session]);

  // Record the custom sale (shared by cash/qr and the post-charge card path).
  const finishCustomSale = useCallback((amt: number, label: string, save: boolean, pspTransactionId?: string) => {
    const id = addCustomSale({
      amount: amt,
      paymentMethod: pspTransactionId ? 'card' : customMethod,
      label: label || undefined,
      regularCustomerId: servingCustomerId || undefined,
      ...(pspTransactionId ? { pspTransactionId } : {}),
    });
    if (save && label) {
      addProduct({ name: label, price: amt, isActive: true });
    }
    successNotification();
    recordServingVisit();
    if (id) {
      showToast(`${label || t.stall.customSale} · ${currency}${amt.toFixed(0)}`, 'success', {
        label: t.stall.undo,
        onPress: () => removeSale(id),
      });
    }
  }, [addCustomSale, customMethod, servingCustomerId, addProduct, removeSale, showToast, currency, t, recordServingVisit]);

  const handleConfirmCustom = useCallback(() => {
    const amt = parseFloat(customAmount);
    if (isNaN(amt) || amt <= 0) return;
    const label = customLabel.trim();
    const save = customSaveProduct;
    if (customMethod === 'card') {
      if (cardOffline) { showToast(t.tapToPay.offlineToast, 'info'); return; }
      // Charge first; close the custom modal before opening the card sheet so
      // the two native modals never overlap (iOS), then record on success.
      setCustomVisible(false);
      Keyboard.dismiss();
      setTimeout(() => {
        setCardSheet({
          amountCents: Math.round(amt * 100),
          label: label || t.stall.customSale,
          onDone: (txnId: string) => finishCustomSale(amt, label, save, txnId),
        });
      }, 60);
      return;
    }
    setCustomVisible(false);
    Keyboard.dismiss();
    finishCustomSale(amt, label, save);
  }, [customAmount, customLabel, customMethod, customSaveProduct, cardOffline, finishCustomSale, showToast, t]);

  // ── Restock during session ──
  const handleConfirmRestock = useCallback(() => {
    if (!restockTarget) return;
    const qty = parseInt(restockAmount, 10);
    if (isNaN(qty) || qty <= 0) {
      setRestockTarget(null);
      return;
    }
    restockProduct(restockTarget.id, qty);
    lightTap();
    showToast(`+${qty} ${restockTarget.name}`, 'success');
    setRestockTarget(null);
    setRestockAmount('');
    Keyboard.dismiss();
  }, [restockTarget, restockAmount, restockProduct, showToast]);

  // ─── No active session ──────────────────────────────────────
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Feather name="pause-circle" size={40} color={C.border} />
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
            {currency} {session.totalRevenue.toFixed(0)}
          </Text>
          <Text style={styles.sessionSplit}>
            cash {currency} {session.totalCash.toFixed(0)} {'  \u00B7  '}
            qr {currency} {session.totalQR.toFixed(0)}
          </Text>
        </View>
        <View style={styles.emptyContainer}>
          <Feather name="package" size={40} color={C.border} />
          <Text style={styles.emptyTitle}>add your products first</Text>
          <Text style={styles.emptyHint}>you need products to start selling.</Text>
          <TouchableOpacity
            style={styles.addProductsButton}
            onPress={() => navigation.getParent()?.navigate('StallProducts')}
            accessibilityLabel="Go to products management"
          >
            <Feather name="plus" size={16} color={C.bronze} />
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
              {currency} {session.totalRevenue.toFixed(0)}
            </Text>
            <Text style={styles.sessionSplit}>
              cash {currency} {session.totalCash.toFixed(0)} {'  \u00B7  '}
              qr {currency} {session.totalQR.toFixed(0)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.saleCountPill}
            onPress={() => setLedgerVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${session.sales.length} sales. Tap to view and edit.`}
          >
            <Feather name="list" size={13} color={C.bronze} />
            <Text style={styles.saleCountText}>
              {session.sales.length} {session.sales.length === 1 ? t.stall.saleLabel : t.stall.salesLabel}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlsRow}>
          {/* Quick / Cart mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'quick' && styles.modeBtnActive]}
              onPress={() => {
                lightTap();
                if (cart.length > 0) { showToast(t.stall.cartBusySwitch, 'info'); return; }
                setMode('quick');
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'quick' }}
              accessibilityLabel={t.stall.quickMode}
            >
              <Feather name="zap" size={13} color={mode === 'quick' ? C.onAccent : C.textSecondary} />
              <Text style={[styles.modeBtnText, mode === 'quick' && styles.modeBtnTextActive]}>{t.stall.quickMode}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'cart' && styles.modeBtnActive]}
              onPress={() => { lightTap(); setMode('cart'); }}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'cart' }}
              accessibilityLabel={t.stall.cartMode}
            >
              <Feather name="shopping-cart" size={13} color={mode === 'cart' ? C.onAccent : C.textSecondary} />
              <Text style={[styles.modeBtnText, mode === 'cart' && styles.modeBtnTextActive]}>{t.stall.cartMode}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlsRight}>
            {mode === 'quick' && (
              <TouchableOpacity
                style={styles.payDefaultPill}
                onPress={toggleDefaultPayment}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Default payment ${defaultPayment === 'cash' ? t.stall.cashPrefix : t.stall.qrPrefix}. Tap to switch.`}
              >
                <Feather name={defaultPayment === 'cash' ? 'dollar-sign' : 'smartphone'} size={13} color={C.bronze} />
                <Text style={styles.payDefaultText}>{defaultPayment === 'cash' ? t.stall.cashPrefix : t.stall.qrPrefix}</Text>
                <Feather name="repeat" size={11} color={C.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={clearance > 0 ? styles.clearancePillOn : styles.headerIconBtn}
              onPress={openClearance}
              accessibilityRole="button"
              accessibilityLabel={clearance > 0 ? `Clearance ${clearance} percent off` : t.stall.clearanceTitle}
            >
              {clearance > 0 ? (
                <>
                  <Feather name="tag" size={13} color={C.onAccent} />
                  <Text style={styles.clearancePillText}>{t.stall.clearanceOnShort.replace('{n}', String(clearance))}</Text>
                </>
              ) : (
                <Feather name="tag" size={16} color={C.textSecondary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={openCustom}
              accessibilityRole="button"
              accessibilityLabel={t.stall.customSaleTitle}
            >
              <Feather name="hash" size={16} color={C.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => navigation.getParent()?.navigate('StallProducts')}
              accessibilityRole="button"
              accessibilityLabel={t.stall.manageProducts}
            >
              <Feather name="package" size={16} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Serving a regular (optional attribution) */}
        {servingCustomer ? (
          <TouchableOpacity
            style={styles.servingChip}
            activeOpacity={0.7}
            onPress={() => { setCustomerSearch(''); setCustomerPickerVisible(true); }}
            accessibilityRole="button"
            accessibilityLabel={`${t.stall.servingCustomer}: ${servingCustomer.name}. Tap to change.`}
          >
            <Feather name="user" size={13} color={C.bronze} />
            <Text style={styles.servingText} numberOfLines={1}>
              {t.stall.servingCustomer}: {servingCustomer.name}
            </Text>
            <TouchableOpacity
              onPress={() => selectCustomer(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t.stall.clearCustomer}
            >
              <Feather name="x" size={14} color={C.bronze} />
            </TouchableOpacity>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.addCustomerChip}
            onPress={() => { setCustomerSearch(''); setCustomerPickerVisible(true); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.stall.addCustomerChip}
          >
            <Feather name="user-plus" size={13} color={C.textSecondary} />
            <Text style={styles.addCustomerText}>{t.stall.addCustomerChip}</Text>
          </TouchableOpacity>
        )}
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
            <Feather name="search" size={20} color={C.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search products..."
              placeholderTextColor={C.neutral}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={20} color={C.textSecondary} />
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
              const inCartQty = cartQuantityMap[product.id] || 0;

              return (
                <View key={product.id} style={styles.productCardWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.productButton,
                      mode === 'cart' && inCartQty > 0 && styles.productInCart,
                      isSoldOut && styles.productOutOfStock,
                    ]}
                    onPress={() => handleTilePress(product)}
                    onLongPress={() => { lightTap(); setRestockAmount(''); setRestockTarget({ id: product.id, name: product.name }); }}
                    delayLongPress={350}
                    activeOpacity={0.7}
                    disabled={!!isSoldOut}
                    accessibilityLabel={`${product.name}, ${currency} ${priceOf(product).toFixed(2)}${hasQty ? `, ${snap.remainingQty} left` : ''}${isSoldOut ? ', sold out' : ''}`}
                    accessibilityHint={isSoldOut ? 'This product is sold out' : (product.modifiers && product.modifiers.length > 0) ? 'Tap to choose an option. Long-press to restock.' : mode === 'quick' ? 'Tap to sell one. Long-press to restock.' : 'Tap to add to cart. Long-press to restock.'}
                    accessibilityRole="button"
                  >
                    <View style={styles.productInner}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {product.name}
                      </Text>
                      <View style={styles.priceLine}>
                        <Text style={styles.productPrice}>
                          {currency} {priceOf(product).toFixed(2)}
                        </Text>
                        {clearance > 0 && (
                          <Text style={styles.productPriceWas}>{currency} {product.price.toFixed(2)}</Text>
                        )}
                      </View>
                      {product.modifiers && product.modifiers.length > 0 && (
                        <View style={styles.optionsTag}>
                          <Feather name="sliders" size={10} color={C.textSecondary} />
                          <Text style={styles.optionsTagText}>{t.stall.pickOptionTitle}</Text>
                        </View>
                      )}
                      {/* Remaining qty */}
                      {hasQty && !isSoldOut && (
                        <View style={styles.productStock}>
                          <Feather name="package" size={12} color={C.textSecondary} />
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
                  {mode === 'cart' && inCartQty > 0 && (
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

        {/* ── Cart Panel (animated) — cart mode only ── */}
        {mode === 'cart' && (
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
                color={C.bronze}
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
                          <Feather name="trash-2" size={18} color={C.neutral} />
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
                            <Feather name="minus" size={16} color={C.textPrimary} />
                          </TouchableOpacity>
                          <Text style={styles.quantityTextExpanded}>{item.quantity}</Text>
                          <TouchableOpacity
                            style={styles.quantityButtonExpanded}
                            onPress={() => updateQuantity(item.productId, item.quantity + 1)}
                          >
                            <Feather name="plus" size={16} color={C.textPrimary} />
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
                          <Feather name="minus" size={16} color={C.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.quantityText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => updateQuantity(item.productId, item.quantity + 1)}
                        >
                          <Feather name="plus" size={16} color={C.textPrimary} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.cartItemTotal}>
                        <Text style={styles.cartItemTotalText}>
                          {currency} {(item.unitPrice * item.quantity).toFixed(2)}
                        </Text>
                        <TouchableOpacity onPress={() => removeFromCart(item.productId)}>
                          <Feather name="trash-2" size={16} color={C.neutral} />
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
                  <Feather name="shopping-cart" size={48} color={C.textSecondary} />
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
                        color={discountType === 'percentage' ? C.onAccent : C.textSecondary}
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
                          color: discountType === 'fixed' ? C.onAccent : C.textSecondary,
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
                  placeholderTextColor={C.neutral}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
              </View>
            )}

            {/* Totals */}
            <View style={styles.totalsBreakdown}>
              {(cartExpanded || discountAmount > 0) && cart.length > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalRowLabel}>Subtotal</Text>
                  <Text style={styles.totalRowValue}>
                    {currency} {subtotal.toFixed(0)}
                  </Text>
                </View>
              )}
              {discountAmount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalRowLabel, { color: C.positive }]}>
                    Discount{discountType === 'percentage' ? ` (${discountValue}%)` : ''}
                  </Text>
                  <Text style={[styles.totalRowValue, { color: C.positive }]}>
                    -{currency} {discountAmount.toFixed(0)}
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
                  {currency} {totalAmount.toFixed(0)}
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
                accessibilityLabel={`Pay cash, ${currency} ${totalAmount.toFixed(2)}`}
                accessibilityRole="button"
              >
                <Feather name="dollar-sign" size={18} color={cart.length > 0 ? C.textPrimary : C.neutral} />
                <Text style={[styles.cashButtonText, cart.length === 0 && { color: C.neutral }]}>
                  Cash
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.qrButton, cart.length === 0 && styles.qrButtonDisabled]}
                onPress={() => handleCheckout('qr')}
                activeOpacity={0.85}
                disabled={cart.length === 0}
                accessibilityLabel={`Pay QR, ${currency} ${totalAmount.toFixed(2)}`}
                accessibilityRole="button"
              >
                <Feather name="smartphone" size={18} color={cart.length > 0 ? C.onAccent : C.neutral} />
                <Text style={[styles.qrButtonText, cart.length === 0 && { color: C.neutral }]}>
                  QR
                </Text>
              </TouchableOpacity>

              {/* Card — Tap to Pay. Only when configured for this device/build.
                  Offline: stays visible but muted; tapping explains why. */}
              {cardConfigured && (
                <TouchableOpacity
                  style={[styles.cashButton, cardOffline && { opacity: 0.5 }]}
                  onPress={openCardCheckout}
                  activeOpacity={0.85}
                  disabled={cart.length === 0}
                  accessibilityLabel={`${t.tapToPay.card}, ${currency} ${totalAmount.toFixed(2)}`}
                  accessibilityRole="button"
                >
                  <Feather name="wifi" size={18} color={cart.length > 0 ? C.textPrimary : C.neutral} />
                  <Text style={[styles.cashButtonText, cart.length === 0 && { color: C.neutral }]}>
                    {t.tapToPay.card}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Animated.View>
        )}
      </View>

      {/* ═══ Ledger — today's sales (tap to edit / void) ═══ */}
      <Modal
        visible={ledgerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { setLedgerVisible(false); setEditingSaleId(null); }}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => { setLedgerVisible(false); setEditingSaleId(null); }}>
          <View style={styles.sheetCard} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t.stall.todaysSales}</Text>
            {session.sales.length === 0 ? (
              <Text style={styles.ledgerEmpty}>{t.stall.noSalesYetSession}</Text>
            ) : (
              <ScrollView
                style={styles.ledgerScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {[...session.sales].reverse().map((sale) => {
                  const editing = editingSaleId === sale.id;
                  return (
                    <View key={sale.id} style={styles.ledgerRow}>
                      <TouchableOpacity
                        style={styles.ledgerRowMain}
                        activeOpacity={0.7}
                        onPress={() => setEditingSaleId(editing ? null : sale.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${sale.productName}, ${currency} ${sale.total.toFixed(2)}, ${sale.paymentMethod}. Tap to edit.`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.ledgerName} numberOfLines={1}>
                            {sale.productName}{sale.quantity > 1 ? ` ×${sale.quantity}` : ''}
                          </Text>
                          <Text style={styles.ledgerMeta}>
                            {sale.paymentMethod === 'cash' ? t.stall.cashPrefix : sale.paymentMethod === 'qr' ? t.stall.qrPrefix : t.tapToPay.card}
                          </Text>
                        </View>
                        <Text style={styles.ledgerTotal}>{currency} {sale.total.toFixed(2)}</Text>
                        <Feather name={editing ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
                      </TouchableOpacity>
                      {editing && (
                        <View style={styles.ledgerEdit}>
                          {!sale.isCustom && (
                            <View style={styles.ledgerStepper}>
                              <TouchableOpacity
                                style={styles.ledgerStepBtn}
                                onPress={() => updateSale(sale.id, { quantity: sale.quantity - 1 })}
                                accessibilityLabel="Decrease quantity"
                              >
                                <Feather name="minus" size={14} color={C.textPrimary} />
                              </TouchableOpacity>
                              <Text style={styles.ledgerQty}>{sale.quantity}</Text>
                              <TouchableOpacity
                                style={styles.ledgerStepBtn}
                                onPress={() => updateSale(sale.id, { quantity: sale.quantity + 1 })}
                                accessibilityLabel="Increase quantity"
                              >
                                <Feather name="plus" size={14} color={C.textPrimary} />
                              </TouchableOpacity>
                            </View>
                          )}
                          {sale.pspTransactionId ? (
                            // Card-charged sale: method is locked (relabeling can't
                            // move a real card charge). No charge ever happens here.
                            <View style={[styles.ledgerPayToggle, { alignItems: 'center' }]}>
                              <Feather name="lock" size={12} color={C.textMuted} />
                              <Text style={[styles.ledgerPayText, { color: C.textMuted, marginLeft: 6 }]}>{t.tapToPay.lockedMethod}</Text>
                            </View>
                          ) : (
                            <View style={styles.ledgerPayToggle}>
                              <TouchableOpacity
                                style={[styles.ledgerPayBtn, sale.paymentMethod === 'cash' && styles.ledgerPayActive]}
                                onPress={() => updateSale(sale.id, { paymentMethod: 'cash' })}
                              >
                                <Text style={[styles.ledgerPayText, sale.paymentMethod === 'cash' && styles.ledgerPayTextActive]}>{t.stall.cashPrefix}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.ledgerPayBtn, sale.paymentMethod === 'qr' && styles.ledgerPayActive]}
                                onPress={() => updateSale(sale.id, { paymentMethod: 'qr' })}
                              >
                                <Text style={[styles.ledgerPayText, sale.paymentMethod === 'qr' && styles.ledgerPayTextActive]}>{t.stall.qrPrefix}</Text>
                              </TouchableOpacity>
                              {cardConfigured && (
                                <TouchableOpacity
                                  style={[styles.ledgerPayBtn, sale.paymentMethod === 'card' && styles.ledgerPayActive]}
                                  onPress={() => updateSale(sale.id, { paymentMethod: 'card' })}
                                >
                                  <Text style={[styles.ledgerPayText, sale.paymentMethod === 'card' && styles.ledgerPayTextActive]}>{t.tapToPay.card}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                          <TouchableOpacity
                            style={styles.ledgerVoid}
                            onPress={() => { removeSale(sale.id); setEditingSaleId(null); lightTap(); }}
                            accessibilityLabel={t.stall.voidSale}
                          >
                            <Feather name="trash-2" size={16} color={C.bronze} />
                            <Text style={styles.ledgerVoidText}>{t.stall.voidSale}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ═══ Custom-amount sale ═══ */}
      <Modal
        visible={customVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCustomVisible(false)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => { Keyboard.dismiss(); setCustomVisible(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.centerKav}
            pointerEvents="box-none"
          >
            <View style={styles.centerCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.centerTitle}>{t.stall.customSaleTitle}</Text>
              <View style={styles.customAmountRow}>
                <Text style={styles.customCurrency}>{currency}</Text>
                <TextInput
                  style={styles.customAmountInput}
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  placeholder="0.00"
                  placeholderTextColor={C.neutral}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectionColor={C.accent}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                />
              </View>
              <TextInput
                style={styles.customLabelInput}
                value={customLabel}
                onChangeText={setCustomLabel}
                placeholder={t.stall.customLabelPlaceholder}
                placeholderTextColor={C.neutral}
                selectionColor={C.accent}
                keyboardAppearance={isDark ? 'dark' : 'light'}
              />
              <View style={styles.customPayRow}>
                <TouchableOpacity
                  style={[styles.customPayBtn, customMethod === 'cash' && styles.customPayActive]}
                  onPress={() => setCustomMethod('cash')}
                >
                  <Feather name="dollar-sign" size={15} color={customMethod === 'cash' ? C.onAccent : C.textSecondary} />
                  <Text style={[styles.customPayText, customMethod === 'cash' && { color: C.onAccent }]}>{t.stall.cashPrefix}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.customPayBtn, customMethod === 'qr' && styles.customPayActive]}
                  onPress={() => setCustomMethod('qr')}
                >
                  <Feather name="smartphone" size={15} color={customMethod === 'qr' ? C.onAccent : C.textSecondary} />
                  <Text style={[styles.customPayText, customMethod === 'qr' && { color: C.onAccent }]}>{t.stall.qrPrefix}</Text>
                </TouchableOpacity>
                {cardConfigured && (
                  <TouchableOpacity
                    style={[styles.customPayBtn, customMethod === 'card' && styles.customPayActive]}
                    onPress={() => setCustomMethod('card')}
                  >
                    <Feather name="wifi" size={15} color={customMethod === 'card' ? C.onAccent : C.textSecondary} />
                    <Text style={[styles.customPayText, customMethod === 'card' && { color: C.onAccent }]}>{t.tapToPay.card}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {customLabel.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.saveProductRow}
                  onPress={() => setCustomSaveProduct((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: customSaveProduct }}
                >
                  <Feather name={customSaveProduct ? 'check-square' : 'square'} size={18} color={customSaveProduct ? C.bronze : C.textSecondary} />
                  <Text style={styles.saveProductText}>{t.stall.saveAsProduct}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.centerBtns}>
                <TouchableOpacity style={[styles.centerBtn, styles.centerCancelBtn]} onPress={() => { Keyboard.dismiss(); setCustomVisible(false); }}>
                  <Text style={styles.centerCancelText}>{t.common.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.centerBtn, styles.centerPrimaryBtn]} onPress={handleConfirmCustom}>
                  <Text style={styles.centerPrimaryText}>{t.stall.addSaleBtn}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ═══ Restock during session ═══ */}
      <Modal
        visible={!!restockTarget}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRestockTarget(null)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => { Keyboard.dismiss(); setRestockTarget(null); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.centerKav}
            pointerEvents="box-none"
          >
            <View style={styles.centerCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.centerTitle}>{t.stall.restockTitle}</Text>
              {!!restockTarget && <Text style={styles.restockName} numberOfLines={1}>{restockTarget.name}</Text>}
              <View style={styles.customAmountRow}>
                <Feather name="package" size={18} color={C.textSecondary} />
                <TextInput
                  style={styles.customAmountInput}
                  value={restockAmount}
                  onChangeText={(v) => setRestockAmount(v.replace(/[^0-9]/g, ''))}
                  placeholder={t.stall.restockPlaceholder}
                  placeholderTextColor={C.neutral}
                  keyboardType="number-pad"
                  autoFocus
                  selectionColor={C.accent}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                />
              </View>
              <View style={styles.centerBtns}>
                <TouchableOpacity style={[styles.centerBtn, styles.centerCancelBtn]} onPress={() => { Keyboard.dismiss(); setRestockTarget(null); }}>
                  <Text style={styles.centerCancelText}>{t.common.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.centerBtn, styles.centerPrimaryBtn]} onPress={handleConfirmRestock}>
                  <Text style={styles.centerPrimaryText}>{t.stall.restockBtn}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ═══ Customer picker (who's buying) ═══ */}
      <Modal
        visible={customerPickerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCustomerPickerVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => { Keyboard.dismiss(); setCustomerPickerVisible(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetKav}
            pointerEvents="box-none"
          >
            <View style={styles.sheetCard} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>{t.stall.pickCustomerTitle}</Text>

              <View style={styles.customerSearchRow}>
                <Feather name="search" size={16} color={C.textSecondary} />
                <TextInput
                  style={styles.customerSearchInput}
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  placeholder={t.stall.searchRegulars}
                  placeholderTextColor={C.neutral}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
              </View>

              <TouchableOpacity style={styles.customerRow} onPress={() => selectCustomer(null)} activeOpacity={0.7}>
                <View style={styles.customerWalkIn}>
                  <Feather name="users" size={16} color={C.textSecondary} />
                </View>
                <Text style={styles.customerRowName}>{t.stall.clearCustomer}</Text>
                {servingCustomerId === null && <Feather name="check" size={16} color={C.bronze} />}
              </TouchableOpacity>

              {regularCustomers.length === 0 ? (
                <Text style={styles.ledgerEmpty}>{t.stall.noRegularsYet}</Text>
              ) : (
                <ScrollView
                  style={styles.customerScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {filteredCustomers.map((c) => {
                    const progress = loyaltyProgressText(c.visitCount);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.customerRow, servingCustomerId === c.id && styles.customerRowActive]}
                        onPress={() => selectCustomer(c.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.customerAvatar}>
                          <Text style={styles.customerAvatarText}>{c.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.customerRowName} numberOfLines={1}>{c.name}</Text>
                          {!!progress && <Text style={styles.customerRowMeta}>{progress}</Text>}
                        </View>
                        {servingCustomerId === c.id && <Feather name="check" size={16} color={C.bronze} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ═══ Clearance ═══ */}
      <Modal
        visible={clearanceVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setClearanceVisible(false)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => { Keyboard.dismiss(); setClearanceVisible(false); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centerKav} pointerEvents="box-none">
            <View style={styles.centerCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.centerTitle}>{t.stall.clearanceTitle}</Text>
              <View style={styles.customAmountRow}>
                <Feather name="tag" size={18} color={C.textSecondary} />
                <TextInput
                  style={styles.customAmountInput}
                  value={clearanceInput}
                  onChangeText={(v) => setClearanceInput(v.replace(/[^0-9]/g, ''))}
                  placeholder={t.stall.clearancePlaceholder}
                  placeholderTextColor={C.neutral}
                  keyboardType="number-pad"
                  autoFocus
                  selectionColor={C.accent}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                />
                <Text style={styles.customCurrency}>%</Text>
              </View>
              <View style={styles.centerBtns}>
                <TouchableOpacity style={[styles.centerBtn, styles.centerCancelBtn]} onPress={clearClearance}>
                  <Text style={styles.centerCancelText}>{t.stall.clearanceClear}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.centerBtn, styles.centerPrimaryBtn]} onPress={applyClearance}>
                  <Text style={styles.centerPrimaryText}>{t.stall.clearanceApply}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ═══ Modifier chooser ═══ */}
      <Modal
        visible={!!modifierProduct}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setModifierProduct(null)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => setModifierProduct(null)}>
          <View style={styles.centerKav} pointerEvents="box-none">
            <View style={styles.centerCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.centerTitle}>{modifierProduct?.name}</Text>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => modifierProduct && handleModifierSale(modifierProduct, null)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionName}>{t.stall.optionNone}</Text>
                <Text style={styles.optionPrice}>{currency} {modifierProduct ? priceOf(modifierProduct).toFixed(2) : ''}</Text>
              </TouchableOpacity>
              {modifierProduct?.modifiers?.map((m) => {
                const unit = modifierProduct ? Math.round((priceOf(modifierProduct) + m.priceDelta) * 100) / 100 : 0;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.optionRow}
                    onPress={() => modifierProduct && handleModifierSale(modifierProduct, m)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionName}>
                      {m.label}{m.priceDelta ? ` (${m.priceDelta > 0 ? '+' : ''}${m.priceDelta})` : ''}
                    </Text>
                    <Text style={styles.optionPrice}>{currency} {unit.toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Tap to Pay charge sheet — shared by cart + custom-amount card flows. */}
      <TapToPaySheet
        visible={!!cardSheet}
        amountCents={cardSheet?.amountCents ?? 0}
        label={cardSheet?.label ?? ''}
        metadata={{ mode: 'stall', refId: session?.id ?? 'stall' }}
        onSuccess={(txnId) => {
          const cb = cardSheet?.onDone;
          setCardSheet(null);
          cb?.(txnId);
        }}
        onClose={() => setCardSheet(null)}
      />
    </SafeAreaView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  // ─── Session header ────────────────────────────────────
  sessionHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: withAlpha(C.bronze, 0.04),
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(C.bronze, 0.12),
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionTotal: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  sessionSplit: {
    ...TYPE.muted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  sessionSaleCount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    backgroundColor: withAlpha(C.bronze, 0.10),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  productCardWrapper: {
    width: '47.5%',
    aspectRatio: 1,
    overflow: 'visible',
  },
  productButton: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  productInCart: {
    borderColor: withAlpha(C.bronze, 0.3),
    backgroundColor: withAlpha(C.bronze, 0.04),
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
    color: C.textPrimary,
    marginBottom: SPACING.sm,
  },
  productPrice: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  productStock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  productStockText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  soldOutLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.neutral,
    marginTop: SPACING.xs,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: RADIUS.full,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 2,
  },
  cartBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },
  noResults: {
    width: '100%',
    paddingVertical: SPACING['3xl'],
    alignItems: 'center',
  },
  noResultsText: {
    ...TYPE.muted,
    color: C.textSecondary,
  },

  // ─── Cart panel ────────────────────────────────────────
  cartSection: {
    backgroundColor: C.surface,
    borderLeftWidth: 1,
    borderLeftColor: C.border,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: withAlpha(C.bronze, 0.03),
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
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  clearCart: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.neutral,
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
    borderBottomColor: C.border,
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 2,
  },
  cartItemPrice: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
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
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  quantityText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
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
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // Expanded cart items
  cartItemExpanded: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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
    color: C.textPrimary,
    marginRight: SPACING.md,
  },
  cartItemExpandedBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartItemPriceExpanded: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
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
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  quantityTextExpanded: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
    minWidth: 30,
    textAlign: 'center',
  },
  cartItemTotalExpanded: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
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
    color: C.textSecondary,
    marginTop: SPACING.md,
  },

  // Cart footer
  cartFooter: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: SPACING.md,
  },

  // Discount
  discountSection: {
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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
    color: C.textPrimary,
  },
  discountTypeToggle: {
    flexDirection: 'row',
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  discountTypeButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountTypeActive: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.md,
  },
  discountInput: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textSecondary,
  },
  totalRowValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  totalRowFinal: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  totalAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  cashButtonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  qrButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 52,
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
  },
  qrButtonDisabled: {
    backgroundColor: C.border,
  },
  qrButtonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
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
    color: C.textSecondary,
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
    borderColor: C.bronze,
    minHeight: 44,
  },
  addProductsText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },

  // ─── Header: sale-count pill + controls row ────────────
  saleCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.10),
    minHeight: 32,
  },
  saleCountText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: C.background,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    padding: 2,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    minHeight: 32,
  },
  modeBtnActive: {
    backgroundColor: C.bronze,
  },
  modeBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  modeBtnTextActive: {
    color: C.onAccent,
  },
  controlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  payDefaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.3),
    backgroundColor: withAlpha(C.bronze, 0.06),
    minHeight: 36,
  },
  payDefaultText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  clearancePillOn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    height: 36,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.bronze,
  },
  clearancePillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    fontVariant: ['tabular-nums'],
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  productPriceWas: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textDecorationLine: 'line-through',
  },
  optionsTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: SPACING.xs,
  },
  optionsTagText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  optionName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flex: 1,
  },
  optionPrice: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },

  // ─── Ledger (bottom sheet) ─────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING['2xl'],
    maxHeight: '72%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    ...SHADOWS.lg,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  ledgerEmpty: {
    ...TYPE.muted,
    textAlign: 'center',
    paddingVertical: SPACING['2xl'],
  },
  ledgerScroll: {
    flexGrow: 0,
  },
  ledgerRow: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  ledgerRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  ledgerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  ledgerMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },
  ledgerTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  ledgerEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  ledgerStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  ledgerStepBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  ledgerQty: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  ledgerPayToggle: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  ledgerPayBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    minHeight: 32,
    justifyContent: 'center',
  },
  ledgerPayActive: {
    backgroundColor: C.bronze,
  },
  ledgerPayText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  ledgerPayTextActive: {
    color: C.onAccent,
  },
  ledgerVoid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    minHeight: 32,
  },
  ledgerVoidText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },

  // ─── Centered card modals (custom / restock) ───────────
  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  centerKav: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  centerCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    gap: SPACING.md,
    ...SHADOWS.lg,
  },
  centerTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  restockName: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    marginTop: -SPACING.xs,
  },
  customAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  customCurrency: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  customAmountInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  customLabelInput: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  customPayRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  customPayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 48,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  customPayActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  customPayText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  saveProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  saveProductText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  centerBtns: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  centerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCancelBtn: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  centerPrimaryBtn: {
    backgroundColor: C.bronze,
  },
  centerCancelText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  centerPrimaryText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // ─── Serving customer chip ─────────────────────────────
  servingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.10),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.3),
    maxWidth: '100%',
  },
  servingText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    flexShrink: 1,
  },
  addCustomerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 30,
  },
  addCustomerText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },

  // ─── Customer picker sheet ─────────────────────────────
  sheetKav: {
    width: '100%',
  },
  customerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  customerSearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    padding: 0,
  },
  customerScroll: {
    flexGrow: 0,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  customerRowActive: {
    backgroundColor: withAlpha(C.bronze, 0.04),
  },
  customerWalkIn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  customerAvatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.bronze, 0.12),
  },
  customerAvatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
  },
  customerRowName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  customerRowMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    marginTop: 2,
  },
});

export default SellScreen;
