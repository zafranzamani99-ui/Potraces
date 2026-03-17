import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { RiderCost } from '../../types';

const COST_TYPES: { type: RiderCost['type']; label: string }[] = [
  { type: 'petrol', label: 'Petrol' },
  { type: 'maintenance', label: 'Maintenance' },
  { type: 'data', label: 'Data' },
  { type: 'other', label: 'Other' },
];

const RiderCostsScreen: React.FC = () => {
  const { businessTransactions, riderCosts, addRiderCost } = useBusinessStore();
  const currency = useSettingsStore((s) => s.currency);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState<RiderCost['type']>('petrol');
  const [costAmount, setCostAmount] = useState('');

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const inMonth = (d: Date) =>
    isWithinInterval(d instanceof Date ? d : new Date(d), { start: monthStart, end: monthEnd });

  const grossIncome = useMemo(
    () =>
      businessTransactions
        .filter((t) => t.type === 'income' && inMonth(t.date))
        .reduce((s, t) => s + t.amount, 0),
    [businessTransactions]
  );

  const monthCosts = useMemo(
    () => riderCosts.filter((r) => inMonth(r.date)),
    [riderCosts]
  );

  const totalCosts = monthCosts.reduce((s, r) => s + r.amount, 0);
  const kept = grossIncome - totalCosts;

  const handleAdd = () => {
    const amount = parseFloat(costAmount);
    if (!amount || amount <= 0) return;
    addRiderCost({
      date: new Date(),
      type: selectedType,
      amount,
    });
    setCostAmount('');
    setShowAdd(false);
  };

  const renderCost = ({ item }: { item: RiderCost }) => (
    <View style={styles.costRow}>
      <View>
        <Text style={styles.costType}>{item.type}</Text>
        <Text style={styles.costDate}>
          {format(item.date instanceof Date ? item.date : new Date(item.date), 'MMM dd')}
        </Text>
      </View>
      <Text style={styles.costAmount}>{currency} {item.amount.toFixed(2)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Three numbers */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>grossed</Text>
          <Text style={styles.statValue}>{currency} {grossIncome.toFixed(2)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>costs</Text>
          <Text style={styles.statValue}>{currency} {totalCosts.toFixed(2)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>kept</Text>
          <Text style={styles.keptValue}>{currency} {kept.toFixed(2)}</Text>
        </View>
      </View>

      {/* Cost list */}
      <FlatList
        data={monthCosts}
        renderItem={renderCost}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No costs logged this month.</Text>
          </View>
        }
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
      />

      {/* Add cost area */}
      {showAdd ? (
        <View style={styles.addArea}>
          <View style={styles.typeChips}>
            {COST_TYPES.map((ct) => (
              <TouchableOpacity
                key={ct.type}
                style={[styles.typeChip, selectedType === ct.type && styles.typeChipSelected]}
                onPress={() => setSelectedType(ct.type)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    selectedType === ct.type && styles.typeChipTextSelected,
                  ]}
                >
                  {ct.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={costAmount}
              onChangeText={setCostAmount}
              keyboardType="numeric"
              placeholder="amount"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
            />
            <TouchableOpacity onPress={handleAdd} style={styles.doneButton}>
              <Text style={styles.doneText}>done</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAdd(true)}>
          <Feather name="plus" size={20} color="#fff" />
          <Text style={styles.addButtonText}>add cost</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  statsRow: {
    flexDirection: 'row',
    padding: SPACING['2xl'],
    gap: SPACING.lg,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  statValue: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  keptValue: {
    fontSize: 20,
    fontWeight: TYPOGRAPHY.weight.light,
    color: CALM.textPrimary,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  costType: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  costDate: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  costAmount: {
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
  addArea: {
    padding: SPACING.lg,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    backgroundColor: CALM.surface,
  },
  typeChips: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  typeChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  typeChipSelected: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  typeChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  typeChipTextSelected: {
    color: '#fff',
  },
  addRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  addInput: {
    flex: 1,
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  doneButton: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  doneText: {
    color: '#fff',
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
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
});

export default RiderCostsScreen;
