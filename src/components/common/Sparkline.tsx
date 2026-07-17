import React, { memo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Polyline, Polygon, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
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

const Sparkline: React.FC<SparklineProps> = memo(function Sparkline({
  data,
  width: widthProp,
  height = 40,
  color: colorProp,
  negativeColor: negativeColorProp,
  showDot = true,
  strokeWidth = 2,
  filled = false,
}) {
  const C = useCalm();
  const color = colorProp ?? C.accent;
  const negativeColor = negativeColorProp ?? C.neutral;

  // Fluid width: when the caller doesn't pin a width, fill the parent and measure
  // it via onLayout. Previously this defaulted to 120px, so on a full-width card
  // the chart was stranded in the left third (SVG needs a concrete pixel width —
  // a percentage stretches the geometry and distorts stroke/dot). Measuring keeps
  // the 1:1 pixel mapping while filling whatever space the container gives us.
  const fluid = widthProp == null;
  const [measuredW, setMeasuredW] = useState(0);
  const width = fluid ? measuredW : widthProp;

  const onLayout = fluid
    ? (e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - measuredW) > 0.5) setMeasuredW(w);
      }
    : undefined;

  if (data.length < 2) return null;

  let body: React.ReactNode = null;
  if (width > 0) {
    const padding = strokeWidth + 2;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    const min = Math.min(...data);
    const max = Math.max(...data);
    // A constant series has zero range; without this it maps every point to the
    // bottom edge and reads as a crash to zero. Center it instead.
    const flat = max === min;
    const range = max - min || 1;

    const coords = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * innerW,
      y: flat ? padding + innerH / 2 : padding + innerH - ((v - min) / range) * innerH,
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

    body = (
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
    );
  }

  return (
    <View style={{ width: fluid ? '100%' : width, height }} onLayout={onLayout} pointerEvents="none">
      {body}
    </View>
  );
});

export default Sparkline;
