import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Caption, PushIn } from '../motion';
import {
  EventPageScreen,
  ClaimScreen,
  TeamScreen,
  PayScreen,
  ProofScreen,
  ConfirmedScreen,
} from '../AppScreens';

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingTop: 20 }}>
    <PushIn>{children}</PushIn>
  </AbsoluteFill>
);

/** ACT 3 (920 @60fps ≈ 15.3s): the participant journey through the shared link.
 * event page → name → team → pay → proof → confirmed. */
export const Participant: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={150}>
      <Center><EventPageScreen /></Center>
      <Caption delay={10}>Member bukak link je.</Caption>
    </Sequence>

    <Sequence from={150} durationInFrames={110}>
      <Center><ClaimScreen /></Center>
      <Caption delay={8}>Letak nama.</Caption>
    </Sequence>

    <Sequence from={260} durationInFrames={120}>
      <Center><TeamScreen /></Center>
      <Caption delay={8} accent={[1]}>Pilih team sendiri.</Caption>
    </Sequence>

    <Sequence from={380} durationInFrames={170}>
      <Center><PayScreen /></Center>
      <Caption delay={10}>Scan QR, bayar bila-bila.</Caption>
    </Sequence>

    <Sequence from={550} durationInFrames={130}>
      <Center><ProofScreen /></Center>
      <Caption delay={8}>Upload bukti bayaran.</Caption>
    </Sequence>

    <Sequence from={680}>
      <Center><ConfirmedScreen /></Center>
      <Sequence durationInFrames={120}><Caption delay={16}>Kau confirm je. Habis.</Caption></Sequence>
      <Sequence from={120}><Caption delay={6} accent={[3]}>Tak payah pening kat WhatsApp.</Caption></Sequence>
    </Sequence>
  </AbsoluteFill>
);
