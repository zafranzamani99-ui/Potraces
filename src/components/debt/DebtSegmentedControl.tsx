import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

export interface SegmentTab<K extends string = string> {
  key: K;
  label: string;
  count: number;
  color: string;
}

interface DebtSegmentedControlProps<K extends string> {
  tabs: ReadonlyArray<SegmentTab<K>>;
  active: K;
  onSelect: (key: K) => void;
  /** a11y noun: "debt" / "split" */
  itemNoun: string;
  /** trailing slot (e.g. draft bookmark) rendered inside the control after the tabs */
  children?: React.ReactNode;
}

function DebtSegmentedControl<K extends string>({
  tabs,
  active,
  onSelect,
  itemNoun,
  children,
}: DebtSegmentedControlProps<K>) {
  const C = useCalm();
  const styles = React.useMemo(() => makeStyles(C), [C]);

  return (
    <View style={styles.segmentedControl}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={[
              styles.segmentTab,
              isActive && { backgroundColor: withAlpha(tab.color, 0.12) },
            ]}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label}, ${tab.count} ${tab.count === 1 ? itemNoun : itemNoun + 's'}`}
          >
            <Text style={[
              styles.segmentTabText,
              isActive && { color: tab.color, fontWeight: TYPOGRAPHY.weight.semibold },
            ]}>
              {tab.label}
            </Text>
            <View style={[
              styles.segmentTabBadge,
              isActive && { backgroundColor: tab.color },
            ]}>
              <Text style={[
                styles.segmentTabBadgeText,
                isActive && { color: C.onAccent },
              ]}>
                {tab.count}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
      {children}
    </View>
  );
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
    borderRadius: RADIUS.full,
    padding: 4,
    marginBottom: SPACING.md,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    minHeight: 36,
  },
  segmentTabText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  segmentTabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

export default DebtSegmentedControl;
