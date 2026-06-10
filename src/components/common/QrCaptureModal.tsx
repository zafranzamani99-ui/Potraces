import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  TouchableOpacity,
  Platform,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap, successNotification, errorNotification } from '../../services/haptics';
import { validateDuitNowStatic, type DuitNowValidation } from '../../services/emvQr';

export interface QrCaptureResult {
  /** Generated preview PNG (data URI) so existing <Image> displays keep working. */
  uri: string;
  /** Raw EMVCo payload to store for exact-amount re-rendering. */
  payload: string;
  network: 'duitnow';
  merchantName?: string;
  label: string;
}

interface QrCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onCaptured: (result: QrCaptureResult) => void;
}

type Step = 'scan' | 'paste' | 'confirm';

function reasonMessage(t: ReturnType<typeof useT>, v: DuitNowValidation): string {
  switch (v.reason) {
    case 'currency':
      return t.qrPay.invalidCurrency;
    case 'country':
      return t.qrPay.invalidCountry;
    case 'crc':
    case 'crc_position':
    case 'too_short':
      return t.qrPay.invalidUnreadable;
    case 'format':
      return t.qrPay.invalidFormat;
    default:
      return t.qrPay.invalidQr;
  }
}

/**
 * One-time capture of a seller's printed DuitNow standee — scan with the camera
 * or paste the QR text — validated as a static DuitNow QR, with a merchant-name
 * confirmation step so a wrong-QR capture is caught before saving.
 */
const QrCaptureModal: React.FC<QrCaptureModalProps> = ({ visible, onClose, onCaptured }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const t = useT();
  const { width } = useWindowDimensions();

  const canScan = Platform.OS !== 'web';
  const [step, setStep] = useState<Step>(canScan ? 'scan' : 'paste');
  const [permission, requestPermission] = useCameraPermissions();
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState('');
  const [merchantName, setMerchantName] = useState<string | undefined>(undefined);
  const [label, setLabel] = useState('');
  const scannedRef = useRef(false);
  const qrRef = useRef<{ toDataURL?: (cb: (data: string) => void) => void } | null>(null);

  const camSize = Math.min(Math.round(width * 0.72), 300);
  const previewSize = Math.min(Math.round(width * 0.5), 200);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (visible) {
      setStep(canScan ? 'scan' : 'paste');
      setPasteText('');
      setError(null);
      setPayload('');
      setMerchantName(undefined);
      setLabel('');
      scannedRef.current = false;
    }
  }, [visible, canScan]);

  // Ask for camera permission the first time we enter the scan step.
  useEffect(() => {
    if (visible && step === 'scan' && canScan && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, step, canScan, permission, requestPermission]);

  const accept = useCallback(
    (raw: string) => {
      const v = validateDuitNowStatic(raw.trim());
      if (!v.valid) {
        errorNotification();
        setError(reasonMessage(t, v));
        return false;
      }
      successNotification();
      setError(null);
      setPayload(raw.trim());
      setMerchantName(v.merchantName);
      setLabel(v.merchantName || 'DuitNow QR');
      setStep('confirm');
      return true;
    },
    [t],
  );

  const onBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      const ok = accept(data);
      if (!ok) {
        // allow another scan after a short beat
        setTimeout(() => {
          scannedRef.current = false;
        }, 1200);
      }
    },
    [accept],
  );

  const handlePasteRead = useCallback(() => {
    Keyboard.dismiss();
    if (!pasteText.trim()) return;
    accept(pasteText);
  }, [pasteText, accept]);

  const handleSave = useCallback(() => {
    lightTap();
    const finishWith = (uri: string) => {
      onCaptured({
        uri,
        payload,
        network: 'duitnow',
        merchantName,
        label: label.trim() || merchantName || 'DuitNow QR',
      });
    };
    // Generate a preview PNG so existing <Image source={{uri}}> displays render.
    // Fall back to an empty uri (QrPaySheet still renders live from payload).
    let settled = false;
    const done = (uri: string) => {
      if (settled) return;
      settled = true;
      finishWith(uri);
    };
    try {
      if (qrRef.current?.toDataURL) {
        qrRef.current.toDataURL((b64: string) => done(`data:image/png;base64,${b64}`));
        setTimeout(() => done(''), 1000); // safety net if the callback never fires
      } else {
        done('');
      }
    } catch {
      done('');
    }
  }, [onCaptured, payload, merchantName, label]);

  const rescan = useCallback(() => {
    lightTap();
    setError(null);
    setPayload('');
    setMerchantName(undefined);
    scannedRef.current = false;
    setStep(canScan ? 'scan' : 'paste');
  }, [canScan]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 'confirm' ? t.qrPay.confirmTitle : step === 'paste' ? t.qrPay.pasteTitle : t.qrPay.scanTitle}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* ── SCAN ─────────────────────────────────────────────── */}
          {step === 'scan' && (
            <View style={styles.body}>
              {permission?.granted ? (
                <View style={[styles.camWrap, { width: camSize, height: camSize }]}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={onBarcode}
                  />
                  <View style={styles.reticle} pointerEvents="none" />
                </View>
              ) : (
                <View style={[styles.camWrap, styles.camPlaceholder, { width: camSize, height: camSize }]}>
                  <Feather name="camera-off" size={28} color={C.textMuted} />
                  <Text style={styles.permText}>{t.qrPay.cameraNeededBody}</Text>
                  <Pressable style={styles.smallPrimary} onPress={() => requestPermission()}>
                    <Text style={styles.smallPrimaryText}>{t.qrPay.allowCamera}</Text>
                  </Pressable>
                </View>
              )}
              <Text style={styles.instruction}>{t.qrPay.scanInstruction}</Text>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable onPress={() => { lightTap(); setError(null); setStep('paste'); }}>
                <Text style={styles.linkText}>{t.qrPay.pasteInstead}</Text>
              </Pressable>
            </View>
          )}

          {/* ── PASTE ────────────────────────────────────────────── */}
          {step === 'paste' && (
            <View style={styles.body}>
              <TextInput
                style={styles.pasteInput}
                value={pasteText}
                onChangeText={(v) => { setPasteText(v); setError(null); }}
                placeholder={t.qrPay.pastePlaceholder}
                placeholderTextColor={C.neutral}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
              <Text style={styles.pasteHint}>{t.qrPay.pasteHint}</Text>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable
                style={[styles.primaryBtn, !pasteText.trim() && { opacity: 0.4 }]}
                onPress={handlePasteRead}
                disabled={!pasteText.trim()}
              >
                <Text style={styles.primaryText}>{t.qrPay.readQr}</Text>
              </Pressable>
              {canScan && (
                <Pressable onPress={() => { lightTap(); setError(null); scannedRef.current = false; setStep('scan'); }}>
                  <Text style={styles.linkText}>{t.qrPay.scanWithCamera}</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ── CONFIRM ──────────────────────────────────────────── */}
          {step === 'confirm' && (
            <View style={styles.body}>
              <Text style={styles.confirmBody}>{t.qrPay.confirmBody}</Text>
              <View style={[styles.previewCard, { width: previewSize + SPACING.lg }]}>
                <QRCode
                  value={payload}
                  size={previewSize}
                  color="#111111"
                  backgroundColor="#FFFFFF"
                  ecl="M"
                  getRef={(c: typeof qrRef.current) => { qrRef.current = c; }}
                />
              </View>
              <Text style={styles.merchantLabel}>{t.qrPay.merchant}</Text>
              <Text style={styles.merchantName}>{merchantName || '—'}</Text>

              <Text style={styles.fieldLabel}>{t.qrPay.label}</Text>
              <TextInput
                style={styles.labelInput}
                value={label}
                onChangeText={setLabel}
                placeholder={t.qrPay.labelPlaceholder}
                placeholderTextColor={C.neutral}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />

              <Pressable style={styles.primaryBtn} onPress={handleSave}>
                <Text style={styles.primaryText}>{t.qrPay.saveQr}</Text>
              </Pressable>
              <Pressable onPress={rescan}>
                <Text style={styles.linkText}>{t.qrPay.scanAgain}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: withAlpha(C.dimBg, 0.4),
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: C.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      flex: 1,
    },
    body: {
      alignItems: 'center',
      gap: SPACING.md,
    },
    camWrap: {
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
    },
    camPlaceholder: {
      backgroundColor: C.pillBg,
      gap: SPACING.sm,
      padding: SPACING.lg,
    },
    reticle: {
      ...StyleSheet.absoluteFillObject,
      margin: '14%',
      borderWidth: 2,
      borderColor: withAlpha('#FFFFFF', 0.8),
      borderRadius: RADIUS.md,
    },
    permText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      textAlign: 'center',
    },
    instruction: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      textAlign: 'center',
    },
    errorText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.bronze,
      textAlign: 'center',
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    linkText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.accent,
      fontWeight: TYPOGRAPHY.weight.medium,
      paddingVertical: SPACING.xs,
    },
    pasteInput: {
      width: '100%',
      minHeight: 96,
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textPrimary,
      backgroundColor: C.pillBg,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: C.border,
      textAlignVertical: 'top',
    },
    pasteHint: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textAlign: 'center',
    },
    previewCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: RADIUS.md,
      padding: SPACING.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    merchantLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    merchantName: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      textAlign: 'center',
      marginTop: -SPACING.xs,
    },
    confirmBody: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      textAlign: 'center',
    },
    fieldLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      alignSelf: 'flex-start',
    },
    labelInput: {
      width: '100%',
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      backgroundColor: C.pillBg,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderWidth: 1,
      borderColor: C.border,
    },
    smallPrimary: {
      backgroundColor: C.accent,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    smallPrimaryText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.onAccent,
    },
    primaryBtn: {
      width: '100%',
      minHeight: 50,
      borderRadius: RADIUS.lg,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.xs,
    },
    primaryText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.onAccent,
    },
  });

export default QrCaptureModal;
