import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { LightMark, SweepL } from './debt3/fx';
import { PromoSound } from './debt5/PromoSound';
import { Problem, Promote } from './debt5/problem';
import { TourWays, TourCentral, TourGoals, TourTax, TourEcho, Finale } from './debt5/scenes';

/**
 * POTRACES PROMO — "v11 · Masalah → Potraces → Cara Mudah → Semua → CTA"
 * 39.3s · 2356f @60fps · 1080×1920 · Daud M VO · VOICE-FINISH rule.
 * Problem overlay stats → BLACK silence → promote →
 * 3 cara mudah log (slow read) → CENTRAL montage (wallets + debts/goals/
 * savings/commitments) → goals → mark claimable for tax relief →
 * AI/Echo → CTA end card.
 */
const Black: React.FC = () => <AbsoluteFill style={{ background: '#000000' }} />;

export const DebtPromo: React.FC = () => (
  <AbsoluteFill style={{ background: '#FFFFFF' }}>
    <PromoSound />
    <Series>
      <Series.Sequence durationInFrames={750}>
        <Problem />
      </Series.Sequence>
      <Series.Sequence durationInFrames={45}>
        <Black />
      </Series.Sequence>
      <Series.Sequence durationInFrames={165}>
        <Promote />
      </Series.Sequence>
      <Series.Sequence durationInFrames={306}>
        <TourWays />
      </Series.Sequence>
      <Series.Sequence durationInFrames={286}>
        <TourCentral />
      </Series.Sequence>
      <Series.Sequence durationInFrames={226}>
        <TourGoals />
      </Series.Sequence>
      <Series.Sequence durationInFrames={154}>
        <TourTax />
      </Series.Sequence>
      <Series.Sequence durationInFrames={206}>
        <TourEcho />
      </Series.Sequence>
      <Series.Sequence durationInFrames={260}>
        <Finale />
      </Series.Sequence>
    </Series>
    <SweepL at={744} />
    <SweepL at={789} />
    <SweepL at={954} />
    <SweepL at={1260} />
    <SweepL at={1546} />
    <SweepL at={1772} />
    <SweepL at={1926} />
    <SweepL at={2132} />
    <LightMark />
  </AbsoluteFill>
);
