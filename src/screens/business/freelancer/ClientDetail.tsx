import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { useFreelancerStore } from '../../../store/freelancerStore';
import { useBusinessStore } from '../../../store/businessStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { RootStackParamList } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { lightTap } from '../../../services/haptics';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const ClientDetail: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const route = useRoute<RouteProp<RootStackParamList, 'FreelancerClientDetail'>>();
  const navigation = useNavigation();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const {
    clients,
    updateClient,
    deleteClient,
    getClientPayments,
    getClientAverageGap,
    getClientLastPayment,
  } = useFreelancerStore();
  const businessTransactions = useBusinessStore((s) => s.businessTransactions);

  const client = clients.find((c) => c.id === route.params.clientId);

  const [editingName, setEditingName] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [nameValue, setNameValue] = useState(client?.name || '');
  const [contactValue, setContactValue] = useState(client?.contact || '');
  const [notesValue, setNotesValue] = useState(client?.notes || '');

  const payments = useMemo(
    () => (client ? getClientPayments(client.id) : []),
    [client, businessTransactions]
  );

  const totalEarned = payments.reduce((s, t) => s + t.amount, 0);
  const avgGap = client ? getClientAverageGap(client.id) : null;
  const lastPayment = client ? getClientLastPayment(client.id) : null;

  // Active vs quiet
  const isActive = useMemo(() => {
    if (!lastPayment) return false;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return toDate(lastPayment.date).getTime() >= ninetyDaysAgo.getTime();
  }, [lastPayment]);

  if (!client) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>client not found</Text>
      </View>
    );
  }

  const saveName = () => {
    if (nameValue.trim()) {
      updateClient(client.id, { name: nameValue.trim() });
    }
    setEditingName(false);
  };

  const saveContact = () => {
    updateClient(client.id, { contact: contactValue.trim() || undefined });
    setEditingContact(false);
  };

  const saveNotes = () => {
    updateClient(client.id, { notes: notesValue.trim() || undefined });
    setEditingNotes(false);
  };

  const handleDelete = () => {
    Alert.alert(
      'delete client',
      'payments from this client will become uncategorized. delete?',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'delete',
          style: 'destructive',
          onPress: () => {
            deleteClient(client.id);
            showToast('Client removed.', 'success');
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Client Name */}
        {editingName ? (
          <TextInput
            style={styles.nameInput}
            value={nameValue}
            onChangeText={setNameValue}
            autoFocus
            onBlur={saveName}
            onSubmitEditing={saveName}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingName(true)}>
            <Text style={styles.clientName}>{client.name}</Text>
          </TouchableOpacity>
        )}

        {/* Contact */}
        {editingContact ? (
          <TextInput
            style={styles.secondaryInput}
            value={contactValue}
            onChangeText={setContactValue}
            autoFocus
            placeholder="contact"
            placeholderTextColor={C.textMuted}
            onBlur={saveContact}
            onSubmitEditing={saveContact}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingContact(true)}>
            <Text style={styles.contactText}>
              {client.contact || 'tap to add contact'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Notes */}
        {editingNotes ? (
          <TextInput
            style={styles.secondaryInput}
            value={notesValue}
            onChangeText={setNotesValue}
            autoFocus
            placeholder="notes"
            placeholderTextColor={C.textMuted}
            onBlur={saveNotes}
            onSubmitEditing={saveNotes}
            returnKeyType="done"
            multiline
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingNotes(true)}>
            <Text style={styles.notesText}>
              {client.notes || 'tap to add notes'}
            </Text>
          </TouchableOpacity>
        )}

        {client.isAutoDetected && (
          <Text style={styles.autoDetectedLabel}>added from a payment</Text>
        )}

        {/* Hero — Total Earned */}
        <Text style={styles.totalEarned}>
          {currency} {totalEarned.toLocaleString()}
        </Text>
        <Text style={styles.totalLabel}>total earned</Text>

        {/* Stats line */}
        {avgGap !== null && (
          <Text style={styles.statsLine}>
            payments come about every {avgGap} days
          </Text>
        )}
        <Text style={styles.statusText}>
          {isActive ? 'active' : 'quiet'}
        </Text>

        {/* Payment History */}
        {payments.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyLabel}>payments</Text>
            {payments.map((payment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <Text style={styles.paymentAmount}>
                  {currency} {payment.amount.toLocaleString()}
                </Text>
                <Text style={styles.paymentDate}>
                  {format(toDate(payment.date), 'MMM dd, yyyy')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {payments.length === 0 && (
          <Text style={styles.noPaymentsText}>no payments yet</Text>
        )}

        {/* Delete */}
        <TouchableOpacity
          onPress={() => {
            lightTap();
            handleDelete();
          }}
          style={styles.deleteButton}
        >
          <Text style={styles.deleteText}>delete client</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['5xl'],
  },

  // Name
  clientName: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  nameInput: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: C.bronze,
    paddingVertical: SPACING.xs,
  },

  // Contact & Notes
  contactText: {
    ...TYPE.muted,
    marginBottom: SPACING.xs,
  },
  notesText: {
    ...TYPE.muted,
    marginBottom: SPACING.sm,
  },
  secondaryInput: {
    ...TYPE.insight,
    color: C.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: C.bronze,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  autoDetectedLabel: {
    ...TYPE.muted,
    fontSize: 10,
    marginBottom: SPACING.lg,
  },

  // Hero total
  totalEarned: {
    ...TYPE.balance,
    color: C.textPrimary,
    marginTop: SPACING.xl,
  },
  totalLabel: {
    ...TYPE.muted,
    marginBottom: SPACING.lg,
  },

  // Stats
  statsLine: {
    ...TYPE.insight,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
  },
  statusText: {
    ...TYPE.muted,
    marginBottom: SPACING.xl,
  },

  // Payment history
  historySection: {
    marginTop: SPACING.md,
  },
  historyLabel: {
    ...TYPE.muted,
    marginBottom: SPACING.md,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  paymentAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  paymentDate: {
    ...TYPE.muted,
  },
  noPaymentsText: {
    ...TYPE.muted,
    marginTop: SPACING.xl,
    textAlign: 'center',
  },

  // Delete
  deleteButton: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    marginTop: SPACING['2xl'],
  },
  deleteText: {
    ...TYPE.muted,
    color: C.textMuted,
  },

  emptyText: {
    ...TYPE.insight,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: SPACING['4xl'],
  },
});

export default ClientDetail;
