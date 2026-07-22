import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';

/* Echo v3 mix @60fps · comp 1980 frames (~33s) · Malaysian male VO (Zain, "Eko") + sharp SFX + music.
 * Clarity-first: VO lines spaced with pauses. Cuts: hook60 · ex1 350 · ex2 600 · ex3 885 ·
 * voice 1090 · note 1220 · receipt 1350 · trust 1445 · signoff 1740 */

const VO: Array<[string, number]> = [
  ['evo-01.mp3', 72],   // Eh, malas nak track duit satu-satu?  (2.19s)
  ['evo-02.mp3', 215],  // Gunalah Eko dalam Potraces.          (2.27s)
  ['evo-03.mp3', 395],  // Taip je. Eko dah sedia, kau confirm. (2.27s)
  ['evo-04.mp3', 628],  // Split bill? Sekali jadi…             (4.36s)
  ['evo-05.mp3', 925],  // Tanya apa-apa pasal duit kau.        (1.65s)
  ['evo-06.mp3', 1110], // Cakap ke, tulis ke, snap resit ke…   (4.91s)
  ['evo-07.mp3', 1465], // Tapi Eko tak simpan sendiri tau.     (2.04s)
  ['evo-08.mp3', 1610], // Kau confirm dulu, baru dia simpan.   (2.19s)
  ['evo-09.mp3', 1760], // Eko. Cakap rojak je.                 (2.04s)
];

const THUNDER = [4, 1746];
const SENDS = [354, 604, 889];
const CHIPS = [436, 692, 704, 713, 722, 731, 740, 1308, 1318, 1328, 1493];
const CONFIRMS = [496, 1549];
const CUTS = [60, 350, 600, 885, 1090, 1220, 1350, 1445, 1740];

export const EchoSound: React.FC = () => (
  <>
    <Audio src={staticFile('echo-music.wav')} volume={(f) => interpolate(f, [0, 30, 1900, 1978], [0, 0.3, 0.3, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />

    {VO.map(([file, at]) => (
      <Sequence key={file} from={at} durationInFrames={320}><Audio src={staticFile(file)} volume={1} /></Sequence>
    ))}

    {THUNDER.map((at) => (
      <Sequence key={`th${at}`} from={at} durationInFrames={54}><Audio src={staticFile('echo-thunder.wav')} volume={0.7} /></Sequence>
    ))}

    {SENDS.map((at) => (
      <Sequence key={`s${at}`} from={at} durationInFrames={12}><Audio src={staticFile('echo-send.wav')} volume={0.42} /></Sequence>
    ))}

    {CHIPS.map((at) => (
      <Sequence key={`c${at}`} from={at} durationInFrames={8}><Audio src={staticFile('echo-chip.wav')} volume={0.4} /></Sequence>
    ))}

    {CONFIRMS.map((at) => (
      <Sequence key={`k${at}`} from={at} durationInFrames={28}><Audio src={staticFile('echo-confirm.wav')} volume={0.5} /></Sequence>
    ))}

    {CUTS.map((at) => (
      <Sequence key={`w${at}`} from={at - 4} durationInFrames={14}><Audio src={staticFile('echo-send.wav')} volume={0.16} /></Sequence>
    ))}
  </>
);
