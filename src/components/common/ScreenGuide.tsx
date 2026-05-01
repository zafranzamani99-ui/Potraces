import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { lightTap } from '../../services/haptics';

interface ScreenGuideProps {
  id: string;
  title: string;
  description: string;
  icon?: keyof typeof Feather.glyphMap;
  accent?: string;
}

const ScreenGuide: React.FC<ScreenGuideProps> = ({ id, title, description, icon = 'info', accent }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const dismissed = useSettingsStore((s) => s.dismissedHints.includes(id));
  const dismissHint = useSettingsStore((s) => s.dismissHint);
  const accentColor = accent ?? C.accent;

  const handleDismiss = useCallback(() => {
    lightTap();
    dismissHint(id);
  }, [id, dismissHint]);

  if (dismissed) return null;

  return (
    <Animated.View
      entering={FadeIn.delay(500).duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.wrapper}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: accentColor }]}
        onPress={handleDismiss}
        activeOpacity={0.9}
      >
        <View style={[styles.iconCircle, { backgroundColor: withAlpha(accentColor, 0.1) }]}>
          <Feather name={icon} size={16} color={accentColor} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>{description}</Text>
        </View>
        <Feather name="x" size={14} color={C.textMuted} style={styles.close} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 24,
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: 9998,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: C.accent,
    ...SHADOWS.sm,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 2,
  },
  desc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.normal,
  },
  close: {
    marginLeft: SPACING.sm,
    padding: SPACING.xs,
  },
});

export default ScreenGuide;
