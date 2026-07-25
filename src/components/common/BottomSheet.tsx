import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView as KAView } from 'react-native-keyboard-controller';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Non-scrolling header content (title, meta, etc.). Rendered INSIDE the drag
   * zone alongside the handle — so the user can drag-to-dismiss from the header,
   * not just the small handle (matches Goals' detail sheet).
   */
  header?: React.ReactNode;
  /** Max height as a fraction of screen height (0–1). Default 0.92 — matches Goals. */
  maxHeightPct?: number;
  /** Bottom close-link label. Default "close". */
  closeLabel?: string;
  /**
   * Full-screen overlay rendered INSIDE this sheet's Modal window, above the sheet
   * (e.g. a consent/confirm dialog). Use this instead of a sibling <Modal> — iOS
   * cannot reliably present a second Modal over an already-open one, so a sibling
   * modal presents behind the sheet (invisible). Rendered on the Modal's absoluteFill
   * root, so a centered dialog covers the whole screen.
   */
  overlay?: React.ReactNode;
  /**
   * Sheets containing TextInputs MUST set this — wraps the sheet in
   * react-native-keyboard-controller's KAView (behavior="padding") so the
   * keyboard lifts the sheet instead of covering it (RN's built-in KAV does
   * NOT work inside Android transparent modals — docs/BUILDING_CHECKLIST.md).
   */
  keyboardAvoiding?: boolean;
}

/**
 * Canonical app bottom-sheet — extracted from the Goals goal-detail sheet so every
 * sheet in the app looks and behaves identically.
 *
 * Mechanics (matches Goals.tsx detail sheet exactly):
 *  - Slides up from off-screen (SCREEN_H) via withTiming(0, 280) on open.
 *  - Drag-to-dismiss Pan lives ONLY on the handle + header so inner lists/scroll
 *    views keep their own gestures.
 *  - Animated backdrop fades with sheet position; tap to close.
 *  - Finish-close animates back down to SCREEN_H, then flips `visible` false via onClose.
 *  - Flat sheet on C.background (no border, no shadow) — matches Goals' gfSheet; safe-area bottom pad.
 *  - Pinned bottom "✕ close" link footer (detailCloseLink) — the canonical close button.
 *
 * Layout: [handle + header] → [children (own scroll)] → [pinned ✕ close footer].
 * Children render in a flexShrink:1 area and manage their own scroll (e.g. a FlatList).
 */
const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  children,
  header,
  maxHeightPct = 0.92,
  closeLabel = 'close',
  overlay,
  keyboardAvoiding = false,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { keyboardVisible } = useKeyboardVisible();
  const { height: SCREEN_H } = useWindowDimensions();

  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const closingRef = useRef(false);

  // Finish-close: flip visibility off once the slide-down settles.
  const finishClose = useCallback(() => {
    if (!closingRef.current) return;
    closingRef.current = false;
    onClose();
  }, [onClose]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [SCREEN_H, sheetY, finishClose]);

  // Open: reset position then slide up.
  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      sheetY.value = SCREEN_H;
      sheetY.value = withTiming(0, { duration: 280 });
    }
  }, [visible, SCREEN_H, sheetY]);

  const sheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dragStart.value = sheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          sheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(close)();
          } else {
            sheetY.value = withTiming(0, { duration: 280 });
          }
        }),
    [close, sheetY, dragStart],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  if (!visible) return null;

  const sheetBody = (
    <Reanimated.View
      style={[
        // keyboardAvoiding mode: the sheet is an IN-FLOW, bottom-justified child
        // of the KAView (padding can't move an absolutely-positioned view — the
        // reason the first attempt didn't lift). Default mode keeps the
        // bottom-anchored absolute container.
        keyboardAvoiding ? styles.sheetContainerFlow : styles.sheetContainer,
        styles.gfSheet,
        { maxHeight: `${Math.round(maxHeightPct * 100)}%`, paddingBottom: Math.max(insets.bottom, SPACING.xl) },
        sheetAnimStyle,
      ]}
    >
      {/* Drag zone: handle + header — drag-to-dismiss from anywhere up top,
          not just the handle. Only the scrolling children below are excluded
          so their own gestures stay intact (matches Goals' detail sheet). */}
      <GestureDetector gesture={sheetGesture}>
        <View collapsable={false}>
          <View style={styles.topRow}>
            <View style={styles.handle} />
          </View>
          {header}
        </View>
      </GestureDetector>

      {/* Children manage their own scroll (e.g. a FlatList). flexShrink lets the
          content area shrink within maxHeight while inner lists scroll. */}
      <View style={styles.content}>{children}</View>

      {/* Pinned bottom close link — the canonical Goals close button. Hidden
          while the keyboard is up: it would be crushed against the keys, and
          the KeyboardDoneFab already owns "finish typing" (drag/backdrop still
          close the sheet). */}
      {!keyboardVisible && (
        <View style={styles.closeZone}>
          <Pressable
            style={styles.closeLink}
            onPress={close}
            hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          >
            {({ pressed }: { pressed: boolean }) => (
              <View style={[styles.closeLinkInner, pressed && { opacity: 0.55 }]}>
                <Feather name="x" size={12} color={C.textMuted} />
                <Text style={styles.closeLinkText}>{closeLabel}</Text>
              </View>
            )}
          </Pressable>
        </View>
      )}
    </Reanimated.View>
  );

  return (
    <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={StyleSheet.absoluteFill}>
        <Reanimated.View style={[styles.backdrop, backdropAnimStyle]}>
          <Pressable
            style={{ flex: 1 }}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="close"
          />
        </Reanimated.View>
        {keyboardAvoiding ? (
          // react-native-keyboard-controller's KAView — RN's built-in KAV does
          // NOT work inside Android transparent modals (docs/BUILDING_CHECKLIST).
          // box-none so backdrop taps above the sheet still dismiss.
          <KAView behavior="padding" style={{ flex: 1 }} pointerEvents="box-none">
            <View style={styles.sheetLiftWrap} pointerEvents="box-none">
              {sheetBody}
            </View>
          </KAView>
        ) : (
          sheetBody
        )}
        {/* Overlay (e.g. confirm dialog) — rendered LAST so it sits above the sheet,
            and inside THIS Modal window (a sibling <Modal> would present behind on iOS). */}
        {overlay}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheetContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      // All modals/sheets use the edit-commitment tone (C.background), not C.surface.
      backgroundColor: C.background,
      borderTopLeftRadius: RADIUS['2xl'],
      borderTopRightRadius: RADIUS['2xl'],
    },
    // Flat sheet — no border, no shadow — matching Goals' real gfSheet.
    // bg + top radii live in sheetContainer above.
    gfSheet: {},
    // keyboardAvoiding mode: in-flow variant of sheetContainer (same look, no
    // absolute anchor) + the wrap that bottom-justifies it inside the KAView.
    sheetContainerFlow: {
      backgroundColor: C.background,
      borderTopLeftRadius: RADIUS['2xl'],
      borderTopRightRadius: RADIUS['2xl'],
    },
    sheetLiftWrap: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
      position: 'relative',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: withAlpha(C.textPrimary, 0.15),
    },
    content: {
      flexShrink: 1,
    },
    closeZone: {
      marginTop: SPACING.lg,
      alignItems: 'center',
    },
    closeLink: {
      alignSelf: 'center',
    },
    closeLinkInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    closeLinkText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.2,
    },
  });

export default BottomSheet;
