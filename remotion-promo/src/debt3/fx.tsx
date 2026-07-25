import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { KType2 } from './ktype2';

/* ================================================================== *
 * PAPER — white stage kit for real-screenshot storytelling.
 * LightStage (warm white + grain + vignette) · ShotCard (real app
 * screenshots, tilted + Ken Burns) · ScanLine (receipt scan sweep) ·
 * Ring / Underline (callouts) · KType (kinetic type, dark-on-white) ·
 * SweepL (soft light band on cuts) · Caption
 * ================================================================== */

/** Warm-white stage: soft gradient, one drifting olive blob, faint grain. */
export const LightStage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const x = 50 + Math.sin(t * 0.1) * 10;
  const y = 18 + Math.cos(t * 0.07) * 8;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #FFFFFF 0%, #EFF1E8 100%)` }}>
      <div
        style={{
          position: 'absolute',
          top: `${y}%`,
          left: `${x}%`,
          transform: 'translateX(-50%)',
          width: 1300,
          height: 1000,
          background: 'radial-gradient(circle, rgba(79,81,4,0.06), transparent 62%)',
        }}
      />
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.035, mixBlendMode: 'multiply' }}>
        <filter id="pgr">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(t * 6) % 10} />
        </filter>
        <rect width="100%" height="100%" filter="url(#pgr)" />
      </svg>
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 260px rgba(35,38,20,0.10)' }} />
    </AbsoluteFill>
  );
};

export const SHOT_W = 604; // screenshot card width (1179×2556 → 604×1309)
export const SHOT_H = 1309;

/** A real app screenshot, presented as a floating card with slow push-in + tilt.
 * Overlays (scanline, callouts) live INSIDE the Ken Burns transform — they stay
 * glued to the screenshot region they annotate. */
export const ShotCard: React.FC<{
  src: string;
  enterAt?: number;
  ry?: number;
  push?: number;
  children?: React.ReactNode; // overlays in card coords — transform-synced
}> = ({ src, enterAt = 0, ry = -7, push = 0.05, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame: frame - enterAt, fps, config: { damping: 24, stiffness: 100 } });
  const p = frame / Math.max(1, durationInFrames);
  const kenBurns = `scale(${1.03 + push * p}) translateY(${-10 * p}px)`;
  return (
    <div style={{ perspective: 1500 }}>
      <div
        style={{
          width: SHOT_W,
          height: SHOT_H,
          borderRadius: 46,
          overflow: 'hidden',
          position: 'relative',
          background: '#fff',
          border: `1px solid ${L.line}`,
          boxShadow: '0 50px 110px rgba(35,38,20,0.20), 0 14px 34px rgba(35,38,20,0.10)',
          transform: `rotateY(${ry}deg) rotateX(2deg) translateY(${(1 - enter) * 90}px) scale(${0.94 + enter * 0.06})`,
          opacity: enter,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, transform: kenBurns, transformOrigin: '50% 42%' }}>
          <Img
            src={staticFile(src)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          {children}
        </div>
      </div>
    </div>
  );
};

/** The AI scan sweep: glowing olive line travelling down the receipt, then flashing done. */
export const ScanLine: React.FC<{ from?: number; to?: number; doneAt?: number }> = ({
  from = 20,
  to = 110,
  doneAt = 140,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  });
  const done = interpolate(frame, [doneAt, doneAt + 8, doneAt + 22], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (frame < from) return null;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${interpolate(p, [0, 1], [14, 56])}%`,
          height: 5,
          background: `linear-gradient(90deg, transparent, ${L.accent}, transparent)`,
          boxShadow: `0 0 24px 6px rgba(79,81,4,0.45)`,
          opacity: frame < doneAt ? 1 : 0,
        }}
      />
      {/* done flash */}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(79,81,4,${0.14 * done})` }} />
    </>
  );
};

/** Callout ring that draws itself around a region of the screenshot (card coords). */
export const Ring: React.FC<{
  at: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}> = ({ at, x, y, w, h, color = L.accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 16, stiffness: 160 } });
  const pulse = frame > at + 20 ? 0.5 + 0.5 * Math.sin(frame / 9) : 0;
  if (frame < at) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: Math.min(28, h / 2),
        border: `5px solid ${color}`,
        boxShadow: `0 0 ${18 + pulse * 14}px rgba(79,81,4,0.4)`,
        opacity: s,
        transform: `scale(${interpolate(s, [0, 1], [1.25, 1])})`,
      }}
    />
  );
};

/** Hand-drawn underline sweep for emphasis. */
export const Underline: React.FC<{ at: number; x: number; y: number; w: number; color?: string }> = ({
  at,
  x,
  y,
  w,
  color = L.accent,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });
  if (frame < at) return null;
  return (
    <svg style={{ position: 'absolute', left: x, top: y, overflow: 'visible' }} width={w} height={16}>
      <path
        d={`M 2 10 Q ${w * 0.3} 2 ${w * 0.55} 9 T ${w - 2} 8`}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={w * 1.3}
        strokeDashoffset={w * 1.3 * (1 - p)}
      />
    </svg>
  );
};

/** Kinetic masked type — dark-on-white version. */
export const KType: React.FC<{
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
      : interpolate(frame, [outAt, outAt + 14], [0, 1], {
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
        columnGap: '0.26em',
        letterSpacing: `${(1 - line) * 0.06}em`,
        transform: `scale(${1.04 - 0.04 * line}) translateY(${-34 * exit}px)`,
        opacity: 1 - exit,
        filter: `blur(${(1 - line) * 5 + exit * 6}px)`,
        ...style,
      }}
    >
      {text.split(' ').map((word, i) => {
        const s = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 24, stiffness: 110 } });
        return (
          <span key={i} style={{ overflow: 'hidden', display: 'inline-block', padding: '0.07em 0' }}>
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - s) * 115}%)`,
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

/** Rise-in for blocks. */
export const In: React.FC<{ delay?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  y = 30,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 26, stiffness: 110 } });
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * y}px) scale(${0.97 + 0.03 * s})`, ...style }}>
      {children}
    </div>
  );
};

/** Soft light band sweeping across the frame at a cut. */
export const SweepL: React.FC<{ at: number; duration?: number }> = ({ at, duration = 22 }) => {
  const frame = useCurrentFrame();
  const f = frame - at;
  if (f < 0 || f > duration) return null;
  const p = interpolate(f, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });
  const x = interpolate(p, [0, 1], [-460, 1080 + 460]);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none', zIndex: 90 }}>
      <div
        style={{
          position: 'absolute',
          top: -200,
          bottom: -200,
          left: x,
          width: 420,
          transform: 'skewX(-14deg)',
          background: 'linear-gradient(90deg, transparent, rgba(79,81,4,0.10) 35%, rgba(255,255,255,0.85) 50%, rgba(79,81,4,0.10) 65%, transparent)',
          filter: 'blur(8px)',
        }}
      />
    </AbsoluteFill>
  );
};

/** Bottom caption — rich kinetic (KType2), auto-exit before its Sequence ends. */
export const Caption: React.FC<{ delay?: number; children: string; accent?: number[]; size?: number }> = ({
  delay = 0,
  children,
  accent = [],
  size = 46,
}) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 118, textAlign: 'center', zIndex: 70 }}>
      <KType2
        text={children}
        delay={delay}
        stagger={3}
        outAt={durationInFrames - 16}
        accent={accent}
        style={{ fontFamily: INTER, fontSize: size, fontWeight: 700, color: L.text, lineHeight: 1.25 }}
      />
    </div>
  );
};

/** Persistent watermark, dark on white. */
export const LightMark: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      bottom: 54,
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
    <svg width={24} height={24} viewBox="0 0 24 24">
      <path d="M13 2 L4.5 13.8 H10.6 L9.6 22 L19.5 9.6 H13.1 Z" fill={L.accent} />
    </svg>
    <span style={{ fontFamily: INTER, fontSize: 28, fontWeight: 700, letterSpacing: 1, color: L.text }}>jejakbaki.my</span>
  </div>
);
