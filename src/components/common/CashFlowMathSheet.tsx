// ─────────────────────────────────────────────────────────────
// CashFlowMathSheet — "show me the math" for the Reports hero + cash-flow card.
//
// Clarity/transparency: each number on the cash-flow card explains ITSELF —
//   • tap "came in"  → the income sources that add up to it   (focus="in")
//   • tap "went out" → the expense categories that add up to it (focus="out")
//   • tap "kept" / the hero → came in − went out = kept, itemized (focus="kept")
// When a prior period exists it also shows before → now for the relevant line(s).
//
// Pure presentation: the caller passes already-computed numbers + rollups; this
// component only formats + lays out. Onyx-compliant via FloatingModal (#121212,
// no outline, 0.4 backdrop) + an explicit close button.
// ─────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import {
  CALM,
  SPACING,
  RADIUS,
  TYPOGRAPHY,
  TYPE,
  withAlpha,
  ensureContrastOnDark,
} from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import FloatingModal from './FloatingModal';
import type { CategoryRollup } from '../../utils/insights';

const DELTA_CAP = 999;

export type MathFocus = 'in' | 'out' | 'kept';

interface CashFlowMathSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Which number the user tapped — decides what the sheet explains. */
  focus: MathFocus;
  currency: string;
  rangeLabel: string;
  cameIn: number;
  wentOut: number;
  kept: number;
  incomeRows: CategoryRollup[];
  expenseRows: CategoryRollup[];
  /** Previous equal window — omit/null to hide the "compared to before" block. */
  compare?: { cameIn: number; wentOut: number; kept: number } | null;
}

const CashFlowMathSheet: React.FC<CashFlowMathSheetProps> = ({
  visible,
  onClose,
  focus,
  currency,
  rangeLabel,
  cameIn,
  wentOut,
  kept,
  incomeRows,
  expenseRows,
  compare,
}) => {
  const C = useCalm();
  const t = useT();
  const isDark = useIsDark();
  const { height: screenH } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C), [C]);

  // Lift fixed category colours so the dots match the (already lifted) donut arcs.
  const lift = (hex: string) => (isDark ? ensureContrastOnDark(hex) : hex);
  const money0 = (n: number) =>
    n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmt = (n: number) => `${currency} ${money0(n)}`;

  const positive = kept >= 0;
  const keptColor = positive ? C.positive : C.overdue;
  const keptPct = cameIn > 0 ? Math.round((kept / cameIn) * 100) : null;

  // Remainders so each section sums to its total — mirrors the screen's donut
  // "everything else" (total − the listed rows).
  const incomeOther = Math.max(cameIn - incomeRows.reduce((s, r) => s + r.amount, 0), 0);
  const expenseOther = Math.max(wentOut - expenseRows.reduce((s, r) => s + r.amount, 0), 0);

  // Header depends on the tapped number.
  const header =
    focus === 'in'
      ? { label: t.reports.moneyIn, amount: cameIn, color: C.positive, sub: null as string | null }
      : focus === 'out'
      ? { label: t.reports.moneyOut, amount: wentOut, color: C.overdue, sub: null }
      : {
          label: positive ? t.reports.youKept : t.reports.heroOver,
          amount: Math.abs(kept),
          color: keptColor,
          sub: positive
            ? keptPct !== null
              ? `${keptPct}% ${t.reports.ofWhatCameIn}`
              : null
            : t.reports.moreWentOut,
        };

  const breakdownRow = (key: string, color: string, name: string, amount: number) => (
    <View key={key} style={styles.itemRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.itemName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.itemAmount}>{fmt(amount)}</Text>
    </View>
  );

  const incomeBreakdown = (
    <>
      {incomeRows.map((r) => breakdownRow(`in-${r.id}`, lift(r.color), r.name, r.amount))}
      {incomeOther > 0.5 &&
        breakdownRow('in-other', withAlpha(C.textMuted, 0.5), t.reports.otherSlice, incomeOther)}
    </>
  );
  const expenseBreakdown = (
    <>
      {expenseRows.map((r) => breakdownRow(`out-${r.id}`, lift(r.color), r.name, r.amount))}
      {expenseOther > 0.5 &&
        breakdownRow('out-other', withAlpha(C.textMuted, 0.5), t.reports.otherSlice, expenseOther)}
    </>
  );

  const deltaPill = (cur: number, prev: number, goodWhenDown: boolean) => {
    if (prev === 0) return null; // no prior figure → no meaningful %
    const delta = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (delta === 0) return <Text style={styles.deltaFlat}>—</Text>;
    const up = delta > 0;
    const good = goodWhenDown ? !up : up;
    const color = good ? C.positive : C.overdue;
    const abs = Math.abs(delta);
    const label = abs > DELTA_CAP ? `${DELTA_CAP}+%` : `${abs}%`;
    return (
      <View style={[styles.deltaPill, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Feather name={up ? 'arrow-up' : 'arrow-down'} size={11} color={color} />
        <Text style={[styles.deltaText, { color }]}>{label}</Text>
      </View>
    );
  };

  const compareRow = (
    key: string,
    label: string,
    prev: number,
    cur: number,
    goodWhenDown: boolean
  ) => (
    <View key={key} style={styles.compareRow}>
      <Text style={styles.compareLabel}>{label}</Text>
      <View style={styles.compareRight}>
        <Text style={styles.compareBefore}>{fmt(prev)}</Text>
        <Feather name="arrow-right" size={12} color={C.textMuted} />
        <Text style={styles.compareNow}>{fmt(cur)}</Text>
        {deltaPill(cur, prev, goodWhenDown)}
      </View>
    </View>
  );

  return (
    <FloatingModal visible={visible} onClose={onClose} maxWidth={460}>
      <ScrollView
        style={{ flexShrink: 1, maxHeight: screenH * 0.8 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header — the number the user tapped */}
        <Text style={styles.eyebrow}>{rangeLabel}</Text>
        <Text style={styles.resultLabel}>{header.label}</Text>
        <Text style={[styles.resultAmount, { color: header.color }]}>{fmt(header.amount)}</Text>
        {header.sub ? <Text style={styles.resultSub}>{header.sub}</Text> : null}

        {/* Body — the itemization that adds up to the tapped number */}
        {focus === 'in' && <View style={styles.section}>{incomeBreakdown}</View>}
        {focus === 'out' && <View style={styles.section}>{expenseBreakdown}</View>}
        {focus === 'kept' && (
          <>
            <View style={styles.sectionHead}>
              <Feather name="arrow-down-circle" size={14} color={C.positive} />
              <Text style={styles.sectionHeadText}>{t.reports.moneyIn}</Text>
            </View>
            {incomeBreakdown}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>{t.reports.cameIn}</Text>
              <Text style={[styles.subtotalAmount, { color: C.positive }]}>+ {fmt(cameIn)}</Text>
            </View>

            <View style={styles.sectionHead}>
              <Feather name="arrow-up-circle" size={14} color={C.overdue} />
              <Text style={styles.sectionHeadText}>{t.reports.moneyOut}</Text>
            </View>
            {expenseBreakdown}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>{t.reports.wentOut}</Text>
              <Text style={[styles.subtotalAmount, { color: C.overdue }]}>− {fmt(wentOut)}</Text>
            </View>

            <View style={styles.equalsRow}>
              <Text style={styles.equalsLabel}>
                {positive ? t.reports.youKept : t.reports.heroOver}
              </Text>
              <Text style={[styles.equalsAmount, { color: keptColor }]}>{fmt(Math.abs(kept))}</Text>
            </View>
          </>
        )}

        {/* Compared to before — the relevant line(s) */}
        {compare && (
          <>
            <View style={[styles.sectionHead, styles.compareHead]}>
              <Feather name="clock" size={14} color={C.textMuted} />
              <Text style={styles.sectionHeadText}>{t.reports.vsPrevious}</Text>
            </View>
            {(focus === 'in' || focus === 'kept') &&
              compareRow('c-in', t.reports.cameIn, compare.cameIn, cameIn, false)}
            {(focus === 'out' || focus === 'kept') &&
              compareRow('c-out', t.reports.wentOut, compare.wentOut, wentOut, true)}
            {focus === 'kept' && compareRow('c-kept', t.reports.kept, compare.kept, kept, false)}
          </>
        )}

        <Text style={styles.roundedNote}>{t.reports.roundedNote}</Text>

        {/* Explicit close — the canonical Goals/Onyx bottom link (backdrop-tap
            + swipe-down on the handle also dismiss). */}
        <TouchableOpacity
          style={styles.closeLink}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          <View style={styles.closeLinkInner}>
            <Feather name="x" size={12} color={C.textMuted} />
            <Text style={styles.closeLinkText}>{t.common.close}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </FloatingModal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xl,
    },

    // Canonical bottom close link (matches BottomSheet's Goals/Onyx pattern)
    closeLink: { alignSelf: 'center', marginTop: SPACING.lg },
    closeLinkInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    closeLinkText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.2,
      textTransform: 'lowercase',
    },

    // Header
    eyebrow: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: SPACING.sm,
    },
    resultLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      textTransform: 'lowercase',
    },
    resultAmount: {
      fontSize: TYPE.balance.fontSize,
      fontWeight: TYPE.balance.fontWeight,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    resultSub: {
      ...TYPE.insight,
      color: C.textSecondary,
      marginTop: SPACING.xs,
    },

    // Focused-mode body wrapper (adds the top gap a section header would give)
    section: { marginTop: SPACING.lg },

    // Section header (money in / money out / vs before)
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.xl,
      marginBottom: SPACING.xs,
    },
    compareHead: {
      paddingTop: SPACING.lg,
      borderTopWidth: 1,
      borderTopColor: withAlpha(C.textPrimary, 0.06),
    },
    sectionHeadText: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },

    // Itemized breakdown row (dot · name … amount)
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: SPACING.md,
    },
    itemName: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      marginRight: SPACING.md,
    },
    itemAmount: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textSecondary,
      fontVariant: ['tabular-nums'],
    },

    // Subtotal (came in / went out) — kept mode only
    subtotalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.xs,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: withAlpha(C.textPrimary, 0.08),
    },
    subtotalLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      textTransform: 'lowercase',
    },
    subtotalAmount: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      fontVariant: ['tabular-nums'],
    },

    // = you kept (the equation result) — kept mode only
    equalsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.md,
      paddingTop: SPACING.md,
      borderTopWidth: 2,
      borderTopColor: withAlpha(C.textPrimary, 0.14),
    },
    equalsLabel: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      textTransform: 'lowercase',
    },
    equalsAmount: {
      fontSize: TYPE.balance.fontSize,
      fontWeight: TYPOGRAPHY.weight.bold,
      fontVariant: ['tabular-nums'],
    },

    // Compared to before
    compareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    compareLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      textTransform: 'lowercase',
    },
    compareRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      flexShrink: 1,
    },
    compareBefore: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontVariant: ['tabular-nums'],
    },
    compareNow: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.semibold,
      fontVariant: ['tabular-nums'],
    },

    // Delta pill (reused shape from the Reports screen)
    deltaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: RADIUS.full,
      gap: 2,
      marginLeft: SPACING.xs,
    },
    deltaText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },
    deltaFlat: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, marginLeft: SPACING.xs },

    // Honest disclosure — every line is the true rounded value, so a column may
    // read ±1 vs its parts; say so rather than fudge the figures.
    roundedNote: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textAlign: 'center',
      marginTop: SPACING.xl,
    },
  });

export default CashFlowMathSheet;
