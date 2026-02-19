import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useCRMStore } from '../../store/crmStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  SHADOWS,
  withAlpha,
} from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import StatCard from '../../components/common/StatCard';
import ProgressBar from '../../components/common/ProgressBar';
import FAB from '../../components/common/FAB';
import { useToast } from '../../context/ToastContext';
import { Customer, CustomerOrder, OrderItem } from '../../types';

// ─── LOCAL TYPES ──────────────────────────────────────────────
type OrderStatus = 'pending' | 'completed' | 'cancelled';
type PaymentStatus = 'unpaid' | 'partial' | 'paid';

interface LocalOrderItem {
  localId: string;
  name: string;
  quantity: string;
  unitPrice: string;
}

// ─── STATUS COLORS ────────────────────────────────────────────
const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: COLORS.warning,
  completed: COLORS.success,
  cancelled: COLORS.danger,
};

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: COLORS.danger,
  partial: COLORS.warning,
  paid: COLORS.success,
};

// ─── COMPONENT ────────────────────────────────────────────────
const CRM: React.FC = () => {
  const { showToast } = useToast();
  const currency = useSettingsStore((state) => state.currency);
  const {
    customers,
    orders,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addOrder,
    updateOrder,
    deleteOrder,
    addOrderPayment,
    getCustomerStats,
  } = useCRMStore();

  // ── Search ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Customer modal state ────────────────────────────────────
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // ── Customer detail modal state ─────────────────────────────
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // ── Order modal state ───────────────────────────────────────
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderCustomerId, setOrderCustomerId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<LocalOrderItem[]>([]);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('pending');
  const [orderNotes, setOrderNotes] = useState('');

  // ── Payment modal state ─────────────────────────────────────
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  // ── Refs for focus chain ────────────────────────────────────
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const companyRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const paymentAmountRef = useRef<TextInput>(null);

  // ── Computed data ───────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  const globalStats = useMemo(() => {
    const totalCustomers = customers.length;
    const allOrders = orders.filter((o) => o.status !== 'cancelled');
    const revenue = allOrders.reduce((sum, o) => sum + o.paidAmount, 0);
    const outstanding = allOrders.reduce(
      (sum, o) => sum + (o.totalAmount - o.paidAmount),
      0
    );
    return { totalCustomers, revenue, outstanding };
  }, [customers, orders]);

  // ── Order total computation ─────────────────────────────────
  const computeOrderTotal = (items: LocalOrderItem[]): number => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  };

  // ── Customer form handlers ──────────────────────────────────
  const resetCustomerForm = () => {
    setEditingCustomerId(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerCompany('');
    setCustomerNotes('');
  };

  const openAddCustomer = () => {
    resetCustomerForm();
    setCustomerModalVisible(true);
  };

  const openEditCustomer = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone || '');
    setCustomerEmail(customer.email || '');
    setCustomerCompany(customer.company || '');
    setCustomerNotes(customer.notes || '');
    setCustomerModalVisible(true);
  };

  const handleSaveCustomer = () => {
    if (!customerName.trim()) {
      showToast('Please enter a customer name', 'error');
      return;
    }

    Keyboard.dismiss();

    if (editingCustomerId) {
      updateCustomer(editingCustomerId, {
        name: customerName.trim(),
        phone: customerPhone.trim() || undefined,
        email: customerEmail.trim() || undefined,
        company: customerCompany.trim() || undefined,
        notes: customerNotes.trim() || undefined,
      });
      // Update selected customer in detail modal if it is the same one
      if (selectedCustomer && selectedCustomer.id === editingCustomerId) {
        setSelectedCustomer({
          ...selectedCustomer,
          name: customerName.trim(),
          phone: customerPhone.trim() || undefined,
          email: customerEmail.trim() || undefined,
          company: customerCompany.trim() || undefined,
          notes: customerNotes.trim() || undefined,
        });
      }
      showToast('Customer updated!', 'success');
    } else {
      addCustomer({
        name: customerName.trim(),
        phone: customerPhone.trim() || undefined,
        email: customerEmail.trim() || undefined,
        company: customerCompany.trim() || undefined,
        notes: customerNotes.trim() || undefined,
      });
      showToast('Customer added!', 'success');
    }

    setCustomerModalVisible(false);
    resetCustomerForm();
  };

  const handleDeleteCustomer = (customer: Customer) => {
    Alert.alert(
      'Delete Customer',
      `Are you sure you want to delete ${customer.name}? All their orders will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCustomer(customer.id);
            setDetailModalVisible(false);
            setSelectedCustomer(null);
            showToast('Customer deleted', 'success');
          },
        },
      ]
    );
  };

  // ── Customer detail handlers ────────────────────────────────
  const openCustomerDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailModalVisible(true);
  };

  const getCustomerOrders = (customerId: string): CustomerOrder[] => {
    return orders.filter((o) => o.customerId === customerId);
  };

  // ── Order form handlers ─────────────────────────────────────
  const resetOrderForm = () => {
    setEditingOrderId(null);
    setOrderItems([]);
    setOrderStatus('pending');
    setOrderNotes('');
  };

  const openAddOrder = (customerId: string) => {
    resetOrderForm();
    setOrderCustomerId(customerId);
    setOrderItems([
      {
        localId: Date.now().toString(),
        name: '',
        quantity: '1',
        unitPrice: '',
      },
    ]);
    setOrderModalVisible(true);
  };

  const openEditOrder = (order: CustomerOrder) => {
    setEditingOrderId(order.id);
    setOrderCustomerId(order.customerId);
    setOrderItems(
      order.items.map((item) => ({
        localId: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        name: item.name,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
      }))
    );
    setOrderStatus(order.status);
    setOrderNotes(order.notes || '');
    setOrderModalVisible(true);
  };

  const handleAddOrderItem = () => {
    setOrderItems([
      ...orderItems,
      {
        localId: Date.now().toString(),
        name: '',
        quantity: '1',
        unitPrice: '',
      },
    ]);
  };

  const handleRemoveOrderItem = (localId: string) => {
    if (orderItems.length <= 1) {
      showToast('Order must have at least one item', 'error');
      return;
    }
    setOrderItems(orderItems.filter((item) => item.localId !== localId));
  };

  const handleUpdateOrderItem = (
    localId: string,
    field: 'name' | 'quantity' | 'unitPrice',
    value: string
  ) => {
    setOrderItems(
      orderItems.map((item) =>
        item.localId === localId ? { ...item, [field]: value } : item
      )
    );
  };

  const handleSaveOrder = () => {
    // Validate items
    const hasEmptyItem = orderItems.some(
      (item) => !item.name.trim() || !item.unitPrice || parseFloat(item.unitPrice) <= 0
    );
    if (hasEmptyItem) {
      showToast('Please fill in all item names and prices', 'error');
      return;
    }
    if (!orderCustomerId) {
      showToast('No customer selected', 'error');
      return;
    }

    Keyboard.dismiss();

    const parsedItems: OrderItem[] = orderItems.map((item) => {
      const qty = parseFloat(item.quantity) || 1;
      const price = parseFloat(item.unitPrice) || 0;
      return {
        name: item.name.trim(),
        quantity: qty,
        unitPrice: price,
        totalPrice: qty * price,
      };
    });

    const totalAmount = parsedItems.reduce((sum, item) => sum + item.totalPrice, 0);

    if (totalAmount <= 0) {
      showToast('Order total must be greater than zero', 'error');
      return;
    }

    if (editingOrderId) {
      updateOrder(editingOrderId, {
        items: parsedItems,
        totalAmount,
        status: orderStatus,
        notes: orderNotes.trim() || undefined,
      });
      showToast('Order updated!', 'success');
    } else {
      addOrder({
        customerId: orderCustomerId,
        items: parsedItems,
        totalAmount,
        status: orderStatus,
        date: new Date(),
        notes: orderNotes.trim() || undefined,
      });
      showToast('Order added!', 'success');
    }

    setOrderModalVisible(false);
    resetOrderForm();
  };

  const handleDeleteOrder = (orderId: string) => {
    Alert.alert('Delete Order', 'Are you sure you want to delete this order?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteOrder(orderId);
          showToast('Order deleted', 'success');
        },
      },
    ]);
  };

  // ── Payment handlers ────────────────────────────────────────
  const openPaymentModal = (orderId: string) => {
    setPaymentOrderId(orderId);
    setPaymentAmount('');
    setPaymentModalVisible(true);
  };

  const getPaymentOrder = (): CustomerOrder | undefined => {
    if (!paymentOrderId) return undefined;
    return orders.find((o) => o.id === paymentOrderId);
  };

  const handleRecordPayment = () => {
    if (!paymentOrderId) return;
    const order = getPaymentOrder();
    if (!order) return;

    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const remaining = order.totalAmount - order.paidAmount;
    if (amount > remaining) {
      showToast(`Amount cannot exceed remaining ${currency} ${remaining.toFixed(2)}`, 'error');
      return;
    }

    Keyboard.dismiss();
    addOrderPayment(paymentOrderId, amount);
    setPaymentModalVisible(false);
    showToast('Payment recorded!', 'success');
  };

  // ── Render helpers ──────────────────────────────────────────
  const getInitial = (name: string): string => {
    return name.charAt(0).toUpperCase();
  };

  const formatCurrency = (amount: number): string => {
    return `${currency} ${amount.toFixed(2)}`;
  };

  const formatDate = (date: Date): string => {
    return format(new Date(date), 'MMM dd, yyyy');
  };

  // ─── MAIN RENDER ────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ModeToggle />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Summary Row */}
        <View style={styles.statsRow}>
          <StatCard
            title="Customers"
            value={globalStats.totalCustomers.toString()}
            icon="users"
            iconColor={COLORS.business}
          />
          <StatCard
            title="Revenue"
            value={formatCurrency(globalStats.revenue)}
            icon="dollar-sign"
            iconColor={COLORS.success}
          />
          <StatCard
            title="Outstanding"
            value={formatCurrency(globalStats.outstanding)}
            icon="alert-circle"
            iconColor={COLORS.warning}
          />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Feather
            name="search"
            size={18}
            color={COLORS.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search customers..."
            placeholderTextColor={COLORS.textTertiary}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* Customer List */}
        {filteredCustomers.length > 0 ? (
          filteredCustomers.map((customer) => {
            const stats = getCustomerStats(customer.id);
            return (
              <Card key={customer.id} style={styles.customerCard}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => openCustomerDetail(customer)}
                  accessibilityLabel={`View details for ${customer.name}`}
                  accessibilityHint="Opens customer detail view"
                >
                  <View style={styles.customerHeader}>
                    <View
                      style={styles.avatar}
                      accessibilityLabel={`Avatar for ${customer.name}`}
                    >
                      <Text style={styles.avatarText}>
                        {getInitial(customer.name)}
                      </Text>
                    </View>
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName}>{customer.name}</Text>
                      {customer.company ? (
                        <Text style={styles.customerCompany} numberOfLines={1}>
                          {customer.company}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.customerStats}>
                      <Text style={styles.customerRevenue}>
                        {formatCurrency(stats.totalSpent)}
                      </Text>
                      <Text style={styles.customerOrderCount}>
                        {stats.orderCount} order{stats.orderCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>

                  {stats.outstanding > 0 && (
                    <View style={styles.outstandingRow}>
                      <Feather
                        name="alert-circle"
                        size={14}
                        color={COLORS.warning}
                      />
                      <Text style={styles.outstandingText}>
                        {formatCurrency(stats.outstanding)} outstanding
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon="users"
            title="No customers yet"
            message="Add your first customer to start managing your CRM"
            actionLabel="Add Customer"
            onAction={openAddCustomer}
          />
        )}
      </ScrollView>

      <FAB
        onPress={openAddCustomer}
        icon="plus"
        color={COLORS.business}
      />

      {/* ── Add/Edit Customer Modal ────────────────────────────── */}
      <Modal
        visible={customerModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setCustomerModalVisible(false);
          resetCustomerForm();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingCustomerId ? 'Edit Customer' : 'Add Customer'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setCustomerModalVisible(false);
                    resetCustomerForm();
                  }}
                  accessibilityLabel="Close modal"
                >
                  <Feather name="x" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <Text style={styles.formLabel}>Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Customer name"
                  placeholderTextColor={COLORS.textTertiary}
                  returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                  autoCapitalize="words"
                />

                <Text style={styles.formLabel}>Phone</Text>
                <TextInput
                  ref={phoneRef}
                  style={styles.formInput}
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  placeholder="Phone number"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />

                <Text style={styles.formLabel}>Email</Text>
                <TextInput
                  ref={emailRef}
                  style={styles.formInput}
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                  placeholder="Email address"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => companyRef.current?.focus()}
                />

                <Text style={styles.formLabel}>Company</Text>
                <TextInput
                  ref={companyRef}
                  style={styles.formInput}
                  value={customerCompany}
                  onChangeText={setCustomerCompany}
                  placeholder="Company name"
                  placeholderTextColor={COLORS.textTertiary}
                  returnKeyType="next"
                  onSubmitEditing={() => notesRef.current?.focus()}
                />

                <Text style={styles.formLabel}>Notes</Text>
                <TextInput
                  ref={notesRef}
                  style={[styles.formInput, styles.textArea]}
                  value={customerNotes}
                  onChangeText={setCustomerNotes}
                  placeholder="Additional notes..."
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => {
                      setCustomerModalVisible(false);
                      resetCustomerForm();
                    }}
                    variant="outline"
                    style={styles.actionButton}
                  />
                  <Button
                    title={editingCustomerId ? 'Update' : 'Add'}
                    onPress={handleSaveCustomer}
                    icon="check"
                    style={styles.actionButton}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Customer Detail Modal ──────────────────────────────── */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setDetailModalVisible(false);
          setSelectedCustomer(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.detailModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customer Details</Text>
              <TouchableOpacity
                onPress={() => {
                  setDetailModalVisible(false);
                  setSelectedCustomer(null);
                }}
                accessibilityLabel="Close customer details"
              >
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {selectedCustomer && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.detailScroll}
              >
                {/* Contact Info Header */}
                <View style={styles.detailHeader}>
                  <View style={styles.detailAvatar}>
                    <Text style={styles.detailAvatarText}>
                      {getInitial(selectedCustomer.name)}
                    </Text>
                  </View>
                  <Text style={styles.detailName}>
                    {selectedCustomer.name}
                  </Text>
                  {selectedCustomer.company ? (
                    <Text style={styles.detailCompany}>
                      {selectedCustomer.company}
                    </Text>
                  ) : null}

                  <View style={styles.contactRow}>
                    {selectedCustomer.phone ? (
                      <View style={styles.contactItem}>
                        <Feather
                          name="phone"
                          size={14}
                          color={COLORS.textSecondary}
                        />
                        <Text style={styles.contactText}>
                          {selectedCustomer.phone}
                        </Text>
                      </View>
                    ) : null}
                    {selectedCustomer.email ? (
                      <View style={styles.contactItem}>
                        <Feather
                          name="mail"
                          size={14}
                          color={COLORS.textSecondary}
                        />
                        <Text style={styles.contactText}>
                          {selectedCustomer.email}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Stats Row */}
                {(() => {
                  const stats = getCustomerStats(selectedCustomer.id);
                  return (
                    <View style={styles.detailStatsRow}>
                      <View style={styles.detailStatItem}>
                        <Text style={styles.detailStatValue}>
                          {formatCurrency(stats.totalSpent)}
                        </Text>
                        <Text style={styles.detailStatLabel}>Total Spent</Text>
                      </View>
                      <View style={styles.detailStatDivider} />
                      <View style={styles.detailStatItem}>
                        <Text style={styles.detailStatValue}>
                          {stats.orderCount}
                        </Text>
                        <Text style={styles.detailStatLabel}>Orders</Text>
                      </View>
                      <View style={styles.detailStatDivider} />
                      <View style={styles.detailStatItem}>
                        <Text
                          style={[
                            styles.detailStatValue,
                            stats.outstanding > 0 && { color: COLORS.warning },
                          ]}
                        >
                          {formatCurrency(stats.outstanding)}
                        </Text>
                        <Text style={styles.detailStatLabel}>Outstanding</Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Orders List */}
                <Text style={styles.sectionLabel}>Orders</Text>
                {getCustomerOrders(selectedCustomer.id).length > 0 ? (
                  getCustomerOrders(selectedCustomer.id).map((order) => {
                    const remaining = order.totalAmount - order.paidAmount;
                    const progress =
                      order.totalAmount > 0
                        ? order.paidAmount / order.totalAmount
                        : 0;

                    return (
                      <Card key={order.id} style={styles.orderCard}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => openEditOrder(order)}
                          accessibilityLabel={`Order from ${formatDate(order.date)}, total ${formatCurrency(order.totalAmount)}`}
                        >
                          <View style={styles.orderHeader}>
                            <View style={styles.orderInfo}>
                              <Text style={styles.orderDate}>
                                {formatDate(order.date)}
                              </Text>
                              <Text style={styles.orderTotal}>
                                {formatCurrency(order.totalAmount)}
                              </Text>
                            </View>
                            <View style={styles.orderBadges}>
                              <View
                                style={[
                                  styles.statusBadge,
                                  {
                                    backgroundColor: withAlpha(
                                      ORDER_STATUS_COLORS[order.status],
                                      0.12
                                    ),
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statusBadgeText,
                                    {
                                      color:
                                        ORDER_STATUS_COLORS[order.status],
                                    },
                                  ]}
                                >
                                  {order.status.charAt(0).toUpperCase() +
                                    order.status.slice(1)}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.statusBadge,
                                  {
                                    backgroundColor: withAlpha(
                                      PAYMENT_STATUS_COLORS[order.paymentStatus],
                                      0.12
                                    ),
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statusBadgeText,
                                    {
                                      color:
                                        PAYMENT_STATUS_COLORS[
                                          order.paymentStatus
                                        ],
                                    },
                                  ]}
                                >
                                  {order.paymentStatus.charAt(0).toUpperCase() +
                                    order.paymentStatus.slice(1)}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Items summary */}
                          <Text style={styles.orderItemsSummary} numberOfLines={1}>
                            {order.items
                              .map((i) => `${i.name} x${i.quantity}`)
                              .join(', ')}
                          </Text>

                          {/* Payment Progress */}
                          {order.status !== 'cancelled' && (
                            <View style={styles.orderProgressContainer}>
                              <ProgressBar
                                current={order.paidAmount}
                                total={order.totalAmount}
                                color={COLORS.business}
                                height={6}
                                showPercentage={false}
                              />
                            </View>
                          )}
                        </TouchableOpacity>

                        {/* Order Actions */}
                        <View style={styles.orderActions}>
                          {order.status !== 'cancelled' &&
                            order.paymentStatus !== 'paid' && (
                              <TouchableOpacity
                                style={styles.orderActionButton}
                                onPress={() => openPaymentModal(order.id)}
                                activeOpacity={0.7}
                                accessibilityLabel="Record payment for this order"
                              >
                                <Feather
                                  name="credit-card"
                                  size={14}
                                  color={COLORS.success}
                                />
                                <Text
                                  style={[
                                    styles.orderActionText,
                                    { color: COLORS.success },
                                  ]}
                                >
                                  Pay
                                </Text>
                              </TouchableOpacity>
                            )}
                          <TouchableOpacity
                            style={styles.orderActionButton}
                            onPress={() => openEditOrder(order)}
                            activeOpacity={0.7}
                            accessibilityLabel="Edit this order"
                          >
                            <Feather
                              name="edit-2"
                              size={14}
                              color={COLORS.business}
                            />
                            <Text
                              style={[
                                styles.orderActionText,
                                { color: COLORS.business },
                              ]}
                            >
                              Edit
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.orderActionButton}
                            onPress={() => handleDeleteOrder(order.id)}
                            activeOpacity={0.7}
                            accessibilityLabel="Delete this order"
                          >
                            <Feather
                              name="trash-2"
                              size={14}
                              color={COLORS.danger}
                            />
                            <Text
                              style={[
                                styles.orderActionText,
                                { color: COLORS.danger },
                              ]}
                            >
                              Delete
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </Card>
                    );
                  })
                ) : (
                  <View style={styles.noOrdersContainer}>
                    <Feather
                      name="inbox"
                      size={32}
                      color={COLORS.textTertiary}
                    />
                    <Text style={styles.noOrdersText}>No orders yet</Text>
                  </View>
                )}

                {/* Detail Action Buttons */}
                <View style={styles.detailActions}>
                  <Button
                    title="Add Order"
                    onPress={() => openAddOrder(selectedCustomer.id)}
                    icon="plus"
                    style={styles.detailActionButton}
                  />
                  <Button
                    title="Edit Customer"
                    onPress={() => {
                      setDetailModalVisible(false);
                      openEditCustomer(selectedCustomer);
                    }}
                    variant="outline"
                    icon="edit-2"
                    style={styles.detailActionButton}
                  />
                  <Button
                    title="Delete Customer"
                    onPress={() => handleDeleteCustomer(selectedCustomer)}
                    variant="danger"
                    icon="trash-2"
                    style={styles.detailActionButton}
                  />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Add/Edit Order Modal ───────────────────────────────── */}
      <Modal
        visible={orderModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setOrderModalVisible(false);
          resetOrderForm();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingOrderId ? 'Edit Order' : 'Add Order'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setOrderModalVisible(false);
                    resetOrderForm();
                  }}
                  accessibilityLabel="Close order modal"
                >
                  <Feather name="x" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {/* Order Items */}
                <Text style={styles.formLabel}>Items</Text>
                {orderItems.map((item, index) => (
                  <View key={item.localId} style={styles.orderItemRow}>
                    <TextInput
                      style={[styles.formInput, styles.itemNameInput]}
                      value={item.name}
                      onChangeText={(v) =>
                        handleUpdateOrderItem(item.localId, 'name', v)
                      }
                      placeholder="Item name"
                      placeholderTextColor={COLORS.textTertiary}
                      returnKeyType="next"
                    />
                    <TextInput
                      style={[styles.formInput, styles.itemQtyInput]}
                      value={item.quantity}
                      onChangeText={(v) =>
                        handleUpdateOrderItem(item.localId, 'quantity', v)
                      }
                      placeholder="Qty"
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="number-pad"
                      returnKeyType="next"
                    />
                    <TextInput
                      style={[styles.formInput, styles.itemPriceInput]}
                      value={item.unitPrice}
                      onChangeText={(v) =>
                        handleUpdateOrderItem(item.localId, 'unitPrice', v)
                      }
                      placeholder="Price"
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <TouchableOpacity
                      style={styles.removeItemButton}
                      onPress={() => handleRemoveOrderItem(item.localId)}
                      accessibilityLabel={`Remove ${item.name || 'item'}`}
                    >
                      <Feather name="x" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.addItemRow}
                  onPress={handleAddOrderItem}
                  activeOpacity={0.7}
                  accessibilityLabel="Add another item"
                >
                  <Feather name="plus" size={18} color={COLORS.business} />
                  <Text style={styles.addItemText}>Add Item</Text>
                </TouchableOpacity>

                {/* Auto-computed Total */}
                <View style={styles.orderTotalRow}>
                  <Text style={styles.orderTotalLabel}>Total</Text>
                  <Text style={styles.orderTotalValue}>
                    {formatCurrency(computeOrderTotal(orderItems))}
                  </Text>
                </View>

                {/* Status Picker */}
                <Text style={styles.formLabel}>Status</Text>
                <View style={styles.statusPickerContainer}>
                  {(['pending', 'completed', 'cancelled'] as OrderStatus[]).map(
                    (status) => (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.statusPickerButton,
                          orderStatus === status && {
                            backgroundColor: ORDER_STATUS_COLORS[status],
                            borderColor: ORDER_STATUS_COLORS[status],
                          },
                          orderStatus !== status && {
                            borderColor: ORDER_STATUS_COLORS[status],
                          },
                        ]}
                        onPress={() => setOrderStatus(status)}
                        activeOpacity={0.7}
                        accessibilityLabel={`Set status to ${status}`}
                        accessibilityState={{ selected: orderStatus === status }}
                      >
                        <Text
                          style={[
                            styles.statusPickerText,
                            orderStatus === status
                              ? { color: '#FFFFFF' }
                              : { color: ORDER_STATUS_COLORS[status] },
                          ]}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>

                {/* Notes */}
                <Text style={styles.formLabel}>Notes</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={orderNotes}
                  onChangeText={setOrderNotes}
                  placeholder="Order notes..."
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => {
                      setOrderModalVisible(false);
                      resetOrderForm();
                    }}
                    variant="outline"
                    style={styles.actionButton}
                  />
                  <Button
                    title={editingOrderId ? 'Update' : 'Add Order'}
                    onPress={handleSaveOrder}
                    icon="check"
                    style={styles.actionButton}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Record Payment Modal ───────────────────────────────── */}
      <Modal
        visible={paymentModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Record Payment</Text>
                <TouchableOpacity
                  onPress={() => setPaymentModalVisible(false)}
                  accessibilityLabel="Close payment modal"
                >
                  <Feather name="x" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {(() => {
                const order = getPaymentOrder();
                if (!order) return null;
                const remaining = order.totalAmount - order.paidAmount;

                return (
                  <>
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>Order Total</Text>
                      <Text style={styles.paymentInfoValue}>
                        {formatCurrency(order.totalAmount)}
                      </Text>
                    </View>
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>Already Paid</Text>
                      <Text
                        style={[
                          styles.paymentInfoValue,
                          { color: COLORS.success },
                        ]}
                      >
                        {formatCurrency(order.paidAmount)}
                      </Text>
                    </View>
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>Remaining</Text>
                      <Text
                        style={[
                          styles.paymentInfoValue,
                          { color: COLORS.warning },
                        ]}
                      >
                        {formatCurrency(remaining)}
                      </Text>
                    </View>

                    <Text style={styles.formLabel}>Amount</Text>
                    <TextInput
                      ref={paymentAmountRef}
                      style={styles.formInput}
                      value={paymentAmount}
                      onChangeText={setPaymentAmount}
                      placeholder={`Max ${currency} ${remaining.toFixed(2)}`}
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={handleRecordPayment}
                      autoFocus
                    />
                  </>
                );
              })()}

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => setPaymentModalVisible(false)}
                  variant="outline"
                  style={styles.actionButton}
                />
                <Button
                  title="Record"
                  onPress={handleRecordPayment}
                  icon="check"
                  style={styles.actionButton}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 80,
  },
  keyboardView: {
    flex: 1,
  },

  // ── Stats Row ───────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  // ── Search ──────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },

  // ── Customer Cards ──────────────────────────────────────────
  customerCard: {
    marginBottom: SPACING.md,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withAlpha(COLORS.business, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.business,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  customerCompany: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
  },
  customerStats: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  customerRevenue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  customerOrderCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
  },
  outstandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  outstandingText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.warning,
  },

  // ── Modals ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING['2xl'],
    maxHeight: '90%',
  },
  detailModalContent: {
    maxHeight: '95%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING['2xl'],
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
    marginBottom: SPACING.lg,
  },
  actionButton: {
    flex: 1,
  },

  // ── Form Elements ───────────────────────────────────────────
  formLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  formInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 80,
    paddingTop: SPACING.md,
  },

  // ── Customer Detail ─────────────────────────────────────────
  detailScroll: {
    paddingBottom: SPACING['2xl'],
  },
  detailHeader: {
    alignItems: 'center',
    marginBottom: SPACING['2xl'],
  },
  detailAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: withAlpha(COLORS.business, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  detailAvatarText: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.business,
  },
  detailName: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  detailCompany: {
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  contactText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
  },

  // ── Detail Stats ────────────────────────────────────────────
  detailStatsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING['2xl'],
  },
  detailStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailStatValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  detailStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
  },
  detailStatDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.sm,
  },

  // ── Section Label ───────────────────────────────────────────
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },

  // ── Order Cards (inside detail) ─────────────────────────────
  orderCard: {
    marginBottom: SPACING.md,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  orderInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  orderDate: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  orderTotal: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  orderBadges: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  statusBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  orderItemsSummary: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  orderProgressContainer: {
    marginTop: SPACING.xs,
  },
  orderActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  orderActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  orderActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  noOrdersContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.sm,
  },
  noOrdersText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textTertiary,
  },

  // ── Detail Actions ──────────────────────────────────────────
  detailActions: {
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },
  detailActionButton: {
    // full width by default in the column layout
  },

  // ── Order Form ──────────────────────────────────────────────
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  itemNameInput: {
    flex: 3,
  },
  itemQtyInput: {
    flex: 1,
    textAlign: 'center',
  },
  itemPriceInput: {
    flex: 2,
    textAlign: 'right',
  },
  removeItemButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(COLORS.danger, 0.08),
  },
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
  },
  addItemText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.business,
  },
  orderTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: withAlpha(COLORS.business, 0.08),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
  },
  orderTotalLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  orderTotalValue: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.business,
    fontVariant: ['tabular-nums'],
  },

  // ── Status Picker ───────────────────────────────────────────
  statusPickerContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statusPickerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    backgroundColor: COLORS.surface,
  },
  statusPickerText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── Payment Modal ───────────────────────────────────────────
  paymentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  paymentInfoLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.textSecondary,
  },
  paymentInfoValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
});

export default CRM;
