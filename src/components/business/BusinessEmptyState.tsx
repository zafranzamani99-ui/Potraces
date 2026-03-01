import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CALM, SPACING, TYPOGRAPHY } from '../../constants';

interface BusinessEmptyStateProps {
  message: string;
  submessage?: string;
}

const BusinessEmptyState: React.FC<BusinessEmptyStateProps> = ({ message, submessage }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {submessage && <Text style={styles.submessage}>{submessage}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: SPACING['5xl'],
    paddingHorizontal: SPACING['3xl'],
  },
  message: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    textAlign: 'center',
  },
  submessage: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});

export default BusinessEmptyState;
