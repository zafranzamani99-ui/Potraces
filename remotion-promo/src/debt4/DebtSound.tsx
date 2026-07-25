import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';

/* HutangPromo mix @60fps · comp = 2559 frames (42.7s) · VO: ElevenLabs Daud M,
 * natural takes. CUE MATH: measured speech bounds, ≥5f real silence between
 * clips, every clip's speech ends inside its own scene.
 * Signature audio moments:
 *  · roll-call PING per row (6/66/126) — pile collapses at 258 once
 *    mohsin's line is done (256) → BEAT STOP → RM 140 boom at 290
 *  · dvo-04 "Track semua hutang satu tempat." answers the slam
 *  · the HALAL INTERRUPT — music dies at 1486, bed returns for remind
 * Bed = 108 BPM groove, ducked to 55% under speech elsewhere.
 * Acts: hook 0–624 · snap+split 624–1244 · splits 1244–1394 ·
 * trackhome 1394–1494 · interrupt 1494–1774 · remind 1774–2034 ·
 * settle 2034–2174 · shared 2174–2359 · finale 2359–2559. */

// [file, cue frame, speech-end frame] — speech-end feeds the ducking windows.
const VO: Array<[string, number, number]> = [
  ['dvo-01.mp3', 12, 89],    // Aiman, 30 ringgit.              (row 1 at 6)
  ['dvo-02.mp3', 89, 146],   // Zikri, makan.                   (row 2 at 66)
  ['dvo-03.mp3', 152, 256],  // Mohsin, 50 ringgit.             (row 3 at 126)
  ['dvo-04.mp3', 298, 401],  // Track semua hutang satu tempat. (answers the slam)
  ['dvo-05.mp3', 407, 618],  // Ingat barang. harga. orang sekali. (the turn, one take)
  ['dvo-06.mp3', 630, 777],  // Makan keluar? Snap je resit tu. (scan)
  ['dvo-07.mp3', 793, 998],  // AI baca semua…                  (result)
  ['dvo-08.mp3', 1013, 1170],// Split ikut kepala ke, sama rata…(split)
  ['dvo-13.mp3', 1250, 1341],// Terus jadi hutang masing-masing.(splits overview)
  ['dvo-09.mp3', 1500, 1758],// Malas nak kejar… nanti halal…   (THE INTERRUPT)
  ['dvo-10.mp3', 1776, 2026],// Remind — terus masuk WhatsApp…  (remind)
  ['dvo-14.mp3', 2044, 2148],// Dia bayar — terus collected.    (settle)
  ['dvo-11.mp3', 2186, 2338],// Share sama-sama Netflix? …      (shared)
  ['dvo-12.mp3', 2377, 2517],// Hutang. Track dulu. Settle.     (finale)
];

const WHOOSH = [624, 1244, 1394, 1774, 2034, 2174, 2359];
const RISER_AT = 757; // builds into the AI result reveal (787)
const PINGS = [6, 66, 126]; // notification ping per roll-call row
const BOOM_AT = 290; // RM 140 slam, after mohsin's line ends
const POPS = [
  813, 818, 823, 828, // result item rows (787 + 26+i*5)
  1029, 1035, 1041, 1047, // split friend chips (1007 + 22+k*6)
  1268, 1276, // splits overview rows (1244 + 24/32)
  2178, 2194, 2210, // shared sub cards (2174 + 4+i*16)
];
const TAPS = [
  728,  // scan done flash (624 + 104)
  1404, // debts tiles (1394 + 10)
  1870, // QR attaches (1774 + 96)
  1928, // WhatsApp press (1774 + 154)
  2074, // zikri strike lands (2034 + 40)
];
const COINS: Array<[number, number]> = [
  [1117, 0.45], // "Split created!" (1007 + 110)
  [2108, 0.4],  // owed card flips to "collected" (2034 + 74)
];
const SETTLE_AT = 2365; // chime + burst on the finale check (2359 + 6)

/* Bed level: 0.42 with broadcast ducking (55% under speech) plus hard CUTS
 * for the signature moments (beat stop + the halal interrupt). */
const BED = 0.42;
const DUCK = 0.55;
const CUTS: Array<[number, number, number]> = [
  [282, 288, 0.06], // beat stop into the RM 140 slam (boom at 290)
  [1486, 1776, 0.0], // the halal interrupt — full music cut
];
const bedVolume = (f: number) => {
  const fade = interpolate(f, [0, 30, 2500, 2557], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  let duck = 1;
  for (const [, at, end] of VO) {
    if (f >= at - 8 && f <= end + 8) {
      const rampIn = interpolate(f, [at - 8, at], [1, DUCK], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const rampOut = interpolate(f, [end, end + 8], [DUCK, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      duck = Math.min(duck, f < at ? rampIn : f > end ? rampOut : DUCK);
    }
  }
  let cut = 1;
  for (const [a, b, lvl] of CUTS) {
    if (f >= a - 8 && f <= b + 8) {
      const rampIn = interpolate(f, [a - 8, a], [1, lvl], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const rampOut = interpolate(f, [b, b + 8], [lvl, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      cut = Math.min(cut, f < a ? rampIn : f > b ? rampOut : lvl);
    }
  }
  return BED * fade * duck * cut;
};

export const DebtSound: React.FC = () => (
  <>
    <Audio src={staticFile('dmusic.wav')} volume={bedVolume} />

    {VO.map(([file, at]) => (
      <Sequence key={file} from={at} durationInFrames={420}>
        <Audio src={staticFile(file)} volume={1} />
      </Sequence>
    ))}

    <Sequence from={RISER_AT} durationInFrames={54}>
      <Audio src={staticFile('dsfx-riser.wav')} volume={0.4} />
    </Sequence>

    {PINGS.map((at) => (
      <Sequence key={`n${at}`} from={at} durationInFrames={16}>
        <Audio src={staticFile('dsfx-ping.wav')} volume={0.5} />
      </Sequence>
    ))}

    <Sequence from={BOOM_AT} durationInFrames={48}>
      <Audio src={staticFile('dsfx-boom.wav')} volume={0.6} />
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

    {COINS.map(([at, v]) => (
      <Sequence key={`c${at}`} from={at} durationInFrames={36}>
        <Audio src={staticFile('dsfx-coin.wav')} volume={v} />
      </Sequence>
    ))}

    <Sequence from={SETTLE_AT} durationInFrames={80}>
      <Audio src={staticFile('dsfx-chime.wav')} volume={0.5} />
    </Sequence>
    <Sequence from={SETTLE_AT} durationInFrames={46}>
      <Audio src={staticFile('dsfx-burst.wav')} volume={0.4} />
    </Sequence>
  </>
);
