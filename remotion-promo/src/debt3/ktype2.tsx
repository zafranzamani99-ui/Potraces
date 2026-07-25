import React from 'react';
import { Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';

/* ================================================================== *
 * KTYPE2 — richer kinetic-type engine for white-background motion
 * graphics. Strict upgrade over fx.tsx `KType`: every word arrives
 * with its own personality (deterministic per-word spring variance),
 * masked rise + rotation + blur + scale, line-level tracking-in.
 *   KType2 (per-word rich arrival) · Slam (AE-style strike) ·
 *   Chars (per-character cascade)
 * ================================================================== */

/**
 * Per-word rich arrival: each word rises out of its own overflow-hidden
 * baseline mask (translateY 115% → 0) while independently de-rotating
 * (±`rotate` deg, alternating sign), de-blurring (7px → 0) and settling
 * from scale 1.18 with an overshooting spring. Damping/stiffness get a
 * tiny deterministic per-word variance (seeded `random`) so no two words
 * land identically. The whole line also tracks in (0.055em → 0) with a
 * 1.035 → 1 settle. `outAt` triggers a reverse-staggered per-word exit
 * (last word leaves first: +26px fall, blur, fade, ease-in, ~14 frames).
 */
export const KType2: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  outAt?: number;
  accent?: number[];
  accentColor?: string;
  rotate?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, stagger = 4, outAt, accent = [], accentColor = L.accent, rotate = 5, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');
  const n = words.length;
  const line = spring({ frame: frame - delay, fps, config: { damping: 26, stiffness: 90 } });
  // Reverse exit: last word (i = n-1) starts at outAt; total span ≈ 14 frames.
  const exitStep = n > 1 ? Math.max(1, Math.round(6 / (n - 1))) : 0;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: '0.26em',
        letterSpacing: `${(1 - line) * 0.055}em`,
        transform: `scale(${1.035 - 0.035 * line})`,
        ...style,
      }}
    >
      {words.map((word, i) => {
        // Deterministic per-word personality: no two words land the same.
        const r1 = random(`k2${word}${i}`);
        const r2 = random(`k2x${word}${i}`);
        const damping = 13 + r1 * 2; // 13–15
        const stiffness = 150 + r2 * 40; // 150–190
        const s = spring({ frame: frame - delay - i * stagger, fps, config: { damping, stiffness } });
        const rot = (1 - s) * rotate * (i % 2 === 0 ? 1 : -1) * (0.7 + r1 * 0.6);
        const e =
          outAt == null
            ? 0
            : interpolate(frame, [outAt + (n - 1 - i) * exitStep, outAt + (n - 1 - i) * exitStep + 8], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.5, 0, 0.75, 0),
              });
        return (
          <span key={i} style={{ overflow: 'hidden', display: 'inline-block', padding: '0.07em 0' }}>
            <span
              style={{
                display: 'inline-block',
                transformOrigin: '50% 100%',
                transform: `translateY(${(1 - s) * 115}%) translateY(${e * 26}px) rotate(${rot}deg) scale(${1.18 - 0.18 * s})`,
                filter: `blur(${Math.max(0, (1 - s) * 7) + e * 6}px)`,
                opacity: 1 - e,
                color: accent.includes(i) ? accentColor : undefined,
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/**
 * Single big word / short line that strikes in like a classic AE slam:
 * per word, scale 1.7 → 0.97 over ~10 frames with hard-out easing
 * (blur 18 → 0, opacity 0 → 1), then a subtle 2-frame overshoot settle
 * back to scale 1. A soft olive shadow fades in after the strike.
 * `outAt` triggers a quick blur/fade/pop exit (~12 frames).
 */
export const Slam: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  color?: string;
  accent?: number[];
  accentColor?: string;
  outAt?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, size = 160, color = L.text, accent = [], accentColor = L.accent, outAt, style }) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  const exit =
    outAt == null
      ? 0
      : interpolate(frame, [outAt, outAt + 12], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.5, 0, 0.75, 0),
        });
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: '0.22em',
        fontFamily: INTER,
        fontSize: size,
        fontWeight: 800,
        lineHeight: 1.1,
        color,
        opacity: 1 - exit,
        filter: `blur(${exit * 10}px)`,
        transform: `scale(${1 + exit * 0.06})`,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const f = frame - delay - i * 3;
        const hit = interpolate(f, [0, 10], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });
        const settle = interpolate(f, [10, 12], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const scale = f <= 10 ? interpolate(hit, [0, 1], [1.7, 0.97]) : interpolate(settle, [0, 1], [0.97, 1]);
        const shadow = interpolate(f, [12, 24], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `scale(${scale})`,
              filter: `blur(${(1 - hit) * 18}px)`,
              opacity: hit,
              color: accent.includes(i) ? accentColor : undefined,
              textShadow: `0 10px 30px rgba(35,38,20,${0.25 * shadow})`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Per-character cascade for a short sign-off line (e.g. "Settle.").
 * Each char rises 0.9em → 0 with a punchy overshoot spring
 * (damping 11, stiffness 210), de-blurs 6px → 0 and fades in.
 * `accentFrom` (char index) switches the remaining chars to `accentColor`.
 * No exit — the sign-off is meant to stay on screen.
 */
export const Chars: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  color?: string;
  accentColor?: string;
  accentFrom?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, stagger = 2, color = L.text, accentColor = L.accent, accentFrom, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', whiteSpace: 'pre', ...style }}>
      {text.split('').map((ch, i) => {
        const c = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 11, stiffness: 210 } });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translateY(${(1 - c) * 0.9}em)`,
              filter: `blur(${Math.max(0, (1 - c) * 6)}px)`,
              opacity: Math.max(0, Math.min(1, c * 2)),
              color: accentFrom != null && i >= accentFrom ? accentColor : color,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};
