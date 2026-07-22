import React from 'react';
import { AbsoluteFill } from 'remotion';
import { L } from '../theme';
import { INTER } from '../font';
import { MaskRise, Rise } from '../motion';

/** ACT 4 (260 @60fps ≈ 4.3s): sign-off — "Organize, share, settle." */
export const SignOff: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 26, fontFamily: INTER }}>
    <Rise delay={6}>
      <div style={{ fontSize: 36, letterSpacing: 8, color: L.accent, fontWeight: 800 }}>COLLECTZ</div>
    </Rise>
    <MaskRise
      text="Organize. Share."
      delay={16}
      style={{ fontSize: 92, fontWeight: 800, color: L.text, letterSpacing: -2, lineHeight: 1.1 }}
    />
    <MaskRise
      text="Settle."
      delay={30}
      accent={[0]}
      style={{ fontSize: 92, fontWeight: 800, color: L.text, letterSpacing: -2, lineHeight: 1.1 }}
    />
    <Rise delay={50}>
      <div style={{ fontSize: 38, color: L.textSoft, fontWeight: 600, marginTop: 10 }}>
        Track &amp; pay via Potraces · jejakbaki.my
      </div>
    </Rise>
  </AbsoluteFill>
);
