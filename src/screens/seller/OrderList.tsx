import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { SellerOrder, OrderStatus } from '../../types';

const STATUS_TABS: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Ready', value: 'ready' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Paid', value: 'paid' },
];

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'ready',
  ready: 'delivered',
  delivered: 'paid',
  paid: null,
};

const OrderList: React.FC = () => {
  const { orders, updateOrderStatus, markOrderPaid } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);

  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);

  const filteredOrders = useMemo(
    () =>
      filter === 'all'
        ? orders
        : orders.filter((o) => o.status === filter),
    [orders, filter]
  );

  const handleAdvanceStatus = useCallback(
    (order: SellerOrder) => {
      const next = NEXT_STATUS[order.status];
      if (!next) return;
      if (next === 'paid') {
        markOrderPaid(order.id);
      } else {
        updateOrderStatus(order.id, next);
      }
      setSelectedOrder(null);
    },
    [updateOrderStatus, markOrderPaid]
  );

  const renderOrder = useCallback(
    ({ item }: { item: SellerOrder }) => (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => setSelectedOrder(item)}
      >
        <View style={styles.orderHeader}>
          <View style={styles.orderMeta}>
            {item.customerName && (
              <Text style={styles.customerName}>{item.customerName}</Text>
            )}
            <Text style={styles.orderDate}>
              {format(item.date instanceof Date ? item.date : new Date(item.date), 'dd MMM')}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.orderItems}>
          {item.items.map((i) => `${i.productName} x${i.quantity}`).join(', ')}
        </Text>

        <View style={styles.orderFooter}>
          <Text style={styles.orderTotal}>
            {currency} {item.totalAmount.toFixed(2)}
          </Text>
          {!item.isPaid && (
            <Text style={styles.unpaidLabel}>unpaid</Text>
          )}
        </View>
      </TouchableOpacity>
    ),
    [currency]
  );

  return (
    <View style={styles.container}>
      {/* Status tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, filter === tab.value && styles.tabActive]}
            onPress={() => setFilter(tab.value)}
          >
            <Text style={[styles.tabText, filter === tab.value && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredOrders}
        renderItem={renderOrder}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={32} color={CALM.border} />
            <Text style={styles.emptyText}>no orders yet.</Text>
          </View>
        }
      />

      {/* Order detail bottom sheet */}
      <Modal
        visible={!!selectedOrder}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedOrder(null)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            {selectedOrder && (
              <>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {selectedOrder.customerName || 'Order'}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor(selectedOrder.status) }]}>
                    <Text style={styles.statusText}>{selectedOrder.status}</Text>
                  </View>
                </View>

                <Text style={styles.modalDate}>
                  {format(
                    selectedOrder.date instanceof Date ? selectedOrder.date : new Date(selectedOrder.date),
                    'dd MMM yyyy, h:mm a'
                  )}
                </Text>

                {/* Items */}
                <View style={styles.modalItems}>
                  {selectedOrder.items.map((item, i) => (
                    <View key={i} style={styles.modalItemRow}>
                      <Text style={styles.modalItemName}>
                        {item.productName} x{item.quantity} {item.unit}
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

                {selectedOrder.note && (
                  <Text style={styles.modalNote}>"{selectedOrder.note}"</Text>
                )}

                {selectedOrder.rawWhatsApp && (
                  <View style={styles.rawWhatsApp}>
                    <Text style={styles.rawWhatsAppLabel}>original message:</Text>
                    <Text style={styles.rawWhatsAppText}>{selectedOrder.rawWhatsApp}</Text>
                  </View>
                )}

                {/* Actions */}
                {NEXT_STATUS[selectedOrder.status] && (
                  <TouchableOpacity
                    style={styles.advanceButton}
                    onPress={() => handleAdvanceStatus(selectedOrder)}
                  >
                    <Text style={styles.advanceButtonText}>
                      mark as {NEXT_STATUS[selectedOrder.status]}
                    </Text>
                  </TouchableOpacity>
                )}

                {!selectedOrder.isPaid && selectedOrder.status !== 'pending' && (
                  <TouchableOpacity
                    style={styles.paidButton}
                    onPress={() => {
                      markOrderPaid(selectedOrder.id);
                      setSelectedOrder(null);
                    }}
                  >
                    <Text style={styles.paidButtonText}>mark as paid</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

function statusColor(status: OrderStatus): string {
  switch (status) {
    case 'pending': return '#FB8C3C';
    case 'confirmed': return '#5B4FE9';
    case 'ready': return '#11CDEF';
    case 'delivered': return '#2E7D5B';
    case 'paid': return '#8E8E93';
    default: return CALM.neutral;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  tabBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  tabBarContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  tab: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  tabActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  orderCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderMeta: {
    flex: 1,
    gap: 2,
  },
  customerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  orderDate: {
    ...TYPE.muted,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
    textTransform: 'uppercase',
  },
  orderItems: {
    ...TYPE.insight,
    color: CALM.textSecondary,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  unpaidLabel: {
    ...TYPE.muted,
    color: '#FB8C3C',
  },
  emptyState: {
    alignItems: 'center',
    padding: SPACING['3xl'],
    gap: SPACING.md,
  },
  emptyText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.md,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: CALM.border,
    alignSelf: 'center',
    marginBottom: SPACING.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  modalDate: {
    ...TYPE.muted,
  },
  modalItems: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalItemName: {
    ...TYPE.insight,
    color: CALM.textPrimary,
  },
  modalItemPrice: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.sm,
  },
  modalTotalLabel: {
    ...TYPE.label,
  },
  modalTotalAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  modalNote: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    fontStyle: 'italic',
  },
  rawWhatsApp: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  rawWhatsAppLabel: {
    ...TYPE.label,
  },
  rawWhatsAppText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  advanceButton: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  advanceButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  paidButton: {
    backgroundColor: CALM.positive,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  paidButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});

export default OrderList;
