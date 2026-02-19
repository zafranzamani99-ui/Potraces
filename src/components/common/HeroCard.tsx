import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  Animated,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, ICON_SIZE, withAlpha } from '../../constants';
import { GradientConfig } from '../../constants/gradients';
import { lightTap } from '../../services/haptics';
import SkeletonLoader from './SkeletonLoader';

// ─── TYPES ──────────────────────────────────────────────────
interface BreakdownItem {
  label: string;
  value: number;
  icon: keyof typeof Feather.glyphMap;
}

interface HeroCardProps {
  gradient: GradientConfig;
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
}

// ─── COMPONENT ──────────────────────────────────────────────
/**
 * HeroCard - Premium hero section card with gradient background
 *
 * Features:
 * - LinearGradient background with configurable colors
 * - Animated number count-up effect
 * - Spring entrance animation (scale + fade)
 * - Optional breakdown stats in glassmorphism cards
 * - Loading skeleton state
 * - Optional press action
 *
 * @example
 * <HeroCard
 *   gradient={GRADIENTS.personalHero}
 *   title="Total Balance"
 *   amount={12500.50}
 *   currency="RM"
 *   subtitle="Updated just now"
 *   breakdown={[
 *     { label: 'Income', value: 5000, icon: 'arrow-down' },
 *     { label: 'Expenses', value: 2500, icon: 'arrow-up' },
 *   ]}
 * />
 */
const HeroCard: React.FC<HeroCardProps> = ({
  gradient,
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
  // ── Animation refs ──
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const pressScaleAnim = useRef(new Animated.Value(1)).current;

  // ── Entrance animation ──
  useEffect(() => {
    if (!loading) {
      // Stagger entrance by 100ms after mount
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 12,
            bounciness: 6,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();

        // Amount count-up animation
        Animated.timing(countAnim, {
          toValue: amount,
          duration: 800,
          useNativeDriver: false,
        }).start();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [loading, amount, scaleAnim, opacityAnim, countAnim]);

  // ── Press animation ──
  const handlePressIn = () => {
    if (!onPress) return;
    Animated.spring(pressScaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  };

  const handlePressOut = () => {
    if (!onPress) return;
    Animated.spring(pressScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  };

  const handlePress = () => {
    if (!onPress) return;
    lightTap();
    onPress();
  };

  // ── Loading state ──
  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <SkeletonLoader shape="box" height={180} />
      </View>
    );
  }

  // ── Render content ──
  const content = (
    <Animated.View
      style={[
        {
          transform: [
            { scale: Animated.multiply(scaleAnim, pressScaleAnim) }
          ],
          opacity: opacityAnim
        },
        style,
      ]}
    >
      <LinearGradient
        colors={gradient.colors}
        start={gradient.start}
        end={gradient.end}
        style={[styles.gradientContainer, SHADOWS.xl]}
      >
        {/* Title */}
        <Text
          style={styles.title}
          accessibilityRole="header"
        >
          {title}
        </Text>

        {/* Amount */}
        <View style={styles.amountContainer}>
          <Text style={styles.currency}>{currency}</Text>
          <Text style={styles.amount}>
            {amount.toFixed(2)}
          </Text>
        </View>

        {/* Subtitle */}
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}

        {/* Breakdown stats */}
        {breakdown && breakdown.length > 0 && (
          <>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownContainer}>
              {breakdown.slice(0, 3).map((item, index) => (
                <View key={index} style={styles.breakdownItem}>
                  <View style={styles.breakdownIconCircle}>
                    <Feather
                      name={item.icon}
                      size={14}
                      color="#FFFFFF"
                    />
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
      </LinearGradient>
    </Animated.View>
  );

  // If pressable, wrap in Pressable
  if (onPress) {
    return (
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
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

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    minHeight: 180,
  },
  gradientContainer: {
    minHeight: 180,
    padding: SPACING['2xl'], // 24
    borderRadius: RADIUS.xl, // 20
    justifyContent: 'center',
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg, // 17
    fontWeight: TYPOGRAPHY.weight.medium,
    color: '#FFFFFF',
    marginBottom: SPACING.sm, // 8
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.xs, // 4
  },
  currency: {
    fontSize: TYPOGRAPHY.size.lg, // 17
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
    marginRight: SPACING.xs, // 4
  },
  amount: {
    fontSize: TYPOGRAPHY.size['4xl'], // 36
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'], // Monospaced numbers for financial data
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm, // 13
    color: withAlpha('#FFFFFF', 0.8),
    marginBottom: SPACING.lg, // 16
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: withAlpha('#FFFFFF', 0.2),
    marginTop: SPACING.lg, // 16
    marginBottom: SPACING.md, // 12
  },
  breakdownContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md, // 12
  },
  breakdownItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm, // 8
  },
  breakdownIconCircle: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha('#FFFFFF', 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownTextGroup: {
    flex: 1,
  },
  breakdownLabel: {
    fontSize: TYPOGRAPHY.size.xs, // 11
    fontWeight: TYPOGRAPHY.weight.medium,
    color: withAlpha('#FFFFFF', 0.8),
    marginBottom: 1,
  },
  breakdownValue: {
    fontSize: TYPOGRAPHY.size.sm, // 13
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
});

export default HeroCard;
