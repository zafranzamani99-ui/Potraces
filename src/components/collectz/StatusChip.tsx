/**
 * StatusChip — the small participant-status pill shared by the Collectz screens.
 *
 * Extracted from the duplicated chip in CollectzDetail and CollectzJoin —
 * pixel-faithful to both: translucent (0.18) tinted background, colored text,
 * full-radius pill. Semantic colors only (CALM rule: no red, no bright green):
 * confirmed → accent (olive), pending → gold, rejected → overdue (terracotta),
 * anything else / unpaid → neutral (lavender-grey).
 *
 * The label stays with the caller (i18n lives in the screens).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import type { CollectzParticipantStatus } from '../../services/collectzService';

interface StatusChipProps {
  status: CollectzParticipantStatus;
  /** Display text — callers pass their localized status label. */
  label: string;
}

const StatusChip: React.FC<StatusChipProps> = ({ status, label }) => {
  const C = useCalm();
  const styles = React.useMemo(() => makeStyles(C), [C]);

  const color = (() => {
    switch (status) {
      case 'confirmed': return C.accent;
      case 'pending': return C.gold;
      case 'rejected': return C.overdue;
      default: return C.neutral;
    }
  })();

  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(color, 0.18) }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    chip: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
    chipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },
  });

export default StatusChip;
