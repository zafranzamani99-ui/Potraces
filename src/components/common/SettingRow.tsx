import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import CategoryIcon from './CategoryIcon';
import { useNeu } from './neu';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha, ensureContrastOnDark } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';

// Reusable settings row: soft-tinted icon chip + label (+ optional sublabel),
// and a right slot that is either a value+chevron, an external-link glyph, a
// custom element (e.g. a Switch), or a plain chevron. The chip colour is
// brightened on the dark theme so earthy palette colours stay legible.
//
// Each row is its OWN raised neu card (the owner rejected the joined/grouped
// look — 2026-07-21). Follows the LOCKED seam rule: the neu shadow lives on the
// outer `cardShadow` view (no overflow), an inner `cardClip` rounds the content.
// Rows self-space via cardShadow's marginBottom.
//
// `icon` is a lib-prefixed spec (i/ m/ fa/, bare = Feather) rendered via CategoryIcon.
interface SettingRowProps {
  icon: string;
  chipColor: string;
  label: string;
  sublabel?: string;
  value?: string;
  onPress?: () => void;
  external?: boolean;
  rightElement?: React.ReactNode;
  /** @deprecated no-op — rows are now standalone cards, kept for call-site compat. */
  last?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  icon, chipColor, label, sublabel, value, onPress, external, rightElement,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);
  const ic = isDark ? ensureContrastOnDark(chipColor) : chipColor;

  const inner = (
    <View style={styles.row}>
      <View style={[styles.chip, { backgroundColor: withAlpha(ic, isDark ? 0.2 : 0.12) }]}>
        <CategoryIcon icon={icon} size={19} color={ic} adaptDark={false} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        {!!sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
      </View>
      {!!value && <Text style={styles.value} numberOfLines={1}>{value}</Text>}
      {rightElement
        ? rightElement
        : onPress
          ? <Feather name={external ? 'external-link' : 'chevron-right'} size={18} color={C.neutral} />
          : null}
    </View>
  );

  const body = !onPress ? inner : (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {inner}
    </TouchableOpacity>
  );

  // Standalone neu card — shadow on the outer view, clip on the inner (seam rule).
  return (
    <View style={[styles.cardShadow, neu.raisedSoft]}>
      <View style={styles.cardClip}>{body}</View>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  cardShadow: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  cardClip: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 13,
    paddingHorizontal: SPACING.lg,
    minHeight: 56,
  },
  chip: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  sublabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  value: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginRight: SPACING.xs,
  },
});

export default React.memo(SettingRow);
