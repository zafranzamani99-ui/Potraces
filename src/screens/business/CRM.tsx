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
  Platform,
  Keyboard,
  Linking,
  ActionSheetIOS,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useCRMStore } from '../../store/crmStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  CALM,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  withAlpha,
} from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ProgressBar from '../../components/common/ProgressBar';
import FAB from '../../components/common/FAB';
import { useToast } from '../../context/ToastContext';
import { Customer, CustomerOrder, OrderItem } from '../../types';

// ─── LOCAL TYPES ──────────────────────────────────────────────
type OrderStatus = 'pending' | 'completed' | 'cancelled';
type PaymentStatus = 'unpaid' | 'partial' | 'paid';

interface LocalOrderItem {
  localId: string;
  productId?: string;
  name: string;
  quantity: string;
  unitPrice: string;
}

// ─── STATUS COLORS ────────────────────────────────────────────
const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: CALM.neutral,
  completed: CALM.positive,
  cancelled: CALM.neutral,
};

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: CALM.neutral,
  partial: CALM.neutral,
  paid: CALM.positive,
};

// ─── COMPONENT ────────────────────────────────────────────────
const CRM: React.FC = () => {
  const { showToast } = useToast();
  const currency = useSettingsStore((state) => state.currency);
  const { products } = useBusinessStore();
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
  const [customerAddress, setCustomerAddress] = useState('');

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
  const [productPickerOpen, setProductPickerOpen] = useState<string | null>(null); // localId of item being picked
  const [productPickerSearch, setProductPickerSearch] = useState('');

  // ── Payment modal state ─────────────────────────────────────
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  // ── Refs for focus chain ────────────────────────────────────
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const companyRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const paymentAmountRef = useRef<TextInput>(null);

  // ── Computed data ───────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }
    // Sort: customers with outstanding (pending) orders first
    return [...list].sort((a, b) => {
      const aStats = getCustomerStats(a.id);
      const bStats = getCustomerStats(b.id);
      return bStats.outstanding - aStats.outstanding;
    });
  }, [customers, searchQuery, orders]);

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
    setCustomerAddress('');
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
    setCustomerAddress(customer.address || '');
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
        address: customerAddress.trim() || undefined,
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
          address: customerAddress.trim() || undefined,
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
        address: customerAddress.trim() || undefined,
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
    setProductPickerOpen(null);
    setProductPickerSearch('');
  };

  const openAddOrder = (customerId: string) => {
    resetOrderForm();
    setOrderCustomerId(customerId);
    const firstId = Date.now().toString();
    setOrderItems([
      { localId: firstId, name: '', quantity: '1', unitPrice: '' },
    ]);
    setProductPickerOpen(firstId);
    setProductPickerSearch('');
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
    // Refresh selectedCustomer from store so detail modal shows updated data
    if (selectedCustomer) {
      const fresh = useCRMStore.getState().customers.find((c) => c.id === selectedCustomer.id);
      if (fresh) setSelectedCustomer(fresh);
    }
    setPaymentModalVisible(false);
    setDetailModalVisible(true);
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

  // ── Open address in maps ──────────────────────────────────
  const openInMaps = (address: string) => {
    const encoded = encodeURIComponent(address);
    const options = [
      { label: 'Google Maps', url: `https://www.google.com/maps/search/?api=1&query=${encoded}` },
      { label: 'Waze', url: `https://waze.com/ul?q=${encoded}&navigate=yes` },
      ...(Platform.OS === 'ios' ? [{ label: 'Apple Maps', url: `http://maps.apple.com/?q=${encoded}` }] : []),
    ];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options.map((o) => o.label), 'Cancel'],
          cancelButtonIndex: options.length,
          title: 'Open in Maps',
        },
        (buttonIndex) => {
          if (buttonIndex < options.length) {
            Linking.openURL(options[buttonIndex].url);
          }
        }
      );
    } else {
      Alert.alert('Open in Maps', 'Choose a maps app', [
        ...options.map((o) => ({
          text: o.label,
          onPress: () => Linking.openURL(o.url),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  // ── Product picker helpers ─────────────────────────────────
  const pickerFilteredProducts = useMemo(() => {
    if (!productPickerSearch.trim()) return products;
    const q = productPickerSearch.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productPickerSearch]);

  const handleSelectProduct = (localId: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setOrderItems(
      orderItems.map((item) =>
        item.localId === localId
          ? { ...item, productId, name: product.name, unitPrice: product.price.toString() }
          : item
      )
    );
    setProductPickerOpen(null);
    setProductPickerSearch('');
  };

  const handleAddProductItem = () => {
    const newLocalId = Date.now().toString();
    setOrderItems([
      ...orderItems,
      { localId: newLocalId, name: '', quantity: '1', unitPrice: '' },
    ]);
    setProductPickerOpen(newLocalId);
    setProductPickerSearch('');
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
          <View style={styles.statBox}>
            <View style={[styles.statIconWrap, { backgroundColor: withAlpha(CALM.bronze, 0.12) }]}>
              <Feather name="users" size={18} color={CALM.bronze} />
            </View>
            <Text style={styles.statValue}>{globalStats.totalCustomers}</Text>
            <Text style={styles.statLabel}>Customers</Text>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statIconWrap, { backgroundColor: withAlpha(CALM.positive, 0.12) }]}>
              <Feather name="dollar-sign" size={18} color={CALM.positive} />
            </View>
            <Text style={styles.statValue}>{formatCurrency(globalStats.revenue)}</Text>
            <Text style={styles.statLabel}>Revenue</Text>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statIconWrap, { backgroundColor: withAlpha(CALM.neutral, 0.12) }]}>
              <Feather name="alert-circle" size={18} color={CALM.neutral} />
            </View>
            <Text style={[styles.statValue, globalStats.outstanding > 0 && { color: CALM.neutral }]}>
              {formatCurrency(globalStats.outstanding)}
            </Text>
            <Text style={styles.statLabel}>Outstanding</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Feather
            name="search"
            size={18}
            color={CALM.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search customers..."
            placeholderTextColor={CALM.neutral}
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
                    {/* Quick action icons inline */}
                    {(customer.phone || customer.address) && (
                      <View style={styles.quickActions}>
                        {customer.phone ? (
                          <TouchableOpacity
                            style={styles.quickActionBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              Linking.openURL(`tel:${customer.phone}`);
                            }}
                            activeOpacity={0.7}
                            accessibilityLabel={`Call ${customer.name}`}
                          >
                            <Feather name="phone" size={14} color={CALM.bronze} />
                          </TouchableOpacity>
                        ) : null}
                        {customer.address ? (
                          <TouchableOpacity
                            style={styles.quickActionBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              openInMaps(customer.address!);
                            }}
                            activeOpacity={0.7}
                            accessibilityLabel={`Open ${customer.name}'s address in maps`}
                          >
                            <Feather name="map-pin" size={14} color={CALM.bronze} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}
                  </View>

                  {stats.outstanding > 0 && (
                    <View style={styles.outstandingRow}>
                      <Feather
                        name="alert-circle"
                        size={14}
                        color={CALM.neutral}
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
        color={CALM.bronze}
      />

      {/* ── Add/Edit Customer Modal ────────────────────────────── */}
      <Modal
        visible={customerModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setCustomerModalVisible(false);
          resetCustomerForm();
        }}
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
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.formLabel}>Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Customer name"
                  placeholderTextColor={CALM.neutral}
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
                  placeholderTextColor={CALM.neutral}
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
                  placeholderTextColor={CALM.neutral}
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
                  placeholderTextColor={CALM.neutral}
                  returnKeyType="next"
                  onSubmitEditing={() => addressRef.current?.focus()}
                />

                <Text style={styles.formLabel}>Address (for COD)</Text>
                <TextInput
                  ref={addressRef}
                  style={[styles.formInput, styles.textArea]}
                  value={customerAddress}
                  onChangeText={setCustomerAddress}
                  placeholder="Delivery address..."
                  placeholderTextColor={CALM.neutral}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  blurOnSubmit
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
                  placeholderTextColor={CALM.neutral}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  blurOnSubmit
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
              </KeyboardAwareScrollView>
            </View>
        </View>
      </Modal>

      {/* ── Customer Detail Modal ──────────────────────────────── */}
      <Modal
        visible={detailModalVisible}
        animationType="fade"
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
                <Feather name="x" size={24} color={CALM.textPrimary} />
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
                      <TouchableOpacity
                        style={styles.contactButton}
                        onPress={() => Linking.openURL(`tel:${selectedCustomer.phone}`)}
                        activeOpacity={0.7}
                        accessibilityLabel={`Call ${selectedCustomer.phone}`}
                      >
                        <Feather name="phone" size={14} color={CALM.bronze} />
                        <Text style={styles.contactButtonText}>
                          {selectedCustomer.phone}
                        </Text>
                        <Feather name="external-link" size={12} color={CALM.bronze} />
                      </TouchableOpacity>
                    ) : null}
                    {selectedCustomer.email ? (
                      <TouchableOpacity
                        style={styles.contactButton}
                        onPress={() => Linking.openURL(`mailto:${selectedCustomer.email}`)}
                        activeOpacity={0.7}
                        accessibilityLabel={`Email ${selectedCustomer.email}`}
                      >
                        <Feather name="mail" size={14} color={CALM.bronze} />
                        <Text style={styles.contactButtonText}>
                          {selectedCustomer.email}
                        </Text>
                        <Feather name="external-link" size={12} color={CALM.bronze} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {selectedCustomer.address ? (
                    <TouchableOpacity
                      style={styles.addressRow}
                      onPress={() => openInMaps(selectedCustomer.address!)}
                      activeOpacity={0.7}
                    >
                      <Feather name="map-pin" size={14} color={CALM.bronze} />
                      <Text style={styles.addressText} numberOfLines={2}>
                        {selectedCustomer.address}
                      </Text>
                      <Feather name="external-link" size={14} color={CALM.bronze} />
                    </TouchableOpacity>
                  ) : null}
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
                            stats.outstanding > 0 && { color: CALM.neutral },
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
                          onPress={() => {
                            setDetailModalVisible(false);
                            openEditOrder(order);
                          }}
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
                                color={CALM.bronze}
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
                                onPress={() => {
                                  setDetailModalVisible(false);
                                  openPaymentModal(order.id);
                                }}
                                activeOpacity={0.7}
                                accessibilityLabel="Record payment for this order"
                              >
                                <Feather
                                  name="credit-card"
                                  size={14}
                                  color={CALM.positive}
                                />
                                <Text
                                  style={[
                                    styles.orderActionText,
                                    { color: CALM.positive },
                                  ]}
                                >
                                  Pay
                                </Text>
                              </TouchableOpacity>
                            )}
                          <TouchableOpacity
                            style={styles.orderActionButton}
                            onPress={() => handleDeleteOrder(order.id)}
                            activeOpacity={0.7}
                            accessibilityLabel="Delete this order"
                          >
                            <Feather
                              name="trash-2"
                              size={14}
                              color={CALM.neutral}
                            />
                            <Text
                              style={[
                                styles.orderActionText,
                                { color: CALM.neutral },
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
                      color={CALM.neutral}
                    />
                    <Text style={styles.noOrdersText}>No orders yet</Text>
                  </View>
                )}

                {/* Detail Action Buttons */}
                <View style={styles.detailActions}>
                  <Button
                    title="Add Order"
                    onPress={() => {
                      setDetailModalVisible(false);
                      openAddOrder(selectedCustomer.id);
                    }}
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
        animationType="fade"
        transparent
        onRequestClose={() => {
          setOrderModalVisible(false);
          resetOrderForm();
        }}
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
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Order Items */}
                <Text style={styles.formLabel}>Items</Text>
                {orderItems.map((item) => (
                  <View key={item.localId} style={styles.orderItemCard}>
                    {/* Product selector */}
                    <TouchableOpacity
                      style={styles.productSelector}
                      onPress={() => {
                        setProductPickerOpen(
                          productPickerOpen === item.localId ? null : item.localId
                        );
                        setProductPickerSearch('');
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="package" size={16} color={item.name ? CALM.bronze : CALM.neutral} />
                      <Text
                        style={[
                          styles.productSelectorText,
                          !item.name && { color: CALM.neutral },
                        ]}
                        numberOfLines={1}
                      >
                        {item.name || 'Select product...'}
                      </Text>
                      <Feather
                        name={productPickerOpen === item.localId ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={CALM.textSecondary}
                      />
                    </TouchableOpacity>

                    {/* Product dropdown */}
                    {productPickerOpen === item.localId && (
                      <View style={styles.productDropdown}>
                        <View style={styles.productDropdownSearch}>
                          <Feather name="search" size={14} color={CALM.textSecondary} />
                          <TextInput
                            style={styles.productDropdownSearchInput}
                            value={productPickerSearch}
                            onChangeText={setProductPickerSearch}
                            placeholder="Search products..."
                            placeholderTextColor={CALM.neutral}
                            autoFocus
                          />
                          {productPickerSearch.length > 0 && (
                            <TouchableOpacity onPress={() => setProductPickerSearch('')}>
                              <Feather name="x" size={14} color={CALM.textSecondary} />
                            </TouchableOpacity>
                          )}
                        </View>
                        <ScrollView style={styles.productDropdownList} nestedScrollEnabled>
                          {pickerFilteredProducts.map((p) => (
                            <TouchableOpacity
                              key={p.id}
                              style={[
                                styles.productDropdownItem,
                                item.productId === p.id && styles.productDropdownItemActive,
                              ]}
                              onPress={() => handleSelectProduct(item.localId, p.id)}
                              activeOpacity={0.7}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.productDropdownItemName}>{p.name}</Text>
                                <Text style={styles.productDropdownItemMeta}>
                                  {currency} {p.price.toFixed(2)} · {p.stock} in stock
                                </Text>
                              </View>
                              {item.productId === p.id && (
                                <Feather name="check" size={16} color={CALM.bronze} />
                              )}
                            </TouchableOpacity>
                          ))}
                          {pickerFilteredProducts.length === 0 && (
                            <View style={styles.productDropdownEmpty}>
                              <Text style={styles.productDropdownEmptyText}>No products found</Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    )}

                    {/* Qty & Price row */}
                    <View style={styles.orderItemRow}>
                      <TextInput
                        style={[styles.formInput, styles.itemQtyInput]}
                        value={item.quantity}
                        onChangeText={(v) =>
                          handleUpdateOrderItem(item.localId, 'quantity', v)
                        }
                        placeholder="Qty"
                        placeholderTextColor={CALM.neutral}
                        keyboardType="number-pad"
                      />
                      <TextInput
                        style={[styles.formInput, styles.itemPriceInput]}
                        value={item.unitPrice}
                        onChangeText={(v) =>
                          handleUpdateOrderItem(item.localId, 'unitPrice', v)
                        }
                        placeholder="Price"
                        placeholderTextColor={CALM.neutral}
                        keyboardType="decimal-pad"
                      />
                      <TouchableOpacity
                        style={styles.removeItemButton}
                        onPress={() => handleRemoveOrderItem(item.localId)}
                        accessibilityLabel={`Remove ${item.name || 'item'}`}
                      >
                        <Feather name="x" size={18} color={CALM.neutral} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.addItemRow}
                  onPress={handleAddProductItem}
                  activeOpacity={0.7}
                  accessibilityLabel="Add another item"
                >
                  <Feather name="plus" size={18} color={CALM.bronze} />
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
                  placeholderTextColor={CALM.neutral}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  blurOnSubmit
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
              </KeyboardAwareScrollView>
            </View>
        </View>
      </Modal>

      {/* ── Record Payment Modal ───────────────────────────────── */}
      <Modal
        visible={paymentModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Record Payment</Text>
                <TouchableOpacity
                  onPress={() => setPaymentModalVisible(false)}
                  accessibilityLabel="Close payment modal"
                >
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
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
                            { color: CALM.positive },
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
                            { color: CALM.neutral },
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
                        placeholderTextColor={CALM.neutral}
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
              </KeyboardAwareScrollView>
            </View>
        </View>
      </Modal>



    </View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 80,
  },
  // ── Stats Row ───────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statBox: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  statValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    textAlign: 'center',
  },

  // ── Search ──────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
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
    backgroundColor: withAlpha(CALM.bronze, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.bronze,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  customerCompany: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  customerStats: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  customerRevenue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  customerOrderCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  outstandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  outstandingText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.neutral,
  },
  quickActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  quickActionBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Modals ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
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
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  formInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
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
    backgroundColor: withAlpha(CALM.bronze, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  detailAvatarText: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.bronze,
  },
  detailName: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  detailCompany: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
    marginBottom: SPACING.md,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  contactButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
  },

  // ── Detail Stats ────────────────────────────────────────────
  detailStatsRow: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING['2xl'],
    borderWidth: 1,
    borderColor: CALM.border,
  },
  detailStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailStatValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  detailStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  detailStatDivider: {
    width: 1,
    backgroundColor: CALM.border,
    marginHorizontal: SPACING.sm,
  },

  // ── Section Label ───────────────────────────────────────────
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
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
    color: CALM.textSecondary,
    marginBottom: 2,
  },
  orderTotal: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
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
    borderTopColor: CALM.border,
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
    color: CALM.neutral,
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
  orderItemCard: {
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  productSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  productSelectorText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  productDropdown: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    maxHeight: 200,
  },
  productDropdownSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  productDropdownSearchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    paddingVertical: 2,
  },
  productDropdownList: {
    maxHeight: 150,
  },
  productDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  productDropdownItemActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.06),
  },
  productDropdownItemName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  productDropdownItemMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 1,
  },
  productDropdownEmpty: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  productDropdownEmptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.neutral,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
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
    backgroundColor: withAlpha(CALM.neutral, 0.08),
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
    color: CALM.bronze,
  },
  orderTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
  },
  orderTotalLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  orderTotalValue: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.bronze,
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
    backgroundColor: CALM.surface,
  },
  statusPickerText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── Address ────────────────────────────────────────────────
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  addressText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
  },

  // ── Payment Modal ───────────────────────────────────────────
  paymentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  paymentInfoLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
  },
  paymentInfoValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

export default CRM;
