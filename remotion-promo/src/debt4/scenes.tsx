import React from 'react';
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { CountUp, In, Rise, Rule, Scribble } from './type';
import {
  ScanScreen,
  ResultScreen,
  SplitScreen,
  SplitsOverviewScreen,
  DebtsHomeScreen,
  RemindScreen,
  SharedScreen,
  ScreenCard,
} from './screens';

/* Screens zoomed to fill the vertical canvas — tele presence, no dead air. */
const ZOOM = 1.2;

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 40 }}>
    <div style={{ transform: `scale(${ZOOM})` }}>{children}</div>
  </AbsoluteFill>
);

/* ============ S1 · HOOK (640 = 10.7s)
 * Rapid-fire roll-call: rows hard-cut ~1.2s apart with a notification ping
 * (8/80/152); VO names chain behind at natural pace. Nothing new until the
 * last name lands → beat stop → RM 140 slam (boom) → dvo-04 → turn. ====== */
const HOOK_ROWS: Array<{ n: string; what: string; amt: string; at: number }> = [
  { n: 'aiman', what: 'tiket bas', amt: 'RM 30', at: 6 },
  { n: 'zikri', what: 'makan', amt: 'RM 60', at: 66 },
  { n: 'mohsin', what: 'pinjam semalam', amt: 'RM 50', at: 126 },
];
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const collapse = interpolate(frame, [258, 284], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.5, 0, 0.75, 0),
  });
  const totalOut = interpolate(frame, [358, 372], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.5, 0, 0.75, 0),
  });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      {/* the pile — various person × various debt */}
      {frame < 286 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              opacity: 1 - collapse,
              transform: `scale(${1 - collapse * 0.1}) translateY(${collapse * 70}px)`,
            }}
          >
            {HOOK_ROWS.map((r, i) => {
              const s = spring({ frame: frame - r.at, fps: 60, config: { damping: 13, stiffness: 170 } });
              return (
                <div
                  key={r.n}
                  style={{
                    width: 880,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 22,
                    borderRadius: 28,
                    background: '#fff',
                    border: `1px solid ${L.line}`,
                    boxShadow: '0 18px 48px rgba(35,38,20,0.10)',
                    padding: '20px 32px',
                    opacity: s,
                    transform: `translateY(${(1 - s) * 70}px) rotate(${(1 - s) * (i % 2 ? 2.5 : -2.5)}deg) scale(${interpolate(s, [0, 1], [0.88, 1])})`,
                  }}
                >
                  <div
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 34,
                      background: i % 2 ? L.cardAlt : L.accentSoft,
                      color: L.accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: INTER,
                      fontSize: 30,
                      fontWeight: 800,
                    }}
                  >
                    {r.n[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: INTER, fontSize: 38, fontWeight: 800, color: L.text, letterSpacing: -0.5 }}>{r.n}</div>
                    <div style={{ fontFamily: INTER, fontSize: 26, fontWeight: 600, color: L.textSoft, marginTop: 2 }}>{r.what}</div>
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 58, fontWeight: 900, color: L.text, letterSpacing: -2, fontVariantNumeric: 'tabular-nums' }}>{r.amt}</div>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* the total slams — only after mohsin's name finishes (dvo-04 answers) */}
      {frame >= 292 && frame < 376 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', opacity: 1 - totalOut, transform: `translateY(${-44 * totalOut}px)` }}>
            <In delay={296} y={14}>
              <div style={{ fontFamily: INTER, fontSize: 32, fontWeight: 700, color: L.textSoft, letterSpacing: 1, marginBottom: 12 }}>
                semua orang hutang kau
              </div>
            </In>
            <div style={{ position: 'relative', fontFamily: INTER, fontSize: 170, fontWeight: 900, color: L.text, letterSpacing: -6 }}>
              <CountUp to={140} from={30} delay={296} dur={30} fmt={(v) => `RM ${Math.round(v)}`} />
              <Scribble at={326} w={560} h={230} style={{ left: -30, top: -30 }} />
            </div>
          </div>
        </AbsoluteFill>
      ) : null}

      {/* the turn — ONE flowing VO clip (user's preferred intonation arc);
          three lines trail their spoken beats, no dead air after the total */}
      {frame >= 394 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <Rise text="Ingat barang." delay={403} outAt={570} style={{ fontFamily: INTER, fontSize: 96, fontWeight: 800, color: L.text, letterSpacing: -2 }} />
          <Rise text="Ingat harga." delay={421} outAt={572} style={{ fontFamily: INTER, fontSize: 96, fontWeight: 800, color: L.text, letterSpacing: -2 }} />
          <Rise text="Ingat orang sekali." delay={443} accent={[1]} outAt={574} style={{ fontFamily: INTER, fontSize: 96, fontWeight: 800, color: L.text, letterSpacing: -2 }} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/* ============ S2 · SNAP + SPLIT (620 = 10.3s) — scan 163 · result 220 · split 237 ============ */
export const SnapSplit: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={163}>
      <Center><ScreenCard title="Save Receipt"><ScanScreen /></ScreenCard></Center>
      <Rule delay={10} accent={[2]}>Makan keluar? Snap je resit tu.</Rule>
    </Sequence>
    <Sequence from={163} durationInFrames={220}>
      <Center><ScreenCard title="Save Receipt"><ResultScreen /></ScreenCard></Center>
      <Rule delay={8} accent={[0]}>AI baca semua — siap kira.</Rule>
    </Sequence>
    <Sequence from={383}>
      <Center><ScreenCard title="split expense"><SplitScreen /></ScreenCard></Center>
      <Rule delay={10} accent={[2, 5]}>Split ikut kepala ke, sama rata — semua boleh.</Rule>
    </Sequence>
  </AbsoluteFill>
);

/* ============ S2b · SPLITS OVERVIEW (190 = 3.2s) — owed-back tally ============ */
export const SplitsOverview: React.FC = () => (
  <AbsoluteFill>
    <Center><ScreenCard><SplitsOverviewScreen /></ScreenCard></Center>
    <Rule delay={10} accent={[2]}>Terus jadi hutang masing-masing.</Rule>
  </AbsoluteFill>
);

/* ============ S3 · TRACK HOME (100 = 1.7s) — the RM 456 context ============ */
export const TrackHome: React.FC = () => (
  <AbsoluteFill>
    <Center><ScreenCard><DebtsHomeScreen /></ScreenCard></Center>
  </AbsoluteFill>
);

/* ============ S3b · INTERRUPT (280 = 4.7s) — the halal moment: cut to black,
   music dies, text only, ~half-second of silence after ==================== */
export const Interrupt: React.FC = () => (
  <AbsoluteFill style={{ background: '#0B0B0D', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
    <Rise text="Malas nak kejar, okay." delay={16} style={{ fontFamily: INTER, fontSize: 80, fontWeight: 800, color: '#F5F5F0', letterSpacing: -2 }} />
    <Rise text="Malas nak track?" delay={104} style={{ fontFamily: INTER, fontSize: 80, fontWeight: 800, color: '#F5F5F0', letterSpacing: -2 }} />
    <Rise text="nanti halal je hutang tu 😭" delay={182} accent={[1]} accentColor="#C6CB6B" style={{ fontFamily: INTER, fontSize: 80, fontWeight: 800, color: '#F5F5F0', letterSpacing: -2 }} />
  </AbsoluteFill>
);

/* ============ S4 · REMIND (260 = 4.3s) ============ */
export const Remind: React.FC = () => (
  <AbsoluteFill>
    <Center><ScreenCard><RemindScreen /></ScreenCard></Center>
    <Rule delay={10} accent={[5, 7]}>Remind dari sini — terus WhatsApp, siap QR.</Rule>
  </AbsoluteFill>
);

/* ============ S4b · SETTLE (140 = 2.3s) — zikri pays, row strikes, collected ============ */
export const Settle: React.FC = () => (
  <AbsoluteFill>
    <Center><ScreenCard><DebtsHomeScreen mode="settle" /></ScreenCard></Center>
    <Rule delay={8} accent={[4]}>Dia bayar — terus collected.</Rule>
  </AbsoluteFill>
);

/* ============ S5 · SHARED (200 = 3.3s) ============ */
export const Shared: React.FC = () => (
  <AbsoluteFill>
    <Center><ScreenCard><SharedScreen /></ScreenCard></Center>
    <Rule delay={10} accent={[2, 3]}>Share sama-sama Netflix? Track kat sini jugak.</Rule>
  </AbsoluteFill>
);

/* ============ S6 · FINALE (200 = 3.3s) — Hutang. Track dulu. Settle. + CTA ============ */
const StoreBadge: React.FC<{ glyph: React.ReactNode; top: string; bottom: string }> = ({ glyph, top, bottom }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#111', borderRadius: 14, padding: '10px 22px', border: '1px solid rgba(255,255,255,0.14)' }}>
    {glyph}
    <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
      <div style={{ fontSize: 17, color: '#CFCFC9', fontWeight: 600, fontFamily: INTER }}>{top}</div>
      <div style={{ fontSize: 26, color: '#fff', fontWeight: 800, fontFamily: INTER }}>{bottom}</div>
    </div>
  </div>
);

export const Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = spring({ frame: frame - 6, fps: 60, config: { damping: 14, stiffness: 170 } });
  const draw = interpolate(frame, [10, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.65, 0, 0.35, 1) });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.4, 1])})`, opacity: pop, filter: 'drop-shadow(0 14px 36px rgba(79,81,4,0.3))' }}>
        <svg width={110} height={110} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill={L.accent} />
          <polyline points="28,52 44,67 73,37" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={90} strokeDashoffset={90 * (1 - draw)} />
        </svg>
      </div>
      <Rise text="Hutang." delay={14} style={{ fontFamily: INTER, fontSize: 92, fontWeight: 800, color: L.text, letterSpacing: -2 }} />
      <Rise text="Track dulu." delay={40} style={{ fontFamily: INTER, fontSize: 92, fontWeight: 800, color: L.text, letterSpacing: -2 }} />
      <Rise text="Settle." delay={66} accent={[0]} style={{ fontFamily: INTER, fontSize: 92, fontWeight: 800, color: L.text, letterSpacing: -2 }} />
      <In delay={96}>
        <div style={{ fontSize: 32, color: L.textSoft, fontWeight: 600, fontFamily: INTER }}>takde awkward dah</div>
      </In>
      <In delay={110}>
        <div style={{ fontSize: 28, letterSpacing: 8, color: L.accent, fontWeight: 800, fontFamily: INTER, marginTop: 2 }}>POTRACES</div>
      </In>
      <In delay={126}>
        <div style={{ fontSize: 34, color: L.text, fontWeight: 800, fontFamily: INTER, marginTop: 10 }}>Muat turun percuma</div>
      </In>
      <In delay={140}>
        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          <StoreBadge glyph={<svg width={26} height={30} viewBox="0 0 24 24"><path fill="#fff" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" /></svg>} top="Muat turun di" bottom="App Store" />
          <StoreBadge glyph={<svg width={24} height={28} viewBox="0 0 24 28"><path d="M1 1 L23 14 L1 27 Z" fill="#34A853" /></svg>} top="Dapatkan di" bottom="Google Play" />
        </div>
      </In>
    </AbsoluteFill>
  );
};
