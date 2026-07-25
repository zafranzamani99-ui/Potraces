import React from 'react';
import { AbsoluteFill, Sequence, spring, useCurrentFrame, interpolate, Easing, random } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { Caption, In, Ring, ScanLine, ShotCard, Underline } from './fx';
import { Chars, KType2, Slam } from './ktype2';

const big: React.CSSProperties = {
  fontFamily: INTER,
  fontSize: 90,
  fontWeight: 800,
  color: L.text,
  letterSpacing: -3,
  lineHeight: 1.08,
};

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 60 }}>
    {children}
  </AbsoluteFill>
);

/* ============ S1 · HOOK (300 = 5s · beats 0–7): the shared meal, the silence ============ */
export const Hook: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
    <Sequence durationInFrames={150}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 10 }}>
        <KType2 text="Makan sama-sama," delay={8} stagger={7} outAt={136} style={big} />
        <Slam text="seronok." delay={34} outAt={138} accent={[0]} style={{ ...big, fontSize: 118 }} />
      </AbsoluteFill>
    </Sequence>
    <Sequence from={150}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 10 }}>
        <KType2 text="Bahagi bil?" delay={6} stagger={8} outAt={134} style={big} />
        <Slam text="Semua senyap." delay={32} outAt={136} color={L.textSoft} style={{ ...big, fontSize: 104 }} />
      </AbsoluteFill>
    </Sequence>
  </AbsoluteFill>
);

/* ============ S2 · SNAP (386 = 6.4s · beats 7–16): receipt → AI reads it ============ */
export const Snap: React.FC = () => {
  const frame = useCurrentFrame();
  const swap = interpolate(frame, [190, 218], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });
  return (
    <AbsoluteFill>
      <Center>
        <div style={{ opacity: 1 - swap, transform: `scale(${1 - swap * 0.04}) translateY(${swap * -30}px)` }}>
          <ShotCard src="receipt-scan.png" ry={-6}>
            <ScanLine from={34} to={150} doneAt={160} />
          </ShotCard>
        </div>
      </Center>
      {frame >= 190 ? (
        <Center>
          <div style={{ opacity: swap, transform: `translateY(${(1 - swap) * 70}px) scale(${0.96 + swap * 0.04})` }}>
            <ShotCard src="receipt-result.png" enterAt={190} ry={5}>
              <Underline at={252} x={88} y={586} w={200} />
            </ShotCard>
          </div>
        </Center>
      ) : null}

      <Sequence durationInFrames={190}><Caption delay={12} accent={[2, 3]}>Makan keluar? Snap je resit.</Caption></Sequence>
      <Sequence from={190}><Caption delay={10} accent={[0]}>AI baca, siap kira.</Caption></Sequence>
    </AbsoluteFill>
  );
};

/* ============ S3 · SPLIT (557 = 9.3s · beats 16–29): the math, then owed back ============ */
const FRIENDS = ['Z', 'A', 'F', 'M'];
export const Split: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {/* beat 1: the math — total divides into four */}
      {frame < 262 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 40 }}>
          <KType2 text="RM 129.60 ÷ 4" delay={8} outAt={240} style={{ ...big, fontSize: 96 }} />
          <div style={{ display: 'flex', gap: 22 }}>
            {FRIENDS.map((f, i) => {
              const s = spring({ frame: frame - 62 - i * 10, fps: 60, config: { damping: 13, stiffness: 170 } });
              return (
                <div
                  key={f}
                  style={{
                    opacity: s,
                    transform: `translateY(${(1 - s) * 34}px) scale(${interpolate(s, [0, 1], [0.6, 1])})`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 46,
                      background: `linear-gradient(140deg, #6b6e1e, ${L.accent})`,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: INTER,
                      fontSize: 40,
                      fontWeight: 900,
                      boxShadow: '0 14px 34px rgba(79,81,4,0.3)',
                    }}
                  >
                    {f}
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 800, color: L.accent }}>RM 32.40</div>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* beat 2: the Splits tab — you're owed back RM 316 (ring on the beat: 23) */}
      {frame >= 240 ? (
        <Center>
          <ShotCard src="splits.png" enterAt={240} ry={-5}>
            <Ring at={300} x={26} y={658} w={300} h={88} />
          </ShotCard>
        </Center>
      ) : null}

      <Sequence durationInFrames={240}><Caption delay={10} accent={[1]}>Sekali split, terus bahagi.</Caption></Sequence>
      <Sequence from={240}><Caption delay={8}>Terus jadi hutang masing-masing.</Caption></Sequence>
    </AbsoluteFill>
  );
};

/* ============ S4 · DEBTS (300 = 5s · beats 29–36): who owes who, tracked ============ */
export const Debts: React.FC = () => (
  <AbsoluteFill>
    <Center>
      <ShotCard src="debts.png" ry={6}>
        {/* "Owed to You RM 60.00 collected" tile — measured: orig x599–1135 y385–675 */}
        <Ring at={86} x={302} y={192} w={284} h={158} />
        {/* zikri row — they owe you RM 60.00: orig y1904–2122 */}
        <Ring at={170} x={10} y={970} w={584} h={126} />
      </ShotCard>
    </Center>
    <Caption delay={12} accent={[4, 5, 6]}>Siapa hutang kau, semua kat sini.</Caption>
  </AbsoluteFill>
);

/* ============ S5 · SHARED (257 = 4.3s · beats 36–42): Netflix, collected monthly ============ */
export const Shared: React.FC = () => (
  <AbsoluteFill>
    <Center>
      <ShotCard src="shared.png" ry={-6}>
        <Ring at={86} x={10} y={546} w={584} h={150} />
      </ShotCard>
    </Center>
    <Caption delay={12} accent={[3, 4]}>Netflix share? Kutip auto.</Caption>
  </AbsoluteFill>
);

/* ============ S6 · FINALE (400 = 6.7s · beats 42–51): settled → sign-off ============ */
export const Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = spring({ frame: frame - 8, fps: 60, config: { damping: 14, stiffness: 160 } });
  const draw = interpolate(frame, [14, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const Lp = 90;
  return (
    <AbsoluteFill>
      {/* settled check */}
      {frame < 190 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 24, opacity: interpolate(frame, [166, 190], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.4, 1])})`, opacity: pop, filter: 'drop-shadow(0 18px 44px rgba(79,81,4,0.3))' }}>
            <svg width={150} height={150} viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill={L.accent} />
              <polyline points="28,52 44,67 73,37" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={Lp} strokeDashoffset={Lp * (1 - draw)} />
            </svg>
          </div>
          <In delay={24}><div style={{ fontSize: 52, fontWeight: 800, color: L.text, fontFamily: INTER }}>settled up</div></In>
          <In delay={34}><div style={{ fontSize: 32, color: L.textSoft, fontFamily: INTER }}>takde awkward dah</div></In>
        </AbsoluteFill>
      ) : null}

      {/* paper confetti burst */}
      {Array.from({ length: 30 }, (_, i) => {
        const f = frame - 22;
        if (f < 0 || f > 60) return null;
        const p = f / 60;
        const ang = random(`la${i}`) * Math.PI * 2;
        const v = 240 + random(`lv${i}`) * 560;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 540 + Math.cos(ang) * v * p,
              top: 800 + Math.sin(ang) * v * p + 640 * p * p,
              width: 5 + random(`ls${i}`) * 8,
              height: 8 + random(`lh${i}`) * 6,
              borderRadius: 2,
              background: i % 3 === 0 ? L.accent : i % 3 === 1 ? '#B9B35A' : '#D9BD55',
              opacity: 1 - p,
              transform: `rotate(${random(`lr${i}`) * 360 + p * 420}deg)`,
            }}
          />
        );
      })}

      {/* sign-off */}
      {frame >= 180 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 20 }}>
          <In delay={186}>
            <div style={{ fontSize: 34, letterSpacing: 9, color: L.accent, fontWeight: 800, fontFamily: INTER }}>POTRACES</div>
          </In>
          <KType2 text="Snap. Split." delay={198} style={{ ...big, fontSize: 100 }} />
          <Chars text="Settle." delay={222} style={{ ...big, fontSize: 100, color: L.accent }} />
          <In delay={248}>
            <div style={{ fontSize: 34, color: L.textSoft, fontWeight: 600, fontFamily: INTER, marginTop: 4 }}>
              Debts, splits &amp; shared subs
            </div>
          </In>
        </AbsoluteFill>
      ) : null}

      <Sequence durationInFrames={160}><Caption delay={48} accent={[0]}>Settled. Takde awkward dah.</Caption></Sequence>
    </AbsoluteFill>
  );
};
