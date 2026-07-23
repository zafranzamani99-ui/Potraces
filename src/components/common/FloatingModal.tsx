import React, { useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView as KAView } from 'react-native-keyboard-controller';
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
   * 'fade' fades + scales in place like a centered dialog (matches the Repay
   * Credit picker) — swipe-to-dismiss is inert in this mode; tap-outside closes.
   */
  entrance?: 'slide' | 'fade';
  children: React.ReactNode;
}

const FloatingModal: React.FC<FloatingModalProps> = ({
  visible,
  onClose,
  maxWidth = 520,
  showDragHandle = true,
  swipeToDismiss = true,
  entrance = 'slide',
  children,
}) => {
  const C = useCalm();
  const { height: SCREEN_H } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C), [C]);
  const fadeMode = entrance === 'fade';

  const sheetY = useSharedValue(SCREEN_H);
  const fade = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const thresholdCrossed = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      if (fadeMode) {
        fade.value = 0;
        fade.value = withTiming(1, { duration: 200 });
      } else {
        sheetY.value = SCREEN_H;
        sheetY.value = withSpring(0, SPRING_OPEN);
      }
    }
  }, [visible, SCREEN_H, fadeMode]);

  const dismiss = useCallback(() => {
    if (fadeMode) {
      fade.value = withTiming(0, { duration: CLOSE_DURATION }, (finished) => {
        'worklet';
        if (finished) runOnJS(onClose)();
      });
      return;
    }
    sheetY.value = withTiming(SCREEN_H, { duration: CLOSE_DURATION }, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [SCREEN_H, onClose, fadeMode]);

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
            sheetY.value = withTiming(SCREEN_H, { duration: CLOSE_DURATION }, (finished) => {
              'worklet';
              if (finished) runOnJS(onClose)();
            });
          } else {
            sheetY.value = withSpring(0, SPRING_OPEN);
          }
        }),
    [swipeToDismiss, SCREEN_H, onClose],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() =>
    fadeMode
      ? {
          opacity: fade.value,
          transform: [{ scale: interpolate(fade.value, [0, 1], [0.96, 1], Extrapolation.CLAMP) }],
        }
      : { transform: [{ translateY: sheetY.value }] },
  );

  const backdropAnimatedStyle = useAnimatedStyle(() =>
    fadeMode
      ? { opacity: fade.value }
      : { opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP) },
  );

  if (!visible) return null;

  const card = (
    <View
      style={[styles.card, { maxWidth }]}
      onStartShouldSetResponder={() => true}
    >
      {showDragHandle && (
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
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Reanimated.View>

      <Reanimated.View
        style={[styles.sheetContainer, sheetAnimatedStyle]}
        pointerEvents="box-none"
      >
        {/* KAView from react-native-keyboard-controller on BOTH platforms — RN's
            built-in KeyboardAvoidingView does NOT work inside an Android transparent
            Modal (docs/BUILDING_CHECKLIST.md), and this build is edge-to-edge, so the
            activity's adjustResize never resizes that window either. The old
            iOS-only branch left Android cards centred under the keyboard. Same
            recipe as BottomSheet. */}
        <KAView behavior="padding" style={styles.centerWrap} pointerEvents="box-none">
          {card}
        </KAView>
      </Reanimated.View>
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
