import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { INTER } from '../font';
import { CountUp, In, Underline } from '../debt4/type';

/* ================================================================== *
 * ACT 1 · PROBLEM — full-bleed documentary photos, WHITE-OVERLAY stats.
 * Youngster + BNPL lead (user priority): BNPL → anak muda → muflis → 61%.
 * Voice-finish rule: each stat beat holds until its VO clip ends (+ tail).
 * Beats: s1 0–210 (dvo-18) · s2 210–480 (dvo-17) · s3 480–630 (dvo-16) ·
 * s4 630–810 (dvo-19)
 * ================================================================== */

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

type Stat = {
  at: number;
  dur: number;
  num: string;
  countTo?: number;
  countFmt?: (v: number) => string;
  label: string[];
  source: string;
  img: string;
  pos?: string;
};

const STATS: Stat[] = [
  {
    at: 0, dur: 218, num: '5.1 juta',
    label: ['rakyat Malaysia dah', 'terjebak BNPL.'], source: 'MOF 2025', img: 'stock/parcels.jpg',
  },
  {
    at: 218, dur: 170, num: '53,000', countTo: 53000, countFmt: (v) => `${Math.round(v).toLocaleString('en-US')}`,
    label: ['anak muda berhutang', 'RM 1.9 bilion.'], source: 'AKPK 2024', img: 'stock/shopping-bags.jpg',
  },
  {
    at: 388, dur: 138, num: '16', countTo: 16, countFmt: (v) => `${Math.round(v)}`,
    label: ['muflis', 'setiap hari.'], source: 'MdI', img: 'stock/bills-stack.jpg',
  },
  {
    at: 526, dur: 224, num: '61%', countTo: 61, countFmt: (v) => `${Math.round(v)}%`,
    label: ['tak mampu keluar RM 1,000', 'bila kecemasan.'], source: 'BNM 2024', img: 'stock/last-coin.jpg', pos: '35% center',
  },
];

const Photo: React.FC<{ img: string; at: number; dur: number; pos?: string }> = ({ img, at, dur, pos = 'center' }) => {
  const frame = useCurrentFrame();
  const f = frame - at;
  if (f < -4 || f > dur + 2) return null;
  const op = interpolate(f, [0, 10], [0, 1], CLAMP);
  const out = interpolate(f, [dur - 6, dur + 1], [1, 0], CLAMP);
  const zoom = interpolate(f, [0, dur], [1, 1.08], CLAMP);
  return (
    <AbsoluteFill style={{ opacity: op * out }}>
      <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, transform: `scale(${zoom})`, filter: 'saturate(0.85) contrast(1.06)' }} />
    </AbsoluteFill>
  );
};

const StatBeat: React.FC<{ s: Stat; kicker?: boolean }> = ({ s, kicker }) => {
  const frame = useCurrentFrame();
  const f = frame - s.at;
  if (f < 0 || f >= s.dur) return null;
  const pop = spring({ frame: f - 8, fps: 60, config: { damping: 13, stiffness: 260 } });
  const rule = interpolate(f, [4, 16], [0, 1], { ...CLAMP, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const exit = interpolate(f, [s.dur - 9, s.dur - 2], [0, 1], CLAMP);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 84px 330px' }}>
      <div style={{ opacity: 1 - exit, transform: `translateY(${-40 * exit}px)` }}>
        {kicker ? (
          <In delay={4} y={10}>
            <div style={{ fontFamily: INTER, fontSize: 26, fontWeight: 800, color: '#DEAB22', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 26, textShadow: '0 2px 14px rgba(0,0,0,0.45)' }}>
              realiti sekarang
            </div>
          </In>
        ) : null}
        <div style={{ width: 96 * rule, height: 6, borderRadius: 3, background: '#fff', marginBottom: 24 }} />
        <div
          style={{
            fontFamily: INTER,
            fontSize: 168,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: -7,
            lineHeight: 0.98,
            opacity: pop,
            transform: `scale(${interpolate(pop, [0, 1], [1.28, 1])})`,
            transformOrigin: 'left center',
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 6px 40px rgba(0,0,0,0.4)',
          }}
        >
          {s.countTo != null && s.countFmt ? <CountUp to={s.countTo} delay={10} dur={22} fmt={s.countFmt} /> : s.num}
        </div>
        <In delay={12} y={14}>
          <div style={{ fontFamily: INTER, fontSize: 46, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: -0.5, lineHeight: 1.22, marginTop: 24, textShadow: '0 3px 18px rgba(0,0,0,0.45)' }}>
            {s.label.map((ln, i) => (
              <div key={i}>{ln}</div>
            ))}
          </div>
        </In>
        <In delay={18} y={8}>
          <div style={{ fontFamily: INTER, fontSize: 21, fontWeight: 800, color: 'rgba(255,255,255,0.68)', letterSpacing: 3, marginTop: 24, textTransform: 'uppercase' }}>
            — {s.source}
          </div>
        </In>
      </div>
    </AbsoluteFill>
  );
};

export const Problem: React.FC = () => (
  <AbsoluteFill style={{ background: '#141410' }}>
    {STATS.map((s) => (
      <Photo key={s.img} img={s.img} at={s.at} dur={s.dur} pos={s.pos} />
    ))}
    {/* legibility scrims — bottom-heavy for the stat block, light up top */}
    <AbsoluteFill style={{ background: 'linear-gradient(8deg, rgba(10,10,8,0.78) 6%, rgba(10,10,8,0.42) 34%, rgba(10,10,8,0) 62%)' }} />
    <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(10,10,8,0.22) 0%, rgba(10,10,8,0) 18%)' }} />
    {STATS.map((s, i) => (
      <StatBeat key={s.num} s={s} kicker={i === 0} />
    ))}
  </AbsoluteFill>
);

/* ================================================================== *
 * ACT 2 · PROMOTE (810–975 abs) — the turn. dvo-20 @ local 12.
 * ================================================================== */
export const Promote: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = spring({ frame: frame - 12, fps: 60, config: { damping: 14, stiffness: 200 } });
  const exit = interpolate(frame, [148, 162], [0, 1], CLAMP);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 1 - exit, transform: `translateY(${-30 * exit}px)` }}>
      <In delay={4} y={12}>
        <div style={{ fontFamily: INTER, fontSize: 44, fontWeight: 700, color: '#6B6B6B', marginBottom: 14 }}>
          Sebab tu kena ada
        </div>
      </In>
      <div style={{ opacity: pop, transform: `scale(${interpolate(pop, [0, 1], [1.18, 1])})`, textAlign: 'center' }}>
        <div style={{ fontFamily: INTER, fontSize: 168, fontWeight: 900, color: '#1A1A1A', letterSpacing: -8, lineHeight: 1 }}>
          Potraces<span style={{ color: '#4F5104' }}>.</span>
        </div>
        <div style={{ margin: '10px auto 0', width: 460 }}>
          <Underline w={460} at={[26, 46]} />
        </div>
      </div>
      <In delay={40} y={10}>
        <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 700, color: '#9A9A94', letterSpacing: 1, marginTop: 26 }}>
          duit kau, nampak semua
        </div>
      </In>
    </AbsoluteFill>
  );
};
