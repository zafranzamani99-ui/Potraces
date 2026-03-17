import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { formatDistanceToNow, format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { useMixedStore } from '../../../store/mixedStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const CATEGORY_EMOJIS: Record<string, string> = {
  petrol: '\u26FD',
  maintenance: '\u{1F527}',
  data: '\u{1F4F1}',
  toll: '\u{1F6E3}\uFE0F',
  parking: '\u{1F17F}\uFE0F',
  insurance: '\u{1F6E1}\uFE0F',
  other: '\u270F\uFE0F',
};

const StreamHistory: React.FC = () => {
  const currency = useSettingsStore((s) => s.currency);
  const { businessTransactions } = useBusinessStore();
  const { mixedDetails } = useMixedStore();
  const [filter, setFilter] = useState<string>('all');

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Build dynamic tabs: All + each stream + optional Costs
  const tabs = useMemo(() => {
    const result: { label: string; value: string }[] = [{ label: 'All', value: 'all' }];
    for (const stream of mixedDetails.streams) {
      result.push({ label: stream, value: stream });
    }
    if (mixedDetails.hasRoadCosts) {
      result.push({ label: 'Costs', value: '__costs__' });
    }
    return result;
  }, [mixedDetails.streams, mixedDetails.hasRoadCosts]);

  const filteredEntries = useMemo(() => {
    return businessTransactions
      .filter((t) => {
        // Only show mixed-relevant transactions
        if (!t.streamLabel && !t.roadTransactionType) return false;

        if (filter === 'all') return true;
        if (filter === '__costs__') return t.roadTransactionType === 'cost';
        // Filter by stream
        return t.streamLabel === filter;
      })
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
  }, [businessTransactions, filter]);

  const monthTotal = useMemo(() => {
    if (filter === '__costs__') {
      return filteredEntries
        .filter((t) => isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd }))
        .reduce((sum, t) => sum + t.amount, 0);
    }
    // For income filters, show income total for the month
    return filteredEntries
      .filter((t) => {
        if (t.roadTransactionType === 'cost') return false;
        return isWithinInterval(toDate(t.date), { start: monthStart, end: monthEnd });
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredEntries]);

  const getRelativeDate = (date: Date | string) => {
    const d = toDate(date);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      return formatDistanceToNow(d, { addSuffix: true });
    }
    return format(d, 'MMM dd');
  };

  const getDisplay = (tx: typeof businessTransactions[0]) => {
    if (tx.roadTransactionType === 'cost') {
      const cat = tx.costCategory || 'other';
      const label = cat === 'other' && tx.costCategoryOther ? tx.costCategoryOther : cat;
      return { emoji: CATEGORY_EMOJIS[cat] || '\u270F\uFE0F', label };
    }
    return { emoji: '', label: tx.streamLabel || 'income' };
  };

  const getSummaryLabel = () => {
    if (filter === '__costs__') return 'total costs this month';
    if (filter === 'all') return 'total income this month';
    return `${filter} this month`;
  };

  const getEmptyText = () => {
    if (filter === 'all') return 'nothing logged yet.';
    if (filter === '__costs__') return 'no costs logged yet.';
    return `no ${filter} income logged yet.`;
  };

  const renderItem = ({ item }: { item: typeof filteredEntries[0] }) => {
    const display = getDisplay(item);
    const isCost = item.roadTransactionType === 'cost';
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowCategoryLine}>
            {display.emoji ? `${display.emoji} ` : ''}{display.label}
          </Text>
          {item.note ? (
            <Text style={styles.rowNote} numberOfLines={1}>
              {item.note}
            </Text>
          ) : null}
          <Text style={styles.rowDate}>{getRelativeDate(item.date)}</Text>
        </View>
        <Text
          style={[
            styles.rowAmount,
            isCost && styles.rowAmountCost,
          ]}
        >
          {isCost ? '\u2212' : '+'}
          {currency} {item.amount.toLocaleString()}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Summary */}
      <Text style={styles.summaryText}>
        {getSummaryLabel()}: {currency} {Math.round(monthTotal).toLocaleString()}
      </Text>

      {/* Filter tabs — horizontally scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScrollView}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={styles.tab}
            onPress={() => setFilter(tab.value)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                filter === tab.value && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
            {filter === tab.value && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filteredEntries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{getEmptyText()}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },

  summaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // Tabs
  tabScrollView: {
    maxHeight: 48,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  tab: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  tabTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: SPACING.lg,
    right: SPACING.lg,
    height: 2,
    backgroundColor: CALM.bronze,
    borderRadius: 1,
  },

  // List
  listContent: {
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING['3xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  rowLeft: {
    flex: 1,
  },
  rowCategoryLine: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  rowNote: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },
  rowDate: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },
  rowAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  rowAmountCost: {
    color: CALM.textSecondary,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['3xl'],
  },
  emptyText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    textAlign: 'center',
  },
});

export default StreamHistory;
