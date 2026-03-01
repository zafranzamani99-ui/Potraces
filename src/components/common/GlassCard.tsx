import React, { useCallback, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { CALM, RADIUS, SPACING, withAlpha } from '../../constants';
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
  }
> = {
  frosted: {
    intensity: 80,
    backgroundColor: withAlpha(CALM.surface, 0.7),
    borderColor: withAlpha('#FFFFFF', 0.2),
  },
  tinted: {
    intensity: 60,
    backgroundColor: withAlpha(CALM.background, 0.8),
    borderColor: withAlpha(CALM.accent, 0.3),
  },
  elevated: {
    intensity: 40,
    backgroundColor: withAlpha(CALM.surface, 0.9),
    borderColor: withAlpha('#FFFFFF', 0.15),
  },
};

// ─── COMPONENT ──────────────────────────────────────────────
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
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // ── Get variant configuration ──
  const variantCfg = VARIANT_CONFIG[variant];
  const blurIntensity = intensity ?? variantCfg.intensity;

  // ── Press animation: 150ms opacity pulse to 0.7, no scale bounce ──
  const handlePressIn = useCallback(() => {
    if (!onPress) return;
    Animated.timing(opacityAnim, {
      toValue: 0.7,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [opacityAnim, onPress]);

  const handlePressOut = useCallback(() => {
    if (!onPress) return;
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [opacityAnim, onPress]);

  const handlePress = useCallback(() => {
    if (!onPress) return;
    lightTap();
    onPress();
  }, [onPress]);

  // ── Render content with blur and background ──
  const content = (
    <Animated.View
      style={[
        { opacity: opacityAnim },
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
