import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Button from './Button';
import GradientButton from './GradientButton';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import GRADIENTS, { GradientConfig } from '../../constants/gradients';

// ─── TYPES ──────────────────────────────────────────────────
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

// ─── COMPONENT ──────────────────────────────────────────────
/**
 * ErrorState - Display error messages with retry and contact options
 *
 * Features:
 * - Gradient icon background
 * - Clear error messaging
 * - Optional retry button with gradient
 * - Optional contact support button
 * - Accessible and user-friendly
 *
 * @example
 * <ErrorState
 *   title="Connection Error"
 *   message="Unable to fetch data. Please check your internet connection."
 *   onRetry={() => refetch()}
 *   onContact={() => navigation.navigate('Support')}
 * />
 */
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
  const iconGradient: GradientConfig = {
    colors: [withAlpha(COLORS.danger, 0.2), withAlpha(COLORS.danger, 0.1)],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  };

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
    >
      {/* Icon with gradient background */}
      <LinearGradient
        colors={iconGradient.colors}
        start={iconGradient.start}
        end={iconGradient.end}
        style={styles.iconContainer}
      >
        <Feather name={icon} size={48} color={COLORS.danger} />
      </LinearGradient>

      {/* Title */}
      <Text style={styles.title}>{title}</Text>

      {/* Message */}
      <Text style={styles.message}>{message}</Text>

      {/* Action buttons */}
      <View style={styles.actions}>
        {onRetry && (
          <GradientButton
            title={retryLabel}
            onPress={onRetry}
            icon="refresh-cw"
            size="medium"
            gradient={GRADIENTS.primary}
            style={styles.retryButton}
          />
        )}
        {onContact && (
          <Button
            title={contactLabel}
            onPress={onContact}
            icon="help-circle"
            size="medium"
            variant="secondary"
            style={styles.contactButton}
          />
        )}
      </View>
    </View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'], // 24
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl, // 20
  },
  title: {
    fontSize: TYPOGRAPHY.size.xl, // 19
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm, // 8
    textAlign: 'center',
  },
  message: {
    fontSize: TYPOGRAPHY.size.base, // 15
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl, // 20
    lineHeight: 22,
    maxWidth: 320,
  },
  actions: {
    width: '100%',
    gap: SPACING.md, // 12
    maxWidth: 320,
  },
  retryButton: {
    width: '100%',
  },
  contactButton: {
    width: '100%',
  },
});

export default ErrorState;
