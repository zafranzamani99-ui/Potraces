import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SPACING, TYPOGRAPHY, withAlpha } from '../../constants';

/**
 * PaymentSplitBar — cash / QR (/ card) as ONE proportional bar with a legend.
 * Shared by the stall live-counter hero (Dashboard State B) and the Close
 * Session Z-report hero. Colors are caller-supplied so it sits on any surface
 * (both callers put it on the solid bronze money card: white + olive + soft white).
 */
const PaymentSplitBar: React.FC<{
  cash: number;
  qr: number;
  card?: number;
  cashLabel: string;
  qrLabel: string;
  cardLabel?: string;
  cashColor: string;
  qrColor: string;
  cardColor?: string;
  /** Track (empty bar) color — default translucent white (for the bronze money card). */
  trackColor?: string;
  /** Legend text color — default soft white (for the bronze money card). */
  labelColor?: string;
}> = ({
  cash,
  qr,
  card = 0,
  cashLabel,
  qrLabel,
  cardLabel,
  cashColor,
  qrColor,
  cardColor = withAlpha('#FFFFFF', 0.55),
  trackColor = withAlpha('#FFFFFF', 0.18),
  labelColor = withAlpha('#FFFFFF', 0.85),
}) => {
  const total = cash + qr + card;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const segments: { pct: number; color: string }[] = [
    { pct: pct(cash), color: cashColor },
    { pct: pct(qr), color: qrColor },
    { pct: pct(card), color: cardColor },
  ].filter((s) => s.pct > 0);
  const legend: { color: string; label: string }[] = [
    { color: cashColor, label: cashLabel },
    { color: qrColor, label: qrLabel },
    ...(card > 0 && cardLabel ? [{ color: cardColor, label: cardLabel }] : []),
  ];
  return (
    <View style={{ gap: SPACING.sm }}>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        {segments.map((s, i) => (
          <View key={i} style={[styles.seg, { width: `${s.pct}%`, backgroundColor: s.color }]} />
        ))}
      </View>
      <View style={styles.labels}>
        {legend.map((l, i) => (
          <View key={i} style={styles.labelRow}>
            <View style={[styles.dot, { backgroundColor: l.color }]} />
            <Text style={[styles.label, { color: labelColor }]}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 2,
  },
  seg: { height: 6, borderRadius: 3 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACING.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
});

export default PaymentSplitBar;
