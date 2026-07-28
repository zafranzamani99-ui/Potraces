import React, { useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { KeyboardAvoidingView as KAView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { lightTap } from '../../services/haptics';
import { useCalm } from '../../hooks/useCalm';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { SPACING, RADIUS, withAlpha } from '../../constants';
import ModalToastHost from './ModalToastHost';

const SPRING_OPEN = { damping: 22, stiffness: 220, mass: 0.5 };
const CLOSE_DURATION = 220;
const DISMISS_THRESHOLD = 100;
const DISMISS_VELOCITY = 800;

interface FloatingModalProps {
  visible: boolean;
  onClose: () => void;
  maxWidth?: number;
  showDragHandle?: boolean;
  swipeToDismiss?: boolean;
  /**
   * Entrance style. 'slide' (default) springs up from the bottom like a sheet.
   * 'fade' appears instantly in place (centered dialog) — no open or close
   * animation; swipe-to-dismiss is inert in this mode; tap-outside closes.
   */
  entrance?: 'slide' | 'fade';
  /** Removes the card's 1px outline (Collectz dialogs go borderless). */
  borderless?: boolean;
  children: React.ReactNode;
  /**
   * Optional node rendered ABOVE the card and backdrop, still INSIDE this one RN
   * <Modal> (iOS shows only one modal at a time, so a picker can't be its own
   * stacked Modal). Supply an absolutely-positioned overlay with its OWN backdrop
   * so tapping outside a sub-picker closes just the picker, not the whole sheet.
   */
  overlay?: React.ReactNode;
}

const FloatingModal: React.FC<FloatingModalProps> = ({
  visible,
  onClose,
  maxWidth = 520,
  showDragHandle = true,
  swipeToDismiss = true,
  entrance = 'slide',
  borderless = false,
  children,
  overlay,
}) => {
  const C = useCalm();
  const { height: SCREEN_H } = useWindowDimensions();
  // Keyboard-aware dismiss semantics: backdrop tap closes the KEYBOARD first
  // (modal stays), a second tap closes the modal; tapping empty card space
  // dismisses the keyboard without touching the modal's buttons.
  const { keyboardVisible } = useKeyboardVisible();
  const styles = useMemo(() => makeStyles(C), [C]);
  const fadeMode = entrance === 'fade';

  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const thresholdCrossed = useSharedValue(false);

  // Fade-mode keyboard docking. The card is bottom-anchored in BOTH keyboard
  // states; this ONE continuous animated paddingBottom moves it from near-center
  // (keyboard down) to just above the keyboard (keyboard up), gliding with the
  // keyboard's own animation. (The old approach flipped justifyContent
  // discretely mid-animation — the card teleported, which read as a bounce.)
  // kbHeight runs 0 → -keyboardHeight; progress runs 0 → 1.
  const { height: kbHeight, progress: kbProgress } = useReanimatedKeyboardAnimation();
  const cardH = useSharedValue(0);

  const fadeDockStyle = useAnimatedStyle(() => ({
    // Rounded to whole pixels — fractional layout values make the card's
    // border/shadow re-raster at sub-pixel offsets, which reads as shimmer.
    paddingBottom: Math.round(
      -kbHeight.value +
        interpolate(
          kbProgress.value,
          [0, 1],
          // Closed: the padding that CENTERS the card under flex-end, with the
          // same ~30px downward bias it always had. Open: just the visible gap.
          [Math.max((SCREEN_H - cardH.value) / 2 - 30, 0), SPACING.xl],
          Extrapolation.CLAMP,
        ),
    ),
  }));

  // Fade mode: NO open/close animation at all — the modal appears and unmounts
  // instantly. Only the slide sheet keeps its spring (pre-existing behavior).
  const playEntrance = useCallback(() => {
    if (fadeMode) return;
    if (sheetY.value === 0) return; // already open (e.g. rotation re-fire)
    sheetY.value = SCREEN_H;
    sheetY.value = withSpring(0, SPRING_OPEN);
  }, [fadeMode, SCREEN_H, sheetY]);

  useEffect(() => {
    if (visible) playEntrance();
  }, [visible, playEntrance]);

  // Fade mode: NO exit animation — dismiss fires onClose and the modal unmounts
  // immediately. Slide mode keeps its sheet slide-down (part of the gesture,
  // not an added flourish).
  const dismiss = useCallback(() => {
    if (fadeMode) { onClose(); return; }
    sheetY.value = withTiming(SCREEN_H, { duration: CLOSE_DURATION }, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [fadeMode, SCREEN_H, onClose, sheetY]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .enabled(swipeToDismiss && !fadeMode)
        .onStart(() => {
          'worklet';
          dragStart.value = sheetY.value;
          thresholdCrossed.value = false;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          sheetY.value = newY;

          const isPast = e.translationY > DISMISS_THRESHOLD;
          if (isPast && !thresholdCrossed.value) {
            thresholdCrossed.value = true;
            runOnJS(lightTap)();
          } else if (!isPast && thresholdCrossed.value) {
            thresholdCrossed.value = false;
          }
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
            runOnJS(dismiss)();
          } else {
            sheetY.value = withSpring(0, SPRING_OPEN);
          }
        }),
    [swipeToDismiss, SCREEN_H, dismiss],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() =>
    fadeMode
      ? { opacity: 1 } // fade mode: no entrance animation — appear as-is
      : { transform: [{ translateY: sheetY.value }] },
  );

  const backdropAnimatedStyle = useAnimatedStyle(() =>
    fadeMode
      ? { opacity: 1 }
      : { opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP) },
  );

  if (!visible) return null;

  const card = (
    <View
      style={[styles.card, { maxWidth }, borderless && { borderWidth: 0 }]}
      // Feeds fadeDockStyle's centering math (fade mode only). onLayout also
      // fires on POSITION changes — i.e. every animation frame — so only write
      // the shared value on real SIZE changes; otherwise every frame re-commits
      // the dependent animated style from the JS thread and the card judders.
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h !== cardH.value) cardH.value = h;
      }}
      onStartShouldSetResponder={() => true}
      onResponderRelease={Keyboard.dismiss}
    >
      {showDragHandle && !fadeMode && (
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleHit}>
            <View style={styles.handle} />
          </View>
        </GestureDetector>
      )}
      {children}
    </View>
  );

  return (
    <Modal
      visible
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Reanimated.View style={[styles.backdrop, backdropAnimatedStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={keyboardVisible ? () => Keyboard.dismiss() : dismiss}
        />
      </Reanimated.View>

      <Reanimated.View
        style={[styles.sheetContainer, sheetAnimatedStyle]}
        pointerEvents="box-none"
      >
        {/* KAView from react-native-keyboard-controller on BOTH platforms — RN's
            built-in KeyboardAvoidingView does NOT work inside an Android transparent
            Modal (docs/BUILDING_CHECKLIST.md), and this build is edge-to-edge, so the
            activity's adjustResize never resizes that window either. Slide sheets
            use its 'padding' behavior (same recipe as BottomSheet). Fade cards do
            NOT — they dock above the keyboard via fadeDockStyle, a continuous
            animated paddingBottom driven by the keyboard's own progress, so the
            card glides from near-center to docked with no layout flip. */}
        <KAView
          behavior={fadeMode ? undefined : 'padding'}
          style={[
            styles.centerWrap,
            fadeMode && styles.centerWrapFade,
            fadeMode && fadeDockStyle,
          ]}
          pointerEvents="box-none"
        >
          {card}
        </KAView>
      </Reanimated.View>
      {/* Sub-picker overlay: sits above the card + backdrop, inside this one Modal. */}
      {overlay}
      <ModalToastHost />
      </GestureHandlerRootView>
    </Modal>
  );
};

const makeStyles = (C: typeof import('../../constants').CALM) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheetContainer: {
      ...StyleSheet.absoluteFillObject,
    },
    centerWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
    },
    // Fade cards are bottom-anchored in BOTH keyboard states — "centered" is
    // just fadeDockStyle's animated paddingBottom when the keyboard is down.
    // One layout mode, no discrete flip, no bounce.
    centerWrapFade: {
      justifyContent: 'flex-end',
    },
    card: {
      width: '100%',
      maxHeight: '85%',
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.12),
      overflow: 'hidden',
    },
    handleHit: {
      alignItems: 'center',
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: withAlpha(C.textMuted, 0.3),
    },
  });

export default FloatingModal;
