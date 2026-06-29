import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import type { DebtFilter, DebtTypeFilter, DebtSort } from '../../screens/shared/debt/useDebtFilters';

type TabType = 'debts' | 'splits' | 'shared';

interface BalanceSummary {
  youOwe: number;
  owedToYou: number;
  collected: number;
  paid: number;
}

interface DebtScreenHeaderProps {
  // balance hero
  balanceSummary: BalanceSummary;
  currency: string;
  iOweColor: string;
  theyOweColor: string;
  settledColor: string;
  debtTypeFilter: DebtTypeFilter;
  setDebtTypeFilter: (v: DebtTypeFilter) => void;
  debtFilter: DebtFilter;
  setDebtFilter: (v: DebtFilter) => void;
  // search bar
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  debtSort: DebtSort;
  splitSort: DebtSort;
  setSortModalVisible: (v: boolean) => void;
  // tab toggle
  activeTab: TabType;
  setActiveTab: (v: TabType) => void;
  selectionMode: 'debt' | 'split' | null;
  exitSelectionMode: () => void;
  modeDebtsCount: number;
  modeSplitsCount: number;
  activeSharedSubsCount: number;
}

const DebtScreenHeader: React.FC<DebtScreenHeaderProps> = ({
  balanceSummary,
  currency,
  iOweColor,
  theyOweColor,
  settledColor,
  debtTypeFilter,
  setDebtTypeFilter,
  debtFilter,
  setDebtFilter,
  searchQuery,
  setSearchQuery,
  debtSort,
  splitSort,
  setSortModalVisible,
  activeTab,
  setActiveTab,
  selectionMode,
  exitSelectionMode,
  modeDebtsCount,
  modeSplitsCount,
  activeSharedSubsCount,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = React.useMemo(() => makeStyles(C), [C]);

  return (
    <>
      {/* Balance Summary */}
      <View style={styles.heroRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            setDebtTypeFilter(debtTypeFilter === 'i_owe' ? null : 'i_owe');
            setDebtFilter(debtFilter === 'pending' ? null : 'pending');
          }}
          style={[
            styles.heroTile,
            { backgroundColor: withAlpha(iOweColor, 0.06) },
            debtTypeFilter === 'i_owe' && { backgroundColor: withAlpha(iOweColor, 0.14) },
          ]}
        >
          <Text style={styles.heroTileLabel}>{t.debts.youOwe}</Text>
          <Text style={[styles.heroTileAmount, { color: iOweColor }]}>
            {currency} {balanceSummary.youOwe.toFixed(2)}
          </Text>
          {balanceSummary.paid > 0 && (
            <Text style={[styles.heroTileSub, { color: settledColor }]}>
              {balanceSummary.paid.toFixed(2)} paid
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            setDebtTypeFilter(debtTypeFilter === 'they_owe' ? null : 'they_owe');
            setDebtFilter(debtFilter === 'pending' ? null : 'pending');
          }}
          style={[
            styles.heroTile,
            { backgroundColor: withAlpha(theyOweColor, 0.06) },
            debtTypeFilter === 'they_owe' && { backgroundColor: withAlpha(theyOweColor, 0.14) },
          ]}
        >
          <Text style={styles.heroTileLabel}>{t.debts.owedToYou}</Text>
          <Text style={[styles.heroTileAmount, { color: theyOweColor }]}>
            {currency} {balanceSummary.owedToYou.toFixed(2)}
          </Text>
          {balanceSummary.collected > 0 && (
            <Text style={[styles.heroTileSub, { color: settledColor }]}>
              {balanceSummary.collected.toFixed(2)} collected
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Feather name="search" size={16} color={C.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={activeTab === 'debts' ? 'Search debts...' : 'Search splits...'}
          placeholderTextColor={C.textMuted}
          returnKeyType="search"
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={withAlpha(C.accent, 0.25)}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x-circle" size={16} color={C.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setSortModalVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ paddingLeft: SPACING.xs }}
        >
          <View>
            <Feather name="sliders" size={16} color={(activeTab === 'debts' ? (debtSort !== 'newest' || debtTypeFilter || debtFilter) : splitSort !== 'newest') ? C.accent : C.textMuted} />
            {activeTab === 'debts' && (debtTypeFilter || debtFilter) && (
              <View style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent }} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'debts' && styles.tabActive]}
          onPress={() => {
            if (selectionMode) exitSelectionMode();
            if (activeTab !== 'debts') setActiveTab('debts');
          }}
          activeOpacity={0.7}
        >
          <Feather name="users" size={16} color={activeTab === 'debts' ? C.accent : C.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'debts' && styles.tabTextActive]}>
            Debts
          </Text>
          <View style={{
            backgroundColor: activeTab === 'debts' ? C.accent : withAlpha(C.textSecondary, 0.15),
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: RADIUS.full,
            minWidth: 22,
            alignItems: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: activeTab === 'debts' ? C.onAccent : C.textSecondary }}>
              {modeDebtsCount}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'splits' && styles.tabActive]}
          onPress={() => {
            if (selectionMode) exitSelectionMode();
            if (activeTab !== 'splits') setActiveTab('splits');
          }}
          activeOpacity={0.7}
        >
          <Feather name="scissors" size={16} color={activeTab === 'splits' ? C.accent : C.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'splits' && styles.tabTextActive]}>
            Splits
          </Text>
          <View style={{
            backgroundColor: activeTab === 'splits' ? C.accent : withAlpha(C.textSecondary, 0.15),
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: RADIUS.full,
            minWidth: 22,
            alignItems: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: activeTab === 'splits' ? C.onAccent : C.textSecondary }}>
              {modeSplitsCount}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'shared' && styles.tabActive]}
          onPress={() => {
            if (selectionMode) exitSelectionMode();
            if (activeTab !== 'shared') setActiveTab('shared');
          }}
          activeOpacity={0.7}
        >
          <Feather name="repeat" size={16} color={activeTab === 'shared' ? C.accent : C.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'shared' && styles.tabTextActive]}>
            {t.sharedSubs.shared}
          </Text>
          <View style={{
            backgroundColor: activeTab === 'shared' ? C.accent : withAlpha(C.textSecondary, 0.15),
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: RADIUS.full,
            minWidth: 22,
            alignItems: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: activeTab === 'shared' ? C.onAccent : C.textSecondary }}>
              {activeSharedSubsCount}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  // Hero — Two Mini Stat Cards
  heroRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  heroTile: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  heroTileLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  heroTileAmount: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? -0.1 : -0.3,
  },
  heroTileSub: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    padding: 0,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: C.accent,
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  tabTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
});

export default DebtScreenHeader;
