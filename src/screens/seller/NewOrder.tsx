import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, addDays, isValid } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { SellerOrderItem, SellerProduct, SellerOrder } from '../../types';
import { parseWhatsAppOrder } from '../../utils/parseWhatsAppOrder';
import { parseWhatsAppOrderAI } from '../../services/aiService';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

// ─── MAIN COMPONENT ────────────────────────────────────────────
const NewOrder: React.FC = () => {
  const { products, addOrder, orders, sellerCustomers, addSellerCustomer, updateSellerCustomer } =
    useSellerStore();
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Pre-fill from navigation params (e.g. from Customers tab)
  const routeParams = route.params as {
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [copiedFlag, setCopiedFlag] = useState(false);
  const [showWhatsAppPaste, setShowWhatsAppPaste] = useState(false);
  const [whatsAppText, setWhatsAppText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  // When navigating back to this tab with params, pre-fill customer
  useEffect(() => {
    if (routeParams?.customerName) {
      setCustomerName(routeParams.customerName);
      if (routeParams.customerPhone) setCustomerPhone(routeParams.customerPhone);
      if (routeParams.customerAddress) setCustomerAddress(routeParams.customerAddress);
      // Clear params so they don't persist on tab re-visits
      navigation.setParams({ customerName: undefined, customerPhone: undefined, customerAddress: undefined });
    }
  }, [routeParams?.customerName]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products]
  );

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

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

  // ── Customer's last order (for reorder) ─────────────────────
  const lastOrder = useMemo((): SellerOrder | null => {
    if (!customerName.trim()) return null;
    const name = customerName.trim().toLowerCase();
    const matching = orders.filter(
      (o) => o.customerName?.toLowerCase().trim() === name
    );
    if (matching.length === 0) return null;
    // orders are sorted newest-first in store
    return matching[0];
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
      setCustomerName(customer.name);
      if (customer.phone) setCustomerPhone(customer.phone);
      if (customer.address) setCustomerAddress(customer.address);
    },
    []
  );

  const handleReorder = useCallback(() => {
    if (!lastOrder) return;
    setItems(
      lastOrder.items.map((item) => ({ ...item }))
    );
  }, [lastOrder]);

  // Delivery
  const handleDeliveryToday = useCallback(() => {
    setDeliveryMode('today');
    setDeliveryDate(new Date());
    setShowDatePicker(false);
  }, []);
  const handleDeliveryTomorrow = useCallback(() => {
    setDeliveryMode('tomorrow');
    setDeliveryDate(addDays(new Date(), 1));
    setShowDatePicker(false);
  }, []);
  const handleDeliveryPick = useCallback(() => {
    setDeliveryMode('pick');
    setShowDatePicker(true);
  }, []);
  const handleDatePickerChange = useCallback((_event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); // iOS keeps showing, Android auto-hides
    if (selectedDate) {
      setDeliveryDate(selectedDate);
    }
  }, []);

  // WhatsApp parsing
  const handleParseWhatsApp = useCallback(async () => {
    if (!whatsAppText.trim()) return;
    setIsParsing(true);

    const local = parseWhatsAppOrder(whatsAppText, products);
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
          productId: product?.id || '',
          productName: ai.productName,
          quantity: ai.quantity,
          unitPrice: product?.pricePerUnit || 0,
          unit: ai.unit || product?.unit || 'piece',
        };
      });
      setItems(mapped);
      setUnmatched([]);
    } else {
      setUnmatched([whatsAppText.trim()]);
    }

    setIsParsing(false);
    setShowWhatsAppPaste(false);
  }, [whatsAppText, products]);

  // Product add/remove
  const handleAddProduct = useCallback((product: SellerProduct) => {
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
      if (phone && phone !== existing.phone) updates.phone = phone;
      if (address && address !== existing.address) updates.address = address;
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
      totalAmount: total,
      status: 'pending',
      isPaid: false,
      note: note.trim() || undefined,
      rawWhatsApp: whatsAppText.trim() || undefined,
      date: new Date(),
      deliveryDate,
      seasonId: activeSeason?.id,
    });

    setCopiedFlag(false);
    setShowConfirmModal(true);
  }, [items, customerName, customerPhone, total, note, whatsAppText, deliveryDate, activeSeason, addOrder, persistCustomer]);

  const handleCopyToClipboard = useCallback(async () => {
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
  }, []);

  const handleDone = useCallback(() => {
    setShowConfirmModal(false);
    resetForm();
    navigation.navigate('SellerOrders');
  }, [navigation, resetForm]);

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
        {/* ── Recent customers (always visible) ─────────────── */}
        {recentCustomers.length > 0 && !customerName.trim() && (
          <View style={styles.recentSection}>
            <Text style={styles.recentLabel}>RECENT</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentScroll}
              keyboardShouldPersistTaps="handled"
            >
              {recentCustomers.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.recentPill}
                  activeOpacity={0.7}
                  onPress={() => handleSelectCustomer(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${c.name}`}
                >
                  <View style={styles.recentAvatar}>
                    <Text style={styles.recentAvatarText}>
                      {c.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.recentName} numberOfLines={1}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Customer card ──────────────────────────────────── */}
        <View style={styles.customerCard}>
          <View style={styles.customerNameRow}>
            <Feather name="user" size={16} color={CALM.textMuted} style={styles.customerIcon} />
            <TextInput
              style={styles.customerNameInput}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="customer name"
              placeholderTextColor={CALM.textMuted}
              accessibilityLabel="Customer name"
            />
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
          <View style={styles.customerDetailRow}>
            <View style={styles.customerDetailHalf}>
              <Feather name="phone" size={12} color={CALM.textMuted} />
              <TextInput
                style={styles.customerDetailInput}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="phone"
                placeholderTextColor={CALM.textMuted}
                keyboardType="phone-pad"
                accessibilityLabel="Phone"
              />
            </View>
            <View style={styles.customerDetailDivider} />
            <View style={styles.customerDetailHalf}>
              <Feather name="map-pin" size={12} color={CALM.textMuted} />
              <TextInput
                style={styles.customerDetailInput}
                value={customerAddress}
                onChangeText={setCustomerAddress}
                placeholder="address"
                placeholderTextColor={CALM.textMuted}
                accessibilityLabel="Address"
              />
            </View>
          </View>
        </View>

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
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                style={styles.suggestionPill}
                onPress={() => handleSelectCustomer(c)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${c.name}`}
              >
                <Text style={styles.suggestionText} numberOfLines={1}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── Reorder card (known customer) ─────────────────── */}
        {lastOrder && items.length === 0 && (
          <TouchableOpacity
            style={styles.reorderCard}
            activeOpacity={0.7}
            onPress={handleReorder}
            accessibilityRole="button"
            accessibilityLabel="Reorder same items as last time"
          >
            <View style={styles.reorderHeader}>
              <Feather name="rotate-ccw" size={14} color={CALM.bronze} />
              <Text style={styles.reorderTitle}>previous order</Text>
            </View>
            <Text style={styles.reorderItems} numberOfLines={2}>
              {lastOrder.items.map((i) => `${i.productName} x${i.quantity}`).join(', ')}
            </Text>
            <View style={styles.reorderAction}>
              <Text style={styles.reorderActionText}>reorder</Text>
              <Feather name="plus" size={14} color={CALM.bronze} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── WhatsApp paste (expandable) ────────────────────── */}
        {!showWhatsAppPaste ? (
          <TouchableOpacity
            style={styles.whatsAppToggle}
            activeOpacity={0.7}
            onPress={() => setShowWhatsAppPaste(true)}
            accessibilityRole="button"
            accessibilityLabel="Import order from WhatsApp"
          >
            <Feather name="message-circle" size={14} color={CALM.textMuted} />
            <Text style={styles.whatsAppToggleText}>import from WhatsApp</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.whatsAppCard}>
            <View style={styles.whatsAppHeader}>
              <Feather name="message-circle" size={14} color={CALM.textSecondary} />
              <Text style={styles.whatsAppHeaderText}>paste message from WhatsApp</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowWhatsAppPaste(false);
                  setWhatsAppText('');
                  setUnmatched([]);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close WhatsApp input"
              >
                <Feather name="x" size={16} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.whatsAppInput}
              value={whatsAppText}
              onChangeText={setWhatsAppText}
              placeholder="e.g. nak order semperit kuning 2 tin"
              placeholderTextColor={CALM.textMuted}
              multiline
              numberOfLines={3}
              accessibilityLabel="WhatsApp message"
            />
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.whatsAppParseBtn, !whatsAppText.trim() && styles.whatsAppParseBtnDisabled]}
              onPress={handleParseWhatsApp}
              disabled={!whatsAppText.trim() || isParsing}
              accessibilityRole="button"
              accessibilityLabel="Extract items from message"
            >
              {isParsing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather
                    name="zap"
                    size={14}
                    color={!whatsAppText.trim() ? CALM.textMuted : '#fff'}
                  />
                  <Text style={[styles.whatsAppParseBtnText, !whatsAppText.trim() && { color: CALM.textMuted }]}>
                    extract items
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {unmatched.length > 0 && (
              <View style={styles.unmatchedBox}>
                <Text style={styles.unmatchedLabel}>unrecognised:</Text>
                {unmatched.map((u, i) => (
                  <Text key={i} style={styles.unmatchedItem}>{u}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Product menu ───────────────────────────────────── */}
        <View style={styles.menuCard}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuHeaderText}>ITEMS</Text>
            {items.length > 0 && (
              <Text style={styles.menuItemCount}>
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </Text>
            )}
          </View>

          {activeProducts.length === 0 ? (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.noProductsLink}
              onPress={() => navigation.getParent()?.navigate('SellerProducts')}
              accessibilityRole="link"
              accessibilityLabel="Add products to get started"
            >
              <Feather name="plus-circle" size={16} color={CALM.bronze} />
              <Text style={styles.noProductsText}>add products to get started</Text>
            </TouchableOpacity>
          ) : (
            sortedProducts.map((product, index) => {
              const qty = itemQtyMap[product.id] || 0;
              const hasQty = qty > 0;
              const lineTotal = qty * product.pricePerUnit;
              return (
                <View
                  key={product.id}
                  style={[
                    styles.productRow,
                    hasQty && styles.productRowActive,
                    index === sortedProducts.length - 1 && styles.productRowLast,
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
                      <Text
                        style={[styles.productName, hasQty && styles.productNameActive]}
                        numberOfLines={1}
                      >
                        {product.name}
                      </Text>
                      <Text style={[styles.productPrice, hasQty && styles.productPriceActive]}>
                        {currency} {product.pricePerUnit.toFixed(0)}/{product.unit}
                        {hasQty ? ` \u00B7 ${currency} ${lineTotal.toFixed(0)}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Quantity controls */}
                  {hasQty ? (
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        activeOpacity={0.7}
                        onPress={() => handleUpdateQuantity(product.id, qty - 1)}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Decrease ${product.name}`}
                      >
                        <Feather name="minus" size={14} color={CALM.bronze} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{qty}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        activeOpacity={0.7}
                        onPress={() => handleAddProduct(product)}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
                      <Feather name="plus" size={16} color={CALM.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}

          {/* Inline total */}
          {items.length > 0 && (
            <View style={styles.menuTotalRow}>
              <Text style={styles.menuTotalLabel}>total</Text>
              <Text style={styles.menuTotalAmount}>
                {currency} {total.toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        {/* ── Delivery + Note compact card ────────────────────── */}
        <View style={styles.detailsCard}>
          {/* Delivery */}
          <View style={styles.deliverySection}>
            <Feather name="truck" size={14} color={CALM.textMuted} style={styles.detailIcon} />
            <View style={styles.deliveryPills}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.dPill, deliveryMode === 'today' && styles.dPillActive]}
                onPress={handleDeliveryToday}
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
                accessibilityRole="button"
                accessibilityLabel="Pick a date"
              >
                <Feather
                  name="calendar"
                  size={12}
                  color={deliveryMode === 'pick' ? '#fff' : CALM.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Native date picker (when pick is selected) */}
          {showDatePicker && (
            <DateTimePicker
              value={deliveryDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={handleDatePickerChange}
              accentColor={CALM.bronze}
            />
          )}

          {/* Selected date badge */}
          {deliveryDate && isValid(deliveryDate) && (
            <View style={styles.deliveryBadge}>
              <Feather name="truck" size={11} color={CALM.bronze} />
              <Text style={styles.deliveryBadgeText}>
                {format(deliveryDate, 'EEEE, dd MMM')}
              </Text>
            </View>
          )}

          {/* Divider */}
          <View style={styles.detailsDivider} />

          {/* Note */}
          <View style={styles.noteSection}>
            <Feather name="file-text" size={14} color={CALM.textMuted} style={styles.detailIcon} />
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="add a note..."
              placeholderTextColor={CALM.textMuted}
              accessibilityLabel="Order note"
            />
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* ── Sticky bottom bar ────────────────────────────────── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.saveButton, isDisabled && styles.saveButtonDisabled]}
          onPress={handleSubmit}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            isDisabled
              ? 'Add items to save order'
              : `Save order, ${itemCount} items, total ${currency} ${total.toFixed(2)}`
          }
        >
          {isDisabled ? (
            <Text style={styles.saveButtonTextDisabled}>select items to continue</Text>
          ) : (
            <>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.saveButtonText}>save</Text>
              <View style={styles.saveDot} />
              <Text style={styles.saveButtonText}>
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </Text>
              <View style={styles.saveDot} />
              <Text style={styles.saveButtonTextBold}>
                {currency} {total.toFixed(2)}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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
              <Feather name="check-circle" size={24} color={CALM.bronze} />
              <Text style={styles.modalTitle}>order saved</Text>
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
                  color={CALM.bronze}
                />
                <Text style={styles.modalCopyText}>
                  {copiedFlag ? 'copied' : 'copy message'}
                </Text>
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
    gap: SPACING.md,
  },

  // ── Recent customers ──────────────────────────────────────
  recentSection: {
    gap: SPACING.sm,
  },
  recentLabel: {
    ...TYPE.label,
  },
  recentScroll: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  recentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingRight: SPACING.lg,
    minHeight: 44,
  },
  recentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentAvatarText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: CALM.bronze,
  },
  recentName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
    maxWidth: 100,
  },

  // ── Customer card ─────────────────────────────────────────
  customerCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    overflow: 'hidden',
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    minHeight: 48,
  },
  customerIcon: {
    marginRight: SPACING.sm,
  },
  customerNameInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textPrimary,
    paddingVertical: SPACING.sm,
  },
  customerDetailRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  customerDetailHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
    minHeight: 40,
  },
  customerDetailDivider: {
    width: 1,
    backgroundColor: CALM.border,
    marginVertical: SPACING.sm,
  },
  customerDetailInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textPrimary,
    paddingVertical: SPACING.xs,
  },

  // ── Autocomplete suggestions ──────────────────────────────
  suggestionsRow: {
    maxHeight: 40,
    marginTop: -SPACING.sm,
  },
  suggestionsContent: {
    gap: SPACING.sm,
  },
  suggestionPill: {
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
  },
  suggestionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
  },

  // ── Reorder card ──────────────────────────────────────────
  reorderCard: {
    backgroundColor: CALM.highlight,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  reorderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  reorderTitle: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reorderItems: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    lineHeight: 20,
  },
  reorderAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-end',
  },
  reorderActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
  },

  // ── WhatsApp paste ────────────────────────────────────────
  whatsAppToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    minHeight: 44,
    backgroundColor: withAlpha(CALM.textMuted, 0.04),
    borderRadius: RADIUS.lg,
  },
  whatsAppToggleText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  whatsAppCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  whatsAppHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  whatsAppHeaderText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textSecondary,
    flex: 1,
  },
  whatsAppInput: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  whatsAppParseBtn: {
    flexDirection: 'row',
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 44,
  },
  whatsAppParseBtnDisabled: {
    backgroundColor: CALM.border,
  },
  whatsAppParseBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },
  unmatchedBox: {
    borderLeftWidth: 3,
    borderLeftColor: CALM.bronze,
    paddingLeft: SPACING.md,
    gap: SPACING.xs,
  },
  unmatchedLabel: {
    ...TYPE.label,
  },
  unmatchedItem: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },

  // ── Product menu ──────────────────────────────────────────
  menuCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  menuHeaderText: {
    ...TYPE.label,
  },
  menuItemCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
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
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
  },

  // Product rows
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    minHeight: 52,
  },
  productRowActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.04),
    borderLeftWidth: 3,
    borderLeftColor: CALM.bronze,
  },
  productRowLast: {
    // no special styling needed
  },
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
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
  },
  productPrice: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  productPriceActive: {
    color: CALM.bronze,
  },

  // Quantity controls
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    // hitSlop extends touch area to meet 44pt minimum
  },
  qtyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.bronze,
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Menu total
  menuTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    backgroundColor: withAlpha(CALM.bronze, 0.04),
  },
  menuTotalLabel: {
    ...TYPE.label,
    color: CALM.bronze,
  },
  menuTotalAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: CALM.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // ── Details card (delivery + note) ────────────────────────
  detailsCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
  },
  deliverySection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    marginRight: SPACING.sm,
  },
  deliveryPills: {
    flexDirection: 'row',
    gap: SPACING.xs,
    flex: 1,
  },
  dPill: {
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: 32,
  },
  dPillActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  dPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.textSecondary,
  },
  dPillTextActive: {
    color: '#fff',
  },
  deliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    marginLeft: SPACING.lg + SPACING.sm + 14,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
  },
  deliveryBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: CALM.border,
    marginVertical: SPACING.md,
  },
  noteSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    paddingVertical: SPACING.xs,
  },

  // ── Bottom bar ────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.md,
    backgroundColor: CALM.surface,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 48,
  },
  saveButtonDisabled: {
    backgroundColor: CALM.border,
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: '#fff',
  },
  saveButtonTextBold: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: '#fff',
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  saveButtonTextDisabled: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  saveDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: withAlpha('#FFFFFF', 0.5),
  },

  // ── Confirmation modal ────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
    gap: SPACING.sm,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: CALM.textPrimary,
  },
  modalTextBox: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
  },
  modalPreviewText: {
    fontSize: TYPOGRAPHY.size.sm,
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
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
  },
  modalCopyText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
  },
  modalDoneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: CALM.bronze,
    minHeight: 48,
  },
  modalDoneText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
    color: '#fff',
  },
});

export default NewOrder;
