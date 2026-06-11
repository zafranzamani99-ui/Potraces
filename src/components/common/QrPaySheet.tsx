import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import BottomSheet from './BottomSheet';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { formatAmount } from '../../utils/formatters';
import { lightTap, successNotification } from '../../services/haptics';
import { useSettingsStore, type PaymentQr } from '../../store/settingsStore';
import { embedAmount } from '../../services/emvQr';

// Note: a screen-brightness boost (so the QR scans in sunlight) is intentionally
// omitted — expo-brightness is not a dependency, and statically requiring an
// uninstalled module would break the Metro bundle. Add expo-brightness + a
// mount/unmount setBrightnessAsync(1)/restore effect here if that's wanted.

export interface QrPaySheetProps {
  visible: boolean;
  amountCents: number;
  /** The seller's QR to show. `payload` present → exact-amount QR; else image fallback. */
  paymentQr?: PaymentQr;
  /** Buyer paid (seller confirms by their own bank ping). */
  onConfirmReceived: () => void;
  /** Record the sale without waiting — preserves today's trust-based behavior. */
  onSkip: () => void;
  /** Dismissed with no action — records nothing. */
  onClose: () => void;
  /**
   * PSP-issued dynamic QR payload (Phase 2). When present it's rendered instead
   * of the static embedded-amount QR, and a payment fires the webhook.
   */
  providerPayload?: string;
  /**
   * Provider charge in flight — the webhook will confirm automatically. Shows a
   * live "waiting for payment…" state; the manual "record without confirming"
   * stays as a fallback. No manual "received" button in this mode.
   */
  waiting?: boolean;
}

/**
 * Shows the seller's DuitNow QR re-rendered with the exact sale amount embedded
 * (EMVCo tag 54) so the buyer's banking app pre-fills it. No money flows through
 * the app — "Received" and "Record without confirming" both just complete the
 * existing sale; closing records nothing.
 */
export default function QrPaySheet(props: QrPaySheetProps) {
  if (!props.visible) return null;
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} maxHeightPct={0.9}>
      <PayBody {...props} />
    </BottomSheet>
  );
}

function PayBody({ amountCents, paymentQr, onConfirmReceived, onSkip, providerPayload, waiting }: QrPaySheetProps) {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const { width } = useWindowDimensions();

  const amountText = formatAmount(amountCents / 100, currency);
  const qrSize = Math.min(Math.round(width * 0.62), 260);

  // Build the exact-amount QR payload. Falls back to the stored image if there
  // is no decoded payload, or if embedding fails for any reason.
  const embedded = useMemo(() => {
    if (!paymentQr?.payload) return null;
    try {
      return embedAmount(paymentQr.payload, amountCents);
    } catch {
      return null;
    }
  }, [paymentQr?.payload, amountCents]);

  // A PSP dynamic QR (if any) takes priority over the static embedded one.
  const qrValue = providerPayload || embedded;
  const hasImage = !!paymentQr?.uri;
  const merchantName = paymentQr?.merchantName?.trim();
  const a11y = merchantName
    ? t.qrPay.qrA11y.replace('{amount}', amountText).replace('{name}', merchantName)
    : t.qrPay.qrA11yNoName.replace('{amount}', amountText);

  const [confirming, setConfirming] = useState(false);
  const handleReceived = () => {
    if (confirming) return;
    setConfirming(true);
    successNotification();
    onConfirmReceived();
  };
  const handleSkip = () => {
    lightTap();
    onSkip();
  };

  return (
    <View style={styles.wrap} onStartShouldSetResponder={() => true}>
      <Text style={styles.title}>{t.qrPay.payTitle}</Text>
      <Text style={styles.amount}>{amountText}</Text>
      {!!merchantName && <Text style={styles.merchant}>{merchantName}</Text>}

      {/* QR / image always on a white card so it scans even in dark mode. */}
      <View style={[styles.qrCard, { width: qrSize + SPACING.xl, height: qrSize + SPACING.xl }]}>
        {qrValue ? (
          <QRCode
            value={qrValue}
            size={qrSize}
            color="#111111"
            backgroundColor="#FFFFFF"
            ecl="M"
          />
        ) : hasImage ? (
          <Image
            source={{ uri: paymentQr!.uri }}
            style={{ width: qrSize, height: qrSize, borderRadius: RADIUS.sm }}
            resizeMode="contain"
            accessibilityLabel={a11y}
          />
        ) : (
          <Text style={styles.noQr}>{t.qrPay.imageFallbackNote}</Text>
        )}
      </View>
      {qrValue && (
        <View accessibilityLabel={a11y} accessible style={styles.srOnly} />
      )}

      <Text style={styles.note}>
        {qrValue ? t.qrPay.autoFillNote : t.qrPay.imageFallbackNote}
      </Text>

      <View style={styles.actions}>
        {waiting ? (
          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={styles.waitingText}>{t.qrPay.waiting}</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={handleReceived}
            accessibilityRole="button"
            accessibilityLabel={t.qrPay.received}
          >
            <Text style={styles.primaryText}>{t.qrPay.received}</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.secondaryBtn}
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel={t.qrPay.recordWithout}
        >
          <Text style={styles.secondaryText}>{t.qrPay.recordWithout}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    wrap: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.sm,
      alignItems: 'center',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 460, // tablet cap
    },
    title: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.semibold,
      letterSpacing: 0.3,
      textTransform: 'lowercase',
    },
    amount: {
      fontSize: 40,
      lineHeight: 48,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      marginTop: SPACING.xs,
    },
    merchant: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      marginTop: 2,
      textAlign: 'center',
    },
    qrCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.lg,
      borderWidth: 1,
      borderColor: withAlpha('#000000', 0.06),
    },
    noQr: {
      fontSize: TYPOGRAPHY.size.sm,
      color: '#666666',
      textAlign: 'center',
      paddingHorizontal: SPACING.lg,
    },
    srOnly: {
      width: 1,
      height: 1,
      opacity: 0,
    },
    note: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textAlign: 'center',
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.sm,
      lineHeight: 17,
    },
    actions: {
      width: '100%',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
    },
    waitingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      minHeight: 50,
    },
    waitingText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
    },
    primaryBtn: {
      minHeight: 50,
      borderRadius: RADIUS.lg,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.onAccent,
    },
    secondaryBtn: {
      minHeight: 44,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
    },
  });
