import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HITSLOP_10 } from '../../utils/hitSlop';

// ─── TYPES ──────────────────────────────────────────────────
type FeatherIconName = keyof typeof Feather.glyphMap;

interface IconButtonProps {
  icon: FeatherIconName;
  onPress: () => void;
  /** REQUIRED — WCAG 4.1.2. Describes the control to screen readers. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  size?: number;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * 44×44 icon-only button meeting WCAG 2.5.5 tap-target minimums,
 * with a hitSlop safety net for dense layouts.
 * `accessibilityLabel` is required (non-optional) to enforce labelling.
 */
export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = 20,
  color,
  disabled = false,
  style,
  testID,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      hitSlop={HITSLOP_10}
      style={[styles.base, style]}
      testID={testID}
    >
      <Feather name={icon} size={size} color={color} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default IconButton;
