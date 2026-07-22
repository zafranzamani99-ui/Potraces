import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from './theme';

/**
 * Device mock: titanium rim + Dynamic Island, screen = Onyx.
 * Enters with Blur Fade + perspective tilt, then floats on a slow sine bob.
 */
export const Phone: React.FC<{
  delay?: number;
  fromX?: number; // entrance slide direction
  children: React.ReactNode;
}> = ({ delay = 0, fromX = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16 } });
  const bob = Math.sin((frame - delay) / 30) * 4;
  return (
    <div
      style={{
        width: 800,
        height: 1640,
        transform: `perspective(1400px) rotateY(${interpolate(s, [0, 1], [fromX >= 0 ? 16 : -16, 0])}deg) translateX(${interpolate(s, [0, 1], [fromX, 0])}px) translateY(${interpolate(s, [0, 1], [70, 0]) + bob}px)`,
        opacity: s,
        filter: `blur(${(1 - s) * 8}px)`,
        borderRadius: 96,
        background: '#2a2a2c',
        padding: 14,
        boxShadow: '0 40px 90px rgba(0,0,0,0.7), 0 0 0 2px #3a3a3d inset',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 84,
          background: C.background,
          overflow: 'hidden',
        }}
      >
        {/* Dynamic Island */}
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 220,
            height: 62,
            borderRadius: 999,
            background: '#000',
            zIndex: 40,
          }}
        />
        <div style={{ position: 'absolute', top: 110, left: 0, right: 0, bottom: 0 }}>{children}</div>
      </div>
    </div>
  );
};
