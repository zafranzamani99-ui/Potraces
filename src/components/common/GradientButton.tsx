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

type ButtonSize = 'small' | 'medium' | 'large';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  gradient?: any; // kept for API compat, ignored
  size?: ButtonSize;
  icon?: keyof typeof Feather.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const SIZE_CONFIG: Record<
  ButtonSize,
  { height: number; paddingH: number; fontSize: number; iconSize: number }
> = {
  small: { height: 36, paddingH: SPACING.md, fontSize: TYPOGRAPHY.size.sm, iconSize: 16 },
  medium: { height: 48, paddingH: SPACING.xl, fontSize: TYPOGRAPHY.size.base, iconSize: 18 },
  large: { height: 56, paddingH: SPACING['2xl'], fontSize: TYPOGRAPHY.size.lg, iconSize: 20 },
};

const GradientButton: React.FC<GradientButtonProps> = ({
  title,
  onPress,
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
  const sizeCfg = SIZE_CONFIG[size];
  const isDisabled = disabled || loading;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    if (isDisabled) return;
    lightTap();
    onPress();
  }, [isDisabled, onPress]);

  const renderIcon = () => {
    if (loading || !icon) return null;
    return <Feather name={icon} size={sizeCfg.iconSize} color="#FFFFFF" />;
  };

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
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
        <View
          style={[
            styles.buttonContainer,
            { height: sizeCfg.height, paddingHorizontal: sizeCfg.paddingH },
            isDisabled && styles.disabled,
          ]}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={[styles.label, { fontSize: sizeCfg.fontSize }, textStyle]}>Loading...</Text>
            </View>
          ) : (
            <View style={styles.content}>
              {iconPosition === 'left' && renderIcon()}
              <Text style={[styles.label, { fontSize: sizeCfg.fontSize }, textStyle]}>{title}</Text>
              {iconPosition === 'right' && renderIcon()}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: CALM.accent,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  label: { color: '#FFFFFF', fontWeight: TYPOGRAPHY.weight.semibold },
  disabled: { opacity: 0.5 },
});

export default GradientButton;
