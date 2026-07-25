import React from 'react';
import { AbsoluteFill, Sequence, spring, useCurrentFrame, interpolate, Easing } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { Punch } from './punch';
import { ImgBeat } from './fx';
import { In } from '../debt4/type';
import { ScreenCard, ScanScreen, DebtsHomeScreen, RemindScreen, SharedScreen } from '../debt4/screens';

const GROTESQUE = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const GOLD = '#D9BD55';

/* ---------- shared blocks ---------- */
const CapBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', left: 70, right: 70, bottom: 140, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
    {children}
  </div>
);

const Stat: React.FC<{
  at?: number;
  label: string;
  stat: string;
  sub: string;
  source: string;
  statSize?: number;
  dark?: boolean;
}> = ({ at = 0, label, stat, sub, source, statSize = 170, dark }) => (
  <AbsoluteFill
    style={{
      background: dark ? '#0B0B09' : `linear-gradient(180deg, #FFFFFF 0%, #EFF1E8 100%)`,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
    }}
  >
    <Punch text={label} delay={at + 4} size={42} weight={700} color={dark ? 'rgba(255,255,255,0.7)' : L.textSoft} />
    <Punch text={stat} delay={at + 14} stagger={12} size={statSize} weight={900} color={dark ? GOLD : L.accent} spacing={-4} />
    <Punch text={sub} delay={at + 28} size={44} weight={700} color={dark ? '#fff' : L.text} accentColor={GOLD} />
    <In delay={at + 42}>
      <div style={{ marginTop: 24, borderRadius: 999, border: `1.5px solid ${dark ? 'rgba(255,255,255,0.25)' : L.line}`, padding: '9px 24px', fontSize: 22, fontWeight: 700, color: dark ? 'rgba(255,255,255,0.5)' : L.textFaint, letterSpacing: 1, fontFamily: GROTESQUE }}>
        {source}
      </div>
    </In>
  </AbsoluteFill>
);

/* ---------- PROBLEM ---------- */

/** b1 · 0–260 · 16/hari (KL dusk) */
export const P1: React.FC = () => (
  <ImgBeat src="stock/kl.jpg">
    <CapBlock>
      <Punch text="Setiap hari," delay={14} size={46} weight={600} />
      <Punch text="16" delay={32} size={200} weight={900} spacing={-6} />
      <Punch text="orang Malaysia diisytiharkan muflis." delay={50} size={46} weight={600} />
    </CapBlock>
  </ImgBeat>
);

/** b2 · 260–580 · 49.5% personal loan */
export const P2: React.FC = () => (
  <Stat at={4} label="Punca nombor satu muflis?" stat="49.5%" sub="pinjaman peribadi — bukan bisnes." source="MdI · 2020 – Mac 2024" />
);

/** b3 · 580–1160 · 53,000 bawah 30 · RM 1.9B */
export const P3: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={250}>
      <ImgBeat src="stock/students.jpg" scrim={0.6}>
        <CapBlock>
          <Punch text="Yang paling muda," delay={10} size={44} weight={600} />
          <Punch text="baru 25 tahun." delay={28} size={110} weight={900} />
        </CapBlock>
      </ImgBeat>
    </Sequence>
    <Sequence from={250} durationInFrames={130}>
      <ImgBeat src="stock/queue.jpg" scrim={0.68}>
        <CapBlock>
          <Punch text="53,000 orang bawah 30" delay={8} size={84} weight={900} />
          <Punch text="tanggung hutang terkumpul." delay={26} size={44} weight={600} />
        </CapBlock>
      </ImgBeat>
    </Sequence>
    <Sequence from={380}>
      <Stat at={0} label="program urus hutang AKPK" stat="RM 1.9B" sub="dipegang anak muda." source="AKPK · 2024" />
    </Sequence>
  </AbsoluteFill>
);

/** b4 · 1160–1710 · BNPL 5.1 juta */
export const P4: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={210}>
      <ImgBeat src="stock/phone.jpg" scrim={0.62}>
        <CapBlock>
          <Punch text="Bayar nanti," delay={8} size={44} weight={600} />
          <Punch text="rasa macam bukan duit." delay={26} size={88} weight={900} />
        </CapBlock>
      </ImgBeat>
    </Sequence>
    <Sequence from={210} durationInFrames={160}>
      <ImgBeat src="stock/parcels.jpg" scrim={0.66}>
        <CapBlock>
          <Punch text="5.1 juta" delay={8} size={150} weight={900} spacing={-4} />
          <Punch text="pengguna BNPL di Malaysia." delay={24} size={44} weight={600} />
        </CapBlock>
      </ImgBeat>
    </Sequence>
    <Sequence from={370}>
      <Stat at={0} label="majoriti pengguna BNPL" stat="<RM 5k" sub="gaji sebulan — umur 21 hingga 45." source="MOF · Dewan Negara 2025" statSize={160} />
    </Sequence>
  </AbsoluteFill>
);

/** b5 · 1710–2000 · 61% tak mampu RM 1,000 */
export const P5: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={150}>
      <ImgBeat src="stock/wallet.jpg" scrim={0.66}>
        <CapBlock>
          <Punch text="Bila kecemasan," delay={8} size={44} weight={600} />
          <Punch text="seribu ringgit." delay={24} size={104} weight={900} />
        </CapBlock>
      </ImgBeat>
    </Sequence>
    <Sequence from={150}>
      <Stat at={0} label="rakyat Malaysia tak mampu keluarkannya" stat="61%" sub="naik dari 47% pada 2021." source="BNM · Annual Report 2024" statSize={170} />
    </Sequence>
  </AbsoluteFill>
);

/** b6 · 2000–2400 · kad 5-6 · kahwin loan */
export const P6: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={200}>
      <ImgBeat src="stock/terminal.jpg" scrim={0.64}>
        <CapBlock>
          <Punch text="Gaji RM 2,500," delay={8} size={44} weight={600} />
          <Punch text="kad kredit 5, 6 keping." delay={24} size={84} weight={900} />
        </CapBlock>
      </ImgBeat>
    </Sequence>
    <Sequence from={200}>
      <Stat at={0} label="nak kahwin pun buat personal loan" stat="RM 30k+" sub="kos kahwin: RM 50,000 – 200,000." source="theSun / UMK · 2025" statSize={160} />
    </Sequence>
  </AbsoluteFill>
);

/** b7 · 2400–2720 · EPF 90%+ (tempo build: RM 1.63T flash) */
export const P7: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={110}>
      <Stat at={0} label="hutang isi rumah Malaysia" stat="RM 1.63T" sub="84.2% daripada KDNK." source="BNM · 2024" statSize={160} dark />
    </Sequence>
    <Sequence from={110} durationInFrames={90}>
      <ImgBeat src="stock/ringgit2.jpg" scrim={0.68}>
        <CapBlock>
          <Punch text="Dan simpanan?" delay={6} size={44} weight={600} />
        </CapBlock>
      </ImgBeat>
    </Sequence>
    <Sequence from={200}>
      <Stat at={0} label="pencarum EPF bawah 30 tahun" stat="90%+" sub="jauh ketinggalan persaraan." source="Khazanah / EPF · 2024" statSize={170} />
    </Sequence>
  </AbsoluteFill>
);

/* ---------- SUSPENSION ---------- */

/** S1 · 2720–2900 · "Masalahnya bukan gaji kecil." (near-black) */
export const S1: React.FC = () => (
  <ImgBeat src="stock/traffic.jpg" scrim={0.85}>
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 70px' }}>
      <Punch text="Sebenarnya, masalahnya" delay={10} size={56} weight={700} />
      <Punch text="bukan gaji kecil." delay={60} size={72} weight={900} accent={[1]} accentColor={GOLD} />
    </AbsoluteFill>
  </ImgBeat>
);

/** S2 · 2900–3070 · "kita tak nampak duit tu pergi mana." (hard black) */
export const S2: React.FC = () => (
  <AbsoluteFill style={{ background: '#050504', justifyContent: 'center', alignItems: 'center', padding: '0 70px' }}>
    <Punch text="Kita tak nampak" delay={8} size={56} weight={700} color="rgba(255,255,255,0.85)" />
    <Punch text="duit tu pergi mana." delay={42} size={80} weight={900} accent={[0]} accentColor={GOLD} />
  </AbsoluteFill>
);

/* ---------- SOLUTION ---------- */

/** Echo flash — the AI chat proof. */
const EchoFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = spring({ frame: frame - 10, fps: 60, config: { damping: 16, stiffness: 150 } });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
      <In delay={4}>
        <div style={{ alignSelf: 'flex-end', borderRadius: 24, borderBottomRightRadius: 6, background: '#141410', color: '#fff', fontSize: 32, fontWeight: 600, padding: '18px 26px', fontFamily: INTER }}>
          add rm15 lunch at mamak
        </div>
      </In>
      <In delay={26}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <svg width={40} height={40} viewBox="0 0 24 24"><path d="M13 2 L4.5 13.8 H10.6 L9.6 22 L19.5 9.6 H13.1 Z" fill={GOLD} /></svg>
          <div style={{ borderRadius: 24, borderBottomLeftRadius: 6, background: '#fff', border: `1px solid ${L.line}`, boxShadow: '0 14px 34px rgba(35,38,20,0.12)', fontSize: 30, fontWeight: 600, color: L.text, padding: '18px 26px', fontFamily: INTER, opacity: pop }}>
            Lined up RM 15 for lunch — tap to confirm.
          </div>
        </div>
      </In>
      <In delay={52}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, background: L.accent, padding: '12px 22px', fontFamily: INTER }}>
          <div style={{ width: 24, height: 24, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: L.accent, fontWeight: 900, fontSize: 16 }}>✓</div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>lunch</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>went out · RM 15.00</div>
          </div>
        </div>
      </In>
    </div>
  );
};

/** B10 · 3070–3210 · "Sebab tu Potraces wujud." */
export const A1: React.FC = () => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, #FFFFFF 0%, #EFF1E8 100%)`, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
    <Punch text="Sebab tu" delay={8} size={56} weight={700} color={L.text} />
    <Punch text="Potraces wujud." delay={30} size={104} weight={900} color={L.accent} spacing={-3} />
  </AbsoluteFill>
);

/** B11 · 3210–3490 · snap + echo flashes */
export const A2: React.FC = () => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, #FFFFFF 0%, #EFF1E8 100%)` }}>
    <Sequence durationInFrames={140}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <ScreenCard title="Save Receipt"><ScanScreen /></ScreenCard>
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, textAlign: 'center' }}>
        <Punch text="Snap resit, AI baca." delay={10} size={50} weight={800} color={L.text} accent={[1]} accentColor={L.accent} />
      </div>
    </Sequence>
    <Sequence from={140}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 60px' }}>
        <EchoFlash />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, textAlign: 'center' }}>
        <Punch text="Cakap je — dia rekod." delay={8} size={50} weight={800} color={L.text} accent={[3]} accentColor={L.accent} />
      </div>
    </Sequence>
  </AbsoluteFill>
);

/** B12 · 3490–4000 · debts + shared flashes, "Ingat barang, harga, orang." */
export const A3: React.FC = () => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, #FFFFFF 0%, #EFF1E8 100%)` }}>
    <Sequence durationInFrames={130}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <ScreenCard title="Debts & Splits"><DebtsHomeScreen /></ScreenCard>
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, textAlign: 'center' }}>
        <Punch text="Hutang kawan, split bill —" delay={8} size={48} weight={800} color={L.text} />
      </div>
    </Sequence>
    <Sequence from={130} durationInFrames={130}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <ScreenCard title="Debts & Splits"><SharedScreen /></ScreenCard>
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, textAlign: 'center' }}>
        <Punch text="subscription share — semua track." delay={8} size={48} weight={800} color={L.text} accent={[3]} accentColor={L.accent} />
      </div>
    </Sequence>
    <Sequence from={260}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 18 }}>
        <Punch text="Ingat barang." delay={8} size={80} weight={900} color={L.text} />
        <Punch text="Ingat harga." delay={26} size={80} weight={900} color={L.text} />
        <Punch text="Ingat orang sekali." delay={46} size={80} weight={900} accent={[1]} accentColor={L.accent} />
      </AbsoluteFill>
    </Sequence>
  </AbsoluteFill>
);

/** B13 · 4000–4310 · "Bukan sebab kau lemah." */
export const A4: React.FC = () => (
  <AbsoluteFill style={{ background: '#0B0B09', justifyContent: 'center', alignItems: 'center', gap: 18, padding: '0 60px' }}>
    <Punch text="Bukan sebab kau lemah." delay={8} size={56} weight={700} color="rgba(255,255,255,0.85)" />
    <Punch text="Sistem yang buat kau lupa." delay={70} size={56} weight={700} color="rgba(255,255,255,0.85)" />
    <Punch text="Potraces ingatkan." delay={130} size={88} weight={900} accent={[0]} accentColor={GOLD} />
  </AbsoluteFill>
);

/** B14 · 4310–4460 · end card */
export const A5: React.FC = () => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, #FFFFFF 0%, #EFF1E8 100%)`, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
    <Punch text="Track dulu." delay={8} size={100} weight={900} color={L.text} spacing={-3} />
    <Punch text="Baru berani belanja." delay={28} size={100} weight={900} accent={[0, 2]} accentColor={L.accent} spacing={-3} />
    <In delay={64}>
      <div style={{ fontSize: 30, letterSpacing: 9, color: L.accent, fontWeight: 800, fontFamily: INTER, marginTop: 12 }}>POTRACES · jejakbaki.my</div>
    </In>
  </AbsoluteFill>
);
