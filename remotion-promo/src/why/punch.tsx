import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

/* ================================================================== *
 * Punch — the contoh1 caption grammar: neutral grotesque, per-word
 * hard pops, tight cadence. No blur, no bars, no springs — just speed.
 * ================================================================== */

const GROTESQUE = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export const Punch: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  size?: number;
  weight?: number;
  color?: string;
  accent?: number[];
  accentColor?: string;
  align?: 'center' | 'left';
  spacing?: number;
  style?: React.CSSProperties;
}> = ({
  text,
  delay = 0,
  stagger = 7,
  size = 52,
  weight = 800,
  color = '#FFFFFF',
  accent = [],
  accentColor = '#D9BD55',
  align = 'center',
  spacing = -1,
  style,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        columnGap: '0.24em',
        fontFamily: GROTESQUE,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: spacing,
        lineHeight: 1.14,
        ...style,
      }}
    >
      {text.split(' ').map((w, i) => {
        const at = delay + i * stagger;
        const o = interpolate(frame, [at, at + 2], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const pop = interpolate(frame, [at, at + 6], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: o,
              transform: `scale(${interpolate(pop, [0, 1], [1.16, 1])}) translateY(${interpolate(pop, [0, 1], [9, 0])}px)`,
              color: accent.includes(i) ? accentColor : color,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** PunchOut — the line exits fast, hard cut feel (2 frames). */
export const PunchSeq: React.FC<{
  text: string;
  at: number;
  dur?: number;
  size?: number;
  weight?: number;
  color?: string;
  accent?: number[];
  accentColor?: string;
  align?: 'center' | 'left';
  style?: React.CSSProperties;
}> = ({ text, at, dur = 90, size, weight, color, accent, accentColor, align, style }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [at + dur, at + dur + 3], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (frame < at || frame > at + dur + 4) return null;
  return (
    <div style={{ opacity: 1 - out, transform: `translateY(${-14 * out}px)`, ...style }}>
      <Punch text={text} delay={at} size={size} weight={weight} color={color} accent={accent} accentColor={accentColor} align={align} />
    </div>
  );
};
