import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Button from './Button';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';

interface ErrorStateProps {
  title?: string;
  message: string;
  icon?: keyof typeof Feather.glyphMap;
  onRetry?: () => void;
  onContact?: () => void;
  retryLabel?: string;
  contactLabel?: string;
  style?: ViewStyle;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  icon = 'alert-circle',
  onRetry,
  onContact,
  retryLabel = 'Try Again',
  contactLabel = 'Contact Support',
  style,
}) => {
  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
    >
      <View style={styles.iconContainer}>
        <Feather name={icon} size={48} color={CALM.neutral} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        {onRetry && (
          <Button
            title={retryLabel}
            onPress={onRetry}
            icon="refresh-cw"
            size="medium"
            variant="primary"
            style={styles.retryButton}
          />
        )}
        {onContact && (
          <Button
            title={contactLabel}
            onPress={onContact}
            icon="help-circle"
            size="medium"
            variant="outline"
            style={styles.contactButton}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
    maxWidth: 320,
  },
  actions: { width: '100%', gap: SPACING.md, maxWidth: 320 },
  retryButton: { width: '100%' },
  contactButton: { width: '100%' },
});

export default ErrorState;
