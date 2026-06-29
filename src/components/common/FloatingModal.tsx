import React, { useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
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
import { SPACING, RADIUS, SHADOWS, withAlpha } from '../../constants';
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
  children: React.ReactNode;
}

const FloatingModal: React.FC<FloatingModalProps> = ({
  visible,
  onClose,
  maxWidth = 520,
  showDragHandle = true,
  swipeToDismiss = true,
  children,
}) => {
  const C = useCalm();
  const { height: SCREEN_H } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C), [C]);

  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const thresholdCrossed = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, SPRING_OPEN);
    }
  }, [visible, SCREEN_H]);

  const dismiss = useCallback(() => {
    sheetY.value = withTiming(SCREEN_H, { duration: CLOSE_DURATION }, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [SCREEN_H, onClose]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .enabled(swipeToDismiss)
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

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

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
        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.centerWrap}
            pointerEvents="box-none"
          >
            {card}
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.centerWrap} pointerEvents="box-none">
            {card}
          </View>
        )}
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
      backgroundColor: withAlpha(C.textPrimary, 0.4),
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
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      ...SHADOWS.lg,
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
