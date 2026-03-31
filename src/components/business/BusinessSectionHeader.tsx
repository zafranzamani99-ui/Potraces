import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CALM, TYPE, SPACING, TYPOGRAPHY } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

interface BusinessSectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
  accentColor?: string;
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  title: {
    ...TYPE.muted,
    color: C.textMuted,
    textTransform: 'lowercase',
  },
  action: {
    fontSize: TYPOGRAPHY.size.xs,
  },
});

const BusinessSectionHeader: React.FC<BusinessSectionHeaderProps> = ({
  title,
  action,
  accentColor: accentColorProp,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const accentColor = accentColorProp ?? C.bronze;
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

export default React.memo(BusinessSectionHeader);
