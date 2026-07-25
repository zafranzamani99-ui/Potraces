import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { WhySound } from './why/WhySound';
import { P1, P2, P3, P4, P5, P6, P7, S1, S2, A1, A2, A3, A4, A5 } from './why/scenes';

/**
 * WHY POTRACES v2 — problem → suspension → solution (Potraces) · 74.3s ·
 * 4460 frames @ 60fps · contoh1 punch captions · Zain newsroom VO ·
 * serious mix only (bed + whooshes + riser).
 */
export const WhyPromo: React.FC = () => (
  <AbsoluteFill style={{ background: '#0B0B09' }}>
    <WhySound />
    <Series>
      <Series.Sequence durationInFrames={260}><P1 /></Series.Sequence>
      <Series.Sequence durationInFrames={320}><P2 /></Series.Sequence>
      <Series.Sequence durationInFrames={580}><P3 /></Series.Sequence>
      <Series.Sequence durationInFrames={550}><P4 /></Series.Sequence>
      <Series.Sequence durationInFrames={290}><P5 /></Series.Sequence>
      <Series.Sequence durationInFrames={400}><P6 /></Series.Sequence>
      <Series.Sequence durationInFrames={320}><P7 /></Series.Sequence>
      <Series.Sequence durationInFrames={180}><S1 /></Series.Sequence>
      <Series.Sequence durationInFrames={170}><S2 /></Series.Sequence>
      <Series.Sequence durationInFrames={140}><A1 /></Series.Sequence>
      <Series.Sequence durationInFrames={280}><A2 /></Series.Sequence>
      <Series.Sequence durationInFrames={510}><A3 /></Series.Sequence>
      <Series.Sequence durationInFrames={310}><A4 /></Series.Sequence>
      <Series.Sequence durationInFrames={150}><A5 /></Series.Sequence>
    </Series>
  </AbsoluteFill>
);
