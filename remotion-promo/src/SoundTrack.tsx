import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';

/* v8 mix @60fps · comp = 1920 frames (32s) · Malaysian VO (Daud M, eleven_v3).
 * Grid from MEASURED clip durations.
 * Cuts: hook2 100 · organizer 270 · share 600 · eventpage 740 · claim 890 ·
 *       team 1000 · pay 1120 · proof 1290 · confirmed 1420 · signoff 1660 */

const VO: Array<[string, number]> = [
  ['vo-01.mp3', 4],    // Nak organize social game?            (1.49s)
  ['vo-02.mp3', 106],  // Futsal, badminton, makan-makan, trip (2.69s)
  ['vo-03.mp3', 276],  // Setup event kau dalam Collectz.      (2.27s)
  ['vo-04.mp3', 444],  // Paste chat WhatsApp, sambung isi form (2.27s)
  ['vo-05.mp3', 606],  // Share link, advertise game kau.      (1.88s)
  ['vo-06.mp3', 746],  // Member bukak link, letak nama.       (2.19s)
  ['vo-07.mp3', 1006], // Pilih team sendiri.                  (1.07s)
  ['vo-08.mp3', 1126], // Scan QR, bayar bila-bila.            (2.35s)
  ['vo-09.mp3', 1296], // Upload bukti bayaran.                (1.72s)
  ['vo-10.mp3', 1426], // Kau confirm je, habis cerita.        (1.80s)
  ['vo-11.mp3', 1546], // Tak payah pening dekat WhatsApp lagi (1.72s)
  ['vo-12.mp3', 1668], // Collectz. Organize, share, settle.   (3.97s)
];

const WHOOSH = [100, 270, 600, 740, 890, 1000, 1120, 1290, 1420, 1660];
const POPS = [480, 496, 510, 522, 534]; // autofill (organizer + 210/226/240/252/264)
const TICKS = [630, 960, 1060]; // Copy link · claim tap · team join
const CHIME_AT = 1434; // confirmed check draws

export const SoundTrack: React.FC = () => (
  <>
    <Audio
      src={staticFile('music.wav')}
      volume={(f) =>
        interpolate(f, [0, 40, 1830, 1918], [0, 0.3, 0.3, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />

    {VO.map(([file, at]) => (
      <Sequence key={file} from={at} durationInFrames={300}>
        <Audio src={staticFile(file)} volume={0.95} />
      </Sequence>
    ))}

    {WHOOSH.map((at, i) => (
      <Sequence key={`w${at}`} from={at - 6} durationInFrames={40}>
        <Audio src={staticFile('sfx-whoosh.wav')} volume={i % 2 === 0 ? 0.32 : 0.24} />
      </Sequence>
    ))}

    {POPS.map((at) => (
      <Sequence key={`p${at}`} from={at} durationInFrames={16}>
        <Audio src={staticFile('sfx-pop.wav')} volume={0.4} />
      </Sequence>
    ))}

    {TICKS.map((at) => (
      <Sequence key={`t${at}`} from={at} durationInFrames={10}>
        <Audio src={staticFile('sfx-tick.wav')} volume={0.5} />
      </Sequence>
    ))}

    <Sequence from={CHIME_AT} durationInFrames={80}>
      <Audio src={staticFile('sfx-chime.wav')} volume={0.5} />
    </Sequence>
  </>
);
