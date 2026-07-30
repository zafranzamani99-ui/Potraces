import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
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
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing as ReEasing,
} from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import { useT } from '../../i18n';
import { StallProduct, StallModifier } from '../../types';

import { successNotification, lightTap } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';
import { useNetInfo } from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import TapToPaySheet from '../../components/common/TapToPaySheet';
import { tapToPayAvailable } from '../../services/tapToPay';
import QrPaySheet from '../../components/common/QrPaySheet';
import { qrProviderConfigured, createQrCharge } from '../../services/qrProvider';
import { resolvePendingPayments } from '../../services/qrPaymentResolver';
import { usePendingPaymentsStore } from '../../store/pendingPaymentsStore';
import NewstInput, { newstOutline } from '../../components/business/NewstInput';
import { useNeu } from '../../components/common/neu';
import NeuIconButton from '../../components/common/NeuIconButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CART_COLLAPSED_WIDTH = SCREEN_WIDTH * 0.30;
const CART_EXPANDED_WIDTH = SCREEN_WIDTH * 0.88;

// Expanding search — collapsed circle width + the web pattern's ease curve.
// Animated with Reanimated so the width tween runs on the UI thread (60/120Hz)
// instead of the JS thread (which is why the JS-driver version felt like 30Hz).
const SEARCH_COLLAPSED = 40;
const SEARCH_EASING = ReEasing.bezier(0.16, 1, 0.3, 1);

interface CartItem {
  // Unique cart line: productId + '|' + (modifier label || ''). Lets the same
  // product appear as separate lines per chosen option.
  lineKey: string;
  productId: string;
  productName: string;
  modifierLabel?: string;
  unitPrice: number;
  quantity: number;
}

const SellScreen: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const t = useT();

  // Responsive register grid — 2 columns on phones, 3 on small tablets,
  // 4 on iPad. Recalculates on rotation / Stage Manager resize.
  const { width: windowWidth } = useWindowDimensions();
  const gridColumns = windowWidth >= 1000 ? 4 : windowWidth >= 700 ? 3 : 2;
  // Widths leave room for the SPACING.md column gap so 2 tiles reliably fit one row
  // (47.8% was exactly half → the gap tipped the 2nd tile onto its own row).
  const productTileWidth = gridColumns === 4 ? '23%' : gridColumns === 3 ? '31%' : '47%';
  const {
    products, getActiveSession, resumeSession, addSale, quickSale, addCustomSale,
    updateSale, removeSale, restockProduct, setSessionDefaultPayment, addProduct,
    regularCustomers, recordVisit, loyalty, setClearance, categories,
  } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();
  // Keyboard state — lifts the cart footer's discount field above the keyboard
  // (CLAUDE.md "Scroll screens": a tapped input must never hide behind it).
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();

  // Tap to Pay (card) availability — re-renders on connectivity change so the
  // Card option enables/disables live. `cardConfigured` = this device/build can
  // ever show card; `cardOffline` = configured but currently offline (button
  // stays visible-but-disabled and taps explain why).
  useNetInfo();
  const cardAvail = tapToPayAvailable();
  const cardConfigured = cardAvail.available || cardAvail.reason === 'offline';
  const cardOffline = !cardAvail.available;
  const [cardSheet, setCardSheet] = useState<null | { amountCents: number; label: string; onDone: (txnId: string) => void }>(null);

  // DuitNow QR pay sheet (stall mode is business mode). Two QR paths:
  //  • provider (Fiuu, when configured): a PSP-issued exact-amount QR + live
  //    "waiting" state; the webhook confirms and the sheet auto-completes.
  //  • static fallback: the seller's stored QR with the amount embedded; the
  //    seller confirms by eye (both sheet actions complete the 'qr' sale).
  const businessQrs = useSettingsStore((s) => s.businessPaymentQrs) || [];
  const qrForPay = useMemo(() => businessQrs.find((q) => q.payload) || businessQrs[0], [businessQrs]);
  const [qrSheet, setQrSheet] = useState<null | {
    amountCents: number;
    onComplete: () => void;
    providerPayload?: string;
    chargeId?: string;
    refId?: string;
  }>(null);
  const addPending = usePendingPaymentsStore((s) => s.addPending);

  // Create a provider charge; returns null on any failure (caller falls back
  // to the static QR — a PSP hiccup must never block a sale).
  const startProviderCharge = useCallback(async (amountCents: number, label: string) => {
    if (!qrProviderConfigured()) return null;
    try {
      const refId = `st${Array.from(Crypto.getRandomBytes(9)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
      const { qrPayload, chargeId } = await createQrCharge({ amountCents, refId, mode: 'stall' });
      addPending({
        id: chargeId,
        refId,
        amountCents,
        createdAt: new Date().toISOString(),
        label,
        mode: 'stall',
      });
      return { providerPayload: qrPayload, chargeId, refId };
    } catch {
      return null;
    }
  }, [addPending]);

  // While a provider QR is on screen, poll payment_events every 4s (QR validity
  // is 180s → ≤45 light polls). A hit auto-completes the sale; closing the
  // sheet or the 30-min store prune stops it.
  useEffect(() => {
    if (!qrSheet?.providerPayload || !qrSheet.chargeId) return;
    let cancelled = false;
    const tick = async () => {
      const resolved = await resolvePendingPayments();
      if (cancelled) return;
      const hit = resolved.find((p) => p.id === qrSheet.chargeId || p.refId === qrSheet.refId);
      if (hit) {
        successNotification();
        showToast(t.qrPay.paymentReceivedToast, 'success');
        qrSheet.onComplete();
      }
    };
    tick();
    const interval = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [qrSheet, showToast, t]);

  // Sell mode: quick (1 tap = 1 sale) vs cart (multi-item)
  const [mode, setMode] = useState<'quick' | 'cart'>('quick');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Category filter pills ('all' | lowercase category name from Settings)
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Expanding search — collapsed 40px circle, expands to the full browse-row
  // width on focus (same curve as the web pattern: cubic-bezier(0.16,1,0.3,1)).
  const [searchOpen, setSearchOpen] = useState(false);
  const [browseRowWidth, setBrowseRowWidth] = useState(0);
  // Category selector (replaces the horizontal pills) → a centered floating modal.
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const searchWidth = useSharedValue(SEARCH_COLLAPSED);
  const searchAnimStyle = useAnimatedStyle(() => ({ width: searchWidth.value }));
  // Category button opacity tracks the search width — it fades back in DURING
  // the collapse instead of waiting for the animation's end callback (~0.4s
  // of empty row), and fades out while expanding.
  const catBtnAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.max((searchWidth.value - SEARCH_COLLAPSED) / 80, 0), 1),
  }));
  const searchInputRef = useRef<TextInput>(null);

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
  // Block-and-prompt when the session is paused (bug 6f). Reads fresh store state
  // on each call, so it stays correct even inside memoized sale handlers.
  const promptResumeIfPaused = useCallback(() => {
    const s = getActiveSession();
    if (!s?.paused) return false;
    Alert.alert(t.stall.stallPausedTitle, t.stall.resumeToSellPrompt, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.stall.resumeSession, onPress: () => resumeSession() },
    ]);
    return true;
  }, [getActiveSession, resumeSession, t]);
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

  // Category pills — the exact product category list from Settings
  // (StallCategoryManager), in its custom order. Uncategorized products are
  // still reachable under "all"; there is no "Other" bucket.
  const categoryPills = useMemo(
    () => (categories || []).map((c) => ({ value: c.name.toLowerCase(), label: c.name, icon: c.icon })),
    [categories],
  );

  // Selection may outlive its category (renamed/deleted elsewhere) — fall back to 'all'.
  const effectiveCategory = categoryPills.some((p) => p.value === selectedCategory) ? selectedCategory : 'all';

  // Selected-category label + icon for the dropdown button.
  const selectedPill = categoryPills.find((p) => p.value === effectiveCategory);
  const selectedCatLabel = effectiveCategory === 'all' ? t.stall.allCategories : (selectedPill?.label ?? t.stall.allCategories);
  const selectedCatIcon = (effectiveCategory === 'all' ? 'layers' : (selectedPill?.icon ?? 'layers')) as keyof typeof Feather.glyphMap;

  const openCatDropdown = useCallback(() => {
    lightTap();
    setCatDropdownOpen(true);
  }, []);

  // Filtered products — category first, then the search query
  const filteredProducts = useMemo(() => {
    let list = activeProducts;
    if (effectiveCategory !== 'all') {
      list = list.filter((p) => p.category?.trim().toLowerCase() === effectiveCategory);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [activeProducts, effectiveCategory, searchQuery]);

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

  // ── Expanding search (web pattern: width tween, ease-out-expo style) ──
  const expandSearch = useCallback(() => {
    setSearchOpen(true);
    lightTap();
    searchWidth.value = withTiming(
      (browseRowWidth || windowWidth - SPACING.lg * 2) - SPACING.sm,
      { duration: 380, easing: SEARCH_EASING },
    );
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [searchWidth, browseRowWidth, windowWidth]);

  const collapseSearch = useCallback(() => {
    Keyboard.dismiss();
    // Flip searchOpen NOW (not in the animation callback) so the category button
    // comes back in sync with the shrink instead of ~0.5s late.
    setSearchOpen(false);
    searchWidth.value = withTiming(SEARCH_COLLAPSED, { duration: 380, easing: SEARCH_EASING });
  }, [searchWidth]);

  // Track the browse row's real width (cart panel / rotation / iPad resize).
  // While the search is open, keep it snapped to the live row width.
  const handleBrowseRowLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      const w = e.nativeEvent.layout.width;
      setBrowseRowWidth(w);
      if (searchOpen) searchWidth.value = w - SPACING.sm;
    },
    [searchOpen, searchWidth],
  );

  // ── Cart helpers ──
  const addToCart = useCallback(
    (productId: string, modifier?: StallModifier | null) => {
      if (!session) return;
      const product = activeProducts.find((p) => p.id === productId);
      if (!product) return;

      const snap = snapshotMap[productId];
      if (snap && snap.startQty > 0 && snap.remainingQty <= 0) return;

      const modLabel = modifier?.label;
      const lineKey = productId + '|' + (modLabel || '');
      const displayName = modifier ? `${product.name} (${modifier.label})` : product.name;
      const unitPrice = Math.max(0, Math.round((priceOf(product) + (modifier?.priceDelta || 0)) * 100) / 100);

      setCart((prev) => {
        // Stock cap counts ALL lines of this product (across option variants).
        const productQtyInCart = prev.reduce((s, i) => (i.productId === productId ? s + i.quantity : s), 0);
        const maxQty = snap && snap.startQty > 0 ? snap.remainingQty : Infinity;
        if (productQtyInCart >= maxQty) return prev;

        const existing = prev.find((i) => i.lineKey === lineKey);
        if (existing) {
          return prev.map((i) => (i.lineKey === lineKey ? { ...i, quantity: i.quantity + 1 } : i));
        }
        return [
          ...prev,
          { lineKey, productId, productName: displayName, modifierLabel: modLabel, unitPrice, quantity: 1 },
        ];
      });
    },
    [session, activeProducts, snapshotMap, priceOf],
  );

  const updateQuantity = useCallback(
    (lineKey: string, quantity: number) => {
      setCart((prev) => {
        const item = prev.find((i) => i.lineKey === lineKey);
        if (!item) return prev;
        if (quantity <= 0) return prev.filter((i) => i.lineKey !== lineKey);
        const snap = snapshotMap[item.productId];
        if (snap && snap.startQty > 0) {
          // Cap across all lines of the same product (option variants share stock).
          const otherQty = prev.reduce((s, i) => (i.productId === item.productId && i.lineKey !== lineKey ? s + i.quantity : s), 0);
          if (quantity + otherQty > snap.remainingQty) return prev;
        }
        return prev.map((i) => (i.lineKey === lineKey ? { ...i, quantity } : i));
      });
    },
    [snapshotMap],
  );

  const removeFromCart = useCallback((lineKey: string) => {
    setCart((prev) => prev.filter((i) => i.lineKey !== lineKey));
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
    for (const item of cart) map[item.productId] = (map[item.productId] || 0) + item.quantity;
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
      if (promptResumeIfPaused()) return;

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
    [cart, session, addSale, collapseCart, showToast, subtotal, discountAmount, t, servingCustomerId, recordServingVisit, promptResumeIfPaused],
  );
  const guardedCheckout = useSubmitGuard(handleCheckout);

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

  // ── QR cart checkout: try a PSP-issued exact-amount DuitNow QR first (live
  // confirmation via webhook); fall back to the seller's static QR with manual
  // confirm, then to today's one-tap behavior when no QR is set up at all.
  const openQrCheckout = useCallback(() => {
    if (cart.length === 0 || !session) return;
    const amountCents = Math.round(totalAmount * 100);
    const names = cart.map((i) => i.productName).join(', ');
    const finish = () => { setQrSheet(null); handleCheckout('qr'); };
    if (qrProviderConfigured()) {
      startProviderCharge(amountCents, names || t.stall.todaysSales).then((charge) => {
        if (charge) {
          setQrSheet({ amountCents, onComplete: finish, ...charge });
        } else if (qrForPay) {
          setQrSheet({ amountCents, onComplete: finish });
        } else {
          guardedCheckout('qr');
        }
      });
      return;
    }
    if (!qrForPay) { guardedCheckout('qr'); return; }
    setQrSheet({ amountCents, onComplete: finish });
  }, [cart, session, qrForPay, totalAmount, handleCheckout, guardedCheckout, startProviderCharge, t]);
  const guardedOpenQrCheckout = useSubmitGuard(openQrCheckout);

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

  // ── Chosen a modifier: cart mode → add to cart; quick mode → immediate sale ──
  const handleModifierSale = useCallback(
    (product: StallProduct, modifier: StallModifier | null) => {
      setModifierProduct(null);
      if (mode === 'cart') {
        addToCart(product.id, modifier);
        return;
      }
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
      if (!id) return;
      successNotification();
      recordServingVisit();
      showToast(`${name} · ${currency}${unit.toFixed(0)}`, 'success', {
        label: t.stall.undo,
        onPress: () => removeSale(id),
      });
    },
    [mode, addToCart, addSale, priceOf, defaultPayment, servingCustomerId, recordServingVisit, removeSale, showToast, currency, t],
  );
  const guardedModifierSale = useSubmitGuard(handleModifierSale);

  // ── Tile press dispatcher: modifier chooser, else quick/cart ──
  const handleTilePress = useCallback(
    (product: StallProduct) => {
      if (promptResumeIfPaused()) return;
      if (product.modifiers && product.modifiers.length > 0) {
        setModifierProduct(product);
        return;
      }
      if (mode === 'quick') handleQuickSale(product);
      else addToCart(product.id);
    },
    [mode, handleQuickSale, addToCart, promptResumeIfPaused],
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
  }, [session, promptResumeIfPaused]);

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
    if (customMethod === 'qr') {
      // Provider first (live confirmation), static QR fallback, plain record last.
      const amountCents = Math.round(amt * 100);
      const finish = () => { setQrSheet(null); finishCustomSale(amt, label, save); };
      setCustomVisible(false);
      Keyboard.dismiss();
      setTimeout(() => {
        if (qrProviderConfigured()) {
          startProviderCharge(amountCents, label || t.stall.customSale).then((charge) => {
            if (charge) setQrSheet({ amountCents, onComplete: finish, ...charge });
            else if (qrForPay) setQrSheet({ amountCents, onComplete: finish });
            else finishCustomSale(amt, label, save);
          });
          return;
        }
        if (qrForPay) { setQrSheet({ amountCents, onComplete: finish }); return; }
        finishCustomSale(amt, label, save);
      }, 60);
      return;
    }
    setCustomVisible(false);
    Keyboard.dismiss();
    finishCustomSale(amt, label, save);
  }, [customAmount, customLabel, customMethod, customSaveProduct, cardOffline, qrForPay, finishCustomSale, startProviderCharge, showToast, t]);
  const guardedConfirmCustom = useSubmitGuard(handleConfirmCustom);

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
  const guardedConfirmRestock = useSubmitGuard(handleConfirmRestock);

  // ─── POS toolbar — register controls only. The money hero lives on Home;
  // here the only count is how many sales sit on the ledger. Shared by the
  // main selling UI and the no-products empty state. ───
  const toolbar = (
    <View style={styles.sessionHeader}>
      <View style={styles.headerInner}>
        {/* Register tools: mode + ledger + clearance + custom amount */}
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
              <Feather name="zap" size={14} color={mode === 'quick' ? C.onAccent : C.textSecondary} />
              <Text style={[styles.modeBtnText, mode === 'quick' && styles.modeBtnTextActive]}>{t.stall.quickMode}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'cart' && styles.modeBtnActive]}
              onPress={() => { lightTap(); setMode('cart'); }}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'cart' }}
              accessibilityLabel={t.stall.cartMode}
            >
              <Feather name="shopping-cart" size={14} color={mode === 'cart' ? C.onAccent : C.textSecondary} />
              <Text style={[styles.modeBtnText, mode === 'cart' && styles.modeBtnTextActive]}>{t.stall.cartMode}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlsRight}>
            {/* Ledger — today's sales (view / edit / void) */}
            <TouchableOpacity
              style={[styles.ledgerBtn, neu.raised]}
              onPress={() => setLedgerVisible(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${session?.sales.length ?? 0} sales. Tap to view and edit.`}
            >
              <Feather name="list" size={14} color={C.bronze} />
              <Text style={styles.ledgerBtnText}>{session?.sales.length ?? 0}</Text>
            </TouchableOpacity>
            {clearance > 0 ? (
              <TouchableOpacity
                style={styles.clearancePillOn}
                onPress={openClearance}
                accessibilityRole="button"
                accessibilityLabel={`Clearance ${clearance} percent off`}
              >
                <Feather name="tag" size={14} color={C.onAccent} />
                <Text style={styles.clearancePillText}>{t.stall.clearanceOnShort.replace('{n}', String(clearance))}</Text>
              </TouchableOpacity>
            ) : (
              <NeuIconButton
                size={40}
                radius={13}
                onPress={openClearance}
                accessibilityLabel={t.stall.clearanceTitle}
              >
                <Feather name="tag" size={17} color={C.textSecondary} />
              </NeuIconButton>
            )}
            <NeuIconButton
              size={40}
              radius={13}
              onPress={openCustom}
              accessibilityLabel={t.stall.customSaleTitle}
            >
              <Feather name="hash" size={19} color={C.textSecondary} />
            </NeuIconButton>
          </View>
        </View>

        {/* This sale: default payment (quick mode) + who's buying */}
        <View style={styles.contextRow}>
          {mode === 'quick' && (
            <TouchableOpacity
              style={[neu.raised, styles.payDefaultPill]}
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
              <Feather name="user-plus" size={13} color={C.bronze} />
              <Text style={styles.addCustomerText}>{t.stall.addCustomerChip}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

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
        {toolbar}
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
      {/* Register toolbar (shared element defined above) */}
      {toolbar}

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

          {/* Browse: category pills + expanding search */}
          <View style={styles.browseRow} onLayout={handleBrowseRowLayout}>
            {/* Category dropdown (replaces the horizontal pills) — the picker list
                opens anchored under this button (see the Modal below). */}
            <View style={styles.catDropdownWrap}>
              {/* Always mounted — opacity tracks the search width, so it fades
                  in while the bar shrinks rather than after it. Untouchable
                  while the search owns the row. */}
              <ReAnimated.View style={catBtnAnimStyle} pointerEvents={searchOpen ? 'none' : 'auto'}>
              <TouchableOpacity
                style={[styles.catDropdownBtn, neu.raised]}
                onPress={openCatDropdown}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.stall.selectCategory}
              >
                <Feather name={selectedCatIcon} size={14} color={C.bronze} />
                <Text style={styles.catDropdownText} numberOfLines={1}>{selectedCatLabel}</Text>
                <Feather name="chevron-down" size={16} color={C.textMuted} />
              </TouchableOpacity>
              </ReAnimated.View>
            </View>

            {/* Expanding search — 40px circle → full row width on focus.
                Web pattern translated: width tween, cubic-bezier(0.16,1,0.3,1).
                Shadow lives on the OUTER view, the clip on the INNER one —
                overflow:hidden on the shadowed view itself makes iOS
                masksToBounds slice the view's own shadow (neu horizontal error). */}
            <ReAnimated.View style={[styles.searchWrap, neu.raised, searchAnimStyle]}>
              <View style={styles.searchClip}>
                {searchOpen ? (
                  <>
                    <Feather name="search" size={16} color={C.textSecondary} />
                    <TextInput
                      ref={searchInputRef}
                      style={styles.searchInput}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      onBlur={() => { if (!searchQuery) collapseSearch(); }}
                      placeholder="Search products..."
                      placeholderTextColor={C.neutral}
                      returnKeyType="search"
                      onSubmitEditing={Keyboard.dismiss}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={withAlpha(C.accent, 0.25)}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="x" size={16} color={C.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.searchCollapsedBtn}
                    onPress={expandSearch}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Search products"
                  >
                    <Feather name="search" size={16} color={C.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </ReAnimated.View>
          </View>

          {/* Product grid */}
          <ScrollView
            style={styles.productsScroll}
            contentContainerStyle={[styles.productsGrid, { paddingBottom: insets.bottom + 88 }]}
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
                <View key={product.id} style={[styles.productCardWrapper, { width: productTileWidth }]}>
                  <TouchableOpacity
                    style={[
                      styles.productButton,
                      neu.raised,
                      mode === 'cart' && inCartQty > 0 && styles.productInCart,
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
                    {/* Seam rule: the neu shadow stays on productButton (no overflow);
                        the image's rounded clip lives on this inner view. */}
                    <View style={styles.productClip}>
                    {!!product.imageUrl && (
                      <>
                        <Image
                          source={{ uri: product.imageUrl }}
                          style={[styles.productImageBg, { opacity: isDark ? 0.65 : 0.85 }]}
                          contentFit="cover"
                          transition={150}
                        />
                        {/* Scrim: solid card tone behind the (left-aligned) text →
                            fades to reveal the photo on the right. Keeps text crisp
                            in both modes (light mode washed out without it). */}
                        <LinearGradient
                          // Light mode washes out, so back the text harder there (and a
                          // faint overall veil); dark mode already reads well — leave it.
                          colors={isDark
                            ? [withAlpha(C.background, 0.55), withAlpha(C.background, 0)]
                            : [withAlpha(C.background, 0.82), withAlpha(C.background, 0.12)]}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />
                      </>
                    )}
                    {/* Sold-out: a uniform card-tone veil washes the photo (and the
                        whole card body) back so the text + SOLD OUT badge stay crisp.
                        Sits under productInner, so the text is never dimmed. */}
                    {isSoldOut && <View style={styles.soldOutVeil} pointerEvents="none" />}
                    <View style={styles.productInner}>
                      <Text style={styles.productName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                        {product.name}
                      </Text>
                      <View style={styles.priceLine}>
                        <Text style={[styles.productPrice, isSoldOut && styles.productPriceSoldOut]}>
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
                        <View style={styles.soldOutBadge}>
                          <Feather name="slash" size={10} color={C.textSecondary} />
                          <Text style={styles.soldOutBadgeText}>sold out</Text>
                        </View>
                      )}
                    </View>
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

            {filteredProducts.length === 0 && searchQuery.length === 0 && effectiveCategory !== 'all' && (
              <View style={styles.noResults}>
                <Text style={styles.noResultsText}>{t.stall.emptyCategory}</Text>
              </View>
            )}

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
                    <View key={item.lineKey} style={styles.cartItemExpanded}>
                      <View style={styles.cartItemExpandedTop}>
                        <Text style={styles.cartItemNameExpanded} numberOfLines={1}>
                          {item.productName}
                        </Text>
                        <TouchableOpacity onPress={() => removeFromCart(item.lineKey)}>
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
                            onPress={() => updateQuantity(item.lineKey, item.quantity - 1)}
                          >
                            <Feather name="minus" size={16} color={C.textPrimary} />
                          </TouchableOpacity>
                          <Text style={styles.quantityTextExpanded}>{item.quantity}</Text>
                          <TouchableOpacity
                            style={styles.quantityButtonExpanded}
                            onPress={() => updateQuantity(item.lineKey, item.quantity + 1)}
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
                    <View key={item.lineKey} style={styles.cartItem}>
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
                          onPress={() => updateQuantity(item.lineKey, item.quantity - 1)}
                        >
                          <Feather name="minus" size={16} color={C.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.quantityText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => updateQuantity(item.lineKey, item.quantity + 1)}
                        >
                          <Feather name="plus" size={16} color={C.textPrimary} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.cartItemTotal}>
                        <Text style={styles.cartItemTotalText}>
                          {currency} {(item.unitPrice * item.quantity).toFixed(2)}
                        </Text>
                        <TouchableOpacity onPress={() => removeFromCart(item.lineKey)}>
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

          {/* Cart footer — lifts above the keyboard while the discount field is
              focused (the only main-screen input the keyboard would cover). */}
          <Pressable
            style={[
              styles.cartFooter,
              {
                paddingBottom:
                  insets.bottom + 84 + (focusedField === 'discount' && keyboardVisible ? keyboardHeight : 0),
              },
            ]}
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
                  style={[styles.discountInput, newstOutline(C, focusedField === 'discount')]}
                  value={discountValue}
                  onChangeText={setDiscountValue}
                  onFocus={() => setFocusedField('discount')}
                  onBlur={() => setFocusedField((f) => (f === 'discount' ? null : f))}
                  placeholder={discountType === 'percentage' ? '0%' : '0.00'}
                  placeholderTextColor={C.neutral}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
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
                style={[styles.cashButton, neu.raised]}
                onPress={() => guardedCheckout('cash')}
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
                style={[neu.raisedSoft, styles.qrButton, cart.length === 0 && styles.qrButtonDisabled]}
                onPress={guardedOpenQrCheckout}
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
                  style={[styles.cashButton, neu.raised, cardOffline && { opacity: 0.5 }]}
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
        animationType="none"
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
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setCustomVisible(false)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => { Keyboard.dismiss(); setCustomVisible(false); }}>
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.centerKav}
            pointerEvents="box-none"
          >
            <View style={styles.centerCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.centerTitle}>{t.stall.customSaleTitle}</Text>
              <View style={[styles.customAmountRow, newstOutline(C, focusedField === 'customAmount')]}>
                <Text style={styles.customCurrency}>{currency}</Text>
                <TextInput
                  style={styles.customAmountInput}
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  onFocus={() => setFocusedField('customAmount')}
                  onBlur={() => setFocusedField((f) => (f === 'customAmount' ? null : f))}
                  placeholder="0.00"
                  placeholderTextColor={C.neutral}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectionColor={withAlpha(C.accent, 0.25)}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                />
              </View>
              <NewstInput
                label={t.stall.customFieldLabel}
                value={customLabel}
                onChangeText={setCustomLabel}
              />
              <View style={styles.customPayRow}>
                <TouchableOpacity
                  style={[styles.customPayBtn, neu.raised, customMethod === 'cash' && styles.customPayActive]}
                  onPress={() => setCustomMethod('cash')}
                >
                  <Feather name="dollar-sign" size={15} color={customMethod === 'cash' ? C.onAccent : C.textSecondary} />
                  <Text style={[styles.customPayText, customMethod === 'cash' && { color: C.onAccent }]}>{t.stall.cashPrefix}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.customPayBtn, neu.raised, customMethod === 'qr' && styles.customPayActive]}
                  onPress={() => setCustomMethod('qr')}
                >
                  <Feather name="smartphone" size={15} color={customMethod === 'qr' ? C.onAccent : C.textSecondary} />
                  <Text style={[styles.customPayText, customMethod === 'qr' && { color: C.onAccent }]}>{t.stall.qrPrefix}</Text>
                </TouchableOpacity>
                {cardConfigured && (
                  <TouchableOpacity
                    style={[styles.customPayBtn, neu.raised, customMethod === 'card' && styles.customPayActive]}
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
                <TouchableOpacity style={[styles.centerBtn, neu.raised, styles.centerCancelBtn]} onPress={() => { Keyboard.dismiss(); setCustomVisible(false); }}>
                  <Text style={styles.centerCancelText}>{t.common.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.centerBtn, neu.raisedSoft, styles.centerPrimaryBtn]} onPress={guardedConfirmCustom}>
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
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setRestockTarget(null)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => { Keyboard.dismiss(); setRestockTarget(null); }}>
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.centerKav}
            pointerEvents="box-none"
          >
            <View style={styles.centerCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.centerTitle}>{t.stall.restockTitle}</Text>
              {!!restockTarget && <Text style={styles.restockName} numberOfLines={1}>{restockTarget.name}</Text>}
              <View style={[styles.customAmountRow, newstOutline(C, focusedField === 'restock')]}>
                <Feather name="package" size={18} color={C.textSecondary} />
                <TextInput
                  style={styles.customAmountInput}
                  value={restockAmount}
                  onChangeText={(v) => setRestockAmount(v.replace(/[^0-9]/g, ''))}
                  onFocus={() => setFocusedField('restock')}
                  onBlur={() => setFocusedField((f) => (f === 'restock' ? null : f))}
                  placeholder={t.stall.restockPlaceholder}
                  placeholderTextColor={C.neutral}
                  keyboardType="number-pad"
                  autoFocus
                  selectionColor={withAlpha(C.accent, 0.25)}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                />
              </View>
              <View style={styles.centerBtns}>
                <TouchableOpacity style={[styles.centerBtn, neu.raised, styles.centerCancelBtn]} onPress={() => { Keyboard.dismiss(); setRestockTarget(null); }}>
                  <Text style={styles.centerCancelText}>{t.common.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.centerBtn, neu.raisedSoft, styles.centerPrimaryBtn]} onPress={guardedConfirmRestock}>
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
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setCustomerPickerVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => { Keyboard.dismiss(); setCustomerPickerVisible(false); }}>
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.sheetKav}
            pointerEvents="box-none"
          >
            <View style={styles.sheetCard} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>{t.stall.pickCustomerTitle}</Text>

              <View style={[styles.customerSearchRow, newstOutline(C, focusedField === 'customerSearch')]}>
                <Feather name="search" size={16} color={C.textSecondary} />
                <TextInput
                  style={styles.customerSearchInput}
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  onFocus={() => setFocusedField('customerSearch')}
                  onBlur={() => setFocusedField((f) => (f === 'customerSearch' ? null : f))}
                  placeholder={t.stall.searchRegulars}
                  placeholderTextColor={C.neutral}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
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
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setClearanceVisible(false)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => { Keyboard.dismiss(); setClearanceVisible(false); }}>
          <KeyboardAvoidingView behavior="padding" style={styles.centerKav} pointerEvents="box-none">
            <View style={styles.centerCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.centerTitle}>{t.stall.clearanceTitle}</Text>
              <View style={[styles.customAmountRow, newstOutline(C, focusedField === 'clearance')]}>
                <Feather name="tag" size={18} color={C.textSecondary} />
                <TextInput
                  style={styles.customAmountInput}
                  value={clearanceInput}
                  onChangeText={(v) => setClearanceInput(v.replace(/[^0-9]/g, ''))}
                  onFocus={() => setFocusedField('clearance')}
                  onBlur={() => setFocusedField((f) => (f === 'clearance' ? null : f))}
                  placeholder={t.stall.clearancePlaceholder}
                  placeholderTextColor={C.neutral}
                  keyboardType="number-pad"
                  autoFocus
                  selectionColor={withAlpha(C.accent, 0.25)}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                />
                <Text style={styles.customCurrency}>%</Text>
              </View>
              <View style={styles.centerBtns}>
                <TouchableOpacity style={[styles.centerBtn, neu.raised, styles.centerCancelBtn]} onPress={clearClearance}>
                  <Text style={styles.centerCancelText}>{t.stall.clearanceClear}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.centerBtn, neu.raisedSoft, styles.centerPrimaryBtn]} onPress={applyClearance}>
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
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setModifierProduct(null)}
      >
        <Pressable style={styles.centerOverlay} onPress={() => setModifierProduct(null)}>
          <View style={styles.centerKav} pointerEvents="box-none">
            <View style={styles.centerCard} onStartShouldSetResponder={() => true}>
              {/* Header — product name + close, like the category dropdown */}
              <View style={styles.modHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.centerTitle}>{modifierProduct?.name}</Text>
                  <Text style={styles.modSubtitle}>{t.stall.pickOptionTitle}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModifierProduct(null)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.common.close}
                >
                  <Feather name="x" size={16} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Options as tappable neu rows — label + delta chip, final price right */}
              <View style={styles.modOptions}>
                <TouchableOpacity
                  style={[styles.modOptionRow, neu.raised]}
                  onPress={() => modifierProduct && guardedModifierSale(modifierProduct, null)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={styles.modOptionName}>{t.stall.optionNone}</Text>
                  <Text style={styles.modOptionPrice}>{currency} {modifierProduct ? priceOf(modifierProduct).toFixed(2) : ''}</Text>
                </TouchableOpacity>
                {modifierProduct?.modifiers?.map((m) => {
                  const unit = modifierProduct ? Math.round((priceOf(modifierProduct) + m.priceDelta) * 100) / 100 : 0;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.modOptionRow, neu.raised]}
                      onPress={() => modifierProduct && guardedModifierSale(modifierProduct, m)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${m.label}, ${currency} ${unit.toFixed(2)}`}
                    >
                      <View style={styles.modOptionLeft}>
                        <Text style={styles.modOptionName} numberOfLines={1}>{m.label}</Text>
                        {!!m.priceDelta && (
                          <View style={styles.modDeltaChip}>
                            <Text style={styles.modDeltaChipText}>
                              {m.priceDelta > 0 ? '+' : '−'}{Math.abs(m.priceDelta)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.modOptionPrice}>{currency} {unit.toFixed(2)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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

      {/* DuitNow QR pay sheet — shared by cart + custom-amount QR flows. */}
      <QrPaySheet
        visible={!!qrSheet}
        amountCents={qrSheet?.amountCents ?? 0}
        paymentQr={qrForPay}
        providerPayload={qrSheet?.providerPayload}
        waiting={!!qrSheet?.providerPayload}
        onConfirmReceived={() => qrSheet?.onComplete()}
        onSkip={() => qrSheet?.onComplete()}
        onClose={() => setQrSheet(null)}
      />

      {/* Category dropdown list — anchored under the dropdown button. */}
      <Modal
        visible={catDropdownOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setCatDropdownOpen(false)}
      >
        <Pressable style={styles.catDropdownOverlay} onPress={() => setCatDropdownOpen(false)}>
          <View
            style={[styles.catDropdownCard, neu.raisedModal]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.catDropdownHeader}>
              <Text style={styles.catDropdownTitle}>{t.stall.selectCategory}</Text>
              <TouchableOpacity
                onPress={() => setCatDropdownOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
              >
                <Feather name="x" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.catDropdownList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={styles.catDropdownItem}
                onPress={() => { lightTap(); setSelectedCategory('all'); setCatDropdownOpen(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: effectiveCategory === 'all' }}
              >
                <Feather name="layers" size={14} color={effectiveCategory === 'all' ? C.bronze : C.textSecondary} />
                <Text style={[styles.catDropdownItemText, effectiveCategory === 'all' && styles.catDropdownItemTextActive]}>
                  {t.stall.allCategories}
                </Text>
                {effectiveCategory === 'all' && <Feather name="check" size={14} color={C.bronze} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {categoryPills.map((pill) => {
                const active = effectiveCategory === pill.value;
                return (
                  <TouchableOpacity
                    key={pill.value}
                    style={styles.catDropdownItem}
                    onPress={() => { lightTap(); setSelectedCategory(pill.value); setCatDropdownOpen(false); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Feather name={pill.icon as keyof typeof Feather.glyphMap} size={14} color={active ? C.bronze : C.textSecondary} />
                    <Text style={[styles.catDropdownItemText, active && styles.catDropdownItemTextActive]} numberOfLines={1}>
                      {pill.label}
                    </Text>
                    {active && <Feather name="check" size={14} color={C.bronze} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  // ─── POS toolbar header ────────────────────────────────
  // Register-only: no money here — Home owns the hero total. Screen-tone
  // surface + hairline so the neu controls blend; 40px tap rhythm throughout.
  sessionHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    // A bit more room under the controls so the hairline sits lower (owner).
    paddingBottom: SPACING.xl,
    backgroundColor: C.background,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerInner: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
  ledgerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    height: 40,
    borderRadius: RADIUS.full,
  },
  ledgerBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
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

  // Browse row: category pills + expanding search
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // A little gap above (below the hairline); the grid's paddingTop handles the
    // gap below (and the badge clearance).
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
  pillsClip: {
    flex: 1,
    minWidth: 0,
    marginRight: SPACING.sm,
    // Undo the content's vertical shadow-slack so the row still reads 40 tall;
    // the horizontal ScrollView itself clips during the search squash.
    marginVertical: -12,
  },
  pillsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    // Neu-seam fix (docs/neu-vertical-error.md): pad INSIDE the clip container
    // so the pills' top/bottom shadows fade out before the ScrollView's bounds
    // instead of being sliced into hard edges.
    paddingVertical: 12,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
  },
  catPillActive: {
    backgroundColor: C.bronze,
    ...SHADOWS.xs,
  },
  catPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  catPillTextActive: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  // ─── Category dropdown (button + anchored list) ─────────────
  catDropdownWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: SPACING.sm,
    alignItems: 'flex-start',
  },
  catDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    maxWidth: '100%',
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
  },
  catDropdownText: {
    flexShrink: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  catDropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  catDropdownCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  catDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  catDropdownTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  catDropdownList: {
    maxHeight: 360,
    flexGrow: 0,
  },
  catDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  catDropdownItemText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  catDropdownItemTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  // Outer shell: background + neu shadow only. No overflow here — on iOS,
  // overflow:hidden (masksToBounds) would clip this view's OWN shadow.
  searchWrap: {
    height: 40,
    borderRadius: RADIUS.full,
  },
  // Inner clip: rounds + clips the input while the width animates.
  searchClip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: SPACING.xs,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  searchCollapsedBtn: {
    width: 40,
    height: 40,
    marginHorizontal: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    padding: 0,
  },

  // Product grid
  productsScroll: {
    flex: 1,
    // Shape-3 seam fix (neu onyx vertical error): bleed the scroll viewport out so
    // its clip sits OUTSIDE the edge cards; the grid's paddingHorizontal puts the
    // cards back. Otherwise the leftmost card's neu shadow gets sheared into a line.
    marginHorizontal: -SPACING.md,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Small COLUMN gap so 2 tiles still fit one row in cart mode's narrow products
    // area (the cart panel takes 30%); keep a comfortable ROW gap between rows.
    columnGap: SPACING.sm,
    rowGap: SPACING.md,
    // Top room so the top-row cards' in-cart badge (top:-4) isn't clipped by the
    // scroll's top edge (the "invisible line"), and cards sit a touch lower.
    paddingTop: SPACING.md,
    // Puts the cards back after the scroll bleed (see productsScroll) — same visual
    // position, but now the edge cards' neu shadows have room and don't seam.
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING['3xl'],
    maxWidth: 1040,
    width: '100%',
    alignSelf: 'center' as const,
  },
  productCardWrapper: {
    aspectRatio: 1,
    overflow: 'visible',
  },
  productButton: {
    flex: 1,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
  },
  productInCart: {
    backgroundColor: withAlpha(C.bronze, 0.04),
  },
  // Inner clip — rounds the image to the card corners WITHOUT clipping the neu
  // shadow (which lives on productButton). See the onyx seam rule.
  productClip: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  // Product photo as a faint watermark behind the text. Moderate transparency; a
  // plain/white background largely melts into the card (esp. light mode).
  // Opacity is set inline per theme (light 0.85 / dark 0.65).
  productImageBg: {
    ...StyleSheet.absoluteFillObject,
  },
  productInner: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'space-between',
  },
  // Sold-out wash — a uniform card-tone veil over the photo/body. Replaces the old
  // blanket opacity:0.35 (which faded the text too, killing readability).
  soldOutVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(C.background, 0.55),
  },
  productPriceSoldOut: {
    color: C.textMuted,
    textDecorationLine: 'line-through',
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.sm,
    // Card-tone halo so the text stays legible over the photo (light glow in light
    // mode, dark in dark) — lets the image stay bright without hurting readability.
    textShadowColor: withAlpha(C.background, 0.9),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  productPrice: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    textShadowColor: withAlpha(C.background, 0.9),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
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
  soldOutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.16),
    marginTop: SPACING.xs,
  },
  soldOutBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
    backgroundColor: C.background,
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
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
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

  // ─── Header: controls + this-sale context ─────────────
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  // True segmented control: quiet pillBg track, bronze active segment with the
  // xs "floating pill" shadow. No raised shadow on the inactive segment.
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: C.pillBg,
    borderRadius: RADIUS.full,
    padding: 3,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    minHeight: 40,
  },
  modeBtnActive: {
    backgroundColor: C.bronze,
    ...SHADOWS.xs,
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
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  payDefaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.06),
    minHeight: 40,
  },
  payDefaultText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  clearancePillOn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    height: 40,
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
  // ─── Modifier chooser ──────────────────────────────────
  modHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  modSubtitle: {
    ...TYPE.muted,
    marginTop: 2,
  },
  modOptions: {
    gap: SPACING.sm,
  },
  modOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    gap: SPACING.md,
  },
  modOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    flexShrink: 1,
  },
  modOptionName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    flexShrink: 1,
  },
  modDeltaChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.10),
  },
  modDeltaChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  modOptionPrice: {
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
    backgroundColor: C.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    // Same modal-card outline rule as centerCard / FloatingModal.
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING['2xl'],
    maxHeight: '72%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
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
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    // The established modal-card rule (same as FloatingModal): scrim supplies
    // separation, a hairline supplies the outline — no drop shadow.
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    gap: SPACING.md,
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
    backgroundColor: withAlpha(C.textPrimary, 0.03),
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

  // ─── Serving customer chip (sits in contextRow) ────────
  servingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.10),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.3),
    maxWidth: '100%',
    minHeight: 40,
    flexShrink: 1,
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
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 40,
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
