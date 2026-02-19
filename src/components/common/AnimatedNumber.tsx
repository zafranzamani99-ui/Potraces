import React, { useEffect, useRef } from 'react';
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
/**
 * AnimatedNumber - Smoothly animates number changes
 *
 * Features:
 * - Count-up/count-down animation for number changes
 * - Configurable duration and easing
 * - Currency formatting support
 * - Spring animation option for natural feel
 * - Callback on animation complete
 *
 * @example
 * <AnimatedNumber
 *   value={balance}
 *   duration={800}
 *   decimals={2}
 *   prefix="RM "
 *   style={styles.balanceText}
 * />
 */
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
  const animatedValue = useRef(new Animated.Value(0)).current;
  const prevValue = useRef(0);
  const displayValue = useRef(0);

  useEffect(() => {
    // Update previous value
    const current = prevValue.current;
    prevValue.current = value;

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

    // Animate the value change
    if (easing === 'spring') {
      Animated.spring(animatedValue, {
        toValue: value,
        useNativeDriver: false,
        speed: 12,
        bounciness: 4,
      }).start(onComplete);
    } else {
      Animated.timing(animatedValue, {
        toValue: value,
        duration,
        easing: easingFunc,
        useNativeDriver: false,
      }).start(onComplete);
    }

    // Set initial value for interpolation
    animatedValue.setValue(current);
  }, [value, duration, easing, onComplete]);

  // Format the animated value
  const formattedValue = animatedValue.interpolate({
    inputRange: [0, value || 1],
    outputRange: [`${prefix}${(0).toFixed(decimals)}${suffix}`, `${prefix}${value.toFixed(decimals)}${suffix}`],
  });

  return (
    <Animated.Text
      style={style}
      accessibilityRole="text"
      accessibilityLabel={`${prefix}${value.toFixed(decimals)}${suffix}`}
    >
      {formattedValue}
    </Animated.Text>
  );
};

export default AnimatedNumber;
