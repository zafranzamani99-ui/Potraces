import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

const HOLD = 64; // header height while the refresh runs
const PULL_DAMPING = 0.5; // Android: finger tracks at half speed — rubber feel
const ANDROID_THRESHOLD = 120; // Android pull distance (scaled) that latches
const IOS_THRESHOLD = -70; // iOS bounce offset (negative) that latches

interface Props {
  /** Fire the refresh (usually the screen's existing onRefresh). */
  onRefresh: () => void;
  /** Parent-controlled refreshing flag — the header holds open until it clears. */
  refreshing: boolean;
  tintColor: string;
  children: React.ReactElement;
}

/**
 * Custom pull-to-refresh that bypasses the broken native RefreshControl paths:
 * this build (RN 0.81.5, New Arch) never shows the indicator on the dashboards
 * — Android's SwipeRefreshLayout is dead (RNGH #1067 / RN #54610) and iOS
 * 26's NativeTabs screens don't reveal UIRefreshControl either.
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
const PullRefresh: React.FC<Props> = ({ onRefresh, refreshing, tintColor, children }) => {
  const translateY = useSharedValue(0);
  const [atTop, setAtTop] = useState(true);
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;

  const fire = useCallback(() => {
    if (!refreshingRef.current) onRefresh();
  }, [onRefresh]);

  // Parent finished refreshing → fold the header away.
  useEffect(() => {
    if (!refreshing) translateY.value = withTiming(0, { duration: 240 });
  }, [refreshing, translateY]);

  // ── iOS: pure scroll-offset drive (bounce makes offsets negative) ──
  const handleScrollIos = useCallback(
    (e: any) => {
      const y = e.nativeEvent.contentOffset.y;
      if (refreshingRef.current) return; // latched — leave it
      if (y <= 0) translateY.value = Math.min(-y, -IOS_THRESHOLD + 60);
      else translateY.value = withTiming(0, { duration: 120 });
    },
    [translateY],
  );

  const handleEndDragIos = useCallback(
    (e: any) => {
      if (refreshingRef.current) return;
      if (e.nativeEvent.contentOffset.y <= IOS_THRESHOLD) {
        translateY.value = withSpring(HOLD, { damping: 18, stiffness: 240 });
        fire();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 240 });
      }
    },
    [translateY, fire],
  );

  // ── Android: RNGH pan at scroll-top (no negative offsets exist) ──
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(atTop)
        .activeOffsetY(24)
        .onUpdate((e) => {
          'worklet';
          translateY.value = Math.min(e.translationY * PULL_DAMPING, ANDROID_THRESHOLD + 40);
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY * PULL_DAMPING >= HOLD) {
            translateY.value = withSpring(HOLD, { damping: 18, stiffness: 240 });
            runOnJS(fire)();
          } else {
            translateY.value = withSpring(0, { damping: 18, stiffness: 240 });
          }
        }),
    [atTop, translateY, fire],
  );

  const handleScrollAndroid = useCallback((e: any) => {
    setAtTop(e.nativeEvent.contentOffset.y <= 4);
  }, []);

  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: interpolate(translateY.value, [0, 24], [0, 1], Extrapolation.CLAMP),
  }));

  const header = (
    <Reanimated.View style={[styles.header, headerStyle]} pointerEvents="none">
      {/* size large — matches the native loader on TransactionsList. */}
      <ActivityIndicator size="large" color={tintColor} />
    </Reanimated.View>
  );

  if (Platform.OS === 'android') {
    return (
      <GestureDetector gesture={pan}>
        <View style={styles.wrap}>
          {React.cloneElement(children, { onScroll: handleScrollAndroid } as any)}
          {header}
        </View>
      </GestureDetector>
    );
  }

  // iOS — no gesture detector needed; the bounce IS the signal.
  return (
    <View style={styles.wrap}>
      {React.cloneElement(children, {
        onScroll: handleScrollIos,
        onScrollEndDrag: handleEndDragIos,
        scrollEventThrottle: 16,
      } as any)}
      {header}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: -56,
    left: 0,
    right: 0,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});

export default PullRefresh;
