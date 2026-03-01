import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { CALM, TYPE, SPACING, TYPOGRAPHY } from '../../constants';

interface BusinessHeroNumberProps {
  amount: number;
  label: string;
  sublabel?: string;
  currency?: string;
  animated?: boolean;
}

const BusinessHeroNumber: React.FC<BusinessHeroNumberProps> = ({
  amount,
  label,
  sublabel,
  currency = 'RM',
  animated = true,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const opacityValue = useRef(new Animated.Value(animated ? 0 : 1)).current;
  const displayAmount = useRef(0);
  const [displayText, setDisplayText] = React.useState(
    animated ? `${currency} 0` : `${currency} ${Math.round(amount).toLocaleString()}`
  );

  useEffect(() => {
    if (!animated) {
      setDisplayText(`${currency} ${Math.round(amount).toLocaleString()}`);
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
      displayAmount.current = value;
      setDisplayText(`${currency} ${Math.round(value).toLocaleString()}`);
    });

    Animated.parallel([fadeAnim, countAnim]).start();

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [amount, currency, animated]);

  return (
    <Animated.View style={[styles.container, { opacity: opacityValue }]}>
      <Text style={styles.amount} accessibilityLabel={`${currency} ${Math.round(amount)}`}>
        {displayText}
      </Text>
      <Text style={styles.label}>{label}</Text>
      {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  amount: {
    ...TYPE.balance,
    color: CALM.textPrimary,
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
