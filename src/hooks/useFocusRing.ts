import { useState, useCallback } from 'react';
import type { ViewStyle } from 'react-native';

/**
 * Keyboard/pointer focus ring helper (WCAG 2.4.7 — Focus Visible).
 *
 * Usage:
 *   const { onFocus, onBlur, ringStyle } = useFocusRing(C.accent);
 *   <Pressable onFocus={onFocus} onBlur={onBlur} style={[base, ringStyle]}>
 */
export const useFocusRing = (
  color: string,
  width: number = 2,
): {
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  ringStyle: ViewStyle | null;
} => {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  const ringStyle: ViewStyle | null = focused
    ? { borderWidth: width, borderColor: color }
    : null;
  return { focused, onFocus, onBlur, ringStyle };
};
