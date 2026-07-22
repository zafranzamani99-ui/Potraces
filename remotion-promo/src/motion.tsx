import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { L } from './theme';
import { INTER } from './font';

/* ================================================================== *
 * v6 motion — the AE playbook, kept minimal:
 *  - MaskRise: words rise out of their own baseline mask, staggered,
 *    with tracking-in + scale settle (the Apple-keynote type move).
 *  - Every element EXITS (up + fade) — nothing just gets cut off.
 *  - PushIn: slow push on every held shot (the "moving hold").
 * Springs read fps from context → all timings are fps-independent.
 * ================================================================== */

/** Soft fade-up entrance for cards/blocks (kept from v4/v5). */
export const Rise: React.FC<{
  delay?: number;
  y?: number;
  blur?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, y = 34, blur = 6, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 30, mass: 1 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${(1 - s) * y}px) scale(${0.985 + 0.015 * s})`,
        filter: blur ? `blur(${(1 - s) * blur}px)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Masked kinetic type: each word rises from behind its baseline, staggered;
 * the whole line tracks in from slightly-wide and settles from 103% scale.
 * `outAt` (frames, local) animates the line UP and out — always exit.
 * `accent`: 0-based indices of words tinted olive.
 */
export const MaskRise: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  outAt?: number;
  accent?: number[];
  style?: React.CSSProperties;
}> = ({ text, delay = 0, stagger = 4, outAt, accent = [], style }) => {
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
        const s = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: { damping: 24, stiffness: 110 },
        });
        return (
          <span key={i} style={{ overflow: 'hidden', display: 'inline-block', padding: '0.06em 0' }}>
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - s) * 112}%)`,
                color: accent.includes(i) ? L.accent : undefined,
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

/** Moving hold: slow push-in across this Sequence's whole duration. Wrap every held shot. */
export const PushIn: React.FC<{ children: React.ReactNode; amount?: number }> = ({
  children,
  amount = 0.032,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = frame / Math.max(1, durationInFrames);
  return (
    <div style={{ transform: `scale(${1 + amount * p}) translateY(${-7 * p}px)` }}>{children}</div>
  );
};

/** Char-by-char type, calm cadence, olive caret. */
export const TypeText: React.FC<{
  text: string;
  delay?: number;
  cps?: number;
  caret?: boolean;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, cps = 26, caret = true, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const per = fps / cps;
  const shown = Math.floor(
    interpolate(frame, [delay, delay + text.length * per], [0, text.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  const done = shown >= text.length;
  return (
    <span style={style}>
      {text.slice(0, shown)}
      {caret && !done && shown > 0 ? <span style={{ color: L.accent, fontWeight: 400 }}>|</span> : null}
    </span>
  );
};

/** Calm count-up. */
export const CountUp: React.FC<{
  to: number;
  from?: number;
  delay?: number;
  fmt?: (v: number) => string;
  style?: React.CSSProperties;
}> = ({ to, from = 0, delay = 0, fmt, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 30 } });
  const v = from + (to - from) * s;
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{fmt ? fmt(v) : Math.round(v).toString()}</span>;
};

/** White-gradient backdrop; the warm blob drifts imperceptibly — the frame never dies. */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const x = 50 + Math.sin(t * 0.13) * 8;
  const y = -12 + Math.cos(t * 0.09) * 5;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${L.bg1} 0%, ${L.bg2} 100%)` }}>
      <div
        style={{
          position: 'absolute',
          top: `${y}%`,
          left: `${x}%`,
          transform: 'translateX(-50%)',
          width: 1300,
          height: 1000,
          background: 'radial-gradient(circle, rgba(79,81,4,0.05), transparent 62%)',
        }}
      />
    </AbsoluteFill>
  );
};

/** Persistent site watermark — bottom-center, every frame (matches the Echo promo). */
export const Watermark: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      bottom: 58,
      left: 0,
      right: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      zIndex: 100,
      opacity: 0.55,
    }}
  >
    <svg width={26} height={26} viewBox="0 0 24 24">
      <path d="M13 2 L4.5 13.8 H10.6 L9.6 22 L19.5 9.6 H13.1 Z" fill={L.accent} />
    </svg>
    <span style={{ fontFamily: INTER, fontSize: 30, fontWeight: 700, letterSpacing: 1, color: L.text }}>jejakbaki.my</span>
  </div>
);

/** One caption per beat — masked rise in, auto-exits before its Sequence ends. */
export const Caption: React.FC<{ delay?: number; children: string; accent?: number[] }> = ({
  delay = 0,
  children,
  accent = [],
}) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 120, textAlign: 'center' }}>
      <MaskRise
        text={children}
        delay={delay}
        stagger={3}
        outAt={durationInFrames - 14}
        accent={accent}
        style={{ fontFamily: INTER, fontSize: 47, fontWeight: 700, color: L.text, lineHeight: 1.25 }}
      />
    </div>
  );
};
