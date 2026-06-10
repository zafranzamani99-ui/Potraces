import React, { useEffect, useId } from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Reanimated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

interface HalfGaugeProps {
  size: number;        // width of the gauge
  strokeWidth: number;
  percentage: number;  // 0–100, fills left→right across the top semicircle
  color: string;
  trackColor: string;
  /** Optional warm gradient for the fill — [start, end]. Falls back to `color`. */
  gradient?: [string, string];
  children?: React.ReactNode;
  /** If true, arc fill animates from 0 → percentage on mount (default: true) */
  animate?: boolean;
  /** Animation duration in ms (default: 700) */
  animDuration?: number;
  /** Called when the arc animation finishes (JS thread) */
  onAnimationComplete?: () => void;
}

/**
 * Top semicircle gauge (180°). Used by the Budget hero to show spend pace.
 * Rendered with SVG paths + strokeDasharray for a clean, anti-aliased arc with
 * rounded caps — no rotated-border hacks. Supports an optional gradient fill for
 * a richer, premium feel (Copilot/Monzo dial energy).
 */
const HalfGauge = ({
  size,
  strokeWidth,
  percentage,
  color,
  trackColor,
  gradient,
  children,
  animate = true,
  animDuration = 700,
  onAnimationComplete,
}: HalfGaugeProps) => {
  const gradId = useId().replace(/:/g, '');
  const r = (size - strokeWidth) / 2;
  const cy = size / 2;
  const startX = strokeWidth / 2;
  const endX = size - strokeWidth / 2;
  // Arc sweeping over the top from the left point to the right point.
  const d = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`;
  const len = Math.PI * r;
  const targetPct = Math.max(0, Math.min(percentage, 100)) / 100;
  const height = size / 2 + strokeWidth;

  // Animated fill: shared value drives the strokeDashoffset
  const fillPct = useSharedValue(animate ? 0 : targetPct);

  useEffect(() => {
    if (animate) {
      fillPct.value = withTiming(
        targetPct,
        { duration: animDuration, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished && onAnimationComplete) {
            runOnJS(onAnimationComplete)();
          }
        },
      );
    } else {
      fillPct.value = targetPct;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPct]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: len - len * fillPct.value,
  }));

  const fillStroke = gradient ? `url(#${gradId})` : color;

  return (
    <View style={{ width: size, height, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Svg width={size} height={height}>
        {gradient && (
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={gradient[0]} />
              <Stop offset="1" stopColor={gradient[1]} />
            </LinearGradient>
          </Defs>
        )}
        {/* Track (full arc, muted) */}
        <Path
          d={d}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        {/* Fill arc — animated via strokeDashoffset */}
        {targetPct > 0 && (
          <AnimatedPath
            d={d}
            stroke={fillStroke}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${len} ${len}`}
            animatedProps={animatedProps}
          />
        )}
      </Svg>
      {children != null && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' }}>
          {children}
        </View>
      )}
    </View>
  );
};

export default HalfGauge;
