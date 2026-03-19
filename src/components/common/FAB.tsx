// ─── FLOATING ACTION BUTTON ────────────────────────────────
// Primary screen-level action trigger (56 x 56). Positioned at the
// bottom-right corner with a 150ms opacity pulse and haptic
// feedback for satisfying tactile response.
//
// Design tokens: CALM.accent, RADIUS.full, SPACING.

import React, { useRef, useCallback } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, RADIUS, SPACING } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { lightTap } from '../../services/haptics';

// ─── Props ─────────────────────────────────────────────────

interface FABProps {
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  color?: string;
  style?: ViewStyle;
}

// ─── Constants ─────────────────────────────────────────────

const FAB_SIZE = 56; // 56 x 56 -- meets 44pt minimum touch target
const ICON_SIZE = 24;

// ─── Component ─────────────────────────────────────────────

const FAB: React.FC<FABProps> = ({
  onPress,
  icon = 'plus',
  color: colorProp,
  style,
}) => {
  const C = useCalm();
  const color = colorProp ?? C.accent;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // ── Interaction handlers: 150ms opacity pulse to 0.7 ──

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

  // ── Render ────────────────────────────────────────────────

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: opacityAnim },
        style,
      ]}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Floating action button"
      accessibilityHint="Activates the primary action for this screen"
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.button, { backgroundColor: color }]}
      >
        <Feather name={icon} size={ICON_SIZE} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
};

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: SPACING['2xl'],   // 24px
    right: SPACING['2xl'],    // 24px
    borderRadius: RADIUS.full,
  },
  button: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FAB;
