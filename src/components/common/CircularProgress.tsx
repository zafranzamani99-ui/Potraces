import React from 'react';
import { View } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';

interface CircularProgressProps {
  size: number;
  strokeWidth: number;
  percentage: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}

/**
 * Circular progress ring. Reused by Goals (savings progress) and
 * BudgetPlanning (per-category spend ring around the avatar).
 */
const CircularProgress = ({ size, strokeWidth, percentage, color, trackColor, children }: CircularProgressProps) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(percentage, 100) / 100);
  const half = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle cx={half} cy={half} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <SvgCircle
          cx={half} cy={half} r={r}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          originX={half}
          originY={half}
        />
      </Svg>
      {children}
    </View>
  );
};

export default CircularProgress;
