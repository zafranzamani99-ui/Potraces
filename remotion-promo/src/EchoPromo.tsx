import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { EchoBackdrop, Watermark } from './echo/fx';
import { EchoSound } from './echo/EchoSound';
import { Ignition, Hook, Chat, Breadth, Trust, SignOff } from './echo/scenes';

/**
 * ECHO — v3 · ~33s · 1980 frames @ 60fps · 1080×1920 · clarity-first, VO lines spaced with pauses.
 * Plain white · Inter · 1s lightning intro · Malaysian male VO (Zain, "Eko" phonetic) · "rojak".
 * Ignition 0–60 · Hook 60–350 · Chat 350–1090 · Breadth 1090–1445 · Trust 1445–1740 · SignOff 1740–1980
 */
export const EchoPromo: React.FC = () => (
  <AbsoluteFill>
    <EchoBackdrop />
    <EchoSound />
    <Series>
      <Series.Sequence durationInFrames={60}><Ignition /></Series.Sequence>
      <Series.Sequence durationInFrames={290}><Hook /></Series.Sequence>
      <Series.Sequence durationInFrames={740}><Chat /></Series.Sequence>
      <Series.Sequence durationInFrames={355}><Breadth /></Series.Sequence>
      <Series.Sequence durationInFrames={295}><Trust /></Series.Sequence>
      <Series.Sequence durationInFrames={240}><SignOff /></Series.Sequence>
    </Series>
    <Watermark />
  </AbsoluteFill>
);
