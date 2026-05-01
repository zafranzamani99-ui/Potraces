import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BIZ_SAFE, semantic, SPACING, TYPOGRAPHY } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';

interface InputErrorProps {
  /** Error text to display. If empty/undefined the component renders nothing. */
  message?: string | null;
  testID?: string;
}

/**
 * Form-error helper pairing an alert-circle icon with error text so the
 * validation state is conveyed by MORE than color alone (WCAG 1.4.1 / 3.3.1).
 *
 * Uses the existing flat `BIZ.inputError` hex; will migrate to the upcoming
 * `{ light, dark }` token once Agent 1's palette refactor lands.
 */
export const InputError: React.FC<InputErrorProps> = ({ message, testID }) => {
  useCalm();
  const isDark = useIsDark();
  if (!message) return null;
  const color = semantic(BIZ_SAFE.inputError, isDark);
  return (
    <View
      style={styles.row}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Feather name="alert-circle" size={12} color={color} />
      <Text style={[styles.text, { color }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.xs,
  },
  text: {
    fontSize: TYPOGRAPHY.size.xs,
    lineHeight: TYPOGRAPHY.size.xs * 1.4,
    flexShrink: 1,
  },
});

export default InputError;
