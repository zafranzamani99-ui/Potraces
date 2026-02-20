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
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, withAlpha, coloredShadow } from '../../constants';
import GRADIENTS, { GradientConfig } from '../../constants/gradients';
import { lightTap } from '../../services/haptics';

// ─── TYPES ──────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Feather.glyphMap;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  gradient?: GradientConfig;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// ─── VARIANT COLOURS ────────────────────────────────────────
const VARIANT_CONFIG: Record<
  ButtonVariant,
  {
    bg: string;
    text: string;
    border: string;
    filled: boolean;
  }
> = {
  primary: {
    bg: COLORS.primary,
    text: '#FFFFFF',
    border: COLORS.primary,
    filled: true,
  },
  secondary: {
    bg: COLORS.secondary,
    text: '#FFFFFF',
    border: COLORS.secondary,
    filled: true,
  },
  outline: {
    bg: 'transparent',
    text: COLORS.primary,
    border: COLORS.primary,
    filled: false,
  },
  ghost: {
    bg: 'transparent',
    text: COLORS.primary,
    border: 'transparent',
    filled: false,
  },
  danger: {
    bg: COLORS.danger,
    text: '#FFFFFF',
    border: COLORS.danger,
    filled: true,
  },
  success: {
    bg: COLORS.success,
    text: '#FFFFFF',
    border: COLORS.success,
    filled: true,
  },
};

// ─── SIZE CONFIG (Fitts's Law — larger targets are easier to hit) ─
const SIZE_CONFIG: Record<
  ButtonSize,
  { height: number; paddingH: number; fontSize: number; iconSize: number }
> = {
  small: {
    height: 36,
    paddingH: SPACING.md,         // 12
    fontSize: TYPOGRAPHY.size.sm,  // 13
    iconSize: 16,
  },
  medium: {
    height: 48,
    paddingH: SPACING.xl,         // 20
    fontSize: TYPOGRAPHY.size.base, // 15
    iconSize: 18,
  },
  large: {
    height: 56,
    paddingH: SPACING['2xl'],     // 24
    fontSize: TYPOGRAPHY.size.lg,  // 17
    iconSize: 20,
  },
};

// ─── COMPONENT ──────────────────────────────────────────────
const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = false,
  haptic = true,
  gradient,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const variantCfg = VARIANT_CONFIG[variant];
  const sizeCfg = SIZE_CONFIG[size];
  const isDisabled = disabled || loading;

  // Shimmer animation for gradient buttons when loading
  useEffect(() => {
    if (loading && gradient) {
      Animated.loop(
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
      ).start();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [loading, gradient, shimmerAnim]);

  // ── Press animation ──
  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    if (isDisabled) return;
    if (haptic) {
      lightTap();
    }
    onPress();
  }, [isDisabled, haptic, onPress]);

  // ── Derived styles ──
  const containerStyle: ViewStyle = {
    height: sizeCfg.height,
    paddingHorizontal: sizeCfg.paddingH,
    backgroundColor: gradient ? 'transparent' : variantCfg.bg,
    borderColor: variantCfg.border,
    borderWidth: variant === 'outline' ? 1.5 : 0,
    alignSelf: fullWidth ? 'stretch' : 'auto',
  };

  const labelColor = gradient || variantCfg.filled ? '#FFFFFF' : variantCfg.text;
  const indicatorColor = gradient || variantCfg.filled ? '#FFFFFF' : COLORS.primary;

  // Colored shadow for gradient buttons
  const gradientShadow = gradient && !isDisabled
    ? coloredShadow(gradient.colors[0])
    : undefined;

  // ── Render icon helper ──
  const renderIcon = () => {
    if (loading || !icon) return null;
    return (
      <Feather
        name={icon}
        size={sizeCfg.iconSize}
        color={labelColor}
      />
    );
  };

  // Render button content
  const buttonContent = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={indicatorColor} />
      ) : (
        <View style={styles.content}>
          {iconPosition === 'left' && renderIcon()}
          <Text
            style={[
              styles.label,
              {
                fontSize: sizeCfg.fontSize,
                color: labelColor,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
          {iconPosition === 'right' && renderIcon()}
        </View>
      )}
    </>
  );

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        alignSelf: fullWidth ? 'stretch' : 'auto',
      }}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          styles.base,
          containerStyle,
          variant !== 'ghost' && variant !== 'outline' && !gradient && SHADOWS.sm,
          gradientShadow,
          isDisabled && styles.disabled,
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {gradient ? (
          <Animated.View style={{ opacity: loading && gradient ? shimmerAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.7],
          }) : 1 }}>
            <LinearGradient
              colors={gradient.colors}
              start={gradient.start}
              end={gradient.end}
              style={[
                styles.gradientContainer,
                {
                  height: sizeCfg.height,
                  paddingHorizontal: sizeCfg.paddingH,
                  borderRadius: RADIUS.md,
                },
              ]}
            >
              {buttonContent}
            </LinearGradient>
          </Animated.View>
        ) : (
          buttonContent
        )}
      </Pressable>
    </Animated.View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md, // 10
    overflow: 'hidden',
  },
  gradientContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm, // 8
  },
  label: {
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  disabled: {
    opacity: 0.6,
  },
});

export default Button;
