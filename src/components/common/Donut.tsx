// Donut — a calm SVG donut chart with a hollow centre for a total/label.
// chart-kit's PieChart can't render a centre hole; this hand-rolled version
// follows the same SVG approach as CircularProgress. Decorative (the tappable
// drill-down lives in the list rows beneath it).
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export interface DonutSegment {
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  trackColor: string;
  /** Gap between segments, in circumference units. */
  gap?: number;
  children?: React.ReactNode;
}

const Donut: React.FC<DonutProps> = ({
  data,
  size = 180,
  strokeWidth = 16,
  trackColor,
  gap = 3,
  children,
}) => {
  const half = size / 2;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let acc = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={half} cy={half} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const slot = frac * circ;
          const dash = Math.max(slot - gap, 0.5);
          const offset = -acc;
          acc += slot;
          return (
            <Circle
              key={i}
              cx={half}
              cy={half}
              r={r}
              stroke={d.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
              rotation={-90}
              originX={half}
              originY={half}
            />
          );
        })}
      </Svg>
      {children}
    </View>
  );
};

export default Donut;
