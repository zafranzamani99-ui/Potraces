import React from 'react';
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { CountUp, In } from '../debt4/type';
import { Bolt, TypingDots } from '../echo/fx';

/* ================================================================== *
 * Tour screens — real app copy/data (src/i18n, sample personas,
 * jejakbaki screenshots). Fast tempo: everything lands in ≤ 40f.
 * ================================================================== */

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/* ---------- 1 · LOGGED — every receipt becomes a tracked expense ---------- */
const EXPENSES: Array<{ m: string; amt: string; cat: string; when: string; fresh?: boolean }> = [
  { m: 'Sushi Monster', amt: 'RM 129.60', cat: 'Food & Dining', when: 'just now', fresh: true },
  { m: 'Warung Pak Din', amt: 'RM 17.40', cat: 'Food & Dining', when: 'yesterday' },
  { m: 'Petronas', amt: 'RM 40.00', cat: 'Transport', when: 'yesterday' },
];
export const LoggedScreen: React.FC = () => (
  <>
    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ fontSize: 22, color: L.textFaint, fontWeight: 600 }}>this week</div>
    </div>
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {EXPENSES.map((e, i) => (
        <In key={e.m} delay={12 + i * 6} y={16}>
          <div
            style={{
              borderRadius: 24,
              background: '#fff',
              border: e.fresh ? `1.5px solid ${L.accent}` : `1px solid ${L.line}`,
              boxShadow: e.fresh ? '0 14px 38px rgba(79,81,4,0.12)' : '0 10px 30px rgba(35,38,20,0.06)',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div style={{ width: 50, height: 50, borderRadius: 14, background: e.fresh ? L.accentSoft : L.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={L.accent} strokeWidth={2}><path d="M4 3h16v18l-2.5-1.6L15 21l-2.5-1.6L10 21l-2.5-1.6L5 21V3z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 27, fontWeight: 800, color: L.text }}>{e.m}</div>
              <div style={{ fontSize: 21, color: L.textFaint, fontWeight: 600, marginTop: 3 }}>
                {e.cat} · {e.when}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 27, fontWeight: 800, color: L.text, fontVariantNumeric: 'tabular-nums' }}>{e.amt}</div>
              {e.fresh ? <div style={{ fontSize: 20, fontWeight: 800, color: L.accent, marginTop: 3 }}>✓ saved</div> : null}
            </div>
          </div>
        </In>
      ))}
    </div>
    <In delay={36} y={10}>
      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 23, color: L.textSoft, fontWeight: 600 }}>
        auto-categorized — no typing
      </div>
    </In>
  </>
);

/* ---------- 2 · WALLETS — every account, one place (real personas data) ---------- */
const BANKS: Array<{ name: string; bal: string; logo: string; def?: boolean }> = [
  { name: 'CIMB OctoSavers', bal: 'RM 2,800.00', logo: 'logos/cimb-logo.png' },
  { name: 'Maybank Savings', bal: 'RM 1,420.00', logo: 'logos/maybank-logo.png', def: true },
];
const EWALLETS: Array<{ name: string; bal: string; logo: string }> = [
  { name: "Touch 'n Go", bal: 'RM 65.00', logo: 'logos/touchngo-logo.png' },
  { name: 'GrabPay', bal: 'RM 18.50', logo: 'logos/grab-pay-logo.png' },
  { name: 'ShopeePay', bal: 'RM 8.00', logo: 'logos/shopee-pay-logo.png' },
];

const WalletRow: React.FC<{ name: string; bal: string; logo: string; def?: boolean; at: number }> = ({ name, bal, logo, def, at }) => (
  <In delay={at} y={14}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 6px', borderBottom: `1px dashed ${L.line}` }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fff', border: `1px solid ${L.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Img src={staticFile(logo)} style={{ width: 34, height: 34, objectFit: 'contain' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 25, fontWeight: 700, color: L.text }}>{name}</span>
        {def ? (
          <span style={{ fontSize: 17, fontWeight: 800, color: '#9A6400', background: '#FFF7E6', border: '1px solid #DEAB22', borderRadius: 999, padding: '3px 10px' }}>★ Default</span>
        ) : null}
      </div>
      <span style={{ fontSize: 25, fontWeight: 800, color: L.text, fontVariantNumeric: 'tabular-nums' }}>{bal}</span>
    </div>
  </In>
);

export const WalletsScreen: React.FC = () => (
  <>
    <In delay={6}>
      <div style={{ marginTop: 20, borderRadius: 26, background: L.accentSoft, border: `1.5px solid ${L.accent}`, padding: '20px 24px', boxShadow: '0 14px 38px rgba(79,81,4,0.10)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 22, color: L.accent, fontWeight: 700 }}>Cash Balance</div>
          <div style={{ fontSize: 19, color: L.accent, fontWeight: 700, opacity: 0.75 }}>10 wallets</div>
        </div>
        <div style={{ fontSize: 52, fontWeight: 800, color: L.accent, letterSpacing: -1.5, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
          <CountUp to={12961.5} delay={10} dur={26} fmt={(v) => `RM ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        </div>
        <div style={{ fontSize: 21, color: L.textSoft, fontWeight: 600, marginTop: 6 }}>Credit Available RM 11,753.00 · 1 bill this week</div>
      </div>
    </In>
    <In delay={10} y={10}>
      <div style={{ fontSize: 20, color: L.textFaint, fontWeight: 800, letterSpacing: 1.5, marginTop: 20 }}>BANK ACCOUNT (2)</div>
    </In>
    {BANKS.map((b, i) => (
      <WalletRow key={b.name} {...b} at={12 + i * 6} />
    ))}
    <In delay={28} y={10}>
      <div style={{ fontSize: 20, color: L.textFaint, fontWeight: 800, letterSpacing: 1.5, marginTop: 18 }}>E-WALLET (3)</div>
    </In>
    {EWALLETS.map((w, i) => (
      <WalletRow key={w.name} {...w} at={32 + i * 6} />
    ))}
  </>
);

/* ---------- 3 · ECHO — ask anything, it counts, you decide ---------- */
const ECHO_REPLY = 'makan takes the biggest cut — RM 890 this month, 34% of everything. transport is second at RM 420.';
const BARS: Array<{ label: string; amt: string; pct: number; color: string; at: number }> = [
  { label: 'makan', amt: 'RM 890', pct: 1, color: L.accent, at: 100 },
  { label: 'transport', amt: 'RM 420', pct: 0.47, color: '#DEAB22', at: 110 },
  { label: 'shopping', amt: 'RM 290', pct: 0.33, color: '#B2780A', at: 120 },
];
export const EchoScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = Math.floor(interpolate(frame, [66, 66 + ECHO_REPLY.length * 0.55], [0, ECHO_REPLY.length], CLAMP));
  return (
    <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* user asks */}
      <In delay={10} y={14} style={{ alignSelf: 'flex-end', maxWidth: '86%' }}>
        <div style={{ background: L.accent, color: '#fff', fontSize: 25, fontWeight: 600, padding: '16px 22px', borderRadius: 24, borderBottomRightRadius: 6, boxShadow: '0 12px 30px rgba(79,81,4,0.22)' }}>
          where does my money go eh?
        </div>
      </In>
      {/* echo types, then answers */}
      {frame >= 38 && frame < 66 ? (
        <div style={{ alignSelf: 'flex-start', transform: 'scale(0.72)', transformOrigin: 'left top', marginBottom: -18 }}>
          <TypingDots delay={38} />
        </div>
      ) : null}
      {frame >= 66 ? (
        <div style={{ alignSelf: 'flex-start', maxWidth: '92%', display: 'flex', gap: 12 }}>
          <div style={{ marginTop: 4, flexShrink: 0 }}>
            <Bolt size={30} color="#DEAB22" glow="drop-shadow(0 0 6px #DEAB22)" />
          </div>
          <div style={{ background: '#fff', border: `1px solid ${L.line}`, fontSize: 24, fontWeight: 500, color: L.text, lineHeight: 1.45, padding: '16px 20px', borderRadius: 22, borderTopLeftRadius: 6, boxShadow: '0 12px 30px rgba(35,38,20,0.08)', minHeight: 120 }}>
            {ECHO_REPLY.slice(0, shown)}
            {shown < ECHO_REPLY.length ? <span style={{ color: L.accent }}>▌</span> : null}
          </div>
        </div>
      ) : null}
      {/* the breakdown */}
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {BARS.map((b) => {
          const fill = interpolate(frame, [b.at + 4, b.at + 34], [0, b.pct], { ...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1) });
          return (
            <In key={b.label} delay={b.at} y={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 110, fontSize: 22, fontWeight: 700, color: L.text }}>{b.label}</div>
                <div style={{ flex: 1, height: 14, borderRadius: 7, background: L.cardAlt, overflow: 'hidden' }}>
                  <div style={{ width: `${fill * 100}%`, height: '100%', borderRadius: 7, background: b.color }} />
                </div>
                <div style={{ width: 100, textAlign: 'right', fontSize: 22, fontWeight: 800, color: L.text, fontVariantNumeric: 'tabular-nums' }}>{b.amt}</div>
              </div>
            </In>
          );
        })}
      </div>
    </div>
  );
};
