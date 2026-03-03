import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  Alert,
  Linking,
  TextInput,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format, isToday, isYesterday, isPast, startOfDay, isThisWeek, isThisMonth } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, selectionChanged, warningNotification } from '../../services/haptics';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha, BIZ } from '../../constants';
import { SellerOrder, OrderStatus, SellerPaymentMethod } from '../../types';

// ─── STATUS HELPERS ──────────────────────────────────────────
function statusColor(status: OrderStatus): string {
  switch (status) {
    case 'pending':   return BIZ.pending;       // amber-orange — urges action
    case 'confirmed': return BIZ.success;       // calm blue
    case 'ready':     return CALM.gold;         // gold
    case 'delivered': return '#7C8DA4';         // cool slate
    case 'completed': return CALM.textMuted;
    default:          return CALM.textMuted;
  }
}

type DeliveryFilter = OrderStatus | 'all';
type PaymentFilter = 'all' | 'paid' | 'unpaid';

const DELIVERY_TABS: { label: string; value: DeliveryFilter }[] = [
  { label: 'all', value: 'all' },
  { label: 'pending', value: 'pending' },
  { label: 'confirmed', value: 'confirmed' },
  { label: 'ready', value: 'ready' },
  { label: 'delivered', value: 'delivered' },
  { label: 'completed', value: 'completed' },
];

const PAYMENT_TABS: { label: string; value: PaymentFilter; icon: keyof typeof Feather.glyphMap }[] = [
  { label: 'all', value: 'all', icon: 'layers' },
  { label: 'paid', value: 'paid', icon: 'check-circle' },
  { label: 'unpaid', value: 'unpaid', icon: 'alert-circle' },
];

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'ready',
  ready: 'delivered',
  delivered: 'completed',
  completed: null,
};

// ─── PAYMENT METHOD OPTIONS ──────────────────────────────────
const PAYMENT_METHODS: { value: SellerPaymentMethod; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: 'cash', label: 'cash', icon: 'dollar-sign' },
  { value: 'bank_transfer', label: 'transfer', icon: 'send' },
  { value: 'ewallet', label: 'e-wallet', icon: 'smartphone' },
];

type SortOption = 'newest' | 'oldest' | 'highest' | 'delivery';
type PeriodFilter = 'all' | 'today' | 'week' | 'month';
type ViewMode = 'list' | 'grouped';

type CustomerGroup = {
  customerKey: string;
  customerName: string;
  customerPhone?: string;
  orders: SellerOrder[];
  totalAmount: number;
  unpaidAmount: number;
  latestDate: Date;
};

const SORT_OPTIONS: { label: string; value: SortOption; icon: keyof typeof Feather.glyphMap }[] = [
  { label: 'newest first', value: 'newest', icon: 'arrow-down' },
  { label: 'oldest first', value: 'oldest', icon: 'arrow-up' },
  { label: 'highest amount', value: 'highest', icon: 'dollar-sign' },
  { label: 'delivery date', value: 'delivery', icon: 'truck' },
];

const PERIOD_FILTERS: { label: string; value: PeriodFilter }[] = [
  { label: 'all time', value: 'all' },
  { label: 'today', value: 'today' },
  { label: 'this week', value: 'week' },
  { label: 'this month', value: 'month' },
];

// ─── ADVANCE STATUS ICON MAPPING ─────────────────────────────
function advanceIcon(currentStatus: OrderStatus): keyof typeof Feather.glyphMap {
  switch (currentStatus) {
    case 'pending':   return 'check';
    case 'confirmed': return 'check-circle';
    case 'ready':     return 'truck';
    case 'delivered': return 'check-square';
    default:          return 'check';
  }
}

function paymentMethodIcon(method?: SellerPaymentMethod): keyof typeof Feather.glyphMap {
  switch (method) {
    case 'bank_transfer': return 'send';
    case 'ewallet': return 'smartphone';
    default: return 'dollar-sign';
  }
}

// ─── SMART DATE LABEL ────────────────────────────────────────
function smartDateLabel(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isToday(d)) return 'today';
  if (isYesterday(d)) return 'yesterday';
  return format(d, 'dd MMM');
}

// ─── DELIVERY DATE HELPERS ────────────────────────────────────
function getDeliveryDateInfo(order: SellerOrder): {
  label: string;
  isTodayDelivery: boolean;
  isOverdue: boolean;
} | null {
  if (!order.deliveryDate) return null;

  const delivDate = order.deliveryDate instanceof Date
    ? order.deliveryDate
    : new Date(order.deliveryDate);
  const today = isToday(delivDate);
  const past = isPast(startOfDay(delivDate)) && !today;
  const isUndelivered = order.status !== 'delivered' && order.status !== 'completed';

  if (today) {
    return { label: 'deliver today', isTodayDelivery: true, isOverdue: false };
  }
  if (past && isUndelivered) {
    return { label: 'overdue', isTodayDelivery: false, isOverdue: true };
  }
  return {
    label: `deliver ${format(delivDate, 'dd MMM')}`,
    isTodayDelivery: false,
    isOverdue: false,
  };
}

// ─── ORDER LIFECYCLE STEPS ───────────────────────────────────
const LIFECYCLE_STEPS: OrderStatus[] = ['pending', 'confirmed', 'ready', 'delivered'];

const OrderLifecycleBar: React.FC<{
  currentStatus: OrderStatus;
  onChangeStatus?: (status: OrderStatus) => void;
}> = React.memo(({ currentStatus, onChangeStatus }) => {
  const currentIndex = LIFECYCLE_STEPS.indexOf(currentStatus);
  const currentColor = statusColor(currentStatus);

  return (
    <View style={styles.lifecycleContainer}>
      <View style={styles.lifecycleRow}>
        {LIFECYCLE_STEPS.map((step, i) => {
          const isCompleted = i <= currentIndex;
          const dotColor = isCompleted ? statusColor(step) : CALM.border;

          return (
            <React.Fragment key={step}>
              {i > 0 && (
                <View
                  style={[
                    styles.lifecycleLine,
                    { backgroundColor: i <= currentIndex ? statusColor(step) : CALM.border },
                  ]}
                />
              )}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  if (onChangeStatus && step !== currentStatus) {
                    mediumTap();
                    onChangeStatus(step);
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Set status to ${step}`}
              >
                <View
                  style={[
                    styles.lifecycleDot,
                    { backgroundColor: dotColor },
                    i === currentIndex && [styles.lifecycleDotCurrent, { borderColor: withAlpha(currentColor, 0.3) }],
                  ]}
                />
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>
      <View style={styles.lifecycleLabelsRow}>
        {LIFECYCLE_STEPS.map((step) => (
          <TouchableOpacity
            key={step}
            activeOpacity={0.7}
            onPress={() => {
              if (onChangeStatus && step !== currentStatus) {
                mediumTap();
                onChangeStatus(step);
              }
            }}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            accessibilityRole="button"
            accessibilityLabel={`Set status to ${step}`}
          >
            <Text
              style={[
                styles.lifecycleLabel,
                step === currentStatus && [styles.lifecycleLabelActive, { color: currentColor }],
              ]}
              numberOfLines={1}
            >
              {step}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

// Track which order IDs have already animated in — prevents flicker on FlatList cell recycle
const _animatedOrderIds = new Set<string>();

// ─── ANIMATED ORDER CARD ────────────────────────────────────
const AnimatedOrderCard: React.FC<{
  item: SellerOrder;
  index: number;
  currency: string;
  selectMode: boolean;
  isSelected: boolean;
  onPress: (item: SellerOrder) => void;
  onLongPress: (item: SellerOrder) => void;
  onToggleSelect: (id: string) => void;
  onAdvanceStatus: (order: SellerOrder) => void;
  onMarkPaid: (order: SellerOrder) => void;
}> = React.memo(({ item, index, currency, selectMode, isSelected, onPress, onLongPress, onToggleSelect, onAdvanceStatus, onMarkPaid }) => {
  const alreadySeen = _animatedOrderIds.has(item.id);
  const fadeAnim = useRef(new Animated.Value(alreadySeen ? 1 : 0)).current;

  useEffect(() => {
    if (!_animatedOrderIds.has(item.id)) {
      _animatedOrderIds.add(item.id);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        delay: Math.min(index * 40, 200),
        useNativeDriver: true,
      }).start();
    }
  }, []);

  const color = statusColor(item.status);
  const itemsText = item.items
    .map((i) => `${i.productName} \u00D7${i.quantity}`)
    .join(', ');

  const dateLabel = smartDateLabel(item.date);
  const deliveryInfo = getDeliveryDateInfo(item);
  const nextStatus = NEXT_STATUS[item.status];
  const showMarkPaid = !item.isPaid;

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity
        activeOpacity={0.7}
        style={[
          styles.orderCard,
          { borderLeftColor: color },
          selectMode && isSelected && styles.orderCardSelected,
        ]}
        onPress={() => {
          if (selectMode) {
            selectionChanged();
            onToggleSelect(item.id);
          } else {
            lightTap();
            onPress(item);
          }
        }}
        onLongPress={() => { mediumTap(); onLongPress(item); }}
        accessibilityRole="button"
        accessibilityLabel={`Order from ${item.customerName || 'unknown customer'}, ${item.status}, ${currency} ${item.totalAmount.toFixed(2)}`}
      >
        {/* Select mode checkbox */}
        {selectMode && (
          <View style={[styles.selectCheckbox, isSelected && styles.selectCheckboxActive]}>
            {isSelected && <Feather name="check" size={14} color="#fff" />}
          </View>
        )}

        {/* Header row: customer name + order code + status badge */}
        <View style={styles.orderHeader}>
          <View style={styles.customerRow}>
            <Feather
              name="user"
              size={14}
              color={CALM.textMuted}
              style={styles.customerIcon}
            />
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customerName || 'walk-in'}
            </Text>
            {!!item.orderNumber && (
              <Text style={styles.orderCodeBadge}>{item.orderNumber}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: withAlpha(color, 0.15) }]}>
            <Text style={[styles.statusText, { color }]}>{item.status}</Text>
          </View>
        </View>

        {/* Compact info row: date · phone · delivery */}
        <View style={styles.cardInfoRow}>
          <Text style={styles.cardInfoText}>{dateLabel}</Text>
          {!!item.customerPhone && (
            <>
              <Text style={styles.cardInfoDot}>{'\u00B7'}</Text>
              <Text style={styles.cardInfoText} numberOfLines={1}>{item.customerPhone}</Text>
            </>
          )}
          {!!item.customerAddress && (
            <>
              <Text style={styles.cardInfoDot}>{'\u00B7'}</Text>
              <Feather name="map-pin" size={9} color={CALM.textMuted} />
            </>
          )}
          {deliveryInfo && (
            <>
              <Text style={styles.cardInfoDot}>{'\u00B7'}</Text>
              <Feather
                name="truck"
                size={10}
                color={
                  deliveryInfo.isOverdue
                    ? BIZ.overdue
                    : deliveryInfo.isTodayDelivery
                      ? BIZ.warning
                      : CALM.textMuted
                }
              />
              <Text
                style={[
                  styles.cardInfoText,
                  deliveryInfo.isTodayDelivery && styles.deliveryToday,
                  deliveryInfo.isOverdue && styles.deliveryOverdue,
                ]}
              >
                {deliveryInfo.label}
              </Text>
            </>
          )}
        </View>

        {/* Items row */}
        <Text style={styles.orderItems} numberOfLines={2}>
          {itemsText}
        </Text>

        {/* Footer row: amount + paid/unpaid indicator */}
        <View style={styles.orderFooter}>
          <Text style={styles.orderTotal}>
            {currency} {item.totalAmount.toFixed(2)}
          </Text>
          {item.isPaid ? (
            <View style={styles.paidBadge}>
              <Feather name={paymentMethodIcon(item.paymentMethod)} size={10} color={BIZ.success} />
              <Text style={styles.paidBadgeText}>paid</Text>
            </View>
          ) : (
            <View style={styles.unpaidBadge}>
              <Text style={styles.unpaidBadgeText}>unpaid</Text>
            </View>
          )}
        </View>

        {/* Quick-advance action row */}
        {!selectMode && (nextStatus || showMarkPaid) && (
          <View style={styles.quickActionRow}>
            {nextStatus && (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.quickActionPill, { backgroundColor: withAlpha(statusColor(nextStatus), 0.07) }]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  mediumTap();
                  onAdvanceStatus(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Mark as ${nextStatus}`}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Feather
                  name={advanceIcon(item.status)}
                  size={13}
                  color={statusColor(nextStatus)}
                />
                <Text style={[styles.quickActionText, { color: statusColor(nextStatus) }]}>
                  mark {nextStatus}
                </Text>
              </TouchableOpacity>
            )}
            {showMarkPaid && (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.quickActionPill, styles.quickActionPillPaid]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  mediumTap();
                  onMarkPaid(item);
                }}
                accessibilityRole="button"
                accessibilityLabel="Mark as paid"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Feather
                  name="dollar-sign"
                  size={13}
                  color={BIZ.success}
                />
                <Text style={[styles.quickActionText, { color: BIZ.success }]}>
                  mark paid
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── GROUPED CUSTOMER CARD ──────────────────────────────────
const GroupedCustomerCard: React.FC<{
  group: CustomerGroup;
  index: number;
  currency: string;
  selectMode: boolean;
  selectedIds: Set<string>;
  onPress: (item: SellerOrder) => void;
  onLongPress: (item: SellerOrder) => void;
  onToggleSelect: (id: string) => void;
  onAdvanceStatus: (order: SellerOrder) => void;
  onMarkPaid: (order: SellerOrder) => void;
}> = React.memo(({ group, index, currency, selectMode, selectedIds, onPress, onLongPress, onToggleSelect, onAdvanceStatus, onMarkPaid }) => {
  const alreadySeen = _animatedOrderIds.has(`group_${group.customerKey}`);
  const fadeAnim = useRef(new Animated.Value(alreadySeen ? 1 : 0)).current;

  useEffect(() => {
    const key = `group_${group.customerKey}`;
    if (!_animatedOrderIds.has(key)) {
      _animatedOrderIds.add(key);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        delay: Math.min(index * 40, 200),
        useNativeDriver: true,
      }).start();
    }
  }, []);

  // Single order → render as normal card
  if (group.orders.length === 1) {
    return (
      <AnimatedOrderCard
        item={group.orders[0]}
        index={index}
        currency={currency}
        selectMode={selectMode}
        isSelected={selectedIds.has(group.orders[0].id)}
        onPress={onPress}
        onLongPress={onLongPress}
        onToggleSelect={onToggleSelect}
        onAdvanceStatus={onAdvanceStatus}
        onMarkPaid={onMarkPaid}
      />
    );
  }

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={styles.groupCard}>
        {/* Group header */}
        <View style={styles.groupHeader}>
          <View style={styles.customerRow}>
            <Feather name="user" size={14} color={CALM.textMuted} style={styles.customerIcon} />
            <Text style={styles.customerName} numberOfLines={1}>
              {group.customerName}
            </Text>
          </View>
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>{group.orders.length} orders</Text>
          </View>
        </View>

        {/* Sub-order rows */}
        {group.orders.map((order, i) => {
          const color = statusColor(order.status);
          const dateLabel = smartDateLabel(order.date);
          const timeLabel = format(
            order.date instanceof Date ? order.date : new Date(order.date),
            'h:mm a'
          );
          const itemsShort = order.items
            .map((it) => `${it.productName} \u00D7${it.quantity}`)
            .join(', ');
          const nextStatus = NEXT_STATUS[order.status];
          const showMarkPaid = !order.isPaid;
          const isSelected = selectedIds.has(order.id);

          return (
            <TouchableOpacity
              key={order.id}
              activeOpacity={0.7}
              style={[
                styles.subOrderRow,
                i < group.orders.length - 1 && styles.subOrderRowBorder,
                selectMode && isSelected && styles.subOrderSelected,
              ]}
              onPress={() => {
                if (selectMode) {
                  selectionChanged();
                  onToggleSelect(order.id);
                } else {
                  lightTap();
                  onPress(order);
                }
              }}
              onLongPress={() => { mediumTap(); onLongPress(order); }}
            >
              {selectMode && (
                <View style={[styles.selectCheckboxSmall, isSelected && styles.selectCheckboxActive]}>
                  {isSelected && <Feather name="check" size={10} color="#fff" />}
                </View>
              )}
              <View style={[styles.subOrderDot, { backgroundColor: color }]} />
              <View style={styles.subOrderInfo}>
                <View style={styles.subOrderTopRow}>
                  <Text style={styles.subOrderDate}>
                    {order.orderNumber ? `${order.orderNumber}  ` : ''}{dateLabel}, {timeLabel}
                  </Text>
                  <View style={[styles.statusBadgeSmall, { backgroundColor: withAlpha(color, 0.15) }]}>
                    <Text style={[styles.statusTextSmall, { color }]}>{order.status}</Text>
                  </View>
                </View>
                <Text style={styles.subOrderItems} numberOfLines={1}>{itemsShort}</Text>
                <View style={styles.subOrderBottomRow}>
                  <Text style={styles.subOrderAmount}>{currency} {order.totalAmount.toFixed(2)}</Text>
                  {order.isPaid ? (
                    <View style={styles.paidBadgeSmall}>
                      <Feather name={paymentMethodIcon(order.paymentMethod)} size={8} color={BIZ.success} />
                      <Text style={styles.paidBadgeSmallText}>paid</Text>
                    </View>
                  ) : (
                    <View style={styles.unpaidBadgeSmall}>
                      <Text style={styles.unpaidBadgeSmallText}>unpaid</Text>
                    </View>
                  )}
                </View>
              </View>
              {!selectMode && (nextStatus || showMarkPaid) && (
                <View style={styles.subOrderActions}>
                  {nextStatus && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subOrderActionBtn}
                      onPress={(e) => { e.stopPropagation?.(); mediumTap(); onAdvanceStatus(order); }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Feather name={advanceIcon(order.status)} size={14} color={statusColor(nextStatus)} />
                    </TouchableOpacity>
                  )}
                  {showMarkPaid && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subOrderActionBtn}
                      onPress={(e) => { e.stopPropagation?.(); mediumTap(); onMarkPaid(order); }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Feather name="dollar-sign" size={14} color={BIZ.success} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Group footer */}
        <View style={styles.groupFooter}>
          <Text style={styles.groupTotalLabel}>combined</Text>
          <Text style={styles.groupTotal}>{currency} {group.totalAmount.toFixed(0)}</Text>
          {group.unpaidAmount > 0 && (
            <Text style={styles.groupUnpaid}>{' \u00B7 '}{currency} {group.unpaidAmount.toFixed(0)} unpaid</Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
});

// ─── MAIN COMPONENT ─────────────────────────────────────────
const OrderList: React.FC = () => {
  const { orders, updateOrderStatus, updateOrder, markOrderPaid, markOrdersPaid, deleteOrder } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Accept initialFilter and searchQuery from navigation
  const initialFilter = (route.params as { initialFilter?: string; searchQuery?: string } | undefined)?.initialFilter;
  const initialSearch = (route.params as { searchQuery?: string } | undefined)?.searchQuery;

  // Two independent filter dimensions: delivery stage + payment state
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>(
    initialFilter && ['pending', 'confirmed', 'ready', 'delivered', 'completed'].includes(initialFilter)
      ? (initialFilter as DeliveryFilter) : 'all'
  );
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>(
    initialFilter === 'paid' ? 'paid' : initialFilter === 'unpaid' ? 'unpaid' : 'all'
  );
  const [overdueOnly, setOverdueOnly] = useState(initialFilter === 'overdue');

  // Update filter/search when navigating back with new params
  useEffect(() => {
    if (initialFilter) {
      if (initialFilter === 'overdue') {
        setOverdueOnly(true);
        setDeliveryFilter('all');
        setPaymentFilter('all');
      } else if (initialFilter === 'paid' || initialFilter === 'unpaid') {
        setPaymentFilter(initialFilter);
        setDeliveryFilter('all');
        setOverdueOnly(false);
      } else if (['pending', 'confirmed', 'ready', 'delivered', 'completed'].includes(initialFilter)) {
        setDeliveryFilter(initialFilter as DeliveryFilter);
        setOverdueOnly(false);
      }
      navigation.setParams({ initialFilter: undefined });
    }
  }, [initialFilter]);

  const [showTabHint, setShowTabHint] = useState(true);
  const [searchInput, setSearchInput] = useState(initialSearch || '');
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');

  // Debounce search to avoid 2500+ string ops per keystroke on large order lists
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (initialSearch) {
      setSearchInput(initialSearch);
      navigation.setParams({ searchQuery: undefined });
    }
  }, [initialSearch]);
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);
  const [showRawWhatsApp, setShowRawWhatsApp] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');

  // Payment picker state
  const [pendingPayOrder, setPendingPayOrder] = useState<SellerOrder | null>(null);
  const [bulkPayIds, setBulkPayIds] = useState<string[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SellerPaymentMethod | null>(null);

  // Navigation app picker
  const [navAddress, setNavAddress] = useState<string | null>(null);

  // Payment method sub-filter (when viewing 'paid' tab)
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<SellerPaymentMethod | 'all'>('all');

  // Bulk select mode — selectMode derived from selectedIds.size to avoid sync bugs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectMode = selectedIds.size > 0;

  // Edit mode in modal
  const [isEditing, setIsEditing] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState('');
  const [editError, setEditError] = useState('');

  // Count per status for tab badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (o.isPaid) {
        counts['paid'] = (counts['paid'] || 0) + 1;
        const method = o.paymentMethod || 'cash';
        counts[`paid_${method}`] = (counts[`paid_${method}`] || 0) + 1;
      } else {
        counts['unpaid'] = (counts['unpaid'] || 0) + 1;
      }
    }
    return counts;
  }, [orders]);

  // Sort orders
  const sortedOrders = useMemo(() => {
    const sorted = [...orders];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => {
          const dateA = a.date instanceof Date ? a.date : new Date(a.date);
          const dateB = b.date instanceof Date ? b.date : new Date(b.date);
          return dateB.getTime() - dateA.getTime();
        });
      case 'oldest':
        return sorted.sort((a, b) => {
          const dateA = a.date instanceof Date ? a.date : new Date(a.date);
          const dateB = b.date instanceof Date ? b.date : new Date(b.date);
          return dateA.getTime() - dateB.getTime();
        });
      case 'highest':
        return sorted.sort((a, b) => b.totalAmount - a.totalAmount);
      case 'delivery':
        return sorted.sort((a, b) => {
          if (!a.deliveryDate && !b.deliveryDate) return 0;
          if (!a.deliveryDate) return 1;
          if (!b.deliveryDate) return -1;
          const dA = a.deliveryDate instanceof Date ? a.deliveryDate : new Date(a.deliveryDate);
          const dB = b.deliveryDate instanceof Date ? b.deliveryDate : new Date(b.deliveryDate);
          return dA.getTime() - dB.getTime();
        });
      default:
        return sorted;
    }
  }, [orders, sortBy]);

  const filteredOrders = useMemo(() => {
    let result = sortedOrders;

    // Delivery status filter
    if (deliveryFilter !== 'all') {
      result = result.filter((o) => o.status === deliveryFilter);
    }

    // Overdue filter — delivery date is past and not yet delivered/completed
    if (overdueOnly) {
      result = result.filter((o) => {
        if (!o.deliveryDate) return false;
        const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate as string);
        return isPast(startOfDay(d)) && !isToday(d) && o.status !== 'delivered' && o.status !== 'completed';
      });
    }

    // Payment state filter (independent of delivery)
    if (paymentFilter === 'paid') {
      result = result.filter((o) => o.isPaid);
      if (paymentMethodFilter !== 'all') {
        result = result.filter((o) => (o.paymentMethod || 'cash') === paymentMethodFilter);
      }
    } else if (paymentFilter === 'unpaid') {
      result = result.filter((o) => !o.isPaid);
    }

    // Period filter — prefers delivery date, falls back to order date
    if (periodFilter !== 'all') {
      result = result.filter((o) => {
        const raw = o.deliveryDate || o.date;
        const d = raw instanceof Date ? raw : new Date(raw as string);
        switch (periodFilter) {
          case 'today': return isToday(d);
          case 'week': return isThisWeek(d, { weekStartsOn: 1 });
          case 'month': return isThisMonth(d);
          default: return true;
        }
      });
    }

    // Enhanced search: customer name, phone, address, product names
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((o) =>
        (o.orderNumber || '').toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').toLowerCase().includes(q) ||
        (o.customerAddress || '').toLowerCase().includes(q) ||
        o.items.some((i) => i.productName.toLowerCase().includes(q))
      );
    }

    return result;
  }, [sortedOrders, deliveryFilter, paymentFilter, overdueOnly, searchQuery, periodFilter, paymentMethodFilter]);

  // Group orders by customer name
  const groupedData = useMemo((): CustomerGroup[] => {
    if (viewMode !== 'grouped') return [];

    const map = new Map<string, CustomerGroup>();

    for (const order of filteredOrders) {
      const key = (order.customerName || 'walk-in').toLowerCase().trim();
      const existing = map.get(key);
      const orderDate = order.date instanceof Date ? order.date : new Date(order.date);

      if (existing) {
        existing.orders.push(order);
        existing.totalAmount += order.totalAmount;
        if (!order.isPaid) existing.unpaidAmount += order.totalAmount;
        if (orderDate > existing.latestDate) existing.latestDate = orderDate;
        if (order.customerPhone && !existing.customerPhone) existing.customerPhone = order.customerPhone;
      } else {
        map.set(key, {
          customerKey: key,
          customerName: order.customerName || 'walk-in',
          customerPhone: order.customerPhone,
          orders: [order],
          totalAmount: order.totalAmount,
          unpaidAmount: order.isPaid ? 0 : order.totalAmount,
          latestDate: orderDate,
        });
      }
    }

    const groups = Array.from(map.values());
    switch (sortBy) {
      case 'newest':
        groups.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
        break;
      case 'oldest':
        groups.sort((a, b) => a.latestDate.getTime() - b.latestDate.getTime());
        break;
      case 'highest':
        groups.sort((a, b) => b.totalAmount - a.totalAmount);
        break;
      default:
        groups.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
    }

    // Sort orders within each group (newest first)
    for (const g of groups) {
      g.orders.sort((a, b) => {
        const dA = a.date instanceof Date ? a.date : new Date(a.date);
        const dB = b.date instanceof Date ? b.date : new Date(b.date);
        return dB.getTime() - dA.getTime();
      });
    }

    return groups;
  }, [filteredOrders, viewMode, sortBy]);

  // Whether any filters are active
  const hasActiveFilters = deliveryFilter !== 'all' || paymentFilter !== 'all' || periodFilter !== 'all' || overdueOnly || searchInput.trim().length > 0 || paymentMethodFilter !== 'all';

  // Unpaid orders for select-all
  const unpaidFilteredIds = useMemo(
    () => filteredOrders.filter((o) => !o.isPaid).map((o) => o.id),
    [filteredOrders]
  );

  // Customer context for modal
  const customerContext = useMemo(() => {
    if (!selectedOrder?.customerName) return null;
    const name = selectedOrder.customerName.toLowerCase();
    const customerOrders = orders.filter(
      (o) => (o.customerName || '').toLowerCase() === name
    );
    const totalSpent = customerOrders
      .filter((o) => o.isPaid)
      .reduce((s, o) => s + o.totalAmount, 0);
    return {
      orderCount: customerOrders.length,
      totalSpent,
    };
  }, [selectedOrder, orders]);

  const handleChangeStatus = useCallback(
    (order: SellerOrder, newStatus: OrderStatus) => {
      if (newStatus === order.status) return;
      const isSettled = order.isPaid && (order.status === 'delivered' || order.status === 'completed');
      const doChange = () => {
        updateOrderStatus(order.id, newStatus);
        setSelectedOrder({ ...order, status: newStatus, updatedAt: new Date() });
        showToast(`status changed to ${newStatus}.`, 'info');
      };
      if (isSettled) {
        Alert.alert(
          'this order is already paid & delivered',
          'changing the status may cause confusion in your records. are you sure?',
          [
            { text: 'cancel', style: 'cancel' },
            { text: 'change anyway', style: 'destructive', onPress: doChange },
          ]
        );
      } else {
        doChange();
      }
    },
    [updateOrderStatus, showToast]
  );

  const handleAdvanceStatus = useCallback(
    (order: SellerOrder) => {
      const next = NEXT_STATUS[order.status];
      if (!next) return;
      mediumTap();
      updateOrderStatus(order.id, next);
      showToast(`marked as ${next}.`, 'info');
      setSelectedOrder(null);
      setShowRawWhatsApp(false);
      setIsEditing(false);
    },
    [updateOrderStatus, showToast]
  );

  // Quick-advance from card (no modal close needed)
  const handleQuickAdvance = useCallback(
    (order: SellerOrder) => {
      const next = NEXT_STATUS[order.status];
      if (!next) return;
      updateOrderStatus(order.id, next);
      showToast(`marked as ${next}.`, 'info');
    },
    [updateOrderStatus, showToast]
  );

  const handleQuickMarkPaid = useCallback(
    (order: SellerOrder) => {
      lightTap();
      setPendingPayOrder(order);
      setSelectedPaymentMethod(null);
    },
    []
  );

  const handleConfirmPayment = useCallback(() => {
    if (!selectedPaymentMethod) return;
    mediumTap();
    if (pendingPayOrder) {
      markOrderPaid(pendingPayOrder.id, selectedPaymentMethod);
      showToast('marked as paid.', 'info');
    } else if (bulkPayIds.length > 0) {
      markOrdersPaid(bulkPayIds, selectedPaymentMethod);
      showToast(`${bulkPayIds.length} order${bulkPayIds.length > 1 ? 's' : ''} marked paid.`, 'info');
      setSelectedIds(new Set());
    }
    setPendingPayOrder(null);
    setBulkPayIds([]);
    setSelectedPaymentMethod(null);
  }, [pendingPayOrder, bulkPayIds, selectedPaymentMethod, markOrderPaid, markOrdersPaid, showToast]);

  const handleCloseModal = useCallback(() => {
    setSelectedOrder(null);
    setShowRawWhatsApp(false);
    setIsEditing(false);
  }, []);

  // Duplicate / reorder — carry items, address, and note so seller doesn't retype
  const handleDuplicateOrder = useCallback(
    (order: SellerOrder) => {
      setSelectedOrder(null);
      setShowRawWhatsApp(false);
      setIsEditing(false);
      navigation.navigate('SellerNewOrder', {
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        prefillItems: order.items,
      });
    },
    [navigation]
  );

  // Delete order
  const handleDeleteOrder = useCallback(
    (order: SellerOrder) => {
      const msg = order.transferredToPersonal
        ? 'this order was already transferred to personal. deleting it will leave a phantom income in your personal wallet.\n\ndelete anyway?'
        : 'delete this order?';
      Alert.alert(
        '',
        msg,
        [
          { text: 'cancel', style: 'cancel' },
          {
            text: 'delete',
            style: 'destructive',
            onPress: () => {
              deleteOrder(order.id);
              setSelectedOrder(null);
              setShowRawWhatsApp(false);
              setIsEditing(false);
              showToast('order deleted.', 'info');
            },
          },
        ]
      );
    },
    [deleteOrder, showToast]
  );

  // Send payment reminder
  const handleSendReminder = useCallback(
    (order: SellerOrder) => {
      const orderDate = format(
        order.date instanceof Date ? order.date : new Date(order.date),
        'dd MMM yyyy'
      );
      const itemsList = order.items
        .map((i) => `- ${i.productName} x${i.quantity}`)
        .join('\n');
      const reminderText = `Hi ${order.customerName || 'customer'},\n\nPesanan anda${order.orderNumber ? ` (${order.orderNumber})` : ''} pada ${orderDate}:\n${itemsList}\n\nJumlah: ${currency} ${order.totalAmount.toFixed(2)}\n\nBoleh buat bayaran bila senang ye. Terima kasih!`;

      Clipboard.setStringAsync(reminderText).then(() => {
        lightTap();
        showToast('reminder copied.', 'info');
      });
    },
    [currency, showToast]
  );

  // Copy receipt
  const handleCopyReceipt = useCallback(
    (order: SellerOrder) => {
      const orderDate = format(
        order.date instanceof Date ? order.date : new Date(order.date),
        'dd MMM yyyy'
      );
      const itemLines = order.items
        .map((i) => `${i.productName} x${i.quantity} ${i.unit} — ${currency} ${(i.unitPrice * i.quantity).toFixed(2)}`)
        .join('\n');
      const receipt = `RESIT PESANAN${order.orderNumber ? ` ${order.orderNumber}` : ''}\nPelanggan: ${order.customerName || '-'}\nTarikh: ${orderDate}\n${'─'.repeat(20)}\n${itemLines}\n${'─'.repeat(20)}\nJUMLAH: ${currency} ${order.totalAmount.toFixed(2)}\nStatus: ${order.isPaid ? 'dibayar' : 'belum bayar'}`;

      Clipboard.setStringAsync(receipt).then(() => {
        lightTap();
        showToast('receipt copied.', 'info');
      });
    },
    [currency, showToast]
  );

  // Edit mode handlers
  const handleStartEdit = useCallback((order: SellerOrder) => {
    const isSettled = order.isPaid && (order.status === 'delivered' || order.status === 'completed');
    const doEdit = () => {
      setIsEditing(true);
      setEditError('');
      setEditNote(order.note || '');
      setEditPhone(order.customerPhone || '');
      setEditAddress(order.customerAddress || '');
      setEditDeliveryDate(
        order.deliveryDate
          ? format(
              order.deliveryDate instanceof Date ? order.deliveryDate : new Date(order.deliveryDate),
              'dd/MM/yyyy'
            )
          : ''
      );
    };
    if (isSettled) {
      Alert.alert(
        'this order is already paid & delivered',
        'editing a settled order may affect your records. proceed with caution.',
        [
          { text: 'cancel', style: 'cancel' },
          { text: 'edit anyway', style: 'destructive', onPress: doEdit },
        ]
      );
    } else {
      doEdit();
    }
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!selectedOrder) return;

    const updates: Partial<Pick<SellerOrder, 'note' | 'deliveryDate' | 'customerPhone' | 'customerAddress'>> = {};
    if (editNote !== (selectedOrder.note || '')) updates.note = editNote || undefined;
    if (editPhone !== (selectedOrder.customerPhone || '')) updates.customerPhone = editPhone || undefined;
    if (editAddress !== (selectedOrder.customerAddress || '')) updates.customerAddress = editAddress || undefined;

    // Parse delivery date (dd/MM/yyyy)
    if (editDeliveryDate.trim()) {
      const parts = editDeliveryDate.trim().split('/');
      if (parts.length === 3) {
        const parsed = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
          updates.deliveryDate = parsed;
        } else {
          setEditError('invalid date — use dd/mm/yyyy');
          return;
        }
      } else {
        setEditError('invalid date — use dd/mm/yyyy');
        return;
      }
    } else {
      updates.deliveryDate = undefined;
    }
    setEditError('');

    if (Object.keys(updates).length > 0) {
      updateOrder(selectedOrder.id, updates);
      setSelectedOrder({ ...selectedOrder, ...updates, updatedAt: new Date() });
      mediumTap();
      showToast('order updated.', 'info');
    }
    setIsEditing(false);
  }, [selectedOrder, editNote, editPhone, editAddress, editDeliveryDate, updateOrder, showToast]);

  // Undo paid (with warning)
  const handleUndoPaid = useCallback((order: SellerOrder) => {
    Alert.alert(
      'undo payment?',
      'this will mark the order as unpaid. this action may affect your sales records.',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'mark unpaid',
          style: 'destructive',
          onPress: () => {
            updateOrder(order.id, { isPaid: false, paymentMethod: undefined, paidAt: undefined });
            setSelectedOrder({ ...order, isPaid: false, paymentMethod: undefined, paidAt: undefined, updatedAt: new Date() });
            warningNotification();
            showToast('payment undone.', 'info');
          },
        },
      ]
    );
  }, [updateOrder, showToast]);

  // Call
  const handleCall = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  // WhatsApp
  const handleWhatsApp = useCallback((phone: string) => {
    let digits = phone.replace(/[^0-9]/g, '');
    // Malaysian numbers: convert leading 0 to country code 60
    if (digits.startsWith('0')) digits = '60' + digits.slice(1);
    Linking.openURL(`https://wa.me/${digits}`);
  }, []);

  // Navigation app picker — close detail modal first to avoid stacking modals
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (navTimerRef.current) clearTimeout(navTimerRef.current); }, []);

  const handleOpenNavPicker = useCallback((address: string) => {
    lightTap();
    setSelectedOrder(null);
    setShowRawWhatsApp(false);
    setIsEditing(false);
    // Small delay to let the detail modal close before opening nav picker
    navTimerRef.current = setTimeout(() => setNavAddress(address), 200);
  }, []);

  const handleNavChoice = useCallback((app: 'google' | 'waze' | 'apple') => {
    if (!navAddress) return;
    const encoded = encodeURIComponent(navAddress);
    setNavAddress(null);
    switch (app) {
      case 'google':
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
        break;
      case 'waze':
        Linking.openURL(`https://waze.com/ul?q=${encoded}&navigate=yes`);
        break;
      case 'apple':
        Linking.openURL(`maps:0,0?q=${encoded}`);
        break;
    }
  }, [navAddress]);

  // Bulk select handlers
  const handleLongPress = useCallback((order: SellerOrder) => {
    if (selectedIds.size === 0 && !order.isPaid) {
      setSelectedIds(new Set([order.id]));
    }
  }, [selectedIds.size]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    selectionChanged();
    setSelectedIds(new Set(unpaidFilteredIds));
  }, [unpaidFilteredIds]);

  const handleBulkMarkPaid = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    lightTap();
    setBulkPayIds(ids);
    setPendingPayOrder(null);
    setSelectedPaymentMethod(null);
  }, [selectedIds]);

  const handleCancelSelect = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleClearFilters = useCallback(() => {
    setDeliveryFilter('all');
    setPaymentFilter('all');
    setPeriodFilter('all');
    setPaymentMethodFilter('all');
    setOverdueOnly(false);
    setSearchInput('');
    lightTap();
  }, []);

  // Stable tab scroll handler — avoids inline function recreated 60x/sec
  const showTabHintRef = useRef(true);
  const handleTabScroll = useCallback((e: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const atEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 8;
    if (atEnd && showTabHintRef.current) {
      showTabHintRef.current = false;
      setShowTabHint(false);
    } else if (!atEnd && !showTabHintRef.current) {
      showTabHintRef.current = true;
      setShowTabHint(true);
    }
  }, []);

  const renderOrder = useCallback(
    ({ item, index }: { item: SellerOrder; index: number }) => (
      <AnimatedOrderCard
        item={item}
        index={index}
        currency={currency}
        selectMode={selectMode}
        isSelected={selectedIds.has(item.id)}
        onPress={setSelectedOrder}
        onLongPress={handleLongPress}
        onToggleSelect={handleToggleSelect}
        onAdvanceStatus={handleQuickAdvance}
        onMarkPaid={handleQuickMarkPaid}
      />
    ),
    [currency, selectMode, selectedIds, handleQuickAdvance, handleQuickMarkPaid, handleLongPress, handleToggleSelect]
  );

  const renderGroup = useCallback(
    ({ item, index }: { item: CustomerGroup; index: number }) => (
      <GroupedCustomerCard
        group={item}
        index={index}
        currency={currency}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onPress={setSelectedOrder}
        onLongPress={handleLongPress}
        onToggleSelect={handleToggleSelect}
        onAdvanceStatus={handleQuickAdvance}
        onMarkPaid={handleQuickMarkPaid}
      />
    ),
    [currency, selectMode, selectedIds, handleQuickAdvance, handleQuickMarkPaid, handleLongPress, handleToggleSelect]
  );

  // Stable keyExtractor — avoids creating new function reference every render
  const listKeyExtractor = useCallback(
    (item: any) => viewMode === 'grouped' ? item.customerKey : item.id,
    [viewMode]
  );

  // Memoized empty state — avoids creating new JSX tree every render
  const listEmptyComponent = useMemo(() => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Feather name="inbox" size={32} color={CALM.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>
        {hasActiveFilters ? 'no matching orders' : 'no orders yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {hasActiveFilters
          ? 'try adjusting your filters or search.'
          : 'create your first order to get started.'}
      </Text>
      {!hasActiveFilters && (
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.emptyCta}
          onPress={() => navigation.navigate('SellerNewOrder')}
          accessibilityRole="button"
          accessibilityLabel="Create a new order"
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.emptyCtaText}>new order</Text>
        </TouchableOpacity>
      )}
      {hasActiveFilters && (
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.emptyCtaSecondary}
          onPress={handleClearFilters}
          accessibilityRole="button"
          accessibilityLabel="Clear filters"
        >
          <Text style={styles.emptyCtaSecondaryText}>clear filters</Text>
        </TouchableOpacity>
      )}
    </View>
  ), [hasActiveFilters, navigation, handleClearFilters]);

  return (
    <View style={styles.container}>
      {/* ─── Delivery status tabs ─── */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
          onScroll={handleTabScroll}
          scrollEventThrottle={16}
        >
          {DELIVERY_TABS.map((tab) => {
            const isActive = deliveryFilter === tab.value;
            const count = statusCounts[tab.value] || 0;
            return (
              <TouchableOpacity
                key={tab.value}
                activeOpacity={0.7}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => { selectionChanged(); setDeliveryFilter(tab.value); setOverdueOnly(false); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${tab.label} tab, ${count} orders`}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
                {count > 0 && (
                  <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                    {count}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {showTabHint && (
          <View style={styles.tabScrollHint} pointerEvents="none">
            <Feather name="chevron-right" size={14} color={CALM.textMuted} />
          </View>
        )}
      </View>

      {/* ─── Search bar + sort ─── */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={CALM.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="search name, phone, address, product"
            placeholderTextColor={CALM.textMuted}
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
            accessibilityLabel="Search orders"
            accessibilityRole="search"
          />
          {searchInput.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchInput('')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color={CALM.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.viewToggle, viewMode === 'grouped' && styles.viewToggleActive]}
          activeOpacity={0.7}
          onPress={() => {
            selectionChanged();
            setViewMode((v) => v === 'list' ? 'grouped' : 'list');
          }}
          accessibilityRole="button"
          accessibilityLabel={viewMode === 'grouped' ? 'Switch to list view' : 'Switch to grouped view'}
        >
          <Feather
            name={viewMode === 'grouped' ? 'layers' : 'list'}
            size={18}
            color={viewMode === 'grouped' ? CALM.bronze : CALM.textMuted}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortButton, sortBy !== 'newest' && styles.sortButtonActive]}
          activeOpacity={0.7}
          onPress={() => { lightTap(); setShowSortMenu(true); }}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${sortBy}`}
        >
          <Feather name="sliders" size={18} color={sortBy !== 'newest' ? '#fff' : CALM.bronze} />
        </TouchableOpacity>
      </View>

      {/* ─── Payment state + Period filter (combined row) ─── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {PAYMENT_TABS.map((tab) => {
          const isActive = paymentFilter === tab.value;
          const count = tab.value === 'all' ? undefined : (statusCounts[tab.value] || 0);
          return (
            <TouchableOpacity
              key={tab.value}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              activeOpacity={0.7}
              onPress={() => { selectionChanged(); setPaymentFilter(tab.value); setOverdueOnly(false); if (tab.value !== 'paid') setPaymentMethodFilter('all'); }}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Feather name={tab.icon} size={11} color={isActive ? CALM.bronze : CALM.textMuted} />
              <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {tab.label}
              </Text>
              {count !== undefined && count > 0 && (
                <Text style={[styles.filterPillCount, isActive && styles.filterPillCountActive]}>
                  {count}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
        <View style={styles.filterDivider} />
        {PERIOD_FILTERS.map((pf) => {
          const isActive = periodFilter === pf.value;
          return (
            <TouchableOpacity
              key={pf.value}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              activeOpacity={0.7}
              onPress={() => { selectionChanged(); setPeriodFilter(pf.value); }}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {pf.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ─── Payment method sub-filter (visible when 'paid' filter active) ─── */}
      {paymentFilter === 'paid' && (
        <View style={styles.payMethodRow}>
          <TouchableOpacity
            style={[styles.payMethodPill, paymentMethodFilter === 'all' && styles.payMethodPillActive]}
            activeOpacity={0.7}
            onPress={() => { selectionChanged(); setPaymentMethodFilter('all'); }}
          >
            <Text style={[styles.payMethodPillText, paymentMethodFilter === 'all' && styles.payMethodPillTextActive]}>
              all
            </Text>
            {(statusCounts['paid'] || 0) > 0 && (
              <Text style={[styles.payMethodCount, paymentMethodFilter === 'all' && styles.payMethodCountActive]}>
                {statusCounts['paid']}
              </Text>
            )}
          </TouchableOpacity>
          {PAYMENT_METHODS.map((pm) => {
            const isActive = paymentMethodFilter === pm.value;
            const count = statusCounts[`paid_${pm.value}`] || 0;
            return (
              <TouchableOpacity
                key={pm.value}
                style={[styles.payMethodPill, isActive && styles.payMethodPillActive]}
                activeOpacity={0.7}
                onPress={() => { selectionChanged(); setPaymentMethodFilter(pm.value); }}
              >
                <Feather name={pm.icon} size={12} color={isActive ? CALM.bronze : CALM.textMuted} />
                <Text style={[styles.payMethodPillText, isActive && styles.payMethodPillTextActive]}>
                  {pm.label}
                </Text>
                {count > 0 && (
                  <Text style={[styles.payMethodCount, isActive && styles.payMethodCountActive]}>
                    {count}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ─── Result count + clear filters ─── */}
      {hasActiveFilters && (
        <View style={styles.resultRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <Text style={styles.resultText}>
              {filteredOrders.length} of {orders.length} order{orders.length !== 1 ? 's' : ''}
            </Text>
            {overdueOnly && (
              <View style={{ backgroundColor: withAlpha(BIZ.overdue, 0.12), borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 }}>
                <Text style={{ fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold as any, color: BIZ.overdue }}>overdue</Text>
              </View>
            )}
          </View>
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

      {/* ─── Order list ─── */}
      <FlatList
        data={(viewMode === 'grouped' ? groupedData : filteredOrders) as any[]}
        renderItem={viewMode === 'grouped' ? renderGroup as any : renderOrder}
        keyExtractor={listKeyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={listEmptyComponent}
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={8}
        initialNumToRender={10}
      />

      {/* ─── Bulk select floating bar ─── */}
      {selectMode && (
        <View style={styles.bulkBar}>
          <TouchableOpacity
            style={styles.bulkCancelButton}
            activeOpacity={0.7}
            onPress={handleCancelSelect}
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
          >
            <Feather name="x" size={16} color={CALM.textMuted} />
          </TouchableOpacity>
          <Text style={styles.bulkCountText}>{selectedIds.size} selected</Text>
          {unpaidFilteredIds.length > 0 && selectedIds.size < unpaidFilteredIds.length && (
            <TouchableOpacity
              style={styles.bulkSelectAllButton}
              activeOpacity={0.7}
              onPress={handleSelectAll}
              accessibilityRole="button"
              accessibilityLabel="Select all unpaid"
            >
              <Text style={styles.bulkSelectAllText}>select all</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.bulkPayButton,
              selectedIds.size === 0 && styles.bulkPayButtonDisabled,
            ]}
            activeOpacity={0.7}
            onPress={handleBulkMarkPaid}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${selectedIds.size} orders as paid`}
          >
            <Feather name="dollar-sign" size={16} color="#fff" />
            <Text style={styles.bulkPayText}>mark paid</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Sort menu modal (lazy-mounted) ─── */}
      {showSortMenu && <Modal
        visible
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
      </Modal>}

      {/* ─── Payment method picker modal (lazy-mounted) ─── */}
      {(!!pendingPayOrder || bulkPayIds.length > 0) && <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => { setPendingPayOrder(null); setBulkPayIds([]); setSelectedPaymentMethod(null); }}
      >
        <TouchableOpacity
          style={styles.sortOverlay}
          activeOpacity={1}
          onPress={() => { setPendingPayOrder(null); setBulkPayIds([]); setSelectedPaymentMethod(null); }}
        >
          <View style={styles.paymentSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.paymentSheetTitle}>
              {bulkPayIds.length > 0
                ? `mark ${bulkPayIds.length} order${bulkPayIds.length > 1 ? 's' : ''} paid`
                : 'mark as paid'}
            </Text>

            {/* Order context — shows who/what is being paid */}
            {pendingPayOrder && (
              <View style={styles.paymentContext}>
                <View style={styles.paymentContextRow}>
                  <Text style={styles.paymentContextName} numberOfLines={1}>
                    {pendingPayOrder.customerName || 'walk-in'}
                  </Text>
                  <Text style={styles.paymentContextAmount}>
                    {currency} {pendingPayOrder.totalAmount.toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.paymentContextItems} numberOfLines={1}>
                  {pendingPayOrder.items.map((i) => `${i.productName} \u00D7${i.quantity}`).join(', ')}
                </Text>
              </View>
            )}
            {bulkPayIds.length > 0 && (
              <View style={styles.paymentContext}>
                <Text style={styles.paymentContextAmount}>
                  {currency} {orders.filter((o) => bulkPayIds.includes(o.id)).reduce((s, o) => s + o.totalAmount, 0).toFixed(2)}
                </Text>
              </View>
            )}

            <View style={styles.paymentPickerRow}>
              {PAYMENT_METHODS.map((m) => {
                const active = selectedPaymentMethod === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    activeOpacity={0.7}
                    style={[styles.paymentPill, active && styles.paymentPillActive]}
                    onPress={() => { selectionChanged(); setSelectedPaymentMethod(m.value); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Pay by ${m.label}`}
                  >
                    <Feather name={m.icon} size={14} color={active ? '#fff' : CALM.textSecondary} />
                    <Text style={[styles.paymentPillText, active && styles.paymentPillTextActive]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.paymentConfirmBtn, !selectedPaymentMethod && styles.paymentConfirmBtnDisabled]}
              onPress={handleConfirmPayment}
              disabled={!selectedPaymentMethod}
              accessibilityRole="button"
              accessibilityLabel="Confirm payment"
            >
              <Feather name="check" size={16} color={selectedPaymentMethod ? '#fff' : CALM.textMuted} />
              <Text style={[styles.paymentConfirmText, !selectedPaymentMethod && { color: CALM.textMuted }]}>
                confirm paid
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>}

      {/* ─── Order detail bottom sheet (lazy-mounted) ─── */}
      {!!selectedOrder && <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseModal}
        >
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {selectedOrder && (
                <>
                  {/* Handle */}
                  <View style={styles.modalHandleRow}>
                    <View style={styles.modalHandle} />
                  </View>

                  {/* ── Section: Header ── */}
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderLeft}>
                      <View style={styles.modalTitleRow}>
                        <Text style={styles.modalTitle}>
                          {selectedOrder.customerName || 'Order'}
                        </Text>
                        {!!selectedOrder.orderNumber && (
                          <Text style={styles.modalOrderCode}>{selectedOrder.orderNumber}</Text>
                        )}
                      </View>
                      {customerContext && (
                        <Text style={styles.customerContextText}>
                          {customerContext.orderCount} order{customerContext.orderCount !== 1 ? 's' : ''} · {currency} {customerContext.totalSpent.toFixed(2)} paid
                        </Text>
                      )}
                    </View>
                    <View style={styles.modalHeaderRight}>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: withAlpha(statusColor(selectedOrder.status), 0.15) },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: statusColor(selectedOrder.status) },
                          ]}
                        >
                          {selectedOrder.status}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.modalCloseButton}
                        activeOpacity={0.7}
                        onPress={handleCloseModal}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                      >
                        <Feather name="x" size={18} color={CALM.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* ── Section: Contact ── */}
                  {!isEditing && (!!selectedOrder.customerPhone || !!selectedOrder.customerAddress) && (
                    <View style={styles.modalSection}>
                      {!!selectedOrder.customerPhone && (
                        <View style={styles.phoneRow}>
                          <Feather name="phone" size={14} color={CALM.textMuted} />
                          <Text style={styles.phoneText} numberOfLines={1}>
                            {selectedOrder.customerPhone}
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.phoneButton}
                            onPress={() => handleCall(selectedOrder.customerPhone!)}
                            accessibilityRole="button"
                            accessibilityLabel="Call customer"
                          >
                            <Feather name="phone-call" size={15} color={CALM.bronze} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.phoneButton}
                            onPress={() => handleWhatsApp(selectedOrder.customerPhone!)}
                            accessibilityRole="button"
                            accessibilityLabel="WhatsApp customer"
                          >
                            <Feather name="message-circle" size={15} color={CALM.bronze} />
                          </TouchableOpacity>
                        </View>
                      )}
                      {!!selectedOrder.customerAddress && (
                        <View style={styles.addressRow}>
                          <Feather name="map-pin" size={14} color={CALM.textMuted} />
                          <Text style={styles.addressText} numberOfLines={2}>
                            {selectedOrder.customerAddress}
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.phoneButton}
                            onPress={() => handleOpenNavPicker(selectedOrder.customerAddress!)}
                            accessibilityRole="button"
                            accessibilityLabel="Open in navigation app"
                          >
                            <Feather name="navigation" size={15} color={CALM.bronze} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {/* ── Edit mode ── */}
                  {isEditing && (
                    <View style={styles.editSection}>
                      <Text style={styles.editFieldLabel}>phone</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editPhone}
                        onChangeText={setEditPhone}
                        placeholder="customer phone"
                        placeholderTextColor={CALM.textMuted}
                        keyboardType="phone-pad"
                      />
                      <Text style={styles.editFieldLabel}>address</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editAddress}
                        onChangeText={setEditAddress}
                        placeholder="customer address"
                        placeholderTextColor={CALM.textMuted}
                      />
                      <Text style={styles.editFieldLabel}>delivery date (dd/mm/yyyy)</Text>
                      <TextInput
                        style={[styles.editInput, !!editError && styles.editInputError]}
                        value={editDeliveryDate}
                        onChangeText={(t) => { setEditDeliveryDate(t); setEditError(''); }}
                        placeholder="e.g. 15/03/2026"
                        placeholderTextColor={CALM.textMuted}
                        keyboardType="number-pad"
                      />
                      {!!editError && <Text style={styles.errorText}>{editError}</Text>}
                      <Text style={styles.editFieldLabel}>note</Text>
                      <TextInput
                        style={[styles.editInput, styles.editInputMultiline]}
                        value={editNote}
                        onChangeText={setEditNote}
                        placeholder="order note"
                        placeholderTextColor={CALM.textMuted}
                        multiline
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          style={styles.editCancelButton}
                          activeOpacity={0.7}
                          onPress={() => setIsEditing(false)}
                        >
                          <Text style={styles.editCancelText}>cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.editSaveButton}
                          activeOpacity={0.7}
                          onPress={handleSaveEdit}
                        >
                          <Feather name="check" size={16} color="#fff" />
                          <Text style={styles.editSaveText}>save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* ── Section: Date + Delivery + Lifecycle ── */}
                  {!isEditing && (
                    <View style={styles.modalSection}>
                      <View style={styles.modalDateRow}>
                        <Feather name="calendar" size={14} color={CALM.textMuted} />
                        <Text style={styles.modalDateText}>
                          {format(
                            selectedOrder.date instanceof Date
                              ? selectedOrder.date
                              : new Date(selectedOrder.date),
                            'dd MMM yyyy, h:mm a'
                          )}
                        </Text>
                      </View>

                      {(() => {
                        const info = getDeliveryDateInfo(selectedOrder);
                        if (!info) return null;
                        return (
                          <View style={styles.modalDateRow}>
                            <Feather
                              name="truck"
                              size={14}
                              color={
                                info.isOverdue
                                  ? BIZ.overdue
                                  : info.isTodayDelivery
                                    ? BIZ.warning
                                    : CALM.textMuted
                              }
                            />
                            <Text
                              style={[
                                styles.modalDateText,
                                info.isTodayDelivery && styles.deliveryToday,
                                info.isOverdue && styles.deliveryOverdue,
                              ]}
                            >
                              {info.label}
                            </Text>
                          </View>
                        );
                      })()}

                      <OrderLifecycleBar
                        currentStatus={selectedOrder.status}
                        onChangeStatus={(newStatus) => handleChangeStatus(selectedOrder, newStatus)}
                      />
                    </View>
                  )}

                  {/* ── Section: Items ── */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionLabel}>items</Text>
                    {selectedOrder.items.map((item, i) => (
                      <View
                        key={i}
                        style={[
                          styles.modalItemRow,
                          i < selectedOrder.items.length - 1 && styles.modalItemRowBorder,
                        ]}
                      >
                        <Text style={styles.modalItemName}>
                          {item.productName} {'\u00D7'}{item.quantity} {item.unit}
                        </Text>
                        <Text style={styles.modalItemPrice}>
                          {currency} {(item.unitPrice * item.quantity).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.modalTotalRow}>
                      <Text style={styles.modalTotalLabel}>total</Text>
                      <Text style={styles.modalTotalAmount}>
                        {currency} {selectedOrder.totalAmount.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* Note */}
                  {!isEditing && selectedOrder.note && (
                    <View style={styles.modalSection}>
                      <View style={styles.modalNoteRow}>
                        <Feather name="file-text" size={14} color={CALM.textMuted} />
                        <Text style={styles.modalNote}>{selectedOrder.note}</Text>
                      </View>
                    </View>
                  )}

                  {/* WhatsApp raw message */}
                  {selectedOrder.rawWhatsApp && (
                    <View style={styles.rawWhatsAppSection}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setShowRawWhatsApp((v) => !v)}
                        accessibilityRole="button"
                        accessibilityLabel="Toggle original WhatsApp message"
                        style={styles.rawWhatsAppToggleRow}
                      >
                        <Feather name={showRawWhatsApp ? 'chevron-up' : 'chevron-down'} size={14} color={CALM.textMuted} />
                        <Text style={styles.rawWhatsAppToggle}>
                          {showRawWhatsApp ? 'hide original message' : 'show original message'}
                        </Text>
                      </TouchableOpacity>
                      {showRawWhatsApp && (
                        <Text style={styles.rawWhatsAppText}>
                          {selectedOrder.rawWhatsApp}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* ── Actions ── */}
                  {!isEditing && (
                    <View style={styles.modalActions}>
                      {/* Primary actions — full width */}
                      {NEXT_STATUS[selectedOrder.status] && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={[styles.advanceButton, { backgroundColor: statusColor(NEXT_STATUS[selectedOrder.status]!) }]}
                          onPress={() => handleAdvanceStatus(selectedOrder)}
                          accessibilityRole="button"
                          accessibilityLabel={`Mark order as ${NEXT_STATUS[selectedOrder.status]}`}
                        >
                          <Feather name={advanceIcon(selectedOrder.status)} size={18} color="#fff" />
                          <Text style={styles.advanceButtonText}>
                            mark as {NEXT_STATUS[selectedOrder.status]}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {!selectedOrder.isPaid && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={styles.paidButton}
                          onPress={() => {
                            lightTap();
                            setPendingPayOrder(selectedOrder);
                            setSelectedPaymentMethod(null);
                            setSelectedOrder(null);
                            setShowRawWhatsApp(false);
                            setIsEditing(false);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Mark order as paid"
                        >
                          <Feather name="dollar-sign" size={18} color="#fff" />
                          <Text style={styles.paidButtonText}>mark as paid</Text>
                        </TouchableOpacity>
                      )}

                      {selectedOrder.isPaid && (
                        <View style={styles.paidInfoRow}>
                          <Feather name={paymentMethodIcon(selectedOrder.paymentMethod)} size={14} color={BIZ.success} />
                          <Text style={styles.paidInfoText}>
                            paid {selectedOrder.paymentMethod === 'bank_transfer' ? 'via transfer' :
                                  selectedOrder.paymentMethod === 'ewallet' ? 'via e-wallet' :
                                  selectedOrder.paymentMethod === 'cash' ? 'cash' : ''}
                          </Text>
                          {selectedOrder.paidAt && (
                            <Text style={styles.paidInfoDate}>
                              {format(selectedOrder.paidAt instanceof Date ? selectedOrder.paidAt : new Date(selectedOrder.paidAt), 'dd MMM')}
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Secondary actions — 2-column grid */}
                      <View style={styles.secondaryActionsGrid}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={styles.gridAction}
                          onPress={() => handleCopyReceipt(selectedOrder)}
                          accessibilityRole="button"
                          accessibilityLabel="Copy receipt"
                        >
                          <Feather name="file-text" size={16} color={CALM.bronze} />
                          <Text style={styles.gridActionText}>receipt</Text>
                        </TouchableOpacity>

                        {!selectedOrder.isPaid && (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.gridAction}
                            onPress={() => handleSendReminder(selectedOrder)}
                            accessibilityRole="button"
                            accessibilityLabel="Copy reminder"
                          >
                            <Feather name="message-circle" size={16} color={CALM.bronze} />
                            <Text style={styles.gridActionText}>reminder</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={styles.gridAction}
                          onPress={() => handleStartEdit(selectedOrder)}
                          accessibilityRole="button"
                          accessibilityLabel="Edit details"
                        >
                          <Feather name="edit-2" size={16} color={CALM.bronze} />
                          <Text style={styles.gridActionText}>edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={styles.gridAction}
                          onPress={() => handleDuplicateOrder(selectedOrder)}
                          accessibilityRole="button"
                          accessibilityLabel="Reorder"
                        >
                          <Feather name="copy" size={16} color={CALM.bronze} />
                          <Text style={styles.gridActionText}>reorder</Text>
                        </TouchableOpacity>

                        {selectedOrder.isPaid && (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.gridAction}
                            onPress={() => handleUndoPaid(selectedOrder)}
                            accessibilityRole="button"
                            accessibilityLabel="Undo payment"
                          >
                            <Feather name="rotate-ccw" size={16} color={BIZ.error} />
                            <Text style={[styles.gridActionText, styles.gridActionTextDanger]}>undo paid</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Delete — minimal, at bottom */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.deleteButton}
                        onPress={() => handleDeleteOrder(selectedOrder)}
                        accessibilityRole="button"
                        accessibilityLabel="Delete this order"
                      >
                        <Text style={styles.deleteButtonText}>delete order</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>}

      {/* ─── Navigation app picker modal (lazy-mounted, renders after detail modal) ─── */}
      {!!navAddress && <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setNavAddress(null)}
      >
        <TouchableOpacity
          style={styles.sortOverlay}
          activeOpacity={1}
          onPress={() => setNavAddress(null)}
        >
          <View style={styles.paymentSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.paymentSheetTitle}>open with</Text>
            <View style={styles.navPickerRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.navAppButton}
                onPress={() => handleNavChoice('google')}
                accessibilityRole="button"
                accessibilityLabel="Open in Google Maps"
              >
                <View style={styles.navAppIcon}>
                  <Feather name="map" size={18} color={CALM.bronze} />
                </View>
                <Text style={styles.navAppLabel}>Google Maps</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.navAppButton}
                onPress={() => handleNavChoice('waze')}
                accessibilityRole="button"
                accessibilityLabel="Open in Waze"
              >
                <View style={styles.navAppIcon}>
                  <Feather name="navigation" size={18} color={CALM.bronze} />
                </View>
                <Text style={styles.navAppLabel}>Waze</Text>
              </TouchableOpacity>
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.navAppButton}
                  onPress={() => handleNavChoice('apple')}
                  accessibilityRole="button"
                  accessibilityLabel="Open in Apple Maps"
                >
                  <View style={styles.navAppIcon}>
                    <Feather name="compass" size={18} color={CALM.bronze} />
                  </View>
                  <Text style={styles.navAppLabel}>Apple Maps</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.navCancelBtn}
              onPress={() => setNavAddress(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.navCancelText}>close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>}
    </View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },

  // ── Delivery status pill tabs ──
  tabBarWrapper: {
    flexShrink: 0,
  },
  tabBar: {
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: SPACING.lg,
    paddingRight: SPACING['3xl'],
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  tab: {
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
  tabActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  tabTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  tabCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    minWidth: 18,
    textAlign: 'center',
  },
  tabCountActive: {
    color: '#fff',
    backgroundColor: CALM.bronze,
  },
  tabScrollHint: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(CALM.background, 0.85),
    borderTopRightRadius: RADIUS.full,
    borderBottomRightRadius: RADIUS.full,
  },

  // ── Search bar + sort ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
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

  // ── Combined payment + period filter bar ──
  filterBar: {
    flexGrow: 0,
  },
  filterBarContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    gap: SPACING.xs,
    alignItems: 'center',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    minHeight: 28,
  },
  filterPillActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  filterPillTextActive: {
    color: CALM.bronze,
  },
  filterPillCount: {
    fontSize: 10,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
    marginLeft: 1,
  },
  filterPillCountActive: {
    color: CALM.bronze,
  },
  filterDivider: {
    width: 1,
    height: 16,
    backgroundColor: CALM.border,
    marginHorizontal: SPACING.xs,
  },

  // ── Payment method sub-filter ──
  payMethodRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  payMethodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    minHeight: 28,
  },
  payMethodPillActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
  },
  payMethodPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  payMethodPillTextActive: {
    color: CALM.bronze,
  },
  payMethodCount: {
    fontSize: 10,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginLeft: 2,
  },
  payMethodCountActive: {
    color: CALM.bronze,
  },

  // ── Result count ──
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
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

  // ── Order list ──
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING['3xl'],
    gap: SPACING.sm,
  },

  // ── Order card ──
  orderCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    borderLeftWidth: 3,
    padding: SPACING.md,
    gap: 6,
  },
  orderCardSelected: {
    backgroundColor: withAlpha(CALM.bronze, 0.04),
    borderColor: CALM.bronze,
  },
  selectCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginBottom: -2,
  },
  selectCheckboxActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  customerIcon: {
    marginRight: SPACING.xs,
  },
  customerName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  orderCodeBadge: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    paddingHorizontal: SPACING.xs + 1,
    paddingVertical: 1,
    borderRadius: RADIUS.sm,
    marginLeft: SPACING.xs,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  cardInfoText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  cardInfoDot: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.border,
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  deliveryToday: {
    color: BIZ.warning,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  deliveryOverdue: {
    color: BIZ.overdue,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  orderItems: {
    fontSize: TYPOGRAPHY.size.sm,
    lineHeight: 20,
    color: CALM.textSecondary,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  orderTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  unpaidBadge: {
    backgroundColor: withAlpha(BIZ.unpaid, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  unpaidBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.unpaid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withAlpha(BIZ.success, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Quick-action row on card ──
  quickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.sm,
  },
  quickActionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.bronze, 0.07),
    minHeight: 38,
  },
  quickActionPillPaid: {
    backgroundColor: withAlpha(BIZ.success, 0.07),
  },
  quickActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],
    paddingHorizontal: SPACING['2xl'],
    gap: SPACING.sm,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING['2xl'],
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    minHeight: 48,
    alignSelf: 'stretch',
  },
  emptyCtaText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  emptyCtaSecondary: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyCtaSecondaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },

  // ── Bulk select bar ──
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  bulkCancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkCountText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  bulkSelectAllButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  bulkSelectAllText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  bulkPayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: BIZ.success,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
  },
  bulkPayButtonDisabled: {
    opacity: 0.4,
  },
  bulkPayText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
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

  // ── Payment picker modal ──
  paymentSheet: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    width: '85%',
    maxWidth: 340,
  },
  paymentSheetTitle: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },
  paymentContext: {
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.md,
    gap: 2,
  },
  paymentContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  paymentContextName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    flex: 1,
  },
  paymentContextAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  paymentContextItems: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 1,
  },
  paymentPickerRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  paymentPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    minHeight: 44,
  },
  paymentPillActive: {
    backgroundColor: BIZ.success,
  },
  paymentPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  paymentPillTextActive: {
    color: '#fff',
  },
  paymentConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: BIZ.success,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    minHeight: 48,
  },
  paymentConfirmBtnDisabled: {
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
  },
  paymentConfirmText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // ── Navigation app picker ──
  navPickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  navAppButton: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  navAppIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAppLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  navCancelBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  navCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },

  // ── Paid info row (detail modal) ──
  paidInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(BIZ.success, 0.06),
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  paidInfoText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: BIZ.success,
    flex: 1,
  },
  paidInfoDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING['3xl'],
    maxHeight: '88%',
  },
  modalHandleRow: {
    alignItems: 'center',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: CALM.border,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalHeaderLeft: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  modalOrderCode: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    letterSpacing: 0.8,
  },
  customerContextText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  // ── Modal sections ──
  modalSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  modalSectionLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },

  // ── Phone row in modal ──
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  phoneText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    flex: 1,
  },
  phoneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Address row in modal ──
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  addressText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    flex: 1,
  },

  // ── Date rows in modal ──
  modalDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  modalDateText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },

  // ── Order lifecycle progress bar ──
  lifecycleContainer: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  lifecycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifecycleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  lifecycleDotCurrent: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  lifecycleLine: {
    flex: 1,
    height: 2,
  },
  lifecycleLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  lifecycleLabel: {
    fontSize: 10,
    color: CALM.textMuted,
    textAlign: 'center',
    width: 52,
  },
  lifecycleLabelActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── Edit mode ──
  editSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    gap: SPACING.sm,
  },
  editFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editInput: {
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    minHeight: 44,
  },
  editInputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  editInputError: {
    borderColor: BIZ.error,
  },
  errorText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.error,
    marginTop: -SPACING.xs,
  },
  editActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  editCancelButton: {
    flex: 1,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  editCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  editSaveButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    minHeight: 44,
  },
  editSaveText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // ── Modal items ──
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  modalItemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  modalItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    flex: 1,
    marginRight: SPACING.sm,
    lineHeight: 20,
  },
  modalItemPrice: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.md,
    marginTop: SPACING.xs,
  },
  modalTotalLabel: {
    ...TYPE.label,
  },
  modalTotalAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ── Modal note ──
  modalNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  modalNote: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 20,
  },

  // ── WhatsApp raw ──
  rawWhatsAppSection: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  rawWhatsAppToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  rawWhatsAppToggle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  rawWhatsAppText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    lineHeight: 18,
    backgroundColor: withAlpha(CALM.textMuted, 0.04),
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },

  // ── Modal actions ──
  modalActions: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  advanceButton: {
    flexDirection: 'row',
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 48,
  },
  advanceButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  paidButton: {
    flexDirection: 'row',
    backgroundColor: BIZ.success,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 48,
  },
  paidButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // ── Secondary actions grid (2 columns) ──
  secondaryActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  gridAction: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    minHeight: 44,
  },
  gridActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  gridActionTextDanger: {
    color: BIZ.error,
  },

  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
    minHeight: 44,
  },
  deleteButtonText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textMuted,
  },

  // ── View toggle ──
  viewToggle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.08),
  },

  // ── Grouped customer card ──
  groupCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: withAlpha(CALM.bronze, 0.04),
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  groupBadge: {
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'],
  },
  subOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    minHeight: 60,
  },
  subOrderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  subOrderSelected: {
    backgroundColor: withAlpha(CALM.bronze, 0.04),
  },
  selectCheckboxSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subOrderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subOrderInfo: {
    flex: 1,
    gap: 2,
  },
  subOrderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subOrderDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  statusBadgeSmall: {
    paddingVertical: 1,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  statusTextSmall: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subOrderItems: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    lineHeight: 18,
  },
  subOrderBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  subOrderAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  unpaidBadgeSmall: {
    backgroundColor: withAlpha(BIZ.unpaid, 0.1),
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  unpaidBadgeSmallText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.unpaid,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  paidBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: withAlpha(BIZ.success, 0.1),
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  paidBadgeSmallText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  subOrderActions: {
    flexDirection: 'column',
    gap: SPACING.xs,
  },
  subOrderActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(CALM.bronze, 0.07),
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: withAlpha(CALM.textMuted, 0.03),
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  groupTotalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginRight: SPACING.xs,
  },
  groupTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  groupUnpaid: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.unpaid,
    fontVariant: ['tabular-nums'],
  },
});

export default OrderList;
