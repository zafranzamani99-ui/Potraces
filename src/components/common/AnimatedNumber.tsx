import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Text, TextStyle } from 'react-native';
import {
  useSharedValue,
  withTiming,
  withSpring,
  useAnimatedReaction,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

// ─── TYPES ──────────────────────────────────────────────────
interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle;
  easing?: 'linear' | 'easeInOut' | 'easeOut' | 'spring';
  onComplete?: () => void;
}

// ─── COMPONENT ──────────────────────────────────────────────
const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 600,
  decimals = 0,
  prefix = '',
  suffix = '',
  style,
  easing = 'easeOut',
  onComplete,
}) => {
  const animatedValue = useSharedValue(value);
  const isFirstRender = useRef(true);
  const [displayText, setDisplayText] = useState(
    `${prefix}${value.toFixed(decimals)}${suffix}`
  );

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const stableOnComplete = useCallback(() => {
    onCompleteRef.current?.();
  }, []);

  const updateText = useCallback((v: number) => {
    setDisplayText(`${prefix}${v.toFixed(decimals)}${suffix}`);
  }, [prefix, suffix, decimals]);

  useAnimatedReaction(
    () => animatedValue.value,
    (current) => {
      runOnJS(updateText)(current);
    },
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const easingFunc = (() => {
      switch (easing) {
        case 'linear':
          return Easing.linear;
        case 'easeInOut':
          return Easing.inOut(Easing.ease);
        case 'easeOut':
        default:
          return Easing.out(Easing.ease);
      }
    })();

    if (easing === 'spring') {
      animatedValue.value = withSpring(value, { mass: 1, damping: 14, stiffness: 120 }, (finished) => {
        if (finished) runOnJS(stableOnComplete)();
      });
    } else {
      animatedValue.value = withTiming(value, { duration, easing: easingFunc }, (finished) => {
        if (finished) runOnJS(stableOnComplete)();
      });
    }
  }, [value, duration, easing]);

  return (
    <Text
      style={style}
      accessibilityRole="text"
      accessibilityLabel={`${prefix}${value.toFixed(decimals)}${suffix}`}
    >
      {displayText}
    </Text>
  );
};

export default AnimatedNumber;
