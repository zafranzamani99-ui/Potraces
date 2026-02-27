import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Transaction } from '../../types';
import { CALM, TYPE, SPACING, RADIUS } from '../../constants';

interface WeekBarProps {
  transactions: Transaction[];
}

interface WeekData {
  weekLabel: string;
  total: number;
}

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export default function WeekBar({ transactions }: WeekBarProps) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const weeks: WeekData[] = useMemo(() => {
    const now = new Date();
    const result: WeekData[] = [];

    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekNum = getISOWeek(weekStart);

      const weekTxns = transactions.filter((t) => {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        return getISOWeek(d) === weekNum && d.getFullYear() === weekStart.getFullYear();
      });

      const total = weekTxns
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      result.push({ weekLabel: `W${weekNum}`, total });
    }

    return result;
  }, [transactions]);

  const maxTotal = Math.max(...weeks.map((w) => w.total), 1);
  const BAR_MAX_HEIGHT = 80;

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {weeks.map((week, index) => {
          const height = (week.total / maxTotal) * BAR_MAX_HEIGHT;
          const isSelected = selectedWeek === index;

          return (
            <TouchableOpacity
              key={week.weekLabel}
              style={styles.barCol}
              onPress={() => setSelectedWeek(isSelected ? null : index)}
              activeOpacity={0.7}
            >
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: Math.max(height, 4),
                      backgroundColor: isSelected ? CALM.accent : CALM.border,
                    },
                  ]}
                />
              </View>
              <Text style={styles.weekLabel}>{week.weekLabel}</Text>
              {isSelected && (
                <Text style={styles.totalText}>RM {week.total.toFixed(0)}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.md,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
  },
  barTrack: {
    width: 24,
    height: 80,
    justifyContent: 'flex-end',
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: RADIUS.sm,
  },
  weekLabel: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },
  totalText: {
    ...TYPE.muted,
    color: CALM.accent,
    marginTop: 2,
    fontWeight: '500',
  },
});
