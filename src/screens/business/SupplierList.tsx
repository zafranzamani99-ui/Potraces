import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, withAlpha } from '../../constants';
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
        {suppliers.length > 0 ? (
          suppliers.map((supplier) => (
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Supplier' : 'Add Supplier'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Feather name="x" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
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
    padding: 16,
    paddingBottom: 80,
  },
  supplierCard: {
    marginBottom: 12,
  },
  supplierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withAlpha(COLORS.business, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  supplierInfo: {
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButton: {
    padding: 8,
  },
  supplierName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  supplierContact: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  detailsSection: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  statsSection: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  addButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 16,
  },
  required: {
    color: COLORS.danger,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
});

export default SupplierList;
