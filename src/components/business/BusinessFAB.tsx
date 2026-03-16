import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS } from '../../constants';

interface BusinessFABProps {
  label: string;
  onPress: () => void;
  secondaryAction?: { label: string; onPress: () => void };
  accentColor?: string;
}

const BusinessFAB: React.FC<BusinessFABProps> = ({
  label,
  onPress,
  secondaryAction,
  accentColor = CALM.bronze,
}) => {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 20,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
      {secondaryAction && (
        <TouchableOpacity
          style={[styles.secondary, { borderColor: accentColor }]}
          onPress={secondaryAction.onPress}
          activeOpacity={0.7}
          accessibilityLabel={secondaryAction.label}
        >
          <Text style={[styles.secondaryText, { color: accentColor }]}>
            {secondaryAction.label}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.primary, { backgroundColor: accentColor }, SHADOWS.sm]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityLabel={label}
      >
        <Text style={styles.primaryText}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: SPACING['2xl'],
    right: SPACING['2xl'],
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  primary: {
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
  secondary: {
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    backgroundColor: CALM.background,
  },
  secondaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
});

export default React.memo(BusinessFAB);
