import React, { useEffect, useRef, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, RADIUS, SPACING, TYPOGRAPHY } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastProps {
  visible: boolean;
  message: string;
  type: ToastType;
  onHide: () => void;
  duration?: number;
  action?: ToastAction | null;
}

const makeAccentColors = (C: typeof CALM): Record<ToastType, string> => ({
  success: C.positive,
  error: C.neutral,
  info: C.accent,
});

const ICONS: Record<ToastType, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

const Toast: React.FC<ToastProps> = ({ visible, message, type, onHide, duration = 2500, action }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const ACCENT_COLORS = useMemo(() => makeAccentColors(C), [C]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(() => onHide(), duration);
    }
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [visible, duration, onHide]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={SlideInUp.duration(250)}
      exiting={SlideOutUp.duration(250)}
      style={styles.wrapper}
      pointerEvents={action ? 'box-none' : 'none'}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${type} notification: ${message}`}
    >
      <View style={styles.container}>
        <View style={[styles.accentBar, { backgroundColor: ACCENT_COLORS[type] }]} />
        <Feather name={ICONS[type]} size={20} color={ACCENT_COLORS[type]} style={styles.icon} />
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
        {action && (
          <TouchableOpacity
            onPress={() => { action.onPress(); onHide(); }}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  wrapper: { position: 'absolute', top: 60, left: SPACING.lg, right: SPACING.lg, zIndex: 9999 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingRight: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  accentBar: { width: 4, alignSelf: 'stretch', borderTopLeftRadius: RADIUS.lg, borderBottomLeftRadius: RADIUS.lg },
  icon: { marginLeft: SPACING.md, marginRight: SPACING.sm },
  message: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.normal,
  },
  actionBtn: {
    marginLeft: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    backgroundColor: C.background,
  },
  actionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
});

export default Toast;
