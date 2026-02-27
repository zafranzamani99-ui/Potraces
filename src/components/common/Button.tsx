import React, { useCallback, useRef } from 'react';
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
import { CALM, RADIUS, SPACING, TYPOGRAPHY } from '../../constants';
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
  gradient?: any; // kept for API compat, ignored
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// ─── VARIANT COLOURS ────────────────────────────────────────
const VARIANT_CONFIG: Record<
  ButtonVariant,
  { bg: string; text: string; border: string; filled: boolean }
> = {
  primary: {
    bg: CALM.accent,
    text: '#FFFFFF',
    border: CALM.accent,
    filled: true,
  },
  secondary: {
    bg: CALM.positive,
    text: '#FFFFFF',
    border: CALM.positive,
    filled: true,
  },
  outline: {
    bg: 'transparent',
    text: CALM.accent,
    border: CALM.accent,
    filled: false,
  },
  ghost: {
    bg: 'transparent',
    text: CALM.accent,
    border: 'transparent',
    filled: false,
  },
  danger: {
    bg: CALM.neutral,
    text: '#FFFFFF',
    border: CALM.neutral,
    filled: true,
  },
  success: {
    bg: CALM.positive,
    text: '#FFFFFF',
    border: CALM.positive,
    filled: true,
  },
};

const SIZE_CONFIG: Record<
  ButtonSize,
  { height: number; paddingH: number; fontSize: number; iconSize: number }
> = {
  small: {
    height: 36,
    paddingH: SPACING.md,
    fontSize: TYPOGRAPHY.size.sm,
    iconSize: 16,
  },
  medium: {
    height: 48,
    paddingH: SPACING.xl,
    fontSize: TYPOGRAPHY.size.base,
    iconSize: 18,
  },
  large: {
    height: 56,
    paddingH: SPACING['2xl'],
    fontSize: TYPOGRAPHY.size.lg,
    iconSize: 20,
  },
};

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
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const variantCfg = VARIANT_CONFIG[variant];
  const sizeCfg = SIZE_CONFIG[size];
  const isDisabled = disabled || loading;

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
    if (haptic) lightTap();
    onPress();
  }, [isDisabled, haptic, onPress]);

  const containerStyle: ViewStyle = {
    height: sizeCfg.height,
    paddingHorizontal: sizeCfg.paddingH,
    backgroundColor: variantCfg.bg,
    borderColor: variantCfg.border,
    borderWidth: variant === 'outline' ? 1.5 : 0,
    alignSelf: fullWidth ? 'stretch' : 'auto',
  };

  const labelColor = variantCfg.filled ? '#FFFFFF' : variantCfg.text;
  const indicatorColor = variantCfg.filled ? '#FFFFFF' : CALM.accent;

  const renderIcon = () => {
    if (loading || !icon) return null;
    return <Feather name={icon} size={sizeCfg.iconSize} color={labelColor} />;
  };

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
          isDisabled && styles.disabled,
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={indicatorColor} />
        ) : (
          <View style={styles.content}>
            {iconPosition === 'left' && renderIcon()}
            <Text
              style={[
                styles.label,
                { fontSize: sizeCfg.fontSize, color: labelColor },
                textStyle,
              ]}
            >
              {title}
            </Text>
            {iconPosition === 'right' && renderIcon()}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  label: {
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  disabled: {
    opacity: 0.6,
  },
});

export default Button;
