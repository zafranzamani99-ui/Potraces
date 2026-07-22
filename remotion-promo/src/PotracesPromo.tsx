import React from 'react';
import {
  AbsoluteFill,
  Series,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { C, FONT, NEU_RAISED } from './theme';

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

// Fade + rise in, Apple-style: high damping = smooth, no bounce.
const FadeUp: React.FC<{
  delay?: number;
  y?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, y = 48, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [y, 0])}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// Very slow olive glow drifting behind everything — gives the frame life.
const AmbientGlow: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const x = interpolate(frame, [0, durationInFrames], [-120, 120]);
  const y = interpolate(frame, [0, durationInFrames], [80, -80]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(600px 600px at ${540 + x}px ${760 + y}px, ${C.accent}22, transparent 70%)`,
      }}
    />
  );
};

const ringgit = (n: number) =>
  new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(n);

/* ------------------------------------------------------------------ *
 * Scene 1 — Wordmark intro
 * ------------------------------------------------------------------ */
const Intro: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 28 }}>
    <FadeUp delay={4}>
      <div
        style={{
          width: 132,
          height: 132,
          borderRadius: 34,
          background: C.surface,
          boxShadow: NEU_RAISED,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 74,
          color: C.accent,
          fontWeight: 800,
          fontFamily: FONT,
        }}
      >
        P
      </div>
    </FadeUp>
    <FadeUp delay={14}>
      <div style={{ fontFamily: FONT, fontSize: 92, fontWeight: 800, color: C.textPrimary, letterSpacing: -2 }}>
        Potraces
      </div>
    </FadeUp>
    <FadeUp delay={24}>
      <div style={{ fontFamily: FONT, fontSize: 38, color: C.textSecondary, fontWeight: 500 }}>
        Duit under control.
      </div>
    </FadeUp>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ *
 * Scene 2 — Balance count-up card
 * ------------------------------------------------------------------ */
const Balance: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const value = interpolate(count, [0, 1], [0, 12480.5]);

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 90 }}>
      <FadeUp delay={2} style={{ width: '100%' }}>
        <div
          style={{
            background: C.surface,
            borderRadius: 40,
            boxShadow: NEU_RAISED,
            padding: '72px 64px',
            fontFamily: FONT,
          }}
        >
          <div style={{ fontSize: 32, letterSpacing: 4, color: C.textMuted, fontWeight: 600 }}>
            TOTAL BALANCE
          </div>
          <div
            style={{
              fontSize: 120,
              fontWeight: 800,
              color: C.textPrimary,
              marginTop: 18,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: -3,
            }}
          >
            {ringgit(value)}
          </div>
          <FadeUp delay={30}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 30,
                background: `${C.accent}22`,
                color: C.accent,
                fontSize: 34,
                fontWeight: 700,
                padding: '14px 26px',
                borderRadius: 999,
              }}
            >
              ▲ {ringgit(1240)} kept this month
            </div>
          </FadeUp>
        </div>
      </FadeUp>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ *
 * Scene 3 — Feature rows
 * ------------------------------------------------------------------ */
const FEATURES = [
  { glyph: '👛', label: 'Wallets', sub: 'Every ringgit, every account' },
  { glyph: '🎯', label: 'Goals', sub: 'Save toward what matters' },
  { glyph: '📊', label: 'Budget', sub: 'Know before you overspend' },
  { glyph: '✦', label: 'Echo AI', sub: 'Just ask, in your own words' },
];

const Features: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: 'center', padding: 90, gap: 30 }}>
    <FadeUp delay={2}>
      <div style={{ fontFamily: FONT, fontSize: 54, fontWeight: 800, color: C.textPrimary, marginBottom: 20, whiteSpace: 'pre-line' }}>
        One app.{'\n'}Whole money picture.
      </div>
    </FadeUp>
    {FEATURES.map((f, i) => (
      <FadeUp key={f.label} delay={12 + i * 10}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 30,
            background: C.surface,
            borderRadius: 30,
            boxShadow: NEU_RAISED,
            padding: '34px 40px',
            fontFamily: FONT,
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 24,
              background: `${C.accent}1f`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              color: C.accent,
            }}
          >
            {f.glyph}
          </div>
          <div>
            <div style={{ fontSize: 46, fontWeight: 700, color: C.textPrimary }}>{f.label}</div>
            <div style={{ fontSize: 32, color: C.textSecondary, marginTop: 6 }}>{f.sub}</div>
          </div>
        </div>
      </FadeUp>
    ))}
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ *
 * Scene 4 — Echo chat + CTA
 * ------------------------------------------------------------------ */
const Bubble: React.FC<{ delay: number; mine?: boolean; children: React.ReactNode }> = ({
  delay,
  mine,
  children,
}) => (
  <FadeUp delay={delay} y={30} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
    <div
      style={{
        fontFamily: FONT,
        fontSize: 38,
        lineHeight: 1.35,
        color: mine ? C.background : C.textPrimary,
        background: mine ? C.accent : C.surface,
        boxShadow: mine ? undefined : NEU_RAISED,
        padding: '26px 34px',
        borderRadius: 30,
        borderBottomRightRadius: mine ? 8 : 30,
        borderBottomLeftRadius: mine ? 30 : 8,
        fontWeight: mine ? 600 : 500,
      }}
    >
      {children}
    </div>
  </FadeUp>
);

const Echo: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: 'center', padding: 90, gap: 26 }}>
    <FadeUp delay={2}>
      <div style={{ fontFamily: FONT, fontSize: 34, letterSpacing: 3, color: C.accent, fontWeight: 700, marginBottom: 16 }}>
        ✦ ECHO AI
      </div>
    </FadeUp>
    <Bubble delay={10} mine>
      Berapa aku spend makan bulan ni?
    </Bubble>
    <Bubble delay={30}>
      RM420 kau belanja makan 🍜 — 18% duit kau bulan ni. Nak aku set limit?
    </Bubble>
    <FadeUp delay={58} style={{ marginTop: 40 }}>
      <div style={{ fontFamily: FONT, textAlign: 'center' }}>
        <div style={{ fontSize: 70, fontWeight: 800, color: C.textPrimary, letterSpacing: -1.5 }}>
          Potraces
        </div>
        <div style={{ fontSize: 36, color: C.textSecondary, marginTop: 10 }}>
          Track. Save. Kept.
        </div>
      </div>
    </FadeUp>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ *
 * Root composition
 * ------------------------------------------------------------------ */
export const PotracesPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.background }}>
      <AmbientGlow />
      <Series>
        <Series.Sequence durationInFrames={75}>
          <Intro />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <Balance />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <Features />
        </Series.Sequence>
        <Series.Sequence durationInFrames={75}>
          <Echo />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
