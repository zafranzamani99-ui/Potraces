import { Animated, Easing } from 'react-native';

/**
 * Fade in — opacity 0→1, 200ms
 */
export function fadeIn(value: Animated.Value, duration = 200): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue: 1,
    duration,
    easing: Easing.out(Easing.ease),
    useNativeDriver: true,
  });
}

/**
 * Fade out — opacity 1→0, 200ms
 */
export function fadeOut(value: Animated.Value, duration = 200): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue: 0,
    duration,
    easing: Easing.in(Easing.ease),
    useNativeDriver: true,
  });
}

/**
 * Animated count-up from 0 to target, 300ms.
 * Returns current value via listener. Call .start() to begin.
 */
export function countUp(
  value: Animated.Value,
  toValue: number,
  duration = 300
): Animated.CompositeAnimation {
  value.setValue(0);
  return Animated.timing(value, {
    toValue,
    duration,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: false,
  });
}

/**
 * Bar grow — height from 0 to target, 200ms with stagger offset.
 */
export function barGrow(
  value: Animated.Value,
  toValue: number,
  delay = 0,
  duration = 200
): Animated.CompositeAnimation {
  value.setValue(0);
  return Animated.sequence([
    Animated.delay(delay),
    Animated.timing(value, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }),
  ]);
}

/**
 * Opacity pulse — 1→0.7→1, 150ms total. Used for tap feedback.
 */
export function pulseOpacity(value: Animated.Value): Animated.CompositeAnimation {
  return Animated.sequence([
    Animated.timing(value, {
      toValue: 0.7,
      duration: 75,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }),
    Animated.timing(value, {
      toValue: 1,
      duration: 75,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }),
  ]);
}

/**
 * Scale in — 0→1, 100ms with slight overshoot.
 */
export function scaleIn(value: Animated.Value, duration = 100): Animated.CompositeAnimation {
  value.setValue(0);
  return Animated.spring(value, {
    toValue: 1,
    speed: 20,
    bounciness: 4,
    useNativeDriver: true,
  });
}

/**
 * Slide up — translateY from 100→0, 250ms with deceleration.
 */
export function slideUp(value: Animated.Value, duration = 250): Animated.CompositeAnimation {
  value.setValue(100);
  return Animated.timing(value, {
    toValue: 0,
    duration,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  });
}

/**
 * Staggered animation — runs multiple animations with delay between each.
 */
export function stagger(
  animations: Animated.CompositeAnimation[],
  delayMs = 50
): Animated.CompositeAnimation {
  return Animated.stagger(delayMs, animations);
}
