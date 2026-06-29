import React from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM_DARK, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
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

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <View
          style={{
            position: 'absolute',
            top: 120,
            right: 16,
            width: 240,
            backgroundColor: C.surface,
            borderRadius: RADIUS.lg,
            ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
            paddingVertical: 8,
            overflow: 'hidden',
          }}
        >
          <Pressable onPress={() => {}}>
            {/* Filter by Type — debts tab only */}
            {activeTab === 'debts' && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.debts.filterByType}</Text>
                {([
                  { key: 'they_owe' as const, label: t.debts.theyOweFilter },
                  { key: 'i_owe' as const, label: t.debts.iOweFilter },
                ]).map((f) => {
                  const isActive = debtTypeFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(C.accent, 0.06) : 'transparent' }}
                      onPress={() => setDebtTypeFilter(isActive ? null : f.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 14, color: isActive ? C.accent : C.textPrimary, fontWeight: isActive ? '600' : '400' }}>{f.label}</Text>
                      {isActive && <Feather name="check" size={16} color={C.accent} />}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16, marginVertical: 4 }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.debts.filterByStatus}</Text>
                {([
                  { key: 'pending' as const, label: t.debts.pending },
                  { key: 'partial' as const, label: t.debts.partial },
                  { key: 'settled' as const, label: t.debts.settled },
                ]).map((f) => {
                  const isActive = debtFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(C.accent, 0.06) : 'transparent' }}
                      onPress={() => setDebtFilter(isActive ? null : f.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 14, color: isActive ? C.accent : C.textPrimary, fontWeight: isActive ? '600' : '400' }}>{f.label}</Text>
                      {isActive && <Feather name="check" size={16} color={C.accent} />}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16, marginVertical: 4 }} />
              </>
            )}
            {/* Sort By */}
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.debts.sortBy}</Text>
            {([
              { key: 'newest' as const, label: t.debts.newestFirst, icon: 'arrow-down' as const },
              { key: 'oldest' as const, label: t.debts.oldestFirst, icon: 'arrow-up' as const },
              { key: 'amount_high' as const, label: t.debts.highestAmount, icon: 'trending-up' as const },
              { key: 'amount_low' as const, label: t.debts.lowestAmount, icon: 'trending-down' as const },
            ]).map((option) => {
              const currentSort = activeTab === 'splits' ? splitSort : debtSort;
              const isActive = currentSort === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(C.accent, 0.06) : 'transparent' }}
                  onPress={() => {
                    if (activeTab === 'splits') setSplitSort(option.key);
                    else setDebtSort(option.key);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name={option.icon} size={16} color={isActive ? C.accent : C.textSecondary} />
                  <Text style={{ flex: 1, fontSize: 14, color: isActive ? C.accent : C.textPrimary, fontWeight: isActive ? '600' : '400' }}>{option.label}</Text>
                  {isActive && <Feather name="check" size={16} color={C.accent} />}
                </TouchableOpacity>
              );
            })}
            {/* Clear filters button — show when any filter active */}
            {(debtTypeFilter || debtFilter) && activeTab === 'debts' && (
              <>
                <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16, marginVertical: 4 }} />
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
                  onPress={() => { setDebtTypeFilter(null); setDebtFilter(null); onClose(); }}
                  activeOpacity={0.7}
                >
                  <Feather name="x-circle" size={16} color={C.gold} />
                  <Text style={{ fontSize: 14, color: C.gold, fontWeight: '600' }}>{t.debts.clearFilters}</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

export default React.memo(DebtSortFilterMenu);
