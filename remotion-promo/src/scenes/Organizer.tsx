import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Caption, PushIn } from '../motion';
import { CreateScreen, ShareScreen } from '../AppScreens';

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingTop: 20 }}>
    <PushIn>{children}</PushIn>
  </AbsoluteFill>
);

/** ACT 2 (470 @60fps ≈ 7.8s): setup event → paste magic → share/advertise. */
export const Organizer: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={330}>
      <Center><CreateScreen /></Center>
    </Sequence>
    <Sequence from={330}>
      <Center><ShareScreen /></Center>
    </Sequence>

    <Sequence durationInFrames={150}><Caption delay={8} accent={[1]}>Setup Collectz dalam Potraces.</Caption></Sequence>
    <Sequence from={150} durationInFrames={180}><Caption delay={6}>Paste je, sambung isi form.</Caption></Sequence>
    <Sequence from={330}><Caption delay={10} accent={[0]}>Advertise game kau, share link.</Caption></Sequence>
  </AbsoluteFill>
);
