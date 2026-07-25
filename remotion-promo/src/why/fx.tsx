import React from 'react';
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { BlockReveal, In } from '../debt4/type';

/* ================================================================== *
 * WHY — documentary essay kit (contoh1 grammar):
 *  full-bleed footage + scrim + small phrase → GIANT keyword,
 *  flat stat interstitials with source stamps.
 * ================================================================== */

/** Full-bleed stock image, slow push, cinematic scrim. */
export const ImgBeat: React.FC<{
  src: string;
  scrim?: number;
  children?: React.ReactNode;
}> = ({ src, scrim = 0.55, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = frame / Math.max(1, durationInFrames);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0B0B09' }}>
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${1.06 + 0.1 * p}) translateY(${-14 * p}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, rgba(8,8,6,${scrim * 0.5}) 0%, rgba(8,8,6,${scrim * 0.2}) 38%, rgba(8,8,6,${scrim}) 100%)`,
        }}
      />
      <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  );
};

/** Small phrase over footage — white, quiet. */
export const Phrase: React.FC<{ delay?: number; children: string; style?: React.CSSProperties }> = ({
  delay = 0,
  children,
  style,
}) => (
  <BlockReveal
    text={children}
    delay={delay}
    size={46}
    weight={600}
    color="rgba(255,255,255,0.92)"
    accentColor="#D9BD55"
    style={{ letterSpacing: 0, ...style }}
  />
);

/** Giant keyword over footage. */
export const Giant: React.FC<{
  delay?: number;
  children: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, size = 150, color = '#FFFFFF', style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 160 } });
  return (
    <div
      style={{
        fontFamily: INTER,
        fontSize: size,
        fontWeight: 900,
        letterSpacing: -4,
        color,
        lineHeight: 1,
        opacity: s,
        transform: `scale(${interpolate(s, [0, 1], [1.35, 1])})`,
        filter: `blur(${(1 - s) * 10}px)`,
        textShadow: '0 12px 44px rgba(0,0,0,0.5)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Flat stat interstitial — the credibility card. */
export const StatCard: React.FC<{
  at?: number;
  label: string;
  stat: string;
  sub: string;
  source: string;
  statSize?: number;
}> = ({ at = 0, label, stat, sub, source, statSize = 190 }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `linear-gradient(180deg, #FFFFFF 0%, #EFF1E8 100%)`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 18,
      fontFamily: INTER,
    }}
  >
    <BlockReveal text={label} delay={at + 4} size={44} weight={700} color={L.textSoft} style={{ letterSpacing: 0 }} />
    <Giant delay={at + 16} size={statSize} color={L.accent} style={{ textShadow: 'none' }}>
      {stat}
    </Giant>
    <BlockReveal text={sub} delay={at + 30} size={46} weight={700} color={L.text} accentColor={L.accent} style={{ letterSpacing: 0 }} />
    <In delay={at + 44}>
      <div style={{ marginTop: 26, borderRadius: 999, border: `1.5px solid ${L.line}`, padding: '10px 26px', fontSize: 24, fontWeight: 700, color: L.textFaint, letterSpacing: 1 }}>
        {source}
      </div>
    </In>
  </div>
);

/** Photo caption block (bottom-left stack). */
export const CaptionBlock: React.FC<{ children: React.ReactNode; center?: boolean }> = ({ children, center }) => (
  <div
    style={{
      position: 'absolute',
      left: 70,
      right: 70,
      bottom: 150,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      alignItems: center ? 'center' : 'flex-start',
    }}
  >
    {children}
  </div>
);

/** Fade-to-black beat ender. */
export const FadeOut: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.5, 0, 0.75, 0),
  });
  return <div style={{ position: 'absolute', inset: 0, background: '#0B0B09', opacity: o }} />;
};
