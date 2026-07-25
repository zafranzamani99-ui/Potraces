import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { LightStage, LightMark, SweepL } from './debt3/fx';
import { DebtSound } from './debt4/DebtSound';
import { Hook, SnapSplit, SplitsOverview, TrackHome, Interrupt, Remind, Settle, Shared, Finale } from './debt4/scenes';

/**
 * HUTANG PROMO — "Paper v7.1" · 42.7s · 2559 frames @ 60fps · 1080×1920 · WHITE
 * Rapid roll-call (rows every ~1s + ping) → mohsin's line finishes, THEN the
 * pile collapses (voice-finish fix) → beat stop → RM 140 boom →
 * "Track semua hutang satu tempat." → ONE flowing turn clip · snap+split ·
 * splits owed-back · RM 456 track home · BLACK INTERRUPT (halal moment, music
 * dies) · remind via WhatsApp+QR · zikri settles · shared subs ·
 * Hutang. Track dulu. Settle. + store badges.
 * Hook 0–624 · SnapSplit 624–1244 · Splits 1244–1394 · TrackHome 1394–1494 ·
 * Interrupt 1494–1774 · Remind 1774–2034 · Settle 2034–2174 ·
 * Shared 2174–2359 · Finale 2359–2559
 */
export const HutangPromo: React.FC = () => (
  <AbsoluteFill style={{ background: '#FFFFFF' }}>
    <LightStage />
    <DebtSound />
    <Series>
      <Series.Sequence durationInFrames={624}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence durationInFrames={620}>
        <SnapSplit />
      </Series.Sequence>
      <Series.Sequence durationInFrames={150}>
        <SplitsOverview />
      </Series.Sequence>
      <Series.Sequence durationInFrames={100}>
        <TrackHome />
      </Series.Sequence>
      <Series.Sequence durationInFrames={280}>
        <Interrupt />
      </Series.Sequence>
      <Series.Sequence durationInFrames={260}>
        <Remind />
      </Series.Sequence>
      <Series.Sequence durationInFrames={140}>
        <Settle />
      </Series.Sequence>
      <Series.Sequence durationInFrames={185}>
        <Shared />
      </Series.Sequence>
      <Series.Sequence durationInFrames={200}>
        <Finale />
      </Series.Sequence>
    </Series>
    <SweepL at={618} />
    <SweepL at={1238} />
    <SweepL at={1388} />
    <SweepL at={1768} />
    <SweepL at={2028} />
    <SweepL at={2168} />
    <SweepL at={2353} />
    <LightMark />
  </AbsoluteFill>
);
