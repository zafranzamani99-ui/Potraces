import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Feather } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import BottomSheet from './BottomSheet';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { formatAmount } from '../../utils/formatters';
import { lightTap, successNotification } from '../../services/haptics';
import { useSettingsStore, type PaymentQr } from '../../store/settingsStore';
import { embedAmount, parseTlv } from '../../services/emvQr';

// DuitNow brand magenta (QR-card loader spinner tint).
const DUITNOW_PINK = '#ED1C6E';

// The provider QR is created with a 180s Fiuu validity (qr-create-charge's
// validityDuration). We expire the on-screen QR a few seconds EARLIER than that,
// measured from when it appears — the charge was created ~1-2s before display, so
// a margin guarantees we never present a QR the app thinks is live but Fiuu has
// already rejected.
const QR_VALIDITY_MS = 170000;

// Official brand logos (assets/e-wallet). DuitNow = the scheme mark shown on the
// card; Fiuu = the acquirer, shown as a small "powered by" watermark.
const DUITNOW_LOGO = require('../../../assets/e-wallet/duit-now-logo.png');
const FIUU_LOGO = require('../../../assets/e-wallet/fiuu-logo.png');

// Note: a screen-brightness boost (so the QR scans in sunlight) is intentionally
// omitted — expo-brightness is not a dependency, and statically requiring an
// uninstalled module would break the Metro bundle. Add expo-brightness + a
// mount/unmount setBrightnessAsync(1)/restore effect here if that's wanted.

export interface QrPaySheetProps {
  visible: boolean;
  amountCents: number;
  /** The seller's QR to show. `payload` present → exact-amount QR; else image fallback. */
  paymentQr?: PaymentQr;
  /** Buyer paid — record the sale (manual confirm, or the auto-confirm escape hatch). */
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
   * live "confirms automatically" state; a manual "mark as paid" escape hatch
   * appears only after MANUAL_REVEAL_MS.
   */
  waiting?: boolean;
  /**
   * The provider charge is still being created (network round-trip). Opens the
   * sheet immediately with a spinner instead of a frozen screen.
   */
  loading?: boolean;
  /**
   * App-side charge reference. Shown small + selectable ONLY in dev builds, so it
   * can be typed into Fiuu's sandbox to confirm a test payment. Never in prod.
   */
  testRef?: string;
  /**
   * Regenerate a fresh provider charge (new QR + new validity window). Wired on
   * the provider path so an expired QR can be refreshed in one tap.
   */
  onRefresh?: () => void;
}

/**
 * DuitNow QR pay sheet. The white card is a self-contained payment ticket
 * (DuitNow logo → amount → merchant → QR → scan-to-pay → powered by Fiuu). No
 * money flows through the app — the provider webhook auto-confirms; "mark as
 * paid" records the sale manually; closing records nothing.
 */
export default function QrPaySheet(props: QrPaySheetProps) {
  const t = useT();
  // Expire the provider QR after its validity window (measured from when the QR
  // appears). Resets whenever a fresh payload arrives (i.e. after refresh).
  // remainingSec also drives the visible countdown under the QR.
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState(QR_VALIDITY_MS / 1000);
  useEffect(() => {
    if (!props.visible || !props.providerPayload || props.loading) {
      setExpiresAt(null);
      return;
    }
    const end = Date.now() + QR_VALIDITY_MS;
    setExpiresAt(end);
    const tick = () => setRemainingSec(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [props.visible, props.providerPayload, props.loading]);
  const expired = expiresAt != null && remainingSec <= 0;

  if (!props.visible) return null;
  // Guard the close while a payment is LIVE — the buyer may be mid-scan, so
  // confirm before dismissing. An expired QR can't be paid, so let it close
  // freely. Returning false keeps the sheet open; "close anyway" calls onClose.
  const guardClose = (): boolean => {
    if (!props.waiting || expired) return true;
    Alert.alert(t.qrPay.closeConfirmTitle, t.qrPay.closeConfirmBody, [
      { text: t.qrPay.keepWaiting, style: 'cancel' },
      { text: t.qrPay.closeAnyway, style: 'destructive', onPress: () => props.onClose() },
    ]);
    return false;
  };
  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      onAttemptClose={guardClose}
      maxHeightPct={0.93}
    >
      <PayBody {...props} expired={expired} remainingSec={remainingSec} />
    </BottomSheet>
  );
}

/** Parse the merchant name (EMVCo tag 59) from a raw QR payload. */
function merchantFromPayload(payload?: string): string | undefined {
  if (!payload) return undefined;
  try {
    const node = parseTlv(payload).find((n) => n.id === '59');
    const v = node?.value?.trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

/** mm:ss for the QR validity countdown. */
const formatCountdown = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function PayBody({ amountCents, paymentQr, onConfirmReceived, onSkip, providerPayload, waiting, loading, testRef, onRefresh, expired, remainingSec = 0 }: QrPaySheetProps & { expired?: boolean; remainingSec?: number }) {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const { width } = useWindowDimensions();

  const amountText = formatAmount(amountCents / 100, currency);
  // Sized so the whole sheet (card + actions + close) fits under the sheet cap
  // with room to spare — no scrolling on phone-size screens.
  const qrSize = Math.min(Math.round(width * 0.54), 220);

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

  // Merchant name: prefer the stored capture name; else read tag 59 from
  // whichever payload we're actually rendering (the Fiuu QR carries it too).
  const merchantName = useMemo(() => {
    const stored = paymentQr?.merchantName?.trim();
    if (stored) return stored;
    return merchantFromPayload(providerPayload || paymentQr?.payload);
  }, [paymentQr?.merchantName, paymentQr?.payload, providerPayload]);

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
  // Manual "already paid? mark it" — an explicit escape hatch when the seller has
  // their own proof (e.g. their bank's DuitNow alert) and doesn't want to wait on
  // auto-confirm. Always available but muted; a one-line confirm guards against a
  // reflex tap booking an unpaid sale.
  const handleManualMark = () => {
    lightTap();
    Alert.alert(t.qrPay.markPaidConfirmTitle, t.qrPay.markPaidConfirmBody, [
      { text: t.qrPay.keepWaiting, style: 'cancel' },
      { text: t.qrPay.markPaid, onPress: onSkip },
    ]);
  };
  const handleRefresh = () => {
    lightTap();
    onRefresh?.();
  };

  // Reusable muted "already paid? mark it" escape hatch (shown while waiting and
  // when expired — a payment could have landed just before the QR lapsed).
  const manualMarkLink = (
    <Pressable
      style={styles.manualLink}
      onPress={handleManualMark}
      accessibilityRole="button"
      accessibilityLabel={t.qrPay.alreadyPaid}
    >
      <Text style={styles.manualText}>{t.qrPay.alreadyPaid}</Text>
    </Pressable>
  );

  return (
    // BottomSheet children must manage their own scroll — without it, tall
    // content (QR card + actions) overflows the sheet's max height and the
    // pinned close footer paints ON TOP of the buttons.
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.wrap}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onStartShouldSetResponder={() => true}
    >
      {/* Self-contained payment ticket. QR renders in DuitNow magenta on white
          (the scheme's own standee look) — dark enough to scan reliably. */}
      <View style={styles.qrCard}>
        <Image source={DUITNOW_LOGO} style={styles.duitnowLogo} resizeMode="contain" />

        <Text style={styles.amount}>{amountText}</Text>
        {!!merchantName && <Text style={styles.merchant}>{merchantName}</Text>}

        <View style={styles.qrHolder}>
          {loading ? (
            <View style={[styles.loadingBox, { width: qrSize, height: qrSize }]}>
              <ActivityIndicator size="large" color={DUITNOW_PINK} />
              <Text style={styles.loadingText}>{t.qrPay.creatingQr}</Text>
            </View>
          ) : expired ? (
            <View style={[styles.expiredBox, { width: qrSize, height: qrSize }]}>
              <Feather name="refresh-cw" size={30} color="#B0B0B0" />
              <Text style={styles.expiredText}>{t.qrPay.qrExpired}</Text>
            </View>
          ) : qrValue ? (
            <QRCode
              value={qrValue}
              size={qrSize}
              color={DUITNOW_PINK}
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

        {!loading && !expired && (
          <View style={styles.scanPill}>
            <Text style={styles.scanPillText}>{t.qrPay.payTitle}</Text>
          </View>
        )}

        {/* Live validity countdown — provider QRs lapse (QR_VALIDITY_MS), so say
            so BEFORE the buyer is mid-scan. Static/image QRs never expire. Turns
            amber in the last minute so an about-to-die QR can't be missed. */}
        {!loading && !expired && !!providerPayload && (
          <View style={styles.expiryRow}>
            <Feather name="clock" size={13} color={remainingSec <= 60 ? '#B45309' : '#5B5B5B'} />
            <Text style={[styles.expiryText, remainingSec <= 60 && { color: '#B45309' }]}>
              {t.qrPay.expiresIn.replace('{time}', formatCountdown(remainingSec))}
            </Text>
          </View>
        )}

        {!loading && (
          <View style={styles.poweredRow}>
            <Text style={styles.poweredText}>powered by</Text>
            <Image source={FIUU_LOGO} style={styles.fiuuLogo} resizeMode="contain" />
          </View>
        )}
      </View>
      {qrValue && !loading && <View accessibilityLabel={a11y} accessible style={styles.srOnly} />}

      {/* Dev-only: the charge ref for the Fiuu sandbox. Never shown in prod. */}
      {__DEV__ && !!testRef && waiting && (
        <Text style={styles.testRef} selectable>
          ref: {testRef}
        </Text>
      )}

      {!loading && (
        <View style={styles.actions}>
          {expired ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
                onPress={handleRefresh}
                accessibilityRole="button"
                accessibilityLabel={t.qrPay.refreshQr}
              >
                <Text style={styles.primaryText}>{t.qrPay.refreshQr}</Text>
              </Pressable>
              {manualMarkLink}
            </>
          ) : waiting ? (
            <>
              <View style={styles.statusRow}>
                <LiveDot color={C.accent} />
                <Text style={styles.statusText}>{t.qrPay.autoConfirm}</Text>
              </View>
              {manualMarkLink}
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
              onPress={handleReceived}
              accessibilityRole="button"
              accessibilityLabel={t.qrPay.markPaid}
            >
              <Text style={styles.primaryText}>{t.qrPay.markPaid}</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

/** A single softly-pulsing "live" dot — the calm alternative to a spinner. */
function LiveDot({ color }: { color: string }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(
      withTiming(1, { duration: 950, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(v);
  }, [v]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 1], [0.35, 1]),
    transform: [{ scale: interpolate(v.value, [0, 1], [0.85, 1.2]) }],
  }));
  return <Reanimated.View style={[liveDotStyles.dot, { backgroundColor: color }, style]} />;
}

const liveDotStyles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
});

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    scroll: {
      alignSelf: 'stretch',
      width: '100%',
      flexShrink: 1, // shrink within the sheet's maxHeight and SCROLL — never overflow into the close footer
    },
    wrap: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.sm,
      alignItems: 'center',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 460, // tablet cap
    },
    qrCard: {
      alignSelf: 'stretch', // fill the sheet width — not a slim strip
      backgroundColor: '#FFFFFF',
      borderRadius: RADIUS.xl,
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      borderWidth: 1,
      borderColor: withAlpha('#000000', 0.05),
      // Soft float, like the HitPay reference card.
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    duitnowLogo: {
      width: 54,
      height: 48, // 600×534 source aspect
    },
    amount: {
      fontSize: 34,
      lineHeight: 40,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: '#111111',
      marginTop: SPACING.sm,
    },
    merchant: {
      fontSize: TYPOGRAPHY.size.sm,
      color: '#6B6B6B',
      marginTop: 2,
      textAlign: 'center',
    },
    qrHolder: {
      marginTop: SPACING.md,
      marginBottom: SPACING.md,
    },
    loadingBox: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.md,
    },
    loadingText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: '#888888',
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    expiredBox: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    expiredText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: '#9A9A9A',
      fontWeight: TYPOGRAPHY.weight.semibold,
    },
    noQr: {
      fontSize: TYPOGRAPHY.size.sm,
      color: '#666666',
      textAlign: 'center',
      paddingHorizontal: SPACING.lg,
    },
    scanPill: {
      backgroundColor: '#F1F1F4',
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.lg,
      paddingVertical: 7,
    },
    scanPillText: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: '700',
      color: '#5B5B5B',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    expiryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: SPACING.sm,
    },
    expiryText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: '#5B5B5B',
      fontWeight: TYPOGRAPHY.weight.semibold,
      fontVariant: ['tabular-nums'],
    },
    poweredRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      marginTop: SPACING.sm,
    },
    poweredText: {
      fontSize: 11,
      color: '#9A9A9A',
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    fiuuLogo: {
      width: 42,
      height: 19, // 439×198 source aspect
    },
    srOnly: {
      width: 1,
      height: 1,
      opacity: 0,
    },
    testRef: {
      fontSize: 12,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
      opacity: 0.9,
      fontVariant: ['tabular-nums'],
    },
    actions: {
      width: '100%',
      alignItems: 'center',
      marginTop: SPACING.md,
    },
    // "Confirms automatically" — the sheet's key reassurance, so it reads as a
    // status banner (tinted pill), not a caption.
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      minHeight: 40,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.accent, 0.12),
    },
    statusText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    // Manual escape hatch — a real (if quiet) full-width button, so it's
    // obviously tappable and reads as a distinct block above the close link.
    manualLink: {
      marginTop: SPACING.md,
      alignSelf: 'stretch',
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: RADIUS.lg,
    },
    manualText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
    },
    primaryBtn: {
      alignSelf: 'stretch',
      minHeight: 52,
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
  });
