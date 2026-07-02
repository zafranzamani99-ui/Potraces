import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  TouchableOpacity,
  Modal,
  Keyboard,
  Dimensions,
  AccessibilityInfo,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import ModalToastHost from '../common/ModalToastHost';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import EditHeroAmountCard from './EditHeroAmountCard';
import EditFormFields from './EditFormFields';
import EditActionsBlock from './EditActionsBlock';
import type { Transaction, CategoryOption, Wallet } from '../../types';

// Animated wrapper for KeyboardAwareScrollView so its scroll position can drive Reanimated worklets.
const AnimatedKAS = Reanimated.createAnimatedComponent(KeyboardAwareScrollView);

interface EditTransactionSheetProps {
  visible: boolean;
  transaction: Transaction | null;
  wallets: Wallet[];
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  currency: string;
  onRequestClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  // Form state lifted as props so parent (TransactionsList) keeps owning the source of truth:
  editAmount: string;
  setEditAmount: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editType: 'expense' | 'income';
  onEditTypeChange: (t: 'expense' | 'income') => void;
  editTags: string;
  setEditTags: (v: string) => void;
  editWalletId: string | null;
  setEditWalletId: (v: string | null) => void;
  // Date field — forwarded to EditFormFields (Agent B owns the picker UI). Parent must supply
  // these from the transaction's `date` field. Required to match EditFormFields' interface.
  editDate: Date;
  setEditDate: (d: Date) => void;
  // Parent should compute by comparing initial-vs-current edit state. When true, we intercept
  // close paths (backdrop tap, hardware back, drag-down dismiss) with an Alert.
  hasUnsavedChanges?: boolean;
}

/**
 * Bottom-sheet edit modal for a personal transaction.
 *
 * Owns: Modal + backdrop + Reanimated sheet container, gesture composition
 * (Pan + Native simultaneous), drag handle physics, title zone, KAS scroll
 * wrapper, save zone. Status bar style sync, reduced-motion detection,
 * keyboard height tracking, animateClose.
 *
 * Form state is lifted to the parent so the parent retains business-logic
 * ownership (debt sync, wallet adjustments) on save/delete.
 */
const EditTransactionSheet: React.FC<EditTransactionSheetProps> = ({
  visible,
  transaction,
  wallets,
  expenseCategories,
  incomeCategories,
  currency,
  onRequestClose,
  onSave,
  onDelete,
  editAmount,
  setEditAmount,
  editDescription,
  setEditDescription,
  editCategory,
  setEditCategory,
  editType,
  onEditTypeChange,
  editTags,
  setEditTags,
  editWalletId,
  setEditWalletId,
  editDate,
  setEditDate,
  hasUnsavedChanges = false,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  // ── Bottom-sheet physics ──────────────────────
  // Real sheet behavior: spring entrance, drag-to-dismiss, velocity-aware close,
  // backdrop opacity tied to sheet position. No native Modal slide.
  const SCREEN_H = Dimensions.get('window').height;
  const SHEET_DISMISS_DY = 120;
  const SHEET_DISMISS_VELOCITY = 700;
  const sheetTranslateY = useSharedValue(SCREEN_H);
  const sheetDragStart = useSharedValue(0);
  const sheetThresholdCrossed = useSharedValue(false);
  const sheetScrollOffset = useSharedValue(0); // bridges ScrollView scroll position into worklet
  const editDescriptionInputRef = useRef<TextInput>(null); // for auto-focus on entrance — description is the most-edited field
  const [reducedMotion, setReducedMotion] = useState(false); // a11y respect
  // Mirror of `reducedMotion` readable inside Reanimated worklets (worklets cannot read React state).
  const reducedMotionShared = useSharedValue(false);
  // Mirror of `hasUnsavedChanges` readable inside worklets (drag-down close path).
  const hasUnsavedChangesShared = useSharedValue(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0); // keyboard-aware sheet padding
  const [multilineFocused, setMultilineFocused] = useState(false);
  // Local saving state — `onSave` (handleUpdateTransaction) is synchronous (Zustand mutations),
  // so without a min visible duration the spinner would flash for ~0ms. We hold isSaving true
  // for ~180ms so the user perceives the press registered. Also blocks rapid-tap double-saves.
  const [isSaving, setIsSaving] = useState(false);

  // Track reduced-motion preference + bridge to shared value for worklet access (#11)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      setReducedMotion(v);
      reducedMotionShared.value = v;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReducedMotion(v);
      reducedMotionShared.value = v;
    });
    return () => sub?.remove();
  }, [reducedMotionShared]);

  // Keep the shared mirror in sync with the React prop so worklets can read it.
  useEffect(() => {
    hasUnsavedChangesShared.value = hasUnsavedChanges;
  }, [hasUnsavedChanges, hasUnsavedChangesShared]);

  // Track keyboard for save-button visibility
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const closeEditSheet = useCallback(() => {
    Keyboard.dismiss();
    lightTap(); // soft haptic on close completion
    onRequestClose();
  }, [onRequestClose]);

  // Reanimated scroll handler — bridges KeyboardAwareScrollView scroll position into a shared value
  // so the pan worklet can read it. Used for scroll-to-close.
  const sheetScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      sheetScrollOffset.value = e.contentOffset.y;
    },
  });

  // Animates sheet down, then fires the JS-side close callback. Keyboard is dismissed FIRST
  // so the keyboard collapses BEFORE the sheet animates away (#19) — avoids a jarring
  // "sheet slides down while keyboard still up" frame on iOS.
  const animateCloseSheet = useCallback(() => {
    Keyboard.dismiss();
    sheetTranslateY.value = withTiming(SCREEN_H, { duration: 240 }, (finished) => {
      'worklet';
      if (finished) runOnJS(closeEditSheet)();
    });
  }, [SCREEN_H, sheetTranslateY, closeEditSheet]);

  // Snaps the sheet back to the open position. Used when the user has unsaved changes and chose
  // "keep editing" from the alert, OR when a drag-down attempt is intercepted.
  const snapBackSheet = useCallback(() => {
    if (reducedMotion) {
      sheetTranslateY.value = withTiming(0, { duration: 200 });
    } else {
      sheetTranslateY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [reducedMotion, sheetTranslateY]);

  // Unsaved-changes guard (#9). If the user has edits in flight, intercept all close paths
  // (backdrop tap, hardware back, drag-down dismiss) with a calm Alert. "Discard" proceeds with
  // close; "keep editing" snaps the sheet back into place.
  const requestCloseWithGuard = useCallback(() => {
    if (!hasUnsavedChanges) {
      animateCloseSheet();
      return;
    }
    Alert.alert(
      t.editSheet.unsavedTitle,
      t.editSheet.unsavedMessage,
      [
        { text: t.editSheet.unsavedKeepEditing, style: 'cancel', onPress: snapBackSheet },
        { text: t.editSheet.unsavedDiscard, style: 'destructive', onPress: animateCloseSheet },
      ],
      { cancelable: true, onDismiss: snapBackSheet }
    );
  }, [hasUnsavedChanges, animateCloseSheet, snapBackSheet, t]);

  // Status bar style sync — light text when sheet (with dim backdrop) is open.
  // Auto-focus DELIBERATELY removed — keyboard-mount during sheet entrance was the lag culprit.
  // User taps any field to focus it (description, amount, etc.) — gives them agency over which
  // field they want to edit instead of forcing a focus + keyboard race-condition.
  useEffect(() => {
    if (visible) {
      sheetTranslateY.value = SCREEN_H;
      if (reducedMotion) {
        sheetTranslateY.value = withTiming(0, { duration: 240 });
      } else {
        sheetTranslateY.value = withSpring(0, {
          damping: 22,
          stiffness: 220,
          mass: 0.5,
        });
      }
      StatusBar.setBarStyle('light-content', true);
    } else {
      StatusBar.setBarStyle('default', true);
    }
  }, [visible, SCREEN_H, sheetTranslateY, reducedMotion]);

  const sheetPanGesture = useMemo(
    () =>
      Gesture.Pan()
        // Pan ONLY activates on downward movement (10+px). Upward gestures pass through to ScrollView,
        // so users can still scroll up within content. Downward gestures anywhere on the sheet → drag to close.
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          sheetDragStart.value = sheetTranslateY.value;
          sheetThresholdCrossed.value = false;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = sheetDragStart.value + e.translationY;
          // Rubber-band overscroll resistance — when dragging UP past anchor, apply diminishing returns.
          if (newY < 0) {
            newY = newY / 3;
          }
          sheetTranslateY.value = newY;

          // Haptic when crossing the dismiss threshold mid-drag — signals "let go to close".
          // Skip when the user has reduced-motion enabled (#11).
          const isPast = e.translationY > SHEET_DISMISS_DY;
          if (isPast && !sheetThresholdCrossed.value) {
            sheetThresholdCrossed.value = true;
            if (!reducedMotionShared.value) runOnJS(lightTap)();
          } else if (!isPast && sheetThresholdCrossed.value) {
            sheetThresholdCrossed.value = false;
          }
        })
        .onEnd((e) => {
          'worklet';
          const shouldDismiss =
            e.translationY > SHEET_DISMISS_DY || e.velocityY > SHEET_DISMISS_VELOCITY;
          if (shouldDismiss) {
            // If the user has unsaved changes, route to the JS-side guard which will show an
            // Alert. Snap back to anchor in the meantime so the sheet is stable while the alert
            // is decided. The guard's "discard" path triggers animateCloseSheet again (#9).
            if (hasUnsavedChangesShared.value) {
              sheetTranslateY.value = withSpring(0, {
                damping: 22,
                stiffness: 220,
                mass: 0.5,
              });
              runOnJS(requestCloseWithGuard)();
              return;
            }
            sheetTranslateY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
              'worklet';
              if (finished) runOnJS(closeEditSheet)();
            });
          } else {
            // Snap back — spring or timing per reduced-motion
            sheetTranslateY.value = withSpring(0, {
              damping: 22,
              stiffness: 220,
              mass: 0.5,
            });
          }
        }),
    [
      sheetTranslateY,
      sheetDragStart,
      sheetThresholdCrossed,
      sheetScrollOffset,
      reducedMotionShared,
      hasUnsavedChangesShared,
      SHEET_DISMISS_DY,
      SHEET_DISMISS_VELOCITY,
      SCREEN_H,
      closeEditSheet,
      requestCloseWithGuard,
    ]
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetTranslateY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // Drag handle brightens + widens as user drags toward the dismiss threshold.
  // Visible feedback that says "let go now to close."
  const sheetHandleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      sheetTranslateY.value,
      [0, SHEET_DISMISS_DY],
      [0.55, 1],
      Extrapolation.CLAMP
    ),
    width: interpolate(
      sheetTranslateY.value,
      [0, SHEET_DISMISS_DY],
      [40, 56],
      Extrapolation.CLAMP
    ),
  }));

  // Simple gesture: pan-down on the drag handle / title area only.
  // Drag from the scroll body NO LONGER closes the sheet (per user directive — "remove it").
  // The visible X close button (top-right) is the deterministic close action.
  const sheetPanGestureSimple = sheetPanGesture;

  const editCategories = useMemo(
    () => (editType === 'expense' ? expenseCategories : incomeCategories),
    [editType, expenseCategories, incomeCategories]
  );

  const isLinkedDebt = !!transaction?.linkedDebtId;
  const isLinkedGoal = !!transaction?.linkedGoalId;
  const isTransferLinked = !!transaction?.id?.startsWith('transfer-');
  // Income transferred from business mode is owned by the seller side — lock its
  // amount here (like debt-linked payments); only description/tags are editable.
  const isAmountLocked = isLinkedDebt || isLinkedGoal || isTransferLinked;
  const canSave = !!editAmount && parseFloat(editAmount) > 0;

  // Wrapped save: flips isSaving on, calls synchronous onSave, holds spinner ~180ms so the
  // user perceives the press, then resets. Guards against rapid double-tap during the window.
  const handleSavePress = useCallback(() => {
    if (isSaving) return;
    setIsSaving(true);
    onSave();
    setTimeout(() => setIsSaving(false), 180);
  }, [isSaving, onSave]);

  // Disabled-tap feedback — explains why the user can't save yet. Parent will also show
  // its own toast on the actual onSave path; this is the pre-save guard for the empty case.
  const handleInvalidSave = useCallback(() => {
    Alert.alert(t.transaction.invalidAmount);
  }, [t]);

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={requestCloseWithGuard}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Real bottom-sheet — Reanimated translateY + drag-to-dismiss + velocity-aware close.
          Backdrop opacity is tied to sheet position so the dim deepens as the sheet rises. */}
      <View style={styles.editSheetWrapper} pointerEvents="box-none">
        {/* Animated backdrop — alpha derived from sheet translateY. Pure dim, no blur
            (BlurView mounts too slowly on first open; the sheet's own motion carries the feel). */}
        <Reanimated.View
          style={[StyleSheet.absoluteFillObject, backdropAnimatedStyle]}
          pointerEvents="auto"
        >
          <View style={styles.editSheetBackdropAnim} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestCloseWithGuard}
            accessibilityRole="button"
            accessibilityLabel={t.common.close.toLowerCase()}
          />
        </Reanimated.View>

        {/* Drag-enabled sheet — outer pan; ScrollView wraps its own native gesture inside */}
        <Reanimated.View
          style={[styles.editSheet, sheetAnimatedStyle]}
          onStartShouldSetResponder={() => true}
        >
          {/* Drag-to-dismiss is scoped to the handle + title zone ONLY. The scroll body
              and every field below (category dropdown, date, inputs) sit OUTSIDE the
              GestureDetector, so taps and scrolling are never stolen by the pan.
              Mirrors SharedSubDetailSheet's structure. */}
          <GestureDetector gesture={sheetPanGestureSimple}>
            <View collapsable={false}>
              {/* Drag handle — animated: opacity + width respond to drag distance. */}
              <View style={styles.editSheetHandleHit}>
                <Reanimated.View style={[styles.editSheetHandle, sheetHandleAnimatedStyle]} />
              </View>

              {/* Title + subtitle pair, centered. */}
              <View style={styles.editSheetTitleZone}>
                <Text
                  style={styles.editSheetTitle}
                  numberOfLines={2}
                >
                  {t.transaction.editTransaction.toLowerCase().split(' ')[0]}{' '}
                  <Text style={styles.editSheetTitleAccent}>
                    {transaction?.description?.toLowerCase() ||
                      t.transaction.editTransaction.toLowerCase().split(' ').slice(1).join(' ')}
                  </Text>
                </Text>
                <Text style={styles.editSheetSubtitle}>
                  {t.transactionList.editSheetSubtitle}
                </Text>
              </View>
            </View>
          </GestureDetector>

            <AnimatedKAS
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.editSheetScrollContent}
              onScroll={sheetScrollHandler}
              scrollEventThrottle={16}
              bottomOffset={32}
              extraKeyboardSpace={0}
            >
                {/* HERO field card — amount. Bigger than other cards.
                    This is the moment. (No per-child entering — sheet's own translateY carries the feel.) */}
                <EditHeroAmountCard
                  amount={editAmount}
                  setAmount={setEditAmount}
                  type={editType}
                  onTypeChange={onEditTypeChange}
                  currency={currency}
                  isLocked={isAmountLocked}
                  C={C}
                />

                {/* Quiet hairline divider — visually groups hero (amount) from the form fields below (#12) */}
                <View style={styles.editSheetDivider} />

                <EditFormFields
                  editDescription={editDescription}
                  setEditDescription={setEditDescription}
                  editCategory={editCategory}
                  setEditCategory={setEditCategory}
                  editCategories={editCategories}
                  editWalletId={editWalletId}
                  setEditWalletId={setEditWalletId}
                  wallets={wallets}
                  editTags={editTags}
                  setEditTags={setEditTags}
                  editType={editType}
                  isLinkedDebt={isLinkedDebt}
                  descriptionInputRef={editDescriptionInputRef}
                  onMultilineFocus={() => setMultilineFocused(true)}
                  onMultilineBlur={() => setMultilineFocused(false)}
                  // Forwarded for Agent B's date picker
                  editDate={editDate}
                  setEditDate={setEditDate}
                  C={C}
                />

                {/* Quiet hairline divider — separates form fields from destructive delete link (#12) */}
                <View style={styles.editSheetDivider} />

              {/* Delete text-link — quiet, centered, below the input zone (not a peer of save) */}
              {isLinkedDebt ? (
                <View style={styles.inlineDebtNotice}>
                  <Feather name="lock" size={12} color={C.textMuted} />
                  <Text style={styles.inlineDebtNoticeText}>
                    {t.transactionList.debtLinkedCannotDelete}
                  </Text>
                </View>
              ) : (
                <EditActionsBlock.DeleteLink onDelete={onDelete} C={C} t={t} />
              )}
            </AnimatedKAS>

            {/* SAVE — anchored at bottom of sheet. Keyboard-aware: padding lifts above keyboard. */}
            <View
              style={[
                styles.editSheetSaveZone,
                {
                  paddingBottom:
                    keyboardHeight > 0 ? SPACING.md : Math.max(SPACING.md, insets.bottom),
                },
              ]}
            >
              <EditActionsBlock.SaveButton
                onSave={handleSavePress}
                canSave={canSave}
                isSaving={isSaving}
                onInvalidSave={handleInvalidSave}
                C={C}
                t={t}
              />

              {/* Close button — quiet text-link with X icon, sits below save. Secondary
                  action; not destructive (delete-link is separate, in scroll content). */}
              <Pressable
                onPress={requestCloseWithGuard}
                accessibilityRole="button"
                accessibilityLabel={t.common.close.toLowerCase()}
                hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                style={styles.editSheetCloseLink}
              >
                {({ pressed }) => (
                  <View style={[styles.editSheetCloseLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.editSheetCloseLinkText}>
                      {t.common.close.toLowerCase()}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Reanimated.View>
      </View>
      {keyboardHeight > 0 && multilineFocused && (
        <TouchableOpacity
          style={[styles.doneFab, { bottom: keyboardHeight + 16 }]}
          onPress={() => Keyboard.dismiss()}
          activeOpacity={0.8}
        >
          <Feather name="check" size={20} color={C.onAccent} />
        </TouchableOpacity>
      )}

      <ModalToastHost />
      </GestureHandlerRootView>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    // ── Edit BOTTOM SHEET — Reanimated drag-to-dismiss with backdrop physics ──
    editSheetWrapper: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
    },
    editSheetBackdropAnim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha(C.dimBg, 0.50), // pure dim (BlurView removed for performance)
    },
    editSheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: RADIUS['2xl'] ?? 24,
      borderTopRightRadius: RADIUS['2xl'] ?? 24,
      paddingTop: SPACING.sm,
      maxHeight: '92%',
      // Top-edge shadow to lift the sheet off the backdrop
      shadowColor: C.textPrimary,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: C === CALM_DARK ? 0.04 : 0.10,
      shadowRadius: C === CALM_DARK ? 8 : 16,
      elevation: C === CALM_DARK ? 8 : 24,
    },
    // Hit area around handle — drag responds, tap dismisses keyboard
    editSheetHandleHit: {
      paddingVertical: SPACING.sm,
      alignItems: 'center',
    },
    editSheetHandle: {
      width: 40,
      height: 4,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, 0.16),
    },
    // Close text-link — quiet secondary action below the save button
    editSheetCloseLink: {
      alignSelf: 'center',
      marginTop: SPACING.sm + 2,
    },
    editSheetCloseLinkInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    editSheetCloseLinkText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.2,
    },
    editSheetTitleZone: {
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.lg,
    },
    editSheetTitle: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      letterSpacing: -0.4,
      textAlign: 'center',
    },
    editSheetTitleAccent: {
      fontStyle: 'italic',
      fontFamily: 'serif',
      fontWeight: TYPOGRAPHY.weight.regular,
      color: C.deepOlive,
    },
    editSheetSubtitle: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
      marginTop: SPACING.xs + 2,
      letterSpacing: 0.1,
      textAlign: 'center',
    },
    editSheetScrollContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.lg,
    },
    // Quiet hairline divider between card groups (#12) — barely visible, just enough to imply grouping
    editSheetDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: withAlpha(C.textPrimary, 0.06),
      marginVertical: SPACING.sm,
    },
    inlineDebtNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: SPACING.lg,
      paddingVertical: SPACING.sm,
    },
    inlineDebtNoticeText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.1,
    },
    // ── Bottom-sheet save zone (anchored at bottom of sheet) ──
    editSheetSaveZone: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: withAlpha(C.textPrimary, 0.06),
    },
    doneFab: {
      position: 'absolute',
      right: SPACING.md,
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: C.gold,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
    },
  });

export default EditTransactionSheet;
