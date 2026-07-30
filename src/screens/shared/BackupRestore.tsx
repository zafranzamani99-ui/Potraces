/**
 * BackupRestore — surfaces the local rolling backups (src/services/storageBackup.ts)
 * so the user can recover their data after a bad write, without a developer.
 *
 * The app snapshots every money/data store once a day. This screen lists the
 * available days and lets the user restore everything from a chosen day. A restore
 * snapshots the current state first (reversible), then the app reloads to re-hydrate.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, DevSettings } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as Updates from 'expo-updates';

import Button from '../../components/common/Button';
import PullRefresh from '../../components/common/PullRefresh';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap, successNotification, warningNotification } from '../../services/haptics';
import { listBackupDays, planRestoreDay, restoreDay } from '../../services/storageBackup';

function labelFor(stamp: string): string {
  const d = new Date(`${stamp}T00:00:00`);
  if (isNaN(d.getTime())) return stamp;
  return format(d, 'EEEE, d MMM yyyy');
}

async function reloadApp(): Promise<void> {
  try {
    await Updates.reloadAsync();
    return;
  } catch {
    /* not an updates-enabled build (e.g. Expo Go) */
  }
  try {
    DevSettings.reload();
  } catch {
    /* last resort — user closes & reopens manually */
  }
}

export default function BackupRestore() {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  const [days, setDays] = useState<{ stamp: string; storeCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await listBackupDays();
    setDays(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const storeLabel = useCallback(
    (key: string) => (t.backups.stores as Record<string, string>)[key] ?? key,
    [t],
  );

  const handleRestore = useCallback(
    async (stamp: string) => {
      lightTap();
      const label = labelFor(stamp);
      // What would this restore actually do? Which stores are missing from the
      // day (and would keep CURRENT data), and whose backup is it?
      const plan = await planRestoreDay(stamp);

      // Wrong-account snapshots are BLOCKED, not warned — restoring another
      // account's data over this one is corruption.
      if (plan.identityMismatch) {
        await warningNotification();
        Alert.alert(t.backups.wrongAccountTitle, t.backups.wrongAccountBody, [
          { text: t.common.ok },
        ]);
        return;
      }

      const lines = [t.backups.confirmBody.replace('{date}', label)];
      if (plan.missing.length > 0) {
        lines.push(
          t.backups.partialWarn.replace('{stores}', plan.missing.map(storeLabel).join(', ')),
        );
      }
      if (!plan.meta) lines.push(t.backups.legacyNote); // pre-stamp backup — can't verify owner
      lines.push(t.backups.safeNote); // current data is copied first — restore is undoable

      const partialCore = plan.missingCore.length > 0;
      Alert.alert(t.backups.confirmTitle.replace('{date}', label), lines.join('\n\n'), [
        { text: t.backups.cancel, style: 'cancel' },
        {
          text: partialCore ? t.backups.restoreAnyway : t.backups.restore,
          style: partialCore ? 'destructive' : 'default',
          onPress: async () => {
            setRestoring(stamp);
            const res = await restoreDay(stamp);
            setRestoring(null);
            if (res.blocked) {
              // Identity changed between the check and the restore (e.g. sign-out mid-flow).
              await warningNotification();
              Alert.alert(t.backups.wrongAccountTitle, t.backups.wrongAccountBody, [
                { text: t.common.ok },
              ]);
            } else if (res.restored > 0) {
              await successNotification();
              Alert.alert(
                t.backups.restoredTitle,
                t.backups.restoredBody.replace('{count}', String(res.restored)),
                [{ text: t.backups.reloadNow, onPress: () => reloadApp() }],
              );
            } else {
              await warningNotification();
              Alert.alert(t.backups.failedTitle, t.backups.failedBody);
            }
          },
        },
      ]);
    },
    [t, storeLabel],
  );

  return (
    <View style={[styles.screen, { backgroundColor: C.background }]}>
      <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING['2xl'] }]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.inner}>
          {/* Intro */}
          <View style={styles.introCard}>
            <View style={styles.introIconWrap}>
              <Feather name="shield" size={20} color={C.accent} />
            </View>
            <Text style={styles.introText}>{t.backups.intro}</Text>
            <Text style={styles.introSub}>{t.backups.howOften}</Text>
            <View style={styles.safeRow}>
              <Feather name="rotate-ccw" size={14} color={C.textMuted} />
              <Text style={styles.safeText}>{t.backups.safeNote}</Text>
            </View>
          </View>

          {/* Days */}
          {loading ? null : days.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="clock" size={28} color={C.textMuted} />
              <Text style={styles.emptyTitle}>{t.backups.noBackupsTitle}</Text>
              <Text style={styles.emptyBody}>{t.backups.noBackupsBody}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionHeader}>{t.backups.availableTitle}</Text>
              {days.map((d) => (
                <View key={d.stamp} style={styles.dayCard}>
                  <View style={styles.dayInfo}>
                    <Text style={styles.dayLabel}>{labelFor(d.stamp)}</Text>
                    <Text style={styles.daySub}>
                      {t.backups.setsLabel.replace('{count}', String(d.storeCount))}
                    </Text>
                  </View>
                  <Button
                    title={t.backups.restore}
                    onPress={() => handleRestore(d.stamp)}
                    variant="outline"
                    icon="rotate-ccw"
                    loading={restoring === d.stamp}
                    disabled={restoring !== null && restoring !== d.stamp}
                  />
                </View>
              ))}
            </>
          )}
        </View>
        </ScrollView>
      </PullRefresh>
    </View>
  );
}

const makeStyles = (C: typeof CALM, isDark: boolean) =>
  StyleSheet.create({
    screen: { flex: 1 },
    scroll: { flex: 1 },
    content: { padding: SPACING.lg },
    inner: { width: '100%', maxWidth: 640, alignSelf: 'center' },

    introCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.lg,
      marginBottom: SPACING.xl,
      ...(isDark ? SHADOWS.none : SHADOWS.sm),
    },
    introIconWrap: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.md,
    },
    introText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
      lineHeight: TYPOGRAPHY.size.base * 1.5,
    },
    introSub: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      lineHeight: TYPOGRAPHY.size.sm * 1.5,
      marginTop: SPACING.sm,
    },
    safeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.xs,
      marginTop: SPACING.md,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    safeText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      lineHeight: TYPOGRAPHY.size.xs * 1.5,
    },

    sectionHeader: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
      marginBottom: SPACING.md,
      letterSpacing: 0.3,
    },

    dayCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
      ...(isDark ? SHADOWS.none : SHADOWS.xs),
    },
    dayInfo: { flex: 1 },
    dayLabel: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    daySub: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: 2,
    },

    emptyCard: {
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: SPACING['2xl'],
      paddingHorizontal: SPACING.lg,
      ...(isDark ? SHADOWS.none : SHADOWS.xs),
    },
    emptyTitle: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      marginTop: SPACING.md,
    },
    emptyBody: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: TYPOGRAPHY.size.sm * 1.5,
      marginTop: SPACING.xs,
    },
  });
