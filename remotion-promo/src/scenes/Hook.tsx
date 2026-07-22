import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { MaskRise } from '../motion';

const big: React.CSSProperties = {
  fontFamily: INTER,
  fontSize: 100,
  fontWeight: 800,
  color: L.text,
  letterSpacing: -3,
  lineHeight: 1.08,
};

/** ACT 1 (0–270 @60fps = 4.5s): the organizer hook. */
export const Hook: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
    <Sequence durationInFrames={100}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        <MaskRise text="Nak organize" delay={4} outAt={86} style={big} />
        <MaskRise text="social game?" delay={12} outAt={88} accent={[0, 1]} style={big} />
      </AbsoluteFill>
    </Sequence>
    <Sequence from={100}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 10 }}>
        <MaskRise text="Futsal. Badminton." delay={6} stagger={22} outAt={156} style={big} />
        <MaskRise text="Makan-makan. Trip." delay={54} stagger={22} outAt={158} style={{ ...big, color: L.textSoft }} />
      </AbsoluteFill>
    </Sequence>
  </AbsoluteFill>
);
