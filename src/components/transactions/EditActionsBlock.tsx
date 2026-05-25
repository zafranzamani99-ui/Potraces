import React, { useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { lightTap } from '../../services/haptics';
import type { Translations } from '../../i18n/en';

interface EditActionsBlockProps {
  onSave: () => void;
  onDelete: () => void;
  canSave: boolean;
  C: typeof CALM;
  t: Translations;
}

/**
 * Save button (anchored at bottom of edit sheet) + delete text-link.
 *
 * NOTE: this component renders TWO things, in two slots:
 *   - The delete text-link sits inside the scroll content (above the save zone).
 *   - The save button sits inside the bottom-anchored save zone.
 *
 * Polish shipped here:
 *   #2 SaveButton renders ActivityIndicator when isSaving=true (button disabled, spinning)
 *   #5 Disabled SaveButton is still tappable — tap fires lightTap + invokes onInvalidSave + shakes
 *   #7 SaveButton press-scales to 0.97 on press-in, springs back on press-out
 *   #10 DeleteLink: bigger hitslop, slightly bigger icon, press-scale tactility
 */

const DeleteLink: React.FC<{ onDelete: () => void; C: typeof CALM; t: Translations }> = ({
  onDelete,
  C,
  t,
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Reanimated.View style={animatedStyle}>
      <Pressable
        style={styles.editSheetDeleteLink}
        onPress={onDelete}
        onPressIn={() => {
          scale.value = withTiming(0.96, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 240 });
        }}
        accessibilityRole="button"
        accessibilityLabel={t.common.delete.toLowerCase()}
        hitSlop={{ top: 18, bottom: 18, left: 18, right: 18 }}
      >
        {({ pressed }) => (
          <View style={[styles.editSheetDeleteLinkInner, pressed && { opacity: 0.55 }]}>
            <Feather name="trash-2" size={13} color={C.textMuted} />
            <Text style={styles.editSheetDeleteLinkText}>
              {t.common.delete.toLowerCase()}{' '}
              {t.transaction.editTransaction.toLowerCase().split(' ').slice(-1)[0]}
            </Text>
          </View>
        )}
      </Pressable>
    </Reanimated.View>
  );
};

interface SaveButtonProps {
  onSave: () => void;
  canSave: boolean;
  C: typeof CALM;
  t: Translations;
  /** Loading state — button shows spinner, taps no-op while true. */
  isSaving?: boolean;
  /** Called when user taps the disabled save button (e.g. amount empty). Parent shows toast. */
  onInvalidSave?: () => void;
}

const SaveButton: React.FC<SaveButtonProps> = ({
  onSave,
  canSave,
  C,
  t,
  isSaving = false,
  onInvalidSave,
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);

  // Press scale (#7) — 1.0 → 0.97 on press-in, spring back on press-out.
  const scale = useSharedValue(1);
  // Shake (#5) — translateX sequence when disabled-tap fires.
  const shakeX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shakeX.value }],
  }));

  const handlePress = () => {
    if (isSaving) return; // already saving — ignore taps
    if (!canSave) {
      // Tap on disabled button — give tactile feedback + bubble up to parent for toast (#5)
      lightTap();
      onInvalidSave?.();
      // Subtle shake — translateX sequence
      shakeX.value = withSequence(
        withTiming(-3, { duration: 60, easing: Easing.linear }),
        withTiming(3, { duration: 60, easing: Easing.linear }),
        withTiming(-2, { duration: 60, easing: Easing.linear }),
        withTiming(2, { duration: 50, easing: Easing.linear }),
        withTiming(0, { duration: 50, easing: Easing.linear }),
      );
      return;
    }
    onSave();
  };

  return (
    <Reanimated.View style={animatedStyle}>
      <Pressable
        style={[
          styles.editSheetSaveBtn,
          (!canSave || isSaving) && styles.editSheetSaveBtnDisabled,
        ]}
        onPress={handlePress}
        onPressIn={() => {
          scale.value = withTiming(0.97, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 240 });
        }}
        accessibilityRole="button"
        accessibilityLabel={t.common.save.toLowerCase()}
        accessibilityState={{ disabled: !canSave || isSaving, busy: isSaving }}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color={C.surface} />
        ) : (
          <Text
            style={[
              styles.editSheetSaveBtnText,
              !canSave && styles.editSheetSaveBtnTextDisabled,
            ]}
          >
            {t.common.save.toLowerCase()}{' '}
            {t.transaction.editTransaction.toLowerCase().split(' ').slice(-1)[0]}
          </Text>
        )}
      </Pressable>
    </Reanimated.View>
  );
};

const EditActionsBlock: React.FC<EditActionsBlockProps> & {
  DeleteLink: typeof DeleteLink;
  SaveButton: typeof SaveButton;
} = () => {
  // Default render: nothing (parent uses static sub-components).
  return null;
};

EditActionsBlock.DeleteLink = DeleteLink;
EditActionsBlock.SaveButton = SaveButton;

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    editSheetSaveBtn: {
      width: '100%',
      paddingVertical: SPACING.md + 2,
      borderRadius: RADIUS.full,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52, // ensures consistent height whether text or spinner is rendered
    },
    editSheetSaveBtnDisabled: {
      backgroundColor: withAlpha(C.textPrimary, 0.08),
    },
    editSheetSaveBtnText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.surface,
      letterSpacing: 0.3,
    },
    editSheetSaveBtnTextDisabled: {
      color: C.textMuted,
    },
    editSheetDeleteLink: {
      // Outer Pressable hit area
      marginTop: SPACING.lg,
      alignSelf: 'center',
    },
    editSheetDeleteLinkInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    editSheetDeleteLinkText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.2,
    },
  });

export default EditActionsBlock;
