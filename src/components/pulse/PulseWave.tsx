import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Reanimated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

interface PulseWaveProps {
  width: number;
  height: number;
  /** Bright sweep + beat-dot color (the score's band color). */
  color: string;
  /** Dim base-trace color (e.g. withAlpha(textPrimary, 0.10)). */
  trackColor: string;
  /** Pause the sweep (e.g. while the screen is blurred). */
  active?: boolean;
}

/**
 * The Pulse signature: a single ECG heartbeat trace with a bright segment
 * sweeping along it and a softly pinging dot at the beat's apex. Pure
 * decoration — reduce-motion renders the static trace only. Straight-line
 * segments (no curves) so the exact path length is computable for the
 * strokeDashoffset march (the standard SVG line-animation trick).
 */
const PulseWave: React.FC<PulseWaveProps> = ({ width, height, color, trackColor, active = true }) => {
  const reduceMotion = useReducedMotion();
  const midY = height / 2;
  // Amplitude leaves headroom for the R-spike above and S-dip below.
  const A = height * 0.42;

  const { d, length, apexX, apexY } = useMemo(() => {
    // Normalized ECG shape: flat lead-in → P bump → QRS spike → T bump → flat tail.
    const pts: [number, number][] = [
      [0, 0],
      [0.3, 0],
      [0.34, -0.18],
      [0.38, 0],
      [0.42, 0],
      [0.45, 0.12],
      [0.485, -1],
      [0.52, 0.32],
      [0.55, 0],
      [0.62, -0.22],
      [0.68, 0],
      [1, 0],
    ];
    const xy = pts.map(([x, y]) => [x * width, midY + y * A] as [number, number]);
    let len = 0;
    for (let i = 1; i < xy.length; i++) {
      len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    }
    return {
      d: `M ${xy.map(([x, y]) => `${x} ${y}`).join(' L ')}`,
      length: len,
      apexX: 0.485 * width,
      apexY: midY - A,
    };
  }, [width, height, midY, A]);

  const dash = length * 0.22;
  // Marches the bright dash from before the start to past the end, forever.
  const sweep = useSharedValue(dash);
  const ping = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || !active) return;
    sweep.value = dash;
    sweep.value = withRepeat(
      withTiming(-length, { duration: 2600, easing: Easing.linear }),
      -1,
      false
    );
    ping.value = 0;
    ping.value = withRepeat(
      withDelay(600, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) })),
      -1,
      false
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, active, dash, length]);

  const sweepProps = useAnimatedProps(() => ({ strokeDashoffset: sweep.value }));
  const pingStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - ping.value),
    transform: [{ scale: 0.6 + ping.value * 1.6 }],
  }));

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        <Path d={d} stroke={trackColor} strokeWidth={2} fill="none" strokeLinejoin="round" />
        {!reduceMotion && active ? (
          <AnimatedPath
            d={d}
            stroke={color}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${length}`}
            animatedProps={sweepProps}
          />
        ) : null}
      </Svg>
      {/* Beat dot + soft ping at the R-wave apex */}
      <View style={[styles.dotWrap, { left: apexX - 8, top: apexY - 8 }]}>
        {!reduceMotion && active ? (
          <Reanimated.View style={[styles.ping, { backgroundColor: color }, pingStyle]} />
        ) : null}
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dotWrap: {
    position: 'absolute',
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ping: { position: 'absolute', width: 16, height: 16, borderRadius: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

export default PulseWave;
