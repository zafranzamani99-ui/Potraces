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
import { withAlpha, CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, BIZ } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { IncomeStream } from '../../types';
import ModalToastHost from '../../components/common/ModalToastHost';

const PRESET_COLORS = [CALM.accent, CALM.bronze, CALM.gold, BIZ.success, BIZ.unpaid, CALM.neutral];

const IncomeStreamsScreen: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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
        {t.business.streamsSummary
          .replace('{currency}', currency)
          .replace('{total}', totalThisMonth.toFixed(2))
          .replace('{n}', String(incomeStreams.length))
          .replace('{plural}', incomeStreams.length !== 1 ? 's' : '')}
      </Text>

      <FlatList
        data={incomeStreams}
        renderItem={renderStream}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t.business.streamsEmpty}</Text>
          </View>
        }
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
      />

      <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
        <Feather name="plus" size={20} color={C.onAccent} />
        <Text style={styles.addButtonText}>{t.business.streamsAddStream}</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} transparent statusBarTranslucent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t.business.streamsNewStream}</Text>
            <TextInput
              style={styles.modalInput}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder={t.business.streamsLabelPlaceholder}
              placeholderTextColor={C.textSecondary}
              autoFocus
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
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
                <Text style={styles.modalCancelText}>{t.business.streamsCancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>{t.business.streamsAdd}</Text>
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
  streamCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textPrimary,
  },
  streamAmount: {
    ...TYPE.insight,
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
    borderColor: C.textPrimary,
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

export default IncomeStreamsScreen;
