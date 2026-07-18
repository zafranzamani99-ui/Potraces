import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { CALM, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { selectionChanged } from '../../services/haptics';

/**
 * Liquid-glass segmented control — the SAME look as the Personal/Business mode toggle
 * (`GlassModeToggle`), generalized to plain text labels so any 2+ option picker can adopt it.
 *
 * Two render paths, chosen once at module load (matches GlassModeToggle / DebtSegmentedControl):
 *  • iOS 26 (`isLiquidGlassAvailable()`): Apple's GENUINE system segmented control
 *    (@react-native-segmented-control) — real Liquid Glass, text-only, themed via
 *    fontStyle/activeFontStyle + appearance. This is the path on a liquid-glass device.
 *  • Android / iOS < 26: a custom capsule — ONE glass surface (expo-blur BlurView; GlassView
 *    if ever available off the native path) with a NON-glass sliding pill on top.
 *
 * Glass hard-rules honored (violating any renders permanently-flat glass, no error):
 *  - never opacity < 1 on the glass or an ancestor,
 *  - never overflow:'hidden' masking a native GlassView (only the BlurView fallback clips),
 *  - exactly one glass surface; the selection pill is a plain (non-glass) fill,
 *  - capsule stays untinted so the material adapts; active color is a theme token, not raw COLORS.*.
 * Onyx-exempt: do NOT wrap this in neu — the glass IS the surface.
 */

const GLASS = isLiquidGlassAvailable();
// iOS 26 → the genuine system control (UISegmentedControl) IS Liquid Glass and is text-only.
const NATIVE_SEGMENTED = Platform.OS === 'ios' && GLASS;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;
const PAD = 4;

interface GlassSegmentedControlProps {
  values: string[];
  /** Controlled index of the selected segment. */
  selectedIndex: number;
  /** Fires the tapped index. This component owns the haptic — do NOT fire another. */
  onChange: (index: number) => void;
  /** Active label / pill accent. Defaults to the olive C.accent. */
  activeColor?: string;
  /** Capsule width (both paths). Default 220 — matches the mode toggle. */
  width?: number;
}

const GlassSegmentedControl: React.FC<GlassSegmentedControlProps> = ({
  values,
  selectedIndex,
  onChange,
  activeColor,
  width = 220,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const accent = activeColor ?? C.accent;

  // Fallback-path animation state (harmless on the native path; hooks stay unconditional).
  const [trackW, setTrackW] = useState(0);
  const x = useSharedValue(0);
  const segW = trackW > 0 ? (trackW - PAD * 2) / values.length : 0;
  useEffect(() => {
    x.value = withSpring(selectedIndex * segW, SPRING);
  }, [selectedIndex, segW, x]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const select = (i: number) => {
    if (i === selectedIndex) return;
    selectionChanged();
    onChange(i);
  };

  // ── iOS 26: genuine system Liquid Glass (text-only) ──
  if (NATIVE_SEGMENTED) {
    return (
      <SegmentedControl
        style={[styles.native, { width }]}
        values={values}
        selectedIndex={selectedIndex}
        onChange={(e) => select(e.nativeEvent.selectedSegmentIndex)}
        appearance={isDark ? 'dark' : 'light'}
        fontStyle={{
          color: C.textSecondary,
          fontSize: TYPOGRAPHY.size.sm,
          fontWeight: TYPOGRAPHY.weight.semibold as any,
        }}
        activeFontStyle={{
          color: accent,
          fontSize: TYPOGRAPHY.size.sm,
          fontWeight: TYPOGRAPHY.weight.semibold as any,
        }}
      />
    );
  }

  // ── Android / iOS < 26: one glass capsule + sliding NON-glass pill + text segments ──
  return (
    <View style={[styles.capsule, { width }, !GLASS && styles.capsuleClip]}>
      {GLASS ? (
        <GlassView
          style={[StyleSheet.absoluteFill, styles.capsuleShape]}
          glassEffectStyle="regular"
        />
      ) : (
        <>
          <BlurView
            style={[StyleSheet.absoluteFill, styles.capsuleShape]}
            intensity={isDark ? 30 : 40}
            tint={isDark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
          />
          <View style={[StyleSheet.absoluteFill, styles.capsuleShape, styles.fallbackTint]} />
        </>
      )}
      <View
        style={styles.track}
        onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
      >
        {segW > 0 && (
          <Reanimated.View
            style={[
              styles.pill,
              {
                width: segW,
                backgroundColor: withAlpha('#FFFFFF', isDark ? 0.14 : 0.7),
                borderColor: withAlpha('#FFFFFF', isDark ? 0.2 : 0.85),
              },
              pillStyle,
            ]}
          />
        )}
        {values.map((v, i) => {
          const on = i === selectedIndex;
          return (
            <TouchableOpacity
              key={v}
              style={styles.seg}
              onPress={() => select(i)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={v}
            >
              <Text style={[styles.segText, { color: on ? accent : C.textSecondary }]}>{v}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    native: { height: 32, alignSelf: 'center' },
    capsule: {
      height: 38,
      alignSelf: 'center',
      borderRadius: RADIUS.full,
    },
    capsuleClip: { overflow: 'hidden' }, // fallback (BlurView) only — a native GlassView must NOT be masked
    capsuleShape: { borderRadius: RADIUS.full },
    fallbackTint: {
      backgroundColor: withAlpha(C.surface, 0.4),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha('#FFFFFF', 0.3),
    },
    track: { flex: 1, flexDirection: 'row', padding: PAD, position: 'relative' },
    pill: {
      position: 'absolute',
      top: PAD,
      bottom: PAD,
      left: PAD,
      borderRadius: RADIUS.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    seg: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    segText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      letterSpacing: 0.1,
    },
  });

export default GlassSegmentedControl;
