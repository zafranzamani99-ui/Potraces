import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { Season } from '../../types';

const PastSeasons: React.FC = () => {
  const { seasons, orders, ingredientCosts, addSeason } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  const activeSeason = seasons.find((s) => s.isActive);
  const pastSeasons = seasons.filter((s) => !s.isActive);

  const handleStartSeason = () => {
    if (!newName.trim()) return;

    if (activeSeason) {
      Alert.alert(
        'Season already active',
        `"${activeSeason.name}" is still active. End it first before starting a new one.`
      );
      return;
    }

    addSeason({
      name: newName.trim(),
      startDate: new Date(),
      isActive: true,
    });
    setNewName('');
    setShowAdd(false);
  };

  const getStats = (seasonId: string) => {
    const seasonOrders = orders.filter((o) => o.seasonId === seasonId);
    const seasonCosts = ingredientCosts.filter((c) => c.seasonId === seasonId);
    const totalIncome = seasonOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
    const totalCosts = seasonCosts.reduce((s, c) => s + c.amount, 0);
    return {
      orderCount: seasonOrders.length,
      kept: totalIncome - totalCosts,
    };
  };

  const renderSeason = useCallback(
    ({ item }: { item: Season }) => {
      const stats = getStats(item.id);
      return (
        <TouchableOpacity
          style={styles.seasonCard}
          onPress={() => navigation.getParent()?.navigate('SeasonSummary', { seasonId: item.id })}
        >
          <View style={styles.seasonHeader}>
            <Text style={styles.seasonName}>{item.name}</Text>
            {item.isActive && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>active</Text>
              </View>
            )}
          </View>
          <Text style={styles.seasonDates}>
            {format(item.startDate instanceof Date ? item.startDate : new Date(item.startDate), 'dd MMM yyyy')}
            {item.endDate
              ? ` \u2013 ${format(item.endDate instanceof Date ? item.endDate : new Date(item.endDate), 'dd MMM yyyy')}`
              : ' \u2013 now'}
          </Text>
          <View style={styles.seasonStats}>
            <Text style={styles.seasonStat}>{stats.orderCount} orders</Text>
            <Text style={styles.seasonStat}>
              kept {currency} {stats.kept.toFixed(0)}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [orders, ingredientCosts, currency, navigation]
  );

  // Show active season first, then past seasons
  const allSeasons = activeSeason
    ? [activeSeason, ...pastSeasons]
    : pastSeasons;

  return (
    <View style={styles.container}>
      <FlatList
        data={allSeasons}
        renderItem={renderSeason}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="calendar" size={32} color={CALM.border} />
            <Text style={styles.emptyTitle}>no seasons yet</Text>
            <Text style={styles.emptyText}>
              a season is like Raya, CNY, or any event where you take orders. start one when you're ready.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={styles.addButtonText}>start new season</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>new season</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Raya 2025, CNY 2025"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleStartSeason} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>start</Text>
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
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  seasonCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  seasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seasonName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  activeBadge: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.full,
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
    textTransform: 'uppercase',
  },
  seasonDates: {
    ...TYPE.muted,
  },
  seasonStats: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.xs,
  },
  seasonStat: {
    ...TYPE.insight,
    color: CALM.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    padding: SPACING['3xl'],
    gap: SPACING.md,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  emptyText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    margin: SPACING.lg,
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Modal
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
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.md,
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});

export default PastSeasons;
