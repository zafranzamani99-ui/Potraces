import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Card from './Card';
import { COLORS, withAlpha, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import GRADIENTS, { GradientConfig } from '../../constants/gradients';
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
  backgroundGradient?: GradientConfig;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  iconColor = COLORS.primary,
  subtitle,
  trend,
  trendValue,
  onPress,
  backgroundGradient,
}) => {
  const arrowBounceAnim = useRef(new Animated.Value(0)).current;

  // Bounce animation for trend arrow on mount
  useEffect(() => {
    if (trend) {
      Animated.sequence([
        Animated.timing(arrowBounceAnim, {
          toValue: -4,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(arrowBounceAnim, {
          toValue: 0,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [trend, arrowBounceAnim]);

  // Create gradient for icon background based on iconColor
  const iconGradient: GradientConfig = {
    colors: [withAlpha(iconColor, 0.25), withAlpha(iconColor, 0.08)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  };

  const trendColor = trend === 'up' ? COLORS.income : COLORS.expense;
  const trendGradient: GradientConfig = {
    colors: [withAlpha(trendColor, 0.2), withAlpha(trendColor, 0.1)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  };

  const handlePress = () => {
    if (onPress) {
      lightTap();
      onPress();
    }
  };

  return (
    <Card
      style={styles.card}
      elevation="md"
      onPress={onPress ? handlePress : undefined}
      gradient={backgroundGradient}
      accessibilityLabel={`${title}: ${value}${subtitle ? `, ${subtitle}` : ''}`}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Tap to view details' : undefined}
    >
      <View style={styles.header}>
        <LinearGradient
          colors={iconGradient.colors}
          start={iconGradient.start}
          end={iconGradient.end}
          style={styles.iconContainer}
        >
          <Feather name={icon} size={24} color={iconColor} />
        </LinearGradient>
        {trend && trendValue && (
          <LinearGradient
            colors={trendGradient.colors}
            start={trendGradient.start}
            end={trendGradient.end}
            style={styles.trendBadge}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    translateY: trend === 'up' ? arrowBounceAnim : arrowBounceAnim.interpolate({
                      inputRange: [-4, 0],
                      outputRange: [4, 0],
                    }),
                  },
                ],
              }}
            >
              <Feather
                name={trend === 'up' ? 'trending-up' : 'trending-down'}
                size={14}
                color={trendColor}
              />
            </Animated.View>
            <Text style={[styles.trendText, { color: trendColor }]}>
              {trendValue}
            </Text>
          </LinearGradient>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </Card>
  );
};

const styles = StyleSheet.create({
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
    fontWeight: TYPOGRAPHY.weight.semibold as '600',
  },
  title: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  value: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold as '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});

export default React.memo(StatCard);
