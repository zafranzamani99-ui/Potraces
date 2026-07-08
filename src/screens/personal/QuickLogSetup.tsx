import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, AppState } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useT } from '../../i18n';
import { useCalm } from '../../hooks/useCalm';
import { useToast } from '../../context/ToastContext';
import { useSettingsStore } from '../../store/settingsStore';
import { SPACING, RADIUS, withAlpha } from '../../constants';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import { successNotification } from '../../services/haptics';
import {
  registerQuickLogKey, getQuickLogKeyStatus, revokeQuickLogKey,
} from '../../services/quickLogKey';
import { registerPersonalDeviceToken, getPersonalPushStatus } from '../../services/pushNotifications';
import { getQuickLogRealtimeStatus } from '../../services/quickLogInbox';

// Signed shortcut built by scripts/build-quick-log-shortcut.py and hosted on
// the public `web` bucket — re-run that pipeline to update it in place.
const SHORTCUT_URL =
  'https://iydqeeonaljqapulboaz.supabase.co/storage/v1/object/public/web/PotracesQuickLog.shortcut?download=Potraces%20Quick%20Log.shortcut';
const SHORTCUT_READY = !SHORTCUT_URL.includes('REPLACE_ME');

export default function QuickLogSetup() {
  const t = useT();
  const C = useCalm();
  const neu = useNeu();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  // Quick Log is a cloud feature (it logs to the account via the server), so it
  // requires Cloud Backup — which AccountScreen turns on by setting this flag.
  const cloudOn = useSettingsStore((s) => s.personalSyncEnabled);
  // In-app toggle (Settings → Preferences → Notifications): when OFF, the
  // foreground handler suppresses ALL banners while the app is open.
  const inAppNotifs = useSettingsStore((s) => s.notificationsEnabled);
  const [hasKey, setHasKey] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // OS notification permission (distinct from the in-app Notifications toggle
  // in Settings → Preferences — no duplication: this reflects iOS itself).
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [notifCanAsk, setNotifCanAsk] = useState(true);

  // Diagnostics — observable truth beats guessing (push registration state of
  // THIS device + live realtime channel status).
  const [pushState, setPushState] = useState<string>('…');
  const [liveState, setLiveState] = useState<string>(getQuickLogRealtimeStatus());

  const refreshNotifStatus = useCallback(async () => {
    const p = await Notifications.getPermissionsAsync();
    setNotifGranted(p.status === 'granted');
    setNotifCanAsk(p.canAskAgain !== false);
    if (p.status === 'granted') {
      await registerPersonalDeviceToken().catch(() => {});
    }
    const s = await getPersonalPushStatus().catch(() => ({ state: 'no-token' as const }));
    setPushState(s.state);
  }, []);

  useEffect(() => {
    if (cloudOn) {
      getQuickLogKeyStatus().then((s) => setHasKey(s.hasActiveKey));
      refreshNotifStatus();
    }
    // Re-check when returning from iPhone Settings (app becomes active again).
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && cloudOn) refreshNotifStatus();
    });
    // Realtime channel status, polled while the screen is open.
    const liveTimer = setInterval(() => setLiveState(getQuickLogRealtimeStatus()), 2000);
    return () => {
      sub.remove();
      clearInterval(liveTimer);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [cloudOn, refreshNotifStatus]);

  const onTestNotification = async () => {
    // Local notification with the quick_log payload: proves banner rendering
    // AND the tap→TransactionsList path without needing the server.
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Potraces',
          body: t.settings.quickLog.diagTestBody,
          data: { type: 'quick_log' },
          sound: 'default',
        },
        // SDK 54 trigger shape — the legacy bare {seconds} form gets rejected.
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1.5,
        },
      });
    } catch (e) {
      // Never swallow the diagnostic's own failure.
      showToast(String(e), 'error');
    }
  };

  const pushStateLabel = (s: string) => {
    switch (s) {
      case 'registered': return t.settings.quickLog.diagRegistered;
      case 'not-registered': return t.settings.quickLog.diagNotRegistered;
      case 'no-permission': return t.settings.quickLog.diagNoPermission;
      case 'no-session': return t.settings.quickLog.diagNoSession;
      case 'no-token': return t.settings.quickLog.diagNoToken;
      default: return s;
    }
  };

  const onEnableNotifications = async () => {
    if (notifCanAsk) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setNotifGranted(true);
        registerPersonalDeviceToken().catch(() => {});
      } else {
        setNotifCanAsk(false); // iOS won't re-prompt — route via Settings
      }
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  const onGenerate = async () => {
    setBusy(true);
    try {
      const key = await registerQuickLogKey();
      setShownKey(key);
      setHasKey(true);
      setCopied(false);
    } catch {
      showToast(t.settings.quickLog.signInFirst, 'error');
    } finally { setBusy(false); }
  };

  const onCopy = async () => {
    if (!shownKey) return;
    await Clipboard.setStringAsync(shownKey);
    successNotification(); // felt feedback — the button also morphs to “Copied ✓”
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2500);
  };

  const onRevoke = async () => {
    try {
      await revokeQuickLogKey();
      setHasKey(false);
      setShownKey(null);
    } catch {
      showToast(t.settings.quickLog.revokeFailed, 'error');
    }
  };

  /**
   * Numbered step card — neu.raisedSoft surface + debossed number well.
   * Deliberately a RENDER FUNCTION (called, not used as <JSX/>): an inline
   * component type would change identity every render and remount the subtree,
   * popping the Copy button's press/morph state and dropping key-text selection.
   */
  const renderStep = (n: string, title: string, body: string, children?: React.ReactNode) => (
    <View style={[styles.stepCard, neu.raisedSoft, { backgroundColor: C.surface }]}>
      <View style={styles.stepHead}>
        <View style={[styles.stepNum, neu.well, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
          <Text style={[styles.stepNumText, { color: C.accent }]}>{n}</Text>
        </View>
        <Text style={[styles.stepTitle, { color: C.textPrimary }]}>{title}</Text>
      </View>
      <Text style={[styles.stepBody, { color: C.textSecondary }]}>{body}</Text>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.intro, { color: C.textSecondary }]}>
          {t.settings.quickLog.intro}
        </Text>

        {!cloudOn ? (
          // ── Gate: Quick Log needs Cloud Backup ──────────────────────────────
          <View style={[styles.stepCard, neu.raisedSoft, { backgroundColor: C.surface }]}>
            <Text style={[styles.stepTitle, { color: C.textPrimary }]}>
              {t.settings.quickLog.cloudTitle}
            </Text>
            <Text style={[styles.stepBody, { color: C.textSecondary }]}>
              {t.settings.quickLog.cloudBody}
            </Text>
            <NeuButton
              label={t.settings.quickLog.setupCloud}
              icon="cloud"
              onPress={() => navigation.navigate('Account')}
            />
          </View>
        ) : (
          <>
            {/* Status pill */}
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: hasKey ? C.accent : C.border }]} />
              <Text style={[styles.status, { color: C.textPrimary }]}>
                {hasKey ? t.settings.quickLog.active : t.settings.quickLog.inactive}
              </Text>
            </View>

            {/* Notification permission — needed for the tappable confirmation */}
            {notifGranted === false && (
              <View style={[styles.stepCard, neu.raisedSoft, { backgroundColor: C.surface }]}>
                <Text style={[styles.stepTitle, { color: C.textPrimary }]}>
                  {t.settings.quickLog.notifTitle}
                </Text>
                <Text style={[styles.stepBody, { color: C.textSecondary }]}>
                  {t.settings.quickLog.notifBody}
                </Text>
                <NeuButton
                  label={notifCanAsk ? t.settings.quickLog.notifEnable : t.settings.quickLog.notifOpenSettings}
                  icon="bell"
                  onPress={onEnableNotifications}
                />
              </View>
            )}
            {notifGranted === true && (
              <Text style={[styles.caption, { color: C.textSecondary }]}>
                {t.settings.quickLog.notifOn}
              </Text>
            )}

            {/* Step 1 — key */}
            {renderStep('1', t.settings.quickLog.s1Title, t.settings.quickLog.s1Body, (
              <>
                <NeuButton
                  label={hasKey ? t.settings.quickLog.regenerate : t.settings.quickLog.generate}
                  icon="key"
                  disabled={busy}
                  onPress={onGenerate}
                />
                {shownKey && (
                  <View style={[styles.keyBox, neu.insetSoft, { backgroundColor: C.background }]}>
                    <Text selectable style={[styles.key, { color: C.textPrimary }]}>{shownKey}</Text>
                    <Text style={[styles.caption, { color: C.textSecondary }]}>
                      {t.settings.quickLog.keyOnceWarning}
                    </Text>
                    <NeuButton
                      label={copied ? t.settings.quickLog.copiedBtn : t.settings.quickLog.copyKey}
                      icon={copied ? 'check' : 'copy'}
                      color={copied ? C.positive : undefined}
                      onPress={onCopy}
                    />
                  </View>
                )}
              </>
            ))}

            {/* Step 2 — add the Shortcut */}
            {renderStep('2', t.settings.quickLog.s2Title, t.settings.quickLog.s2Body, (
              <>
                <NeuButton
                  label={t.settings.quickLog.getShortcut}
                  icon="download"
                  onPress={() => {
                    if (!SHORTCUT_READY) { showToast(t.settings.quickLog.shortcutSoon, 'info'); return; }
                    Linking.openURL(SHORTCUT_URL).catch(() => {});
                  }}
                />
                {!SHORTCUT_READY && (
                  <Text style={[styles.caption, { color: C.textSecondary }]}>{t.settings.quickLog.shortcutSoon}</Text>
                )}
              </>
            ))}

            {/* Step 3 — Back Tap */}
            {renderStep('3', t.settings.quickLog.s3Title, t.settings.quickLog.s3Body)}

            <Text style={[styles.afterSetup, { color: C.textPrimary }]}>
              {t.settings.quickLog.afterSetup}
            </Text>
            <Text style={[styles.caption, { color: C.textSecondary }]}>
              {t.settings.quickLog.regenNote}
            </Text>

            {/* Diagnostics — on-device truth for push + live-update delivery */}
            <View style={[styles.stepCard, neu.raisedSoft, { backgroundColor: C.surface }]}>
              <Text style={[styles.stepTitle, { color: C.textPrimary }]}>
                {t.settings.quickLog.diagTitle}
              </Text>
              <View style={styles.diagRow}>
                <Text style={[styles.stepBody, { color: C.textSecondary }]}>{t.settings.quickLog.diagPush}</Text>
                <Text style={[styles.diagValue, { color: pushState === 'registered' ? C.positive : C.overdue }]}>
                  {pushStateLabel(pushState)}
                </Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={[styles.stepBody, { color: C.textSecondary }]}>{t.settings.quickLog.diagLive}</Text>
                <Text style={[styles.diagValue, { color: liveState === 'SUBSCRIBED' ? C.positive : C.overdue }]}>
                  {liveState === 'SUBSCRIBED' ? t.settings.quickLog.diagLiveOk : liveState}
                </Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={[styles.stepBody, { color: C.textSecondary }]}>{t.settings.quickLog.diagInApp}</Text>
                <Text style={[styles.diagValue, { color: inAppNotifs ? C.positive : C.overdue }]}>
                  {inAppNotifs ? t.settings.quickLog.diagInAppOn : t.settings.quickLog.diagInAppOff}
                </Text>
              </View>
              <NeuButton
                label={t.settings.quickLog.diagTest}
                icon="bell"
                onPress={onTestNotification}
              />
            </View>

            {hasKey && (
              <Pressable style={styles.revoke} onPress={onRevoke}>
                <Text style={{ color: C.overdue }}>{t.settings.quickLog.revoke}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  intro: { fontSize: 15, lineHeight: 22 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontSize: 15, fontWeight: '600' },
  stepCard: { borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '700' },
  stepTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  stepBody: { fontSize: 14, lineHeight: 21 },
  keyBox: { borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm, marginTop: SPACING.xs },
  key: { fontSize: 17, fontWeight: '700', letterSpacing: 1 },
  caption: { fontSize: 13, fontStyle: 'italic' },
  diagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  diagValue: { fontSize: 14, fontWeight: '600' },
  afterSetup: { fontSize: 15, lineHeight: 22, fontWeight: '600', marginTop: SPACING.sm },
  revoke: { alignItems: 'center', paddingVertical: 12 },
});
