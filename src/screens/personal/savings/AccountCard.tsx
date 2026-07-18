import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, formatDistanceToNow, addMonths, differenceInDays } from 'date-fns';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useNeu } from '../../../components/common/neu';
import CategoryIcon from '../../../components/common/CategoryIcon';
import Sparkline from '../../../components/common/Sparkline';
import { useT } from '../../../i18n';
import { lightTap } from '../../../services/haptics';
import { SavingsAccount } from '../../../types';
import { AccountDerived } from './savingsMath';

interface Props {
  account: SavingsAccount;
  derived: AccountDerived;
  currency: string;
  onEdit: (a: SavingsAccount) => void;
  onUpdate: (a: SavingsAccount) => void;
  onHistory: (a: SavingsAccount) => void;
}

const toDate = (v: Date | string | number): Date => (v instanceof Date ? v : new Date(v));

const AccountCard: React.FC<Props> = ({ account, derived, currency, onEdit, onUpdate, onHistory }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu();
  const styles = useMemo(() => makeStyles(C), [C]);

  const { typeInfo, gain, returnPct, goalEtaMonths, projectedAnnual } = derived;
  const positive = gain >= 0;
  const accentPos = C.positive;
  const fmt = (v: number) => `${currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const last = account.history.length ? account.history[account.history.length - 1] : null;
  const lastDate = last ? toDate(last.date) : toDate(account.createdAt);
  const staleDays = differenceInDays(new Date(), lastDate);
  const isStale = staleDays >= 7;
  const spark = account.history.slice(-12).map((h) => h.value);
  const targetPct = account.target && account.target > 0
    ? Math.min(100, Math.round((account.currentValue / account.target) * 100)) : null;
  const etaLabel = goalEtaMonths != null ? format(addMonths(new Date(), goalEtaMonths), 'MMM yyyy') : null;
  const rateLine = account.annualRate ? `${typeInfo.name} · ${account.annualRate}% p.a.` : typeInfo.name;

  return (
    <View style={[styles.card, neu.raisedSoft]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconWell, neu.well, { backgroundColor: withAlpha(typeInfo.color, 0.14) }]}>
          {/* Brand-logo tiles render a touch larger than glyphs so they fill the well */}
          <CategoryIcon icon={typeInfo.icon} size={typeInfo.icon.startsWith('logo/') ? 30 : 20} color={typeInfo.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={1.3}>{account.name}</Text>
          <Text style={styles.typeLine} numberOfLines={1}>{rateLine}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { lightTap(); onEdit(account); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t.savings.editAccount}
        >
          <Feather name="more-horizontal" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Value + return pill */}
      <View style={styles.valueRow}>
        <Text style={styles.value} maxFontSizeMultiplier={1.3}>{fmt(account.currentValue)}</Text>
        <View style={[styles.retPill, { backgroundColor: withAlpha(positive ? accentPos : C.neutral, 0.14) }]}>
          {!positive && <Feather name="trending-down" size={11} color={C.neutral} style={styles.retPillIcon} />}
          <Text style={[styles.retPillText, { color: positive ? accentPos : C.neutral }]} maxFontSizeMultiplier={1.3}>
            {positive ? '+' : ''}{returnPct.toFixed(1)}%
          </Text>
        </View>
      </View>
      <View style={styles.subRow}>
        <Text style={styles.subMuted}>{t.savings.putIn.replace('{amount}', fmt(account.initialInvestment))}</Text>
        <Text style={[styles.subGain, { color: positive ? accentPos : C.neutral }]}>
          {positive ? '+' : ''}{fmt(gain)}
        </Text>
      </View>

      {/* Sparkline */}
      {spark.length >= 2 && (
        <View style={styles.spark}>
          <Sparkline data={spark} height={40} color={positive ? accentPos : C.neutral} showDot filled strokeWidth={2} />
        </View>
      )}

      {/* Projected earnings — label left, emphasized amount right */}
      {projectedAnnual != null && projectedAnnual > 0 && (
        <View style={styles.earnRow}>
          <View style={styles.earnIcon}><Feather name="sun" size={12} color={C.gold} /></View>
          <Text style={styles.earnLabel} numberOfLines={1}>{t.savings.estEarningsThisYear.replace(/\n/g, ' ')}</Text>
          <Text style={styles.earnAmount}>{fmt(projectedAnnual)}</Text>
        </View>
      )}

      {/* Goal progress */}
      {targetPct != null && account.target ? (
        <View style={styles.goalWrap}>
          <View style={styles.goalHeader}>
            <Text style={styles.goalLabel} numberOfLines={1}>
              {(account.goalName || t.savings.targetLabel)} · {fmt(account.target)}
            </Text>
            <Text style={styles.goalPct}>{targetPct}%</Text>
          </View>
          <View style={styles.track}><View style={[styles.trackFill, { width: `${targetPct}%` }]} /></View>
          {etaLabel && (
            <Text style={styles.eta}>{t.savings.atThisPace.replace('{when}', etaLabel)}</Text>
          )}
        </View>
      ) : null}

      {/* Footer */}
      <View style={styles.footer}>
        <View
          style={styles.when}
          accessibilityLabel={isStale ? t.savings.notUpdatedDays.replace('{name}', account.name).replace('{days}', String(staleDays)) : undefined}
        >
          {isStale ? <View style={styles.staleDot} /> : <Feather name="clock" size={12} color={C.textMuted} />}
          {isStale && <Text style={styles.staleLabel}>{t.savings.noUpdates}</Text>}
          <Text style={styles.whenText} numberOfLines={1}>{formatDistanceToNow(lastDate, { addSuffix: true })}</Text>
        </View>
        <Pressable onPress={() => { lightTap(); onUpdate(account); }} style={[styles.btn, neu.raised]} accessibilityRole="button" accessibilityLabel={t.savings.update}>
          <Feather name="refresh-cw" size={13} color={C.accent} />
          <Text style={[styles.btnText, { color: C.accent }]}>{t.savings.update}</Text>
        </Pressable>
        <Pressable onPress={() => { lightTap(); onHistory(account); }} style={[styles.btn, neu.raised]} accessibilityRole="button" accessibilityLabel={t.savings.history}>
          <Feather name="bar-chart-2" size={13} color={C.textSecondary} />
          <Text style={[styles.btnText, { color: C.textSecondary }]}>{t.savings.history}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  card: { backgroundColor: C.background, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWell: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.2 },
  typeLine: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', color: C.textMuted, marginTop: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14 },
  value: { fontSize: TYPOGRAPHY.size['2xl'], fontWeight: '700', color: C.textPrimary, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  retPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full },
  retPillIcon: { marginRight: 3 },
  retPillText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  subMuted: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontVariant: ['tabular-nums'] },
  subGain: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
  spark: { marginTop: 12, marginHorizontal: -2 },
  earnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: withAlpha(C.gold, 0.09), borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(C.gold, 0.18) },
  earnIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(C.gold, 0.15) },
  earnLabel: { flex: 1, fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, fontWeight: '600' },
  earnAmount: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontWeight: '700', fontVariant: ['tabular-nums'] },
  goalWrap: { marginTop: 13 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  goalLabel: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', color: C.textSecondary, flex: 1, marginRight: 8 },
  goalPct: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', color: C.accent, fontVariant: ['tabular-nums'] },
  track: { height: 7, borderRadius: RADIUS.full, backgroundColor: C.pillBg, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: RADIUS.full, backgroundColor: C.accent },
  eta: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 6, fontWeight: '500' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  when: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  staleDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.gold },
  staleLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.gold, fontWeight: '700' },
  whenText: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '600', flexShrink: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: C.background },
  btnText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700' },
});

export default React.memo(AccountCard);
