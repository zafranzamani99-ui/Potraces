import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { useFreelancerStore } from '../../../store/freelancerStore';
import { useBusinessStore } from '../../../store/businessStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm, useIsDark } from '../../../hooks/useCalm';
import { lightTap } from '../../../services/haptics';
import { useToast } from '../../../context/ToastContext';
import { useT } from '../../../i18n';
import ModalToastHost from '../../../components/common/ModalToastHost';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

type SortMode = 'recent' | 'total';

const FreelancerClientList: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const {
    clients,
    addClient,
    getClientPayments,
    getClientAverageGap,
    getClientLastPayment,
  } = useFreelancerStore();
  const businessTransactions = useBusinessStore((s) => s.businessTransactions);

  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Build sorted client list with computed data
  const sortedClients = useMemo(() => {
    const enriched = clients.map((client) => {
      const payments = getClientPayments(client.id);
      const totalEarned = payments.reduce((s, t) => s + t.amount, 0);
      const lastPayment = getClientLastPayment(client.id);
      const avgGap = getClientAverageGap(client.id);
      return { client, totalEarned, lastPayment, avgGap };
    });

    if (sortMode === 'total') {
      enriched.sort((a, b) => b.totalEarned - a.totalEarned);
    } else {
      enriched.sort((a, b) => {
        const aTime = a.lastPayment ? toDate(a.lastPayment.date).getTime() : 0;
        const bTime = b.lastPayment ? toDate(b.lastPayment.date).getTime() : 0;
        return bTime - aTime;
      });
    }

    return enriched;
  }, [clients, businessTransactions, sortMode]);

  const handleAddClient = () => {
    if (!newName.trim()) return;
    lightTap();
    addClient({
      name: newName.trim(),
      contact: newContact.trim() || undefined,
      notes: newNotes.trim() || undefined,
      isAutoDetected: false,
    });
    setNewName('');
    setNewContact('');
    setNewNotes('');
    setShowAddModal(false);
    showToast(t.freelancer.clientAdded, 'success');
  };

  const toggleSort = () => {
    lightTap();
    setSortMode((prev) => (prev === 'recent' ? 'total' : 'recent'));
  };

  const renderClient = useCallback(({
    item,
  }: {
    item: (typeof sortedClients)[0];
  }) => (
    <TouchableOpacity
      style={styles.clientRow}
      onPress={() =>
        navigation.getParent()?.navigate('FreelancerClientDetail', {
          clientId: item.client.id,
        })
      }
      activeOpacity={0.7}
    >
      <View style={styles.clientInfo}>
        <Text style={styles.clientName}>{item.client.name}</Text>
        <Text style={styles.clientEarned}>
          {currency} {item.totalEarned.toLocaleString()}
        </Text>
        {item.avgGap !== null && (
          <Text style={styles.clientGap}>
            {t.freelancer.paysAboutEvery.replace('{n}', String(item.avgGap))}
          </Text>
        )}
      </View>
      <View style={styles.clientRight}>
        {item.lastPayment && (
          <Text style={styles.clientLastPaid}>
            {formatDistanceToNow(toDate(item.lastPayment.date), {
              addSuffix: true,
            })}
          </Text>
        )}
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      </View>
    </TouchableOpacity>
  ), [currency, navigation, t]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.freelancer.clientsTitle}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={toggleSort} style={styles.sortButton}>
            <Text style={styles.sortText}>
              {sortMode === 'recent' ? t.freelancer.sortRecent : t.freelancer.sortTotalEarned}
            </Text>
            <Feather name="chevron-down" size={14} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              lightTap();
              setShowAddModal(true);
            }}
            style={styles.addButton}
          >
            <Feather name="plus" size={20} color={C.bronze} />
          </TouchableOpacity>
        </View>
      </View>

      {clients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {t.freelancer.emptyClients}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedClients}
          keyExtractor={(item) => item.client.id}
          renderItem={renderClient}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={8}
          initialNumToRender={10}
        />
      )}

      {/* Add Client Modal */}
      <Modal
        visible={showAddModal}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowAddModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            Keyboard.dismiss();
            setShowAddModal(false);
          }}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={Keyboard.dismiss}
          >
            <Text style={styles.modalTitle}>{t.freelancer.addClientTitle}</Text>

            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder={t.freelancer.namePlaceholder}
              placeholderTextColor={C.textMuted}
              autoFocus
              returnKeyType="next"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
            <TextInput
              style={styles.modalInput}
              value={newContact}
              onChangeText={setNewContact}
              placeholder={t.freelancer.contactPlaceholder}
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
            <TextInput
              style={styles.modalInput}
              value={newNotes}
              onChangeText={setNewNotes}
              placeholder={t.freelancer.notesPlaceholder}
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleAddClient}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />

            <TouchableOpacity
              style={[
                styles.saveButton,
                !newName.trim() && styles.saveButtonDisabled,
              ]}
              onPress={handleAddClient}
              disabled={!newName.trim()}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.saveButtonText,
                  !newName.trim() && styles.saveButtonTextDisabled,
                ]}
              >
                {t.freelancer.save}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  sortText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING['3xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  clientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  clientEarned: {
    ...TYPE.muted,
    marginTop: 2,
  },
  clientGap: {
    ...TYPE.muted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  clientRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  clientLastPaid: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['3xl'],
  },
  emptyText: {
    ...TYPE.insight,
    color: C.textSecondary,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING['2xl'],
    width: '100%',
    maxWidth: 420,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING.xl,
  },
  modalInput: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    marginBottom: SPACING.md,
    minHeight: 44,
  },
  saveButton: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: C.border,
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  saveButtonTextDisabled: {
    color: C.textMuted,
  },
});

export default FreelancerClientList;
