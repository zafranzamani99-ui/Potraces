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
import { useSettingsStore } from '../../store/settingsStore';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { useCategories } from '../../hooks/useCategories';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from './neu';

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
  const C = useCalm();
  const neuF = useNeu(undefined, { faintDark: true }); // soft raise — Onyx pill standard
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
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
    if (percent >= 90) return C.bronze;
    if (percent >= 70) return C.accent;
    return C.positive;
  };

  // Minimal: one line per category (name · what's left) + a thin bar.
  // The bar's color carries the status — no status words, no "x of y" line.
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      style={[styles.container, neuF.raisedSoft]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>breathing room</Text>
        {onPress && (
          <Feather name="chevron-right" size={16} color={C.textSecondary} />
        )}
      </View>

      {entries.slice(0, 4).map((entry, idx) => (
        <View key={`${entry.category}-${idx}`} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.categoryName} numberOfLines={1}>{entry.categoryName}</Text>
            <Text style={[styles.remainingText, { color: barColor(entry.percent) }]}>
              {entry.remaining >= 0
                ? `${currency} ${entry.remaining.toFixed(0)} left`
                : `${currency} ${Math.abs(entry.remaining).toFixed(0)} over`}
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
        </View>
      ))}
    </TouchableOpacity>
  );
};

export default React.memo(BreathingRoom);

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  // Onyx neu card: base matches the screen bg so the soft raise blends; the
  // separation comes from the neu shadow (spread at the call site), no border.
  container: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Micro-label header — same modern type language as the insight-strip cards.
  title: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  row: {
    gap: 6,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  categoryName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  remainingText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'] as any,
  },
  // Flat thin track (indicators stay flat per Onyx); faint textPrimary fill so
  // it survives on the near-black card.
  bar: {
    height: 4,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
});
