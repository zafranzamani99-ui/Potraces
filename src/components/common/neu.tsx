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
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import { useCalm, useIsDark } from '../../hooks/useCalm';

// A warm off-white / near-black that makes the dual shadow pop. For the punchiest
// effect, set a row list's background to this (see HANDOFF). Optional — useNeu()
// defaults its card base to the screen's own C.background so cards always blend.
export const NEU_BG = { light: '#F1F0EA', dark: '#151515' };

/**
 * Theme-aware neumorphic style fragments — spread into existing styles.
 * Neumorphism only reads correctly when the card and its container share a tone.
 * Rows on the screen use the default (C.background); rows inside a lighter/darker
 * container (e.g. a modal sheet on C.surface) MUST pass that container's color as
 * `baseColor` so they blend instead of showing as a darker/lighter slab.
 */
export function useNeu(baseColor?: string) {
  const C = useCalm();
  const isDark = useIsDark();
  return useMemo(() => {
    // Dark highlight stays close to the bg tone — at #2A2A2A the top-left
    // rim read as a white glow on device; #1C1C1C was still too obvious, so the
    // highlight is toned further down to #171717 (a faint sheen, not white).
    const shL = isDark ? '#171717' : '#FFFFFF';
    // Dark drop: #0C0C0C (user-picked after A/B against pure black).
    const shD = isDark ? '#0C0C0C' : '#E0DCD2';
    // SOFT variant for LARGE surfaces (rows/cards): the punchy shadow above is
    // right for small tiles/buttons, but on a full-width row it outlines a hard
    // "perfect rectangle" in dark. These sit much closer to the bg so a big card
    // reads as a gentle raise that blends. (Light barely changes — light neu
    // already reads as clean cards.)
    const shLSoft = isDark ? '#151515' : '#FFFFFF';
    const shDSoft = isDark ? '#0D0D0D' : '#E6E2D8';
    const base = baseColor ?? C.background; // match the CONTAINER bg so the card blends
    return {
      base,
      // raised card surface — small tiles / buttons
      raised: {
        backgroundColor: base,
        boxShadow: [
          { offsetX: -4, offsetY: -5, blurRadius: 11, color: shL },
          { offsetX: 4, offsetY: 6, blurRadius: 13, color: shD },
        ] as any,
      } as ViewStyle,
      // pressed / pushed-in surface — small tiles / buttons
      inset: {
        backgroundColor: base,
        boxShadow: [
          { offsetX: -3, offsetY: -4, blurRadius: 8, color: shL, inset: true },
          { offsetX: 4, offsetY: 5, blurRadius: 9, color: shD, inset: true },
        ] as any,
      } as ViewStyle,
      // raised — LARGE surfaces (rows, list cards). The light top-left highlight
      // is what glows into a visible "rectangle" on the near-black #121212 theme
      // (anything lighter than the bg reads as a lit frame). So in DARK we drop
      // the highlight and lift the card with a soft DARK drop-shadow only — depth,
      // no lighter region to form a rectangle. LIGHT keeps the full dual-shadow neu.
      raisedSoft: (isDark
        ? {
            backgroundColor: base,
            boxShadow: [
              { offsetX: 0, offsetY: 4, blurRadius: 12, color: '#000000' },
            ],
          }
        : {
            backgroundColor: base,
            boxShadow: [
              { offsetX: -3, offsetY: -3, blurRadius: 8, color: shLSoft },
              { offsetX: 3, offsetY: 5, blurRadius: 12, color: shDSoft },
            ],
          }) as any as ViewStyle,
      insetSoft: (isDark
        ? {
            backgroundColor: base,
            boxShadow: [
              { offsetX: 0, offsetY: 2, blurRadius: 6, color: '#000000', inset: true },
            ],
          }
        : {
            backgroundColor: base,
            boxShadow: [
              { offsetX: -2, offsetY: -2, blurRadius: 6, color: shLSoft, inset: true },
              { offsetX: 3, offsetY: 4, blurRadius: 8, color: shDSoft, inset: true },
            ],
          }) as any as ViewStyle,
      // debossed icon well — spread onto the icon circle (keep its tint background)
      well: {
        boxShadow: [
          { offsetX: -2, offsetY: -2, blurRadius: 5, color: shL, inset: true },
          { offsetX: 3, offsetY: 3, blurRadius: 6, color: shD, inset: true },
        ] as any,
      } as ViewStyle,
    };
  }, [C.background, isDark, baseColor]);
}

// ── Components (greenfield use) ──

// Plain <View>, NOT expo-linear-gradient: the New-Arch `boxShadow` style only
// renders on core views — on LinearGradient's native view it's silently dropped,
// and since the neu face matches the screen bg, no shadow = invisible surface.
// (The gradient was [base, base] — a solid color — anyway.)
export const NeuSurface: React.FC<{ pressed?: boolean; style?: StyleProp<ViewStyle>; children?: React.ReactNode } & ViewProps> = ({ pressed = false, style, children, ...rest }) => {
  const neu = useNeu();
  return (
    <View style={[pressed ? neu.inset : neu.raised, style]} {...rest}>
      {children}
    </View>
  );
};

export const NeuWell: React.FC<{ size: number; radius?: number; tint?: string; style?: StyleProp<ViewStyle>; children?: React.ReactNode }> = ({ size, radius, tint, style, children }) => {
  const neu = useNeu();
  return (
    <View
      style={[{ width: size, height: size, borderRadius: radius ?? size * 0.3, backgroundColor: tint ?? neu.base, alignItems: 'center', justifyContent: 'center' }, neu.well, style]}
    >
      {children}
    </View>
  );
};
