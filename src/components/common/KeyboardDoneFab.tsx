import React from 'react';
import { TouchableOpacity, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SPACING, SHADOWS, CALM_DARK } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

/**
 * Floating gold "done" FAB — the app-standard keyboard-dismiss control for
 * MULTI-LINE note/description inputs inside modals & sheets. Numeric keypads have
 * their own native Done key, so only show this while a multiline field is focused.
 *
 * Usage (mirrors CommitmentForm / DebtTracking, now shared so there's one source
 * of truth): track a `multilineFocused` flag via the input's onFocus/onBlur, get
 * `keyboardVisible` + `keyboardHeight` from the shared `useKeyboardVisible()` hook,
 * then render:
 *   <KeyboardDoneFab visible={keyboardVisible && multilineFocused} keyboardHeight={keyboardHeight} />
 * It floats just above the keyboard and dismisses it on tap.
 */
const KeyboardDoneFab: React.FC<{ visible: boolean; keyboardHeight: number }> = ({ visible, keyboardHeight }) => {
  const C = useCalm();
  if (!visible) return null;
  return (
    <TouchableOpacity
      style={{
        position: 'absolute',
        right: SPACING.md,
        bottom: keyboardHeight + 16,
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: C.gold,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.md),
      }}
      onPress={() => Keyboard.dismiss()}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="done"
    >
      <Feather name="check" size={20} color={C.onAccent} />
    </TouchableOpacity>
  );
};

export default KeyboardDoneFab;
