import React, { useEffect, useRef, useMemo } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';
import { CALM, TYPE, SPACING } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

/**
 * Canonical hero-number primitive for ALL 7 dashboards
 * (personal, seller, stall, business parent, freelancer, mixed,
 * on-the-road, part-time).
 *
 * Always uses `...TYPE.amount` (full spread → preserves
 * `fontVariant: ['tabular-nums']`) so digits never jiggle.
 *
 * Props:
 *  - amount    : the number to display (will be Math.round'd for ticker)
 *  - label     : sub-label below the number (e.g. "kept this month")
 *  - sublabel? : optional second line under the label
 *  - prefix?   : currency / symbol shown before the number ("RM" default)
 *  - currency? : alias of `prefix` (back-compat)
 *  - animated? : count-up animation, default true
 */
interface BusinessHeroNumberProps {
  amount: number;
  label: string;
  sublabel?: string;
  prefix?: string;
  currency?: string;
  animated?: boolean;
}

const BusinessHeroNumber: React.FC<BusinessHeroNumberProps> = ({
  amount,
  label,
  sublabel,
  prefix,
  currency,
  animated = true,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  // prefix is the canonical name; currency kept for back-compat
  const symbol = prefix ?? currency ?? 'RM';
  const animatedValue = useRef(new Animated.Value(0)).current;
  const opacityValue = useRef(new Animated.Value(animated ? 0 : 1)).current;
  const [displayText, setDisplayText] = React.useState(
    animated ? `${symbol} 0` : `${symbol} ${Math.round(amount).toLocaleString()}`
  );

  useEffect(() => {
    if (!animated) {
      setDisplayText(`${symbol} ${Math.round(amount).toLocaleString()}`);
      return;
    }

    opacityValue.setValue(0);
    animatedValue.setValue(0);

    const fadeAnim = Animated.timing(opacityValue, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    });

    const countAnim = Animated.timing(animatedValue, {
      toValue: amount,
      duration: 300,
      useNativeDriver: false,
    });

    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayText(`${symbol} ${Math.round(value).toLocaleString()}`);
    });

    Animated.parallel([fadeAnim, countAnim]).start();

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [amount, symbol, animated]);

  return (
    <Animated.View style={[styles.container, { opacity: opacityValue }]}>
      <Text style={styles.amount} accessibilityLabel={`${symbol} ${Math.round(amount)}`}>
        {displayText}
      </Text>
      <Text style={styles.label}>{label}</Text>
      {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  amount: {
    // Full spread of TYPE.amount preserves fontVariant: ['tabular-nums']
    // so the count-up animation doesn't shift the layout each tick.
    ...TYPE.amount,
    color: C.textPrimary,
    textAlign: 'center',
  },
  label: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  sublabel: {
    ...TYPE.muted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});

export default BusinessHeroNumber;
