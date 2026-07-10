// ─── GLASS MODE TOGGLE ─────────────────────────────────────────────────
// Drop-in replacement for ModeToggle — Personal ⇄ Business as a liquid-glass
// segmented control with a DRAGGABLE frosted pill (grab & slide, like the nav
// bar), spring-snap, plus tap. Same store logic and `businessModeEnabled` gate.
//
// PLACE AT: src/components/common/GlassModeToggle.tsx
// INSTALL:  npx expo install expo-glass-effect   (expo-blur already installed)
// WIRE IT IN: replace `<ModeToggle />` with `<GlassModeToggle />` in Dashboard.tsx.
//
// iOS 26 → native Apple glass; Android / iOS < 26 → expo-blur frosted fallback.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassView, GlassContainer, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { selectionChanged } from '../../services/haptics';

const GLASS = isLiquidGlassAvailable();
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;
const WIDTH = 240;
const HEIGHT = 42;
const PAD = 4;

type Mode = 'personal' | 'business';

const GlassModeToggle: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { mode, setMode } = useAppStore();
  const businessModeEnabled = useSettingsStore((s) => s.businessModeEnabled);

  const [w, setW] = useState(0);
  const pillL = useSharedValue(0);
  const pillW = useSharedValue(0);
  const ready = useSharedValue(0);

  const segW = w > 0 ? (w - PAD * 2) / 2 : 0;
  const idxOf = (m: Mode) => (m === 'business' ? 1 : 0);

  // settle the pill under the active segment whenever mode / width changes
  useEffect(() => {
    if (segW <= 0) return;
    const idx = idxOf(mode);
    pillL.value = withSpring(PAD + idx * segW, SPRING);
    pillW.value = withSpring(segW, SPRING);
    ready.value = 1;
  }, [mode, segW, pillL, pillW, ready]);

  const applyMode = useCallback((idx: number) => {
    const m: Mode = idx === 1 ? 'business' : 'personal';
    if (m !== mode) {
      selectionChanged();
      setMode(m);
    } else if (segW > 0) {
      // snapped back to the same side — re-settle the pill
      pillL.value = withSpring(PAD + idx * segW, SPRING);
      pillW.value = withSpring(segW, SPRING);
    }
  }, [mode, setMode, segW, pillL, pillW]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8]) // taps fall through to the segment Pressables
        .onUpdate((e) => {
          'worklet';
          if (segW <= 0) return;
          const cx = Math.max(PAD + segW / 2, Math.min(w - PAD - segW / 2, e.x));
          pillL.value = cx - segW / 2;
          pillW.value = segW;
        })
        .onEnd((e) => {
          'worklet';
          runOnJS(applyMode)(e.x < w / 2 ? 0 : 1);
        }),
    [w, segW, applyMode, pillL, pillW],
  );

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillL.value }],
    width: pillW.value,
    opacity: ready.value,
  }));

  if (!businessModeEnabled) return null;

  const activeColor = mode === 'business' ? COLORS.business : COLORS.personal;
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const Segment = (idx: number, icon: keyof typeof Ionicons.glyphMap, label: string, m: Mode) => {
    const active = idxOf(mode) === idx;
    return (
      <Pressable
        style={styles.seg}
        onPress={() => applyMode(idx)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Switch to ${m} mode`}
      >
        <Ionicons name={icon} size={17} color={active ? activeColor : C.textSecondary} />
        <Text style={[styles.segText, { color: active ? activeColor : C.textSecondary }]}>{label}</Text>
      </Pressable>
    );
  };

  const pill = (
    <Animated.View style={[styles.pill, pillStyle]}>
      {GLASS ? (
        <GlassView
          style={[StyleSheet.absoluteFill, styles.pillShape]}
          glassEffectStyle="clear"
          isInteractive
          tintColor={withAlpha(activeColor, isDark ? 0.22 : 0.15)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.pillShape, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.6)',
        }]} />
      )}
    </Animated.View>
  );

  const content = (
    <View style={styles.track} onLayout={onLayout}>
      {pill}
      {Segment(0, 'person', 'Personal', 'personal')}
      {Segment(1, 'briefcase', 'Business', 'business')}
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <GestureDetector gesture={pan}>
        {GLASS ? (
          <GlassContainer spacing={16} style={styles.capsule}>
            <GlassView
              style={[StyleSheet.absoluteFill, styles.capsuleShape]}
              glassEffectStyle="regular"
              tintColor={withAlpha(C.surface, isDark ? 0.14 : 0.22)}
              colorScheme={isDark ? 'dark' : 'light'}
            />
            {content}
          </GlassContainer>
        ) : (
          <View style={styles.capsule}>
            <BlurView
              style={[StyleSheet.absoluteFill, styles.capsuleShape]}
              intensity={isDark ? 30 : 40}
              tint={isDark ? 'dark' : 'light'}
              experimentalBlurMethod="dimezisBlurView"
            />
            <View style={[StyleSheet.absoluteFill, styles.capsuleShape, { backgroundColor: withAlpha(C.surface, 0.4) }]} />
            {content}
          </View>
        )}
      </GestureDetector>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  wrapper: { alignSelf: 'center', marginVertical: SPACING.sm },
  capsule: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  capsuleShape: {
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha('#FFFFFF', 0.3),
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    padding: PAD,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: 0,
    borderRadius: RADIUS.full,
  },
  pillShape: { borderRadius: RADIUS.full },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  segText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
});

export default React.memo(GlassModeToggle);
