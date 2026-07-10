// ─── NEUMORPHIC KIT ─────────────────────────────────────────────────────
// Shared soft-UI primitives. Two ways to use it:
//   1. useNeu() → style fragments you SPREAD into an existing style. Best for
//      retrofitting rows — keeps all their logic, only changes the surface.
//   2. <NeuSurface> / <NeuWell> — components for greenfield (buttons, tiles).
//
// PLACE AT: src/components/common/neu.tsx  (replaces the earlier neu.tsx)
//
// Uses the New-Architecture `boxShadow` style (multiple shadows), RN 0.76+.
// Expo SDK 54 runs the New Architecture by default. Neumorphism reads best when
// the surface sits on a background of the SAME tone (see NEU_BG). Crisp in light,
// deliberately subtle in dark.

import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCalm, useIsDark } from '../../hooks/useCalm';

// A warm off-white / near-black that makes the dual shadow pop. For the punchiest
// effect, set a row list's background to this (see HANDOFF). Optional — useNeu()
// defaults its card base to the screen's own C.background so cards always blend.
export const NEU_BG = { light: '#F1F0EA', dark: '#151515' };

/** Theme-aware neumorphic style fragments — spread into existing styles. */
export function useNeu() {
  const C = useCalm();
  const isDark = useIsDark();
  return useMemo(() => {
    const shL = isDark ? '#2A2A2A' : '#FFFFFF';
    const shD = isDark ? '#050505' : '#E0DCD2';
    const base = C.background; // match the screen bg so the card blends
    return {
      base,
      // raised card surface
      raised: {
        backgroundColor: base,
        boxShadow: [
          { offsetX: -4, offsetY: -5, blurRadius: 11, color: shL },
          { offsetX: 4, offsetY: 6, blurRadius: 13, color: shD },
        ] as any,
      } as ViewStyle,
      // pressed / pushed-in surface
      inset: {
        backgroundColor: base,
        boxShadow: [
          { offsetX: -3, offsetY: -4, blurRadius: 8, color: shL, inset: true },
          { offsetX: 4, offsetY: 5, blurRadius: 9, color: shD, inset: true },
        ] as any,
      } as ViewStyle,
      // debossed icon well — spread onto the icon circle (keep its tint background)
      well: {
        boxShadow: [
          { offsetX: -2, offsetY: -2, blurRadius: 5, color: shL, inset: true },
          { offsetX: 3, offsetY: 3, blurRadius: 6, color: shD, inset: true },
        ] as any,
      } as ViewStyle,
    };
  }, [C.background, isDark]);
}

// ── Components (greenfield use) ──

export const NeuSurface: React.FC<{ pressed?: boolean; style?: StyleProp<ViewStyle>; children?: React.ReactNode }> = ({ pressed = false, style, children }) => {
  const neu = useNeu();
  return (
    <LinearGradient colors={[neu.base, neu.base]} style={[pressed ? neu.inset : neu.raised, style]}>
      {children}
    </LinearGradient>
  );
};

export const NeuWell: React.FC<{ size: number; radius?: number; tint?: string; style?: StyleProp<ViewStyle>; children?: React.ReactNode }> = ({ size, radius, tint, style, children }) => {
  const neu = useNeu();
  return (
    <LinearGradient
      colors={[tint ?? neu.base, tint ?? neu.base]}
      style={[{ width: size, height: size, borderRadius: radius ?? size * 0.3, alignItems: 'center', justifyContent: 'center' }, neu.well, style]}
    >
      {children}
    </LinearGradient>
  );
};
