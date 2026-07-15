import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { differenceInDays } from 'date-fns';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SPLIT_METHODS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../common/neu';
import { useT } from '../../i18n';
import { formatAmount } from '../../utils/formatters';
import { SplitExpense } from '../../types';
import type { SplitTab } from '../../screens/shared/debt/useDebtFilters';

interface SplitRowProps {
  split: SplitExpense;
  splitTab: SplitTab;
  selectionMode: 'debt' | 'split' | null;
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  enterSelectionMode: (type: 'debt' | 'split', ids: string | string[]) => void;
  openDraftInWizard: (draft: SplitExpense) => void;
  setSelectedSplit: React.Dispatch<React.SetStateAction<SplitExpense | null>>;
  setSplitDetailVisible: React.Dispatch<React.SetStateAction<boolean>>;
  currency: string;
  settledColor: string;
  iOweColor: string;
  theyOweColor: string;
  overdueColor: string;
}

const SplitRow: React.FC<SplitRowProps> = ({
  split,
  splitTab,
  selectionMode,
  selectedIds,
  toggleSelection,
  enterSelectionMode,
  openDraftInWizard,
  setSelectedSplit,
  setSplitDetailVisible,
  currency,
  settledColor,
  iOweColor,
  theyOweColor,
  overdueColor,
}) => {
  const C = useCalm();
  const neu = useNeu(undefined, { faintDark: true });
  const t = useT();
  const styles = React.useMemo(() => makeStyles(C), [C]);

  const isDraft = split.status === 'draft';
  const methodConfig = SPLIT_METHODS.find((m) => m.value === split.splitMethod);
  const paidCount = split.participants.filter((p) => p.isPaid).length;
  const totalCount = split.participants.length;
  const isSettled = !isDraft && paidCount === totalCount;
  // Bucket-driven left-rail color so the row's identity matches the active tab.
  const railColor = isDraft
    ? C.bronze
    : isSettled
    ? settledColor
    : splitTab === 'youOwe'
    ? iOweColor
    : theyOweColor;
  const draftAssigned = isDraft ? split.items.filter((item) => item.assignedTo.length > 0).length : 0;

  const isSelected = selectionMode === 'split' && selectedIds.has(split.id);
  const inSplitSelection = selectionMode === 'split';

  // ── B "ticker tape" — outline card, title + amount on a single line, mini progress + status below
  const paidAmount = split.participants.reduce((sum, p) => sum + (p.isPaid ? p.amount : 0), 0);
  const paidPct = split.totalAmount > 0 ? (paidAmount / split.totalAmount) * 100 : 0;
  const leftAmount = Math.max(0, split.totalAmount - paidAmount);
  let footerText = '';
  let footerColor: string | null = null;
  if (isDraft) {
    footerText = t.debts.draftItemsAssigned.replace('{assigned}', String(draftAssigned)).replace('{total}', String(split.items.length));
  } else {
    const dueRaw = (split as any).dueDate;
    const dueD = dueRaw ? new Date(dueRaw) : null;
    if (dueD && !isNaN(dueD.getTime()) && !isSettled) {
      const daysUntil = differenceInDays(dueD, new Date());
      if (daysUntil < 0) {
        footerText = `${formatAmount(leftAmount, currency)} left · overdue ${Math.abs(daysUntil)}d`;
        footerColor = overdueColor;
      } else if (daysUntil === 0) {
        footerText = `${formatAmount(leftAmount, currency)} left · due today`;
        footerColor = C.gold;
      } else if (daysUntil <= 3) {
        footerText = `${formatAmount(leftAmount, currency)} left · due in ${daysUntil}d`;
        footerColor = C.gold;
      } else {
        footerText = `${formatAmount(leftAmount, currency)} left · ${t.sharedSubs.unpaidCount.replace('{n}', String(totalCount - paidCount))}`;
      }
    } else if (isSettled) {
      footerText = t.debts.settledEveryonePaid;
      footerColor = settledColor;
    } else {
      footerText = `${formatAmount(leftAmount, currency)} left · ${t.sharedSubs.unpaidCount.replace('{n}', String(totalCount - paidCount))}`;
    }
  }

  return (
    <TouchableOpacity
      key={split.id}
      activeOpacity={0.7}
      style={[
        styles.tickerSplitRow,
        neu.raisedSoft,
        isSelected && styles.tickerSplitRowSelected,
      ]}
      onPress={() => {
        if (inSplitSelection) { toggleSelection(split.id); return; }
        if (isDraft) { openDraftInWizard(split); return; }
        setSelectedSplit(split); setSplitDetailVisible(true);
      }}
      onLongPress={() => !inSplitSelection && enterSelectionMode('split', split.id)}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${split.description}, ${formatAmount(split.totalAmount, currency)}, ${footerText}`}
    >
      {/* Top header line — title left, dotted leader, amount right */}
      <View style={styles.tickerSplitHeaderRow}>
        {inSplitSelection && (
          <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive, { marginRight: SPACING.sm }]}>
            {isSelected && <Feather name="check" size={14} color={C.onAccent} />}
          </View>
        )}
        <Text style={styles.tickerSplitTitle} numberOfLines={1}>
          {split.description}
        </Text>
        <View style={styles.tickerLeader} />
        <Text style={styles.tickerSplitAmount}>
          {formatAmount(split.totalAmount, currency)}
        </Text>
      </View>

      {/* Mini progress bar — inline, sky for paid portion */}
      {!isDraft && (
        <View style={styles.tickerProgressTrack}>
          <View
            style={[
              styles.tickerProgressFill,
              { width: `${paidPct}%`, backgroundColor: railColor },
            ]}
          />
        </View>
      )}

      {/* Status footer — single line: "RM X left · status" */}
      <Text
        style={[
          styles.tickerSplitFooter,
          footerColor ? { color: footerColor, fontWeight: TYPOGRAPHY.weight.semibold } : null,
        ]}
        numberOfLines={1}
      >
        {footerText}
      </Text>
    </TouchableOpacity>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  tickerSplitRow: {
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  tickerSplitRowSelected: {
    borderColor: C.accent,
    borderWidth: 1.5,
  },
  tickerSplitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
  },
  tickerSplitTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  // Dotted leader between title and amount — gives the receipt/ticker feel
  tickerLeader: {
    flex: 1,
    height: 1,
    borderBottomWidth: 1,
    borderStyle: 'dotted',
    borderColor: withAlpha(C.textPrimary, 0.15),
    marginBottom: 4,
  },
  tickerSplitAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  tickerProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06),
    overflow: 'hidden',
  },
  tickerProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  tickerSplitFooter: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  selectionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  selectionCheckboxActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
});

export default React.memo(SplitRow);
