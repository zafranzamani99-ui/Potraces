import React, { useMemo, useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable,
  TextInput, Animated, Linking, Platform, Alert, Modal, RefreshControl, Keyboard,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView as KAView } from 'react-native-keyboard-controller';
import { useNavigation } from '@react-navigation/native';
import { isToday, isYesterday, format, isValid } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { syncAll, pullOrderLinkOrders } from '../../services/sellerSync';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, selectionChanged, warningNotification } from '../../services/haptics';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ, BIZ_SAFE, semantic } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { SellerOrder, SellerCustomer } from '../../types';
import ModalToastHost from '../../components/common/ModalToastHost';

// ─── Smart date label ─────────────────────────────────────────
function smartDateLabel(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (!isValid(d)) return '---';
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
  firstOrderDate: Date;
  phone?: string;
  address?: string;
  note?: string;
  isVip?: boolean;
  storedId?: string;
  orders: SellerOrder[];
}

type FilterTab = 'all' | 'owes' | 'repeat';
type SortOption = 'recent' | 'name' | 'orders' | 'spent' | 'debt' | 'followup';

const SORT_OPTIONS: { label: string; value: SortOption; icon: keyof typeof Feather.glyphMap }[] = [
  { label: 'most recent', value: 'recent', icon: 'clock' },
  { label: 'needs follow-up', value: 'followup', icon: 'bell' },
  { label: 'name A–Z', value: 'name', icon: 'type' },
  { label: 'most orders', value: 'orders', icon: 'shopping-bag' },
  { label: 'most spent', value: 'spent', icon: 'dollar-sign' },
  { label: 'highest debt', value: 'debt', icon: 'alert-circle' },
];

const FILTERS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'owes', label: 'outstanding' },
  { key: 'repeat', label: 'returning' },
];

// ─── Stats Summary ────────────────────────────────────────────
const StatsSummary: React.FC<{
  customers: DerivedCustomer[];
  currency: string;
  onTapAll: () => void;
  onTapOwes: () => void;
  onTapRepeat: () => void;
  styles: ReturnType<typeof makeStyles>;
}> = React.memo(({ customers, currency, onTapAll, onTapOwes, onTapRepeat, styles }) => {
  const C = useCalm();
  const isDark = useIsDark();
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
          <Feather name="users" size={14} color={semantic(BIZ_SAFE.success, isDark)} />
          <Text style={styles.statValue}>{stats.total}</Text>
        </View>
        <Text style={styles.statLabel}>customers</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.statChip, { backgroundColor: withAlpha(semantic(BIZ_SAFE.unpaid, isDark), 0.05) }]}
        activeOpacity={0.7}
        onPress={() => { lightTap(); onTapOwes(); }}
        accessibilityRole="button"
        accessibilityLabel={`${currency} ${stats.outstanding.toFixed(2)} outstanding`}
      >
        <View style={styles.statIconRow}>
          <Feather name="alert-circle" size={14} color={semantic(BIZ_SAFE.unpaid, isDark)} />
          <Text style={styles.statValue} numberOfLines={1}>{currency} {stats.outstanding.toFixed(0)}</Text>
        </View>
        <Text style={styles.statLabel}>outstanding</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.statChip, { backgroundColor: withAlpha(C.accent, 0.05) }]}
        activeOpacity={0.7}
        onPress={() => { lightTap(); onTapRepeat(); }}
        accessibilityRole="button"
        accessibilityLabel={`${stats.repeatCount} returning customers`}
      >
        <View style={styles.statIconRow}>
          <Feather name="repeat" size={14} color={C.accent} />
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
  onPress: (customer: DerivedCustomer) => void;
  index: number;
  styles: ReturnType<typeof makeStyles>;
}

const CustomerCard: React.FC<CustomerCardProps> = React.memo(({
  customer,
  currency,
  onPress,
  index,
  styles,
}) => {
  const C = useCalm();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      delay: Math.min(index * 40, 200),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, index]);

  const handlePress = useCallback(() => {
    lightTap();
    onPress(customer);
  }, [onPress, customer]);

  const lastOrderLabel = smartDateLabel(customer.lastOrderDate);

  return (
    <Animated.View style={[styles.card, customer.unpaidAmount > 0 && styles.cardUnread, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={styles.cardBody}
        onPress={handlePress}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.customerName, customer.unpaidAmount <= 0 && styles.customerNameRead]} numberOfLines={2}>
              {customer.name}
            </Text>
            {customer.isVip && (
              <View style={styles.vipBadge}>
                <Feather name="star" size={10} color={C.gold} />
                <Text style={styles.vipBadgeText}>VIP</Text>
              </View>
            )}
          </View>
          <Text style={[styles.customerStats, customer.unpaidAmount > 0 && styles.customerStatsUnread]}>
            {customer.totalOrders} order{customer.totalOrders !== 1 ? 's' : ''}{customer.unpaidAmount <= 0 ? ` · ${currency} ${customer.totalSpent.toFixed(0)}` : ''} · {lastOrderLabel}
          </Text>
        </View>

        {/* Right side: unpaid amount or chevron */}
        {customer.unpaidAmount > 0 ? (
          <Text style={styles.unpaidAmount}>
            {currency} {customer.unpaidAmount.toFixed(0)}
          </Text>
        ) : (
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        )}
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
  onRemind: () => void;
  styles: ReturnType<typeof makeStyles>;
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
  onRemind,
  styles,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();

  const recentOrders = useMemo(() => {
    if (!customer) return [];
    return [...customer.orders]
      .sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 3);
  }, [customer?.orders]);

  if (!customer) return null;

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
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.detailOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.detailSheet} onStartShouldSetResponder={() => true}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {/* Close */}
            <View style={styles.detailCloseRow}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="x" size={16} color={C.textMuted} />
              </Pressable>
            </View>

            {/* Identity — centered */}
            <View style={styles.dtIdentity}>
              <View style={styles.dtAvatarLarge}>
                <Text style={styles.dtAvatarLargeText}>
                  {customer.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.dtName} numberOfLines={2}>{customer.name}</Text>
              <Text style={styles.dtMeta}>
                {customer.totalOrders} order{customer.totalOrders !== 1 ? 's' : ''} · {lastOrderLabel}
                {customer.totalOrders > 1 && isValid(customer.firstOrderDate) ? ` · since ${format(customer.firstOrderDate, 'MMM yyyy')}` : ''}
              </Text>
            </View>

            {/* Contact strip — icon circles */}
            {(customer.phone || customer.address) && (
              <View style={styles.dtContactStrip}>
                {customer.phone && (
                  <TouchableOpacity
                    style={styles.dtContactCircle}
                    activeOpacity={0.7}
                    onPress={() => { lightTap(); onCallPhone(customer.phone!); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${customer.phone}`}
                  >
                    <Feather name="phone" size={18} color={C.bronze} />
                    <Text style={styles.dtContactLabel}>call</Text>
                  </TouchableOpacity>
                )}
                {customer.phone && (
                  <TouchableOpacity
                    style={styles.dtContactCircle}
                    activeOpacity={0.7}
                    onPress={() => { lightTap(); onWhatsApp(customer.phone!); }}
                    accessibilityRole="button"
                    accessibilityLabel="WhatsApp customer"
                  >
                    <Feather name="message-circle" size={18} color={C.bronze} />
                    <Text style={styles.dtContactLabel}>WhatsApp</Text>
                  </TouchableOpacity>
                )}
                {customer.address && (
                  <TouchableOpacity
                    style={styles.dtContactCircle}
                    activeOpacity={0.7}
                    onPress={() => { lightTap(); onOpenMaps(customer.address!); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Navigate to ${customer.address}`}
                  >
                    <Feather name="map-pin" size={18} color={C.bronze} />
                    <Text style={styles.dtContactLabel}>map</Text>
                  </TouchableOpacity>
                )}
                {customer.unpaidAmount > 0 && customer.phone && (
                  <TouchableOpacity
                    style={styles.dtContactCircle}
                    activeOpacity={0.7}
                    onPress={() => { lightTap(); onRemind(); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remind ${customer.name} about outstanding balance`}
                  >
                    <Feather name="bell" size={18} color={C.bronze} />
                    <Text style={styles.dtContactLabel}>remind</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Hero numbers */}
            {customer.unpaidAmount > 0 ? (
              <View style={styles.dtHeroCard}>
                <Text style={styles.dtHeroLabel}>outstanding</Text>
                <Text style={styles.dtHeroAmount}>{currency} {customer.unpaidAmount.toFixed(0)}</Text>
                {customer.totalOrders > 1 && (
                  <Text style={styles.dtHeroSub}>
                    {currency} {customer.totalSpent.toFixed(0)} lifetime · {currency} {avgOrder.toFixed(0)} avg
                  </Text>
                )}
              </View>
            ) : customer.totalOrders > 1 ? (
              <View style={styles.dtHeroCard}>
                <Text style={styles.dtHeroLabel}>lifetime</Text>
                <Text style={[styles.dtHeroAmount, { color: C.textPrimary }]}>{currency} {customer.totalSpent.toFixed(0)}</Text>
                <Text style={styles.dtHeroSub}>
                  {currency} {avgOrder.toFixed(0)} avg per order
                </Text>
              </View>
            ) : null}

            {/* Note */}
            {customer.note ? (
              <View style={styles.noteRow}>
                <Feather name="file-text" size={14} color={C.textMuted} />
                <Text style={styles.noteText}>{customer.note}</Text>
              </View>
            ) : null}

            {/* Orders */}
            {recentOrders.length > 0 && (
              <View style={styles.dtOrdersSection}>
                <View style={styles.dtOrdersHeader}>
                  <Text style={styles.dtOrdersTitle}>orders</Text>
                  {customer.totalOrders > 3 && (
                    <TouchableOpacity
                      onPress={() => { lightTap(); onViewOrders(); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="View all orders"
                    >
                      <Text style={styles.dtOrdersViewAll}>all {customer.totalOrders}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {recentOrders.map((order) => {
                  const status = getStatusLabel(order);
                  const orderDate = order.date instanceof Date ? order.date : new Date(order.date);
                  return (
                    <View key={order.id} style={styles.dtOrderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dtOrderMeta}>
                          {smartDateLabel(orderDate)}{order.orderNumber ? ` · ${order.orderNumber}` : ''}
                        </Text>
                        <Text style={styles.dtOrderItems} numberOfLines={1}>
                          {getItemsSummary(order)}
                        </Text>
                      </View>
                      <View style={styles.dtOrderRight}>
                        <Text style={styles.dtOrderAmount}>{currency} {order.totalAmount.toFixed(0)}</Text>
                        <Text style={[
                          styles.dtOrderStatus,
                          order.isPaid && { color: semantic(BIZ_SAFE.success, isDark) },
                          status === 'pending' && { color: C.gold },
                        ]}>
                          {status}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Actions */}
            <View style={styles.dtActions}>
              <TouchableOpacity
                style={styles.dtActionPrimary}
                activeOpacity={0.7}
                onPress={() => { lightTap(); onNewOrder(); }}
                accessibilityRole="button"
                accessibilityLabel="New order"
              >
                <Feather name="plus" size={16} color={C.onAccent} />
                <Text style={styles.dtActionPrimaryText}>new order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dtActionSecondary}
                activeOpacity={0.7}
                onPress={() => { lightTap(); onViewOrders(); }}
                accessibilityRole="button"
                accessibilityLabel="View all orders"
              >
                <Text style={styles.dtActionSecondaryText}>all orders</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dtActionSecondary}
                activeOpacity={0.7}
                onPress={() => { lightTap(); onEditDetails(); }}
                accessibilityRole="button"
                accessibilityLabel="Edit details"
              >
                <Text style={styles.dtActionSecondaryText}>edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dtActionSecondary}
                activeOpacity={0.7}
                onPress={() => { lightTap(); onCopyInfo(); }}
                accessibilityRole="button"
                accessibilityLabel="Copy customer info"
              >
                <Text style={styles.dtActionSecondaryText}>copy</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: SPACING.xl }} />
          </ScrollView>
        </View>
      </View>
      <ModalToastHost />
    </Modal>
  );
};

// ─── Main Component ──────────────────────────────────────────
const SellerCustomers: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { orders, sellerCustomers, addSellerCustomer, updateSellerCustomer, deleteSellerCustomer, deleteOrder, deleteOrders, updateOrder } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();
  const navigation = useNavigation<any>();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<DerivedCustomer | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const { products, orders, seasons, sellerCustomers: sc } = useSellerStore.getState();
    Promise.all([syncAll(products, orders, seasons, sc), pullOrderLinkOrders()])
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<DerivedCustomer | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editName, setEditName] = useState('');
  const [editIsVip, setEditIsVip] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // ─── Contact picker state ─────────────────────────────────
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactsList, setContactsList] = useState<Contacts.Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');

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
          firstOrderDate: new Date(order.date),
          phone: order.customerPhone || undefined,
          orders: [],
        };
      }

      const entry = map[key];
      entry.totalOrders += 1;
      entry.totalSpent += order.totalAmount;
      if (!order.isPaid) {
        entry.unpaidAmount += order.totalAmount - (order.paidAmount ?? 0);
      }

      const orderDate = order.date instanceof Date ? order.date : new Date(order.date);
      if (orderDate > entry.lastOrderDate) {
        entry.lastOrderDate = orderDate;
      }
      if (orderDate < entry.firstOrderDate) {
        entry.firstOrderDate = orderDate;
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
        if (stored.isVip) entry.isVip = stored.isVip;
      }
    }

    // Add stored customers that have no orders yet
    for (const stored of sellerCustomers) {
      const key = stored.name.toLowerCase();
      if (!map[key]) {
        const storedDate = stored.createdAt instanceof Date ? stored.createdAt : new Date(stored.createdAt);
        map[key] = {
          name: stored.name,
          totalOrders: 0,
          totalSpent: 0,
          unpaidAmount: 0,
          lastOrderDate: storedDate,
          firstOrderDate: storedDate,
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

  // ─── Contact import: O(1) existence lookups + stable list/row ─
  const existingCustomerNames = useMemo(
    () => new Set(derivedCustomers.map((c) => c.name.toLowerCase())),
    [derivedCustomers]
  );

  const filteredContacts = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    if (!term) return contactsList;
    return contactsList.filter((c) => c.name?.toLowerCase().includes(term));
  }, [contactsList, contactSearch]);

  const renderContactItem = useCallback(({ item: contact }: { item: Contacts.Contact }) => {
    const phone = contact.phoneNumbers?.[0]?.number || '';
    const alreadyExists = existingCustomerNames.has((contact.name || '').toLowerCase());
    return (
      <TouchableOpacity
        style={[styles.contactItem, alreadyExists && styles.contactItemExisting]}
        activeOpacity={0.7}
        onPress={() => {
          if (alreadyExists) {
            showToast(`${contact.name} already exists`, 'error');
            return;
          }
          lightTap();
          const addr = contact.addresses?.[0]
            ? [contact.addresses[0].street, contact.addresses[0].city, contact.addresses[0].region]
                .filter(Boolean)
                .join(', ')
            : '';
          setShowContactPicker(false);
          setTimeout(() => {
            setEditingCustomer({ name: '', totalOrders: 0, totalSpent: 0, unpaidAmount: 0, lastOrderDate: new Date(), firstOrderDate: new Date(), orders: [] });
            setEditName(contact.name || '');
            setEditPhone(phone);
            setEditAddress(addr);
            setEditNote('');
            setEditIsVip(false);
            setEditModalVisible(true);
          }, 50);
        }}
      >
        <View style={styles.contactAvatar}>
          <Text style={styles.contactAvatarText}>
            {(contact.name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
          {phone ? <Text style={styles.contactPhone} numberOfLines={1}>{phone}</Text> : null}
        </View>
        {alreadyExists ? (
          <Text style={styles.contactExistsLabel}>exists</Text>
        ) : (
          <Feather name="plus" size={16} color={C.bronze} />
        )}
      </TouchableOpacity>
    );
  }, [existingCustomerNames, styles, C, showToast]);

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
        list.sort((a, b) => {
          const aUnpaid = a.unpaidAmount > 0 ? 1 : 0;
          const bUnpaid = b.unpaidAmount > 0 ? 1 : 0;
          if (aUnpaid !== bUnpaid) return bUnpaid - aUnpaid;
          return b.lastOrderDate.getTime() - a.lastOrderDate.getTime();
        });
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
      case 'followup': {
        const now = Date.now();
        const DAY = 86400000;
        list.sort((a, b) => {
          const sa = (a.unpaidAmount > 0 ? 1000 : 0) + (now - a.lastOrderDate.getTime()) / DAY;
          const sb = (b.unpaidAmount > 0 ? 1000 : 0) + (now - b.lastOrderDate.getTime()) / DAY;
          return sb - sa;
        });
        break;
      }
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
    if (!phone) return;
    Linking.openURL('tel:' + phone);
  }, []);

  const handleWhatsApp = useCallback((phone: string) => {
    if (!phone) return;
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
    setTimeout(() => {
      navigation.navigate('SellerOrders', { searchQuery: customerName, initialFilter: 'all' });
    }, 50);
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
            deleteOrders(customer.orders.map(o => o.id));
            setSelectedCustomer(null);
            showToast('customer and orders deleted.', 'info');
          },
        },
      ]
    );
  }, [deleteSellerCustomer, deleteOrders, showToast]);

  const handleNewOrder = useCallback((customer: DerivedCustomer) => {
    setSelectedCustomer(null);
    setTimeout(() => {
      navigation.navigate('SellerNewOrder', {
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
      });
    }, 50);
  }, [navigation]);

  const openEditModal = useCallback((customer: DerivedCustomer) => {
    setSelectedCustomer(null);
    setEditingCustomer(customer);
    setEditName(customer.name);
    setEditPhone(customer.phone || '');
    setEditAddress(customer.address || '');
    setEditNote(customer.note || '');
    setEditIsVip(customer.isVip || false);
    setEditModalVisible(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!editingCustomer) return;

    const customerName = editName.trim();
    const customerPhone = editPhone.trim();

    if (!customerName) {
      warningNotification();
      showToast('name is required', 'error');
      return;
    }

    // Check for duplicate name (case-insensitive, exclude self)
    const nameKey = customerName.toLowerCase();
    const duplicateName = derivedCustomers.find(
      (c) => c.name.toLowerCase() === nameKey && c.name.toLowerCase() !== editingCustomer.name.toLowerCase()
    );
    if (duplicateName) {
      warningNotification();
      showToast(`"${duplicateName.name}" already exists`, 'error');
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
        warningNotification();
        showToast(`phone already used by ${duplicatePhone.name}`, 'error');
        return;
      }
    }

    const updates = {
      name: customerName,
      phone: customerPhone || undefined,
      address: editAddress.trim() || undefined,
      note: editNote.trim() || undefined,
      isVip: editIsVip,
    };

    if (editingCustomer.storedId) {
      updateSellerCustomer(editingCustomer.storedId, updates);
    } else {
      addSellerCustomer(updates);
    }

    // Propagate name, phone, and address changes to all associated orders
    const oldName = editingCustomer.name;
    for (const order of editingCustomer.orders) {
      const orderUpdates: Record<string, any> = {};
      if (oldName && customerName !== oldName) orderUpdates.customerName = customerName;
      if (customerPhone) orderUpdates.customerPhone = customerPhone;
      if (editAddress.trim()) orderUpdates.customerAddress = editAddress.trim();
      if (Object.keys(orderUpdates).length > 0) updateOrder(order.id, orderUpdates);
    }

    mediumTap();
    showToast('customer saved.', 'info');
    setEditModalVisible(false);
    setEditingCustomer(null);
  }, [editingCustomer, editName, editPhone, editAddress, editNote, editIsVip, derivedCustomers, updateSellerCustomer, addSellerCustomer, updateOrder, showToast]);

  const handleClearFilters = useCallback(() => {
    lightTap();
    setFilter('all');
    setSearch('');
  }, []);

  // ─── Empty state helper ───────────────────────────────────
  const openAddCustomerModal = useCallback(() => {
    lightTap();
    const now = new Date();
    setEditingCustomer({ name: '', totalOrders: 0, totalSpent: 0, unpaidAmount: 0, lastOrderDate: now, firstOrderDate: now, orders: [] });
    setEditName('');
    setEditPhone('');
    setEditAddress('');
    setEditNote('');
    setEditIsVip(false);
    setEditModalVisible(true);
  }, []);

  // ─── WhatsApp reminder ────────────────────────────────────
  const handleWhatsAppReminder = useCallback((customer: DerivedCustomer) => {
    if (!customer.phone) return;
    lightTap();
    let digits = customer.phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) digits = '60' + digits.slice(1);
    const msg = `Hi ${customer.name}, just a friendly reminder about your outstanding balance of ${currency} ${customer.unpaidAmount.toFixed(2)}. Thank you!`;
    Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`);
  }, [currency]);

  // ─── Header add button ────────────────────────────────────
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: { paddingRight: SPACING.md },
      headerRight: () => (
        <TouchableOpacity
          onPress={openAddCustomerModal}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Add customer"
        >
          <Feather name="plus" size={20} color={C.textPrimary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, openAddCustomerModal, C, isDark]);

  // ─── Import from contacts ─────────────────────────────────
  const handleImportFromContacts = useCallback(async () => {
    lightTap();
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('', 'contacts permission is needed to import.');
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.Name,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Addresses,
      ],
      sort: Contacts.SortTypes.FirstName,
    });

    if (!data || data.length === 0) {
      Alert.alert('', 'no contacts found on this device.');
      return;
    }

    // Build a simple list for selection
    const options = data
      .filter((c) => c.name)
      .slice(0, 100)
      .map((c) => ({
        text: c.name!,
        onPress: () => {
          const phone = c.phoneNumbers?.[0]?.number || '';
          const addr = c.addresses?.[0]
            ? [c.addresses[0].street, c.addresses[0].city, c.addresses[0].region]
                .filter(Boolean)
                .join(', ')
            : '';

          // Check for duplicate
          const nameKey = c.name!.trim().toLowerCase();
          const existing = derivedCustomers.find((dc) => dc.name.toLowerCase() === nameKey);
          if (existing) {
            Alert.alert('', `${c.name} already exists in your customer list.`);
            return;
          }

          setEditingCustomer({ name: '', totalOrders: 0, totalSpent: 0, unpaidAmount: 0, lastOrderDate: new Date(), firstOrderDate: new Date(), orders: [] });
          setEditName(c.name!);
          setEditPhone(phone);
          setEditAddress(addr);
          setEditNote('');
          setEditModalVisible(true);
        },
      }));

    // Show contact picker using Alert (max ~10 at a time is practical)
    // Instead, let's open the add modal with a contact-fill approach
    // Better UX: use Contacts.presentContactPickerAsync if available, or open modal with contacts search
    // Simplest approach: open the native contact picker
    if (options.length === 0) {
      Alert.alert('', 'no contacts with names found.');
      return;
    }

    // Use a simple search-based contact list modal
    setContactsList(data.filter((c) => c.name).slice(0, 200));
    setContactSearch('');
    setShowContactPicker(true);
  }, [derivedCustomers]);

  // ─── Stable customer selection handler ──────────────────────
  const handleSelectCustomer = useCallback((customer: DerivedCustomer) => {
    selectionChanged();
    setSelectedCustomer(customer);
  }, []);

  // ─── FlatList render callback ────────────────────────────────
  const renderCustomerItem = useCallback(
    ({ item, index }: { item: DerivedCustomer; index: number }) => (
      <CustomerCard
        customer={item}
        currency={currency}
        onPress={handleSelectCustomer}
        index={index}
        styles={styles}
      />
    ),
    [currency, handleSelectCustomer, styles]
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
          <Feather name="search" size={16} color={C.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="search name, phone, address"
            placeholderTextColor={withAlpha(C.textMuted, 0.6)}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            accessibilityLabel="Search customers"
            accessibilityRole="search"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={withAlpha(C.accent, 0.25)}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color={C.textMuted} />
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
          <Feather name="sliders" size={18} color={sortBy !== 'recent' ? C.bronze : C.textMuted} />
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

    </View>
  ), [search, sortBy, filter, filterCounts, hasActiveFilters, filteredCustomers.length, derivedCustomers.length, handleClearFilters, C, isDark]);

  return (
    <View style={styles.container}>
      {derivedCustomers.length === 0 ? (
        <>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Feather name="users" size={32} color={C.textMuted} />
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
              <Feather name="user-plus" size={16} color={C.onAccent} />
              <Text style={styles.emptyAddButtonText}>add customer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emptyContactsButton}
              activeOpacity={0.7}
              onPress={handleImportFromContacts}
              accessibilityRole="button"
              accessibilityLabel="Import from contacts"
            >
              <Feather name="book" size={16} color={C.textSecondary} />
              <Text style={styles.emptyContactsButtonText}>from contacts</Text>
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
        styles={styles}
      />

      <FlatList
        data={filteredCustomers}
        renderItem={renderCustomerItem}
        keyExtractor={customerKeyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          derivedCustomers.length === 0 ? (
            <View style={styles.noResultsContainer}>
              <View style={styles.noResultsIconCircle}>
                <Feather name="users" size={28} color={C.textMuted} />
              </View>
              <Text style={styles.noResultsTitle}>no customers yet</Text>
              <Text style={styles.noResultsSubtitle}>customers appear here as you add orders.</Text>
              <TouchableOpacity
                style={styles.noResultsCta}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('SellerNewOrder')}
                accessibilityRole="button"
              >
                <Feather name="plus" size={18} color={C.onAccent} />
                <Text style={styles.noResultsCtaText}>new order</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noResultsContainer}>
              <View style={styles.noResultsIconCircle}>
                <Feather name="search" size={28} color={C.textMuted} />
              </View>
              <Text style={styles.noResultsTitle}>no matching customers</Text>
              <Text style={styles.noResultsSubtitle}>try adjusting your search or filters.</Text>
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
          )
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.bronze} colors={[C.bronze]} />}
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
        onRemind={() => selectedCustomer && handleWhatsAppReminder(selectedCustomer)}
        styles={styles}
      />

      {/* ─── Sort menu modal ─── */}
      <Modal
        visible={showSortMenu}
        transparent
        statusBarTranslucent
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
                    <Feather name={opt.icon} size={16} color={isActive ? semantic(BIZ_SAFE.success, isDark) : C.textMuted} />
                    <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                      {opt.label}
                    </Text>
                  </View>
                  {isActive && <Feather name="check" size={16} color={semantic(BIZ_SAFE.success, isDark)} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
        <ModalToastHost />
      </Modal>

      {/* ─── Edit modal ─── */}
      <Modal
        visible={editModalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditingCustomer(null);
        }}
      >
        <KAView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => {
              setEditModalVisible(false);
              setEditingCustomer(null);
            }}
          />
          <Pressable
            style={styles.modalContent}
            onPress={() => Keyboard.dismiss()}
          >
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: SPACING.xl }}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {editingCustomer?.name ? 'edit ' : 'new '}
                    <Text style={styles.modalTitleAccent}>
                      {editingCustomer?.name ? 'details' : 'customer'}
                    </Text>
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {editingCustomer?.name ? 'update customer details' : 'add a new customer to your list'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setEditModalVisible(false);
                    setEditingCustomer(null);
                  }}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close modal"
                >
                  <Feather name="x" size={16} color={C.textMuted} />
                </Pressable>
              </View>

              {/* From contacts shortcut — only for new customers */}
              {!editingCustomer?.name && (
                <TouchableOpacity
                  style={styles.modalContactsBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    setEditModalVisible(false);
                    setEditingCustomer(null);
                    handleImportFromContacts();
                  }}
                >
                  <Feather name="book" size={14} color={C.bronze} />
                  <Text style={styles.modalContactsBtnText}>pick from contacts</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.modalLabel}>name</Text>
              <TextInput
                style={[styles.modalInput, focusedField === 'name' && styles.modalInputFocused]}
                value={editName}
                onChangeText={setEditName}
                placeholder="customer name"
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                autoFocus={!editingCustomer?.name}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="Customer name"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />

              <Text style={styles.modalLabel}>phone</Text>
              <TextInput
                style={[styles.modalInput, focusedField === 'phone' && styles.modalInputFocused]}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="phone number"
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                keyboardType="phone-pad"
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="Phone number"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />

              <Text style={styles.modalLabel}>address</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline, focusedField === 'address' && styles.modalInputFocused]}
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="delivery address"
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                onFocus={() => setFocusedField('address')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="Customer address"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />

              <Text style={styles.modalLabel}>note</Text>
              <TextInput
                style={[styles.modalInput, focusedField === 'note' && styles.modalInputFocused]}
                value={editNote}
                onChangeText={setEditNote}
                placeholder="allergies, delivery notes, preferences..."
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                onFocus={() => setFocusedField('note')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="Customer note"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />

              <TouchableOpacity
                style={styles.vipToggle}
                onPress={() => setEditIsVip((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityLabel="Mark as VIP customer"
              >
                <View style={[styles.vipCheckbox, editIsVip && styles.vipCheckboxActive]}>
                  {editIsVip && <Feather name="star" size={12} color={C.onAccent} />}
                </View>
                <Text style={[styles.vipLabel, editIsVip && styles.vipLabelActive]}>VIP customer</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditModalVisible(false);
                    setEditingCustomer(null);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.cancelButtonText}>cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Save customer details"
                >
                  <Text style={styles.saveButtonText}>save</Text>
                </TouchableOpacity>
              </View>

              {editingCustomer?.storedId || (editingCustomer?.orders && editingCustomer.orders.length > 0) ? (
                <TouchableOpacity
                  style={styles.editDeleteLink}
                  onPress={() => {
                    if (!editingCustomer) return;
                    setEditModalVisible(false);
                    setEditingCustomer(null);
                    handleDeleteCustomer(editingCustomer);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete customer and all orders"
                >
                  <Text style={styles.editDeleteLinkText}>delete customer</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </Pressable>
        </KAView>
        <ModalToastHost />
      </Modal>

      {/* ─── Contact picker modal ─── */}
      <Modal
        visible={showContactPicker}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowContactPicker(false)}
      >
        <KAView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setShowContactPicker(false)} />
          <Pressable style={styles.contactPickerSheet} onPress={() => Keyboard.dismiss()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {'pick '}<Text style={styles.modalTitleAccent}>contact</Text>
              </Text>
              <Pressable
                onPress={() => setShowContactPicker(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.7 }]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={16} color={C.textMuted} />
              </Pressable>
            </View>

            {/* Contact search */}
            <View style={styles.contactSearchBar}>
              <Feather name="search" size={14} color={C.textMuted} />
              <TextInput
                style={styles.contactSearchInput}
                placeholder="search contacts..."
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
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

            {/* Contact list */}
            <FlatList
              data={filteredContacts}
              keyExtractor={(item, idx) => (item as any).id ?? String(idx)}
              style={styles.contactList}
              contentContainerStyle={{ paddingBottom: SPACING.xl }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              removeClippedSubviews
              windowSize={5}
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              renderItem={renderContactItem}
              ListEmptyComponent={
                <View style={styles.contactEmptyState}>
                  <Text style={styles.contactEmptyText}>no contacts found</Text>
                </View>
              }
            />
          </Pressable>
        </KAView>
        <ModalToastHost />
      </Modal>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingTop: SPACING.sm,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },

  // ── Stats summary ──
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  statChip: {
    flex: 1,
    backgroundColor: withAlpha(BIZ.success, 0.05),
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
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 10,
    color: C.textMuted,
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
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    paddingVertical: SPACING.sm,
  },
  sortButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    backgroundColor: withAlpha(C.bronze, 0.15),
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
    backgroundColor: withAlpha(C.textMuted, 0.06),
    minHeight: 36,
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: withAlpha(BIZ.success, 0.12),
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  filterPillTextActive: {
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  filterPillCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  filterPillCountActive: {
    color: BIZ.success,
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
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  clearFiltersText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── No results ──
  noResultsContainer: {
    paddingVertical: SPACING['4xl'],
    paddingHorizontal: SPACING['2xl'],
    alignItems: 'center',
    gap: SPACING.md,
  },
  noResultsIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  noResultsTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  noResultsSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  noResultsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.deepOliveBiz,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    alignSelf: 'stretch',
    marginTop: SPACING.md,
    minHeight: 48,
  },
  noResultsCtaText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  noResultsClearButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  noResultsClearText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Card (simplified) ──
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    marginBottom: SPACING.xs,
  },
  cardUnread: {
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderColor: withAlpha(C.bronze, 0.12),
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
    backgroundColor: withAlpha(BIZ.success, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
  },
  cardContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  customerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: 2,
  },
  customerNameRead: {
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
  },
  customerStats: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  customerStatsUnread: {
    color: C.textSecondary,
  },
  unpaidAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as any,
    marginLeft: SPACING.sm,
  },

  // ── Detail modal ──
  detailOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.42),
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    maxHeight: '85%',
    maxWidth: 520,
    width: '90%',
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  detailCloseRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: SPACING.xs,
  },

  // ── Detail: identity ──
  dtIdentity: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  dtAvatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(BIZ.success, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  dtAvatarLargeText: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
  },
  dtName: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  dtMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // ── Detail: contact strip ──
  dtContactStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  dtContactCircle: {
    alignItems: 'center',
    gap: SPACING.xs,
    minWidth: 48,
  },
  dtContactLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // ── Detail: hero card ──
  dtHeroCard: {
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  dtHeroLabel: {
    fontSize: 10,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  dtHeroAmount: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  dtHeroSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: SPACING.xs,
    fontVariant: ['tabular-nums'],
  },

  // ── Detail: orders ──
  dtOrdersSection: {
    marginBottom: SPACING.md,
  },
  dtOrdersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  dtOrdersTitle: {
    ...TYPE.label,
  },
  dtOrdersViewAll: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  dtOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
    minHeight: 44,
  },
  dtOrderMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: 2,
  },
  dtOrderItems: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  dtOrderRight: {
    alignItems: 'flex-end',
    marginLeft: SPACING.sm,
  },
  dtOrderAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  dtOrderStatus: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 2,
  },

  // ── Detail: actions ──
  dtActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  dtActionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.deepOliveBiz,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    minHeight: 48,
    width: '100%',
  },
  dtActionPrimaryText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  dtActionSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 40,
  },
  dtActionSecondaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },

  // ── VIP ──
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withAlpha(C.gold, 0.12),
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: withAlpha(C.gold, 0.3),
  },
  vipBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: C.gold,
    letterSpacing: 0.5,
  },
  vipToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  vipCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vipCheckboxActive: {
    backgroundColor: C.gold,
    borderColor: C.gold,
  },
  vipLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  vipLabelActive: {
    color: C.gold,
    fontWeight: TYPOGRAPHY.weight.medium,
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
    color: C.textSecondary,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 20,
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
    backgroundColor: withAlpha(C.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING['2xl'],
    borderRadius: RADIUS.full,
    backgroundColor: C.deepOliveBiz,
    minHeight: 48,
    minWidth: 220,
  },
  emptyAddButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  emptyContactsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING['2xl'],
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 48,
    minWidth: 220,
  },
  emptyContactsButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },

  // ── Sort modal ──
  sortOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.42),
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    width: '80%',
    maxWidth: 300,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
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
    color: C.textSecondary,
  },
  sortOptionTextActive: {
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.medium,
  },


  // ── Edit modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.42),
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    maxHeight: '80%',
    maxWidth: 520,
    width: '90%',
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
  },
  modalTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.bronze,
  },
  modalSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.1,
    marginTop: SPACING.xs,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    letterSpacing: 0.2,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  modalInput: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    minHeight: 44,
  },
  modalInputFocused: {
    borderColor: withAlpha(C.bronze, 0.4),
  },
  modalInputMultiline: {
    minHeight: 80,
    paddingTop: SPACING.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: SPACING.md,
    minHeight: 52,
  },
  cancelButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  saveButton: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.deepOliveBiz,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    minHeight: 52,
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  editDeleteLink: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
    minHeight: 44,
  },
  editDeleteLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
  },

  // ── Modal contacts shortcut ──
  modalContactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
  },
  modalContactsBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Contact picker modal ──
  contactPickerSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    maxHeight: '80%',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    maxWidth: 520,
    width: '90%',
    gap: SPACING.md,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  contactSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    minHeight: 38,
    marginBottom: SPACING.md,
  },
  contactSearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
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
    gap: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  contactItemExisting: {
    opacity: 0.4,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
  },
  contactInfo: {
    flex: 1,
    gap: 1,
  },
  contactName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  contactPhone: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  contactExistsLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontStyle: 'italic',
  },
  contactEmptyState: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
  },
  contactEmptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
});

export default SellerCustomers;
