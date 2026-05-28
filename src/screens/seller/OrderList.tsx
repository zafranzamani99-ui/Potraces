import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Animated,
  Alert,
  Linking,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  AppState,
  RefreshControl,
  Keyboard,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format, isToday, isYesterday, isPast, startOfDay, isThisWeek, isThisMonth, isValid } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, selectionChanged, warningNotification } from '../../services/haptics';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ, BIZ_SAFE, semantic } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { SellerOrder, SellerOrderItem, OrderStatus, SellerPaymentMethod, SellerProduct, DepositEntry } from '../../types';
import CalendarPicker from '../../components/common/CalendarPicker';
import FloatingModal from '../../components/common/FloatingModal';
import ModalToastHost from '../../components/common/ModalToastHost';
import { useT } from '../../i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteOrderFromSupabase, syncAll, pullOrderLinkOrders } from '../../services/sellerSync';

// ─── STATUS HELPERS ──────────────────────────────────────────
function statusColor(status: OrderStatus): string {
  switch (status) {
    case 'pending':   return BIZ.pending;       // amber-orange — urges action
    case 'confirmed': return BIZ.success;       // calm blue
    case 'ready':     return CALM.gold;         // gold
    case 'delivered': return BIZ.delivered;       // cool slate
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
  { value: 'ewallet', label: 'e-wallet', icon: 'credit-card' },
  { value: 'duitnow', label: 'QR', icon: 'grid' },
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
    case 'duitnow': return 'zap';
    case 'tng': return 'credit-card';
    case 'grab': return 'map-pin';
    case 'boost': return 'trending-up';
    case 'maybank_qr': return 'grid';
    case 'ewallet': return 'smartphone';
    default: return 'dollar-sign';
  }
}

function paymentMethodLabel(method?: SellerPaymentMethod): string {
  switch (method) {
    case 'cash': return 'cash';
    case 'bank_transfer': return 'transfer';
    case 'duitnow': return 'DuitNow';
    case 'tng': return 'TnG';
    case 'grab': return 'GrabPay';
    case 'boost': return 'Boost';
    case 'maybank_qr': return 'MAE QR';
    case 'ewallet': return 'e-wallet';
    default: return method || 'cash';
  }
}

// ─── SMART DATE LABEL ────────────────────────────────────────
function smartDateLabel(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (!isValid(d)) return '—';
  const time = format(d, 'h:mm a').toLowerCase();
  if (isToday(d)) return `today, ${time}`;
  if (isYesterday(d)) return `yesterday, ${time}`;
  return `${format(d, 'dd MMM')}, ${time}`;
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
  styles: ReturnType<typeof makeStyles>;
}> = React.memo(({ currentStatus, onChangeStatus, styles }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const currentIndex = LIFECYCLE_STEPS.indexOf(currentStatus);
  const currentColor = statusColor(currentStatus);

  return (
    <View style={styles.lifecycleContainer}>
      <View style={styles.lifecycleRow}>
        {LIFECYCLE_STEPS.map((step, i) => {
          const isCompleted = i <= currentIndex;
          const dotColor = isCompleted ? statusColor(step) : C.border;

          return (
            <React.Fragment key={step}>
              {i > 0 && (
                <View
                  style={[
                    styles.lifecycleLine,
                    { backgroundColor: i <= currentIndex ? statusColor(step) : C.border },
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
const AVATAR_COLORS = ['#8B7355', '#6BA3BE', '#A688B8', '#B2780A', '#4F5104', '#C1694F'];
const getAvatarColor = (name: string) => AVATAR_COLORS[Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length];

const AnimatedOrderCard: React.FC<{
  item: SellerOrder;
  index: number;
  currency: string;
  selectMode: boolean;
  isSelected: boolean;
  isUnseen: boolean;
  onOpenDetail: (item: SellerOrder) => void;
  onLongPress: (item: SellerOrder) => void;
  onToggleSelect: (id: string) => void;
  onSwipePay: (item: SellerOrder) => void;
  styles: ReturnType<typeof makeStyles>;
}> = React.memo(({ item, index, currency, selectMode, isSelected, isUnseen, onOpenDetail, onLongPress, onToggleSelect, onSwipePay, styles }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const swipeableRef = useRef<any>(null);
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

  const dateLabel = smartDateLabel(item.date);
  const deliveryInfo = getDeliveryDateInfo(item);
  const customerInitial = (item.customerName || 'W')[0].toUpperCase();
  const avatarBg = getAvatarColor(item.customerName || 'walk-in');
  const itemsSummary = item.items.length === 1 ? t.seller.olOneItem : t.seller.olItems.replace('{n}', String(item.items.length));
  const paidAmount = item.paidAmount || 0;
  const isPartial = paidAmount > 0 && !item.isPaid;

  const renderLeftActions = useCallback(() => {
    if (item.isPaid) {
      return (
        <View style={[styles.swipeAction, { backgroundColor: withAlpha(semantic(BIZ_SAFE.success, isDark), 0.15) }]}>
          <Feather name="check" size={18} color={semantic(BIZ_SAFE.success, isDark)} />
          <Text style={[styles.swipeActionText, { color: semantic(BIZ_SAFE.success, isDark) }]}>{t.seller.olPaidBadge}</Text>
        </View>
      );
    }
    if (item.transferredToPersonal) {
      return (
        <View style={[styles.swipeAction, { backgroundColor: withAlpha(C.bronze, 0.15) }]}>
          <Feather name="arrow-right" size={18} color={C.bronze} />
          <Text style={[styles.swipeActionText, { color: C.bronze }]}>{t.seller.olTransferred}</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.swipeAction, { backgroundColor: withAlpha(C.accent, 0.15) }]}
        onPress={() => {
          swipeableRef.current?.close();
          mediumTap();
          onSwipePay(item);
        }}
      >
        <Feather name="dollar-sign" size={18} color={C.accent} />
        <Text style={[styles.swipeActionText, { color: C.accent }]}>{t.seller.olPay}</Text>
      </TouchableOpacity>
    );
  }, [item.isPaid, item.transferredToPersonal, isDark, C, styles, onSwipePay, item]);

  const cardContent = (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[
        styles.orderCard,
        selectMode && isSelected && styles.orderCardSelected,
        isUnseen && styles.orderCardUnseen,
      ]}
      onPress={() => {
        if (selectMode) {
          selectionChanged();
          onToggleSelect(item.id);
        } else {
          lightTap();
          onOpenDetail(item);
        }
      }}
      onLongPress={() => { mediumTap(); onLongPress(item); }}
      accessibilityRole="button"
      accessibilityLabel={`Order from ${item.customerName || 'unknown customer'}, ${item.status}, ${currency} ${item.totalAmount.toFixed(2)}`}
    >
      <View style={styles.orderRow}>
        {selectMode ? (
          <View style={[styles.selectCheckbox, isSelected && styles.selectCheckboxActive]}>
            {isSelected && <Feather name="check" size={14} color={C.onAccent} />}
          </View>
        ) : (
          <View style={[styles.orderAvatar, { backgroundColor: withAlpha(avatarBg, 0.15) }]}>
            <Text style={[styles.orderAvatarText, { color: avatarBg }]}>{customerInitial}</Text>
          </View>
        )}
        <View style={styles.orderCardBody}>
          <View style={styles.orderTopRow}>
            <Text style={styles.customerName} numberOfLines={1}>{item.customerName || 'walk-in'}</Text>
            <Text style={styles.orderTotal}>{currency} {item.totalAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.orderBottomRow}>
            <View style={styles.orderMetaLeft}>
              <Text style={styles.orderMetaText} numberOfLines={1}>
                {itemsSummary}
                {deliveryInfo ? ` · ${deliveryInfo.label}` : ` · ${dateLabel}`}
              </Text>
              {item.source === 'order_link' && (
                <Feather name="globe" size={10} color={semantic(BIZ_SAFE.success, isDark)} style={{ marginLeft: 4 }} />
              )}
            </View>
            <View style={styles.orderTags}>
              <View style={[
                styles.paymentBadge,
                {
                  backgroundColor: item.isPaid
                    ? withAlpha(semantic(BIZ_SAFE.success, isDark), 0.1)
                    : isPartial
                      ? withAlpha(C.bronze, 0.1)
                      : withAlpha(C.textMuted, 0.08),
                },
              ]}>
                <Text style={[
                  styles.paymentBadgeText,
                  {
                    color: item.isPaid
                      ? semantic(BIZ_SAFE.success, isDark)
                      : isPartial
                        ? C.bronze
                        : C.textMuted,
                  },
                ]}>
                  {item.isPaid ? t.seller.olPaidBadge : isPartial ? t.seller.olPartialBadge : t.seller.olUnpaidBadge}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (selectMode) {
    return <Animated.View style={{ opacity: fadeAnim }}>{cardContent}</Animated.View>;
  }

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderLeftActions={renderLeftActions}
        overshootLeft={false}
        friction={1.5}
        leftThreshold={60}
      >
        {cardContent}
      </ReanimatedSwipeable>
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
  seenSet: Set<string>;
  onOpenDetail: (item: SellerOrder) => void;
  onLongPress: (item: SellerOrder) => void;
  onToggleSelect: (id: string) => void;
  onSwipePay: (item: SellerOrder) => void;
  styles: ReturnType<typeof makeStyles>;
}> = React.memo(({ group, index, currency, selectMode, selectedIds, seenSet, onOpenDetail, onLongPress, onToggleSelect, onSwipePay, styles }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
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
        isUnseen={group.orders[0].source === 'order_link' && !seenSet.has(group.orders[0].id)}
        onOpenDetail={onOpenDetail}
        onLongPress={onLongPress}
        onToggleSelect={onToggleSelect}
        onSwipePay={onSwipePay}
        styles={styles}
      />
    );
  }

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={styles.groupCard}>
        {/* Group header */}
        <View style={styles.groupHeader}>
          <View style={[styles.orderAvatar, { backgroundColor: withAlpha(getAvatarColor(group.customerName), 0.15) }]}>
            <Text style={[styles.orderAvatarText, { color: getAvatarColor(group.customerName) }]}>{group.customerName[0]?.toUpperCase() || '?'}</Text>
          </View>
          <Text style={[styles.customerName, { flex: 1 }]} numberOfLines={1}>
            {group.customerName}
          </Text>
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>{group.orders.length}</Text>
          </View>
        </View>

        {/* Sub-order rows */}
        {group.orders.map((order, i) => {
          const isSelected = selectedIds.has(order.id);
          const dateLabel = smartDateLabel(order.date);
          const deliveryInfo = getDeliveryDateInfo(order);
          const paidAmt = order.paidAmount || 0;
          const isPartialPay = paidAmt > 0 && !order.isPaid;

          return (
            <TouchableOpacity
              key={order.id}
              activeOpacity={0.7}
              style={[
                styles.subOrderRow,
                i < group.orders.length - 1 && styles.subOrderRowBorder,
                selectMode && isSelected && styles.subOrderSelected,
                order.source === 'order_link' && !seenSet.has(order.id) && styles.subOrderUnseen,
              ]}
              onPress={() => {
                if (selectMode) { selectionChanged(); onToggleSelect(order.id); }
                else { lightTap(); onOpenDetail(order); }
              }}
              onLongPress={() => { mediumTap(); onLongPress(order); }}
            >
              {selectMode && (
                <View style={[styles.selectCheckboxSmall, isSelected && styles.selectCheckboxActive]}>
                  {isSelected && <Feather name="check" size={10} color={C.onAccent} />}
                </View>
              )}
              <View style={styles.subOrderInfo}>
                <View style={styles.subOrderTopRow}>
                  <Text style={styles.orderMetaText} numberOfLines={1}>
                    {order.items.length === 1 ? t.seller.olOneItem : t.seller.olItems.replace('{n}', String(order.items.length))}
                    {deliveryInfo ? ` · ${deliveryInfo.label}` : ` · ${dateLabel}`}
                  </Text>
                  <Text style={styles.subOrderAmount}>{currency} {order.totalAmount.toFixed(2)}</Text>
                </View>
                <View style={styles.orderBottomRow}>
                  <View style={styles.orderTags}>
                    <View style={[
                      styles.paymentBadge,
                      {
                        backgroundColor: order.isPaid
                          ? withAlpha(semantic(BIZ_SAFE.success, isDark), 0.1)
                          : isPartialPay
                            ? withAlpha(C.bronze, 0.1)
                            : withAlpha(C.textMuted, 0.08),
                      },
                    ]}>
                      <Text style={[
                        styles.paymentBadgeText,
                        {
                          color: order.isPaid
                            ? semantic(BIZ_SAFE.success, isDark)
                            : isPartialPay
                              ? C.bronze
                              : C.textMuted,
                        },
                      ]}>
                        {order.isPaid ? t.seller.olPaidBadge : isPartialPay ? t.seller.olPartialBadge : t.seller.olUnpaidBadge}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Group footer */}
        <View style={styles.groupFooter}>
          <Text style={styles.groupTotalLabel}>combined</Text>
          <Text style={styles.groupTotal}>{currency} {group.totalAmount.toFixed(0)}</Text>
          {group.unpaidAmount > 0 && (
            <Text style={styles.groupUnpaid}>{' · '}{currency} {group.unpaidAmount.toFixed(0)} unpaid</Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
});

// ─── MAIN COMPONENT ─────────────────────────────────────────
const OrderList: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const orders = useSellerStore((s) => s.orders);
  const products = useSellerStore((s) => s.products);
  const updateOrderStatus = useSellerStore((s) => s.updateOrderStatus);
  const updateOrder = useSellerStore((s) => s.updateOrder);
  const updateOrderWithItems = useSellerStore((s) => s.updateOrderWithItems);
  const untransferOrder = useSellerStore((s) => s.untransferOrder);
  const recordPayment = useSellerStore((s) => s.recordPayment);
  const updateDeposit = useSellerStore((s) => s.updateDeposit);
  const removeDeposit = useSellerStore((s) => s.removeDeposit);
  const markOrderPaid = useSellerStore((s) => s.markOrderPaid);
  const markOrdersPaid = useSellerStore((s) => s.markOrdersPaid);
  const updateOrdersStatus = useSellerStore((s) => s.updateOrdersStatus);
  const deleteOrder = useSellerStore((s) => s.deleteOrder);
  const deleteOrders = useSellerStore((s) => s.deleteOrders);
  const markOrdersSeen = useSellerStore((s) => s.markOrdersSeen);
  const markAllOnlineSeen = useSellerStore((s) => s.markAllOnlineSeen);
  const markOrderUnseen = useSellerStore((s) => s.markOrderUnseen);
  const seenOnlineOrderIds = useSellerStore((s) => s.seenOnlineOrderIds);
  const currency = useSettingsStore((s) => s.currency);
  const userName = useSettingsStore((s) => s.userName);
  const paymentQrs = useSettingsStore((s) => s.businessPaymentQrs);
  const { showToast } = useToast();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Accept initialFilter, searchQuery, and orderId from navigation
  const initialFilter = (route.params as { initialFilter?: string; searchQuery?: string; orderId?: string } | undefined)?.initialFilter;
  const initialSearch = (route.params as { searchQuery?: string } | undefined)?.searchQuery;
  const targetOrderId = (route.params as { orderId?: string } | undefined)?.orderId;

  // Two independent filter dimensions: delivery stage + payment state
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>(
    initialFilter && ['pending', 'confirmed', 'ready', 'delivered', 'completed'].includes(initialFilter)
      ? (initialFilter as DeliveryFilter) : 'all'
  );
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>(
    initialFilter === 'paid' ? 'paid' : initialFilter === 'unpaid' ? 'unpaid' : 'all'
  );
  const [overdueOnly, setOverdueOnly] = useState(initialFilter === 'overdue');
  const [onlineOnly, setOnlineOnly] = useState(initialFilter === 'online');

  const seenSet = useMemo(() => new Set(seenOnlineOrderIds), [seenOnlineOrderIds]);
  const unseenOnlineCount = useMemo(
    () => orders.filter((o) => o.source === 'order_link' && !seenSet.has(o.id)).length,
    [orders, seenSet],
  );

  // Update filter/search when navigating back with new params
  useEffect(() => {
    if (initialFilter) {
      if (initialFilter === 'online') {
        setOnlineOnly(true);
        setDeliveryFilter('all');
        setPaymentFilter('all');
        setOverdueOnly(false);
        setViewMode('list');
      } else if (initialFilter === 'overdue') {
        setOverdueOnly(true);
        setOnlineOnly(false);
        setDeliveryFilter('all');
        setPaymentFilter('all');
      } else if (initialFilter === 'paid' || initialFilter === 'unpaid') {
        setPaymentFilter(initialFilter);
        setDeliveryFilter('all');
        setOverdueOnly(false);
        setOnlineOnly(false);
      } else if (['pending', 'confirmed', 'ready', 'delivered', 'completed'].includes(initialFilter)) {
        setDeliveryFilter(initialFilter as DeliveryFilter);
        setOverdueOnly(false);
        setOnlineOnly(false);
      }
      navigation.setParams({ initialFilter: undefined });
    }
  }, [initialFilter]);

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
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const { products, orders: o, seasons, sellerCustomers: sc } = useSellerStore.getState();
    Promise.all([syncAll(products, o, seasons, sc), pullOrderLinkOrders()])
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);

  // Auto-open order from push notification tap
  useEffect(() => {
    if (targetOrderId) {
      const match = orders.find((o) => o.id === targetOrderId || o.supabaseId === targetOrderId);
      if (match) setSelectedOrder(match);
      navigation.setParams({ orderId: undefined });
    }
  }, [targetOrderId]);
  const [showRawWhatsApp, setShowRawWhatsApp] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Payment picker state
  const [pendingPayOrder, setPendingPayOrder] = useState<SellerOrder | null>(null);
  const [bulkPayIds, setBulkPayIds] = useState<string[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SellerPaymentMethod | null>(null);
  const [paymentNote, setPaymentNote] = useState('');

  // Navigation app picker
  const [navAddress, setNavAddress] = useState<string | null>(null);

  // Payment method sub-filter (when viewing 'paid' tab)
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<SellerPaymentMethod | 'all'>('all');

  // Pending QR share — auto-send QR when returning from WhatsApp
  const pendingQrUri = useRef<string | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && pendingQrUri.current) {
        const srcUri = pendingQrUri.current;
        pendingQrUri.current = null;
        // Small delay so WhatsApp fully closes
        await new Promise((r) => setTimeout(r, 600));
        try {
          // Ensure file:// prefix for Android content sharing
          const shareUri = srcUri.startsWith('file://') ? srcUri : `file://${srcUri}`;
          await Sharing.shareAsync(shareUri, { mimeType: 'image/png', UTI: 'public.png' });
        } catch { /* user cancelled or file error */ }
      }
    });
    return () => sub.remove();
  }, []);

  // Swipe-to-pay quick payment modal
  const [swipePayOrder, setSwipePayOrder] = useState<SellerOrder | null>(null);
  // Delivery date keyboard modal (inside edit mode)
  const [showDeliveryDateModal, setShowDeliveryDateModal] = useState(false);
  // Payment history editing
  const [editingPayHistory, setEditingPayHistory] = useState(false);
  const [editPayIdx, setEditPayIdx] = useState<number | null>(null);
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPayMethod, setEditPayMethod] = useState<SellerPaymentMethod>('cash');
  const [editPayNote, setEditPayNote] = useState('');

  // Bulk select mode — selectMode derived from selectedIds.size to avoid sync bugs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectMode = selectedIds.size > 0;

  // Edit mode in modal
  const [isEditing, setIsEditing] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editItems, setEditItems] = useState<SellerOrderItem[]>([]);
  // Partial payment state
  const [showDepositInput, setShowDepositInput] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<SellerPaymentMethod | null>(null);
  const [depositNote, setDepositNote] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState<Date | null>(null);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState('');
  // Delete-item confirmation
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<{ index: number; item: SellerOrderItem; hasPaid: boolean } | null>(null);
  // Remove-deposit confirmation
  const [removeDepositConfirm, setRemoveDepositConfirm] = useState<{ idx: number; deposit: DepositEntry } | null>(null);

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
      if (o.source === 'order_link') {
        counts['online'] = (counts['online'] || 0) + 1;
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

  // Pre-compute overdue orders from sortedOrders (same set as orders, just sorted)
  const overdueOrders = useMemo(() => {
    return sortedOrders.filter((o) => {
      if (!o.deliveryDate) return false;
      const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate as string);
      return isPast(startOfDay(d)) && !isToday(d) && o.status !== 'delivered' && o.status !== 'completed';
    });
  }, [sortedOrders]);

  const filteredOrders = useMemo(() => {
    let result = sortedOrders;

    // Online orders filter
    if (onlineOnly) {
      result = result.filter((o) => o.source === 'order_link');
    }

    // Delivery status filter
    if (deliveryFilter !== 'all') {
      result = result.filter((o) => o.status === deliveryFilter);
    }

    // Overdue filter — reuse pre-computed overdueOrders when no prior filters applied
    if (overdueOnly) {
      if (!onlineOnly && deliveryFilter === 'all') {
        result = overdueOrders;
      } else {
        const overdueIds = new Set(overdueOrders.map((o) => o.id));
        result = result.filter((o) => overdueIds.has(o.id));
      }
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
  }, [sortedOrders, overdueOrders, deliveryFilter, paymentFilter, overdueOnly, onlineOnly, searchQuery, periodFilter, paymentMethodFilter]);

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

  // Which primary chip is active (mutually exclusive shortcuts)
  const activeChip = useMemo(() => {
    if (onlineOnly && deliveryFilter === 'all' && paymentFilter === 'all' && !overdueOnly) return 'online';
    if (overdueOnly && deliveryFilter === 'all' && paymentFilter === 'all' && !onlineOnly) return 'overdue';
    if (deliveryFilter === 'pending' && paymentFilter === 'all' && !onlineOnly && !overdueOnly) return 'pending';
    if (paymentFilter === 'unpaid' && deliveryFilter === 'all' && !onlineOnly && !overdueOnly) return 'unpaid';
    if (deliveryFilter === 'all' && paymentFilter === 'all' && !onlineOnly && !overdueOnly) return 'all';
    return null; // custom combo from modal
  }, [deliveryFilter, paymentFilter, onlineOnly, overdueOnly]);

  // Whether the modal has advanced filters beyond what chips show
  const modalHasAdvancedFilters = useMemo(() => sortBy !== 'newest' || periodFilter !== 'all' || paymentMethodFilter !== 'all'
    || (deliveryFilter !== 'all' && deliveryFilter !== 'pending')
    || (paymentFilter === 'paid'), [sortBy, periodFilter, paymentMethodFilter, deliveryFilter, paymentFilter]);

  // Overdue count for badge — derived from pre-computed overdueOrders
  const overdueCount = overdueOrders.length;

  // Whether any filters are active
  const hasActiveFilters = useMemo(() => deliveryFilter !== 'all' || paymentFilter !== 'all' || periodFilter !== 'all' || overdueOnly || onlineOnly || searchInput.trim().length > 0 || paymentMethodFilter !== 'all', [deliveryFilter, paymentFilter, periodFilter, overdueOnly, onlineOnly, searchInput, paymentMethodFilter]);

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
      setSelectedOrder({ ...order, status: next, updatedAt: new Date() });
      showToast(`marked as ${next}.`, 'info');

      // Auto-send WhatsApp confirmation when confirming an order
      if (next === 'confirmed' && order.customerPhone) {
        const items = order.items.map((i) => `• ${i.productName} ×${i.quantity}`).join('\n');
        const orderRef = order.orderNumber ? `*No. Pesanan: #${order.orderNumber}*\n` : '';
        const msg =
          `Salam ${order.customerName || ''}! ✅\n\n` +
          `Pesanan anda telah disahkan.\n\n` +
          `${orderRef}` +
          `${items}\n` +
          `Jumlah: ${currency} ${order.totalAmount.toFixed(2)}\n\n` +
          `Please reply *CONFIRM* to confirm your order.\n\n` +
          `Terima kasih! 🙏`;
        let digits = order.customerPhone.replace(/[^0-9]/g, '');
        if (digits.startsWith('60')) { /* already correct */ }
        else if (digits.startsWith('0')) digits = '60' + digits.slice(1);
        Alert.alert(
          '',
          `send confirmation to ${order.customerName} via WhatsApp?`,
          [
            { text: 'skip', style: 'cancel' },
            { text: 'send', onPress: () => { Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`).catch(() => {}); } },
          ]
        );
      }
    },
    [updateOrderStatus, showToast, currency]
  );

  const handleConfirmPayment = useCallback(() => {
    if (!selectedPaymentMethod) {
      warningNotification();
      showToast('select a payment method', 'error');
      return;
    }
    mediumTap();
    const note = paymentNote.trim() || undefined;
    if (pendingPayOrder) {
      markOrderPaid(pendingPayOrder.id, selectedPaymentMethod, note);
      showToast('marked as paid.', 'info');
    } else if (bulkPayIds.length > 0) {
      markOrdersPaid(bulkPayIds, selectedPaymentMethod, note);
      showToast(`${bulkPayIds.length} order${bulkPayIds.length > 1 ? 's' : ''} marked paid.`, 'info');
      setSelectedIds(new Set());
    }
    setPendingPayOrder(null);
    setBulkPayIds([]);
    setSelectedPaymentMethod(null);
    setPaymentNote('');
  }, [pendingPayOrder, bulkPayIds, selectedPaymentMethod, paymentNote, markOrderPaid, markOrdersPaid, showToast]);

  const handleCloseModal = useCallback(() => {
    setSelectedOrder(null);
    setShowRawWhatsApp(false);
    setIsEditing(false);
    setShowDepositInput(false);
    setEditingPayHistory(false);
    setEditPayIdx(null);
    setShowAddProductModal(false);
    setAddProductSearch('');
  }, []);

  // Delete order
  const handleDeleteOrder = useCallback(
    (order: SellerOrder) => {
      const msg = order.transferredToPersonal
        ? `this order was sent to personal. deleting it will also remove its ${currency} ${order.totalAmount.toFixed(2)} from your personal wallet.\n\ndelete anyway?`
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
              if (order.supabaseId) {
                deleteOrderFromSupabase(order.supabaseId).catch(() =>
                  showToast("couldn't remove from server — will retry on next sync", 'error')
                );
              }
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
    [deleteOrder, showToast, currency]
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

  // Build invoice text
  const buildReceiptText = useCallback(
    (order: SellerOrder): string => {
      const orderDate = format(
        order.date instanceof Date ? order.date : new Date(order.date),
        'dd MMM yyyy'
      );
      const sep = '─'.repeat(28);
      const padRow = (label: string, value: string, width = 28) => {
        const maxLabel = width - value.length - 1;
        const trimmed = label.length > maxLabel ? label.slice(0, maxLabel - 1) + '…' : label;
        const space = width - trimmed.length - value.length;
        return `${trimmed}${' '.repeat(Math.max(1, space))}${value}`;
      };
      const header = userName ? `${userName}\n` : '';
      const orderRef = order.orderNumber ? `*No: #${order.orderNumber}*\n` : '';
      const dateRow = `Tarikh: ${orderDate}\n`;
      const customer = order.customerName ? `Pelanggan: ${order.customerName}\n` : '';
      const address = order.customerAddress ? `Alamat: ${order.customerAddress}\n` : '';
      const itemLines = order.items
        .map((i) => padRow(`${i.productName} ×${i.quantity} ${i.unit}`, `${currency} ${(i.unitPrice * i.quantity).toFixed(2)}`))
        .join('\n');
      const payMethod = order.paymentMethod ? `\nBayaran: ${paymentMethodLabel(order.paymentMethod)}` : '';
      const status = order.isPaid ? 'dibayar ✓' : 'belum bayar';

      return (
        `${header}${sep}\n` +
        `${orderRef}${dateRow}${customer}${address}` +
        `${sep}\n` +
        `${itemLines}\n` +
        `${sep}\n` +
        `${padRow('JUMLAH:', `${currency} ${order.totalAmount.toFixed(2)}`)}\n` +
        `${sep}${payMethod}\nStatus: ${status}\n\nTerima kasih! 🙏`
      );
    },
    [currency, userName]
  );

  // Copy receipt
  const handleCopyReceipt = useCallback(
    (order: SellerOrder) => {
      Clipboard.setStringAsync(buildReceiptText(order)).then(() => {
        lightTap();
        showToast('receipt copied.', 'info');
      });
    },
    [buildReceiptText, showToast]
  );

  // Share receipt via WhatsApp
  const handleShareReceiptWA = useCallback(
    (order: SellerOrder) => {
      const text = buildReceiptText(order);
      const phone = order.customerPhone;
      if (phone) {
        let digits = phone.replace(/[^0-9]/g, '');
        if (digits.startsWith('60')) { /* already correct */ }
        else if (digits.startsWith('0')) digits = '60' + digits.slice(1);
        Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`).catch(() => {
          Clipboard.setStringAsync(text).then(() => showToast('receipt copied (WA unavailable).', 'info'));
        });
      } else {
        Clipboard.setStringAsync(text).then(() => {
          lightTap();
          showToast('receipt copied — no phone on file.', 'info');
        });
      }
    },
    [buildReceiptText, showToast]
  );

  // Send QR with order total via WhatsApp — message first, then QR image on return
  const handleSendQR = useCallback(
    (order: SellerOrder) => {
      if (paymentQrs.length === 0) {
        Alert.alert(
          'No Payment QR',
          'Add your payment QR code in Settings first.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Go to Settings', onPress: () => navigation.navigate('SellerSettings', { scrollTo: 'qr' }) },
          ]
        );
        return;
      }
      const text =
        `Thanks for your order${order.customerName ? `, ${order.customerName}` : ''}!\n\n` +
        `Order${order.orderNumber ? ` #${order.orderNumber}` : ''}\n` +
        `*Total: ${currency} ${order.totalAmount.toFixed(2)}*\n\n` +
        `Please scan the QR to make payment.\n` +
        `Once paid, kindly send a receipt/screenshot as proof.\n\nThank you! 🙏`;

      const phone = order.customerPhone;
      // Queue QR image to auto-share when user returns from WhatsApp
      pendingQrUri.current = paymentQrs[0].uri;

      if (phone) {
        let digits = phone.replace(/[^0-9]/g, '');
        if (digits.startsWith('60')) { /* already correct */ }
        else if (digits.startsWith('0')) digits = '60' + digits.slice(1);
        Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`).catch(() => {
          pendingQrUri.current = null;
          Clipboard.setStringAsync(text).then(() => showToast('message copied (WA unavailable).', 'info'));
        });
      } else {
        pendingQrUri.current = null;
        Clipboard.setStringAsync(text).then(() => {
          lightTap();
          showToast('message copied — no phone on file.', 'info');
        });
      }
    },
    [currency, paymentQrs, showToast, navigation]
  );

  // Edit mode handlers
  const handleStartEdit = useCallback((order: SellerOrder) => {
    const doEdit = () => {
      setIsEditing(true);
      setEditNote(order.note || '');
      setEditPhone(order.customerPhone || '');
      setEditAddress(order.customerAddress || '');
      setEditItems([...order.items]);
      setEditDeliveryDate(
        order.deliveryDate
          ? (order.deliveryDate instanceof Date ? order.deliveryDate : new Date(order.deliveryDate))
          : null
      );
    };

    // A transferred order's income already sits in the personal wallet. Editing
    // it directly would desync the two sides, so move that amount back out of
    // personal first (it returns to the pool to transfer again next batch),
    // then open the editor. One tap, no hunting for an "undo" button elsewhere.
    if (order.transferredToPersonal) {
      Alert.alert(
        'this order was sent to personal',
        `${currency} ${order.totalAmount.toFixed(2)} from this order is already in your personal wallet.\n\nto change it, we'll move that amount back out of personal first — you can send it again in the next transfer. continue?`,
        [
          { text: 'cancel', style: 'cancel' },
          {
            text: 'move back & edit',
            onPress: () => { untransferOrder(order.id); doEdit(); },
          },
        ]
      );
      return;
    }

    const isSettled = order.isPaid && (order.status === 'delivered' || order.status === 'completed');
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
  }, [currency, untransferOrder]);

  const handleSaveEdit = useCallback(() => {
    if (!selectedOrder) return;

    const updates: Partial<Pick<SellerOrder, 'note' | 'deliveryDate' | 'customerPhone' | 'customerAddress' | 'isPaid' | 'paymentMethod' | 'paidAt'>> = {};
    if (editNote !== (selectedOrder.note || '')) updates.note = editNote || undefined;
    if (editPhone !== (selectedOrder.customerPhone || '')) updates.customerPhone = editPhone || undefined;
    if (editAddress !== (selectedOrder.customerAddress || '')) updates.customerAddress = editAddress || undefined;

    // Delivery date (already a Date object from CalendarPicker)
    if (editDeliveryDate) {
      updates.deliveryDate = editDeliveryDate;
    } else {
      updates.deliveryDate = undefined;
    }

    // Save items if changed
    const itemsChanged = JSON.stringify(editItems.map(i => ({ id: i.productId, q: i.quantity }))) !==
      JSON.stringify(selectedOrder.items.map(i => ({ id: i.productId, q: i.quantity })));

    let newTotal = selectedOrder.totalAmount;
    if (itemsChanged) {
      newTotal = editItems.reduce((s, i) => s + (i.unitPrice || 0) * (i.quantity || 0), 0);
      const paidSoFar = selectedOrder.paidAmount || 0;

      // Overpaid — new total is less than what was already paid
      if (selectedOrder.isPaid && newTotal < paidSoFar) {
        warningNotification();
        showToast('undo payment first — new total is less than paid amount', 'error');
        return;
      }

      // Underpaid — new total exceeds paid amount, revert to unpaid
      if (selectedOrder.isPaid && newTotal > paidSoFar) {
        updates.isPaid = false;
        updates.paymentMethod = undefined;
        updates.paidAt = undefined;
      }
    }

    if (itemsChanged && editItems.length > 0) {
      // Atomic: items + metadata applied in a single store mutation so a sync
      // can never push a half-updated order.
      updateOrderWithItems(selectedOrder.id, editItems, updates);
    } else if (Object.keys(updates).length > 0) {
      updateOrder(selectedOrder.id, updates);
    }

    if (Object.keys(updates).length > 0 || itemsChanged) {
      // Read fresh from store to ensure we have the latest state
      const freshOrder = useSellerStore.getState().orders.find(o => o.id === selectedOrder.id);
      setSelectedOrder(freshOrder || { ...selectedOrder, ...updates, items: itemsChanged ? editItems : selectedOrder.items, totalAmount: newTotal, updatedAt: new Date() });
      mediumTap();
      showToast('order updated.', 'info');
    }
    setIsEditing(false);
  }, [selectedOrder, editNote, editPhone, editAddress, editDeliveryDate, editItems, updateOrder, updateOrderWithItems, showToast]);


  // Undo paid (with warning)
  // Call
  const handleCall = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  // WhatsApp
  const handleWhatsApp = useCallback((phone: string) => {
    let digits = phone.replace(/[^0-9]/g, '');
    // Malaysian numbers: convert leading 0 to country code 60
    if (digits.startsWith('60')) { /* already correct */ }
    else if (digits.startsWith('0')) digits = '60' + digits.slice(1);
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
    if (selectedIds.size === 0) {
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
    setPaymentNote('');
  }, [selectedIds]);

  const handleBulkMarkUnseen = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    lightTap();
    for (const id of ids) markOrderUnseen(id);
    setSelectedIds(new Set());
    showToast(`${ids.length} order${ids.length > 1 ? 's' : ''} marked unseen.`, 'info');
  }, [selectedIds, markOrderUnseen, showToast]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    warningNotification();
    Alert.alert(
      '',
      `delete ${ids.length} order${ids.length > 1 ? 's' : ''}? this cannot be undone.`,
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'delete',
          style: 'destructive',
          onPress: () => {
            const ordersToDelete = orders.filter(o => ids.includes(o.id));
            for (const o of ordersToDelete) {
              if (o.supabaseId) deleteOrderFromSupabase(o.supabaseId).catch(() =>
                showToast("couldn't remove some orders from server — will retry on next sync", 'error')
              );
            }
            deleteOrders(ids);
            setSelectedIds(new Set());
            showToast(`${ids.length} order${ids.length > 1 ? 's' : ''} deleted.`, 'info');
          },
        },
      ]
    );
  }, [selectedIds, deleteOrders, showToast]);

  const handleCancelSelect = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleClearFilters = useCallback(() => {
    setDeliveryFilter('all');
    setPaymentFilter('all');
    setPeriodFilter('all');
    setPaymentMethodFilter('all');
    setOverdueOnly(false);
    setOnlineOnly(false);
    setSearchInput('');
    lightTap();
  }, []);

  const handleSwipePay = useCallback((order: SellerOrder) => {
    if (order.source === 'order_link' && !seenSet.has(order.id)) {
      markOrdersSeen([order.id]);
    }
    const remaining = order.totalAmount - (order.paidAmount || 0);
    setDepositAmount(remaining > 0 ? remaining.toFixed(2) : '');
    setDepositMethod(null);
    setDepositNote('');
    setSwipePayOrder(order);
  }, [seenSet, markOrdersSeen]);

  // Read fresh order from store when opening detail (avoids stale data after edits)
  const handleOpenDetail = useCallback((order: SellerOrder) => {
    const fresh = useSellerStore.getState().orders.find(o => o.id === order.id);
    if (fresh?.source === 'order_link' && !seenSet.has(fresh.id)) {
      markOrdersSeen([fresh.id]);
    }
    setSelectedOrder(fresh || order);
  }, [seenSet, markOrdersSeen]);

  const renderOrder = useCallback(
    ({ item, index }: { item: SellerOrder; index: number }) => (
      <AnimatedOrderCard
        item={item}
        index={index}
        currency={currency}
        selectMode={selectMode}
        isSelected={selectedIds.has(item.id)}
        isUnseen={item.source === 'order_link' && !seenSet.has(item.id)}
        onOpenDetail={handleOpenDetail}
        onLongPress={handleLongPress}
        onToggleSelect={handleToggleSelect}
        onSwipePay={handleSwipePay}
        styles={styles}
      />
    ),
    [currency, selectMode, selectedIds, seenSet, handleOpenDetail, handleLongPress, handleToggleSelect, handleSwipePay, styles]
  );

  const renderGroup = useCallback(
    ({ item, index }: { item: CustomerGroup; index: number }) => (
      <GroupedCustomerCard
        group={item}
        index={index}
        currency={currency}
        selectMode={selectMode}
        selectedIds={selectedIds}
        seenSet={seenSet}
        onOpenDetail={handleOpenDetail}
        onLongPress={handleLongPress}
        onToggleSelect={handleToggleSelect}
        onSwipePay={handleSwipePay}
        styles={styles}
      />
    ),
    [currency, selectMode, selectedIds, seenSet, handleOpenDetail, handleLongPress, handleToggleSelect, handleSwipePay, styles]
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
        <Feather name="inbox" size={32} color={C.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>
        {hasActiveFilters ? 'no matching orders' : 'no orders yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {hasActiveFilters
          ? 'try adjusting your filters or search.'
          : 'tap + to record your first order.'}
      </Text>
      {!hasActiveFilters && (
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.emptyCta}
          onPress={() => navigation.navigate('SellerNewOrder')}
          accessibilityRole="button"
          accessibilityLabel="Create a new order"
        >
          <Feather name="plus" size={18} color={C.onAccent} />
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
      {/* ─── Search bar + filter + view toggle ─── */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="search orders..."
            placeholderTextColor={C.textMuted}
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
            accessibilityLabel="Search orders"
            accessibilityRole="search"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
          />
          {searchInput.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchInput('')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.sortButton, modalHasAdvancedFilters && styles.sortButtonActive]}
          activeOpacity={0.7}
          onPress={() => { lightTap(); setShowSortMenu(true); }}
          accessibilityRole="button"
          accessibilityLabel="Filter and sort"
        >
          <Feather name="sliders" size={18} color={C.bronze} />
          {modalHasAdvancedFilters && <View style={styles.sortActiveDot} />}
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.viewModeToggle}
          onPress={() => { selectionChanged(); setViewMode(v => v === 'grouped' ? 'list' : 'grouped'); }}
          accessibilityRole="button"
          accessibilityLabel={`View mode: ${viewMode}`}
        >
          <Feather name={viewMode === 'grouped' ? 'layers' : 'list'} size={16} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ─── Primary quick chips (single row) ─── */}
      <View style={styles.quickFilterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickFilterScroll}
          contentContainerStyle={styles.quickFilterRow}
        >
          {/* All */}
          <TouchableOpacity
            style={[styles.quickChip, activeChip === 'all' && styles.quickChipActive]}
            activeOpacity={0.7}
            onPress={() => { selectionChanged(); setDeliveryFilter('all'); setPaymentFilter('all'); setOnlineOnly(false); setOverdueOnly(false); }}
          >
            <Text style={[styles.quickChipText, activeChip === 'all' && styles.quickChipTextActive]}>all</Text>
          </TouchableOpacity>

          {/* Pending */}
          <TouchableOpacity
            style={[styles.quickChip, activeChip === 'pending' && styles.quickChipActive]}
            activeOpacity={0.7}
            onPress={() => { selectionChanged(); setDeliveryFilter('pending'); setPaymentFilter('all'); setOnlineOnly(false); setOverdueOnly(false); }}
          >
            <Text style={[styles.quickChipText, activeChip === 'pending' && styles.quickChipTextActive]}>pending</Text>
            {(statusCounts['pending'] || 0) > 0 && (
              <View style={[styles.chipCountBadge, { backgroundColor: withAlpha(statusColor('pending'), 0.15) }]}>
                <Text style={[styles.chipCountText, { color: statusColor('pending') }]}>{statusCounts['pending']}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Unpaid */}
          <TouchableOpacity
            style={[styles.quickChip, activeChip === 'unpaid' && styles.quickChipActive]}
            activeOpacity={0.7}
            onPress={() => { selectionChanged(); setPaymentFilter('unpaid'); setDeliveryFilter('all'); setOnlineOnly(false); setOverdueOnly(false); }}
          >
            <Text style={[styles.quickChipText, activeChip === 'unpaid' && styles.quickChipTextActive]}>unpaid</Text>
            {(statusCounts['unpaid'] || 0) > 0 && (
              <View style={[styles.chipCountBadge, { backgroundColor: withAlpha(C.bronze, 0.15) }]}>
                <Text style={[styles.chipCountText, { color: C.bronze }]}>{statusCounts['unpaid']}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Online */}
          <TouchableOpacity
            style={[styles.quickChip, activeChip === 'online' && styles.quickChipActive]}
            activeOpacity={0.7}
            onPress={() => { selectionChanged(); setOnlineOnly(true); setDeliveryFilter('all'); setPaymentFilter('all'); setOverdueOnly(false); }}
          >
            <Feather name="globe" size={12} color={semantic(BIZ_SAFE.success, isDark)} style={{ marginRight: 4 }} />
            <Text style={[styles.quickChipText, activeChip === 'online' && styles.quickChipTextActive]}>online</Text>
            {unseenOnlineCount > 0 && (
              <View style={[styles.chipCountBadge, { backgroundColor: withAlpha(semantic(BIZ_SAFE.warning, isDark), 0.2) }]}>
                <Text style={[styles.chipCountText, { color: semantic(BIZ_SAFE.warning, isDark) }]}>{unseenOnlineCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          {activeChip === 'online' && unseenOnlineCount > 0 && (
            <>
              <View style={styles.unseenHint}>
                <View style={styles.unseenHintBar} />
                <Text style={styles.unseenHintText}>{unseenOnlineCount} new</Text>
              </View>
              <TouchableOpacity
                style={styles.markAllSeenBtn}
                activeOpacity={0.7}
                onPress={() => { markAllOnlineSeen(); selectionChanged(); }}
              >
                <Text style={styles.markAllSeenText}>mark all seen</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Overdue */}
          <TouchableOpacity
            style={[styles.quickChip, activeChip === 'overdue' && styles.quickChipActive]}
            activeOpacity={0.7}
            onPress={() => { selectionChanged(); setOverdueOnly(true); setDeliveryFilter('all'); setPaymentFilter('all'); setOnlineOnly(false); }}
          >
            <Feather name="alert-circle" size={12} color={semantic(BIZ_SAFE.warning, isDark)} style={{ marginRight: 4 }} />
            <Text style={[styles.quickChipText, activeChip === 'overdue' && styles.quickChipTextActive]}>overdue</Text>
            {(overdueCount || 0) > 0 && (
              <View style={[styles.chipCountBadge, { backgroundColor: withAlpha(semantic(BIZ_SAFE.warning, isDark), 0.15) }]}>
                <Text style={[styles.chipCountText, { color: semantic(BIZ_SAFE.warning, isDark) }]}>{overdueCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
        <View style={styles.scrollHintRight} pointerEvents="none">
          <Feather name="chevron-right" size={16} color={C.textMuted} />
        </View>
      </View>

      {/* ─── Active filter summary ─── */}
      {hasActiveFilters && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>
            {filteredOrders.length} of {orders.length}
          </Text>
          <TouchableOpacity
            onPress={handleClearFilters}
            activeOpacity={0.7}
            style={styles.clearFiltersBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Feather name="x" size={14} color={C.bronze} />
            <Text style={styles.clearFiltersText}>clear</Text>
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
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.bronze} colors={[C.bronze]} />}
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
            <Feather name="x" size={16} color={C.textMuted} />
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
            style={[styles.bulkIconButton, { backgroundColor: semantic(BIZ_SAFE.success, isDark) }, selectedIds.size === 0 && styles.bulkPayButtonDisabled]}
            activeOpacity={0.7}
            onPress={handleBulkMarkPaid}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${selectedIds.size} orders as paid`}
          >
            <Feather name="dollar-sign" size={18} color={C.onAccent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkIconButton, { backgroundColor: semantic(BIZ_SAFE.warning, isDark) }, selectedIds.size === 0 && styles.bulkPayButtonDisabled]}
            activeOpacity={0.7}
            onPress={handleBulkMarkUnseen}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${selectedIds.size} orders as unseen`}
          >
            <Feather name="eye-off" size={18} color={C.onAccent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkIconButton, { backgroundColor: semantic(BIZ_SAFE.error, isDark) }, selectedIds.size === 0 && styles.bulkPayButtonDisabled]}
            activeOpacity={0.7}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selectedIds.size} orders`}
          >
            <Feather name="trash-2" size={18} color={C.onAccent} />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Filter & sort modal (lazy-mounted) ─── */}
      {showSortMenu && <Modal
        visible
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
          <View style={styles.filterSortSheet} onStartShouldSetResponder={() => true}>
            {/* Header */}
            <View style={styles.filterSortHeader}>
              <Text style={styles.sortSheetTitle}>filter & sort</Text>
              {(sortBy !== 'newest' || deliveryFilter !== 'all' || paymentFilter !== 'all' || periodFilter !== 'all' || overdueOnly || onlineOnly) && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { handleClearFilters(); setSortBy('newest'); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.filterSortClear}>reset</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.filterSortScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {/* Sort */}
              <Text style={styles.filterSectionLabel}>sort by</Text>
              <View style={styles.filterSectionPills}>
                {SORT_OPTIONS.map((opt) => {
                  const isActive = sortBy === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.filterPill, isActive && styles.filterPillActive]}
                      activeOpacity={0.7}
                      onPress={() => { selectionChanged(); setSortBy(opt.value); }}
                    >
                      <Feather name={opt.icon} size={13} color={isActive ? C.bronze : C.textMuted} />
                      <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Status */}
              <Text style={styles.filterSectionLabel}>status</Text>
              <View style={styles.filterSectionPills}>
                {DELIVERY_TABS.map((tab) => {
                  const isActive = deliveryFilter === tab.value;
                  const count = statusCounts[tab.value] || 0;
                  return (
                    <TouchableOpacity
                      key={`d_${tab.value}`}
                      style={[styles.filterPill, isActive && styles.filterPillActive]}
                      activeOpacity={0.7}
                      onPress={() => { selectionChanged(); setDeliveryFilter(tab.value); setOverdueOnly(false); }}
                    >
                      <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                        {tab.label}
                      </Text>
                      {count > 0 && tab.value !== 'all' && (
                        <Text style={[styles.filterPillCount, isActive && styles.filterPillCountActive]}>
                          {count}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Payment */}
              <Text style={styles.filterSectionLabel}>payment</Text>
              <View style={styles.filterSectionPills}>
                {(['all', 'unpaid', 'paid'] as ('all' | PaymentFilter)[]).map((pv) => {
                  const isActive = paymentFilter === pv;
                  const count = pv !== 'all' ? (statusCounts[pv] || 0) : 0;
                  return (
                    <TouchableOpacity
                      key={`p_${pv}`}
                      style={[styles.filterPill, isActive && styles.filterPillActive]}
                      activeOpacity={0.7}
                      onPress={() => { selectionChanged(); setPaymentFilter(pv); }}
                    >
                      <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                        {pv}
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

              {/* Period */}
              <Text style={styles.filterSectionLabel}>period</Text>
              <View style={styles.filterSectionPills}>
                {PERIOD_FILTERS.map((pf) => {
                  const isActive = periodFilter === pf.value;
                  return (
                    <TouchableOpacity
                      key={`t_${pf.value}`}
                      style={[styles.filterPill, isActive && styles.filterPillActive]}
                      activeOpacity={0.7}
                      onPress={() => { selectionChanged(); setPeriodFilter(pf.value); }}
                    >
                      <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                        {pf.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Toggles */}
              <Text style={styles.filterSectionLabel}>toggles</Text>
              <View style={styles.filterSectionPills}>
                <TouchableOpacity
                  style={[styles.filterPill, overdueOnly && styles.filterPillOverdue]}
                  activeOpacity={0.7}
                  onPress={() => { selectionChanged(); setOverdueOnly(!overdueOnly); }}
                >
                  <Feather name="alert-circle" size={13} color={overdueOnly ? semantic(BIZ_SAFE.overdue, isDark) : C.textMuted} />
                  <Text style={[styles.filterPillText, overdueOnly && styles.filterPillOverdueText]}>
                    overdue only
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterPill, onlineOnly && styles.filterPillActive]}
                  activeOpacity={0.7}
                  onPress={() => { selectionChanged(); setOnlineOnly(!onlineOnly); }}
                >
                  <Feather name="globe" size={13} color={onlineOnly ? C.bronze : C.textMuted} />
                  <Text style={[styles.filterPillText, onlineOnly && styles.filterPillTextActive]}>
                    online only
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Done button */}
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.filterSortDone}
              onPress={() => setShowSortMenu(false)}
            >
              <Text style={styles.filterSortDoneText}>done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>}

      {/* ─── Payment method picker modal (lazy-mounted) ─── */}
      {(!!pendingPayOrder || bulkPayIds.length > 0) && <Modal
        visible
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => { setPendingPayOrder(null); setBulkPayIds([]); setSelectedPaymentMethod(null); setPaymentNote(''); }}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <TouchableOpacity
          style={[styles.sortOverlay, { backgroundColor: 'transparent' }]}
          activeOpacity={1}
          onPress={() => { setPendingPayOrder(null); setBulkPayIds([]); setSelectedPaymentMethod(null); setPaymentNote(''); }}
        >
          <View style={styles.paymentSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.paymentSheetTitle}>
              {bulkPayIds.length > 0
                ? `mark ${bulkPayIds.length} order${bulkPayIds.length > 1 ? 's' : ''} paid`
                : 'mark as paid'}
            </Text>

            {/* Order context — unified card */}
            {pendingPayOrder && (() => {
              const paid = pendingPayOrder.paidAmount || 0;
              const remaining = pendingPayOrder.totalAmount - paid;
              const hasDeposits = paid > 0;
              return (
              <View style={styles.paymentContext}>
                <View style={styles.paymentContextRow}>
                  <Text style={styles.paymentContextName} numberOfLines={1}>
                    {pendingPayOrder.customerName || 'walk-in'}
                  </Text>
                  <Text style={styles.paymentContextAmount}>
                    {currency} {pendingPayOrder.totalAmount.toFixed(2)}
                  </Text>
                </View>
                {hasDeposits && (
                  <>
                    <View style={styles.payContextDivider} />
                    <View style={styles.payContextSubRow}>
                      <Text style={styles.payContextSubLabel}>paid <Text style={styles.payContextPaid}>{currency} {paid.toFixed(2)}</Text></Text>
                      <Text style={styles.payContextSubLabel}>remaining <Text style={styles.payContextRemaining}>{currency} {remaining.toFixed(2)}</Text></Text>
                    </View>
                  </>
                )}
              </View>
              );
            })()}
            {bulkPayIds.length > 0 && (
              <View style={styles.paymentContext}>
                <Text style={styles.paymentContextAmount}>
                  {currency} {orders.filter((o) => bulkPayIds.includes(o.id)).reduce((s, o) => s + (o.totalAmount - (o.paidAmount || 0)), 0).toFixed(2)}
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
                    <Feather name={m.icon} size={14} color={active ? semantic(BIZ_SAFE.success, isDark) : C.textSecondary} />
                    <Text style={[styles.paymentPillText, active && styles.paymentPillTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!selectedPaymentMethod && (
              <TextInput
                style={styles.paymentNoteInput}
                value={paymentNote}
                onChangeText={setPaymentNote}
                placeholder="note (optional)"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
            )}

            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.paymentConfirmBtn, !selectedPaymentMethod && styles.paymentConfirmBtnDisabled]}
              onPress={handleConfirmPayment}
              disabled={!selectedPaymentMethod}
              accessibilityRole="button"
              accessibilityLabel="Confirm payment"
            >
              <Feather name="check" size={16} color={selectedPaymentMethod ? C.onAccent : C.textMuted} />
              <Text style={[styles.paymentConfirmText, !selectedPaymentMethod && { color: C.textMuted }]}>
                confirm paid
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>}

      {/* ─── Order detail floating card (lazy-mounted) ─── */}
      {!!selectedOrder && <FloatingModal
        visible
        onClose={handleCloseModal}
        maxWidth={520}
      >
            {/* Fixed header */}
            {selectedOrder && (
              <>
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
                        { borderWidth: 1, borderColor: withAlpha(statusColor(selectedOrder.status), 0.5) },
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
                      <Feather name="x" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: Math.max(SPACING['3xl'], insets.bottom + SPACING.lg), paddingHorizontal: SPACING.lg }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {selectedOrder && (
                <>
                  {/* ── Section: Contact ── */}
                  {!isEditing && (!!selectedOrder.customerPhone || !!selectedOrder.customerAddress) && (
                    <View style={styles.modalSection}>
                      {!!selectedOrder.customerPhone && (
                        <View style={styles.phoneRow}>
                          <Feather name="phone" size={14} color={C.textMuted} />
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
                            <Feather name="phone-call" size={15} color={C.bronze} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.phoneButton}
                            onPress={() => handleWhatsApp(selectedOrder.customerPhone!)}
                            accessibilityRole="button"
                            accessibilityLabel="WhatsApp customer"
                          >
                            <Feather name="message-circle" size={15} color={C.bronze} />
                          </TouchableOpacity>
                        </View>
                      )}
                      {!!selectedOrder.customerAddress && (
                        <View style={styles.addressRow}>
                          <Feather name="map-pin" size={14} color={C.textMuted} />
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
                            <Feather name="navigation" size={15} color={C.bronze} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {/* ── Edit mode ── */}
                  {isEditing && (
                    <View style={styles.editSection}>
                      {/* ── Items ── */}
                      <Text style={styles.editFieldLabel}>items</Text>
                      <View style={styles.editItemsList}>
                        {editItems.map((item, i) => (
                          <View key={`ei_${i}`} style={[styles.editItemRow, i < editItems.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.editItemName} numberOfLines={1}>{item.productName}</Text>
                              <Text style={styles.editItemPrice}>{currency} {item.unitPrice.toFixed(2)} / {item.unit}</Text>
                            </View>
                            <View style={styles.editItemStepper}>
                              <TouchableOpacity
                                onPress={() => { lightTap(); setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it)); }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Feather name="minus-circle" size={20} color={C.textMuted} />
                              </TouchableOpacity>
                              <Text style={styles.editItemQty}>{item.quantity}</Text>
                              <TouchableOpacity
                                onPress={() => { lightTap(); setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: it.quantity + 1 } : it)); }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Feather name="plus-circle" size={20} color={C.bronze} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  lightTap();
                                  const hasPaid = (selectedOrder?.paidAmount || 0) > 0;
                                  if (editItems.length <= 1 || hasPaid) {
                                    setDeleteItemConfirm({ index: i, item: editItems[i], hasPaid });
                                  } else {
                                    setEditItems(prev => prev.filter((_, idx) => idx !== i));
                                  }
                                }}
                                hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
                                style={{ marginLeft: 6 }}
                              >
                                <Feather name="trash-2" size={16} color={C.textMuted} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                        {products.filter(p => p.isActive && !editItems.some(ei => ei.productId === p.id)).length > 0 && (
                          <TouchableOpacity
                            style={styles.editItemAddBtn}
                            activeOpacity={0.7}
                            onPress={() => { lightTap(); setShowAddProductModal(true); }}
                          >
                            <Feather name="plus" size={14} color={C.bronze} />
                            <Text style={styles.editItemAddText}>add product</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* ── Phone ── */}
                      <Text style={styles.editFieldLabel}>phone</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editPhone}
                        onChangeText={setEditPhone}
                        placeholder="customer phone"
                        placeholderTextColor={C.textMuted}
                        keyboardType="phone-pad"
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />

                      {/* ── Address ── */}
                      <Text style={styles.editFieldLabel}>address</Text>
                      <TextInput
                        style={[styles.editInput, styles.editInputMultiline]}
                        value={editAddress}
                        onChangeText={setEditAddress}
                        placeholder="customer address"
                        placeholderTextColor={C.textMuted}
                        multiline
                        numberOfLines={3}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />

                      {/* ── Delivery date (keyboard modal) ── */}
                      <Text style={styles.editFieldLabel}>delivery date</Text>
                      <TouchableOpacity
                        style={[styles.editInput, styles.editDateButton]}
                        activeOpacity={0.7}
                        onPress={() => setShowDeliveryDateModal(true)}
                      >
                        <Feather name="calendar" size={15} color={editDeliveryDate ? C.bronze : C.textMuted} />
                        <Text style={[styles.editDateButtonText, !editDeliveryDate && { color: C.textMuted }]}>
                          {editDeliveryDate ? format(editDeliveryDate, 'd MMM yyyy') : 'tap to set'}
                        </Text>
                        {!!editDeliveryDate && (
                          <TouchableOpacity onPress={() => setEditDeliveryDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Feather name="x" size={14} color={C.textMuted} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>

                      {/* ── Note ── */}
                      <Text style={styles.editFieldLabel}>note</Text>
                      <TextInput
                        style={[styles.editInput, styles.editInputMultiline]}
                        value={editNote}
                        onChangeText={setEditNote}
                        placeholder="order note"
                        placeholderTextColor={C.textMuted}
                        multiline
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />

                      <View style={styles.editActions}>
                        <TouchableOpacity style={styles.editCancelButton} activeOpacity={0.7} onPress={() => setIsEditing(false)}>
                          <Text style={styles.editCancelText}>cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editSaveButton} activeOpacity={0.7} onPress={handleSaveEdit}>
                          <Feather name="check" size={16} color={C.onAccent} />
                          <Text style={styles.editSaveText}>save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* ── Section: Date + Delivery + Lifecycle ── */}
                  {!isEditing && (
                    <View style={styles.modalSection}>
                      <View style={styles.modalDateRow}>
                        <Feather name="calendar" size={14} color={C.textMuted} />
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
                                  ? semantic(BIZ_SAFE.overdue, isDark)
                                  : info.isTodayDelivery
                                    ? semantic(BIZ_SAFE.warning, isDark)
                                    : C.textMuted
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
                        styles={styles}
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
                          {item.productName} {'\u00D7'}{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)} {item.unit}
                        </Text>
                        <Text style={styles.modalItemPrice}>
                          {currency} {(item.unitPrice * item.quantity).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* ── Payment history ── */}
                  {((selectedOrder.deposits && selectedOrder.deposits.length > 0) || selectedOrder.isPaid) && (
                    <View style={styles.modalSection}>
                      <View style={styles.payHistoryHeader}>
                        <Text style={[styles.modalSectionLabel, { marginBottom: 0 }]}>payment history</Text>
                        {(selectedOrder.deposits && selectedOrder.deposits.length > 0) && (
                          <TouchableOpacity
                            onPress={() => {
                              lightTap();
                              // Same rule as editing items: a transferred order's money
                              // is in personal — move it back out first, then edit payments
                              // (removing a payment un-pays the order, which can't stay
                              // "transferred"). Untransferred orders edit directly.
                              if (selectedOrder.transferredToPersonal) {
                                Alert.alert(
                                  'this order was sent to personal',
                                  `to change its payments we'll move its ${currency} ${selectedOrder.totalAmount.toFixed(2)} back out of personal first — you can send it again next transfer. continue?`,
                                  [
                                    { text: 'cancel', style: 'cancel' },
                                    {
                                      text: 'move back & edit',
                                      onPress: () => {
                                        untransferOrder(selectedOrder.id);
                                        setSelectedOrder({ ...selectedOrder, transferredToPersonal: false, transferId: undefined });
                                        setEditingPayHistory(true);
                                        setEditPayIdx(null);
                                      },
                                    },
                                  ]
                                );
                                return;
                              }
                              setEditingPayHistory(true);
                              setEditPayIdx(null);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Feather name="edit-2" size={14} color={C.bronze} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {(selectedOrder.deposits && selectedOrder.deposits.length > 0)
                        ? selectedOrder.deposits.map((d, i) => {
                            const d2 = d.date instanceof Date ? d.date : new Date(d.date);
                            return (
                              <View key={i} style={[styles.payHistoryRow, { flexWrap: 'wrap' }, i < selectedOrder.deposits!.length - 1 && styles.modalItemRowBorder]}>
                                <Feather name={paymentMethodIcon(d.method)} size={13} color={semantic(BIZ_SAFE.success, isDark)} />
                                <Text style={styles.payHistoryMethod}>{paymentMethodLabel(d.method)}</Text>
                                <Text style={styles.payHistoryDate}>{format(d2, 'd MMM, h:mm a')}</Text>
                                <Text style={styles.payHistoryAmount}>{currency} {d.amount.toFixed(2)}</Text>
                                {d.note ? (() => {
                                  const tipMatch = d.note.match(/(tip\s+\S+\s+[\d,.]+)/i);
                                  if (tipMatch) {
                                    const idx = d.note.indexOf(tipMatch[1]);
                                    const before = d.note.slice(0, idx).replace(/\s*·\s*$/, '');
                                    const tipText = tipMatch[1];
                                    return (
                                      <Text style={{ width: '100%', fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2, paddingLeft: 21 }}>
                                        {before ? <>{before} · </> : null}
                                        <Text style={{ color: C.bronze }}>{tipText}</Text>
                                      </Text>
                                    );
                                  }
                                  return <Text style={{ width: '100%', fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2, paddingLeft: 21 }}>{d.note}</Text>;
                                })() : null}
                              </View>
                            );
                          })
                        : (
                          <View style={styles.payHistoryRow}>
                            <Feather name={paymentMethodIcon(selectedOrder.paymentMethod)} size={13} color={semantic(BIZ_SAFE.success, isDark)} />
                            <Text style={styles.payHistoryMethod}>{paymentMethodLabel(selectedOrder.paymentMethod)}</Text>
                            {selectedOrder.paidAt && (
                              <Text style={styles.payHistoryDate}>{format(selectedOrder.paidAt instanceof Date ? selectedOrder.paidAt : new Date(selectedOrder.paidAt), 'd MMM, h:mm a')}</Text>
                            )}
                            <Text style={styles.payHistoryAmount}>{currency} {selectedOrder.totalAmount.toFixed(2)}</Text>
                          </View>
                        )
                      }
                      {!selectedOrder.isPaid && (selectedOrder.paidAmount || 0) > 0 && (
                        <View style={styles.payHistoryBalance}>
                          <Text style={styles.payHistoryBalanceLabel}>remaining</Text>
                          <Text style={styles.payHistoryBalanceAmount}>
                            {currency} {(selectedOrder.totalAmount - (selectedOrder.paidAmount || 0)).toFixed(2)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Note */}
                  {!isEditing && selectedOrder.note && (
                    <View style={styles.modalSection}>
                      <View style={styles.modalNoteRow}>
                        <Feather name="file-text" size={14} color={C.textMuted} />
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
                        <Feather name={showRawWhatsApp ? 'chevron-up' : 'chevron-down'} size={14} color={C.textMuted} />
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
                      {/* Primary: Status advance — one primary CTA */}
                      {NEXT_STATUS[selectedOrder.status] && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={[styles.advanceButton, { backgroundColor: statusColor(NEXT_STATUS[selectedOrder.status]!) }]}
                          onPress={() => handleAdvanceStatus(selectedOrder)}
                          accessibilityRole="button"
                          accessibilityLabel={`Mark order as ${NEXT_STATUS[selectedOrder.status]}`}
                        >
                          <Feather name={advanceIcon(selectedOrder.status)} size={18} color={C.onAccent} />
                          <Text style={styles.advanceButtonText}>
                            mark as {NEXT_STATUS[selectedOrder.status]}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Payment group — secondary outline */}
                      {!selectedOrder.isPaid && (
                        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.outlineButton, { flex: 1 }]}
                            onPress={() => {
                              lightTap();
                              setDepositAmount('');
                              setDepositMethod(null);
                              setDepositNote('');
                              setShowDepositInput(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Record a deposit"
                          >
                            <Feather name="credit-card" size={16} color={C.bronze} />
                            <Text style={[styles.outlineButtonText, { color: C.bronze }]}>deposit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.outlineButton, { flex: 1 }]}
                            onPress={() => {
                              lightTap();
                              setPendingPayOrder(selectedOrder);
                              setSelectedPaymentMethod(null);
                              setPaymentNote('');
                              setSelectedOrder(null);
                              setShowRawWhatsApp(false);
                              setIsEditing(false);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Mark order as paid"
                          >
                            <Feather name="dollar-sign" size={16} color={C.accent} />
                            <Text style={[styles.outlineButtonText, { color: C.accent }]}>mark as paid</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Utility row — 2-column grid */}
                      <View style={styles.secondaryActionsGrid}>
                        {selectedOrder.status === 'completed' && (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.gridAction}
                            onPress={() => handleShareReceiptWA(selectedOrder)}
                            accessibilityRole="button"
                            accessibilityLabel="Send receipt via WhatsApp"
                          >
                            <Feather name="send" size={16} color={C.accent} />
                            <Text style={[styles.gridActionText, { color: C.accent }]}>send receipt</Text>
                          </TouchableOpacity>
                        )}

                        {!selectedOrder.isPaid && (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.gridAction}
                            onPress={() => handleSendQR(selectedOrder)}
                            accessibilityRole="button"
                            accessibilityLabel="Send QR with total via WhatsApp"
                          >
                            <Feather name="maximize" size={16} color={C.accent} />
                            <Text style={[styles.gridActionText, { color: C.accent }]}>send QR</Text>
                          </TouchableOpacity>
                        )}

                        {!selectedOrder.isPaid && (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.gridAction}
                            onPress={() => handleSendReminder(selectedOrder)}
                            accessibilityRole="button"
                            accessibilityLabel="Copy reminder"
                          >
                            <Feather name="message-circle" size={16} color={C.bronze} />
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
                          <Feather name="edit-2" size={16} color={C.bronze} />
                          <Text style={styles.gridActionText}>edit</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Delete — separated, with icon */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.deleteButton}
                        onPress={() => handleDeleteOrder(selectedOrder)}
                        accessibilityRole="button"
                        accessibilityLabel="Delete this order"
                      >
                        <Feather name="trash-2" size={14} color={C.textMuted} />
                        <Text style={styles.deleteButtonText}>delete order</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* ─── Delivery date calendar overlay (inside modalSheet — same native layer) ─── */}
            {showDeliveryDateModal && (
              <TouchableOpacity
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }]}
                activeOpacity={1}
                onPress={() => setShowDeliveryDateModal(false)}
              >
                <View style={[styles.dateModalSheet, { padding: SPACING.md }]} onStartShouldSetResponder={() => true}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                    <Text style={styles.dateModalTitle}>delivery date</Text>
                    <TouchableOpacity onPress={() => setShowDeliveryDateModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Feather name="x" size={17} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <CalendarPicker
                    value={editDeliveryDate ?? new Date()}
                    onChange={(date) => { setEditDeliveryDate(date); setShowDeliveryDateModal(false); }}
                  />
                </View>
              </TouchableOpacity>
            )}

        {/* ─── Deposit overlay (inside detail modal) ─── */}

        {/* ─── Add product picker overlay (inside detail modal, flex:1 level) ─── */}
        {showAddProductModal && (
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, styles.sortOverlay]}
            activeOpacity={1}
            onPress={() => { setShowAddProductModal(false); setAddProductSearch(''); }}
          >
            <View style={[styles.paymentSheet, { maxHeight: '70%' }]} onStartShouldSetResponder={() => true}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                <Text style={styles.paymentSheetTitle}>add items</Text>
                <TouchableOpacity onPress={() => { setShowAddProductModal(false); setAddProductSearch(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Search */}
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm, gap: SPACING.xs }}>
                <Feather name="search" size={14} color={C.textMuted} />
                <TextInput
                  style={{ flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, paddingVertical: SPACING.sm }}
                  value={addProductSearch}
                  onChangeText={setAddProductSearch}
                  placeholder="search products..."
                  placeholderTextColor={C.textMuted}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
                {addProductSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setAddProductSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x" size={13} color={C.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Product list */}
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {products
                  .filter(p => p.isActive && !editItems.some(ei => ei.productId === p.id))
                  .filter(p => !addProductSearch || p.name.toLowerCase().includes(addProductSearch.toLowerCase()))
                  .map((p, idx, arr) => (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.7}
                      style={[
                        { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm },
                        idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
                      ]}
                      onPress={() => {
                        lightTap();
                        setEditItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: p.pricePerUnit, unit: p.unit }]);
                        setShowAddProductModal(false);
                        setAddProductSearch('');
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: C.textPrimary }}>{p.name}</Text>
                        <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2 }}>{currency} {p.pricePerUnit.toFixed(2)} / {p.unit}</Text>
                      </View>
                      <Feather name="plus-circle" size={18} color={C.bronze} />
                    </TouchableOpacity>
                  ))
                }
              </ScrollView>
            </View>
          </TouchableOpacity>
        )}

      {/* ─── Record deposit modal (overlay inside detail modal — iOS can't stack modals) ─── */}
      {showDepositInput && selectedOrder && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, styles.sortOverlay]}
          activeOpacity={1}
          onPress={() => setShowDepositInput(false)}
        >
          <View style={styles.paymentSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.paymentSheetTitle}>record deposit</Text>

            {(() => {
              const paid = selectedOrder.paidAmount || 0;
              const rem = selectedOrder.totalAmount - paid;
              const hasDeposits = paid > 0;
              return (
              <View style={styles.paymentContext}>
                <View style={styles.paymentContextRow}>
                  <Text style={styles.paymentContextName} numberOfLines={1}>
                    {selectedOrder.customerName || 'walk-in'}
                  </Text>
                  <Text style={styles.paymentContextAmount}>
                    {currency} {selectedOrder.totalAmount.toFixed(2)}
                  </Text>
                </View>
                {hasDeposits && (
                  <>
                    <View style={styles.payContextDivider} />
                    <View style={styles.payContextSubRow}>
                      <Text style={styles.payContextSubLabel}>paid <Text style={styles.payContextPaid}>{currency} {paid.toFixed(2)}</Text></Text>
                      <Text style={styles.payContextSubLabel}>remaining <Text style={styles.payContextRemaining}>{currency} {rem.toFixed(2)}</Text></Text>
                    </View>
                  </>
                )}
              </View>
              );
            })()}

            <View style={styles.payAmountRow}>
              <Text style={styles.payAmountPrefix}>{currency}</Text>
              <TextInput
                style={styles.payAmountInput}
                value={depositAmount}
                onChangeText={setDepositAmount}
                placeholder="amount"
                placeholderTextColor={C.textMuted}
                keyboardType="decimal-pad"
                autoFocus
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
            </View>
            {(() => {
              const remaining = selectedOrder.totalAmount - (selectedOrder.paidAmount || 0);
              const entered = parseFloat(depositAmount) || 0;
              if (entered > remaining && remaining > 0) {
                return (
                  <Text style={styles.tipHint}>
                    includes {currency} {(entered - remaining).toFixed(2)} tip
                  </Text>
                );
              }
              return <View style={{ marginBottom: SPACING.xs }} />;
            })()}

            <View style={styles.paymentPickerRow}>
              {PAYMENT_METHODS.map((m) => {
                const active = depositMethod === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    activeOpacity={0.7}
                    style={[styles.paymentPill, active && styles.paymentPillActive]}
                    onPress={() => { selectionChanged(); setDepositMethod(m.value); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Deposit via ${m.label}`}
                  >
                    <Feather name={m.icon} size={14} color={active ? semantic(BIZ_SAFE.success, isDark) : C.textSecondary} />
                    <Text style={[styles.paymentPillText, active && styles.paymentPillTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!depositMethod && (
              <TextInput
                style={styles.paymentNoteInput}
                value={depositNote}
                onChangeText={setDepositNote}
                placeholder="note (optional)"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
            )}

            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.paymentConfirmBtn, !depositMethod && styles.paymentConfirmBtnDisabled]}
              disabled={!depositMethod}
              onPress={() => {
                if (!depositMethod) return;
                const amt = parseFloat(depositAmount);
                if (!amt || amt <= 0) {
                  warningNotification();
                  showToast('enter a valid amount.', 'error');
                  return;
                }
                const remaining = selectedOrder.totalAmount - (selectedOrder.paidAmount || 0);
                // Auto-append tip note when overpaying
                let finalNote = depositNote.trim();
                if (amt > remaining && remaining > 0) {
                  const tip = amt - remaining;
                  const tipText = `tip ${currency} ${tip.toFixed(2)}`;
                  finalNote = finalNote ? `${finalNote} · ${tipText}` : tipText;
                }
                mediumTap();
                recordPayment(selectedOrder.id, amt, depositMethod, finalNote || undefined);
                const freshOrder = useSellerStore.getState().orders.find(o => o.id === selectedOrder.id);
                if (freshOrder) {
                  setSelectedOrder(freshOrder);
                } else {
                  const newPaid = (selectedOrder.paidAmount || 0) + amt;
                  const fullyPaid = newPaid >= selectedOrder.totalAmount;
                  setSelectedOrder({
                    ...selectedOrder,
                    paidAmount: newPaid,
                    isPaid: fullyPaid,
                    paymentMethod: depositMethod,
                    paidAt: fullyPaid ? new Date() : selectedOrder.paidAt,
                    updatedAt: new Date(),
                  });
                }
                setShowDepositInput(false);
                const newPaid = (selectedOrder.paidAmount || 0) + amt;
                const fullyPaid = newPaid >= selectedOrder.totalAmount;
                const tipAmt = newPaid - selectedOrder.totalAmount;
                showToast(
                  tipAmt > 0
                    ? `fully paid! +${currency} ${tipAmt.toFixed(2)} tip`
                    : fullyPaid ? 'fully paid!' : `deposit of ${currency} ${amt.toFixed(2)} recorded.`,
                  'info'
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Save deposit"
            >
              <Feather name="check" size={16} color={C.onAccent} />
              <Text style={styles.paymentConfirmText}>save deposit</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* ─── Edit payments overlay ─── */}
      {editingPayHistory && selectedOrder && selectedOrder.deposits && selectedOrder.deposits.length > 0 && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, styles.sortOverlay]}
          activeOpacity={1}
          onPress={() => { setEditingPayHistory(false); setEditPayIdx(null); }}
        >
          <View style={styles.paymentSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.paymentSheetTitle}>edit payments</Text>

            {/* Context card */}
            {(() => {
              const paid = selectedOrder.paidAmount || 0;
              const rem = selectedOrder.totalAmount - paid;
              return (
              <View style={styles.paymentContext}>
                <View style={styles.paymentContextRow}>
                  <Text style={styles.paymentContextName} numberOfLines={1}>
                    {selectedOrder.customerName || 'walk-in'}
                  </Text>
                  <Text style={styles.paymentContextAmount}>
                    {currency} {selectedOrder.totalAmount.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.payContextDivider} />
                <View style={styles.payContextSubRow}>
                  <Text style={styles.payContextSubLabel}>paid <Text style={styles.payContextPaid}>{currency} {paid.toFixed(2)}</Text></Text>
                  <Text style={styles.payContextSubLabel}>remaining <Text style={styles.payContextRemaining}>{currency} {rem.toFixed(2)}</Text></Text>
                </View>
              </View>
              );
            })()}

            {selectedOrder.deposits.map((d, i) => {
              const d2 = d.date instanceof Date ? d.date : new Date(d.date);
              const isEditingThis = editPayIdx === i;
              return (
                <View key={i} style={[{ paddingVertical: SPACING.sm }, i < selectedOrder.deposits!.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                    <Feather name={paymentMethodIcon(d.method)} size={14} color={semantic(BIZ_SAFE.success, isDark)} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: semantic(BIZ_SAFE.success, isDark) }}>{paymentMethodLabel(d.method)}</Text>
                      <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 1 }}>{format(d2, 'd MMM yyyy, h:mm a')}</Text>
                      {d.note ? (() => {
                        const tipMatch = d.note.match(/(tip\s+\S+\s+[\d,.]+)/i);
                        if (tipMatch) {
                          const tidx = d.note.indexOf(tipMatch[1]);
                          const before = d.note.slice(0, tidx).replace(/\s*·\s*$/, '');
                          return (
                            <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2 }}>
                              {before ? <>{before} · </> : null}
                              <Text style={{ color: C.bronze }}>{tipMatch[1]}</Text>
                            </Text>
                          );
                        }
                        return <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: 2 }}>{d.note}</Text>;
                      })() : null}
                    </View>
                    <Text style={{ fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary }}>{currency} {d.amount.toFixed(2)}</Text>
                    <TouchableOpacity
                      onPress={() => { lightTap(); if (isEditingThis) { setEditPayIdx(null); } else { setEditPayIdx(i); setEditPayAmount(d.amount.toFixed(2)); setEditPayMethod(d.method); setEditPayNote(d.note || ''); } }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name={isEditingThis ? 'chevron-up' : 'edit-2'} size={15} color={C.bronze} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { lightTap(); setRemoveDepositConfirm({ idx: i, deposit: d }); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={15} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {isEditingThis && (
                    <View style={{ marginTop: SPACING.xs, gap: SPACING.sm }}>
                      <View style={styles.payAmountRow}>
                        <Text style={styles.payAmountPrefix}>{currency}</Text>
                        <TextInput
                          autoFocus
                          style={styles.payAmountInput}
                          value={editPayAmount}
                          onChangeText={setEditPayAmount}
                          keyboardType="decimal-pad"
                          placeholder="amount"
                          placeholderTextColor={C.textMuted}
                          returnKeyType="done"
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          selectionColor={C.accent}
                        />
                      </View>
                      {(() => {
                        const currentAmt = d.amount;
                        const remainingExcl = selectedOrder.totalAmount - ((selectedOrder.paidAmount || 0) - currentAmt);
                        const entered = parseFloat(editPayAmount) || 0;
                        if (entered > remainingExcl && remainingExcl > 0) {
                          return <Text style={styles.tipHint}>includes {currency} {(entered - remainingExcl).toFixed(2)} tip</Text>;
                        }
                        return null;
                      })()}
                      <TextInput
                        style={styles.paymentNoteInput}
                        value={editPayNote}
                        onChangeText={setEditPayNote}
                        placeholder="note (optional)"
                        placeholderTextColor={C.textMuted}
                        returnKeyType="done"
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />
                      <View style={styles.paymentPickerRow}>
                        {PAYMENT_METHODS.map((m) => {
                          const active = editPayMethod === m.value;
                          return (
                            <TouchableOpacity
                              key={m.value}
                              activeOpacity={0.7}
                              style={[styles.paymentPill, active && styles.paymentPillActive]}
                              onPress={() => { lightTap(); setEditPayMethod(m.value as SellerPaymentMethod); }}
                            >
                              <Feather name={m.icon} size={13} color={active ? semantic(BIZ_SAFE.success, isDark) : C.textSecondary} />
                              <Text style={[styles.paymentPillText, active && styles.paymentPillTextActive]}>{m.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.paymentConfirmBtn}
                        onPress={() => {
                          const amt = parseFloat(editPayAmount);
                          if (!amt || amt <= 0) { warningNotification(); showToast('enter a valid amount.', 'error'); return; }
                          mediumTap();
                          const noteVal = editPayNote.trim() || undefined;
                          updateDeposit(selectedOrder.id, i, amt, editPayMethod, noteVal);
                          const deps = selectedOrder.deposits!.map((dep, idx) => idx === i ? { ...dep, amount: amt, method: editPayMethod, note: noteVal } : dep);
                          const newPaid = deps.reduce((s, dep) => s + dep.amount, 0);
                          const fullyPaid = newPaid >= selectedOrder.totalAmount;
                          setSelectedOrder({ ...selectedOrder, deposits: deps, paidAmount: newPaid, isPaid: fullyPaid, paymentMethod: editPayMethod, paidAt: fullyPaid ? (selectedOrder.paidAt || new Date()) : undefined, updatedAt: new Date() });
                          setEditPayIdx(null);
                          showToast('payment updated.', 'info');
                        }}
                      >
                        <Feather name="check" size={16} color={C.onAccent} />
                        <Text style={styles.paymentConfirmText}>save</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

          </View>
        </TouchableOpacity>
      )}

      {/* ─── Navigation app picker overlay ─── */}
      {!!navAddress && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, styles.sortOverlay]}
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
                  <Feather name="map" size={18} color={C.bronze} />
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
                  <Feather name="navigation" size={18} color={C.bronze} />
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
                    <Feather name="compass" size={18} color={C.bronze} />
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
      )}

      {/* ─── Delete item confirmation overlay ─── */}
      {deleteItemConfirm && (() => {
        const isLastItem = editItems.length <= 1;
        return (
        <TouchableOpacity style={[StyleSheet.absoluteFill, styles.sortOverlay]} activeOpacity={1} onPress={() => setDeleteItemConfirm(null)}>
            <View style={styles.deleteConfirmCard} onStartShouldSetResponder={() => true}>
              <View style={styles.deleteConfirmIconWrap}>
                <Feather name={isLastItem ? 'shield' : 'alert-triangle'} size={24} color={C.bronze} />
              </View>
              <Text style={styles.deleteConfirmTitle}>
                {isLastItem ? 'can\'t remove' : 'remove item?'}
              </Text>
              <Text style={styles.deleteConfirmItem}>
                {deleteItemConfirm.item.productName} × {deleteItemConfirm.item.quantity}
              </Text>
              {!isLastItem && (
                <Text style={styles.deleteConfirmAmount}>
                  − {currency} {(deleteItemConfirm.item.unitPrice * deleteItemConfirm.item.quantity).toFixed(2)}
                </Text>
              )}
              <View style={styles.deleteConfirmWarning}>
                <Feather name="info" size={14} color={C.bronze} style={{ marginTop: 1 }} />
                <Text style={styles.deleteConfirmWarningText}>
                  {isLastItem
                    ? 'an order must have at least one item. add another item first before removing this one.'
                    : 'this order has payments recorded. the paid amount will stay the same — you may need to adjust deposits manually.'}
                </Text>
              </View>
              <View style={styles.deleteConfirmActions}>
                {isLastItem ? (
                  <TouchableOpacity
                    style={[styles.deleteConfirmCancel, { flex: 1 }]}
                    activeOpacity={0.7}
                    onPress={() => setDeleteItemConfirm(null)}
                  >
                    <Text style={styles.deleteConfirmCancelText}>got it</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.deleteConfirmCancel}
                      activeOpacity={0.7}
                      onPress={() => setDeleteItemConfirm(null)}
                    >
                      <Text style={styles.deleteConfirmCancelText}>keep</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteConfirmRemove}
                      activeOpacity={0.7}
                      onPress={() => {
                        mediumTap();
                        const idx = deleteItemConfirm.index;
                        setEditItems(prev => prev.filter((_, i) => i !== idx));
                        setDeleteItemConfirm(null);
                      }}
                    >
                      <Feather name="trash-2" size={14} color={C.onAccent} />
                      <Text style={styles.deleteConfirmRemoveText}>remove</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })()}

      {/* ─── Remove deposit confirmation overlay ─── */}
      {removeDepositConfirm && selectedOrder && (
        <TouchableOpacity style={[StyleSheet.absoluteFill, styles.sortOverlay]} activeOpacity={1} onPress={() => setRemoveDepositConfirm(null)}>
            <View style={styles.deleteConfirmCard} onStartShouldSetResponder={() => true}>
              <View style={styles.deleteConfirmIconWrap}>
                <Feather name="trash-2" size={24} color={C.bronze} />
              </View>
              <Text style={styles.deleteConfirmTitle}>remove payment?</Text>
              <Text style={styles.deleteConfirmItem}>
                {paymentMethodLabel(removeDepositConfirm.deposit.method)} · {format(
                  removeDepositConfirm.deposit.date instanceof Date ? removeDepositConfirm.deposit.date : new Date(removeDepositConfirm.deposit.date),
                  'd MMM, h:mm a'
                )}
              </Text>
              <Text style={styles.deleteConfirmAmount}>
                − {currency} {removeDepositConfirm.deposit.amount.toFixed(2)}
              </Text>
              <View style={styles.deleteConfirmWarning}>
                <Feather name="info" size={14} color={C.bronze} style={{ marginTop: 1 }} />
                <Text style={styles.deleteConfirmWarningText}>
                  removing this payment will update the order balance.
                </Text>
              </View>
              <View style={styles.deleteConfirmActions}>
                <TouchableOpacity
                  style={styles.deleteConfirmCancel}
                  activeOpacity={0.7}
                  onPress={() => setRemoveDepositConfirm(null)}
                >
                  <Text style={styles.deleteConfirmCancelText}>keep</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteConfirmRemove}
                  activeOpacity={0.7}
                  onPress={() => {
                    mediumTap();
                    const idx = removeDepositConfirm.idx;
                    removeDeposit(selectedOrder.id, idx);
                    const deps = selectedOrder.deposits!.filter((_, i) => i !== idx);
                    const newPaid = deps.reduce((s, dep) => s + dep.amount, 0);
                    const fullyPaid = newPaid >= selectedOrder.totalAmount;
                    setSelectedOrder({ ...selectedOrder, deposits: deps, paidAmount: newPaid, isPaid: fullyPaid, paymentMethod: deps.length > 0 ? deps[deps.length - 1].method : undefined, paidAt: fullyPaid ? selectedOrder.paidAt : undefined, updatedAt: new Date() });
                    if (editPayIdx === idx) setEditPayIdx(null);
                    if (deps.length === 0) setEditingPayHistory(false);
                    setRemoveDepositConfirm(null);
                    showToast('payment removed.', 'info');
                  }}
                >
                  <Feather name="trash-2" size={14} color={C.onAccent} />
                  <Text style={styles.deleteConfirmRemoveText}>remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
      )}

        <ModalToastHost />
      </FloatingModal>}

      {/* ─── Swipe-to-pay compact payment modal ─── */}
      {!!swipePayOrder && (
        <FloatingModal visible onClose={() => setSwipePayOrder(null)} maxWidth={400}>
          <View style={styles.swipePayContent}>
            <Text style={styles.paymentSheetTitle}>{t.seller.olRecordPayment}</Text>

            <View style={styles.paymentContext}>
              <View style={styles.paymentContextRow}>
                <Text style={styles.paymentContextName} numberOfLines={1}>
                  {swipePayOrder.customerName || 'walk-in'}
                </Text>
                <Text style={styles.paymentContextAmount}>
                  {currency} {swipePayOrder.totalAmount.toFixed(2)}
                </Text>
              </View>
              {(swipePayOrder.paidAmount || 0) > 0 && (
                <>
                  <View style={styles.payContextDivider} />
                  <View style={styles.payContextSubRow}>
                    <Text style={styles.payContextSubLabel}>paid <Text style={styles.payContextPaid}>{currency} {(swipePayOrder.paidAmount || 0).toFixed(2)}</Text></Text>
                    <Text style={styles.payContextSubLabel}>remaining <Text style={styles.payContextRemaining}>{currency} {(swipePayOrder.totalAmount - (swipePayOrder.paidAmount || 0)).toFixed(2)}</Text></Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.payAmountRow}>
              <Text style={styles.payAmountPrefix}>{currency}</Text>
              <TextInput
                style={styles.payAmountInput}
                value={depositAmount}
                onChangeText={setDepositAmount}
                placeholder="amount"
                placeholderTextColor={C.textMuted}
                keyboardType="decimal-pad"
                autoFocus
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
            </View>

            <View style={styles.quickFillRow}>
              {(() => {
                const paid = swipePayOrder.paidAmount || 0;
                const remaining = swipePayOrder.totalAmount - paid;
                const chips = paid > 0
                  ? [
                      { label: t.seller.olRemaining, value: remaining.toFixed(2) },
                      { label: t.seller.olFull, value: swipePayOrder.totalAmount.toFixed(2) },
                      { label: t.seller.olCustom, value: '' },
                    ]
                  : [
                      { label: t.seller.olFull, value: swipePayOrder.totalAmount.toFixed(2) },
                      { label: t.seller.olCustom, value: '' },
                    ];
                return chips.map(chip => (
                  <TouchableOpacity
                    key={chip.label}
                    activeOpacity={0.7}
                    style={[styles.quickFillChip, depositAmount === chip.value && chip.value !== '' && styles.quickFillChipActive]}
                    onPress={() => { lightTap(); setDepositAmount(chip.value); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Fill ${chip.label} amount`}
                  >
                    <Text style={[styles.quickFillText, depositAmount === chip.value && chip.value !== '' && styles.quickFillTextActive]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                ));
              })()}
            </View>

            {(() => {
              const remaining = swipePayOrder.totalAmount - (swipePayOrder.paidAmount || 0);
              const entered = parseFloat(depositAmount) || 0;
              if (entered > remaining && remaining > 0) {
                return (
                  <Text style={styles.tipHint}>
                    {t.seller.olIncludesTip.replace('{currency}', currency).replace('{amount}', (entered - remaining).toFixed(2))}
                  </Text>
                );
              }
              return null;
            })()}

            <View style={styles.paymentPickerRow}>
              {PAYMENT_METHODS.map((m) => {
                const active = depositMethod === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    activeOpacity={0.7}
                    style={[styles.paymentPill, active && styles.paymentPillActive]}
                    onPress={() => { selectionChanged(); setDepositMethod(m.value); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Payment via ${m.label}`}
                  >
                    <Feather name={m.icon} size={14} color={active ? semantic(BIZ_SAFE.success, isDark) : C.textSecondary} />
                    <Text style={[styles.paymentPillText, active && styles.paymentPillTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!!depositMethod && (
              <TextInput
                style={styles.paymentNoteInput}
                value={depositNote}
                onChangeText={setDepositNote}
                placeholder="note (optional)"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
            )}

            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.paymentConfirmBtn, !depositMethod && styles.paymentConfirmBtnDisabled]}
              disabled={!depositMethod}
              onPress={() => {
                if (!depositMethod) return;
                const amt = parseFloat(depositAmount);
                if (!amt || amt <= 0) {
                  warningNotification();
                  showToast(t.seller.olEnterValidAmount, 'error');
                  return;
                }
                const remaining = swipePayOrder.totalAmount - (swipePayOrder.paidAmount || 0);
                let finalNote = depositNote.trim();
                if (amt > remaining && remaining > 0) {
                  const tip = amt - remaining;
                  const tipText = `tip ${currency} ${tip.toFixed(2)}`;
                  finalNote = finalNote ? `${finalNote} · ${tipText}` : tipText;
                }
                mediumTap();
                recordPayment(swipePayOrder.id, amt, depositMethod, finalNote || undefined);
                setSwipePayOrder(null);
                const newPaid = (swipePayOrder.paidAmount || 0) + amt;
                const fullyPaid = newPaid >= swipePayOrder.totalAmount;
                const tipAmt = newPaid - swipePayOrder.totalAmount;
                showToast(
                  tipAmt > 0
                    ? t.seller.olFullyPaidTip.replace('{currency}', currency).replace('{amount}', tipAmt.toFixed(2))
                    : fullyPaid ? t.seller.olFullyPaid : t.seller.olAmountRecorded.replace('{currency}', currency).replace('{amount}', amt.toFixed(2)),
                  'info'
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Save payment"
            >
              <Feather name="check" size={16} color={C.onAccent} />
              <Text style={styles.paymentConfirmText}>{t.seller.olSavePayment}</Text>
            </TouchableOpacity>
          </View>
        </FloatingModal>
      )}

    </View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  // ── Search bar + sort ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    maxWidth: 680,
    alignSelf: 'center' as const,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
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
    backgroundColor: withAlpha(C.bronze, 0.1),
  },
  sortActiveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.bronze,
    borderWidth: 1.5,
    borderColor: C.background,
  },

  // ── Quick filter chips (inline bar) ──
  quickFilterWrapper: {
    position: 'relative',
  },
  quickFilterScroll: {
    flexGrow: 0,
  },
  scrollHintRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    // Fade from transparent to background to blend chips out
    backgroundColor: withAlpha(C.background, 0.85),
  },
  quickFilterRow: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
    alignItems: 'flex-start',
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    justifyContent: 'center',
  },
  quickChipActive: {
    backgroundColor: withAlpha(C.bronze, 0.1),
    borderWidth: 1,
    borderColor: C.bronze,
  },
  quickChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  quickChipTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  chipCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withAlpha(C.textMuted, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  chipCountBadgeActive: {
    backgroundColor: withAlpha(C.bronze, 0.2),
  },
  chipCountText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
    lineHeight: 14,
  },
  chipCountTextActive: {
    color: C.bronze,
  },
  viewModeToggle: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Filter pills (shared — used inside filter modal) ──
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
  },
  filterPillActive: {
    backgroundColor: withAlpha(C.bronze, 0.1),
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  filterPillTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  filterPillCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
    marginLeft: 1,
  },
  filterPillCountActive: {
    color: C.bronze,
  },
  filterPillOverdue: {
    backgroundColor: withAlpha(BIZ.overdue, 0.12),
  },
  filterPillOverdueText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.overdue,
  },

  // ── Result count ──
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xs,
  },
  resultText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  clearFiltersText: {
    fontSize: TYPOGRAPHY.size.sm,
    lineHeight: 14,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
    includeFontPadding: false,
  },

  // ── Order list ──
  listContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING['3xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
    gap: SPACING.sm,
  },

  // ── Order card ──
  orderCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  orderCardSelected: {
    borderColor: withAlpha(C.bronze, 0.4),
    backgroundColor: withAlpha(C.bronze, 0.04),
  },
  orderCardUnseen: {
    borderLeftWidth: 3,
    borderLeftColor: BIZ.warning,
  },
  swipeAction: {
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.xl,
    marginVertical: 1,
    marginLeft: SPACING.xs,
    gap: SPACING.xs,
  },
  swipeActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  orderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderAvatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  orderCardBody: {
    flex: 1,
    gap: SPACING.xs,
  },
  orderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCheckboxActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  customerName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginRight: SPACING.sm,
  },
  orderTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  orderItemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderItems: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 18,
    marginRight: SPACING.sm,
  },
  orderMetaText: {
    flexShrink: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  orderTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexShrink: 0,
  },
  orderTag: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  paymentBadge: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  paymentBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    backgroundColor: withAlpha(BIZ.success, 0.1),
  },
  onlineBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: BIZ.success,
  },
  unseenHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  unseenHintBar: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    backgroundColor: BIZ.warning,
  },
  unseenHintText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.warning,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  markAllSeenBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(BIZ.warning, 0.12),
    alignSelf: 'center',
    marginLeft: SPACING.xs,
  },
  markAllSeenText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.warning,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Always-visible meta row (delivery · date · order no | status) ──
  orderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  orderMetaLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    overflow: 'hidden',
  },
  orderMetaDelivery: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  orderMetaDot: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // ── Expanded card content ──
  expandedSection: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.border, 0.5),
    gap: SPACING.xs,
  },
  expandedMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  expandedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedItemName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  expandedItemQty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginLeft: SPACING.sm,
  },
  expandedDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.border, 0.5),
    marginVertical: 2,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  expandedText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    flex: 1,
  },
  expandedNote: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontStyle: 'italic',
  },
  expandedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: SPACING.xs,
  },
  expandedAdvanceBtn: {
    flex: 0.85,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  expandedAdvanceBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  expandedDetailBtn: {
    flex: 0.15,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
  },

  // ── Shared badges (detail modal, grouped) ──
  statusBadge: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  statusText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.2,
  },
  deliveryToday: {
    color: BIZ.warning,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  deliveryOverdue: {
    color: BIZ.overdue,
    fontWeight: TYPOGRAPHY.weight.semibold,
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
    backgroundColor: withAlpha(C.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bronze,
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
    color: C.onAccent,
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
    color: C.bronze,
  },

  // ── Bulk select bar ──
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  bulkCancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkCountText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
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
    color: C.bronze,
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
  bulkIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkPayText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // ── Sort modal ──
  sortOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortSheet: {
    backgroundColor: C.surface,
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
    color: C.textSecondary,
  },
  sortOptionTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Filter + sort modal ──
  filterSortSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING.md,
    width: '88%',
    maxWidth: 360,
    maxHeight: '70%',
  },
  filterSortHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  filterSortClear: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  filterSortScroll: {
    flexGrow: 0,
  },
  filterSectionLabel: {
    ...TYPE.label,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  filterSectionPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  filterSortDone: {
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  filterSortDoneText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },

  // ── Payment picker modal ──
  paymentSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    width: '85%',
    maxWidth: 340,
  },
  paymentSheetTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
    letterSpacing: 1,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
  },
  paymentContext: {
    backgroundColor: withAlpha(C.textMuted, 0.04),
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
    color: C.textPrimary,
    flex: 1,
  },
  paymentContextAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  paymentContextItems: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  paymentPickerRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  paymentPill: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    minHeight: 52,
  },
  paymentPillActive: {
    backgroundColor: withAlpha(BIZ.success, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(BIZ.success, 0.3),
  },
  paymentPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  paymentPillTextActive: {
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  paymentPillHint: {
    fontSize: 10,
    color: C.textMuted,
    textAlign: 'center',
  },
  paymentPillHintActive: {
    color: withAlpha(BIZ.success, 0.7),
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
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
  },
  paymentConfirmText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  paymentNoteInput: {
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    marginBottom: SPACING.md,
    minHeight: 40,
  },
  swipePayContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  quickFillRow: {
    flexDirection: 'row' as const,
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  quickFillChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.1),
  },
  quickFillChipActive: {
    backgroundColor: withAlpha(C.accent, 0.15),
  },
  quickFillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },
  quickFillTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },
  payAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  payAmountPrefix: {
    color: C.textMuted,
    fontSize: TYPOGRAPHY.size.sm,
  },
  payAmountInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    paddingVertical: SPACING.md,
    paddingLeft: SPACING.xs,
  },
  tipHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    marginBottom: SPACING.sm,
  },
  payContextDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: SPACING.xs,
  },
  payContextSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  payContextSubLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  payContextPaid: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
    fontVariant: ['tabular-nums'],
  },
  payContextRemaining: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
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
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAppLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  navCancelBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  navCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },

  // ── Delete item confirmation ──
  deleteConfirmCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginHorizontal: SPACING.xl,
    alignItems: 'center',
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  deleteConfirmIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  deleteConfirmTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.sm,
  },
  deleteConfirmItem: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  deleteConfirmAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    marginBottom: SPACING.md,
  },
  deleteConfirmWarning: {
    flexDirection: 'row',
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  deleteConfirmWarningText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    lineHeight: 16,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    width: '100%',
  },
  deleteConfirmCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  deleteConfirmCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  deleteConfirmRemove: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: C.bronze,
  },
  deleteConfirmRemoveText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // ── Paid info row (detail modal) ──
  payHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  payHistoryEditBtn: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  payHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 1,
  },
  payHistoryMethod: {
    fontSize: TYPOGRAPHY.size.sm,
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.medium,
    flex: 1,
  },
  payHistoryDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  payHistoryAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
  },
  payHistoryMethodChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  payHistoryMethodChipActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  payHistoryMethodChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  payHistoryMethodChipTextActive: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  payHistorySaveBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    backgroundColor: C.bronze,
    borderRadius: RADIUS.md,
  },
  payHistorySaveBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  payHistoryBalance: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  payHistoryBalanceLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  payHistoryBalanceAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING['2xl'],
    maxHeight: '88%',
    flex: 1,
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
    backgroundColor: C.border,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
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
    color: C.textPrimary,
  },
  modalOrderCode: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    letterSpacing: 0.8,
  },
  customerContextText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  // ── Modal sections ──
  modalSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
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
    color: C.textSecondary,
    flex: 1,
  },
  phoneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(C.bronze, 0.08),
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
    color: C.textSecondary,
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
    color: C.textMuted,
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
    color: C.textMuted,
    textAlign: 'center',
    width: 52,
  },
  lifecycleLabelActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── Edit mode ──
  editSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    gap: SPACING.sm,
  },
  editFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editInput: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
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
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  editCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  editSaveButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: C.bronze,
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
    color: C.onAccent,
  },

  // ── Edit: items inline ──
  editItemsList: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    backgroundColor: C.background,
    overflow: 'hidden',
  },
  editItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  editItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  editItemPrice: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },
  editItemStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  editItemQty: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] as any,
  },
  editItemAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  editItemAddText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Edit: delivery date button ──
  editDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    justifyContent: 'flex-start',
  },
  editDateButtonText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },

  // ── Delivery date keyboard modal ──
  dateModalSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING['2xl'],
    width: '85%',
    maxWidth: 340,
    alignItems: 'stretch',
    gap: SPACING.sm,
  },
  dateModalTitle: {
    ...TYPE.label,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  dateModalHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  dateModalInput: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.xl,
    color: C.textPrimary,
    textAlign: 'center',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'] as any,
    minHeight: 56,
  },
  dateModalDone: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xs,
    minHeight: 44,
    justifyContent: 'center',
  },
  dateModalDoneText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // ── Modal items ──
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  modalItemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  modalItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    flex: 1,
    marginRight: SPACING.sm,
    lineHeight: 20,
  },
  modalItemPrice: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: SPACING.md,
    marginTop: SPACING.xs,
  },
  modalTotalLabel: {
    ...TYPE.label,
  },
  modalTotalAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
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
    color: C.textSecondary,
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
    color: C.textMuted,
  },
  rawWhatsAppText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    lineHeight: 18,
    backgroundColor: withAlpha(C.textMuted, 0.04),
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
    backgroundColor: C.bronze,
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
    color: C.onAccent,
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
    color: C.onAccent,
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
    backgroundColor: withAlpha(C.textMuted, 0.05),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    minHeight: 44,
  },
  gridActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  gridActionTextDanger: {
    color: BIZ.error,
  },

  duplicateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    minHeight: 44,
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
  },
  duplicateButtonText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md - 2,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: withAlpha(C.textMuted, 0.04),
    minHeight: 44,
  },
  outlineButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    minHeight: 44,
  },
  deleteButtonText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
  },

  // ── Grouped customer card ──
  groupCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  groupBadge: {
    backgroundColor: withAlpha(C.bronze, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  subOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  subOrderRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.border, 0.6),
  },
  subOrderSelected: {
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  subOrderUnseen: {
    borderLeftWidth: 3,
    borderLeftColor: BIZ.warning,
  },
  selectCheckboxSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  subOrderItems: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    marginRight: SPACING.sm,
  },
  subOrderAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  subOrderDate: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  groupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.border, 0.6),
  },
  groupTotalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginRight: SPACING.xs,
  },
  groupTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  groupUnpaid: {
    fontSize: TYPOGRAPHY.size.xs,
    color: BIZ.unpaid,
    fontVariant: ['tabular-nums'],
  },
});

export default OrderList;
