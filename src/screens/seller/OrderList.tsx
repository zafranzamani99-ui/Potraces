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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format, isToday, isYesterday, isPast, startOfDay, isThisWeek, isThisMonth } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, selectionChanged } from '../../services/haptics';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha, BIZ } from '../../constants';
import { SellerOrder, OrderStatus } from '../../types';

// ─── STATUS HELPERS ──────────────────────────────────────────
function statusColor(status: OrderStatus): string {
  switch (status) {
    case 'pending':   return BIZ.pending;
    case 'confirmed': return CALM.deepOlive;
    case 'ready':     return CALM.gold;
    case 'delivered': return CALM.bronze;
    case 'paid':      return CALM.textMuted;
    default:          return CALM.textMuted;
  }
}

const STATUS_TABS: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'all', value: 'all' },
  { label: 'pending', value: 'pending' },
  { label: 'confirmed', value: 'confirmed' },
  { label: 'ready', value: 'ready' },
  { label: 'delivered', value: 'delivered' },
  { label: 'paid', value: 'paid' },
];

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'ready',
  ready: 'delivered',
  delivered: 'paid',
  paid: null,
};

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
    case 'delivered': return 'dollar-sign';
    default:          return 'check';
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
  const isUndelivered = order.status !== 'delivered' && order.status !== 'paid';

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
const LIFECYCLE_STEPS: OrderStatus[] = ['pending', 'confirmed', 'ready', 'delivered', 'paid'];

const OrderLifecycleBar: React.FC<{
  currentStatus: OrderStatus;
  onChangeStatus?: (status: OrderStatus) => void;
}> = ({ currentStatus, onChangeStatus }) => {
  const currentIndex = LIFECYCLE_STEPS.indexOf(currentStatus);

  return (
    <View style={styles.lifecycleContainer}>
      <View style={styles.lifecycleRow}>
        {LIFECYCLE_STEPS.map((step, i) => {
          const isCompleted = i <= currentIndex;
          const dotColor = isCompleted ? CALM.bronze : CALM.border;

          return (
            <React.Fragment key={step}>
              {i > 0 && (
                <View
                  style={[
                    styles.lifecycleLine,
                    { backgroundColor: i <= currentIndex ? CALM.bronze : CALM.border },
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
                    i === currentIndex && styles.lifecycleDotCurrent,
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
                step === currentStatus && styles.lifecycleLabelActive,
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
};

// ─── STATS SUMMARY BAR ──────────────────────────────────────
const StatsSummary: React.FC<{
  orders: SellerOrder[];
  currency: string;
  onTapPending: () => void;
  onTapUnpaid: () => void;
  onTapTodayDelivery: () => void;
}> = ({ orders, currency, onTapPending, onTapUnpaid, onTapTodayDelivery }) => {
  const stats = useMemo(() => {
    let pendingCount = 0;
    let unpaidAmount = 0;
    let todayDeliveries = 0;

    for (const o of orders) {
      if (o.status === 'pending') pendingCount++;
      if (!o.isPaid) unpaidAmount += o.totalAmount;
      if (o.deliveryDate) {
        const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate);
        if (isToday(d) && o.status !== 'delivered' && o.status !== 'paid') {
          todayDeliveries++;
        }
      }
    }

    return { pendingCount, unpaidAmount, todayDeliveries };
  }, [orders]);

  return (
    <View style={styles.statsRow}>
      <TouchableOpacity
        style={styles.statChip}
        activeOpacity={0.7}
        onPress={() => { lightTap(); onTapPending(); }}
        accessibilityRole="button"
        accessibilityLabel={`${stats.pendingCount} pending orders`}
      >
        <View style={styles.statIconRow}>
          <Feather name="clock" size={14} color={CALM.bronze} />
          <Text style={styles.statValue}>{stats.pendingCount}</Text>
        </View>
        <Text style={styles.statLabel}>pending</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.statChip}
        activeOpacity={0.7}
        onPress={() => { lightTap(); onTapUnpaid(); }}
        accessibilityRole="button"
        accessibilityLabel={`${currency} ${stats.unpaidAmount.toFixed(2)} unpaid`}
      >
        <View style={styles.statIconRow}>
          <Feather name="alert-circle" size={14} color={CALM.bronze} />
          <Text style={styles.statValue} numberOfLines={1}>{currency} {stats.unpaidAmount.toFixed(0)}</Text>
        </View>
        <Text style={styles.statLabel}>unpaid</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.statChip}
        activeOpacity={0.7}
        onPress={() => { lightTap(); onTapTodayDelivery(); }}
        accessibilityRole="button"
        accessibilityLabel={`${stats.todayDeliveries} deliveries today`}
      >
        <View style={styles.statIconRow}>
          <Feather name="truck" size={14} color={CALM.bronze} />
          <Text style={styles.statValue}>{stats.todayDeliveries}</Text>
        </View>
        <Text style={styles.statLabel}>deliver today</Text>
      </TouchableOpacity>
    </View>
  );
};

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
}> = ({ item, index, currency, selectMode, isSelected, onPress, onLongPress, onToggleSelect, onAdvanceStatus, onMarkPaid }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      delay: Math.min(index * 40, 200),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, index]);

  const color = statusColor(item.status);
  const itemsText = item.items
    .map((i) => `${i.productName} \u00D7${i.quantity}`)
    .join(', ');

  const dateLabel = smartDateLabel(item.date);
  const deliveryInfo = getDeliveryDateInfo(item);
  const nextStatus = NEXT_STATUS[item.status];
  const showMarkPaid = !item.isPaid && item.status !== 'pending';

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

        {/* Header row: customer name + status badge */}
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
                      ? CALM.bronze
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

        {/* Footer row: amount + unpaid indicator */}
        <View style={styles.orderFooter}>
          <Text style={styles.orderTotal}>
            {currency} {item.totalAmount.toFixed(2)}
          </Text>
          {!item.isPaid && (
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
                style={styles.quickActionPill}
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
                  color={CALM.bronze}
                />
                <Text style={styles.quickActionText}>
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
                  color={CALM.deepOlive}
                />
                <Text style={[styles.quickActionText, { color: CALM.deepOlive }]}>
                  mark paid
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

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
}> = ({ group, index, currency, selectMode, selectedIds, onPress, onLongPress, onToggleSelect, onAdvanceStatus, onMarkPaid }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      delay: Math.min(index * 40, 200),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, index]);

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
          const showMarkPaid = !order.isPaid && order.status !== 'pending';
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
                  <Text style={styles.subOrderDate}>{dateLabel}, {timeLabel}</Text>
                  <View style={[styles.statusBadgeSmall, { backgroundColor: withAlpha(color, 0.15) }]}>
                    <Text style={[styles.statusTextSmall, { color }]}>{order.status}</Text>
                  </View>
                </View>
                <Text style={styles.subOrderItems} numberOfLines={1}>{itemsShort}</Text>
                <View style={styles.subOrderBottomRow}>
                  <Text style={styles.subOrderAmount}>{currency} {order.totalAmount.toFixed(2)}</Text>
                  {!order.isPaid && (
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
                      <Feather name={advanceIcon(order.status)} size={14} color={CALM.bronze} />
                    </TouchableOpacity>
                  )}
                  {showMarkPaid && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subOrderActionBtn}
                      onPress={(e) => { e.stopPropagation?.(); mediumTap(); onMarkPaid(order); }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Feather name="dollar-sign" size={14} color={CALM.deepOlive} />
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
          <Text style={styles.groupTotal}>{currency} {group.totalAmount.toFixed(2)}</Text>
          {group.unpaidAmount > 0 && (
            <Text style={styles.groupUnpaid}>{' \u00B7 '}{currency} {group.unpaidAmount.toFixed(0)} unpaid</Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

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

  const [filter, setFilter] = useState<OrderStatus | 'all'>(
    (initialFilter as OrderStatus | 'all') || 'all'
  );

  // Update filter/search when navigating back with new params
  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter as OrderStatus | 'all');
      navigation.setParams({ initialFilter: undefined });
    }
  }, [initialFilter]);

  const [showTabHint, setShowTabHint] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');

  useEffect(() => {
    if (initialSearch) {
      setSearchQuery(initialSearch);
      navigation.setParams({ searchQuery: undefined });
    }
  }, [initialSearch]);
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);
  const [showRawWhatsApp, setShowRawWhatsApp] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');

  // Bulk select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit mode in modal
  const [isEditing, setIsEditing] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState('');

  // Count per status for tab badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
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
    let result = filter === 'all'
      ? sortedOrders
      : sortedOrders.filter((o) => o.status === filter);

    // Period filter
    if (periodFilter !== 'all') {
      result = result.filter((o) => {
        const d = o.date instanceof Date ? o.date : new Date(o.date);
        switch (periodFilter) {
          case 'today': return isToday(d);
          case 'week': return isThisWeek(d, { weekStartsOn: 1 });
          case 'month': return isThisMonth(d);
          default: return true;
        }
      });
    }

    // Enhanced search: customer name, phone, product names
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((o) =>
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').toLowerCase().includes(q) ||
        o.items.some((i) => i.productName.toLowerCase().includes(q))
      );
    }

    return result;
  }, [sortedOrders, filter, searchQuery, periodFilter]);

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
  const hasActiveFilters = filter !== 'all' || periodFilter !== 'all' || searchQuery.trim().length > 0;

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
      updateOrderStatus(order.id, newStatus);
      // Update the selected order in place so the modal reflects the change
      setSelectedOrder({ ...order, status: newStatus, isPaid: newStatus === 'paid', updatedAt: new Date() });
      showToast(`status changed to ${newStatus}.`, 'info');
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
      updateOrderStatus(order.id, 'paid');
      showToast('marked as paid.', 'info');
    },
    [updateOrderStatus, showToast]
  );

  const handleCloseModal = useCallback(() => {
    setSelectedOrder(null);
    setShowRawWhatsApp(false);
    setIsEditing(false);
  }, []);

  // Duplicate / reorder
  const handleDuplicateOrder = useCallback(
    (order: SellerOrder) => {
      setSelectedOrder(null);
      setShowRawWhatsApp(false);
      setIsEditing(false);
      navigation.navigate('SellerNewOrder', {
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: undefined,
      });
    },
    [navigation]
  );

  // Delete order
  const handleDeleteOrder = useCallback(
    (order: SellerOrder) => {
      Alert.alert(
        '',
        'delete this order?',
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
      const reminderText = `Hi ${order.customerName || 'customer'},\n\nPesanan anda pada ${orderDate}:\n${itemsList}\n\nJumlah: ${currency} ${order.totalAmount.toFixed(2)}\n\nBoleh buat bayaran bila senang ye. Terima kasih!`;

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
      const receipt = `RESIT PESANAN\nPelanggan: ${order.customerName || '-'}\nTarikh: ${orderDate}\n${'─'.repeat(20)}\n${itemLines}\n${'─'.repeat(20)}\nJUMLAH: ${currency} ${order.totalAmount.toFixed(2)}\nStatus: ${order.isPaid ? 'dibayar' : 'belum bayar'}`;

      Clipboard.setStringAsync(receipt).then(() => {
        lightTap();
        showToast('receipt copied.', 'info');
      });
    },
    [currency, showToast]
  );

  // Edit mode handlers
  const handleStartEdit = useCallback((order: SellerOrder) => {
    setIsEditing(true);
    setEditNote(order.note || '');
    setEditPhone(order.customerPhone || '');
    setEditDeliveryDate(
      order.deliveryDate
        ? format(
            order.deliveryDate instanceof Date ? order.deliveryDate : new Date(order.deliveryDate),
            'dd/MM/yyyy'
          )
        : ''
    );
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!selectedOrder) return;

    const updates: Partial<Pick<SellerOrder, 'note' | 'deliveryDate' | 'customerPhone'>> = {};
    if (editNote !== (selectedOrder.note || '')) updates.note = editNote || undefined;
    if (editPhone !== (selectedOrder.customerPhone || '')) updates.customerPhone = editPhone || undefined;

    // Parse delivery date (dd/MM/yyyy)
    if (editDeliveryDate.trim()) {
      const parts = editDeliveryDate.trim().split('/');
      if (parts.length === 3) {
        const parsed = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (!isNaN(parsed.getTime())) {
          updates.deliveryDate = parsed;
        }
      }
    } else {
      updates.deliveryDate = undefined;
    }

    if (Object.keys(updates).length > 0) {
      updateOrder(selectedOrder.id, updates);
      setSelectedOrder({ ...selectedOrder, ...updates, updatedAt: new Date() });
      mediumTap();
      showToast('order updated.', 'info');
    }
    setIsEditing(false);
  }, [selectedOrder, editNote, editPhone, editDeliveryDate, updateOrder, showToast]);

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

  // Bulk select handlers
  const handleLongPress = useCallback((order: SellerOrder) => {
    if (!selectMode && !order.isPaid) {
      setSelectMode(true);
      setSelectedIds(new Set([order.id]));
    }
  }, [selectMode]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        setSelectMode(false);
      }
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
    Alert.alert(
      '',
      `mark ${ids.length} order${ids.length > 1 ? 's' : ''} as paid?`,
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'mark paid',
          onPress: () => {
            mediumTap();
            markOrdersPaid(ids);
            setSelectMode(false);
            setSelectedIds(new Set());
            showToast(`${ids.length} order${ids.length > 1 ? 's' : ''} marked paid.`, 'info');
          },
        },
      ]
    );
  }, [selectedIds, markOrdersPaid, showToast]);

  const handleCancelSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilter('all');
    setPeriodFilter('all');
    setSearchQuery('');
    lightTap();
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

  return (
    <View style={styles.container}>
      {/* ─── Stats Summary Bar ─── */}
      <StatsSummary
        orders={orders}
        currency={currency}
        onTapPending={() => { setFilter('pending'); setPeriodFilter('all'); }}
        onTapUnpaid={() => { setFilter('all'); setPeriodFilter('all'); }}
        onTapTodayDelivery={() => { setFilter('all'); setPeriodFilter('today'); }}
      />

      {/* ─── Status filter pills ─── */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
          onScroll={(e) => {
            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            const atEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 8;
            if (atEnd && showTabHint) setShowTabHint(false);
            if (!atEnd && !showTabHint) setShowTabHint(true);
          }}
          scrollEventThrottle={16}
        >
          {STATUS_TABS.map((tab) => {
            const isActive = filter === tab.value;
            const count = statusCounts[tab.value] || 0;
            return (
              <TouchableOpacity
                key={tab.value}
                activeOpacity={0.7}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => { selectionChanged(); setFilter(tab.value); }}
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
            placeholder="search name, phone, product"
            placeholderTextColor={CALM.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            accessibilityLabel="Search orders"
            accessibilityRole="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
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

      {/* ─── Period quick-filters + result count ─── */}
      <View style={styles.periodRow}>
        {PERIOD_FILTERS.map((pf) => {
          const isActive = periodFilter === pf.value;
          return (
            <TouchableOpacity
              key={pf.value}
              style={[styles.periodPill, isActive && styles.periodPillActive]}
              activeOpacity={0.7}
              onPress={() => { selectionChanged(); setPeriodFilter(pf.value); }}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.periodPillText, isActive && styles.periodPillTextActive]}>
                {pf.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── Result count + clear filters ─── */}
      {hasActiveFilters && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>
            {filteredOrders.length} of {orders.length} order{orders.length !== 1 ? 's' : ''}
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

      {/* ─── Order list ─── */}
      <FlatList
        data={(viewMode === 'grouped' ? groupedData : filteredOrders) as any[]}
        renderItem={viewMode === 'grouped' ? renderGroup as any : renderOrder}
        keyExtractor={(item: any) => viewMode === 'grouped' ? item.customerKey : item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
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
        }
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

      {/* ─── Order detail bottom sheet ─── */}
      <Modal
        visible={!!selectedOrder}
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
                      <Text style={styles.modalTitle}>
                        {selectedOrder.customerName || 'Order'}
                      </Text>
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
                  {!isEditing && !!selectedOrder.customerPhone && (
                    <View style={styles.modalSection}>
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
                      <Text style={styles.editFieldLabel}>delivery date (dd/mm/yyyy)</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editDeliveryDate}
                        onChangeText={setEditDeliveryDate}
                        placeholder="e.g. 15/03/2026"
                        placeholderTextColor={CALM.textMuted}
                        keyboardType="number-pad"
                      />
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
                                    ? CALM.bronze
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
                          style={styles.advanceButton}
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

                      {!selectedOrder.isPaid && selectedOrder.status !== 'pending' && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={styles.paidButton}
                          onPress={() => {
                            mediumTap();
                            updateOrderStatus(selectedOrder.id, 'paid');
                            showToast('marked as paid.', 'info');
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
      </Modal>
    </View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
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

  // ── Status pill tabs ──
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
  },
  tabCountActive: {
    color: CALM.bronze,
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

  // ── Period quick-filters ──
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  periodPill: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    minHeight: 30,
    justifyContent: 'center',
  },
  periodPillActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
  },
  periodPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  periodPillTextActive: {
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
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  deliveryOverdue: {
    color: BIZ.overdue,
    fontWeight: TYPOGRAPHY.weight.bold,
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
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  unpaidBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
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
    backgroundColor: withAlpha(CALM.deepOlive, 0.07),
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
    backgroundColor: CALM.deepOlive,
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
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
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
    borderColor: withAlpha(CALM.bronze, 0.3),
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
    backgroundColor: CALM.deepOlive,
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
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  unpaidBadgeSmallText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
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
    color: CALM.bronze,
    fontVariant: ['tabular-nums'],
  },
});

export default OrderList;
