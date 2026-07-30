import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  cancelAnimation,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { WauMark } from './WauScene';
import { useT } from '../../i18n';
import { TYPOGRAPHY, withAlpha } from '../../constants';

const HOLD = 80; // header rest height while the refresh runs (fits the bigger kite + hint)
const MIN_SPIN = 1500; // keep the loader up at least this long, even on an instant/empty refresh
const PULL_DAMPING = 0.5; // Android: finger tracks at half speed — rubber feel
const ANDROID_THRESHOLD = 120; // Android pull distance (scaled) that latches
const IOS_THRESHOLD = -92; // iOS bounce offset (negative) that latches — a deliberate pull
// translateY at which the pull latches and the hint flips to "release": the kite
// fills to full scale exactly here, so "release" never shows while it looks half-done.
// iOS reads the raw (resisted) offset, Android a half-damped distance, so the trigger
// sits at a different translateY per platform.
const TRIGGER = Platform.OS === 'ios' ? -IOS_THRESHOLD : HOLD;
const LOADER_H = 72; // loader zone height (kite + hint), fixed just below the safe-area inset
const PUSH = 64; // how far the list drops while refreshing — just enough to clear the loader, no more

type Phase = 'idle' | 'pull' | 'release' | 'refreshing';

/** Three dots that pulse in a staggered 1-2-3 wave beside the "refreshing" hint. */
const RefreshDot: React.FC<{ color: string; delay: number }> = ({ color, delay }) => {
  const a = useSharedValue(0.25);
  useEffect(() => {
    a.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
          withTiming(0.25, { duration: 320, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(a);
  }, [a, delay]);
  const style = useAnimatedStyle(() => ({ opacity: a.value }));
  return <Reanimated.View style={[styles.dot, { backgroundColor: color }, style]} />;
};

const RefreshDots: React.FC<{ color: string }> = ({ color }) => (
  <View style={styles.dots}>
    <RefreshDot color={color} delay={0} />
    <RefreshDot color={color} delay={160} />
    <RefreshDot color={color} delay={320} />
  </View>
);

interface Props {
  /** Fire the refresh (usually the screen's existing onRefresh). */
  onRefresh: () => void;
  /** Parent-controlled refreshing flag — the header holds open until it clears. */
  refreshing: boolean;
  tintColor: string;
  /**
   * Distance from the top of the wrapped scroller to sit the loader. Default 0 —
   * the loader rests at the scroller's top edge (correct when the scroller sits
   * below a screen header). Dashboards, whose scroller is flush under the notch,
   * pass `topInset={insets.top}` so the kite clears the status bar / Dynamic Island.
   */
  topInset?: number;
  children: React.ReactElement;
}

/**
 * Custom pull-to-refresh that bypasses the broken native RefreshControl paths:
 * this build (RN 0.81.5, New Arch) never shows the indicator on the dashboards
 * — Android's SwipeRefreshLayout is dead (RNGH #1067 / RN #54610) and iOS
 * 26's NativeTabs screens don't reveal UIRefreshControl either.
 *
 * Header = the branded wau kite (WauMark) + a phase hint that reads
 * "pull to refresh" → "release to refresh" → "refreshing" as you drag, matching
 * the familiar e-wallet pull gesture.
 *
 * Two drivers, one header:
 *  - **iOS** — driven by the list's own bounce: contentOffset.y goes negative
 *    on a pull, we slide the header in by the same amount; release past
 *    IOS_THRESHOLD latches it open and fires onRefresh.
 *  - **Android** — Android has no negative offsets, so an RNGH pan (only at
 *    scrollY=0, downward) translates the header; release past
 *    ANDROID_THRESHOLD latches and fires.
 * The header holds open until the parent's `refreshing` flag clears.
 */
const PullRefresh: React.FC<Props> = ({ onRefresh, refreshing, tintColor, topInset = 0, children }) => {
  const t = useT();
  const translateY = useSharedValue(0);
  const rock = useSharedValue(0); // continuous bank while refreshing
  const contentShift = useSharedValue(0); // pushes the list down so the loader gets real space
  const refreshingSv = useSharedValue(false);
  const [atTop, setAtTop] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  // `spinning` mirrors the parent's `refreshing`, but is held open for at least
  // MIN_SPIN so an instant/empty refresh still reads as a real load. A genuinely
  // slow load keeps `refreshing` true longer, so it wins.
  const [spinning, setSpinning] = useState(false);
  const startRef = useRef(0);
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard the pull drivers + fire() against the whole active window (parent
  // refreshing OR the min-spin hold) so nothing re-fires or moves the header mid-spin.
  const activeRef = useRef(false);
  activeRef.current = spinning || refreshing;

  // Dedupe phase writes — the drivers call this every frame.
  const phaseRef = useRef<Phase>('idle');
  const applyPhase = useCallback((p: Phase) => {
    if (phaseRef.current !== p) {
      phaseRef.current = p;
      setPhase(p);
    }
  }, []);

  const fire = useCallback(() => {
    if (!activeRef.current) onRefresh();
  }, [onRefresh]);

  // Parent's `refreshing` → drive `spinning` with a MIN_SPIN floor.
  useEffect(() => {
    if (refreshing) {
      if (foldTimer.current) { clearTimeout(foldTimer.current); foldTimer.current = null; }
      startRef.current = Date.now();
      setSpinning(true);
      return;
    }
    // Parent finished — hold the loader until MIN_SPIN has elapsed, then fold.
    const remain = Math.max(0, MIN_SPIN - (Date.now() - startRef.current));
    foldTimer.current = setTimeout(() => {
      setSpinning(false);
      foldTimer.current = null;
    }, remain);
    return () => {
      if (foldTimer.current) { clearTimeout(foldTimer.current); foldTimer.current = null; }
    };
  }, [refreshing]);

  // `spinning` → hold the header open + rock the kite, or fold it away.
  useEffect(() => {
    refreshingSv.value = spinning;
    if (spinning) {
      applyPhase('refreshing');
      translateY.value = withSpring(HOLD, { damping: 18, stiffness: 240 });
      // Hold the list pushed down so the loader keeps its gap even after the iOS
      // bounce springs the content back to the top (otherwise the hint collides).
      contentShift.value = withSpring(PUSH, { damping: 20, stiffness: 220 });
      rock.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(rock);
      rock.value = withTiming(0, { duration: 240 });
      translateY.value = withTiming(0, { duration: 240 });
      contentShift.value = withTiming(0, { duration: 260 });
      applyPhase('idle');
    }
  }, [spinning, translateY, rock, contentShift, refreshingSv, applyPhase]);

  // ── iOS: pure scroll-offset drive (bounce makes offsets negative) ──
  const handleScrollIos = useCallback(
    (e: any) => {
      const y = e.nativeEvent.contentOffset.y;
      if (activeRef.current) return; // latched / spinning — leave it
      if (y <= 0) {
        translateY.value = Math.min(-y, TRIGGER + 60);
        applyPhase(y <= IOS_THRESHOLD ? 'release' : y < -4 ? 'pull' : 'idle');
      } else {
        translateY.value = withTiming(0, { duration: 120 });
        applyPhase('idle');
      }
    },
    [translateY, applyPhase],
  );

  const handleEndDragIos = useCallback(
    (e: any) => {
      if (activeRef.current) return;
      if (e.nativeEvent.contentOffset.y <= IOS_THRESHOLD) {
        translateY.value = withSpring(HOLD, { damping: 18, stiffness: 240 });
        fire();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 240 });
        applyPhase('idle');
      }
    },
    [translateY, fire, applyPhase],
  );

  // ── Android: RNGH pan at scroll-top (no negative offsets exist) ──
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(atTop)
        .activeOffsetY(24)
        .onUpdate((e) => {
          'worklet';
          const d = e.translationY * PULL_DAMPING;
          translateY.value = Math.min(d, ANDROID_THRESHOLD + 40);
          runOnJS(applyPhase)(d >= HOLD ? 'release' : 'pull');
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY * PULL_DAMPING >= HOLD) {
            translateY.value = withSpring(HOLD, { damping: 18, stiffness: 240 });
            runOnJS(fire)();
          } else {
            translateY.value = withSpring(0, { damping: 18, stiffness: 240 });
            runOnJS(applyPhase)('idle');
          }
        }),
    [atTop, translateY, fire, applyPhase],
  );

  const handleScrollAndroid = useCallback((e: any) => {
    setAtTop(e.nativeEvent.contentOffset.y <= 4);
  }, []);

  // The loader sits in a fixed zone just below the safe-area inset; it fades in with
  // the pull rather than sliding up behind the notch. Full opacity while refreshing.
  const headerStyle = useAnimatedStyle(() => ({
    opacity: refreshingSv.value
      ? 1
      : interpolate(translateY.value, [HOLD * 0.2, HOLD], [0, 1], Extrapolation.CLAMP),
  }));

  // While refreshing, the list is pushed down by contentShift so the loader owns its gap.
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentShift.value }],
  }));

  // The kite reveals and banks as you pull, filling to full scale exactly at the
  // TRIGGER point (where the hint flips to "release"); while refreshing it rocks.
  const kiteStyle = useAnimatedStyle(() => {
    const isRefreshing = refreshingSv.value;
    const rot = isRefreshing
      ? interpolate(rock.value, [0, 1], [-12, 12])
      : interpolate(translateY.value, [0, TRIGGER], [-20, 0], Extrapolation.CLAMP);
    const scale = isRefreshing
      ? 1
      : interpolate(translateY.value, [0, TRIGGER], [0.7, 1], Extrapolation.CLAMP);
    const opacity = isRefreshing
      ? 1
      : interpolate(translateY.value, [TRIGGER * 0.08, TRIGGER * 0.3], [0, 1], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale }, { rotate: `${rot}deg` }],
    };
  });

  const hint =
    phase === 'release'
      ? t.common.releaseToRefresh
      : phase === 'refreshing'
        ? t.common.refreshing
        : t.common.pullToRefresh;

  const header = (
    <Reanimated.View style={[styles.header, { top: topInset }, headerStyle]} pointerEvents="none">
      <Reanimated.View style={kiteStyle}>
        <WauMark size={50} />
      </Reanimated.View>
      <View style={styles.hintRow}>
        <Text style={[styles.hint, { color: withAlpha(tintColor, 0.9) }]} numberOfLines={1}>
          {hint}
        </Text>
        {phase === 'refreshing' && <RefreshDots color={withAlpha(tintColor, 0.9)} />}
      </View>
    </Reanimated.View>
  );

  // Compose with any onScroll/onScrollEndDrag the wrapped scroller already has, so
  // wrapping a list that tracks its own scroll position doesn't lose that handler.
  // (A native Animated.event onScroll can't be composed this way — those screens
  // should keep driving their own header and not be wrapped.)
  const childProps = children.props as { onScroll?: (e: any) => void; onScrollEndDrag?: (e: any) => void };

  if (Platform.OS === 'android') {
    return (
      <GestureDetector gesture={pan}>
        <View style={styles.wrap}>
          <Reanimated.View style={[styles.contentWrap, contentStyle]}>
            {React.cloneElement(children, {
              onScroll: (e: any) => { childProps.onScroll?.(e); handleScrollAndroid(e); },
              scrollEventThrottle: 16,
            } as any)}
          </Reanimated.View>
          {header}
        </View>
      </GestureDetector>
    );
  }

  // iOS — no gesture detector needed; the bounce IS the signal.
  return (
    <View style={styles.wrap}>
      <Reanimated.View style={[styles.contentWrap, contentStyle]}>
        {React.cloneElement(children, {
          onScroll: (e: any) => { childProps.onScroll?.(e); handleScrollIos(e); },
          onScrollEndDrag: (e: any) => { childProps.onScrollEndDrag?.(e); handleEndDragIos(e); },
          scrollEventThrottle: 16,
        } as any)}
      </Reanimated.View>
      {header}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  contentWrap: {
    flex: 1,
  },
  header: {
    // `top` is set inline to the safe-area inset so the loader sits below the notch.
    position: 'absolute',
    left: 0,
    right: 0,
    height: LOADER_H,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 10,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hint: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.3,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export default PullRefresh;
