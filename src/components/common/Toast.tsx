// ─── TOAST NOTIFICATION ────────────────────────────────────
// Non-blocking, auto-dismissing notification that slides in from the
// top of the screen. Replaces Alert.alert for transient success /
// error / info messages without interrupting user flow.
//
// Design tokens: COLORS (success, danger, info), SHADOWS.lg,
// RADIUS.lg, SPACING, TYPOGRAPHY, ANIMATION.

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, ANIMATION } from '../../constants';

// ─── Types ─────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  /** Controls visibility of the toast. */
  visible: boolean;
  /** The message string displayed to the user. */
  message: string;
  /** Visual variant that drives the accent colour and icon. */
  type: ToastType;
  /** Callback invoked when the toast finishes dismissing. */
  onHide: () => void;
  /** Time in ms before auto-dismiss (default 2500). */
  duration?: number;
}

// ─── Helpers ───────────────────────────────────────────────

const ACCENT_COLORS: Record<ToastType, string> = {
  success: COLORS.success,
  error: COLORS.danger,
  info: COLORS.info,
};

const ICONS: Record<ToastType, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

// Offscreen Y -- enough to hide the toast above the viewport
const HIDDEN_Y = -120;
// Visible Y -- accounts for status bar / notch
const VISIBLE_Y = 0;

// ─── Component ─────────────────────────────────────────────

const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  type,
  onHide,
  duration = 2500,
}) => {
  const translateY = useRef(new Animated.Value(HIDDEN_Y)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dismiss helper ────────────────────────────────────────

  const dismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: HIDDEN_Y,
      duration: ANIMATION.normal, // 280 ms
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onHide();
      }
    });
  }, [translateY, onHide]);

  // ── Lifecycle -- react to visibility changes ──────────────

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.timing(translateY, {
        toValue: VISIBLE_Y,
        duration: ANIMATION.normal,
        useNativeDriver: true,
      }).start();

      // Schedule auto-dismiss
      timerRef.current = setTimeout(() => {
        dismiss();
      }, duration);
    } else {
      // Ensure the toast is hidden when visible goes false externally
      translateY.setValue(HIDDEN_Y);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, duration, translateY, dismiss]);

  // ── Do not render when not visible to save layout cost ────

  if (!visible) {
    return null;
  }

  const accentColor = ACCENT_COLORS[type];
  const iconName = ICONS[type];

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${type} notification: ${message}`}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={dismiss}
        style={styles.container}
      >
        {/* Left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

        {/* Icon */}
        <Feather
          name={iconName}
          size={20}
          color={accentColor}
          style={styles.icon}
        />

        {/* Message */}
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 60,
    left: SPACING.lg,    // 16px
    right: SPACING.lg,   // 16px
    zIndex: 9999,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background, // #FFFFFF
    borderRadius: RADIUS.lg,            // 14px
    paddingVertical: SPACING.md,        // 12px
    paddingRight: SPACING.lg,           // 16px
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    borderTopLeftRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.lg,
  },
  icon: {
    marginLeft: SPACING.md, // 12px
    marginRight: SPACING.sm, // 8px
  },
  message: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base, // 15px
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.text,
    lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.normal, // 15 * 1.5
  },
});

export default Toast;
