import React, { useMemo } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

interface FilterTabRowProps {
  tabs: string[];
  activeTab: string;
  onTabPress: (tab: string) => void;
  accentColor?: string;
}

const FilterTabRow: React.FC<FilterTabRowProps> = ({
  tabs,
  activeTab,
  onTabPress,
  accentColor: accentColorProp,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const accentColor = accentColorProp ?? C.bronze;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.container}
    >
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <TouchableOpacity
            key={tab}
            style={styles.tab}
            onPress={() => onTabPress(tab)}
            activeOpacity={0.7}
            accessibilityLabel={`Filter by ${tab}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                styles.tabText,
                isActive && { color: accentColor, fontWeight: TYPOGRAPHY.weight.medium },
              ]}
            >
              {tab}
            </Text>
            {isActive && (
              <View style={[styles.underline, { backgroundColor: accentColor }]} />
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  scrollView: {
    maxHeight: 48,
  },
  container: {
    flexDirection: 'row',
    paddingHorizontal: SPACING['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: SPACING.lg,
    right: SPACING.lg,
    height: 2,
    borderRadius: 1,
  },
});

export default React.memo(FilterTabRow);
