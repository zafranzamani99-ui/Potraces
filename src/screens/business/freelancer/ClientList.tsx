import React, { useMemo, useState } from 'react';
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
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { lightTap } from '../../../services/haptics';
import { useToast } from '../../../context/ToastContext';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

type SortMode = 'recent' | 'total';

const FreelancerClientList: React.FC = () => {
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
    showToast('Client added.', 'success');
  };

  const toggleSort = () => {
    lightTap();
    setSortMode((prev) => (prev === 'recent' ? 'total' : 'recent'));
  };

  const renderClient = ({
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
            pays about every {item.avgGap} days
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
        <Feather name="chevron-right" size={16} color={CALM.textMuted} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>clients</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={toggleSort} style={styles.sortButton}>
            <Text style={styles.sortText}>
              {sortMode === 'recent' ? 'recent' : 'total earned'}
            </Text>
            <Feather name="chevron-down" size={14} color={CALM.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              lightTap();
              setShowAddModal(true);
            }}
            style={styles.addButton}
          >
            <Feather name="plus" size={20} color={CALM.bronze} />
          </TouchableOpacity>
        </View>
      </View>

      {clients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            no clients yet — they'll show up when you log your first payment
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedClients}
          keyExtractor={(item) => item.client.id}
          renderItem={renderClient}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add Client Modal */}
      <Modal
        visible={showAddModal}
        animationType="fade"
        transparent
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
            <Text style={styles.modalTitle}>add client</Text>

            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="name"
              placeholderTextColor={CALM.textMuted}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              style={styles.modalInput}
              value={newContact}
              onChangeText={setNewContact}
              placeholder="contact (optional)"
              placeholderTextColor={CALM.textMuted}
              returnKeyType="next"
            />
            <TextInput
              style={styles.modalInput}
              value={newNotes}
              onChangeText={setNewNotes}
              placeholder="notes (optional)"
              placeholderTextColor={CALM.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleAddClient}
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
                save
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
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
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
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
  },
  clientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['3xl'],
  },
  emptyText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    padding: SPACING['2xl'],
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING['2xl'],
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.light,
    color: CALM.textPrimary,
    marginBottom: SPACING.xl,
  },
  modalInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    marginBottom: SPACING.md,
    minHeight: 44,
  },
  saveButton: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: CALM.border,
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
  saveButtonTextDisabled: {
    color: CALM.textMuted,
  },
});

export default FreelancerClientList;
