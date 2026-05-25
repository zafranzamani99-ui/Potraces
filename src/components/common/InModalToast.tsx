import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, {
  SlideInUp,
  SlideOutUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, RADIUS, SPACING, TYPOGRAPHY } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

type ToastType = 'success' | 'error' | 'info';

export interface InModalToastRef {
  show: (message: string, type?: ToastType) => void;
}

const ICONS: Record<ToastType, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

const makeAccentColors = (C: typeof CALM): Record<ToastType, string> => ({
  success: C.positive,
  error: C.neutral,
  info: C.accent,
});

const InModalToast = forwardRef<InModalToastRef>((_, ref) => {
  const C = useCalm();
  const [toast, setToast] = useState<{ message: string; type: ToastType; key: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accentColors = useMemo(() => makeAccentColors(C), [C]);
  const translateY = useSharedValue(0);

  const dismiss = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setToast(null);
  }, []);

  useImperativeHandle(ref, () => ({
    show: (message: string, type: ToastType = 'success') => {
      if (timerRef.current) clearTimeout(timerRef.current);
      translateY.value = 0;
      setToast({ message, type, key: Date.now() });
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, type === 'error' ? 3500 : 2500);
    },
  }));

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      translateY.value = Math.min(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY < -40) {
        translateY.value = withTiming(-200, { duration: 160 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 250 });
      }
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: Math.max(0, 1 + translateY.value / 80),
  }));

  if (!toast) return null;

  const accent = accentColors[toast.type];

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        key={toast.key}
        entering={SlideInUp.duration(250)}
        exiting={SlideOutUp.duration(250)}
        style={[styles.wrapper, dragStyle]}
      >
        <View style={[styles.container, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[styles.accentBar, { backgroundColor: accent }]} />
          <Feather name={ICONS[toast.type]} size={20} color={accent} style={styles.icon} />
          <Text style={[styles.message, { color: C.textPrimary }]} numberOfLines={2}>
            {toast.message}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 60,
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: 9999,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingRight: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    borderTopLeftRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.lg,
  },
  icon: {
    marginLeft: SPACING.md,
    marginRight: SPACING.sm,
  },
  message: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.normal,
  },
});

export default InModalToast;
