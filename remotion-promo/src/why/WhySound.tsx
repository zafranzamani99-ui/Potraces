import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';

/* Why-essay mix v2 @60fps · comp = 4460 frames (74.3s) · VO: Zain (newsroom).
 * Serious only: bed + deep whooshes + one riser. No pops/coins/chimes.
 * Beats: p1 0 · p2 260 · p3 580 · p4 1160 · p5 1710 · p6 2000 · p7 2400 ·
 * susp 2720/2900 · sol 3070 · a2 3210 · a3 3490 · a4 4000 · end 4310 */

const VO: Array<[string, number]> = [
  ['wvo-01.mp3', 14],   // 16/hari                      (3.87s)
  ['wvo-02.mp3', 274],  // 49.5% pinjaman peribadi      (5.07s)
  ['wvo-03.mp3', 594],  // 53k bawah 30 RM 1.9B         (9.33s)
  ['wvo-04.mp3', 1174], // BNPL 5.1 juta <RM5k          (8.91s)
  ['wvo-05.mp3', 1724], // 61% tak mampu RM1k           (4.60s)
  ['wvo-06.mp3', 2014], // kad 5-6 · kahwin loan        (6.35s)
  ['wvo-07.mp3', 2414], // 90%+ ketinggalan persaraan   (5.07s)
  ['wvo-08.mp3', 2734], // bukan gaji kecil             (2.59s)
  ['wvo-09.mp3', 2914], // tak nampak duit pergi mana   (2.69s)
  ['wvo-10.mp3', 3084], // sebab tu Potraces wujud      (2.04s)
  ['wvo-11.mp3', 3224], // snap + cakap je dia rekod    (4.36s)
  ['wvo-12.mp3', 3504], // semua track · ingat semua    (8.12s)
  ['wvo-13.mp3', 4014], // bukan lemah — ingatkan       (4.91s)
  ['wvo-14.mp3', 4324], // track dulu, baru berani      (2.12s)
];

const WHOOSH = [260, 580, 1160, 1710, 2000, 2400, 2720, 3070, 3210, 3490, 4000, 4310];
const RISER_AT = 2620; // into suspension

export const WhySound: React.FC = () => (
  <>
    {/* bed — ducks hard through the suspension, returns at the solution */}
    <Audio
      src={staticFile('dmusic.wav')}
      volume={(f) =>
        interpolate(
          f,
          [0, 50, 2620, 2720, 2900, 3060, 3170, 4400, 4458],
          [0, 0.22, 0.22, 0.07, 0.07, 0.07, 0.24, 0.24, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        )
      }
    />

    {VO.map(([file, at]) => (
      <Sequence key={file} from={at} durationInFrames={720}>
        <Audio src={staticFile(file)} volume={1} />
      </Sequence>
    ))}

    <Sequence from={RISER_AT} durationInFrames={54}>
      <Audio src={staticFile('dsfx-riser.wav')} volume={0.45} />
    </Sequence>

    {WHOOSH.map((at, i) => (
      <Sequence key={`w${at}`} from={at - 6} durationInFrames={40}>
        <Audio src={staticFile('dsfx-whoosh.wav')} volume={i % 2 === 0 ? 0.26 : 0.18} />
      </Sequence>
    ))}

    {/* single deep hit when the solution lands */}
    <Sequence from={3070} durationInFrames={40}>
      <Audio src={staticFile('dsfx-whoosh.wav')} volume={0.5} />
    </Sequence>
  </>
);
