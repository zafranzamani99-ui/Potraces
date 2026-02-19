import React, { useCallback, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SHADOWS, RADIUS, SPACING, withAlpha } from '../../constants';
import { lightTap } from '../../services/haptics';

// ─── TYPES ──────────────────────────────────────────────────
type GlassVariant = 'frosted' | 'tinted' | 'elevated';
type BlurTint = 'light' | 'dark' | 'default';

interface GlassCardProps {
  children: React.ReactNode;
  variant?: GlassVariant;
  intensity?: number;
  tint?: BlurTint;
  onPress?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// ─── VARIANT CONFIG ─────────────────────────────────────────
const VARIANT_CONFIG: Record<
  GlassVariant,
  {
    intensity: number;
    backgroundColor: string;
    borderColor: string;
    shadow?: typeof SHADOWS.lg;
  }
> = {
  frosted: {
    intensity: 80,
    backgroundColor: withAlpha(COLORS.card, 0.7),
    borderColor: withAlpha('#FFFFFF', 0.2),
  },
  tinted: {
    intensity: 60,
    backgroundColor: withAlpha(COLORS.surface, 0.8),
    borderColor: withAlpha(COLORS.primary, 0.3),
  },
  elevated: {
    intensity: 40,
    backgroundColor: withAlpha(COLORS.card, 0.9),
    borderColor: withAlpha('#FFFFFF', 0.15),
    shadow: SHADOWS.lg,
  },
};

// ─── COMPONENT ──────────────────────────────────────────────
/**
 * GlassCard - Glassmorphism card with blur effect
 *
 * Features:
 * - BlurView with configurable intensity and tint
 * - Three variants: frosted (heavy blur), tinted (colored), elevated (with shadow)
 * - Optional press animation when onPress provided
 * - Semi-transparent background with subtle border
 *
 * @example
 * <GlassCard variant="frosted">
 *   <Text>Frosted glass content</Text>
 * </GlassCard>
 *
 * <GlassCard variant="elevated" onPress={() => console.log('Pressed')}>
 *   <Text>Tappable glass card</Text>
 * </GlassCard>
 */
const GlassCard: React.FC<GlassCardProps> = ({
  children,
  variant = 'frosted',
  intensity,
  tint = 'default',
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ── Get variant configuration ──
  const variantCfg = VARIANT_CONFIG[variant];
  const blurIntensity = intensity ?? variantCfg.intensity;

  // ── Press animation (only when tappable) ──
  const handlePressIn = useCallback(() => {
    if (!onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }, [scaleAnim, onPress]);

  const handlePressOut = useCallback(() => {
    if (!onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }, [scaleAnim, onPress]);

  const handlePress = useCallback(() => {
    if (!onPress) return;
    lightTap();
    onPress();
  }, [onPress]);

  // ── Render content with blur and background ──
  const content = (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      <BlurView
        intensity={blurIntensity}
        tint={tint}
        style={[
          styles.blurContainer,
          {
            backgroundColor: variantCfg.backgroundColor,
            borderColor: variantCfg.borderColor,
          },
          variantCfg.shadow,
        ]}
      >
        {children}
      </BlurView>
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
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  blurContainer: {
    borderRadius: RADIUS.xl, // 20
    padding: SPACING.lg, // 16
    borderWidth: 1,
    overflow: 'hidden',
  },
});

export default GlassCard;
