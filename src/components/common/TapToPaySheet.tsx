import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Platform,
  AppState,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { formatAmount } from '../../utils/formatters';
import { successNotification, errorNotification } from '../../services/haptics';
import {
  TAP_TO_PAY_FLAG,
  connectTapToPayReader,
  chargeCard,
  type ChargeMetadata,
} from '../../services/tapToPay';

// Build-time gate — the Stripe hook is only loaded on an iOS pilot build.
const ENABLED = Platform.OS === 'ios' && TAP_TO_PAY_FLAG;
const Stripe = ENABLED ? require('@stripe/stripe-terminal-react-native') : null;

export interface TapToPaySheetProps {
  visible: boolean;
  amountCents: number;
  /** Human label for the charge (becomes the PaymentIntent description). */
  label: string;
  /** Traceability metadata written to the Stripe PaymentIntent. */
  metadata: ChargeMetadata;
  onSuccess: (transactionId: string) => void;
  onClose: () => void;
}

type Phase = 'preparing' | 'ready' | 'processing' | 'success' | 'failed';
type FailKind = 'declined' | 'canceled' | 'error';

/**
 * Tap to Pay charge sheet. Drives connect → charge and reflects the live phase.
 * Never records anything itself — it reports the transaction id up via
 * onSuccess only when Stripe confirms the payment.
 */
export default function TapToPaySheet(props: TapToPaySheetProps) {
  if (!ENABLED || !props.visible) return null;
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} maxHeightPct={0.62}>
      <ChargeBody {...props} />
    </BottomSheet>
  );
}

function ChargeBody({ amountCents, label, metadata, onSuccess, onClose }: TapToPaySheetProps) {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const terminal = Stripe.useStripeTerminal();

  const [phase, setPhase] = useState<Phase>('preparing');
  const [failKind, setFailKind] = useState<FailKind>('error');
  const startedRef = useRef(false);
  const backgroundedRef = useRef(false);
  const doneRef = useRef(false); // success/failed reached — ignore late events

  const amountText = formatAmount(amountCents / 100);

  const fail = useCallback((kind: FailKind) => {
    if (doneRef.current) return;
    doneRef.current = true;
    errorNotification();
    setFailKind(kind);
    setPhase('failed');
  }, []);

  const run = useCallback(async () => {
    doneRef.current = false;
    setFailKind('error');
    setPhase('preparing');
    const conn = await connectTapToPayReader(terminal);
    if (doneRef.current) return;
    if (!conn.ok) {
      fail(conn.error.status === 'canceled' ? 'canceled' : 'error');
      return;
    }
    setPhase('ready');
    const result = await chargeCard({
      terminal,
      amountCents,
      description: label,
      metadata,
      onProgress: (p) => {
        if (!doneRef.current) setPhase(p === 'confirming' ? 'processing' : 'ready');
      },
    });
    if (doneRef.current) return;
    if (result.status === 'success') {
      doneRef.current = true;
      setPhase('success');
      successNotification();
      setTimeout(() => onSuccess(result.transactionId), 750);
    } else if (result.status === 'declined') {
      fail('declined');
    } else if (result.status === 'canceled') {
      fail('canceled');
    } else {
      fail('error');
    }
  }, [terminal, amountCents, label, metadata, fail, onSuccess]);

  // Kick the charge once when the body mounts.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
    // On unmount, cancel any reader collection that may still be live.
    return () => {
      try { terminal.cancelCollectPaymentMethod?.(); } catch {}
    };
  }, [run, terminal]);

  // Background-mid-charge guard. We key on 'background' (a real app exit), NOT
  // the transient 'inactive' that the native Tap to Pay UI itself triggers, to
  // avoid false failures. A charge interrupted by leaving the app must surface
  // as a retryable error — never a silent success.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const working = phase === 'preparing' || phase === 'ready' || phase === 'processing';
      if (s === 'background' && working) {
        backgroundedRef.current = true;
      } else if (s === 'active' && backgroundedRef.current) {
        backgroundedRef.current = false;
        try { terminal.cancelCollectPaymentMethod?.(); } catch {}
        fail('error');
      }
    });
    return () => sub.remove();
  }, [phase, terminal, fail]);

  const cancelInFlight = useCallback(() => {
    try { terminal.cancelCollectPaymentMethod?.(); } catch {}
    try { terminal.cancelEasyConnect?.(); } catch {}
    onClose();
  }, [terminal, onClose]);

  const failTitle =
    failKind === 'declined' ? t.tapToPay.declined
      : failKind === 'canceled' ? t.tapToPay.canceled
        : t.tapToPay.errorGeneric;

  return (
    <View style={styles.wrap} onStartShouldSetResponder={() => true}>
      <Text style={styles.title}>{t.tapToPay.title}</Text>
      <Text style={styles.amount}>{amountText}</Text>
      {!!label && <Text style={styles.label}>{label}</Text>}

      <View style={styles.stage}>
        {(phase === 'preparing' || phase === 'processing') && (
          <>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.stageText}>
              {phase === 'preparing' ? t.tapToPay.preparing : t.tapToPay.processing}
            </Text>
            {phase === 'preparing' && <Text style={styles.note}>{t.tapToPay.firstUseNote}</Text>}
          </>
        )}

        {phase === 'ready' && (
          <>
            <View style={[styles.iconRing, { borderColor: withAlpha(C.accent, 0.3) }]}>
              <Feather name="wifi" size={30} color={C.accent} />
            </View>
            <Text style={styles.stageText}>{t.tapToPay.ready}</Text>
          </>
        )}

        {phase === 'success' && (
          <>
            <View style={[styles.iconRing, { borderColor: withAlpha(C.positive, 0.35) }]}>
              <Feather name="check" size={32} color={C.positive} />
            </View>
            <Text style={[styles.stageText, { color: C.positive }]}>{t.tapToPay.success}</Text>
          </>
        )}

        {phase === 'failed' && (
          <>
            <View style={[styles.iconRing, { borderColor: withAlpha(C.bronze, 0.35) }]}>
              <Feather name="x" size={30} color={C.bronze} />
            </View>
            <Text style={styles.stageText}>{failTitle}</Text>
          </>
        )}
      </View>

      <View style={styles.actions}>
        {(phase === 'preparing' || phase === 'ready') && (
          <Pressable
            style={styles.secondaryBtn}
            onPress={cancelInFlight}
            accessibilityRole="button"
            accessibilityLabel={t.tapToPay.cancel}
          >
            <Text style={styles.secondaryText}>{t.tapToPay.cancel}</Text>
          </Pressable>
        )}

        {phase === 'failed' && (
          <>
            <Pressable
              style={styles.primaryBtn}
              onPress={run}
              accessibilityRole="button"
              accessibilityLabel={t.tapToPay.retry}
            >
              <Text style={styles.primaryText}>{t.tapToPay.retry}</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t.tapToPay.close}
            >
              <Text style={styles.secondaryText}>{t.tapToPay.close}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    wrap: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.md,
      alignItems: 'center',
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
    label: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      marginTop: 2,
      textAlign: 'center',
    },
    stage: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING['2xl'],
      minHeight: 150,
      gap: SPACING.md,
    },
    iconRing: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stageText: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.semibold,
      textAlign: 'center',
      paddingHorizontal: SPACING.lg,
    },
    note: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textAlign: 'center',
      paddingHorizontal: SPACING.lg,
    },
    actions: {
      width: '100%',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    primaryBtn: {
      minHeight: 48,
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
