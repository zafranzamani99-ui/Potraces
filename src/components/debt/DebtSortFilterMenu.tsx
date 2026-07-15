import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, RADIUS, SPACING, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useNeu } from '../common/neu';
import { lightTap } from '../../services/haptics';
import { DebtFilter, DebtTypeFilter, DebtSort } from '../../screens/shared/debt/useDebtFilters';

type TabType = 'debts' | 'splits' | 'shared';

interface DebtSortFilterMenuProps {
  visible: boolean;
  onClose: () => void;
  activeTab: TabType;
  debtTypeFilter: DebtTypeFilter;
  setDebtTypeFilter: (v: DebtTypeFilter) => void;
  debtFilter: DebtFilter;
  setDebtFilter: (v: DebtFilter) => void;
  debtSort: DebtSort;
  setDebtSort: (v: DebtSort) => void;
  splitSort: DebtSort;
  setSplitSort: (v: DebtSort) => void;
}

// Centered float modal matching the Goals / Bills filter modals: scrim +
// neu.raisedSoft card, uppercase section titles, icon+label+check rows with
// an accent-tinted active state, and a hairline-topped "clear filters" link.
const DebtSortFilterMenu: React.FC<DebtSortFilterMenuProps> = ({
  visible,
  onClose,
  activeTab,
  debtTypeFilter,
  setDebtTypeFilter,
  debtFilter,
  setDebtFilter,
  debtSort,
  setDebtSort,
  splitSort,
  setSplitSort,
}) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  const renderRow = (
    key: string,
    icon: React.ComponentProps<typeof Feather>['name'],
    label: string,
    isActive: boolean,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      style={[styles.row, isActive && styles.rowActive]}
      onPress={() => { lightTap(); onPress(); }}
      activeOpacity={0.7}
    >
      <Feather name={icon} size={18} color={isActive ? C.accent : C.textMuted} />
      <Text style={[styles.rowText, isActive && styles.rowTextActive]}>{label}</Text>
      {isActive && <Feather name="check" size={16} color={C.accent} />}
    </TouchableOpacity>
  );

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.overlayCenter} onPress={onClose}>
        <View style={[styles.card, neu.raisedSoft]} onStartShouldSetResponder={() => true}>
          {/* Filter by Type — debts tab only */}
          {activeTab === 'debts' && (
            <>
              <Text style={styles.sectionTitle}>{t.debts.filterByType}</Text>
              {renderRow('they_owe', 'arrow-down-circle', t.debts.theyOweFilter, debtTypeFilter === 'they_owe', () =>
                setDebtTypeFilter(debtTypeFilter === 'they_owe' ? null : 'they_owe'))}
              {renderRow('i_owe', 'arrow-up-circle', t.debts.iOweFilter, debtTypeFilter === 'i_owe', () =>
                setDebtTypeFilter(debtTypeFilter === 'i_owe' ? null : 'i_owe'))}

              <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>{t.debts.filterByStatus}</Text>
              {renderRow('pending', 'clock', t.debts.pending, debtFilter === 'pending', () =>
                setDebtFilter(debtFilter === 'pending' ? null : 'pending'))}
              {renderRow('partial', 'pie-chart', t.debts.partial, debtFilter === 'partial', () =>
                setDebtFilter(debtFilter === 'partial' ? null : 'partial'))}
              {renderRow('settled', 'check-circle', t.debts.settled, debtFilter === 'settled', () =>
                setDebtFilter(debtFilter === 'settled' ? null : 'settled'))}
            </>
          )}

          {/* Sort By */}
          <Text style={[styles.sectionTitle, activeTab === 'debts' && styles.sectionTitleSpaced]}>{t.debts.sortBy}</Text>
          {([
            { key: 'newest' as const, label: t.debts.newestFirst, icon: 'arrow-down' as const },
            { key: 'oldest' as const, label: t.debts.oldestFirst, icon: 'arrow-up' as const },
            { key: 'amount_high' as const, label: t.debts.highestAmount, icon: 'trending-up' as const },
            { key: 'amount_low' as const, label: t.debts.lowestAmount, icon: 'trending-down' as const },
          ]).map((option) => {
            const currentSort = activeTab === 'splits' ? splitSort : debtSort;
            return renderRow(option.key, option.icon, option.label, currentSort === option.key, () => {
              if (activeTab === 'splits') setSplitSort(option.key);
              else setDebtSort(option.key);
              onClose();
            });
          })}

          {/* Clear filters — show when any filter active */}
          {(debtTypeFilter || debtFilter) && activeTab === 'debts' && (
            <TouchableOpacity
              style={styles.clear}
              onPress={() => { lightTap(); setDebtTypeFilter(null); setDebtFilter(null); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.clearText}>{t.debts.clearFilters}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  overlayCenter: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '80%',
    maxWidth: 320,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm + 2,
  },
  sectionTitleSpaced: {
    marginTop: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: 2,
  },
  rowActive: {
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  rowText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  rowTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  clear: {
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.08),
  },
  clearText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
});

export default React.memo(DebtSortFilterMenu);
