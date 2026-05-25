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
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm, useIsDark } from '../../../hooks/useCalm';
import { RootStackParamList } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { lightTap } from '../../../services/haptics';
import { useT } from '../../../i18n';
import BusinessHeroNumber from '../../../components/business/BusinessHeroNumber';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const ClientDetail: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
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

  const totalEarned = payments.reduce((s, p) => s + p.amount, 0);
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
        <Text style={styles.emptyText}>{t.freelancer.clientNotFound}</Text>
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
      t.freelancer.deleteConfirmTitle,
      t.freelancer.deleteConfirmMsg,
      [
        { text: t.freelancer.cancel, style: 'cancel' },
        {
          text: t.freelancer.delete,
          style: 'destructive',
          onPress: () => {
            deleteClient(client.id);
            showToast(t.freelancer.clientRemoved, 'success');
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
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
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
            placeholder={t.freelancer.contactLabel}
            placeholderTextColor={C.textMuted}
            onBlur={saveContact}
            onSubmitEditing={saveContact}
            returnKeyType="done"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingContact(true)}>
            <Text style={styles.contactText}>
              {client.contact || t.freelancer.tapToAddContact}
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
            placeholder={t.freelancer.notesLabel}
            placeholderTextColor={C.textMuted}
            onBlur={saveNotes}
            onSubmitEditing={saveNotes}
            returnKeyType="done"
            multiline
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingNotes(true)}>
            <Text style={styles.notesText}>
              {client.notes || t.freelancer.tapToAddNotes}
            </Text>
          </TouchableOpacity>
        )}

        {client.isAutoDetected && (
          <Text style={styles.autoDetectedLabel}>{t.freelancer.addedFromPayment}</Text>
        )}

        {/* Hero — Total Earned (canonical hero) */}
        <View style={styles.heroSection}>
          <BusinessHeroNumber
            amount={totalEarned}
            label={t.freelancer.totalEarned}
            prefix={currency}
          />
        </View>

        {/* Stats line */}
        {avgGap !== null && (
          <Text style={styles.statsLine}>
            {t.freelancer.paymentsEvery.replace('{n}', String(avgGap))}
          </Text>
        )}
        <Text style={styles.statusText}>
          {isActive ? t.freelancer.active : t.freelancer.quiet}
        </Text>

        {/* Payment History */}
        {payments.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyLabel}>{t.freelancer.paymentsHeading}</Text>
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
          <Text style={styles.noPaymentsText}>{t.freelancer.noPaymentsYet}</Text>
        )}

        {/* Delete */}
        <TouchableOpacity
          onPress={() => {
            lightTap();
            handleDelete();
          }}
          style={styles.deleteButton}
        >
          <Text style={styles.deleteText}>{t.freelancer.deleteClient}</Text>
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
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
  heroSection: {
    marginTop: SPACING.xl,
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
