import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Share,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import type { Text as MLKitText } from '@infinitered/react-native-mlkit-text-recognition';

// Lazy-load the native OCR module so this DEV harness never crashes a dev build
// that wasn't compiled with ML Kit. The lib calls requireNativeModule() at import
// time (throws if the native module is absent), so we defer + guard that eval.
const getRecognizeText = (): ((imagePath: string) => Promise<MLKitText>) | null => {
  try {
    return require('@infinitered/react-native-mlkit-text-recognition').recognizeText;
  } catch {
    return null;
  }
};

/**
 * Phase 0 OCR debug harness — DEV ONLY, throwaway.
 *
 * Lets us eyeball what on-device OCR (Apple Vision / ML Kit) actually reads off
 * a REAL receipt before we commit to the hybrid pipeline. No Gemini, no parsing
 * — just: pick/shoot a receipt → run recognizeText → show the raw text + boxes +
 * timing, with a Share button to send the dump out.
 *
 * Mount once with {__DEV__ && <OcrDebugHarness />}. Remove after Phase 0.
 * NOTE: ML Kit does not run on the iOS Simulator — test on a physical device.
 */

interface OcrRun {
  ms: number;
  result: MLKitText;
  uri: string;
}

export default function OcrDebugHarness() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<OcrRun | null>(null);

  const runOcr = useCallback(async (uri: string) => {
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const recognizeText = getRecognizeText();
      if (!recognizeText) {
        throw new Error('OCR native module not in this build — rebuild the dev client (eas build / expo run) to test OCR.');
      }
      const t0 = Date.now();
      const result = await recognizeText(uri);
      const ms = Date.now() - t0;
      setRun({ ms, result, uri });
      console.log(`[OCR] ${ms}ms · ${result.blocks.length} blocks\n${result.text}`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      console.warn('[OCR] failed:', e);
    } finally {
      setBusy(false);
    }
  }, []);

  const pick = useCallback(async (source: 'camera' | 'gallery') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      setError(`${source} permission denied`);
      return;
    }
    const launch = source === 'camera'
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;
    // quality 1 = full resolution — we WANT maximum detail for the OCR test.
    const res = await launch({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    await runOcr(res.assets[0].uri);
  }, [runOcr]);

  const lineCount = run ? run.result.blocks.reduce((n, b) => n + b.lines.length, 0) : 0;

  const dump = run
    ? [
        `OCR ${run.ms}ms · ${run.result.blocks.length} blocks · ${lineCount} lines`,
        `uri: ${run.uri}`,
        '',
        '=== FULL TEXT ===',
        run.result.text,
        '',
        '=== BLOCKS (text @ frame l,t,r,b) ===',
        ...run.result.blocks.map(
          (b, i) =>
            `[${i}] (${Math.round(b.frame.left)},${Math.round(b.frame.top)},${Math.round(b.frame.right)},${Math.round(b.frame.bottom)})\n${b.text}`,
        ),
      ].join('\n')
    : '';

  const share = useCallback(() => {
    if (dump) Share.share({ message: dump });
  }, [dump]);

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={styles.fabText}>OCR</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.screen}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>OCR Debug · Phase 0</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btn} onPress={() => pick('camera')} disabled={busy}>
              <Text style={styles.btnText}>📷 Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={() => pick('gallery')} disabled={busy}>
              <Text style={styles.btnText}>🖼️ Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, !run && styles.btnDisabled]} onPress={share} disabled={!run}>
              <Text style={styles.btnText}>Share</Text>
            </TouchableOpacity>
          </View>

          {busy && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#9f9" />
              <Text style={styles.muted}>reading…</Text>
            </View>
          )}

          {error && <Text style={styles.error}>⚠️ {error}</Text>}

          {run && (
            <Text style={styles.stat}>
              {run.ms}ms · {run.result.blocks.length} blocks · {lineCount} lines
            </Text>
          )}

          <ScrollView style={styles.scroll} nestedScrollEnabled>
            {run ? (
              <Text selectable style={styles.mono}>{dump}</Text>
            ) : (
              !busy && <Text style={styles.muted}>Shoot or pick a receipt to see what OCR reads.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    backgroundColor: '#4F5104',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    zIndex: 9999,
    elevation: 8,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  screen: { flex: 1, backgroundColor: '#111', paddingTop: 56, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  close: { color: '#9AD3FF', fontSize: 16 },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  btn: { flex: 1, backgroundColor: '#2a2a2a', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  center: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  muted: { color: '#888' },
  error: { color: '#ff8a80', marginBottom: 12 },
  stat: { color: '#9f9', fontWeight: '700', marginBottom: 8 },
  scroll: { flex: 1 },
  mono: { color: '#ddd', fontFamily: 'monospace', fontSize: 12, lineHeight: 18, paddingBottom: 40 },
});
