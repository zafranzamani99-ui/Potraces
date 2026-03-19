import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CALM, SPACING, TYPOGRAPHY } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

interface BusinessEmptyStateProps {
  message: string;
  submessage?: string;
}

const BusinessEmptyState: React.FC<BusinessEmptyStateProps> = ({ message, submessage }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {submessage && <Text style={styles.submessage}>{submessage}</Text>}
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: SPACING['5xl'],
    paddingHorizontal: SPACING['3xl'],
  },
  message: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
  },
  submessage: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});

export default React.memo(BusinessEmptyState);
