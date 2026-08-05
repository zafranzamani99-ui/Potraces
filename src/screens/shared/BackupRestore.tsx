/**
 * BackupRestore — surfaces the local rolling backups (src/services/storageBackup.ts)
 * so the user can recover their data after a bad write, without a developer.
 *
 * The app snapshots every money/data store once a day into gzipped files. This
 * screen lists the available days, shows a PREVIEW of what a restore changes
 * (per-store record counts, backup → now) before the user commits, blocks
 * interaction while a restore applies, then reloads the app to re-hydrate. A
 * restore snapshots the current state first — surfaced here as "Undo last
 * restore" when one of those copies exists.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  DevSettings,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as Updates from 'expo-updates';

import Button from '../../components/common/Button';
import BottomSheet from '../../components/common/BottomSheet';
import PullRefresh from '../../components/common/PullRefresh';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap, successNotification, warningNotification } from '../../services/haptics';
import {
  exportBackupToFile,
  latestPrerestoreDay,
  listBackupDays,
  planRestoreDay,
  planRestorePayload,
  readBackupFileFromUri,
  restoreDay,
  restorePayload,
  type BackupFilePayload,
  type DayRestorePlan,
} from '../../services/storageBackup';
import type { BackupKind } from '../../services/storageBackupCore';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

function labelFor(stamp: string): string {
  const d = new Date(`${stamp}T00:00:00`);
  if (isNaN(d.getTime())) return stamp;
  return format(d, 'EEEE, d MMM yyyy');
}

function dateTimeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return format(d, 'd MMM yyyy, h:mm a');
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

interface PreviewState {
  plan: DayRestorePlan;
  label: string;
  source:
    | { type: 'file'; stamp: string; kind: BackupKind }
    | { type: 'import'; payload: BackupFilePayload };
}

export default function BackupRestore() {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  const [days, setDays] = useState<{ stamp: string; storeCount: number }[]>([]);
  const [undo, setUndo] = useState<{ stamp: string; createdAt: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [planning, setPlanning] = useState<string | null>(null); // day-stamp or 'undo'
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const [d, u] = await Promise.all([listBackupDays(), latestPrerestoreDay()]);
    setDays(d);
    setUndo(u);
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

  /**
   * Compute what a restore would do, run the HARD guards (wrong account / made
   * by a newer app), then open the preview sheet. Anything blockable stops here
   * with an alert — the sheet only ever shows restorable plans.
   */
  const openPreview = useCallback(
    async (stamp: string, kind: BackupKind, planningKey: string) => {
      lightTap();
      setPlanning(planningKey);
      const plan = await planRestoreDay(stamp, kind);
      setPlanning(null);

      // Wrong-account snapshots are BLOCKED, not warned — restoring another
      // account's data over this one is corruption.
      if (plan.identityMismatch) {
        await warningNotification();
        Alert.alert(t.backups.wrongAccountTitle, t.backups.wrongAccountBody, [
          { text: t.common.ok },
        ]);
        return;
      }

      // A backup written by a NEWER app/backup format is BLOCKED too — its store
      // shapes may have migrated past what this build can re-hydrate.
      if (plan.tooNew) {
        await warningNotification();
        Alert.alert(
          t.backups.tooNewTitle,
          t.backups.tooNewBody.replace('{version}', plan.appVersion ?? '?'),
          [{ text: t.common.ok }],
        );
        return;
      }

      setPreview({
        plan,
        label: labelFor(stamp),
        source: { type: 'file', stamp, kind },
      });
    },
    [t],
  );

  /** Apply the previewed restore behind a blocking modal, then offer reload. */
  const confirmRestore = useCallback(async () => {
    if (!preview) return;
    const { source } = preview;
    setPreview(null);
    setRestoring(true);
    const res =
      source.type === 'file'
        ? await restoreDay(source.stamp, source.kind)
        : await restorePayload(source.payload);
    setRestoring(false);
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
    load(); // refresh undo card + day list (matters when the reload is declined)
  }, [preview, t, load]);

  /** Export the whole backup as ONE shareable file (same format as the days). */
  const handleExport = useCallback(async () => {
    lightTap();
    setExporting(true);
    const uri = await exportBackupToFile();
    setExporting(false);
    if (!uri || !(await Sharing.isAvailableAsync())) {
      await warningNotification();
      Alert.alert(t.backups.exportFailedTitle, t.backups.exportFailedBody);
      return;
    }
    try {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/gzip',
        dialogTitle: t.backups.exportButton,
      });
    } catch {
      /* user dismissed the share sheet — not an error */
    }
  }, [t]);

  /**
   * Import a previously-exported file. Same pipeline as an on-device restore:
   * read + validate → plan (hard guards) → preview sheet → blocking apply.
   */
  const handleImport = useCallback(async () => {
    lightTap();
    let uri: string | null = null;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      uri = res.assets?.[0]?.uri ?? null;
    } catch {
      uri = null;
    }
    if (!uri) return;

    setImporting(true);
    const payload = await readBackupFileFromUri(uri);
    setImporting(false);
    if (!payload) {
      await warningNotification();
      Alert.alert(t.backups.importInvalidTitle, t.backups.importInvalidBody);
      return;
    }

    const plan = await planRestorePayload(payload);
    if (plan.identityMismatch) {
      await warningNotification();
      Alert.alert(t.backups.wrongAccountTitle, t.backups.wrongAccountBody, [
        { text: t.common.ok },
      ]);
      return;
    }
    if (plan.tooNew) {
      await warningNotification();
      Alert.alert(
        t.backups.tooNewTitle,
        t.backups.tooNewBody.replace('{version}', plan.appVersion ?? '?'),
        [{ text: t.common.ok }],
      );
      return;
    }
    setPreview({
      plan,
      label: dateTimeLabel(payload.createdAt) ?? plan.stamp,
      source: { type: 'import', payload },
    });
  }, [t]);

  const renderPreviewBody = () => {
    if (!preview) return null;
    const { plan } = preview;
    const partialCore = plan.missingCore.length > 0;
    const saved = dateTimeLabel(plan.createdAt);
    return (
      <>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Per-store: records in backup → records now */}
          <Text style={styles.legend}>{t.backups.countsLegend}</Text>
          <View style={styles.storeTable}>
            {plan.included.map((key) => (
              <View key={key} style={styles.storeRow}>
                <Text style={styles.storeLabel}>{storeLabel(key)}</Text>
                <Text style={styles.storeCounts}>
                  {(plan.recordCounts[key] ?? 0).toLocaleString()}
                  <Text style={styles.storeArrow}> → </Text>
                  {(plan.liveRecordCounts[key] ?? 0).toLocaleString()}
                </Text>
              </View>
            ))}
            {plan.missing.map((key) => (
              <View key={key} style={styles.storeRow}>
                <Text style={styles.storeLabelMuted}>{storeLabel(key)}</Text>
                <Text
                  style={[
                    styles.storeKeeps,
                    plan.missingCore.includes(key) && styles.storeKeepsWarn,
                  ]}
                >
                  {t.backups.keepsCurrent}
                </Text>
              </View>
            ))}
          </View>

          {/* Notes */}
          {plan.missing.length > 0 && (
            <Text style={styles.noteWarn}>
              {t.backups.partialWarn.replace('{stores}', plan.missing.map(storeLabel).join(', '))}
            </Text>
          )}
          {plan.localToAccount && <Text style={styles.note}>{t.backups.localNote}</Text>}
          {plan.legacyOwner && <Text style={styles.note}>{t.backups.legacyNote}</Text>}
          <View style={styles.safeRow}>
            <Feather name="rotate-ccw" size={14} color={C.textMuted} />
            <Text style={styles.safeText}>{t.backups.safeNote}</Text>
          </View>
        </ScrollView>

        <View style={styles.sheetActions}>
          <Button
            title={partialCore ? t.backups.restoreAnyway : t.backups.restore}
            onPress={confirmRestore}
            variant={partialCore ? 'danger' : 'primary'}
            icon="rotate-ccw"
          />
        </View>
      </>
    );
  };

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

          {/* Export / import — the off-device copy */}
          <View style={styles.exportCard}>
            <Text style={styles.exportTitle}>{t.backups.exportImportTitle}</Text>
            <Text style={styles.exportDesc}>{t.backups.exportDesc}</Text>
            <View style={styles.exportRow}>
              <View style={styles.exportBtn}>
                <Button
                  title={t.backups.exportButton}
                  onPress={handleExport}
                  variant="outline"
                  icon="share"
                  loading={exporting}
                  disabled={importing}
                />
              </View>
              <View style={styles.exportBtn}>
                <Button
                  title={t.backups.importButton}
                  onPress={handleImport}
                  variant="outline"
                  icon="download"
                  loading={importing}
                  disabled={exporting}
                />
              </View>
            </View>
          </View>

          {/* Undo last restore */}
          {!loading && undo && (
            <View style={styles.undoCard}>
              <View style={styles.dayInfo}>
                <Text style={styles.undoTitle}>{t.backups.undoTitle}</Text>
                <Text style={styles.undoBody}>
                  {t.backups.undoBody.replace('{date}', labelFor(undo.stamp))}
                </Text>
              </View>
              <Button
                title={t.backups.undo}
                onPress={() => openPreview(undo.stamp, 'prerestore', 'undo')}
                variant="outline"
                icon="rotate-ccw"
                loading={planning === 'undo'}
                disabled={planning !== null}
              />
            </View>
          )}

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
                    onPress={() => openPreview(d.stamp, 'daily', d.stamp)}
                    variant="outline"
                    icon="rotate-ccw"
                    loading={planning === d.stamp}
                    disabled={planning !== null}
                  />
                </View>
              ))}
            </>
          )}
        </View>
        </ScrollView>
      </PullRefresh>

      {/* Restore preview */}
      <BottomSheet
        visible={preview !== null}
        onClose={() => setPreview(null)}
        maxHeightPct={0.85}
        header={
          preview ? (
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {t.backups.confirmTitle.replace('{date}', preview.label)}
              </Text>
              <Text style={styles.sheetSub}>
                {[
                  dateTimeLabel(preview.plan.createdAt)
                    ? t.backups.savedAt.replace('{datetime}', dateTimeLabel(preview.plan.createdAt)!)
                    : null,
                  preview.plan.appVersion
                    ? t.backups.fromAppVersion.replace('{version}', preview.plan.appVersion)
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          ) : undefined
        }
      >
        {renderPreviewBody()}
      </BottomSheet>

      {/* Blocking modal while a restore applies — no interaction, no accidental
          backgrounding mid-write. The restore itself is one multiSet batch. */}
      <Modal visible={restoring} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.blockingBackdrop}>
          <View style={styles.blockingCard}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.blockingText}>{t.backups.restoring}</Text>
          </View>
        </View>
      </Modal>
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

    exportCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.lg,
      marginBottom: SPACING.xl,
      ...(isDark ? SHADOWS.none : SHADOWS.xs),
    },
    exportTitle: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    exportDesc: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      lineHeight: TYPOGRAPHY.size.xs * 1.5,
      marginTop: SPACING.xs,
    },
    exportRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.md,
    },
    exportBtn: { flex: 1 },

    undoCard: {      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      backgroundColor: withAlpha(C.accent, 0.08),
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.accent, 0.25),
      padding: SPACING.lg,
      marginBottom: SPACING.xl,
    },
    undoTitle: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    undoBody: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      lineHeight: TYPOGRAPHY.size.xs * 1.5,
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

    // Preview sheet
    sheetHeader: { gap: 2 },
    sheetTitle: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
    },
    sheetSub: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
    },
    sheetScroll: { flexShrink: 1 },
    sheetContent: { paddingBottom: SPACING.lg },
    legend: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textAlign: 'right',
      marginBottom: SPACING.xs,
      letterSpacing: 0.3,
    },
    storeTable: {
      backgroundColor: withAlpha(C.textPrimary, 0.04),
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    storeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    storeLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    storeLabelMuted: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
    },
    storeCounts: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    storeArrow: { color: C.textMuted },
    storeKeeps: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontStyle: 'italic',
    },
    storeKeepsWarn: { color: C.gold },
    note: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      lineHeight: TYPOGRAPHY.size.xs * 1.5,
      marginTop: SPACING.md,
    },
    noteWarn: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.gold,
      lineHeight: TYPOGRAPHY.size.xs * 1.5,
      marginTop: SPACING.md,
    },
    sheetActions: { paddingTop: SPACING.sm },

    // Blocking restore modal
    blockingBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    blockingCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING['2xl'],
      alignItems: 'center',
      gap: SPACING.md,
    },
    blockingText: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
  });
