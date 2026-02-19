import React, { useCallback, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { COLORS, SHADOWS, RADIUS, SPACING, withAlpha } from '../../constants';
import GRADIENTS, { GradientConfig } from '../../constants/gradients';
import { lightTap } from '../../services/haptics';

// ─── TYPES ──────────────────────────────────────────────────
type CardVariant = 'elevated' | 'outlined' | 'filled' | 'glass';
type CardElevation = 'sm' | 'md' | 'lg';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  elevation?: CardElevation;
  onPress?: () => void;
  gradient?: GradientConfig;
  borderRadius?: keyof typeof RADIUS;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// ─── COMPONENT ──────────────────────────────────────────────
const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  elevation = 'sm',
  onPress,
  gradient,
  borderRadius = 'xl',
  style,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const radiusValue = RADIUS[borderRadius];

  // ── Press animation (only when tappable) ──
  const handlePressIn = useCallback(() => {
    if (!onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim, onPress]);

  const handlePressOut = useCallback(() => {
    if (!onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim, onPress]);

  const handlePress = useCallback(() => {
    if (!onPress) return;
    lightTap();
    onPress();
  }, [onPress]);

  // ── Variant-specific styles ──
  const variantStyle: ViewStyle = (() => {
    switch (variant) {
      case 'outlined':
        return {
          backgroundColor: gradient ? 'transparent' : COLORS.background,
          borderWidth: 1,
          borderColor: COLORS.border,
        };
      case 'filled':
        return {
          backgroundColor: gradient ? 'transparent' : COLORS.surface,
        };
      case 'glass':
        return {
          backgroundColor: 'transparent',
          overflow: 'hidden',
        };
      case 'elevated':
      default:
        return {
          backgroundColor: gradient ? 'transparent' : COLORS.card,
          ...SHADOWS[elevation],
        };
    }
  })();

  // Render card content with appropriate wrapper
  const renderContent = () => {
    // Glass variant with blur effect
    if (variant === 'glass') {
      return (
        <Animated.View
          style={[
            styles.base,
            variantStyle,
            {
              borderRadius: radiusValue,
              transform: [{ scale: scaleAnim }],
            },
            style,
          ]}
        >
          <BlurView
            intensity={60}
            style={[
              styles.blurContainer,
              {
                borderRadius: radiusValue,
                backgroundColor: withAlpha(COLORS.card, 0.7),
                borderWidth: 1,
                borderColor: withAlpha('#fff', 0.15),
              },
            ]}
          >
            <View style={styles.glassContent}>{children}</View>
          </BlurView>
        </Animated.View>
      );
    }

    // Gradient background variant
    if (gradient) {
      return (
        <Animated.View
          style={[
            styles.base,
            variantStyle,
            {
              borderRadius: radiusValue,
              transform: [{ scale: scaleAnim }],
              overflow: 'hidden',
            },
            style,
          ]}
        >
          <LinearGradient
            colors={gradient.colors}
            start={gradient.start}
            end={gradient.end}
            style={[
              styles.gradientContainer,
              { borderRadius: radiusValue },
            ]}
          >
            {children}
          </LinearGradient>
        </Animated.View>
      );
    }

    // Standard variant
    return (
      <Animated.View
        style={[
          styles.base,
          variantStyle,
          {
            borderRadius: radiusValue,
            transform: [{ scale: scaleAnim }],
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
    );
  };

  const content = renderContent();

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
  base: {
    padding: SPACING.lg, // 16
  },
  gradientContainer: {
    padding: SPACING.lg,
  },
  blurContainer: {
    padding: SPACING.lg,
  },
  glassContent: {
    // Wrapper for blur content to prevent clipping
  },
});

export default Card;
