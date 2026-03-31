import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Card from './Card';
import { CALM, withAlpha, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { lightTap } from '../../services/haptics';

interface StatCardProps {
  title: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  iconColor?: string;
  subtitle?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  onPress?: () => void;
  backgroundGradient?: any; // kept for API compat, ignored
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  iconColor: iconColorProp,
  subtitle,
  trend,
  trendValue,
  onPress,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const iconColor = iconColorProp ?? C.accent;
  const trendColor = trend === 'up' ? C.positive : C.neutral;

  const handlePress = () => {
    if (onPress) {
      lightTap();
      onPress();
    }
  };

  return (
    <Card
      style={styles.card}
      onPress={onPress ? handlePress : undefined}
      accessibilityLabel={`${title}: ${value}${subtitle ? `, ${subtitle}` : ''}`}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: withAlpha(iconColor, 0.12) },
          ]}
        >
          <Feather name={icon} size={24} color={iconColor} />
        </View>
        {trend && trendValue && (
          <View
            style={[
              styles.trendBadge,
              { backgroundColor: withAlpha(trendColor, 0.12) },
            ]}
          >
            <Feather
              name={trend === 'up' ? 'trending-up' : 'trending-down'}
              size={14}
              color={trendColor}
            />
            <Text style={[styles.trendText, { color: trendColor }]}>
              {trendValue}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </Card>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  trendText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  title: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
  },
  value: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: SPACING.xs,
  },
});

export default React.memo(StatCard);
