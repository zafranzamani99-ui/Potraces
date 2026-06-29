import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import Card from '../common/Card';
import DebtSegmentedControl from './DebtSegmentedControl';
import { SplitExpense } from '../../types';
import type { SplitTab } from '../../screens/shared/debt/useDebtFilters';
import { Feather } from '@expo/vector-icons';

interface SplitBuckets {
  waiting: SplitExpense[];
  youOwe: SplitExpense[];
  settled: SplitExpense[];
}

interface SplitTabHeaderProps {
  splitTab: SplitTab;
  setSplitTab: (tab: SplitTab) => void;
  selectionMode: 'debt' | 'split' | null;
  exitSelectionMode: () => void;
  splitBuckets: SplitBuckets;
  debtsShowArchive: boolean;
  archiveSplitCount: number;
  draftSplitCount: number;
  waitingTotal: number;
  youOweTotal: number;
  settledTotal: number;
  currency: string;
  theyOweColor: string;
  iOweColor: string;
  settledColor: string;
}

const SplitTabHeader: React.FC<SplitTabHeaderProps> = ({
  splitTab,
  setSplitTab,
  selectionMode,
  exitSelectionMode,
  splitBuckets,
  debtsShowArchive,
  archiveSplitCount,
  draftSplitCount,
  waitingTotal,
  youOweTotal,
  settledTotal,
  currency,
  theyOweColor,
  iOweColor,
  settledColor,
}) => {
  const C = useCalm();
  const styles = React.useMemo(() => makeStyles(C), [C]);

  return (
    <>
      {/* Segmented control — 3 emotional buckets + optional archive */}
      <DebtSegmentedControl
        tabs={[
          { key: 'waiting' as const, label: 'waiting on', count: splitBuckets.waiting.length, color: theyOweColor },
          { key: 'youOwe' as const,  label: 'you owe',    count: splitBuckets.youOwe.length,  color: iOweColor    },
          { key: 'settled' as const, label: 'settled',    count: splitBuckets.settled.length, color: settledColor },
          ...(debtsShowArchive ? [{ key: 'archive' as const, label: 'archive', count: archiveSplitCount, color: C.bronze }] : []),
        ]}
        active={splitTab as 'waiting' | 'youOwe' | 'settled' | 'archive'}
        itemNoun="split"
        onSelect={(key) => {
          if (selectionMode) exitSelectionMode();
          if (splitTab !== key) setSplitTab(key);
        }}
      >
        {draftSplitCount > 0 && (
          <TouchableOpacity
            style={styles.draftBookmark}
            onPress={() => { exitSelectionMode(); setSplitTab('drafts'); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${draftSplitCount} ${draftSplitCount === 1 ? 'draft' : 'drafts'}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="bookmark" size={14} color={C.bronze} />
            <Text style={styles.draftBookmarkCount}>{draftSplitCount}</Text>
          </TouchableOpacity>
        )}
      </DebtSegmentedControl>

      {/* Hero card — one confident number per bucket */}
      <Card style={styles.splitHeroCard}>
        {splitTab === 'waiting' && (
          <>
            <Text style={styles.splitHeroLabel}>you're owed back</Text>
            <Text style={[styles.splitHeroAmount, { color: theyOweColor }]}>
              {currency} {waitingTotal.toFixed(2)}
            </Text>
            <Text style={styles.splitHeroSub}>
              {splitBuckets.waiting.length === 0
                ? "nothing pending — you're clean"
                : `across ${splitBuckets.waiting.length} ${splitBuckets.waiting.length === 1 ? 'split' : 'splits'}`}
            </Text>
          </>
        )}
        {splitTab === 'youOwe' && (
          <>
            <Text style={styles.splitHeroLabel}>you owe</Text>
            <Text style={[styles.splitHeroAmount, { color: iOweColor }]}>
              {currency} {youOweTotal.toFixed(2)}
            </Text>
            <Text style={styles.splitHeroSub}>
              {splitBuckets.youOwe.length === 0
                ? "you don't owe anyone — living free"
                : `across ${splitBuckets.youOwe.length} ${splitBuckets.youOwe.length === 1 ? 'split' : 'splits'}`}
            </Text>
          </>
        )}
        {splitTab === 'settled' && (
          <>
            <Text style={styles.splitHeroLabel}>all squared up</Text>
            <Text style={[styles.splitHeroAmount, { color: settledColor }]}>
              {currency} {settledTotal.toFixed(2)}
            </Text>
            <Text style={styles.splitHeroSub}>
              {splitBuckets.settled.length === 0
                ? "settled splits land here when everyone's paid up"
                : `${splitBuckets.settled.length} done · everyone paid up`}
            </Text>
          </>
        )}
      </Card>
    </>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  draftBookmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: withAlpha(C.bronze, 0.1),
    borderRadius: RADIUS.full,
    minHeight: 36,
  },
  draftBookmarkCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  splitHeroCard: {
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  splitHeroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
    marginBottom: 4,
  },
  splitHeroAmount: {
    fontSize: 32,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  splitHeroSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
});

export default SplitTabHeader;
