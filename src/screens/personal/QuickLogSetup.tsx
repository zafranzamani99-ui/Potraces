import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useT } from '../../i18n';
import { useCalm } from '../../hooks/useCalm';
import { useToast } from '../../context/ToastContext';
import { useSettingsStore } from '../../store/settingsStore';
import { SPACING, RADIUS } from '../../constants';
import {
  registerQuickLogKey, getQuickLogKeyStatus, revokeQuickLogKey,
} from '../../services/quickLogKey';

// Signed shortcut built by scripts/build-quick-log-shortcut.py and hosted on
// the public `web` bucket — re-run that pipeline to update it in place.
const SHORTCUT_URL =
  'https://iydqeeonaljqapulboaz.supabase.co/storage/v1/object/public/web/PotracesQuickLog.shortcut?download=Potraces%20Quick%20Log.shortcut';
const SHORTCUT_READY = !SHORTCUT_URL.includes('REPLACE_ME');

export default function QuickLogSetup() {
  const t = useT();
  const C = useCalm();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  // Quick Log is a cloud feature (it logs to the account via the server), so it
  // requires Cloud Backup — which AccountScreen turns on by setting this flag.
  const cloudOn = useSettingsStore((s) => s.personalSyncEnabled);
  const [hasKey, setHasKey] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cloudOn) getQuickLogKeyStatus().then((s) => setHasKey(s.hasActiveKey));
  }, [cloudOn]);

  const onGenerate = async () => {
    setBusy(true);
    try {
      const key = await registerQuickLogKey();
      setShownKey(key);
      setHasKey(true);
    } catch {
      showToast(t.settings.quickLog.signInFirst, 'error');
    } finally { setBusy(false); }
  };

  const onCopy = async () => {
    if (!shownKey) return;
    await Clipboard.setStringAsync(shownKey);
    showToast(t.settings.quickLog.copied, 'success');
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

  const stepLabel = (text: string) => (
    <Text style={[styles.step, { color: C.textPrimary }]}>{text}</Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.intro, { color: C.textSecondary }]}>
          {t.settings.quickLog.intro}
        </Text>

        {!cloudOn ? (
          // ── Gate: Quick Log needs Cloud Backup ──────────────────────────────
          <View style={[styles.gateCard, { borderColor: C.border, backgroundColor: C.surface }]}>
            <Text style={[styles.gateTitle, { color: C.textPrimary }]}>
              {t.settings.quickLog.cloudTitle}
            </Text>
            <Text style={[styles.gateBody, { color: C.textSecondary }]}>
              {t.settings.quickLog.cloudBody}
            </Text>
            <Pressable style={[styles.btn, { backgroundColor: C.accent }]}
              onPress={() => navigation.navigate('Account')}>
              <Text style={styles.btnText}>{t.settings.quickLog.setupCloud}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.status, { color: C.textPrimary }]}>
              {hasKey ? t.settings.quickLog.active : t.settings.quickLog.inactive}
            </Text>
            <Text style={[styles.stepsTitle, { color: C.textPrimary }]}>
              {t.settings.quickLog.stepsTitle}
            </Text>

            {/* Step 1 — copy your key */}
            {stepLabel(t.settings.quickLog.step1)}
            <Pressable disabled={busy} style={[styles.btn, { backgroundColor: C.accent }]} onPress={onGenerate}>
              <Text style={styles.btnText}>
                {hasKey ? t.settings.quickLog.regenerate : t.settings.quickLog.generate}
              </Text>
            </Pressable>
            {shownKey && (
              <View style={[styles.keyBox, { borderColor: C.border, backgroundColor: C.surface }]}>
                <Text selectable style={[styles.key, { color: C.textPrimary }]}>{shownKey}</Text>
                <Text style={[styles.warn, { color: C.textSecondary }]}>
                  {t.settings.quickLog.keyOnceWarning}
                </Text>
                <Pressable style={[styles.btn, { backgroundColor: C.accent }]} onPress={onCopy}>
                  <Text style={styles.btnText}>{t.settings.quickLog.copyKey}</Text>
                </Pressable>
              </View>
            )}

            {/* Step 2 — get the Shortcut */}
            {stepLabel(t.settings.quickLog.step2)}
            <Pressable style={[styles.btn, styles.secondary, { borderColor: C.border }]}
              onPress={() => {
                if (!SHORTCUT_READY) { showToast(t.settings.quickLog.shortcutSoon, 'info'); return; }
                Linking.openURL(SHORTCUT_URL).catch(() => {});
              }}>
              <Text style={[styles.btnText, { color: C.textPrimary }]}>{t.settings.quickLog.getShortcut}</Text>
            </Pressable>
            {!SHORTCUT_READY && (
              <Text style={[styles.caption, { color: C.textSecondary }]}>{t.settings.quickLog.shortcutSoon}</Text>
            )}

            {/* Steps 3 & 4 — happen outside the app */}
            {stepLabel(t.settings.quickLog.step3)}
            {stepLabel(t.settings.quickLog.step4)}

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
  container: { padding: SPACING.lg, gap: SPACING.md },
  intro: { fontSize: 15, lineHeight: 22 },
  status: { fontSize: 15, fontWeight: '600' },
  stepsTitle: { fontSize: 16, fontWeight: '700', marginTop: SPACING.sm },
  step: { fontSize: 15, lineHeight: 22, marginTop: SPACING.xs },
  gateCard: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  gateTitle: { fontSize: 16, fontWeight: '700' },
  gateBody: { fontSize: 14, lineHeight: 20 },
  keyBox: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  key: { fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  warn: { fontSize: 13, lineHeight: 18 },
  btn: { borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: { backgroundColor: 'transparent', borderWidth: 1 },
  caption: { fontSize: 13, fontStyle: 'italic', marginTop: -SPACING.xs },
  revoke: { alignItems: 'center', paddingVertical: 12 },
});
