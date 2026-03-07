import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  LayoutAnimation,
  UIManager,
  Linking,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import CalendarPicker from '../../components/common/CalendarPicker';
import { format, addDays, isValid } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { SellerOrderItem, SellerProduct, SellerOrder } from '../../types';
import { parseWhatsAppOrder } from '../../utils/parseWhatsAppOrder';
import { parseWhatsAppOrderAI } from '../../services/aiService';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { lightTap, selectionChanged, successNotification, mediumTap } from '../../services/haptics';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SEARCH_THRESHOLD = 8;
const WHATSAPP_GREEN = '#25D366'; // WhatsApp brand color — intentional exception to CALM palette

// ─── MAIN COMPONENT ────────────────────────────────────────────
const NewOrder: React.FC = () => {
  const products = useSellerStore((s) => s.products);
  const addOrder = useSellerStore((s) => s.addOrder);
  const orders = useSellerStore((s) => s.orders);
  const sellerCustomers = useSellerStore((s) => s.sellerCustomers);
  const addSellerCustomer = useSellerStore((s) => s.addSellerCustomer);
  const updateSellerCustomer = useSellerStore((s) => s.updateSellerCustomer);
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const currency = useSettingsStore((s) => s.currency);
  const paymentQrs = useSettingsStore((s) => s.paymentQrs);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Pre-fill from navigation params (e.g. from Customers tab)
  const routeParams = route.params as {
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    prefillItems?: SellerOrderItem[];
  } | undefined;

  // ── State ──────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState(routeParams?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(routeParams?.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState(routeParams?.customerAddress || '');
  const [items, setItems] = useState<SellerOrderItem[]>([]);
  const [note, setNote] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [deliveryMode, setDeliveryMode] = useState<'today' | 'tomorrow' | 'pick' | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [copiedFlag, setCopiedFlag] = useState(false);
  const [showWhatsAppPaste, setShowWhatsAppPaste] = useState(false);
  const [whatsAppText, setWhatsAppText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [editingQtyProductId, setEditingQtyProductId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [activeQrIndex, setActiveQrIndex] = useState(0);
  const [savedOrderNumber, setSavedOrderNumber] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<Contacts.Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const checkScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (activeQrIndex >= paymentQrs.length) setActiveQrIndex(0);
  }, [paymentQrs.length]);

  // When navigating back to this tab with params, pre-fill customer + items
  useEffect(() => {
    if (routeParams?.customerName || routeParams?.prefillItems) {
      if (routeParams.customerName) setCustomerName(routeParams.customerName);
      if (routeParams.customerPhone) setCustomerPhone(routeParams.customerPhone);
      if (routeParams.customerAddress) setCustomerAddress(routeParams.customerAddress);
      // Pre-fill items from reorder — only keep items whose products still exist and are active
      if (routeParams.prefillItems && routeParams.prefillItems.length > 0) {
        const activeProductIds = new Set(products.filter((p) => p.isActive).map((p) => p.id));
        const validItems = routeParams.prefillItems.filter((i) => activeProductIds.has(i.productId));
        if (validItems.length > 0) setItems(validItems);
      }
      // Clear params so they don't persist on tab re-visits
      navigation.setParams({ customerName: undefined, customerPhone: undefined, customerAddress: undefined, prefillItems: undefined });
    }
  }, [routeParams?.customerName, routeParams?.customerPhone, routeParams?.customerAddress, routeParams?.prefillItems]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products]
  );

  const total = useMemo(() => items.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [items]);
  const itemCount = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);

  // Map productId -> quantity for product row display
  const itemQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      if (item.productId) {
        map[item.productId] = (map[item.productId] || 0) + item.quantity;
      }
    }
    return map;
  }, [items]);

  // ── Recent customers (derived from orders + sellerCustomers) ──
  const recentCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string; address?: string; lastDate: Date }>();

    for (const order of orders) {
      if (!order.customerName) continue;
      const key = order.customerName.toLowerCase().trim();
      const orderDate = order.date instanceof Date ? order.date : new Date(order.date);
      if (!map.has(key)) {
        map.set(key, {
          name: order.customerName.trim(),
          phone: order.customerPhone,
          address: undefined,
          lastDate: orderDate,
        });
      } else {
        const existing = map.get(key)!;
        if (orderDate > existing.lastDate) existing.lastDate = orderDate;
        if (!existing.phone && order.customerPhone) existing.phone = order.customerPhone;
      }
    }

    // Merge sellerCustomers for address/phone
    for (const sc of sellerCustomers) {
      if (!sc.name) continue;
      const key = sc.name.toLowerCase().trim();
      const existing = map.get(key);
      if (existing) {
        if (!existing.phone && sc.phone) existing.phone = sc.phone;
        if (!existing.address && sc.address) existing.address = sc.address;
      } else {
        map.set(key, {
          name: sc.name.trim(),
          phone: sc.phone,
          address: sc.address,
          lastDate: sc.createdAt instanceof Date ? sc.createdAt : new Date(sc.createdAt),
        });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime())
      .slice(0, 10);
  }, [orders, sellerCustomers]);

  // ── Customer's recent orders (for reorder) ─────────────────
  const recentOrders = useMemo((): SellerOrder[] => {
    if (!customerName.trim()) return [];
    const name = customerName.trim().toLowerCase();
    const matching = orders.filter(
      (o) => o.customerName?.toLowerCase().trim() === name
    );
    if (matching.length === 0) return [];
    // orders are sorted newest-first in store — take up to 3
    return matching.slice(0, 3);
  }, [customerName, orders]);

  // ── Autocomplete suggestions (while typing) ──────────────────
  const filteredSuggestions = useMemo(() => {
    const typed = customerName.trim().toLowerCase();
    if (!typed || typed.length < 1) return [];
    return recentCustomers
      .filter((c) => c.name.toLowerCase().includes(typed) && c.name.toLowerCase() !== typed)
      .slice(0, 5);
  }, [customerName, recentCustomers]);

  // ── Handlers ───────────────────────────────────────────────
  const handleSelectCustomer = useCallback(
    (customer: { name: string; phone?: string; address?: string }) => {
      lightTap();
      setCustomerName(customer.name);
      if (customer.phone) setCustomerPhone(customer.phone);
      if (customer.address) setCustomerAddress(customer.address);
    },
    []
  );

  const handleReorder = useCallback((order: SellerOrder) => {
    mediumTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems(order.items.map((item) => {
      const currentProduct = products.find(p => p.id === item.productId);
      return {
        ...item,
        unitPrice: currentProduct ? currentProduct.pricePerUnit : item.unitPrice,
      };
    }));
  }, [products]);

  // Delivery
  const handleDeliveryToday = useCallback(() => {
    lightTap();
    setDeliveryMode('today');
    setDeliveryDate(new Date());
    setShowDatePicker(false);
  }, []);
  const handleDeliveryTomorrow = useCallback(() => {
    lightTap();
    setDeliveryMode('tomorrow');
    setDeliveryDate(addDays(new Date(), 1));
    setShowDatePicker(false);
  }, []);
  const handleDeliveryPick = useCallback(() => {
    lightTap();
    setDeliveryMode('pick');
    setShowDatePicker(true);
  }, []);
  const handleClearDelivery = useCallback(() => {
    lightTap();
    setDeliveryMode(null);
    setDeliveryDate(undefined);
    setShowDatePicker(false);
  }, []);

  // WhatsApp parsing
  const handleParseWhatsApp = useCallback(async () => {
    if (!whatsAppText.trim()) return;
    setIsParsing(true);

    let local = { items: [] as any[], unmatched: [] as string[] };
    try { local = parseWhatsAppOrder(whatsAppText, products); } catch (_) {}
    if (local.items.length > 0) {
      setItems(local.items);
      setUnmatched(local.unmatched);
      setIsParsing(false);
      setShowWhatsAppPaste(false);
      return;
    }

    const aiItems = await parseWhatsAppOrderAI(whatsAppText, products);
    if (aiItems && aiItems.length > 0) {
      const mapped: SellerOrderItem[] = aiItems.map((ai) => {
        const product = products.find(
          (p) => p.name.toLowerCase() === ai.productName.toLowerCase() && p.isActive
        );
        return {
          productId: product?.id ?? '',
          productName: ai.productName,
          quantity: ai.quantity,
          unitPrice: product?.pricePerUnit ?? 0,
          unit: ai.unit || product?.unit || 'piece',
        };
      });
      const validMapped = mapped.filter((i) => i.unitPrice > 0 || i.productId !== '');
      const zeroPriceNames = mapped.filter((i) => i.unitPrice === 0 && i.productId === '').map((i) => i.productName);
      setItems(validMapped);
      setUnmatched(zeroPriceNames.length > 0 ? zeroPriceNames : []);
    } else {
      setUnmatched([whatsAppText.trim().slice(0, 120)]);
    }

    setIsParsing(false);
    setShowWhatsAppPaste(false);
  }, [whatsAppText, products]);

  // Product add/remove
  const handleAddProduct = useCallback((product: SellerProduct) => {
    selectionChanged();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.pricePerUnit,
          unit: product.unit,
        },
      ];
    });
  }, []);

  const handleUpdateQuantity = useCallback((productId: string, qty: number) => {
    selectionChanged();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i))
      );
    }
  }, []);

  // Confirmation text (Malay)
  const confirmationText = useMemo(() => {
    const name = customerName.trim();
    const lines: string[] = [];

    if (name) {
      lines.push(`Terima kasih ${name}!`);
    } else {
      lines.push('Pesanan diterima.');
    }
    lines.push('');
    lines.push('Pesanan:');
    for (const item of items) {
      lines.push(`- ${item.productName} x${item.quantity} ${item.unit}`);
    }
    lines.push('');
    lines.push(`Jumlah: ${currency} ${total.toFixed(2)}`);

    if (deliveryDate && isValid(deliveryDate)) {
      lines.push(`Hantar: ${format(deliveryDate, 'dd MMM')}`);
    }

    return lines.join('\n');
  }, [customerName, items, currency, total, deliveryDate]);

  // Persist customer (returns false if duplicate phone detected)
  const persistCustomer = useCallback((): boolean => {
    const name = customerName.trim();
    if (!name) return true;
    const phone = customerPhone.trim() || undefined;
    const address = customerAddress.trim() || undefined;

    // Check for duplicate phone across other customers
    if (phone) {
      let normalizedInput = phone.replace(/[^0-9]/g, '');
      if (normalizedInput.startsWith('0')) normalizedInput = '60' + normalizedInput.slice(1);

      const duplicate = sellerCustomers.find((c) => {
        if (!c.phone) return false;
        if (c.name.toLowerCase().trim() === name.toLowerCase()) return false;
        let normalizedExisting = c.phone.replace(/[^0-9]/g, '');
        if (normalizedExisting.startsWith('0')) normalizedExisting = '60' + normalizedExisting.slice(1);
        return normalizedExisting === normalizedInput;
      });
      if (duplicate) {
        Alert.alert('', `that phone number is already used by ${duplicate.name}.`);
        return false;
      }
    }

    const existing = sellerCustomers.find(
      (c) => c.name.toLowerCase().trim() === name.toLowerCase()
    );

    if (existing) {
      const updates: Record<string, string | undefined> = {};
      if (phone !== existing.phone) updates.phone = phone;
      if (address !== existing.address) updates.address = address;
      if (Object.keys(updates).length > 0) {
        updateSellerCustomer(existing.id, updates);
      }
    } else {
      addSellerCustomer({ name, phone, address });
    }
    return true;
  }, [customerName, customerPhone, customerAddress, sellerCustomers, addSellerCustomer, updateSellerCustomer]);

  // Submit
  const handleSubmit = useCallback(() => {
    if (items.length === 0) {
      Alert.alert('No items', 'Add at least one item to the order.');
      return;
    }

    // Validate customer phone before creating order
    if (!persistCustomer()) return;

    addOrder({
      items,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerAddress: customerAddress.trim() || undefined,
      totalAmount: total,
      status: 'pending',
      isPaid: false,
      note: note.trim() || undefined,
      rawWhatsApp: whatsAppText.trim() || undefined,
      date: new Date(),
      deliveryDate,
      seasonId: activeSeason?.id,
    });

    // Use the already-subscribed `orders` selector — store prepends synchronously
    setSavedOrderNumber(orders[0]?.orderNumber || '');

    successNotification();
    setCopiedFlag(false);
    setShowConfirmModal(true);

    // Trigger checkmark scale-in animation
    checkScaleAnim.setValue(0);
    Animated.spring(checkScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 8,
      bounciness: 12,
    }).start();
  }, [items, customerName, customerPhone, customerAddress, total, note, whatsAppText, deliveryDate, activeSeason, addOrder, persistCustomer, checkScaleAnim]);

  const handleCopyToClipboard = useCallback(async () => {
    lightTap();
    const textToCopy = savedOrderNumber
      ? `No. Pesanan: #${savedOrderNumber}\n\n${confirmationText}`
      : confirmationText;
    await Clipboard.setStringAsync(textToCopy);
    setCopiedFlag(true);
  }, [confirmationText, savedOrderNumber]);

  const resetForm = useCallback(() => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setItems([]);
    setNote('');
    setDeliveryDate(undefined);
    setDeliveryMode(null);
    setShowDatePicker(false);
    setWhatsAppText('');
    setShowWhatsAppPaste(false);
    setUnmatched([]);
    setCopiedFlag(false);
    setEditingQtyProductId(null);
    setEditingQtyValue('');
    setProductSearch('');
  }, []);

  const handleDone = useCallback(() => {
    lightTap();
    setShowConfirmModal(false);
    setShowQrPanel(false);
    setActiveQrIndex(0);
    setSavedOrderNumber('');
    resetForm();
    navigation.navigate('SellerOrders');
  }, [navigation, resetForm]);

  // ── Quick quantity input handlers ─────────────────────────
  const handleQtyTap = useCallback((productId: string, currentQty: number) => {
    selectionChanged();
    setEditingQtyProductId(productId);
    setEditingQtyValue(String(currentQty));
  }, []);

  const handleQtyInputSubmit = useCallback((productId: string) => {
    const parsed = parseFloat(editingQtyValue);
    if (!isNaN(parsed) && isFinite(parsed) && parsed >= 0) {
      handleUpdateQuantity(productId, Math.min(parsed, 9999));
    }
    setEditingQtyProductId(null);
    setEditingQtyValue('');
  }, [editingQtyValue, handleUpdateQuantity]);

  // ── WhatsApp share handler ────────────────────────────────
  const handleShareWhatsApp = useCallback(() => {
    lightTap();
    const phone = customerPhone.trim();
    const fullText = savedOrderNumber
      ? `No. Pesanan: #${savedOrderNumber}\n\n${confirmationText}`
      : confirmationText;
    const encodedText = encodeURIComponent(fullText);
    if (phone) {
      let digits = phone.replace(/[^0-9]/g, '');
      if (digits.startsWith('0')) digits = '60' + digits.slice(1);
      Linking.openURL(`https://wa.me/${digits}?text=${encodedText}`);
    } else {
      Linking.openURL(`https://wa.me/?text=${encodedText}`);
    }
  }, [customerPhone, confirmationText, savedOrderNumber]);

  // ── Import from contacts ──────────────────────────────────
  const handleImportFromContacts = useCallback(async () => {
    lightTap();
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('', 'contacts permission is needed.');
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Addresses],
      sort: Contacts.SortTypes.FirstName,
    });
    const filtered = (data || []).filter((c) => c.name);
    if (filtered.length === 0) {
      Alert.alert('', 'no contacts found.');
      return;
    }
    setContactsList(filtered.slice(0, 300));
    setContactSearch('');
    setShowContactPicker(true);
  }, []);

  const isDisabled = items.length === 0;

  // ── Sort products: items with quantity first ──────────────
  const sortedProducts = useMemo(() => {
    return [...activeProducts].sort((a, b) => {
      const qtyA = itemQtyMap[a.id] || 0;
      const qtyB = itemQtyMap[b.id] || 0;
      if (qtyA > 0 && qtyB === 0) return -1;
      if (qtyA === 0 && qtyB > 0) return 1;
      return 0;
    });
  }, [activeProducts, itemQtyMap]);

  // ── Filtered products (search) ────────────────────────────
  const filteredSortedProducts = useMemo(() => {
    if (!productSearch.trim()) return sortedProducts;
    const q = productSearch.toLowerCase();
    return sortedProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [sortedProducts, productSearch]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contactsList;
    const q = contactSearch.trim().toLowerCase();
    return contactsList.filter((c) => c.name?.toLowerCase().includes(q));
  }, [contactsList, contactSearch]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={80}
      >
        {/* ── Customer card ─────────────────────────────────── */}
        <View style={styles.customerCard}>
          {/* Main row: avatar + name input + clear */}
          <View style={styles.customerMainRow}>
            <View
              style={[styles.avatarCircle, customerName.trim() ? styles.avatarCircleFilled : null]}
              accessibilityLabel={customerName.trim() ? customerName.trim() : undefined}
            >
              {customerName.trim() ? (
                <Text style={styles.avatarText}>{customerName.trim()?.[0]?.toUpperCase() ?? ''}</Text>
              ) : (
                <Feather name="user" size={14} color={CALM.textMuted} />
              )}
            </View>
            <TextInput
              style={styles.customerNameInput}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="who's this for?"
              placeholderTextColor={CALM.textMuted}
              accessibilityLabel="Customer name"
            />
            <TouchableOpacity
              onPress={handleImportFromContacts}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Import from contacts"
            >
              <Feather name="book" size={16} color={CALM.bronze} />
            </TouchableOpacity>
            {customerName.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setCustomerName('');
                  setCustomerPhone('');
                  setCustomerAddress('');
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Clear customer"
              >
                <Feather name="x" size={16} color={CALM.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Sub row: phone + dot + address (shown only when name entered) */}
          {customerName.trim().length > 0 && (
            <View style={styles.customerSubRow}>
              <Feather name="phone" size={11} color={CALM.textMuted} />
              <TextInput
                style={styles.customerSubInput}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="phone"
                placeholderTextColor={CALM.textMuted}
                keyboardType="phone-pad"
                accessibilityLabel="Phone"
              />
              <View style={styles.customerSubDot} />
              <Feather name="map-pin" size={11} color={CALM.textMuted} />
              <TextInput
                style={styles.customerSubInput}
                value={customerAddress}
                onChangeText={setCustomerAddress}
                placeholder="address"
                placeholderTextColor={CALM.textMuted}
                accessibilityLabel="Address"
              />
            </View>
          )}
        </View>

        {/* ── Recent customers (pills with avatar) ──────────── */}
        {recentCustomers.length > 0 && !customerName.trim() && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentScroll}
            keyboardShouldPersistTaps="handled"
          >
            {recentCustomers.map((c, i) => (
              <Pressable
                key={i}
                onPress={() => handleSelectCustomer(c)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${c.name}`}
                style={({ pressed }) => [styles.recentPill, pressed && styles.recentPillPressed]}
              >
                {({ pressed }) => (
                  <>
                    <View style={[styles.recentPillAvatar, pressed && styles.recentPillAvatarPressed]}>
                      <Text style={[styles.recentPillAvatarText, pressed && styles.recentPillAvatarTextPressed]}>{c.name?.[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                    <Text style={[styles.recentName, pressed && styles.recentNamePressed]} numberOfLines={1}>{c.name}</Text>
                  </>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Autocomplete suggestions */}
        {filteredSuggestions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.suggestionsRow}
            contentContainerStyle={styles.suggestionsContent}
            keyboardShouldPersistTaps="handled"
          >
            {filteredSuggestions.map((c, i) => (
              <Pressable
                key={i}
                onPress={() => handleSelectCustomer(c)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${c.name}`}
                style={({ pressed }) => [styles.suggestionPill, pressed && styles.suggestionPillPressed]}
              >
                {({ pressed }) => (
                  <Text style={[styles.suggestionText, pressed && styles.suggestionTextPressed]} numberOfLines={1}>{c.name}</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* ── Reorder pills (known customer) ────────────────── */}
        {recentOrders.length > 0 && items.length === 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.reorderScroll}
            keyboardShouldPersistTaps="handled"
          >
            {recentOrders.map((order) => (
              <Pressable
                key={order.id}
                onPress={() => handleReorder(order)}
                accessibilityRole="button"
                accessibilityLabel={`Reorder: ${order.items.map((i) => `${i.productName} x${i.quantity}`).join(', ')}`}
                style={({ pressed }) => [styles.reorderPill, pressed && styles.reorderPillPressed]}
              >
                {({ pressed }) => (
                  <>
                    <Feather name="rotate-ccw" size={16} color={pressed ? '#fff' : CALM.bronze} />
                    <Text style={[styles.reorderPillText, pressed && styles.reorderPillTextPressed]} numberOfLines={1}>
                      {format(
                        order.date instanceof Date ? order.date : new Date(order.date),
                        'dd MMM'
                      )} · {currency} {order.totalAmount.toFixed(0)}
                    </Text>
                  </>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* ── Items card ─────────────────────────────────────── */}
        <View style={styles.menuCard}>
          <View style={styles.menuHeader}>
            <View style={styles.menuHeaderLeft}>
              <Feather name="package" size={20} color={CALM.textMuted} />
              <Text style={styles.menuHeaderText}>items</Text>
            </View>
            <View style={styles.menuHeaderRight}>
              {/* WhatsApp import icon button */}
              <TouchableOpacity
                style={[styles.waIconBtn, showWhatsAppPaste && styles.waIconBtnActive]}
                onPress={() => {
                  lightTap();
                  if (showWhatsAppPaste) {
                    setShowWhatsAppPaste(false);
                    setWhatsAppText('');
                    setUnmatched([]);
                  } else {
                    setShowWhatsAppPaste(true);
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={showWhatsAppPaste ? 'Close WhatsApp import' : 'Import from WhatsApp'}
              >
                <Feather name="message-circle" size={15} color={showWhatsAppPaste ? '#fff' : CALM.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* WhatsApp paste — inline */}
          {showWhatsAppPaste && (
            <View style={styles.whatsAppInline}>
              <TextInput
                style={styles.whatsAppInput}
                value={whatsAppText}
                onChangeText={setWhatsAppText}
                placeholder="paste WhatsApp message..."
                placeholderTextColor={CALM.textMuted}
                multiline
                numberOfLines={2}
                accessibilityLabel="WhatsApp message"
              />
              <Pressable
                onPress={handleParseWhatsApp}
                disabled={!whatsAppText.trim() || isParsing}
                accessibilityRole="button"
                accessibilityLabel="Extract items from message"
                style={({ pressed }) => [
                  styles.whatsAppParseBtn,
                  !whatsAppText.trim() && styles.whatsAppParseBtnDisabled,
                  whatsAppText.trim() && pressed && styles.whatsAppParseBtnPressed,
                ]}
              >
                {({ pressed }) => (
                  isParsing ? (
                    <ActivityIndicator size="small" color={whatsAppText.trim() ? (pressed ? '#fff' : CALM.textPrimary) : CALM.textMuted} />
                  ) : (
                    <>
                      <Feather
                        name="zap"
                        size={16}
                        color={!whatsAppText.trim() ? CALM.textMuted : pressed ? '#fff' : CALM.textPrimary}
                      />
                      <Text style={[
                        styles.whatsAppParseBtnText,
                        !whatsAppText.trim() && styles.whatsAppParseBtnTextDisabled,
                        whatsAppText.trim() && pressed && styles.whatsAppParseBtnTextPressed,
                      ]}>
                        extract
                      </Text>
                    </>
                  )
                )}
              </Pressable>
              {unmatched.length > 0 && (
                <View style={styles.unmatchedBox}>
                  <Text style={styles.unmatchedLabel}>unrecognised:</Text>
                  {unmatched.map((u, i) => (
                    <Text key={i} style={styles.unmatchedItem} numberOfLines={2}>{u}</Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Selected items list or empty CTA */}
          {items.length === 0 ? (
            <Pressable
              onPress={() => { lightTap(); setShowProductPicker(true); }}
              accessibilityRole="button"
              accessibilityLabel="Add items"
              style={({ pressed }) => [styles.emptyItemsBtn, pressed && styles.emptyItemsBtnPressed]}
            >
              {({ pressed }) => (
                <>
                  <Feather name="package" size={16} color={pressed ? '#fff' : CALM.bronze} />
                  <Text style={[styles.emptyItemsText, pressed && styles.emptyItemsTextPressed]}>add items</Text>
                </>
              )}
            </Pressable>
          ) : (
            items.map((item, index) => (
              <View
                key={item.productId || item.productName || String(index)}
                style={[styles.selectedItemRow, index === 0 && styles.selectedItemRowFirst]}
              >
                <View style={styles.selectedItemLeft}>
                  <Text style={styles.selectedItemName} numberOfLines={1}>{item.productName}</Text>
                  <Text style={styles.selectedItemPrice}>
                    {currency} {item.unitPrice.toFixed(0)}/{item.unit}
                  </Text>
                </View>
                <View style={styles.qtyControls}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    activeOpacity={0.7}
                    onPress={() => handleUpdateQuantity(item.productId, (itemQtyMap[item.productId] || 0) - 1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${item.productName}`}
                  >
                    <Feather name="minus" size={14} color={CALM.textSecondary} />
                  </TouchableOpacity>
                  {editingQtyProductId === item.productId ? (
                    <TextInput
                      style={[styles.qtyText, styles.qtyInput]}
                      value={editingQtyValue}
                      onChangeText={setEditingQtyValue}
                      onSubmitEditing={() => handleQtyInputSubmit(item.productId)}
                      onBlur={() => handleQtyInputSubmit(item.productId)}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      autoFocus
                      maxLength={6}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleQtyTap(item.productId, item.quantity)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.qtyText}>{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    activeOpacity={0.7}
                    onPress={() => handleUpdateQuantity(item.productId, (itemQtyMap[item.productId] || 0) + 1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${item.productName}`}
                  >
                    <Feather name="plus" size={14} color={CALM.deepOlive} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.selectedItemTotal}>
                  {currency} {(item.unitPrice * item.quantity).toFixed(0)}
                </Text>
              </View>
            ))
          )}

          {/* Add more items pill (shown when items exist) */}
          {items.length > 0 && (
            <View style={styles.addMoreRow}>
              <Pressable
                onPress={() => { lightTap(); setShowProductPicker(true); }}
                accessibilityRole="button"
                accessibilityLabel="Add more items"
                style={({ pressed }) => [styles.addMorePill, pressed && styles.addMorePillPressed]}
              >
                {({ pressed }) => (
                  <>
                    <Feather name="plus" size={16} color={pressed ? '#fff' : CALM.bronze} />
                    <Text style={[styles.addMoreText, pressed && styles.addMoreTextPressed]}>add more</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Details card: delivery + note ─────────────────── */}
        <View style={styles.detailsCard}>
          {/* Delivery row */}
          <View style={styles.detailsRow}>
            <Feather name="truck" size={20} color={CALM.textMuted} />
            <Text style={styles.deliveryLabel}>delivery</Text>
            <View style={styles.deliveryPills}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.dPill, deliveryMode === 'today' && styles.dPillActive]}
                onPress={handleDeliveryToday}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Deliver today"
              >
                <Text style={[styles.dPillText, deliveryMode === 'today' && styles.dPillTextActive]}>
                  today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.dPill, deliveryMode === 'tomorrow' && styles.dPillActive]}
                onPress={handleDeliveryTomorrow}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Deliver tomorrow"
              >
                <Text style={[styles.dPillText, deliveryMode === 'tomorrow' && styles.dPillTextActive]}>
                  tomorrow
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.dPill, deliveryMode === 'pick' && styles.dPillActive]}
                onPress={handleDeliveryPick}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Pick a date"
              >
                <Feather
                  name="calendar"
                  size={16}
                  color={deliveryMode === 'pick' ? '#fff' : CALM.bronze}
                />
              </TouchableOpacity>
            </View>
            {deliveryDate && isValid(deliveryDate) && (
              <TouchableOpacity
                onPress={handleClearDelivery}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Clear delivery date"
              >
                <Feather name="x" size={14} color={CALM.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {deliveryDate && isValid(deliveryDate) && (
            <View style={styles.deliveryBadge}>
              <Feather name="truck" size={13} color={CALM.textPrimary} />
              <Text style={styles.deliveryBadgeText}>
                {format(deliveryDate, 'EEEE, dd MMM')}
              </Text>
            </View>
          )}

          {/* Hairline divider */}
          <View style={styles.detailsDivider} />

          {/* Note row */}
          <View style={styles.noteRow}>
            <Feather name="file-text" size={20} color={CALM.textMuted} style={{ marginTop: 2 }} />
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="add a note..."
              placeholderTextColor={CALM.textMuted}
              accessibilityLabel="Order note"
              multiline
              scrollEnabled={false}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* ── Delivery date picker overlay ─────────────────── */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.datePickerOverlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={styles.datePickerCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.datePickerCardInner}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>delivery date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.datePickerDone}>done</Text>
                </TouchableOpacity>
              </View>
              <CalendarPicker
                value={deliveryDate ?? new Date()}
                minimumDate={new Date()}
                onChange={(date) => {
                  setDeliveryDate(date);
                  setShowDatePicker(false);
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Bottom bar ────────────────────────────────────── */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={() => { lightTap(); setShowReviewModal(true); }}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            isDisabled
              ? 'Add items to save order'
              : `Save order, ${itemCount} items, total ${currency} ${total.toFixed(2)}`
          }
          style={({ pressed }) => [
            styles.saveButton,
            isDisabled && styles.saveButtonDisabled,
            !isDisabled && pressed && styles.saveButtonPressed,
          ]}
        >
          {({ pressed }) => (
            isDisabled ? (
              <Text style={styles.saveButtonTextDisabled}>select items to continue</Text>
            ) : (
              <View style={styles.saveButtonInner}>
                <View>
                  <Text style={[styles.saveButtonLabel, pressed && styles.saveButtonLabelPressed]}>review order</Text>
                  <Text style={[styles.saveButtonMeta, pressed && styles.saveButtonMetaPressed]}>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </Text>
                </View>
                <View style={[styles.saveButtonTotalChip, pressed && styles.saveButtonTotalChipPressed]}>
                  <Text style={[styles.saveButtonTotal, pressed && styles.saveButtonTotalPressed]}>{currency} {total.toFixed(2)}</Text>
                </View>
              </View>
            )
          )}
        </Pressable>
      </View>

      {/* ── Review order modal ───────────────────────────────── */}
      <Modal
        visible={showReviewModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.reviewOverlay}>
          <View style={styles.reviewSheet}>
            {/* Header */}
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewTitle}>review order</Text>
              <TouchableOpacity
                onPress={() => setShowReviewModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={18} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Customer */}
              {(customerName.trim() || customerPhone.trim()) && (
                <View style={styles.reviewSection}>
                  {customerName.trim() !== '' && (
                    <Text style={styles.reviewCustomerName}>{customerName.trim()}</Text>
                  )}
                  {customerPhone.trim() !== '' && (
                    <Text style={styles.reviewCustomerSub}>{customerPhone.trim()}</Text>
                  )}
                  {customerAddress.trim() !== '' && (
                    <Text style={styles.reviewCustomerSub}>{customerAddress.trim()}</Text>
                  )}
                </View>
              )}

              {/* Items slip */}
              <View style={styles.reviewSlip}>
                <View style={styles.slipDividerRow}>
                  {Array.from({ length: 20 }).map((_, i) => (
                    <View key={i} style={styles.slipDash} />
                  ))}
                </View>
                {items.map((item, index) => (
                  <View key={item.productId || item.productName || String(index)} style={styles.slipRow}>
                    <Text style={styles.slipQty}>
                      {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}{'\u00D7'}
                    </Text>
                    <Text style={styles.slipName} numberOfLines={1}>{item.productName}</Text>
                    <Text style={styles.slipPrice}>
                      {currency} {(item.unitPrice * item.quantity).toFixed(0)}
                    </Text>
                  </View>
                ))}
                <View style={styles.slipTotalRow}>
                  <Text style={styles.slipTotalLabel}>total</Text>
                  <Text style={styles.slipTotalAmount}>{currency} {total.toFixed(2)}</Text>
                </View>
              </View>

              {/* Delivery */}
              {deliveryDate && isValid(deliveryDate) && (
                <View style={styles.reviewMeta}>
                  <Feather name="truck" size={13} color={CALM.textMuted} />
                  <Text style={styles.reviewMetaText}>{format(deliveryDate, 'EEEE, dd MMM')}</Text>
                </View>
              )}

              {/* Note */}
              {note.trim() !== '' && (
                <View style={styles.reviewMeta}>
                  <Feather name="file-text" size={13} color={CALM.textMuted} />
                  <Text style={styles.reviewMetaText}>{note.trim()}</Text>
                </View>
              )}
            </ScrollView>

            {/* Confirm button */}
            <Pressable
              onPress={() => { setShowReviewModal(false); setTimeout(handleSubmit, 50); }}
              accessibilityRole="button"
              accessibilityLabel="Confirm and save order"
              style={({ pressed }) => [
                styles.confirmBtn,
                pressed && { opacity: 0.82 },
              ]}
            >
              {() => (
                <View style={styles.saveButtonInner}>
                  <Text style={styles.confirmBtnLabel}>confirm order</Text>
                  <View style={styles.confirmBtnChip}>
                    <Text style={styles.confirmBtnTotal}>{currency} {total.toFixed(2)}</Text>
                  </View>
                </View>
              )}
            </Pressable>
            <TouchableOpacity
              onPress={() => setShowReviewModal(false)}
              style={styles.cancelBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelBtnText}>cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Product picker modal ─────────────────────────────── */}
      <Modal
        visible={showProductPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProductPicker(false)}
      >
        <KeyboardAvoidingView
          style={styles.pickerOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => { Keyboard.dismiss(); setShowProductPicker(false); }}
          />
          <TouchableOpacity activeOpacity={1} style={styles.pickerCard}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>add items</Text>
              <TouchableOpacity
                onPress={() => setShowProductPicker(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="x" size={18} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.pickerSearchRow}>
              <Feather name="search" size={14} color={CALM.textMuted} />
              <TextInput
                style={styles.pickerSearchInput}
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="search products..."
                placeholderTextColor={CALM.textMuted}
                accessibilityLabel="Search products"
              />
              {productSearch.length > 0 && (
                <TouchableOpacity
                  onPress={() => setProductSearch('')}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={14} color={CALM.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Product list */}
            <ScrollView
              style={styles.pickerList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {activeProducts.length === 0 ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.noProductsLink}
                  onPress={() => {
                    setShowProductPicker(false);
                    navigation.getParent()?.navigate('SellerProducts');
                  }}
                  accessibilityRole="link"
                  accessibilityLabel="Add products to get started"
                >
                  <Feather name="plus-circle" size={16} color={CALM.textSecondary} />
                  <Text style={styles.noProductsText}>add products to get started</Text>
                </TouchableOpacity>
              ) : (
                filteredSortedProducts.map((product, index) => {
                  const qty = itemQtyMap[product.id] || 0;
                  const hasQty = qty > 0;
                  return (
                    <View
                      key={product.id}
                      style={[
                        styles.productRow,
                        hasQty && styles.productRowActive,
                        index === filteredSortedProducts.length - 1 && styles.productRowLast,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.productRowContent}
                        activeOpacity={0.7}
                        onPress={() => handleAddProduct(product)}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${product.name}, ${currency} ${product.pricePerUnit.toFixed(0)} per ${product.unit}`}
                      >
                        <View style={styles.productRowLeft}>
                          <Text style={[styles.productName, hasQty && styles.productNameActive]} numberOfLines={1}>
                            {product.name}
                          </Text>
                          <Text style={[styles.productPrice, hasQty && styles.productPriceActive]}>
                            {currency} {product.pricePerUnit.toFixed(0)}/{product.unit}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      {hasQty ? (
                        <View style={styles.qtyControls}>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            activeOpacity={0.7}
                            onPress={() => handleUpdateQuantity(product.id, qty - 1)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Decrease ${product.name}`}
                          >
                            <Feather name="minus" size={14} color={CALM.textSecondary} />
                          </TouchableOpacity>
                          {editingQtyProductId === product.id ? (
                            <TextInput
                              style={[styles.qtyText, styles.qtyInput]}
                              value={editingQtyValue}
                              onChangeText={setEditingQtyValue}
                              onSubmitEditing={() => handleQtyInputSubmit(product.id)}
                              onBlur={() => handleQtyInputSubmit(product.id)}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              autoFocus
                              maxLength={6}
                            />
                          ) : (
                            <TouchableOpacity
                              onPress={() => handleQtyTap(product.id, qty)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.qtyText}>{qty % 1 === 0 ? qty : qty.toFixed(1)}</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            activeOpacity={0.7}
                            onPress={() => handleAddProduct(product)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Increase ${product.name}`}
                          >
                            <Feather name="plus" size={14} color={CALM.bronze} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.addBtn}
                          activeOpacity={0.7}
                          onPress={() => handleAddProduct(product)}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${product.name}`}
                        >
                          <Feather name="plus" size={15} color={CALM.bronze} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Done button */}
            <Pressable
              onPress={() => { lightTap(); setShowProductPicker(false); }}
              accessibilityRole="button"
              accessibilityLabel={items.length > 0 ? `Done, ${itemCount} items` : 'Close'}
              style={({ pressed }) => [
                styles.pickerDoneBtn,
                items.length === 0 && styles.pickerDoneBtnEmpty,
                items.length > 0 && pressed && styles.pickerDoneBtnPressed,
              ]}
            >
              {({ pressed }) => (
                <Text style={[styles.pickerDoneBtnText, items.length === 0 && styles.pickerDoneBtnTextEmpty, items.length > 0 && pressed && styles.pickerDoneBtnTextPressed]}>
                  {items.length > 0 ? `done · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'close'}
                </Text>
              )}
            </Pressable>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Contact picker modal ─────────────────────────────── */}
      <Modal
        visible={showContactPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowContactPicker(false)}
      >
        <KeyboardAvoidingView
          style={styles.contactModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowContactPicker(false)} />
          <View style={styles.contactPickerSheet}>
            <View style={styles.contactSheetHandle} />
            <View style={styles.contactSheetHeader}>
              <Text style={styles.contactSheetTitle}>pick contact</Text>
              <TouchableOpacity onPress={() => setShowContactPicker(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={20} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.contactSearchBar}>
              <Feather name="search" size={18} color={CALM.textMuted} />
              <TextInput
                style={styles.contactSearchInput}
                placeholder="search contacts..."
                placeholderTextColor={CALM.textMuted}
                value={contactSearch}
                onChangeText={setContactSearch}
                autoFocus
              />
              {contactSearch.length > 0 && (
                <TouchableOpacity onPress={() => setContactSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={14} color={CALM.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredContacts}
              keyExtractor={(item, idx) => (item as any).id ?? String(idx)}
              style={styles.contactList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item: contact }) => {
                const phone = contact.phoneNumbers?.[0]?.number || '';
                return (
                  <TouchableOpacity
                    style={styles.contactItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      lightTap();
                      const addr = contact.addresses?.[0]
                        ? [contact.addresses[0].street, contact.addresses[0].city, contact.addresses[0].region]
                            .filter(Boolean).join(', ')
                        : '';
                      setCustomerName(contact.name || '');
                      setCustomerPhone(phone);
                      setCustomerAddress(addr);
                      setShowContactPicker(false);
                    }}
                  >
                    <View style={styles.contactAvatar}>
                      <Text style={styles.contactAvatarText}>{(contact.name || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
                      {phone ? <Text style={styles.contactPhone} numberOfLines={1}>{phone}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={18} color={CALM.textMuted} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.contactEmpty}>
                  <Text style={styles.contactEmptyText}>no contacts found</Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Confirmation modal ───────────────────────────────── */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={handleDone}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Animated.View
                style={[
                  styles.modalCheckCircle,
                  { transform: [{ scale: checkScaleAnim }] },
                ]}
              >
                <Feather name="check" size={24} color="#fff" />
              </Animated.View>
              <View>
                <Text style={styles.modalTitle}>order saved</Text>
                {savedOrderNumber !== '' && (
                  <Text style={styles.modalOrderNumber}>#{savedOrderNumber}</Text>
                )}
                {customerName.trim() !== '' && (
                  <Text style={styles.modalCustomerName}>{customerName.trim()}</Text>
                )}
              </View>
            </View>

            <View style={styles.modalTextBox}>
              <Text style={styles.modalPreviewText}>{confirmationText}</Text>
            </View>

            {/* ── Inline QR panel ─── TODO: add later ─────────── */}

            <View style={styles.modalActions}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.modalCopyButton}
                onPress={handleCopyToClipboard}
                accessibilityRole="button"
                accessibilityLabel="Copy confirmation text"
              >
                <Feather
                  name={copiedFlag ? 'check' : 'copy'}
                  size={16}
                  color={CALM.bronze}
                />
                <Text style={styles.modalCopyText}>
                  {copiedFlag ? 'copied' : 'copy message'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.modalWhatsAppButton}
                onPress={handleShareWhatsApp}
                accessibilityRole="button"
                accessibilityLabel="Send via WhatsApp"
              >
                <Feather name="message-circle" size={16} color="#fff" />
                <Text style={styles.modalWhatsAppText}>send via WhatsApp</Text>
              </TouchableOpacity>

              {/* QR button — TODO: add later */}

              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.modalDoneButton}
                onPress={handleDone}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.modalDoneText}>done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── STYLES ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.md,
    paddingBottom: SPACING['5xl'],
    gap: SPACING.sm,
  },

  // ── Avatar ────────────────────────────────────────────────
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  avatarCircleFilled: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: '#fff',
  },

  // ── Customer card ─────────────────────────────────────────
  customerCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  customerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
  },
  customerNameInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
    paddingVertical: SPACING.sm,
  },
  customerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.sm,
    gap: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  customerSubInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    flex: 1,
    paddingVertical: 2,
  },
  customerSubDot: {
    width: 1,
    height: 12,
    backgroundColor: CALM.border,
    marginHorizontal: SPACING.xs,
  },

  // ── Recent customers ──────────────────────────────────────
  recentScroll: {
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  recentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.25),
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
  },
  recentPillPressed: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  recentPillAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withAlpha(CALM.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentPillAvatarPressed: {
    backgroundColor: withAlpha('#fff', 0.2),
  },
  recentPillAvatarText: {
    fontSize: 10,
    fontWeight: '700' as '700',
    color: CALM.bronze,
  },
  recentPillAvatarTextPressed: {
    color: '#fff',
  },
  recentName: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
    maxWidth: 100,
  },
  recentNamePressed: {
    color: '#fff',
  },

  // ── Autocomplete suggestions ──────────────────────────────
  suggestionsRow: {
    maxHeight: 36,
    marginTop: -SPACING.xs,
  },
  suggestionsContent: {
    gap: SPACING.xs,
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.25),
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
  },
  suggestionPillPressed: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  suggestionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },
  suggestionTextPressed: {
    color: '#fff',
  },

  // ── Reorder pills ─────────────────────────────────────────
  reorderScroll: {
    gap: SPACING.xs,
  },
  reorderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.25),
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
  },
  reorderPillPressed: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  reorderPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },
  reorderPillTextPressed: {
    color: '#fff',
  },

  // ── WhatsApp (inline in menu) ─────────────────────────────
  whatsAppInline: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  whatsAppInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  whatsAppParseBtn: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: withAlpha(CALM.textPrimary, 0.25),
    backgroundColor: withAlpha(CALM.textPrimary, 0.05),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  whatsAppParseBtnPressed: {
    backgroundColor: CALM.textPrimary,
    borderColor: CALM.textPrimary,
  },
  whatsAppParseBtnDisabled: {
    borderColor: CALM.border,
    backgroundColor: 'transparent',
  },
  whatsAppParseBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  whatsAppParseBtnTextPressed: {
    color: '#fff',
  },
  whatsAppParseBtnTextDisabled: {
    color: CALM.textMuted,
  },
  unmatchedBox: {
    borderLeftWidth: 3,
    borderLeftColor: BIZ.warning,
    paddingLeft: SPACING.md,
    gap: SPACING.xs,
  },
  unmatchedLabel: {
    ...TYPE.label,
  },
  unmatchedItem: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },

  // ── Product menu ──────────────────────────────────────────
  menuCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  menuHeaderText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
    letterSpacing: 0.5,
  },
  menuHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  menuHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  waIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waIconBtnActive: {
    backgroundColor: CALM.textPrimary,
  },
  itemCountBadge: {
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  itemCountText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: '#fff',
  },
  noProductsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING['2xl'],
    minHeight: 44,
  },
  noProductsText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textSecondary,
  },

  // Product search
  productSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  productSearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    paddingVertical: SPACING.xs,
  },

  // Product rows
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
    minHeight: 48,
  },
  productRowActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.04),
    borderLeftWidth: 3,
    borderLeftColor: CALM.bronze,
  },
  productRowLast: {},
  productRowContent: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  productRowLeft: {
    gap: 2,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
  },
  productNameActive: {
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
  },
  productPrice: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  productPriceActive: {
    color: CALM.textSecondary,
  },

  // Quantity controls
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(CALM.bronze, 0.08),
  },
  qtyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
    minWidth: 20,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  qtyInput: {
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    minWidth: 28,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: CALM.bronze,
  },
  addProductBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CALM.deepOlive,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Selected items in card ────────────────────────────────
  emptyItemsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.xl,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.25),
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
    alignSelf: 'center',
  },
  emptyItemsBtnPressed: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  emptyItemsText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },
  emptyItemsTextPressed: {
    color: '#fff',
  },
  addMoreRow: {
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xs,
  },
  addMorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.25),
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  addMorePillPressed: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  addMoreText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },
  addMoreTextPressed: {
    color: '#fff',
  },
  selectedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
    minHeight: 56,
    gap: SPACING.sm,
  },
  selectedItemRowFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  selectedItemLeft: {
    flex: 1,
    gap: 2,
  },
  selectedItemName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  selectedItemPrice: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  selectedItemTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    minWidth: 48,
    textAlign: 'right',
  },

  // ── Contact picker ────────────────────────────────────────
  contactModalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(CALM.textPrimary, 0.4),
    justifyContent: 'flex-end',
  },
  contactPickerSheet: {
    backgroundColor: CALM.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '75%',
    paddingBottom: SPACING['2xl'],
    ...SHADOWS.lg,
  },
  contactSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: CALM.border,
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  contactSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  contactSheetTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  contactSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    minHeight: 44,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  contactSearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    paddingVertical: SPACING.xs,
  },
  contactList: {
    flexGrow: 0,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
    minHeight: 60,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(CALM.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: CALM.bronze,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
  },
  contactPhone: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
    marginTop: 1,
  },
  contactEmpty: {
    padding: SPACING['2xl'],
    alignItems: 'center',
  },
  contactEmptyText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
  },

  // ── Product picker modal ──────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: withAlpha(CALM.textPrimary, 0.45),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  pickerCard: {
    width: '100%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    maxHeight: '82%',
    ...SHADOWS.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  pickerTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    backgroundColor: CALM.background,
    ...SHADOWS.sm,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    paddingVertical: SPACING.xs,
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerDoneBtn: {
    margin: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.25),
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    minHeight: 44,
  },
  pickerDoneBtnPressed: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  pickerDoneBtnEmpty: {
    borderColor: CALM.border,
    backgroundColor: 'transparent',
  },
  pickerDoneBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },
  pickerDoneBtnTextPressed: {
    color: '#fff',
  },
  pickerDoneBtnTextEmpty: {
    color: CALM.textMuted,
  },

  // ── Order slip ────────────────────────────────────────────
  orderSlip: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingTop: 0,
    overflow: 'hidden',
  },
  slipDividerRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: SPACING.md,
    paddingTop: SPACING.md,
  },
  slipDash: {
    flex: 1,
    height: 1.5,
    backgroundColor: CALM.border,
    borderRadius: 1,
  },
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    gap: SPACING.sm,
  },
  slipQty: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
    width: 22,
    textAlign: 'right',
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  slipName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  slipPrice: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  slipTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  slipTotalLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  slipTotalAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Review modal ─────────────────────────────────────────
  reviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  reviewSheet: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    width: '100%',
    maxHeight: '80%',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  reviewTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  reviewSection: {
    marginBottom: SPACING.sm,
  },
  reviewCustomerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  reviewCustomerSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  reviewSlip: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    marginBottom: SPACING.sm,
  },
  reviewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  reviewMetaText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  confirmBtn: {
    backgroundColor: BIZ.success,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  confirmBtnLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },
  confirmBtnChip: {
    paddingHorizontal: SPACING.sm,
  },
  confirmBtnTotal: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: '#fff',
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cancelBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },

  // ── Calendar date picker overlay ─────────────────────────
  datePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
    zIndex: 999,
  },
  datePickerCard: {
    borderRadius: RADIUS.xl,
    alignSelf: 'stretch',
    ...SHADOWS.lg,
  },
  datePickerCardInner: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  datePickerTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  datePickerDone: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: CALM.bronze,
  },

  // ── Details card (delivery + note) ───────────────────────
  detailsCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    paddingHorizontal: SPACING.lg,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  deliveryLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
    letterSpacing: 0.5,
    marginRight: SPACING.xs,
  },
  detailsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CALM.border,
  },
  deliveryPills: {
    flexDirection: 'row',
    gap: SPACING.xs,
    flex: 1,
  },
  dPill: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 30,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.25),
    backgroundColor: withAlpha(CALM.bronze, 0.08),
  },
  dPillActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  dPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },
  dPillTextActive: {
    color: '#fff',
  },
  deliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    paddingVertical: 2,
    marginBottom: SPACING.sm,
  },
  deliveryBadgeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  noteInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    paddingVertical: 2,
  },

  // ── Bottom bar ────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.lg,
    backgroundColor: CALM.background,
  },
  saveButton: {
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.25),
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  saveButtonPressed: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  saveButtonDisabled: {
    borderColor: CALM.border,
    backgroundColor: withAlpha(CALM.border, 0.3),
  },
  saveButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: SPACING.sm,
  },
  saveButtonLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },
  saveButtonLabelPressed: {
    color: '#fff',
  },
  saveButtonMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: withAlpha(CALM.bronze, 0.6),
    marginTop: 1,
  },
  saveButtonMetaPressed: {
    color: withAlpha('#fff', 0.75),
  },
  saveButtonTotalChip: {
    paddingHorizontal: SPACING.sm,
  },
  saveButtonTotalChipPressed: {},
  saveButtonTotal: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: CALM.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  saveButtonTotalPressed: {
    color: '#fff',
  },
  saveButtonTextDisabled: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
  },

  // ── Confirmation modal ────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(CALM.textPrimary, 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  modalCard: {
    width: '100%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.lg,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  modalCheckCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BIZ.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  modalOrderNumber: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  modalCustomerName: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  modalTextBox: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
  },
  modalPreviewText: {
    fontSize: TYPOGRAPHY.size.base,
    lineHeight: 20,
    color: CALM.textPrimary,
  },
  modalActions: {
    gap: SPACING.sm,
  },
  modalCopyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
  },
  modalCopyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
  },
  modalWhatsAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: WHATSAPP_GREEN,
    minHeight: 44,
  },
  modalWhatsAppText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },
  modalDoneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: CALM.deepOlive,
    minHeight: 48,
  },
  modalDoneText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },

  // ── QR panel ─────────────────────────────────────────────
  qrPanel: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  qrAmount: {
    fontSize: 28,
    fontWeight: '700' as '700',
    color: CALM.textPrimary,
    letterSpacing: -0.5,
  },
  qrTabs: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  qrTab: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  qrTabActive: {
    backgroundColor: CALM.accent,
  },
  qrTabText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
  },
  qrTabTextActive: {
    color: '#fff',
    fontWeight: '600' as '600',
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
  },
  modalQrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
  },
  modalQrText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
  },
});

export default NewOrder;
