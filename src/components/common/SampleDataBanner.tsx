/**
 * Sample Data Banner — the exit from demo mode.
 *
 * Shows on the personal Dashboard whenever the sample/demo dataset is loaded
 * (settingsStore.sampleDataLoaded). It's the one always-visible way for a user
 * who chose "start with demo data" (or loaded it from Settings) to wipe the
 * fake data and begin with their own — without hunting through Settings or
 * deleting nine wallets by hand. Clearing keeps them onboarded (name, language,
 * theme preserved); they land on a clean empty dashboard, not back in
 * onboarding. Self-gates: renders null when no sample data is loaded.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../i18n';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { mediumTap } from '../../services/haptics';

const SampleDataBanner: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const t = useT();
  const { showToast } = useToast();
  const sampleDataLoaded = useSettingsStore((s) => s.sampleDataLoaded);
  const clearSampleData = useSettingsStore((s) => s.clearSampleData);

  const handleClear = useCallback(() => {
    mediumTap();
    Alert.alert(
      t.sampleData.confirmTitle,
      t.sampleData.confirmBody,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.sampleData.cta,
          style: 'destructive',
          onPress: async () => {
            await clearSampleData();
            showToast(t.sampleData.cleared, 'success');
          },
        },
      ],
    );
  }, [clearSampleData, showToast, t]);

  // Self-gating: nothing to show unless the demo dataset is loaded.
  if (!sampleDataLoaded) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Feather name="play-circle" size={18} color={C.accent} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{t.sampleData.bannerTitle}</Text>
          <Text style={styles.subtitle}>{t.sampleData.bannerSubtitle}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.cta}
        onPress={handleClear}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t.sampleData.cta}
      >
        <Feather name="refresh-cw" size={14} color={C.onAccent} />
        <Text style={styles.ctaText}>{t.sampleData.cta}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default React.memo(SampleDataBanner);

const makeStyles = (C: typeof CALM, isDark: boolean) => StyleSheet.create({
  banner: {
    marginBottom: SPACING.md,
    backgroundColor: withAlpha(C.accent, isDark ? 0.1 : 0.05),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, isDark ? 0.22 : 0.14),
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(C.accent, isDark ? 0.18 : 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    backgroundColor: C.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    // Keep the tap target comfortably ≥ 44px tall including the padding.
    minHeight: 44,
  },
  ctaText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
});
