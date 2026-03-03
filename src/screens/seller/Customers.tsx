import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  TextInput, Animated, Linking, Platform, Alert, Modal, KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { isToday, isYesterday, format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, selectionChanged } from '../../services/haptics';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { SellerOrder, SellerCustomer } from '../../types';

// ─── Smart date label ─────────────────────────────────────────
function smartDateLabel(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isToday(d)) return 'today';
  if (isYesterday(d)) return 'yesterday';
  return format(d, 'dd MMM');
}

// ─── Derived customer type ───────────────────────────────────
interface DerivedCustomer {
  name: string;
  totalOrders: number;
  totalSpent: number;
  unpaidAmount: number;
  lastOrderDate: Date;
  phone?: string;
  address?: string;
  note?: string;
  storedId?: string;
  orders: SellerOrder[];
}

type FilterTab = 'all' | 'owes' | 'repeat';
type SortOption = 'recent' | 'name' | 'orders' | 'spent' | 'debt';

const SORT_OPTIONS: { label: string; value: SortOption; icon: keyof typeof Feather.glyphMap }[] = [
  { label: 'most recent', value: 'recent', icon: 'clock' },
  { label: 'name A–Z', value: 'name', icon: 'type' },
  { label: 'most orders', value: 'orders', icon: 'shopping-bag' },
  { label: 'most spent', value: 'spent', icon: 'dollar-sign' },
  { label: 'highest debt', value: 'debt', icon: 'alert-circle' },
];

// ─── Stats Summary ────────────────────────────────────────────
const StatsSummary: React.FC<{
  customers: DerivedCustomer[];
  currency: string;
  onTapAll: () => void;
  onTapOwes: () => void;
  onTapRepeat: () => void;
}> = React.memo(({ customers, currency, onTapAll, onTapOwes, onTapRepeat }) => {
  const stats = useMemo(() => {
    let outstanding = 0;
    let repeatCount = 0;
    for (const c of customers) {
      if (c.unpaidAmount > 0) outstanding += c.unpaidAmount;
      if (c.totalOrders > 1) repeatCount++;
    }
    return { total: customers.length, outstanding, repeatCount };
  }, [customers]);

  return (
    <View style={styles.statsRow}>
      <TouchableOpacity
        style={styles.statChip}
        activeOpacity={0.7}
        onPress={() => { lightTap(); onTapAll(); }}
        accessibilityRole="button"
        accessibilityLabel={`${stats.total} total customers`}
      >
        <View style={styles.statIconRow}>
          <Feather name="users" size={14} color={CALM.bronze} />
          <Text style={styles.statValue}>{stats.total}</Text>
        </View>
        <Text style={styles.statLabel}>customers</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.statChip}
        activeOpacity={0.7}
        onPress={() => { lightTap(); onTapOwes(); }}
        accessibilityRole="button"
        accessibilityLabel={`${currency} ${stats.outstanding.toFixed(2)} outstanding`}
      >
        <View style={styles.statIconRow}>
          <Feather name="alert-circle" size={14} color={CALM.bronze} />
          <Text style={styles.statValue} numberOfLines={1}>{currency} {stats.outstanding.toFixed(0)}</Text>
        </View>
        <Text style={styles.statLabel}>outstanding</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.statChip}
        activeOpacity={0.7}
        onPress={() => { lightTap(); onTapRepeat(); }}
        accessibilityRole="button"
        accessibilityLabel={`${stats.repeatCount} returning customers`}
      >
        <View style={styles.statIconRow}>
          <Feather name="repeat" size={14} color={CALM.bronze} />
          <Text style={styles.statValue}>{stats.repeatCount}</Text>
        </View>
        <Text style={styles.statLabel}>returning</Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── Customer card (simplified — just tappable row) ───────────
interface CustomerCardProps {
  customer: DerivedCustomer;
  currency: string;
  onPress: () => void;
  index: number;
}

const CustomerCard: React.FC<CustomerCardProps> = React.memo(({
  customer,
  currency,
  onPress,
  index,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      delay: Math.min(index * 40, 200),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, index]);

  const lastOrderLabel = smartDateLabel(customer.lastOrderDate);

  return (
    <Animated.View style={[styles.card, customer.unpaidAmount > 0 && styles.cardUnpaid, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={styles.cardBody}
        onPress={() => { lightTap(); onPress(); }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${customer.name}, ${customer.totalOrders} orders`}
      >
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {customer.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={styles.customerName} numberOfLines={1}>
            {customer.name}
          </Text>
          <Text style={styles.customerStats}>
            {customer.totalOrders} order{customer.totalOrders !== 1 ? 's' : ''} · {currency} {customer.totalSpent.toFixed(0)} · last {lastOrderLabel}
          </Text>
          {customer.unpaidAmount > 0 && (
            <View style={styles.unpaidBadge}>
              <Text style={styles.unpaidBadgeText}>
                {currency} {customer.unpaidAmount.toFixed(0)} unpaid
              </Text>
            </View>
          )}
        </View>

        {/* Arrow */}
        <Feather name="chevron-right" size={18} color={CALM.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Customer Detail Modal ────────────────────────────────────
interface DetailModalProps {
  visible: boolean;
  customer: DerivedCustomer | null;
  currency: string;
  onClose: () => void;
  onCallPhone: (phone: string) => void;
  onWhatsApp: (phone: string) => void;
  onOpenMaps: (address: string) => void;
  onEditDetails: () => void;
  onCopyInfo: () => void;
  onViewOrders: () => void;
  onDeleteCustomer: () => void;
  onNewOrder: () => void;
}

const CustomerDetailModal: React.FC<DetailModalProps> = ({
  visible,
  customer,
  currency,
  onClose,
  onCallPhone,
  onWhatsApp,
  onOpenMaps,
  onEditDetails,
  onCopyInfo,
  onViewOrders,
  onDeleteCustomer,
  onNewOrder,
}) => {
  if (!customer) return null;

  const recentOrders = useMemo(() => {
    return [...customer.orders]
      .sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 3);
  }, [customer.orders]);

  const avgOrder = customer.totalOrders > 0
    ? customer.totalSpent / customer.totalOrders
    : 0;

  const lastOrderLabel = smartDateLabel(customer.lastOrderDate);

  const getItemsSummary = (order: SellerOrder) => {
    if (order.items.length === 0) return 'no items';
    if (order.items.length === 1) {
      const item = order.items[0];
      return `${item.quantity} ${item.unit} ${item.productName}`;
    }
    const first = order.items[0];
    return `${first.quantity} ${first.unit} ${first.productName} +${order.items.length - 1} more`;
  };

  const getStatusLabel = (order: SellerOrder) => {
    if (order.isPaid && order.status !== 'completed') return `${order.status} \u00B7 paid`;
    if (order.isPaid) return 'completed';
    return order.status;
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.detailOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.detailSheet} onStartShouldSetResponder={() => true}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHandle} />

            {/* Header — avatar + name + close */}
            <View style={styles.detailHeader}>
              <View style={styles.detailHeaderLeft}>
                <View style={styles.detailAvatar}>
                  <Text style={styles.detailAvatarText}>
                    {customer.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.detailName}>{customer.name}</Text>
                  <Text style={styles.detailSub}>
                    {customer.totalOrders} order{customer.totalOrders !== 1 ? 's' : ''} · last {lastOrderLabel}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="x" size={22} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Insights row */}
            <View style={styles.insightsRow}>
              <View style={styles.insightChip}>
                <Text style={styles.insightLabel}>avg order</Text>
                <Text style={styles.insightValue}>{currency} {avgOrder.toFixed(2)}</Text>
              </View>
              <View style={styles.insightChip}>
                <Text style={styles.insightLabel}>lifetime</Text>
                <Text style={styles.insightValue}>{currency} {customer.totalSpent.toFixed(2)}</Text>
              </View>
              {customer.unpaidAmount > 0 && (
                <View style={[styles.insightChip, styles.insightChipDebt]}>
                  <Text style={styles.insightLabel}>owes</Text>
                  <Text style={[styles.insightValue, styles.insightValueDebt]}>
                    {currency} {customer.unpaidAmount.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>

            {/* Contact section */}
            {customer.phone ? (
              <View style={styles.contactRow}>
                <TouchableOpacity
                  style={styles.contactButton}
                  onPress={() => { lightTap(); onCallPhone(customer.phone!); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${customer.phone}`}
                >
                  <Feather name="phone" size={15} color={CALM.bronze} />
                  <Text style={styles.contactButtonText} numberOfLines={1}>
                    {customer.phone}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.contactButtonSmall}
                  onPress={() => { lightTap(); onWhatsApp(customer.phone!); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="WhatsApp customer"
                >
                  <Feather name="message-circle" size={15} color={CALM.bronze} />
                </TouchableOpacity>
              </View>
            ) : null}
            {customer.address ? (
              <TouchableOpacity
                style={styles.addressButton}
                onPress={() => { lightTap(); onOpenMaps(customer.address!); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Navigate to ${customer.address}`}
              >
                <Feather name="map-pin" size={15} color={CALM.bronze} />
                <Text style={styles.addressButtonText} numberOfLines={2}>
                  {customer.address}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Note */}
            {customer.note ? (
              <View style={styles.noteRow}>
                <Feather name="file-text" size={14} color={CALM.textMuted} />
                <Text style={styles.noteText}>{customer.note}</Text>
              </View>
            ) : null}

            {/* Order history */}
            <View style={styles.orderHistorySection}>
              <View style={styles.orderHistoryHeader}>
                <Text style={styles.orderHistoryTitle}>recent orders</Text>
                {customer.totalOrders > 3 && (
                  <TouchableOpacity
                    onPress={() => { lightTap(); onViewOrders(); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="View all orders"
                  >
                    <Text style={styles.viewAllText}>view all {customer.totalOrders}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {recentOrders.map((order) => {
                const status = getStatusLabel(order);
                const orderDate = order.date instanceof Date ? order.date : new Date(order.date);
                return (
                  <View key={order.id} style={styles.orderHistoryItem}>
                    <View style={styles.orderHistoryLeft}>
                      <Text style={styles.orderHistoryDate}>
                        {order.orderNumber ? `${order.orderNumber}  ` : ''}{smartDateLabel(orderDate)}
                      </Text>
                      <Text style={styles.orderHistorySummary} numberOfLines={1}>
                        {getItemsSummary(order)}
                      </Text>
                    </View>
                    <View style={styles.orderHistoryRight}>
                      <Text style={styles.orderHistoryAmount}>
                        {currency} {order.totalAmount.toFixed(2)}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          order.isPaid && styles.statusPillPaid,
                          status === 'pending' && styles.statusPillPending,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            order.isPaid && styles.statusPillTextPaid,
                            status === 'pending' && styles.statusPillTextPending,
                          ]}
                        >
                          {status}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Action grid — 2 columns */}
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={styles.gridAction}
                activeOpacity={0.7}
                onPress={() => { lightTap(); onNewOrder(); }}
                accessibilityRole="button"
                accessibilityLabel="New order"
              >
                <Feather name="plus-circle" size={16} color="#fff" />
                <Text style={styles.gridActionTextPrimary}>new order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gridActionSecondary}
                activeOpacity={0.7}
                onPress={() => { lightTap(); onViewOrders(); }}
                accessibilityRole="button"
                accessibilityLabel="View orders"
              >
                <Feather name="list" size={16} color={CALM.bronze} />
                <Text style={styles.gridActionText}>orders</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gridActionSecondary}
                activeOpacity={0.7}
                onPress={() => { lightTap(); onCopyInfo(); }}
                accessibilityRole="button"
                accessibilityLabel="Copy info"
              >
                <Feather name="copy" size={16} color={CALM.bronze} />
                <Text style={styles.gridActionText}>copy info</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gridActionSecondary}
                activeOpacity={0.7}
                onPress={() => { lightTap(); onEditDetails(); }}
                accessibilityRole="button"
                accessibilityLabel="Edit details"
              >
                <Feather name="edit-2" size={16} color={CALM.bronze} />
                <Text style={styles.gridActionText}>edit</Text>
              </TouchableOpacity>
            </View>

            {/* Delete — minimal */}
            <TouchableOpacity
              style={styles.deleteButton}
              activeOpacity={0.7}
              onPress={onDeleteCustomer}
              accessibilityRole="button"
              accessibilityLabel="Delete customer and all orders"
            >
              <Text style={styles.deleteButtonText}>delete customer</Text>
            </TouchableOpacity>

            <View style={{ height: SPACING['2xl'] }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Component ──────────────────────────────────────────
const SellerCustomers: React.FC = () => {
  const { orders, sellerCustomers, addSellerCustomer, updateSellerCustomer, deleteSellerCustomer, deleteOrder, updateOrder } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();
  const navigation = useNavigation<any>();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<DerivedCustomer | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<DerivedCustomer | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editName, setEditName] = useState('');

  // ─── Derive customers from orders ──────────────────────────
  const derivedCustomers = useMemo(() => {
    const map: Record<string, DerivedCustomer> = {};

    for (const order of orders) {
      const name = order.customerName?.trim();
      if (!name) continue;

      const key = name.toLowerCase();

      if (!map[key]) {
        map[key] = {
          name,
          totalOrders: 0,
          totalSpent: 0,
          unpaidAmount: 0,
          lastOrderDate: new Date(order.date),
          phone: order.customerPhone || undefined,
          orders: [],
        };
      }

      const entry = map[key];
      entry.totalOrders += 1;
      entry.totalSpent += order.totalAmount;
      if (!order.isPaid) {
        entry.unpaidAmount += order.totalAmount;
      }

      const orderDate = order.date instanceof Date ? order.date : new Date(order.date);
      if (orderDate > entry.lastOrderDate) {
        entry.lastOrderDate = orderDate;
      }

      if (!entry.phone && order.customerPhone) {
        entry.phone = order.customerPhone;
      }

      entry.orders.push(order);
    }

    // Merge with stored customer records
    for (const key of Object.keys(map)) {
      const entry = map[key];
      const stored = sellerCustomers.find(
        (sc) => sc.name.toLowerCase() === key
      );
      if (stored) {
        entry.storedId = stored.id;
        if (stored.phone) entry.phone = stored.phone;
        if (stored.address) entry.address = stored.address;
        if (stored.note) entry.note = stored.note;
      }
    }

    // Add stored customers that have no orders yet
    for (const stored of sellerCustomers) {
      const key = stored.name.toLowerCase();
      if (!map[key]) {
        map[key] = {
          name: stored.name,
          totalOrders: 0,
          totalSpent: 0,
          unpaidAmount: 0,
          lastOrderDate: stored.createdAt instanceof Date ? stored.createdAt : new Date(stored.createdAt),
          phone: stored.phone,
          address: stored.address,
          note: stored.note,
          storedId: stored.id,
          orders: [],
        };
      }
    }

    return Object.values(map);
  }, [orders, sellerCustomers]);

  // Keep selectedCustomer in sync with derived data
  useEffect(() => {
    if (selectedCustomer) {
      const updated = derivedCustomers.find(
        (c) => c.name.toLowerCase() === selectedCustomer.name.toLowerCase()
      );
      if (updated) {
        setSelectedCustomer(updated);
      } else {
        setSelectedCustomer(null);
      }
    }
  }, [derivedCustomers]);

  // ─── Filter counts ──────────────────────────────────────────
  const filterCounts = useMemo(() => ({
    all: derivedCustomers.length,
    owes: derivedCustomers.filter((c) => c.unpaidAmount > 0).length,
    repeat: derivedCustomers.filter((c) => c.totalOrders > 1).length,
  }), [derivedCustomers]);

  // ─── Sort + Filter + Search ─────────────────────────────────
  const filteredCustomers = useMemo(() => {
    let list = [...derivedCustomers];

    // Sort
    switch (sortBy) {
      case 'recent':
        list.sort((a, b) => b.lastOrderDate.getTime() - a.lastOrderDate.getTime());
        break;
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'orders':
        list.sort((a, b) => b.totalOrders - a.totalOrders);
        break;
      case 'spent':
        list.sort((a, b) => b.totalSpent - a.totalSpent);
        break;
      case 'debt':
        list.sort((a, b) => b.unpaidAmount - a.unpaidAmount);
        break;
    }

    // Filter tab
    if (filter === 'owes') {
      list = list.filter((c) => c.unpaidAmount > 0);
    } else if (filter === 'repeat') {
      list = list.filter((c) => c.totalOrders > 1);
    }

    // Enhanced search: name, phone, address
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [derivedCustomers, filter, search, sortBy]);

  const hasActiveFilters = filter !== 'all' || search.trim().length > 0;

  // ─── Handlers ──────────────────────────────────────────────
  const handleCallPhone = useCallback((phone: string) => {
    Linking.openURL('tel:' + phone);
  }, []);

  const handleWhatsApp = useCallback((phone: string) => {
    let digits = phone.replace(/[^0-9]/g, '');
    // Malaysian numbers: convert leading 0 to country code 60
    if (digits.startsWith('0')) digits = '60' + digits.slice(1);
    Linking.openURL('https://wa.me/' + digits);
  }, []);

  const handleOpenMaps = useCallback((address: string) => {
    const encoded = encodeURIComponent(address);

    if (Platform.OS === 'android') {
      // Android geo: URI triggers system app picker (Google Maps, Waze, etc.)
      Linking.openURL('geo:0,0?q=' + encoded);
    } else {
      // iOS — show manual picker since there's no native chooser
      Alert.alert('', 'open address in', [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'Apple Maps',
          onPress: () => Linking.openURL('maps:?q=' + encoded),
        },
        {
          text: 'Google Maps',
          onPress: () => {
            Linking.canOpenURL('comgooglemaps://').then((supported) => {
              if (supported) {
                Linking.openURL('comgooglemaps://?q=' + encoded);
              } else {
                Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encoded);
              }
            });
          },
        },
        {
          text: 'Waze',
          onPress: () => {
            Linking.canOpenURL('waze://').then((supported) => {
              if (supported) {
                Linking.openURL('waze://?q=' + encoded + '&navigate=yes');
              } else {
                Linking.openURL('https://waze.com/ul?q=' + encoded);
              }
            });
          },
        },
      ]);
    }
  }, []);

  const handleViewOrders = useCallback((customerName: string) => {
    setSelectedCustomer(null);
    navigation.navigate('SellerOrders', { searchQuery: customerName, initialFilter: 'all' });
  }, [navigation]);

  const handleCopyInfo = useCallback((customer: DerivedCustomer) => {
    const lines = [customer.name];
    if (customer.phone) lines.push(`Phone: ${customer.phone}`);
    if (customer.address) lines.push(`Address: ${customer.address}`);
    lines.push(`Orders: ${customer.totalOrders} · Total: ${currency} ${customer.totalSpent.toFixed(2)}`);
    if (customer.unpaidAmount > 0) {
      lines.push(`Outstanding: ${currency} ${customer.unpaidAmount.toFixed(2)}`);
    }
    if (customer.note) lines.push(`Note: ${customer.note}`);

    Clipboard.setStringAsync(lines.join('\n')).then(() => {
      lightTap();
      showToast('customer info copied.', 'info');
    });
  }, [currency, showToast]);

  const handleDeleteCustomer = useCallback((customer: DerivedCustomer) => {
    const hasStoredRecord = !!customer.storedId;
    const orderCount = customer.orders.length;

    Alert.alert(
      '',
      `delete ${customer.name} and all ${orderCount} ${orderCount === 1 ? 'order' : 'orders'}?`,
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'delete',
          style: 'destructive',
          onPress: () => {
            mediumTap();
            // Delete stored customer record if exists
            if (hasStoredRecord) {
              deleteSellerCustomer(customer.storedId!);
            }
            // Delete all orders for this customer
            for (const order of customer.orders) {
              deleteOrder(order.id);
            }
            setSelectedCustomer(null);
            showToast('customer and orders deleted.', 'info');
          },
        },
      ]
    );
  }, [deleteSellerCustomer, deleteOrder, showToast]);

  const handleNewOrder = useCallback((customer: DerivedCustomer) => {
    setSelectedCustomer(null);
    navigation.navigate('SellerNewOrder', {
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
    });
  }, [navigation]);

  const openEditModal = useCallback((customer: DerivedCustomer) => {
    setSelectedCustomer(null);
    setEditingCustomer(customer);
    setEditName(customer.name);
    setEditPhone(customer.phone || '');
    setEditAddress(customer.address || '');
    setEditNote(customer.note || '');
    setEditModalVisible(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!editingCustomer) return;

    const customerName = editName.trim();
    const customerPhone = editPhone.trim();

    if (!customerName) {
      Alert.alert('', 'name is required.');
      return;
    }

    // Check for duplicate name (case-insensitive, exclude self)
    const nameKey = customerName.toLowerCase();
    const duplicateName = derivedCustomers.find(
      (c) => c.name.toLowerCase() === nameKey && c.name.toLowerCase() !== editingCustomer.name.toLowerCase()
    );
    if (duplicateName) {
      Alert.alert('', `a customer named "${duplicateName.name}" already exists.`);
      return;
    }

    // Check for duplicate phone (if provided, exclude self)
    // Normalize Malaysian numbers: strip non-digits, then convert leading 0 → 60
    if (customerPhone) {
      let normalizedInput = customerPhone.replace(/[^0-9]/g, '');
      if (normalizedInput.startsWith('0')) normalizedInput = '60' + normalizedInput.slice(1);

      const duplicatePhone = derivedCustomers.find((c) => {
        if (!c.phone) return false;
        if (c.name.toLowerCase() === editingCustomer.name.toLowerCase()) return false;
        let normalizedExisting = c.phone.replace(/[^0-9]/g, '');
        if (normalizedExisting.startsWith('0')) normalizedExisting = '60' + normalizedExisting.slice(1);
        return normalizedExisting === normalizedInput;
      });
      if (duplicatePhone) {
        Alert.alert('', `that phone number is already used by ${duplicatePhone.name}.`);
        return;
      }
    }

    const updates = {
      name: customerName,
      phone: customerPhone || undefined,
      address: editAddress.trim() || undefined,
      note: editNote.trim() || undefined,
    };

    if (editingCustomer.storedId) {
      updateSellerCustomer(editingCustomer.storedId, updates);
    } else {
      addSellerCustomer(updates);
    }

    // If name changed, update all associated orders so the customer doesn't split into two entries
    const oldName = editingCustomer.name;
    if (oldName && customerName !== oldName) {
      for (const order of editingCustomer.orders) {
        updateOrder(order.id, { customerName: customerName });
      }
    }

    mediumTap();
    showToast('customer saved.', 'info');
    setEditModalVisible(false);
    setEditingCustomer(null);
  }, [editingCustomer, editName, editPhone, editAddress, editNote, derivedCustomers, updateSellerCustomer, addSellerCustomer, updateOrder, showToast]);

  const handleClearFilters = useCallback(() => {
    lightTap();
    setFilter('all');
    setSearch('');
  }, []);

  // ─── Filter tab definitions ────────────────────────────────
  const FILTERS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'all' },
    { key: 'owes', label: 'outstanding' },
    { key: 'repeat', label: 'returning' },
  ];

  // ─── Empty state helper ───────────────────────────────────
  const openAddCustomerModal = useCallback(() => {
    lightTap();
    setEditingCustomer({ name: '', totalOrders: 0, totalSpent: 0, unpaidAmount: 0, lastOrderDate: new Date(), orders: [] });
    setEditName('');
    setEditPhone('');
    setEditAddress('');
    setEditNote('');
    setEditModalVisible(true);
  }, []);

  // ─── FlatList render callback ────────────────────────────────
  const renderCustomerItem = useCallback(
    ({ item, index }: { item: DerivedCustomer; index: number }) => (
      <CustomerCard
        customer={item}
        currency={currency}
        onPress={() => { selectionChanged(); setSelectedCustomer(item); }}
        index={index}
      />
    ),
    [currency]
  );

  const customerKeyExtractor = useCallback(
    (item: DerivedCustomer) => item.name,
    []
  );

  // ─── FlatList header (search, filters, add button) ──────────
  const ListHeader = useMemo(() => (
    <View>
      {/* Search bar + sort */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={CALM.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="search name, phone, address"
            placeholderTextColor={CALM.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            accessibilityLabel="Search customers"
            accessibilityRole="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color={CALM.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.sortButton, sortBy !== 'recent' && styles.sortButtonActive]}
          activeOpacity={0.7}
          onPress={() => { lightTap(); setShowSortMenu(true); }}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${sortBy}`}
        >
          <Feather name="sliders" size={18} color={sortBy !== 'recent' ? '#fff' : CALM.bronze} />
        </TouchableOpacity>
      </View>

      {/* Filter pills with counts */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const count = filterCounts[f.key];
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterPill,
                isActive && styles.filterPillActive,
              ]}
              onPress={() => { selectionChanged(); setFilter(f.key); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Filter: ${f.label}, ${count}`}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {f.label}
              </Text>
              {count > 0 && (
                <Text style={[styles.filterPillCount, isActive && styles.filterPillCountActive]}>
                  {count}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Result count + clear filters */}
      {hasActiveFilters && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>
            {filteredCustomers.length} of {derivedCustomers.length} customer{derivedCustomers.length !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            onPress={handleClearFilters}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.clearFiltersText}>clear filters</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add customer button */}
      <TouchableOpacity
        style={styles.addCustomerButton}
        activeOpacity={0.7}
        onPress={openAddCustomerModal}
        accessibilityRole="button"
        accessibilityLabel="Add a new customer"
      >
        <Feather name="user-plus" size={16} color={CALM.bronze} />
        <Text style={styles.addCustomerButtonText}>add customer</Text>
      </TouchableOpacity>
    </View>
  ), [search, sortBy, filter, filterCounts, hasActiveFilters, filteredCustomers.length, derivedCustomers.length, handleClearFilters, openAddCustomerModal]);

  return (
    <View style={styles.container}>
      {derivedCustomers.length === 0 ? (
        <>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Feather name="users" size={32} color={CALM.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>no customers yet</Text>
            <Text style={styles.emptySubtitle}>
              add a customer or create an order to get started.
            </Text>
            <TouchableOpacity
              style={styles.emptyAddButton}
              activeOpacity={0.7}
              onPress={openAddCustomerModal}
              accessibilityRole="button"
              accessibilityLabel="Add a new customer"
            >
              <Feather name="user-plus" size={16} color={CALM.bronze} />
              <Text style={styles.emptyAddButtonText}>add customer</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
      <>
      {/* ─── Stats Summary Bar ─── */}
      <StatsSummary
        customers={derivedCustomers}
        currency={currency}
        onTapAll={() => setFilter('all')}
        onTapOwes={() => setFilter('owes')}
        onTapRepeat={() => setFilter('repeat')}
      />

      <FlatList
        data={filteredCustomers}
        renderItem={renderCustomerItem}
        keyExtractor={customerKeyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.noResultsContainer}>
            <View style={styles.noResultsIconCircle}>
              <Feather name="search" size={24} color={CALM.textMuted} />
            </View>
            <Text style={styles.noResultsText}>no matching customers.</Text>
            {hasActiveFilters && (
              <TouchableOpacity
                style={styles.noResultsClearButton}
                activeOpacity={0.7}
                onPress={handleClearFilters}
              >
                <Text style={styles.noResultsClearText}>clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
      </>
      )}

      {/* ─── Customer detail modal ─── */}
      <CustomerDetailModal
        visible={!!selectedCustomer}
        customer={selectedCustomer}
        currency={currency}
        onClose={() => setSelectedCustomer(null)}
        onCallPhone={handleCallPhone}
        onWhatsApp={handleWhatsApp}
        onOpenMaps={handleOpenMaps}
        onEditDetails={() => selectedCustomer && openEditModal(selectedCustomer)}
        onCopyInfo={() => selectedCustomer && handleCopyInfo(selectedCustomer)}
        onViewOrders={() => selectedCustomer && handleViewOrders(selectedCustomer.name)}
        onDeleteCustomer={() => selectedCustomer && handleDeleteCustomer(selectedCustomer)}
        onNewOrder={() => selectedCustomer && handleNewOrder(selectedCustomer)}
      />

      {/* ─── Sort menu modal ─── */}
      <Modal
        visible={showSortMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortMenu(false)}
      >
        <TouchableOpacity
          style={styles.sortOverlay}
          activeOpacity={1}
          onPress={() => setShowSortMenu(false)}
        >
          <View style={styles.sortSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sortSheetTitle}>sort by</Text>
            {SORT_OPTIONS.map((opt) => {
              const isActive = sortBy === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.sortOption, isActive && styles.sortOptionActive]}
                  activeOpacity={0.7}
                  onPress={() => {
                    selectionChanged();
                    setSortBy(opt.value);
                    setShowSortMenu(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={styles.sortOptionLeft}>
                    <Feather name={opt.icon} size={16} color={isActive ? CALM.bronze : CALM.textMuted} />
                    <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                      {opt.label}
                    </Text>
                  </View>
                  {isActive && <Feather name="check" size={16} color={CALM.bronze} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Edit modal ─── */}
      <Modal
        visible={editModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditingCustomer(null);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              setEditModalVisible(false);
              setEditingCustomer(null);
            }}
          />
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingCustomer?.storedId ? 'edit details' : 'new customer'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditModalVisible(false);
                    setEditingCustomer(null);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close modal"
                >
                  <Feather name="x" size={22} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>name</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="customer name"
                placeholderTextColor={CALM.textMuted}
                autoFocus={!editingCustomer?.name}
                accessibilityLabel="Customer name"
              />

              <Text style={styles.modalLabel}>phone</Text>
              <TextInput
                style={styles.modalInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="phone number"
                placeholderTextColor={CALM.textMuted}
                keyboardType="phone-pad"
                accessibilityLabel="Phone number"
              />

              <Text style={styles.modalLabel}>address</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline]}
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="delivery address"
                placeholderTextColor={CALM.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel="Customer address"
              />

              <Text style={styles.modalLabel}>note</Text>
              <TextInput
                style={styles.modalInput}
                value={editNote}
                onChangeText={setEditNote}
                placeholder="note"
                placeholderTextColor={CALM.textMuted}
                accessibilityLabel="Customer note"
              />

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Save customer details"
              >
                <Feather name="check" size={18} color="#fff" />
                <Text style={styles.saveButtonText}>save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingTop: SPACING.sm,
  },

  // ── Stats summary ──
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  statChip: {
    flex: 1,
    backgroundColor: withAlpha(CALM.bronze, 0.05),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 10,
    color: CALM.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Search + sort ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    paddingVertical: SPACING.sm,
  },
  sortButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    backgroundColor: CALM.bronze,
  },

  // ── Filter pills ──
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    minHeight: 36,
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  filterPillTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  filterPillCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  filterPillCountActive: {
    color: CALM.bronze,
  },

  // ── Result count ──
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  resultText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  clearFiltersText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── No results ──
  noResultsContainer: {
    paddingVertical: SPACING['4xl'],
    alignItems: 'center',
    gap: SPACING.sm,
  },
  noResultsIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textMuted,
  },
  noResultsClearButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 36,
    justifyContent: 'center',
  },
  noResultsClearText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Card (simplified) ──
  card: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    marginBottom: SPACING.sm,
  },
  cardUnpaid: {
    borderLeftWidth: 3,
    borderLeftColor: CALM.bronze,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    minHeight: 44,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  cardContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  customerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  customerStats: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  unpaidBadge: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
  },
  unpaidBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'],
  },

  // ── Detail modal ──
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING['3xl'],
    maxHeight: '85%',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  detailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: SPACING.md,
  },
  detailAvatar: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  detailAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  detailName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  detailSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },

  // ── Insights ──
  insightsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  insightChip: {
    flex: 1,
    backgroundColor: withAlpha(CALM.textMuted, 0.04),
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
  },
  insightChipDebt: {
    backgroundColor: withAlpha(CALM.bronze, 0.06),
  },
  insightLabel: {
    fontSize: 10,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  insightValue: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  insightValueDebt: {
    color: CALM.bronze,
  },

  // ── Contact ──
  contactRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  contactButtonSmall: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
  },

  // ── Address ──
  addressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  addressButtonText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
    lineHeight: 20,
  },

  // ── Note ──
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  noteText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 20,
  },

  // ── Order history ──
  orderHistorySection: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  orderHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  orderHistoryTitle: {
    ...TYPE.label,
  },
  viewAllText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  orderHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    minHeight: 44,
  },
  orderHistoryLeft: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  orderHistoryDate: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: 2,
  },
  orderHistorySummary: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  orderHistoryRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  orderHistoryAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.lavender, 0.15),
  },
  statusPillPaid: {
    backgroundColor: withAlpha(BIZ.success, 0.1),
  },
  statusPillPending: {
    backgroundColor: withAlpha(BIZ.pending, 0.15),
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.lavender,
  },
  statusPillTextPaid: {
    color: BIZ.success,
  },
  statusPillTextPending: {
    color: BIZ.pending,
  },

  // ── Actions grid ──
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  gridAction: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  gridActionSecondary: {
    width: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  gridActionTextPrimary: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  gridActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },

  // ── Delete ──
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  deleteButtonText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textMuted,
  },

  // ── Empty state ──
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING['3xl'],
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    minHeight: 44,
  },
  emptyAddButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as '500',
    color: CALM.bronze,
  },

  // ── Sort modal ──
  sortOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortSheet: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    width: '80%',
    maxWidth: 300,
  },
  sortSheetTitle: {
    ...TYPE.label,
    marginBottom: SPACING.md,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    minHeight: 44,
  },
  sortOptionActive: {},
  sortOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sortOptionText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
  },
  sortOptionTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Add customer ──
  addCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.lg,
    minHeight: 48,
    marginBottom: SPACING.md,
  },
  addCustomerButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },

  // ── Edit modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING['3xl'],
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: CALM.border,
    alignSelf: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  modalCustomerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
  },
  modalLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  modalInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
    minHeight: 44,
  },
  modalInputMultiline: {
    minHeight: 80,
    paddingTop: SPACING.md,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    marginTop: SPACING['2xl'],
    gap: SPACING.sm,
    minHeight: 48,
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});

export default SellerCustomers;
