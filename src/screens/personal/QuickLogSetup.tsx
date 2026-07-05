import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../../i18n';
import { useCalm } from '../../hooks/useCalm';
import { useToast } from '../../context/ToastContext';
import { SPACING, RADIUS } from '../../constants';
import {
  registerQuickLogKey, getQuickLogKeyStatus, revokeQuickLogKey,
} from '../../services/quickLogKey';

// TODO(Task 8): replace with the published iCloud Shortcut link.
const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/REPLACE_ME';

export default function QuickLogSetup() {
  const t = useT();
  const C = useCalm();
  const { showToast } = useToast();
  const [hasKey, setHasKey] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getQuickLogKeyStatus().then((s) => setHasKey(s.hasActiveKey)); }, []);

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
    await revokeQuickLogKey();
    setHasKey(false);
    setShownKey(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.intro, { color: C.textSecondary }]}>
          {t.settings.quickLog.intro}
        </Text>
        <Text style={[styles.status, { color: C.textPrimary }]}>
          {hasKey ? t.settings.quickLog.active : t.settings.quickLog.inactive}
        </Text>

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

        <Pressable disabled={busy} style={[styles.btn, { backgroundColor: C.accent }]} onPress={onGenerate}>
          <Text style={styles.btnText}>
            {hasKey ? t.settings.quickLog.regenerate : t.settings.quickLog.generate}
          </Text>
        </Pressable>

        <Pressable style={[styles.btn, styles.secondary, { borderColor: C.border }]}
          onPress={() => Linking.openURL(SHORTCUT_URL).catch(() => {})}>
          <Text style={[styles.btnText, { color: C.textPrimary }]}>{t.settings.quickLog.getShortcut}</Text>
        </Pressable>

        {hasKey && (
          <Pressable style={styles.revoke} onPress={onRevoke}>
            <Text style={{ color: C.overdue }}>{t.settings.quickLog.revoke}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.lg, gap: SPACING.md },
  intro: { fontSize: 15, lineHeight: 22 },
  status: { fontSize: 15, fontWeight: '600' },
  keyBox: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  key: { fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  warn: { fontSize: 13, lineHeight: 18 },
  btn: { borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: { backgroundColor: 'transparent', borderWidth: 1 },
  revoke: { alignItems: 'center', paddingVertical: 12 },
});
