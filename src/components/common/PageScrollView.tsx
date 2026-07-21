/**
 * PageScrollView — the app's page scroller for any screen containing TextInputs.
 *
 * Combines the two things a form screen needs, and neither alone provides:
 *
 *  1. `KeyboardAwareScrollView` (react-native-keyboard-controller) follows the
 *     caret, so a tapped field never hides behind the keyboard. Crucially this
 *     works on **iOS AND Android** — the `automaticallyAdjustKeyboardInsets`
 *     prop it replaces is iOS-ONLY and silently does nothing on Android, which
 *     is exactly how the Collectz screens ended up unusable there.
 *
 *  2. gesture-handler's `ScrollView` underneath (via `ScrollViewComponent`), so
 *     RNGH arbitrates the pan with the app's GestureHandlerRootView and drags
 *     aren't lost ("mostly can't scroll, sometimes can" with a plain RN one).
 *
 * Wrapped for Reanimated so keyboard-controller's `scrollTo` worklet can drive
 * it. Same recipe as NoteEditor — see rn-keyboard-controller "usage with
 * gesture-handler".
 *
 * Defaults can be overridden per-screen; pass any KeyboardAwareScrollView prop.
 */
import React from 'react';
import { ScrollView } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

const AnimatedGestureScrollView = Reanimated.createAnimatedComponent(ScrollView);

type Props = React.ComponentProps<typeof KeyboardAwareScrollView>;

const PageScrollView = React.forwardRef<any, Props>((props, ref) => (
  <KeyboardAwareScrollView
    ref={ref}
    ScrollViewComponent={AnimatedGestureScrollView}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode="on-drag"
    showsVerticalScrollIndicator={false}
    // Clears the keyboard so the focused field isn't flush against it.
    bottomOffset={80}
    {...props}
  />
));

PageScrollView.displayName = 'PageScrollView';

export default PageScrollView;
