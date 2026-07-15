import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { differenceInDays } from 'date-fns';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../common/neu';
import { useT } from '../../i18n';
import { getDebtAge } from '../../utils/debtTracking';
import { formatAmount } from '../../utils/formatters';
import { Contact, Debt } from '../../types';

interface DebtGroup {
  contactId: string;
  contactName: string;
  contact: Contact;
  debts: Debt[];
  totalRemaining: number;
}

interface TypeOrStatusConfig {
  color: string;
  label: string;
  value: string;
}

interface DebtRowProps {
  group: DebtGroup;
  selectionMode: 'debt' | 'split' | null;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  enterSelectionMode: (type: 'debt' | 'split', ids: string | string[]) => void;
  toggleSelection: (id: string) => void;
  setDetailGroupId: (id: string | null) => void;
  setDetailDebtId: (id: string | null) => void;
  getTypeConfig: (type: string) => TypeOrStatusConfig;
  getStatusConfig: (status: string) => TypeOrStatusConfig;
  currency: string;
  settledColor: string;
  overdueColor: string;
  highlightId: string | undefined;
  highlightRef: (node: View | null) => void;
}

const DebtRow: React.FC<DebtRowProps> = ({
  group,
  selectionMode,
  selectedIds,
  setSelectedIds,
  enterSelectionMode,
  toggleSelection,
  setDetailGroupId,
  setDetailDebtId,
  getTypeConfig,
  getStatusConfig,
  currency,
  settledColor,
  overdueColor,
  highlightId,
  highlightRef,
}) => {
  const C = useCalm();
  const neu = useNeu(undefined, { faintDark: true });
  const t = useT();
  const styles = React.useMemo(() => makeStyles(C), [C]);

  const isMulti = group.debts.length > 1;
  const inDebtSelection = selectionMode === 'debt';
  const allTheyOwe = group.debts.every((d) => d.type === 'they_owe' && d.status !== 'settled');
  const hasPhone = !!group.contact.phone;

  if (isMulti) {
    // ── Compact group card — tap opens group detail sheet ──
    const iOweDebts = group.debts.filter((d) => d.type === 'i_owe' && d.status !== 'settled');
    const theyOweDebts = group.debts.filter((d) => d.type === 'they_owe' && d.status !== 'settled');
    const iOweSum = iOweDebts.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
    const theyOweSum = theyOweDebts.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
    const isMixed = iOweSum > 0 && theyOweSum > 0;
    const netAmount = Math.abs(iOweSum - theyOweSum);
    const netDirection = iOweSum >= theyOweSum ? 'i_owe' : 'they_owe';
    const primaryType = isMixed ? netDirection : group.debts[0].type;
    const typeConfig = getTypeConfig(primaryType);
    const settledCount = group.debts.filter((d) => d.status === 'settled').length;
    const allSettled = settledCount === group.debts.length;
    const allIOweTotal = group.debts.filter((d) => d.type === 'i_owe').reduce((s, d) => s + d.totalAmount, 0);
    const allTheyOweTotal = group.debts.filter((d) => d.type === 'they_owe').reduce((s, d) => s + d.totalAmount, 0);
    const wasMixed = allIOweTotal > 0 && allTheyOweTotal > 0;
    const groupTotal = wasMixed ? Math.abs(allTheyOweTotal - allIOweTotal) : allIOweTotal + allTheyOweTotal;
    const groupIds = group.debts.map((d) => d.id);
    const allGroupSelected = inDebtSelection && groupIds.every((id) => selectedIds.has(id));
    const someGroupSelected = inDebtSelection && groupIds.some((id) => selectedIds.has(id));
    return (
      <View key={group.contactId} style={[styles.tickerDebtRow, neu.raisedSoft, allGroupSelected && styles.tickerSplitRowSelected]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (inDebtSelection) {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                groupIds.forEach((id) => allGroupSelected ? next.delete(id) : next.add(id));
                return next;
              });
              return;
            }
            setDetailGroupId(group.contactId);
          }}
          onLongPress={() => !inDebtSelection && enterSelectionMode('debt', group.debts.map((d) => d.id))}
          delayLongPress={400}
        >
          <View style={styles.tickerDebtHeaderRow}>
            {inDebtSelection && (
              <View style={[styles.selectionCheckbox, allGroupSelected && styles.selectionCheckboxActive, someGroupSelected && !allGroupSelected && { borderColor: C.accent, backgroundColor: withAlpha(C.accent, 0.3) }, { marginRight: SPACING.xs }]}>
                {allGroupSelected && <Feather name="check" size={14} color={C.onAccent} />}
                {someGroupSelected && !allGroupSelected && <Feather name="minus" size={14} color={C.onAccent} />}
              </View>
            )}
            <View style={[styles.tickerDebtAvatar, neu.well, { backgroundColor: withAlpha(typeConfig.color, 0.12) }]}>
              <Text style={[styles.tickerDebtAvatarText, { color: typeConfig.color }]}>
                {group.contactName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.tickerDebtName} numberOfLines={1}>
              {group.contactName.toLowerCase()}
            </Text>
            <Text style={[styles.tickerDebtTypeChip, { color: typeConfig.color }]}>
              {t.debts.nDebts.replace('{count}', String(group.debts.length))}
            </Text>
            <View style={styles.tickerLeader} />
            <Text style={[styles.tickerSplitAmount, { color: allSettled ? settledColor : typeConfig.color }]}>
              {allSettled ? formatAmount(groupTotal, currency) : isMixed ? formatAmount(netAmount, currency) : formatAmount(group.totalRemaining, currency)}
            </Text>
            <Feather name="chevron-right" size={14} color={C.textMuted} style={{ marginLeft: 4 }} />
          </View>
          <Text style={styles.tickerSplitFooter} numberOfLines={1}>
            {allSettled
              ? wasMixed
                ? t.debts.settledUpNet.replace('{amount}', formatAmount(groupTotal, currency))
                : `${group.debts[0].type === 'i_owe' ? t.debts.iOweLower : t.debts.theyOweLower} · ${t.debts.settledLower} · ${formatAmount(groupTotal, currency)} ${t.debts.totalSuffix}`
              : isMixed ? `${t.debts.netPrefix} ${netDirection === 'i_owe' ? t.debts.iOweLower : t.debts.theyOweLower}` : `${primaryType === 'i_owe' ? t.debts.iOweLower : t.debts.theyOweLower}`}
            {!allSettled && settledCount > 0 ? ` · ${t.debts.nSettled.replace('{count}', String(settledCount))}` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Single debt card (unchanged layout) ──
  const debt = group.debts[0];
  const typeConfig = getTypeConfig(debt.type);
  const statusConfig = getStatusConfig(debt.status);
  const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
  const paidPct = debt.totalAmount > 0 ? (debt.paidAmount / debt.totalAmount) * 100 : 0;
  const isSelected = inDebtSelection && selectedIds.has(debt.id);

  let debtFooterText = '';
  let debtFooterColor: string | null = null;
  if (debt.status === 'settled') {
    const dir = debt.type === 'i_owe' ? t.debts.iOweLower : t.debts.theyOweLower;
    debtFooterText = `${dir} · ${t.debts.settledLower} · ${formatAmount(debt.totalAmount, currency)} ${t.debts.totalSuffix}`;
    debtFooterColor = settledColor;
  } else if (debt.dueDate) {
    const dueD = new Date(debt.dueDate);
    if (!isNaN(dueD.getTime())) {
      const daysUntil = differenceInDays(dueD, new Date());
      if (daysUntil < 0) {
        debtFooterText = `${t.debts.amountLeft.replace('{amount}', formatAmount(remaining, currency))} · ${t.debts.overdueDays.replace('{n}', String(Math.abs(daysUntil)))}`;
        debtFooterColor = overdueColor;
      } else if (daysUntil === 0) {
        debtFooterText = `${t.debts.amountLeft.replace('{amount}', formatAmount(remaining, currency))} · ${t.debts.dueToday}`;
        debtFooterColor = C.gold;
      } else if (daysUntil <= 3) {
        debtFooterText = `${t.debts.amountLeft.replace('{amount}', formatAmount(remaining, currency))} · ${t.debts.dueInDays.replace('{n}', String(daysUntil))}`;
        debtFooterColor = C.gold;
      } else {
        debtFooterText = `${t.debts.amountLeft.replace('{amount}', formatAmount(remaining, currency))} · ${t.debts.dueInDays.replace('{n}', String(daysUntil))}`;
      }
    } else {
      debtFooterText = `${t.debts.amountLeft.replace('{amount}', formatAmount(remaining, currency))} · ${getDebtAge(debt.createdAt)}`;
    }
  } else {
    const days = differenceInDays(new Date(), new Date(debt.createdAt));
    debtFooterText = `${t.debts.amountLeft.replace('{amount}', formatAmount(remaining, currency))} · ${getDebtAge(debt.createdAt)}`;
    if (days >= 30) debtFooterColor = overdueColor;
    else if (days >= 7) debtFooterColor = C.gold;
  }

  return (
    <View key={group.contactId} ref={highlightId === debt.id ? highlightRef : undefined}>
    <View style={[
      styles.tickerDebtRow,
      neu.raisedSoft,
      isSelected && styles.tickerSplitRowSelected,
    ]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          if (inDebtSelection) { toggleSelection(debt.id); return; }
          setDetailDebtId(debt.id);
        }}
        onLongPress={() => !inDebtSelection && enterSelectionMode('debt', debt.id)}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={t.debts.a11yDebtRow.replace('{name}', debt.contact.name).replace('{amount}', formatAmount(remaining, currency)).replace('{type}', typeConfig.label)}
      >
        <View style={styles.tickerDebtHeaderRow}>
          {inDebtSelection && (
            <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive, { marginRight: SPACING.xs }]}>
              {isSelected && <Feather name="check" size={14} color={C.onAccent} />}
            </View>
          )}
          <View style={[styles.tickerDebtAvatar, neu.well, { backgroundColor: withAlpha(typeConfig.color, 0.12) }]}>
            <Text style={[styles.tickerDebtAvatarText, { color: typeConfig.color }]}>
              {debt.contact.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.tickerDebtName} numberOfLines={1}>
            {debt.contact.name.toLowerCase()}
          </Text>
          <Text style={[styles.tickerDebtTypeChip, { color: typeConfig.color }]}>
            {debt.type === 'i_owe' ? t.debts.iOweLower : t.debts.theyOweLower}
          </Text>
          <View style={styles.tickerLeader} />
          <Text style={[styles.tickerSplitAmount, { color: debt.status === 'settled' ? settledColor : typeConfig.color }]}>
            {debt.status === 'settled' ? formatAmount(debt.totalAmount, currency) : formatAmount(remaining, currency)}
          </Text>
          {!inDebtSelection && (
            <Feather
              name="chevron-right"
              size={14}
              color={C.textMuted}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>

        {debt.description ? (
          <Text style={styles.tickerDebtDesc} numberOfLines={1}>
            {debt.description.toLowerCase()}
          </Text>
        ) : null}

        {debt.status !== 'settled' && debt.paidAmount > 0 && (
          <View style={[styles.tickerProgressTrack, { marginTop: SPACING.xs }]}>
            <View style={[styles.tickerProgressFill, { width: `${paidPct}%`, backgroundColor: statusConfig.color }]} />
          </View>
        )}
        {debt.status === 'settled' && (
          <View style={[styles.tickerProgressTrack, { marginTop: SPACING.xs }]}>
            <View style={[styles.tickerProgressFill, { width: '100%', backgroundColor: settledColor }]} />
          </View>
        )}

        <Text
          style={[
            styles.tickerSplitFooter,
            debtFooterColor ? { color: debtFooterColor, fontWeight: TYPOGRAPHY.weight.semibold } : null,
            { marginTop: SPACING.xs },
          ]}
          numberOfLines={1}
        >
          {debtFooterText}
        </Text>
      </TouchableOpacity>

    </View>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  tickerSplitRowSelected: {
    borderColor: C.accent,
    borderWidth: 1.5,
  },
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
  tickerDebtRow: {
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  tickerDebtHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  tickerDebtAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  tickerDebtAvatarText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  tickerDebtName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.1,
    flexShrink: 0,
    maxWidth: '40%',
  },
  tickerDebtTypeChip: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
    fontStyle: 'italic',
  },
  tickerDebtDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 2,
    marginLeft: 30, // align with name (after avatar)
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

export default React.memo(DebtRow);
