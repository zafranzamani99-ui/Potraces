import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { Backdrop, Watermark } from './motion';
import { SoundTrack } from './SoundTrack';
import { Hook } from './scenes/Hook';
import { Organizer } from './scenes/Organizer';
import { Participant } from './scenes/Participant';
import { SignOff } from './scenes/SignOff';

/**
 * COLLECTZ — v8 · 32s · 1920 frames @ 60fps · 1080×1920
 * Narrative: organize the whole social game here — event page, teams, payment, proof.
 * Hook 0–270 · Organizer 270–740 · Participant 740–1660 · SignOff 1660–1920
 */
export const CollectzPromo: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <SoundTrack />
    <Series>
      <Series.Sequence durationInFrames={270}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence durationInFrames={470}>
        <Organizer />
      </Series.Sequence>
      <Series.Sequence durationInFrames={920}>
        <Participant />
      </Series.Sequence>
      <Series.Sequence durationInFrames={260}>
        <SignOff />
      </Series.Sequence>
    </Series>
    <Watermark />
  </AbsoluteFill>
);
