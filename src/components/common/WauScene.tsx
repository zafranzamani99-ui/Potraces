/**
 * WauScene — the Potraces wau (kucing-inspired, original interpretation) and
 * the sky it flies in.
 *
 * - <SkyBackdrop> : full-screen, theme-reactive sky — layered drifting clouds
 *                   and a soft sun glow by day; twinkling stars and a moon
 *                   glow at night. Renders behind an entire screen
 *                   (pointerEvents none, so it never eats touches).
 * - <SkyPanel>    : framed sky rectangle (kept for loaders / vignettes).
 * - <FlyingWau>   : the wau riding the wind. DRAGGABLE — it follows your
 *                   finger while visibly fighting the wind (banks into the
 *                   pull, fins whipping, streaks flaring), and when released
 *                   it glides slowly home on a soft spring. Idle it bobs,
 *                   wanders and gives a little tug every few seconds —
 *                   whispering "drag me".
 *
 * NOTE: no string `transform=` props on SVG elements (they can render the
 * whole layer black on the new architecture) — rotations use the native
 * rotation/origin props and mirrored art is hand-mirrored in coordinates.
 */
import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path, Circle, Rect, Ellipse, Defs, LinearGradient, Stop } from 'react-native-svg';
import { withAlpha } from '../../constants';
import { lightTap } from '../../services/haptics';

const { width: SCR_W, height: SCR_H } = Dimensions.get('window');

// ─── The wau itself (1024 viewBox, same art as assets/wau/potraces-wau.svg) ──

const CREAM = '#F1E7D3';
const GOLD = '#DEAB22';
const BRONZE = '#B2780A';
const OLIVE = '#4F5104';

/** Wings, spire, medallion — everything except the tail fins. */
export const WauBody: React.FC<{ size: number }> = ({ size }) => (
  <Svg width={size} height={size} viewBox="0 0 1024 1024">
    {/* spire */}
    <Path d="M494 278 L512 92 L530 278 Z" fill={GOLD} stroke={BRONZE} strokeWidth={5} strokeLinejoin="round" />
    <Circle cx={512} cy={86} r={9} fill={GOLD} stroke={BRONZE} strokeWidth={3} />
    <Circle cx={512} cy={86} r={4} fill={BRONZE} />
    <Rect x={486} y={268} width={52} height={14} rx={7} fill={BRONZE} />
    {/* tail joint diamond */}
    <Path d="M512 428 L540 464 L512 502 L484 464 Z" fill={CREAM} stroke={OLIVE} strokeWidth={6} strokeLinejoin="round" />
    {/* swept wings — olive ink outline so the kite never melts into the sky */}
    <Path d="M130 560 C250 340 400 272 512 272 C624 272 774 340 894 560 C760 470 640 436 512 436 C384 436 264 470 130 560 Z" fill={CREAM} stroke={OLIVE} strokeWidth={8} strokeLinejoin="round" />
    {/* inner gold trim */}
    <Path d="M220 500 C310 370 416 310 512 310 C608 310 714 370 804 500" stroke={GOLD} strokeWidth={7} strokeLinecap="round" fill="none" />
    {/* wing filigree, left */}
    <Path d="M392 372 C352 354 318 360 300 392" stroke={OLIVE} strokeWidth={6} strokeLinecap="round" fill="none" />
    <Circle cx={296} cy={398} r={6} fill={GOLD} />
    <Path d="M342 440 C312 428 290 432 278 454" stroke={OLIVE} strokeWidth={5} strokeLinecap="round" fill="none" />
    <Circle cx={274} cy={458} r={5} fill={GOLD} />
    <Ellipse cx={430} cy={340} rx={7} ry={14} fill={BRONZE} opacity={0.85} rotation={-35} origin="430, 340" />
    {/* wing filigree, right (hand-mirrored coordinates) */}
    <Path d="M632 372 C672 354 706 360 724 392" stroke={OLIVE} strokeWidth={6} strokeLinecap="round" fill="none" />
    <Circle cx={728} cy={398} r={6} fill={GOLD} />
    <Path d="M682 440 C712 428 734 432 746 454" stroke={OLIVE} strokeWidth={5} strokeLinecap="round" fill="none" />
    <Circle cx={750} cy={458} r={5} fill={GOLD} />
    <Ellipse cx={594} cy={340} rx={7} ry={14} fill={BRONZE} opacity={0.85} rotation={35} origin="594, 340" />
    {/* wing tip caps */}
    <Circle cx={133} cy={557} r={6} fill={GOLD} />
    <Circle cx={891} cy={557} r={6} fill={GOLD} />
    {/* floral medallion */}
    <Circle cx={512} cy={368} r={48} stroke={GOLD} strokeWidth={4} opacity={0.6} fill="none" />
    <Ellipse cx={512} cy={342} rx={13} ry={24} fill={GOLD} />
    <Ellipse cx={512} cy={342} rx={13} ry={24} fill={GOLD} rotation={60} origin="512, 368" />
    <Ellipse cx={512} cy={342} rx={13} ry={24} fill={GOLD} rotation={120} origin="512, 368" />
    <Ellipse cx={512} cy={342} rx={13} ry={24} fill={GOLD} rotation={180} origin="512, 368" />
    <Ellipse cx={512} cy={342} rx={13} ry={24} fill={GOLD} rotation={240} origin="512, 368" />
    <Ellipse cx={512} cy={342} rx={13} ry={24} fill={GOLD} rotation={300} origin="512, 368" />
    <Circle cx={512} cy={368} r={11} fill={BRONZE} />
  </Svg>
);

/** The swallow-tail fins, on their own layer so they can flutter. */
const WauFins: React.FC<{ size: number }> = ({ size }) => (
  <Svg width={size} height={size} viewBox="0 0 1024 1024">
    <Path d="M512 460 C470 535 432 600 374 660 C416 670 466 644 494 594 C504 560 510 510 512 460 Z" fill={CREAM} stroke={OLIVE} strokeWidth={7} strokeLinejoin="round" />
    <Path d="M512 460 C554 535 592 600 650 660 C608 670 558 644 530 594 C520 560 514 510 512 460 Z" fill={CREAM} stroke={OLIVE} strokeWidth={7} strokeLinejoin="round" />
    <Path d="M508 480 C478 546 448 598 402 646" stroke={GOLD} strokeWidth={5} strokeLinecap="round" fill="none" />
    <Path d="M516 480 C546 546 576 598 622 646" stroke={GOLD} strokeWidth={5} strokeLinecap="round" fill="none" />
    <Path d="M448 596 C432 588 420 592 414 606" stroke={OLIVE} strokeWidth={4} strokeLinecap="round" fill="none" />
    <Circle cx={411} cy={610} r={4} fill={GOLD} />
    <Path d="M576 596 C592 588 604 592 610 606" stroke={OLIVE} strokeWidth={4} strokeLinecap="round" fill="none" />
    <Circle cx={613} cy={610} r={4} fill={GOLD} />
  </Svg>
);

/**
 * Tiny bobbing wau — the brand thread that follows the user from onboarding
 * into the app's first days (setup checklist, empty states). Breathing-level
 * motion only: cherish, not playful.
 */
export const WauMark: React.FC<{ size?: number }> = ({ size = 24 }) => {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  return (
    <Animated.View
      style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [1.5, -1.5] }) }] }}
      pointerEvents="none"
    >
      <WauBody size={size} />
    </Animated.View>
  );
};

// ─── shared sky bits ──────────────────────────────────────

const usePulse = () => {
  const tw1 = useRef(new Animated.Value(0.35)).current;
  const tw2 = useRef(new Animated.Value(0.8)).current;
  const tw3 = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const pulse = (v: Animated.Value, hi: number, lo: number, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: hi, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
          Animated.timing(v, { toValue: lo, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        ]),
      );
    const loops = [pulse(tw1, 1, 0.35, 1300), pulse(tw2, 0.3, 1, 1750), pulse(tw3, 1, 0.4, 2150)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [tw1, tw2, tw3]);
  return [tw1, tw2, tw3];
};

const useNightValue = (dark: boolean) => {
  const night = useRef(new Animated.Value(dark ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(night, {
      toValue: dark ? 1 : 0,
      duration: 900,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [dark, night]);
  return night;
};

/** A puffy two-blob cloud drifting right → left on its own loop. */
const DriftingCloud: React.FC<{
  gate: Animated.AnimatedInterpolation<number>;
  top: number;
  w: number;
  travel: number;
  dur: number;
  delay: number;
}> = ({ gate, top, w, travel, dur, delay }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, dur, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left: 0,
        opacity: gate,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [travel + 40, -w - 60] }) }],
      }}
    >
      <View style={{ width: w, height: w * 0.3, borderRadius: w, backgroundColor: withAlpha('#FFFFFF', 0.85) }} />
      <View style={{ position: 'absolute', top: -w * 0.16, left: w * 0.24, width: w * 0.42, height: w * 0.42, borderRadius: w, backgroundColor: withAlpha('#FFFFFF', 0.85) }} />
    </Animated.View>
  );
};

// ─── SkyBackdrop — the whole screen is the sky ────────────

const BG_STARS = [
  { x: 0.08, y: 0.07, s: 2.5 },
  { x: 0.22, y: 0.12, s: 2 },
  { x: 0.36, y: 0.05, s: 3 },
  { x: 0.52, y: 0.1, s: 2 },
  { x: 0.68, y: 0.07, s: 2.5 },
  { x: 0.84, y: 0.12, s: 2 },
  { x: 0.12, y: 0.26, s: 2 },
  { x: 0.45, y: 0.22, s: 2.5 },
  { x: 0.78, y: 0.28, s: 2 },
  { x: 0.3, y: 0.46, s: 2 },
  { x: 0.62, y: 0.52, s: 2.5 },
  { x: 0.9, y: 0.58, s: 2 },
];

const BG_CLOUDS = [
  { top: 0.06, w: 96, dur: 30000, delay: 0 },
  { top: 0.14, w: 58, dur: 21000, delay: 6000 },
  { top: 0.26, w: 74, dur: 26000, delay: 12000 },
  { top: 0.42, w: 46, dur: 17000, delay: 3000 },
  { top: 0.6, w: 84, dur: 32000, delay: 9000 },
  { top: 0.78, w: 52, dur: 23000, delay: 15000 },
];

export const SkyBackdrop: React.FC<{ dark: boolean }> = ({ dark }) => {
  const night = useNightValue(dark);
  const twinkles = usePulse();

  const sky = night.interpolate({ inputRange: [0, 1], outputRange: ['#F3EAD6', '#232B40'] });
  const starGate = night.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  const dayGate = night.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.3, 0] });
  // clouds stay faintly visible at night
  const cloudGate = night.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0.12] });

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: sky }]} />

      {/* soft sun glow, top-left (day) */}
      <Animated.View style={{ position: 'absolute', top: -70, left: -50, opacity: dayGate }}>
        <View style={{ width: 240, height: 240, borderRadius: 120, backgroundColor: withAlpha(GOLD, 0.07) }} />
        <View style={{ position: 'absolute', top: 45, left: 45, width: 150, height: 150, borderRadius: 75, backgroundColor: withAlpha(GOLD, 0.08) }} />
      </Animated.View>

      {/* soft moon glow, top-right (night) */}
      <Animated.View style={{ position: 'absolute', top: 50, right: 30, opacity: starGate }}>
        <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: withAlpha('#E9E4D4', 0.08) }} />
        <View style={{ position: 'absolute', top: 27, left: 27, width: 56, height: 56, borderRadius: 28, backgroundColor: withAlpha('#E9E4D4', 0.12) }} />
      </Animated.View>

      {/* stars */}
      {BG_STARS.map((st, i) => (
        <Animated.View
          key={`bg-star-${i}`}
          style={{
            position: 'absolute',
            top: st.y * SCR_H,
            left: st.x * SCR_W,
            width: st.s,
            height: st.s,
            borderRadius: st.s / 2,
            backgroundColor: '#F0EDE2',
            opacity: Animated.multiply(starGate, twinkles[i % 3]),
          }}
        />
      ))}

      {/* layered clouds */}
      {BG_CLOUDS.map((c, i) => (
        <DriftingCloud
          key={`bg-cloud-${i}`}
          gate={cloudGate}
          top={c.top * SCR_H}
          w={c.w}
          travel={SCR_W}
          dur={c.dur}
          delay={c.delay}
        />
      ))}
    </View>
  );
};

// ─── SkyPanel — framed sky vignette (loaders etc.) ────────

const PANEL_STARS = [
  { x: 0.12, y: 0.18, s: 2.5 },
  { x: 0.3, y: 0.42, s: 2 },
  { x: 0.52, y: 0.12, s: 3 },
  { x: 0.72, y: 0.3, s: 2 },
  { x: 0.88, y: 0.16, s: 2.5 },
];

export const SkyPanel: React.FC<{
  dark: boolean;
  w: number;
  h: number;
  borderColor: string;
  style?: object;
  children?: React.ReactNode;
}> = ({ dark, w, h, borderColor, style, children }) => {
  const night = useNightValue(dark);
  const twinkles = usePulse();

  const sky = night.interpolate({ inputRange: [0, 1], outputRange: ['#F3EAD6', '#232B40'] });
  const starGate = night.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  const dayGate = night.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 0.2, 0] });

  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: 28, overflow: 'hidden', backgroundColor: sky, borderWidth: 1, borderColor },
        style,
      ]}
    >
      {PANEL_STARS.map((st, i) => (
        <Animated.View
          key={`sky-star-${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: st.y * h,
            left: st.x * w,
            width: st.s,
            height: st.s,
            borderRadius: st.s / 2,
            backgroundColor: '#F0EDE2',
            opacity: Animated.multiply(starGate, twinkles[i % 3]),
          }}
        />
      ))}
      <DriftingCloud gate={dayGate} top={h * 0.2} w={52} travel={w} dur={13000} delay={0} />
      <DriftingCloud gate={dayGate} top={h * 0.55} w={36} travel={w} dur={18000} delay={5000} />
      {children}
    </Animated.View>
  );
};

// ─── FlyingWau — draggable, wind-fighting ─────────────────

export const FlyingWau: React.FC<{
  size?: number;
  panelW: number;
  panelH: number;
  dark?: boolean;
  /** Lets the parent freeze its scroll views while the kite is being dragged. */
  onDraggingChange?: (dragging: boolean) => void;
}> = ({ size = 180, panelW, panelH, dark = false, onDraggingChange }) => {
  const bob = useRef(new Animated.Value(0)).current;     // -1..1 vertical ride
  const sway = useRef(new Animated.Value(0)).current;    // -1..1 banking
  const wander = useRef(new Animated.Value(0)).current;  // -1..1 horizontal stroll
  const flutter = useRef(new Animated.Value(0)).current; // -1..1 tail fins
  const tug = useRef(new Animated.Value(0)).current;     // periodic "drag me" pull
  const gust = useRef(new Animated.Value(0)).current;    // 0..1 wind-fight level
  const shake = useRef(new Animated.Value(0)).current;   // -1..1 turbulence
  const dragX = useRef(new Animated.Value(0)).current;   // finger offset
  const dragY = useRef(new Animated.Value(0)).current;
  const s1 = useRef(new Animated.Value(0)).current;      // wind streaks
  const s2 = useRef(new Animated.Value(0)).current;
  const s3 = useRef(new Animated.Value(0)).current;
  const windPhase = useRef(new Animated.Value(0)).current; // string ripple
  const stringRef = useRef<any>(null);
  const dragActive = useRef(false);

  useEffect(() => {
    const swing = (v: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: -1, duration: ms * 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    const streak = (v: Animated.Value, ms: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    const loops = [
      swing(bob, 1400),
      swing(sway, 1900),
      swing(wander, 2700),
      swing(flutter, 260),
      streak(s1, 1900, 0),
      streak(s2, 2300, 700),
      streak(s3, 1700, 1400),
      // the "drag me" whisper: every few seconds the kite tugs its line and
      // wobbles back, like it wants to be pulled
      Animated.loop(
        Animated.sequence([
          Animated.delay(3800),
          Animated.timing(tug, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(tug, { toValue: 0, friction: 4, tension: 55, useNativeDriver: true }),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bob, sway, wander, flutter, tug, s1, s2, s3]);

  // ── kite-string geometry (container coords) ──
  const anchorY = panelH * 0.34;          // the kite rides high in the sky
  const topX = panelW / 2;
  const topY = anchorY + 4;               // string emerges just under the kite
  const endX = panelW / 2;
  const endY = panelH * 0.99;             // trails off toward the flyer below
  const span = endY - topY;
  const stringColor = dark ? '#E6DFC9' : '#7A6A3C';
  // Where the grab corridor for the string starts (just below the kite body).
  const stringGrabTop = anchorY + size * 0.28;

  // A traveling S-wave down the string — counter-phase control points.
  const buildD = useCallback(
    (phase: number, amp: number) => {
      const w = Math.PI * 2;
      const c1x = topX + amp * Math.sin(phase * w);
      const c2x = topX + amp * 0.8 * Math.sin(phase * w + Math.PI);
      return `M ${topX} ${topY} C ${c1x} ${topY + span * 0.34}, ${c2x} ${topY + span * 0.68}, ${endX} ${endY}`;
    },
    [topX, topY, endX, endY, span],
  );

  // Drive the ripple continuously (never static); amplitude swells while dragged.
  useEffect(() => {
    const id = windPhase.addListener(({ value }) => {
      stringRef.current?.setNativeProps({ d: buildD(value, dragActive.current ? 24 : 9) });
    });
    const loop = Animated.loop(
      Animated.timing(windPhase, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => {
      windPhase.removeListener(id);
      loop.stop();
    };
  }, [windPhase, buildD]);

  // Drag bounds — roam most of the sky area without leaving it.
  const maxX = panelW / 2 - size * 0.22;
  const maxYUp = panelH * 0.26;
  const maxYDown = panelH * 0.52;

  const release = useCallback(() => {
    dragActive.current = false;
    onDraggingChange?.(false);
    // glide home: slow, soft springs — no snap
    Animated.parallel([
      Animated.spring(dragX, { toValue: 0, friction: 6, tension: 12, useNativeDriver: true }),
      Animated.spring(dragY, { toValue: 0, friction: 6, tension: 12, useNativeDriver: true }),
      Animated.spring(gust, { toValue: 0, friction: 6, tension: 18, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [dragX, dragY, gust, shake, onDraggingChange]);

  const makePan = useCallback(
    () =>
      Gesture.Pan()
        .runOnJS(true) // reanimated is installed → force JS callbacks for RN Animated
        .onStart(() => {
          lightTap();
          dragActive.current = true;
          onDraggingChange?.(true);
        })
        .onUpdate((e) => {
          const x = Math.max(-maxX, Math.min(maxX, e.translationX));
          const y = Math.max(-maxYUp, Math.min(maxYDown, e.translationY));
          dragX.setValue(x);
          dragY.setValue(y);
          // wind-fight intensity grows with how far it's pulled
          gust.setValue(Math.min(1, Math.hypot(e.translationX, e.translationY) / 60));
          // turbulence follows horizontal velocity
          shake.setValue(Math.max(-1, Math.min(1, e.velocityX / 900)));
        })
        .onFinalize(() => release()),
    [maxX, maxYUp, maxYDown, dragX, dragY, gust, shake, release, onDraggingChange],
  );
  // Identical behaviour from two grab targets: the kite body OR its string.
  const panKite = useMemo(() => makePan(), [makePan]);
  const panString = useMemo(() => makePan(), [makePan]);

  // Compose motion: finger + calm ride + turbulence.
  const tx = Animated.add(dragX, Animated.add(Animated.multiply(wander, 7), Animated.multiply(tug, 12)));
  const ty = Animated.add(dragY, Animated.multiply(bob, 9));
  const dragTilt = dragX.interpolate({ inputRange: [-120, 120], outputRange: [-12, 12] });
  const rotate = Animated.add(
    Animated.add(Animated.multiply(sway, 4.5), Animated.multiply(shake, 9)),
    Animated.add(dragTilt, Animated.multiply(tug, 5)),
  ).interpolate({ inputRange: [-30, 30], outputRange: ['-30deg', '30deg'] });
  const finRotate = Animated.add(
    Animated.multiply(flutter, Animated.add(4.5, Animated.multiply(gust, 7))),
    Animated.multiply(shake, 8),
  ).interpolate({ inputRange: [-24, 24], outputRange: ['-24deg', '24deg'] });

  const windStreak = (v: Animated.Value, top: number, len: number) => (
    <Animated.View
      key={`streak-${top}`}
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left: 0,
        width: len,
        height: 2,
        borderRadius: 1,
        backgroundColor: '#F0EDE2',
        opacity: Animated.multiply(
          v.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
          Animated.add(0.22, Animated.multiply(gust, 0.65)),
        ),
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [panelW + 20, -len - 30] }) }],
      }}
    />
  );

  return (
    <View style={{ width: panelW, height: panelH }} pointerEvents="box-none">
      {windStreak(s1, panelH * 0.16, 38)}
      {windStreak(s2, panelH * 0.36, 26)}
      {windStreak(s3, panelH * 0.58, 32)}

      {/* the string — rippling in the wind, fading toward the flyer below; it
          shares the kite's translation so it stays attached during a drag. */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, top: 0, width: panelW, height: panelH, transform: [{ translateX: tx }, { translateY: ty }] }}
      >
        <Svg width={panelW} height={panelH}>
          <Defs>
            <LinearGradient id="wauString" x1={topX} y1={topY} x2={endX} y2={endY} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={stringColor} stopOpacity={0.65} />
              <Stop offset="0.7" stopColor={stringColor} stopOpacity={0.32} />
              <Stop offset="1" stopColor={stringColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path ref={stringRef} d={buildD(0, 9)} stroke="url(#wauString)" strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>

      {/* invisible grab corridor over the string — drag the kite by its line too */}
      <GestureDetector gesture={panString}>
        <Animated.View
          accessibilityRole="adjustable"
          accessibilityLabel="wau string"
          style={{
            position: 'absolute',
            left: panelW / 2 - 26,
            top: stringGrabTop,
            width: 52,
            height: Math.max(0, endY - stringGrabTop),
            transform: [{ translateX: tx }, { translateY: ty }],
          }}
        />
      </GestureDetector>

      <GestureDetector gesture={panKite}>
        <Animated.View
          accessible
          accessibilityRole="image"
          accessibilityLabel="wau"
          style={{
            position: 'absolute',
            left: panelW / 2 - size / 2,
            top: anchorY - size / 2,
            width: size,
            height: size,
            transform: [{ translateX: tx }, { translateY: ty }, { rotate }],
          }}
        >
          <Animated.View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: [{ rotate: finRotate }] }}>
            <WauFins size={size} />
          </Animated.View>
          <WauBody size={size} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};
