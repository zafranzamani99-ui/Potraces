import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { format } from 'date-fns';
import { Image } from 'expo-image';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import EmptyState from '../common/EmptyState';
import { renderIcon } from '../commitments/CommitmentForm';
import { SharedSubscription } from '../../types';

interface SharedSubscriptionTabProps {
  onPressSub: (sub: SharedSubscription) => void;
  onAddSub: () => void;
}

const SharedSubscriptionTab: React.FC<SharedSubscriptionTabProps> = ({ onPressSub, onAddSub }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const subs = useDebtStore((s) => s.sharedSubscriptions);

  const currentMonth = useMemo(() => format(new Date(), 'yyyy-MM'), []);

  const activeSubs = useMemo(() => subs.filter((s) => s.isActive), [subs]);
  const inactiveSubs = useMemo(() => subs.filter((s) => !s.isActive), [subs]);

  const getCycleSuffix = useCallback((cycle: string) => {
    switch (cycle) {
      case 'quarterly': return t.sharedSubs.perQuarter;
      case 'yearly': return t.sharedSubs.perYear;
      default: return t.sharedSubs.perMonth;
    }
  }, [t]);

  const getMonthProgress = useCallback((sub: SharedSubscription) => {
    const record = sub.monthRecords.find((r) => r.month === currentMonth);
    if (!record) {
      const activeCount = sub.members.filter((m) => m.isActive).length;
      return { paid: 0, total: activeCount, collected: 0, totalAmount: sub.totalAmount };
    }
    const paid = record.payments.filter((p) => p.isPaid).length;
    const collected = record.payments.filter((p) => p.isPaid).reduce((sum, p) => sum + p.amount, 0);
    return { paid, total: record.payments.length, collected, totalAmount: record.totalAmount };
  }, [currentMonth]);

  if (subs.length === 0) {
    return (
      <EmptyState
        icon="i/repeat"
        title={t.sharedSubs.noSharedSubs}
        message={t.sharedSubs.noSharedSubsHint}
        actionLabel={t.sharedSubs.addSharedSub}
        onAction={onAddSub}
      />
    );
  }

  const renderSubCard = (sub: SharedSubscription) => {
    const progress = getMonthProgress(sub);
    const railColor = sub.isActive ? C.accent : C.border;
    const pctWidth = progress.total > 0 ? `${Math.min((progress.paid / progress.total) * 100, 100)}%` as const : '0%' as const;

    return (
      <TouchableOpacity
        key={sub.id}
        style={styles.rowWrap}
        onPress={() => onPressSub(sub)}
        activeOpacity={0.7}
        accessibilityLabel={`${sub.name}, ${progress.paid} of ${progress.total} paid`}
      >
        <View style={[styles.rail, { backgroundColor: railColor }]} />
        <View style={styles.rowBody}>
          <View style={styles.topRow}>
            <View style={styles.iconWrap}>
              {sub.imageUri ? (
                <Image source={{ uri: sub.imageUri }} style={styles.iconImage} />
              ) : sub.iconName ? (
                renderIcon(sub.iconName, 20, C.accent)
              ) : (
                <Text style={styles.iconFallback}>
                  {sub.name ? sub.name.charAt(0).toUpperCase() : '?'}
                </Text>
              )}
            </View>
            <View style={styles.titleWrap}>
              <Text style={styles.title} numberOfLines={1}>{sub.name}</Text>
              <Text style={styles.subtitle}>
                {t.sharedSubs.nMembers.replace('{n}', String(sub.members.filter((m) => m.isActive).length))}
                {' · '}{sub.billingCycle === 'monthly' ? t.sharedSubs.monthly : sub.billingCycle === 'quarterly' ? t.sharedSubs.quarterly : t.sharedSubs.yearly}
                {' · day '}{sub.billingDay}
              </Text>
            </View>
            <Text style={styles.amount}>
              {currency}{sub.totalAmount.toFixed(2)}{getCycleSuffix(sub.billingCycle)}
            </Text>
          </View>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: pctWidth, backgroundColor: C.accent }]} />
            </View>
            <Text style={styles.progressLabel}>
              {t.sharedSubs.paidOf.replace('{paid}', String(progress.paid)).replace('{total}', String(progress.total))}
              {' · '}{format(new Date(), 'MMM yyyy')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
    >
      {activeSubs.map(renderSubCard)}
      {inactiveSubs.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t.sharedSubs.inactive}</Text>
          {inactiveSubs.map(renderSubCard)}
        </>
      )}
    </ScrollView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  listContent: {
    paddingBottom: 100,
  },
  rowWrap: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  rail: {
    width: 3,
  },
  rowBody: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: withAlpha(C.accent, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconImage: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  iconFallback: {
    fontSize: 16,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: 2,
  },
  amount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  progressRow: {
    gap: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: C.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: RADIUS.sm,
  },
  progressLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
});

export default React.memo(SharedSubscriptionTab);
