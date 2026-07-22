import React from 'react';
import {
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { C } from './theme';

/* ================================================================== *
 * FX library — every effect frame-driven, zero CSS animation clocks.
 * Named after the researched techniques (Klarden/Kinetics/MagicUI…).
 * ================================================================== */

/** Workhorse entrance: blur(10) + offset + fade → crisp (MagicUI Blur Fade). */
export const BlurFade: React.FC<{
  delay?: number;
  y?: number;
  blur?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, y = 24, blur = 10, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  return (
    <div
      style={{
        opacity: s,
        filter: `blur(${(1 - s) * blur}px)`,
        transform: `translateY(${(1 - s) * y}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Frame-0 pattern interrupt: oversized + blurred slam-to-focus + landing jitter. */
export const ScaleBlurPunch: React.FC<{
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay;
  const s = spring({ frame: f, fps, config: { damping: 16, stiffness: 200 } });
  const blur = interpolate(f, [0, 9], [14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const jitter = interpolate(f, [9, 10, 11, 12], [0, 3, -2, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div style={{ position: 'relative', ...style }}>
      <div
        style={{
          transform: `scale(${interpolate(s, [0, 1], [1.35, 1])}) translateX(${jitter}px)`,
          filter: `blur(${blur}px)`,
          opacity: interpolate(f, [0, 4], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** Full-screen 2-frame impact flash — place at scene root, gated on the landing frames. */
export const ImpactFlash: React.FC<{ at: number; color?: string }> = ({ at, color = C.gold }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 1, at + 3], [0, 0.14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: color, opacity: o, pointerEvents: 'none' }} />
  );
};

/** Kinetics Spring Pop-In: scale from 50% with visible overshoot + slight tip. */
export const SpringPop: React.FC<{
  delay?: number;
  rotate?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, rotate = -6, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay;
  const s = spring({ frame: f, fps, config: { damping: 10, stiffness: 140 } });
  return (
    <div
      style={{
        transform: `scale(${interpolate(s, [0, 1], [0.5, 1])}) rotate(${interpolate(s, [0, 1], [rotate, 0])}deg)`,
        opacity: interpolate(f, [0, 5], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Word-Cascade Rise: each word rises out of its own baseline mask. */
export const CascadeRise: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, stagger = 2, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.28em', ...style }}>
      {text.split(' ').map((word, i) => {
        const s = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: { damping: 14 },
        });
        return (
          <span key={i} style={{ overflow: 'hidden', display: 'inline-block' }}>
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${interpolate(s, [0, 1], [110, 0])}%)`,
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

/** Klarden Blur Reveal: per-word gaussian smudge → crisp, staggered. */
export const BlurRevealWords: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, stagger = 3, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.28em', ...style }}>
      {text.split(' ').map((word, i) => {
        const s = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: { damping: 200 },
        });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: s,
              filter: `blur(${interpolate(s, [0, 1], [12, 0])}px)`,
              transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px)`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Elastic Slide-In accent pill that snaps under a keyword with overshoot. */
export const ElasticPill: React.FC<{ delay?: number; style?: React.CSSProperties }> = ({
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 9, stiffness: 130 },
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: '-0.12em',
        right: '-0.12em',
        bottom: '0.02em',
        height: '0.34em',
        borderRadius: 999,
        background: C.accent,
        opacity: interpolate(s, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateX(${interpolate(s, [0, 1], [-160, 0])}px) scaleX(${interpolate(s, [0, 1], [0.3, 1])})`,
        transformOrigin: 'left center',
        zIndex: -1,
        ...style,
      }}
    />
  );
};

/** Single-pass metallic shine sweep across text (never loops — loop = skeleton loader). */
export const ShimmerText: React.FC<{
  text: string;
  delay?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, duration = 40, style }) => {
  const frame = useCurrentFrame();
  const pos = interpolate(frame, [delay, delay + duration], [100, -60], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        backgroundImage: `linear-gradient(110deg, ${C.textPrimary} 42%, ${C.gold} 50%, ${C.textPrimary} 58%)`,
        backgroundSize: '250% 100%',
        backgroundPositionX: `${pos}%`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** MagicUI Typing Animation: char-by-char with frame-modulo blinking caret. */
export const TypeText: React.FC<{
  text: string;
  delay?: number;
  framesPerChar?: number;
  caret?: boolean;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, framesPerChar = 1.4, caret = true, style }) => {
  const frame = useCurrentFrame();
  const shown = Math.floor(
    interpolate(frame, [delay, delay + text.length * framesPerChar], [0, text.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  const typing = shown > 0 && shown < text.length;
  const caretOn = typing || (caret && Math.floor(frame / 12) % 2 === 0 && frame < delay + text.length * framesPerChar + 20);
  return (
    <span style={style}>
      {text.slice(0, shown)}
      {shown > 0 && caretOn ? (
        <span style={{ color: C.accent, fontWeight: 400 }}>|</span>
      ) : null}
    </span>
  );
};

/** Slot-spin digit roll (NumberFlow look): columns spin and land exactly, staggered R→L. */
export const DigitRoll: React.FC<{
  value: string; // e.g. "12.00"
  delay?: number;
  digitHeight: number;
  style?: React.CSSProperties;
}> = ({ value, delay = 0, digitHeight, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = value.split('');
  const digitIdxs = chars.map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  return (
    <div style={{ display: 'flex', ...style }}>
      {chars.map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <span key={i} style={{ height: digitHeight, lineHeight: `${digitHeight}px` }}>
              {ch}
            </span>
          );
        }
        // rightmost digit settles last — stagger by reversed digit order
        const order = digitIdxs.indexOf(i);
        const s = spring({
          frame: frame - delay - order * 3,
          fps,
          config: { damping: 200 },
        });
        const target = parseInt(ch, 10);
        const offset = (target + (1 - s) * 20) % 10; // 2 full spins, lands exact
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              height: digitHeight,
              overflow: 'hidden',
              maskImage:
                'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
            }}
          >
            <span
              style={{
                display: 'block',
                transform: `translateY(${-offset * digitHeight}px)`,
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, j) => (
                <span key={j} style={{ display: 'block', height: digitHeight, lineHeight: `${digitHeight}px` }}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Cross-roll swap for a small counter ("9" → "10"), NumberFlow-style masked slide. */
export const SwapRoll: React.FC<{
  from: string;
  to: string;
  switchAt: number;
  height: number;
  style?: React.CSSProperties;
}> = ({ from, to, switchAt, height, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - switchAt, fps, config: { damping: 14 } });
  return (
    <span
      style={{
        display: 'inline-block',
        height,
        lineHeight: `${height}px`,
        overflow: 'hidden',
        position: 'relative',
        verticalAlign: 'bottom',
        ...style,
      }}
    >
      <span style={{ display: 'block', transform: `translateY(${-s * height}px)` }}>
        <span style={{ display: 'block', height, lineHeight: `${height}px` }}>{from}</span>
        <span style={{ display: 'block', height, lineHeight: `${height}px` }}>{to}</span>
      </span>
    </span>
  );
};

/** MagicUI Ripple: concentric rings born at center, expand + dissolve (QR = "scannable"). */
export const Ripple: React.FC<{ delay?: number; size?: number; color?: string }> = ({
  delay = 0,
  size = 500,
  color = C.accent,
}) => {
  const frame = useCurrentFrame();
  const period = 50;
  const rings = 4;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: rings }, (_, i) => {
        const f = frame - delay - i * (period / rings);
        if (f < 0) return null;
        const t = (f % period) / period;
        const scale = interpolate(t, [0, 1], [0.3, 2.1]);
        const opacity = interpolate(t, [0, 0.15, 1], [0, 0.3, 0]);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: '50%',
              border: `2px solid ${color}`,
              transform: `scale(${scale})`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};

/** Orbit-dots "thinking" loader — gold dots circling, gated to a frame window. */
export const OrbitDots: React.FC<{ from: number; to: number; size?: number }> = ({
  from,
  to,
  size = 44,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from || frame > to) return null;
  const fade = interpolate(frame, [from, from + 5, to - 5, to], [0, 1, 1, 0]);
  const R = size / 2;
  return (
    <div style={{ position: 'relative', width: size, height: size, opacity: fade }}>
      {[0, 1, 2].map((i) => {
        const angle = (frame / fps) * 2 * Math.PI * 1.1 + (i * 2 * Math.PI) / 3;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 10,
              height: 10,
              borderRadius: 5,
              background: C.gold,
              transform: `translate(${Math.cos(angle) * R - 5}px, ${Math.sin(angle) * R - 5}px)`,
            }}
          />
        );
      })}
    </div>
  );
};

/** Rotating conic glow border (uiverse premium-card frame + MagicUI Border Beam vibe). */
export const ConicGlowCard: React.FC<{
  radius?: number;
  speed?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ radius = 32, speed = 110, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const angle = ((frame / fps) * speed) % 360;
  const grad = `conic-gradient(from ${angle}deg, transparent 0%, ${C.gold} 10%, ${C.accent} 18%, transparent 32%)`;
  return (
    <div style={{ position: 'relative', ...style }}>
      <div
        style={{
          position: 'absolute',
          inset: -3,
          borderRadius: radius + 3,
          background: grad,
          filter: 'blur(14px)',
          opacity: 0.75,
        }}
      />
      <div style={{ position: 'absolute', inset: -2, borderRadius: radius + 2, background: grad }} />
      <div style={{ position: 'relative', borderRadius: radius, background: C.surface, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
};

/** Success tick: circle pops with overshoot, check stroke draws itself. */
export const TickDraw: React.FC<{ delay?: number; size?: number }> = ({ delay = 0, size = 140 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 140 } });
  const draw = spring({ frame: frame - delay - 5, fps, config: { damping: 200 } });
  const L = 90; // measured polyline length (approx, close enough at this scale)
  return (
    <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.4, 1])})`, opacity: pop }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill={C.accent} />
        <polyline
          points="28,52 44,67 73,37"
          fill="none"
          stroke="#fff"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={L}
          strokeDashoffset={L * (1 - draw)}
        />
      </svg>
    </div>
  );
};

/** Seeded deterministic confetti burst — ballistic math, renders identically every time. */
export const Confetti: React.FC<{ delay?: number; count?: number }> = ({
  delay = 0,
  count = 44,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame - delay) / fps;
  if (t < 0) return null;
  const colors = [C.gold, C.accent, C.bronze, '#FFFFFF'];
  const g = 1500;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: count }, (_, i) => {
        const ang = -Math.PI / 2 + (random(`ca${i}`) - 0.5) * Math.PI * 0.95;
        const v = 420 + random(`cv${i}`) * 520;
        const x = Math.cos(ang) * v * t;
        const y = Math.sin(ang) * v * t + 0.5 * g * t * t;
        const rot = (random(`cr${i}`) - 0.5) * 1300 * t;
        const life = 1.15;
        const opacity = interpolate(t, [life * 0.65, life], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const w = 8 + random(`cw${i}`) * 8;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '46%',
              width: w,
              height: w * 0.55,
              borderRadius: 2,
              background: colors[Math.floor(random(`cc${i}`) * colors.length)],
              transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};

/** Gold tap indicator — gives every fake "press" a visible cause. */
export const TapDot: React.FC<{ x: number; y: number; delay: number }> = ({ x, y, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay;
  if (f < 0 || f > 18) return null;
  const s = spring({ frame: f, fps, config: { damping: 12, stiffness: 200 } });
  const fade = interpolate(f, [10, 18], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 30,
        top: y - 30,
        width: 60,
        height: 60,
        borderRadius: 30,
        background: `${C.gold}55`,
        border: `2px solid ${C.gold}`,
        transform: `scale(${interpolate(s, [0, 1], [0.4, 1])})`,
        opacity: fade,
        zIndex: 50,
      }}
    />
  );
};

/** Press-pulse scale for a tapped button: dips to `depth` then springs back. */
export const usePressPulse = (tapFrame: number, depth = 0.06) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const down = spring({ frame: frame - tapFrame, fps, config: { damping: 200, stiffness: 400 } });
  const up = spring({ frame: frame - tapFrame - 6, fps, config: { damping: 14, stiffness: 200 } });
  const pulse = Math.max(0, down - up);
  return 1 - depth * pulse;
};

/** Deterministic fake DuitNow-style QR (seeded grid + finder squares). */
export const FakeQr: React.FC<{ size: number }> = ({ size }) => {
  const N = 21;
  const cell = size / N;
  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  return (
    <div style={{ width: size, height: size, background: '#fff', borderRadius: 12, padding: cell, boxSizing: 'content-box' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        {Array.from({ length: N * N }, (_, i) => {
          const r = Math.floor(i / N);
          const c = i % N;
          if (isFinder(r, c)) return null;
          if (random(`qr${r}-${c}`) < 0.52) return null;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: c * cell,
                top: r * cell,
                width: cell * 0.92,
                height: cell * 0.92,
                background: '#111',
              }}
            />
          );
        })}
        {[
          { l: 0, t: 0 },
          { l: (N - 7) * cell, t: 0 },
          { l: 0, t: (N - 7) * cell },
        ].map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p.l,
              top: p.t,
              width: 7 * cell,
              height: 7 * cell,
              border: `${cell}px solid #111`,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ position: 'absolute', inset: cell, background: '#111' }} />
          </div>
        ))}
      </div>
    </div>
  );
};
