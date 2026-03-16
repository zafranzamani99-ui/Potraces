import React, { useCallback, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { CALM, RADIUS, SPACING } from '../../constants';
import { lightTap } from '../../services/haptics';

// ─── TYPES ──────────────────────────────────────────────────
type CardVariant = 'elevated' | 'outlined' | 'filled';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  borderRadius?: keyof typeof RADIUS;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  // gradient prop kept for API compat but ignored
  gradient?: any;
  elevation?: any;
}

// ─── COMPONENT ──────────────────────────────────────────────
const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  onPress,
  borderRadius = 'xl',
  style,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const radiusValue = RADIUS[borderRadius];

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

  const variantStyle: ViewStyle = (() => {
    switch (variant) {
      case 'outlined':
        return {
          backgroundColor: CALM.surface,
          borderWidth: 1,
          borderColor: CALM.border,
        };
      case 'filled':
        return {
          backgroundColor: CALM.background,
          borderWidth: 1,
          borderColor: CALM.border,
        };
      case 'elevated':
      default:
        return {
          backgroundColor: CALM.surface,
          borderWidth: 1,
          borderColor: CALM.border,
        };
    }
  })();

  const content = (
    <Animated.View
      style={[
        styles.base,
        variantStyle,
        {
          borderRadius: radiusValue,
          opacity: opacityAnim,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );

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

const styles = StyleSheet.create({
  base: {
    padding: SPACING.lg,
  },
});

export default React.memo(Card);
