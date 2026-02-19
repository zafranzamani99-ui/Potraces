import React, { useCallback, useRef, useEffect } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Animated,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, coloredShadow } from '../../constants';
import GRADIENTS, { GradientConfig } from '../../constants/gradients';
import { lightTap } from '../../services/haptics';

// ─── TYPES ──────────────────────────────────────────────────
type ButtonSize = 'small' | 'medium' | 'large';
type IconPosition = 'left' | 'right';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  gradient?: GradientConfig;
  size?: ButtonSize;
  icon?: keyof typeof Feather.glyphMap;
  iconPosition?: IconPosition;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// ─── SIZE CONFIG (matches Button.tsx sizes) ─────────────────
const SIZE_CONFIG: Record<
  ButtonSize,
  { height: number; paddingH: number; fontSize: number; iconSize: number }
> = {
  small: {
    height: 36,
    paddingH: SPACING.md, // 12
    fontSize: TYPOGRAPHY.size.sm, // 13
    iconSize: 16,
  },
  medium: {
    height: 48,
    paddingH: SPACING.xl, // 20
    fontSize: TYPOGRAPHY.size.base, // 15
    iconSize: 18,
  },
  large: {
    height: 56,
    paddingH: SPACING['2xl'], // 24
    fontSize: TYPOGRAPHY.size.lg, // 17
    iconSize: 20,
  },
};

// ─── COMPONENT ──────────────────────────────────────────────
/**
 * GradientButton - Premium button with LinearGradient background
 *
 * Features:
 * - LinearGradient background from gradients.ts
 * - Animated press scale with spring physics
 * - Loading state with shimmer effect
 * - Icon support (left or right position)
 * - Size variants matching Button component
 * - Colored shadow matching gradient
 * - Haptic feedback on press
 *
 * @example
 * <GradientButton
 *   title="Get Started"
 *   onPress={handlePress}
 *   gradient={GRADIENTS.primary}
 *   size="large"
 *   icon="arrow-right"
 * />
 */
const GradientButton: React.FC<GradientButtonProps> = ({
  title,
  onPress,
  gradient = GRADIENTS.primary,
  size = 'medium',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const sizeCfg = SIZE_CONFIG[size];
  const isDisabled = disabled || loading;

  // ── Shimmer animation for loading state ──
  useEffect(() => {
    if (loading) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [loading, shimmerAnim]);

  // ── Press animation ──
  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    if (isDisabled) return;
    lightTap();
    onPress();
  }, [isDisabled, onPress]);

  // ── Render icon helper ──
  const renderIcon = () => {
    if (loading || !icon) return null;
    return (
      <Feather
        name={icon}
        size={sizeCfg.iconSize}
        color="#FFFFFF"
      />
    );
  };

  // ── Shimmer opacity interpolation ──
  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        <LinearGradient
          colors={gradient.colors}
          start={gradient.start}
          end={gradient.end}
          style={[
            styles.gradientContainer,
            {
              height: sizeCfg.height,
              paddingHorizontal: sizeCfg.paddingH,
            },
            coloredShadow(gradient.colors[0]), // Colored shadow matching gradient
            isDisabled && styles.disabled,
          ]}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Animated.View style={{ opacity: shimmerOpacity }}>
                <Text
                  style={[
                    styles.label,
                    { fontSize: sizeCfg.fontSize },
                    textStyle,
                  ]}
                >
                  Loading...
                </Text>
              </Animated.View>
            </View>
          ) : (
            <View style={styles.content}>
              {iconPosition === 'left' && renderIcon()}
              <Text
                style={[
                  styles.label,
                  { fontSize: sizeCfg.fontSize },
                  textStyle,
                ]}
              >
                {title}
              </Text>
              {iconPosition === 'right' && renderIcon()}
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  gradientContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md, // 10
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm, // 8
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm, // 8
  },
  label: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default GradientButton;
