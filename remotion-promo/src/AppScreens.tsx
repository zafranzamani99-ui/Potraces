import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { L } from './theme';
import { INTER } from './font';
import { Rise, TypeText } from './motion';

/* Light-mode redraws of the real Collectz screens (verbatim copy from src/i18n/en.ts,
 * flow verified against CollectzCreate.tsx / CollectzJoin.tsx).
 * All share ScreenCard geometry so beat cuts read as one device updating.
 * Swap any body for a real screenshot later — same frame. */

const CARD_W = 680;
const CARD_H = 1280;

export const ScreenCard: React.FC<{ delay?: number; children: React.ReactNode }> = ({
  delay = 0,
  children,
}) => (
  <Rise delay={delay} y={44} blur={8}>
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 60,
        background: L.card,
        boxShadow: L.shadow,
        overflow: 'hidden',
        fontFamily: INTER,
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, padding: '64px 56px' }}>{children}</div>
    </div>
  </Rise>
);

const H1: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 52, fontWeight: 800, color: L.text, letterSpacing: -1 }}>{children}</div>
);
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 26, color: L.textFaint, fontWeight: 600, marginBottom: 10 }}>{children}</div>
);
const Field: React.FC<{ filled: boolean; children: React.ReactNode }> = ({ filled, children }) => (
  <div
    style={{
      borderRadius: 20,
      background: L.cardAlt,
      border: `1px solid ${L.line}`,
      padding: '20px 24px',
      fontSize: 34,
      fontWeight: 600,
      color: filled ? L.text : L.textFaint,
      minHeight: 40,
    }}
  >
    {children}
  </div>
);

/* ---------- 1. CREATE: paste → autofill (the hero beat; manual also works) ---------- */
export const CreateScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // beat 1 (0–150): empty form holds while VO says "setup event" — then the paste magic
  const drop = spring({ frame: frame - 150, fps, config: { damping: 22 } });
  const reading = frame >= 160 && frame < 205;
  const catPop = spring({ frame: frame - 226, fps, config: { damping: 18 } });
  return (
    <ScreenCard delay={0}>
      <H1>New session</H1>

      <div style={{ marginTop: 26, borderRadius: 20, border: `2px dashed ${L.line}`, padding: '20px 24px', position: 'relative', minHeight: 90 }}>
        <div style={{ fontSize: 26, color: L.textFaint, fontWeight: 600 }}>Paste WhatsApp message</div>
        {/* the REAL WhatsApp announcement flies into the paste slot */}
        <div
          style={{
            marginTop: 14,
            borderRadius: 16,
            overflow: 'hidden',
            maxHeight: 200,
            opacity: drop,
            transform: `translateY(${interpolate(drop, [0, 1], [340, 0])}px) scale(${interpolate(drop, [0, 1], [1.45, 1])}) rotate(${interpolate(drop, [0, 1], [-3, 0])}deg)`,
            transformOrigin: 'top center',
            boxShadow: `0 ${(1 - drop) * 30}px ${(1 - drop) * 50}px rgba(35,38,20,${(1 - drop) * 0.3})`,
          }}
        >
          <Img src={staticFile('wa-message.jpg')} style={{ width: '100%', display: 'block' }} />
        </div>
        <div style={{ position: 'absolute', right: 20, top: 18, borderRadius: 999, background: L.accent, color: L.onAccent, fontSize: 24, fontWeight: 700, padding: '10px 22px' }}>
          {reading ? 'Reading…' : 'Fill form'}
        </div>
      </div>

      <div style={{ marginTop: 30 }}>
        <Label>Title</Label>
        <Field filled={frame >= 210}>
          {frame < 210 ? 'e.g. Futsal Thursday' : <TypeText text="Badminton Sentul Khamis Malam" delay={210} cps={44} />}
        </Field>
      </div>

      <div style={{ marginTop: 22 }}>
        <Label>Category</Label>
        <div style={{ display: 'flex', gap: 14 }}>
          {['Sport', 'Makan', 'Trip', 'Gift'].map((c) => {
            const active = c === 'Sport' && frame >= 226;
            return (
              <div key={c} style={{ borderRadius: 999, padding: '12px 28px', fontSize: 28, fontWeight: 700, background: active ? L.accent : L.cardAlt, color: active ? L.onAccent : L.textFaint, border: active ? 'none' : `1px solid ${L.line}`, transform: active ? `scale(${interpolate(catPop, [0, 1], [0.9, 1])})` : undefined }}>
                {c}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 22 }}>
        <div style={{ flex: 1 }}>
          <Label>Date &amp; time</Label>
          <Field filled={frame >= 240}>
            {frame < 240 ? 'not set' : <TypeText text="23 Jul, 10:00 PM" delay={240} cps={48} caret={false} />}
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Label>Venue</Label>
          <Field filled={frame >= 252}>
            {frame < 252 ? 'e.g. MG2' : <TypeText text="Sentul" delay={252} cps={30} caret={false} />}
          </Field>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <Label>Amount per person (RM)</Label>
        <Field filled={frame >= 264}>
          {frame < 264 ? '0.00' : <TypeText text="12.00" delay={264} cps={30} caret={false} />}
        </Field>
      </div>

      <div style={{ position: 'absolute', left: 56, right: 56, bottom: 56, borderRadius: 999, background: L.accent, color: L.onAccent, fontSize: 36, fontWeight: 800, textAlign: 'center', padding: '24px 0' }}>
        Create session
      </div>
    </ScreenCard>
  );
};

/* ---------- 2. SHARE code ---------- */
export const ShareScreen: React.FC = () => (
  <ScreenCard delay={0}>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 26 }}>
      <Rise delay={4}><div style={{ fontSize: 30, letterSpacing: 4, color: L.accent, fontWeight: 800 }}>COLLECTZ</div></Rise>
      <Rise delay={8}><div style={{ fontSize: 30, color: L.textFaint, fontWeight: 600 }}>Share code</div></Rise>
      <Rise delay={12}><div style={{ fontSize: 96, fontWeight: 900, color: L.text, letterSpacing: 10, fontVariantNumeric: 'tabular-nums' }}>YSR6HCVB</div></Rise>
      <Rise delay={18}><div style={{ fontSize: 28, color: L.textSoft }}>jejakbaki.my/collectz/YSR6HCVB</div></Rise>
      <Rise delay={26}><div style={{ marginTop: 20, borderRadius: 999, background: L.accent, color: L.onAccent, fontSize: 32, fontWeight: 800, padding: '18px 46px' }}>Copy link</div></Rise>
    </div>
  </ScreenCard>
);

/* ---------- 3. JOIN via code ---------- */
export const JoinCodeScreen: React.FC = () => (
  <ScreenCard delay={0}>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 26 }}>
      <Rise delay={4}><div style={{ fontSize: 30, letterSpacing: 4, color: L.accent, fontWeight: 800 }}>COLLECTZ</div></Rise>
      <Rise delay={8}><div style={{ fontSize: 48, fontWeight: 800, color: L.text }}>Join with a code</div></Rise>
      <Rise delay={14}>
        <div style={{ width: 480, borderRadius: 22, background: L.cardAlt, border: `2px solid ${L.line}`, padding: '26px 30px', fontSize: 52, fontWeight: 800, letterSpacing: 8, color: L.text, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          <TypeText text="YSR6HCVB" delay={20} cps={16} />
        </div>
      </Rise>
      <Rise delay={52}>
        <div style={{ borderRadius: 999, background: L.accent, color: L.onAccent, fontSize: 34, fontWeight: 800, padding: '18px 60px' }}>Open</div>
      </Rise>
    </div>
  </ScreenCard>
);

/* ---------- 3b. EVENT PAGE: what the shared link opens — the "game ad" ---------- */
export const EventPageScreen: React.FC = () => (
  <ScreenCard delay={0}>
    {/* banner — the session's club image slot */}
    <Rise delay={4}>
      <div
        style={{
          borderRadius: 24,
          background: `linear-gradient(135deg, ${L.accent}, #6b6e1e)`,
          padding: '44px 0',
          textAlign: 'center',
          color: L.onAccent,
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: 10,
        }}
      >
        BADMINTON
      </div>
    </Rise>
    <Rise delay={12}>
      <div style={{ fontSize: 44, fontWeight: 800, color: L.text, marginTop: 26, lineHeight: 1.15 }}>
        Badminton Sentul Khamis Malam
      </div>
    </Rise>
    <Rise delay={18}>
      <div style={{ fontSize: 30, color: L.textSoft, fontWeight: 600, marginTop: 14 }}>
        23 Jul, 10:00 PM, Sentul
      </div>
    </Rise>
    <Rise delay={24}>
      <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
        {['Google Maps', 'Waze'].map((m) => (
          <div key={m} style={{ borderRadius: 999, background: L.cardAlt, border: `1px solid ${L.line}`, fontSize: 25, fontWeight: 700, color: L.textSoft, padding: '10px 22px' }}>
            {m}
          </div>
        ))}
      </div>
    </Rise>
    <Rise delay={30}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30, borderTop: `1px solid ${L.line}`, paddingTop: 24 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: L.text }}>RM 12.00 / person</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: L.accent }}>8 of 10 spots filled</div>
      </div>
    </Rise>
    <Rise delay={38}>
      <div style={{ marginTop: 30, borderRadius: 999, background: L.accent, color: L.onAccent, fontSize: 34, fontWeight: 800, textAlign: 'center', padding: '22px 0' }}>
        Join
      </div>
    </Rise>
  </ScreenCard>
);

/* ---------- 3c. TEAM PICK: "Your team" — join a team, full teams locked ---------- */
export const TeamScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const joined = frame >= 60;
  const fill = spring({ frame: frame - 60, fps, config: { damping: 20 } });
  return (
    <ScreenCard delay={0}>
      <H1>Your team</H1>
      <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Rise delay={8}>
          <div
            style={{
              borderRadius: 24,
              background: joined ? `rgba(79,81,4,${0.08 * fill})` : L.cardAlt,
              border: `2px solid ${joined ? L.accent : 'transparent'}`,
              padding: '26px 28px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: L.text }}>Team A</div>
              {joined ? (
                <span style={{ fontSize: 26, fontWeight: 800, color: L.accent }}>You ✓</span>
              ) : (
                <span style={{ borderRadius: 999, background: L.accent, color: L.onAccent, fontSize: 25, fontWeight: 800, padding: '8px 26px' }}>Join</span>
              )}
            </div>
            <div style={{ fontSize: 27, color: L.textSoft, marginTop: 10 }}>
              Aiman, Faiz{joined ? ', Zapp' : ''}, {joined ? '3' : '2'} of 5
            </div>
          </div>
        </Rise>
        <Rise delay={16}>
          <div style={{ borderRadius: 24, background: L.cardAlt, padding: '26px 28px', opacity: 0.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: L.text }}>Team B</div>
              <span style={{ borderRadius: 999, background: L.line, color: L.textSoft, fontSize: 25, fontWeight: 800, padding: '8px 22px' }}>full</span>
            </div>
            <div style={{ fontSize: 27, color: L.textSoft, marginTop: 10 }}>Mira, Danish, Iqbal, Amir, Hafiz, 5 of 5</div>
          </div>
        </Rise>
      </div>
    </ScreenCard>
  );
};

/* ---------- 4. CLAIM: tap "that's you" OR add your name ---------- */
const NAMES = ['Zapp', 'Aiman', 'Faiz', 'Mira'];
export const ClaimScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fill = spring({ frame: frame - 70, fps, config: { damping: 20 } });
  return (
    <ScreenCard delay={0}>
      <H1>Which one is you?</H1>
      <div style={{ fontSize: 27, color: L.textSoft, marginTop: 12, lineHeight: 1.4 }}>
        The organizer already added these names. Tap yours.
      </div>
      <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {NAMES.map((n, i) => {
          const claimed = n === 'Zapp' && frame >= 70;
          return (
            <Rise key={n} delay={8 + i * 6} y={20} blur={4}>
              <div style={{ borderRadius: 22, background: claimed ? `rgba(79,81,4,${0.08 * fill})` : L.cardAlt, border: `2px solid ${claimed ? L.accent : 'transparent'}`, padding: '22px 28px', fontSize: 36, fontWeight: 700, color: L.text, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {n}
                <span style={{ fontSize: 26, fontWeight: 700, color: claimed ? L.accent : L.textFaint }}>{claimed ? 'that’s you ✓' : 'unpaid'}</span>
              </div>
            </Rise>
          );
        })}
      </div>
      {/* not on the list? add yourself (real allClaimed / addSelf path) */}
      <Rise delay={44} y={20}>
        <div style={{ marginTop: 26, fontSize: 25, color: L.textFaint, fontWeight: 600 }}>Takde nama? Add sendiri.</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
          <div style={{ flex: 1, borderRadius: 18, background: L.cardAlt, border: `1px solid ${L.line}`, padding: '18px 22px', fontSize: 30, color: L.textFaint, fontWeight: 600 }}>Your name</div>
          <div style={{ borderRadius: 18, background: L.accent, color: L.onAccent, fontSize: 28, fontWeight: 800, padding: '18px 32px' }}>Add me</div>
        </div>
      </Rise>
    </ScreenCard>
  );
};

/* ---------- 5. PAY: your share + the organizer's real DuitNow QR ---------- */
export const PayScreen: React.FC = () => (
  <ScreenCard delay={0}>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <Rise delay={4}><div style={{ fontSize: 30, letterSpacing: 3, color: L.textFaint, fontWeight: 700 }}>YOUR SHARE</div></Rise>
      <Rise delay={9}><div style={{ fontSize: 100, fontWeight: 900, color: L.text, letterSpacing: -2, marginTop: 6 }}>RM 12.00</div></Rise>
      <Rise delay={14}><div style={{ fontSize: 25, color: L.textFaint, fontWeight: 600, marginTop: 24 }}>Organizer’s QR</div></Rise>
      <Rise delay={16} style={{ marginTop: 12 }}>
        <Img src={staticFile('duitnow-qr.jpeg')} style={{ width: 400, borderRadius: 24 }} />
      </Rise>
      <Rise delay={24} style={{ marginTop: 30 }}>
        <div style={{ fontSize: 27, color: L.accent, fontWeight: 700, textAlign: 'center', maxWidth: 480 }}>Scan, bayar RM 12, before ke after, bila-bila.</div>
      </Rise>
    </div>
  </ScreenCard>
);

/* ---------- 6. PROOF upload ---------- */
export const ProofScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [56, 84], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const R = 2 * Math.PI * 30;
  return (
    <ScreenCard delay={0}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <Rise delay={4}><div style={{ fontSize: 46, fontWeight: 800, color: L.text, textAlign: 'center' }}>Paid? Upload your proof</div></Rise>
        <Rise delay={12} style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', gap: 18 }}>
            {['Photo', 'PDF'].map((b) => (
              <div key={b} style={{ borderRadius: 999, background: b === 'Photo' ? L.accent : L.cardAlt, color: b === 'Photo' ? L.onAccent : L.textSoft, border: b === 'Photo' ? 'none' : `1px solid ${L.line}`, fontSize: 30, fontWeight: 800, padding: '16px 46px' }}>{b}</div>
            ))}
          </div>
        </Rise>
        <Rise delay={30} style={{ marginTop: 36 }}>
          <div style={{ width: 240, borderRadius: 20, background: L.cardAlt, border: `1px solid ${L.line}`, padding: 22 }}>
            <div style={{ height: 14, width: '60%', background: L.line, borderRadius: 7 }} />
            {[86, 72, 90, 56].map((w, i) => <div key={i} style={{ height: 9, width: `${w}%`, background: L.line, borderRadius: 5, marginTop: 13 }} />)}
            <div style={{ height: 14, width: '42%', background: L.accent, borderRadius: 7, marginTop: 16 }} />
          </div>
        </Rise>
        {frame >= 56 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 34 }}>
            <svg width={68} height={68} viewBox="0 0 68 68">
              <circle cx="34" cy="34" r="30" stroke={L.line} strokeWidth="6" fill="none" />
              <circle cx="34" cy="34" r="30" stroke={L.accent} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={R} strokeDashoffset={R * (1 - pct)} transform="rotate(-90 34 34)" />
            </svg>
            <div style={{ fontSize: 27, color: L.textSoft, fontWeight: 700, maxWidth: 360 }}>{pct < 1 ? 'Uploading…' : 'Proof sent, tunggu organizer confirm.'}</div>
          </div>
        ) : null}
      </div>
    </ScreenCard>
  );
};

/* ---------- 7. CONFIRMED / settled ---------- */
export const ConfirmedScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 8, fps, config: { damping: 16 } });
  const draw = spring({ frame: frame - 14, fps, config: { damping: 200 } });
  const Lp = 90;
  return (
    <ScreenCard delay={0}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 28 }}>
        <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.5, 1])})`, opacity: pop }}>
          <svg width={150} height={150} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill={L.accent} />
            <polyline points="28,52 44,67 73,37" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={Lp} strokeDashoffset={Lp * (1 - draw)} />
          </svg>
        </div>
        <Rise delay={20}><div style={{ fontSize: 46, fontWeight: 800, color: L.text }}>Payment confirmed</div></Rise>
        <Rise delay={28}><div style={{ fontSize: 32, color: L.textSoft }}>You’re all set. See you there!</div></Rise>
        <Rise delay={38} style={{ marginTop: 10 }}>
          <div style={{ borderRadius: 999, background: L.accentSoft, color: L.accent, fontSize: 34, fontWeight: 800, padding: '16px 40px' }}>10/10 dah bayar, session settled</div>
        </Rise>
      </div>
    </ScreenCard>
  );
};
