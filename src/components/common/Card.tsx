import React, { useCallback, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { CALM, RADIUS, SPACING } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
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

// ─── Variant helper ─────────────────────────────────────────
const getVariantStyle = (variant: CardVariant, C: typeof CALM): ViewStyle => {
  switch (variant) {
    case 'outlined':
      return { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border };
    case 'filled':
      return { backgroundColor: C.background, borderWidth: 1, borderColor: C.border };
    case 'elevated':
    default:
      return { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border };
  }
};

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
  const C = useCalm();
  const radiusValue = RADIUS[borderRadius];
  const variantStyle = getVariantStyle(variant, C);

  // ── Non-pressable card: plain View (no gesture interference) ──
  if (!onPress) {
    return (
      <View style={[styles.base, variantStyle, { borderRadius: radiusValue }, style]}>
        {children}
      </View>
    );
  }

  // ── Pressable card: Animated.View for press feedback ──
  return <PressableCard
    variantStyle={variantStyle}
    radiusValue={radiusValue}
    style={style}
    onPress={onPress}
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
  >
    {children}
  </PressableCard>;
};

// Split into separate component so Animated.Value is only created when needed
const PressableCard: React.FC<{
  children: React.ReactNode;
  variantStyle: ViewStyle;
  radiusValue: number;
  style?: ViewStyle;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}> = ({ children, variantStyle, radiusValue, style, onPress, accessibilityLabel, accessibilityHint }) => {
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(opacityAnim, {
      toValue: 0.7,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [opacityAnim]);

  const handlePressOut = useCallback(() => {
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [opacityAnim]);

  const handlePress = useCallback(() => {
    lightTap();
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Animated.View
        style={[
          styles.base,
          variantStyle,
          { borderRadius: radiusValue, opacity: opacityAnim },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    padding: SPACING.lg,
  },
});

export default React.memo(Card);
