import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Polygon, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { CALM, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  negativeColor?: string;
  showDot?: boolean;
  strokeWidth?: number;
  filled?: boolean;
}

const Sparkline: React.FC<SparklineProps> = memo(({
  data,
  width = 120,
  height = 40,
  color: colorProp,
  negativeColor: negativeColorProp,
  showDot = true,
  strokeWidth = 2,
  filled = false,
}) => {
  const C = useCalm();
  const color = colorProp ?? C.accent;
  const negativeColor = negativeColorProp ?? C.neutral;
  if (data.length < 2) return null;

  const padding = strokeWidth + 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const coords = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * innerW,
    y: padding + innerH - ((v - min) / range) * innerH,
  }));

  const points = coords.map((c) => `${c.x},${c.y}`).join(' ');

  const isPositive = data[data.length - 1] >= data[0];
  const lineColor = isPositive ? color : negativeColor;

  const last = coords[coords.length - 1];

  // Area fill: line path + close along bottom
  const bottomY = padding + innerH;
  const areaPoints = [
    `${coords[0].x},${bottomY}`,
    ...coords.map((c) => `${c.x},${c.y}`),
    `${last.x},${bottomY}`,
  ].join(' ');

  const gradientId = `sparkFill_${isPositive ? 'pos' : 'neg'}`;

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        {filled && (
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity={0.18} />
              <Stop offset="1" stopColor={lineColor} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
        )}
        {filled && (
          <Polygon
            points={areaPoints}
            fill={`url(#${gradientId})`}
            stroke="none"
          />
        )}
        <Polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showDot && (
          <Circle
            cx={last.x}
            cy={last.y}
            r={3}
            fill={lineColor}
          />
        )}
      </Svg>
    </View>
  );
});

export default Sparkline;
