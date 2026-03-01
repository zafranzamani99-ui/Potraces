import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CALM, TYPE, SPACING, TYPOGRAPHY } from '../../constants';

interface BusinessSectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
  accentColor?: string;
}

const BusinessSectionHeader: React.FC<BusinessSectionHeaderProps> = ({
  title,
  action,
  accentColor = CALM.bronze,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {action && (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.7}
          accessibilityLabel={action.label}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.action, { color: accentColor }]}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  title: {
    ...TYPE.muted,
    textTransform: 'lowercase',
  },
  action: {
    fontSize: TYPOGRAPHY.size.xs,
  },
});

export default BusinessSectionHeader;
