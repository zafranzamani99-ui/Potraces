import React, { useEffect, useRef, useMemo } from 'react';
import { Text, Animated, StyleSheet } from 'react-native';
import { CALM, TYPE, SPACING } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

interface BusinessInsightLineProps {
  text: string | null;
}

const BusinessInsightLine: React.FC<BusinessInsightLineProps> = ({ text }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (text) {
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [text]);

  if (!text) return null;

  return (
    <Animated.Text style={[styles.text, { opacity }]}>
      {text}
    </Animated.Text>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  text: {
    ...TYPE.insight,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
});

export default React.memo(BusinessInsightLine);
