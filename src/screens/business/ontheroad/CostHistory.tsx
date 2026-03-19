import React, { useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { formatDistanceToNow, format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useBusinessStore } from '../../../store/businessStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { RootStackParamList, CostCategory } from '../../../types';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';

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

type FilterTab = 'all' | CostCategory;

const TABS: { label: string; value: FilterTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Petrol', value: 'petrol' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Data', value: 'data' },
  { label: 'Toll', value: 'toll' },
  { label: 'Parking', value: 'parking' },
  { label: 'Insurance', value: 'insurance' },
  { label: 'Other', value: 'other' },
];

const CostHistory: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const route = useRoute<RouteProp<RootStackParamList, 'OnTheRoadCostHistory'>>();
  const currency = useSettingsStore((s) => s.currency);
  const { businessTransactions } = useBusinessStore();
  const initialFilter = (route.params?.filter as FilterTab) || 'all';
  const [filter, setFilter] = useState<FilterTab>(initialFilter === 'all' ? 'all' : initialFilter);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const filteredEntries = useMemo(() => {
    return businessTransactions
      .filter((t) => {
        if (!t.roadTransactionType) return false;
        if (filter === 'all') return true; // show all road txns (earnings + costs)
        // For specific category filters, show only costs of that category
        if (t.roadTransactionType !== 'cost') return false;
        return t.costCategory === filter;
      })
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
  }, [businessTransactions, filter]);

  const monthTotal = useMemo(() => {
    return filteredEntries
      .filter((t) => {
        if (t.roadTransactionType !== 'cost') return false;
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

  const getCategoryDisplay = (tx: typeof businessTransactions[0]) => {
    if (tx.roadTransactionType === 'earning') {
      return { emoji: '\u{1F4B0}', label: 'earned' + (tx.platform ? ` (${tx.platform})` : '') };
    }
    const cat = tx.costCategory || 'other';
    const label = cat === 'other' && tx.costCategoryOther ? tx.costCategoryOther : cat;
    return { emoji: CATEGORY_EMOJIS[cat] || '\u270F\uFE0F', label };
  };

  const getEmptyText = () => {
    if (filter === 'all') return 'no costs logged yet — that\'s fine, log them when they happen';
    return `no ${filter} costs logged`;
  };

  const renderItem = ({ item }: { item: typeof filteredEntries[0] }) => {
    const display = getCategoryDisplay(item);
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowCategoryLine}>
            {display.emoji} {display.label}
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
            item.roadTransactionType === 'earning' && styles.rowAmountEarning,
          ]}
        >
          {item.roadTransactionType === 'earning' ? '+' : '\u2212'}
          {currency} {item.amount.toLocaleString()}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Summary */}
      <Text style={styles.summaryText}>
        total costs this month: {currency} {Math.round(monthTotal).toLocaleString()}
      </Text>

      {/* Filter tabs — horizontally scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScrollView}
        contentContainerStyle={styles.tabBar}
      >
        {TABS.map((tab) => (
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

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  summaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
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
    borderBottomColor: C.border,
  },
  tab: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  tabTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: SPACING.lg,
    right: SPACING.lg,
    height: 2,
    backgroundColor: C.bronze,
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
    borderBottomColor: C.border,
  },
  rowLeft: {
    flex: 1,
  },
  rowCategoryLine: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
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
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  rowAmountEarning: {
    color: C.textSecondary,
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
    color: C.textSecondary,
    textAlign: 'center',
  },
});

export default CostHistory;
