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
  KeyboardAvoidingView,
  Platform,
  AppState,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format, isToday, isYesterday, isPast, startOfDay, isThisWeek, isThisMonth } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, selectionChanged, warningNotification } from '../../services/haptics';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { SellerOrder, SellerOrderItem, OrderStatus, SellerPaymentMethod, SellerProduct, DepositEntry } from '../../types';
import CalendarPicker from '../../components/common/CalendarPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteOrderFromSupabase, syncAll, pullOrderLinkOrders } from '../../services/sellerSync';

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
  isExpanded: boolean;
  isUnseen: boolean;
  onToggleExpand: (id: string) => void;
  onOpenDetail: (item: SellerOrder) => void;
  onLongPress: (item: SellerOrder) => void;
  onToggleSelect: (id: string) => void;
  onAdvanceStatus: (item: SellerOrder) => void;
  onMarkPaid: (item: SellerOrder) => void;
}> = React.memo(({ item, index, currency, selectMode, isSelected, isExpanded, isUnseen, onToggleExpand, onOpenDetail, onLongPress, onToggleSelect, onAdvanceStatus, onMarkPaid }) => {
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

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
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
            onToggleExpand(item.id);
          }
        }}
        onLongPress={() => { mediumTap(); onLongPress(item); }}
        accessibilityRole="button"
        accessibilityLabel={`Order from ${item.customerName || 'unknown customer'}, ${item.status}, ${currency} ${item.totalAmount.toFixed(2)}`}
      >
        {selectMode ? (
          <View style={styles.selectRow}>
            <View style={[styles.selectCheckbox, isSelected && styles.selectCheckboxActive]}>
              {isSelected && <Feather name="check" size={14} color="#fff" />}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={styles.orderRow}>
                <Text style={styles.customerName} numberOfLines={1}>{item.customerName || 'walk-in'}</Text>
                <Text style={styles.orderTotal}>{currency} {item.totalAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.orderMetaRow}>
                <View style={styles.orderMetaLeft}>
                  {deliveryInfo && (
                    <>
                      <Feather name="truck" size={11} color={deliveryInfo.isOverdue ? BIZ.overdue : deliveryInfo.isTodayDelivery ? BIZ.warning : CALM.textMuted} />
                      <Text style={[styles.orderMetaDelivery, deliveryInfo.isOverdue && styles.deliveryOverdue, deliveryInfo.isTodayDelivery && styles.deliveryToday]}>{deliveryInfo.label}</Text>
                      <Text style={styles.orderMetaDot}>·</Text>
                    </>
                  )}
                  <Feather name="calendar" size={11} color={CALM.textMuted} />
                  <Text style={styles.orderMetaText} numberOfLines={1}>{dateLabel}{item.orderNumber ? `  ·  ${item.orderNumber}` : ''}</Text>
                </View>
                <View style={styles.orderTags}>
                  <Text style={[styles.orderTag, { color }]}>{item.status}</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.orderRow}>
              <Text style={styles.customerName} numberOfLines={1}>{item.customerName || 'walk-in'}</Text>
              <Text style={styles.orderTotal}>{currency} {item.totalAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.orderMetaRow}>
              <View style={styles.orderMetaLeft}>
                {deliveryInfo && (
                  <>
                    <Feather name="truck" size={11} color={deliveryInfo.isOverdue ? BIZ.overdue : deliveryInfo.isTodayDelivery ? BIZ.warning : CALM.textMuted} />
                    <Text style={[styles.orderMetaDelivery, deliveryInfo.isOverdue && styles.deliveryOverdue, deliveryInfo.isTodayDelivery && styles.deliveryToday]}>{deliveryInfo.label}</Text>
                    <Text style={styles.orderMetaDot}>·</Text>
                  </>
                )}
                <Feather name="calendar" size={11} color={CALM.textMuted} />
                <Text style={styles.orderMetaText} numberOfLines={1}>{dateLabel}{item.orderNumber ? `  ·  ${item.orderNumber}` : ''}</Text>
              </View>
              <View style={styles.orderTags}>
                <Text style={[styles.orderTag, { color }]}>{item.status}</Text>
                <View style={[styles.paymentBadge, { backgroundColor: item.isPaid ? withAlpha(BIZ.success, 0.1) : withAlpha(CALM.bronze, 0.1) }]}>
                  <Text style={[styles.paymentBadgeText, { color: item.isPaid ? BIZ.success : CALM.bronze }]}>{item.isPaid ? 'paid' : 'unpaid'}</Text>
                </View>
                {item.source === 'order_link' && (
                  <View style={styles.onlineBadge}>
                    <Feather name="globe" size={9} color={BIZ.success} />
                    <Text style={styles.onlineBadgeText}>online</Text>
                  </View>
                )}
              </View>
            </View>
            {isExpanded && (
              <View style={styles.expandedSection}>
                {item.items.map((it, idx) => (
                  <View key={idx} style={styles.expandedItemRow}>
                    <Text style={styles.expandedItemName} numberOfLines={1}>{it.productName}</Text>
                    <Text style={styles.expandedItemQty}>×{it.quantity}</Text>
                  </View>
                ))}
                <View style={styles.expandedActionsRow}>
                  {NEXT_STATUS[item.status] ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[styles.expandedAdvanceBtn, { backgroundColor: withAlpha(statusColor(NEXT_STATUS[item.status]!), 0.1) }]}
                      onPress={() => { mediumTap(); onAdvanceStatus(item); }}
                    >
                      <Feather name={advanceIcon(item.status)} size={13} color={statusColor(NEXT_STATUS[item.status]!)} />
                      <Text style={[styles.expandedAdvanceBtnText, { color: statusColor(NEXT_STATUS[item.status]!) }]}>{NEXT_STATUS[item.status]}</Text>
                    </TouchableOpacity>
                  ) : !item.isPaid ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[styles.expandedAdvanceBtn, { backgroundColor: withAlpha(BIZ.success, 0.1) }]}
                      onPress={() => { mediumTap(); onMarkPaid(item); }}
                    >
                      <Feather name="dollar-sign" size={13} color={BIZ.success} />
                      <Text style={[styles.expandedAdvanceBtnText, { color: BIZ.success }]}>mark paid</Text>
                    </TouchableOpacity>
                  ) : <View style={{ flex: 0.85 }} />}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.expandedDetailBtn}
                    onPress={() => { lightTap(); onOpenDetail(item); }}
                    hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                  >
                    <Feather name="more-horizontal" size={16} color={CALM.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
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
  expandedId: string | null;
  seenSet: Set<string>;
  onToggleExpand: (id: string) => void;
  onOpenDetail: (item: SellerOrder) => void;
  onLongPress: (item: SellerOrder) => void;
  onToggleSelect: (id: string) => void;
  onAdvanceStatus: (item: SellerOrder) => void;
  onMarkPaid: (item: SellerOrder) => void;
}> = React.memo(({ group, index, currency, selectMode, selectedIds, expandedId, seenSet, onToggleExpand, onOpenDetail, onLongPress, onToggleSelect, onAdvanceStatus, onMarkPaid }) => {
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
        isExpanded={expandedId === group.orders[0].id}
        isUnseen={group.orders[0].source === 'order_link' && !seenSet.has(group.orders[0].id)}
        onToggleExpand={onToggleExpand}
        onOpenDetail={onOpenDetail}
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
          <Text style={styles.customerName} numberOfLines={1}>
            {group.customerName}
          </Text>
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>{group.orders.length}</Text>
          </View>
        </View>

        {/* Sub-order rows */}
        {group.orders.map((order, i) => {
          const color = statusColor(order.status);
          const dateLabel = smartDateLabel(order.date);
          const deliveryInfo = getDeliveryDateInfo(order);
          const isSelected = selectedIds.has(order.id);
          const isExpanded = expandedId === order.id;

          return (
            <TouchableOpacity
              key={order.id}
              activeOpacity={0.7}
              style={[
                styles.subOrderRow,
                i < group.orders.length - 1 && !isExpanded && styles.subOrderRowBorder,
                selectMode && isSelected && styles.subOrderSelected,
                order.source === 'order_link' && !seenSet.has(order.id) && styles.subOrderUnseen,
              ]}
              onPress={() => {
                if (selectMode) { selectionChanged(); onToggleSelect(order.id); }
                else { lightTap(); onToggleExpand(order.id); }
              }}
              onLongPress={() => { mediumTap(); onLongPress(order); }}
            >
              {selectMode && (
                <View style={[styles.selectCheckboxSmall, isSelected && styles.selectCheckboxActive]}>
                  {isSelected && <Feather name="check" size={10} color="#fff" />}
                </View>
              )}
              <View style={styles.subOrderInfo}>
                {/* Row 1: amount */}
                <View style={styles.subOrderTopRow}>
                  <Text style={styles.subOrderAmount}>{currency} {order.totalAmount.toFixed(2)}</Text>
                </View>

                {/* Row 2: delivery · date · order number | status tags */}
                <View style={styles.orderMetaRow}>
                  <View style={styles.orderMetaLeft}>
                    {deliveryInfo && (
                      <>
                        <Feather name="truck" size={11} color={deliveryInfo.isOverdue ? BIZ.overdue : deliveryInfo.isTodayDelivery ? BIZ.warning : CALM.textMuted} />
                        <Text style={[styles.orderMetaDelivery, deliveryInfo.isOverdue && styles.deliveryOverdue, deliveryInfo.isTodayDelivery && styles.deliveryToday]}>
                          {deliveryInfo.label}
                        </Text>
                        <Text style={styles.orderMetaDot}>·</Text>
                      </>
                    )}
                    <Feather name="calendar" size={11} color={CALM.textMuted} />
                    <Text style={styles.orderMetaText} numberOfLines={1}>
                      {dateLabel}{order.orderNumber ? `  ·  ${order.orderNumber}` : ''}
                    </Text>
                  </View>
                  <View style={styles.orderTags}>
                    <Text style={[styles.orderTag, { color }]}>{order.status}</Text>
                    <View style={[styles.paymentBadge, { backgroundColor: order.isPaid ? withAlpha(BIZ.success, 0.1) : withAlpha(CALM.bronze, 0.1) }]}>
                      <Text style={[styles.paymentBadgeText, { color: order.isPaid ? BIZ.success : CALM.bronze }]}>
                        {order.isPaid ? 'paid' : 'unpaid'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Expanded */}
                {isExpanded && (
                  <View style={styles.expandedSection}>
                    {order.items.map((it, idx) => (
                      <View key={idx} style={styles.expandedItemRow}>
                        <Text style={styles.expandedItemName} numberOfLines={1}>{it.productName}</Text>
                        <Text style={styles.expandedItemQty}>×{it.quantity}</Text>
                      </View>
                    ))}

                    {/* One primary action + details button */}
                    <View style={styles.expandedActionsRow}>
                      {NEXT_STATUS[order.status] ? (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={[styles.expandedAdvanceBtn, { backgroundColor: withAlpha(statusColor(NEXT_STATUS[order.status]!), 0.1) }]}
                          onPress={() => { mediumTap(); onAdvanceStatus(order); }}
                        >
                          <Feather name={advanceIcon(order.status)} size={13} color={statusColor(NEXT_STATUS[order.status]!)} />
                          <Text style={[styles.expandedAdvanceBtnText, { color: statusColor(NEXT_STATUS[order.status]!) }]}>
                            {NEXT_STATUS[order.status]}
                          </Text>
                        </TouchableOpacity>
                      ) : !order.isPaid ? (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={[styles.expandedAdvanceBtn, { backgroundColor: withAlpha(BIZ.success, 0.1) }]}
                          onPress={() => { mediumTap(); onMarkPaid(order); }}
                        >
                          <Feather name="dollar-sign" size={13} color={BIZ.success} />
                          <Text style={[styles.expandedAdvanceBtnText, { color: BIZ.success }]}>mark paid</Text>
                        </TouchableOpacity>
                      ) : <View style={{ flex: 0.85 }} />}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.expandedDetailBtn}
                        onPress={() => { lightTap(); onOpenDetail(order); }}
                        hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                      >
                        <Feather name="more-horizontal" size={16} color={CALM.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
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
  const insets = useSafeAreaInsets();
  const orders = useSellerStore((s) => s.orders);
  const products = useSellerStore((s) => s.products);
  const updateOrderStatus = useSellerStore((s) => s.updateOrderStatus);
  const updateOrder = useSellerStore((s) => s.updateOrder);
  const updateOrderItems = useSellerStore((s) => s.updateOrderItems);
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

  // Expandable cards — only one at a time
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
  }, [sortedOrders, deliveryFilter, paymentFilter, overdueOnly, onlineOnly, searchQuery, periodFilter, paymentMethodFilter]);

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

  // Overdue count for badge
  const overdueCount = useMemo(() => {
    return orders.filter((o) => {
      if (!o.deliveryDate) return false;
      const d = o.deliveryDate instanceof Date ? o.deliveryDate : new Date(o.deliveryDate as string);
      return isPast(startOfDay(d)) && !isToday(d) && o.status !== 'delivered' && o.status !== 'completed';
    }).length;
  }, [orders]);

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
              if (order.supabaseId) {
                deleteOrderFromSupabase(order.supabaseId).catch(() => {});
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
            { text: 'Go to Settings', onPress: () => navigation.navigate('SellerSettings' as any, { scrollTo: 'qr' }) },
          ]
        );
        return;
      }
      const text =
        `Hi ${order.customerName || 'customer'},\n\n` +
        `Pesanan${order.orderNumber ? ` #${order.orderNumber}` : ''}\n` +
        `*Jumlah: ${currency} ${order.totalAmount.toFixed(2)}*\n\n` +
        `Sila scan QR untuk bayaran.\n` +
        `Selepas bayar, mohon hantar resit/screenshot sebagai bukti.\n\nTerima kasih! 🙏`;

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
    const isSettled = order.isPaid && (order.status === 'delivered' || order.status === 'completed');
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
      newTotal = editItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
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
      updateOrderItems(selectedOrder.id, editItems);
    }

    if (Object.keys(updates).length > 0 || itemsChanged) {
      if (Object.keys(updates).length > 0) updateOrder(selectedOrder.id, updates);
      // Read fresh from store to ensure we have the latest state
      const freshOrder = useSellerStore.getState().orders.find(o => o.id === selectedOrder.id);
      setSelectedOrder(freshOrder || { ...selectedOrder, ...updates, items: itemsChanged ? editItems : selectedOrder.items, totalAmount: newTotal, updatedAt: new Date() });
      mediumTap();
      showToast('order updated.', 'info');
    }
    setIsEditing(false);
  }, [selectedOrder, editNote, editPhone, editAddress, editDeliveryDate, editItems, updateOrder, updateOrderItems, showToast]);


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
            updateOrder(order.id, { isPaid: false, paymentMethod: undefined, paidAt: undefined, _resetPayments: true } as any);
            setSelectedOrder({ ...order, isPaid: false, paymentMethod: undefined, paidAt: undefined, deposits: [], paidAmount: 0, updatedAt: new Date() });
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
      setExpandedId(null);
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
              if (o.supabaseId) deleteOrderFromSupabase(o.supabaseId).catch(() => {});
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

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId(prev => {
      const isOpening = prev !== id;
      if (isOpening) {
        const order = orders.find((o) => o.id === id);
        if (order?.source === 'order_link' && !seenSet.has(id)) {
          markOrdersSeen([id]);
        }
      }
      return prev === id ? null : id;
    });
  }, [orders, seenSet, markOrdersSeen]);

  const handleMarkPaidFromCard = useCallback((order: SellerOrder) => {
    setPendingPayOrder(order);
    setSelectedPaymentMethod(null);
    setPaymentNote('');
  }, []);

  // Read fresh order from store when opening detail (avoids stale data after edits)
  const handleOpenDetail = useCallback((order: SellerOrder) => {
    const fresh = useSellerStore.getState().orders.find(o => o.id === order.id);
    setSelectedOrder(fresh || order);
  }, []);

  const renderOrder = useCallback(
    ({ item, index }: { item: SellerOrder; index: number }) => (
      <AnimatedOrderCard
        item={item}
        index={index}
        currency={currency}
        selectMode={selectMode}
        isSelected={selectedIds.has(item.id)}
        isExpanded={expandedId === item.id}
        isUnseen={item.source === 'order_link' && !seenSet.has(item.id)}
        onToggleExpand={handleToggleExpand}
        onOpenDetail={handleOpenDetail}
        onLongPress={handleLongPress}
        onToggleSelect={handleToggleSelect}
        onAdvanceStatus={handleAdvanceStatus}
        onMarkPaid={handleMarkPaidFromCard}
      />
    ),
    [currency, selectMode, selectedIds, expandedId, seenSet, handleToggleExpand, handleOpenDetail, handleLongPress, handleToggleSelect, handleAdvanceStatus, handleMarkPaidFromCard]
  );

  const renderGroup = useCallback(
    ({ item, index }: { item: CustomerGroup; index: number }) => (
      <GroupedCustomerCard
        group={item}
        index={index}
        currency={currency}
        selectMode={selectMode}
        selectedIds={selectedIds}
        expandedId={expandedId}
        seenSet={seenSet}
        onToggleExpand={handleToggleExpand}
        onOpenDetail={handleOpenDetail}
        onLongPress={handleLongPress}
        onToggleSelect={handleToggleSelect}
        onAdvanceStatus={handleAdvanceStatus}
        onMarkPaid={handleMarkPaidFromCard}
      />
    ),
    [currency, selectMode, selectedIds, expandedId, seenSet, handleToggleExpand, handleOpenDetail, handleLongPress, handleToggleSelect, handleAdvanceStatus, handleMarkPaidFromCard]
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
      {/* ─── Search bar + filter + view toggle ─── */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color={CALM.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="search orders..."
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
          style={[styles.sortButton, modalHasAdvancedFilters && styles.sortButtonActive]}
          activeOpacity={0.7}
          onPress={() => { lightTap(); setShowSortMenu(true); }}
          accessibilityRole="button"
          accessibilityLabel="Filter and sort"
        >
          <Feather name="sliders" size={18} color={CALM.bronze} />
          {modalHasAdvancedFilters && <View style={styles.sortActiveDot} />}
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.viewModeToggle}
          onPress={() => { selectionChanged(); setViewMode(v => v === 'grouped' ? 'list' : 'grouped'); }}
          accessibilityRole="button"
          accessibilityLabel={`View mode: ${viewMode}`}
        >
          <Feather name={viewMode === 'grouped' ? 'layers' : 'list'} size={16} color={CALM.textSecondary} />
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
              <View style={[styles.chipCountBadge, { backgroundColor: withAlpha(CALM.bronze, 0.15) }]}>
                <Text style={[styles.chipCountText, { color: CALM.bronze }]}>{statusCounts['unpaid']}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Online */}
          <TouchableOpacity
            style={[styles.quickChip, activeChip === 'online' && styles.quickChipActive]}
            activeOpacity={0.7}
            onPress={() => { selectionChanged(); setOnlineOnly(true); setDeliveryFilter('all'); setPaymentFilter('all'); setOverdueOnly(false); }}
          >
            <Feather name="globe" size={12} color={BIZ.success} style={{ marginRight: 4 }} />
            <Text style={[styles.quickChipText, activeChip === 'online' && styles.quickChipTextActive]}>online</Text>
            {unseenOnlineCount > 0 && (
              <View style={[styles.chipCountBadge, { backgroundColor: withAlpha(BIZ.warning, 0.2) }]}>
                <Text style={[styles.chipCountText, { color: BIZ.warning }]}>{unseenOnlineCount}</Text>
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
            <Feather name="alert-circle" size={12} color={BIZ.warning} style={{ marginRight: 4 }} />
            <Text style={[styles.quickChipText, activeChip === 'overdue' && styles.quickChipTextActive]}>overdue</Text>
            {(overdueCount || 0) > 0 && (
              <View style={[styles.chipCountBadge, { backgroundColor: withAlpha(BIZ.warning, 0.15) }]}>
                <Text style={[styles.chipCountText, { color: BIZ.warning }]}>{overdueCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
        <View style={styles.scrollHintRight} pointerEvents="none">
          <Feather name="chevron-right" size={16} color={CALM.textMuted} />
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
            <Feather name="x" size={14} color={CALM.bronze} />
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CALM.bronze} colors={[CALM.bronze]} />}
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
            style={[styles.bulkIconButton, { backgroundColor: BIZ.success }, selectedIds.size === 0 && styles.bulkPayButtonDisabled]}
            activeOpacity={0.7}
            onPress={handleBulkMarkPaid}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${selectedIds.size} orders as paid`}
          >
            <Feather name="dollar-sign" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkIconButton, { backgroundColor: BIZ.warning }, selectedIds.size === 0 && styles.bulkPayButtonDisabled]}
            activeOpacity={0.7}
            onPress={handleBulkMarkUnseen}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${selectedIds.size} orders as unseen`}
          >
            <Feather name="eye-off" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkIconButton, { backgroundColor: BIZ.error }, selectedIds.size === 0 && styles.bulkPayButtonDisabled]}
            activeOpacity={0.7}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selectedIds.size} orders`}
          >
            <Feather name="trash-2" size={18} color="#fff" />
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

            <ScrollView showsVerticalScrollIndicator={false} style={styles.filterSortScroll}>
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
                      <Feather name={opt.icon} size={13} color={isActive ? CALM.bronze : CALM.textMuted} />
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
                  <Feather name="alert-circle" size={13} color={overdueOnly ? BIZ.overdue : CALM.textMuted} />
                  <Text style={[styles.filterPillText, overdueOnly && styles.filterPillOverdueText]}>
                    overdue only
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterPill, onlineOnly && styles.filterPillActive]}
                  activeOpacity={0.7}
                  onPress={() => { selectionChanged(); setOnlineOnly(!onlineOnly); }}
                >
                  <Feather name="globe" size={13} color={onlineOnly ? CALM.bronze : CALM.textMuted} />
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
                    <Feather name={m.icon} size={14} color={active ? BIZ.success : CALM.textSecondary} />
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
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
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
              <Feather name="check" size={16} color={selectedPaymentMethod ? '#fff' : CALM.textMuted} />
              <Text style={[styles.paymentConfirmText, !selectedPaymentMethod && { color: CALM.textMuted }]}>
                confirm paid
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>}

      {/* ─── Order detail bottom sheet (lazy-mounted) ─── */}
      {!!selectedOrder && <Modal
        visible
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <View style={{flex: 1}}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseModal}
        >
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            {/* Fixed handle + header — does not scroll */}
            {selectedOrder && (
              <>
                <View style={styles.modalHandleRow}>
                  <View style={styles.modalHandle} />
                </View>
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
                      <Feather name="x" size={18} color={CALM.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Math.max(SPACING['3xl'], insets.bottom + SPACING.lg) }}>
              {selectedOrder && (
                <>
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
                      {/* ── Items ── */}
                      <Text style={styles.editFieldLabel}>items</Text>
                      <View style={styles.editItemsList}>
                        {editItems.map((item, i) => (
                          <View key={`ei_${i}`} style={[styles.editItemRow, i < editItems.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CALM.border }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.editItemName} numberOfLines={1}>{item.productName}</Text>
                              <Text style={styles.editItemPrice}>{currency} {item.unitPrice.toFixed(2)} / {item.unit}</Text>
                            </View>
                            <View style={styles.editItemStepper}>
                              <TouchableOpacity
                                onPress={() => { lightTap(); setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it)); }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Feather name="minus-circle" size={20} color={CALM.textMuted} />
                              </TouchableOpacity>
                              <Text style={styles.editItemQty}>{item.quantity}</Text>
                              <TouchableOpacity
                                onPress={() => { lightTap(); setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: it.quantity + 1 } : it)); }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Feather name="plus-circle" size={20} color={CALM.bronze} />
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
                                <Feather name="trash-2" size={16} color={CALM.textMuted} />
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
                            <Feather name="plus" size={14} color={CALM.bronze} />
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
                        placeholderTextColor={CALM.textMuted}
                        keyboardType="phone-pad"
                      />

                      {/* ── Address ── */}
                      <Text style={styles.editFieldLabel}>address</Text>
                      <TextInput
                        style={[styles.editInput, styles.editInputMultiline]}
                        value={editAddress}
                        onChangeText={setEditAddress}
                        placeholder="customer address"
                        placeholderTextColor={CALM.textMuted}
                        multiline
                        numberOfLines={3}
                      />

                      {/* ── Delivery date (keyboard modal) ── */}
                      <Text style={styles.editFieldLabel}>delivery date</Text>
                      <TouchableOpacity
                        style={[styles.editInput, styles.editDateButton]}
                        activeOpacity={0.7}
                        onPress={() => setShowDeliveryDateModal(true)}
                      >
                        <Feather name="calendar" size={15} color={editDeliveryDate ? CALM.bronze : CALM.textMuted} />
                        <Text style={[styles.editDateButtonText, !editDeliveryDate && { color: CALM.textMuted }]}>
                          {editDeliveryDate ? format(editDeliveryDate, 'd MMM yyyy') : 'tap to set'}
                        </Text>
                        {!!editDeliveryDate && (
                          <TouchableOpacity onPress={() => setEditDeliveryDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Feather name="x" size={14} color={CALM.textMuted} />
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
                        placeholderTextColor={CALM.textMuted}
                        multiline
                      />

                      <View style={styles.editActions}>
                        <TouchableOpacity style={styles.editCancelButton} activeOpacity={0.7} onPress={() => setIsEditing(false)}>
                          <Text style={styles.editCancelText}>cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editSaveButton} activeOpacity={0.7} onPress={handleSaveEdit}>
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
                            onPress={() => { lightTap(); setEditingPayHistory(true); setEditPayIdx(null); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Feather name="edit-2" size={14} color={CALM.bronze} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {(selectedOrder.deposits && selectedOrder.deposits.length > 0)
                        ? selectedOrder.deposits.map((d, i) => {
                            const d2 = d.date instanceof Date ? d.date : new Date(d.date);
                            return (
                              <View key={i} style={[styles.payHistoryRow, { flexWrap: 'wrap' }, i < selectedOrder.deposits!.length - 1 && styles.modalItemRowBorder]}>
                                <Feather name={paymentMethodIcon(d.method)} size={13} color={BIZ.success} />
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
                                      <Text style={{ width: '100%', fontSize: TYPOGRAPHY.size.xs, color: CALM.textMuted, marginTop: 2, paddingLeft: 21 }}>
                                        {before ? <>{before} · </> : null}
                                        <Text style={{ color: CALM.bronze }}>{tipText}</Text>
                                      </Text>
                                    );
                                  }
                                  return <Text style={{ width: '100%', fontSize: TYPOGRAPHY.size.xs, color: CALM.textMuted, marginTop: 2, paddingLeft: 21 }}>{d.note}</Text>;
                                })() : null}
                              </View>
                            );
                          })
                        : (
                          <View style={styles.payHistoryRow}>
                            <Feather name={paymentMethodIcon(selectedOrder.paymentMethod)} size={13} color={BIZ.success} />
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
                      {!selectedOrder.isPaid && (
                        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.paidButton, { flex: 1, backgroundColor: withAlpha(CALM.bronze, 0.15) }]}
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
                            <Feather name="credit-card" size={16} color={CALM.bronze} />
                            <Text style={[styles.paidButtonText, { color: CALM.bronze }]}>deposit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.paidButton, { flex: 1 }]}
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
                            <Feather name="dollar-sign" size={18} color="#fff" />
                            <Text style={styles.paidButtonText}>mark as paid</Text>
                          </TouchableOpacity>
                        </View>
                      )}


                      {/* Secondary actions — 2-column grid */}
                      <View style={styles.secondaryActionsGrid}>
                        {!selectedOrder.isPaid && (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.gridAction}
                            onPress={() => handleSendQR(selectedOrder)}
                            accessibilityRole="button"
                            accessibilityLabel="Send QR with total via WhatsApp"
                          >
                            <Feather name="maximize" size={16} color={CALM.accent} />
                            <Text style={[styles.gridActionText, { color: CALM.accent }]}>send QR</Text>
                          </TouchableOpacity>
                        )}

                        {selectedOrder.status === 'completed' && (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={styles.gridAction}
                            onPress={() => handleShareReceiptWA(selectedOrder)}
                            accessibilityRole="button"
                            accessibilityLabel="Send receipt via WhatsApp"
                          >
                            <Feather name="send" size={16} color={CALM.accent} />
                            <Text style={[styles.gridActionText, { color: CALM.accent }]}>send receipt</Text>
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


                      </View>

                      {/* Mark as next status — at bottom */}
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
                      <Feather name="x" size={17} color={CALM.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <CalendarPicker
                    value={editDeliveryDate ?? new Date()}
                    onChange={(date) => { setEditDeliveryDate(date); setShowDeliveryDateModal(false); }}
                  />
                </View>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

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
                  <Feather name="x" size={18} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Search */}
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: CALM.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm, gap: SPACING.xs }}>
                <Feather name="search" size={14} color={CALM.textMuted} />
                <TextInput
                  style={{ flex: 1, fontSize: TYPOGRAPHY.size.sm, color: CALM.textPrimary, paddingVertical: SPACING.sm }}
                  value={addProductSearch}
                  onChangeText={setAddProductSearch}
                  placeholder="search products..."
                  placeholderTextColor={CALM.textMuted}
                />
                {addProductSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setAddProductSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x" size={13} color={CALM.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Product list */}
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {products
                  .filter(p => p.isActive && !editItems.some(ei => ei.productId === p.id))
                  .filter(p => !addProductSearch || p.name.toLowerCase().includes(addProductSearch.toLowerCase()))
                  .map((p, idx, arr) => (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.7}
                      style={[
                        { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm },
                        idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CALM.border },
                      ]}
                      onPress={() => {
                        lightTap();
                        setEditItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: p.pricePerUnit, unit: p.unit }]);
                        setShowAddProductModal(false);
                        setAddProductSearch('');
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: CALM.textPrimary }}>{p.name}</Text>
                        <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: CALM.textMuted, marginTop: 2 }}>{currency} {p.pricePerUnit.toFixed(2)} / {p.unit}</Text>
                      </View>
                      <Feather name="plus-circle" size={18} color={CALM.bronze} />
                    </TouchableOpacity>
                  ))
                }
              </ScrollView>
            </View>
          </TouchableOpacity>
        )}

</View>
      </Modal>}

      {/* ─── Record deposit modal ─── */}
      {showDepositInput && selectedOrder && <Modal
        visible
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowDepositInput(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <TouchableOpacity
          style={[styles.sortOverlay, { backgroundColor: 'transparent' }]}
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
                placeholderTextColor={CALM.textMuted}
                keyboardType="decimal-pad"
                autoFocus
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
                    <Feather name={m.icon} size={14} color={active ? BIZ.success : CALM.textSecondary} />
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
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
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
              <Feather name="check" size={16} color="#fff" />
              <Text style={styles.paymentConfirmText}>save deposit</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>}

      {/* ─── Edit payments modal ─── */}
      {editingPayHistory && selectedOrder && (selectedOrder.deposits && selectedOrder.deposits.length > 0) && <Modal
        visible
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => { setEditingPayHistory(false); setEditPayIdx(null); }}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <TouchableOpacity
          style={[styles.sortOverlay, { backgroundColor: 'transparent' }]}
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
                <View key={i} style={[{ paddingVertical: SPACING.sm }, i < selectedOrder.deposits!.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CALM.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                    <Feather name={paymentMethodIcon(d.method)} size={14} color={BIZ.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium as any, color: BIZ.success }}>{paymentMethodLabel(d.method)}</Text>
                      <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: CALM.textMuted, marginTop: 1 }}>{format(d2, 'd MMM yyyy, h:mm a')}</Text>
                      {d.note ? (() => {
                        const tipMatch = d.note.match(/(tip\s+\S+\s+[\d,.]+)/i);
                        if (tipMatch) {
                          const tidx = d.note.indexOf(tipMatch[1]);
                          const before = d.note.slice(0, tidx).replace(/\s*·\s*$/, '');
                          return (
                            <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: CALM.textMuted, marginTop: 2 }}>
                              {before ? <>{before} · </> : null}
                              <Text style={{ color: CALM.bronze }}>{tipMatch[1]}</Text>
                            </Text>
                          );
                        }
                        return <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: CALM.textSecondary, marginTop: 2 }}>{d.note}</Text>;
                      })() : null}
                    </View>
                    <Text style={{ fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold as any, color: CALM.textPrimary }}>{currency} {d.amount.toFixed(2)}</Text>
                    <TouchableOpacity
                      onPress={() => { lightTap(); if (isEditingThis) { setEditPayIdx(null); } else { setEditPayIdx(i); setEditPayAmount(d.amount.toFixed(2)); setEditPayMethod(d.method); setEditPayNote(d.note || ''); } }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name={isEditingThis ? 'chevron-up' : 'edit-2'} size={15} color={CALM.bronze} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { lightTap(); setRemoveDepositConfirm({ idx: i, deposit: d }); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={15} color={CALM.textMuted} />
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
                          placeholderTextColor={CALM.textMuted}
                          returnKeyType="done"
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
                        placeholderTextColor={CALM.textMuted}
                        returnKeyType="done"
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
                              <Feather name={m.icon} size={13} color={active ? BIZ.success : CALM.textSecondary} />
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
                        <Feather name="check" size={16} color="#fff" />
                        <Text style={styles.paymentConfirmText}>save</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>}

      {/* ─── Navigation app picker modal (lazy-mounted, renders after detail modal) ─── */}
      {!!navAddress && <Modal
        visible
        transparent
        statusBarTranslucent
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

      {/* ─── Delete item confirmation modal ─── */}
      {deleteItemConfirm && (() => {
        const isLastItem = editItems.length <= 1;
        return (
        <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={() => setDeleteItemConfirm(null)}>
          <TouchableOpacity style={styles.sortOverlay} activeOpacity={1} onPress={() => setDeleteItemConfirm(null)}>
            <View style={styles.deleteConfirmCard} onStartShouldSetResponder={() => true}>
              <View style={styles.deleteConfirmIconWrap}>
                <Feather name={isLastItem ? 'shield' : 'alert-triangle'} size={24} color={CALM.bronze} />
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
                <Feather name="info" size={14} color={CALM.bronze} style={{ marginTop: 1 }} />
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
                      <Feather name="trash-2" size={14} color="#fff" />
                      <Text style={styles.deleteConfirmRemoveText}>remove</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
        );
      })()}

      {/* ─── Remove deposit confirmation modal ─── */}
      {removeDepositConfirm && selectedOrder && (
        <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={() => setRemoveDepositConfirm(null)}>
          <TouchableOpacity style={styles.sortOverlay} activeOpacity={1} onPress={() => setRemoveDepositConfirm(null)}>
            <View style={styles.deleteConfirmCard} onStartShouldSetResponder={() => true}>
              <View style={styles.deleteConfirmIconWrap}>
                <Feather name="trash-2" size={24} color={CALM.bronze} />
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
                <Feather name="info" size={14} color={CALM.bronze} style={{ marginTop: 1 }} />
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
                  <Feather name="trash-2" size={14} color="#fff" />
                  <Text style={styles.deleteConfirmRemoveText}>remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

    </View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
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
    gap: SPACING.sm,
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
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    borderColor: CALM.bronze,
  },
  sortActiveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CALM.bronze,
    borderWidth: 1.5,
    borderColor: CALM.background,
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
    backgroundColor: withAlpha(CALM.background, 0.85),
  },
  quickFilterRow: {
    paddingHorizontal: 8,
    paddingVertical: SPACING.xs,
    gap: 6,
    alignItems: 'flex-start',
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: 10,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 36,
    justifyContent: 'center',
  },
  quickChipActive: {
    borderColor: CALM.bronze,
  },
  quickChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  quickChipTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  chipCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: withAlpha(CALM.textMuted, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipCountBadgeActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.2),
  },
  chipCountText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as any,
    lineHeight: 14,
  },
  chipCountTextActive: {
    color: CALM.bronze,
  },
  viewModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },

  // ── Filter pills (shared — used inside filter modal) ──
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 30,
  },
  filterPillActive: {
    borderColor: CALM.bronze,
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  filterPillTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  filterPillCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
    marginLeft: 1,
  },
  filterPillCountActive: {
    color: CALM.bronze,
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
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  resultText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
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
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
    includeFontPadding: false,
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
    paddingVertical: SPACING.md - 2,
    paddingHorizontal: SPACING.md,
    gap: 3,
  },
  orderCardSelected: {
    borderColor: withAlpha(CALM.bronze, 0.4),
    backgroundColor: withAlpha(CALM.bronze, 0.04),
  },
  orderCardUnseen: {
    borderLeftWidth: 3,
    borderLeftColor: BIZ.warning,
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
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCheckboxActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginRight: SPACING.sm,
  },
  orderTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  orderItemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderItems: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    lineHeight: 18,
    marginRight: SPACING.sm,
  },
  orderMetaText: {
    flexShrink: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  orderTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  orderTag: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  paymentBadge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs + 1,
    paddingVertical: 2,
  },
  paymentBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: RADIUS.sm,
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
    gap: 4,
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
    marginTop: 3,
    gap: SPACING.xs,
  },
  orderMetaLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  orderMetaDelivery: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  orderMetaDot: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },

  // ── Expanded card content ──
  expandedSection: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(CALM.border, 0.5),
    gap: SPACING.xs + 1,
  },
  expandedMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
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
    color: CALM.textSecondary,
  },
  expandedItemQty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    marginLeft: SPACING.sm,
  },
  expandedDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(CALM.border, 0.5),
    marginVertical: 2,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  expandedText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    flex: 1,
  },
  expandedNote: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
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
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
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
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
  },

  // ── Shared badges (detail modal, grouped) ──
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm + 2,
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

  // ── Filter + sort modal ──
  filterSortSheet: {
    backgroundColor: CALM.surface,
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
    color: CALM.bronze,
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
    borderTopColor: CALM.border,
  },
  filterSortDoneText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
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
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textMuted,
    letterSpacing: 1,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
  },
  paymentContext: {
    backgroundColor: withAlpha(CALM.textMuted, 0.04),
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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
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
    color: CALM.textSecondary,
  },
  paymentPillTextActive: {
    color: BIZ.success,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  paymentPillHint: {
    fontSize: 10,
    color: CALM.textMuted,
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
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
  },
  paymentConfirmText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  paymentNoteInput: {
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    marginBottom: SPACING.md,
    minHeight: 40,
  },
  payAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  payAmountPrefix: {
    color: CALM.textMuted,
    fontSize: TYPOGRAPHY.size.sm,
  },
  payAmountInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    paddingVertical: SPACING.md,
    paddingLeft: SPACING.xs,
  },
  tipHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
    marginBottom: SPACING.sm,
  },
  payContextDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CALM.border,
    marginVertical: SPACING.xs,
  },
  payContextSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  payContextSubLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  payContextPaid: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: BIZ.success,
    fontVariant: ['tabular-nums'],
  },
  payContextRemaining: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.bronze,
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

  // ── Delete item confirmation ──
  deleteConfirmCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginHorizontal: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  deleteConfirmIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withAlpha(CALM.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  deleteConfirmTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
  },
  deleteConfirmItem: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: CALM.textPrimary,
  },
  deleteConfirmAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.bronze,
    marginBottom: SPACING.md,
  },
  deleteConfirmWarning: {
    flexDirection: 'row',
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  deleteConfirmWarningText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
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
    borderColor: CALM.border,
  },
  deleteConfirmCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: CALM.textSecondary,
  },
  deleteConfirmRemove: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.bronze,
  },
  deleteConfirmRemoveText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: '#fff',
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
    color: CALM.bronze,
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
    color: CALM.textMuted,
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
    borderColor: CALM.border,
    backgroundColor: CALM.surface,
  },
  payHistoryMethodChipActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  payHistoryMethodChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  payHistoryMethodChipTextActive: {
    color: '#fff',
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  payHistorySaveBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
  },
  payHistorySaveBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: '#fff',
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
    backgroundColor: withAlpha(CALM.bronze, 0.06),
  },
  payHistoryBalanceLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  payHistoryBalanceAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'],
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderTopWidth: StyleSheet.hairlineWidth,
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

  // ── Edit: items inline ──
  editItemsList: {
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.background,
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
    color: CALM.textPrimary,
  },
  editItemPrice: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
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
    color: CALM.textPrimary,
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
    borderTopColor: CALM.border,
  },
  editItemAddText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
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
    color: CALM.textPrimary,
  },

  // ── Delivery date keyboard modal ──
  dateModalSheet: {
    backgroundColor: CALM.surface,
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
    color: CALM.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  dateModalInput: {
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.xl,
    color: CALM.textPrimary,
    textAlign: 'center',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'] as any,
    minHeight: 56,
  },
  dateModalDone: {
    backgroundColor: CALM.bronze,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: withAlpha(CALM.textMuted, 0.05),
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

  duplicateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    minHeight: 44,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
  },
  duplicateButtonText: {
    fontSize: TYPOGRAPHY.size.xs,
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
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  },
  subOrderRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(CALM.border, 0.6),
  },
  subOrderSelected: {
    backgroundColor: withAlpha(CALM.bronze, 0.06),
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
    borderColor: CALM.border,
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
    color: CALM.textPrimary,
    marginRight: SPACING.sm,
  },
  subOrderAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  subOrderDate: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'],
  },
  groupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(CALM.border, 0.6),
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
