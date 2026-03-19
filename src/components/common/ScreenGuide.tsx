import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { lightTap } from '../../services/haptics';

interface ScreenGuideProps {
  id: string;
  title: string;
  tips: string[];
  icon?: keyof typeof Feather.glyphMap;
}

const ScreenGuide: React.FC<ScreenGuideProps> = ({ id, title, tips, icon = 'info' }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const dismissed = useSettingsStore((s) => s.dismissedHints.includes(id));
  const dismissHint = useSettingsStore((s) => s.dismissHint);

  const handleDismiss = useCallback(() => {
    lightTap();
    dismissHint(id);
  }, [id, dismissHint]);

  if (dismissed) return null;

  return (
    <Animated.View
      entering={FadeIn.delay(400).duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.overlay}
      pointerEvents="box-none"
    >
      <Pressable style={styles.backdrop} onPress={handleDismiss} />
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Feather name={icon} size={24} color={C.accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={[styles.tipDot, { backgroundColor: C.accent }]} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
        <TouchableOpacity style={styles.gotItBtn} onPress={handleDismiss} activeOpacity={0.7}>
          <Text style={styles.gotItText}>{t.guide.gotIt}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  card: {
    width: '82%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOWS.lg,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: withAlpha(C.accent, 0.08),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.sm,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    marginRight: SPACING.sm,
  },
  tipText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.normal,
  },
  gotItBtn: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xl * 2,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
  },
  gotItText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
});

export default ScreenGuide;
