import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';

/* v11 mix @60fps · comp = 2356 frames (39.3s) · VO: ElevenLabs Daud M.
 * VOICE-FINISH rule · BLACK BEAT 750–795 (bed ducks to 0).
 * Acts: problem 0–750 · black 750–795 · promote 795–960 ·
 * ways (3 cara log, slow read) 960–1266 · central montage 1266–1552 ·
 * goals 1552–1736 · tax relief (claimable flip) 1736–1886 ·
 * echo/AI 1886–2096 · finale+CTA 2096–2356. */

const VO: Array<[string, number]> = [
  ['dvo-18.mp3', 8],    // 5.1 juta rakyat Malaysia terjebak BNPL. (3.37s · ends 210 < 218)
  ['dvo-17.mp3', 226],  // 53 ribu anak muda berhutang.           (2.56s · ends 380 < 388)
  ['dvo-16.mp3', 396],  // Enam belas muflis setiap hari.         (2.04s · ends 518 < 526)
  ['dvo-19.mp3', 534],  // 61% tak mampu keluar seribu bila kecemasan. (3.47s · ends 742 < 750)
  ['dvo-20.mp3', 807],  // Sebab tu kena ada Potraces.            (2.27s · ends 943 < 960)
  ['dvo-26.mp3', 968],  // Log expenses? Tiga cara mudah…         (4.83s · ends 1258 < 1266)
  ['dvo-22.mp3', 1274], // Hutang, goals, savings, commitments…   (4.49s · ends 1544 < 1552)
  ['dvo-25.mp3', 1560], // iPhone, kahwin, trip Japan, notes pun…(3.50s · ends 1770 < 1778)
  ['dvo-27.mp3', 1786], // Resit? Simpan untuk tax relief.       (2.35s · ends 1927 < 1932)
  ['dvo-23.mp3', 1940], // Ada AI dalam — tanya Echo…            (2.90s · ends 2114 < 2138)
  ['dvo-24.mp3', 2146], // Potraces. Track dulu.                 (1.80s · ends 2254 < 2398)
];

const WHOOSH = [750, 960, 1266, 1552, 1778, 1932, 2138];
const RISER_AT = 793; // lifts out of the black into the promote turn
const STAMPS = [8, 226, 396, 534]; // stat number slams
const POPS = [
  980, 988, 996, // the three way-rows stack (968 + 12/20/28)
  1285, 1291, 1297, 1303, // montage minis fan in
  1566, // notes shot slides in (1552 + 14)
];
const TAPS = [
  821,  // promote underline (795 + 26)
  1801, // Not Claimable → Claimable flip (1778 + 23)
  1821, // scribble lands around it (1778 + 43)
  2141, // finale check pops (2138 + 3)
  2268, // CTA end card lands (2138 + 130)
];

export const PromoSound: React.FC = () => (
  <>
    {/* bed — full duck through the black beat (750–795) */}
    <Audio
      src={staticFile('dmusic.wav')}
      volume={(f) =>
        interpolate(
          f,
          [0, 30, 740, 752, 790, 800, 2332, 2396],
          [0, 0.3, 0.3, 0, 0, 0.3, 0.3, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
      }
    />

    {VO.map(([file, at]) => (
      <Sequence key={file} from={at} durationInFrames={420}>
        <Audio src={staticFile(file)} volume={1} />
      </Sequence>
    ))}

    <Sequence from={RISER_AT} durationInFrames={54}>
      <Audio src={staticFile('dsfx-riser.wav')} volume={0.45} />
    </Sequence>

    {WHOOSH.map((at, i) => (
      <Sequence key={`w${at}`} from={at - 6} durationInFrames={40}>
        <Audio src={staticFile('dsfx-whoosh.wav')} volume={i === 0 ? 0.4 : i % 2 === 0 ? 0.32 : 0.25} />
      </Sequence>
    ))}

    {STAMPS.map((at) => (
      <React.Fragment key={`s${at}`}>
        <Sequence from={at} durationInFrames={8}>
          <Audio src={staticFile('dsfx-tap.wav')} volume={0.6} />
        </Sequence>
        <Sequence from={at} durationInFrames={12}>
          <Audio src={staticFile('dsfx-pop.wav')} volume={0.4} />
        </Sequence>
      </React.Fragment>
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

    <Sequence from={2141} durationInFrames={80}>
      <Audio src={staticFile('dsfx-chime.wav')} volume={0.5} />
    </Sequence>
    <Sequence from={2141} durationInFrames={46}>
      <Audio src={staticFile('dsfx-burst.wav')} volume={0.4} />
    </Sequence>
  </>
);
