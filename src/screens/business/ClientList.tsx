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
import { withAlpha, CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { Client } from '../../types';
import ModalToastHost from '../../components/common/ModalToastHost';

const ClientList: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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
          {t.business.clientsLastPaid} {format(item.lastPaid instanceof Date ? item.lastPaid : new Date(item.lastPaid), 'MMM dd')}
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
        <Feather name="plus" size={14} color={C.bronze} />
        <Text style={styles.logPaymentText}>{t.business.clientsLogPayment}</Text>
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
        {t.business.clientsSummary
          .replace('{currency}', currency)
          .replace('{total}', totalAcross.toFixed(2))
          .replace('{n}', String(clients.length))
          .replace('{plural}', clients.length !== 1 ? 's' : '')}
      </Text>

      <FlatList
        data={clients}
        renderItem={renderClient}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t.business.clientsEmpty}</Text>
          </View>
        }
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
        keyboardShouldPersistTaps="handled"
      />

      {/* Add client button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddClient(true)}
      >
        <Feather name="plus" size={20} color={C.onAccent} />
        <Text style={styles.addButtonText}>{t.business.clientsAddClient}</Text>
      </TouchableOpacity>

      {/* Add client modal */}
      <Modal visible={showAddClient} transparent statusBarTranslucent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t.business.clientsNewClient}</Text>
            <TextInput
              style={styles.modalInput}
              value={newClientName}
              onChangeText={setNewClientName}
              placeholder={t.business.clientsNamePlaceholder}
              placeholderTextColor={C.textSecondary}
              autoFocus
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAddClient(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>{t.business.clientsCancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddClient} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>{t.business.clientsAdd}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <ModalToastHost />
      </Modal>

      {/* Payment modal */}
      <Modal visible={showPayment} transparent statusBarTranslucent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t.business.clientsPaymentFrom.replace('{name}', selectedClient?.name ?? '')}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              placeholder={t.business.clientsAmountPlaceholder}
              placeholderTextColor={C.textSecondary}
              keyboardType="numeric"
              autoFocus
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setShowPayment(false);
                  setPaymentAmount('');
                }}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>{t.business.clientsCancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogPayment} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>{t.business.clientsDone}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <ModalToastHost />
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  summary: {
    ...TYPE.insight,
    color: C.textSecondary,
    padding: SPACING['2xl'],
    paddingBottom: SPACING.md,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  listContent: {
    padding: SPACING.lg,
    paddingTop: 0,
    gap: SPACING.md,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  clientCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textPrimary,
  },
  clientTotal: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
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
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  historySection: {
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyDate: {
    ...TYPE.muted,
    color: C.textSecondary,
  },
  historyAmount: {
    ...TYPE.muted,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  emptyText: {
    ...TYPE.muted,
    color: C.textSecondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    margin: SPACING.lg,
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 420,
    gap: SPACING.lg,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  modalInput: {
    ...TYPE.insight,
    color: C.textPrimary,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textSecondary,
  },
  modalConfirm: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: C.bronze,
    borderRadius: RADIUS.md,
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
});

export default ClientList;
