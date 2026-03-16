import React from 'react';
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';

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
  accentColor = CALM.bronze,
}) => {
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

const styles = StyleSheet.create({
  scrollView: {
    maxHeight: 48,
  },
  container: {
    flexDirection: 'row',
    paddingHorizontal: SPACING['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
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
    color: CALM.textMuted,
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
