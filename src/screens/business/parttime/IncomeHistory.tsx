import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { formatDistanceToNow, format } from 'date-fns';
import { useBusinessStore } from '../../../store/businessStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

type FilterTab = 'all' | 'main' | 'side';

const TABS: { label: string; value: FilterTab }[] = [
  { label: 'all', value: 'all' },
  { label: 'main job', value: 'main' },
  { label: 'side income', value: 'side' },
];

const IncomeHistory: React.FC = () => {
  const currency = useSettingsStore((s) => s.currency);
  const { businessTransactions } = useBusinessStore();
  const [filter, setFilter] = useState<FilterTab>('all');

  const filteredIncome = useMemo(() => {
    return businessTransactions
      .filter((t) => {
        if (t.type !== 'income') return false;
        if (filter === 'main') return t.incomeStream === 'main';
        if (filter === 'side') return t.incomeStream === 'side';
        return t.incomeStream === 'main' || t.incomeStream === 'side';
      })
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
  }, [businessTransactions, filter]);

  const getRelativeDate = (date: Date | string) => {
    const d = toDate(date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      return formatDistanceToNow(d, { addSuffix: true });
    }
    return format(d, 'MMM dd');
  };

  const getEmptyText = () => {
    switch (filter) {
      case 'main':
        return 'no main job income logged yet';
      case 'side':
        return 'no side income logged yet';
      default:
        return 'no income logged yet — tap + to get started';
    }
  };

  const renderItem = ({ item }: { item: typeof filteredIncome[0] }) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowAmount}>
          {currency} {item.amount.toLocaleString()}
        </Text>
        {item.note ? (
          <Text style={styles.rowNote} numberOfLines={1}>
            {item.note}
          </Text>
        ) : null}
      </View>
      <Text style={styles.rowStream}>
        {item.incomeStream === 'main' ? 'main job' : 'side income'}
      </Text>
      <Text style={styles.rowDate}>{getRelativeDate(item.date)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.tabBar}>
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
      </View>

      {filteredIncome.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{getEmptyText()}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredIncome}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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

  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.md,
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
  rowAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  rowNote: {
    ...TYPE.muted,
    marginTop: 2,
  },
  rowStream: {
    ...TYPE.muted,
    flex: 1,
    textAlign: 'center',
  },
  rowDate: {
    ...TYPE.muted,
    flex: 1,
    textAlign: 'right',
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

export default IncomeHistory;
