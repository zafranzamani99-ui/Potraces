// ─── FLOATING ACTION BUTTON ────────────────────────────────
// Primary screen-level action trigger (56 x 56). Positioned at the
// bottom-right corner with a spring-animated press scale and haptic
// feedback for satisfying tactile response.
//
// Design tokens: CALM.accent, CALM.border, RADIUS.full, SPACING.

import React, { useRef, useCallback } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, RADIUS, SPACING } from '../../constants';
import { lightTap } from '../../services/haptics';

// ─── Props ─────────────────────────────────────────────────

interface FABProps {
  /** Callback fired on press. */
  onPress: () => void;
  /** Feather icon name displayed in the centre (default: "plus"). */
  icon?: keyof typeof Feather.glyphMap;
  /** Background colour of the button (default: CALM.accent). */
  color?: string;
  /** Optional style overrides for the outer container. */
  style?: ViewStyle;
}

// ─── Constants ─────────────────────────────────────────────

const FAB_SIZE = 56; // 56 x 56 -- meets 44pt minimum touch target
const ICON_SIZE = 24;
const PRESSED_SCALE = 0.9;

// ─── Component ─────────────────────────────────────────────

const FAB: React.FC<FABProps> = ({
  onPress,
  icon = 'plus',
  color = CALM.accent,
  style,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ── Interaction handlers ──────────────────────────────────

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: PRESSED_SCALE,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    lightTap();
    onPress();
  }, [onPress]);

  // ── Render ────────────────────────────────────────────────

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: scaleAnim }] },
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
    borderWidth: 1,
    borderColor: CALM.border,
  },
  button: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: RADIUS.full, // fully round
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FAB;
