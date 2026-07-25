import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';

/* ================================================================== *
 * Paper type system — signature look:
 *  BlockReveal — a solid bar sweeps across each word; the word exists
 *   only after the bar passes. Editorial, punchy, NOT the MaskRise
 *   look and NOT generic springy AI type.
 *  Rule — minimal lower-third caption: thin olive rule + quiet text.
 *  Scribble — hand-drawn circle/underline emphasis.
 * ================================================================== */

const BAR_EASE = Easing.bezier(0.65, 0, 0.35, 1);

/** One word with its sweeping bar. */
const Word: React.FC<{
  w: string;
  at: number;
  accent: boolean;
  fontSize: number;
  weight: number;
  color: string;
  accentColor: string;
}> = ({ w, at, accent, fontSize, weight, color, accentColor }) => {
  const frame = useCurrentFrame();
  const cover = interpolate(frame, [at, at + 7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: BAR_EASE,
  });
  const uncover = interpolate(frame, [at + 8, at + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: BAR_EASE,
  });
  const visible = frame >= at + 8 ? 1 : 0;
  const lift = interpolate(frame, [at + 8, at + 18], [0.14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <span style={{ position: 'relative', display: 'inline-block', padding: '0 0.04em' }}>
      {/* the word — hidden until the bar has passed */}
      <span
        style={{
          display: 'inline-block',
          opacity: visible,
          transform: `translateY(${lift}em)`,
          color: accent ? accentColor : color,
          fontWeight: weight,
        }}
      >
        {w}
      </span>
      {/* the sweeping bar */}
      {frame >= at && frame < at + 16 ? (
        <span
          style={{
            position: 'absolute',
            left: '-0.04em',
            right: '-0.04em',
            top: '50%',
            height: '0.74em',
            transform: `translateY(-50%) skewX(-8deg) scaleX(${cover - uncover})`,
            transformOrigin: uncover > 0 ? 'right center' : 'left center',
            background: accent ? accentColor : 'rgba(23,23,15,0.92)',
          }}
        />
      ) : null}
    </span>
  );
};

/** BlockReveal — per-word highlighter swipe. `accent`: word indices colored. */
export const BlockReveal: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  outAt?: number;
  accent?: number[];
  accentColor?: string;
  size?: number;
  weight?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({
  text,
  delay = 0,
  stagger = 6,
  outAt,
  accent = [],
  accentColor = L.accent,
  size = 84,
  weight = 800,
  color = L.text,
  style,
}) => {
  const frame = useCurrentFrame();
  const exit =
    outAt == null
      ? 0
      : interpolate(frame, [outAt, outAt + 12], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.5, 0, 0.75, 0),
        });
  const words = text.split(' ');
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: '0.24em',
        fontFamily: INTER,
        fontSize: size,
        letterSpacing: -2,
        lineHeight: 1.15,
        opacity: 1 - exit,
        transform: `translateY(${-30 * exit}px)`,
        filter: `blur(${exit * 6}px)`,
        ...style,
      }}
    >
      {words.map((w, i) => (
        <Word key={i} w={w} at={delay + i * stagger} accent={accent.includes(i)} fontSize={size} weight={weight} color={color} accentColor={accentColor} />
      ))}
    </div>
  );
};

/** Rise — the classic masked word-rise (main-promo look): words rise out of
 * an overflow mask with tracking-in + scale settle, gentle exit. Calmer than
 * BlockReveal — no bars, nothing scattered. */
export const Rise: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  outAt?: number;
  accent?: number[];
  accentColor?: string;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, stagger = 4, outAt, accent = [], accentColor = L.accent, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const line = spring({ frame: frame - delay, fps, config: { damping: 26, stiffness: 90 } });
  const exit =
    outAt == null
      ? 0
      : interpolate(frame, [outAt, outAt + 12], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: '0.26em',
        letterSpacing: `${(1 - line) * 0.05}em`,
        transform: `scale(${1.03 - 0.03 * line}) translateY(${-26 * exit}px)`,
        opacity: 1 - exit,
        ...style,
      }}
    >
      {text.split(' ').map((word, i) => {
        const s = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 24, stiffness: 110 } });
        return (
          <span key={i} style={{ overflow: 'hidden', display: 'inline-block', padding: '0.06em 0' }}>
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - s) * 112}%)`,
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

/** Rule — quiet lower-third caption: thin olive rule + text, auto-exit. */
export const Rule: React.FC<{ delay?: number; children: string; accent?: number[] }> = ({
  delay = 0,
  children,
  accent = [],
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const line = interpolate(frame, [delay, delay + 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const exit = interpolate(frame, [durationInFrames - 16, durationInFrames - 4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        bottom: 118,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        zIndex: 70,
        opacity: 1 - exit,
        transform: `translateY(${(1 - line) * 16 - exit * 22}px)`,
      }}
    >
      <div style={{ width: 56 * line, height: 4, borderRadius: 2, background: L.accent }} />
      <div style={{ fontFamily: INTER, fontSize: 46, fontWeight: 700, color: L.textSoft, letterSpacing: 0.2, opacity: line, textAlign: 'center' }}>
        {children.split(' ').map((w, i) => (
          <span key={i} style={{ color: accent.includes(i) ? L.accent : undefined, fontWeight: accent.includes(i) ? 800 : 700 }}>
            {w}{' '}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Scribble — hand-drawn ellipse that draws itself around children. */
export const Scribble: React.FC<{
  at: number;
  w: number;
  h: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ at, w, h, color = L.accent, style }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  });
  const per = 2 * (w + h) * 1.06;
  if (frame < at) return null;
  return (
    <svg width={w} height={h} style={{ position: 'absolute', overflow: 'visible', ...style }}>
      <path
        d={`M ${w * 0.06} ${h * 0.55}
           C ${w * 0.02} ${h * 0.18}, ${w * 0.3} ${h * -0.02}, ${w * 0.62} ${h * 0.03}
           C ${w * 0.9} ${h * 0.08}, ${w * 1.02} ${h * 0.32}, ${w * 0.97} ${h * 0.6}
           C ${w * 0.92} ${h * 0.88}, ${w * 0.6} ${h * 1.0}, ${w * 0.32} ${h * 0.95}
           C ${w * 0.12} ${h * 0.91}, ${w * 0.03} ${h * 0.75}, ${w * 0.06} ${h * 0.55}`}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={per}
        strokeDashoffset={per * (1 - p)}
      />
    </svg>
  );
};

/** Hand-drawn underline that draws itself (shared emphasis mark). */
export const Underline: React.FC<{ w: number; at: [number, number]; color?: string }> = ({ w, at, color = L.accent }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, at, [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });
  return (
    <svg width={w} height={14} style={{ display: 'block', overflow: 'visible' }}>
      <path d={`M 4 8 Q ${w * 0.3} 1 ${w * 0.51} 7 T ${w - 4} 6`} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={w + 14} strokeDashoffset={(w + 14) * (1 - p)} />
    </svg>
  );
};

/** CountUp (eased, tabular). */
export const CountUp: React.FC<{
  to: number;
  from?: number;
  delay?: number;
  dur?: number;
  fmt?: (v: number) => string;
  style?: React.CSSProperties;
}> = ({ to, from = 0, delay = 0, dur = 46, fmt, style }) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [delay, delay + dur], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{fmt ? fmt(v) : Math.round(v).toString()}</span>;
};

/** In — quick rise-in for blocks (v7 tempo). */
export const In: React.FC<{ delay?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  y = 18,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 230 } });
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * y}px) scale(${0.975 + 0.025 * s})`, ...style }}>
      {children}
    </div>
  );
};

/** Ripple — tap feedback ring. */
export const Ripple: React.FC<{ at: number; x: number; y: number; size?: number }> = ({ at, x, y, size = 110 }) => {
  const frame = useCurrentFrame();
  const f = frame - at;
  if (f < 0 || f > 26) return null;
  const p = f / 26;
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none', zIndex: 60 }}>
      <div
        style={{
          position: 'absolute',
          left: -size / 2,
          top: -size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          border: `3px solid ${L.accent}`,
          transform: `scale(${0.2 + p * 1.4})`,
          opacity: (1 - p) * 0.85,
        }}
      />
      <div style={{ position: 'absolute', left: -9, top: -9, width: 18, height: 18, borderRadius: 9, background: L.accent, opacity: 1 - p }} />
    </div>
  );
};
