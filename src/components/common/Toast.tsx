import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, RADIUS, SPACING, TYPOGRAPHY, ANIMATION } from '../../constants';

type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  visible: boolean;
  message: string;
  type: ToastType;
  onHide: () => void;
  duration?: number;
}

const ACCENT_COLORS: Record<ToastType, string> = {
  success: CALM.positive,
  error: CALM.neutral,
  info: CALM.accent,
};

const ICONS: Record<ToastType, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

const HIDDEN_Y = -120;
const VISIBLE_Y = 0;

const Toast: React.FC<ToastProps> = ({ visible, message, type, onHide, duration = 2500 }) => {
  const translateY = useRef(new Animated.Value(HIDDEN_Y)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.timing(translateY, { toValue: HIDDEN_Y, duration: ANIMATION.normal, useNativeDriver: true })
      .start(({ finished }) => { if (finished) onHide(); });
  }, [translateY, onHide]);

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, { toValue: VISIBLE_Y, duration: ANIMATION.normal, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => dismiss(), duration);
    } else {
      translateY.setValue(HIDDEN_Y);
    }
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [visible, duration, translateY, dismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY }] }]}
      pointerEvents="none"
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${type} notification: ${message}`}
    >
      <View style={styles.container}>
        <View style={[styles.accentBar, { backgroundColor: ACCENT_COLORS[type] }]} />
        <Feather name={ICONS[type]} size={20} color={ACCENT_COLORS[type]} style={styles.icon} />
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 60, left: SPACING.lg, right: SPACING.lg, zIndex: 9999 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingRight: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  accentBar: { width: 4, alignSelf: 'stretch', borderTopLeftRadius: RADIUS.lg, borderBottomLeftRadius: RADIUS.lg },
  icon: { marginLeft: SPACING.md, marginRight: SPACING.sm },
  message: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.normal,
  },
});

export default Toast;
