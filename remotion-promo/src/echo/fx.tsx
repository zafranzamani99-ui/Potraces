import React from 'react';
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { E } from './theme';
import { INTER } from '../font';

/* ================================================================== *
 * Echo v3 FX — plain white, Inter, lightning. Just the bolt (no circle).
 * ================================================================== */

/** Plain bolt glyph — the Echo icon, no circle, no padding. */
export const Bolt: React.FC<{ size: number; color?: string; glow?: string; style?: React.CSSProperties }> = ({
  size,
  color = E.deep,
  glow,
  style,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: glow, ...style }}>
    <path d="M13 2 L4.5 13.8 H10.6 L9.6 22 L19.5 9.6 H13.1 Z" fill={color} />
  </svg>
);

/* ---- lightning strike ---- */
const IMPACT_X = 540;
const IMPACT_Y = 980;

// deterministic jagged path from top to the impact point
const boltPath = (seedKey: string) => {
  const segs = 9;
  let d = `M ${IMPACT_X + (random(seedKey + 'x') - 0.5) * 60} -30`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = IMPACT_X + (random(`${seedKey}${i}`) - 0.5) * 150 * (1 - t * 0.5);
    const y = -30 + (IMPACT_Y + 30) * t;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
};

/** The hero moment: lightning strikes down to the ground, flash + rings + sparks. */
export const LightningStrike: React.FC<{ at?: number }> = ({ at = 0 }) => {
  const frame = useCurrentFrame();
  const f = frame - at;
  // draw fast (0-6), flicker + fade (6-34)
  const draw = interpolate(f, [0, 6], [2600, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flick = f < 6 ? 1 : interpolate(f, [6, 10, 14, 20, 34], [1, 0.45, 0.9, 0.4, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flash = interpolate(f, [6, 8, 20], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (f < 0) return null;
  return (
    <AbsoluteFill>
      {/* impact flash */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at ${IMPACT_X}px ${IMPACT_Y}px, ${E.flash} 0%, transparent 45%)`, opacity: flash }} />
      {/* the bolt */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: flick }}>
        <path d={boltPath('a')} fill="none" stroke={E.boltEdge} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={2600} strokeDashoffset={draw} style={{ filter: `drop-shadow(0 0 22px ${E.gold})` }} />
        <path d={boltPath('a')} fill="none" stroke={E.boltGold} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={2600} strokeDashoffset={draw} />
        <path d={boltPath('a')} fill="none" stroke={E.boltCore} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={2600} strokeDashoffset={draw} />
      </svg>
      {/* shockwave rings */}
      {[0, 1, 2].map((i) => {
        const rt = interpolate(f, [8 + i * 4, 34 + i * 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (rt <= 0 || rt >= 1) return null;
        return <div key={i} style={{ position: 'absolute', left: IMPACT_X, top: IMPACT_Y, width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: '50%', border: `4px solid ${E.gold}`, transform: `scale(${1 + rt * 16})`, opacity: (1 - rt) * 0.6 }} />;
      })}
      {/* sparks flying up from impact */}
      {Array.from({ length: 24 }, (_, i) => {
        const st = (f - 6) / 30;
        if (st < 0 || st > 1) return null;
        const ang = -Math.PI / 2 + (random(`sp${i}`) - 0.5) * Math.PI * 1.1;
        const v = 300 + random(`sv${i}`) * 520;
        const x = Math.cos(ang) * v * st;
        const y = Math.sin(ang) * v * st + 900 * st * st;
        return <div key={i} style={{ position: 'absolute', left: IMPACT_X, top: IMPACT_Y, width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: 4, background: i % 2 ? E.gold : E.bronze, transform: `translate(${x}px, ${y}px)`, opacity: 1 - st }} />;
      })}
    </AbsoluteFill>
  );
};

/** Screen-shake wrapper (decaying) for the impact. */
export const Shake: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  const f = frame - at;
  const amp = f >= 0 && f < 16 ? interpolate(f, [0, 16], [16, 0]) : 0;
  const x = Math.sin(f * 2.1) * amp;
  const y = Math.cos(f * 1.7) * amp;
  return <div style={{ transform: `translate(${x}px, ${y}px)` }}>{children}</div>;
};

/* ---- kinetic type (playful, modern) ---- */

/** Word-by-word playful pop: each word overshoots up with a tiny alternating tilt. */
export const Kinetic: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  color?: string;
  stagger?: number;
  outAt?: number;
  weight?: number;
  accents?: number[];
  accentColor?: string;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, size = 90, color = E.text, stagger = 5, outAt, weight = 800, accents = [], accentColor = E.gold, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = outAt == null ? 0 : interpolate(frame, [outAt, outAt + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: size * 0.26, rowGap: size * 0.14, maxWidth: 960, transform: `translateY(${-30 * exit}px)`, opacity: 1 - exit, ...style }}>
      {text.split(' ').map((w, i) => {
        const s = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 11, stiffness: 150 } });
        return (
          <span key={i} style={{ display: 'inline-block', fontFamily: INTER, fontSize: size, fontWeight: weight, letterSpacing: -1.5, color: accents.includes(i) ? accentColor : color, lineHeight: 1.1, transform: `translateY(${interpolate(s, [0, 1], [46, 0])}px) scale(${interpolate(s, [0, 1], [0.6, 1])}) rotate(${interpolate(s, [0, 1], [i % 2 ? 5 : -5, 0])}deg)`, opacity: interpolate(frame - delay - i * stagger, [0, 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Snappy strike-in for the wordmark: big→1, blur→sharp, quick. */
export const StrikeIn: React.FC<{ text: string; delay?: number; size?: number; color?: string; style?: React.CSSProperties }> = ({
  text,
  delay = 0,
  size = 150,
  color = E.deep,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 200 } });
  const blur = interpolate(frame - delay, [0, 7], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ fontFamily: INTER, fontSize: size, fontWeight: 900, letterSpacing: -3, color, textAlign: 'center', transform: `scale(${interpolate(s, [0, 1], [1.6, 1])})`, filter: `blur(${blur}px)`, opacity: interpolate(frame - delay, [0, 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), ...style }}>
      {text}
    </div>
  );
};

/** Colored uppercase kicker. */
export const Kicker: React.FC<{ text: string; color: string; delay?: number }> = ({ text, color, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  return (
    <div style={{ fontFamily: INTER, fontSize: 28, fontWeight: 800, letterSpacing: 6, color, textTransform: 'uppercase', opacity: s, transform: `translateY(${(1 - s) * 12}px)`, textAlign: 'center' }}>{text}</div>
  );
};

export const TypingDots: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const f = frame - delay;
  if (f < 0) return null;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '20px 24px', background: E.card, borderRadius: 22, borderTopLeftRadius: 6, width: 'fit-content', boxShadow: E.shadow }}>
      {[0, 1, 2].map((i) => <div key={i} style={{ width: 13, height: 13, borderRadius: 7, background: E.olive, transform: `translateY(${Math.sin((f / 60) * Math.PI * 2 * 1.6 + i * 0.9) * 6}px)` }} />)}
    </div>
  );
};

export const StreamText: React.FC<{ text: string; delay?: number; cps?: number; size?: number; style?: React.CSSProperties }> = ({
  text,
  delay = 0,
  cps = 34,
  size = 40,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = Math.floor(interpolate(frame, [delay, delay + (text.length * fps) / cps], [0, text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const done = shown >= text.length;
  const parts = text.slice(0, shown).split(/(RM\s?[\d,]+(?:\.\d{2})?|\d+%)/g);
  return (
    <span style={{ fontFamily: INTER, fontSize: size, color: E.text, lineHeight: 1.42, fontWeight: 500, ...style }}>
      {parts.map((p, i) => (/^RM/.test(p) ? <span key={i} style={{ color: E.bronze, fontWeight: 800 }}>{p}</span> : /^\d+%$/.test(p) ? <span key={i} style={{ color: E.olive, fontWeight: 800 }}>{p}</span> : <span key={i}>{p}</span>))}
      {!done && shown > 0 ? <span style={{ color: E.gold }}>▌</span> : null}
    </span>
  );
};

export const Bubble: React.FC<{ mine?: boolean; delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ mine, delay = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 17, stiffness: 180 } });
  return (
    <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', background: mine ? E.userBubble : E.card, color: mine ? E.onDark : E.text, fontFamily: INTER, fontSize: 40, fontWeight: 500, padding: '22px 28px', borderRadius: 26, borderBottomRightRadius: mine ? 6 : 26, borderBottomLeftRadius: mine ? 26 : 6, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [22, 0])}px) scale(${interpolate(s, [0, 1], [0.95, 1])})`, boxShadow: mine ? '0 12px 30px rgba(20,20,16,0.22)' : E.shadow, ...style }}>
      {children}
    </div>
  );
};

/** Chat avatar = the bolt only, no circle. */
export const BoltAvatar: React.FC<{ size?: number }> = ({ size = 54 }) => {
  const frame = useCurrentFrame();
  const p = (Math.sin(frame / 12) + 1) / 2;
  return <Bolt size={size} color={E.gold} glow={`drop-shadow(0 0 ${5 + p * 6}px ${E.gold})`} />;
};

export const Chip: React.FC<{ label: string; amount: string; delay?: number; tapAt?: number; kind?: string; big?: boolean }> = ({ label, amount, delay = 0, tapAt, kind = 'went out', big }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 190 } });
  const confirmed = tapAt != null && frame >= tapAt;
  const conf = spring({ frame: frame - (tapAt ?? 1e9), fps, config: { damping: 12, stiffness: 210 } });
  const k = big ? 1.3 : 1;
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 15 * k, background: confirmed ? E.olive : E.card, border: `2px solid ${E.olive}`, borderRadius: 18 * k, padding: `${14 * k}px ${20 * k}px`, fontFamily: INTER, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px) scale(${confirmed ? interpolate(conf, [0, 0.5, 1], [1, 1.06, 1]) : 1})`, boxShadow: E.shadow }}>
      <div style={{ width: 32 * k, height: 32 * k, borderRadius: 16 * k, border: `2px solid ${confirmed ? '#fff' : E.olive}`, background: confirmed ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: E.olive, fontWeight: 900, fontSize: 20 * k }}>{confirmed ? '✓' : ''}</div>
      <div>
        <div style={{ fontSize: 32 * k, fontWeight: 800, color: confirmed ? '#fff' : E.text }}>{label}</div>
        <div style={{ fontSize: 24 * k, fontWeight: 600, color: confirmed ? 'rgba(255,255,255,0.85)' : E.textSoft, marginTop: 2 }}>{confirmed ? kind : 'tap to confirm'} · {amount}</div>
      </div>
    </div>
  );
};

export const Waveform: React.FC<{ bars?: number; width?: number }> = ({ bars = 40, width = 640 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const colors = [E.olive, E.gold, E.bronze];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 150, width }}>
      {Array.from({ length: bars }, (_, i) => <div key={i} style={{ flex: 1, height: 12 + Math.abs(Math.sin(t * 6 + i * 0.5) * Math.sin(t * 2.3 + i)) * 120 * (0.5 + 0.5 * random(`wf${i}`)), borderRadius: 4, background: colors[i % 3] }} />)}
    </div>
  );
};

export const Watermark: React.FC = () => (
  <div style={{ position: 'absolute', bottom: 58, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 100, opacity: 0.6 }}>
    <Bolt size={26} color={E.bronze} />
    <span style={{ fontFamily: INTER, fontSize: 30, fontWeight: 700, letterSpacing: 1, color: E.deep }}>jejakbaki.my</span>
  </div>
);

/** Plain white backdrop — no gradient. */
export const EchoBackdrop: React.FC = () => <AbsoluteFill style={{ background: E.bg }} />;
