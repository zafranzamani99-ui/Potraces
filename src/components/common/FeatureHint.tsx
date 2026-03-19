import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';

interface FeatureHintProps {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  message: string;
}

const FeatureHint: React.FC<FeatureHintProps> = ({ id, icon, message }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const dismissed = useSettingsStore((s) => s.dismissedHints.includes(id));
  const dismissHint = useSettingsStore((s) => s.dismissHint);

  if (dismissed) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.container}>
      <View style={styles.accentBar} />
      <Feather name={icon} size={16} color={C.accent} style={styles.icon} />
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity onPress={() => dismissHint(id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={14} color={C.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingRight: SPACING.md,
    marginHorizontal: SPACING['2xl'],
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: C.accent,
    borderTopLeftRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.lg,
  },
  icon: {
    marginLeft: SPACING.md,
    marginRight: SPACING.sm,
  },
  message: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.sm * 1.4,
  },
});

export default FeatureHint;
