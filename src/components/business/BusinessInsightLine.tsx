import React, { useEffect, useRef } from 'react';
import { Text, Animated, StyleSheet } from 'react-native';
import { CALM, TYPE, SPACING } from '../../constants';

interface BusinessInsightLineProps {
  text: string | null;
}

const BusinessInsightLine: React.FC<BusinessInsightLineProps> = ({ text }) => {
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

const styles = StyleSheet.create({
  text: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
  },
});

export default BusinessInsightLine;
