// ─── FLOATING ACTION BUTTON ────────────────────────────────
// Primary screen-level action trigger (56 x 56). Positioned at the
// bottom-right corner with a 150ms opacity pulse and haptic
// feedback for satisfying tactile response.
//
// Design tokens: CALM.accent, RADIUS.full, SPACING.

import React, { useRef, useState, useCallback, forwardRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { lightTap } from '../../services/haptics';
import { NeuSurface } from './neu';

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

// forwardRef so screens can spotlight the FAB (ScreenGuide measures it).
const FAB = forwardRef<View, FABProps>(({
  onPress,
  icon = 'plus',
  color: colorProp,
  style,
}, ref) => {
  const C = useCalm();
  const color = colorProp ?? C.accent;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  // ── Interaction handlers: opacity pulse + neu press-in ──

  const handlePressIn = useCallback(() => {
    setPressed(true);
    Animated.timing(opacityAnim, {
      toValue: 0.85,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [opacityAnim]);

  const handlePressOut = useCallback(() => {
    setPressed(false);
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
      ref={ref as any}
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
      >
        {/* Neu face + accent-colored glyph — matches the home-screen quick-add FAB. */}
        <NeuSurface pressed={pressed} style={styles.button}>
          <Feather name={icon} size={ICON_SIZE} color={color} />
        </NeuSurface>
      </Pressable>
    </Animated.View>
  );
});

FAB.displayName = 'FAB';

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
