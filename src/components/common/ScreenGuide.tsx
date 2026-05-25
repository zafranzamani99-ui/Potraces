import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, ICON_SIZE, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';

interface ScreenGuideProps {
  id: string;
  title: string;
  description: string;
  icon?: keyof typeof Feather.glyphMap;
  accent?: string;
}

// FIRSTRUN-H1 fix: this guide used to float at the bottom of the screen
// (position: absolute, bottom: 24) which on screens like WalletManagement
// covered the FAB / primary CTA. It is now a top-anchored banner that sits
// below the screen header and never blocks the user's primary action.
const ScreenGuide: React.FC<ScreenGuideProps> = ({ id, title, description, icon = 'info', accent }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const dismissed = useSettingsStore((s) => s.dismissedHints.includes(id));
  const dismissHint = useSettingsStore((s) => s.dismissHint);
  const accentColor = accent ?? C.accent;

  const handleDismiss = useCallback(() => {
    lightTap();
    dismissHint(id);
  }, [id, dismissHint]);

  if (dismissed) return null;

  const a11yLabel = `${title}. ${description}`;

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
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t.a11y.dismissHint}
      >
        <View style={[styles.iconCircle, { backgroundColor: withAlpha(accentColor, 0.1) }]}>
          <Feather name={icon} size={ICON_SIZE.xs} color={accentColor} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>{description}</Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.closeButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t.a11y.deny}
          accessibilityHint={t.a11y.dismissHint}
        >
          <Feather name="x" size={ICON_SIZE.xs} color={C.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  // Top-anchored banner. Sits below the header (most consumer screens render
  // a header with its own padding) and never overlaps a bottom-anchored CTA
  // such as the FAB in WalletManagement.
  wrapper: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
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
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  iconCircle: {
    width: SPACING.xl + SPACING.sm, // 32 — on the 8-grid; matches ICON_SIZE.lg
    height: SPACING.xl + SPACING.sm,
    borderRadius: RADIUS.full,
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
    marginBottom: SPACING.xs / 2, // visual separation under title
  },
  desc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.normal,
  },
  closeButton: {
    marginLeft: SPACING.sm,
    padding: SPACING.xs,
  },
});

export default ScreenGuide;
