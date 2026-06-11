import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha, BIZ } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { formatAmount } from '../../utils/formatters';
import { useSettingsStore } from '../../store/settingsStore';
import { usePendingPaymentsStore } from '../../store/pendingPaymentsStore';

/**
 * Thin banner shown while one or more PSP QR charges are waiting for the
 * payment webhook to confirm (Phase 2). Renders nothing when there are none —
 * so it's inert until a QR provider is configured and a charge is in flight.
 */
const PendingPaymentsBanner: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const pending = usePendingPaymentsStore((s) => s.pending);

  if (!pending || pending.length === 0) return null;

  const totalCents = pending.reduce((sum, p) => sum + p.amountCents, 0);
  const amount = formatAmount(totalCents / 100, currency);

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <ActivityIndicator size="small" color={BIZ.warning} />
      <Text style={styles.text} numberOfLines={1}>
        {t.qrPay.waitingBanner} · {amount}
        {pending.length > 1 ? `  (${pending.length})` : ''}
      </Text>
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      alignSelf: 'center',
      maxWidth: 680,
      width: '100%',
      marginTop: SPACING.xs,
      marginHorizontal: SPACING.xl,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(BIZ.warning, 0.1),
      borderWidth: 1,
      borderColor: withAlpha(BIZ.warning, 0.25),
    },
    text: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: BIZ.warning,
      fontVariant: ['tabular-nums'],
    },
  });

export default PendingPaymentsBanner;
