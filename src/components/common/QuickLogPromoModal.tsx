import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import FloatingModal from './FloatingModal';
import NeuButton from './NeuButton';
import { useNeu } from './neu';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Any setup action (row or primary CTA) — caller marks seen + navigates to QuickLogSetup. */
  onSetUp: () => void;
}

type Badge = 'noSetup' | 'advanced' | null;

/**
 * One-shot promo for the three quick-log methods (share ss / double back tap /
 * Apple Pay auto log). Shown after the 3rd manual log — when manual friction
 * has been felt. Design mirrors previews/quicklog-promo-modal.html: easy-first
 * ordering, olive icon tiles, calm lowercase copy, quiet dismiss.
 */
const QuickLogPromoModal: React.FC<Props> = ({ visible, onClose, onSetUp }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const t = useT();
  const p = t.quickLogPromo;

  const Row = ({ icon, title, desc, badge }: { icon: keyof typeof Feather.glyphMap; title: string; desc: string; badge?: Badge }) => (
    <TouchableOpacity
      style={[styles.row, neu.raised]}
      onPress={onSetUp}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${desc}`}
    >
      <View style={styles.iconTile}>
        <Feather name={icon} size={18} color={C.accent} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowTitleWrap}>
          <Text style={styles.rowTitle}>{title}</Text>
          {badge === 'noSetup' && (
            <View style={styles.badge}><Text style={styles.badgeText}>{p.noSetup}</Text></View>
          )}
          {badge === 'advanced' && (
            <View style={styles.badgeAdv}><Text style={styles.badgeAdvText}>{p.advanced}</Text></View>
          )}
        </View>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );

  return (
    <FloatingModal visible={visible} onClose={onClose} entrance="fade" maxWidth={400}>
      <View style={styles.wrap}>
        <TouchableOpacity
          style={styles.close}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          <Feather name="x" size={15} color={C.textMuted} />
        </TouchableOpacity>

        <Text style={styles.title}>
          {p.titleA}
          <Text style={styles.titleAccent}>{p.titleEm}</Text>
        </Text>
        <Text style={styles.subtitle}>{p.subtitle}</Text>

        <Row icon="share-2" title={p.shareTitle} desc={p.shareDesc} badge="noSetup" />
        <Row icon="smartphone" title={p.backTapTitle} desc={p.backTapDesc} />
        <Row icon="zap" title={p.autoTitle} desc={p.autoDesc} badge="advanced" />

        <NeuButton icon="check" label={p.cta} color={C.accent} onPress={onSetUp} style={styles.cta} />
        <TouchableOpacity style={styles.later} onPress={onClose} accessibilityRole="button" accessibilityLabel={p.later}>
          <Text style={styles.laterText}>{p.later}</Text>
        </TouchableOpacity>
      </View>
    </FloatingModal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  wrap: {
    padding: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  close: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  title: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: 0.2,
    marginBottom: SPACING.xs,
  },
  titleAccent: {
    color: C.bronze,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    lineHeight: 20,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.background,
    marginBottom: SPACING.sm,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: withAlpha(C.accent, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rowTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  badge: {
    backgroundColor: withAlpha(C.accent, 0.12),
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    letterSpacing: 0.4,
  },
  badgeAdv: {
    backgroundColor: withAlpha(C.bronze, 0.14),
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  badgeAdvText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    letterSpacing: 0.4,
  },
  rowDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    lineHeight: 17,
    color: C.textMuted,
    marginTop: 2,
  },
  cta: {
    marginTop: SPACING.sm,
  },
  later: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  laterText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
});

export default QuickLogPromoModal;
