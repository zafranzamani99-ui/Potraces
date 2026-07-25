import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { In, Rise, Ripple, Rule, Scribble } from '../debt4/type';

/* ================================================================== *
 * TOUR — REAL app screenshots (assets/website jejakbaki) in floating
 * frames; motion comes from push-in + overlays, not component rebuilds.
 * Voice-finish rule: every beat holds until its VO ends.
 * ================================================================== */

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Slow push-in on every scene — nothing ever sits still. */
const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [1.13, 1.18], CLAMP);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 90 }}>
      <div style={{ transform: `scale(${drift})` }}>{children}</div>
    </AbsoluteFill>
  );
};

/** A real screenshot in a floating frame; overlays go in children. */
const Shot: React.FC<{ img: string; w?: number; children?: React.ReactNode }> = ({ img, w = 620, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 17, stiffness: 190 } });
  return (
    <div
      style={{
        width: w,
        borderRadius: 44,
        overflow: 'hidden',
        border: `1px solid ${L.line}`,
        boxShadow: '0 50px 110px rgba(35,38,20,0.18), 0 14px 34px rgba(35,38,20,0.08)',
        position: 'relative',
        opacity: s,
        transform: `translateY(${(1 - s) * 60}px) scale(${0.96 + 0.04 * s})`,
        background: '#fff',
      }}
    >
      <Img src={staticFile(img)} style={{ width: '100%', display: 'block' }} />
      {children}
    </div>
  );
};

/* ============ T1 · WAYS (245) — 3 cara mudah log ============ */
const WAY_ROWS: Array<{ t: string; sub: string; img?: string }> = [
  { t: 'Backtap', sub: 'ketuk belakang fon, terus log', img: 'shots/tile-backtap.png' },
  { t: 'Auto Log', sub: 'bayar Apple Pay, dia log sendiri', img: 'shots/tile-autolog.png' },
  { t: 'Share SS / Resit', sub: 'screenshot atau resit, share terus masuk' },
];
export const TourWays: React.FC = () => (
  <AbsoluteFill>
    <Center>
      <div style={{ width: 640, borderRadius: 44, background: '#fff', border: `1px solid ${L.line}`, boxShadow: '0 50px 110px rgba(35,38,20,0.18), 0 14px 34px rgba(35,38,20,0.08)', padding: '32px 30px 30px', fontFamily: INTER }}>
        <In delay={2} y={10}>
          <div style={{ fontSize: 23, fontWeight: 800, color: L.accent, letterSpacing: 3, textTransform: 'uppercase' }}>log expenses?</div>
        </In>
        <In delay={6} y={14}>
          <div style={{ fontSize: 46, fontWeight: 900, color: L.text, letterSpacing: -1.5, marginTop: 6 }}>Tiga cara mudah.</div>
        </In>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {WAY_ROWS.map((w, i) => (
            <In key={w.t} delay={12 + i * 8} y={18}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 22, border: `1px solid ${L.line}`, background: '#fff', padding: '14px 16px', boxShadow: '0 10px 26px rgba(35,38,20,0.06)' }}>
                {w.img ? (
                  <Img src={staticFile(w.img)} style={{ width: 88, height: 60, objectFit: 'cover', borderRadius: 12, border: `1px solid ${L.line}` }} />
                ) : (
                  <div style={{ width: 88, height: 60, borderRadius: 12, background: L.accentSoft, border: `1.5px solid ${L.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={L.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 29, fontWeight: 800, color: L.text }}>{w.t}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: L.textSoft, marginTop: 2 }}>{w.sub}</div>
                </div>
              </div>
            </In>
          ))}
        </div>
      </div>
    </Center>
    <Rule delay={8} accent={[0, 2, 4]}>Backtap. Auto log. Share SS / resit.</Rule>
  </AbsoluteFill>
);

/* ============ T2 · RESULT as TAX (150) — mark claimable, save for tax relief ============ */
export const TourTax: React.FC = () => {
  const frame = useCurrentFrame();
  const flip = spring({ frame: frame - 24, fps: 60, config: { damping: 14, stiffness: 220 } });
  return (
    <AbsoluteFill>
      <Center>
        <Shot img="shots/receipt result scanning.PNG">
          {/* the tap: Not Claimable flips to Claimable — that IS tax relief */}
          {frame >= 24 ? (
            <div
              style={{
                position: 'absolute',
                left: 262,
                top: 686,
                width: 225,
                height: 62,
                borderRadius: 999,
                background: '#EEF0D4',
                border: `1.5px solid ${L.accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: INTER,
                fontSize: 24,
                fontWeight: 800,
                color: L.accent,
                opacity: flip,
                transform: `scale(${interpolate(flip, [0, 1], [0.7, 1])})`,
                boxShadow: '0 10px 26px rgba(79,81,4,0.18)',
              }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={L.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5" /></svg>
              Claimable
            </div>
          ) : null}
          <Scribble at={44} w={246} h={78} style={{ left: 252, top: 678 }} />
          <Ripple at={24} x={374} y={717} />
        </Shot>
      </Center>
      <Rule delay={8} accent={[3, 4]}>Resit simpan untuk tax relief.</Rule>
    </AbsoluteFill>
  );
};

/* ============ T3 · CENTRAL (286) — semua satu tempat, bukan integrasi.
 * Every item the VO names gets its own screen: wallets center-stage,
 * debts/goals/savings/commitments minis fanning in around it. ============ */
const MINIS: Array<{ img: string; label: string; left: number; top: number; rot: number; at: number; fromX: number }> = [
  { img: 'shots/debt screen 1.PNG', label: 'hutang', left: 24, top: 250, rot: -5, at: 12, fromX: -160 },
  { img: 'shots/goals.PNG', label: 'goals', left: 851, top: 330, rot: 4, at: 18, fromX: 160 },
  { img: 'shots/savings.PNG', label: 'savings', left: 24, top: 1230, rot: 3, at: 24, fromX: -160 },
  { img: 'shots/bill bills.PNG', label: 'commitments', left: 851, top: 1300, rot: -4, at: 30, fromX: 160 },
];
export const TourCentral: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 17, stiffness: 190 } });
  return (
    <AbsoluteFill>
      {/* wallets — the home of it all */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 90 }}>
        <div
          style={{
            width: 470,
            borderRadius: 40,
            overflow: 'hidden',
            border: `1px solid ${L.line}`,
            boxShadow: '0 50px 110px rgba(35,38,20,0.22), 0 14px 34px rgba(35,38,20,0.10)',
            opacity: s,
            transform: `translateY(${(1 - s) * 60}px) scale(${0.96 + 0.04 * s})`,
          }}
        >
          <Img src={staticFile('shots/wallet.PNG')} style={{ width: '100%', display: 'block' }} />
        </div>
      </AbsoluteFill>
      {/* the other lives of your money */}
      {MINIS.map((m) => {
        const m2 = spring({ frame: frame - m.at, fps, config: { damping: 16, stiffness: 170 } });
        return (
          <div
            key={m.label}
            style={{
              position: 'absolute',
              left: m.left,
              top: m.top,
              width: 205,
              opacity: m2,
              transform: `translateX(${(1 - m2) * m.fromX}px) rotate(${(1 - m2) * m.rot * 2 + m.rot}deg)`,
            }}
          >
            <div style={{ borderRadius: 22, overflow: 'hidden', border: `1px solid ${L.line}`, boxShadow: '0 24px 60px rgba(35,38,20,0.20)', background: '#fff' }}>
              <Img src={staticFile(m.img)} style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ textAlign: 'center', fontFamily: INTER, fontSize: 21, fontWeight: 800, color: L.textSoft, marginTop: 8, letterSpacing: 0.5 }}>{m.label}</div>
          </div>
        );
      })}
      <Rule delay={8} accent={[3, 4]}>Bukan integrasi — satu tempat untuk semua.</Rule>
    </AbsoluteFill>
  );
};

/* ============ T4 · GOALS + NOTES (226) — savings pots and money notes ============ */
export const TourGoals: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const notesIn = spring({ frame: frame - 14, fps, config: { damping: 16, stiffness: 160 } });
  return (
    <AbsoluteFill>
      <Center>
        <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
          <div>
            <Shot img="shots/goals.PNG" w={440} />
            <div style={{ textAlign: 'center', fontFamily: INTER, fontSize: 23, fontWeight: 800, color: L.textSoft, marginTop: 10 }}>goals</div>
          </div>
          <div style={{ opacity: notesIn, transform: `translateX(${(1 - notesIn) * 120}px) rotate(${(1 - notesIn) * 4}deg)` }}>
            <Shot img="shots/notes.png" w={440} />
            <div style={{ textAlign: 'center', fontFamily: INTER, fontSize: 23, fontWeight: 800, color: L.textSoft, marginTop: 10 }}>notes</div>
          </div>
        </div>
      </Center>
      <Rule delay={8} accent={[0, 1]}>Goals. Notes. Semua sekali.</Rule>
    </AbsoluteFill>
  );
};

/* ============ T5 · ECHO (210) — AI inside, ask anything ============ */
export const TourEcho: React.FC = () => (
  <AbsoluteFill>
    <Center>
      <Shot img="shots/echo-ask.png" />
    </Center>
    <Rule delay={8} accent={[1, 5]}>Ada AI dalam — tanya Echo.</Rule>
  </AbsoluteFill>
);

/* ============ FINALE (260) — Potraces. Track dulu. → CTA end card ============ */
const AppleMark: React.FC = () => (
  <svg width={26} height={26} viewBox="0 0 24 24" fill="#fff">
    <path d="M17.05 12.54c-.03-2.89 2.37-4.27 2.48-4.34-1.35-1.98-3.46-2.25-4.21-2.28-1.79-.18-3.5 1.06-4.4 1.06-.91 0-2.31-1.03-3.8-1.01-1.95.03-3.76 1.14-4.77 2.88-2.03 3.53-.52 8.75 1.46 11.62.97 1.4 2.12 2.97 3.64 2.91 1.46-.06 2.01-.94 3.78-.94 1.76 0 2.26.94 3.8.91 1.57-.03 2.57-1.42 3.53-2.83 1.11-1.62 1.57-3.19 1.6-3.27-.04-.02-3.07-1.18-3.11-4.71zM14.16 4.06c.8-.97 1.34-2.33 1.19-3.68-1.15.05-2.55.77-3.38 1.74-.74.86-1.39 2.23-1.22 3.55 1.29.1 2.6-.65 3.41-1.61z" />
  </svg>
);
const PlayMark: React.FC = () => (
  <svg width={24} height={24} viewBox="0 0 24 24">
    <path d="M3.6 2.3 13 12 3.6 21.7c-.4-.3-.6-.8-.6-1.4V3.7c0-.6.2-1.1.6-1.4z" fill="#00D2FF" />
    <path d="M17.4 8.4 13 12 3.6 2.3c.4-.3 1-.4 1.6-.2l12.2 6.3z" fill="#00F076" />
    <path d="M17.4 8.4l3.2 1.8c1.2.7 1.2 1.9 0 2.6l-3.2 1.8L13 12l4.4-3.6z" fill="#FFDB00" />
    <path d="M5.2 22.1c-.6.2-1.2.1-1.6-.2L13 12l4.4 4.4-12.2 5.7z" fill="#FF3A44" />
  </svg>
);
const StoreBadge: React.FC<{ top: string; bottom: string; children: React.ReactNode }> = ({ top, bottom, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#0D0D0D', borderRadius: 14, padding: '11px 18px', border: '1px solid rgba(255,255,255,0.16)' }}>
    {children}
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.4 }}>{top}</div>
      <div style={{ fontFamily: INTER, fontSize: 21, fontWeight: 700, color: '#fff', lineHeight: 1.15, marginTop: 1 }}>{bottom}</div>
    </div>
  </div>
);

export const Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = spring({ frame: frame - 4, fps: 60, config: { damping: 13, stiffness: 200 } });
  const draw = interpolate(frame, [8, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const pulse = 1 + Math.sin((frame - 140) / 14) * 0.014 * (frame > 140 ? 1 : 0);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.4, 1])})`, opacity: pop, filter: 'drop-shadow(0 14px 36px rgba(79,81,4,0.3))' }}>
        <svg width={110} height={110} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill={L.accent} />
          <polyline points="28,52 44,67 73,37" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={90} strokeDashoffset={90 * (1 - draw)} />
        </svg>
      </div>
      <Rise text="Potraces." delay={12} style={{ fontFamily: INTER, fontSize: 104, fontWeight: 900, color: L.text, letterSpacing: -3 }} />
      <Rise text="Track dulu." delay={44} accent={[0, 1]} style={{ fontFamily: INTER, fontSize: 104, fontWeight: 900, color: L.text, letterSpacing: -3 }} />
      <In delay={88}>
        <div style={{ fontSize: 30, color: L.textSoft, fontWeight: 600, fontFamily: INTER }}>duit kau, nampak semua</div>
      </In>
      {/* CTA — the reason the video exists */}
      <In delay={130} y={18}>
        <div style={{ transform: `scale(${pulse})`, marginTop: 26, borderRadius: 999, background: L.accent, color: '#fff', fontFamily: INTER, fontSize: 31, fontWeight: 800, padding: '18px 46px', boxShadow: '0 16px 44px rgba(79,81,4,0.32)' }}>
          Muat turun percuma
        </div>
      </In>
      <In delay={142} y={14}>
        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          <StoreBadge top="Download on the" bottom="App Store"><AppleMark /></StoreBadge>
          <StoreBadge top="GET IT ON" bottom="Google Play"><PlayMark /></StoreBadge>
        </div>
      </In>
      <In delay={156} y={10}>
        <div style={{ fontFamily: INTER, fontSize: 25, fontWeight: 600, color: L.textSoft, marginTop: 18 }}>
          visit <span style={{ color: L.accent, fontWeight: 800 }}>jejakbaki.my</span> untuk info lebih lanjut
        </div>
      </In>
    </AbsoluteFill>
  );
};
