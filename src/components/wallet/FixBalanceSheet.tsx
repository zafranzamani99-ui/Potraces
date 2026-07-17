// ─── FIX BALANCE SHEET ──────────────────────────────────────────────────
// A calm, plain-language explainer for a single wallet's balance gap. Shows the
// user WHERE their records add up to and how far the stored balance drifts from
// that, tiered by size so a non-financial user knows whether it's harmless
// rounding or a real transaction they forgot to log. Reads the reconcile result
// (with breakdown) from computeWalletReconcile() and offers, tier-appropriately,
// to review transactions or overwrite the balance.
//
// Onyx look: sheet bg = C.background, faint-dark neu cards, no outlines.
// Built on the shared FloatingModal (centered card) — see FloatingModal.tsx.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import FloatingModal from '../common/FloatingModal';
import NeuButton from '../common/NeuButton';
import { useNeu } from '../common/neu';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { ReconcileResult } from '../../utils/walletReconcile';

interface Props {
  visible: boolean;
  onClose: () => void;
  data: ReconcileResult | null;
  currency: string;
  onReview: () => void;
  onSetBalance: (computed: number) => void;
}

type Tier = 'none' | 'small' | 'medium' | 'big';

const FixBalanceSheet: React.FC<Props> = ({ visible, onClose, data, currency, onReview, onSetBalance }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible || !data) return null;

  // ── Tier (contract) ──
  const d = Math.abs(data.drift);
  const pct = d / Math.max(Math.abs(data.stored), 1);
  const tier: Tier =
    d <= 0.005 ? 'none' : d >= 100 || pct >= 0.15 ? 'big' : d < 20 && pct < 0.05 ? 'small' : 'medium';

  // ── Formatting helpers ──
  // Raw signed value (stored/computed can be negative on a credit wallet).
  const fmt = (v: number) => `${currency} ${v.toFixed(2)}`;
  const gapAmount = `${currency} ${Math.abs(data.drift).toFixed(2)}`;
  const computedAmount = fmt(data.computed);

  // ── Actions ──
  const handleSet = () => {
    onSetBalance(data.computed);
    onClose();
  };
  const handleReview = () => {
    onReview();
    onClose();
  };
  const handleSetConfirm = () => {
    Alert.alert(t.wallets.fixBalance, t.wallets.fbSetConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.confirm, style: 'destructive', onPress: handleSet },
    ]);
  };

  // ── Breakdown rows (hide zero rows to reduce noise) ──
  const b = data.breakdown;
  type RowMode = 'plain' | 'plus' | 'minus' | 'signed';
  const bdRows = ([
    { label: t.wallets.fbStarting, value: b.initial, mode: 'plain' },
    { label: t.wallets.fbIncome, value: b.income, mode: 'plus' },
    { label: t.wallets.fbSpending, value: b.spending, mode: 'minus' },
    { label: t.wallets.fbTransfers, value: b.transfersNet, mode: 'signed' },
    { label: t.wallets.fbOther, value: b.otherNet, mode: 'signed' },
  ] as { label: string; value: number; mode: RowMode }[]).filter((r) => Math.abs(r.value) > 0.005);

  const bdAmount = (value: number, mode: RowMode) => {
    const abs = `${currency} ${Math.abs(value).toFixed(2)}`;
    if (mode === 'plus') return `+ ${abs}`;
    if (mode === 'minus') return `− ${abs}`;
    if (mode === 'signed') return `${value < 0 ? '−' : '+'} ${abs}`;
    return value < 0 ? `− ${abs}` : abs; // plain
  };

  const header = (
    <View style={styles.header}>
      <Text style={styles.title} numberOfLines={1}>
        {data.walletName}
      </Text>
      <Text style={styles.subtitle}>{t.wallets.fixBalance.toLowerCase()}</Text>
    </View>
  );

  return (
    <FloatingModal visible={visible} onClose={onClose} maxWidth={480}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {header}

        {tier === 'none' ? (
          // ── All good ──
          <>
            <View style={[styles.card, styles.goodCard, neu.raisedSoft]}>
              <Feather name="check-circle" size={22} color={C.accent} />
              <Text style={styles.goodText}>{t.wallets.fbLooksRight}</Text>
            </View>
            <NeuButton icon="check" label={t.common.done} onPress={onClose} accessibilityLabel="done" />
          </>
        ) : (
          <>
            {/* ── Summary: what the wallet shows vs what records add up to ── */}
            <View style={[styles.card, neu.raisedSoft]}>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>{t.wallets.fbWalletShows}</Text>
                <Text style={styles.sumValue}>{fmt(data.stored)}</Text>
              </View>
              <View style={styles.sumDivider} />
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>{t.wallets.fbRecordsAddTo}</Text>
                <Text style={styles.sumValue}>{fmt(data.computed)}</Text>
              </View>
            </View>

            {/* ── The gap, in plain words ── */}
            <Text style={styles.gapLine}>
              {(data.drift > 0 ? t.wallets.fbGapMore : t.wallets.fbGapLess).replace('{amount}', gapAmount)}
            </Text>

            {/* ── Where the records come from ── */}
            {bdRows.length > 0 && (
              <View style={[styles.card, neu.raisedSoft]}>
                <Text style={styles.cardTitle}>{t.wallets.fbBreakdownTitle}</Text>
                {bdRows.map((r) => (
                  <View key={r.label} style={styles.bdRow}>
                    <Text style={styles.bdLabel}>{r.label}</Text>
                    <Text style={styles.bdValue}>{bdAmount(r.value, r.mode)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Tier tone ── */}
            {tier === 'small' && <Text style={styles.hintMuted}>{t.wallets.fbSmallHint}</Text>}
            {tier === 'big' && (
              <>
                <View style={styles.warnCard}>
                  <Feather name="alert-triangle" size={16} color={C.bronze} style={styles.warnIcon} />
                  <Text style={styles.warnText}>{t.wallets.fbBigWarn}</Text>
                </View>
                <Text style={styles.hintMuted}>{t.wallets.fbBigMaybeBug}</Text>
              </>
            )}

            {/* ── Actions ── */}
            {tier === 'big' ? (
              <View style={styles.actions}>
                <NeuButton icon="search" label={t.wallets.fbReview} onPress={handleReview} accessibilityLabel="review transactions" />
                <Pressable
                  onPress={handleSetConfirm}
                  hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                  style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}
                >
                  <Text style={styles.linkFaint}>{t.wallets.fbSetTo.replace('{amount}', computedAmount)}</Text>
                </Pressable>
                <Pressable
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                  style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}
                >
                  <Text style={styles.linkMuted}>{t.wallets.fbNotNow}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.actions}>
                <NeuButton
                  icon="check"
                  label={t.wallets.fbSetTo.replace('{amount}', computedAmount)}
                  onPress={handleSet}
                  accessibilityLabel="set balance"
                />
                <Pressable
                  onPress={handleReview}
                  hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                  style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}
                >
                  <Text style={styles.linkMuted}>{t.wallets.fbReview}</Text>
                </Pressable>
                <Pressable
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                  style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}
                >
                  <Text style={styles.linkMuted}>{t.wallets.fbNotNow}</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </FloatingModal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    scroll: {
      flexShrink: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.xl,
    },
    header: {
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      letterSpacing: -0.4,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.3,
      marginTop: 3,
    },
    card: {
      backgroundColor: C.background,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md + 2,
      paddingVertical: SPACING.sm + 4,
      marginBottom: SPACING.md,
    },
    // ── All-good state ──
    goodCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
    },
    goodText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      lineHeight: 21,
    },
    // ── Summary ──
    sumRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.xs + 2,
      gap: SPACING.md,
    },
    sumLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      flexShrink: 1,
    },
    sumValue: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.2,
    },
    sumDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: withAlpha(C.textPrimary, 0.06),
    },
    // ── Gap line ──
    gapLine: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      lineHeight: 22,
      marginBottom: SPACING.md,
    },
    // ── Breakdown ──
    cardTitle: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.2,
      marginBottom: SPACING.xs + 2,
    },
    bdRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.xs + 1,
      gap: SPACING.md,
    },
    bdLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      flexShrink: 1,
    },
    bdValue: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    // ── Warning tone (bronze, never red) ──
    warnCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      backgroundColor: withAlpha(C.bronze, 0.1),
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      marginBottom: SPACING.sm,
    },
    warnIcon: {
      marginTop: 1,
    },
    warnText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      color: C.bronze,
      fontWeight: TYPOGRAPHY.weight.medium,
      lineHeight: 20,
    },
    hintMuted: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      lineHeight: 18,
      marginBottom: SPACING.md,
    },
    // ── Actions ──
    actions: {
      marginTop: SPACING.xs,
    },
    linkWrap: {
      alignSelf: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm + 2,
      marginTop: SPACING.xs,
    },
    linkPressed: {
      opacity: 0.55,
    },
    linkMuted: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    linkFaint: {
      fontSize: TYPOGRAPHY.size.xs,
      color: withAlpha(C.textMuted, 0.85),
      fontWeight: TYPOGRAPHY.weight.regular,
      letterSpacing: 0.2,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });

export default FixBalanceSheet;
