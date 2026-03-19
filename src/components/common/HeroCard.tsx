import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { lightTap } from '../../services/haptics';
import SkeletonLoader from './SkeletonLoader';

// ─── TYPES ──────────────────────────────────────────────────
interface BreakdownItem {
  label: string;
  value: number;
  icon: keyof typeof Feather.glyphMap;
}

interface HeroCardProps {
  title: string;
  amount: number;
  currency: string;
  subtitle?: string;
  breakdown?: BreakdownItem[];
  loading?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  gradient?: any; // kept for API compat, ignored
}

const HeroCard: React.FC<HeroCardProps> = ({
  title,
  amount,
  currency,
  subtitle,
  breakdown,
  loading = false,
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);

  const handlePress = () => {
    if (!onPress) return;
    lightTap();
    onPress();
  };

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <SkeletonLoader shape="box" height={180} />
      </View>
    );
  }

  const content = (
    <View style={[styles.heroContainer, style]}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.amountContainer}>
        <Text style={styles.currency}>{currency}</Text>
        <Text style={styles.amount}>{amount.toFixed(2)}</Text>
      </View>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {breakdown && breakdown.length > 0 && (
        <>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownContainer}>
            {breakdown.slice(0, 3).map((item, index) => (
              <View key={index} style={styles.breakdownItem}>
                <View style={styles.breakdownIconCircle}>
                  <Feather name={item.icon} size={14} color={C.accent} />
                </View>
                <View style={styles.breakdownTextGroup}>
                  <Text style={styles.breakdownLabel}>{item.label}</Text>
                  <Text style={styles.breakdownValue}>
                    {currency} {item.value.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || `${title}: ${currency} ${amount.toFixed(2)}`}
        accessibilityHint={accessibilityHint || 'Double tap to view details'}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { minHeight: 180 },
  heroContainer: {
    minHeight: 180,
    padding: SPACING['2xl'],
    borderRadius: RADIUS.xl,
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  title: { ...TYPE.label, marginBottom: SPACING.sm },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.xs,
  },
  currency: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginRight: SPACING.xs,
  },
  amount: {
    ...TYPE.amount,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: C.border,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  breakdownContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  breakdownItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  breakdownIconCircle: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownTextGroup: { flex: 1 },
  breakdownLabel: { ...TYPE.muted, marginBottom: 1 },
  breakdownValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

export default React.memo(HeroCard);
