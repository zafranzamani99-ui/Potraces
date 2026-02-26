import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  TouchableOpacity,
  Keyboard,
  Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import { useToast } from '../../context/ToastContext';

const SupplierList: React.FC = () => {
  const { showToast } = useToast();
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useBusinessStore();
  const currency = useSettingsStore(state => state.currency);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase().trim();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))
    );
  }, [suppliers, searchQuery]);

  const handleAdd = () => {
    if (!name.trim()) {
      showToast('Please enter supplier name', 'error');
      return;
    }

    const supplierData = {
      name: name.trim(),
      contactPerson: contactPerson.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      paymentTerms: paymentTerms.trim() || undefined,
    };

    if (editingId) {
      updateSupplier(editingId, supplierData);
      showToast('Supplier updated successfully!', 'success');
    } else {
      addSupplier({
        ...supplierData,
        products: [],
        totalPurchased: 0,
      });
      showToast('Supplier added successfully!', 'success');
    }

    setModalVisible(false);
    resetForm();
  };

  const handleEdit = (id: string) => {
    const supplier = suppliers.find((s) => s.id === id);
    if (!supplier) return;
    setEditingId(id);
    setName(supplier.name);
    setContactPerson(supplier.contactPerson || '');
    setPhone(supplier.phone || '');
    setEmail(supplier.email || '');
    setAddress(supplier.address || '');
    setPaymentTerms(supplier.paymentTerms || '');
    setModalVisible(true);
  };

  const handleDelete = (id: string, supplierName: string) => {
    Alert.alert(
      'Delete Supplier',
      `Are you sure you want to delete "${supplierName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSupplier(id);
            showToast('Supplier deleted', 'success');
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setPaymentTerms('');
  };

  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Search bar */}
        {suppliers.length > 0 && (
          <View style={styles.searchContainer}>
            <Feather name="search" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search suppliers..."
              placeholderTextColor={COLORS.textSecondary}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {filteredSuppliers.length > 0 ? (
          filteredSuppliers.map((supplier) => (
            <Card key={supplier.id} style={styles.supplierCard}>
              <View style={styles.supplierHeader}>
                <View style={styles.iconContainer}>
                  <Feather name="truck" size={24} color={COLORS.business} />
                </View>
                <View style={styles.supplierInfo}>
                  <Text style={styles.supplierName}>{supplier.name}</Text>
                  {supplier.contactPerson && (
                    <Text style={styles.supplierContact}>{supplier.contactPerson}</Text>
                  )}
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => handleEdit(supplier.id)} style={styles.actionButton}>
                    <Feather name="edit-2" size={18} color={COLORS.business} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(supplier.id, supplier.name)} style={styles.actionButton}>
                    <Feather name="trash-2" size={18} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.detailsSection}>
                {supplier.phone && (
                  <View style={styles.detailRow}>
                    <Feather name="phone" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{supplier.phone}</Text>
                  </View>
                )}
                {supplier.email && (
                  <View style={styles.detailRow}>
                    <Feather name="mail" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{supplier.email}</Text>
                  </View>
                )}
                {supplier.address && (
                  <View style={styles.detailRow}>
                    <Feather name="map-pin" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{supplier.address}</Text>
                  </View>
                )}
                {supplier.paymentTerms && (
                  <View style={styles.detailRow}>
                    <Feather name="credit-card" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{supplier.paymentTerms}</Text>
                  </View>
                )}
              </View>

              <View style={styles.divider} />

              <View style={styles.statsSection}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Total Purchased</Text>
                  <Text style={styles.statValue}>{currency} {supplier.totalPurchased.toFixed(2)}</Text>
                </View>
                {supplier.lastPurchaseDate && (
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Last Purchase</Text>
                    <Text style={styles.statValue}>
                      {format(supplier.lastPurchaseDate, 'MMM dd, yyyy')}
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          ))
        ) : suppliers.length > 0 ? (
          <View style={styles.noResults}>
            <Feather name="search" size={40} color={COLORS.textSecondary} />
            <Text style={styles.noResultsTitle}>No results found</Text>
            <Text style={styles.noResultsText}>
              Try a different search term
            </Text>
          </View>
        ) : (
          <EmptyState
            icon="truck"
            title="No Suppliers"
            message="Add suppliers to track your business purchases and relationships"
            actionLabel="Add Supplier"
            onAction={() => setModalVisible(true)}
          />
        )}
      </ScrollView>

      <Button
        title="Add Supplier"
        onPress={() => {
          resetForm();
          setModalVisible(true);
        }}
        icon="plus"
        size="large"
        style={styles.addButton}
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Supplier' : 'Add Supplier'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>
                Supplier Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="ABC Supplies Co."
                placeholderTextColor={COLORS.textSecondary}
                returnKeyType="next"
              />

              <Text style={styles.label}>Contact Person</Text>
              <TextInput
                style={styles.input}
                value={contactPerson}
                onChangeText={setContactPerson}
                placeholder="John Doe"
                placeholderTextColor={COLORS.textSecondary}
                returnKeyType="next"
              />

              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+60 12-345 6789"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="contact@supplier.com"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />

              <Text style={styles.label}>Address</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={address}
                onChangeText={setAddress}
                placeholder="123 Main Street, City"
                placeholderTextColor={COLORS.textSecondary}
                multiline
                numberOfLines={2}
              />

              <Text style={styles.label}>Payment Terms</Text>
              <TextInput
                style={styles.input}
                value={paymentTerms}
                onChangeText={setPaymentTerms}
                placeholder="Net 30 days"
                placeholderTextColor={COLORS.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => { setModalVisible(false); resetForm(); }}
                  variant="secondary"
                  style={{ flex: 1 }}
                />
                <Button
                  title={editingId ? 'Update' : 'Add'}
                  onPress={handleAdd}
                  icon="check"
                  style={{ flex: 1 }}
                />
              </View>
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

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

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },

  // Supplier cards
  supplierCard: {
    marginBottom: SPACING.md,
  },
  supplierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: RADIUS['2xl'],
    backgroundColor: withAlpha(COLORS.business, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  supplierInfo: {
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  actionButton: {
    padding: SPACING.sm,
  },
  supplierName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: 2,
  },
  supplierContact: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  detailsSection: {
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  detailText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.text,
    flex: 1,
  },
  statsSection: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  statValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },

  // No results
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['5xl'],
    gap: SPACING.sm,
  },
  noResultsTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
  },

  // FAB
  addButton: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING['2xl'],
    maxHeight: '90%',
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
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  required: {
    color: COLORS.danger,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },
});

export default SupplierList;
