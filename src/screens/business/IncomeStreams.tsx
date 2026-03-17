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
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { IncomeStream } from '../../types';

const PRESET_COLORS = ['#4F5104', '#B2780A', '#DEAB22', '#6BA3BE', '#C4956A', '#B8AFBC'];

const IncomeStreamsScreen: React.FC = () => {
  const { incomeStreams, businessTransactions, addIncomeStream } = useBusinessStore();
  const currency = useSettingsStore((s) => s.currency);

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const currentIncome = useMemo(
    () =>
      businessTransactions.filter(
        (t) =>
          t.type === 'income' &&
          isWithinInterval(t.date instanceof Date ? t.date : new Date(t.date), {
            start: monthStart,
            end: monthEnd,
          })
      ),
    [businessTransactions]
  );

  const totalThisMonth = currentIncome.reduce((s, t) => s + t.amount, 0);

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    addIncomeStream({
      label: newLabel.trim(),
      type: 'mixed',
      color: newColor,
    });
    setNewLabel('');
    setNewColor(PRESET_COLORS[0]);
    setShowAdd(false);
  };

  const renderStream = ({ item }: { item: IncomeStream }) => {
    const streamTotal = currentIncome
      .filter((t) => t.streamId === item.id)
      .reduce((s, t) => s + t.amount, 0);

    return (
      <View style={styles.streamCard}>
        <View style={styles.streamRow}>
          {item.color && <View style={[styles.dot, { backgroundColor: item.color }]} />}
          <Text style={styles.streamLabel}>{item.label}</Text>
          <Text style={styles.streamAmount}>{currency} {streamTotal.toFixed(2)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>
        {currency} {totalThisMonth.toFixed(2)} this month from {incomeStreams.length} source
        {incomeStreams.length !== 1 ? 's' : ''}.
      </Text>

      <FlatList
        data={incomeStreams}
        renderItem={renderStream}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No income streams yet. Add your first one.</Text>
          </View>
        }
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
      />

      <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={styles.addButtonText}>add stream</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} transparent statusBarTranslucent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>new income stream</Text>
            <TextInput
              style={styles.modalInput}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g. freelance design, tutoring"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
            />
            <View style={styles.colorPicker}>
              {PRESET_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    newColor === color && styles.colorDotSelected,
                  ]}
                  onPress={() => setNewColor(color)}
                />
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>add</Text>
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
  streamCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
  },
  streamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  streamLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  streamAmount: {
    ...TYPE.insight,
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
  colorPicker: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: CALM.textPrimary,
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

export default IncomeStreamsScreen;
