import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { startOfWeek, addDays, isSameDay } from 'date-fns';
import { Transaction } from '../../types';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { lightTap } from '../../services/haptics';

interface WeekBarProps {
  transactions: Transaction[];
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BAR_MAX_HEIGHT = 72;

function WeekBar({ transactions }: WeekBarProps) {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { days, maxTotal } = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const result: { date: Date; total: number; isToday: boolean }[] = [];

    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const isToday = isSameDay(day, now);

      const total = transactions
        .filter((t) => {
          if (t.type !== 'expense') return false;
          const d = t.date instanceof Date ? t.date : new Date(t.date);
          return isSameDay(d, day);
        })
        .reduce((sum, t) => sum + t.amount, 0);

      result.push({ date: day, total, isToday });
    }

    return { days: result, maxTotal: Math.max(...result.map((d) => d.total), 1) };
  }, [transactions]);

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {days.map((day, index) => {
          const height = (day.total / maxTotal) * BAR_MAX_HEIGHT;
          const isSelected = selectedDay === index;
          const isActive = day.isToday || isSelected;

          return (
            <TouchableOpacity
              key={index}
              style={styles.barCol}
              onPress={() => {
                lightTap();
                setSelectedDay(isSelected ? null : index);
              }}
              activeOpacity={0.7}
            >
              {isSelected && day.total > 0 && (
                <Text style={styles.amountLabel}>
                  {day.total.toFixed(0)}
                </Text>
              )}
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: Math.max(height, 4),
                      backgroundColor: isActive ? C.accent : withAlpha(C.textPrimary, 0.08),
                    },
                  ]}
                />
              </View>
              <Text style={[
                styles.dayLabel,
                isActive && styles.dayLabelActive,
              ]}>
                {DAY_LABELS[index]}
              </Text>
              {day.isToday && <View style={styles.todayDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    paddingVertical: SPACING.md,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.sm,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
  },
  barTrack: {
    width: 26,
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 13,
  },
  dayLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    marginTop: 6,
  },
  dayLabelActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.accent,
    marginTop: 3,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    marginBottom: 4,
    fontVariant: ['tabular-nums'] as any,
  },
});

export default React.memo(WeekBar);
