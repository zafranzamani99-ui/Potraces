import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';

/* Paper mix @60fps · comp = 2200 frames (36.7s) · VO: ElevenLabs Daud M (eleven_v3, ms).
 * TEMPO-LOCKED to the bed: dmusic is 84 BPM → beat = 42.857 frames.
 * Acts (beats): hook 0–7 · snap 7–16 · split 16–29 · debts 29–36 · shared 36–42 · finale 42–51.
 * Cuts: 300 · 686 · 1243 · 1543 · 1800. Key hits land on beat multiples. */

const VO: Array<[string, number]> = [
  ['dvo-01.mp3', 21],   // Makan sama-sama, memang seronok.        (2.12s · beat 0.5)
  ['dvo-02.mp3', 150],  // Tapi bila nak bahagi bil… semua senyap. (2.51s · beat 3.5)
  ['dvo-03.mp3', 343],  // Senang je. Snap resit tu.               (2.04s · beat 8)
  ['dvo-04.mp3', 494],  // AI baca semua — siap kira.              (3.16s · beat 11.5)
  ['dvo-05.mp3', 729],  // Split sama rata — terus bahagi.         (3.71s · beat 17)
  ['dvo-06.mp3', 964],  // Trip Penang ke… hutang masing-masing.   (4.68s · beat 22.5)
  ['dvo-07.mp3', 1286], // Siapa hutang kau — semua kat sini.      (2.77s · beat 30)
  ['dvo-08.mp3', 1586], // Netflix share? Kutip tiap bulan, auto.  (3.16s · beat 37)
  ['dvo-09.mp3', 1834], // Settled… Potraces — snap split settle.  (5.80s · beat 42.8)
];

const WHOOSH = [300, 686, 1243, 1543, 1800]; // act cuts (beats 7/16/29/36/42)
const RISER_AT = 334; // receipt scan begins
const POPS = [748, 758, 768, 778]; // friend chips land (¼-beat cascade)
const TAPS = [890, 986, 1329, 1629]; // scan swap · splits ring · debts ring · shared ring
const COIN_AT = 814; // chips settled (beat 19)
const SETTLE_AT = 1843; // chime + burst on the check (beat 43)

export const DebtSound: React.FC = () => (
  <>
    <Audio
      src={staticFile('dmusic.wav')}
      volume={(f) =>
        interpolate(f, [0, 36, 2140, 2198], [0, 0.3, 0.3, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />

    {VO.map(([file, at]) => (
      <Sequence key={file} from={at} durationInFrames={370}>
        <Audio src={staticFile(file)} volume={1} />
      </Sequence>
    ))}

    <Sequence from={RISER_AT} durationInFrames={54}>
      <Audio src={staticFile('dsfx-riser.wav')} volume={0.4} />
    </Sequence>

    {WHOOSH.map((at, i) => (
      <Sequence key={`w${at}`} from={at - 6} durationInFrames={40}>
        <Audio src={staticFile('dsfx-whoosh.wav')} volume={i % 2 === 0 ? 0.32 : 0.25} />
      </Sequence>
    ))}

    {POPS.map((at) => (
      <Sequence key={`p${at}`} from={at} durationInFrames={12}>
        <Audio src={staticFile('dsfx-pop.wav')} volume={0.35} />
      </Sequence>
    ))}

    {TAPS.map((at) => (
      <Sequence key={`t${at}`} from={at} durationInFrames={8}>
        <Audio src={staticFile('dsfx-tap.wav')} volume={0.5} />
      </Sequence>
    ))}

    <Sequence from={COIN_AT} durationInFrames={36}>
      <Audio src={staticFile('dsfx-coin.wav')} volume={0.45} />
    </Sequence>

    <Sequence from={SETTLE_AT} durationInFrames={80}>
      <Audio src={staticFile('dsfx-chime.wav')} volume={0.5} />
    </Sequence>
    <Sequence from={SETTLE_AT} durationInFrames={46}>
      <Audio src={staticFile('dsfx-burst.wav')} volume={0.4} />
    </Sequence>
  </>
);
