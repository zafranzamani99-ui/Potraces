import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Text, TextStyle, Animated, Easing } from 'react-native';

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
  const animatedValue = useRef(new Animated.Value(value)).current;
  const prevValue = useRef(value);
  const [displayText, setDisplayText] = useState(
    `${prefix}${value.toFixed(decimals)}${suffix}`
  );

  // Stabilize onComplete to avoid infinite re-render when passed inline
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const stableOnComplete = useCallback(() => {
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    const from = prevValue.current;
    prevValue.current = value;

    // Set starting point before animation
    animatedValue.setValue(from);

    // Select easing function
    const easingFunc = (() => {
      switch (easing) {
        case 'linear':
          return Easing.linear;
        case 'easeInOut':
          return Easing.inOut(Easing.ease);
        case 'easeOut':
          return Easing.out(Easing.ease);
        default:
          return Easing.out(Easing.ease);
      }
    })();

    // Listen to animated value changes to update display text
    const listenerId = animatedValue.addListener(({ value: v }) => {
      setDisplayText(`${prefix}${v.toFixed(decimals)}${suffix}`);
    });

    // Animate the value change
    if (easing === 'spring') {
      Animated.spring(animatedValue, {
        toValue: value,
        useNativeDriver: false,
        speed: 12,
        bounciness: 4,
      }).start(stableOnComplete);
    } else {
      Animated.timing(animatedValue, {
        toValue: value,
        duration,
        easing: easingFunc,
        useNativeDriver: false,
      }).start(stableOnComplete);
    }

    return () => {
      animatedValue.removeListener(listenerId);
    };
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
