import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { Client } from '../../types';

const ClientList: React.FC = () => {
  const { clients, addClient, logClientPayment, addBusinessTransaction } = useBusinessStore();
  const currency = useSettingsStore((s) => s.currency);

  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showPayment, setShowPayment] = useState(false);

  const totalAcross = useMemo(
    () => clients.reduce((s, c) => s + c.totalPaid, 0),
    [clients]
  );

  const handleAddClient = () => {
    if (!newClientName.trim()) return;
    addClient({ name: newClientName.trim() });
    setNewClientName('');
    setShowAddClient(false);
  };

  const handleLogPayment = () => {
    if (!selectedClient || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;

    logClientPayment(selectedClient.id, amount, new Date());
    addBusinessTransaction({
      date: new Date(),
      amount,
      type: 'income',
      clientId: selectedClient.id,
      note: `Payment from ${selectedClient.name}`,
      inputMethod: 'manual',
    });

    setPaymentAmount('');
    setShowPayment(false);
    setSelectedClient(null);
  };

  const renderClient = ({ item }: { item: Client }) => (
    <TouchableOpacity
      style={styles.clientCard}
      onPress={() => setSelectedClient(selectedClient?.id === item.id ? null : item)}
      activeOpacity={0.7}
    >
      <View style={styles.clientHeader}>
        <Text style={styles.clientName}>{item.name}</Text>
        <Text style={styles.clientTotal}>
          {currency} {item.totalPaid.toFixed(2)}
        </Text>
      </View>
      {item.lastPaid && (
        <Text style={styles.clientLastPaid}>
          last paid {format(item.lastPaid instanceof Date ? item.lastPaid : new Date(item.lastPaid), 'MMM dd')}
        </Text>
      )}

      {/* Log payment button */}
      <TouchableOpacity
        style={styles.logPaymentButton}
        onPress={() => {
          setSelectedClient(item);
          setShowPayment(true);
        }}
      >
        <Feather name="plus" size={14} color={CALM.bronze} />
        <Text style={styles.logPaymentText}>log payment</Text>
      </TouchableOpacity>

      {/* Expanded: payment history */}
      {selectedClient?.id === item.id && item.paymentHistory.length > 0 && (
        <View style={styles.historySection}>
          {item.paymentHistory.map((p, i) => (
            <View key={i} style={styles.historyRow}>
              <Text style={styles.historyDate}>
                {format(p.date instanceof Date ? p.date : new Date(p.date), 'MMM dd, yyyy')}
              </Text>
              <Text style={styles.historyAmount}>
                {currency} {p.amount.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Summary */}
      <Text style={styles.summary}>
        {currency} {totalAcross.toFixed(2)} received from {clients.length} client
        {clients.length !== 1 ? 's' : ''} so far.
      </Text>

      <FlatList
        data={clients}
        renderItem={renderClient}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No clients yet. Add your first one.</Text>
          </View>
        }
      />

      {/* Add client button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddClient(true)}
      >
        <Feather name="plus" size={20} color="#fff" />
        <Text style={styles.addButtonText}>add client</Text>
      </TouchableOpacity>

      {/* Add client modal */}
      <Modal visible={showAddClient} transparent statusBarTranslucent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>new client</Text>
            <TextInput
              style={styles.modalInput}
              value={newClientName}
              onChangeText={setNewClientName}
              placeholder="client name"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAddClient(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddClient} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment modal */}
      <Modal visible={showPayment} transparent statusBarTranslucent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              payment from {selectedClient?.name}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              placeholder="amount"
              placeholderTextColor={CALM.textSecondary}
              keyboardType="numeric"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setShowPayment(false);
                  setPaymentAmount('');
                }}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogPayment} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  summary: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    padding: SPACING['2xl'],
    paddingBottom: SPACING.md,
  },
  listContent: {
    padding: SPACING.lg,
    paddingTop: 0,
    gap: SPACING.md,
  },
  clientCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
  },
  clientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clientName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  clientTotal: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  clientLastPaid: {
    ...TYPE.label,
    marginTop: SPACING.xs,
  },
  logPaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  logPaymentText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  historySection: {
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyDate: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  historyAmount: {
    ...TYPE.muted,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  emptyText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    margin: SPACING.lg,
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    gap: SPACING.lg,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  modalInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  modalCancel: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  modalConfirm: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});

export default ClientList;
