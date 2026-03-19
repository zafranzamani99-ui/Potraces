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
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  LayoutAnimation,
  UIManager,
  Linking,
  Image,
  Dimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import CalendarPicker from '../../components/common/CalendarPicker';
import { format, addDays, isValid } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { SellerOrderItem, SellerProduct, SellerOrder } from '../../types';
import { parseWhatsAppOrder, detectWhatsAppSections, WhatsAppSection } from '../../utils/parseWhatsAppOrder';
import { parseWhatsAppOrderAI } from '../../services/aiService';
import { KeyboardAwareScrollView, KeyboardAvoidingView as KAView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightTap, selectionChanged, successNotification, mediumTap, warningNotification } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SEARCH_THRESHOLD = 8;
const WHATSAPP_GREEN = '#25D366'; // WhatsApp brand color — intentional exception to CALM palette

// ─── Memoized row to avoid re-rendering all items on single qty change ───
const SelectedItemRow = React.memo(({ item, index, currency, qty, isEditing, editingValue, onQtyChange, onEditStart, onEditChange, onEditSubmit, styles }: {
  item: SellerOrderItem; index: number; currency: string; qty: number;
  isEditing: boolean; editingValue: string;
  onQtyChange: (id: string, qty: number) => void;
  onEditStart: (id: string, qty: number) => void;
  onEditChange: (v: string) => void;
  onEditSubmit: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) => {
  const C = useCalm();
  return (
  <View style={[styles.selectedItemRow, index > 0 && styles.selectedItemRowBorder]}>
    <View style={styles.selectedItemLeft}>
      <Text style={styles.selectedItemName} numberOfLines={1}>{item.productName}</Text>
      <Text style={styles.selectedItemPrice}>{currency} {item.unitPrice.toFixed(0)}/{item.unit}</Text>
    </View>
    <View style={styles.qtyControls}>
      <TouchableOpacity
        style={styles.qtyBtn} activeOpacity={0.6}
        onPress={() => onQtyChange(item.productId, qty - 1)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button" accessibilityLabel={`Decrease ${item.productName}`}
      >
        <Feather name="minus" size={13} color={C.textSecondary} />
      </TouchableOpacity>
      {isEditing ? (
        <TextInput
          style={[styles.qtyText, styles.qtyInput]}
          value={editingValue} onChangeText={onEditChange}
          onSubmitEditing={() => onEditSubmit(item.productId)}
          onBlur={() => onEditSubmit(item.productId)}
          keyboardType="decimal-pad" selectTextOnFocus autoFocus maxLength={6}
        />
      ) : (
        <TouchableOpacity onPress={() => onEditStart(item.productId, item.quantity)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.qtyText}>{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.qtyBtn, styles.qtyBtnPlus]} activeOpacity={0.6}
        onPress={() => onQtyChange(item.productId, qty + 1)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button" accessibilityLabel={`Increase ${item.productName}`}
      >
        <Feather name="plus" size={13} color={C.bronze} />
      </TouchableOpacity>
    </View>
    <Text style={styles.selectedItemTotal}>{currency} {(item.unitPrice * item.quantity).toFixed(0)}</Text>
  </View>
);
});

// ─── MAIN COMPONENT ────────────────────────────────────────────
const NewOrder: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const products = useSellerStore((s) => s.products);
  const addOrder = useSellerStore((s) => s.addOrder);
  const orders = useSellerStore((s) => s.orders);
  const sellerCustomers = useSellerStore((s) => s.sellerCustomers);
  const addSellerCustomer = useSellerStore((s) => s.addSellerCustomer);
  const updateSellerCustomer = useSellerStore((s) => s.updateSellerCustomer);
  const activeSeason = useSellerStore(useCallback((s) => s.getActiveSeason(), []));
  const currency = useSettingsStore((s) => s.currency);
  const paymentQrs = useSettingsStore((s) => s.businessPaymentQrs);
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
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(0);

  const detectedSections = useMemo(() => {
    if (!whatsAppText.trim()) return [];
    return detectWhatsAppSections(whatsAppText);
  }, [whatsAppText]);

  const effectiveSectionIdx = selectedSectionIdx < detectedSections.length ? selectedSectionIdx : 0;
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

  // WhatsApp parsing — uses selected section content if sections detected
  const handleParseWhatsApp = useCallback(async () => {
    const textToParse = detectedSections.length > 0
      ? detectedSections[effectiveSectionIdx]?.content || whatsAppText
      : whatsAppText;

    if (!textToParse.trim()) return;
    setIsParsing(true);

    let local = { items: [] as any[], unmatched: [] as string[] };
    try { local = parseWhatsAppOrder(textToParse, products); } catch (_) {}
    if (local.items.length > 0) {
      setItems(local.items);
      setUnmatched(local.unmatched);
      setIsParsing(false);
      setShowWhatsAppPaste(false);
      return;
    }

    const aiItems = await parseWhatsAppOrderAI(textToParse, products);
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
          unit: ai.unit || product?.unit || 'balang',
        };
      });
      const validMapped = mapped.filter((i) => i.unitPrice > 0 || i.productId !== '');
      const zeroPriceNames = mapped.filter((i) => i.unitPrice === 0 && i.productId === '').map((i) => i.productName);
      setItems(validMapped);
      setUnmatched(zeroPriceNames.length > 0 ? zeroPriceNames : []);
    } else {
      setUnmatched([textToParse.trim().slice(0, 120)]);
    }

    setIsParsing(false);
    setShowWhatsAppPaste(false);
  }, [whatsAppText, products, detectedSections, effectiveSectionIdx]);

  // Product add/remove
  const handleAddProduct = useCallback((product: SellerProduct) => {
    selectionChanged();
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
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i))
      );
    }
  }, []);

  // Confirmation text
  const confirmationText = useMemo(() => {
    const name = customerName.trim();
    const lines: string[] = [];

    if (name) {
      lines.push(`Thanks for your order, ${name}!`);
    } else {
      lines.push('Thanks for your order!');
    }
    lines.push('');
    if (savedOrderNumber) {
      lines.push(`Order #${savedOrderNumber}`);
    }
    for (const item of items) {
      lines.push(`- ${item.productName} x${item.quantity} ${item.unit}`);
    }
    lines.push('');
    lines.push(`Total: ${currency} ${total.toFixed(2)}`);

    if (deliveryDate && isValid(deliveryDate)) {
      lines.push(`Delivery: ${format(deliveryDate, 'dd MMM')}`);
    }

    return lines.join('\n');
  }, [customerName, items, currency, total, deliveryDate, savedOrderNumber]);

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
      warningNotification();
      showToast('add at least one item to the order', 'error');
      return;
    }

    // Filter out items with empty productId
    const validItems = items.filter(i => i.productId && i.productId.trim() !== '');
    if (validItems.length === 0) {
      warningNotification();
      showToast('no valid products in order', 'error');
      return;
    }

    // Validate customer phone before creating order
    if (!persistCustomer()) return;

    addOrder({
      items: validItems,
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
    await Clipboard.setStringAsync(confirmationText);
    setCopiedFlag(true);
  }, [confirmationText]);

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
    const encodedText = encodeURIComponent(confirmationText);

    if (phone) {
      let digits = phone.replace(/[^0-9]/g, '');
      if (digits.startsWith('0')) digits = '60' + digits.slice(1);
      Linking.openURL(`https://wa.me/${digits}?text=${encodedText}`);
    } else {
      Linking.openURL(`https://wa.me/?text=${encodedText}`);
    }
  }, [customerPhone, confirmationText]);

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
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {/* ── Section: Customer ─────────────────────────────── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>customer</Text>
          <View style={styles.customerCard}>
            <View style={styles.customerMainRow}>
              <View
                style={[styles.avatarCircle, customerName.trim() ? styles.avatarCircleFilled : null]}
                accessibilityLabel={customerName.trim() ? customerName.trim() : undefined}
              >
                {customerName.trim() ? (
                  <Text style={styles.avatarText}>{customerName.trim()?.[0]?.toUpperCase() ?? ''}</Text>
                ) : (
                  <Feather name="user" size={14} color={C.textMuted} />
                )}
              </View>
              <TextInput
                style={styles.customerNameInput}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="who's this for?"
                placeholderTextColor={C.textMuted}
                accessibilityLabel="Customer name"
              />
              {!customerName.trim() && (
                <TouchableOpacity
                  style={styles.contactsPill}
                  onPress={handleImportFromContacts}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Import from contacts"
                >
                  <Feather name="book" size={12} color={C.bronze} />
                  <Text style={styles.contactsPillText}>contacts</Text>
                </TouchableOpacity>
              )}
              {customerName.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.customerClearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Clear customer"
                >
                  <Feather name="x" size={14} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {customerName.trim().length > 0 && (
              <>
                <View style={styles.customerFieldDivider} />
                <View style={styles.customerFieldRow}>
                  <Feather name="phone" size={12} color={C.textMuted} />
                  <TextInput
                    style={styles.customerFieldInput}
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                    placeholder="phone number"
                    placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                    keyboardType="phone-pad"
                    accessibilityLabel="Phone"
                  />
                </View>
                <View style={styles.customerFieldDivider} />
                <View style={styles.customerFieldRow}>
                  <Feather name="map-pin" size={12} color={C.textMuted} />
                  <TextInput
                    style={styles.customerFieldInput}
                    value={customerAddress}
                    onChangeText={setCustomerAddress}
                    placeholder="delivery address"
                    placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                    accessibilityLabel="Address"
                  />
                </View>
              </>
            )}
          </View>

          {/* Recent customers */}
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
        </View>

        {/* ── Section: Items ──────────────────────────────────── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>items</Text>
            {items.length > 0 && (
              <Text style={styles.sectionLabelMeta}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
            )}
          </View>
          <View style={styles.menuCard}>
            {/* Paste order + reorder row */}
            <View style={styles.menuActionBar}>
              <TouchableOpacity
                style={[styles.waPasteBtn, showWhatsAppPaste && styles.waPasteBtnActive]}
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
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={showWhatsAppPaste ? 'Close WhatsApp import' : 'Import from WhatsApp'}
              >
                <Feather name="clipboard" size={13} color={showWhatsAppPaste ? '#fff' : C.bronze} />
                <Text style={[styles.waPasteBtnText, showWhatsAppPaste && styles.waPasteBtnTextActive]}>
                  paste order
                </Text>
              </TouchableOpacity>
              <Pressable
                onPress={() => { lightTap(); setShowProductPicker(true); }}
                accessibilityRole="button"
                accessibilityLabel="Add items"
                style={({ pressed }) => [styles.addItemsPill, pressed && styles.addItemsPillPressed]}
              >
                {({ pressed }) => (
                  <>
                    <Feather name="plus" size={13} color="#fff" />
                    <Text style={[styles.addItemsPillText, pressed && styles.addItemsPillTextPressed]}>
                      {items.length > 0 ? 'add more' : 'add items'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* WhatsApp paste — inline */}
            {showWhatsAppPaste && (
              <View style={styles.whatsAppInline}>
                <TextInput
                  style={styles.whatsAppInput}
                  value={whatsAppText}
                  onChangeText={setWhatsAppText}
                  placeholder="paste WhatsApp message..."
                  placeholderTextColor={C.textMuted}
                  multiline
                  numberOfLines={2}
                  accessibilityLabel="WhatsApp message"
                />
                {detectedSections.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionChipsRow}>
                    {detectedSections.map((section, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.sectionChip, effectiveSectionIdx === idx && styles.sectionChipActive]}
                        onPress={() => { lightTap(); setSelectedSectionIdx(idx); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.sectionChipText, effectiveSectionIdx === idx && styles.sectionChipTextActive]} numberOfLines={1}>
                          {section.title}
                        </Text>
                        <Text style={[styles.sectionChipCount, effectiveSectionIdx === idx && styles.sectionChipCountActive]}>
                          {section.itemCount}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
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
                      <ActivityIndicator size="small" color={whatsAppText.trim() ? (pressed ? '#fff' : C.textPrimary) : C.textMuted} />
                    ) : (
                      <>
                        <Feather name="zap" size={15} color={!whatsAppText.trim() ? C.textMuted : pressed ? '#fff' : C.textPrimary} />
                        <Text style={[styles.whatsAppParseBtnText, !whatsAppText.trim() && styles.whatsAppParseBtnTextDisabled, whatsAppText.trim() && pressed && styles.whatsAppParseBtnTextPressed]}>
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

            {/* Reorder pills (known customer, no items yet) */}
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
                        <Feather name="rotate-ccw" size={14} color={pressed ? '#fff' : C.bronze} />
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

            {/* Empty state */}
            {items.length === 0 && !showWhatsAppPaste && recentOrders.length === 0 && (
              <Pressable
                style={styles.emptyItemsWrap}
                onPress={() => { lightTap(); setShowProductPicker(true); }}
                accessibilityRole="button"
                accessibilityLabel="Add items"
              >
                <Feather name="shopping-bag" size={20} color={C.textMuted} />
                <Text style={styles.emptyItemsHint}>tap to add items</Text>
              </Pressable>
            )}

            {/* Selected items */}
            {items.length > 0 && (
              <View style={styles.selectedItemsWrap}>
                {items.map((item, index) => (
                  <SelectedItemRow
                    key={item.productId || item.productName || String(index)}
                    item={item}
                    index={index}
                    currency={currency}
                    qty={itemQtyMap[item.productId] || 0}
                    isEditing={editingQtyProductId === item.productId}
                    editingValue={editingQtyValue}
                    onQtyChange={handleUpdateQuantity}
                    onEditStart={handleQtyTap}
                    onEditChange={setEditingQtyValue}
                    onEditSubmit={handleQtyInputSubmit}
                    styles={styles}
                  />
                ))}
                {/* Subtotal row */}
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>subtotal</Text>
                  <Text style={styles.subtotalAmount}>{currency} {total.toFixed(2)}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ── Section: Details ────────────────────────────────── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>details</Text>
          <View style={styles.detailsCard}>
            {/* Delivery */}
            <View style={styles.detailsFieldRow}>
              <View style={styles.deliveryRow}>
                <Feather name="truck" size={14} color={C.textMuted} />
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
                    <Text style={[styles.dPillText, deliveryMode === 'today' && styles.dPillTextActive]}>today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.dPill, deliveryMode === 'tomorrow' && styles.dPillActive]}
                    onPress={handleDeliveryTomorrow}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Deliver tomorrow"
                  >
                    <Text style={[styles.dPillText, deliveryMode === 'tomorrow' && styles.dPillTextActive]}>tomorrow</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.dPill, deliveryMode === 'pick' && styles.dPillActive]}
                    onPress={handleDeliveryPick}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Pick a date"
                  >
                    <Feather name="calendar" size={14} color={deliveryMode === 'pick' ? '#fff' : C.bronze} />
                  </TouchableOpacity>
                </View>
              </View>
              {deliveryDate && isValid(deliveryDate) && (
                <View style={styles.deliveryBadge}>
                  <Feather name="calendar" size={12} color={C.bronze} />
                  <Text style={styles.deliveryBadgeText}>
                    {format(deliveryDate, 'EEEE, dd MMM')}
                  </Text>
                  <TouchableOpacity
                    onPress={handleClearDelivery}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.deliveryClearBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Clear delivery date"
                  >
                    <Feather name="x" size={12} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.detailsDivider} />

            {/* Note */}
            <View style={styles.detailsFieldRow}>
              <View style={styles.detailsFieldHeader}>
                <Feather name="edit-3" size={14} color={C.textMuted} />
                <Text style={styles.detailsFieldLabel}>note</Text>
              </View>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="add a note for this order..."
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                accessibilityLabel="Order note"
                multiline
                scrollEnabled={false}
              />
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* ── Delivery date picker overlay ─────────────────── */}
      {showDatePicker && <Modal
        visible
        transparent
        statusBarTranslucent
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
      </Modal>}

      {/* ── Bottom bar ────────────────────────────────────── */}
      {!isDisabled && (
        <View style={styles.saveButtonWrap} pointerEvents="box-none">
          <Pressable
            onPress={() => { lightTap(); setShowReviewModal(true); }}
            accessibilityRole="button"
            accessibilityLabel={`Save order, ${itemCount} items, total ${currency} ${total.toFixed(2)}`}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
            ]}
          >
            <View style={styles.saveButtonLeft}>
              <Text style={styles.saveButtonLabel}>review order</Text>
              <Text style={styles.saveButtonMeta}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
            </View>
            <View style={styles.saveButtonTotalWrap}>
              <Text style={styles.saveButtonTotal}>{currency} {total.toFixed(2)}</Text>
              <Feather name="chevron-right" size={18} color="#fff" />
            </View>
          </Pressable>
        </View>
      )}

      {/* ── Review order modal ───────────────────────────────── */}
      {showReviewModal && <Modal
        visible
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.reviewOverlay}>
          <View style={styles.reviewSheet}>
            {/* Header */}
            <View style={styles.reviewHeader}>
              <View style={styles.reviewHeaderLeft}>
                <View style={styles.reviewIconWrap}>
                  <Feather name="file-text" size={16} color={C.bronze} />
                </View>
                <Text style={styles.reviewTitle}>review order</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowReviewModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.reviewCloseBtn}
              >
                <Feather name="x" size={16} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
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
                  <Feather name="truck" size={13} color={C.textMuted} />
                  <Text style={styles.reviewMetaText}>{format(deliveryDate, 'EEEE, dd MMM')}</Text>
                </View>
              )}

              {/* Note */}
              {note.trim() !== '' && (
                <View style={styles.reviewMeta}>
                  <Feather name="file-text" size={13} color={C.textMuted} />
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
                <View style={styles.confirmBtnInner}>
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
      </Modal>}

      {/* ── Product picker modal ─────────────────────────────── */}
      {showProductPicker && <Modal
        visible
        transparent
        statusBarTranslucent
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
          <View style={styles.pickerCard} onStartShouldSetResponder={() => true}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={styles.pickerIconWrap}>
                  <Feather name="shopping-bag" size={17} color={C.bronze} />
                </View>
                <Text style={styles.pickerTitle}>add items</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowProductPicker(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.pickerCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="x" size={16} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.pickerSearchRow}>
              <Feather name="search" size={15} color={withAlpha(C.textMuted, 0.6)} />
              <TextInput
                style={styles.pickerSearchInput}
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="search products..."
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                accessibilityLabel="Search products"
              />
              {productSearch.length > 0 && (
                <TouchableOpacity
                  onPress={() => setProductSearch('')}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.pickerSearchClear}
                >
                  <Feather name="x" size={12} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Section header */}
            <View style={styles.pickerSectionHeader}>
              <Text style={styles.pickerSectionLabel}>{activeProducts.length} products</Text>
            </View>

            {/* Product list */}
            <View style={styles.pickerGroupCard}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
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
                    <View style={styles.noProductsIconWrap}>
                      <Feather name="plus" size={18} color={C.bronze} />
                    </View>
                    <Text style={styles.noProductsText}>add products to get started</Text>
                    <Text style={styles.noProductsHint}>tap to go to products</Text>
                  </TouchableOpacity>
                ) : (
                  filteredSortedProducts.map((product, index) => {
                    const qty = itemQtyMap[product.id] || 0;
                    const hasQty = qty > 0;
                    return (
                      <TouchableOpacity
                        key={product.id}
                        style={[
                          styles.productRow,
                          index > 0 && styles.productRowBorder,
                          hasQty && styles.productRowActive,
                        ]}
                        activeOpacity={0.6}
                        onPress={() => !hasQty && handleAddProduct(product)}
                        disabled={hasQty}
                        accessibilityRole="button"
                        accessibilityLabel={`${hasQty ? `${qty} ` : 'Add '}${product.name}, ${currency} ${product.pricePerUnit.toFixed(0)} per ${product.unit}`}
                      >
                        <View style={styles.productRowLeft}>
                          {product.imageUrl ? (
                            <Image source={{ uri: product.imageUrl }} style={styles.productThumb} />
                          ) : null}
                          <View style={styles.productTextWrap}>
                            <Text style={[styles.productName, hasQty && styles.productNameActive]} numberOfLines={1}>
                              {product.name}
                            </Text>
                            <Text style={styles.productPrice}>
                              {currency} {product.pricePerUnit.toFixed(0)}/{product.unit}
                            </Text>
                          </View>
                        </View>
                        {hasQty ? (
                          <View style={styles.qtyControls}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              activeOpacity={0.6}
                              onPress={() => handleUpdateQuantity(product.id, qty - 1)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={`Decrease ${product.name}`}
                            >
                              <Feather name="minus" size={13} color={C.textSecondary} />
                            </TouchableOpacity>
                            {editingQtyProductId === product.id ? (
                              <TextInput
                                style={styles.qtyInput}
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
                              style={[styles.qtyBtn, styles.qtyBtnPlus]}
                              activeOpacity={0.6}
                              onPress={() => handleAddProduct(product)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={`Increase ${product.name}`}
                            >
                              <Feather name="plus" size={13} color={C.bronze} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.addBtn}>
                            <Feather name="plus" size={14} color={C.bronze} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>

            {/* Bottom bar */}
            <View style={[styles.pickerBottomBar, items.length > 0 && styles.pickerBottomBarActive]}>
              <Text style={[styles.pickerBottomCount, items.length === 0 && styles.pickerBottomCountEmpty]}>
                {items.length > 0 ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'} selected` : 'no items yet'}
              </Text>
              <Pressable
                onPress={() => { lightTap(); setShowProductPicker(false); }}
                accessibilityRole="button"
                accessibilityLabel={items.length > 0 ? `Done, ${itemCount} items` : 'Close'}
                style={({ pressed }) => [
                  styles.pickerDoneBtn,
                  items.length > 0 && styles.pickerDoneBtnHasItems,
                  pressed && items.length > 0 && styles.pickerDoneBtnPressed,
                ]}
              >
                {({ pressed }) => (
                  <Text style={[
                    styles.pickerDoneBtnText,
                    items.length > 0 && styles.pickerDoneBtnTextHasItems,
                    pressed && items.length > 0 && styles.pickerDoneBtnTextPressed,
                  ]}>
                    {items.length > 0 ? 'done' : 'close'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>}

      {/* ── Contact picker modal ─────────────────────────────── */}
      {showContactPicker && <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowContactPicker(false)}
      >
        <KAView style={styles.contactModalOverlay} behavior="padding">
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setShowContactPicker(false)} />
          <View style={styles.contactPickerSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.contactSheetHandle} />
            <View style={styles.contactSheetHeader}>
              <Text style={styles.contactSheetTitle}>pick contact</Text>
              <TouchableOpacity onPress={() => setShowContactPicker(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.contactSearchBar}>
              <Feather name="search" size={18} color={C.textMuted} />
              <TextInput
                style={styles.contactSearchInput}
                placeholder="search contacts..."
                placeholderTextColor={C.textMuted}
                value={contactSearch}
                onChangeText={setContactSearch}
                autoFocus
              />
              {contactSearch.length > 0 && (
                <TouchableOpacity onPress={() => setContactSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={14} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredContacts}
              keyExtractor={(item, idx) => (item as any).id ?? String(idx)}
              style={styles.contactList}
              contentContainerStyle={{ paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              removeClippedSubviews
              windowSize={5}
              maxToRenderPerBatch={8}
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
                    <Feather name="chevron-right" size={18} color={C.textMuted} />
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
        </KAView>
      </Modal>}

      {/* ── Confirmation modal ───────────────────────────────── */}
      {showConfirmModal && <Modal
        visible
        transparent
        statusBarTranslucent
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
                  color={C.bronze}
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
      </Modal>}
    </View>
  );
};

// ─── STYLES ──────────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.md,
    paddingBottom: 80,
    gap: SPACING.lg,
  },

  // ── Section structure ───────────────────────────────────────
  sectionWrap: {
    gap: SPACING.sm,
  },
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textSecondary,
    letterSpacing: 0.3,
    paddingHorizontal: SPACING.xs,
  },
  sectionLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: SPACING.xs,
  },
  sectionLabelMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Avatar ────────────────────────────────────────────────
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  avatarCircleFilled: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: '#fff',
  },

  // ── Customer card ─────────────────────────────────────────
  customerCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textPrimary,
    paddingVertical: SPACING.sm,
  },
  customerClearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  customerFieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: SPACING.lg,
  },
  customerFieldRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    minHeight: 44,
  },
  customerFieldInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  contactsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  contactsPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.bronze,
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
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  recentPillPressed: {
    backgroundColor: C.bronze,
  },
  recentPillAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentPillAvatarPressed: {
    backgroundColor: withAlpha('#fff', 0.2),
  },
  recentPillAvatarText: {
    fontSize: 10,
    fontWeight: '700' as '700',
    color: C.bronze,
  },
  recentPillAvatarTextPressed: {
    color: '#fff',
  },
  recentName: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.bronze,
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
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  suggestionPillPressed: {
    backgroundColor: C.bronze,
  },
  suggestionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.bronze,
  },
  suggestionTextPressed: {
    color: '#fff',
  },

  // ── Reorder pills ─────────────────────────────────────────
  reorderScroll: {
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  reorderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  reorderPillPressed: {
    backgroundColor: C.bronze,
  },
  reorderPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.bronze,
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
    color: C.textPrimary,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  sectionChipsRow: {
    flexGrow: 0,
    gap: SPACING.xs,
  },
  sectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
    marginRight: SPACING.xs,
  },
  sectionChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  sectionChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textSecondary,
    maxWidth: 140,
  },
  sectionChipTextActive: {
    color: '#fff',
  },
  sectionChipCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.textMuted,
    backgroundColor: withAlpha(C.textMuted, 0.12),
    borderRadius: 8,
    minWidth: 18,
    textAlign: 'center',
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  sectionChipCountActive: {
    color: C.accent,
    backgroundColor: withAlpha('#fff', 0.85),
  },
  whatsAppParseBtn: {
    flexDirection: 'row',
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  whatsAppParseBtnPressed: {
    backgroundColor: C.textPrimary,
  },
  whatsAppParseBtnDisabled: {
    backgroundColor: withAlpha(C.textMuted, 0.04),
  },
  whatsAppParseBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.textPrimary,
  },
  whatsAppParseBtnTextPressed: {
    color: '#fff',
  },
  whatsAppParseBtnTextDisabled: {
    color: C.textMuted,
  },
  unmatchedBox: {
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  unmatchedLabel: {
    ...TYPE.label,
  },
  unmatchedItem: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },

  // ── Product menu ──────────────────────────────────────────
  menuCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  menuActionBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  addItemsPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: C.bronze,
  },
  addItemsPillPressed: {
    opacity: 0.8,
  },
  addItemsPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },
  addItemsPillTextPressed: {},
  waPasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  waPasteBtnActive: {
    backgroundColor: C.textPrimary,
  },
  waPasteBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.bronze,
  },
  waPasteBtnTextActive: {
    color: '#fff',
  },
  itemCountBadge: {
    backgroundColor: C.deepOlive,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['3xl'],
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  noProductsIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  noProductsText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.textPrimary,
  },
  noProductsHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
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
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },

  // Product rows
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    minHeight: 56,
  },
  productRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.border, 0.7),
  },
  productRowActive: {
    backgroundColor: withAlpha(C.bronze, 0.04),
  },
  productRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },
  productThumb: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  productTextWrap: {
    flex: 1,
    gap: 3,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textPrimary,
  },
  productNameActive: {
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.bronze,
  },
  productPrice: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    letterSpacing: 0.2,
  },

  // Quantity controls
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 2,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnPlus: {
    backgroundColor: withAlpha(C.bronze, 0.1),
  },
  qtyText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: C.textPrimary,
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  qtyInput: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: C.textPrimary,
    backgroundColor: C.surface,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    minWidth: 32,
    textAlign: 'center',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  addProductBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.deepOlive,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Empty state ──────────────────────────────────────────
  emptyItemsWrap: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: SPACING['2xl'],
    gap: SPACING.sm,
  },
  emptyItemsHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // ── Selected items in card ────────────────────────────────
  selectedItemsWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  selectedItemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: SPACING.lg,
    minHeight: 56,
    gap: SPACING.sm,
  },
  selectedItemRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  selectedItemLeft: {
    flex: 1,
    gap: 2,
  },
  selectedItemName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.textPrimary,
  },
  selectedItemPrice: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    letterSpacing: 0.2,
  },
  selectedItemTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    minWidth: 48,
    textAlign: 'right',
  },
  subtotalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: withAlpha(C.textMuted, 0.02),
  },
  subtotalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  subtotalAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Contact picker ────────────────────────────────────────
  contactModalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.textPrimary, 0.4),
    justifyContent: 'flex-end',
  },
  contactPickerSheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '75%',
    ...SHADOWS.lg,
  },
  contactSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
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
    color: C.textPrimary,
  },
  contactSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.textMuted, 0.06),
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
    color: C.textPrimary,
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
    backgroundColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: C.bronze,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textPrimary,
  },
  contactPhone: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
    marginTop: 1,
  },
  contactEmpty: {
    padding: SPACING['2xl'],
    alignItems: 'center',
  },
  contactEmptyText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
  },

  // ── Product picker modal ──────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.textPrimary, 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  pickerCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  pickerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pickerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  pickerCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 2,
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.textMuted, 0.06),
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  pickerSearchClear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withAlpha(C.textMuted, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  pickerSectionLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  pickerSectionBadge: {
    backgroundColor: withAlpha(C.textMuted, 0.08),
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pickerSectionCount: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  pickerGroupCard: {
    maxHeight: Dimensions.get('window').height * 0.42,
    marginHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.textMuted, 0.03),
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  pickerBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  pickerBottomBarActive: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.border, 0.5),
  },
  pickerBottomCount: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
  },
  pickerBottomCountEmpty: {
    color: C.textMuted,
  },
  pickerDoneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    backgroundColor: withAlpha(C.textMuted, 0.08),
  },
  pickerDoneBtnHasItems: {
    backgroundColor: C.bronze,
  },
  pickerDoneBtnPressed: {
    backgroundColor: withAlpha(C.bronze, 0.8),
  },
  pickerDoneBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.textMuted,
  },
  pickerDoneBtnTextHasItems: {
    color: '#fff',
  },
  pickerDoneBtnTextPressed: {
    color: withAlpha('#fff', 0.9),
  },

  // ── Order slip ────────────────────────────────────────────
  orderSlip: {
    backgroundColor: C.surface,
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
    backgroundColor: C.border,
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
    color: C.textMuted,
    width: 22,
    textAlign: 'right',
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  slipName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  slipPrice: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  slipTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  slipTotalLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  slipTotalAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Review modal ─────────────────────────────────────────
  reviewOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.textPrimary, 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  reviewSheet: {
    backgroundColor: C.surface,
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
  reviewHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  reviewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  reviewCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSection: {
    marginBottom: SPACING.sm,
  },
  reviewCustomerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.textPrimary,
  },
  reviewCustomerSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 2,
  },
  reviewSlip: {
    backgroundColor: withAlpha(C.textMuted, 0.03),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textSecondary,
  },
  confirmBtn: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  confirmBtnInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    width: '100%' as const,
    paddingHorizontal: SPACING.sm,
  },
  confirmBtnLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },
  confirmBtnChip: {
    paddingHorizontal: SPACING.xs,
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
    color: C.textMuted,
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
    backgroundColor: C.surface,
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
    borderBottomColor: C.border,
  },
  datePickerTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.textPrimary,
  },
  datePickerDone: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: C.bronze,
  },

  // ── Details card (delivery + note) ───────────────────────
  detailsCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    paddingHorizontal: SPACING.lg,
  },
  detailsFieldRow: {
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  detailsFieldHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
  },
  detailsFieldLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  detailsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
  },
  deliveryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
  },
  deliveryLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.textMuted,
    letterSpacing: 0.3,
    marginRight: SPACING.xs,
  },
  deliveryPills: {
    flexDirection: 'row' as const,
    gap: SPACING.xs,
  },
  deliveryClearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginLeft: SPACING.xs,
  },
  dPill: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 30,
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  dPillActive: {
    backgroundColor: C.bronze,
  },
  dPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: C.bronze,
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
    color: C.textPrimary,
  },
  noteInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    paddingVertical: 2,
  },

  // ── Floating review button ───────────────────────────────
  saveButtonWrap: {
    position: 'absolute' as const,
    bottom: SPACING.lg,
    left: SPACING.xl,
    right: SPACING.xl,
  },
  saveButton: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.xl,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.md,
    minHeight: 48,
    ...SHADOWS.lg,
  },
  saveButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  saveButtonLeft: {
    gap: 2,
  },
  saveButtonLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  saveButtonMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: withAlpha('#fff', 0.65),
  },
  saveButtonTotalWrap: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
  },
  saveButtonTotal: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: '#fff',
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    letterSpacing: -0.3,
  },

  // ── Confirmation modal ────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.textPrimary, 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  modalCard: {
    width: '100%',
    backgroundColor: C.surface,
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
    color: C.textPrimary,
  },
  modalOrderNumber: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  modalCustomerName: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    marginTop: 2,
  },
  modalTextBox: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.lg,
  },
  modalPreviewText: {
    fontSize: TYPOGRAPHY.size.base,
    lineHeight: 20,
    color: C.textPrimary,
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
    backgroundColor: withAlpha(C.bronze, 0.08),
    minHeight: 44,
  },
  modalCopyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.bronze,
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
    backgroundColor: C.deepOlive,
    minHeight: 48,
  },
  modalDoneText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },

  // ── QR panel ─────────────────────────────────────────────
  qrPanel: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  qrAmount: {
    fontSize: 28,
    fontWeight: '700' as '700',
    color: C.textPrimary,
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
    backgroundColor: C.accent,
  },
  qrTabText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
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
    color: C.textSecondary,
  },
  modalQrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: withAlpha(C.bronze, 0.08),
    minHeight: 44,
  },
  modalQrText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: C.bronze,
  },
});

export default NewOrder;
