// ─── GLASS MODE TOGGLE (icon-only) ─────────────────────────────────────
// Personal ⇄ Business as a liquid-glass capsule with a DRAGGABLE floating pill
// (grab & slide, spring-snap, plus tap). Icons only — person / briefcase.
// Same store logic and `businessModeEnabled` gate as the old ModeToggle.
//
// iOS 26 → native Apple glass (expo-glass-effect); Android / iOS < 26 → expo-blur.
//
// Glass rules honored (learned the hard way on the nav bar): ONE glass surface
// (the capsule); the pill is a NON-glass fill (glass-on-glass is Apple's
// anti-pattern, and an opacity-animated GlassView renders permanently flat);
// no overflow:'hidden' masking the native GlassView (it rounds itself via its
// own borderRadius) — only the blur fallback clips; capsule is untinted so the
// material adapts on its own (App.tsx syncs native appearance to the app theme).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { selectionChanged } from '../../services/haptics';

const GLASS = isLiquidGlassAvailable();
// iOS 26 → Apple's REAL segmented control (UISegmentedControl) = genuine system
// Liquid Glass, same as the navbar. It's TEXT-ONLY and a filled capsule by design
// (Apple draws its material; it can't be transparent or take icons). The custom
// glass control below is the Android / iOS<26 fallback.
const NATIVE_SEGMENTED = Platform.OS === 'ios' && GLASS;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;
const WIDTH = 220;
const HEIGHT = 40;
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

  // ── iOS 26: the genuine system segmented control (real Liquid Glass) ──
  if (NATIVE_SEGMENTED) {
    // Palette-aware active label (raw COLORS.* olive is too dark on dark glass).
    const labelAccent = mode === 'business' ? C.bronze : C.accent;
    return (
      <View style={styles.wrapper}>
        <SegmentedControl
          style={styles.native}
          values={['Personal', 'Business']}
          selectedIndex={idxOf(mode)}
          onChange={(e) => applyMode(e.nativeEvent.selectedSegmentIndex)}
          fontStyle={{ color: C.textSecondary, fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold as any }}
          activeFontStyle={{ color: labelAccent, fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold as any }}
        />
      </View>
    );
  }

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const Segment = (idx: number, icon: keyof typeof Ionicons.glyphMap, m: Mode) => {
    const active = idxOf(mode) === idx;
    return (
      <Pressable
        style={styles.seg}
        onPress={() => applyMode(idx)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Switch to ${m} mode`}
      >
        <Ionicons name={icon} size={20} color={active ? activeColor : C.textSecondary} />
      </Pressable>
    );
  };

  // Non-glass floating pill (fill + hairline) — a neutral bubble on the glass,
  // like the system tab bar's selection. Accent lives in the active icon.
  const pill = (
    <Animated.View
      style={[
        styles.pill,
        {
          backgroundColor: withAlpha('#FFFFFF', isDark ? 0.14 : 0.7),
          borderColor: withAlpha('#FFFFFF', isDark ? 0.2 : 0.85),
        },
        pillStyle,
      ]}
    />
  );

  const content = (
    <View style={styles.track} onLayout={onLayout}>
      {pill}
      {Segment(0, 'person', 'personal')}
      {Segment(1, 'briefcase', 'business')}
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <GestureDetector gesture={pan}>
        {GLASS ? (
          // Native glass: unclipped capsule; the GlassView rounds itself.
          <View style={styles.capsule}>
            <GlassView
              style={[StyleSheet.absoluteFill, styles.capsuleShape]}
              glassEffectStyle="regular"
            />
            {content}
          </View>
        ) : (
          <View style={[styles.capsule, styles.capsuleClip]}>
            <BlurView
              style={[StyleSheet.absoluteFill, styles.capsuleShape]}
              intensity={isDark ? 30 : 40}
              tint={isDark ? 'dark' : 'light'}
              experimentalBlurMethod="dimezisBlurView"
            />
            <View style={[StyleSheet.absoluteFill, styles.capsuleShape, styles.fallbackTint]} />
            {content}
          </View>
        )}
      </GestureDetector>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  wrapper: { alignSelf: 'center', marginVertical: SPACING.sm },
  native: { width: WIDTH, height: 32 },
  capsule: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: RADIUS.full,
  },
  // Fallback-only: BlurView needs clipping; native glass must NOT be masked.
  capsuleClip: { overflow: 'hidden' },
  capsuleShape: { borderRadius: RADIUS.full },
  fallbackTint: {
    backgroundColor: withAlpha(C.surface, 0.4),
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  seg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});

export default React.memo(GlassModeToggle);
