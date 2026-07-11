/**
 * WauLoader — full-screen loading state: the Potraces wau riding the wind while
 * speed streaks rip past, so a wait reads as motion, not a stall. The kite bobs,
 * banks and flutters, and every few seconds a gust shoves it harder and flares
 * the streaks. Native-driver only.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import { WauBody, WauFins } from './WauScene';
import { useCalm } from '../../hooks/useCalm';
import { withAlpha, TYPOGRAPHY } from '../../constants';

const { width: SCR_W, height: SCR_H } = Dimensions.get('window');
const SIZE = 132;

// Streaks frame the centered wau (above ~0.24–0.41, below ~0.62–0.79) so the
// ornate kite stays readable while the wind whooshes past.
const STREAKS = [
  { top: 0.24, len: 0.5, h: 3, dur: 640, delay: 0 },
  { top: 0.33, len: 0.34, h: 2, dur: 780, delay: 260 },
  { top: 0.41, len: 0.62, h: 2.5, dur: 540, delay: 120 },
  { top: 0.62, len: 0.42, h: 2, dur: 700, delay: 200 },
  { top: 0.71, len: 0.56, h: 3, dur: 600, delay: 380 },
  { top: 0.79, len: 0.3, h: 2, dur: 820, delay: 500 },
];

const Streak: React.FC<{
  top: number; len: number; h: number; dur: number; delay: number;
  color: string; wind: Animated.AnimatedInterpolation<number>;
}> = ({ top, len, h, dur, delay, color, wind }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, dur, delay]);
  const width = len * SCR_W;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: top * SCR_H,
        left: 0,
        width,
        height: h,
        borderRadius: h / 2,
        backgroundColor: color,
        // fade in/out along the travel × wind intensity (streaks flare on a gust)
        opacity: Animated.multiply(
          v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
          wind,
        ),
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [SCR_W + 20, -width - 40] }) }],
      }}
    />
  );
};

/** One "typing" dot that pulses on its own staggered offset. */
const PulseDot: React.FC<{ color: string; delay: number }> = ({ color, delay }) => {
  const a = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(a, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.25, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(600 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, delay]);
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity: a }]} />;
};

const WauLoader: React.FC<{ label?: string }> = ({ label }) => {
  const C = useCalm();
  const bob = useRef(new Animated.Value(0)).current;      // -1..1 vertical ride
  const sway = useRef(new Animated.Value(0)).current;     // -1..1 banking
  const wander = useRef(new Animated.Value(0)).current;   // -1..1 horizontal drift
  const flutter = useRef(new Animated.Value(0)).current;  // -1..1 tail fins
  const gust = useRef(new Animated.Value(0)).current;     // 0..1 wind-fight level

  useEffect(() => {
    // asymmetric swing (up-quick, down-slow) so the ride never looks metronomic
    const swing = (val: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(val, { toValue: -1, duration: ms * 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    // a gust: sudden shove, then a long settle — the wind arriving and passing
    const gustLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(gust, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(gust, { toValue: 0.18, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const loops = [swing(bob, 1400), swing(sway, 1900), swing(wander, 2700), swing(flutter, 240), gustLoop];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bob, sway, wander, flutter, gust]);

  // finger-free ride: drift + gust push, bob, bank into the gust, fins whipping harder in wind
  const translateX = Animated.add(Animated.multiply(wander, 8), Animated.multiply(gust, -6));
  const translateY = Animated.multiply(bob, 9);
  const rotate = Animated.add(Animated.multiply(sway, 5), Animated.multiply(gust, 7)).interpolate({
    inputRange: [-30, 30], outputRange: ['-30deg', '30deg'],
  });
  const finRotate = Animated.multiply(flutter, Animated.add(5, Animated.multiply(gust, 9))).interpolate({
    inputRange: [-24, 24], outputRange: ['-24deg', '24deg'],
  });
  const windOpacity = Animated.add(0.4, Animated.multiply(gust, 0.6));
  const streakColor = withAlpha(C.accent, 0.35);

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: C.background }]}>
      {STREAKS.map((s, i) => (
        <Streak key={i} {...s} color={streakColor} wind={windOpacity} />
      ))}
      <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ translateX }, { translateY }, { rotate }] }}>
        <Animated.View
          style={{ position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE, transform: [{ rotate: finRotate }] }}
        >
          <WauFins size={SIZE} />
        </Animated.View>
        <WauBody size={SIZE} />
      </Animated.View>

      {label ? (
        <View style={styles.caption} pointerEvents="none">
          <Text style={[styles.captionText, { color: C.textMuted }]}>{label}</Text>
          <PulseDot color={C.textMuted} delay={0} />
          <PulseDot color={C.textMuted} delay={200} />
          <PulseDot color={C.textMuted} delay={400} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  caption: {
    position: 'absolute',
    top: SCR_H * 0.64,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  captionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.3,
    marginRight: 2,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

export default WauLoader;
