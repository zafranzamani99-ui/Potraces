/**
 * Breathing Room — a gentle budget indicator.
 * Shows how much room is left per category, using calming language.
 * "Breathing room" instead of "budget remaining".
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { useCategories } from '../../hooks/useCategories';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';

interface BreathingRoomProps {
  onPress?: () => void;
}

interface RoomEntry {
  category: string;
  categoryName: string;
  limit: number;
  spent: number;
  remaining: number;
  percent: number; // 0-100, how much used
}

const BreathingRoom: React.FC<BreathingRoomProps> = ({ onPress }) => {
  const transactions = usePersonalStore((s) => s.transactions);
  const budgets = usePersonalStore((s) => s.budgets);
  const breathingRooms = useAIInsightsStore((s) => s.breathingRooms);
  const expenseCategories = useCategories('expense', 'personal');

  const entries = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const monthExpenses = transactions.filter(
      (t) =>
        t.type === 'expense' &&
        isWithinInterval(t.date, { start: monthStart, end: monthEnd })
    );

    // Build entries from breathingRooms first, then fallback to budgets
    const seen = new Set<string>();
    const result: RoomEntry[] = [];

    // From breathing rooms (user-set via Fresh Start)
    for (const br of breathingRooms) {
      seen.add(br.category);
      const spent = monthExpenses
        .filter((t) => t.category === br.category)
        .reduce((s, t) => s + t.amount, 0);
      const catDef = expenseCategories.find((c) => c.id === br.category);
      result.push({
        category: br.category,
        categoryName: catDef?.name || br.category,
        limit: br.limit,
        spent,
        remaining: br.limit - spent,
        percent: br.limit > 0 ? Math.min(100, (spent / br.limit) * 100) : 0,
      });
    }

    // From budgets (if not already covered)
    for (const b of budgets) {
      if (seen.has(b.category)) continue;
      if (b.period !== 'monthly') continue; // only monthly budgets
      const spent = monthExpenses
        .filter((t) => t.category === b.category)
        .reduce((s, t) => s + t.amount, 0);
      const catDef = expenseCategories.find((c) => c.id === b.category);
      result.push({
        category: b.category,
        categoryName: catDef?.name || b.category,
        limit: b.allocatedAmount,
        spent,
        remaining: b.allocatedAmount - spent,
        percent: b.allocatedAmount > 0 ? Math.min(100, (spent / b.allocatedAmount) * 100) : 0,
      });
    }

    return result.sort((a, b) => b.percent - a.percent); // tightest first
  }, [transactions, budgets, breathingRooms, expenseCategories]);

  if (entries.length === 0) return null;

  const barColor = (percent: number) => {
    if (percent >= 90) return CALM.bronze;
    if (percent >= 70) return CALM.accent;
    return CALM.positive;
  };

  const statusText = (entry: RoomEntry) => {
    if (entry.remaining <= 0) return 'tight';
    if (entry.percent >= 80) return 'getting close';
    return 'comfortable';
  };

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>breathing room</Text>
        {onPress && (
          <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
        )}
      </View>

      {entries.slice(0, 4).map((entry, idx) => (
        <View key={`${entry.category}-${idx}`} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.categoryName}>{entry.categoryName}</Text>
            <Text style={[styles.statusLabel, { color: barColor(entry.percent) }]}>
              {statusText(entry)}
            </Text>
          </View>
          <View style={styles.bar}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${entry.percent}%`,
                  backgroundColor: barColor(entry.percent),
                },
              ]}
            />
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.spentText}>
              RM {entry.spent.toFixed(0)} of {entry.limit.toFixed(0)}
            </Text>
            <Text style={[styles.remainingText, entry.remaining <= 0 && styles.tightText]}>
              {entry.remaining > 0
                ? `RM ${entry.remaining.toFixed(0)} left`
                : 'over'}
            </Text>
          </View>
        </View>
      ))}
    </TouchableOpacity>
  );
};

export default React.memo(BreathingRoom);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  row: {
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  bar: {
    height: 4,
    backgroundColor: withAlpha(CALM.textMuted, 0.1),
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spentText: {
    fontSize: 10,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  remainingText: {
    fontSize: 10,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  tightText: {
    color: CALM.bronze,
  },
});
