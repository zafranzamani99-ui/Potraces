import React from 'react';
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { CountUp, In, Ripple, Underline } from './type';

/* ================================================================== *
 * Living rebuilds of the real app screens (pixel-close to
 * assets/website jejakbaki/*.PNG) — every element animates.
 * ================================================================== */

export const CARD_W = 640;

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/* ---------- chrome ---------- */
const StatusBar: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px 0' }}>
    <span style={{ fontSize: 24, fontWeight: 700, color: L.text }}>9:41</span>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <svg width={28} height={18} viewBox="0 0 20 14"><path d="M2 8.5 C5 5.5 8 4 10 4 C12 4 15 5.5 18 8.5" fill="none" stroke={L.text} strokeWidth="2" strokeLinecap="round" /><circle cx="10" cy="11" r="1.6" fill={L.text} /></svg>
      <div style={{ borderRadius: 5, border: `1.5px solid ${L.textSoft}`, padding: '1.5px 3px', display: 'flex', alignItems: 'center', gap: 3 }}>
        <div style={{ width: 26, height: 10, borderRadius: 2.5, background: '#6FA84F' }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: L.text }}>94</span>
      </div>
    </div>
  </div>
);

const CardHeader: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
    <div style={{ width: 52, height: 52, borderRadius: 26, background: L.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={L.text} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    </div>
    <div style={{ fontSize: 32, fontWeight: 800, color: L.text, letterSpacing: -0.5 }}>{title}</div>
    <div style={{ width: 52, height: 52, borderRadius: 26, background: L.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={L.textSoft} strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51-1z" /></svg>
    </div>
  </div>
);

/** The floating white card every screen lives in — one device, many states. */
export const ScreenCard: React.FC<{ enterAt?: number; title?: string; children: React.ReactNode }> = ({
  enterAt = 0,
  title = 'Debts & Splits',
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - enterAt, fps, config: { damping: 17, stiffness: 190 } });
  return (
    <div
      style={{
        width: CARD_W,
        borderRadius: 48,
        background: '#FFFFFF',
        border: `1px solid ${L.line}`,
        boxShadow: '0 50px 110px rgba(35,38,20,0.18), 0 14px 34px rgba(35,38,20,0.08)',
        padding: '18px 34px 34px',
        fontFamily: INTER,
        position: 'relative',
        opacity: s,
        transform: `translateY(${(1 - s) * 60}px) scale(${0.96 + 0.04 * s})`,
      }}
    >
      <StatusBar />
      <CardHeader title={title} />
      {children}
    </div>
  );
};

const Avatar: React.FC<{ n: string; size?: number; tone?: 'olive' | 'red' }> = ({ n, size = 52, tone = 'olive' }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: tone === 'red' ? 'rgba(192,80,58,0.14)' : 'rgba(79,81,4,0.12)',
      color: tone === 'red' ? '#A6462F' : L.accent,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.4,
      fontWeight: 800,
    }}
  >
    {n[0].toUpperCase()}
  </div>
);

const Chevron: React.FC = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={L.textFaint} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const Btn: React.FC<{ children: React.ReactNode; ghost?: boolean; pressAt?: number }> = ({ children, ghost, pressAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const press = pressAt != null ? spring({ frame: frame - pressAt, fps, config: { damping: 12, stiffness: 300 } }) : 0;
  return (
    <div
      style={{
        borderRadius: 999,
        background: ghost ? 'transparent' : L.accent,
        border: ghost ? `1.5px solid ${L.line}` : 'none',
        color: ghost ? L.textSoft : '#fff',
        fontSize: 27,
        fontWeight: 800,
        textAlign: 'center',
        padding: '17px 0',
        transform: `scale(${interpolate(press, [0, 0.4, 1], [1, 0.94, 1])})`,
        boxShadow: ghost ? 'none' : '0 10px 26px rgba(79,81,4,0.22)',
      }}
    >
      {children}
    </div>
  );
};

/* ================================================================== *
 * 1 · SCAN — viewfinder + receipt paper + scan sweep
 * ================================================================== */
const ReceiptPaper: React.FC = () => (
  <div
    style={{
      width: 300,
      background: '#FDFDFB',
      borderRadius: 6,
      padding: '26px 22px',
      transform: 'rotate(-2.5deg)',
      boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
      fontFamily: "'Courier New', monospace",
      color: '#333',
    }}
  >
    <div style={{ textAlign: 'center', fontSize: 23, fontWeight: 700, letterSpacing: 2 }}>SUSHI MONSTER</div>
    <div style={{ textAlign: 'center', fontSize: 15, marginTop: 4, opacity: 0.6 }}>KUALA LUMPUR · T13</div>
    <div style={{ borderTop: '1.5px dashed #999', margin: '14px 0' }} />
    {[
      ['EDAMAME', '5.80'],
      ['KATSU CURRY RICE', '18.80'],
      ['COCA COLA', '3.50'],
      ['PLAIN WATER', '1.00'],
      ['CHICKEN RAMEN', '17.80'],
      ['SALMON MENTAI', '2.90'],
    ].map(([n, p]) => (
      <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginTop: 7, opacity: 0.8 }}>
        <span>{n}</span>
        <span>{p}</span>
      </div>
    ))}
    <div style={{ borderTop: '1.5px dashed #999', margin: '12px 0 8px' }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, opacity: 0.55, fontStyle: 'italic' }}>
      <span>+ 7 MORE ITEMS</span>
      <span>79.80</span>
    </div>
    <div style={{ borderTop: '1.5px dashed #999', margin: '8px 0 12px' }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, fontWeight: 700 }}>
      <span>TOTAL (MYR)</span>
      <span>129.60</span>
    </div>
    {/* barcode */}
    <div style={{ display: 'flex', gap: 2.5, justifyContent: 'center', marginTop: 18, height: 30 }}>
      {[3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 7].map((h, i) => (
        <div key={i} style={{ width: i % 3 ? 3 : 5, height: '100%', background: '#222', opacity: h / 10 + 0.55 }} />
      ))}
    </div>
  </div>
);

export const ScanScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const scan = interpolate(frame, [16, 64], [0, 1], { ...CLAMP, easing: Easing.bezier(0.45, 0, 0.55, 1) });
  const flash = interpolate(frame, [70, 76, 92], [0, 1, 0], CLAMP);
  return (
    <>
      {/* viewfinder */}
      <In delay={4}>
        <div style={{ marginTop: 26, borderRadius: 26, background: '#141410', height: 560, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ReceiptPaper />
          {/* corner brackets */}
          {[
            [22, 22, '0,0'],
            [22, -22, '0,1'],
            [-22, 22, '1,0'],
            [-22, -22, '1,1'],
          ].map(([t, l, k]) => (
            <div key={k as string} style={{ position: 'absolute', top: (t as number) < 0 ? undefined : (t as number), bottom: (t as number) < 0 ? -(t as number) : undefined, left: (l as number) < 0 ? undefined : (l as number), right: (l as number) < 0 ? -(l as number) : undefined, width: 44, height: 44, borderTop: (t as number) < 0 ? 'none' : `5px solid ${L.accent}`, borderBottom: (t as number) < 0 ? `5px solid ${L.accent}` : 'none', borderLeft: (l as number) < 0 ? 'none' : `5px solid ${L.accent}`, borderRight: (l as number) < 0 ? `5px solid ${L.accent}` : 'none', borderRadius: 4 }} />
          ))}
          {/* scan line */}
          {frame >= 16 && frame < 80 ? (
            <div
              style={{
                position: 'absolute',
                left: 30,
                right: 30,
                top: 40 + scan * 480,
                height: 4,
                background: `linear-gradient(90deg, transparent, ${L.accent}, transparent)`,
                boxShadow: '0 0 26px 6px rgba(164,168,67,0.7)',
              }}
            />
          ) : null}
          <div style={{ position: 'absolute', inset: 0, background: `rgba(164,168,67,${0.16 * flash})` }} />
        </div>
      </In>
      <In delay={34}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 26, fontSize: 26, color: L.textSoft, fontWeight: 600 }}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={L.accent} strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
          {frame < 70 ? 'reading the receipt…' : 'done — 13 items found'}
        </div>
      </In>
    </>
  );
};

/* ================================================================== *
 * 2 · RESULT — snapped photo on top, AI parsed receipt below
 * (RM 129.60 · Sushi Monster · 13 items · removable rows)
 * ================================================================== */
const ITEMS: Array<[string, string]> = [
  ['A02 Edamame', '5.80'],
  ['K01 Chicken Katsu Curry Rice', '18.80'],
  ['BV01 Coca Cola', '3.50'],
  ['BV10 Plain Water (Cold)', '1.00'],
];
export const ResultScreen: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {/* the snapped receipt photo stays attached to the record */}
      <In delay={2}>
        <div style={{ marginTop: 18, height: 190, borderRadius: 22, background: 'linear-gradient(150deg,#23231b 0%,#151510 100%)', position: 'relative', overflow: 'hidden', border: `1px solid ${L.line}` }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%) scale(0.55) rotate(3deg)', transformOrigin: 'top center' }}>
            <ReceiptPaper />
          </div>
          {/* close */}
          <div style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 18, background: 'rgba(10,10,8,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" stroke="#fff" strokeWidth={3} strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </div>
          {/* tap to view chip */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, borderRadius: 999, background: 'rgba(10,10,8,0.62)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 19, fontWeight: 600 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
            tap to view full size
          </div>
        </div>
      </In>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <span style={{ fontSize: 30, color: L.textSoft, fontWeight: 500 }}>RM </span>
        <span style={{ fontSize: 84, fontWeight: 300, color: L.text, letterSpacing: -2 }}>
          <CountUp to={129.6} delay={6} dur={24} fmt={(v) => v.toFixed(2)} />
        </span>
        <div style={{ margin: '2px auto 0', width: 230 }}>
          <Underline w={230} at={[30, 44]} />
        </div>
      </div>
      <In delay={10}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 700, color: L.text }}>
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={L.textSoft} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            Sushi Monster
          </div>
          <div style={{ fontSize: 24, color: L.textSoft, fontWeight: 600 }}>08 Jul</div>
        </div>
      </In>
      <In delay={12}>
        <div style={{ display: 'flex', gap: 14, marginTop: 16 }}>
          {['Food & Dining', 'Not Claimable'].map((c, i) => (
            <div key={c} style={{ borderRadius: 999, padding: '11px 24px', fontSize: 23, fontWeight: 700, background: i === 0 ? L.accentSoft : L.cardAlt, color: i === 0 ? L.accent : L.textSoft, border: `1px solid ${i === 0 ? L.accent : L.line}` }}>
              {c}
            </div>
          ))}
        </div>
      </In>
      <div style={{ marginTop: 20, borderTop: `1px solid ${L.line}`, paddingTop: 14 }}>
        <div style={{ fontSize: 22, color: L.textFaint, fontWeight: 700, letterSpacing: 1 }}>
          ITEMS <span style={{ background: L.cardAlt, borderRadius: 999, padding: '2px 14px' }}>13</span>
        </div>
        {ITEMS.map(([n, p], i) => (
          <In key={n} delay={14 + i * 4} y={12}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px dashed ${L.line}` }}>
              <span style={{ fontSize: 26, color: L.text, fontWeight: 600 }}>{n}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 26, color: L.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{p}</span>
                <span style={{ width: 30, height: 30, borderRadius: 15, background: L.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={13} height={13} viewBox="0 0 24 24" stroke={L.textFaint} strokeWidth={3} strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
                </span>
              </span>
            </div>
          </In>
        ))}
        <In delay={36} y={8}>
          <div style={{ fontSize: 22, color: L.textFaint, fontWeight: 600, textAlign: 'center', marginTop: 10 }}>+ 9 more</div>
        </In>
      </div>
    </>
  );
};

/* ================================================================== *
 * 3 · SPLIT MATH — RM 129.60 ÷ 4 → debts per person
 * ================================================================== */
const FRIENDS: Array<[string, string]> = [
  ['Z', 'Zapp (you)'],
  ['A', 'Aiman'],
  ['F', 'Faiz'],
  ['M', 'Mira'],
];
export const SplitScreen: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <div style={{ textAlign: 'center', marginTop: 30 }}>
        <In delay={4}>
          <div style={{ fontSize: 68, fontWeight: 800, color: L.text, letterSpacing: -2 }}>
            RM 129.60 <span style={{ color: L.textFaint }}>÷</span> 4
          </div>
        </In>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 34 }}>
        {FRIENDS.map(([i, n], k) => {
          const s = spring({ frame: frame - 22 - k * 6, fps: 60, config: { damping: 13, stiffness: 180 } });
          return (
            <div key={i} style={{ opacity: s, transform: `translateY(${(1 - s) * 30}px) scale(${interpolate(s, [0, 1], [0.6, 1])})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Avatar n={i} size={86} />
              <div style={{ fontSize: 25, fontWeight: 800, color: L.accent, fontVariantNumeric: 'tabular-nums' }}>RM 32.40</div>
            </div>
          );
        })}
      </div>
      {/* chips morph into debts */}
      <div style={{ marginTop: 30, borderTop: `1px solid ${L.line}`, paddingTop: 18 }}>
        {FRIENDS.slice(1).map(([i, n], k) => (
          <In key={i} delay={70 + k * 8} y={14}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 4px', borderBottom: `1px dashed ${L.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar n={i} size={42} />
                <span style={{ fontSize: 26, fontWeight: 700, color: L.text }}>{n}</span>
              </div>
              <span style={{ fontSize: 25, fontWeight: 700, color: L.textSoft, fontVariantNumeric: 'tabular-nums' }}>owes RM 32.40</span>
            </div>
          </In>
        ))}
        <In delay={110} y={10}>
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 24, fontWeight: 700, color: L.accent }}>Split created!</div>
        </In>
      </div>
    </>
  );
};

/* ================================================================== *
 * 3b · SPLITS TAB — "you're owed back RM 316.00 across 2 splits"
 * ================================================================== */
const SPLIT_ROWS: Array<{ title: string; sub?: string; amt: string; left: string; pct: number }> = [
  { title: 'Trip Penang', sub: ' — Airbnb + tol + petrol', amt: 'RM 480.00', left: 'RM 240.00 left · 2 unpaid', pct: 0.5 },
  { title: 'Steamboat birthday Aina', amt: 'RM 190.00', left: 'RM 76.00 left · 2 unpaid', pct: 0.4 },
];
export const SplitsOverviewScreen: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <In delay={4}>
        <div style={{ marginTop: 20, borderRadius: 999, background: L.cardAlt, border: `1px solid ${L.line}`, padding: '14px 22px', fontSize: 23, color: L.textFaint, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={L.textFaint} strokeWidth={2.4}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          Search splits...
        </div>
      </In>

      <In delay={8}>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
          {[
            ['Debts', '4', false],
            ['Splits', '2', true],
            ['Shared', '0', false],
          ].map(([t, n, active]) => (
            <div key={t as string} style={{ borderRadius: 999, padding: '9px 20px', fontSize: 23, fontWeight: 800, background: active ? L.accent : 'transparent', color: active ? '#fff' : L.textSoft, border: active ? 'none' : `1.5px solid ${L.line}` }}>
              {t} <span style={{ opacity: 0.6, fontWeight: 700 }}>{n}</span>
            </div>
          ))}
        </div>
      </In>

      <In delay={12}>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          {[
            ['waiting on', '2', true],
            ['you owe', '0', false],
            ['settled', '0', false],
          ].map(([t, n, active]) => (
            <div key={t as string} style={{ borderRadius: 999, padding: '8px 18px', fontSize: 21, fontWeight: 700, background: active ? L.accentSoft : 'transparent', color: active ? L.accent : L.textFaint, border: active ? `1.5px solid ${L.accent}` : `1.5px solid ${L.line}` }}>
              {t} <span style={{ background: active ? L.accent : L.cardAlt, color: active ? '#fff' : L.textSoft, borderRadius: 999, padding: '1px 10px', marginLeft: 4 }}>{n}</span>
            </div>
          ))}
        </div>
      </In>

      {/* owed-back summary — the money coming home */}
      <In delay={16}>
        <div style={{ marginTop: 20, borderRadius: 24, background: '#fff', border: `1.5px solid ${L.accent}`, boxShadow: '0 14px 38px rgba(79,81,4,0.10)', padding: '22px 24px' }}>
          <div style={{ fontSize: 22, color: L.textSoft, fontWeight: 600 }}>you&apos;re owed back</div>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 58, fontWeight: 800, color: L.accent, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>
              <CountUp to={316} delay={24} dur={30} fmt={(v) => `RM ${v.toFixed(2)}`} />
            </div>
            <Underline w={300} at={[44, 62]} />
          </div>
          <div style={{ fontSize: 21, color: L.textFaint, fontWeight: 600, marginTop: 8 }}>across 2 splits</div>
        </div>
      </In>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SPLIT_ROWS.map((r, i) => {
          const at = 24 + i * 8;
          const fill = interpolate(frame, [at + 16, at + 48], [0, r.pct], { ...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1) });
          return (
            <In key={r.title} delay={at} y={18}>
              <div style={{ borderRadius: 24, background: '#fff', border: `1px solid ${L.line}`, boxShadow: '0 10px 30px rgba(35,38,20,0.06)', padding: '20px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 27, fontWeight: 800, color: L.text, letterSpacing: -0.3 }}>
                    {r.title}
                    {r.sub ? <span style={{ fontWeight: 600, color: L.textSoft }}>{r.sub}</span> : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 27, fontWeight: 800, color: L.text, fontVariantNumeric: 'tabular-nums' }}>{r.amt}</span>
                    <Chevron />
                  </div>
                </div>
                <div style={{ fontSize: 21, color: L.textFaint, fontWeight: 600, marginTop: 8 }}>{r.left}</div>
                <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: L.cardAlt, overflow: 'hidden' }}>
                  <div style={{ width: `${fill * 100}%`, height: '100%', borderRadius: 3, background: L.accent }} />
                </div>
              </div>
            </In>
          );
        })}
      </div>
    </>
  );
};

/* ================================================================== *
 * 4 · DEBTS HOME — tiles, tabs, Pending/Settled pills, person rows.
 * mode="pending" → tracking state (owed card reads "to collect").
 * mode="settle"  → zikri pays: his row strikes through, pills flip
 * Pending 3→2 / Settled 1→2, owed card flips to "collected".
 * ================================================================== */
const DEBTORS: Array<{
  n: string;
  dir: 'i owe' | 'they owe';
  amt: string;
  desc: string;
  left: string;
}> = [
  { n: 'aiman', dir: 'they owe', amt: 'RM 30.00', desc: 'tiket bas (kau bayar dulu)', left: 'RM 30.00 left · today' },
  { n: 'zikri', dir: 'they owe', amt: 'RM 60.00', desc: 'makan semalam (kau bayar dulu)', left: 'RM 60.00 left · today' },
  { n: 'mohsin', dir: 'they owe', amt: 'RM 50.00', desc: 'pinjam semalam', left: 'RM 50.00 left · today' },
];

/* settle-beat keyframes (local frames) */
const ST1: [number, number] = [40, 58]; // strike across name + amount
const ST2: [number, number] = [50, 66]; // strike across description
const DIM: [number, number] = [58, 76]; // row fades back
const PILL_FLIP = 70; // Pending 3→2 · Settled 1→2
const COLLECT_FLIP = 74; // "to collect" → "collected" + underline

export const DebtsHomeScreen: React.FC<{ mode?: 'pending' | 'settle' }> = ({ mode = 'pending' }) => {
  const frame = useCurrentFrame();
  const settling = mode === 'settle';
  const d = (n: number) => (settling ? Math.min(n, 4) : n);
  const strike1 = interpolate(frame, ST1, [0, 1], { ...CLAMP, easing: Easing.bezier(0.5, 0, 0.3, 1) });
  const strike2 = interpolate(frame, ST2, [0, 1], { ...CLAMP, easing: Easing.bezier(0.5, 0, 0.3, 1) });
  const dim = interpolate(frame, DIM, [1, 0.42], CLAMP);
  const pillPop = spring({ frame: frame - PILL_FLIP, fps: 60, config: { damping: 12, stiffness: 280 } });
  const collected = settling && frame >= COLLECT_FLIP;
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginTop: 24 }}>
        <In delay={d(6)} style={{ flex: 1 }}>
          <div style={{ borderRadius: 22, background: 'rgba(192,80,58,0.07)', border: '1px solid rgba(192,80,58,0.16)', padding: '18px 20px' }}>
            <div style={{ fontSize: 22, color: L.textSoft, fontWeight: 600 }}>You Owe</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: '#A6462F', marginTop: 4 }}>
              <CountUp to={40} delay={d(14)} dur={36} fmt={(v) => `RM ${v.toFixed(2)}`} />
            </div>
            <div style={{ fontSize: 20, color: L.textFaint, fontWeight: 600, marginTop: 2 }}>small je</div>
          </div>
        </In>
        <In delay={d(10)} style={{ flex: 1 }}>
          <div style={{ borderRadius: 22, background: L.accentSoft, border: `1.5px solid ${L.accent}`, padding: '18px 20px' }}>
            <div style={{ fontSize: 22, color: L.accent, fontWeight: 700 }}>Owed to You</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: L.accent, marginTop: 4 }}>
              {settling ? (
                <CountUp to={396} from={456} delay={COLLECT_FLIP} dur={24} fmt={(v) => `RM ${v.toFixed(2)}`} />
              ) : (
                <CountUp to={456} from={40} delay={d(18)} dur={36} fmt={(v) => `RM ${v.toFixed(2)}`} />
              )}
            </div>
            {settling ? <Underline w={190} at={[COLLECT_FLIP, COLLECT_FLIP + 18]} /> : null}
            <div style={{ fontSize: 20, color: L.accent, fontWeight: 700, marginTop: 2, opacity: collected ? 1 : 0.7 }}>
              {collected ? '✓ RM 60 collected' : 'to collect'}
            </div>
          </div>
        </In>
      </div>

      <In delay={d(14)}>
        <div style={{ marginTop: 18, borderRadius: 999, background: L.cardAlt, border: `1px solid ${L.line}`, padding: '14px 22px', fontSize: 23, color: L.textFaint, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={L.textFaint} strokeWidth={2.4}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          Search debts...
        </div>
      </In>

      <In delay={d(18)}>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
          {[
            ['Debts', '3', true],
            ['Splits', '2', false],
            ['Shared', '1', false],
          ].map(([t, n, active]) => (
            <div key={t as string} style={{ borderRadius: 999, padding: '9px 20px', fontSize: 23, fontWeight: 800, background: active ? L.accent : 'transparent', color: active ? '#fff' : L.textSoft, border: active ? 'none' : `1.5px solid ${L.line}` }}>
              {t} <span style={{ opacity: 0.6, fontWeight: 700 }}>{n}</span>
            </div>
          ))}
        </div>
      </In>

      <In delay={d(20)}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            alignItems: 'center',
            transform: `scale(${interpolate(pillPop, [0, 0.5, 1], [1, 1.06, 1])})`,
            transformOrigin: 'left center',
          }}
        >
          <div style={{ borderRadius: 999, padding: '8px 18px', fontSize: 21, fontWeight: 700, background: L.accentSoft, color: L.accent, border: `1.5px solid ${L.accent}` }}>
            Pending <span style={{ background: L.accent, color: '#fff', borderRadius: 999, padding: '1px 10px', marginLeft: 4 }}>{settling && frame >= PILL_FLIP ? 2 : 3}</span>
          </div>
          <div style={{ borderRadius: 999, padding: '8px 18px', fontSize: 21, fontWeight: 700, background: 'transparent', color: L.textFaint, border: `1.5px solid ${L.line}` }}>
            Settled <span style={{ background: L.cardAlt, color: L.textSoft, borderRadius: 999, padding: '1px 10px', marginLeft: 4 }}>{settling && frame >= PILL_FLIP ? 2 : 1}</span>
          </div>
        </div>
      </In>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {DEBTORS.map((deb, i) => {
          const at = d(26 + i * 9);
          const isZikri = deb.n === 'zikri';
          const striking = settling && isZikri;
          return (
            <In key={deb.n} delay={at} y={20}>
              <div
                style={{
                  borderRadius: 24,
                  background: '#fff',
                  border: `1px solid ${L.line}`,
                  boxShadow: '0 10px 30px rgba(35,38,20,0.06)',
                  padding: '20px 22px',
                  opacity: striking ? dim : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Avatar n={deb.n} tone={deb.dir === 'i owe' ? 'red' : 'olive'} />
                    <div>
                      <span style={{ fontSize: 28, fontWeight: 800, color: L.text }}>{deb.n}</span>
                      <span style={{ fontSize: 21, fontWeight: 700, color: deb.dir === 'i owe' ? '#A6462F' : L.accent, marginLeft: 10 }}>{deb.dir}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: deb.dir === 'i owe' ? '#A6462F' : L.accent, fontVariantNumeric: 'tabular-nums' }}>{deb.amt}</span>
                    <Chevron />
                  </div>
                  {striking ? (
                    <div style={{ position: 'absolute', left: -6, right: -6, top: '50%', height: 4, borderRadius: 2, background: L.accent, transform: `translateY(-50%) rotate(-0.5deg) scaleX(${strike1})`, transformOrigin: 'left center' }} />
                  ) : null}
                </div>
                <div style={{ position: 'relative', marginTop: 10 }}>
                  <div style={{ fontSize: 22, color: L.textSoft, fontWeight: 500 }}>{deb.desc}</div>
                  {striking ? (
                    <div style={{ position: 'absolute', left: -4, right: 120, top: '50%', height: 3.5, borderRadius: 2, background: L.accent, transform: `translateY(-50%) rotate(0.4deg) scaleX(${strike2})`, transformOrigin: 'left center' }} />
                  ) : null}
                </div>
                <div style={{ fontSize: 21, fontWeight: 700, marginTop: 6, color: striking && frame >= ST2[1] ? L.accent : L.textFaint }}>
                  {striking && frame >= ST2[1] ? '✓ settled · today' : deb.left}
                </div>
              </div>
            </In>
          );
        })}
      </div>
    </>
  );
};

/* ================================================================== *
 * 5 · REMIND — message to zikri (they owe RM 60) + saved QR attached
 * ================================================================== */
export const RemindScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const msg = 'Hey zikri, you owe me RM 60.00\n· grabfood loop1 weekend (kau bayar dulu)\nCan you settle when free? Thank you!';
  const shown = Math.floor(interpolate(frame, [20, 20 + msg.length * 0.62], [0, msg.length], CLAMP));
  const qrIn = spring({ frame: frame - 96, fps: 60, config: { damping: 18, stiffness: 140 } });
  /* once the toast lands, the buttons have done their job — clear them */
  const btnsOut = interpolate(frame, [168, 176], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <div style={{ marginTop: 24, fontSize: 42, fontWeight: 800, color: L.text, letterSpacing: -1 }}>Send Reminder</div>
      <div style={{ fontSize: 25, color: L.textSoft, fontWeight: 600, marginTop: 6 }}>zikri · Owes RM 60.00</div>

      <In delay={8}>
        <div style={{ marginTop: 22, borderRadius: 22, borderTopLeftRadius: 6, background: '#E7F6DF', border: '1px solid rgba(23,23,15,0.06)', padding: '22px 24px', fontSize: 25, color: L.text, lineHeight: 1.5, fontWeight: 500, minHeight: 168, whiteSpace: 'pre-line', boxShadow: '0 12px 30px rgba(35,38,20,0.08)' }}>
          {msg.slice(0, shown)}
          {shown < msg.length && shown > 0 ? <span style={{ color: L.accent }}>▌</span> : null}
        </div>
      </In>

      {/* the saved QR attaches itself to the message */}
      {frame >= 96 ? (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-start', opacity: qrIn, transform: `translateY(${(1 - qrIn) * 40}px) scale(${0.9 + qrIn * 0.1})` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 20, background: '#fff', border: `1px solid ${L.line}`, padding: '14px 18px', boxShadow: '0 14px 36px rgba(35,38,20,0.12)' }}>
            <Img src={staticFile('duitnow-qr.jpeg')} style={{ width: 92, borderRadius: 10 }} />
            <div>
              <div style={{ fontSize: 23, fontWeight: 800, color: L.text }}>DuitNow QR</div>
              <div style={{ fontSize: 20, color: L.textSoft, fontWeight: 600, marginTop: 3 }}>QR code attached for payment</div>
            </div>
          </div>
        </div>
      ) : null}

      <In delay={118} y={14}>
        <div style={{ display: 'flex', gap: 14, marginTop: 24, opacity: btnsOut, transform: `translateY(${(1 - btnsOut) * 14}px)` }}>
          <div style={{ flex: 1 }}><Btn ghost>Copy</Btn></div>
          <div style={{ flex: 1.4 }}><Btn pressAt={154}>WhatsApp + QR</Btn></div>
        </div>
      </In>

      {frame >= 170 ? (
        <In delay={170} y={12}>
          <div style={{ position: 'absolute', left: 34, right: 34, bottom: 30, borderRadius: 999, background: L.text, color: '#fff', fontSize: 24, fontWeight: 800, textAlign: 'center', padding: '13px 0' }}>
            Reminder sent with QR!
          </div>
        </In>
      ) : null}

      <Ripple at={154} x={430} y={600} />
    </>
  );
};

/* ================================================================== *
 * 6 · SHARED — Netflix, iCloud, Google One — collected monthly
 * ================================================================== */
const SUBS: Array<{
  name: string;
  price: string;
  members: string;
  day: string;
  paid: string;
  pct: number;
  mark: React.ReactNode;
}> = [
  {
    name: 'Netflix', price: 'RM 75.90/mo', members: '6 members', day: 'day 16', paid: '4/6 paid', pct: 4 / 6,
    mark: <div style={{ width: 54, height: 54, borderRadius: 14, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E50914', fontSize: 32, fontWeight: 900, fontStyle: 'italic' }}>N</div>,
  },
  {
    name: 'iCloud+', price: 'RM 11.90/mo', members: '4 members', day: 'day 1', paid: '2/4 paid', pct: 2 / 4,
    mark: (
      <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(51,145,220,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={36} height={26} viewBox="0 0 36 26"><path d="M27 22 H9 a7 7 0 1 1 1.6-13.8 A9.5 9.5 0 0 1 29 12.5 5.5 5.5 0 0 1 27 22 z" fill="#3391DC" /></svg>
      </div>
    ),
  },
  {
    name: 'Google One', price: 'RM 8.99/mo', members: '3 members', day: 'day 5', paid: '1/3 paid', pct: 1 / 3,
    mark: (
      <div style={{ width: 54, height: 54, borderRadius: 14, background: '#fff', border: `1px solid ${L.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={30} height={30} viewBox="0 0 30 30">
          <path d="M15 3 a12 12 0 0 1 10.4 6 H15 z" fill="#EA4335" />
          <path d="M25.4 9 a12 12 0 0 1-4.9 16.5 L15 15 z" fill="#34A853" />
          <path d="M20.5 25.5 A12 12 0 0 1 4.6 9 L15 15 z" fill="#FBBC05" />
          <path d="M4.6 9 A12 12 0 0 1 15 3 V15 z" fill="#4285F4" />
        </svg>
      </div>
    ),
  },
];
export const SharedScreen: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {SUBS.map((s, i) => {
        const at = 4 + i * 16;
        const fill = interpolate(frame, [at + 24, at + 64], [0, s.pct], { ...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1) });
        return (
          <In key={s.name} delay={at} y={24}>
            <div style={{ borderRadius: 26, background: '#fff', border: `1px solid ${L.line}`, boxShadow: '0 12px 34px rgba(35,38,20,0.07)', padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {s.mark}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 29, fontWeight: 800, color: L.text }}>{s.name}</div>
                  <div style={{ fontSize: 19, color: L.textSoft, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap' }}>
                    {s.members} · monthly · {s.day}
                  </div>
                </div>
                <div style={{ fontSize: 23, fontWeight: 800, color: L.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{s.price}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: L.cardAlt, overflow: 'hidden' }}>
                  <div style={{ width: `${fill * 100}%`, height: '100%', borderRadius: 4, background: L.accent }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: L.accent }}>{s.paid}</div>
              </div>
            </div>
          </In>
        );
      })}
      <In delay={52} y={12}>
        <div style={{ textAlign: 'center', fontSize: 23, color: L.textSoft, fontWeight: 600, marginTop: 6 }}>
          debts generated monthly — kutip auto
        </div>
      </In>
    </div>
  );
};
