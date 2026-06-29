import { useState, useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Tracks keyboard visibility + height — drives the floating gold "done" FAB inside modals.
 * FAB shows only when a multiline text input is focused — numeric keypads have their
 * own native "Done" key, so showing the FAB there would be redundant.
 *
 * `onHide` runs inside the hide listener (e.g. to reset a caller-owned "multiline focused" flag).
 */
export function useKeyboardVisible(onHide?: () => void) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      onHide?.();
    });
    return () => { showSub.remove(); hideSub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { keyboardVisible, keyboardHeight };
}
