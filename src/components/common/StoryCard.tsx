import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

interface StoryCardProps {
  narrative: string;
  icon: string;
  accentColor: string;
  onPress?: () => void;
}

const StoryCard: React.FC<StoryCardProps> = ({ narrative, icon, accentColor, onPress }) => {
  const C = useCalm();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const content = (
    <Animated.View style={[
      styles.card,
      {
        backgroundColor: withAlpha(accentColor, 0.05),
        borderColor: withAlpha(accentColor, 0.12),
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      },
    ]}>
      <View style={[styles.iconCircle, { backgroundColor: withAlpha(accentColor, 0.12) }]}>
        <Feather name={icon as keyof typeof Feather.glyphMap} size={16} color={accentColor} />
      </View>
      <Text style={[styles.narrative, { color: C.textSecondary }]} numberOfLines={3}>
        {narrative}
      </Text>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrative: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
});

export default React.memo(StoryCard);
