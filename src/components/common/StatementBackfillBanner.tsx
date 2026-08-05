/**
 * Statement Backfill Banner — the onboarding-backfill entry (design §9).
 *
 * Shows on the personal Dashboard for a FRESH account only: onboarding done,
 * personal mode, zero transactions, never dismissed, and no past statement/CSV
 * import batch (a batch means they already know the feature). It offers the
 * "start with last month's statement" path — an empty wallet means zero dedup
 * collision, and instant history answers the #1 switching anxiety.
 *
 * The X dismisses forever (settingsStore.statementBackfillDismissed); tapping
 * the banner or its CTA navigates to ImportFromStatement (a successful import
 * then retires the banner via the batch rule). Self-gates: renders null unless
 * every condition holds.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';
import { usePersonalStore } from '../../store/personalStore';
import { useImportBatchStore } from '../../store/importBatchStore';
import { useT } from '../../i18n';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { lightTap } from '../../services/haptics';

const StatementBackfillBanner: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const t = useT();
  const navigation = useNavigation<any>();

  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);
  const dismissed = useSettingsStore((s) => s.statementBackfillDismissed);
  const setDismissed = useSettingsStore((s) => s.setStatementBackfillDismissed);
  const mode = useAppStore((s) => s.mode);
  const hasTransactions = usePersonalStore((s) => s.transactions.length > 0);
  const hasImportBatch = useImportBatchStore((s) => s.batches.length > 0);

  const handleDismiss = useCallback(() => {
    lightTap();
    setDismissed(true);
  }, [setDismissed]);

  const handleOpen = useCallback(() => {
    lightTap();
    navigation.navigate('ImportFromStatement');
  }, [navigation]);

  if (!hasCompletedOnboarding || mode !== 'personal' || hasTransactions || dismissed || hasImportBatch) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Feather name="file-text" size={18} color={C.accent} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{t.statementBackfill.bannerTitle}</Text>
          <Text style={styles.subtitle}>{t.statementBackfill.bannerSubtitle}</Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          <Feather name="x" size={16} color={C.textMuted} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.cta}
        onPress={handleOpen}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t.statementBackfill.cta}
      >
        <Feather name="upload" size={14} color={C.onAccent} />
        <Text style={styles.ctaText}>{t.statementBackfill.cta}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default React.memo(StatementBackfillBanner);

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
