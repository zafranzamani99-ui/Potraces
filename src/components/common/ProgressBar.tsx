import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { CALM, RADIUS, TYPOGRAPHY, SPACING } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  showPercentage?: boolean;
  showTicks?: boolean;
  color?: string;
  height?: number;
  animated?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  label,
  showPercentage = true,
  showTicks = false,
  color: colorProp,
  height = 8,
  animated = true,
}) => {
  const C = useCalm();
  const color = colorProp ?? C.accent;
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore(state => state.currency);
  const percentage = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const isOverBudget = current > total;
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.timing(animValue, {
        toValue: percentage,
        duration: 500,
        useNativeDriver: false,
      }).start();
    } else {
      animValue.setValue(percentage);
    }
  }, [percentage, animated]);

  // Render tick marks
  const renderTicks = () => {
    if (!showTicks) return null;

    const tickPositions = [25, 50, 75, 100];
    return (
      <View style={styles.ticksContainer}>
        {tickPositions.map((position) => (
          <View
            key={position}
            style={[
              styles.tick,
              {
                left: `${position}%`,
                opacity: percentage >= position ? 0.3 : 0.5,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(percentage),
        text: `${Math.round(percentage)}% used`,
      }}
      accessibilityLabel={label ? `${label} progress` : 'Progress'}
    >
      {label && (
        <View style={styles.labelContainer}>
          <Text style={styles.label}>{label}</Text>
          {showPercentage && (
            <Text style={[styles.percentage, isOverBudget && styles.overBudget]}>
              {percentage.toFixed(0)}%
            </Text>
          )}
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: RADIUS.sm }]}>
        {renderTicks()}
        <Animated.View
          style={[
            styles.fill,
            {
              width: animated
                ? animValue.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  })
                : `${Math.min(percentage, 100)}%`,
              height,
              borderRadius: RADIUS.sm,
            },
          ]}
        >
          <View
            style={[styles.solidFill, { borderRadius: RADIUS.sm, backgroundColor: color }]}
          />
        </Animated.View>
      </View>
      <View style={styles.amountContainer}>
        <Text style={styles.amount}>
          {currency} {current.toFixed(2)}
        </Text>
        <Text style={styles.total}>
          of {currency} {total.toFixed(2)}
        </Text>
      </View>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    width: '100%',
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm, // 8
  },
  label: {
    fontSize: TYPOGRAPHY.size.sm, // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // '600'
    color: C.textPrimary,
  },
  percentage: {
    fontSize: TYPOGRAPHY.size.sm, // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // '600'
    color: C.textSecondary,
  },
  overBudget: {
    color: C.neutral,
  },
  track: {
    width: '100%',
    backgroundColor: C.background,
    overflow: 'hidden',
    position: 'relative',
  },
  ticksContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tick: {
    position: 'absolute',
    width: 2,
    height: '100%',
    backgroundColor: C.border,
    transform: [{ translateX: -1 }],
  },
  fill: {
    overflow: 'hidden',
    position: 'relative',
  },
  solidFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  amountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs, // 4
  },
  amount: {
    fontSize: TYPOGRAPHY.size.xs, // 11
    fontWeight: TYPOGRAPHY.weight.semibold, // '600'
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  total: {
    fontSize: TYPOGRAPHY.size.xs, // 11
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

export default React.memo(ProgressBar);
