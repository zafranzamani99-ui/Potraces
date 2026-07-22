import React from 'react';
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { E } from './theme';
import { INTER } from '../font';
import { BoltAvatar, Bubble, Chip, Kicker, Kinetic, LightningStrike, Shake, StreamText, StrikeIn, TypingDots, Waveform, Bolt } from './fx';

/* Chat column — fixed 900 width, centered, wraps → no collision. */
const ChatCol: React.FC<{ kicker?: string; kickerColor?: string; children: React.ReactNode }> = ({ kicker, kickerColor = E.olive, children }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 900, display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 70 }}>
      {kicker ? <div style={{ marginBottom: 16 }}><Kicker text={kicker} color={kickerColor} delay={2} /></div> : null}
      {children}
    </div>
  </AbsoluteFill>
);
const EchoRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
    <BoltAvatar size={54} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start', maxWidth: 820 }}>{children}</div>
  </div>
);

/* ===== ACT 1 — IGNITION: lightning strikes → Echo ===== */
export const Ignition: React.FC = () => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
    <LightningStrike at={4} />
    <Shake at={10}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <StrikeIn text="Echo" delay={16} size={200} />
      </AbsoluteFill>
    </Shake>
  </AbsoluteFill>
);

/* ===== ACT 2 — HOOK ===== */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {frame < 150 ? (
        <Kinetic text="Malas track duit?" delay={6} size={100} outAt={140} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <Kinetic text="Gunalah Echo" delay={150} size={94} accents={[1]} accentColor={E.gold} />
          <Kinetic text="dalam Potraces." delay={158} size={94} />
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ===== ACT 3 — CHAT (3 proof beats) ===== */
const Ex1: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <ChatCol kicker="Satu ayat, terus rekod" kickerColor={E.olive}>
      <Bubble mine delay={4}>add rm15 lunch at mamak</Bubble>
      {frame >= 30 && frame < 58 ? <EchoRow><TypingDots delay={30} /></EchoRow> : null}
      {frame >= 58 ? (
        <EchoRow>
          <Bubble delay={58}>Lined up RM 15 for lunch — tap to confirm.</Bubble>
          <Chip label="lunch" amount="RM 15.00" delay={86} tapAt={146} kind="went out" />
        </EchoRow>
      ) : null}
    </ChatCol>
  );
};

const Ex2: React.FC = () => {
  const frame = useCurrentFrame();
  const names = ['Ali', 'Abu', 'Siti', 'Maya', 'Zaref'];
  return (
    <ChatCol kicker="Kira siap, hutang siap" kickerColor={E.gold}>
      <Bubble mine delay={4}>netflix rm75 share with ali, abu, siti, maya, zaref</Bubble>
      {frame >= 28 && frame < 50 ? <EchoRow><TypingDots delay={28} /></EchoRow> : null}
      {frame >= 50 ? (
        <EchoRow>
          <Bubble delay={50}><StreamText text="RM 75 ÷ 6 = RM 12.50 each." delay={54} size={40} /></Bubble>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxWidth: 800 }}>
            <Chip label="Netflix" amount="RM 75.00/mo" delay={92} kind="subscription" />
            {names.map((n, i) => <Chip key={n} label={n} amount="RM 12.50" delay={104 + i * 9} kind="owed to you" />)}
          </div>
        </EchoRow>
      ) : null}
    </ChatCol>
  );
};

const Ex3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = [
    { label: 'makan', pct: 34, amt: 'RM 890', c: E.olive },
    { label: 'transport', pct: 16, amt: 'RM 420', c: E.gold },
    { label: 'shopping', pct: 11, amt: 'RM 290', c: E.bronze },
  ];
  return (
    <ChatCol kicker="Tanya apa-apa" kickerColor={E.bronze}>
      <Bubble mine delay={4}>where does my money go eh?</Bubble>
      {frame >= 26 && frame < 44 ? <EchoRow><TypingDots delay={26} /></EchoRow> : null}
      {frame >= 44 ? (
        <EchoRow>
          <Bubble delay={44} style={{ maxWidth: 760 }}>
            <StreamText text="makan takes the biggest cut — RM 890 this month, 34% of everything. transport is second at RM 420." delay={48} size={37} />
          </Bubble>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, width: 700, marginTop: 6 }}>
            {bars.map((b, i) => {
              const g = spring({ frame: frame - 118 - i * 12, fps, config: { damping: 20 } });
              return (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 190, fontFamily: INTER, fontSize: 28, color: E.textSoft, fontWeight: 600 }}>{b.label}</div>
                  <div style={{ flex: 1, height: 24, borderRadius: 12, background: E.cardAlt, overflow: 'hidden', boxShadow: `inset 0 0 0 1px ${E.line}` }}>
                    <div style={{ width: `${b.pct * g}%`, height: '100%', borderRadius: 12, background: b.c }} />
                  </div>
                  <div style={{ width: 120, fontFamily: INTER, fontSize: 27, color: E.text, fontWeight: 800, textAlign: 'right' }}>{b.amt}</div>
                </div>
              );
            })}
          </div>
        </EchoRow>
      ) : null}
    </ChatCol>
  );
};

export const Chat: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={250}><Ex1 /></Sequence>
    <Sequence from={250} durationInFrames={285}><Ex2 /></Sequence>
    <Sequence from={535}><Ex3 /></Sequence>
  </AbsoluteFill>
);

/* ===== ACT 4 — BREADTH: Suara · Nota · Resit ===== */
const VoiceBeat: React.FC = () => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 36 }}>
    <Kicker text="Suara" color={E.olive} delay={2} />
    <Bolt size={90} color={E.gold} />
    <Waveform bars={42} width={720} />
    <div style={{ fontFamily: INTER, fontSize: 44, color: E.textSoft, fontWeight: 600 }}>echo’s listening — just talk…</div>
    <Bubble delay={36} style={{ alignSelf: 'center' }}><StreamText text="makan mamak 12 ringgit" delay={40} cps={12} size={44} /></Bubble>
  </AbsoluteFill>
);

const NoteBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const loaders = ['Echo is reading your note…', 'spotting the amounts…', 'sorting expenses & debts…'];
  const li = Math.min(2, Math.max(0, Math.floor((frame - 8) / 24)));
  const note = 'nabil hutang aku\nawe- 28.5\nnasi pataya lps badminton 14.5\nserambi johor - 8.50';
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 820, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ alignSelf: 'center', marginBottom: 4 }}><Kicker text="Nota" color={E.gold} delay={2} /></div>
        <div style={{ background: E.card, borderRadius: 24, padding: 34, fontFamily: INTER, fontSize: 36, color: E.text, whiteSpace: 'pre-line', lineHeight: 1.5, boxShadow: E.shadow }}>{note}</div>
        {frame < 86 ? (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Bolt size={40} color={E.gold} />
            <span style={{ fontFamily: INTER, fontSize: 34, color: E.olive, fontWeight: 700 }}>{loaders[li]}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Chip label="awe" amount="RM 28.50" delay={88} kind="owed by nabil" />
            <Chip label="nasi pataya" amount="RM 14.50" delay={98} kind="owed by nabil" />
            <Chip label="serambi johor" amount="RM 8.50" delay={108} kind="owed by nabil" />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

const ReceiptBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const items = [['Nasi Lemak Ayam', '9.50'], ['Teh Tarik', '2.50'], ['Roti Bakar', '3.00'], ['Telur 1/2 Masak', '2.40']];
  const shown = Math.max(0, Math.floor((frame - 16) / 16));
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <Kicker text="Resit" color={E.bronze} delay={2} />
      <div style={{ width: 620, background: '#FFFFFF', borderRadius: 22, padding: '38px 42px', fontFamily: INTER, color: E.text, boxShadow: E.shadow }}>
        <div style={{ fontSize: 34, fontWeight: 800, textAlign: 'center', marginBottom: 6 }}>Warung Pak Din</div>
        <div style={{ fontSize: 24, color: E.textFaint, textAlign: 'center', marginBottom: 22 }}>Kuala Lumpur · TNG eWallet</div>
        {items.slice(0, shown).map(([n, p], i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 30, padding: '9px 0', borderBottom: `1px dashed ${E.line}` }}><span>{n}</span><span style={{ fontWeight: 700, color: E.bronze }}>{p}</span></div>)}
        {shown >= items.length ? <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 34, fontWeight: 800, marginTop: 16 }}><span>Total</span><span style={{ color: E.olive }}>RM 17.40</span></div> : null}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Bolt size={40} color={E.gold} />
        <span style={{ fontFamily: INTER, fontSize: 34, color: E.olive, fontWeight: 700 }}>AI is reading your receipt</span>
      </div>
    </AbsoluteFill>
  );
};

export const Breadth: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={130}><VoiceBeat /></Sequence>
    <Sequence from={130} durationInFrames={130}><NoteBeat /></Sequence>
    <Sequence from={260}><ReceiptBeat /></Sequence>
  </AbsoluteFill>
);

/* ===== ACT 5 — TRUST ===== */
export const Trust: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 40 }}>
      <Kicker text="Kau yang pegang kawalan" color={E.deep} delay={2} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <Kinetic text="Kau confirm," delay={8} size={96} />
        <Kinetic text="baru dia simpan." delay={18} size={96} accents={[2]} accentColor={E.olive} />
      </div>
      {frame >= 48 ? <div style={{ marginTop: 20 }}><Chip label="lunch" amount="RM 15.00" delay={48} tapAt={104} kind="went out" big /></div> : null}
    </AbsoluteFill>
  );
};

/* ===== ACT 6 — SIGN-OFF ===== */
export const SignOff: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 26 }}>
      <LightningStrike at={6} />
      <StrikeIn text="Echo" delay={30} size={158} />
      {frame >= 54 ? <Kinetic text="Cakap rojak je." delay={54} size={58} weight={700} color={E.textSoft} accents={[1]} accentColor={E.gold} /> : null}
    </AbsoluteFill>
  );
};
