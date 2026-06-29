// TimeRangePills — a calm, horizontally-scrollable time-range selector shared
// by Reports and Pulse. Mirrors the existing pill styling (BudgetPlanning
// periodChip / TransactionsList filterPill) and follows the mandatory
// horizontal-scroll fade-edge rule (right-edge LinearGradient, never
// 'transparent' — use withAlpha(bg, 0) → bg to avoid a grey midpoint).
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { selectionChanged } from '../../services/haptics';
import type { RangeKey } from '../../utils/insights';

const DEFAULT_OPTIONS: RangeKey[] = ['this_month', 'last_month', '3m', '6m', 'year'];

interface TimeRangePillsProps {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
  labels: Record<RangeKey, string>;
  options?: RangeKey[];
  /** Background the right-edge fade blends into (defaults to screen bg). */
  edgeBg?: string;
  containerStyle?: ViewStyle;
}

const TimeRangePills: React.FC<TimeRangePillsProps> = ({
  value,
  onChange,
  labels,
  options = DEFAULT_OPTIONS,
  edgeBg,
  containerStyle,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const fadeBg = edgeBg ?? C.background;

  return (
    <View style={[styles.wrap, containerStyle]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {options.map((key) => {
          const active = key === value;
          return (
            <TouchableOpacity
              key={key}
              activeOpacity={0.8}
              onPress={() => {
                if (key !== value) {
                  selectionChanged();
                  onChange(key);
                }
              }}
              style={[styles.pill, active && styles.pillActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={labels[key]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {labels[key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <LinearGradient
        colors={[withAlpha(fadeBg, 0), fadeBg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fade}
        pointerEvents="none"
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    // Bleed to the right screen edge (parent screens pad by SPACING['2xl']).
    wrap: {
      position: 'relative',
      marginRight: -SPACING['2xl'],
    },
    content: {
      paddingRight: SPACING['2xl'],
      gap: SPACING.sm,
    },
    pill: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
    },
    pillActive: {
      borderColor: C.accent,
      backgroundColor: withAlpha(C.accent, 0.12),
    },
    pillText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
    },
    pillTextActive: {
      color: C.accent,
    },
    fade: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 40,
    },
  });

export default TimeRangePills;
